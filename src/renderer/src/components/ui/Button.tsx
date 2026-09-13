import React from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md';

const VARIANTES: Record<ButtonVariant, string> = {
  primary: 'bg-acento text-acento-texto border-transparent hover:bg-acento-fuerte shadow-xs',
  secondary: 'bg-superficie text-texto-2 border-borde-fuerte hover:bg-superficie-2 shadow-2xs',
  ghost: 'bg-transparent text-texto-2 border-transparent hover:bg-superficie-2',
  danger: 'bg-peligro text-peligro-texto border-transparent hover:bg-danger-700 shadow-xs',
  outline: 'bg-transparent text-texto border-borde hover:bg-superficie-2',
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
        'inline-flex items-center justify-center rounded-md border select-none cursor-pointer',
        'transition-[transform,background-color,border-color,box-shadow,color,opacity] duration-150 ease-out',
        'hover:-translate-y-[0.5px] active:translate-y-0 active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-1',
        'disabled:opacity-50 disabled:pointer-events-none disabled:transform-none',
        VARIANTES[variant],
        TAMANOS[size],
        className
      )}
      {...rest}
    />
  );
});
