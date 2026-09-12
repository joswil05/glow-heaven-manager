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
    borde: string;
    iconBox: string;
    glowBg: string;
    tagClass?: string;
  }
> = {
  neutral: {
    borde: 'border-borde hover:border-borde-fuerte',
    iconBox: 'bg-slate-100 text-slate-700 border-slate-200/80 shadow-sm',
    glowBg: 'hover:shadow-slate-200/40',
  },
  success: {
    borde: 'border-borde hover:border-emerald-500/40',
    iconBox: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 shadow-sm shadow-emerald-500/10',
    glowBg: 'hover:shadow-emerald-500/5',
  },
  warning: {
    borde: 'border-borde hover:border-amber-500/40',
    iconBox: 'bg-amber-500/10 text-amber-700 border-amber-500/20 shadow-sm shadow-amber-500/10',
    glowBg: 'hover:shadow-amber-500/5',
  },
  danger: {
    borde: 'border-borde hover:border-rose-500/40',
    iconBox: 'bg-rose-500/10 text-rose-700 border-rose-500/20 shadow-sm shadow-rose-500/10',
    glowBg: 'hover:shadow-rose-500/5',
  },
  info: {
    borde: 'border-borde hover:border-sky-500/40',
    iconBox: 'bg-sky-500/10 text-sky-700 border-sky-500/20 shadow-sm shadow-sky-500/10',
    glowBg: 'hover:shadow-sky-500/5',
  },
  purple: {
    borde: 'border-borde hover:border-indigo-500/40',
    iconBox: 'bg-indigo-500/10 text-indigo-700 border-indigo-500/20 shadow-sm shadow-indigo-500/10',
    glowBg: 'hover:shadow-indigo-500/5',
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
      {/* Fila superior: Icono + Label + Indicador click */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <div
              className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border transition-all duration-200 group-hover:scale-105',
                estilo.iconBox
              )}
            >
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
          <span className="text-caption font-semibold text-texto-2 truncate">{label}</span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular border shrink-0 shadow-2xs',
                delta.positivo
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70'
                  : 'bg-rose-50 text-rose-700 border-rose-200/70'
              )}
            >
              {delta.positivo ? (
                <TrendingUp className="w-2.5 h-2.5 text-emerald-600" />
              ) : (
                <TrendingDown className="w-2.5 h-2.5 text-rose-600" />
              )}
              {delta.texto}
            </span>
          )}
          {onClick && (
            <div className="w-5 h-5 rounded-md bg-superficie-2/70 flex items-center justify-center text-texto-3 group-hover:text-acento group-hover:bg-acento-suave/50 transition-colors">
              <ArrowUpRight className="w-3 h-3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          )}
          {tone !== 'neutral' && !Icon && <StatusDot tone={tone as Tone} />}
        </div>
      </div>

      {/* Fila central: Métrica principal en layout apilado */}
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <div className="flex flex-col min-w-0">
          {usd_cents !== undefined ? (
            <Money
              usd_cents={usd_cents}
              size={size === 'lg' ? 'lg' : 'md'}
              layout="stacked"
              className="font-bold tracking-tight text-texto"
            />
          ) : (
            <span className="text-texto tabular font-bold text-xl tracking-tight leading-none">
              {value}
            </span>
          )}
        </div>
      </div>

      {/* Fila inferior: Contexto / Pista */}
      {hint && (
        <div className="mt-2 pt-1.5 border-t border-borde/40 flex items-center justify-between text-[11px] text-texto-3 leading-tight">
          <span className="truncate">{hint}</span>
          {onClick && (
            <span className="text-[10px] font-medium text-acento inline-flex items-center gap-0.5 group-hover:underline ml-1.5 shrink-0">
              Ver
              <span className="transition-transform duration-200 group-hover:translate-x-0.5">&rarr;</span>
            </span>
          )}
        </div>
      )}
    </div>
  );

  const clases = cn(
    'group relative bg-gradient-to-b from-superficie via-superficie to-superficie-2/20 rounded-xl border px-3.5 py-2.5 text-left w-full shadow-2xs transition-all duration-200',
    estilo.borde,
    estilo.glowBg,
    onClick &&
      'cursor-pointer hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
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
