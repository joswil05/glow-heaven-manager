import React, { useState, useEffect, useCallback } from 'react';
import type { Pedido, PedidoCompleto, EstadoItem } from '../../../shared/types';
import { PagoModal } from '../components/PagoModal';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { PedidosTable } from './pedidos/PedidosTable';
import { PedidoDetailPanel } from './pedidos/PedidoDetailPanel';

const FILTROS = [
  { id: 'TODOS' as const, label: 'Todos' },
  { id: 'LISTOS' as const, label: 'Listos para comprar' },
  { id: 'BLOQUEADOS' as const, label: 'Bloqueados' },
  { id: 'ATENCION' as const, label: 'Requieren atención' },
];

interface PedidosViewProps {
  pedidos: Pedido[];
  loading: boolean;
  onRefresh: () => void;
  initialPedidoId?: number;
}

export const PedidosView: React.FC<PedidosViewProps> = ({
  pedidos,
  loading: _loading,
  onRefresh,
  initialPedidoId,
}) => {
  const { showToast, showUndoToast } = useToast();

  const [filter, setFilter] = useState<'TODOS' | 'ATENCION' | 'BLOQUEADOS' | 'LISTOS'>('TODOS');
  const [selectedPedidoId, setSelectedPedidoId] = useState<number | undefined>(initialPedidoId);
  const [pedidoDetalle, setPedidoDetalle] = useState<PedidoCompleto | null>(null);
  const [pagoModalPedido, setPagoModalPedido] = useState<Pedido | null>(null);
  const [pastedBuffer, setPastedBuffer] = useState<Uint8Array | undefined>(undefined);

  useEffect(() => {
    if (initialPedidoId) {
      setSelectedPedidoId(initialPedidoId);
    }
  }, [initialPedidoId]);

  const recargarDetalle = useCallback(() => {
    if (!selectedPedidoId) return;
    window.api.pedidos.getById(selectedPedidoId).then((r) => {
      if (r.success) setPedidoDetalle(r.data);
    });
  }, [selectedPedidoId]);

  useEffect(() => {
    if (selectedPedidoId) {
      recargarDetalle();
    } else {
      setPedidoDetalle(null);
    }
  }, [selectedPedidoId, recargarDetalle]);

  // Listener para pegar comprobante Ctrl+V directamente en la vista
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const arrayBuffer = await file.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);
            setPastedBuffer(uint8);

            if (selectedPedidoId && pedidoDetalle) {
              setPastedBuffer(uint8);
              setPagoModalPedido(pedidoDetalle);
              showToast({
                message: 'Comprobante detectado. Abriendo registro de pago...',
                type: 'info',
              });
            } else {
              showToast({
                message: 'Abrí primero el pedido al que corresponde el comprobante.',
                type: 'info',
              });
            }
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [selectedPedidoId, pedidoDetalle, showToast]);

  const filteredPedidos = pedidos.filter((p) => {
    if (filter === 'ATENCION') return Boolean(p.requiere_atencion);
    if (filter === 'BLOQUEADOS') return !p.anticipo_verificado;
    if (filter === 'LISTOS') return Boolean(p.anticipo_verificado);
    return true;
  });

  const contarPara = (f: 'TODOS' | 'LISTOS' | 'BLOQUEADOS' | 'ATENCION') => {
    if (f === 'ATENCION') return pedidos.filter((p) => Boolean(p.requiere_atencion)).length;
    if (f === 'BLOQUEADOS') return pedidos.filter((p) => !p.anticipo_verificado).length;
    if (f === 'LISTOS') return pedidos.filter((p) => Boolean(p.anticipo_verificado)).length;
    return pedidos.length;
  };

  const handleCambiarEstadoItem = async (
    itemId: number,
    nuevoEstado: EstadoItem,
    motivo?: string
  ) => {
    try {
      const res = await window.api.pedidos.cambiarEstadoItem(itemId, nuevoEstado, motivo);
      if (res.success) {
        showUndoToast(
          `Estado del producto cambiado a ${nuevoEstado}`,
          () => {
            onRefresh();
            recargarDetalle();
          },
          res.data.evento_grupo_id
        );
        onRefresh();
        recargarDetalle();
      } else {
        showToast({ message: res.error.message, type: 'error' });
      }
    } catch {
      showToast({ message: 'Error al cambiar estado del ítem', type: 'error' });
    }
  };

  const handleVerificarPago = async (pagoId: number) => {
    const res = await window.api.pagos.verificar(pagoId, true);
    if (!res.success) {
      showToast({ message: res.error.message, type: 'error' });
      return;
    }
    showUndoToast('Pago marcado como verificado', () => onRefresh(), res.data.evento_grupo_id);
    onRefresh();
    recargarDetalle();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-1">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-label transition-colors',
              filter === f.id
                ? 'bg-navy-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            {f.label} ({contarPara(f.id)})
          </button>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-4 p-6 overflow-y-auto">
        <div className="xl:col-span-2">
          <PedidosTable
            pedidos={filteredPedidos}
            selectedId={selectedPedidoId}
            onSelect={(p) => setSelectedPedidoId(p.id)}
            onCobrar={(p) => setPagoModalPedido(p)}
          />
        </div>
        <div>
          <PedidoDetailPanel
            detalle={pedidoDetalle}
            onCambiarEstado={handleCambiarEstadoItem}
            onVerificarPago={handleVerificarPago}
          />
        </div>
      </div>

      {pagoModalPedido && (
        <PagoModal
          isOpen={Boolean(pagoModalPedido)}
          onClose={() => {
            setPagoModalPedido(null);
            setPastedBuffer(undefined);
          }}
          pedido={pagoModalPedido}
          initialBuffer={pastedBuffer}
          onPaymentSuccess={() => {
            onRefresh();
            recargarDetalle();
          }}
        />
      )}
    </div>
  );
};
