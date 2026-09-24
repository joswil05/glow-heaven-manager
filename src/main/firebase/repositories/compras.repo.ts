/**
 * Paquetes: la única puerta por donde entra mercadería al inventario.
 *
 * Un paquete tiene líneas: qué producto, cuántas unidades y lo que costó en la
 * tienda. El impuesto y la parte del flete de cada línea se calculan acá
 * adentro (`core/paquete.ts`) y en ningún otro lado. Al pasar el paquete al
 * inventario, cada línea entra con su costo y el promedio del producto se
 * mueve solo.
 *
 * Antes el paquete se anotaba sin contenido y el flete se le repartía después
 * a los productos que lo tuvieran anotado. Eso suponía que un producto viene
 * de un solo paquete; con el segundo, el reparto se inflaba. Ese camino ya no
 * existe. Ver `docs/PLAN_PAQUETES_E_INVENTARIO.md`.
 *
 * Los estados guardados no cambiaron, para no tener que migrar documentos:
 * `BORRADOR` es "cargando" y `RECIBIDA` es "en el inventario".
 */
import {
  doc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  limit,
  runTransaction,
} from 'firebase/firestore';
import {
  getFirestoreDb,
  siguienteId,
  reservarIds,
  leerVarios,
  leerDoc,
  aplicarLote,
  sinUndefined,
  idOrdenable,
} from '../client';
import {
  calcularPaquete,
  efectoDeEntradas,
  efectoDeCorreccion,
  type LineaPaquete,
  type PaqueteCalculado,
  type ProductoAntesDelPaquete,
} from '../../../core/paquete';
import { margenEfectivo } from '../../../core/precios';
import { repartirFlete } from '../../../core/costo-producto';
import { normalizar } from '../../../core/texto';
import { formatearMoneda } from '../../../core/moneda';
import { ParametrosRepoFirestore } from './parametros.repo';
import { ProductosRepoFirestore, type ProductoDoc } from './productos.repo';
import { ResumenesRepoFirestore } from './resumenes.repo';
import { EventosRepoFirestore } from './eventos.repo';
import type {
  Compra,
  CompraCompleta,
  CompraLinea,
  DestinoLinea,
  EfectoIngreso,
  EntradaDeProducto,
  ReconstruccionPaquete,
  ResultadoIngreso,
  Categoria,
  ParametrosSistema,
  ProductoVariante,
} from '../../../shared/types';

export interface LineaCompraInput {
  /** El id de una línea que ya existía. Sin id, es una línea nueva. */
  id?: number;
  producto_id?: number;
  variante_id?: number;
  descripcion: string;
  cantidad: number;
  /** Lo que costó la línea completa en la tienda, sin impuesto. */
  precio_linea_usd_cents: number;
  /** La tienda no cobró impuesto por esto. */
  exento?: boolean;
  /** Peso de la línea escrito a mano. `null` o ausente: se estima. */
  peso_linea_mlb?: number | null;
  destino: DestinoLinea;
  venta_id?: number;
  venta_linea_id?: number;
  es_multipack?: boolean;
  packs_comprados?: number;
  unidades_por_pack?: number;
  precio_por_pack_usd_cents?: number;
}

export interface GuardarCompraInput {
  id?: number;
  fecha: string;
  envio_total_usd_cents: number;
  otros_costos_usd_cents?: number;
  /**
   * El impuesto total del recibo, si no da exacto el porcentaje. `null` o
   * ausente es "no hay dato"; cero es "el recibo no cobró impuesto".
   */
  tax_total_override_usd_cents?: number | null;
  notas?: string;
  peso_total_mlb?: number;
  lineas: LineaCompraInput[];
}

interface CompraDoc extends Compra {
  lineas: CompraLinea[];
  actualizado_en?: string;
}

interface VentaParaCosto {
  fecha?: string;
  total_usd_cents?: number;
  lineas?: { id?: number; descripcion?: string; costo_unitario_usd_cents?: number; costo_total_usd_cents?: number }[];
}

const entero = (n: unknown): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? v : 0;
};

function existenciasDe(p: Pick<ProductoDoc, 'variantes'>): number {
  return (p.variantes || [])
    .filter((v) => v.activo !== false)
    .reduce((s, v) => s + (v.existencias || 0), 0);
}

/** Cómo estaba un producto antes de que le entre el paquete. */
function antesDe(
  p: ProductoDoc,
  categorias: Categoria[],
  parametros: ParametrosSistema
): ProductoAntesDelPaquete {
  const existencias = existenciasDe(p);
  // Igual que en la lista del inventario: un producto viejo sin valor anotado
  // vale sus existencias por su costo.
  const valor =
    p.valor_inventario_usd_cents && p.valor_inventario_usd_cents > 0
      ? p.valor_inventario_usd_cents
      : existencias * (p.costo_unitario_usd_cents || 0);
  return {
    existencias,
    valor_inventario_usd_cents: valor,
    costo_unitario_usd_cents: p.costo_unitario_usd_cents || 0,
    precio_venta_usd_cents: p.precio_venta_usd_cents || 0,
    modo_precio: p.modo_precio ?? 'MARGEN',
    margen_bp: margenEfectivo(p, categorias, parametros.margen_defecto_bp),
    multiplicador_bp: p.multiplicador_bp,
    precio_manual_usd_cents: p.precio_manual_usd_cents,
  };
}

/**
 * El peso escrito a mano de una línea guardada, o null si fue estimado.
 *
 * Las líneas de antes de que existiera `peso_estimado` traían siempre el peso
 * escrito: si es mayor que cero, fue a mano.
 */
function pesoManualGuardado(l: CompraLinea): number | null {
  if (l.peso_estimado === true) return null;
  if (l.peso_estimado === false) return l.peso_linea_mlb;
  return l.peso_linea_mlb > 0 ? l.peso_linea_mlb : null;
}

function aLineaPaquete(l: {
  id: number;
  producto_id?: number;
  destino: DestinoLinea;
  cantidad: number;
  precio_linea_usd_cents: number;
  exento?: boolean;
  peso_manual: number | null;
}): LineaPaquete {
  return {
    clave: String(l.id),
    producto_id: l.producto_id,
    destino: l.destino,
    cantidad: l.cantidad,
    precio_linea_usd_cents: l.precio_linea_usd_cents,
    exento: l.exento,
    peso_manual_mlb: l.peso_manual,
  };
}

/** Calcula el paquete con los datos de su cabecera y lo que se sabe del peso. */
function calcular(
  compra: Pick<
    GuardarCompraInput,
    'envio_total_usd_cents' | 'otros_costos_usd_cents' | 'tax_total_override_usd_cents' | 'peso_total_mlb'
  >,
  lineas: LineaPaquete[],
  tax_bp: number,
  pesoUnitario: (producto_id?: number) => number
): PaqueteCalculado {
  return calcularPaquete(lineas, {
    tax_bp,
    envio_total_usd_cents: compra.envio_total_usd_cents,
    otros_costos_usd_cents: compra.otros_costos_usd_cents,
    tax_total_override_usd_cents: compra.tax_total_override_usd_cents,
    peso_total_mlb: compra.peso_total_mlb ?? 0,
    pesoUnitario,
  });
}

/** Una línea guardada con los números que salieron del cálculo. */
function lineaCalculada(
  base: Omit<CompraLinea, 'tax_linea_usd_cents' | 'peso_linea_mlb' | 'peso_estimado' | 'envio_asignado_usd_cents' | 'otros_asignados_usd_cents' | 'costo_linea_usd_cents' | 'costo_unitario_usd_cents'>,
  calc: PaqueteCalculado
): CompraLinea {
  const c = calc.lineas.find((x) => x.clave === String(base.id));
  if (!c) throw new Error(`La línea '${base.descripcion}' no tiene cantidad.`);
  return {
    ...base,
    precio_linea_usd_cents: c.precio_linea_usd_cents,
    tax_linea_usd_cents: c.tax_linea_usd_cents,
    peso_linea_mlb: c.peso_linea_mlb,
    peso_estimado: c.peso_estimado,
    envio_asignado_usd_cents: c.envio_asignado_usd_cents,
    otros_asignados_usd_cents: c.otros_asignados_usd_cents,
    costo_linea_usd_cents: c.costo_linea_usd_cents,
    costo_unitario_usd_cents: c.costo_unitario_usd_cents,
  };
}

function validarLinea(l: LineaCompraInput): void {
  const nombre = l.descripcion?.trim() || 'una línea';
  if (!Number.isInteger(l.cantidad) || l.cantidad < 1) {
    throw new Error(`La cantidad de '${nombre}' tiene que ser un número entero mayor que cero.`);
  }
  if (!Number.isFinite(l.precio_linea_usd_cents) || l.precio_linea_usd_cents < 0) {
    throw new Error(`El precio de '${nombre}' no es un monto válido.`);
  }
  if (l.destino === 'ENCARGO' && !l.venta_id) {
    throw new Error(`'${nombre}' va para un encargo, pero no dice cuál.`);
  }
  if (l.destino === 'INVENTARIO' && !l.producto_id && !l.descripcion?.trim()) {
    throw new Error('Hay una línea sin producto.');
  }
}

/** Pone ids a las líneas que no los tienen, sin repetir los que ya hay. */
function conIds(lineas: LineaCompraInput[], existentes: CompraLinea[] = []): (LineaCompraInput & { id: number })[] {
  let max = Math.max(0, ...existentes.map((l) => l.id), ...lineas.map((l) => l.id ?? 0));
  const usados = new Set<number>();
  return lineas.map((l) => {
    if (l.id && !usados.has(l.id)) {
      usados.add(l.id);
      return { ...l, id: l.id };
    }
    max += 1;
    usados.add(max);
    return { ...l, id: max };
  });
}

function lineaDesdeInput(l: LineaCompraInput & { id: number }, compra_id: number, orden: number) {
  return {
    id: l.id,
    compra_id,
    producto_id: l.producto_id,
    variante_id: l.variante_id,
    descripcion: l.descripcion.trim(),
    cantidad: l.cantidad,
    precio_linea_usd_cents: entero(l.precio_linea_usd_cents),
    exento: l.exento ? true : undefined,
    destino: l.destino,
    venta_id: l.venta_id,
    venta_linea_id: l.venta_linea_id,
    orden,
    es_multipack: l.es_multipack,
    packs_comprados: l.packs_comprados,
    unidades_por_pack: l.unidades_por_pack,
    precio_por_pack_usd_cents: l.precio_por_pack_usd_cents,
  };
}

const pesoManualDeInput = (l: LineaCompraInput): number | null =>
  l.peso_linea_mlb === undefined || l.peso_linea_mlb === null ? null : Math.max(0, entero(l.peso_linea_mlb));

/**
 * Le pone el costo real a las líneas de encargo que trae el paquete.
 *
 * Busca la línea del encargo por su id y, en los paquetes viejos que no lo
 * guardaban, por la descripción.
 */
function congelarCostoDeEncargos(
  lineas: CompraLinea[],
  ventas: Map<string, VentaParaCosto>
): { id: string; datos: Record<string, unknown> }[] {
  const salida: { id: string; datos: Record<string, unknown> }[] = [];
  const ahora = new Date().toISOString();

  for (const [idVenta, v] of ventas) {
    const vLineas = [...(v.lineas || [])].map((x) => ({ ...x }));
    let modificado = false;

    for (const l of lineas) {
      if (l.destino !== 'ENCARGO' || String(l.venta_id) !== idVenta) continue;
      for (const vl of vLineas) {
        const coincide =
          l.venta_linea_id !== undefined
            ? vl.id === l.venta_linea_id
            : normalizar(vl.descripcion) === normalizar(l.descripcion);
        if (!coincide) continue;
        vl.costo_unitario_usd_cents = l.costo_unitario_usd_cents;
        vl.costo_total_usd_cents = l.costo_linea_usd_cents;
        modificado = true;
      }
    }
    if (!modificado) continue;

    const costo = vLineas.reduce((s, x) => s + (x.costo_total_usd_cents || 0), 0);
    salida.push({
      id: idVenta,
      datos: {
        lineas: vLineas,
        costo_total_usd_cents: costo,
        ganancia_usd_cents: (v.total_usd_cents || 0) - costo,
        actualizado_en: ahora,
      },
    });
  }
  return salida;
}

export class ComprasRepoFirestore {
  static async listar(): Promise<Compra[]> {
    const db = getFirestoreDb();
    const snap = await getDocs(query(collection(db, 'compras'), where('activo', '==', true)));
    const compras: Compra[] = snap.docs.map((d) => {
      const data = d.data() as CompraDoc;
      const { lineas: _l, resumen_ingreso: _r, ...compra } = data;
      return compra;
    });

    return compras.sort((a, b) => {
      const cmp = (b.fecha || '').localeCompare(a.fecha || '');
      return cmp !== 0 ? cmp : b.id - a.id;
    });
  }

  static async getById(id: number): Promise<CompraCompleta | null> {
    const data = await leerDoc<CompraDoc>('compras', id);
    if (!data || !data.activo) return null;

    // Nombres de productos y clientas en tres lecturas agrupadas, no en una
    // por línea.
    const lineas = data.lineas || [];
    const productos = await leerVarios<ProductoDoc>(
      'productos',
      lineas.map((l) => l.producto_id).filter((x): x is number => Boolean(x))
    );
    const ventas = await leerVarios<{ cliente_id?: number }>(
      'ventas',
      lineas.map((l) => l.venta_id).filter((x): x is number => Boolean(x))
    );
    const clientes = await leerVarios<{ nombre?: string }>(
      'clientes',
      [...ventas.values()].map((v) => v.cliente_id).filter((x): x is number => Boolean(x))
    );

    const lineasCompletas = lineas.map((l) => {
      const venta = l.venta_id ? ventas.get(String(l.venta_id)) : undefined;
      return {
        ...l,
        producto_nombre: l.producto_id ? productos.get(String(l.producto_id))?.nombre : undefined,
        cliente_nombre: venta?.cliente_id ? clientes.get(String(venta.cliente_id))?.nombre : undefined,
      };
    });

    const { lineas: _, ...compra } = data;
    return {
      ...compra,
      lineas: lineasCompletas,
      unidades_totales: lineasCompletas.reduce((a, l) => a + (l.cantidad || 0), 0),
    };
  }

  /** La cuenta del paquete sin guardar nada. */
  static async previsualizar(input: GuardarCompraInput) {
    const params = await ParametrosRepoFirestore.getParametros();
    const lineas = conIds(input.lineas);
    const productos = await leerVarios<ProductoDoc>(
      'productos',
      lineas.map((l) => l.producto_id).filter((x): x is number => Boolean(x))
    );
    const calc = calcular(
      input,
      lineas.map((l) => aLineaPaquete({ ...l, peso_manual: pesoManualDeInput(l) })),
      params.tax_bp ?? 700,
      (id) => (id ? productos.get(String(id))?.peso_unitario_mlb ?? 0 : 0)
    );
    return {
      ...calc,
      lineas: calc.lineas.map((c) => ({ ...c, id: Number(c.clave) })),
    };
  }

  /**
   * Guarda un paquete que se está cargando. No toca el inventario.
   *
   * Un paquete que ya está en el inventario no se guarda por acá: se corrige,
   * que es lo que sabe mover la diferencia a la bodega.
   */
  static async guardar(input: GuardarCompraInput, evento_grupo_id: string): Promise<number> {
    const db = getFirestoreDb();
    let anterior: CompraDoc | null = null;

    if (input.id) {
      anterior = await leerDoc<CompraDoc>('compras', input.id);
      if (!anterior || !anterior.activo) throw new Error(`El paquete #${input.id} no existe.`);
      if (anterior.estado === 'RECIBIDA') {
        throw new Error(
          'Este paquete ya está en el inventario. Para cambiarle algo usá "Corregir", que ajusta la bodega con la diferencia.'
        );
      }
    }

    for (const l of input.lineas) validarLinea(l);

    const params = await ParametrosRepoFirestore.getParametros();
    const lineas = conIds(input.lineas, anterior?.lineas);
    const productos = await leerVarios<ProductoDoc>(
      'productos',
      lineas.map((l) => l.producto_id).filter((x): x is number => Boolean(x))
    );
    const compraId = input.id ?? (await siguienteId('compras'));

    const calc = calcular(
      input,
      lineas.map((l) => aLineaPaquete({ ...l, peso_manual: pesoManualDeInput(l) })),
      params.tax_bp ?? 700,
      (id) => (id ? productos.get(String(id))?.peso_unitario_mlb ?? 0 : 0)
    );
    const lineasGuardadas = lineas.map((l, i) => lineaCalculada(lineaDesdeInput(l, compraId, i), calc));

    const now = new Date().toISOString();
    const cabecera = {
      fecha: input.fecha,
      estado: 'BORRADOR' as const,
      envio_total_usd_cents: calc.envio_total_usd_cents,
      otros_costos_usd_cents: calc.otros_costos_usd_cents,
      tax_total_override_usd_cents: input.tax_total_override_usd_cents ?? null,
      subtotal_productos_usd_cents: calc.subtotal_productos_usd_cents,
      tax_total_usd_cents: calc.tax_total_usd_cents,
      total_usd_cents: calc.total_pagado_usd_cents,
      // Sin el peso de la caja, pesa lo que suman sus líneas.
      peso_total_mlb: entero(input.peso_total_mlb ?? 0) > 0 ? entero(input.peso_total_mlb) : calc.peso_total_mlb,
      criterio_flete: calc.criterio_flete,
      notas: input.notas?.trim() || null,
      lineas: lineasGuardadas,
      actualizado_en: now,
    };

    if (anterior) {
      await setDoc(
        doc(db, 'compras', String(compraId)),
        sinUndefined(cabecera as unknown as Record<string, unknown>),
        { merge: true }
      );
      await EventosRepoFirestore.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'compras',
        entidad_id: compraId,
        tipo_evento: 'ACTUALIZACION',
        valor_anterior: anterior as unknown as Record<string, unknown>,
        detalle: `Paquete ${anterior.codigo} actualizado`,
      });
      return compraId;
    }

    const codigo = `PQ-${String(compraId).padStart(4, '0')}`;
    await setDoc(
      doc(db, 'compras', String(compraId)),
      sinUndefined({
        ...cabecera,
        id: compraId,
        codigo,
        tasa_cambio_cents: params.tasa_cambio_cents ?? 3662,
        activo: true,
        creado_en: now,
      } as unknown as Record<string, unknown>)
    );
    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'compras',
      entidad_id: compraId,
      tipo_evento: 'CREACION',
      detalle: `Paquete ${codigo} registrado`,
    });
    return compraId;
  }

  /**
   * Las líneas de inventario que llegaron sin producto se asocian por nombre,
   * y si no hay ninguno con ese nombre se prepara uno nuevo.
   *
   * La pantalla siempre manda el producto; esto cubre los borradores de antes
   * y las líneas escritas a mano. Lee los productos UNA vez para todas las
   * líneas: antes era una lectura de la colección entera por cada línea.
   *
   * Los productos nuevos NO se crean acá: se reserva su número y se escriben
   * dentro de la misma transacción que pasa el paquete al inventario. Si se
   * crearan antes, dos clics a la vez crearían cada uno su "Gloss" y quedarían
   * dos fichas gemelas con la mercadería repartida entre las dos. Así, la
   * segunda llamada encuentra el paquete ya pasado y no escribe nada.
   */
  private static async planearProductos<
    T extends {
      producto_id?: number;
      descripcion: string;
      destino: DestinoLinea;
      peso_linea_mlb?: number | null;
      peso_estimado?: boolean;
      cantidad: number;
    },
  >(
    lineas: T[],
    parametros: ParametrosSistema
  ): Promise<{ lineas: T[]; nuevos: Map<number, ProductoDoc> }> {
    const nuevos = new Map<number, ProductoDoc>();
    const sinProducto = lineas.filter((l) => l.destino === 'INVENTARIO' && !l.producto_id);
    if (sinProducto.length === 0) return { lineas, nuevos };

    const todos = await ProductosRepoFirestore.listar({ incluirInactivos: true });
    const porNombre = new Map(todos.map((p) => [normalizar(p.nombre), p.id]));
    const faltan = [
      ...new Set(sinProducto.map((l) => normalizar(l.descripcion)).filter((k) => !porNombre.has(k))),
    ];
    const ids = await reservarIds('productos', faltan.length);
    const ahora = new Date().toISOString();

    faltan.forEach((clave, i) => {
      const l = sinProducto.find((x) => normalizar(x.descripcion) === clave)!;
      const id = ids[i];
      const pesoEscrito = l.peso_estimado !== true && (l.peso_linea_mlb ?? 0) > 0;
      porNombre.set(clave, id);
      nuevos.set(id, {
        id,
        codigo: `P-${String(id).padStart(4, '0')}`,
        nombre: l.descripcion.trim(),
        tiene_variantes: false,
        variantes: [{ id: 1, producto_id: id, existencias: 0, activo: true }],
        valor_inventario_usd_cents: 0,
        costo_unitario_usd_cents: 0,
        modo_precio: 'MARGEN',
        precio_venta_usd_cents: 0,
        stock_minimo: parametros.stock_minimo_defecto,
        peso_unitario_mlb: pesoEscrito ? Math.round((l.peso_linea_mlb ?? 0) / Math.max(1, l.cantidad)) : 0,
        paquetes: [],
        activo: true,
        creado_en: ahora,
        actualizado_en: ahora,
      });
    });

    return {
      lineas: lineas.map((l) =>
        l.destino === 'INVENTARIO' && !l.producto_id
          ? { ...l, producto_id: porNombre.get(normalizar(l.descripcion)) }
          : l
      ),
      nuevos,
    };
  }

  /** Registra la creación de los productos que nacieron con un paquete. */
  private static async anotarProductosNuevos(
    nuevos: Map<number, ProductoDoc>,
    codigo: string,
    evento_grupo_id: string
  ): Promise<void> {
    for (const p of nuevos.values()) {
      await EventosRepoFirestore.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'productos',
        entidad_id: p.id,
        tipo_evento: 'CREACION',
        detalle: `Producto '${p.nombre}' agregado con el paquete ${codigo}`,
      });
    }
  }

  /**
   * Pasa el paquete al inventario.
   *
   * Todo en UNA transacción: el paquete, cada producto, sus movimientos y los
   * encargos que congelan su costo. Entra todo o no entra nada. Antes esto era
   * un bucle de escrituras sueltas: si fallaba a la mitad, la bodega quedaba
   * con la mitad del paquete adentro y el paquete marcado como recibido.
   *
   * El precio de cada producto se recalcula con su costo nuevo, salvo que ella
   * lo haya escrito a mano. Lo que cambió queda en `resumen_ingreso` para
   * mostrárselo.
   */
  static async recibir(compra_id: number, evento_grupo_id: string): Promise<ResultadoIngreso> {
    const db = getFirestoreDb();
    const compraRef = doc(db, 'compras', String(compra_id));

    const [parametros, categorias] = await Promise.all([
      ParametrosRepoFirestore.getParametros(),
      ParametrosRepoFirestore.getCategorias(),
    ]);

    // Las líneas sin producto se planean antes (buscar por nombre y reservar
    // números); los productos nuevos se escriben adentro de la transacción.
    const previa = await leerDoc<CompraDoc>('compras', compra_id);
    if (!previa || !previa.activo) throw new Error(`El paquete #${compra_id} no existe.`);
    if (previa.estado === 'RECIBIDA') throw new Error('Este paquete ya estaba en el inventario.');
    const plan = await this.planearProductos(previa.lineas || [], parametros);
    const productoDeLinea = new Map(plan.lineas.map((l) => [l.id, l.producto_id]));

    const resultado = await runTransaction(db, async (tx) => {
      const snap = await tx.get(compraRef);
      if (!snap.exists()) throw new Error(`El paquete #${compra_id} no existe.`);
      const compra = snap.data() as CompraDoc;
      if (compra.estado === 'RECIBIDA') throw new Error('Este paquete ya estaba en el inventario.');

      if ((compra.lineas || []).length === 0) {
        throw new Error('El paquete no tiene productos. Agregá lo que trajo antes de pasarlo al inventario.');
      }
      const lineas = (compra.lineas || []).map((l) => {
        if (l.destino !== 'INVENTARIO' || l.producto_id) return l;
        const producto_id = productoDeLinea.get(l.id);
        if (!producto_id) throw new Error('El paquete cambió mientras se pasaba. Volvé a intentarlo.');
        return { ...l, producto_id };
      });

      // Todas las lecturas antes que cualquier escritura: así lo exige
      // Firestore dentro de una transacción. Los productos que nacen con este
      // paquete no se leen: todavía no existen.
      const idsProductos = [...new Set(lineas.filter((l) => l.destino === 'INVENTARIO').map((l) => l.producto_id!))];
      const idsALeer = idsProductos.filter((id) => !plan.nuevos.has(id));
      const idsVentas = [...new Set(lineas.filter((l) => l.destino === 'ENCARGO' && l.venta_id).map((l) => l.venta_id!))];
      const snapsProd = await Promise.all(idsALeer.map((id) => tx.get(doc(db, 'productos', String(id)))));
      const snapsVenta = await Promise.all(idsVentas.map((id) => tx.get(doc(db, 'ventas', String(id)))));

      const productos = new Map<number, ProductoDoc>();
      snapsProd.forEach((s, i) => {
        if (!s.exists()) throw new Error(`El producto #${idsALeer[i]} de este paquete ya no existe.`);
        productos.set(idsALeer[i], s.data() as ProductoDoc);
      });
      for (const id of idsProductos) {
        const nuevo = plan.nuevos.get(id);
        if (nuevo) productos.set(id, nuevo);
      }
      const ventas = new Map<string, VentaParaCosto>();
      snapsVenta.forEach((s, i) => {
        if (s.exists()) ventas.set(String(idsVentas[i]), s.data() as VentaParaCosto);
      });

      const calc = calcular(
        compra,
        lineas.map((l) => aLineaPaquete({ ...l, peso_manual: pesoManualGuardado(l) })),
        parametros.tax_bp ?? 700,
        (id) => (id ? productos.get(id)?.peso_unitario_mlb ?? 0 : 0)
      );
      const lineasFinales = lineas.map((l) => lineaCalculada(l, calc));

      const ahora = new Date().toISOString();
      const efectos: EfectoIngreso[] = [];

      for (const [pid, p] of productos) {
        const suyas = lineasFinales.filter((l) => l.destino === 'INVENTARIO' && l.producto_id === pid);
        const efecto = efectoDeEntradas(
          antesDe(p, categorias, parametros),
          suyas.map((l) => ({ cantidad: l.cantidad, costo_linea_usd_cents: l.costo_linea_usd_cents })),
          parametros.paso_redondeo_usd_cents
        );

        const variantes: ProductoVariante[] = [...(p.variantes || [])].map((v) => ({ ...v }));
        let corriendo = existenciasDe(p);
        let pesoUnitario = p.peso_unitario_mlb || 0;

        for (const l of suyas) {
          const varianteId =
            l.variante_id ?? variantes.find((v) => v.activo !== false)?.id ?? 1;
          const idx = variantes.findIndex((v) => v.id === varianteId);
          if (idx === -1) {
            variantes.push({ id: varianteId, producto_id: pid, existencias: l.cantidad, activo: true });
          } else {
            const antes = variantes[idx].activo === false ? 0 : variantes[idx].existencias || 0;
            variantes[idx] = { ...variantes[idx], existencias: antes + l.cantidad, activo: true };
          }
          corriendo += l.cantidad;
          if (l.peso_estimado === false && l.cantidad > 0) {
            pesoUnitario = Math.round(l.peso_linea_mlb / l.cantidad);
          }

          const movId = idOrdenable();
          tx.set(
            doc(db, 'movimientos_inventario', movId),
            sinUndefined({
              id: movId,
              producto_id: pid,
              variante_id: varianteId,
              tipo: 'ENTRADA',
              cantidad: l.cantidad,
              costo_total_usd_cents: l.costo_linea_usd_cents,
              existencias_despues: corriendo,
              referencia_tipo: 'COMPRA',
              referencia_id: compra_id,
              detalle: `Paquete ${compra.codigo}`,
              fecha: ahora,
            })
          );
        }

        tx.set(
          doc(db, 'productos', String(pid)),
          sinUndefined({
            // Un producto que nace con el paquete se escribe entero acá.
            ...(plan.nuevos.get(pid) ?? {}),
            variantes: variantes.map((v) => sinUndefined(v)),
            valor_inventario_usd_cents: efecto.valor_despues_usd_cents,
            costo_unitario_usd_cents: efecto.costo_despues_usd_cents,
            precio_venta_usd_cents: efecto.precio_despues_usd_cents,
            peso_unitario_mlb: pesoUnitario,
            paquete_id: compra_id,
            paquetes: [...new Set([...(p.paquetes ?? []), compra_id])],
            // Un producto que vuelve a llegar vuelve al catálogo.
            activo: true,
            actualizado_en: ahora,
          }),
          { merge: true }
        );

        efectos.push({ producto_id: pid, nombre: p.nombre, modo_precio: p.modo_precio, ...efecto });
      }

      const encargos = congelarCostoDeEncargos(lineasFinales, ventas);
      for (const e of encargos) {
        tx.set(doc(db, 'ventas', e.id), sinUndefined(e.datos), { merge: true });
      }

      tx.set(
        compraRef,
        sinUndefined({
          estado: 'RECIBIDA',
          lineas: lineasFinales,
          subtotal_productos_usd_cents: calc.subtotal_productos_usd_cents,
          tax_total_usd_cents: calc.tax_total_usd_cents,
          envio_total_usd_cents: calc.envio_total_usd_cents,
          otros_costos_usd_cents: calc.otros_costos_usd_cents,
          total_usd_cents: calc.total_pagado_usd_cents,
          criterio_flete: calc.criterio_flete,
          resumen_ingreso: efectos,
          cerrado_en: ahora,
          actualizado_en: ahora,
        }),
        { merge: true }
      );

      return {
        compra,
        efectos,
        ventasTocadas: encargos.map((e) => ventas.get(e.id)!),
      };
    });

    // Congelar el costo real de un encargo cambia su ganancia: el resumen de
    // ese mes dejó de ser cierto.
    for (const v of resultado.ventasTocadas) {
      await ResumenesRepoFirestore.invalidarPorFecha(v.fecha);
    }
    await this.anotarProductosNuevos(plan.nuevos, resultado.compra.codigo, evento_grupo_id);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'compras',
      entidad_id: compra_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: resultado.compra as unknown as Record<string, unknown>,
      // Metió mercadería a la bodega. Restaurar el documento lo dejaría "sin
      // recibir" con las unidades adentro, listas para entrar otra vez. La
      // vuelta atrás es corregir el paquete.
      reversible: false,
      detalle: `Paquete ${resultado.compra.codigo} pasó al inventario: ${resultado.efectos.length} producto(s)`,
    });

    return {
      codigo: resultado.compra.codigo,
      productos_afectados: resultado.efectos.length,
      productos: resultado.efectos,
      encargos_actualizados: resultado.ventasTocadas.length,
    };
  }

  /**
   * Corrige un paquete que ya está en el inventario.
   *
   * Se pueden cambiar los montos (flete, otros gastos, el precio de tienda de
   * una línea, si pagó impuesto, el peso) y agregar líneas que se olvidaron.
   * La diferencia de costo de cada línea se aplica sólo a las unidades que
   * siguen en la bodega; las vendidas conservan el costo con que salieron.
   *
   * No se pueden quitar líneas ni cambiar cantidades o productos: esas
   * unidades ya entraron y quizá se vendieron. Para eso está ajustar
   * existencias, que deja su propio movimiento.
   */
  static async corregir(
    input: GuardarCompraInput & { id: number },
    evento_grupo_id: string
  ): Promise<ResultadoIngreso> {
    const db = getFirestoreDb();
    const compraRef = doc(db, 'compras', String(input.id));

    const previa = await leerDoc<CompraDoc>('compras', input.id);
    if (!previa || !previa.activo) throw new Error(`El paquete #${input.id} no existe.`);
    if (previa.estado !== 'RECIBIDA') {
      throw new Error('Este paquete todavía se está cargando: se edita, no se corrige.');
    }
    const viejas = previa.lineas || [];
    if (viejas.length === 0 && !previa.reconstruido && (await this.tieneProductosAnotados(input.id))) {
      throw new Error(
        'Este paquete es de antes de que los paquetes guardaran lo que traían, y ya tiene productos anotados. Primero completá su contenido.'
      );
    }

    for (const l of input.lineas) validarLinea(l);
    const conId = conIds(input.lineas, viejas);
    const porIdViejas = new Map(viejas.map((l) => [l.id, l]));

    // Las líneas que ya estaban tienen que seguir estando, con lo mismo.
    const ids = new Set(conId.map((l) => l.id));
    for (const v of viejas) {
      if (!ids.has(v.id)) {
        throw new Error(
          `No se puede quitar '${v.descripcion}': esas unidades ya entraron al inventario. Si sobran, ajustá las existencias.`
        );
      }
    }
    for (const l of conId) {
      const v = porIdViejas.get(l.id);
      if (!v) continue;
      if (
        v.cantidad !== l.cantidad ||
        (v.producto_id ?? null) !== (l.producto_id ?? null) ||
        (v.variante_id ?? null) !== (l.variante_id ?? null) ||
        v.destino !== l.destino ||
        (v.venta_id ?? null) !== (l.venta_id ?? null)
      ) {
        throw new Error(
          `En '${v.descripcion}' sólo se puede corregir el precio, el impuesto o el peso. La cantidad y el producto ya entraron al inventario; para eso ajustá las existencias.`
        );
      }
    }

    const [parametros, categorias] = await Promise.all([
      ParametrosRepoFirestore.getParametros(),
      ParametrosRepoFirestore.getCategorias(),
    ]);
    const plan = await this.planearProductos(conId, parametros);
    const resueltas = plan.lineas;

    const resultado = await runTransaction(db, async (tx) => {
      const snap = await tx.get(compraRef);
      if (!snap.exists()) throw new Error(`El paquete #${input.id} no existe.`);
      const compra = snap.data() as CompraDoc;
      if (compra.estado !== 'RECIBIDA') throw new Error('Este paquete no está en el inventario.');
      if ((compra.lineas || []).length !== viejas.length) {
        throw new Error('El paquete cambió mientras lo corregías. Cerralo y volvé a abrirlo.');
      }

      const idsProductos = [...new Set(resueltas.filter((l) => l.destino === 'INVENTARIO').map((l) => l.producto_id!))];
      const idsALeer = idsProductos.filter((id) => !plan.nuevos.has(id));
      const idsVentas = [...new Set(resueltas.filter((l) => l.destino === 'ENCARGO' && l.venta_id).map((l) => l.venta_id!))];
      const snapsProd = await Promise.all(idsALeer.map((id) => tx.get(doc(db, 'productos', String(id)))));
      const snapsVenta = await Promise.all(idsVentas.map((id) => tx.get(doc(db, 'ventas', String(id)))));

      const productos = new Map<number, ProductoDoc>();
      snapsProd.forEach((s, i) => {
        if (!s.exists()) throw new Error(`El producto #${idsALeer[i]} de este paquete ya no existe.`);
        productos.set(idsALeer[i], s.data() as ProductoDoc);
      });
      for (const id of idsProductos) {
        const nuevo = plan.nuevos.get(id);
        if (nuevo) productos.set(id, nuevo);
      }
      const ventas = new Map<string, VentaParaCosto>();
      snapsVenta.forEach((s, i) => {
        if (s.exists()) ventas.set(String(idsVentas[i]), s.data() as VentaParaCosto);
      });

      // Una línea que ya estaba y a la que no se le cambió el precio ni la
      // exención conserva su impuesto: corregir el flete no lo mueve.
      const calc = calcular(
        input,
        resueltas.map((l) => {
          const v = porIdViejas.get(l.id);
          const mismoImpuesto =
            v !== undefined &&
            v.precio_linea_usd_cents === entero(l.precio_linea_usd_cents) &&
            Boolean(v.exento) === Boolean(l.exento);
          return {
            ...aLineaPaquete({ ...l, peso_manual: pesoManualDeInput(l) }),
            tax_declarado_usd_cents: mismoImpuesto ? v!.tax_linea_usd_cents : undefined,
          };
        }),
        parametros.tax_bp ?? 700,
        (id) => (id ? productos.get(id)?.peso_unitario_mlb ?? 0 : 0)
      );
      const lineasFinales = resueltas.map((l, i) => lineaCalculada(lineaDesdeInput(l, input.id, i), calc));

      const ahora = new Date().toISOString();
      const efectos: EfectoIngreso[] = [];

      for (const [pid, p] of productos) {
        const suyas = lineasFinales.filter((l) => l.destino === 'INVENTARIO' && l.producto_id === pid);
        const cambios = suyas
          .filter((l) => porIdViejas.has(l.id))
          .map((l) => ({
            unidades_de_la_linea: l.cantidad,
            diferencia_usd_cents: l.costo_linea_usd_cents - porIdViejas.get(l.id)!.costo_linea_usd_cents,
          }))
          .filter((c) => c.diferencia_usd_cents !== 0);
        const nuevas = suyas.filter((l) => !porIdViejas.has(l.id));
        if (cambios.length === 0 && nuevas.length === 0) continue;

        const efecto = efectoDeCorreccion(
          antesDe(p, categorias, parametros),
          cambios,
          nuevas.map((l) => ({ cantidad: l.cantidad, costo_linea_usd_cents: l.costo_linea_usd_cents })),
          parametros.paso_redondeo_usd_cents
        );

        const variantes: ProductoVariante[] = [...(p.variantes || [])].map((v) => ({ ...v }));
        let corriendo = existenciasDe(p);

        if (efecto.aplicado_usd_cents !== 0) {
          const movId = idOrdenable();
          tx.set(
            doc(db, 'movimientos_inventario', movId),
            sinUndefined({
              id: movId,
              producto_id: pid,
              tipo: 'AJUSTE',
              cantidad: 0,
              costo_total_usd_cents: efecto.aplicado_usd_cents,
              existencias_despues: corriendo,
              referencia_tipo: 'COMPRA',
              referencia_id: input.id,
              // El monto va en el detalle: el movimiento no cambia unidades, y
              // sin él el historial sólo decía "= 4" sin explicar qué pasó.
              detalle: `Corrección del paquete ${compra.codigo}: costo ${efecto.aplicado_usd_cents > 0 ? '+' : '-'}${formatearMoneda(Math.abs(efecto.aplicado_usd_cents), 'USD')}`,
              fecha: ahora,
            })
          );
        }

        for (const l of nuevas) {
          const varianteId =
            l.variante_id ?? variantes.find((v) => v.activo !== false)?.id ?? 1;
          const idx = variantes.findIndex((v) => v.id === varianteId);
          if (idx === -1) {
            variantes.push({ id: varianteId, producto_id: pid, existencias: l.cantidad, activo: true });
          } else {
            const antes = variantes[idx].activo === false ? 0 : variantes[idx].existencias || 0;
            variantes[idx] = { ...variantes[idx], existencias: antes + l.cantidad, activo: true };
          }
          corriendo += l.cantidad;
          const movId = idOrdenable();
          tx.set(
            doc(db, 'movimientos_inventario', movId),
            sinUndefined({
              id: movId,
              producto_id: pid,
              variante_id: varianteId,
              tipo: 'ENTRADA',
              cantidad: l.cantidad,
              costo_total_usd_cents: l.costo_linea_usd_cents,
              existencias_despues: corriendo,
              referencia_tipo: 'COMPRA',
              referencia_id: input.id,
              detalle: `Paquete ${compra.codigo} (agregado al corregir)`,
              fecha: ahora,
            })
          );
        }

        tx.set(
          doc(db, 'productos', String(pid)),
          sinUndefined({
            ...(plan.nuevos.get(pid) ?? {}),
            variantes: variantes.map((v) => sinUndefined(v)),
            valor_inventario_usd_cents: efecto.valor_despues_usd_cents,
            costo_unitario_usd_cents: efecto.costo_despues_usd_cents,
            precio_venta_usd_cents: efecto.precio_despues_usd_cents,
            ...(nuevas.length > 0
              ? {
                  paquetes: [...new Set([...(p.paquetes ?? []), input.id])],
                  activo: true,
                }
              : {}),
            actualizado_en: ahora,
          }),
          { merge: true }
        );

        efectos.push({
          producto_id: pid,
          nombre: p.nombre,
          modo_precio: p.modo_precio,
          ...efecto,
          correccion_usd_cents: efecto.aplicado_usd_cents,
        });
      }

      const encargos = congelarCostoDeEncargos(lineasFinales, ventas);
      for (const e of encargos) {
        tx.set(doc(db, 'ventas', e.id), sinUndefined(e.datos), { merge: true });
      }

      tx.set(
        compraRef,
        sinUndefined({
          fecha: input.fecha,
          lineas: lineasFinales,
          envio_total_usd_cents: calc.envio_total_usd_cents,
          otros_costos_usd_cents: calc.otros_costos_usd_cents,
          tax_total_override_usd_cents: input.tax_total_override_usd_cents ?? null,
          subtotal_productos_usd_cents: calc.subtotal_productos_usd_cents,
          tax_total_usd_cents: calc.tax_total_usd_cents,
          total_usd_cents: calc.total_pagado_usd_cents,
          peso_total_mlb:
            entero(input.peso_total_mlb ?? 0) > 0 ? entero(input.peso_total_mlb) : calc.peso_total_mlb,
          criterio_flete: calc.criterio_flete,
          notas: input.notas?.trim() || null,
          corregido_en: ahora,
          actualizado_en: ahora,
        }),
        { merge: true }
      );

      return { compra, efectos, ventasTocadas: encargos.map((e) => ventas.get(e.id)!) };
    });

    for (const v of resultado.ventasTocadas) {
      await ResumenesRepoFirestore.invalidarPorFecha(v.fecha);
    }
    await this.anotarProductosNuevos(plan.nuevos, resultado.compra.codigo, evento_grupo_id);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'compras',
      entidad_id: input.id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: resultado.compra as unknown as Record<string, unknown>,
      reversible: false,
      detalle: `Paquete ${resultado.compra.codigo} corregido: ${resultado.efectos.length} producto(s) ajustado(s)`,
    });

    return {
      codigo: resultado.compra.codigo,
      productos_afectados: resultado.efectos.length,
      productos: resultado.efectos,
      encargos_actualizados: resultado.ventasTocadas.length,
    };
  }

  /** Si algún producto tiene anotado este paquete. Una lectura como mucho. */
  private static async tieneProductosAnotados(compra_id: number): Promise<boolean> {
    const db = getFirestoreDb();
    const snap = await getDocs(
      query(collection(db, 'productos'), where('paquetes', 'array-contains', compra_id), limit(1))
    );
    return !snap.empty;
  }

  /**
   * Reconstruye lo que trajo un paquete de antes del cambio, sin guardar nada.
   *
   * Esos paquetes se anotaban sólo con el flete, y los productos se cargaban a
   * mano asociados a ellos. El contenido está repartido en los productos: cada
   * uno tiene su movimiento de entrada con las unidades y lo que costaron con
   * impuesto, y su precio de tienda. De ahí sale cada línea.
   *
   * El flete se reparte con la misma cuenta que usaba la versión anterior, así
   * que cada línea muestra exactamente el flete que ese producto cargó.
   *
   * No toca ningún producto. La bodega vale lo mismo antes y después.
   */
  static async reconstruir(compra_id: number): Promise<ReconstruccionPaquete> {
    const db = getFirestoreDb();
    const compra = await leerDoc<CompraDoc>('compras', compra_id);
    if (!compra || !compra.activo) throw new Error(`El paquete #${compra_id} no existe.`);
    if ((compra.lineas || []).length > 0) {
      throw new Error('Este paquete ya tiene su contenido registrado.');
    }

    const [params, porLista, porCampo, movs] = await Promise.all([
      ParametrosRepoFirestore.getParametros(),
      getDocs(query(collection(db, 'productos'), where('paquetes', 'array-contains', compra_id))),
      getDocs(query(collection(db, 'productos'), where('paquete_id', '==', compra_id))),
      getDocs(query(collection(db, 'movimientos_inventario'), where('referencia_id', '==', compra_id))),
    ]);
    const taxBp = params.tax_bp ?? 700;

    const productos = new Map<number, ProductoDoc>();
    for (const d of [...porLista.docs, ...porCampo.docs]) {
      const p = d.data() as ProductoDoc;
      productos.set(p.id, p);
    }

    // Lo que entró de cada producto con ESTE paquete. El número de referencia
    // se comparte con las ventas, así que se filtra por tipo.
    const entradas = new Map<number, { cantidad: number; costo: number; variante_id?: number }>();
    for (const d of movs.docs) {
      const m = d.data() as {
        producto_id: number;
        variante_id?: number;
        tipo: string;
        cantidad: number;
        costo_total_usd_cents: number;
        referencia_tipo?: string;
      };
      if (m.tipo !== 'ENTRADA' || m.referencia_tipo !== 'COMPRA') continue;
      const e = entradas.get(m.producto_id) ?? { cantidad: 0, costo: 0, variante_id: m.variante_id };
      e.cantidad += m.cantidad || 0;
      e.costo += m.costo_total_usd_cents || 0;
      entradas.set(m.producto_id, e);
    }

    const avisos: string[] = [];
    const incluidos = [...productos.values()]
      .filter((p) => {
        if ((entradas.get(p.id)?.cantidad ?? 0) > 0) return true;
        avisos.push(
          `'${p.nombre}' está anotado en este paquete, pero no hay registro de cuántas unidades entraron con él. No se incluyó.`
        );
        return false;
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    // El flete y los otros gastos, repartidos como los repartía la versión
    // anterior: por las unidades que entraron (o por peso si todos pesaban).
    const unidades = incluidos.map((p) => ({
      producto_id: p.id,
      unidades: entradas.get(p.id)!.cantidad,
      peso_unitario_mlb: p.peso_unitario_mlb,
    }));
    const envio = repartirFlete(compra.envio_total_usd_cents || 0, unidades);
    const otros = repartirFlete(compra.otros_costos_usd_cents || 0, unidades);

    const lineas: CompraLinea[] = incluidos.map((p, i) => {
      const e = entradas.get(p.id)!;
      // La base por unidad (tienda + impuesto) es exactamente la que entró a
      // la bodega: el movimiento guardó unidades × base.
      const base = p.costo_base_unitario_usd_cents ?? Math.round(e.costo / e.cantidad);
      const tienda =
        p.precio_tienda_unitario_usd_cents && p.precio_tienda_unitario_usd_cents > 0
          ? p.precio_tienda_unitario_usd_cents
          : Math.round((base * 10000) / (10000 + taxBp));
      const envioL = envio.get(p.id) ?? 0;
      const otrosL = otros.get(p.id) ?? 0;
      const costoLinea = e.cantidad * base + envioL + otrosL;
      return {
        id: i + 1,
        compra_id,
        producto_id: p.id,
        variante_id: e.variante_id,
        descripcion: p.nombre,
        cantidad: e.cantidad,
        precio_linea_usd_cents: e.cantidad * tienda,
        // El impuesto se sumó por unidad, redondeado cada vez. Se respeta tal
        // cual para que la línea cuadre con lo que la bodega registró.
        tax_linea_usd_cents: e.cantidad * (base - tienda),
        exento: base === tienda ? true : undefined,
        peso_linea_mlb: 0,
        peso_estimado: true,
        envio_asignado_usd_cents: envioL,
        otros_asignados_usd_cents: otrosL,
        costo_linea_usd_cents: costoLinea,
        costo_unitario_usd_cents: Math.round(costoLinea / e.cantidad),
        destino: 'INVENTARIO',
        orden: i,
        producto_nombre: p.nombre,
      };
    });

    const suma = (f: (l: CompraLinea) => number) => lineas.reduce((s, l) => s + f(l), 0);
    return {
      lineas,
      subtotal_productos_usd_cents: suma((l) => l.precio_linea_usd_cents),
      tax_total_usd_cents: suma((l) => l.tax_linea_usd_cents),
      envio_total_usd_cents: compra.envio_total_usd_cents || 0,
      otros_costos_usd_cents: compra.otros_costos_usd_cents || 0,
      total_usd_cents: suma((l) => l.costo_linea_usd_cents),
      unidades_totales: suma((l) => l.cantidad),
      avisos,
    };
  }

  /** Guarda en el paquete el contenido reconstruido. Sólo escribe el paquete. */
  static async completarReconstruccion(compra_id: number, evento_grupo_id: string): Promise<number> {
    const anterior = await leerDoc<CompraDoc>('compras', compra_id);
    const r = await this.reconstruir(compra_id);
    if (r.lineas.length === 0) {
      throw new Error('No hay productos con entradas registradas para este paquete.');
    }

    await aplicarLote([
      {
        coleccion: 'compras',
        id: compra_id,
        merge: true,
        datos: sinUndefined({
          lineas: r.lineas.map(({ producto_nombre: _n, ...l }) => l),
          subtotal_productos_usd_cents: r.subtotal_productos_usd_cents,
          tax_total_usd_cents: r.tax_total_usd_cents,
          total_usd_cents: r.total_usd_cents,
          criterio_flete:
            r.envio_total_usd_cents + r.otros_costos_usd_cents === 0 ? 'SIN_FLETE' : 'UNIDADES',
          reconstruido: true,
          actualizado_en: new Date().toISOString(),
        }),
      },
    ]);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'compras',
      entidad_id: compra_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior as unknown as Record<string, unknown>,
      detalle: `Contenido del paquete ${anterior?.codigo ?? compra_id} completado: ${r.lineas.length} producto(s)`,
    });

    return r.lineas.length;
  }

  /**
   * Los paquetes en los que vino un producto, con la línea de cada uno.
   *
   * Es de donde sale su costo, y lo que se muestra para que se pueda
   * comprobar a mano.
   */
  static async historialDeProducto(producto_id: number): Promise<EntradaDeProducto[]> {
    const p = await leerDoc<ProductoDoc>('productos', producto_id);
    if (!p) return [];
    const ids = [...new Set([...(p.paquetes ?? []), ...(p.paquete_id ? [p.paquete_id] : [])])];
    const compras = await leerVarios<CompraDoc>('compras', ids);

    const salida: EntradaDeProducto[] = [];
    for (const c of compras.values()) {
      if (!c.activo) continue;
      for (const l of c.lineas || []) {
        if (l.producto_id !== producto_id || l.destino !== 'INVENTARIO') continue;
        salida.push({ compra_id: c.id, codigo: c.codigo, fecha: c.fecha, estado: c.estado, linea: l });
      }
    }
    return salida.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.compra_id - a.compra_id);
  }

  static async archivar(compra_id: number, evento_grupo_id: string): Promise<void> {
    const actual = await leerDoc<CompraDoc>('compras', compra_id);
    if (!actual) throw new Error(`El paquete #${compra_id} no existe.`);

    // Lo que ya entró a la bodega no se puede "desregistrar": las unidades
    // seguirían adentro sin paquete que las explique.
    if (
      actual.estado === 'RECIBIDA' &&
      ((actual.lineas || []).length > 0 || (await this.tieneProductosAnotados(compra_id)))
    ) {
      throw new Error(
        'Este paquete ya está en el inventario y no se puede eliminar. Si algo está mal, usá "Corregir".'
      );
    }

    await aplicarLote([
      {
        coleccion: 'compras',
        id: compra_id,
        merge: true,
        datos: { activo: false, actualizado_en: new Date().toISOString() },
      },
    ]);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'compras',
      entidad_id: compra_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: actual as unknown as Record<string, unknown>,
      detalle: `Paquete ${actual.codigo} eliminado`,
    });
  }
}

