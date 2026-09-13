import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [coords, setCoords] = useState<{ left: number; top: number; maxHeight: number }>({
    left: Math.min(x, typeof window !== 'undefined' ? Math.max(12, window.innerWidth - 230) : x),
    top: Math.min(y, typeof window !== 'undefined' ? Math.max(12, window.innerHeight - 250) : y),
    maxHeight: typeof window !== 'undefined' ? window.innerHeight - 24 : 400,
  });
  const [isPositioned, setIsPositioned] = useState(false);

  useLayoutEffect(() => {
    if (!menuRef.current) return;

    const rect = menuRef.current.getBoundingClientRect();
    const padding = 12;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    // Altura máxima disponible dentro de la pantalla
    const maxHeight = Math.max(120, winHeight - padding * 2);

    let left = x;
    let top = y;

    // Si se desborda horizontalmente hacia la derecha, intentar voltear a la izquierda del cursor
    if (left + rect.width > winWidth - padding) {
      if (x - rect.width >= padding) {
        left = x - rect.width;
      } else {
        left = Math.max(padding, winWidth - rect.width - padding);
      }
    }

    // Si se desborda verticalmente hacia abajo, intentar abrir hacia arriba del cursor
    if (top + rect.height > winHeight - padding) {
      if (y - rect.height >= padding) {
        top = y - rect.height;
      } else {
        top = Math.max(padding, winHeight - rect.height - padding);
      }
    }

    // Garantizar que quede siempre dentro de los márgenes visibles de la pantalla
    left = Math.max(padding, Math.min(left, winWidth - rect.width - padding));
    top = Math.max(padding, Math.min(top, winHeight - rect.height - padding));

    setCoords({ left, top, maxHeight });
    setIsPositioned(true);
  }, [x, y, items]);

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

    const handleWindowChange = () => {
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);

    // Retardo breve para evitar que el mismo click de apertura dispare el cierre involuntario
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('contextmenu', handleContextMenu);
    }, 60);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-orientation="vertical"
      style={{
        left: `${coords.left}px`,
        top: `${coords.top}px`,
        maxHeight: `${coords.maxHeight}px`,
        visibility: isPositioned ? 'visible' : 'hidden',
      }}
      className={cn(
        'fixed z-[9999] min-w-[210px] max-w-[320px] py-1.5 px-1',
        'overflow-y-auto overflow-x-hidden custom-scrollbar',
        'bg-superficie/95 backdrop-blur-md border border-borde/90 rounded-2xl shadow-2xl shadow-black/20',
        // Escala desde la esquina por donde se abrio, no desde el centro: un menu
        // que crece desde su punto de invocacion se siente anclado a el.
        'text-texto select-none outline-none animate-in fade-in-0 zoom-in-95 duration-100 origin-top-left'
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
                'text-acento hover:bg-acento-suave hover:text-acento dark:hover:bg-acento-suave',
              !isDanger && !isSuccess && 'text-texto hover:text-texto',
              item.disabled && 'opacity-40 cursor-not-allowed hover:bg-transparent'
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {item.icon && (
                <span
                  className={cn(
                    'w-4 h-4 shrink-0 flex items-center justify-center transition-transform duration-100 group-hover:scale-110',
                    isDanger ? 'text-danger' : isSuccess ? 'text-acento' : 'text-texto-3'
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
    </div>,
    document.body
  );
};
