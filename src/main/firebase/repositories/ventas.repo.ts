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
  type Transaction,
  type DocumentReference,
} from 'firebase/firestore';
import {
  getFirestoreDb,
  siguienteId,
  leerDoc,
  leerVarios,
  aplicarLote,
  sinUndefined,
  autorActual,
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
  OpcionesAnulacion,
} from '../../../shared/types';

export type { OpcionesAnulacion };

export interface LineaVentaInput {
  producto_id?: number;
  variante_id?: number;
  descripcion?: string;
  cantidad: number;
  precio_unitario_usd_cents?: number;
  es_paquete?: boolean;
  costo_estimado_unitario_usd_cents?: number;
  /** Encargos: con qué se cotizó la pieza. */
  precio_tienda_usd_cents?: number;
  peso_mlb?: number;
}

import type { PagoInicialInput, LineaCotizacion, CorregirVentaInput } from '../../../shared/ipc-contracts';
import { hoyISO, sumarDiasAFecha } from '../../../core/fechas';
import { esDeuda, estadoInicialEncargo } from '../../../core/cobranza';
import {
  piezasDe,
  estadoPieza,
  sinPrecio,
  quePidio,
  descartable,
  recalcularEncargo,
} from '../../../core/encargos';
import { formatearMoneda } from '../../../core/moneda';
import { codigoDeVenta } from '../../../core/codigos';
import { repartirMayorResiduo } from '../../../core/prorrateo';
import { lotesDe, escrituraDeLotes } from './productos.repo';
import {
  unidadesDeLotes,
  sacarFIFO,
  devolverConsumos,
  crearLote,
  ordenFIFO,
  type Consumo,
  type Lote,
} from '../../../core/lotes';
import { reescalarCuotas, repartirEnCuotas } from '../../../core/cuotas';
import {
  abonoQueSigueAlTotal,
  monedaDeLosAbonos,
  textoLoPagado,
  textoPagado,
  textoTotalEn,
} from '../../../core/abonos';

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

/**
 * Lo que impide mandar o aceptar una cotización: una pieza sin precio, o que
 * no se haya conseguido nada. `null` si está lista.
 */
function faltaCotizar(venta: VentaDoc): string | null {
  const lineas = venta.lineas || [];
  const falta = lineas.find((l) => sinPrecio(l));
  if (falta) return `Falta cotizar '${falta.descripcion}': ponele precio o marcala "No se consiguió".`;
  if (lineas.every((l) => l.descartada_el)) return 'No se consiguió nada: no hay cotización que mandar.';
  return null;
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

    // Solo las clientas que aparecen en ESTA pagina, no el directorio entero.
    //
    // Antes esto leia todas las clientas activas para ponerle nombre a las
    // ventas que se estaban mostrando. Con cincuenta ventas en pantalla y
    // quinientas clientas en el directorio, abrir la pantalla costaba
    // quinientas cincuenta lecturas, y quinientas de esas crecian con el
    // directorio para siempre. Era la ultima lectura sin techo que quedaba en
    // el camino de todos los dias.
    //
    // Pidiendo solo las referenciadas, el costo queda atado al tamanio de la
    // pagina —como mucho una clienta por venta— y deja de crecer.
    let cliMap = cacheClientes;
    if (!cliMap) {
      const ids = [
        ...new Set(
          snap.docs
            .map((d) => (d.data() as VentaDoc).cliente_id)
            .filter((id): id is number => Boolean(id))
        ),
      ];
      const docs = await leerVarios<{ nombre?: string }>('clientes', ids);
      cliMap = new Map(
        [...docs.entries()].map(([id, c]) => [Number(id), c.nombre ?? ''])
      );
    }

    let ventas: Venta[] = snap.docs.map((d) => {
      const data = d.data() as VentaDoc;
      const { lineas: _l, cuotas: _c, ...v } = data;
      return {
        ...v,
        cliente_nombre: v.cliente_id ? cliMap!.get(v.cliente_id) : undefined,
        // Un encargo se reconoce por lo que pidió: la lista lo muestra.
        que_pidio: v.tipo === 'ENCARGO' ? quePidio(data.lineas || []) : undefined,
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
      // Lo que se debe de verdad: un encargo cotizado todavía no es deuda.
      ventas = ventas.filter((v) => esDeuda(v));
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

    const codigo = codigoDeVenta(ventaId, esEncargo ? 'ENCARGO' : 'INVENTARIO');
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
      consumos: Consumo[];
    }> = [];

    // Los precios y el descuento se calculan ANTES de sacar mercadería: lo que
    // se cobra por cada línea, ya con su parte del descuento, queda anotado en
    // los lotes de los que sale. Es lo que después dice cuánto dejó un paquete.
    const precios = input.lineas.map((linea) => {
      const cantidad = Math.max(1, Math.round(linea.cantidad));
      const prod = linea.producto_id ? productos.get(String(linea.producto_id)) : undefined;
      const precioUnitario = linea.precio_unitario_usd_cents ?? prod?.precio_venta_usd_cents ?? 0;
      return { cantidad, prod, precioUnitario, subtotal: precioUnitario * cantidad };
    });
    const subtotalVenta = precios.reduce((s, p) => s + p.subtotal, 0);
    let descuentoUsdCents = 0;
    if (input.descuento_tipo === 'PORCENTAJE' && input.descuento_valor && input.descuento_valor > 0) {
      descuentoUsdCents = Math.round((subtotalVenta * input.descuento_valor) / 100);
    } else if (input.descuento_tipo === 'MONTO_FIJO' && input.descuento_valor && input.descuento_valor > 0) {
      descuentoUsdCents = Math.round(input.descuento_valor * 100);
    }
    descuentoUsdCents = Math.min(subtotalVenta, Math.max(0, descuentoUsdCents));
    const descuentoPorLinea = repartirMayorResiduo(
      descuentoUsdCents,
      precios.map((p, i) => ({ id: i, base_valor: p.subtotal }))
    );

    // Un pedido: piezas anotadas sin precio, porque ella todavía no sabe
    // cuánto valen. Nace cotizado y sin pago; se cotiza después.
    const piezasSinPrecio = esEncargo ? precios.filter((p) => p.precioUnitario <= 0).length : 0;
    if (piezasSinPrecio > 0 && input.pago_inicial && (input.pago_inicial.monto_cents ?? 1) > 0) {
      throw new Error('Un pedido sin precio todavía no lleva pago: cotizalo primero.');
    }

    try {
      for (let i = 0; i < input.lineas.length; i++) {
        const linea = input.lineas[i];
        const { cantidad, prod, precioUnitario, subtotal } = precios[i];

        const descripcion = linea.descripcion?.trim() || prod?.nombre || '';
        let costoUnitario = linea.costo_estimado_unitario_usd_cents ?? 0;
        let costoLinea = costoUnitario * cantidad;
        let consumos: Consumo[] | undefined;

        if (prod && !esEncargo) {
          const salida = await ProductosRepoFirestore.salida({
            producto_id: linea.producto_id!,
            variante_id: linea.variante_id,
            cantidad,
            referencia_tipo: 'VENTA',
            referencia_id: ventaId,
            detalle: `Venta ${codigo}`,
            ingreso_usd_cents: subtotal - (descuentoPorLinea.get(i) ?? 0),
          });
          salidasRealizadas.push({
            producto_id: linea.producto_id!,
            variante_id: linea.variante_id,
            cantidad,
            costo_salida_usd_cents: salida.costo_salida_usd_cents,
            consumos: salida.consumos,
          });
          costoLinea = salida.costo_salida_usd_cents;
          costoUnitario = Math.round(costoLinea / cantidad);
          consumos = salida.consumos;
        }

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
          lotes_consumidos: consumos,
          // Con qué se cotizó la pieza de un encargo.
          precio_tienda_usd_cents: esEncargo ? linea.precio_tienda_usd_cents : undefined,
          peso_mlb: esEncargo ? linea.peso_mlb : undefined,
        });
      }

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
            registrado_por: autorActual(),
          };
        }
      }

      const saldoUsdCents = Math.max(0, total - pagadoUsdCents);
      const anticipoEsperado = Math.round((total * anticipoBp) / 10000);

      // Un encargo nace confirmado si el anticipo quedó cubierto, con la
      // misma regla que usan los abonos: quien paga, aceptó. Antes se miraba
      // "saldo en cero": uno creado con el anticipo completo quedaba cotizado
      // y no aparecía en "Encargos por comprar".
      const estadoEncargo = esEncargo
        ? estadoInicialEncargo({
            total_usd_cents: total,
            pagado_usd_cents: pagadoUsdCents,
            anticipo_esperado_usd_cents: anticipoEsperado,
            sin_precio: piezasSinPrecio,
          })
        : undefined;

      const nuevaVenta: VentaDoc = {
        id: ventaId,
        codigo,
        cliente_id: input.cliente_id,
        fecha: input.fecha,
        tipo: input.tipo,
        estado: estadoEncargo ?? (input.entregar_ahora === false ? 'PENDIENTE' : 'ENTREGADA'),
        // Con todo el precio, el encargo nace cotizado; pagado, nace aceptado.
        // Las dos fechas son la del encargo: desde ahí cuentan los avisos.
        cotizado_el: esEncargo && piezasSinPrecio === 0 ? input.fecha : undefined,
        aceptado_el: estadoEncargo === 'PENDIENTE' ? input.fecha : undefined,
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
        anticipo_esperado_usd_cents: anticipoEsperado,
        anticipo_bp: esEncargo ? anticipoBp : undefined,
        piezas: esEncargo ? piezasDe(lineasGuardadas) : undefined,
        notas: input.notas?.trim() || undefined,
        lineas: lineasGuardadas.map((l) => sinUndefined(l as unknown as Record<string, unknown>)) as unknown as VentaLinea[],
        cuotas:
          input.plan_cuotas && input.plan_cuotas.cantidad > 1
            ? this.generarPlanCuotas(ventaId, saldoUsdCents > 0 ? saldoUsdCents : total, input.plan_cuotas, input.fecha)
            : [],
        activo: true,
        creado_en: new Date().toISOString(),
        registrado_por: autorActual(),
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
              consumos: s.consumos,
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

  /**
   * Corrige lo que se cargó en una venta de inventario: la clienta, la fecha,
   * las líneas, el descuento y las notas. Conserva su número: es la misma
   * venta, bien cargada. `input` es la venta entera como tiene que quedar.
   *
   * Todo en una transacción. Las unidades de la versión vieja vuelven a sus
   * lotes y las de la nueva salen del lote más viejo, con el mismo reparto del
   * descuento que al crearla: o se corrige entera, o no cambia nada. Una línea
   * que no se tocó vuelve y sale del mismo lote, así que el resultado es el de
   * haberla cargado bien desde el principio, costo incluido.
   *
   * Antes no había forma: para arreglar V-0007 se borró desde la consola de
   * Firebase, y sus productos quedaron vendidos sin venta que lo explicara.
   *
   * Los abonos no se tocan (cada uno se corrige con `PagosRepo.corregir`); si
   * lo pagado queda por encima del total nuevo, se rechaza. No se deshace: movió
   * mercadería. Se vuelve a corregir.
   */
  static async corregir(venta_id: number, input: CorregirVentaInput, evento_grupo_id: string): Promise<void> {
    if (input.lineas.length === 0) throw new Error('Una venta necesita al menos un producto.');
    if (input.lineas.some((l) => !l.producto_id && !l.descripcion?.trim())) {
      throw new Error('Cada línea de la venta necesita un producto o una descripción.');
    }

    const db = getFirestoreDb();
    const ventaRef = doc(db, 'ventas', String(venta_id));
    const ahora = new Date().toISOString();

    // Los abonos se leen dentro de la transacción: guardan la clienta (si
    // cambia, cambia en ellos), dicen en qué moneda pagó, y el de una venta al
    // contado sigue al total. La consulta va antes porque una transacción sólo
    // lee documentos sueltos.
    const pagosSnap = await getDocs(query(collection(db, 'pagos'), where('venta_id', '==', venta_id)));
    const pagoIds = pagosSnap.docs.map((d) => Number((d.data() as Pago).id));
    const autor = autorActual();

    type Tocado = {
      p: ProductoDoc;
      variantes: ProductoDoc['variantes'];
      lotes: Lote[];
      variante?: number;
      devueltas: number;
      costoDevuelto: number;
      sacadas: number;
      costoSacado: number;
    };

    const { antes, tocados, ajuste } = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ventaRef);
      if (!snap.exists()) throw new Error(`La venta #${venta_id} no existe.`);
      const venta = snap.data() as VentaDoc;
      if (!venta.activo) throw new Error(`La venta #${venta_id} no existe.`);
      if (venta.tipo === 'ENCARGO') {
        throw new Error(`${venta.codigo} es un encargo: se corrige desde Encargos (cotizar, "No se consiguió" o anular).`);
      }
      if (venta.estado === 'CANCELADA') throw new Error(`${venta.codigo} está anulada: no se corrige.`);

      const viejas = venta.lineas || [];
      const ids = [
        ...new Set([...viejas, ...input.lineas].map((l) => l.producto_id).filter(Boolean)),
      ] as number[];
      const cambiaClienta = (venta.cliente_id ?? null) !== (input.cliente_id ?? null);
      const pagoRefs = pagoIds.map((id) => doc(db, 'pagos', String(id)));
      const [snapsProductos, snapsPagos] = await Promise.all([
        Promise.all(ids.map((id) => tx.get(doc(db, 'productos', String(id))))),
        Promise.all(pagoRefs.map((ref) => tx.get(ref))),
      ]);

      const tocados = new Map<number, Tocado>();
      snapsProductos.forEach((s, i) => {
        if (!s.exists()) return;
        const p = s.data() as ProductoDoc;
        tocados.set(ids[i], {
          p,
          variantes: [...(p.variantes || [])],
          lotes: lotesDe(p),
          devueltas: 0,
          costoDevuelto: 0,
          sacadas: 0,
          costoSacado: 0,
        });
      });

      // 1. Lo de antes vuelve a sus lotes, como al anularla.
      for (const l of viejas) {
        if (!l.producto_id) continue;
        const t = tocados.get(l.producto_id);
        if (!t) throw new Error(`El producto de '${l.descripcion}' ya no existe: esta venta no se puede corregir.`);
        const consumos = l.lotes_consumidos ?? [];
        const variante =
          consumos[0]?.variante_id ?? l.variante_id ?? t.variantes.find((v) => v.activo !== false)?.id ?? 1;
        const idx = t.variantes.findIndex((v) => v.id === variante);
        if (idx === -1) {
          t.variantes.push({ id: variante, producto_id: l.producto_id, existencias: 0, activo: true });
        } else if (t.variantes[idx].activo === false) {
          t.variantes[idx] = { ...t.variantes[idx], activo: true, existencias: 0 };
        }
        if (consumos.length > 0) {
          t.lotes = devolverConsumos(t.lotes, consumos, 'VENTA');
          t.devueltas += consumos.reduce((s, c) => s + c.cantidad, 0);
          t.costoDevuelto += consumos.reduce((s, c) => s + c.costo_usd_cents, 0);
        } else {
          // Una venta de antes de los lotes no sabe de cuál salió: vuelve como
          // devolución, con el costo que congeló.
          t.lotes = [
            ...t.lotes,
            crearLote({
              id: `dev-v${venta_id}-l${l.id}`,
              variante_id: variante,
              cantidad: l.cantidad,
              valor_usd_cents: l.costo_total_usd_cents,
              fecha: venta.fecha,
              orden: Date.now(),
              origen: 'DEVOLUCION',
              costo_unitario_usd_cents: l.costo_unitario_usd_cents,
            }),
          ].sort(ordenFIFO);
          t.devueltas += l.cantidad;
          t.costoDevuelto += l.costo_total_usd_cents;
        }
        t.variante ??= variante;
      }

      // 2. Lo nuevo: precios y descuento con la misma cuenta que al crearla.
      const precios = input.lineas.map((linea) => {
        const cantidad = Math.max(1, Math.round(linea.cantidad));
        const t = linea.producto_id ? tocados.get(linea.producto_id) : undefined;
        if (linea.producto_id && !t) throw new Error(`El producto #${linea.producto_id} no existe.`);
        const precioUnitario = Math.max(
          0,
          Math.round(linea.precio_unitario_usd_cents ?? t?.p.precio_venta_usd_cents ?? 0)
        );
        const variante = t
          ? (linea.variante_id ?? t.variantes.find((v) => v.activo !== false)?.id ?? 1)
          : undefined;
        return { cantidad, t, variante, precioUnitario, subtotal: precioUnitario * cantidad };
      });
      const subtotalVenta = precios.reduce((s, p) => s + p.subtotal, 0);
      let descuento = 0;
      if (input.descuento_tipo === 'PORCENTAJE' && input.descuento_valor && input.descuento_valor > 0) {
        descuento = Math.round((subtotalVenta * input.descuento_valor) / 100);
      } else if (input.descuento_tipo === 'MONTO_FIJO' && input.descuento_valor && input.descuento_valor > 0) {
        descuento = Math.round(input.descuento_valor * 100);
      }
      descuento = Math.min(subtotalVenta, Math.max(0, descuento));
      const descuentoPorLinea = repartirMayorResiduo(
        descuento,
        precios.map((p, i) => ({ id: i, base_valor: p.subtotal }))
      );
      const total = Math.max(0, subtotalVenta - descuento);

      const pagos = snapsPagos.filter((s) => s.exists()).map((s) => s.data() as Pago);
      const activos = pagos.filter((p) => p.activo !== false);
      // Al contado, pagada entera con un solo abono: el abono sigue al total.
      const ajuste = input.ajustar_abono ? abonoQueSigueAlTotal(venta, activos, total) : null;
      const pagado =
        (venta.pagado_usd_cents || 0) - (ajuste ? ajuste.pago.monto_usd_cents : 0) + (ajuste ? ajuste.monto_usd_cents : 0);
      if (pagado > total) {
        // En la moneda en que pagó: si fue en córdobas, "Pagó C$732.40".
        const moneda = monedaDeLosAbonos(activos);
        throw new Error(
          `Pagó ${textoLoPagado(activos)} y el nuevo total es ${textoTotalEn(moneda, total, venta.tasa_cambio_cents || 3662)}. Corregí el abono primero.`
        );
      }

      // 3. El stock se revisa entero antes de sacar, contando lo que volvió.
      const porProducto = new Map<number, number>();
      const porTalla = new Map<string, { t: Tocado; variante: number; pedidas: number }>();
      for (const { cantidad, t, variante } of precios) {
        if (!t || variante === undefined) continue;
        porProducto.set(t.p.id, (porProducto.get(t.p.id) ?? 0) + cantidad);
        const clave = `${t.p.id}:${variante}`;
        const antes = porTalla.get(clave);
        porTalla.set(clave, { t, variante, pedidas: (antes?.pedidas ?? 0) + cantidad });
      }
      for (const [id, pedidas] of porProducto) {
        const t = tocados.get(id)!;
        const disponibles = t.variantes
          .filter((v) => v.activo !== false)
          .reduce((s, v) => s + unidadesDeLotes(t.lotes, v.id), 0);
        if (pedidas > disponibles) {
          throw new Error(
            `No hay suficientes unidades de '${t.p.nombre}'. Disponibles: ${disponibles}${
              t.devueltas > 0 ? ' (contando las de esta venta)' : ''
            }, pedidas: ${pedidas}.`
          );
        }
      }
      for (const { t, variante, pedidas } of porTalla.values()) {
        if (!t.variantes.some((v) => v.id === variante && v.activo !== false)) {
          throw new Error(`La talla elegida de '${t.p.nombre}' ya no existe.`);
        }
        const disponibles = unidadesDeLotes(t.lotes, variante);
        if (pedidas > disponibles) {
          throw new Error(
            `No hay suficientes de la talla elegida en '${t.p.nombre}'. Disponibles: ${disponibles}, pedidas: ${pedidas}.`
          );
        }
      }

      // 4. Sale del lote más viejo, con lo cobrado ya descontado.
      const lineas: VentaLinea[] = input.lineas.map((linea, i) => {
        const { cantidad, t, variante, precioUnitario, subtotal } = precios[i];
        let costoUnitario = Math.max(0, Math.round(linea.costo_estimado_unitario_usd_cents ?? 0));
        let costoLinea = costoUnitario * cantidad;
        let consumos: Consumo[] | undefined;
        if (t && variante !== undefined) {
          const s = sacarFIFO(t.lotes, variante, cantidad, 'VENTA', subtotal - (descuentoPorLinea.get(i) ?? 0));
          t.lotes = s.lotes;
          t.sacadas += s.retiradas;
          t.costoSacado += s.costo_usd_cents;
          t.variante ??= variante;
          costoLinea = s.costo_usd_cents;
          costoUnitario = Math.round(costoLinea / cantidad);
          consumos = s.consumos;
        }
        return {
          id: i + 1,
          venta_id,
          producto_id: linea.producto_id,
          variante_id: linea.variante_id,
          descripcion: linea.descripcion?.trim() || t?.p.nombre || '',
          cantidad,
          precio_unitario_usd_cents: precioUnitario,
          costo_unitario_usd_cents: costoUnitario,
          subtotal_usd_cents: subtotal,
          costo_total_usd_cents: costoLinea,
          es_paquete: Boolean(linea.es_paquete),
          orden: i,
          lotes_consumidos: consumos,
        };
      });
      const costoTotal = lineas.reduce((s, l) => s + l.costo_total_usd_cents, 0);

      // Las cuotas conservan sus fechas. Lo financiado cambia lo mismo que el
      // total: lo que pagó al contado sigue siendo lo mismo.
      const cuotasViejas = venta.cuotas || [];
      const financiado =
        cuotasViejas.reduce((s, c) => s + c.monto_usd_cents, 0) + (total - (venta.total_usd_cents || 0));
      const cuotas = cuotasViejas.length > 0 ? repartirEnCuotas(reescalarCuotas(cuotasViejas, financiado), pagado) : [];

      const { cliente_id: _clienta, ...resto } = venta;
      const corregida: VentaDoc & { actualizado_en: string } = {
        ...resto,
        ...(input.cliente_id ? { cliente_id: input.cliente_id } : {}),
        fecha: input.fecha,
        subtotal_usd_cents: subtotalVenta,
        descuento_usd_cents: descuento,
        descuento_tipo: input.descuento_tipo,
        descuento_valor: input.descuento_valor,
        descuento_motivo: input.descuento_motivo?.trim() || undefined,
        total_usd_cents: total,
        costo_total_usd_cents: costoTotal,
        ganancia_usd_cents: total - costoTotal,
        pagado_usd_cents: pagado,
        saldo_usd_cents: total - pagado,
        notas: input.notas?.trim() || undefined,
        lineas,
        cuotas,
        corregido_por: autor,
        corregido_en: ahora,
        actualizado_en: ahora,
      };
      // Sin merge: la venta queda exactamente como se corrigió, sin la clienta
      // o el descuento que se sacaron.
      tx.set(ventaRef, sinUndefined(corregida as unknown as Record<string, unknown>));

      for (const [id, t] of tocados) {
        tx.set(
          doc(db, 'productos', String(id)),
          sinUndefined({ ...escrituraDeLotes({ ...t.p, variantes: t.variantes }, t.lotes), actualizado_en: ahora }),
          { merge: true }
        );
      }

      snapsPagos.forEach((s, i) => {
        if (!s.exists()) return;
        const { cliente_id: _c, ...pago } = s.data() as Pago;
        const esElAjustado = ajuste !== null && pago.id === ajuste.pago.id;
        if (!cambiaClienta && !esElAjustado) return;
        tx.set(
          pagoRefs[i],
          sinUndefined({
            ...pago,
            ...(input.cliente_id ? { cliente_id: input.cliente_id } : {}),
            // Misma moneda y misma tasa: sólo cambia cuánto.
            ...(esElAjustado
              ? {
                  monto_usd_cents: ajuste.monto_usd_cents,
                  monto_cor_cents: ajuste.monto_cor_cents,
                  corregido_por: autor,
                  corregido_en: ahora,
                }
              : {}),
            actualizado_en: ahora,
          } as unknown as Record<string, unknown>)
        );
      });

      return { antes: venta, tocados, ajuste };
    });

    // El rastro de la bodega: un movimiento por producto, sólo si cambió
    // cuántas unidades tiene. Cambiar sólo el precio no mueve nada.
    const movimientos: OperacionLote[] = [];
    for (const [id, t] of tocados) {
      const neto = t.devueltas - t.sacadas;
      if (neto === 0) continue;
      const n = Math.abs(neto);
      movimientos.push(
        await ProductosRepoFirestore.operacionMovimiento({
          producto_id: id,
          variante_id: t.variante,
          tipo: neto > 0 ? 'ENTRADA' : 'SALIDA',
          cantidad: n,
          costo_total_usd_cents: Math.abs(t.costoDevuelto - t.costoSacado),
          existencias_despues: unidadesDeLotes(t.lotes),
          referencia_tipo: 'VENTA',
          referencia_id: venta_id,
          detalle: `Corrección de ${antes.codigo}: ${neto > 0 ? 'vuelve' : 'sale'}${n > 1 ? 'n' : ''} ${n}`,
        })
      );
    }
    if (movimientos.length > 0) await aplicarLote(movimientos);

    const clientas = new Set([antes.cliente_id, input.cliente_id].filter(Boolean) as number[]);
    for (const c of clientas) await ClientesRepoFirestore.refrescarTotales(c);
    // La ganancia cambió, quizás en otro mes: los dos resúmenes dejan de ser ciertos.
    for (const f of new Set([antes.fecha, input.fecha])) await ResumenesRepoFirestore.invalidarPorFecha(f);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      // Movió mercadería: restaurar la instantánea dejaría las unidades de la
      // versión corregida fuera de la bodega. Se vuelve a corregir.
      reversible: false,
      entidad_tipo: 'ventas',
      entidad_id: venta_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: antes as unknown as Record<string, unknown>,
      detalle: `${antes.codigo} corregida`,
    });
    if (ajuste) {
      await EventosRepoFirestore.registrarEvento({
        evento_grupo_id,
        reversible: false,
        entidad_tipo: 'pagos',
        entidad_id: ajuste.pago.id,
        tipo_evento: 'ACTUALIZACION',
        valor_anterior: ajuste.pago as unknown as Record<string, unknown>,
        detalle: `Abono de ${antes.codigo}: ${textoPagado(ajuste.pago)} pasa a ${textoPagado({ ...ajuste.pago, ...ajuste })}, con la venta`,
      });
    }
  }

  /**
   * Revisa, ANTES de tocar nada, que el cambio de estado se pueda hacer.
   *
   * Entregar un encargo necesita que sus piezas hayan llegado o que haya en
   * la bodega las que salen de ahí. Anular uno con piezas que ya llegaron
   * necesita saber qué pasa con ellas. Fallar acá deja todo como estaba.
   */
  /**
   * Le pone precio a las piezas de un encargo: cotizar un pedido anotado sin
   * precio, o corregir el de uno cotizado. Una pieza puede quedar "No se
   * consiguió" (`descartada`) o volver a buscarse. Recalcula total, costo
   * estimado, anticipo y saldo con la misma cuenta que al crearlo
   * (`recalcularEncargo`).
   *
   * En uno aceptado sólo se cotizan las piezas que no tenían precio: el que la
   * clienta aceptó no cambia. El costo de una pieza que ya llegó es el real y
   * no se toca.
   *
   * Si cambió algún precio (o una pieza se descartó), la cotización sube de
   * versión: la que tiene la clienta quedó vieja y el encargo vuelve a estar
   * "por mandar".
   */
  static async cotizar(venta_id: number, cambios: readonly LineaCotizacion[], evento_grupo_id: string): Promise<void> {
    const db = getFirestoreDb();
    const ventaRef = doc(db, 'ventas', String(venta_id));
    const params = await ParametrosRepoFirestore.getParametros();
    const porId = new Map(cambios.map((c) => [c.id, c]));
    const hoy = hoyISO();

    const anterior = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ventaRef);
      if (!snap.exists()) throw new Error(`El encargo #${venta_id} no existe.`);
      const venta = snap.data() as VentaDoc;
      if (venta.tipo !== 'ENCARGO') throw new Error('Sólo un encargo se cotiza.');
      if (venta.estado !== 'COTIZADA' && venta.estado !== 'PENDIENTE') {
        throw new Error(`${venta.codigo} ya está ${venta.estado === 'ENTREGADA' ? 'entregado' : 'anulado'}.`);
      }

      let cambioPrecio = false;
      const lineas = (venta.lineas || []).map((l) => {
        const c = porId.get(l.id);
        if (!c) return l;
        const precio = Math.max(0, Math.round(c.precio_unitario_usd_cents || 0));
        if (venta.estado === 'PENDIENTE' && !sinPrecio(l) && precio !== l.precio_unitario_usd_cents) {
          throw new Error(
            `${venta.codigo} ya está confirmado: el precio de '${l.descripcion}' ya lo aceptó la clienta.`
          );
        }
        const yaDescartada = Boolean(l.descartada_el);
        const descartada = c.descartada ?? yaDescartada;
        if (descartada && !yaDescartada && !descartable(l)) {
          throw new Error(`'${l.descripcion}' ya se compró: no se puede marcar como no conseguida.`);
        }
        if (precio !== l.precio_unitario_usd_cents || descartada !== yaDescartada) cambioPrecio = true;

        // Llegó, o salió de la bodega: su costo ya es el real.
        const costoReal = estadoPieza(l) === 'LLEGO' || (l.lotes_consumidos?.length ?? 0) > 0;
        const costoUnitario = costoReal
          ? l.costo_unitario_usd_cents
          : Math.max(0, Math.round(c.costo_estimado_unitario_usd_cents ?? l.costo_unitario_usd_cents ?? 0));
        const { descartada_el: _d, ...resto } = l;
        return {
          ...resto,
          // Una pieza que no se consiguió conserva su precio para mostrarlo,
          // pero no cuenta: subtotal y costo en cero.
          ...(descartada ? { descartada_el: l.descartada_el ?? hoy } : {}),
          descripcion: c.descripcion?.trim() || l.descripcion,
          precio_unitario_usd_cents: precio,
          subtotal_usd_cents: descartada ? 0 : precio * l.cantidad,
          costo_unitario_usd_cents: costoUnitario,
          costo_total_usd_cents: descartada ? 0 : costoReal ? l.costo_total_usd_cents : costoUnitario * l.cantidad,
          precio_tienda_usd_cents: c.precio_tienda_usd_cents ?? l.precio_tienda_usd_cents,
          peso_mlb: c.peso_mlb ?? l.peso_mlb,
        };
      });

      tx.set(ventaRef, this.cambiosDeEncargo(venta, lineas, params.anticipo_defecto_bp ?? 5000, cambioPrecio, hoy), {
        merge: true,
      });
      return venta;
    });

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'ventas',
      entidad_id: venta_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior as unknown as Record<string, unknown>,
      detalle: `${anterior.codigo}: cotizado`,
    });
    await ClientesRepoFirestore.refrescarTotales(anterior.cliente_id);
    await ResumenesRepoFirestore.invalidarPorFecha(anterior.fecha);
  }

  /**
   * "Ya lo compré": las piezas quedan compradas, esperando paquete. Ella no
   * sabe en qué paquete vienen; cuando carga el próximo, se le ofrecen
   * primero. Con `comprado` en falso se desmarcan. Sólo se tocan piezas sin
   * paquete que no salen de la bodega.
   */
  static async marcarCompradas(
    venta_id: number,
    linea_ids: readonly number[],
    comprado: boolean,
    evento_grupo_id: string
  ): Promise<void> {
    const db = getFirestoreDb();
    const ventaRef = doc(db, 'ventas', String(venta_id));
    const ids = new Set(linea_ids);
    const hoy = hoyISO();

    // En una transacción: guardar un paquete también reescribe las piezas.
    const { anterior, tocadas } = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ventaRef);
      if (!snap.exists()) throw new Error(`El encargo #${venta_id} no existe.`);
      const venta = snap.data() as VentaDoc;
      if (venta.tipo !== 'ENCARGO') throw new Error('Sólo las piezas de un encargo se marcan como compradas.');
      if (venta.estado !== 'COTIZADA' && venta.estado !== 'PENDIENTE') {
        throw new Error(`${venta.codigo} ya está ${venta.estado === 'ENTREGADA' ? 'entregado' : 'anulado'}.`);
      }

      let n = 0;
      const lineas = (venta.lineas || []).map((l) => {
        if (!ids.has(l.id)) return l;
        const e = estadoPieza(l);
        if (comprado && e === 'POR_COMPRAR') {
          n++;
          return { ...l, comprado_el: hoy };
        }
        if (!comprado && e === 'COMPRADA') {
          n++;
          const { comprado_el: _c, ...resto } = l;
          return resto;
        }
        return l;
      });
      if (n === 0) {
        throw new Error(
          comprado ? 'No hay piezas por comprar en ese encargo.' : 'No hay piezas compradas esperando paquete.'
        );
      }

      tx.set(
        ventaRef,
        {
          lineas: lineas.map((x) => sinUndefined(x as unknown as Record<string, unknown>)),
          piezas: piezasDe(lineas),
          actualizado_en: new Date().toISOString(),
        },
        { merge: true }
      );
      return { anterior: venta, tocadas: n };
    });

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'ventas',
      entidad_id: venta_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior as unknown as Record<string, unknown>,
      detalle:
        tocadas === 1
          ? `${anterior.codigo}: una pieza ${comprado ? 'ya se compró, espera paquete' : 'vuelve a estar por comprar'}`
          : `${anterior.codigo}: ${tocadas} piezas ${comprado ? 'ya se compraron, esperan paquete' : 'vuelven a estar por comprar'}`,
    });
  }

  /**
   * Lo que se escribe en un encargo cuando cambian sus piezas: la cuenta de
   * `recalcularEncargo`, la versión de la cotización si cambió un precio, y
   * la fecha en que aceptó si un pago que ya tenía ahora cubre el anticipo.
   *
   * Lo pagado no puede quedar por encima del total: esa plata se le debería a
   * la clienta, y eso se resuelve corrigiendo el pago, no escondiéndolo.
   */
  private static cambiosDeEncargo(
    venta: VentaDoc,
    lineas: VentaLinea[],
    anticipoDefectoBp: number,
    cambioPrecio: boolean,
    hoy: string
  ): Record<string, unknown> {
    const r = recalcularEncargo(venta, lineas, anticipoDefectoBp);
    const pagado = venta.pagado_usd_cents || 0;
    if (pagado > r.total_usd_cents) {
      throw new Error(
        `Pagó ${formatearMoneda(pagado, 'USD')} y el nuevo total es ${formatearMoneda(r.total_usd_cents, 'USD')}. ` +
          'Corregí el pago antes de cambiarlo.'
      );
    }
    return {
      lineas: lineas.map((x) => sinUndefined(x as unknown as Record<string, unknown>)),
      subtotal_usd_cents: r.subtotal_usd_cents,
      descuento_usd_cents: r.descuento_usd_cents,
      total_usd_cents: r.total_usd_cents,
      costo_total_usd_cents: r.costo_total_usd_cents,
      ganancia_usd_cents: r.ganancia_usd_cents,
      anticipo_esperado_usd_cents: r.anticipo_esperado_usd_cents,
      anticipo_bp: r.anticipo_bp,
      saldo_usd_cents: r.saldo_usd_cents,
      piezas: r.piezas,
      estado: r.estado,
      ...(cambioPrecio ? { cotizado_el: hoy, cotizacion_version: (venta.cotizacion_version ?? 0) + 1 } : {}),
      ...(venta.estado === 'COTIZADA' && r.estado === 'PENDIENTE' ? { aceptado_el: hoy } : {}),
      actualizado_en: new Date().toISOString(),
    };
  }

  /**
   * "No se consiguió", o volver a buscarla. La pieza queda en la lista,
   * tachada, con su precio para mostrarlo; deja de contar en el total, el
   * costo, el anticipo y la fase. Sólo se descarta lo que no se compró: lo
   * comprado ya costó plata y se resuelve anulando.
   */
  static async descartarPiezas(
    venta_id: number,
    linea_ids: readonly number[],
    descartar: boolean,
    evento_grupo_id: string
  ): Promise<void> {
    const db = getFirestoreDb();
    const ventaRef = doc(db, 'ventas', String(venta_id));
    const params = await ParametrosRepoFirestore.getParametros();
    const ids = new Set(linea_ids);
    const hoy = hoyISO();

    const { anterior, tocadas } = await runTransaction(db, async (tx) => {
      const venta = await this.leerEncargoVivo(tx, ventaRef, venta_id);
      const tocadas: string[] = [];
      const lineas = (venta.lineas || []).map((l) => {
        if (!ids.has(l.id)) return l;
        const ya = Boolean(l.descartada_el);
        if (descartar && !ya) {
          if (!descartable(l)) {
            throw new Error(
              `'${l.descripcion}' ya se compró: no se puede marcar como no conseguida. Si no la va a llevar, anulá el encargo.`
            );
          }
          tocadas.push(l.descripcion);
          return { ...l, descartada_el: hoy, subtotal_usd_cents: 0, costo_total_usd_cents: 0 };
        }
        if (!descartar && ya) {
          tocadas.push(l.descripcion);
          const { descartada_el: _d, ...resto } = l;
          return {
            ...resto,
            subtotal_usd_cents: (resto.precio_unitario_usd_cents || 0) * resto.cantidad,
            costo_total_usd_cents: (resto.costo_unitario_usd_cents || 0) * resto.cantidad,
          };
        }
        return l;
      });
      if (tocadas.length === 0) {
        throw new Error(
          descartar ? 'No hay piezas para marcar como no conseguidas.' : 'No hay piezas no conseguidas para volver a buscar.'
        );
      }

      tx.set(ventaRef, this.cambiosDeEncargo(venta, lineas, params.anticipo_defecto_bp ?? 5000, true, hoy), {
        merge: true,
      });
      return { anterior: venta, tocadas };
    });

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'ventas',
      entidad_id: venta_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior as unknown as Record<string, unknown>,
      detalle:
        tocadas.length === 1
          ? `${anterior.codigo}: '${tocadas[0]}' ${descartar ? 'no se consiguió' : 'se vuelve a buscar'}`
          : `${anterior.codigo}: ${tocadas.length} piezas ${descartar ? 'no se consiguieron' : 'se vuelven a buscar'}`,
    });
    await ClientesRepoFirestore.refrescarTotales(anterior.cliente_id);
    await ResumenesRepoFirestore.invalidarPorFecha(anterior.fecha);
  }

  /**
   * La cotización se le mandó a la clienta. Guarda qué versión se mandó: si
   * después cambia un precio, el encargo vuelve a estar "por mandar". Uno ya
   * aceptado no cambia: la fase ya no depende de esto.
   */
  static async marcarEnviada(venta_id: number, evento_grupo_id: string): Promise<void> {
    const db = getFirestoreDb();
    const ventaRef = doc(db, 'ventas', String(venta_id));
    const hoy = hoyISO();

    const anterior = await runTransaction(db, async (tx) => {
      const venta = await this.leerEncargoVivo(tx, ventaRef, venta_id);
      if (venta.estado === 'PENDIENTE') return null;
      const falta = faltaCotizar(venta);
      if (falta) throw new Error(falta);
      tx.set(
        ventaRef,
        {
          cotizacion_enviada_el: hoy,
          cotizacion_enviada_version: venta.cotizacion_version ?? 0,
          actualizado_en: new Date().toISOString(),
        },
        { merge: true }
      );
      return venta;
    });
    if (!anterior) return;

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'ventas',
      entidad_id: venta_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior as unknown as Record<string, unknown>,
      detalle: `${anterior.codigo}: cotización mandada`,
    });
  }

  /**
   * La clienta aceptó la cotización: el encargo pasa a "por comprar", haya
   * pagado el anticipo o no. Desde ahí cuenta como deuda. Si ya estaba
   * aceptado (un pago lo aceptó antes), no hace nada.
   *
   * Si en el mismo gesto registra un pago, el pago va PRIMERO
   * (`aceptarEncargo`): así esto es lo último que toca la venta y deshacer el
   * grupo restaura una instantánea que ya incluye el pago.
   */
  static async aceptar(venta_id: number, evento_grupo_id: string): Promise<void> {
    const db = getFirestoreDb();
    const ventaRef = doc(db, 'ventas', String(venta_id));
    const hoy = hoyISO();

    const anterior = await runTransaction(db, async (tx) => {
      const venta = await this.leerEncargoVivo(tx, ventaRef, venta_id);
      if (venta.estado === 'PENDIENTE') return null;
      const falta = faltaCotizar(venta);
      if (falta) throw new Error(falta);
      tx.set(
        ventaRef,
        { estado: 'PENDIENTE', aceptado_el: hoy, actualizado_en: new Date().toISOString() },
        { merge: true }
      );
      return venta;
    });
    if (!anterior) return;

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'ventas',
      entidad_id: venta_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior as unknown as Record<string, unknown>,
      detalle: `${anterior.codigo}: aceptó`,
    });
    await ClientesRepoFirestore.refrescarTotales(anterior.cliente_id);
    await ResumenesRepoFirestore.invalidarPorFecha(anterior.fecha);
  }

  /** Lee un encargo dentro de una transacción; tiene que existir y seguir vivo. */
  private static async leerEncargoVivo(
    tx: Transaction,
    ventaRef: DocumentReference,
    venta_id: number
  ): Promise<VentaDoc> {
    const snap = await tx.get(ventaRef);
    if (!snap.exists()) throw new Error(`El encargo #${venta_id} no existe.`);
    const venta = snap.data() as VentaDoc;
    if (venta.tipo !== 'ENCARGO') throw new Error(`${venta.codigo} no es un encargo.`);
    if (venta.estado !== 'COTIZADA' && venta.estado !== 'PENDIENTE') {
      throw new Error(`${venta.codigo} ya está ${venta.estado === 'ENTREGADA' ? 'entregado' : 'anulado'}.`);
    }
    return venta;
  }

  private static async validarCambio(
    venta: VentaDoc,
    estado: EstadoVenta,
    opciones: OpcionesAnulacion
  ): Promise<void> {
    if (venta.tipo !== 'ENCARGO') return;
    const lineas = venta.lineas || [];

    if (estado === 'ENTREGADA') {
      const sinCotizar = lineas.find((l) => sinPrecio(l));
      if (sinCotizar) {
        throw new Error(`'${sinCotizar.descripcion}' todavía no tiene precio: cotizalo antes de entregarlo.`);
      }
      const deBodega = lineas.filter((l) => estadoPieza(l) === 'DE_BODEGA');
      for (const l of lineas) {
        if (estadoPieza(l) === 'EN_CAMINO') {
          throw new Error(`'${l.descripcion}' todavía no llegó: viene en ${l.compra_codigo ?? 'un paquete'}.`);
        }
        if (estadoPieza(l) === 'COMPRADA') {
          throw new Error(`'${l.descripcion}' todavía no llegó: se compró y espera paquete.`);
        }
      }
      if (deBodega.length > 0) {
        const productos = await leerVarios<ProductoDoc>(
          'productos',
          [...new Set(deBodega.map((l) => l.producto_id!))]
        );
        const pedido = new Map<string, number>();
        for (const l of deBodega) {
          const p = productos.get(String(l.producto_id));
          if (!p) throw new Error(`El producto de '${l.descripcion}' ya no existe.`);
          const talla = l.variante_id ?? (p.variantes || []).find((v) => v.activo !== false)?.id ?? 1;
          const clave = `${l.producto_id}:${talla}`;
          pedido.set(clave, (pedido.get(clave) ?? 0) + l.cantidad);
          if (unidadesDeLotes(lotesDe(p), talla) < pedido.get(clave)!) {
            throw new Error(`No hay suficientes '${l.descripcion}' en la bodega para entregar el encargo.`);
          }
        }
      }
    }

    if (estado === 'CANCELADA') {
      const llegadas = lineas.filter((l) => estadoPieza(l) === 'LLEGO');
      const sinDecidir = llegadas.filter((l) => !opciones.piezas?.[l.id]);
      if (sinDecidir.length > 0) {
        throw new Error(
          `'${sinDecidir[0].descripcion}' ya llegó. Anulá el encargo desde la computadora para decidir qué pasa con la pieza.`
        );
      }
    }
  }

  /**
   * Cambia el estado de una venta o de un encargo.
   *
   * Anular devuelve a la bodega lo que salió de ella, cada unidad a su lote.
   * En un encargo, además:
   *  - una pieza que viene en un paquete que se está cargando pasa a la
   *    bodega de ese paquete (ya se compró);
   *  - una pieza que ya llegó va a la bodega o se da por perdida, según
   *    `opciones.piezas`;
   *  - el anticipo se devuelve (se anulan sus pagos) o se queda, según
   *    `opciones.anticipo`. Sin decir nada, se devuelve, como siempre.
   *
   * Entregar un encargo saca de la bodega sólo las piezas que salen de ahí,
   * del lote más viejo, y el encargo toma ese costo. Una pieza que vino en un
   * paquete nunca descuenta de la bodega.
   */
  static async cambiarEstado(
    venta_id: number,
    estado: EstadoVenta,
    evento_grupo_id: string,
    opciones: OpcionesAnulacion = {}
  ): Promise<{ reversible: boolean }> {
    const db = getFirestoreDb();
    const ventaRef = doc(db, 'ventas', String(venta_id));
    const ahora = new Date().toISOString();

    const previa = await leerDoc<VentaDoc>('ventas', venta_id);
    if (!previa) throw new Error(`La venta #${venta_id} no existe.`);
    if (previa.estado !== estado) await this.validarCambio(previa, estado, opciones);

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

      tx.set(
        ventaRef,
        {
          estado,
          // "No se consiguió" queda anotado: la lista lo dice en vez de "Anulado".
          ...(estado === 'CANCELADA' && opciones.motivo ? { motivo_anulacion: opciones.motivo } : {}),
          actualizado_en: ahora,
        },
        { merge: true }
      );
      return data;
    });

    if (!venta) return { reversible: false };

    const anterior = { ...venta } as unknown as Record<string, unknown>;

    // Se enciende si la operación toca existencias: define si "Deshacer"
    // puede revertirla o no.
    let movioMercaderia = false;

    // Cancelar una venta anula tambien sus abonos, salvo que ella decida
    // quedarse con el anticipo de un encargo. Sin anularlos la plata seguia
    // contada como cobrada para una venta que ya no existe. Se anulan ANTES
    // de cambiar el estado para que el saldo quede consistente, y con el
    // MISMO grupo de eventos, asi deshacer la cancelacion devuelve los pagos.
    if (estado === 'CANCELADA' && opciones.anticipo !== 'RETENER') {
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

    // Cancelar devuelve la mercadería que salió de la bodega, cada unidad a
    // su lote. Una venta de inventario sacó al crearse; un encargo, sólo lo
    // que entregó desde la bodega.
    if (estado === 'CANCELADA') {
      for (const l of venta.lineas || []) {
        if (!l.producto_id) continue;
        const salio =
          venta.tipo === 'INVENTARIO' ||
          (venta.tipo === 'ENCARGO' && venta.estado === 'ENTREGADA' && (l.lotes_consumidos?.length ?? 0) > 0);
        if (!salio) continue;
        movioMercaderia = true;
        try {
          await ProductosRepoFirestore.entrada({
            producto_id: l.producto_id,
            variante_id: l.variante_id,
            cantidad: l.cantidad,
            costo_total_usd_cents: l.costo_total_usd_cents,
            consumos: l.lotes_consumidos,
            motivo: 'VENTA',
            fecha: venta.fecha,
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

    if (estado === 'CANCELADA' && venta.tipo === 'ENCARGO') {
      const piezasActualizadas = [...(venta.lineas || [])].map((l) => ({ ...l }));
      for (const l of piezasActualizadas) {
        const e = estadoPieza(l);

        // Ya llegó: a la bodega, con su costo real, o perdida.
        if (e === 'LLEGO') {
          const decision = opciones.piezas?.[l.id];
          if (decision?.destino === 'BODEGA') {
            const productoId =
              decision.producto_id ??
              l.producto_id ??
              (await ProductosRepoFirestore.crear({ nombre: l.descripcion, modo_precio: 'MARGEN' }, evento_grupo_id));
            await ProductosRepoFirestore.entrada({
              producto_id: productoId,
              variante_id: decision.producto_id ? undefined : l.variante_id,
              cantidad: l.cantidad,
              costo_total_usd_cents: l.costo_total_usd_cents,
              referencia_tipo: 'VENTA',
              referencia_id: venta_id,
              detalle: `Pieza del encargo anulado ${venta.codigo}`,
              lote: {
                id: `enc${venta_id}-l${l.id}`,
                origen: 'ENCARGO',
                fecha: l.llego_el,
                compra_id: l.compra_id,
                compra_codigo: l.compra_codigo,
                compra_linea_id: l.compra_linea_id,
              },
            });
            movioMercaderia = true;
          }
        }

        // Viene en un paquete que se está cargando: ya se compró, así que
        // entra a la bodega con ese paquete. Si la pieza no apunta a un
        // producto, al recibir se busca o se crea uno con su nombre.
        if (e === 'EN_CAMINO' && l.compra_id) {
          const compra = await leerDoc<{ codigo?: string; lineas?: Record<string, unknown>[] }>('compras', l.compra_id);
          if (compra?.lineas) {
            const lineasCompra = compra.lineas.map((lc) => {
              const esLaPieza =
                lc.venta_id === venta_id && (l.compra_linea_id === undefined || lc.id === l.compra_linea_id);
              if (!esLaPieza) return lc;
              const { venta_id: _v, venta_linea_id: _vl, ...resto } = lc;
              return sinUndefined({ ...resto, destino: 'INVENTARIO', producto_id: l.producto_id });
            });
            await EventosRepoFirestore.registrarEvento({
              evento_grupo_id,
              entidad_tipo: 'compras',
              entidad_id: l.compra_id,
              tipo_evento: 'ACTUALIZACION',
              valor_anterior: compra as unknown as Record<string, unknown>,
              detalle: `'${l.descripcion}' pasa a la bodega del paquete ${compra.codigo ?? ''}: su encargo se anuló`,
            });
            await aplicarLote([
              { coleccion: 'compras', id: l.compra_id, merge: true, datos: { lineas: lineasCompra, actualizado_en: ahora } },
            ]);
          }
        }

        delete l.compra_id;
        delete l.compra_codigo;
        delete l.compra_linea_id;
        delete l.llego_el;
      }

      await aplicarLote([
        {
          coleccion: 'ventas',
          id: venta_id,
          merge: true,
          datos: {
            lineas: piezasActualizadas.map((x) => sinUndefined(x as unknown as Record<string, unknown>)),
            piezas: piezasDe(piezasActualizadas),
            actualizado_en: ahora,
          },
        },
      ]);
    }

    // Entregar un encargo saca de la bodega las piezas que salen de ahí, del
    // lote más viejo, y el encargo toma ese costo en vez del estimado.
    if (estado === 'ENTREGADA' && venta.tipo === 'ENCARGO') {
      const lineas = [...(venta.lineas || [])].map((l) => ({ ...l }));
      const descuento = repartirMayorResiduo(
        venta.descuento_usd_cents || 0,
        lineas.map((l, i) => ({ id: i, base_valor: l.subtotal_usd_cents }))
      );
      let tocadas = 0;

      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        if (estadoPieza(l) !== 'DE_BODEGA') continue;
        const salida = await ProductosRepoFirestore.salida({
          producto_id: l.producto_id!,
          variante_id: l.variante_id,
          cantidad: l.cantidad,
          referencia_tipo: 'VENTA',
          referencia_id: venta_id,
          detalle: `Entrega del encargo ${venta.codigo}`,
          ingreso_usd_cents: l.subtotal_usd_cents - (descuento.get(i) ?? 0),
        });
        l.costo_total_usd_cents = salida.costo_salida_usd_cents;
        l.costo_unitario_usd_cents = Math.round(salida.costo_salida_usd_cents / Math.max(1, l.cantidad));
        l.lotes_consumidos = salida.consumos;
        movioMercaderia = true;
        tocadas++;
      }

      if (tocadas > 0) {
        const costo = lineas.reduce((s, l) => s + (l.costo_total_usd_cents || 0), 0);
        await aplicarLote([
          {
            coleccion: 'ventas',
            id: venta_id,
            merge: true,
            datos: {
              lineas: lineas.map((x) => sinUndefined(x as unknown as Record<string, unknown>)),
              costo_total_usd_cents: costo,
              ganancia_usd_cents: (venta.total_usd_cents || 0) - costo,
              actualizado_en: ahora,
            },
          },
        ]);
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
          // Las cuotas también: deshacer un abono corregido las dejaba con la
          // plata del monto equivocado.
          ...((venta.cuotas || []).length > 0 ? { cuotas: repartirEnCuotas(venta.cuotas!, pagado) } : {}),
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
