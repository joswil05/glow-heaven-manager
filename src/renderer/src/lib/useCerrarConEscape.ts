import { useEffect } from 'react';

/**
 * Cierra un diálogo con la tecla Escape.
 *
 * Escape es la salida que la gente prueba primero cuando una ventana la
 * bloquea, y es la única que no depende de encontrar la X con el mouse. El
 * patrón estaba repetido a mano en siete archivos y faltaba en dos: el modal
 * de abono de Cobranza y el editor de paquetes.
 */
export function useCerrarConEscape(abierto: boolean, onCerrar: () => void): void {
  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierto, onCerrar]);
}
