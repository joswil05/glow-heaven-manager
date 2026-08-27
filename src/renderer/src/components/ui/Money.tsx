import React from 'react';
import { cn } from '../../lib/cn';
import { formatearMoneda } from '@core/moneda';

export type MoneySize = 'sm' | 'md' | 'lg' | 'xl';

const PRIMARIO: Record<MoneySize, string> = {
  sm: 'text-label',
  md: 'text-body font-semibold',
  lg: 'text-metric-sm',
  xl: 'text-metric',
};

const SECUNDARIO: Record<MoneySize, string> = {
  sm: 'text-caption',
  md: 'text-caption',
  lg: 'text-label',
  xl: 'text-body',
};

export interface MoneyProps {
  cor_cents: number;
  usd_cents?: number;
  size?: MoneySize;
  primary?: 'COR' | 'USD';
  className?: string;
}

export const Money: React.FC<MoneyProps> = ({
  cor_cents,
  usd_cents,
  size = 'md',
  primary = 'COR',
  className,
}) => {
  const principal =
    primary === 'COR'
      ? formatearMoneda(cor_cents, 'COR')
      : formatearMoneda(usd_cents ?? 0, 'USD');

  const secundario =
    usd_cents === undefined
      ? null
      : primary === 'COR'
        ? formatearMoneda(usd_cents, 'USD')
        : formatearMoneda(cor_cents, 'COR');

  return (
    <span className={cn('inline-flex items-baseline gap-1.5 tabular', className)}>
      <span className={cn(PRIMARIO[size], 'text-slate-900')}>{principal}</span>
      {secundario && (
        <span className={cn(SECUNDARIO[size], 'text-slate-500')}>{secundario}</span>
      )}
    </span>
  );
};
