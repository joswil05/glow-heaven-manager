import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Truck,
  ArrowRight,
  Plus,
} from 'lucide-react';
import type { HoyViewData } from '../../../shared/ipc-contracts';
import type { AlertaRow } from '../../../shared/types';
import {
  Card,
  CardHeader,
  CardContent,
  StatTile,
  Badge,
  Button,
  SectionHeader,
} from '../components/ui';

interface HoyViewProps {
  data: HoyViewData | null;
  loading: boolean;
  pedidosBloqueados: number;
  pedidosListos: number;
  onNewCotizacion: () => void;
  onNavigateToPedidos: (pedidoId?: number) => void;
}

export const HoyView: React.FC<HoyViewProps> = ({
  data,
  loading,
  pedidosBloqueados,
  pedidosListos,
  onNewCotizacion,
  onNavigateToPedidos,
}) => {
  if (loading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center text-slate-400 text-body">
        Cargando resumen del día...
      </div>
    );
  }

  const alertas = data?.alertas_decision || [];
  const anticiposRecibidos = data?.total_anticipos_recibidos_cor_cents || 0;
  const saldosPorCobrar = data?.total_saldos_por_cobrar_cor_cents || 0;

  return (
    <div className="flex-1 p-6 overflow-y-auto space-y-6 animate-fade-in">
      {/* Título de la vista */}
      <div>
        <h2 className="text-display text-slate-900 tracking-tight">Hoy en Glow Heaven</h2>
        <p className="text-label text-slate-500 mt-0.5">
          Resumen operativo y tareas que requieren tu atención.
        </p>
      </div>

      {/* Fila de indicadores financieros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile
          label="Anticipos recibidos"
          cor_cents={anticiposRecibidos}
          tone="warning"
          hint="Esto no es ganancia: lo debés en producto."
        />
        <StatTile
          label="Por cobrar contraentrega"
          cor_cents={saldosPorCobrar}
          tone="info"
          hint="Saldos pendientes al entregar."
        />
        <StatTile
          label="Pedidos bloqueados"
          value={pedidosBloqueados}
          tone="danger"
          hint="Sin anticipo verificado en banco."
        />
        <StatTile
          label="Listos para comprar"
          value={pedidosListos}
          tone="success"
          hint="Anticipo confirmado."
        />
      </div>

      {/* Dos columnas debajo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Necesitan tu decisión */}
          <Card>
            <CardHeader>
              <SectionHeader
                icon={AlertTriangle}
                title="Necesitan tu decisión"
                description="Anticipos pendientes y excepciones de productos"
                action={
                  alertas.length > 0 ? (
                    <Badge tone="danger">
                      {alertas.length} pendiente{alertas.length > 1 ? 's' : ''}
                    </Badge>
                  ) : undefined
                }
              />
            </CardHeader>
            <CardContent>
              {alertas.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {alertas.map((alerta: AlertaRow, idx: number) => (
                    <div
                      key={idx}
                      className="py-3 flex items-center justify-between gap-4 hover:bg-slate-50 px-2 rounded-md transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-danger-500 shrink-0" />
                        <div>
                          <div className="text-body text-slate-800">{alerta.mensaje}</div>
                          <div className="text-caption text-slate-500">
                            Cliente: {alerta.cliente_nombre} • Tel: {alerta.cliente_telefono}
                          </div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onNavigateToPedidos(alerta.pedido_id)}
                      >
                        <span>Ver Pedido</span>
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 rounded-md border border-emerald-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <div className="text-body font-medium text-emerald-900">Todo al día</div>
                      <div className="text-caption text-emerald-700">
                        Nada requiere tu decisión urgente en este momento.
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="primary" onClick={onNewCotizacion}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    <span>Nueva Cotización</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Entregas de hoy */}
          <Card>
            <CardHeader>
              <SectionHeader
                icon={Truck}
                title="Entregas de hoy"
                description="Rutas locales en León/Chichigalpa y envíos CargoTrans"
              />
            </CardHeader>
            <CardContent>
              <div className="p-4 bg-slate-50 rounded-md border border-slate-200 text-body text-slate-500 text-center">
                Acá van a aparecer tus entregas cuando empieces a recibir pedidos en Nicaragua.
              </div>
            </CardContent>
          </Card>

          {/* Esperando a otros */}
          <Card>
            <CardContent className="flex items-center justify-between text-body text-slate-500">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-slate-700">Esperando a otros:</span>
                <span>Nada en camino todavía.</span>
              </div>
              <span className="text-caption text-slate-400">Lotes de importación (Fase 2)</span>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
