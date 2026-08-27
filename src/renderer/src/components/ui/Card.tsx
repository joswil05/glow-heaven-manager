import React from 'react';
import { cn } from '../../lib/cn';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...rest
}) => (
  <div
    className={cn('bg-white rounded-lg border border-slate-200', className)}
    {...rest}
  />
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...rest
}) => (
  <div
    className={cn(
      'px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3',
      className
    )}
    {...rest}
  />
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...rest
}) => <div className={cn('p-4', className)} {...rest} />;
