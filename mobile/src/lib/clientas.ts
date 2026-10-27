import type { ClienteDetalle, FilaPorCobrar, PagoCompleto, Venta } from '@shared/types';
import { deudasPorClienta, type DeudaDeClienta } from './inicio';

/**
 * Clientas (U4): lo puro. La lista de "Te deben" y "Todas", y la historia de
 * una clienta en su ficha.
 */

/** Una fila de "Te deben": lo que debe en total y cuándo compró por última vez. */
export interface FilaTeDeben extends DeudaDeClienta {
  ultima_compra?: string;
  vencida: boolean;
}

/**
 * "Te deben" (CLI-1): una fila por clienta, la que más debe primero. La
 * última compra sale de su ficha si está; si no, de la venta más nueva que
 * debe.
 */
export function filasTeDeben(
  porCobrar: readonly FilaPorCobrar[],
  clientas: readonly ClienteDetalle[]
): FilaTeDeben[] {
  const porId = new Map(clientas.map((c) => [c.id, c]));
  return deudasPorClienta(porCobrar).map((d) => {
    const ficha = d.cliente_id != null ? porId.get(d.cliente_id) : undefined;
    const masNueva = d.ventas.map((v) => v.fecha).sort().at(-1);
    return {
      ...d,
      ultima_compra: ficha?.ultima_compra ?? masNueva,
      vencida: d.cuotas_vencidas > 0,
    };
  });
}

/** Lo que ya pagó: lo comprado menos lo que todavía debe. */
export function pagadoPorClienta(c: Pick<ClienteDetalle, 'total_comprado_usd_cents' | 'saldo_pendiente_usd_cents'>): number {
  return Math.max(0, (c.total_comprado_usd_cents || 0) - (c.saldo_pendiente_usd_cents || 0));
}

/** La historia de la ficha (CLI-2): "Compras · Abonos · Pedidos", lo más nuevo primero. */
export function historiaDeClienta(
  ventas: readonly Venta[],
  pagos: readonly PagoCompleto[]
): { compras: Venta[]; pedidos: Venta[]; abonos: PagoCompleto[] } {
  const nuevoPrimero = <T extends { fecha: string; id: number }>(a: T, b: T) =>
    (b.fecha || '').localeCompare(a.fecha || '') || b.id - a.id;
  return {
    compras: ventas.filter((v) => v.tipo !== 'ENCARGO').sort(nuevoPrimero),
    pedidos: ventas.filter((v) => v.tipo === 'ENCARGO').sort(nuevoPrimero),
    abonos: [...pagos].sort(nuevoPrimero),
  };
}
