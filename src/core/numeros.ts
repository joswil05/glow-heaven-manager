/**
 * Parseo de números escritos por una persona.
 *
 * Acá se cruzan dos convenciones. En Nicaragua el separador decimal natural
 * es la coma ("36,62"), pero la aplicación muestra los montos con el formato
 * de miles en inglés ("C$1,500.00", que sale de `toLocaleString('en-US')`).
 * O sea: la app le enseña a la usuaria a escribir la coma como separador de
 * miles y después tiene que leer las dos formas sin confundirlas.
 *
 * La versión anterior hacía `replace(',', '.')` a secas, así que "1,500"
 * —mil quinientos, tal como lo muestra la app— se convertía en 1.5. Un abono
 * de C$1,500 quedaba registrado como C$1.50, sin error ni aviso.
 *
 * La regla que desambigua es la del uso real, no la del idioma:
 *
 *   · Grupos de exactamente tres dígitos repetidos son separador de miles.
 *     "1,500" -> 1500    "1.500,50" -> 1500.50    "12,345,678" -> 12345678
 *   · Un único separador con cifras detrás es decimal.
 *     "10,50" -> 10.50   "10.5" -> 10.5
 *   · Lo que no encaja en ninguna de las dos se rechaza.
 *
 * Queda una forma ambigua de verdad: "1.500", que podría ser mil quinientos
 * o uno con medio. Se resuelve a favor del decimal, por dos razones: es la
 * convención que la propia app muestra (en "C$1,500.00" el punto es decimal),
 * y el punto con tres cifras es la forma normal de escribir la tasa de
 * cambio ("36.624"), que no tiene lectura de miles posible. Con la coma no
 * hay tal duda: en el formato que la app imprime, la coma es siempre miles.
 */

/** Sólo dígitos, con signo opcional. Ya sin separadores. */
const SOLO_NUMERO = /^-?\d+(\.\d+)?$/;

/**
 * Miles con coma, decimales con punto: 1,500 · 1,500.50 · 12,345,678.90
 * El primer grupo no puede empezar con cero, para que "0,500" no se lea
 * como quinientos.
 */
const MILES_COMA = /^-?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/;

/**
 * Miles con punto, decimales con coma: 1.500 · 1.500,50
 */
const MILES_PUNTO = /^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/;

/** Un solo separador decimal, sea coma o punto: 10,50 · 10.5 · 0,05 */
const DECIMAL_SIMPLE = /^-?\d+[.,]\d+$/;

/**
 * Normaliza el texto a algo que `Number` entienda, o devuelve null si la
 * forma no corresponde a ninguna convención reconocible.
 */
function normalizar(texto: string): string | null {
  const limpio = texto.trim().replace(/\s+/g, '');
  if (limpio === '') return null;

  if (SOLO_NUMERO.test(limpio)) return limpio;
  if (MILES_COMA.test(limpio)) return limpio.replace(/,/g, '');
  if (MILES_PUNTO.test(limpio)) return limpio.replace(/\./g, '').replace(',', '.');
  if (DECIMAL_SIMPLE.test(limpio)) return limpio.replace(',', '.');

  return null;
}

/**
 * Convierte texto escrito por el usuario a número.
 * Devuelve null si no es un número finito, en vez de NaN, para que quien
 * llame tenga que decidir qué hacer.
 */
export function parsearDecimal(
  texto: string,
  opciones?: { min?: number; max?: number }
): number | null {
  const limpio = normalizar(texto);
  if (limpio === null) return null;

  const valor = Number(limpio);
  if (!Number.isFinite(valor)) return null;

  if (opciones?.min !== undefined && valor < opciones.min) return null;
  if (opciones?.max !== undefined && valor > opciones.max) return null;

  return valor;
}

/**
 * Convierte texto a centavos enteros, validando rango en unidades enteras
 * (no en centavos). Devuelve null si el texto no es válido o queda fuera.
 */
export function parsearACentavos(
  texto: string,
  opciones?: { min?: number; max?: number }
): number | null {
  const valor = parsearDecimal(texto, opciones);
  if (valor === null) return null;

  return Math.round(valor * 100);
}
