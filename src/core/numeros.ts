/**
 * Parseo de números escritos por una persona.
 * En Nicaragua el separador decimal natural es la coma, así que `parseFloat`
 * a secas convierte "36,62" en 36 y descarta los centavos en silencio.
 */

/**
 * Convierte texto escrito por el usuario a número.
 * Acepta coma o punto como separador decimal. Devuelve null si no es un
 * número finito, en vez de NaN, para que quien llame tenga que decidir.
 */
export function parsearDecimal(
  texto: string,
  opciones?: { min?: number; max?: number }
): number | null {
  const limpio = texto.trim().replace(/\s+/g, '').replace(',', '.');
  if (limpio === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;

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
