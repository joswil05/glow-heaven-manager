/**
 * En qué va un encargo.
 *
 * Un encargo es una venta cuya mercadería todavía no se compró. Cada línea es
 * una pieza, y cada pieza sabe de dónde sale: de un paquete (y si ese paquete
 * ya llegó) o de la bodega. La fase del encargo se DERIVA de eso, de su
 * estado guardado y de su cotización; no se escribe a mano, así no se
 * desincroniza.
 *
 * El camino, desde la 2.16, es el de Ross: una clienta le pide algo que ella
 * no sabe cuánto vale; lo busca, le manda la cotización, espera que diga que
 * sí, lo compra, llega y lo entrega. `COTIZADA` quiere decir "todavía no
 * aceptó" y `PENDIENTE`, "aceptó".
 *
 * Ver `docs/PLAN_ENCARGOS_Y_SIN_CONEXION.md`, sección 2, y
 * `docs/PLAN_LOTES_Y_ENCARGOS.md`, sección 5.
 */
import type { EstadoVenta, MotivoAnulacion, PiezasEncargo, TipoDescuento } from '../shared/types';
import { estadoInicialEncargo } from './cobranza';
import { diasEntre } from './fechas';

export type { PiezasEncargo };

export type EtapaEncargo =
  | 'POR_BUSCAR'
  | 'POR_MANDAR'
  | 'ESPERANDO'
  | 'POR_COMPRAR'
  | 'EN_CAMINO'
  | 'POR_ENTREGAR'
  | 'ENTREGADO'
  | 'ANULADO';

/** Las fases en las que hay algo que hacer, en el orden en que pasan. */
export const FASES_EN_CURSO: readonly EtapaEncargo[] = [
  'POR_BUSCAR',
  'POR_MANDAR',
  'ESPERANDO',
  'POR_COMPRAR',
  'EN_CAMINO',
  'POR_ENTREGAR',
];

/**
 * - DESCARTADA: no se consiguió. Queda en la lista, pero no se compra, no se
 *   entrega y no cuenta en la plata.
 * - POR_COMPRAR: todavía no se compró.
 * - COMPRADA: se compró y espera paquete. Ella no sabe en cuál viene; lo más
 *   probable es que en el próximo, y ahí se la ofrece primero.
 * - EN_CAMINO: está en un paquete que todavía no pasó al inventario.
 * - LLEGO: su paquete ya pasó al inventario.
 * - DE_BODEGA: no se compra, sale de lo que hay en la bodega.
 */
export type EstadoPieza = 'DESCARTADA' | 'POR_COMPRAR' | 'COMPRADA' | 'EN_CAMINO' | 'LLEGO' | 'DE_BODEGA';

export interface PiezaParaEtapa {
  producto_id?: number;
  compra_id?: number;
  llego_el?: string;
  comprado_el?: string;
  /** Cero: todavía no tiene precio (un pedido). */
  precio_unitario_usd_cents?: number;
  /** "No se consiguió". */
  descartada_el?: string;
}

/**
 * La pieza todavía no tiene precio: es un pedido que ella anotó sin saber
 * cuánto vale ni si lo va a conseguir. Una pieza sin el campo (un objeto de
 * prueba, un documento a medias) no cuenta como sin precio, y una que no se
 * consiguió tampoco: ya no hay que cotizarla.
 */
export function sinPrecio(p: Pick<PiezaParaEtapa, 'precio_unitario_usd_cents' | 'descartada_el'>): boolean {
  if (p.descartada_el) return false;
  return typeof p.precio_unitario_usd_cents === 'number' && p.precio_unitario_usd_cents <= 0;
}

/** De dónde sale una pieza, hoy. */
export function estadoPieza(p: PiezaParaEtapa): EstadoPieza {
  if (p.descartada_el) return 'DESCARTADA';
  if (p.compra_id) return p.llego_el ? 'LLEGO' : 'EN_CAMINO';
  if (p.producto_id) return 'DE_BODEGA';
  if (p.comprado_el) return 'COMPRADA';
  return 'POR_COMPRAR';
}

/**
 * Si una pieza se puede marcar "No se consiguió": sólo mientras no se compró
 * ni salió nada de la bodega por ella. Lo comprado ya costó plata; eso se
 * resuelve anulando, que pregunta qué pasa con la pieza.
 */
export function descartable(p: PiezaParaEtapa & { lotes_consumidos?: readonly unknown[] }): boolean {
  if ((p.lotes_consumidos?.length ?? 0) > 0) return false;
  const e = estadoPieza(p);
  return e === 'POR_COMPRAR' || e === 'DE_BODEGA';
}

export function piezasDe(lineas: readonly PiezaParaEtapa[]): Required<PiezasEncargo> {
  const r: Required<PiezasEncargo> = {
    total: lineas.length,
    compradas: 0,
    llegadas: 0,
    de_bodega: 0,
    esperan_paquete: 0,
    sin_precio: 0,
    descartadas: 0,
  };
  for (const l of lineas) {
    const e = estadoPieza(l);
    // Una descartada cuenta en el total (se sigue viendo) y en ningún otro
    // contador: la cuenta de la fase depende de eso.
    if (e === 'DESCARTADA') {
      r.descartadas++;
      continue;
    }
    if (e === 'COMPRADA' || e === 'EN_CAMINO' || e === 'LLEGO') r.compradas++;
    if (e === 'COMPRADA') r.esperan_paquete++;
    if (e === 'LLEGO') r.llegadas++;
    if (e === 'DE_BODEGA') r.de_bodega++;
    if (sinPrecio(l)) r.sin_precio++;
  }
  return r;
}

/** Las piezas que siguen en pie: todas menos las que no se consiguieron. */
export function piezasVivas(p: PiezasEncargo): number {
  return p.total - (p.descartadas ?? 0);
}

/**
 * Cuántas piezas todavía no vienen en ningún paquete: las que falta comprar
 * y las compradas que esperan paquete. Son las que un paquete puede traer.
 */
export function sinPaquete(p: PiezasEncargo | undefined): number {
  if (!p) return 0;
  const enPaquete = p.compradas - (p.esperan_paquete ?? 0);
  return Math.max(0, piezasVivas(p) - p.de_bodega - enPaquete);
}

/** Lo que hace falta saber de un encargo para decir en qué fase va. */
export interface EncargoParaEtapa {
  estado: EstadoVenta;
  piezas?: PiezasEncargo;
  cotizacion_version?: number;
  cotizacion_enviada_el?: string;
  cotizacion_enviada_version?: number;
  pagado_usd_cents?: number;
  anticipo_esperado_usd_cents?: number;
  motivo_anulacion?: MotivoAnulacion;
}

/**
 * La clienta tiene la cotización como está hoy: se le mandó, y después no
 * cambió ningún precio. Se mira la versión y no la fecha, porque cotizar y
 * mandar pueden caer en el mismo instante.
 */
function cotizacionAlDia(v: EncargoParaEtapa): boolean {
  return Boolean(v.cotizacion_enviada_el) && (v.cotizacion_enviada_version ?? 0) === (v.cotizacion_version ?? 0);
}

/**
 * La fase de un encargo.
 *
 * Un encargo de antes de la 2.14 no tiene el resumen de piezas: si está
 * confirmado, se lo trata como "por comprar", que es lo que hay que revisar.
 * Uno cotizado de antes de la 2.16 nunca se marcó como mandado: queda "por
 * mandar", y "Ya la mandé" lo pone al día.
 */
export function etapaEncargo(v: EncargoParaEtapa): EtapaEncargo {
  if (v.estado === 'CANCELADA') return 'ANULADO';
  if (v.estado === 'ENTREGADA') return 'ENTREGADO';

  const p = v.piezas;
  // Falta cotizar algo, o no se consiguió nada: lo que toca es buscar (o
  // cerrarlo como "no se consiguió").
  if (p && (piezasVivas(p) <= 0 || (p.sin_precio ?? 0) > 0)) return 'POR_BUSCAR';

  if (v.estado === 'COTIZADA') return cotizacionAlDia(v) ? 'ESPERANDO' : 'POR_MANDAR';

  // PENDIENTE: aceptó.
  if (!p || p.total === 0) return 'POR_COMPRAR';
  const vivas = piezasVivas(p);
  if (vivas - p.compradas - p.de_bodega > 0) return 'POR_COMPRAR';
  if (p.llegadas + p.de_bodega < vivas) return 'EN_CAMINO';
  return 'POR_ENTREGAR';
}

/** "hoy", "ayer", "hace 3 días". */
function haceCuanto(desdeISO: string, hoyISO: string): string {
  const d = diasEntre(desdeISO, hoyISO);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  return `hace ${d} días`;
}

/** "Esperando respuesta · hace 3 días", "En camino · 1 de 2 llegó": para la lista. */
export function textoEtapa(v: EncargoParaEtapa, hoy: string): string {
  const etapa = etapaEncargo(v);
  const p = v.piezas;
  // Se puede comprar antes de que la clienta acepte: que no quede escondido.
  const yaComprado = (p?.compradas ?? 0) > 0 ? ' · ya comprado' : '';

  switch (etapa) {
    case 'POR_BUSCAR':
      return p && piezasVivas(p) <= 0 ? 'No se consiguió nada' : 'Por buscar';
    case 'POR_MANDAR':
      // Ya se le había mandado: la que tiene la clienta quedó vieja.
      if (v.cotizacion_enviada_el) return 'Por mandar · cambió el precio';
      return `Por mandar${yaComprado}`;
    case 'ESPERANDO':
      if (yaComprado) return `Esperando respuesta${yaComprado}`;
      return `Esperando respuesta · ${haceCuanto(v.cotizacion_enviada_el!, hoy)}`;
    case 'POR_COMPRAR':
      return (v.pagado_usd_cents ?? 0) < (v.anticipo_esperado_usd_cents ?? 0)
        ? 'Por comprar · sin anticipo'
        : 'Por comprar';
    case 'EN_CAMINO': {
      const listas = (p?.llegadas ?? 0) + (p?.de_bodega ?? 0);
      if (listas === 0 || !p) return 'En camino';
      return `En camino · ${listas} de ${piezasVivas(p)} ${listas === 1 ? 'llegó' : 'llegaron'}`;
    }
    case 'POR_ENTREGAR':
      return 'Por entregar';
    case 'ENTREGADO':
      return 'Entregado';
    case 'ANULADO':
      if (v.motivo_anulacion === 'NO_SE_CONSIGUIO') return 'No se consiguió';
      if (v.motivo_anulacion === 'NO_ACEPTO') return 'No aceptó';
      return 'Anulado';
  }
}

/**
 * Qué pidió, en una línea: "Bolso Coach, 2 Perfume". Sin lo que no se
 * consiguió, salvo que no se haya conseguido nada.
 */
export function quePidio(
  lineas: readonly { descripcion?: string; cantidad?: number; descartada_el?: string }[]
): string {
  const vivas = lineas.filter((l) => !l.descartada_el);
  return (vivas.length > 0 ? vivas : lineas)
    .filter((l) => l.descripcion)
    .map((l) => ((l.cantidad ?? 1) > 1 ? `${l.cantidad} ${l.descripcion}` : l.descripcion))
    .join(', ');
}

// ---------------------------------------------------------------------------
// La plata del encargo
// ---------------------------------------------------------------------------

export interface LineaParaRecalcular extends PiezaParaEtapa {
  subtotal_usd_cents?: number;
  costo_total_usd_cents?: number;
}

export interface EncargoParaRecalcular {
  estado: EstadoVenta;
  total_usd_cents?: number;
  pagado_usd_cents?: number;
  anticipo_bp?: number;
  anticipo_esperado_usd_cents?: number;
  descuento_tipo?: TipoDescuento;
  descuento_valor?: number;
}

export interface EncargoRecalculado {
  subtotal_usd_cents: number;
  descuento_usd_cents: number;
  total_usd_cents: number;
  costo_total_usd_cents: number;
  ganancia_usd_cents: number;
  anticipo_bp: number;
  anticipo_esperado_usd_cents: number;
  saldo_usd_cents: number;
  piezas: Required<PiezasEncargo>;
  estado: 'COTIZADA' | 'PENDIENTE';
}

/**
 * Total, costo, anticipo, saldo y estado de un encargo a partir de sus
 * piezas: la misma cuenta que al crearlo. La usan cotizar y "No se
 * consiguió". Una pieza descartada ya viene con subtotal y costo en cero.
 *
 * El anticipo es un porcentaje del total (`anticipo_bp`); un encargo que no lo
 * guardó lo deduce del anticipo y el total que tenía. Uno ya aceptado sigue
 * aceptado: bajar el total no lo "desconfirma".
 */
export function recalcularEncargo(
  venta: EncargoParaRecalcular,
  lineas: readonly LineaParaRecalcular[],
  anticipoDefectoBp: number
): EncargoRecalculado {
  const subtotal = lineas.reduce((s, l) => s + (l.subtotal_usd_cents || 0), 0);
  let descuento = 0;
  if (venta.descuento_tipo === 'PORCENTAJE' && (venta.descuento_valor ?? 0) > 0) {
    descuento = Math.round((subtotal * venta.descuento_valor!) / 100);
  } else if (venta.descuento_tipo === 'MONTO_FIJO' && (venta.descuento_valor ?? 0) > 0) {
    descuento = Math.round(venta.descuento_valor! * 100);
  }
  descuento = Math.min(subtotal, Math.max(0, descuento));
  const total = Math.max(0, subtotal - descuento);
  const costo = lineas.reduce((s, l) => s + (l.costo_total_usd_cents || 0), 0);
  const anticipoBp =
    venta.anticipo_bp ??
    ((venta.total_usd_cents || 0) > 0
      ? Math.round(((venta.anticipo_esperado_usd_cents || 0) * 10000) / venta.total_usd_cents!)
      : anticipoDefectoBp);
  const anticipo = Math.round((total * anticipoBp) / 10000);
  const pagado = venta.pagado_usd_cents || 0;
  const piezas = piezasDe(lineas);
  const estado =
    venta.estado === 'PENDIENTE'
      ? 'PENDIENTE'
      : estadoInicialEncargo({
          total_usd_cents: total,
          pagado_usd_cents: pagado,
          anticipo_esperado_usd_cents: anticipo,
          sin_precio: piezas.sin_precio,
        });

  return {
    subtotal_usd_cents: subtotal,
    descuento_usd_cents: descuento,
    total_usd_cents: total,
    costo_total_usd_cents: costo,
    ganancia_usd_cents: total - costo,
    anticipo_bp: anticipoBp,
    anticipo_esperado_usd_cents: anticipo,
    saldo_usd_cents: total - pagado,
    piezas,
    estado,
  };
}

/**
 * El costo estimado de una pieza al cotizarla: tienda + impuesto + su peso
 * por la tarifa del courier. Todo en centavos; el peso en milésimas de libra.
 */
export function costoEstimadoDePieza(input: {
  tienda_usd_cents: number;
  peso_mlb: number;
  tax_bp: number;
  tarifa_cents_lb: number;
}): number {
  const tienda = Math.max(0, Math.round(input.tienda_usd_cents || 0));
  const impuesto = Math.round((tienda * Math.max(0, input.tax_bp || 0)) / 10000);
  const flete = Math.round((Math.max(0, input.peso_mlb || 0) * Math.max(0, input.tarifa_cents_lb || 0)) / 1000);
  return tienda + impuesto + flete;
}
