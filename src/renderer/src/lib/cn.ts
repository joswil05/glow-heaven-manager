import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Une clases de Tailwind resolviendo conflictos: la última gana.
 * Sin esto, `cn('p-2', 'p-4')` dejaría ambas y el resultado dependería
 * del orden en la hoja de estilos, no del orden de la llamada.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
