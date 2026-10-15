import { haptics } from '../lib/haptics';

/**
 * Elegir entre dos a cuatro opciones con botones (OPC-1), en vez de una lista
 * desplegable: un toque en lugar de dos y una ruedita, y se ve qué está
 * elegido sin abrir nada. Es el mismo control que la moneda del abono, ahora
 * compartido.
 */
export function OpcionesSegmentadas<T extends string>({
  etiquetaId,
  opciones,
  valor,
  onCambiar,
  deshabilitado = false,
}: {
  /** El id del texto que nombra el grupo ("Cómo pagó"). */
  etiquetaId: string;
  opciones: readonly { valor: T; texto: string }[];
  valor: T;
  onCambiar: (valor: T) => void;
  deshabilitado?: boolean;
}) {
  return (
    <div role="radiogroup" aria-labelledby={etiquetaId} className="flex rounded-xl bg-superficie-2/90 p-1">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          disabled={deshabilitado}
          onClick={() => {
            if (valor !== o.valor) haptics.selection();
            onCambiar(o.valor);
          }}
          className={`flex-1 min-h-10 py-2 text-xs font-bold rounded-lg transition-[background-color,color,box-shadow] duration-150 disabled:opacity-50 ${
            valor === o.valor ? 'bg-superficie-3 text-texto shadow-sm' : 'text-texto-3'
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/** Los métodos de pago, con los nombres de toda la app. */
export const OPCIONES_METODO = [
  { valor: 'EFECTIVO', texto: 'Efectivo' },
  { valor: 'TRANSFERENCIA', texto: 'Transferencia' },
  { valor: 'OTRO', texto: 'Otro' },
] as const;
