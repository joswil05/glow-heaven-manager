/**
 * En qué va un encargo.
 *
 * Un encargo es una venta cuya mercadería todavía no se compró. Cada línea es
 * una pieza, y cada pieza sabe de dónde sale: de un paquete (y si ese paquete
 * ya llegó) o de la bodega. La etapa del encargo se DERIVA de eso y de su
 * estado guardado; no se escribe a mano, así no se desincroniza.
 *
 * Ver `docs/PLAN_LOTES_Y_ENCARGOS.md`, sección 5.
 */
import type { EstadoVenta, PiezasEncargo } from '../shared/types';

export type { PiezasEncargo };

export type EtapaEncargo =
  | 'COTIZADO'
  | 'POR_COMPRAR'
  | 'EN_CAMINO'
  | 'POR_ENTREGAR'
  | 'ENTREGADO'
  | 'ANULADO';

/**
 * - POR_COMPRAR: todavía no se compró.
 * - COMPRADA: se compró y espera paquete. Ella no sabe en cuál viene; lo más
 *   probable es que en el próximo, y ahí se la ofrece primero.
 * - EN_CAMINO: está en un paquete que todavía no pasó al inventario.
 * - LLEGO: su paquete ya pasó al inventario.
 * - DE_BODEGA: no se compra, sale de lo que hay en la bodega.
 */
export type EstadoPieza = 'POR_COMPRAR' | 'COMPRADA' | 'EN_CAMINO' | 'LLEGO' | 'DE_BODEGA';

export interface PiezaParaEtapa {
  producto_id?: number;
  compra_id?: number;
  llego_el?: string;
  comprado_el?: string;
}

/** De dónde sale una pieza, hoy. */
export function estadoPieza(p: PiezaParaEtapa): EstadoPieza {
  if (p.compra_id) return p.llego_el ? 'LLEGO' : 'EN_CAMINO';
  if (p.producto_id) return 'DE_BODEGA';
  if (p.comprado_el) return 'COMPRADA';
  return 'POR_COMPRAR';
}

export function piezasDe(lineas: readonly PiezaParaEtapa[]): PiezasEncargo {
  const r: Required<PiezasEncargo> = {
    total: lineas.length,
    compradas: 0,
    llegadas: 0,
    de_bodega: 0,
    esperan_paquete: 0,
  };
  for (const l of lineas) {
    const e = estadoPieza(l);
    if (e === 'COMPRADA' || e === 'EN_CAMINO' || e === 'LLEGO') r.compradas++;
    if (e === 'COMPRADA') r.esperan_paquete++;
    if (e === 'LLEGO') r.llegadas++;
    if (e === 'DE_BODEGA') r.de_bodega++;
  }
  return r;
}

/**
 * Cuántas piezas todavía no vienen en ningún paquete: las que falta comprar
 * y las compradas que esperan paquete. Son las que un paquete puede traer.
 */
export function sinPaquete(p: PiezasEncargo | undefined): number {
  if (!p) return 0;
  const enPaquete = p.compradas - (p.esperan_paquete ?? 0);
  return Math.max(0, p.total - p.de_bodega - enPaquete);
}

/**
 * La etapa de un encargo.
 *
 * Un encargo de antes de la 2.14 no tiene el resumen de piezas: se lo trata
 * como "por comprar", que es lo que hay que revisar.
 */
export function etapaEncargo(v: { estado: EstadoVenta; piezas?: PiezasEncargo }): EtapaEncargo {
  if (v.estado === 'CANCELADA') return 'ANULADO';
  if (v.estado === 'ENTREGADA') return 'ENTREGADO';
  if (v.estado === 'COTIZADA') return 'COTIZADO';
  const p = v.piezas;
  if (!p || p.total === 0) return 'POR_COMPRAR';
  if (p.total - p.compradas - p.de_bodega > 0) return 'POR_COMPRAR';
  if (p.llegadas + p.de_bodega < p.total) return 'EN_CAMINO';
  return 'POR_ENTREGAR';
}

/** "En camino · 1 de 2 llegó", para la lista. */
export function textoEtapa(etapa: EtapaEncargo, piezas?: PiezasEncargo): string {
  switch (etapa) {
    case 'COTIZADO': {
      // Se puede comprar antes de que confirme: que no quede escondido.
      if (!piezas || piezas.compradas === 0) return 'Cotizado';
      return piezas.llegadas + piezas.de_bodega >= piezas.total ? 'Cotizado · llegó' : 'Cotizado · en camino';
    }
    case 'POR_COMPRAR':
      return 'Por comprar';
    case 'EN_CAMINO': {
      const listas = (piezas?.llegadas ?? 0) + (piezas?.de_bodega ?? 0);
      if (listas === 0 || !piezas) return 'En camino';
      return `En camino · ${listas} de ${piezas.total} ${listas === 1 ? 'llegó' : 'llegaron'}`;
    }
    case 'POR_ENTREGAR':
      return 'Por entregar';
    case 'ENTREGADO':
      return 'Entregado';
    case 'ANULADO':
      return 'Anulado';
  }
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
