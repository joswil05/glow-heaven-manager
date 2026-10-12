import type { ReactNode } from 'react';
import { WifiOff } from 'lucide-react';
import { textoDatosDe } from '../lib/conexion-movil';

/**
 * "Sin conexión · datos de las 10:42", arriba de todo (C3).
 *
 * Dice el estado de un vistazo y de cuándo es lo que se ve. No se anima:
 * aparece y desaparece con la señal. Ocupa el margen del notch (`pt-safe-t`);
 * quien la muestra le saca ese margen a las pantallas de abajo (`--safe-t`),
 * para que ningún encabezado quede con el margen dos veces. Al lado, lo que
 * espera subir (C4), si hay algo.
 */
export function FranjaSinConexion({ datosDe, children }: { datosDe: number | null; children?: ReactNode }) {
  const texto =
    datosDe === null
      ? 'Sin conexión · todavía no hay datos guardados'
      : `Sin conexión · datos ${textoDatosDe(datosDe, new Date())}`;
  return (
    <div role="status" className="shrink-0 bg-alerta-suave pt-safe-t text-alerta-fuerte">
      <p className="flex min-h-8 items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-semibold">
        <WifiOff size={14} className="shrink-0" aria-hidden="true" />
        {texto}
        {children}
      </p>
    </div>
  );
}
