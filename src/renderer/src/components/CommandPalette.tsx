import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, User, FileText, ShoppingBag, Plus, HardDriveDownload, X } from 'lucide-react';
import type { Cliente, Cotizacion, Pedido } from '../../../shared/types';
import { formatearMoneda } from '@core/moneda';
import { Badge } from './ui';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectCliente?: (cliente: Cliente) => void;
  onSelectCotizacion?: (cotizacion: Cotizacion) => void;
  onSelectPedido?: (pedido: Pedido) => void;
  onAction: (action: string) => void;
}

interface PaletteItem {
  id: string;
  category: string;
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ReactNode;
  shortcut?: string;
  onSelect: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onSelectCliente,
  onSelectCotizacion,
  onSelectPedido,
  onAction,
}) => {
  const [query, setQuery] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(async () => {
      if (query.trim().length > 0) {
        const [cliRes, cotRes, pedRes] = await Promise.all([
          window.api.clientes.list(query),
          window.api.cotizaciones.list(),
          window.api.pedidos.list(),
        ]);

        if (cliRes.success) setClientes(cliRes.data);
        if (cotRes.success) {
          const q = query.toLowerCase();
          setCotizaciones(
            cotRes.data.filter(
              (c) => c.codigo.toLowerCase().includes(q) || (c.notas && c.notas.toLowerCase().includes(q))
            )
          );
        }
        if (pedRes.success) {
          const q = query.toLowerCase();
          setPedidos(
            pedRes.data.filter(
              (p) => p.codigo.toLowerCase().includes(q) || (p.notas && p.notas.toLowerCase().includes(q))
            )
          );
        }
      } else {
        setClientes([]);
        setCotizaciones([]);
        setPedidos([]);
      }
      setSelectedIndex(0);
    }, 150);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Lista aplanada de todos los ítems navegables
  const items: PaletteItem[] = useMemo(() => {
    if (query.trim().length === 0) {
      return [
        {
          id: 'action-new-cotizacion',
          category: 'Acciones Frecuentes',
          title: 'Nueva Cotización',
          subtitle: 'Abrir el cotizador interactivo',
          shortcut: 'Ctrl+N',
          icon: (
            <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
              <Plus className="w-4 h-4" />
            </div>
          ),
          onSelect: () => {
            onAction('new-cotizacion');
            onClose();
          },
        },
        {
          id: 'action-new-cliente',
          category: 'Acciones Frecuentes',
          title: 'Registrar Nuevo Cliente',
          subtitle: 'Crear ficha de cliente en el directorio',
          icon: (
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
          ),
          onSelect: () => {
            onAction('new-cliente');
            onClose();
          },
        },
        {
          id: 'action-backup',
          category: 'Acciones Frecuentes',
          title: 'Crear Copia de Seguridad',
          subtitle: 'Guardar respaldo local inmediato',
          shortcut: 'Ctrl+B',
          icon: (
            <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
              <HardDriveDownload className="w-4 h-4" />
            </div>
          ),
          onSelect: () => {
            onAction('backup');
            onClose();
          },
        },
      ];
    }

    const res: PaletteItem[] = [];

    for (const c of clientes) {
      res.push({
        id: `cli-${c.id}`,
        category: 'Clientes',
        title: c.nombre,
        subtitle: `📞 ${c.telefono} • 📍 ${c.ciudad}`,
        icon: <User className="w-4 h-4 text-slate-400" />,
        onSelect: () => {
          if (onSelectCliente) onSelectCliente(c);
          onClose();
        },
      });
    }

    for (const p of pedidos) {
      res.push({
        id: `ped-${p.id}`,
        category: 'Pedidos',
        title: p.codigo,
        subtitle: `${formatearMoneda(p.total_cor_cents, 'COR')} (${formatearMoneda(p.total_usd_cents, 'USD')})`,
        badge: p.estado_derivado,
        icon: <ShoppingBag className="w-4 h-4 text-slate-400" />,
        onSelect: () => {
          if (onSelectPedido) onSelectPedido(p);
          onClose();
        },
      });
    }

    for (const cot of cotizaciones) {
      res.push({
        id: `cot-${cot.id}`,
        category: 'Cotizaciones',
        title: cot.codigo,
        subtitle: `${formatearMoneda(cot.total_cor_cents, 'COR')} (${formatearMoneda(cot.total_usd_cents, 'USD')})`,
        badge: cot.estado,
        icon: <FileText className="w-4 h-4 text-slate-400" />,
        onSelect: () => {
          if (onSelectCotizacion) onSelectCotizacion(cot);
          onClose();
        },
      });
    }

    return res;
  }, [query, clientes, pedidos, cotizaciones, onAction, onClose, onSelectCliente, onSelectPedido, onSelectCotizacion]);

  // Manejo de teclado (Flechas, Enter, Escape)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (items.length > 0 ? (prev + 1) % items.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (items.length > 0 ? (prev - 1 + items.length) % items.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (items.length > 0 && items[selectedIndex]) {
          items[selectedIndex].onSelect();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, items, selectedIndex]);

  // Scroll into view on selection change
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4 animate-fade-in"
    >
      <div className="bg-white w-full max-w-2xl rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
        {/* Input de Búsqueda */}
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400 shrink-0" aria-hidden />
          <h2 id="command-palette-title" className="sr-only">
            Buscar en Glow Heaven Manager
          </h2>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente, cotización, pedido o acción rápida..."
            className="w-full text-body text-slate-800 placeholder-slate-400 focus:outline-none focus-visible:ring-0"
            aria-label="Buscar en el sistema"
          />
          <button
            onClick={onClose}
            aria-label="Cerrar búsqueda"
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resultados y Acciones */}
        <div
          ref={listRef}
          role="listbox"
          aria-label="Resultados de búsqueda"
          className="p-3 overflow-y-auto space-y-2 flex-1"
        >
          {items.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-body">
              No se encontraron resultados para &ldquo;{query}&rdquo;.
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const isFirstOfCategory = idx === 0 || items[idx - 1].category !== item.category;

              return (
                <React.Fragment key={item.id}>
                  {isFirstOfCategory && (
                    <div className="px-3 pt-2 pb-1 text-caption font-semibold uppercase tracking-wider text-slate-400">
                      {item.category}
                    </div>
                  )}
                  <div
                    role="option"
                    aria-selected={isSelected}
                    data-index={idx}
                    onClick={item.onSelect}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-md text-left transition-colors cursor-pointer ${
                      isSelected ? 'bg-brand-50 text-brand-900 ring-1 ring-brand-200' : 'hover:bg-slate-100 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {item.icon}
                      <div className="min-w-0">
                        <div className="text-body font-medium truncate">{item.title}</div>
                        {item.subtitle && (
                          <div className="text-caption text-slate-500 truncate">{item.subtitle}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {item.badge && <Badge tone="neutral">{item.badge}</Badge>}
                      {item.shortcut && (
                        <kbd className="px-2 py-1 bg-slate-200 text-slate-600 rounded-md text-caption font-mono">
                          {item.shortcut}
                        </kbd>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
