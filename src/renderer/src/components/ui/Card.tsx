import React from 'react';
import { cn } from '../../lib/cn';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...rest
}) => (
  <div
    className={cn(
      'bg-superficie rounded-2xl border border-borde/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out',
      className
    )}
    {...rest}
  />
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...rest
}) => (
  <div
    className={cn(
      'px-5 py-3.5 border-b border-borde/60 flex items-center justify-between gap-3',
      className
    )}
    {...rest}
  />
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...rest
}) => <div className={cn('p-5', className)} {...rest} />;

