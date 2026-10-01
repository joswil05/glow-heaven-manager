import { useEffect } from 'react';

/**
 * Lo que una pantalla tiene sin guardar, para que irse a otra sección
 * pregunte antes (CFG-02).
 *
 * Configuración se guarda con un solo botón al final de la página. Antes,
 * irse a Ventas con una cuenta bancaria "agregada a la lista" o un PIN nuevo
 * los perdía sin decir nada: la cuenta aparecía en la lista y nunca llegaba a
 * guardarse. Ahora la pantalla avisa que tiene algo pendiente y `App` lo
 * consulta antes de cambiar de sección.
 *
 * Una sola pantalla a la vez tiene guardia: las secciones no se montan juntas.
 */
let pendiente = false;

export function useGuardiaDeSalida(hayCambios: boolean): void {
  useEffect(() => {
    pendiente = hayCambios;
    return () => {
      pendiente = false;
    };
  }, [hayCambios]);
}

/** Si la pantalla de ahora tiene algo sin guardar. */
export function haySinGuardar(): boolean {
  return pendiente;
}
