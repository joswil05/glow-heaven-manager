import React from 'react';
import { cn } from '../../lib/cn';
import type { Tone } from './Badge';

const PUNTOS: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-brand-500',
};

export interface StatusDotProps {
  tone: Tone;
  label?: string;
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({ tone, label, className }) => (
  <span className={cn('inline-flex items-center gap-2', className)}>
    <span className={cn('w-2 h-2 rounded-full shrink-0', PUNTOS[tone])} aria-hidden />
    {label && <span className="text-label text-slate-700">{label}</span>}
  </span>
);
