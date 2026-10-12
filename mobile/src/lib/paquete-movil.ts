/**
 * "Llegó un paquete" del celular: lo que arman sus hojas con lo que escribe
 * Ross, aparte de la vista para poder probarlo solo.
 *
 * Joswill (11/10) pidió que fuera igual de completo que el editor de la PC
 * (`PaqueteEditor`): packs, impuesto por línea, peso por línea, piezas de
 * encargo, editar una línea, un producto nuevo con su ficha, otros gastos,
 * el precio antes y después, y corregir un paquete que ya entró. Nada de la
 * cuenta vive acá: el costeo, el reparto, los lotes y los precios son los del
 * núcleo (`core/paquete.ts`), y lo que se manda al repositorio son los mismos
 * campos que manda la PC (`LineaCompraInput`).
 */
import type { CrearProductoInput, LineaCompraInput } from '@shared/ipc-contracts';
import type { Categoria, CompraLinea, ModoPrecio, ProductoConStock, Venta, VentaCompleta, VentaLinea } from '@shared/types';
import {
  calcularPaquete,
  efectoDeCorreccion,
  efectoDeEntradas,
  lotesDeLinea,
  type EfectoEnProducto,
  type EntradaDeLinea,
  type PaqueteCalculado,
  type ProductoAntesDelPaquete,
} from '@core/paquete';
import { margenEfectivo } from '@core/precios';
import { parsearACentavos, parsearDecimal } from '@core/numeros';
import { repartirMayorResiduo } from '@core/prorrateo';
import { estadoPieza, sinPaquete } from '@core/encargos';
import { formatearMoneda } from '@core/moneda';
import { normalizar } from '@core/texto';
import { formatearNombreEntidad, formatearTextoGeneral } from '@shared/formatoTexto';

// ---------------------------------------------------------------------------
// Una pieza: cuántas vinieron, cómo y cuánto costó
// ---------------------------------------------------------------------------

/** Una fila de cantidad: la única, o una por talla o tono. */
export interface FilaCantidad {
  variante_id?: number;
  /** "M · Rojo". Sin nombre es la fila única. */
  nombre?: string;
  /** Unidades, o packs si vino en pack. */
  texto: string;
}

/** Lo que se escribe de una pieza, tal cual. */
export interface TextosPieza {
  enPack: boolean;
  filas: FilaCantidad[];
  /** Por unidad, o por pack si vino en pack. */
  precio: string;
  unidadesPorPack: string;
  /** La tienda cobró el impuesto. Apagado es `exento`. */
  pagoImpuesto: boolean;
  /** Libras de todas estas unidades juntas. Vacío: se estima. */
  peso: string;
}

export interface ErroresPieza {
  cantidad?: string;
  unidadesPorPack?: string;
  precio?: string;
  peso?: string;
  /** La fila de cantidad con el error, si hay varias. */
  fila?: number;
}

/** Lo que una línea dice de sí misma, aparte de cantidades y montos. */
export type BaseDeLinea = Pick<
  LineaCompraInput,
  'id' | 'producto_id' | 'variante_id' | 'descripcion' | 'destino' | 'venta_id' | 'venta_linea_id'
>;

export const nombreDeVariante = (v: { talla?: string; color?: string }): string =>
  [v.talla, v.color].map((x) => x?.trim()).filter(Boolean).join(' · ');

/** Con tallas, una fila por talla activa (como la PC, una línea por talla). */
export function filasDeProducto(p?: ProductoConStock | null): FilaCantidad[] {
  const activas = p?.variantes.filter((v) => v.activo !== false) ?? [];
  if (p?.tiene_variantes && activas.length > 1) {
    return activas.map((v) => ({ variante_id: v.id, nombre: nombreDeVariante(v) || 'Única', texto: '' }));
  }
  return [{ variante_id: activas[0]?.id, texto: '1' }];
}

/** Cómo arranca la hoja para un producto: si se vende por pack, en pack. */
export function textosParaProducto(p?: ProductoConStock | null): TextosPieza {
  const porPack = p?.unidades_por_paquete ?? 0;
  return {
    enPack: porPack > 1,
    filas: filasDeProducto(p),
    precio: '',
    unidadesPorPack: String(porPack > 1 ? porPack : 5),
    pagoImpuesto: true,
    peso: '',
  };
}

/** Una línea ya agregada, de vuelta en la hoja para editarla. */
export function textosDeLinea(l: LineaCompraInput, nombre?: string): TextosPieza {
  const enPack = Boolean(l.es_multipack && l.packs_comprados && l.unidades_por_pack);
  return {
    enPack,
    filas: [{ variante_id: l.variante_id, nombre, texto: String(enPack ? l.packs_comprados : l.cantidad) }],
    precio: enPack
      ? ((l.precio_por_pack_usd_cents ?? 0) / 100).toFixed(2)
      : (l.precio_linea_usd_cents / Math.max(1, l.cantidad) / 100).toFixed(2),
    unidadesPorPack: String(enPack ? l.unidades_por_pack : 5),
    pagoImpuesto: !l.exento,
    peso: l.peso_linea_mlb === null || l.peso_linea_mlb === undefined ? '' : String(l.peso_linea_mlb / 1000),
  };
}

const enteroDe = (texto: string, min: number): number | null => {
  const v = parsearDecimal(texto, { min });
  return v !== null && Number.isSafeInteger(v) ? v : null;
};

/**
 * "Por unidad" o "En pack" con lo mismo que ya se escribió: 2 packs de 5 a
 * $20 pasan a 10 unidades a $4, y al revés. La PC guarda los dos juegos de
 * campos por separado; acá el campo es uno solo y se convierte. Unidades que
 * no llenan packs enteros quedan vacías para escribirlas: inventar packs
 * cambiaría lo que vino.
 */
export function cambiarModo(t: TextosPieza, enPack: boolean): TextosPieza {
  if (t.enPack === enPack) return t;
  const porPack = enteroDe(t.unidadesPorPack, 1);
  if (porPack === null) return { ...t, enPack };
  const filas = t.filas.map((f) => {
    const n = f.texto.trim() ? enteroDe(f.texto, 0) : null;
    if (n === null) return f;
    if (!enPack) return { ...f, texto: String(n * porPack) };
    return { ...f, texto: n % porPack === 0 ? String(n / porPack) : '' };
  });
  const precio = t.precio.trim() ? parsearACentavos(t.precio, { min: 0 }) : null;
  return {
    ...t,
    enPack,
    filas,
    precio: precio === null ? t.precio : ((enPack ? precio * porPack : Math.round(precio / porPack)) / 100).toFixed(2),
  };
}

/** Lo que define el precio de la línea: si no cambió, el precio guardado se conserva. */
const firmaDePrecio = (t: TextosPieza) =>
  JSON.stringify([t.enPack, t.filas.map((f) => f.texto.trim()), t.precio.trim(), t.enPack ? t.unidadesPorPack.trim() : '']);

/**
 * Lee la hoja de una pieza y arma sus líneas, con los mismos campos que arma
 * la PC (`PaqueteEditor.armarInput`). Con varias filas sale una línea por
 * talla que trajo algo; el peso escrito se reparte entre ellas por unidades.
 */
export function leerPieza(
  t: TextosPieza,
  base: BaseDeLinea,
  opciones: { original?: LineaCompraInput; cantidadFija?: boolean } = {}
): { errores: ErroresPieza; lineas: LineaCompraInput[] } {
  const errores: ErroresPieza = {};
  const varias = t.filas.length > 1;

  const porPack = t.enPack ? enteroDe(t.unidadesPorPack, 1) : 1;
  if (porPack === null) errores.unidadesPorPack = 'Escribí cuántas unidades trae cada pack, un número entero.';

  const cuentas: { fila: FilaCantidad; n: number }[] = [];
  t.filas.forEach((fila, i) => {
    if (errores.cantidad) return;
    const vacia = !fila.texto.trim();
    if (varias && vacia) return;
    const n = enteroDe(fila.texto, varias ? 0 : 1);
    if (n === null) {
      errores.cantidad = varias
        ? 'Escribí un número entero, o dejalo vacío si no vino.'
        : t.enPack
          ? 'Escribí cuántos packs vinieron, un número entero mayor que cero.'
          : 'Escribí una cantidad entera, mayor que cero.';
      if (varias) errores.fila = i;
      return;
    }
    if (n > 0) cuentas.push({ fila, n });
  });
  if (!errores.cantidad && cuentas.length === 0) {
    errores.cantidad = 'Escribí cuántas vinieron de al menos una talla o tono.';
    errores.fila = 0;
  }

  const precio = parsearACentavos(t.precio, { min: 0 });
  if (precio === null || !Number.isSafeInteger(precio)) {
    errores.precio = t.enPack ? 'Escribí lo que pagaste por cada pack, en dólares.' : 'Escribí lo que pagaste por unidad, en dólares.';
  }

  const libras = t.peso.trim() ? parsearDecimal(t.peso, { min: 0.001 }) : null;
  const pesoMlb = libras === null ? null : Math.round(libras * 1000);
  if (t.peso.trim() && (pesoMlb === null || !Number.isSafeInteger(pesoMlb))) {
    errores.peso = 'Escribí un peso mayor que cero o dejalo vacío.';
  }

  const original = opciones.original;
  if (!errores.cantidad && opciones.cantidadFija && original) {
    const unidades = cuentas.reduce((s, c) => s + c.n * (porPack ?? 1), 0);
    if (unidades !== original.cantidad) {
      errores.cantidad = 'Esas unidades ya entraron al inventario: la cantidad no se corrige acá.';
    }
  }
  if (Object.keys(errores).length > 0) return { errores, lineas: [] };

  const unidadesDe = (c: { n: number }) => c.n * porPack!;
  for (const c of cuentas) {
    if (!Number.isSafeInteger(unidadesDe(c)) || !Number.isSafeInteger(c.n * precio!)) {
      return { errores: { precio: 'El importe es demasiado grande. Revisá la cantidad y el precio.' }, lineas: [] };
    }
  }

  // El peso escrito es el de todas juntas: se reparte por unidades, exacto.
  const pesos = pesoMlb === null
    ? null
    : repartirMayorResiduo(pesoMlb, cuentas.map((c, i) => ({ id: i, base_valor: unidadesDe(c) })));
  const conservarPrecio =
    original !== undefined && cuentas.length === 1 && firmaDePrecio(t) === firmaDePrecio(textosDeLinea(original));

  const lineas = cuentas.map((c, i): LineaCompraInput => ({
    ...base,
    variante_id: c.fila.variante_id ?? base.variante_id,
    cantidad: unidadesDe(c),
    precio_linea_usd_cents: conservarPrecio ? original!.precio_linea_usd_cents : c.n * precio!,
    exento: t.pagoImpuesto ? undefined : true,
    peso_linea_mlb: pesos ? pesos.get(i) ?? 0 : null,
    es_multipack: t.enPack || undefined,
    packs_comprados: t.enPack ? c.n : undefined,
    unidades_por_pack: t.enPack ? porPack! : undefined,
    precio_por_pack_usd_cents: t.enPack ? precio! : undefined,
  }));
  return { errores, lineas };
}

/** "3 unidades", o "2 packs × 5 = 10 unidades". */
export function textoCantidad(l: Pick<LineaCompraInput, 'cantidad' | 'es_multipack' | 'packs_comprados' | 'unidades_por_pack'>): string {
  const unidades = `${l.cantidad} ${l.cantidad === 1 ? 'unidad' : 'unidades'}`;
  if (!l.es_multipack || !l.packs_comprados || !l.unidades_por_pack) return unidades;
  return `${l.packs_comprados} ${l.packs_comprados === 1 ? 'pack' : 'packs'} × ${l.unidades_por_pack} = ${unidades}`;
}

/**
 * Una línea guardada, de vuelta como se escribió. El peso que salió del
 * reparto no es un peso escrito: vuelve vacío para que se siga estimando
 * (la misma regla que la PC y que `pesoManualGuardado` del repositorio).
 */
export function lineaDeGuardada(l: CompraLinea): LineaCompraInput {
  const escrito = l.peso_estimado === false || (l.peso_estimado === undefined && l.peso_linea_mlb > 0);
  return {
    id: l.id,
    producto_id: l.producto_id,
    variante_id: l.variante_id,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_linea_usd_cents: l.precio_linea_usd_cents,
    exento: l.exento ? true : undefined,
    peso_linea_mlb: escrito ? l.peso_linea_mlb : null,
    destino: l.destino,
    venta_id: l.venta_id,
    venta_linea_id: l.venta_linea_id,
    es_multipack: l.es_multipack,
    packs_comprados: l.packs_comprados,
    unidades_por_pack: l.unidades_por_pack,
    precio_por_pack_usd_cents: l.precio_por_pack_usd_cents,
  };
}

// ---------------------------------------------------------------------------
// La cuenta en vivo y lo que le hace a cada producto
// ---------------------------------------------------------------------------

export interface DatosVista {
  tax_bp: number;
  envio_total_usd_cents: number;
  otros_costos_usd_cents: number;
  tax_total_override_usd_cents: number | null;
  peso_total_mlb: number;
  pesoUnitario: (producto_id?: number) => number;
  /**
   * Al corregir, las líneas como estaban. Una a la que no se le tocó el precio
   * ni el impuesto conserva el impuesto que tenía, como en el repositorio.
   */
  originales?: ReadonlyMap<number, CompraLinea>;
}

export const claveDeLinea = (l: LineaCompraInput, i: number): string => (l.id !== undefined ? String(l.id) : `i${i}`);

/** La cuenta del paquete mientras se escribe, sin leer nada: la del núcleo. */
export function calcularVista(lineas: readonly LineaCompraInput[], datos: DatosVista): PaqueteCalculado {
  return calcularPaquete(
    lineas.map((l, i) => {
      const o = l.id !== undefined ? datos.originales?.get(l.id) : undefined;
      const mismoImpuesto = o !== undefined && o.precio_linea_usd_cents === l.precio_linea_usd_cents && Boolean(o.exento) === Boolean(l.exento);
      return {
        clave: claveDeLinea(l, i),
        producto_id: l.producto_id,
        destino: l.destino,
        cantidad: l.cantidad,
        precio_linea_usd_cents: l.precio_linea_usd_cents,
        exento: l.exento,
        peso_manual_mlb: l.peso_linea_mlb,
        ...(mismoImpuesto ? { tax_declarado_usd_cents: o!.tax_linea_usd_cents } : {}),
      };
    }),
    datos
  );
}

export interface ContextoPrecios {
  categorias: Categoria[];
  margen_defecto_bp: number;
  paso_redondeo_usd_cents: number;
}

/**
 * De qué producto es una línea de bodega: el suyo o, si todavía no tiene, el
 * que se llama igual (así lo asocia `recibir`). Si no hay ninguno, es uno que
 * nace con el paquete y se lo reconoce por el nombre.
 */
export function claveDeProducto(
  l: LineaCompraInput,
  productos: readonly ProductoConStock[]
): string | null {
  if (l.destino !== 'INVENTARIO') return null;
  if (l.producto_id) return `p${l.producto_id}`;
  const igual = productos.find((p) => normalizar(p.nombre) === normalizar(l.descripcion));
  return igual ? `p${igual.id}` : `n${normalizar(l.descripcion)}`;
}

/**
 * Cómo queda cada producto con el paquete: existencias, costo y el precio
 * antes y después. Es lo que muestra la PC en su columna "Precio de venta",
 * con las mismas funciones del núcleo.
 */
export function efectosDelPaquete(
  lineas: readonly LineaCompraInput[],
  calc: PaqueteCalculado,
  productos: readonly ProductoConStock[],
  ctx: ContextoPrecios,
  correccion?: { compra_id: number; originales: ReadonlyMap<number, CompraLinea> }
): Map<string, EfectoEnProducto> {
  const salida = new Map<string, EfectoEnProducto>();
  const calcPorClave = new Map(calc.lineas.map((c) => [c.clave, c]));
  const grupos = new Map<string, { linea: LineaCompraInput; clave: string }[]>();
  lineas.forEach((l, i) => {
    const k = claveDeProducto(l, productos);
    if (!k) return;
    grupos.set(k, [...(grupos.get(k) ?? []), { linea: l, clave: claveDeLinea(l, i) }]);
  });

  for (const [k, suyas] of grupos) {
    const p = k.startsWith('p') ? productos.find((x) => `p${x.id}` === k) : undefined;
    // Sin sus datos no hay de dónde sacar el precio: mejor no decir nada.
    if (k.startsWith('p') && !p) continue;
    // Uno que nace al recibir: sin categoría, por margen, como lo crea `recibir`.
    const antes: ProductoAntesDelPaquete = p
      ? {
          existencias: p.existencias,
          valor_inventario_usd_cents: p.valor_inventario_usd_cents,
          costo_unitario_usd_cents: p.costo_unitario_usd_cents,
          precio_venta_usd_cents: p.precio_venta_usd_cents,
          modo_precio: p.modo_precio,
          margen_bp: margenEfectivo(p, ctx.categorias, ctx.margen_defecto_bp),
          multiplicador_bp: p.multiplicador_bp,
          precio_manual_usd_cents: p.precio_manual_usd_cents,
          lotes: p.lotes,
        }
      : {
          existencias: 0,
          valor_inventario_usd_cents: 0,
          costo_unitario_usd_cents: 0,
          precio_venta_usd_cents: 0,
          modo_precio: 'MARGEN',
          margen_bp: margenEfectivo({}, ctx.categorias, ctx.margen_defecto_bp),
          lotes: [],
        };
    const tallaPorDefecto = p?.variantes.find((v) => v.activo !== false)?.id ?? 1;
    const esOriginal = (l: LineaCompraInput) => l.id !== undefined && Boolean(correccion?.originales.has(l.id));
    const entradas: EntradaDeLinea[] = suyas
      .filter(({ linea }) => !esOriginal(linea))
      .flatMap(({ linea, clave }) => {
        const c = calcPorClave.get(clave);
        return c ? [{ cantidad: c.cantidad, costo_linea_usd_cents: c.costo_linea_usd_cents, variante_id: linea.variante_id ?? tallaPorDefecto }] : [];
      });

    if (correccion && p) {
      const cambios = suyas
        .filter(({ linea }) => esOriginal(linea))
        .flatMap(({ linea, clave }) => {
          const c = calcPorClave.get(clave);
          const anterior = correccion.originales.get(linea.id!)!;
          const cambio = {
            unidades_de_la_linea: c?.cantidad ?? 0,
            diferencia_usd_cents: (c?.costo_linea_usd_cents ?? 0) - anterior.costo_linea_usd_cents,
            nuevo_costo_unitario_usd_cents: c?.costo_unitario_usd_cents,
          };
          // Un cambio por lote: una línea repartida entre tallas tiene varios.
          const lotes = lotesDeLinea(p.lotes ?? [], correccion.compra_id, linea.id!, linea.variante_id);
          return lotes.length > 0 ? lotes.map((x) => ({ ...cambio, lote_id: x.id })) : [cambio];
        })
        .filter((c) => c.diferencia_usd_cents !== 0);
      salida.set(k, efectoDeCorreccion(antes, cambios, entradas, ctx.paso_redondeo_usd_cents));
    } else {
      salida.set(k, efectoDeEntradas(antes, entradas, ctx.paso_redondeo_usd_cents));
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Antes de pasarlo al inventario
// ---------------------------------------------------------------------------

export interface ResumenRecibir {
  unidades: number;
  productos: number;
  piezasEncargo: number;
  total_usd_cents: number;
  cambianDePrecio: number;
}

export function resumenParaRecibir(
  lineas: readonly LineaCompraInput[],
  calc: PaqueteCalculado,
  efectos: ReadonlyMap<string, Pick<EfectoEnProducto, 'precio_antes_usd_cents' | 'precio_despues_usd_cents'>>
): ResumenRecibir {
  const deBodega = lineas.filter((l) => l.destino === 'INVENTARIO');
  return {
    unidades: deBodega.reduce((s, l) => s + l.cantidad, 0),
    productos: new Set(deBodega.map((l) => l.producto_id ?? normalizar(l.descripcion))).size,
    piezasEncargo: lineas.filter((l) => l.destino === 'ENCARGO').length,
    total_usd_cents: calc.total_pagado_usd_cents,
    cambianDePrecio: [...efectos.values()].filter(
      (e) => e.precio_antes_usd_cents > 0 && e.precio_antes_usd_cents !== e.precio_despues_usd_cents
    ).length,
  };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Lo que dice la confirmación, con las palabras de la PC. */
export function consecuenciasDeRecibir(r: ResumenRecibir): string[] {
  const total = formatearMoneda(r.total_usd_cents, 'USD');
  return [
    r.unidades > 0
      ? `Entran ${plural(r.unidades, 'unidad', 'unidades')} de ${plural(r.productos, 'producto', 'productos')} por ${total}.`
      : `No entra nada a la bodega. El paquete costó ${total}.`,
    ...(r.cambianDePrecio > 0 ? [`${plural(r.cambianDePrecio, 'producto cambia', 'productos cambian')} de precio.`] : []),
    ...(r.piezasEncargo > 0
      ? [r.piezasEncargo === 1 ? '1 pieza va para un encargo.' : `${r.piezasEncargo} piezas van para encargos.`]
      : []),
  ];
}

// ---------------------------------------------------------------------------
// Piezas de encargo
// ---------------------------------------------------------------------------

/** Cómo se agrupan los encargos que puede traer un paquete (como la PC). */
export type GrupoEncargo = 'COMPRADOS' | 'CONFIRMADOS' | 'SIN_CONFIRMAR';
export const TITULO_GRUPO: Record<GrupoEncargo, string> = {
  COMPRADOS: 'Comprados, esperan paquete',
  CONFIRMADOS: 'Por comprar',
  SIN_CONFIRMAR: 'Sin confirmar',
};
const ORDEN_GRUPO: Record<GrupoEncargo, number> = { COMPRADOS: 0, CONFIRMADOS: 1, SIN_CONFIRMAR: 2 };

export function grupoDeEncargo(v: Pick<Venta, 'piezas' | 'estado'>): GrupoEncargo {
  if ((v.piezas?.esperan_paquete ?? 0) > 0) return 'COMPRADOS';
  return v.estado === 'PENDIENTE' ? 'CONFIRMADOS' : 'SIN_CONFIRMAR';
}

/** Los encargos con alguna pieza que todavía no viene en ningún paquete. */
export function encargosQuePuedenVenir(ventas: readonly Venta[]): Venta[] {
  return ventas
    .filter((v) => v.estado === 'COTIZADA' || v.estado === 'PENDIENTE')
    .filter((v) => !v.piezas || sinPaquete(v.piezas) > 0)
    .sort((a, b) => ORDEN_GRUPO[grupoDeEncargo(a)] - ORDEN_GRUPO[grupoDeEncargo(b)]);
}

/** "1 comprada, espera paquete · 2 de 3 por comprar". */
export function textoSinPaquete(v: Pick<Venta, 'piezas'>): string {
  const p = v.piezas;
  if (!p) return 'Por comprar';
  const esperan = p.esperan_paquete ?? 0;
  const porComprar = sinPaquete(p) - esperan;
  const partes: string[] = [];
  if (esperan > 0) partes.push(esperan === 1 ? '1 comprada, espera paquete' : `${esperan} compradas, esperan paquete`);
  if (porComprar > 0) partes.push(`${porComprar} de ${p.total} por comprar`);
  return partes.join(' · ');
}

/**
 * Las piezas de un encargo que pueden venir en este paquete: las que falta
 * comprar y las compradas que esperan paquete (o, con `soloCompradas`, sólo
 * éstas). Nunca una que sale de la bodega, una que no se consiguió ni una que
 * ya viene en otro paquete: no puede venir en dos.
 */
export function piezasQuePuedenVenir(
  venta: Pick<VentaCompleta, 'id' | 'lineas'>,
  lineas: readonly LineaCompraInput[],
  compraId?: number,
  soloCompradas = false
): VentaLinea[] {
  const ya = new Set(lineas.filter((l) => l.venta_id === venta.id).map((l) => l.venta_linea_id));
  return venta.lineas.filter((vl) => {
    if (ya.has(vl.id)) return false;
    const e = estadoPieza(vl);
    if (soloCompradas) return e === 'COMPRADA';
    return e === 'POR_COMPRAR' || e === 'COMPRADA' || (e === 'EN_CAMINO' && compraId !== undefined && vl.compra_id === compraId);
  });
}

export interface PiezaDeEncargoElegida {
  venta_id: number;
  pieza: VentaLinea;
  /** Lo que costó cada una en la tienda. */
  precio: string;
  pagoImpuesto: boolean;
}

export const claveDePieza = (venta_id: number, pieza_id: number) => `${venta_id}:${pieza_id}`;

/** Las piezas elegidas, como líneas del paquete; el error de cada una, en ella. */
export function leerPiezasDeEncargo(elegidas: readonly PiezaDeEncargoElegida[]): {
  errores: Record<string, string>;
  lineas: LineaCompraInput[];
} {
  const errores: Record<string, string> = {};
  const lineas: LineaCompraInput[] = [];
  for (const e of elegidas) {
    const unidad = parsearACentavos(e.precio, { min: 0 });
    const total = unidad === null ? null : unidad * e.pieza.cantidad;
    if (unidad === null || total === null || !Number.isSafeInteger(total)) {
      errores[claveDePieza(e.venta_id, e.pieza.id)] = 'Escribí lo que pagaste por cada una, en dólares.';
      continue;
    }
    lineas.push({
      descripcion: e.pieza.descripcion,
      cantidad: e.pieza.cantidad,
      precio_linea_usd_cents: total,
      exento: e.pagoImpuesto ? undefined : true,
      peso_linea_mlb: null,
      destino: 'ENCARGO',
      venta_id: e.venta_id,
      venta_linea_id: e.pieza.id,
    });
  }
  return { errores, lineas: Object.keys(errores).length > 0 ? [] : lineas };
}

// ---------------------------------------------------------------------------
// La ficha de un producto nuevo
// ---------------------------------------------------------------------------

export interface TallaNueva {
  talla: string;
  color: string;
  /** Cuántas vinieron de esta talla en el paquete (o packs, si vino en pack). */
  cantidad: string;
}

/** Lo mismo que pide la ficha de la PC (`ProductoModal`), menos el aviso de stock. */
export interface TextosFicha {
  categoria_id?: number;
  tieneTallas: boolean;
  tallas: TallaNueva[];
  modo: ModoPrecio;
  /** Vacío: el de la categoría. */
  margen: string;
  multiplicador: string;
  precioFijo: string;
  sePackea: boolean;
  unidadesPorPack: string;
  notas: string;
  /** Miniatura como data URL, o vacío. */
  foto: string;
}

export const fichaVacia = (): TextosFicha => ({
  tieneTallas: false,
  tallas: [],
  modo: 'MARGEN',
  margen: '',
  multiplicador: '2',
  precioFijo: '',
  sePackea: false,
  unidadesPorPack: '5',
  notas: '',
  foto: '',
});

/**
 * Si la ficha dice algo más que el nombre. Con sólo el nombre el producto se
 * crea al recibir el paquete (así un borrador abandonado no deja fichas
 * sueltas); con algo más se crea al agregarlo, como en la PC, porque sus
 * tallas necesitan existir para que cada línea diga cuál vino.
 */
export function fichaTieneDatos(f: TextosFicha): boolean {
  return (
    f.categoria_id !== undefined ||
    f.tieneTallas ||
    f.modo !== 'MARGEN' ||
    f.margen.trim() !== '' ||
    f.sePackea ||
    f.notas.trim() !== '' ||
    f.foto !== ''
  );
}

export interface ErroresFicha {
  nombre?: string;
  precio?: string;
  margen?: string;
  multiplicador?: string;
  tallas?: string;
  tallaVacia?: number;
  pack?: string;
}

/** Valida la ficha y arma lo mismo que manda la PC al crear el producto. */
export function leerFicha(
  nombre: string,
  f: TextosFicha,
  stock_minimo_defecto: number
): { errores: ErroresFicha; input?: CrearProductoInput } {
  const errores: ErroresFicha = {};
  if (!nombre.trim()) errores.nombre = 'Escribí el nombre del producto.';

  const margen = f.margen.trim() ? parsearDecimal(f.margen, { min: 0 }) : null;
  if (f.modo === 'MARGEN' && f.margen.trim() && margen === null) {
    errores.margen = 'Escribí la ganancia en porcentaje, por ejemplo 45.';
  }
  const multiplicador = parsearDecimal(f.multiplicador, { min: 0.01 });
  if (f.modo === 'MULTIPLICADOR' && multiplicador === null) {
    errores.multiplicador = 'Escribí por cuánto se multiplica el costo, por ejemplo 2.';
  }
  const fijo = parsearACentavos(f.precioFijo, { min: 0.01 });
  if (f.modo === 'MANUAL') {
    if (!f.precioFijo.trim()) errores.precio = 'Escribí el precio de venta.';
    else if (fijo === null) errores.precio = 'El precio tiene que ser mayor a $0.00.';
  }
  if (f.tieneTallas) {
    if (f.tallas.length === 0) errores.tallas = 'Agregá al menos una talla o tono.';
    else {
      const vacia = f.tallas.findIndex((t) => !t.talla.trim() && !t.color.trim());
      if (vacia >= 0) {
        errores.tallas = 'Cada fila necesita una talla o un tono.';
        errores.tallaVacia = vacia;
      }
    }
  }
  const porPack = parsearDecimal(f.unidadesPorPack);
  if (f.sePackea && (porPack === null || porPack < 2 || !Number.isInteger(porPack))) {
    errores.pack = 'Un pack trae 2 unidades o más.';
  }
  if (Object.keys(errores).length > 0) return { errores };

  return {
    errores,
    input: {
      nombre: formatearNombreEntidad(nombre),
      categoria_id: f.categoria_id,
      tiene_variantes: f.tieneTallas,
      variantes: f.tieneTallas
        ? f.tallas.map((t) => ({ talla: t.talla.trim() || undefined, color: t.color.trim() || undefined }))
        : undefined,
      modo_precio: f.modo,
      margen_bp: f.modo === 'MARGEN' && margen !== null ? Math.round(margen * 100) : undefined,
      multiplicador_bp: f.modo === 'MULTIPLICADOR' ? Math.round(multiplicador! * 10000) : undefined,
      precio_manual_usd_cents: f.modo === 'MANUAL' ? fijo! : undefined,
      stock_minimo: stock_minimo_defecto,
      unidades_por_paquete: f.sePackea ? porPack! : undefined,
      foto: f.foto || undefined,
      notas: formatearTextoGeneral(f.notas) || undefined,
    },
  };
}
