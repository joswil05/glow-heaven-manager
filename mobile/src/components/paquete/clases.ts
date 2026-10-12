/**
 * Las clases que comparten la pantalla "Llegó un paquete" y sus hojas: campos
 * de 16 px y blancos de 44 px como mínimo (criterios de diseño de las fases
 * del celular), colores sólo por token.
 */
export const campo =
  'mt-1 min-h-12 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto outline-none focus:border-acento disabled:bg-superficie-2 disabled:text-texto-2 aria-[invalid=true]:border-peligro';
export const principal =
  'min-h-12 rounded-xl bg-acento px-5 py-3 text-base font-bold text-acento-texto disabled:opacity-60';
export const secundario =
  'min-h-12 rounded-xl border border-borde bg-superficie px-4 py-3 text-base font-semibold text-texto disabled:opacity-60';
export const casilla = 'h-5 w-5 shrink-0 accent-[rgb(var(--acento))]';

/** Enfoca el primer campo marcado con error dentro de un contenedor. */
export function enfocarError(contenedor: HTMLElement | null) {
  requestAnimationFrame(() => contenedor?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}
