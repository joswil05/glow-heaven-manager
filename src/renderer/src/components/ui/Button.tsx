import React from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANTES: Record<ButtonVariant, string> = {
  primary: 'bg-acento text-acento-texto border-transparent hover:bg-acento-fuerte',
  secondary: 'bg-superficie text-texto-2 border-borde-fuerte hover:bg-superficie-2',
  ghost: 'bg-transparent text-texto-2 border-transparent hover:bg-superficie-2',
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

// `forwardRef` para que un diálogo pueda poner el foco en un botón concreto:
// en una confirmación destructiva el foco arranca en la salida, no en la
// acción que destruye.
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, ...rest },
  ref
) {
  return (
  <button
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center rounded-md border transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-1',
      'disabled:opacity-50 disabled:pointer-events-none',
      VARIANTES[variant],
      TAMANOS[size],
      className
    )}
    {...rest}
  />
  );
});
