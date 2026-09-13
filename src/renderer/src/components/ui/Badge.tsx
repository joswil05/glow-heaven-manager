import React from 'react';
import { cn } from '../../lib/cn';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

const TONOS: Record<Tone, string> = {
  neutral: 'bg-superficie-2 text-texto-2 border border-borde/80',
  success: 'bg-acento-suave text-acento border border-acento-suave',
  warning: 'bg-alerta-suave text-alerta border border-alerta-suave',
  danger: 'bg-peligro-suave text-peligro border border-peligro-suave',
  info: 'bg-superficie-3 text-texto-2 border border-borde',
  purple: 'bg-alerta-suave text-alerta-fuerte border border-alerta-suave',
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
