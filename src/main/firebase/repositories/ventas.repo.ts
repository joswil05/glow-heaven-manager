import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  getFirestoreDb,
  siguienteId,
  leerDoc,
  leerVarios,
  aplicarLote,
  sinUndefined,
  type OperacionLote,
} from '../client';
import { ParametrosRepoFirestore } from './parametros.repo';
import { ProductosRepoFirestore, type ProductoDoc } from './productos.repo';
import { ClientesRepoFirestore } from './clientes.repo';
import { EventosRepoFirestore } from './eventos.repo';
import type {
  Venta,
  VentaCompleta,
  VentaLinea,
  Cuota,
  Pago,
  Cliente,
  EstadoVenta,
  TipoVenta,
  TipoDescuento,
} from '../../../shared/types';

export interface LineaVentaInput {
  producto_id?: number;
  variante_id?: number;
  descripcion?: string;
  cantidad: number;
  precio_unitario_usd_cents?: number;
  es_paquete?: boolean;
  costo_estimado_unitario_usd_cents?: number;
}

import type { PagoInicialInput } from '../../../shared/ipc-contracts';

export interface CrearVentaInput {
  cliente_id?: number;
  fecha: string;
  tipo: TipoVenta;
  lineas: LineaVentaInput[];
  notas?: string;
  anticipo_bp?: number;
  plan_cuotas?: { cantidad: number; cada_dias: number; primera_fecha?: string };
  entregar_ahora?: boolean;
  pago_inicial?: PagoInicialInput;
  descuento_tipo?: TipoDescuento;
  descuento_valor?: number;
  descuento_motivo?: string;
}

export interface FiltrosVenta {
  tipo?: TipoVenta;
  estado?: EstadoVenta;
  cliente_id?: number;
  soloConSaldo?: boolean;
  desde?: string;
  hasta?: string;
}

export interface VentaDoc extends Venta {
  lineas: VentaLinea[];
  cuotas?: Cuota[];
}

export class VentasRepoFirestore {
  /**
   * Lista de ventas. Acepta el mapa de clientes ya cargado para no releer
   * el directorio entero: el panel y la pantalla de ventas lo tienen a mano.
   */
  static async listar(
    filtros: FiltrosVenta = {},
    cacheClientes?: Map<number, string>
  ): Promise<Venta[]> {
    const db = getFirestoreDb();

    // Los filtros que Firestore sabe resolver se mandan al servidor: filtrar
    // en memoria significa pagar la lectura de todo lo que se descarta.
    const clausulas = [where('activo', '==', true)];
    if (filtros.tipo) clausulas.push(where('tipo', '==', filtros.tipo));
    if (filtros.estado) clausulas.push(where('estado', '==', filtros.estado));
    if (filtros.cliente_id) clausulas.push(where('cliente_id', '==', filtros.cliente_id));

    const snap = await getDocs(query(collection(db, 'ventas'), ...clausulas));

    let cliMap = cacheClientes;
    if (!cliMap) {
      const conCliente = snap.docs.some((d) => (d.data() as VentaDoc).cliente_id);
      if (conCliente) {
        const clientes = await ClientesRepoFirestore.listar();
        cliMap = new Map(clientes.map((c) => [c.id, c.nombre]));
      } else {
        cliMap = new Map();
      }
    }

    let ventas: Venta[] = snap.docs.map((d) => {
      const data = d.data() as VentaDoc;
      const { lineas: _l, cuotas: _c, ...v } = data;
      return {
        ...v,
        cliente_nombre: v.cliente_id ? cliMap!.get(v.cliente_id) : undefined,
      };
    });

    if (filtros.soloConSaldo) {
      ventas = ventas.filter((v) => (v.saldo_usd_cents || 0) > 0 && v.estado !== 'CANCELADA');
    }
    if (filtros.desde) ventas = ventas.filter((v) => v.fecha >= filtros.desde!);
    if (filtros.hasta) ventas = ventas.filter((v) => v.fecha <= filtros.hasta!);

    return ventas.sort((a, b) => {
      const cmp = (b.fecha || '').localeCompare(a.fecha || '');
      return cmp !== 0 ? cmp : b.id - a.id;
    });
  }

  static async getById(id: number): Promise<VentaCompleta | null> {
    const db = getFirestoreDb();
    const data = await leerDoc<VentaDoc>('ventas', id);
    if (!data || !data.activo) return null;

    const lineas = data.lineas || [];
    const idsProductos = [...new Set(lineas.map((l) => l.producto_id).filter(Boolean))] as number[];

    // Cliente, pagos y todos los productos de las líneas se piden en
    // paralelo. Antes se leía un producto por línea, y cada lectura traía
    // además la colección de categorías.
    const [cliente, pagosSnap, productos] = await Promise.all([
      data.cliente_id
        ? ClientesRepoFirestore.getById(data.cliente_id)
        : Promise.resolve(null),
      getDocs(
        query(
          collection(db, 'pagos'),
          where('venta_id', '==', id),
          where('activo', '==', true)
        )
      ),
      leerVarios<ProductoDoc>('productos', idsProductos),
    ]);

    const pagos: Pago[] = pagosSnap.docs
      .map((d) => d.data() as Pago)
      .sort((a, b) => {
        const cmp = (a.fecha || '').localeCompare(b.fecha || '');
        return cmp !== 0 ? cmp : a.id - b.id;
      });

    const hoy = new Date().toISOString().slice(0, 10);
    const cuotas = (data.cuotas || []).map((c) => ({
      ...c,
      vencida: (c.pagado_usd_cents || 0) < c.monto_usd_cents && c.fecha_vencimiento < hoy,
    }));

    const lineasEnriquecidas: VentaLinea[] = lineas.map((l) => {
      const prod = l.producto_id ? productos.get(String(l.producto_id)) : undefined;
      const variante = prod && l.variante_id
        ? (prod.variantes || []).find((v) => v.id === l.variante_id)
        : undefined;

      return {
        ...l,
        producto_nombre: l.producto_nombre ?? prod?.nombre,
        talla: l.talla ?? variante?.talla,
        color: l.color ?? variante?.color,
        es_paquete: Boolean(l.es_paquete),
      };
    });

    const { lineas: _l, cuotas: _c, ...venta } = data;
    return {
      ...venta,
      cliente_nombre: cliente?.nombre,
      cliente: (cliente as Cliente) ?? undefined,
      lineas: lineasEnriquecidas,
      pagos,
      cuotas,
    };
  }

  /**
   * Registra una venta.
   *
   * El inventario se valida ENTERO antes de tocar nada. La versión anterior
   * descontaba línea por línea y guardaba la venta al final: si la tercera
   * línea no tenía stock, las dos primeras ya habían restado unidades y no
   * quedaba ninguna venta que lo explicara. La mercadería desaparecía.
   */
  static async crear(input: CrearVentaInput, evento_grupo_id: string): Promise<number> {
    if (input.lineas.length === 0) {
      throw new Error('Una venta necesita al menos un producto.');
    }

    const esEncargo = input.tipo === 'ENCARGO';
    const idsProductos = [
      ...new Set(input.lineas.map((l) => l.producto_id).filter(Boolean)),
    ] as number[];

    const [ventaId, params, productos] = await Promise.all([
      siguienteId('ventas'),
      ParametrosRepoFirestore.getParametros(),
      leerVarios<ProductoDoc>('productos', idsProductos),
    ]);

    const codigo = `${esEncargo ? 'E' : 'V'}-${String(ventaId).padStart(4, '0')}`;
    const tasa = params.tasa_cambio_cents ?? 3662;

    // 1. Validar todo antes de escribir. Se acumula lo pedido por producto
    //    porque dos líneas pueden apuntar al mismo.
    const pedidoPorProducto = new Map<number, number>();
    for (const linea of input.lineas) {
      const cantidad = Math.max(1, Math.round(linea.cantidad));
      if (!linea.producto_id) {
        if (!linea.descripcion?.trim()) {
          throw new Error('Cada línea de la venta necesita un producto o una descripción.');
        }
        continue;
      }

      const prod = productos.get(String(linea.producto_id));
      if (!prod) throw new Error(`El producto #${linea.producto_id} no existe.`);

      if (!esEncargo) {
        pedidoPorProducto.set(
          linea.producto_id,
          (pedidoPorProducto.get(linea.producto_id) ?? 0) + cantidad
        );
      }
    }

    for (const [productoId, pedido] of pedidoPorProducto) {
      const prod = productos.get(String(productoId))!;
      const disponible = (prod.variantes || [])
        .filter((v) => v.activo !== false)
        .reduce((s, v) => s + (v.existencias || 0), 0);

      if (pedido > disponible) {
        throw new Error(
          `No hay suficientes unidades de '${prod.nombre}'. Disponibles: ${disponible}, pedidas: ${pedido}.`
        );
      }
    }

    // 2. Aplicar. Con el stock ya validado, las salidas no fallan por falta
    //    de unidades.
    let total = 0;
    let costoTotal = 0;
    const lineasGuardadas: VentaLinea[] = [];
    const salidasRealizadas: Array<{
      producto_id: number;
      variante_id?: number;
      cantidad: number;
      costo_salida_usd_cents: number;
    }> = [];

    try {
      for (let i = 0; i < input.lineas.length; i++) {
        const linea = input.lineas[i];
        const cantidad = Math.max(1, Math.round(linea.cantidad));
        const prod = linea.producto_id ? productos.get(String(linea.producto_id)) : undefined;

        let descripcion = linea.descripcion?.trim() || prod?.nombre || '';
        let precioUnitario =
          linea.precio_unitario_usd_cents ?? prod?.precio_venta_usd_cents ?? 0;
        let costoUnitario = linea.costo_estimado_unitario_usd_cents ?? 0;
        let costoLinea = costoUnitario * cantidad;

        if (prod && !esEncargo) {
          const salida = await ProductosRepoFirestore.salida({
            producto_id: linea.producto_id!,
            variante_id: linea.variante_id,
            cantidad,
            referencia_tipo: 'VENTA',
            referencia_id: ventaId,
            detalle: `Venta ${codigo}`,
          });
          salidasRealizadas.push({
            producto_id: linea.producto_id!,
            variante_id: linea.variante_id,
            cantidad,
            costo_salida_usd_cents: salida.costo_salida_usd_cents,
          });
          costoLinea = salida.costo_salida_usd_cents;
          costoUnitario = Math.round(costoLinea / cantidad);
        }

        const subtotal = precioUnitario * cantidad;
        total += subtotal;
        costoTotal += costoLinea;

        lineasGuardadas.push({
          id: i + 1,
          venta_id: ventaId,
          producto_id: linea.producto_id,
          variante_id: linea.variante_id,
          descripcion,
          cantidad,
          precio_unitario_usd_cents: precioUnitario,
          costo_unitario_usd_cents: costoUnitario,
          subtotal_usd_cents: subtotal,
          costo_total_usd_cents: costoLinea,
          es_paquete: Boolean(linea.es_paquete),
          orden: i,
        });
      }

      // Aplicar descuento sobre el subtotal si fue especificado
      const subtotalVenta = total;
      let descuentoUsdCents = 0;
      if (input.descuento_tipo === 'PORCENTAJE' && input.descuento_valor && input.descuento_valor > 0) {
        descuentoUsdCents = Math.round((subtotalVenta * input.descuento_valor) / 100);
      } else if (input.descuento_tipo === 'MONTO_FIJO' && input.descuento_valor && input.descuento_valor > 0) {
        descuentoUsdCents = Math.round(input.descuento_valor);
      }
      descuentoUsdCents = Math.min(subtotalVenta, Math.max(0, descuentoUsdCents));
      total = Math.max(0, subtotalVenta - descuentoUsdCents);

      const anticipoBp = esEncargo
        ? (input.anticipo_bp ?? params.anticipo_defecto_bp ?? 5000)
        : 0;

      let pagadoUsdCents = 0;
      let pagoDoc: Pago | null = null;

      if (input.pago_inicial) {
        const montoInput =
          input.pago_inicial.monto_cents ??
          (input.pago_inicial.moneda === 'COR'
            ? Math.round((total * tasa) / 100)
            : total);
        const montoUsd =
          input.pago_inicial.moneda === 'COR'
            ? Math.round((montoInput * 100) / tasa)
            : montoInput;
        const montoCor =
          input.pago_inicial.moneda === 'COR'
            ? montoInput
            : Math.round((montoUsd * tasa) / 100);

        pagadoUsdCents = Math.min(total, Math.max(0, montoUsd));

        if (pagadoUsdCents > 0) {
          const pagoId = await siguienteId('pagos');
          pagoDoc = {
            id: pagoId,
            venta_id: ventaId,
            cliente_id: input.cliente_id,
            fecha: input.fecha,
            monto_usd_cents: pagadoUsdCents,
            monto_cor_cents: montoCor,
            moneda: input.pago_inicial.moneda,
            tasa_cambio_cents: tasa,
            metodo: input.pago_inicial.metodo,
            referencia: input.pago_inicial.referencia,
            notas: input.pago_inicial.notas,
            es_anticipo: esEncargo,
            activo: true,
          };
        }
      }

      const saldoUsdCents = Math.max(0, total - pagadoUsdCents);

      const nuevaVenta: VentaDoc = {
        id: ventaId,
        codigo,
        cliente_id: input.cliente_id,
        fecha: input.fecha,
        tipo: input.tipo,
        estado: esEncargo
          ? (saldoUsdCents === 0 ? 'PENDIENTE' : 'COTIZADA')
          : input.entregar_ahora === false
            ? 'PENDIENTE'
            : 'ENTREGADA',
        tasa_cambio_cents: tasa,
        subtotal_usd_cents: subtotalVenta,
        descuento_usd_cents: descuentoUsdCents,
        descuento_tipo: input.descuento_tipo,
        descuento_valor: input.descuento_valor,
        descuento_motivo: input.descuento_motivo?.trim() || undefined,
        total_usd_cents: total,
        costo_total_usd_cents: costoTotal,
        ganancia_usd_cents: total - costoTotal,
        pagado_usd_cents: pagadoUsdCents,
        saldo_usd_cents: saldoUsdCents,
        anticipo_esperado_usd_cents: Math.round((total * anticipoBp) / 10000),
        notas: input.notas?.trim() || undefined,
        lineas: lineasGuardadas,
        cuotas:
          input.plan_cuotas && input.plan_cuotas.cantidad > 1
            ? this.generarPlanCuotas(ventaId, saldoUsdCents > 0 ? saldoUsdCents : total, input.plan_cuotas, input.fecha)
            : [],
        activo: true,
        creado_en: new Date().toISOString(),
      };

      const operacionesLote: OperacionLote[] = [
        {
          coleccion: 'ventas',
          id: ventaId,
          merge: false,
          datos: sinUndefined(nuevaVenta as unknown as Record<string, unknown>),
        },
      ];

      if (pagoDoc) {
        operacionesLote.push({
          coleccion: 'pagos',
          id: pagoDoc.id,
          merge: false,
          datos: sinUndefined(pagoDoc as unknown as Record<string, unknown>),
        });
      }

      await aplicarLote(operacionesLote);

      if (pagoDoc) {
        await EventosRepoFirestore.registrarEvento({
          evento_grupo_id,
          entidad_tipo: 'pagos',
          entidad_id: pagoDoc.id,
          tipo_evento: 'CREACION',
          detalle: `Pago inicial de $${(pagoDoc.monto_usd_cents / 100).toFixed(2)} registrado en venta ${codigo}`,
        });
      }

      // Los totales del cliente se derivan de sus ventas; en Firestore hay que
      // refrescarlos a mano después de cada una.
      await ClientesRepoFirestore.refrescarTotales(input.cliente_id);

      await EventosRepoFirestore.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'ventas',
        entidad_id: ventaId,
        tipo_evento: 'CREACION',
        detalle: `${esEncargo ? 'Encargo' : 'Venta'} ${codigo} registrada`,
      });

      return ventaId;
    } catch (err) {
      if (salidasRealizadas.length > 0) {
        console.warn(
          `[VentasRepo] Revirtiendo ${salidasRealizadas.length} salidas de inventario debido a fallo en creación de venta #${ventaId}:`,
          err
        );
        for (const s of salidasRealizadas) {
          try {
            await ProductosRepoFirestore.entrada({
              producto_id: s.producto_id,
              variante_id: s.variante_id,
              cantidad: s.cantidad,
              costo_total_usd_cents: s.costo_salida_usd_cents,
              referencia_tipo: 'VENTA',
              referencia_id: ventaId,
              detalle: `Reversión automática por venta fallida ${codigo}`,
            });
          } catch (revertErr) {
            console.error(
              `[VentasRepo] Error crítico al revertir salida de producto #${s.producto_id}:`,
              revertErr
            );
          }
        }
      }
      throw err;
    }
  }

  /**
   * Reparte el total en N cuotas. El residuo va en la primera: si algo no
   * cuadra, es mejor que el cliente lo vea al inicio y no en el último pago.
   */
  private static generarPlanCuotas(
    venta_id: number,
    total_usd_cents: number,
    plan: { cantidad: number; cada_dias: number; primera_fecha?: string },
    fecha_venta: string
  ): Cuota[] {
    const cantidad = Math.max(2, Math.round(plan.cantidad));
    const cadaDias = Math.max(1, Math.round(plan.cada_dias));

    const base = Math.floor(total_usd_cents / cantidad);
    const residuo = total_usd_cents - base * cantidad;

    const inicio = new Date(`${plan.primera_fecha ?? fecha_venta}T00:00:00`);
    const cuotas: Cuota[] = [];

    for (let i = 0; i < cantidad; i++) {
      const vence = new Date(inicio);
      vence.setDate(vence.getDate() + cadaDias * i);
      cuotas.push({
        id: i + 1,
        venta_id,
        numero: i + 1,
        fecha_vencimiento: vence.toISOString().slice(0, 10),
        monto_usd_cents: i === 0 ? base + residuo : base,
        pagado_usd_cents: 0,
      });
    }

    return cuotas;
  }

  static async cambiarEstado(
    venta_id: number,
    estado: EstadoVenta,
    evento_grupo_id: string
  ): Promise<void> {
    const venta = await leerDoc<VentaDoc>('ventas', venta_id);
    if (!venta) throw new Error(`La venta #${venta_id} no existe.`);
    if (venta.estado === estado) return;

    const anterior = { ...venta } as unknown as Record<string, unknown>;

    // Cancelar una venta de inventario devuelve la mercadería. Sin esto las
    // existencias quedan cortas para siempre.
    if (estado === 'CANCELADA' && venta.tipo === 'INVENTARIO') {
      for (const l of venta.lineas || []) {
        if (!l.producto_id) continue;
        try {
          await ProductosRepoFirestore.entrada({
            producto_id: l.producto_id,
            variante_id: l.variante_id,
            cantidad: l.cantidad,
            costo_total_usd_cents: l.costo_total_usd_cents,
            referencia_tipo: 'VENTA',
            referencia_id: venta_id,
            detalle: `Devolución por cancelación de ${venta.codigo}`,
          });
        } catch (err) {
          console.warn(
            `[ventas.repo] No se pudo reintegrar stock para producto #${l.producto_id} al cancelar venta #${venta_id}:`,
            err
          );
        }
      }
    }

    // Entregar un encargo saca del inventario lo que se le asignó.
    if (estado === 'ENTREGADA' && venta.tipo === 'ENCARGO') {
      const ids = [
        ...new Set((venta.lineas || []).map((l) => l.producto_id).filter(Boolean)),
      ] as number[];
      const productos = await leerVarios<ProductoDoc>('productos', ids);

      for (const l of venta.lineas || []) {
        if (!l.producto_id) continue;
        const prod = productos.get(String(l.producto_id));
        const disponibles = (prod?.variantes || [])
          .filter((v) => v.activo !== false)
          .reduce((s, v) => s + (v.existencias || 0), 0);
        if (disponibles <= 0) continue;

        await ProductosRepoFirestore.salida({
          producto_id: l.producto_id,
          variante_id: l.variante_id,
          cantidad: l.cantidad,
          referencia_tipo: 'VENTA',
          referencia_id: venta_id,
          detalle: `Entrega del encargo ${venta.codigo}`,
          permitirNegativo: true,
        });
      }
    }

    await aplicarLote([
      {
        coleccion: 'ventas',
        id: venta_id,
        datos: { estado, actualizado_en: new Date().toISOString() },
        merge: true,
      },
    ]);

    await ClientesRepoFirestore.refrescarTotales(venta.cliente_id);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'ventas',
      entidad_id: venta_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior,
      detalle: `${venta.codigo}: ${String(venta.estado).toLowerCase()} a ${estado.toLowerCase()}`,
    });
  }

  /**
   * Recalcula pagado y saldo desde los pagos activos, nunca por incrementos.
   * Devuelve la operación de lote para agruparla con el resto de la escritura.
   */
  static async operacionRecalcularSaldo(
    venta_id: number,
    pagosYaLeidos?: Pago[]
  ): Promise<{ operacion: OperacionLote; pagado: number; saldo: number } | null> {
    const db = getFirestoreDb();
    const venta = await leerDoc<VentaDoc>('ventas', venta_id);
    if (!venta) return null;

    const pagos =
      pagosYaLeidos ??
      (
        await getDocs(
          query(
            collection(db, 'pagos'),
            where('venta_id', '==', venta_id),
            where('activo', '==', true)
          )
        )
      ).docs.map((d) => d.data() as Pago);

    const pagado = pagos.reduce((sum, p) => sum + (p.monto_usd_cents || 0), 0);
    const saldo = (venta.total_usd_cents || 0) - pagado;

    return {
      pagado,
      saldo,
      operacion: {
        coleccion: 'ventas',
        id: venta_id,
        merge: true,
        datos: {
          pagado_usd_cents: pagado,
          saldo_usd_cents: saldo,
          actualizado_en: new Date().toISOString(),
        },
      },
    };
  }

  static async recalcularSaldo(venta_id: number): Promise<void> {
    const r = await this.operacionRecalcularSaldo(venta_id);
    if (r) await aplicarLote([r.operacion]);
  }

  static async ventasDeCliente(cliente_id: number): Promise<Venta[]> {
    return this.listar({ cliente_id });
  }
}
