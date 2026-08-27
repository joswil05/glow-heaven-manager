import React from 'react';
import { formatearMoneda } from '@core/moneda';

interface DualMoneyDisplayProps {
  cor_cents: number;
  usd_cents: number;
  primary?: 'COR' | 'USD';
  size?: 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
  subtleSecondary?: boolean;
}

export const DualMoneyDisplay: React.FC<DualMoneyDisplayProps> = ({
  cor_cents,
  usd_cents,
  primary = 'COR',
  size = 'base',
  className = '',
  subtleSecondary = true,
}) => {
  const primaryText =
    primary === 'COR'
      ? formatearMoneda(cor_cents, 'COR')
      : formatearMoneda(usd_cents, 'USD');

  const secondaryText =
    primary === 'COR'
      ? formatearMoneda(usd_cents, 'USD')
      : formatearMoneda(cor_cents, 'COR');

  const sizeClasses = {
    sm: 'text-xs',
    base: 'text-sm font-semibold',
    lg: 'text-base font-bold',
    xl: 'text-lg font-bold',
    '2xl': 'text-2xl font-black tracking-tight',
    '3xl': 'text-3xl font-black tracking-tight',
  };

  const secondarySizeClasses = {
    sm: 'text-[10px]',
    base: 'text-xs',
    lg: 'text-xs',
    xl: 'text-sm',
    '2xl': 'text-base font-semibold',
    '3xl': 'text-lg font-semibold',
  };

  return (
    <div className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span className={`${sizeClasses[size]} text-slate-900`}>{primaryText}</span>
      <span
        className={`${secondarySizeClasses[size]} ${
          subtleSecondary ? 'text-slate-500 font-medium' : 'text-slate-700 font-semibold'
        }`}
      >
        ({secondaryText})
      </span>
    </div>
  );
};
