import { useEffect, useId, useState } from 'react';
import type React from 'react';

/**
 * Una lista de sugerencias que se maneja con el teclado, como un combo:
 * flechas para moverse, Enter para elegir (sin marcar ninguna, la primera).
 *
 * Escape no está acá: lo resuelve el marco de la ventana por capas
 * (`alEscape`), para que cierre la lista antes que la ventana.
 *
 * Existe porque las tres listas de sugerencias (producto en Nueva venta,
 * producto en Registrar paquete, clienta en Nuevo encargo) obligaban a ir al
 * mouse en medio de tipear, que es justo cuando menos se quiere soltar el
 * teclado.
 *
 * `reinicio` cambia cuando cambian los resultados (el texto buscado): la
 * marca vuelve a cero para no quedar sobre algo que ya no es lo mismo.
 */
export function useListaConTeclado(cantidad: number, alElegir: (indice: number) => void, reinicio: unknown) {
  const id = useId();
  const [activo, setActivo] = useState(-1);
  const idOpcion = (i: number) => `${id}-op-${i}`;

  useEffect(() => {
    setActivo(-1);
  }, [reinicio]);

  useEffect(() => {
    if (activo >= 0) document.getElementById(idOpcion(activo))?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo]);

  const alTeclear = (e: React.KeyboardEvent) => {
    if (cantidad === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActivo((i) => (i + 1) % cantidad);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActivo((i) => (i <= 0 ? cantidad - 1 : i - 1));
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      // Es de la lista: que no lo tome el formulario para pasar de campo.
      e.preventDefault();
      e.stopPropagation();
      alElegir(activo >= 0 && activo < cantidad ? activo : 0);
    }
  };

  return {
    activo,
    propsCampo: {
      role: 'combobox' as const,
      'aria-expanded': true,
      'aria-controls': `${id}-lista`,
      'aria-autocomplete': 'list' as const,
      'aria-activedescendant': activo >= 0 ? idOpcion(activo) : undefined,
      onKeyDown: alTeclear,
    },
    propsLista: { id: `${id}-lista`, role: 'listbox' as const },
    propsOpcion: (i: number) => ({
      id: idOpcion(i),
      role: 'option' as const,
      'aria-selected': i === activo,
      onMouseEnter: () => setActivo(i),
    }),
  };
}
