/**
 * Comparar texto como lo escribe una persona, no como lo guardó la base.
 *
 * Los nombres del negocio llevan tilde —María, José, Ramírez, Núñez— y nadie
 * los escribe con tilde al buscar. Un `includes` sobre el texto crudo dice que
 * 'maria' no está en 'maría', así que la clienta existe, está en la lista, y
 * la búsqueda contesta que no hay nada. Es la peor forma de fallar: parece que
 * el dato se perdió.
 *
 * Acá se comparan las dos puntas sin tildes y en minúscula. La ñ también
 * pierde la virgulilla, a propósito: quien escribe 'nunez' está buscando a
 * Núñez. Esto es sólo para buscar; lo que se guarda y lo que se muestra no se
 * tocan nunca.
 */

/** Minúscula, sin tildes y sin espacios de sobra. Sólo para comparar. */
export function normalizar(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * ¿El campo contiene lo que se buscó, ignorando tildes y mayúsculas?
 * Una búsqueda vacía coincide con todo: es el estado inicial de un buscador.
 */
export function contiene(campo: string | null | undefined, busqueda: string): boolean {
  const q = normalizar(busqueda);
  if (!q) return true;
  return normalizar(campo).includes(q);
}

/** ¿Alguno de los campos coincide? Atajo para los buscadores de varias columnas. */
export function algunoContiene(
  campos: (string | null | undefined)[],
  busqueda: string
): boolean {
  const q = normalizar(busqueda);
  if (!q) return true;
  return campos.some((c) => normalizar(c).includes(q));
}
