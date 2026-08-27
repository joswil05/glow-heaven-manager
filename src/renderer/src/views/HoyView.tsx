import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Package,
  Truck,
  ArrowRight,
  Plus,
  Lock,
} from 'lucide-react';
import type { HoyViewData } from '../../../shared/ipc-contracts';
import type { AlertaRow } from '../../../shared/types';
import { formatearMoneda } from '@core/moneda';

interface HoyViewProps {
  data: HoyViewData | null;
  loading: boolean;
  onNewCotizacion: () => void;
  onNavigateToPedidos: (pedidoId?: number) => void;
}

export const HoyView: React.FC<HoyViewProps> = ({
  data,
  loading,
  onNewCotizacion,
  onNavigateToPedidos,
}) => {
  if (loading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center text-slate-400 text-sm">
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
        <h2 className="text-2xl font-black text-slate-900 tracking-tight">Hoy en Glow Heaven</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Resumen operativo y tareas que requieren tu atención.
        </p>
      </div>

      {/* SECCIÓN 1: Necesitan tu decisión (U1) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Necesitan tu decisión</h3>
              <p className="text-xs text-slate-500">Anticipos pendientes y excepciones de productos</p>
            </div>
          </div>
          {alertas.length > 0 && (
            <span className="px-2.5 py-0.5 bg-rose-100 text-rose-700 font-bold text-xs rounded-full">
              {alertas.length} pendiente{alertas.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {alertas.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {alertas.map((alerta: AlertaRow, idx: number) => (
              <div
                key={idx}
                className="py-3 flex items-center justify-between gap-4 hover:bg-slate-50 px-2 rounded-xl transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-800">{alerta.mensaje}</div>
                    <div className="text-[11px] text-slate-500">
                      Cliente: {alerta.cliente_nombre} • Tel: {alerta.cliente_telefono}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onNavigateToPedidos(alerta.pedido_id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shrink-0 transition-colors shadow-sm"
                >
                  <span>Ver Pedido</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <div className="text-xs font-bold text-emerald-900">Todo al día</div>
                <div className="text-[11px] text-emerald-700">Nada requiere tu decisión urgente en este momento.</div>
              </div>
            </div>
            <button
              onClick={onNewCotizacion}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nueva Cotización</span>
            </button>
          </div>
        )}
      </div>

      {/* SECCIÓN 2: Entregas de Hoy (Estado vacío educativo para Fase 1 - A1) */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
            <Truck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Entregas de hoy</h3>
            <p className="text-xs text-slate-500">Rutas locales en León/Chichigalpa y envíos CargoTrans</p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-slate-500 text-center">
          Acá van a aparecer tus entregas cuando empieces a recibir pedidos en Nicaragua.
        </div>
      </div>

      {/* SECCIÓN 3: Esperando a otros (Colapsado para Fase 1 - A1) */}
      <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm flex items-center justify-between text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-700">Esperando a otros:</span>
          <span>Nada en camino todavía.</span>
        </div>
        <span className="text-[11px] text-slate-400">Lotes de importación (Fase 2)</span>
      </div>

      {/* SECCIÓN 4: Tu Plata Ahora (A2) */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 text-white shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-glow-500/20 text-glow-400 flex items-center justify-center font-bold border border-glow-400/30">
              <DollarSign className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Tu plata ahora</h3>
              <p className="text-xs text-slate-400">Control de fondos y obligaciones</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Anticipos recibidos */}
          <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <Lock className="w-3.5 h-3.5" />
              <span>Anticipos recibidos de clientes</span>
            </div>
            <div className="text-2xl font-black tracking-tight text-white">
              {formatearMoneda(anticiposRecibidos, 'COR')}
            </div>
            <p className="text-[11px] text-amber-200/80 italic">
              ⚠️ Esto no es ganancia, lo debés en producto.
            </p>
          </div>

          {/* Por cobrar */}
          <div className="p-4 bg-slate-800/80 rounded-2xl border border-slate-700/80 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Package className="w-3.5 h-3.5" />
              <span>Por cobrar (Saldos contraentrega)</span>
            </div>
            <div className="text-2xl font-black tracking-tight text-white">
              {formatearMoneda(saldosPorCobrar, 'COR')}
            </div>
            <p className="text-[11px] text-slate-400">
              Saldos pendientes de cobrar al entregar productos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
