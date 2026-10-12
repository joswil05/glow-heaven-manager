import { useCallback } from 'react';
import { useConexion } from '../context/ConexionContext';
import { useSnackbar } from '../components/Snackbar';
import { haptics } from './haptics';

/**
 * Lo que se dice cuando algo que escribe se toca sin señal (C3), en vez de
 * quedarse en "Guardando…" o fallar con un error técnico. Vender ya no está
 * acá: sin señal, la venta va a la cola del teléfono (C4).
 */
export const SIN_RED = {
  abono: 'Sin conexión: el abono se registra cuando vuelva la señal.',
  corregir: 'Sin conexión: corregir o anular se puede cuando vuelva la señal.',
  encargo: 'Sin conexión: los encargos se anotan y se cambian cuando vuelva la señal.',
  clienta: 'Sin conexión: la clienta nueva se guarda cuando vuelva la señal.',
  inventario: 'Sin conexión: esto se puede cuando vuelva la señal.',
  ajustes: 'Sin conexión: los cambios se guardan cuando vuelva la señal.',
  deshacer: 'Sin conexión: se puede deshacer cuando vuelva la señal.',
} as const;

/**
 * Frena una escritura sin red y lo dice. Devuelve `true` si se puede seguir.
 *
 * Sin `decir`, el mensaje sale en un aviso arriba: es para el botón que abre
 * una hoja, antes de escribir nada. Dentro de una hoja se pasa `decir` (el
 * error de la hoja), para que el mensaje quede junto al botón y no se vaya;
 * lo escrito no se toca.
 */
export function useExigirConexion(): (mensaje: string, decir?: (mensaje: string) => void) => boolean {
  const { enLinea } = useConexion();
  const { mostrar } = useSnackbar();
  return useCallback(
    (mensaje: string, decir?: (mensaje: string) => void) => {
      if (enLinea) return true;
      haptics.warning();
      if (decir) decir(mensaje);
      else mostrar(mensaje, 'info');
      return false;
    },
    [enLinea, mostrar]
  );
}
