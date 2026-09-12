import { useState, useMemo } from 'react';
import { Search, DollarSign, X, Clock, User, AlertTriangle } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { formatearMoneda } from '@core/moneda';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';
import type { FilaPorCobrar } from '@shared/types';
import type { VentaCobroItem } from './AbonoModalSheet';

interface AbonoSelectorSheetProps {
  abierto: boolean;
  onCerrar: () => void;
  cuentasPorCobrar: FilaPorCobrar[];
  onSeleccionarVenta: (venta: VentaCobroItem) => void;
}

export function AbonoSelectorSheet({
  abierto,
  onCerrar,
  cuentasPorCobrar,
  onSeleccionarVenta,
}: AbonoSelectorSheetProps) {
  const { parametros } = useDatosNegocio();
  const [busqueda, setBusqueda] = useState('');
  const tasa = parametros?.tasa_cambio_cents ?? 3662;

  const totalPendienteUsd = useMemo(
    () => cuentasPorCobrar.reduce((acc, c) => acc + (c.saldo_usd_cents || 0), 0),
    [cuentasPorCobrar]
  );

  const totalPendienteCor = Math.round((totalPendienteUsd * tasa) / 100);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return cuentasPorCobrar;
    return cuentasPorCobrar.filter(
      (c) =>
        c.cliente_nombre.toLowerCase().includes(q) ||
        c.codigo.toLowerCase().includes(q) ||
        (c.cliente_telefono && c.cliente_telefono.includes(q))
    );
  }, [cuentasPorCobrar, busqueda]);

  return (
    <BottomSheet
      abierto={abierto}
      onCerrar={() => {
        haptics.impact('light');
        onCerrar();
      }}
      titulo="Registrar Abono"
      subtitulo="Selecciona una clienta para abonar o liquidar su saldo"
    >
      <div className="flex flex-col gap-2.5 pb-2">
        {/* Barra de búsqueda compacta */}
        <div className="relative flex items-center shrink-0">
          <div
            style={{
              position: 'absolute',
              left: '12px',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              color: '#64748b',
            }}
          >
            <Search size={15} />
          </div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por clienta o código de venta…"
            className="w-full h-9 rounded-lg bg-slate-100 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/30 transition-all border border-slate-200/60"
            style={{
              paddingLeft: '34px',
              paddingRight: '34px',
              height: '36px',
            }}
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => {
                haptics.impact('light');
                setBusqueda('');
              }}
              className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Resumen Total Pendiente */}
        {cuentasPorCobrar.length > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200/70 p-2.5 shadow-xs shrink-0">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-800 block leading-tight">
                Total por cobrar
              </span>
              <p className="text-xs font-black text-emerald-900 leading-tight mt-0.5">
                {formatearMoneda(totalPendienteUsd, 'USD')}{' '}
                <span className="text-[10px] font-semibold text-emerald-700">
                  (≈ {formatearMoneda(totalPendienteCor, 'COR')})
                </span>
              </p>
            </div>
            <span className="rounded-full bg-emerald-100/90 text-emerald-800 text-[11px] font-extrabold px-2 py-0.5">
              {cuentasPorCobrar.length} cuenta{cuentasPorCobrar.length > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Lista de Cuentas */}
        <div className="flex flex-col gap-1.5">
          {filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-1.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <User size={18} />
              </div>
              <p className="text-xs font-bold text-slate-700">
                {busqueda ? 'No se encontraron cuentas' : '¡Excelente! Sin cuentas pendientes'}
              </p>
              <p className="text-[10px] text-slate-400 max-w-xs">
                {busqueda
                  ? 'Verifica el nombre o número de comprobante.'
                  : 'Todas las ventas están al día.'}
              </p>
            </div>
          ) : (
            filtradas.map((c) => {
              const saldoCor = Math.round((c.saldo_usd_cents * tasa) / 100);
              const vencida = c.cuotas_vencidas > 0;

              return (
                <div
                  key={c.venta_id}
                  className={`flex items-center justify-between gap-2.5 rounded-xl border p-2.5 transition-colors ${
                    vencida
                      ? 'border-rose-200/80 bg-rose-50/50'
                      : 'border-slate-200/80 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-slate-900 leading-tight">{c.cliente_nombre}</p>
                      {vencida && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1 py-0.2 text-[9px] font-bold text-rose-700 shrink-0">
                          <AlertTriangle size={9} />
                          Vencida
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">
                      {c.codigo} · {c.fecha}
                    </p>
                    <p className="text-xs font-black text-emerald-800 mt-0.5 tabular-nums leading-tight">
                      {formatearMoneda(c.saldo_usd_cents, 'USD')}{' '}
                      <span className="text-[10px] font-semibold text-slate-400">
                        (≈ {formatearMoneda(saldoCor, 'COR')})
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      haptics.impact('medium');
                      onSeleccionarVenta({
                        venta_id: c.venta_id,
                        codigo: c.codigo,
                        cliente_nombre: c.cliente_nombre,
                        cliente_telefono: c.cliente_telefono,
                        saldo_usd_cents: c.saldo_usd_cents,
                      });
                      onCerrar();
                    }}
                    className="m3-press flex items-center gap-1 h-8 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs active:scale-95 transition-transform shrink-0 cursor-pointer"
                  >
                    <span>Seleccionar</span>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
