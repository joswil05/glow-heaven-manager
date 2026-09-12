import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  PackageX,
  Clock3,
  LogOut,
  TrendingUp,
  PlusCircle,
  ChevronRight,
  HandCoins,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import type { PanelData } from '@shared/types';
import { formatearMoneda } from '@core/moneda';
import {
  obtenerDatosDashboard,
  cacheDashboardGlobal,
  type DiaVentas,
  type ResumenHoy,
  type EncargoPendiente,
} from '../lib/panel-movil';
import { MoneyDual } from '../components/MoneyDual';
import { useAuth } from '../context/AuthContext';
import { useDatosNegocio } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { PullToRefresh } from '../components/PullToRefresh';
import { haptics } from '../lib/haptics';
import { useScrollReveal } from '../lib/useScrollReveal';

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function nombreDia(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return DIAS_CORTOS[d.getDay()];
}

export function DashboardView({
  onIrAVenta,
  onIrACobranza,
}: {
  onIrAVenta?: () => void;
  onIrACobranza?: () => void;
}) {
  const { usuario, salir } = useAuth();
  const { parametros } = useDatosNegocio();
  const { theme, effectiveTheme, toggleTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const tasa = parametros?.tasa_cambio_cents ?? 3662;

  const [panel, setPanel] = useState<PanelData | null>(cacheDashboardGlobal.panel);
  const [serie, setSerie] = useState<DiaVentas[]>(cacheDashboardGlobal.serie);
  const [hoy, setHoy] = useState<ResumenHoy>(cacheDashboardGlobal.hoy);
  const [encargos, setEncargos] = useState<EncargoPendiente[]>(cacheDashboardGlobal.encargos);
  const [cargando, setCargando] = useState(!cacheDashboardGlobal.panel);
  const [error, setError] = useState<string | null>(null);

  // Día seleccionado en el gráfico para ver el detalle
  const [diaSeleccionado, setDiaSeleccionado] = useState<DiaVentas | null>(null);
  const scrollRevealRef = useScrollReveal<HTMLElement>({ threshold: 0.05, staggerMs: 30 });

  const cargar = useCallback(async (forzar = false) => {
    if (!cacheDashboardGlobal.panel) {
      setCargando(true);
    }
    setError(null);
    try {
      const data = await obtenerDatosDashboard(forzar);
      setPanel(data.panel);
      setSerie(data.serie);
      setHoy(data.hoy);
      setEncargos(data.encargos);
    } catch (err) {
      console.error('[DashboardView] Error cargando el panel:', err);
      if (!cacheDashboardGlobal.panel) {
        setError('No se pudo sincronizar el panel.');
      }
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(false);
  }, [cargar]);

  const cuentasPorCobrar = panel?.por_cobrar ?? [];
  const cuotasVencidas = cuentasPorCobrar.filter((f) => f.cuotas_vencidas > 0);
  const totalPorCobrarUsd = cuentasPorCobrar.reduce((acc, c) => acc + (c.saldo_usd_cents || 0), 0);
  const totalPorCobrarCor = Math.round((totalPorCobrarUsd * tasa) / 100);
  const maxSerie = Math.max(1, ...serie.map((d) => d.total_usd_cents));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#f8fafc] dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 transition-colors">
      {/* Top App Bar fija y limpia */}
      <header className="shrink-0 z-20 bg-white/95 dark:bg-[#121826]/95 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/80 pt-safe-t px-4 pb-2 shadow-[0_1px_3px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-colors">
        <div className="flex items-center justify-between py-1.5">
          <div className="flex items-center gap-2.5">
            {/* Avatar pequeño y discreto (sin quitar protagonismo) */}
            <div
              className="relative shrink-0 overflow-hidden rounded-full border border-slate-200/80 dark:border-slate-700 shadow-xs"
              style={{ width: '32px', height: '32px', minWidth: '32px', minHeight: '32px' }}
            >
              {usuario?.photoURL ? (
                <img
                  src={usuario.photoURL}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-emerald-100 text-emerald-800 font-extrabold text-xs">
                  {(usuario?.displayName || usuario?.email || 'G').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <span className="text-[10px] font-bold tracking-widest uppercase text-emerald-700 dark:text-emerald-400 block leading-none mb-0.5">
                Glow Heaven
              </span>
              <h1 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                {usuario?.displayName?.split(' ')[0] || 'Mi Negocio'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Toggle de Modo Oscuro / Claro / Sistema */}
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                toggleTheme();
              }}
              aria-label="Cambiar tema de apariencia"
              title={`Tema: ${theme === 'system' ? 'Automático' : theme === 'dark' ? 'Oscuro' : 'Claro'}`}
              className="m3-press group flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 transition-all border border-slate-200/50 dark:border-slate-700/60 cursor-pointer"
            >
              {theme === 'system' ? (
                <Monitor size={16} className="text-slate-500 dark:text-slate-400 transition-transform duration-200 group-hover:scale-110" />
              ) : effectiveTheme === 'dark' ? (
                <Moon size={16} className="text-emerald-400 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110" />
              ) : (
                <Sun size={16} className="text-amber-500 transition-transform duration-300 group-hover:rotate-45 group-hover:scale-110" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                haptics.selection();
                cargar(true);
              }}
              aria-label="Actualizar datos"
              className="m3-press group flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 transition-all border border-slate-200/50 dark:border-slate-700/60 cursor-pointer"
            >
              <RefreshCw size={16} className={cargando ? 'animate-spin text-emerald-600 dark:text-emerald-400' : 'transition-transform duration-500 group-hover:rotate-180'} />
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.impact('light');
                salir();
              }}
              aria-label="Cerrar sesión"
              className="m3-press group flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 text-slate-400 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 active:scale-90 transition-all border border-slate-200/50 dark:border-slate-700/60 cursor-pointer"
            >
              <LogOut size={16} className="transition-transform duration-150 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Contenido con Pull-to-Refresh nativo */}
      <PullToRefresh onRefresh={() => cargar(true)}>
        <main ref={scrollRevealRef} className="flex flex-col gap-3 px-3.5 pt-2.5 pb-40 scroll-smooth">
          {error && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs font-semibold text-rose-700 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => cargar(true)} className="underline text-rose-800">Reintentar</button>
            </div>
          )}

          {/* Tarjeta Hero: Ventas de Hoy (Diseño Prominente y Claro) */}
          <section
            className="scroll-reveal relative overflow-hidden rounded-[24px] p-4 shadow-md shadow-emerald-900/10"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #047857 55%, #0f766e 100%)',
              color: '#ffffff',
            }}
          >
            {/* Esferas de luz sutil */}
            <div className="absolute -right-8 -bottom-8 h-36 w-36 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <div className="absolute left-1/3 -top-10 h-24 w-24 rounded-full bg-emerald-400/20 blur-lg pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold tracking-wide uppercase text-white backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Ventas de hoy
                </span>
                <span className="text-[11px] text-white/90 font-semibold bg-black/15 px-2 py-0.5 rounded-full">
                  {hoy.ventas_count} {hoy.ventas_count === 1 ? 'venta' : 'ventas'}
                </span>
              </div>

              <div className="mt-2.5 flex items-baseline justify-between gap-2">
                <div>
                  <span className="text-[10px] font-medium text-emerald-100 uppercase tracking-wider block">Total generado</span>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-white leading-none">
                      {formatearMoneda(hoy.total_usd_cents, 'USD')}
                    </p>
                    <span className="text-xs font-semibold text-emerald-100 tabular-nums">
                      ≈ {formatearMoneda(Math.round((hoy.total_usd_cents * tasa) / 100), 'COR')}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-emerald-100 block">Ganancia</span>
                  <span className="text-xs font-bold text-white tabular-nums bg-white/20 px-2 py-0.5 rounded-lg inline-block">
                    +{formatearMoneda(hoy.ganancia_usd_cents, 'USD')}
                  </span>
                </div>
              </div>

              {/* Botones de acción rápida: Venta Rápida y Registrar Abono */}
              <div className="mt-3.5 grid grid-cols-2 gap-2">
                {onIrAVenta && (
                  <button
                    type="button"
                    onClick={() => {
                      haptics.impact('medium');
                      onIrAVenta();
                    }}
                    className="m3-press flex items-center justify-center gap-1.5 rounded-xl bg-white h-10 px-3 text-xs font-bold text-emerald-900 shadow-md active:scale-95 transition-transform cursor-pointer"
                  >
                    <PlusCircle size={15} className="text-emerald-600" />
                    <span>Venta Rápida</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    haptics.impact('medium');
                    onIrACobranza?.();
                  }}
                  className="m3-press flex items-center justify-center gap-1.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-800 border border-white/20 h-10 px-3 text-xs font-bold text-white shadow-md active:scale-95 transition-transform cursor-pointer backdrop-blur-sm"
                >
                  <HandCoins size={15} className="text-emerald-300" />
                  <span>Cobros y Abonos</span>
                </button>
              </div>
            </div>
          </section>

          {/* Tarjetas métricas de Por Cobrar e Inventario */}
          <section className="scroll-reveal grid grid-cols-2 gap-2.5">
            <div
              onClick={() => {
                haptics.impact('light');
                onIrACobranza?.();
              }}
              className="m3-card p-3.5 flex flex-col justify-between cursor-pointer hover:border-amber-300 dark:hover:border-amber-500/50 transition-colors active:scale-[0.99]"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Por cobrar</p>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md">
                    Ver
                  </span>
                </div>
                <MoneyDual usdCents={panel?.resumen.por_cobrar_usd_cents ?? 0} size="sm" />
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium flex items-center justify-between">
                <span>Gestionar cobros</span>
                <ChevronRight size={12} />
              </span>
            </div>

            <div className="m3-card p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Inventario</p>
                </div>
                <MoneyDual usdCents={panel?.resumen.inversion_inventario_usd_cents ?? 0} size="sm" />
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium">Costo invertido</span>
            </div>
          </section>

          {/* Gráfico 7 días interactivo */}
          <section className="scroll-reveal m3-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                  <TrendingUp size={15} />
                </div>
                <span>Ventas últimos 7 días</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">USD</span>
            </div>

            {/* Detalle flotante si se toca una barra */}
            {diaSeleccionado && (
              <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-700 px-3 py-1.5 text-xs animate-m3-fade">
                <span className="font-semibold text-slate-700 dark:text-slate-200 capitalize">
                  {nombreDia(diaSeleccionado.fecha)} {diaSeleccionado.fecha.slice(5)}:
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {formatearMoneda(diaSeleccionado.total_usd_cents, 'USD')} ({diaSeleccionado.cantidad} vtas.)
                </span>
              </div>
            )}

            <div className="flex h-28 items-end justify-between gap-2 pt-1">
              {serie.map((d) => {
                const porcentaje = maxSerie > 0 ? (d.total_usd_cents / maxSerie) * 100 : 0;
                const tieneVenta = d.total_usd_cents > 0;
                const estaSeleccionado = diaSeleccionado?.fecha === d.fecha;

                return (
                  <div
                    key={d.fecha}
                    onClick={() => {
                      haptics.selection();
                      setDiaSeleccionado(estaSeleccionado ? null : d);
                    }}
                    className="group flex flex-1 flex-col items-center gap-1.5 h-full justify-end cursor-pointer"
                  >
                    <div
                      className={`relative w-full max-w-[26px] rounded-lg flex flex-col justify-end overflow-hidden p-0.5 transition-all ${
                        estaSeleccionado ? 'ring-2 ring-emerald-500' : ''
                      }`}
                      style={{
                        height: '64px',
                        backgroundColor: estaSeleccionado
                          ? (isDark ? '#064e3b' : '#ecfdf5')
                          : (isDark ? '#1e293b' : '#f1f5f9'),
                        border: isDark ? '1px solid #334155' : '1px solid #e2e8f0',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          borderRadius: '5px',
                          height: tieneVenta ? `${Math.max(16, porcentaje)}%` : '4px',
                          background: tieneVenta
                            ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)'
                            : (isDark ? '#475569' : '#cbd5e1'),
                          transition: 'height 300ms ease-out',
                        }}
                      />
                    </div>
                    <span
                      className="text-[11px] uppercase tracking-tight transition-colors leading-none"
                      style={{
                        fontWeight: estaSeleccionado || tieneVenta ? 700 : 500,
                        color: estaSeleccionado
                          ? (isDark ? '#34d399' : '#047857')
                          : tieneVenta
                            ? (isDark ? '#f8fafc' : '#0f172a')
                            : (isDark ? '#64748b' : '#94a3b8'),
                      }}
                    >
                      {nombreDia(d.fecha)}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Resumen de Cobranzas y Créditos */}
          {cuentasPorCobrar.length > 0 && (
            <section className="scroll-reveal m3-card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/60">
                    <HandCoins size={15} />
                  </span>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Gestión de Cobranzas
                  </h2>
                </div>

                {cuotasVencidas.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950/80 px-2.5 py-0.5 text-[10px] font-extrabold text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                    <AlertTriangle size={10} />
                    {cuotasVencidas.length} {cuotasVencidas.length === 1 ? 'vencida' : 'vencidas'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/80">
                    {cuentasPorCobrar.length} al día
                  </span>
                )}
              </div>

              <div className="flex items-baseline justify-between rounded-xl bg-slate-50 dark:bg-slate-900/50 px-3.5 py-2.5 border border-slate-100 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total en la calle</span>
                <div className="text-right">
                  <span className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                    {formatearMoneda(totalPorCobrarUsd, 'USD')}
                  </span>
                  <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 ml-1.5">
                    (≈ {formatearMoneda(totalPorCobrarCor, 'COR')})
                  </span>
                </div>
              </div>

              {onIrACobranza && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    onIrACobranza();
                  }}
                  className="m3-press w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer border border-slate-200/50 dark:border-slate-700/50"
                >
                  <span>Ver listado y registrar abonos ({cuentasPorCobrar.length})</span>
                  <ChevronRight size={15} className="text-slate-400" />
                </button>
              )}
            </section>
          )}

          {/* Stock crítico */}
          {(panel?.bajo_stock.length ?? 0) > 0 && (
            <section className="scroll-reveal flex flex-col gap-1.5">
              <h2 className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                <PackageX size={13} />
                Stock crítico ({panel!.bajo_stock.length})
              </h2>
              <div className="m3-card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 rounded-xl">
                {panel!.bajo_stock.slice(0, 6).map((p) => (
                  <div key={p.producto_id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{p.nombre}</p>
                    <span className="shrink-0 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 px-2 py-0.2 text-[10px] font-bold text-amber-700 dark:text-amber-400 ml-2">
                      {p.existencias} und.
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Encargos pendientes */}
          {encargos.length > 0 && (
            <section className="scroll-reveal flex flex-col gap-1.5">
              <h2 className="flex items-center gap-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                <Clock3 size={13} />
                Encargos pendientes ({encargos.length})
              </h2>
              <div className="m3-card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 rounded-xl">
                {encargos.slice(0, 6).map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">{e.cliente_nombre}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{e.codigo}</p>
                    </div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                      {formatearMoneda(e.saldo_usd_cents, 'USD')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </PullToRefresh>
    </div>
  );
}
