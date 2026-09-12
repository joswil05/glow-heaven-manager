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
    <div className="flex items-start gap-2.5">
      {Icon && (
        <div className="w-7 h-7 rounded-lg bg-acento/10 text-acento flex items-center justify-center shrink-0 border border-acento/15">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <div>
        <h3 className="text-title font-bold text-texto tracking-tight">{title}</h3>
        {description && <p className="text-label text-texto-3 mt-0.5">{description}</p>}
      </div>
    </div>
    {action}
  </div>
);
