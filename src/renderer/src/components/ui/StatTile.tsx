import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Money } from './Money';
import { StatusDot } from './StatusDot';
import type { Tone } from './Badge';

export interface StatTileProps {
  label: string;
  /** Monto en centavos USD. Se muestra con su equivalente en C$. */
  usd_cents?: number;
  /** Alternativa a `usd_cents` para valores que no son dinero. */
  value?: React.ReactNode;
  hint?: string;
  tone?: Tone | 'purple';
  icon?: LucideIcon;
  /** Comparación con el periodo anterior, ya formateada. */
  delta?: { texto: string; positivo: boolean };
  size?: 'md' | 'lg';
  /** Si es true, solo muestra el monto en USD sin la conversión inferior en C$. */
  soloUsd?: boolean;
  /** Si es true, muestra el enlace textual 'Ver ->' en el pie. Por defecto false. */
  mostrarVer?: boolean;
  onClick?: () => void;
  className?: string;
}

const ESTILOS_TONO: Record<
  Tone | 'purple',
  {
    borde: string;
    iconBox: string;
    glowBg: string;
    tagClass?: string;
  }
> = {
  neutral: {
    borde: 'border-borde hover:border-borde-fuerte',
    iconBox: 'bg-superficie-2 text-texto-2 border-borde/80 shadow-2xs',
    glowBg: 'hover:shadow-superficie-2/50',
  },
  success: {
    borde: 'border-borde hover:border-acento/40',
    iconBox: 'bg-acento/10 text-acento border-acento/20 shadow-2xs',
    glowBg: 'hover:shadow-lg',
  },
  warning: {
    borde: 'border-borde hover:border-alerta/40',
    iconBox: 'bg-alerta/10 text-alerta border-alerta/20 shadow-2xs',
    glowBg: 'hover:shadow-lg',
  },
  danger: {
    borde: 'border-borde hover:border-peligro/40',
    iconBox: 'bg-peligro/10 text-peligro border-peligro/20 shadow-2xs',
    glowBg: 'hover:shadow-lg',
  },
  info: {
    borde: 'border-borde hover:border-borde-fuerte',
    iconBox: 'bg-superficie-3 text-texto-2 border-borde shadow-2xs',
    glowBg: 'hover:shadow-md',
  },
  purple: {
    borde: 'border-borde hover:border-borde-fuerte',
    iconBox: 'bg-superficie-2 text-texto-2 border-borde/80 shadow-2xs',
    glowBg: 'hover:shadow-superficie-2/50',
  },
};

export const StatTile: React.FC<StatTileProps> = ({
  label,
  usd_cents,
  value,
  hint,
  tone = 'neutral',
  icon: Icon,
  delta,
  size = 'lg',
  soloUsd = false,
  mostrarVer = false,
  onClick,
  className,
}) => {
  const estilo = ESTILOS_TONO[tone] ?? ESTILOS_TONO.neutral;

  const contenido = (
    <div className="flex flex-col h-full justify-between">
      {/* Fila superior: Icono + Label + Indicador click. */}
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-[130px]">
          {Icon && (
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-all duration-200 group-hover:scale-105',
                estilo.iconBox
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
          )}
          <span className="text-label font-semibold text-texto-2 truncate">{label}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tabular border shrink-0 shadow-2xs',
                delta.positivo
                  ? 'bg-acento-suave text-acento border-acento-suave'
                  : 'bg-peligro-suave text-peligro border-peligro-suave'
              )}
            >
              {delta.positivo ? (
                <TrendingUp className="w-3 h-3 text-acento" />
              ) : (
                <TrendingDown className="w-3 h-3 text-peligro" />
              )}
              {delta.texto}
            </span>
          )}
          {onClick && (
            <div className="w-5 h-5 rounded-md bg-superficie-2/70 flex items-center justify-center text-texto-3 group-hover:text-acento group-hover:bg-acento-suave/50 transition-colors">
              <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          )}
          {tone !== 'neutral' && !Icon && <StatusDot tone={tone as Tone} />}
        </div>
      </div>

      {/* Fila central: Métrica principal */}
      <div className={cn('flex items-baseline justify-between gap-2', size === 'lg' ? 'mt-2' : 'mt-1.5')}>
        <div className="flex flex-col min-w-0">
          {usd_cents !== undefined ? (
            <Money
              usd_cents={usd_cents}
              size={size === 'lg' ? 'xl' : 'lg'}
              soloUsd={soloUsd}
              layout={soloUsd ? 'inline' : 'stacked'}
              className="font-extrabold tracking-tight text-texto"
            />
          ) : (
            <span className={cn('text-texto tabular font-extrabold tracking-tight leading-none', size === 'lg' ? 'text-2xl' : 'text-xl')}>
              {value}
            </span>
          )}
        </div>
      </div>

      {/* Fila inferior: Contexto / Pista */}
      {hint && (
        <div className={cn('border-t border-borde/40 flex items-center justify-between text-caption text-texto-3 leading-tight', size === 'lg' ? 'mt-2 pt-2' : 'mt-1.5 pt-1.5')}>
          <span className="truncate font-medium">{hint}</span>
          {mostrarVer && onClick && (
            <span className="text-[11px] font-medium text-acento inline-flex items-center gap-0.5 group-hover:underline ml-1.5 shrink-0">
              Ver
              <span className="transition-transform duration-200 group-hover:translate-x-0.5">&rarr;</span>
            </span>
          )}
        </div>
      )}
    </div>
  );

  const clases = cn(
    'group relative bg-gradient-to-b from-superficie via-superficie to-superficie-2/20 rounded-xl border text-left w-full shadow-2xs',
    'transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md',
    size === 'lg' ? 'p-3' : 'p-2.5',
    estilo.borde,
    estilo.glowBg,
    onClick &&
      'cursor-pointer active:scale-[0.985] active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
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
