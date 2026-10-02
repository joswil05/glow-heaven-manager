/**
 * Un abono a la cuenta de la clienta: a qué ventas va.
 *
 * Paga por antigüedad: la venta más vieja primero, y lo que sobra a la
 * siguiente. La ventana de abono lo muestra antes de registrarlo y el
 * repositorio lo registra con esta misma función, así que lo que ella ve es
 * lo que queda (TRA-02 de la auditoría de interfaz).
 *
 * Hasta la 2.16.5 el repositorio pasaba los córdobas a dólares con la tasa de
 * la primera venta y los volvía a pasar a córdobas con la de cada una: con
 * dos ventas de tasas distintas, lo registrado no sumaba lo que ella pagó.
 * Ahora el reparto se hace en la moneda en que pagó: en córdobas, contra lo
 * que se debe en córdobas de cada venta, con su tasa.
 */
import type { EstadoVenta, MonedaPago } from '../shared/types';

/** La tasa de una venta, como la usa `registrar` al convertir un abono. */
export const tasaDeLaVenta = (v: { tasa_cambio_cents?: number | null }): number => v.tasa_cambio_cents || 3662;

export interface VentaConSaldo {
  id: number;
  codigo: string;
  fecha: string;
  saldo_usd_cents: number;
  tasa_cambio_cents?: number | null;
  estado?: EstadoVenta;
  activo?: boolean;
}

export interface ParteDelAbono {
  venta_id: number;
  codigo: string;
  /** Lo que va a esta venta, en la moneda en que pagó. */
  monto_cents: number;
  /** Lo mismo en dólares, con la tasa de la venta. */
  monto_usd_cents: number;
  saldo_antes_usd_cents: number;
  /** Lo que queda debiendo. Negativo en la última: pagó de más. */
  saldo_despues_usd_cents: number;
}

/** Las ventas que se pueden pagar, de la más vieja a la más nueva. */
export function ventasPorAntiguedad<V extends VentaConSaldo>(ventas: readonly V[]): V[] {
  return ventas
    .filter((v) => v.saldo_usd_cents > 0 && v.estado !== 'CANCELADA' && v.activo !== false)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
}

/** De la moneda del abono a dólares, como `registrar`. */
function aDolares(monto_cents: number, moneda: MonedaPago, tasa: number): number {
  return moneda === 'COR' ? Math.round((monto_cents * 100) / tasa) : monto_cents;
}

/**
 * Reparte `monto_cents` (en `moneda`) entre las ventas con saldo. Lo que
 * sobra después de la última queda en la última, como pago de más: es lo que
 * hacía antes y lo que dice "cómo queda". Sin ventas con saldo, nada.
 */
export function repartirAbono(
  ventas: readonly VentaConSaldo[],
  monto_cents: number,
  moneda: MonedaPago
): ParteDelAbono[] {
  const orden = ventasPorAntiguedad(ventas);
  const partes: ParteDelAbono[] = [];
  let resto = monto_cents;
  for (let i = 0; i < orden.length && resto > 0; i++) {
    const v = orden[i];
    const tasa = tasaDeLaVenta(v);
    const debe = moneda === 'COR' ? Math.round((v.saldo_usd_cents * tasa) / 100) : v.saldo_usd_cents;
    const va = i === orden.length - 1 ? resto : Math.min(resto, debe);
    const usd = aDolares(va, moneda, tasa);
    partes.push({
      venta_id: v.id,
      codigo: v.codigo,
      monto_cents: va,
      monto_usd_cents: usd,
      saldo_antes_usd_cents: v.saldo_usd_cents,
      saldo_despues_usd_cents: v.saldo_usd_cents - usd,
    });
    resto -= va;
  }
  return partes;
}
