import React from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANTES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white border-transparent hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
  ghost: 'bg-transparent text-slate-600 border-transparent hover:bg-slate-100',
  danger: 'bg-danger-600 text-white border-transparent hover:bg-danger-700',
};

const TAMANOS: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-label gap-1.5',
  md: 'h-9 px-4 text-body font-medium gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}) => (
  <button
    className={cn(
      'inline-flex items-center justify-center rounded-md border transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
      'disabled:opacity-50 disabled:pointer-events-none',
      VARIANTES[variant],
      TAMANOS[size],
      className
    )}
    {...rest}
  />
);
