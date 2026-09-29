/**
 * Cómo se muestra un abono, y qué le pasa cuando se corrige su venta.
 *
 * Un abono guarda su monto en las dos monedas y la tasa de ese día, pero se
 * pagó en una sola. Mostrarlo en dólares cuando entró en córdobas ("$16.38" en
 * vez de "C$600.00") es lo que hacía que, al corregirlo, pareciera cargado en
 * la moneda equivocada.
 */
import type { Autor, Pago } from '../shared/types';
import { formatearMoneda } from './moneda';

export type Moneda = 'USD' | 'COR';

type MontosDeAbono = Pick<Pago, 'moneda' | 'monto_usd_cents' | 'monto_cor_cents'>;

/** Lo que pagó, en la moneda en que lo pagó. */
export function montoPagado(p: MontosDeAbono): { cents: number; moneda: Moneda } {
  return p.moneda === 'COR'
    ? { cents: p.monto_cor_cents, moneda: 'COR' }
    : { cents: p.monto_usd_cents, moneda: 'USD' };
}

/** Lo mismo en la otra moneda, con la tasa del abono (no la de hoy). */
export function montoEquivalente(p: MontosDeAbono): { cents: number; moneda: Moneda } {
  return p.moneda === 'COR'
    ? { cents: p.monto_usd_cents, moneda: 'USD' }
    : { cents: p.monto_cor_cents, moneda: 'COR' };
}

export const textoPagado = (p: MontosDeAbono): string => {
  const m = montoPagado(p);
  return formatearMoneda(m.cents, m.moneda);
};

export const textoEquivalente = (p: MontosDeAbono): string => {
  const m = montoEquivalente(p);
  return formatearMoneda(m.cents, m.moneda);
};

/**
 * Lo que lleva pagado una venta, en la moneda de sus abonos: si todos fueron
 * en córdobas, en córdobas. Si mezcló, en dólares, que es en lo que se suma.
 */
export function textoLoPagado(pagos: readonly (MontosDeAbono & Pick<Pago, 'activo'>)[]): string {
  const activos = pagos.filter((p) => p.activo !== false);
  return monedaDeLosAbonos(activos) === 'COR'
    ? formatearMoneda(activos.reduce((s, p) => s + p.monto_cor_cents, 0), 'COR')
    : formatearMoneda(activos.reduce((s, p) => s + p.monto_usd_cents, 0), 'USD');
}

/** En qué moneda se pagó una venta: córdobas si todos sus abonos lo fueron. */
export function monedaDeLosAbonos(pagos: readonly (Pick<Pago, 'moneda'> & Partial<Pick<Pago, 'activo'>>)[]): Moneda {
  const activos = pagos.filter((p) => p.activo !== false);
  return activos.length > 0 && activos.every((p) => p.moneda === 'COR') ? 'COR' : 'USD';
}

/**
 * Un total en dólares dicho en la moneda en que se paga esa venta: "C$549.30
 * ($15.00)" si pagó en córdobas, "$15.00" si no. Con la tasa de la venta.
 */
export function textoTotalEn(moneda: Moneda, total_usd_cents: number, tasa_cambio_cents: number): string {
  if (moneda === 'USD') return formatearMoneda(total_usd_cents, 'USD');
  const cor = Math.round((total_usd_cents * tasa_cambio_cents) / 100);
  return `${formatearMoneda(cor, 'COR')} (${formatearMoneda(total_usd_cents, 'USD')})`;
}

/** "Rosa" de "Rosa María Pérez"; "Joswill.e" de "joswill.e@gmail.com". */
export function nombreCorto(autor: Partial<Autor> | null | undefined): string | undefined {
  const nombre = autor?.nombre?.trim();
  if (!nombre) return undefined;
  const base = nombre.includes('@') ? nombre.split('@')[0] : nombre.split(/\s+/)[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** El encabezado de un día en el historial: "Hoy", "Ayer", "lun 28 sep". */
export function diaDeHistorial(fecha: string, hoy: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return fecha;
  const [ah, mh, dh] = hoy.slice(0, 10).split('-').map(Number);
  const dias = Math.round((Date.UTC(ah, mh - 1, dh) - Date.UTC(a, m - 1, d)) / 86_400_000);
  if (dias === 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  const semana = DIAS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${semana} ${d} ${MESES[m - 1]}${a === ah ? '' : ` ${a}`}`;
}

/**
 * Una venta al contado sigue a su abono.
 *
 * Si se pagó entera con un solo abono, corregir el total corrige también lo
 * que pagó, en su moneda y con su tasa: C$732.40 pasan a C$549.30, no a
 * "$15.00". Sin esto, bajar el precio de una venta al contado se rechazaba
 * ("corregí el abono primero") y subirlo la dejaba debiendo la diferencia.
 *
 * `null` si no aplica: a crédito, con varios abonos (no se adivina cuál), o si
 * el total no cambia. Un centavo de diferencia entre lo pagado y el total es
 * el redondeo de pagar en córdobas, y cuenta como pagada entera.
 */
export function abonoQueSigueAlTotal<P extends MontosDeAbono & Pick<Pago, 'activo' | 'tasa_cambio_cents'>>(
  venta: { total_usd_cents: number; pagado_usd_cents: number },
  pagos: readonly P[],
  nuevoTotal: number
): { pago: P; monto_usd_cents: number; monto_cor_cents: number } | null {
  const activos = pagos.filter((p) => p.activo !== false);
  if (activos.length !== 1) return null;
  if (venta.pagado_usd_cents < venta.total_usd_cents - 1) return null;
  if (nuevoTotal <= 0 || nuevoTotal === venta.total_usd_cents) return null;
  const pago = activos[0];
  return {
    pago,
    monto_usd_cents: nuevoTotal,
    monto_cor_cents: Math.round((nuevoTotal * pago.tasa_cambio_cents) / 100),
  };
}
