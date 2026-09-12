import React from 'react';
import { cn } from '../../lib/cn';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

const TONOS: Record<Tone, string> = {
  neutral: 'bg-superficie-2 text-texto-2 border border-borde/80',
  success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/70',
  warning: 'bg-amber-50 text-amber-700 border border-amber-200/70',
  danger: 'bg-rose-50 text-rose-700 border border-rose-200/70',
  info: 'bg-sky-50 text-sky-700 border border-sky-200/70',
  purple: 'bg-indigo-50 text-indigo-700 border border-indigo-200/70',
};

export interface BadgeProps {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', children, className }) => (
  <span
    className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-full text-caption font-semibold',
      TONOS[tone],
      className
    )}
  >
    {children}
  </span>
);
