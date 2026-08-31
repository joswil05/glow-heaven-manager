import React from 'react';
import { cn } from '../../lib/cn';
import { Money } from './Money';
import { StatusDot } from './StatusDot';
import type { Tone } from './Badge';

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
      'bg-white rounded-lg border border-slate-200 p-4',
      className
    )}
  >
    <div className="flex items-center justify-between gap-2">
      <span className="text-label text-slate-500">{label}</span>
      {tone !== 'neutral' && <StatusDot tone={tone} />}
    </div>
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
