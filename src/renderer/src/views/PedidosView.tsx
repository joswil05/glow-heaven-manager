import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Pedido, PedidoCompleto, EstadoItem, PedidoItem, Pago } from '../../../shared/types';
import { EmptyState } from '../components/shared/EmptyState';
import { PagoModal } from '../components/PagoModal';
import { useToast } from '../context/ToastContext';
import { formatearMoneda } from '@core/moneda';
import { transicionesPermitidas, ETIQUETAS_ESTADO_ITEM } from '@core/estados';

interface PedidosViewProps {
  pedidos: Pedido[];
  loading: boolean;
  onRefresh: () => void;
  selectedPedidoId?: number;
}

export const PedidosView: React.FC<PedidosViewProps> = ({
  pedidos,
  loading,
  onRefresh,
  selectedPedidoId,
}) => {
  const { showToast, showUndoToast } = useToast();

  const [filter, setFilter] = useState<'TODOS' | 'ATENCION' | 'BLOQUEADOS' | 'LISTOS'>('TODOS');
  const [expandedPedidoId, setExpandedPedidoId] = useState<number | null>(selectedPedidoId ?? null);
  const [pedidoDetalle, setPedidoDetalle] = useState<PedidoCompleto | null>(null);
  const [pagoModalPedido, setPagoModalPedido] = useState<Pedido | null>(null);
  const [pastedBuffer, setPastedBuffer] = useState<Uint8Array | undefined>(undefined);

  useEffect(() => {
    if (selectedPedidoId) {
      setExpandedPedidoId(selectedPedidoId);
    }
  }, [selectedPedidoId]);

  useEffect(() => {
    if (expandedPedidoId) {
      window.api.pedidos.getById(expandedPedidoId).then((res) => {
        if (res.success) setPedidoDetalle(res.data);
      });
    } else {
      setPedidoDetalle(null);
    }
  }, [expandedPedidoId]);

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

            // Si hay un pedido expandido, abrir directamente el modal de pago para ese pedido
            if (expandedPedidoId && pedidoDetalle) {
              setPagoModalPedido(pedidoDetalle);
            } else if (pedidos.length > 0) {
              setPagoModalPedido(pedidos[0]);
            }
            showToast({
              message: 'Comprobante detectado. Abriendo registro de pago...',
              type: 'info',
            });
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [expandedPedidoId, pedidoDetalle, pedidos, showToast]);

  const filteredPedidos = pedidos.filter((p) => {
    if (filter === 'ATENCION') return Boolean(p.requiere_atencion);
    if (filter === 'BLOQUEADOS') return !p.anticipo_verificado;
    if (filter === 'LISTOS') return Boolean(p.anticipo_verificado);
    return true;
  });

  const handleCambiarEstadoItem = async (
    itemId: number,
    nuevoEstado: EstadoItem,
    motivo?: string
  ) => {
    try {
      const res = await window.api.pedidos.cambiarEstadoItem(itemId, nuevoEstado, motivo);
      if (res.success) {
        showUndoToast(`Estado del producto cambiado a ${nuevoEstado}`, () => {
          onRefresh();
          if (expandedPedidoId) {
            window.api.pedidos.getById(expandedPedidoId).then((r) => {
              if (r.success) setPedidoDetalle(r.data);
            });
          }
        });
        onRefresh();
        if (expandedPedidoId) {
          window.api.pedidos.getById(expandedPedidoId).then((r) => {
            if (r.success) setPedidoDetalle(r.data);
          });
        }
      } else {
        showToast({ message: res.error.message, type: 'error' });
      }
    } catch {
      showToast({ message: 'Error al cambiar estado del ítem', type: 'error' });
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Barra de Filtros */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('TODOS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              filter === 'TODOS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Todos ({pedidos.length})
          </button>
          <button
            onClick={() => setFilter('LISTOS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              filter === 'LISTOS'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            🟢 Listos para Comprar
          </button>
          <button
            onClick={() => setFilter('BLOQUEADOS')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              filter === 'BLOQUEADOS'
                ? 'bg-danger-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            🔴 Bloqueados (Sin Anticipo)
          </button>
          <button
            onClick={() => setFilter('ATENCION')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              filter === 'ATENCION'
                ? 'bg-amber-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            ⚠️ Requieren Atención
          </button>
        </div>
      </div>

      {/* Lista de Pedidos */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando pedidos...</div>
        ) : filteredPedidos.length > 0 ? (
          filteredPedidos.map((pedido) => {
            const isExpanded = expandedPedidoId === pedido.id;
            const tieneAnticipoVerificado = Boolean(pedido.anticipo_verificado);

            return (
              <div
                key={pedido.id}
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-slate-300"
              >
                {/* Cabecera de la Tarjeta del Pedido */}
                <div className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    {/* Semáforo visual */}
                    <div
                      title={
                        tieneAnticipoVerificado
                          ? 'Semáforo Verde: Anticipo verificado, listo para comprar en USA'
                          : 'Semáforo Rojo: Bloqueado, requiere anticipo verificado'
                      }
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-white shadow-sm shrink-0 ${
                        tieneAnticipoVerificado
                          ? 'bg-emerald-500 text-white'
                          : 'bg-danger-500 text-white'
                      }`}
                    >
                      {tieneAnticipoVerificado ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-slate-900">
                          {pedido.codigo}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                            tieneAnticipoVerificado
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-danger-100 text-danger-800'
                          }`}
                        >
                          {tieneAnticipoVerificado
                            ? 'Listo para Comprar USA'
                            : 'Bloqueado (Sin Anticipo)'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Fecha: {pedido.fecha} • Estado general: {pedido.estado_derivado}
                      </div>
                    </div>
                  </div>

                  {/* Totales y Botón de Pago */}
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-sm font-black text-slate-900">
                        {formatearMoneda(pedido.total_cor_cents, 'COR')}
                      </div>
                      <div className="text-xs text-slate-500">
                        Saldo pendiente: {formatearMoneda(pedido.saldo_pendiente_cor_cents, 'COR')}
                      </div>
                    </div>

                    {/* Botón de Cobro In-Situ (U2) */}
                    <button
                      type="button"
                      onClick={() => setPagoModalPedido(pedido)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Cobrar / Registrar Pago</span>
                    </button>

                    <button
                      onClick={() => setExpandedPedidoId(isExpanded ? null : pedido.id)}
                      className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Detalle Expandido con Productos y Máquina de Estados */}
                {isExpanded && (
                  <div className="bg-slate-50 border-t border-slate-200 p-5 space-y-4 animate-fade-in">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Productos del Pedido
                    </h4>

                    {pedidoDetalle && pedidoDetalle.id === pedido.id ? (
                      <div className="space-y-2.5">
                        {pedidoDetalle.items.map((item: PedidoItem) => (
                          <div
                            key={item.id}
                            className="p-3.5 bg-white rounded-2xl border border-slate-200 flex items-center justify-between gap-4"
                          >
                            <div className="space-y-0.5">
                              <div className="text-xs font-bold text-slate-900">
                                {item.descripcion}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                Precio USA: ${(item.precio_usa_usd_cents / 100).toFixed(2)} •
                                Peso: {(item.peso_mlb / 1000).toFixed(2)} lb • Costo est:{' '}
                                ${(item.costo_aterrizado_estimado_cents / 100).toFixed(2)}
                              </div>
                            </div>

                            {/* Selector de Estado del Ítem */}
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500 font-semibold">Estado:</span>
                              <select
                                value=""
                                onChange={(e) => {
                                  if (!e.target.value) return;
                                  handleCambiarEstadoItem(
                                    item.id,
                                    e.target.value as EstadoItem
                                  );
                                }}
                                className="text-xs font-bold bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-800 focus:outline-none focus:border-glow-500"
                              >
                                <option value="">
                                  {ETIQUETAS_ESTADO_ITEM[item.estado]}
                                </option>
                                {transicionesPermitidas(item.estado).map((destino) => (
                                  <option key={destino} value={destino}>
                                    Pasar a: {ETIQUETAS_ESTADO_ITEM[destino]}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}

                        {/* Pagos registrados en el pedido */}
                        {pedidoDetalle.pagos && pedidoDetalle.pagos.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-slate-200">
                            <h5 className="text-xs font-bold text-slate-700 mb-2">
                              Historial de Pagos Recibidos ({pedidoDetalle.pagos.length})
                            </h5>
                            <div className="space-y-1.5">
                              {pedidoDetalle.pagos.map((p: Pago) => (
                                <div
                                  key={p.id}
                                  className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-center justify-between text-xs"
                                >
                                  <div>
                                    <span className="font-bold text-slate-800">
                                      {p.moneda_pago === 'COR' ? 'C$' : '$'}
                                      {(
                                        (p.moneda_pago === 'COR'
                                          ? p.monto_cor_cents
                                          : p.monto_usd_cents) / 100
                                      ).toFixed(2)}
                                    </span>
                                    <span className="text-slate-500 ml-2">
                                      ({p.tipo_pago} - {p.metodo_pago})
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        p.verificado
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-amber-100 text-amber-800'
                                      }`}
                                    >
                                      {p.verificado ? 'Verificado en Banco' : 'Pendiente de Verificar'}
                                    </span>
                                    {!p.verificado && (
                                      <button
                                        onClick={async () => {
                                          await window.api.pagos.verificar(p.id, true);
                                          showUndoToast('Pago marcado como verificado', () =>
                                            onRefresh()
                                          );
                                          onRefresh();
                                        }}
                                        className="text-xs text-glow-600 hover:text-glow-700 font-bold"
                                      >
                                        Verificar ahora
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400">Cargando ítems del pedido...</div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <EmptyState
            icon={ShoppingBag}
            title="No hay pedidos en esta vista"
            description="Los pedidos se generan automáticamente cuando aceptas y conviertes una cotización."
          />
        )}
      </div>

      {/* Modal de Pago In-Situ */}
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
            if (expandedPedidoId) {
              window.api.pedidos.getById(expandedPedidoId).then((r) => {
                if (r.success) setPedidoDetalle(r.data);
              });
            }
          }}
        />
      )}
    </div>
  );
};
