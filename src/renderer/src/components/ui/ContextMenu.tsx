import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  tone?: 'default' | 'danger' | 'success';
  disabled?: boolean;
  separator?: boolean;
  onClick?: () => void;
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: (ContextMenuItem | 'separator')[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ left: x, top: y });

  useEffect(() => {
    setCoords({ left: x, top: y });
    // Ajustar posición si se desborda de la ventana visible
    const timer = setTimeout(() => {
      if (menuRef.current) {
        const rect = menuRef.current.getBoundingClientRect();
        const padding = 12;
        let left = x;
        let top = y;

        if (left + rect.width > window.innerWidth - padding) {
          left = Math.max(padding, window.innerWidth - rect.width - padding);
        }
        if (top + rect.height > window.innerHeight - padding) {
          top = Math.max(padding, window.innerHeight - rect.height - padding);
        }

        setCoords({ left, top });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [x, y]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Retardo breve para evitar que el mismo click de apertura dispare el cierre involuntario
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('contextmenu', handleContextMenu);
    }, 60);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      style={{ left: `${coords.left}px`, top: `${coords.top}px` }}
      className={cn(
        'fixed z-50 min-w-[210px] py-1.5 px-1',
        'bg-superficie/95 backdrop-blur-md border border-borde/90 rounded-2xl shadow-xl shadow-black/10',
        'text-texto select-none outline-none animate-in fade-in-0 zoom-in-95 duration-100'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, index) => {
        if (item === 'separator' || item.separator) {
          return <div key={`sep-${index}`} className="my-1 border-t border-borde/60" />;
        }

        const isDanger = item.tone === 'danger';
        const isSuccess = item.tone === 'success';

        return (
          <button
            key={item.id}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onClick?.();
            }}
            className={cn(
              'group w-full flex items-center justify-between gap-3 px-3 py-1.5 text-body rounded-xl text-left font-medium select-none',
              'transition-[background-color,color,transform] duration-100 ease-out active:scale-[0.98]',
              'hover:bg-superficie-2 focus:bg-superficie-2 focus:outline-none cursor-pointer',
              isDanger &&
                'text-danger hover:bg-danger/10 hover:text-danger-600 focus:bg-danger/10 focus:text-danger-600',
              isSuccess &&
                'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/30',
              !isDanger && !isSuccess && 'text-texto hover:text-texto',
              item.disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent'
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {item.icon && (
                <span
                  className={cn(
                    'w-4 h-4 shrink-0 flex items-center justify-center transition-transform duration-100 group-hover:scale-110',
                    isDanger ? 'text-danger' : isSuccess ? 'text-emerald-600' : 'text-texto-3'
                  )}
                >
                  {item.icon}
                </span>
              )}
              <span className="truncate">{item.label}</span>
            </div>

            {item.shortcut && (
              <kbd className="ml-auto text-[10px] font-mono text-texto-3 px-1.5 py-0.5 rounded bg-superficie-2/80 border border-borde/60 shrink-0">
                {item.shortcut}
              </kbd>
            )}
          </button>
        );
      })}
    </div>
  );
};
