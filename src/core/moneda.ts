/**
 * Módulo puro de manejo de dinero, centavos (INTEGER) y formateo dual.
 * REGLA: Nunca usar float para almacenar ni procesar dinero.
 */

/**
 * Convierte centavos USD a centavos Córdobas dada una tasa de cambio entera.
 * tasa_cambio_cents: C$ por 1 USD * 100 (ej: 3662 para C$36.6243).
 */
export function usdCentavosACorCentavos(usd_cents: number, tasa_cambio_cents: number): number {
  return Math.round((usd_cents * tasa_cambio_cents) / 100);
}

/**
 * Convierte centavos Córdobas a centavos USD dada una tasa de cambio entera.
 */
export function corCentavosAUsdCentavos(cor_cents: number, tasa_cambio_cents: number): number {
  if (tasa_cambio_cents === 0) return 0;
  return Math.round((cor_cents * 100) / tasa_cambio_cents);
}

/**
 * Formatea un valor en centavos a cadena legible estándar.
 */
export function formatearMoneda(cents: number, moneda: 'USD' | 'COR'): string {
  const absCents = Math.abs(cents);
  const entero = Math.floor(absCents / 100);
  const decimal = (absCents % 100).toString().padStart(2, '0');
  const signo = cents < 0 ? '-' : '';

  // Formato con comas para miles
  const enteroFormateado = entero.toLocaleString('en-US');

  if (moneda === 'USD') {
    return `${signo}$${enteroFormateado}.${decimal}`;
  } else {
    return `${signo}C$${enteroFormateado}.${decimal}`;
  }
}

/**
 * Devuelve la representación dual en una sola estructura y cadena formateada.
 */
export function formatearMonedaDual(
  usd_cents: number,
  cor_cents: number
): { usd: string; cor: string; textoDual: string } {
  const usd = formatearMoneda(usd_cents, 'USD');
  const cor = formatearMoneda(cor_cents, 'COR');
  return {
    usd,
    cor,
    textoDual: `${cor} / ${usd}`,
  };
}

/**
 * Formatea milésimas de libra a lb (ej: 1500 -> "1.50 lb").
 */
export function formatearPeso(peso_mlb: number): string {
  const lbs = (peso_mlb / 1000).toFixed(2);
  return `${lbs} lb`;
}

/**
 * Formatea basis points a porcentaje (ej: 3500 -> "35%", 3250 -> "32.5%").
 */
export function formatearPorcentaje(bp: number): string {
  const pct = bp / 100;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/**
 * Fecha legible. Las pantallas mezclaban `11/09/2026` (del input nativo) con
 * `2026-09-11` (ISO crudo) en la misma vista, y ninguno de los dos es como
 * habla nadie.
 */
const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

export function formatearFecha(iso: string | undefined | null): string {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return String(iso);

  const mes = MESES_CORTOS[m - 1] ?? String(m);
  const esteAno = new Date().getFullYear();
  return a === esteAno ? `${d} ${mes}` : `${d} ${mes} ${a}`;
}

/**
 * Cuánto falta o cuánto hace, en palabras. Una fecha de vencimiento obliga a
 * restar contra el calendario; "vence en 3 días" no.
 */
export function relativoAHoy(iso: string | undefined | null): string {
  if (!iso) return '';
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const objetivo = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const dias = Math.round((objetivo.getTime() - hoy.getTime()) / 86_400_000);

  if (dias === 0) return 'vence hoy';
  if (dias === 1) return 'vence mañana';
  if (dias === -1) return 'venció ayer';
  if (dias > 1) return `vence en ${dias} días`;
  return `venció hace ${Math.abs(dias)} días`;
}
