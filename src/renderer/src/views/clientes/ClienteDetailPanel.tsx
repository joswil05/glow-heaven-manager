import React from 'react';
import { User, Phone, MapPin, MessageSquare, Edit2, AlertTriangle, ShoppingBag, X } from 'lucide-react';
import type { Cliente, ClienteDetalle, Pedido } from '../../../../shared/types';
import { Card, CardHeader, CardContent, Button, Badge, StatTile, Money } from '../../components/ui';

export interface ClienteDetailPanelProps {
  cliente: Cliente | null;
  detalle: ClienteDetalle | null;
  pedidos: Pedido[];
  loading: boolean;
  onEdit: (cliente: Cliente) => void;
  onOpenWhatsApp: (cliente: Cliente) => void;
  onClose?: () => void;
}

export const ClienteDetailPanel: React.FC<ClienteDetailPanelProps> = ({
  cliente,
  detalle,
  pedidos,
  loading,
  onEdit,
  onOpenWhatsApp,
  onClose,
}) => {
  if (!cliente) {
    return (
      <Card className="h-full flex items-center justify-center p-8 text-center bg-white">
        <div className="text-slate-400 space-y-2">
          <User className="w-10 h-10 mx-auto text-slate-300" />
          <p className="text-body font-medium">Seleccioná un cliente</p>
          <p className="text-caption text-slate-500">
            Hacé clic en cualquier fila para ver su ficha, historial de pedidos y saldo pendiente.
          </p>
        </div>
      </Card>
    );
  }

  const pedidosCliente = pedidos.filter((p) => p.cliente_id === cliente.id);
  const pedidosBloqueados = pedidosCliente.filter((p) => !p.anticipo_verificado).length;
  const saldoPendiente = detalle?.saldo_total_pendiente_cor_cents ?? 0;
  const totalCompras = detalle?.total_compras_cor_cents ?? 0;

  return (
    <Card className="h-full flex flex-col bg-white shadow-sm overflow-hidden animate-fade-in">
      <CardHeader className="bg-slate-50/80 border-b border-slate-200 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-title text-slate-900 font-bold tracking-tight truncate">
                {cliente.nombre}
              </h3>
              {cliente.alias && (
                <span className="text-caption text-slate-500 font-normal">
                  ({cliente.alias})
                </span>
              )}
            </div>

            {cliente.incumplio_anteriormente ? (
              <div className="pt-1">
                <Badge tone="danger" className="font-semibold">
                  Pedir 70% de anticipo
                </Badge>
              </div>
            ) : (
              <div className="pt-1">
                <Badge tone="neutral">Cliente regular</Badge>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Button size="sm" variant="ghost" onClick={() => onEdit(cliente)}>
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            {onClose && (
              <Button size="sm" variant="ghost" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Datos de contacto y acciones rápidas */}
        <div className="mt-3 space-y-1 text-caption text-slate-600">
          <div className="flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="tabular-nums font-mono">{cliente.telefono}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>
              {cliente.ciudad}
              {cliente.direccion ? ` · ${cliente.direccion}` : ''}
            </span>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-200/70 flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onOpenWhatsApp(cliente)}
            className="w-full text-emerald-700 hover:text-emerald-800"
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            <span>Abrir WhatsApp</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-5 overflow-y-auto flex-1">
        {/* Estadísticas de dinero y pedidos */}
        <div className="grid grid-cols-1 gap-3">
          <StatTile
            label="Saldo pendiente por cobrar"
            cor_cents={saldoPendiente}
            tone={saldoPendiente > 0 ? 'warning' : 'neutral'}
            hint={saldoPendiente > 0 ? 'Total adeudado en pedidos activos' : 'Al día, sin saldo pendiente'}
          />

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-caption text-slate-500">Pedidos activos</div>
              <div className="text-body font-bold text-slate-900 mt-0.5">
                {pedidosCliente.length}
              </div>
              {pedidosBloqueados > 0 ? (
                <div className="text-caption text-amber-700 flex items-center gap-1 mt-1 font-medium">
                  <AlertTriangle className="w-3 h-3 shrink-0" />
                  <span>{pedidosBloqueados} sin anticipo</span>
                </div>
              ) : (
                <div className="text-caption text-slate-500 mt-1">Todos en marcha</div>
              )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
              <div className="text-caption text-slate-500">Histórico de compras</div>
              <div className="text-body font-bold text-slate-900 mt-0.5 tabular-nums">
                C${(totalCompras / 100).toLocaleString('es-NI', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-caption text-slate-500 mt-1">En pedidos activos</div>
            </div>
          </div>
        </div>

        {/* Historial de pedidos del cliente */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-label font-bold text-slate-900 flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-slate-500" />
              <span>Historial de Pedidos ({pedidosCliente.length})</span>
            </h4>
          </div>

          {loading ? (
            <div className="py-4 text-center text-caption text-slate-400">
              Cargando historial...
            </div>
          ) : pedidosCliente.length === 0 ? (
            <div className="py-6 text-center text-caption text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
              Este cliente todavía no tiene pedidos registrados.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
              {pedidosCliente.map((p) => {
                const tone = p.anticipo_verificado ? 'success' : 'warning';
                return (
                  <div
                    key={p.id}
                    className="p-3 text-caption hover:bg-slate-50/80 transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-slate-900">
                        {p.codigo}
                      </span>
                      <Badge tone={tone}>
                        {p.anticipo_verificado ? 'Anticipo OK' : 'Sin anticipo'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-slate-500">
                      <span>{p.fecha}</span>
                      <span className="font-medium text-slate-700">{p.estado_derivado}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="text-slate-500">Total / Saldo:</span>
                      <div className="text-right">
                        <span className="font-semibold text-slate-900 tabular-nums">
                          <Money cor_cents={p.total_cor_cents} usd_cents={p.total_usd_cents} size="sm" />
                        </span>
                        {p.saldo_pendiente_cor_cents > 0 && (
                          <div className="text-amber-700 font-medium tabular-nums">
                            Resta C${(p.saldo_pendiente_cor_cents / 100).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Notas del cliente si existen */}
        {cliente.notas && (
          <div className="bg-amber-50/60 border border-amber-200/60 rounded-lg p-3 text-caption text-amber-900 space-y-1">
            <span className="font-semibold block">Notas del cliente:</span>
            <p className="whitespace-pre-wrap">{cliente.notas}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
