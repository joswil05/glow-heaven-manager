/**
 * Ilumina un campo un instante: para decir qué cambió cuando cambió por otro
 * botón ("Usar" el precio sugerido). Es un uso ocasional, así que se anima;
 * lo que cambia al tipear no.
 *
 * Quitar la clase y forzar un reflow antes de volver a ponerla hace que la
 * animación arranque de nuevo aunque se toque dos veces seguidas.
 */
export function resaltar(el: HTMLElement | null | undefined): void {
  if (!el) return;
  el.classList.remove('resaltar');
  void el.offsetWidth;
  el.classList.add('resaltar');
}
