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
  onClick?: () => void;
  className?: string;
}

const ESTILOS_TONO: Record<
  Tone | 'purple',
  {
    bordeTop: string;
    iconBox: string;
    glowBg: string;
  }
> = {
  neutral: {
    bordeTop: 'border-t-slate-300',
    iconBox: 'bg-slate-100 text-slate-600 border-slate-200/80',
    glowBg: 'hover:border-slate-300',
  },
  success: {
    bordeTop: 'border-t-emerald-500',
    iconBox: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 shadow-sm shadow-emerald-500/10',
    glowBg: 'hover:border-emerald-500/40',
  },
  warning: {
    bordeTop: 'border-t-amber-500',
    iconBox: 'bg-amber-500/10 text-amber-600 border-amber-500/20 shadow-sm shadow-amber-500/10',
    glowBg: 'hover:border-amber-500/40',
  },
  danger: {
    bordeTop: 'border-t-rose-500',
    iconBox: 'bg-rose-500/10 text-rose-600 border-rose-500/20 shadow-sm shadow-rose-500/10',
    glowBg: 'hover:border-rose-500/40',
  },
  info: {
    bordeTop: 'border-t-sky-500',
    iconBox: 'bg-sky-500/10 text-sky-600 border-sky-500/20 shadow-sm shadow-sky-500/10',
    glowBg: 'hover:border-sky-500/40',
  },
  purple: {
    bordeTop: 'border-t-indigo-500',
    iconBox: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 shadow-sm shadow-indigo-500/10',
    glowBg: 'hover:border-indigo-500/40',
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
  size = 'md',
  onClick,
  className,
}) => {
  const estilo = ESTILOS_TONO[tone] ?? ESTILOS_TONO.neutral;

  const contenido = (
    <div className="flex flex-col h-full justify-between">
      {/* Fila superior: Icono + Label + Badges */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <div
              className={cn(
                'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-transform duration-200 group-hover:scale-105',
                estilo.iconBox
              )}
            >
              <Icon className="w-4 h-4" />
            </div>
          )}
          <span className="text-label font-medium text-texto-2 truncate">{label}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onClick && (
            <ArrowUpRight className="w-3.5 h-3.5 text-texto-3 opacity-0 group-hover:opacity-100 transition-opacity -translate-y-0.5" />
          )}
          {tone !== 'neutral' && !Icon && <StatusDot tone={tone as Tone} />}
        </div>
      </div>

      {/* Fila central: Métrica principal y badge de variación */}
      <div className="mt-3 flex items-baseline justify-between gap-2 flex-wrap">
        <div className="flex items-baseline gap-2">
          {usd_cents !== undefined ? (
            <Money
              usd_cents={usd_cents}
              size={size === 'lg' ? 'xl' : 'lg'}
              className="font-bold tracking-tight text-texto"
            />
          ) : (
            <span
              className={cn(
                'text-texto tabular font-bold tracking-tight',
                size === 'lg' ? 'text-metric' : 'text-metric-sm'
              )}
            >
              {value}
            </span>
          )}
        </div>

        {delta && (
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tabular border shrink-0',
              delta.positivo
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                : 'bg-rose-50 text-rose-700 border-rose-200/70'
            )}
          >
            {delta.positivo ? (
              <TrendingUp className="w-3 h-3 text-emerald-600" />
            ) : (
              <TrendingDown className="w-3 h-3 text-rose-600" />
            )}
            {delta.texto}
          </span>
        )}
      </div>

      {/* Fila inferior: Contexto / Pista */}
      {hint && (
        <div className="mt-2.5 pt-2 border-t border-borde/40 flex items-center justify-between text-caption text-texto-3">
          <span className="truncate">{hint}</span>
          {onClick && (
            <span className="text-[11px] font-medium text-acento group-hover:underline ml-2 shrink-0">
              Ver detalles &rarr;
            </span>
          )}
        </div>
      )}
    </div>
  );

  const clases = cn(
    'group relative bg-superficie rounded-2xl border border-borde/90 p-4 text-left w-full shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all duration-200',
    'border-t-2',
    estilo.bordeTop,
    estilo.glowBg,
    onClick &&
      'cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-borde-fuerte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
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
