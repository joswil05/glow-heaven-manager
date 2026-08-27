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
      {Icon && <Icon className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
      <div>
        <h3 className="text-title text-slate-900">{title}</h3>
        {description && <p className="text-label text-slate-500 mt-0.5">{description}</p>}
      </div>
    </div>
    {action}
  </div>
);
