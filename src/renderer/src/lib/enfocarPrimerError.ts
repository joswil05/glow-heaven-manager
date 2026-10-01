/**
 * Lleva el foco al primer campo marcado con error (`aria-invalid="true"`)
 * dentro de `raiz`, y lo trae a la vista.
 *
 * Los errores van en su campo, no en un recuadro arriba del formulario: en
 * uno largo ese recuadro queda fuera de la vista y el botón parece no hacer
 * nada. Se espera un cuadro porque el campo recién se marca en el próximo
 * dibujo. Sin animar el desplazamiento: es la respuesta a una tecla.
 */
export function enfocarPrimerError(raiz: HTMLElement | null): void {
  requestAnimationFrame(() => {
    const campo = raiz?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!campo) return;
    campo.scrollIntoView({ block: 'center' });
    campo.focus({ preventScroll: true });
  });
}
