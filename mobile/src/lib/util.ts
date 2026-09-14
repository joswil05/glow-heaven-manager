/**
 * Cada acción del usuario (una venta, un abono) necesita un
 * `evento_grupo_id`: es lo que la auditoría de `EventosRepoFirestore` usa
 * para poder deshacer todo lo que esa acción tocó de una sola vez.
 */
export function nuevoGrupoEvento(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Respaldo para navegadores viejos sin `crypto.randomUUID` (Android WebView antiguo).
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Deja solo dígitos, y antepone el código de país de Nicaragua si hace falta. */
export function telefonoWhatsapp(telefono: string | undefined | null): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D+/g, '');
  if (!digitos) return null;
  if (digitos.startsWith('505')) return digitos;
  if (digitos.length === 8) return `505${digitos}`;
  return digitos;
}

/** Arma el link de WhatsApp con el texto ya redactado. */
export function linkWhatsapp(telefono: string | undefined | null, mensaje: string): string | null {
  const numero = telefonoWhatsapp(telefono);
  const texto = encodeURIComponent(mensaje);
  return numero ? `https://wa.me/${numero}?text=${texto}` : `https://wa.me/?text=${texto}`;
}

// La fecha del negocio vive en `@core/fechas`, compartida con la app de
// escritorio: las dos tienen que estar de acuerdo en qué día es hoy.
export { hoyISO } from '@core/fechas';
