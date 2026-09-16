import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  doc,
  runTransaction,
  type QueryConstraint,
} from 'firebase/firestore';
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
import { PagosRepoFirestore } from './pagos.repo';
import { ResumenesRepoFirestore } from './resumenes.repo';
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
import { hoyISO, sumarDiasAFecha } from '../../../core/fechas';

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
  /**
   * Ventana de fechas. Se respeta siempre; cuando se puede, se resuelve EN EL
   * SERVIDOR, que es lo que evita pagar toda la historia del negocio.
   *
   * Una pantalla que necesita el historial completo de algo —las ventas de
   * una clienta, los encargos pendientes— simplemente no lo manda. Acotar por
   * fecha ahi escondería una deuda vieja o un encargo sin entregar.
   */
  desde?: string;
  hasta?: string;
  /** Tope de documentos. Sin tope, el costo crece con los años. */
  limite?: number;
  /**
   * Dónde seguir: la última venta de la página anterior.
   *
   * Es un cursor de verdad, no un `skip`. Firestore cobra por documento
   * leído, así que saltarse las primeras doscientas para traer las siguientes
   * cincuenta costaría doscientas cincuenta lecturas. Con el cursor, la
   * página cinco cuesta lo mismo que la primera.
   *
   * Lleva fecha e id porque el orden es por los dos: varias ventas del mismo
   * día necesitan el id para no repetirse ni saltearse en el corte.
   */
  despuesDe?: { fecha: string; id: number };
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

    // Dos formas de acotar, y se elige una sola.
    //
    // Firestore cobra por documento leido, asi que lo que importa no es cuanto
    // se muestra sino cuanto se TRAE. Sin acotar, abrir la pantalla de ventas
    // lee la historia entera del negocio, y esa cuenta crece todos los meses
    // para siempre.
    //
    //   · Por fecha: `desde` + orden descendente + tope. Es la ventana normal
    //     de una pantalla de listado, y su costo no depende de la antiguedad
    //     del negocio sino del tamanio de la ventana.
    //   · Por igualdad: cliente, tipo o estado. Sirve para conjuntos que ya
    //     son chicos por naturaleza (las ventas de una clienta, los encargos
    //     pendientes) y donde recortar por fecha SI perderia datos que
    //     importan: un encargo pendiente de hace tres meses sigue pendiente.
    //
    // No se combinan las dos porque cada mezcla de igualdad + rango exige su
    // propio indice compuesto, y multiplicar indices se paga en cada
    // escritura. Con la ventana activa, tipo y estado se afinan en memoria
    // sobre lo que ya vino, que no cuesta nada.
    const clausulas: QueryConstraint[] = [where('activo', '==', true)];

    // Se recorre por fecha cuando hay ventana, tope o cursor: son las tres
    // formas de decir "traeme una parte". Las ventas de una clienta nunca
    // van por aca, porque ahi se quiere la historia completa.
    const porFecha =
      !filtros.cliente_id &&
      (Boolean(filtros.desde) || Boolean(filtros.limite) || Boolean(filtros.despuesDe));

    if (porFecha) {
      // `tipo` va al servidor, no a la memoria. Antes la pantalla de ventas
      // traia tambien los encargos del periodo para descartarlos despues:
      // pagaba documentos que nunca iba a mostrar.
      if (filtros.tipo) clausulas.push(where('tipo', '==', filtros.tipo));
      if (filtros.desde) clausulas.push(where('fecha', '>=', filtros.desde));
      // Se ordena por fecha Y por id, que es la forma EXACTA de los indices
      // `ventas: activo, fecha desc, id desc` y `activo, tipo, fecha desc,
      // id desc`. Ordenar solo por fecha obliga a Firestore a encajar la
      // consulta en un indice de otra forma, y cuando no encaja no devuelve
      // datos parciales: rechaza la consulta entera y la pantalla queda
      // vacia. El id ademas desempata las ventas del mismo dia.
      clausulas.push(orderBy('fecha', 'desc'));
      clausulas.push(orderBy('id', 'desc'));
      if (filtros.despuesDe) {
        clausulas.push(startAfter(filtros.despuesDe.fecha, filtros.despuesDe.id));
      }
      if (filtros.limite) clausulas.push(limit(filtros.limite));
    } else {
      if (filtros.tipo) clausulas.push(where('tipo', '==', filtros.tipo));
      if (filtros.estado) clausulas.push(where('estado', '==', filtros.estado));
      if (filtros.cliente_id) clausulas.push(where('cliente_id', '==', filtros.cliente_id));
    }

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

    // El estado sí se afina acá: meterlo al índice obligaría a declarar una
    // combinación más por cada filtro de la pantalla, y cada índice se paga
    // en todas las escrituras. Sobre documentos que ya se trajeron, filtrar
    // no cuesta nada.
    if (porFecha && filtros.estado) {
      ventas = ventas.filter((v) => v.estado === filtros.estado);
    }

    if (filtros.soloConSaldo) {
      ventas = ventas.filter((v) => (v.saldo_usd_cents || 0) > 0 && v.estado !== 'CANCELADA');
    }

    // `desde` se respeta SIEMPRE, se haya resuelto en el servidor o no. Que
    // un filtro signifique cosas distintas segun el camino es justo el tipo
    // de sorpresa que hace perder datos sin que nadie lo note; quien no
    // quiere ventana, no la manda.
    if (!porFecha && filtros.desde) {
      ventas = ventas.filter((v) => v.fecha >= filtros.desde!);
    }
    if (filtros.hasta) ventas = ventas.filter((v) => v.fecha <= filtros.hasta!);

    return ventas.sort((a, b) => {
      const cmp = (b.fecha || '').localeCompare(a.fecha || '');
      return cmp !== 0 ? cmp : b.id - a.id;
    });
  }

  /**
   * Las ultimas ventas, ordenadas y limitadas EN EL SERVIDOR.
   *
   * `listar` trae la coleccion entera y filtra despues, que para un historial
   * significa pagar la lectura de todas las ventas de la historia del negocio
   * cada vez que alguien mira lo de hoy. Firestore cobra por documento leido.
   */
  static async recientes(limite = 40): Promise<Venta[]> {
    const db = getFirestoreDb();
    const snap = await getDocs(
      query(
        collection(db, 'ventas'),
        where('activo', '==', true),
        orderBy('fecha', 'desc'),
        orderBy('id', 'desc'),
        limit(limite)
      )
    );
    const ventas = snap.docs.map((d) => {
      const { lineas: _l, cuotas: _c, ...v } = d.data() as VentaDoc;
      return v as unknown as Venta;
    });

    // Los nombres de clienta se piden en un solo viaje, no uno por venta.
    const ids = [...new Set(ventas.map((v) => v.cliente_id).filter(Boolean))] as number[];
    if (ids.length === 0) return ventas;
    const clientes = await leerVarios<{ nombre: string }>('clientes', ids);
    return ventas.map((v) => ({
      ...v,
      cliente_nombre: v.cliente_id ? clientes.get(String(v.cliente_id))?.nombre : undefined,
    }));
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

    const hoy = hoyISO();
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
        descuentoUsdCents = Math.round(input.descuento_valor * 100);
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
        // Una venta que sacó mercadería no se deshace borrando el documento:
        // las unidades no volverían solas. Se anula, que sí las devuelve.
        reversible: salidasRealizadas.length === 0,
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

    const inicio = plan.primera_fecha ?? fecha_venta;
    const cuotas: Cuota[] = [];

    for (let i = 0; i < cantidad; i++) {
      cuotas.push({
        id: i + 1,
        venta_id,
        numero: i + 1,
        fecha_vencimiento: sumarDiasAFecha(inicio, cadaDias * i),
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
  ): Promise<{ reversible: boolean }> {
    const db = getFirestoreDb();
    const ventaRef = doc(db, 'ventas', String(venta_id));
    const ahora = new Date().toISOString();

    // El cambio de estado se RESERVA de forma atómica antes de mover nada.
    //
    // Antes esto leía la venta, comprobaba el estado, devolvía la mercadería
    // al inventario y recién al final escribía el estado nuevo. Dos
    // anulaciones simultáneas de la misma venta —doble clic, o Windows y el
    // celular a la vez— pasaban las dos el control y la mercadería volvía dos
    // veces: la bodega quedaba inflada sin que nada lo indicara.
    //
    // Al escribir el estado dentro de la transacción, la segunda llamada lo
    // encuentra ya cambiado y sale por la misma puerta que un intento
    // repetido: sin hacer nada.
    const venta = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ventaRef);
      if (!snap.exists()) throw new Error(`La venta #${venta_id} no existe.`);

      const data = snap.data() as VentaDoc;
      if (data.estado === estado) return null;

      tx.set(ventaRef, { estado, actualizado_en: ahora }, { merge: true });
      return data;
    });

    if (!venta) return { reversible: false };

    const anterior = { ...venta } as unknown as Record<string, unknown>;

    // Se enciende si la operación toca existencias: define si "Deshacer"
    // puede revertirla o no.
    let movioMercaderia = false;

    // Cancelar una venta tiene que anular tambien sus abonos. Sin esto la
    // plata seguia contada como cobrada para una venta que ya no existe: el
    // saldo de la clienta quedaba mal y los reportes sumaban ingresos de algo
    // cancelado. Se anulan ANTES de cambiar el estado para que el saldo de la
    // venta quede consistente, y con el MISMO grupo de eventos, asi deshacer
    // la cancelacion devuelve tambien los pagos.
    if (estado === 'CANCELADA') {
      const pagosSnap = await getDocs(
        query(
          collection(db, 'pagos'),
          where('venta_id', '==', venta_id),
          where('activo', '==', true)
        )
      );
      for (const d of pagosSnap.docs) {
        const pagoId = Number((d.data() as { id: number }).id);
        try {
          await PagosRepoFirestore.anular(pagoId, evento_grupo_id);
        } catch (err) {
          console.warn(
            `[ventas.repo] No se pudo anular el pago #${pagoId} al cancelar la venta #${venta_id}:`,
            err
          );
        }
      }
    }

    // Cancelar devuelve la mercadería, pero sólo la que de verdad salió.
    //
    // Una venta de inventario descuenta al crearse: siempre hay que
    // devolverla. Un encargo NO descuenta al crearse, descuenta al
    // ENTREGARSE; así que se devuelve únicamente si ya estaba entregado.
    // Antes la condición era sólo `tipo === 'INVENTARIO'` y cada encargo
    // entregado que después se anulaba se comía su mercadería para siempre.
    const salioDelInventario =
      venta.tipo === 'INVENTARIO' ||
      (venta.tipo === 'ENCARGO' && venta.estado === 'ENTREGADA');

    if (estado === 'CANCELADA' && salioDelInventario) {
      for (const l of venta.lineas || []) {
        if (!l.producto_id) continue;
        movioMercaderia = true;
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
        movioMercaderia = true;

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

    // El estado ya quedó escrito en la transacción de arriba.
    await ClientesRepoFirestore.refrescarTotales(venta.cliente_id);

    // Entregar o anular cambia la ganancia del mes de esa venta. Si es un mes
    // ya cerrado, su resumen guardado dejó de ser cierto.
    await ResumenesRepoFirestore.invalidarPorFecha(venta.fecha);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'ventas',
      entidad_id: venta_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior,
      // Si este cambio de estado movió mercadería, restaurar la instantánea
      // no alcanza para revertirlo: la venta volvería a estar viva y sus
      // unidades se quedarían en la bodega, contadas dos veces.
      reversible: !movioMercaderia,
      detalle: `${venta.codigo}: ${String(venta.estado).toLowerCase()} a ${estado.toLowerCase()}`,
    });

    return { reversible: !movioMercaderia };
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
