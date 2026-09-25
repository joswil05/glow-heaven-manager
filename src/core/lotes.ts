/**
 * Inventario por lotes: lo primero que entra es lo primero que sale.
 *
 * Cada paquete deja, por cada línea de bodega, un lote con su costo real. Una
 * venta saca del lote más viejo de esa talla, y se lleva el costo de ESAS
 * unidades, no un promedio. Hasta la 2.13 el costo era promedio ponderado: si
 * quedaban 4 boxers de $8.49 y llegaban 10 de $6.35, las cuatro primeras ventas
 * se medían contra $6.96 y su ganancia se veía más alta de lo que fue.
 *
 * Reglas de los centavos (todo en enteros):
 *
 * - Un lote guarda unidades y valor. El costo unitario se deriva.
 * - Sacar `k` de `n` unidades que valen `V` cuesta `V − round(V·(n−k)/n)`, y
 *   vaciarlo se lleva `V` entero. Así la suma de lo que sale más lo que queda
 *   es siempre exactamente lo que entró.
 * - Los lotes agotados no se borran: guardan lo que dejaron (para "cuánto te
 *   dejó el paquete") y reciben las devoluciones.
 *
 * Ver `docs/PLAN_LOTES_Y_ENCARGOS.md`, sección 4.
 */
import { repartirMayorResiduo } from './prorrateo';

import type { Lote, Consumo, OrigenLote } from '../shared/types';

export type { Lote, Consumo, OrigenLote };

export type MotivoSalida = 'VENTA' | 'BAJA';

/** La fecha que ordena primero a lo que había antes de los lotes. */
export const FECHA_SALDO = '2000-01-01';

function entero(valor: unknown, porDefecto = 0): number {
  const n = Math.round(Number(valor));
  return Number.isFinite(n) ? n : porDefecto;
}

/** Primero lo más viejo; a igual fecha, el que entró antes. */
export function ordenFIFO(a: Lote, b: Lote): number {
  return (
    (a.fecha || '').localeCompare(b.fecha || '') ||
    (a.orden || 0) - (b.orden || 0) ||
    a.id.localeCompare(b.id)
  );
}

function clonar(lotes: readonly Lote[]): Lote[] {
  return lotes.map((l) => ({ ...l }));
}

/** Un lote con los contadores en cero. */
export function crearLote(
  datos: Pick<Lote, 'id' | 'variante_id' | 'cantidad' | 'valor_usd_cents' | 'fecha' | 'orden' | 'origen'> &
    Partial<Pick<Lote, 'compra_id' | 'compra_codigo' | 'compra_linea_id' | 'costo_unitario_usd_cents'>>
): Lote {
  const cantidad = Math.max(0, entero(datos.cantidad));
  const valor = Math.max(0, entero(datos.valor_usd_cents));
  return {
    id: datos.id,
    variante_id: entero(datos.variante_id, 1),
    cantidad,
    valor_usd_cents: valor,
    cantidad_inicial: cantidad,
    costo_unitario_usd_cents:
      datos.costo_unitario_usd_cents ?? (cantidad > 0 ? Math.round(valor / cantidad) : 0),
    fecha: datos.fecha,
    orden: entero(datos.orden),
    origen: datos.origen,
    compra_id: datos.compra_id,
    compra_codigo: datos.compra_codigo,
    compra_linea_id: datos.compra_linea_id,
    vendidas: 0,
    ingreso_usd_cents: 0,
    costo_vendido_usd_cents: 0,
    bajas: 0,
  };
}

/** Lo que cuesta sacar `k` de `n` unidades que valen `valor`. */
export function costoDeSacar(n: number, valor: number, k: number): number {
  if (k <= 0 || n <= 0) return 0;
  if (k >= n) return valor;
  return valor - Math.round((valor * (n - k)) / n);
}

export function valorDeLotes(lotes: readonly Lote[]): number {
  return lotes.reduce((s, l) => s + Math.max(0, l.valor_usd_cents || 0), 0);
}

export function unidadesDeLotes(lotes: readonly Lote[], variante_id?: number): number {
  return lotes
    .filter((l) => variante_id === undefined || l.variante_id === variante_id)
    .reduce((s, l) => s + Math.max(0, l.cantidad || 0), 0);
}

/** Lo que cuesta cada unidad de un lote hoy, redondeado. */
export function costoUnitarioDeLote(l: Pick<Lote, 'cantidad' | 'valor_usd_cents'>): number {
  return l.cantidad > 0 ? Math.round(l.valor_usd_cents / l.cantidad) : 0;
}

/**
 * El costo con el que se calcula el precio: el del lote más caro que queda.
 * Así ninguna unidad se vende por debajo del margen pedido. Cero si no queda
 * nada.
 */
export function costoBase(lotes: readonly Lote[]): number {
  let max = 0;
  for (const l of lotes) {
    if (l.cantidad > 0) max = Math.max(max, costoUnitarioDeLote(l));
  }
  return max;
}

export interface ResultadoSalidaLotes {
  lotes: Lote[];
  consumos: Consumo[];
  /** Lo que costaron las unidades que salieron. */
  costo_usd_cents: number;
  retiradas: number;
  /** Lo que se pidió y no había. */
  faltantes: number;
}

/**
 * Saca unidades de una talla, del lote más viejo al más nuevo.
 *
 * `ingreso_usd_cents`, en una venta, es lo que se cobró por todas las
 * unidades; se reparte entre los lotes por unidades, al centavo.
 */
export function sacarFIFO(
  lotes: readonly Lote[],
  variante_id: number,
  cantidad: number,
  motivo: MotivoSalida,
  ingreso_usd_cents?: number
): ResultadoSalidaLotes {
  const salida = clonar(lotes);
  let pendiente = Math.max(0, entero(cantidad));
  const consumos: Consumo[] = [];
  let costo = 0;

  const candidatos = salida
    .filter((l) => l.variante_id === variante_id && l.cantidad > 0)
    .sort(ordenFIFO);

  for (const l of candidatos) {
    if (pendiente === 0) break;
    const k = Math.min(pendiente, l.cantidad);
    const c = costoDeSacar(l.cantidad, l.valor_usd_cents, k);
    l.cantidad -= k;
    l.valor_usd_cents -= c;
    if (motivo === 'VENTA') {
      l.vendidas += k;
      l.costo_vendido_usd_cents += c;
    } else {
      l.bajas += k;
    }
    pendiente -= k;
    costo += c;
    consumos.push({
      lote_id: l.id,
      variante_id: l.variante_id,
      cantidad: k,
      costo_usd_cents: c,
      fecha: l.fecha,
      orden: l.orden,
      origen: l.origen,
      compra_id: l.compra_id,
      compra_codigo: l.compra_codigo,
      compra_linea_id: l.compra_linea_id,
      costo_unitario_usd_cents: l.costo_unitario_usd_cents,
    });
  }

  if (motivo === 'VENTA' && ingreso_usd_cents !== undefined && consumos.length > 0) {
    const reparto = repartirMayorResiduo(
      entero(ingreso_usd_cents),
      consumos.map((c, i) => ({ id: i, base_valor: c.cantidad }))
    );
    consumos.forEach((c, i) => {
      c.ingreso_usd_cents = reparto.get(i) ?? 0;
      const l = salida.find((x) => x.id === c.lote_id)!;
      l.ingreso_usd_cents += c.ingreso_usd_cents;
    });
  }

  const retiradas = Math.max(0, entero(cantidad)) - pendiente;
  return { lotes: salida.sort(ordenFIFO), consumos, costo_usd_cents: costo, retiradas, faltantes: pendiente };
}

/** El costo de las próximas `cantidad` unidades de una talla, sin sacarlas. */
export function costoDeLasProximas(lotes: readonly Lote[], variante_id: number, cantidad: number): number {
  return sacarFIFO(lotes, variante_id, cantidad, 'BAJA').costo_usd_cents;
}

/**
 * Devuelve lo que se llevó una salida, cada unidad a su lote y con su costo.
 * Si el lote ya no está (un documento viejo), se rearma con lo que guardó el
 * consumo.
 */
export function devolverConsumos(
  lotes: readonly Lote[],
  consumos: readonly Consumo[],
  motivo: MotivoSalida
): Lote[] {
  const salida = clonar(lotes);
  for (const c of consumos) {
    const k = Math.max(0, entero(c.cantidad));
    const costo = Math.max(0, entero(c.costo_usd_cents));
    let l = salida.find((x) => x.id === c.lote_id);
    if (!l) {
      l = crearLote({
        id: c.lote_id,
        variante_id: c.variante_id,
        cantidad: 0,
        valor_usd_cents: 0,
        fecha: c.fecha,
        orden: c.orden,
        origen: c.origen,
        compra_id: c.compra_id,
        compra_codigo: c.compra_codigo,
        compra_linea_id: c.compra_linea_id,
        costo_unitario_usd_cents: c.costo_unitario_usd_cents,
      });
      l.cantidad_inicial = 0;
      salida.push(l);
    }
    l.cantidad += k;
    l.valor_usd_cents += costo;
    if (motivo === 'VENTA') {
      l.vendidas = Math.max(0, l.vendidas - k);
      l.costo_vendido_usd_cents = Math.max(0, l.costo_vendido_usd_cents - costo);
      l.ingreso_usd_cents = Math.max(0, l.ingreso_usd_cents - Math.max(0, entero(c.ingreso_usd_cents)));
    } else {
      l.bajas = Math.max(0, l.bajas - k);
    }
  }
  return salida.sort(ordenFIFO);
}

/**
 * Corrige el costo del lote de una línea de paquete.
 *
 * La diferencia es la de la línea entera; al lote le toca la parte de las
 * unidades que le quedan. Lo vendido conserva el costo con que salió.
 */
export function corregirLote(
  lotes: readonly Lote[],
  lote_id: string,
  diferencia_linea_usd_cents: number,
  unidades_de_la_linea: number,
  nuevo_costo_unitario_usd_cents?: number
): { lotes: Lote[]; aplicado_usd_cents: number; unidades_afectadas: number } {
  const salida = clonar(lotes);
  const l = salida.find((x) => x.id === lote_id);
  const diferencia = entero(diferencia_linea_usd_cents);
  if (!l) return { lotes: salida, aplicado_usd_cents: 0, unidades_afectadas: 0 };
  if (nuevo_costo_unitario_usd_cents !== undefined) {
    l.costo_unitario_usd_cents = entero(nuevo_costo_unitario_usd_cents);
  }
  const unidades = Math.max(1, entero(unidades_de_la_linea, 1));
  const afectadas = Math.min(l.cantidad, unidades);
  if (afectadas === 0 || diferencia === 0) {
    return { lotes: salida, aplicado_usd_cents: 0, unidades_afectadas: afectadas };
  }
  const antes = l.valor_usd_cents;
  l.valor_usd_cents = Math.max(0, antes + Math.round((diferencia * afectadas) / unidades));
  return { lotes: salida, aplicado_usd_cents: l.valor_usd_cents - antes, unidades_afectadas: afectadas };
}

export interface ProductoParaLotes {
  variantes: { id: number; existencias?: number; activo?: boolean }[];
  valor_inventario_usd_cents?: number;
  costo_unitario_usd_cents?: number;
  lotes?: Lote[];
  /** El último paquete que lo trajo, para rotular el saldo. */
  paquete_id?: number;
}

/**
 * Deja los lotes de un producto cuadrados con sus existencias y su valor.
 *
 * Es la migración, y no hay otra: se aplica dentro de cada transacción que
 * mueve un producto, y la pantalla la aplica al mostrarlo.
 *
 * - Un producto sin lotes (todos los anteriores a la 2.14) recibe un lote
 *   "saldo" por talla con existencias, con el valor de la bodega repartido
 *   por unidades.
 * - Si no cuadran (la app vieja vendió mientras ella no actualizaba), las
 *   unidades que sobran salen del lote más viejo y las que faltan entran como
 *   saldo. El valor que no cuadre se ajusta en el lote más viejo.
 *
 * Nunca cambia lo que vale la bodega: el total de los lotes termina siendo el
 * valor guardado del producto.
 */
export function normalizarLotes(p: ProductoParaLotes, paquete_codigo?: string): {
  lotes: Lote[];
  cambiado: boolean;
} {
  const original = p.lotes ?? [];
  const lotes = clonar(original);
  const objetivo = new Map<number, number>();
  for (const v of p.variantes || []) {
    objetivo.set(v.id, v.activo === false ? 0 : Math.max(0, entero(v.existencias)));
  }

  // 1. Unidades, talla por talla.
  const saldosNuevos: Lote[] = [];
  const tallas = new Set([...objetivo.keys(), ...lotes.map((l) => l.variante_id)]);
  for (const vid of tallas) {
    const quiere = objetivo.get(vid) ?? 0;
    const tiene = unidadesDeLotes(lotes, vid);
    if (tiene > quiere) {
      // Salidas que no pasaron por los lotes: se sacan del más viejo, sin
      // contarlas como venta ni como baja porque no se sabe qué fueron.
      let sobran = tiene - quiere;
      for (const l of lotes.filter((x) => x.variante_id === vid && x.cantidad > 0).sort(ordenFIFO)) {
        if (sobran === 0) break;
        const k = Math.min(sobran, l.cantidad);
        l.valor_usd_cents -= costoDeSacar(l.cantidad, l.valor_usd_cents, k);
        l.cantidad -= k;
        sobran -= k;
      }
    } else if (quiere > tiene) {
      const usados = new Set(lotes.map((l) => l.id));
      let id = `saldo-${vid}`;
      for (let i = 2; usados.has(id); i++) id = `saldo-${vid}-${i}`;
      const saldo = crearLote({
        id,
        variante_id: vid,
        cantidad: quiere - tiene,
        valor_usd_cents: 0,
        fecha: FECHA_SALDO,
        orden: 0,
        origen: 'SALDO',
        compra_id: p.paquete_id,
        compra_codigo: p.paquete_id ? paquete_codigo : undefined,
      });
      saldosNuevos.push(saldo);
      lotes.push(saldo);
    }
  }

  // Un lote sin unidades no vale nada.
  for (const l of lotes) if (l.cantidad <= 0) { l.cantidad = 0; l.valor_usd_cents = 0; }

  // 2. Valor. El guardado manda; un producto viejo sin valor anotado vale sus
  //    existencias por su costo, igual que en la lista del inventario.
  const unidades = unidadesDeLotes(lotes);
  let valor = Math.max(0, entero(p.valor_inventario_usd_cents));
  if (valor === 0 && unidades > 0) valor = unidades * Math.max(0, entero(p.costo_unitario_usd_cents));
  if (unidades === 0) valor = 0;

  let diferencia = valor - valorDeLotes(lotes);
  if (saldosNuevos.length > 0 && diferencia > 0) {
    const reparto = repartirMayorResiduo(
      diferencia,
      saldosNuevos.map((s, i) => ({ id: i, base_valor: s.cantidad }))
    );
    saldosNuevos.forEach((s, i) => {
      s.valor_usd_cents += reparto.get(i) ?? 0;
    });
    diferencia = 0;
  }
  const conUnidades = lotes.filter((l) => l.cantidad > 0).sort(ordenFIFO);
  if (diferencia > 0 && conUnidades.length > 0) {
    conUnidades[0].valor_usd_cents += diferencia;
  } else if (diferencia < 0) {
    let falta = -diferencia;
    for (const l of conUnidades) {
      if (falta === 0) break;
      const q = Math.min(falta, l.valor_usd_cents);
      l.valor_usd_cents -= q;
      falta -= q;
    }
  }
  for (const s of saldosNuevos) {
    s.costo_unitario_usd_cents = costoUnitarioDeLote(s);
    s.cantidad_inicial = s.cantidad;
  }

  lotes.sort(ordenFIFO);
  const cambiado = p.lotes === undefined || JSON.stringify(lotes) !== JSON.stringify([...original].sort(ordenFIFO));
  return { lotes, cambiado };
}

/**
 * Lo que un producto escribe después de mover sus lotes: las existencias de
 * cada talla salen de los lotes, igual que el valor y el costo base.
 */
export function camposDesdeLotes<V extends { id: number; existencias: number; activo?: boolean }>(
  variantes: readonly V[],
  lotes: readonly Lote[],
  costo_guardado_usd_cents: number
): {
  variantes: V[];
  valor_inventario_usd_cents: number;
  costo_unitario_usd_cents: number;
} {
  const nuevas = variantes.map((v) => ({ ...v, existencias: unidadesDeLotes(lotes, v.id) }));
  const base = costoBase(lotes);
  return {
    variantes: nuevas,
    valor_inventario_usd_cents: valorDeLotes(lotes),
    // Agotado, no pasa a costar cero: se queda con el último costo conocido.
    costo_unitario_usd_cents: base > 0 ? base : Math.max(0, entero(costo_guardado_usd_cents)),
  };
}
