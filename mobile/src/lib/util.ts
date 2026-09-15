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

// El número de WhatsApp se arma en `@core/telefono`, compartido con la app de
// escritorio: las dos tienen que abrir el mismo chat para la misma clienta.
export { telefonoWhatsapp } from '@core/telefono';
export { enlaceWhatsapp as linkWhatsapp } from '@core/telefono';

// La fecha del negocio vive en `@core/fechas`, compartida con la app de
// escritorio: las dos tienen que estar de acuerdo en qué día es hoy.
export { hoyISO } from '@core/fechas';
