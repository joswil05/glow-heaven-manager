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
 * Una búsqueda que es un número ("86012442", "8601-2442", "+505 8601") se
 * compara sólo por sus dígitos. Los teléfonos se guardan como
 * "+505 8601 2442", y quien busca escribe el número como lo tiene anotado:
 * sin los espacios, un `includes` diría que esa clienta no existe.
 */
function digitosDeBusqueda(busqueda: string): string | null {
  if (!/^[\d\s+().-]+$/.test(busqueda.trim())) return null;
  const digitos = busqueda.replace(/\D+/g, '');
  return digitos.length >= 3 ? digitos : null;
}

function coincide(campo: string | null | undefined, q: string, digitos: string | null): boolean {
  if (normalizar(campo).includes(q)) return true;
  return digitos !== null && !!campo && campo.replace(/\D+/g, '').includes(digitos);
}

/**
 * ¿El campo contiene lo que se buscó, ignorando tildes y mayúsculas?
 * Una búsqueda vacía coincide con todo: es el estado inicial de un buscador.
 */
export function contiene(campo: string | null | undefined, busqueda: string): boolean {
  const q = normalizar(busqueda);
  if (!q) return true;
  return coincide(campo, q, digitosDeBusqueda(busqueda));
}

/** ¿Alguno de los campos coincide? Atajo para los buscadores de varias columnas. */
export function algunoContiene(
  campos: (string | null | undefined)[],
  busqueda: string
): boolean {
  const q = normalizar(busqueda);
  if (!q) return true;
  const digitos = digitosDeBusqueda(busqueda);
  return campos.some((c) => coincide(c, q, digitos));
}
