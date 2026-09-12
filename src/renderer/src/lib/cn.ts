import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Une clases de Tailwind resolviendo conflictos: la última gana.
 *
 * tailwind-merge trae una tabla fija de utilidades y NO lee el tema del
 * proyecto. Sin declararle los tamaños propios (`text-body`, `text-metric`…)
 * los clasifica como color de texto, porque ambos empiezan con `text-`.
 * Entonces, dentro de un mismo `cn()`, uno borra al otro en silencio:
 *
 *   twMerge('text-white',  'text-label')     -> 'text-label'      sin color
 *   twMerge('text-metric', 'text-texto') -> 'text-texto'  sin tamaño
 *
 * Eso hacía que los montos del panel, declarados a 28px, salieran a 16px, y
 * que los botones primarios perdieran `text-white` y quedaran en 2.8:1 sobre
 * su propio fondo. Toda la jerarquía estaba escrita y no llegaba a pantalla.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: ['caption', 'label', 'body', 'title', 'display', 'metric', 'metric-sm'],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
