import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Money } from './Money';
import { StatusDot } from './StatusDot';
import type { Tone } from './Badge';

export interface StatTileProps {
  label: string;
  /** Monto en centavos USD. */
  usd_cents?: number;
  /** Alternativa a `usd_cents` para valores que no son dinero. */
  value?: React.ReactNode;
  hint?: string;
  tone?: Tone | 'purple';
  /**
   * Se acepta por compatibilidad y no se dibuja: el ícono en su cajita repetía
   * lo que ya dice la etiqueta, en cada tarjeta de cada pantalla.
   */
  icon?: LucideIcon;
  /** Comparación con el periodo anterior, ya formateada. */
  delta?: { texto: string; positivo: boolean };
  size?: 'md' | 'lg';
  /**
   * Por omisión la tarjeta muestra sólo dólares, que es la moneda del negocio.
   * El equivalente en córdobas se pide explícitamente con `soloUsd={false}`.
   */
  soloUsd?: boolean;
  /** Si es true, muestra el enlace textual 'Ver ->' en el pie. Por defecto false. */
  mostrarVer?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Una cifra con su etiqueta. Tres niveles como máximo: etiqueta, número y una
 * línea de contexto que diga algo que el número no dice.
 */
export const StatTile: React.FC<StatTileProps> = ({
  label,
  usd_cents,
  value,
  hint,
  tone = 'neutral',
  delta,
  size = 'lg',
  soloUsd = true,
  mostrarVer = false,
  onClick,
  className,
}) => {
  const contenido = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 min-w-0">
          {/* Un punto de color sólo cuando la cifra pide atención. */}
          {(tone === 'warning' || tone === 'danger') && <StatusDot tone={tone} />}
          <span className="text-label font-medium text-texto-2 truncate">{label}</span>
        </span>

        {onClick && (
          <ArrowUpRight
            aria-hidden
            className="w-3.5 h-3.5 shrink-0 text-texto-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        )}
      </div>

      {/* La comparación va junto al número que compara, no peleando con la
          etiqueta por el ancho: ahí la cortaba a "Ganancia de e...". */}
      <div className={cn('min-w-0 flex items-baseline gap-2 flex-wrap', size === 'lg' ? 'mt-2' : 'mt-1.5')}>
        {delta && (
          <span
            className={cn(
              'order-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold tabular',
              delta.positivo ? 'bg-acento-suave text-acento' : 'bg-peligro-suave text-peligro'
            )}
          >
            {delta.positivo ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {delta.texto}
          </span>
        )}
        {usd_cents !== undefined ? (
          <Money
            usd_cents={usd_cents}
            size={size === 'lg' ? 'xl' : 'lg'}
            soloUsd={soloUsd}
            layout={soloUsd ? 'inline' : 'stacked'}
            className="font-bold tracking-tight text-texto"
          />
        ) : (
          <span
            className={cn(
              'block text-texto tabular font-bold tracking-tight leading-none',
              size === 'lg' ? 'text-2xl' : 'text-xl'
            )}
          >
            {value}
          </span>
        )}
      </div>

      {hint && (
        <div className="mt-1.5 flex items-center justify-between text-caption text-texto-3 leading-tight">
          <span className="truncate">{hint}</span>
          {mostrarVer && onClick && (
            <span className="text-[11px] font-medium text-acento ml-1.5 shrink-0 group-hover:underline">
              Ver
            </span>
          )}
        </div>
      )}
    </div>
  );

  const clases = cn(
    // Superficie plana, no degradada: en modo oscuro un degradado hacia
    // `superficie-2` dejaba el pie más oscuro que la base y la tarjeta se
    // hundía. El relieve lo dan el borde y la sombra.
    'group relative bg-superficie rounded-xl border border-borde text-left w-full shadow-2xs',
    size === 'lg' ? 'px-4 py-3.5' : 'px-3 py-2.5',
    // Sólo reacciona al mouse lo que se puede apretar. Una tarjeta que se
    // levanta sin hacer nada promete una acción que no existe.
    onClick &&
      'cursor-pointer transition-[border-color,box-shadow,transform] duration-150 ease-out hover:border-borde-fuerte active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
    className
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={clases}>
        {contenido}
      </button>
    );
  }

  return <div className={clases}>{contenido}</div>;
};
