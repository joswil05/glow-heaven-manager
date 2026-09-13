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
      <div className="flex flex-col gap-3 pb-2">
        {/* Barra de búsqueda estilo Android M3 */}
        <div className="relative flex items-center shrink-0">
          <div
            style={{
              position: 'absolute',
              left: '14px',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              color: 'rgb(var(--texto-3))',
            }}
          >
            <Search size={18} />
          </div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por clienta o código de venta…"
            className="w-full h-11 rounded-full bg-superficie-2 text-xs font-semibold text-texto placeholder:text-texto-3 outline-none focus:bg-superficie focus:ring-2 focus:ring-emerald-500/30 border border-transparent transition-all"
            style={{
              paddingLeft: '44px',
              paddingRight: '40px',
              height: '42px',
              borderRadius: '9999px',
            }}
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => {
                haptics.impact('light');
                setBusqueda('');
              }}
              className="absolute right-3 p-1 text-texto-3 hover:text-texto-2 rounded-full"
              style={{ position: 'absolute', right: '12px' }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Resumen Total Pendiente */}
        {cuentasPorCobrar.length > 0 && (
          <div className="flex items-center justify-between rounded-2xl bg-acento-suave border border-acento-suave p-3 shadow-sm shrink-0">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-acento">
                Total por cobrar en el negocio
              </span>
              <p className="text-sm font-black text-acento">
                {formatearMoneda(totalPendienteUsd, 'USD')}{' '}
                <span className="text-xs font-semibold text-acento">
                  (≈ {formatearMoneda(totalPendienteCor, 'COR')})
                </span>
              </p>
            </div>
            <span className="rounded-full bg-acento-suave text-acento text-xs font-extrabold px-2.5 py-1">
              {cuentasPorCobrar.length} cuenta{cuentasPorCobrar.length > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Lista de Cuentas (Scroll fluido en un único contenedor sin trampas de scroll) */}
        <div className="flex flex-col gap-2">
          {filtradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-superficie-2 text-texto-3">
                <User size={20} />
              </div>
              <p className="text-xs font-bold text-texto-2">
                {busqueda ? 'No se encontraron cuentas con esa búsqueda' : '¡Excelente! No hay cuentas pendientes por cobrar'}
              </p>
              <p className="text-[11px] text-texto-3 max-w-xs">
                {busqueda
                  ? 'Verifica el nombre o número de comprobante.'
                  : 'Todas las ventas están al día y pagadas en su totalidad.'}
              </p>
            </div>
          ) : (
            filtradas.map((c) => {
              const saldoCor = Math.round((c.saldo_usd_cents * tasa) / 100);
              const vencida = c.cuotas_vencidas > 0;

              return (
                <div
                  key={c.venta_id}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition-transform active:scale-[0.99] ${
                    vencida
                      ? 'border-peligro-suave bg-peligro-suave'
                      : 'border-borde bg-superficie/80 hover:bg-superficie-2'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-texto">{c.cliente_nombre}</p>
                      {vencida && (
                        <span className="inline-flex items-center gap-0.5 rounded-md bg-peligro-suave px-1.5 py-0.5 text-[10px] font-bold text-peligro">
                          <AlertTriangle size={10} />
                          Vencida
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-texto-3 font-medium">
                      {c.codigo} · {c.fecha}
                    </p>
                    <p className="text-xs font-black text-acento mt-0.5 tabular-nums">
                      {formatearMoneda(c.saldo_usd_cents, 'USD')}{' '}
                      <span className="text-[11px] font-semibold text-texto-3">
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
                    className="m3-press flex items-center gap-1 h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 shrink-0 cursor-pointer"
                  >
                    <DollarSign size={14} />
                    Abonar
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
