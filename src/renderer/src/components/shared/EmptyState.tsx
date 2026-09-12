import React from 'react';
import { LucideIcon } from 'lucide-react';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Botón o botones. Se pasa como nodo para no limitar a una sola acción. */
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
}) => (
  <div className="flex flex-col items-center justify-center p-10 text-center bg-superficie rounded-lg border border-dashed border-borde-fuerte animate-fade-in">
    <div className="w-12 h-12 rounded-full bg-superficie-2 flex items-center justify-center text-texto-3 mb-3">
      <Icon className="w-6 h-6" />
    </div>
    <h3 className="text-title text-texto mb-1">{title}</h3>
    <p className="text-body text-texto-3 max-w-md mb-4">{description}</p>
    {action}
  </div>
);
