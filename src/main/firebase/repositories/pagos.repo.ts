import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  runTransaction,
} from 'firebase/firestore';
import { getFirestoreDb, siguienteId, leerDoc, leerVarios, sinUndefined, autorActual } from '../client';

import { type VentaDoc } from './ventas.repo';
import { ClientesRepoFirestore } from './clientes.repo';
import { EventosRepoFirestore } from './eventos.repo';
import type { Pago, PagoCompleto, MetodoPago, MonedaPago } from '../../../shared/types';
import { formatearMoneda } from '../../../core/moneda';
import { pagoAcepta } from '../../../core/cobranza';
import { repartirEnCuotas } from '../../../core/cuotas';
import { repartirAbono } from '../../../core/reparto';
import type { CorregirPagoInput } from '../../../shared/ipc-contracts';

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

    const pagoId = await siguienteId('pagos');
    const now = new Date().toISOString();

    // El pago y el saldo de la venta se escriben en UNA transacción.
    //
    // Antes esto era leer-calcular-escribir sin transacción: la misma venta
    // cobrada al mismo tiempo desde Windows y desde el celular creaba los dos
    // documentos de pago, pero cada uno escribía el saldo que había leído, y
    // el último pisaba al otro. La venta quedaba debiendo plata que la clienta
    // ya había pagado. La transacción reintenta sola si alguien tocó la venta
    // en el medio.
    const resultado = await runTransaction(db, async (tx) => {
      const ventaRef = doc(db, 'ventas', String(input.venta_id));
      const snap = await tx.get(ventaRef);
      if (!snap.exists()) throw new Error(`La venta #${input.venta_id} no existe.`);

      const venta = snap.data() as VentaDoc;
      if (venta.estado === 'CANCELADA') {
        throw new Error('No se puede registrar un pago en una venta cancelada.');
      }

      const totalPrevio = venta.pagado_usd_cents || 0;

      // La tasa congelada de la venta, no la de hoy: si no, un abono de la
      // semana pasada cambia de valor cada vez que se mueve el tipo de cambio.
      const tasa = venta.tasa_cambio_cents || 3662;
      const montoUsd = input.moneda === 'COR' ? Math.round((monto * 100) / tasa) : monto;
      const montoCor = input.moneda === 'COR' ? monto : Math.round((monto * tasa) / 100);

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
        es_anticipo: input.es_anticipo ?? (venta.tipo === 'ENCARGO' && totalPrevio === 0),
        cuota_id: input.cuota_id,
        notas: input.notas?.trim() || undefined,
        activo: true,
        creado_en: now,
        registrado_por: autorActual(),
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

      // Quien paga, aceptó: un encargo con el anticipo cubierto (o, sin
      // anticipo pedido, con cualquier pago) pasa a PENDIENTE. Un pedido con
      // piezas sin precio no se confirma: primero se cotiza.
      const porCotizar = (venta.piezas?.sin_precio ?? 0) > 0;
      const acepta =
        venta.tipo === 'ENCARGO' &&
        venta.estado === 'COTIZADA' &&
        !porCotizar &&
        pagoAcepta({ pagado_usd_cents: pagado, anticipo_esperado_usd_cents: anticipoEsperado });
      if (acepta) {
        cambiosVenta.estado = 'PENDIENTE';
        // La fecha del pago, no la de hoy: un pago cargado tarde dice cuándo
        // aceptó de verdad, y desde ahí cuenta el aviso de "sin comprar".
        cambiosVenta.aceptado_el = input.fecha;
      }

      tx.set(
        doc(db, 'pagos', String(pagoId)),
        sinUndefined(nuevoPago as unknown as Record<string, unknown>)
      );
      tx.set(ventaRef, cambiosVenta, { merge: true });

      return {
        pagado,
        saldo,
        anticipoCubierto,
        cliente_id: venta.cliente_id,
        codigo: venta.codigo,
        // Si el pago aceptó el encargo, deshacerlo tiene que volverlo a
        // cotizado: sin la instantánea, se borraba el pago y el encargo
        // quedaba confirmado.
        ventaAntes: acepta ? venta : null,
      };
    });

    const { pagado, saldo, anticipoCubierto } = resultado;
    await ClientesRepoFirestore.refrescarTotales(resultado.cliente_id);

    if (resultado.ventaAntes) {
      await EventosRepoFirestore.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'ventas',
        entidad_id: input.venta_id,
        tipo_evento: 'ACTUALIZACION',
        valor_anterior: resultado.ventaAntes as unknown as Record<string, unknown>,
        detalle: `${resultado.codigo}: aceptó, con el pago`,
      });
    }
    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'pagos',
      entidad_id: pagoId,
      tipo_evento: 'CREACION',
      detalle: `Abono de ${formatearMoneda(monto, input.moneda === 'COR' ? 'COR' : 'USD')} en ${resultado.codigo}`,
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
    const now = new Date().toISOString();

    // Igual que al registrar: la baja del pago y el saldo de la venta van en
    // la misma transacción, para que dos anulaciones simultáneas no se pisen.
    const cliente_id = await runTransaction(db, async (tx) => {
      const ventaRef = doc(db, 'ventas', String(ventaId));
      const pagoRef = doc(db, 'pagos', String(pago_id));

      const [ventaSnap, pagoSnap] = await Promise.all([tx.get(ventaRef), tx.get(pagoRef)]);
      if (!ventaSnap.exists()) throw new Error(`La venta #${ventaId} no existe.`);

      const venta = ventaSnap.data() as VentaDoc;
      const pago = pagoSnap.exists() ? (pagoSnap.data() as Pago) : null;

      // Si otro dispositivo lo anuló mientras tanto, no hay nada que devolver.
      if (!pago || pago.activo === false) return venta.cliente_id;

      const pagado = Math.max(0, (venta.pagado_usd_cents || 0) - (pago.monto_usd_cents || 0));
      const saldo = (venta.total_usd_cents || 0) - pagado;

      const cambiosVenta: Record<string, unknown> = {
        pagado_usd_cents: pagado,
        saldo_usd_cents: saldo,
        actualizado_en: now,
      };

      if ((venta.cuotas || []).length > 0) {
        cambiosVenta.cuotas = repartirEnCuotas(venta.cuotas!, pagado);
      }

      // Un encargo aceptado sigue aceptado: "Aceptó" es un paso propio, que
      // no depende de un pago. Antes volvía a cotizado si el anticipo dejaba
      // de estar cubierto, y se perdía una aceptación que la clienta sí dio.

      tx.set(pagoRef, { activo: false, actualizado_en: now }, { merge: true });
      tx.set(ventaRef, cambiosVenta, { merge: true });

      return venta.cliente_id;
    });

    await ClientesRepoFirestore.refrescarTotales(cliente_id);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'pagos',
      entidad_id: pago_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior,
      detalle: 'Abono anulado',
    });
  }

  /**
   * Corrige un abono: monto, moneda, fecha, método, referencia o notas.
   *
   * Con la tasa del abono: corregir el monto no lo pasa a la tasa de hoy. El
   * pagado y el saldo de la venta, y sus cuotas, cambian en la misma
   * transacción. Un encargo que con el abono corregido cubre el anticipo queda
   * aceptado, con la misma regla que al registrarlo; uno aceptado sigue
   * aceptado aunque el abono baje.
   *
   * Se puede deshacer: guarda el abono de antes, y la venta si la aceptó.
   */
  static async corregir(pago_id: number, input: CorregirPagoInput, evento_grupo_id: string): Promise<void> {
    const monto = Math.max(0, Math.round(input.monto_cents));
    if (monto === 0) throw new Error('El monto del pago tiene que ser mayor que cero.');

    const db = getFirestoreDb();
    const pagoRef = doc(db, 'pagos', String(pago_id));
    const now = new Date().toISOString();

    const r = await runTransaction(db, async (tx) => {
      const pagoSnap = await tx.get(pagoRef);
      if (!pagoSnap.exists()) throw new Error(`El abono #${pago_id} no existe.`);
      const pago = pagoSnap.data() as Pago;
      if (pago.activo === false) throw new Error('Ese abono está anulado: no se corrige.');

      const ventaRef = doc(db, 'ventas', String(pago.venta_id));
      const ventaSnap = await tx.get(ventaRef);
      if (!ventaSnap.exists()) throw new Error(`La venta #${pago.venta_id} no existe.`);
      const venta = ventaSnap.data() as VentaDoc;
      if (venta.estado === 'CANCELADA') throw new Error(`${venta.codigo} está anulada: sus abonos no se corrigen.`);

      const tasa = pago.tasa_cambio_cents || venta.tasa_cambio_cents || 3662;
      const montoUsd = input.moneda === 'COR' ? Math.round((monto * 100) / tasa) : monto;
      const montoCor = input.moneda === 'COR' ? monto : Math.round((monto * tasa) / 100);

      const pagado = Math.max(0, (venta.pagado_usd_cents || 0) - (pago.monto_usd_cents || 0) + montoUsd);
      const cambiosVenta: Record<string, unknown> = {
        pagado_usd_cents: pagado,
        saldo_usd_cents: (venta.total_usd_cents || 0) - pagado,
        actualizado_en: now,
      };
      if ((venta.cuotas || []).length > 0) {
        cambiosVenta.cuotas = repartirEnCuotas(venta.cuotas!, pagado);
      }
      const acepta =
        venta.tipo === 'ENCARGO' &&
        venta.estado === 'COTIZADA' &&
        (venta.piezas?.sin_precio ?? 0) === 0 &&
        pagoAcepta({ pagado_usd_cents: pagado, anticipo_esperado_usd_cents: venta.anticipo_esperado_usd_cents || 0 });
      if (acepta) {
        cambiosVenta.estado = 'PENDIENTE';
        cambiosVenta.aceptado_el = input.fecha;
      }

      // Sin merge: una referencia o una nota que se borró, queda borrada.
      tx.set(
        pagoRef,
        sinUndefined({
          ...pago,
          fecha: input.fecha,
          monto_usd_cents: montoUsd,
          monto_cor_cents: montoCor,
          moneda: input.moneda,
          metodo: input.metodo,
          referencia: input.referencia?.trim() || undefined,
          notas: input.notas?.trim() || undefined,
          corregido_por: autorActual(),
          corregido_en: now,
          actualizado_en: now,
        } as unknown as Record<string, unknown>)
      );
      tx.set(ventaRef, cambiosVenta, { merge: true });

      return { pago, venta, acepta };
    });

    await ClientesRepoFirestore.refrescarTotales(r.venta.cliente_id);

    if (r.acepta) {
      await EventosRepoFirestore.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'ventas',
        entidad_id: r.venta.id,
        tipo_evento: 'ACTUALIZACION',
        valor_anterior: r.venta as unknown as Record<string, unknown>,
        detalle: `${r.venta.codigo}: aceptó, con el abono corregido`,
      });
    }
    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'pagos',
      entidad_id: pago_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: r.pago as unknown as Record<string, unknown>,
      detalle: `Abono de ${r.venta.codigo} corregido a ${formatearMoneda(monto, input.moneda === 'COR' ? 'COR' : 'USD')}`,
    });
  }

  /** Acotado en el servidor: pagos recientes enriquecidos con código de venta y nombre de clienta. */
  static async recientes(limite = 50): Promise<PagoCompleto[]> {
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
    return this.conDatosDeVenta(snap.docs.map((d) => d.data() as Pago));
  }

  /** Le pega a cada abono el código de su venta y el nombre de la clienta. */
  private static async conDatosDeVenta(pagos: Pago[]): Promise<PagoCompleto[]> {
    if (pagos.length === 0) return [];

    const ventaIds = [...new Set(pagos.map((p) => p.venta_id).filter(Boolean))];
    // El nombre sale de la clienta, no de la venta: la venta guarda sólo su
    // id. Antes se leía `cliente_nombre` de la venta, que nunca está, y todos
    // los abonos de la lista decían "Cliente".
    const clienteIds = [...new Set(pagos.map((p) => p.cliente_id).filter(Boolean))] as number[];
    const [ventasDocs, clientes] = await Promise.all([
      Promise.all(
        ventaIds.map(async (vid) => {
          const v = await leerDoc<VentaDoc>('ventas', vid);
          return [vid, v?.codigo] as const;
        })
      ),
      leerVarios<{ nombre?: string }>('clientes', clienteIds),
    ]);
    const codigos = new Map<number, string | undefined>(ventasDocs);

    return pagos.map((p) => ({
      ...p,
      venta_codigo: codigos.get(p.venta_id) || `V-#${p.venta_id}`,
      cliente_nombre: (p.cliente_id ? clientes.get(String(p.cliente_id))?.nombre : undefined) || 'Cliente',
    }));
  }

  /**
   * Los abonos de un período, para llevárselos a una planilla.
   *
   * Usa el mismo índice que `recientes` —activo, fecha desc, id desc— sumando
   * la ventana de fechas, que cae sobre el mismo campo por el que ya ordena.
   *
   * El tope existe por seguridad, no para recortar: si la exportación lo toca,
   * quien llama tiene que darse cuenta y avisar. Una planilla a la que le
   * faltan las últimas cien filas y no lo dice es peor que no exportar nada,
   * porque los números cuadran entre ellos y nadie sospecha.
   */
  static async enRango(desde: string, hasta: string, limite = 10000): Promise<PagoCompleto[]> {
    const db = getFirestoreDb();
    const snap = await getDocs(
      query(
        collection(db, 'pagos'),
        where('activo', '==', true),
        where('fecha', '>=', desde),
        orderBy('fecha', 'desc'),
        orderBy('id', 'desc'),
        limit(limite)
      )
    );
    const pagos = (snap.docs.map((d) => d.data() as Pago)).filter((p) => p.fecha <= hasta);
    return this.conDatosDeVenta(pagos);
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
   * Un abono a la cuenta de la clienta. Con `venta_id`, a esa venta. Sin ella,
   * a sus ventas con saldo por antigüedad, con `repartirAbono`: la misma
   * función con que la ventana muestra antes a qué ventas va.
   */
  static async registrarAbonoCliente(
    input: AbonoClienteInput,
    evento_grupo_id: string
  ): Promise<ResultadoPago> {
    const abono = (venta_id: number, monto_cents: number, notas: string | undefined) =>
      this.registrar(
        {
          venta_id,
          fecha: input.fecha,
          monto_cents,
          moneda: input.moneda,
          metodo: input.metodo,
          referencia: input.referencia,
          notas,
        },
        evento_grupo_id
      );
    if (input.venta_id) return abono(input.venta_id, input.monto_cents, input.notas);

    const db = getFirestoreDb();
    const ventasSnap = await getDocs(
      query(
        collection(db, 'ventas'),
        where('cliente_id', '==', input.cliente_id),
        where('activo', '==', true)
      )
    );
    const partes = repartirAbono(
      ventasSnap.docs.map((d) => d.data() as VentaDoc),
      input.monto_cents,
      input.moneda
    );
    if (partes.length === 0) {
      throw new Error('Esa clienta no tiene ventas ni encargos con saldo pendiente.');
    }

    // Cada parte dice de qué abono salió: en la venta se ve un abono de
    // C$700, y sin esto no se sabe que fue parte de uno de C$2,500.
    const deUnAbono =
      partes.length > 1 ? `Parte de un abono de ${formatearMoneda(input.monto_cents, input.moneda)}` : undefined;
    const notas = [input.notas?.trim(), deUnAbono].filter(Boolean).join(' · ') || undefined;

    let ultimo: ResultadoPago | null = null;
    for (const parte of partes) ultimo = await abono(parte.venta_id, parte.monto_cents, notas);
    return ultimo!;
  }
}
