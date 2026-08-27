import React from 'react';
import { cn } from '../../lib/cn';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONOS: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-brand-50 text-brand-700',
};

export interface BadgeProps {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', children, className }) => (
  <span
    className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-caption font-medium',
      TONOS[tone],
      className
    )}
  >
    {children}
  </span>
);
