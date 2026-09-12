import React, { useId } from 'react';
import { cn } from '../../lib/cn';

const CONTROL =
  'w-full rounded-md border border-borde-fuerte bg-superficie px-3 py-2 text-body text-texto ' +
  'placeholder:text-texto-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-acento focus:border-acento ' +
  'disabled:bg-superficie-2 disabled:text-texto-3';

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}

export const Field: React.FC<FieldProps> = ({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}) => {
  const autoId = useId();
  const id = htmlFor || autoId;
  const hintId = hint || error ? `${id}-hint` : undefined;

  return (
    <div className={cn('block', className)}>
      <label htmlFor={id} className="block text-label text-texto-2 mb-1">
        {label}
      </label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<any>, {
            id: (children.props as any).id || id,
            'aria-describedby': (children.props as any)['aria-describedby'] || hintId,
            'aria-invalid': error ? true : (children.props as any)['aria-invalid'],
          })
        : children}
      {hint && !error && (
        <span id={hintId} className="mt-1 block text-caption text-texto-3">
          {hint}
        </span>
      )}
      {error && (
        <span id={hintId} className="mt-1 block text-caption text-danger-700" role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

// `forwardRef` para poder enfocar o seleccionar el contenido desde afuera:
// un cuadro de conteo tiene que abrir con el numero anterior ya seleccionado.
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(CONTROL, className)} {...rest} />;
  }
);

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  ...rest
}) => <select className={cn(CONTROL, className)} {...rest} />;

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...rest
}) => <textarea className={cn(CONTROL, className)} {...rest} />;
