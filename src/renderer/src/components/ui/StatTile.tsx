import React from 'react';
import { cn } from '../../lib/cn';
import { Money } from './Money';
import type { Tone } from './Badge';

const ACENTOS: Record<Tone, string> = {
  neutral: 'border-l-slate-300',
  success: 'border-l-success-500',
  warning: 'border-l-warning-500',
  danger: 'border-l-danger-500',
  info: 'border-l-brand-500',
};

export interface StatTileProps {
  label: string;
  cor_cents?: number;
  usd_cents?: number;
  value?: React.ReactNode;
  hint?: string;
  tone?: Tone;
  className?: string;
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  cor_cents,
  usd_cents,
  value,
  hint,
  tone = 'neutral',
  className,
}) => (
  <div
    className={cn(
      'bg-white rounded-lg border border-slate-200 border-l-4 p-4',
      ACENTOS[tone],
      className
    )}
  >
    <div className="text-label text-slate-500">{label}</div>
    <div className="mt-1">
      {cor_cents !== undefined ? (
        <Money cor_cents={cor_cents} usd_cents={usd_cents} size="xl" />
      ) : (
        <span className="text-metric text-slate-900 tabular">{value}</span>
      )}
    </div>
    {hint && <p className="mt-1 text-caption text-slate-500">{hint}</p>}
  </div>
);
