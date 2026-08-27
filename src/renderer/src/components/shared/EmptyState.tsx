import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  shortcut?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionText,
  onAction,
  shortcut,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-dashed border-slate-300 my-4 shadow-sm animate-fade-in">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-base font-bold text-slate-800 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-4">{description}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-2 px-4 py-2 bg-glow-600 hover:bg-glow-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
        >
          <span>{actionText}</span>
          {shortcut && (
            <kbd className="px-1.5 py-0.5 text-xs bg-glow-800/60 text-white rounded font-mono">
              {shortcut}
            </kbd>
          )}
        </button>
      )}
    </div>
  );
};
