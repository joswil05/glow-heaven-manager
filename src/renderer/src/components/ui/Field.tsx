import React, { useId } from 'react';
import { cn } from '../../lib/cn';

const CONTROL =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-body text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus:border-brand-500 ' +
  'disabled:bg-slate-50 disabled:text-slate-500';

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
      <label htmlFor={id} className="block text-label text-slate-700 mb-1">
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
        <span id={hintId} className="mt-1 block text-caption text-slate-500">
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

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...rest
}) => <input className={cn(CONTROL, className)} {...rest} />;

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  ...rest
}) => <select className={cn(CONTROL, className)} {...rest} />;

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...rest
}) => <textarea className={cn(CONTROL, className)} {...rest} />;
