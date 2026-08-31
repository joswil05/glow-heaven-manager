import React, { useState, useEffect, useRef } from 'react';
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
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
    }, 150);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  // Cerrar con Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center pt-20 p-4 animate-fade-in">
      <div className="bg-white w-full max-w-2xl rounded-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[80vh]">
        {/* Input de Búsqueda */}
        <div className="p-4 border-b border-slate-200 flex items-center gap-3">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por cliente, cotización, pedido o acción rápida..."
            className="w-full text-body text-slate-800 placeholder-slate-400 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Resultados y Acciones */}
        <div className="p-3 overflow-y-auto space-y-4">
          {/* Acciones Rápidas */}
          {query.trim().length === 0 && (
            <div>
              <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-slate-400">
                Acciones Frecuentes
              </div>
              <div className="space-y-1">
                <button
                  onClick={() => {
                    onAction('new-cotizacion');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-md hover:bg-slate-100 text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
                      <Plus className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-body text-slate-800">Nueva Cotización</div>
                      <div className="text-caption text-slate-500">Abrir el cotizador interactivo</div>
                    </div>
                  </div>
                  <kbd className="px-2 py-1 bg-slate-200 text-slate-600 rounded-md text-caption font-mono">
                    Ctrl+N
                  </kbd>
                </button>

                <button
                  onClick={() => {
                    onAction('new-cliente');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-md hover:bg-slate-100 text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-body text-slate-800">Registrar Nuevo Cliente</div>
                      <div className="text-caption text-slate-500">Crear ficha de cliente en el directorio</div>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    onAction('backup');
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-md hover:bg-slate-100 text-left transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                      <HardDriveDownload className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-body text-slate-800">Crear Copia de Seguridad</div>
                      <div className="text-caption text-slate-500">Guardar respaldo local inmediato</div>
                    </div>
                  </div>
                  <kbd className="px-2 py-1 bg-slate-200 text-slate-600 rounded-md text-caption font-mono">
                    Ctrl+B
                  </kbd>
                </button>
              </div>
            </div>
          )}

          {/* Clientes Encontrados */}
          {clientes.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-slate-400">
                Clientes ({clientes.length})
              </div>
              <div className="space-y-1">
                {clientes.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      if (onSelectCliente) onSelectCliente(c);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-md hover:bg-slate-100 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <User className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-body text-slate-800">{c.nombre}</div>
                        <div className="text-caption text-slate-500">
                          📞 {c.telefono} • 📍 {c.ciudad}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pedidos Encontrados */}
          {pedidos.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-slate-400">
                Pedidos ({pedidos.length})
              </div>
              <div className="space-y-1">
                {pedidos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (onSelectPedido) onSelectPedido(p);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-md hover:bg-slate-100 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <ShoppingBag className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-body text-slate-800">{p.codigo}</div>
                        <div className="text-caption text-slate-500">
                          {formatearMoneda(p.total_cor_cents, 'COR')} ({formatearMoneda(p.total_usd_cents, 'USD')})
                        </div>
                      </div>
                    </div>
                    <Badge tone="neutral">{p.estado_derivado}</Badge>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cotizaciones Encontradas */}
          {cotizaciones.length > 0 && (
            <div>
              <div className="px-3 py-1.5 text-caption font-semibold uppercase tracking-wider text-slate-400">
                Cotizaciones ({cotizaciones.length})
              </div>
              <div className="space-y-1">
                {cotizaciones.map((cot) => (
                  <button
                    key={cot.id}
                    onClick={() => {
                      if (onSelectCotizacion) onSelectCotizacion(cot);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-md hover:bg-slate-100 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <div>
                        <div className="text-body text-slate-800">{cot.codigo}</div>
                        <div className="text-caption text-slate-500">
                          {formatearMoneda(cot.total_cor_cents, 'COR')} ({formatearMoneda(cot.total_usd_cents, 'USD')})
                        </div>
                      </div>
                    </div>
                    <Badge tone="neutral">{cot.estado}</Badge>
                  </button>
                ))}
              </div>
            </div>
          )}

          {query.trim().length > 0 &&
            clientes.length === 0 &&
            pedidos.length === 0 &&
            cotizaciones.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-body">
                No se encontraron resultados para &ldquo;{query}&rdquo;.
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
