import React, { useId } from 'react';
import type { MonedaPago } from '../../../shared/types';
import { cn } from '../lib/cn';

/**
 * En qué moneda pagó: dos tarjetas a la vista, antes del monto.
 *
 * Es el dato que se equivoca (lo que motivó la 2.16.1), y se pedía con tres
 * controles distintos: un desplegable con dólares primero en Registrar abono
 * y en Aceptó, y estas tarjetas en Corregir (PAG-01). Ahora son éstas en los
 * tres, y el monto se lee en la moneda elegida.
 */
export const TarjetasMoneda: React.FC<{
  valor: MonedaPago;
  onCambiar: (m: MonedaPago) => void;
  /** La moneda en que se registró, en Corregir: queda marcada. */
  original?: MonedaPago;
}> = ({ valor, onCambiar, original }) => {
  const id = useId();
  return (
    <div>
      <span id={id} className="block text-label text-texto-2 mb-1">
        Moneda en que pagó
      </span>
      <div role="radiogroup" aria-labelledby={id} className="grid grid-cols-2 gap-2">
        {(['COR', 'USD'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={valor === m}
            onClick={() => onCambiar(m)}
            className={cn(
              'rounded-lg border-2 px-3 py-2 text-left transition-[background-color,border-color,color] duration-150',
              valor === m ? 'border-acento bg-acento-suave/30 text-texto' : 'border-borde text-texto-2 hover:bg-superficie-2'
            )}
          >
            <span className="block text-label font-semibold">{m === 'COR' ? 'Córdobas (C$)' : 'Dólares ($)'}</span>
            {original === m && <span className="block text-caption text-texto-3">como se registró</span>}
          </button>
        ))}
      </div>
    </div>
  );
};

/** "Cuánto pagó (C$)": la etiqueta del monto dice en qué moneda se lee. */
export const etiquetaMonto = (moneda: MonedaPago): string => `Cuánto pagó (${moneda === 'COR' ? 'C$' : '$'})`;

/**
 * Lo que la ventana sugiere cobrar (en dólares), escrito en la moneda elegida
 * con la tasa de la venta. Vacío si no hay nada que sugerir.
 *
 * Cuando se cambia la moneda y el monto sigue siendo el sugerido, se vuelve a
 * escribir con esto: "47.50" dólares pasaban a ser C$47.50 (PAG-02). Si ella
 * ya lo cambió, se deja como está.
 */
export function montoSugerido(usd_cents: number, moneda: MonedaPago, tasa_cambio_cents: number): string {
  if (usd_cents <= 0) return '';
  const enMoneda = moneda === 'COR' ? Math.round((usd_cents * tasa_cambio_cents) / 100) : usd_cents;
  return (enMoneda / 100).toFixed(2);
}
