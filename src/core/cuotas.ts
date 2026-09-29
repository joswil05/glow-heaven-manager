/**
 * El plan de cuotas de una venta a crédito.
 *
 * Vive acá, y no en el repositorio de pagos, porque lo usan dos cosas: un
 * abono (registrarlo, anularlo o corregirlo) y corregir la venta, que puede
 * cambiar el total financiado.
 */
import type { Cuota } from '../shared/types';
import { repartirMayorResiduo } from './prorrateo';

/**
 * Aplica lo pagado a las cuotas en orden, sin pasarse de ninguna.
 *
 * Se recalcula completo cada vez en vez de ir sumando: así anular o corregir
 * un abono viejo no deja cuotas marcadas como pagadas con plata que ya no
 * existe.
 */
export function repartirEnCuotas<C extends Pick<Cuota, 'monto_usd_cents' | 'pagado_usd_cents'>>(
  cuotas: readonly C[],
  totalPagado: number
): C[] {
  let restante = totalPagado;
  return cuotas.map((c) => {
    const aplicado = Math.min(Math.max(0, restante), c.monto_usd_cents);
    restante -= aplicado;
    return { ...c, pagado_usd_cents: aplicado };
  });
}

/**
 * Reparte un monto financiado nuevo entre las mismas cuotas: conserva cuántas
 * son y cuándo vencen, y cada una toma su parte en proporción a la que tenía,
 * al centavo (mayor residuo). Lo pagado se vuelve a aplicar después, con
 * `repartirEnCuotas`.
 */
export function reescalarCuotas<C extends Pick<Cuota, 'monto_usd_cents' | 'pagado_usd_cents'>>(
  cuotas: readonly C[],
  financiado: number
): C[] {
  if (cuotas.length === 0 || financiado <= 0) return [];
  const base = cuotas.map((c, i) => ({ id: i, base_valor: Math.max(1, c.monto_usd_cents) }));
  const reparto = repartirMayorResiduo(Math.round(financiado), base);
  return cuotas.map((c, i) => ({ ...c, monto_usd_cents: reparto.get(i) ?? 0, pagado_usd_cents: 0 }));
}
