import { useRef } from 'react';

/**
 * Si un formulario cambió desde que se abrió.
 *
 * Se compara una "firma" (lo que importa del formulario, en texto) contra la
 * del momento en que se cargó. `version` sube cada vez que el formulario se
 * reinicia, en el mismo efecto que pone los valores de partida: así la firma
 * de partida es la de ese dibujo, ya con los valores nuevos.
 *
 * Existe para que "¿Descartar lo que escribiste?" pregunte sólo cuando hay
 * algo que perder: preguntar por nada entrena a apretar "Descartar" sin leer.
 */
export function useHayCambios(firma: string, version: number): boolean {
  const inicial = useRef<{ version: number; firma: string } | null>(null);
  if (inicial.current === null || inicial.current.version !== version) {
    inicial.current = { version, firma };
  }
  return firma !== inicial.current.firma;
}
