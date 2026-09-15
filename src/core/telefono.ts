/**
 * Números de teléfono para WhatsApp.
 *
 * Existe porque el proyecto tenía CUATRO formas de armar el mismo número: la
 * del móvil, la de cobranza en Windows, una copia pegada dentro de
 * ClientesView, y la de los documentos. Las tres primeras anteponían el
 * código de país; la de los documentos no, así que mandar una factura o una
 * proforma abría `wa.me/88887777` y WhatsApp no encontraba a nadie.
 *
 * Ese error es de los que no se notan desde adentro: el enlace abre igual y
 * parece un problema del teléfono, no de la app.
 */

/** Código de país de Nicaragua, donde opera el negocio. */
export const CODIGO_PAIS = '505';

/** Cantidad de dígitos de un número nicaragüense sin código de país. */
const LARGO_LOCAL = 8;

/**
 * Deja sólo dígitos y antepone el código de país cuando hace falta.
 * Devuelve null si no hay número con el que trabajar.
 */
export function telefonoWhatsapp(telefono: string | undefined | null): string | null {
  if (!telefono) return null;

  const digitos = telefono.replace(/\D+/g, '');
  if (!digitos) return null;

  if (digitos.startsWith(CODIGO_PAIS)) return digitos;
  if (digitos.length === LARGO_LOCAL) return `${CODIGO_PAIS}${digitos}`;

  // Un número más largo o más corto ya trae su propio formato (otro país, o
  // algo mal escrito): se manda tal cual en vez de inventarle un prefijo.
  return digitos;
}

/**
 * Enlace de WhatsApp con el mensaje ya redactado.
 * Sin teléfono, abre WhatsApp para que se elija el contacto a mano.
 */
export function enlaceWhatsapp(telefono: string | undefined | null, mensaje: string): string {
  const numero = telefonoWhatsapp(telefono);
  const texto = encodeURIComponent(mensaje);
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`;
}
