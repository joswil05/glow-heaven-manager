/**
 * Utilidades para estandarización y formato de texto en la aplicación.
 * Evita errores tipográficos, inconsistencias de mayúsculas/minúsculas
 * y dobles espacios en productos, marcas, clientes y paquetes.
 */

const PALABRAS_MENORES = new Set([
  'de',
  'del',
  'la',
  'las',
  'el',
  'los',
  'en',
  'y',
  'e',
  'o',
  'u',
  'con',
  'para',
  'por',
  'sin',
  'a',
]);

const SIGLAS_CONOCIDAS = new Set([
  'usa',
  'eeuu',
  'spf',
  'bb',
  'cc',
  'ml',
  'oz',
  'xl',
  'xxl',
  'xs',
  's',
  'm',
  'l',
]);

/**
 * Limpia espacios múltiples internos y recorta los extremos.
 */
export function limpiarEspacios(texto: string): string {
  if (!texto) return '';
  return texto.trim().replace(/\s+/g, ' ');
}

/**
 * Convierte un texto a Title Case (Nombre Propio) respetando palabras
 * menores en español y siglas comunes.
 *
 * Ejemplos:
 * - "lapiz labial mate" -> "Lapiz Labial Mate"
 * - "crema para manos de victoria secret" -> "Crema para Manos de Victoria Secret"
 * - "calzones calvin klein" -> "Calzones Calvin Klein"
 * - "bloqueador con spf 50" -> "Bloqueador con SPF 50"
 */
export function formatearNombreEntidad(texto: string): string {
  const limpio = limpiarEspacios(texto);
  if (!limpio) return '';

  const palabras = limpio.split(' ');

  return palabras
    .map((palabra, idx) => {
      const lower = palabra.toLowerCase();

      // Si es una sigla conocida (ej. SPF, USA)
      if (SIGLAS_CONOCIDAS.has(lower)) {
        return lower.toUpperCase();
      }

      // Si es palabra menor y no es la primera palabra
      if (idx > 0 && PALABRAS_MENORES.has(lower)) {
        return lower;
      }

      // Primera letra mayúscula, resto minúscula
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Formatea códigos de tracking, SKU o identificadores:
 * Recorta espacios y convierte a mayúsculas.
 *
 * Ejemplo: "  pkg-001  " -> "PKG-001"
 */
export function formatearCodigo(texto: string): string {
  const limpio = limpiarEspacios(texto);
  if (!limpio) return '';
  return limpio.toUpperCase();
}

/**
 * Formatea texto general o descripciones en estilo oración (Sentence case):
 * La primera letra del texto en mayúscula y espacios limpios.
 */
export function formatearTextoGeneral(texto: string): string {
  const limpio = limpiarEspacios(texto);
  if (!limpio) return '';
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}
