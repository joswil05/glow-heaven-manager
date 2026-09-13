import { useEffect, useState } from 'react';
import {
  Clock,
  DollarSign,
  MessageCircle,
  Loader2,
  Calendar,
  CreditCard,
  Banknote,
  Receipt,
  AlertCircle,
} from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { PagosRepoFirestore } from '@repos/pagos.repo';
import { formatearMoneda } from '@core/moneda';
import { linkWhatsapp } from '../lib/util';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';
import type { PagoCompleto } from '@shared/types';
import type { VentaCobroItem } from './AbonoModalSheet';

export interface ClienteKardexInfo {
  cliente_id?: number;
  cliente_nombre: string;
  cliente_telefono?: string;
  saldo_usd_cents?: number;
  venta_id?: number;
  codigo?: string;
}

interface KardexClienteSheetProps {
  cliente: ClienteKardexInfo | null;
  abierto: boolean;
  onCerrar: () => void;
  onAbonar: (venta: VentaCobroItem) => void;
}

export function KardexClienteSheet({
  cliente,
  abierto,
  onCerrar,
  onAbonar,
}: KardexClienteSheetProps) {
  const { parametros } = useDatosNegocio();
  const [pagos, setPagos] = useState<PagoCompleto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tasa = parametros?.tasa_cambio_cents ?? 3662;

  useEffect(() => {
    if (!abierto || !cliente) {
      setPagos([]);
      setError(null);
      return;
    }

    let cancelado = false;
    async function cargarHistorial() {
      setCargando(true);
      setError(null);
      try {
        let resultados: PagoCompleto[] = [];
        if (cliente!.cliente_id) {
          resultados = await PagosRepoFirestore.listarPorCliente(cliente!.cliente_id);
        } else if (cliente!.venta_id) {
          resultados = await PagosRepoFirestore.listarPorVenta(cliente!.venta_id);
        }
        if (!cancelado) {
          setPagos(resultados);
        }
      } catch (err: any) {
        console.error('[KardexClienteSheet] Error cargando pagos:', err);
        if (!cancelado) {
          setError('No se pudo cargar el historial de abonos.');
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargarHistorial();
    return () => {
      cancelado = true;
    };
  }, [abierto, cliente]);

  if (!cliente) return null;

  const saldoUsd = cliente.saldo_usd_cents ?? 0;
  const saldoCor = Math.round((saldoUsd * tasa) / 100);
  const totalAbonadoUsd = pagos.reduce((acc, p) => acc + (p.monto_usd_cents || 0), 0);
  const totalAbonadoCor = Math.round((totalAbonadoUsd * tasa) / 100);

  return (
    <BottomSheet
      abierto={abierto}
      onCerrar={() => {
        haptics.impact('light');
        onCerrar();
      }}
      titulo="Kardex de Abonos"
      subtitulo={cliente.cliente_nombre}
    >
      <div className="flex flex-col gap-3 pb-3">
        {/* Resumen de Cuenta del Cliente */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-[#1b253b] dark:to-[#161f30] border border-slate-200/80 dark:border-slate-700/80 p-3.5 flex flex-col gap-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                {cliente.cliente_nombre}
              </h3>
              {cliente.cliente_telefono && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  {cliente.cliente_telefono}
                </p>
              )}
            </div>

            {/* Acceso WhatsApp */}
            {cliente.cliente_telefono && (
              <a
                href={
                  linkWhatsapp(
                    cliente.cliente_telefono,
                    `Hola ${cliente.cliente_nombre}, te saludamos de Glow Heaven ✨ Te compartimos el estado de tus abonos y saldo pendiente: ${formatearMoneda(
                      saldoUsd,
                      'USD'
                    )} (≈ ${formatearMoneda(saldoCor, 'COR')}). ¡Muchas gracias por tu preferencia!`
                  ) ?? undefined
                }
                onClick={() => haptics.impact('light')}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 text-[11px] font-bold active:scale-95 transition-all shrink-0"
              >
                <MessageCircle size={14} />
                <span>WhatsApp</span>
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
            <div className="flex flex-col">
              <span className="text-caption font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Saldo pendiente
              </span>
              <p
                className={`text-sm font-black tabular-nums ${
                  saldoUsd > 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatearMoneda(saldoUsd, 'USD')}
              </p>
              <p className="text-caption text-slate-400 font-medium">
                ≈ {formatearMoneda(saldoCor, 'COR')}
              </p>
            </div>

            <div className="flex flex-col text-right">
              <span className="text-caption font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total abonado
              </span>
              <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatearMoneda(totalAbonadoUsd, 'USD')}
              </p>
              <p className="text-caption text-slate-400 font-medium">
                {pagos.length} {pagos.length === 1 ? 'pago' : 'pagos'}
              </p>
            </div>
          </div>
        </div>

        {/* Botón de Abonar directo */}
        <button
          type="button"
          onClick={() => {
            haptics.impact('medium');
            onAbonar({
              venta_id: cliente.venta_id || pagos[0]?.venta_id || 0,
              codigo: cliente.codigo || pagos[0]?.venta_codigo || `C-${cliente.cliente_id}`,
              cliente_nombre: cliente.cliente_nombre,
              cliente_telefono: cliente.cliente_telefono,
              saldo_usd_cents: saldoUsd,
            });
            onCerrar();
          }}
          className={`flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-extrabold text-xs shadow-xs transition-all active:scale-[0.98] cursor-pointer ${
            saldoUsd > 0
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700'
          }`}
        >
          <DollarSign size={16} className={saldoUsd > 0 ? 'text-white' : 'text-emerald-500'} />
          <span>{saldoUsd > 0 ? 'Registrar Nuevo Abono' : 'Registrar Abono Anticipado'}</span>
        </button>

        {/* Lista de Abonos */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Clock size={13} className="text-slate-400" />
              Historial de Pagos ({pagos.length})
            </span>
          </div>

          {cargando ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="animate-spin text-emerald-600" size={24} />
              <span className="text-xs text-slate-500 font-medium">Cargando pagos...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          ) : pagos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-2xl bg-white dark:bg-[#161f30] border border-slate-200/80 dark:border-slate-800">
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-2">
                <Receipt size={20} />
              </div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Aún no hay abonos registrados
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Los pagos y amortizaciones que reciba esta clienta aparecerán aquí.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {pagos.map((p) => {
                const esEfectivo = p.metodo === 'EFECTIVO';
                const esTransferencia = p.metodo === 'TRANSFERENCIA';

                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-1.5 p-3 rounded-2xl bg-white dark:bg-[#161f30] border border-slate-200/80 dark:border-slate-800 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400">
                          {esEfectivo ? <Banknote size={11} /> : <CreditCard size={11} />}
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {esEfectivo ? 'Efectivo' : esTransferencia ? 'Transferencia' : 'Otro'}
                        </span>
                        {p.es_anticipo && (
                          <span className="text-[10px] font-extrabold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1.5 py-0.2 rounded-md">
                            Anticipo
                          </span>
                        )}
                        {p.venta_codigo && (
                          <span className="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-md">
                            {p.venta_codigo}
                          </span>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">
                          {formatearMoneda(p.monto_usd_cents, 'USD')}
                        </span>
                        {p.moneda === 'COR' && (
                          <p className="text-[10px] text-slate-400 font-medium">
                            {formatearMoneda(p.monto_cor_cents, 'COR')}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 pt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {p.fecha}
                      </span>
                      {p.referencia && (
                        <span className="truncate max-w-[160px] font-medium text-slate-500 dark:text-slate-400">
                          Ref: {p.referencia}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
