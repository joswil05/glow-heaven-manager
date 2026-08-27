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
