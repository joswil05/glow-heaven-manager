/**
 * Cómo se guarda lo que una persona escribe en un formulario.
 *
 * Existe porque los datos de producción llegaron con cuatro formas de anotar
 * un teléfono ("86012442", "8103 7029", "+505 5820 3570", "+1 (504) 463-6250"),
 * con marcas invisibles que WhatsApp pega al copiar un número, con la ciudad
 * escrita en la dirección y con un "Steve Maddem" que nadie vio. Cada una
 * de esas cosas se nota tarde: una búsqueda que no encuentra, un enlace de
 * WhatsApp que no abre, un nombre que sale distinto en la factura.
 *
 * Se aplica en los repositorios, no en los formularios: así lo cumplen las
 * dos apps y todas las puertas por las que entra un dato, sin depender de que
 * cada pantalla se acuerde. Ninguna función inventa letras: no pone tildes ni
 * adivina un número que falta. Lo que no se puede arreglar sin adivinar se
 * rechaza con un error que dice qué revisar.
 */

import { CODIGO_PAIS } from './telefono';

/**
 * Caracteres que no se ven pero viajan con el texto: los que WhatsApp pone
 * alrededor de un número (U+202A … U+202C), espacios de ancho cero, el guion
 * blando y la marca de orden de bytes. Rompen comparaciones y búsquedas.
 */
const INVISIBLES = /[­​-‏‪-‮⁠-⁯﻿]/g;

/** Sin invisibles, sin espacios en los bordes y sin espacios repetidos. */
export function limpiarTexto(texto: string | null | undefined): string {
  if (!texto) return '';
  return texto.replace(INVISIBLES, '').replace(/\s+/g, ' ').trim();
}

/** `limpiarTexto`, pero vacío pasa a null: así se guarda un campo opcional. */
export function textoOpcional(texto: string | null | undefined): string | null {
  return limpiarTexto(texto) || null;
}

/**
 * Para un texto de varias líneas (notas): limpia cada línea y saca las
 * vacías de los bordes, pero respeta los saltos que la persona puso.
 */
export function limpiarLineas(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const lineas = texto
    .replace(INVISIBLES, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[^\S\n]+/g, ' ').trim());
  const resultado = lineas.join('\n').replace(/^\n+|\n+$/g, '');
  return resultado || null;
}

// ---------------------------------------------------------------------------
// Mayúsculas
// ---------------------------------------------------------------------------

/** Palabras que van en minúscula dentro de un nombre ("María de la Cruz"). */
const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'o', 'u', 'a', 'al', 'con', 'en', 'para', 'por', 'sin']);

/**
 * Unidades que nunca se escriben con mayúscula ("Crema 250 ml"). Sin "m" ni
 * "l": en esta tienda son tallas.
 */
const UNIDADES = new Set(['ml', 'oz', 'g', 'gr', 'kg', 'lb', 'lbs', 'cm', 'mm']);

function mayusculaInicial(palabra: string): string {
  // "maría-josé" → "María-José", "o'neill" → "O'Neill".
  return palabra
    .toLocaleLowerCase('es')
    .replace(/(^|[-'’])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase('es'));
}

function tituloConParticulas(texto: string, unidades: boolean): string {
  return texto
    .split(' ')
    .map((palabra, i) => {
      const minuscula = palabra.toLocaleLowerCase('es');
      if (i > 0 && PARTICULAS.has(minuscula)) return minuscula;
      if (unidades && i > 0 && UNIDADES.has(minuscula)) return minuscula;
      // Una palabra que empieza con un número ("250ml", "2x1") se deja como está.
      if (/^\d/.test(palabra)) return minuscula;
      return mayusculaInicial(palabra);
    })
    .join(' ');
}

/**
 * Nombre de una persona o de un lugar: cada palabra con mayúscula inicial y
 * el resto en minúscula, salvo las partículas ("de", "la", "y").
 *
 *   "maría josé DE LA cruz" → "María José de la Cruz"
 *   "FRYDA LOPEZ"            → "Fryda Lopez"   (la tilde no se inventa)
 */
export function nombrePropio(texto: string | null | undefined): string {
  const limpio = limpiarTexto(texto);
  return limpio ? tituloConParticulas(limpio, false) : '';
}

/** `nombrePropio`, pero vacío pasa a null. */
export function nombrePropioOpcional(texto: string | null | undefined): string | null {
  return nombrePropio(texto) || null;
}

/**
 * Nombre de un producto o descripción de una pieza. Sólo se arregla lo que
 * es claramente un error de mayúsculas: todo en minúscula o todo en mayúscula
 * (el bloqueo de mayúsculas olvidado). Si mezcla, la persona lo escribió así
 * a propósito y se respeta: "Ariana Grande Thank u", "e.l.f. Paleta".
 *
 *   "termo stanley 40 OZ" → se respeta (mezcla)
 *   "termo stanley"       → "Termo Stanley"
 *   "PACK DE CALZONES"    → "Pack de Calzones"
 *   "crema 250 ml"        → "Crema 250 ml"
 */
export function arreglarMayusculas(texto: string | null | undefined): string {
  const limpio = limpiarTexto(texto);
  if (!limpio) return '';
  const tieneLetras = /\p{L}/u.test(limpio);
  const todoMinuscula = limpio === limpio.toLocaleLowerCase('es');
  const todoMayuscula = limpio === limpio.toLocaleUpperCase('es');
  if (!tieneLetras || !(todoMinuscula || todoMayuscula)) return limpio;
  return tituloConParticulas(limpio, true);
}

/**
 * Un nombre que se escribe como frase ("Ropa interior", "Bolsos y
 * accesorios"): con el mismo criterio que `arreglarMayusculas`, pero sólo la
 * primera letra va en mayúscula.
 *
 *   "ROPA INTERIOR" → "Ropa interior"
 *   "skincare"      → "Skincare"
 */
export function arreglarMayusculasFrase(texto: string | null | undefined): string {
  const limpio = limpiarTexto(texto);
  if (!limpio) return '';
  const todoMinuscula = limpio === limpio.toLocaleLowerCase('es');
  const todoMayuscula = limpio === limpio.toLocaleUpperCase('es');
  if (!/\p{L}/u.test(limpio) || !(todoMinuscula || todoMayuscula)) return limpio;
  const minuscula = limpio.toLocaleLowerCase('es');
  return minuscula.replace(/\p{L}/u, (letra) => letra.toLocaleUpperCase('es'));
}

/** Talla de ropa: siempre en mayúscula ("m" → "M", "xl" → "XL"). */
export function formatearTalla(texto: string | null | undefined): string | undefined {
  const limpio = limpiarTexto(texto);
  return limpio ? limpio.toLocaleUpperCase('es') : undefined;
}

// ---------------------------------------------------------------------------
// Teléfonos
// ---------------------------------------------------------------------------

/** Dígitos de un número nicaragüense sin el código de país. */
const LARGO_LOCAL = 8;

export const ERROR_TELEFONO =
  'Revisá el teléfono: uno de Nicaragua lleva 8 dígitos; si es de otro país, empezalo con + y el código.';

/**
 * El teléfono como se guarda: `+505 8601 2442`, o con su código si es de
 * otro país (`+1 504 463 6250`). Acepta lo que una persona escribe o pega:
 * espacios, guiones, paréntesis, el `+505` de WhatsApp o un `00` adelante.
 *
 * Devuelve null si vino vacío. Tira un error que dice qué revisar si no
 * encaja: un número con un dígito de más o de menos no se adivina.
 */
export function formatearTelefono(
  entrada: string | null | undefined,
  codigoPais: string = CODIGO_PAIS
): string | null {
  const limpio = (entrada ?? '').replace(INVISIBLES, '').trim();
  if (!limpio) return null;

  const pais = codigoPais.replace(/\D+/g, '') || CODIGO_PAIS;
  const internacional = limpio.startsWith('+') || limpio.startsWith('00');
  let digitos = limpio.replace(/\D+/g, '');
  if (!limpio.startsWith('+') && limpio.startsWith('00')) digitos = digitos.slice(2);
  // Algo escrito sin un solo dígito no es "sin teléfono": guardar null
  // borraría en silencio lo que la persona escribió.
  if (!digitos) throw new Error(ERROR_TELEFONO);

  const local = (d: string) => `+${pais} ${d.slice(0, 4)} ${d.slice(4)}`;

  // Del país del negocio: 8 dígitos solos, o con el código adelante.
  if (!internacional && digitos.length === LARGO_LOCAL) return local(digitos);
  if (digitos.startsWith(pais) && digitos.length === pais.length + LARGO_LOCAL) {
    return local(digitos.slice(pais.length));
  }
  if (!internacional) throw new Error(ERROR_TELEFONO);

  // De otro país: sólo con + (o 00) y su código, que es la única forma de
  // saber dónde termina el código y empieza el número.
  if (digitos.startsWith('1') && digitos.length === 11) {
    return `+1 ${digitos.slice(1, 4)} ${digitos.slice(4, 7)} ${digitos.slice(7)}`;
  }
  // Centroamérica (501–509) con 8 dígitos locales, como Nicaragua.
  if (/^50[1-9]/.test(digitos) && digitos.length === 11) {
    return `+${digitos.slice(0, 3)} ${digitos.slice(3, 7)} ${digitos.slice(7)}`;
  }
  // Cualquier otro: el largo que admite el plan internacional (E.164).
  if (digitos.length >= 8 && digitos.length <= 15) return `+${digitos}`;
  throw new Error(ERROR_TELEFONO);
}
