import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import {
  getFirestoreDb,
  siguienteId,
  leerDoc,
  aplicarLote,
  sinUndefined,
  type OperacionLote,
} from '../client';
import { type VentaDoc } from './ventas.repo';
import { ClientesRepoFirestore } from './clientes.repo';
import { EventosRepoFirestore } from './eventos.repo';
import type { Pago, PagoCompleto, Cuota, MetodoPago, MonedaPago } from '../../../shared/types';
import { formatearMoneda } from '../../../core/moneda';

export interface RegistrarPagoInput {
  venta_id: number;
  fecha: string;
  monto_cents: number;
  moneda: MonedaPago;
  metodo: MetodoPago;
  referencia?: string;
  notas?: string;
  es_anticipo?: boolean;
  cuota_id?: number;
}

export interface AbonoClienteInput {
  cliente_id: number;
  fecha: string;
  monto_cents: number;
  moneda: MonedaPago;
  metodo: MetodoPago;
  referencia?: string;
  notas?: string;
  venta_id?: number;
}

export interface ResultadoPago {
  pago_id: number;
  pagado_usd_cents: number;
  saldo_usd_cents: number;
  excedente_usd_cents: number;
  anticipo_cubierto: boolean;
}

/**
 * Reparte lo pagado entre las cuotas, de la más vieja a la más nueva.
 * Se recalcula completo cada vez en vez de ir sumando: así anular un abono
 * viejo no deja cuotas marcadas como pagadas con plata que ya no existe.
 */
function repartirEnCuotas(cuotas: Cuota[], totalPagado: number): Cuota[] {
  let restante = totalPagado;
  return cuotas.map((c) => {
    const aplicado = Math.min(Math.max(0, restante), c.monto_usd_cents);
    restante -= aplicado;
    return { ...c, pagado_usd_cents: aplicado };
  });
}

export class PagosRepoFirestore {
  /**
   * Registra un abono.
   *
   * Todo lo que cambia (el pago, el saldo de la venta, sus cuotas y su
   * estado) se escribe en un solo lote. Antes eran seis escrituras sueltas
   * que podían quedar a medias.
   */
  static async registrar(
    input: RegistrarPagoInput,
    evento_grupo_id: string
  ): Promise<ResultadoPago> {
    const db = getFirestoreDb();

    const monto = Math.max(0, Math.round(input.monto_cents));
    if (monto === 0) throw new Error('El monto del pago tiene que ser mayor que cero.');

    const [venta, pagosSnap] = await Promise.all([
      leerDoc<VentaDoc>('ventas', input.venta_id),
      getDocs(
        query(
          collection(db, 'pagos'),
          where('venta_id', '==', input.venta_id),
          where('activo', '==', true)
        )
      ),
    ]);

    if (!venta) throw new Error(`La venta #${input.venta_id} no existe.`);
    if (venta.estado === 'CANCELADA') {
      throw new Error('No se puede registrar un pago en una venta cancelada.');
    }

    const pagosPrevios = pagosSnap.docs.map((d) => d.data() as Pago);
    const totalPrevio = pagosPrevios.reduce((s, p) => s + (p.monto_usd_cents || 0), 0);

    // La tasa congelada de la venta, no la de hoy: si no, un abono de la
    // semana pasada cambia de valor cada vez que se mueve el tipo de cambio.
    const tasa = venta.tasa_cambio_cents || 3662;
    const montoUsd = input.moneda === 'COR' ? Math.round((monto * 100) / tasa) : monto;
    const montoCor = input.moneda === 'COR' ? monto : Math.round((monto * tasa) / 100);

    const pagoId = await siguienteId('pagos');
    const now = new Date().toISOString();

    const nuevoPago: Pago = {
      id: pagoId,
      venta_id: input.venta_id,
      cliente_id: venta.cliente_id,
      fecha: input.fecha,
      monto_usd_cents: montoUsd,
      monto_cor_cents: montoCor,
      moneda: input.moneda,
      tasa_cambio_cents: tasa,
      metodo: input.metodo,
      referencia: input.referencia?.trim() || undefined,
      es_anticipo:
        input.es_anticipo ?? (venta.tipo === 'ENCARGO' && totalPrevio === 0),
      cuota_id: input.cuota_id,
      notas: input.notas?.trim() || undefined,
      activo: true,
      creado_en: now,
    };

    const pagado = totalPrevio + montoUsd;
    const saldo = (venta.total_usd_cents || 0) - pagado;

    const anticipoEsperado = venta.anticipo_esperado_usd_cents || 0;
    const anticipoCubierto = anticipoEsperado > 0 && pagado >= anticipoEsperado;

    const cambiosVenta: Record<string, unknown> = {
      pagado_usd_cents: pagado,
      saldo_usd_cents: saldo,
      actualizado_en: now,
    };

    if ((venta.cuotas || []).length > 0) {
      cambiosVenta.cuotas = repartirEnCuotas(venta.cuotas!, pagado);
    }

    // Un encargo con el anticipo cubierto pasa a PENDIENTE: ya se puede comprar.
    if (venta.tipo === 'ENCARGO' && venta.estado === 'COTIZADA' && anticipoCubierto) {
      cambiosVenta.estado = 'PENDIENTE';
    }

    const operaciones: OperacionLote[] = [
      {
        coleccion: 'pagos',
        id: pagoId,
        merge: false,
        datos: sinUndefined(nuevoPago as unknown as Record<string, unknown>),
      },
      { coleccion: 'ventas', id: input.venta_id, datos: cambiosVenta, merge: true },
    ];

    await aplicarLote(operaciones);
    await ClientesRepoFirestore.refrescarTotales(venta.cliente_id);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'pagos',
      entidad_id: pagoId,
      tipo_evento: 'CREACION',
      detalle: `Abono de ${formatearMoneda(monto, input.moneda === 'COR' ? 'COR' : 'USD')} en ${venta.codigo}`,
    });

    return {
      pago_id: pagoId,
      pagado_usd_cents: pagado,
      saldo_usd_cents: saldo,
      excedente_usd_cents: Math.max(0, -saldo),
      anticipo_cubierto: anticipoCubierto,
    };
  }

  static async anular(pago_id: number, evento_grupo_id: string): Promise<void> {
    const anterior = await EventosRepoFirestore.snapshot('pagos', pago_id);
    if (!anterior) throw new Error(`El pago #${pago_id} no existe.`);
    if (!anterior.activo) return;

    const db = getFirestoreDb();
    const ventaId = Number(anterior.venta_id);

    const [venta, pagosSnap] = await Promise.all([
      leerDoc<VentaDoc>('ventas', ventaId),
      getDocs(
        query(
          collection(db, 'pagos'),
          where('venta_id', '==', ventaId),
          where('activo', '==', true)
        )
      ),
    ]);

    if (!venta) throw new Error(`La venta #${ventaId} no existe.`);

    const pagado = pagosSnap.docs
      .map((d) => d.data() as Pago)
      .filter((p) => p.id !== pago_id)
      .reduce((s, p) => s + (p.monto_usd_cents || 0), 0);

    const saldo = (venta.total_usd_cents || 0) - pagado;
    const now = new Date().toISOString();

    const cambiosVenta: Record<string, unknown> = {
      pagado_usd_cents: pagado,
      saldo_usd_cents: saldo,
      actualizado_en: now,
    };

    if ((venta.cuotas || []).length > 0) {
      cambiosVenta.cuotas = repartirEnCuotas(venta.cuotas!, pagado);
    }

    // Si el anticipo deja de estar cubierto, el encargo vuelve a COTIZADA.
    const anticipoEsperado = venta.anticipo_esperado_usd_cents || 0;
    if (
      venta.tipo === 'ENCARGO' &&
      venta.estado === 'PENDIENTE' &&
      anticipoEsperado > 0 &&
      pagado < anticipoEsperado
    ) {
      cambiosVenta.estado = 'COTIZADA';
    }

    await aplicarLote([
      { coleccion: 'pagos', id: pago_id, datos: { activo: false, actualizado_en: now }, merge: true },
      { coleccion: 'ventas', id: ventaId, datos: cambiosVenta, merge: true },
    ]);

    await ClientesRepoFirestore.refrescarTotales(venta.cliente_id);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'pagos',
      entidad_id: pago_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior,
      detalle: 'Abono anulado',
    });
  }

  /** Acotado en el servidor: traer todos los pagos para mostrar veinte no escala. */
  static async recientes(limite = 20): Promise<Pago[]> {
    const db = getFirestoreDb();
    const snap = await getDocs(
      query(
        collection(db, 'pagos'),
        where('activo', '==', true),
        orderBy('fecha', 'desc'),
        orderBy('id', 'desc'),
        limit(limite)
      )
    );
    return snap.docs.map((d) => d.data() as Pago);
  }

  /**
   * Obtiene el historial completo de abonos / pagos de un cliente
   * ordenado cronológicamente (más reciente primero), enriquecido con el código de venta.
   */
  static async listarPorCliente(cliente_id: number): Promise<PagoCompleto[]> {
    const db = getFirestoreDb();
    const snap = await getDocs(
      query(
        collection(db, 'pagos'),
        where('cliente_id', '==', cliente_id),
        where('activo', '==', true)
      )
    );
    const pagos = snap.docs.map((d) => d.data() as Pago);
    if (pagos.length === 0) return [];

    // Cargar códigos de ventas asociadas
    const ventaIds = [...new Set(pagos.map((p) => p.venta_id).filter(Boolean))];
    const ventasDocs = await Promise.all(
      ventaIds.map(async (vid) => {
        const v = await leerDoc<VentaDoc>('ventas', vid);
        return [vid, v?.codigo] as const;
      })
    );
    const codigosMap = new Map<number, string>();
    for (const [vid, cod] of ventasDocs) {
      if (cod) codigosMap.set(vid, cod);
    }

    return pagos
      .map((p) => ({
        ...p,
        venta_codigo: codigosMap.get(p.venta_id) || `V-#${p.venta_id}`,
      }))
      .sort((a, b) => {
        const cmp = (b.fecha || '').localeCompare(a.fecha || '');
        return cmp !== 0 ? cmp : b.id - a.id;
      });
  }

  /**
   * Obtiene los abonos registrados para una venta específica.
   */
  static async listarPorVenta(venta_id: number): Promise<PagoCompleto[]> {
    const db = getFirestoreDb();
    const snap = await getDocs(
      query(
        collection(db, 'pagos'),
        where('venta_id', '==', venta_id),
        where('activo', '==', true)
      )
    );
    const pagos = snap.docs.map((d) => d.data() as Pago);
    if (pagos.length === 0) return [];

    const ventaDoc = await leerDoc<VentaDoc>('ventas', venta_id);
    const codigo = ventaDoc?.codigo || `V-#${venta_id}`;

    return pagos
      .map((p) => ({
        ...p,
        venta_codigo: codigo,
      }))
      .sort((a, b) => {
        const cmp = (b.fecha || '').localeCompare(a.fecha || '');
        return cmp !== 0 ? cmp : b.id - a.id;
      });
  }

  /**
   * Registra un abono directo al cliente.
   * Si se especifica venta_id, se aplica a esa venta.
   * Si no se especifica, amortiza por orden de antigüedad (FIFO) entre las ventas con saldo.
   */
  static async registrarAbonoCliente(
    input: AbonoClienteInput,
    evento_grupo_id: string
  ): Promise<ResultadoPago> {
    if (input.venta_id) {
      return this.registrar(
        {
          venta_id: input.venta_id,
          fecha: input.fecha,
          monto_cents: input.monto_cents,
          moneda: input.moneda,
          metodo: input.metodo,
          referencia: input.referencia,
          notas: input.notas,
        },
        evento_grupo_id
      );
    }

    const db = getFirestoreDb();
    const ventasSnap = await getDocs(
      query(
        collection(db, 'ventas'),
        where('cliente_id', '==', input.cliente_id),
        where('activo', '==', true)
      )
    );

    const ventasConSaldo = ventasSnap.docs
      .map((d) => d.data() as VentaDoc)
      .filter((v) => (v.saldo_usd_cents || 0) > 0 && v.estado !== 'CANCELADA')
      .sort((a, b) => {
        const cmp = (a.fecha || '').localeCompare(b.fecha || '');
        return cmp !== 0 ? cmp : a.id - b.id;
      });

    if (ventasConSaldo.length === 0) {
      throw new Error('El cliente no tiene ventas o encargos con saldo pendiente.');
    }

    // Si solo hay una venta con saldo, o el monto cabe en la primera venta
    const tasa = ventasConSaldo[0].tasa_cambio_cents || 3662;
    const montoTotalUsd = input.moneda === 'COR'
      ? Math.round((input.monto_cents * 100) / tasa)
      : input.monto_cents;

    if (ventasConSaldo.length === 1 || montoTotalUsd <= ventasConSaldo[0].saldo_usd_cents) {
      return this.registrar(
        {
          venta_id: ventasConSaldo[0].id,
          fecha: input.fecha,
          monto_cents: input.monto_cents,
          moneda: input.moneda,
          metodo: input.metodo,
          referencia: input.referencia,
          notas: input.notas,
        },
        evento_grupo_id
      );
    }

    // Amortizar en cascada FIFO
    let remanenteUsd = montoTotalUsd;
    let ultimoResultado: ResultadoPago | null = null;

    for (let i = 0; i < ventasConSaldo.length && remanenteUsd > 0; i++) {
      const v = ventasConSaldo[i];
      const esUltima = i === ventasConSaldo.length - 1;
      const aplicarUsd = esUltima ? remanenteUsd : Math.min(remanenteUsd, v.saldo_usd_cents);
      const aplicarMontoInput = input.moneda === 'COR'
        ? Math.round((aplicarUsd * (v.tasa_cambio_cents || tasa)) / 100)
        : aplicarUsd;

      ultimoResultado = await this.registrar(
        {
          venta_id: v.id,
          fecha: input.fecha,
          monto_cents: aplicarMontoInput,
          moneda: input.moneda,
          metodo: input.metodo,
          referencia: input.referencia,
          notas: input.notas ? `${input.notas} (Abono múltiple ${v.codigo})` : undefined,
        },
        evento_grupo_id
      );

      remanenteUsd -= aplicarUsd;
    }

    return ultimoResultado!;
  }
}
