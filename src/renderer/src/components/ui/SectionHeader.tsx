import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SectionHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon: Icon,
  title,
  description,
  action,
}) => (
  <div className="flex items-start justify-between gap-3">
    <div className="flex items-start gap-2">
      {/* El ícono acompaña al título; no necesita su propia cajita de color. */}
      {Icon && <Icon className="w-4 h-4 text-texto-3 shrink-0 mt-1" aria-hidden="true" />}
      <div>
        <h3 className="text-title font-semibold text-texto tracking-tight">{title}</h3>
        {description && <p className="text-label text-texto-3 mt-0.5">{description}</p>}
      </div>
    </div>
    {action}
  </div>
);
