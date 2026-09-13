import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  AlertTriangle,
  PackageX,
  LogOut,
  TrendingUp,
  PlusCircle,
  ChevronRight,
  HandCoins,
  Sun,
  Moon,
  Monitor,
  CheckCircle2,
} from 'lucide-react';
import type { PanelData } from '@shared/types';
import { formatearMoneda } from '@core/moneda';
import {
  obtenerDatosDashboard,
  cacheDashboardGlobal,
  type DiaVentas,
  type ResumenHoy,
} from '../lib/panel-movil';
import { MoneyDual } from '../components/MoneyDual';
import { BottomSheet } from '../components/BottomSheet';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { PullToRefresh } from '../components/PullToRefresh';
import { haptics } from '../lib/haptics';

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function nombreDia(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return DIAS_CORTOS[d.getDay()];
}

export function DashboardView({
  onIrAVenta,
  onIrACobranza,
  onIrAInventario,
}: {
  onIrAVenta?: () => void;
  onIrACobranza?: () => void;
  onIrAInventario?: () => void;
}) {
  const { usuario, salir } = useAuth();
  const { theme, effectiveTheme, toggleTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const [panel, setPanel] = useState<PanelData | null>(cacheDashboardGlobal.panel);
  const [serie, setSerie] = useState<DiaVentas[]>(cacheDashboardGlobal.serie);
  const [hoy, setHoy] = useState<ResumenHoy>(cacheDashboardGlobal.hoy);
  const [cargando, setCargando] = useState(!cacheDashboardGlobal.panel);
  const [error, setError] = useState<string | null>(null);

  // Día seleccionado en el gráfico para ver el detalle
  const [diaSeleccionado, setDiaSeleccionado] = useState<DiaVentas | null>(null);
  // Confirmación antes de cerrar sesión: es un botón destructivo que vive a
  // un dedo del de actualizar, en la esquina que más pulgar recibe.
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
  // Cajón deslizable (Bottom Sheet) de stock crítico
  const [mostrarStockSheet, setMostrarStockSheet] = useState(false);

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
  const maxSerie = Math.max(1, ...serie.map((d) => d.total_usd_cents));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#f8fafc] dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 transition-colors">
      {/* Top App Bar fija y limpia */}
      <header className="shrink-0 z-20 bg-white/95 dark:bg-[#121826]/95 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/80 pt-safe-t px-4 pb-2 shadow-[0_1px_3px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-colors">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* Avatar: mismo tamaño (36px) que el ícono de sección de las
                otras 3 pantallas, redondo en vez de cuadrado porque es una
                persona, no una categoría — para que el encabezado se sienta
                de la misma familia sin perder la identidad de "inicio". */}
            <div
              className="relative shrink-0 overflow-hidden rounded-full border border-slate-200/80 dark:border-slate-700 shadow-xs"
              style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px' }}
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
            <div className="min-w-0">
              <span className="text-caption font-bold tracking-widest uppercase text-emerald-700 dark:text-emerald-400 block leading-none mb-0.5">
                Glow Heaven
              </span>
              <h1 className="text-title font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                {usuario?.displayName?.split(' ')[0] || 'Mi Negocio'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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

            {/* Separador deliberado: cerrar sesión es la única acción
                destructiva de la barra y no debe quedar a un roce del
                refresco. */}
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" aria-hidden="true" />

            <button
              type="button"
              onClick={() => {
                haptics.impact('light');
                setConfirmandoSalida(true);
              }}
              aria-label="Cerrar sesión"
              className="m3-press group flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 active:scale-90 transition-all border border-slate-200/50 dark:border-slate-700/60 cursor-pointer"
            >
              <LogOut size={16} className="transition-transform duration-150 group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Contenido con Pull-to-Refresh nativo */}
      <PullToRefresh onRefresh={() => cargar(true)} className="flex flex-col flex-1 min-h-0">
        <main
          className="flex flex-col flex-1 min-h-0 gap-2.5 px-3.5 pt-2 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]"
        >
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2 text-caption sm:text-label font-semibold text-rose-700 flex items-center justify-between shrink-0">
              <span>{error}</span>
              <button onClick={() => cargar(true)} className="underline text-rose-800">Reintentar</button>
            </div>
          )}

          {/* Tarjeta Hero: Ventas de Hoy (Diseño Prominente y Claro) */}
          <section
            className="relative overflow-hidden rounded-[20px] p-3.5 sm:p-4 shadow-md shadow-emerald-900/10 shrink-0 flex flex-col justify-between"
            style={{
              background: 'linear-gradient(135deg, #059669 0%, #047857 55%, #0f766e 100%)',
              color: '#ffffff',
            }}
          >
            {/* Esferas de luz sutil */}
            <div className="absolute -right-8 -bottom-8 h-36 w-36 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <div className="absolute left-1/3 -top-10 h-24 w-24 rounded-full bg-emerald-400/20 blur-lg pointer-events-none" />

            <div className="relative z-10 flex flex-col gap-2 sm:gap-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase text-white backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Ventas de hoy
                </span>
                <span className="text-[11px] font-semibold text-white/90 bg-black/15 px-2 py-0.5 rounded-full">
                  {hoy.ventas_count} {hoy.ventas_count === 1 ? 'venta' : 'ventas'}
                </span>
              </div>

              <div className="flex items-end justify-between gap-2">
                <div>
                  <span className="text-[11px] font-medium text-emerald-100 uppercase tracking-wider block mb-0.5">Total generado</span>
                  <p className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-white leading-none">
                    {formatearMoneda(hoy.total_usd_cents, 'USD')}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[11px] text-emerald-100 block mb-0.5">Ganancia</span>
                  <span className="text-caption sm:text-label font-bold text-white tabular-nums bg-white/20 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg inline-block">
                    +{formatearMoneda(hoy.ganancia_usd_cents, 'USD')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-0.5">
                {onIrAVenta && (
                  <button
                    type="button"
                    onClick={() => {
                      haptics.impact('medium');
                      onIrAVenta();
                    }}
                    className="m3-press flex items-center justify-center gap-1.5 rounded-xl bg-white h-10 px-3 text-caption sm:text-label font-bold text-emerald-900 shadow-md active:scale-95 transition-transform cursor-pointer"
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
                  className="m3-press flex items-center justify-center gap-1.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-800 border border-white/20 h-10 px-3 text-caption sm:text-label font-bold text-white shadow-md active:scale-95 transition-transform cursor-pointer backdrop-blur-sm"
                >
                  <HandCoins size={15} className="text-emerald-300" />
                  <span>Cobros y Abonos</span>
                </button>
              </div>
            </div>
          </section>

          {/* Tarjetas métricas de Por Cobrar e Inventario */}
          <section className="grid grid-cols-2 gap-2.5 shrink-0">
            <div
              onClick={() => {
                haptics.impact('light');
                onIrACobranza?.();
              }}
              className="m3-card p-3 sm:p-3.5 flex flex-col justify-between cursor-pointer hover:border-amber-300 dark:hover:border-amber-500/50 transition-colors active:scale-[0.99]"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                    <p className="text-caption sm:text-label font-semibold text-slate-500 dark:text-slate-400 truncate">Por cobrar</p>
                  </div>
                  {cuotasVencidas.length > 0 && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900 shrink-0">
                      {cuotasVencidas.length} ven.
                    </span>
                  )}
                </div>
                <MoneyDual usdCents={panel?.resumen.por_cobrar_usd_cents ?? 0} size="md" soloUsd />
              </div>
              <span className="text-[11px] sm:text-caption text-slate-400 dark:text-slate-500 mt-1.5 font-semibold flex items-center justify-between">
                <span>Gestionar cobros</span>
                <ChevronRight size={13} />
              </span>
            </div>

            <div
              onClick={() => {
                haptics.impact('light');
                onIrAInventario?.();
              }}
              className="m3-card p-3 sm:p-3.5 flex flex-col justify-between cursor-pointer hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors active:scale-[0.99]"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                    <p className="text-caption sm:text-label font-semibold text-slate-500 dark:text-slate-400 truncate">Inventario</p>
                  </div>
                  {(panel?.bajo_stock.length ?? 0) > 0 && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900 shrink-0 flex items-center gap-0.5">
                      <PackageX size={10} />
                      {panel!.bajo_stock.length} bajo
                    </span>
                  )}
                </div>
                <MoneyDual usdCents={panel?.resumen.inversion_inventario_usd_cents ?? 0} size="md" soloUsd />
              </div>
              <span className="text-[11px] sm:text-caption text-slate-400 dark:text-slate-500 mt-1.5 font-semibold flex items-center justify-between">
                <span>{panel?.resumen.unidades_en_inventario ?? 0} unid. disponibles</span>
                <ChevronRight size={13} />
              </span>
            </div>
          </section>

          {/* Gráfico 7 días interactivo (Altura balanceada, sin estiramiento) */}
          <section className="m3-card p-3 sm:p-3.5 shrink-0 flex flex-col gap-2">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-body font-bold text-slate-800 dark:text-slate-100">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 shrink-0">
                  <TrendingUp size={16} />
                </div>
                <span className="text-caption sm:text-label font-bold text-slate-800 dark:text-slate-100">Ventas últimos 7 días</span>
              </div>
              <span className="text-[11px] sm:text-caption font-semibold text-slate-400 dark:text-slate-500">USD</span>
            </div>

            {/* Detalle flotante si se toca una barra */}
            {diaSeleccionado && (
              <div className="my-0.5 flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-700 px-2.5 py-1 text-caption sm:text-label animate-m3-fade shrink-0">
                <span className="font-semibold text-slate-700 dark:text-slate-200 capitalize">
                  {nombreDia(diaSeleccionado.fecha)} {diaSeleccionado.fecha.slice(5)}:
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {formatearMoneda(diaSeleccionado.total_usd_cents, 'USD')} ({diaSeleccionado.cantidad} vtas.)
                </span>
              </div>
            )}

            {/* Altura de barras proporcionada (76px) para evitar aspecto de rascacielos */}
            <div className="flex items-end justify-between gap-1.5 sm:gap-2 pt-1 pb-0.5" style={{ height: '102px' }}>
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
                      className={`relative w-full max-w-[30px] rounded-lg overflow-hidden transition-all ${
                        estaSeleccionado ? 'ring-2 ring-emerald-500' : ''
                      }`}
                      style={{ height: '76px' }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '6px',
                          background: tieneVenta
                            ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)'
                            : (isDark ? '#334155' : '#e2e8f0'),
                          transform: `scaleY(${tieneVenta ? Math.max(0.18, porcentaje / 100) : 0.05})`,
                          transformOrigin: 'bottom',
                          transition: 'transform 300ms ease-out',
                        }}
                      />
                    </div>
                    <span
                      className="text-[10px] sm:text-caption uppercase tracking-tight transition-colors leading-none shrink-0"
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

          {/* Banner de Estado Operativo / Stock Crítico (Altura fija compacta, cero layout shift) */}
          <section
            onClick={() => {
              if (panel?.bajo_stock && panel.bajo_stock.length > 0) {
                haptics.impact('light');
                setMostrarStockSheet(true);
              } else {
                haptics.impact('light');
                onIrAInventario?.();
              }
            }}
            /* `flex-1` y no `shrink-0`: las otras tres secciones tienen alto
               propio, así que todo el espacio sobrante se acumulaba como un
               hueco muerto entre esta tarjeta y el dock. Ahora la tarjeta se
               estira para ocuparlo y reparte su contenido dentro. Sin lista y
               sin scroll a propósito: el detalle vive en el cajón que se abre
               al tocarla. El `pb` del <main> ya reserva la altura del dock. */
            className={`m3-card p-3 sm:p-3.5 flex-1 min-h-[76px] flex flex-col border transition-colors cursor-pointer active:scale-[0.985] ${
              (panel?.bajo_stock?.length ?? 0) > 0
                ? 'bg-rose-50/60 dark:bg-rose-950/25 border-rose-200/70 dark:border-rose-900/50 hover:border-rose-300 dark:hover:border-rose-800'
                : 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/50 dark:border-emerald-900/30'
            }`}
          >
            {/* El contenido se reparte con `justify-between`: la información
                arriba y la acción abajo. Antes era una sola fila centrada, así
                que en una tarjeta alta quedaban dos franjas vacías arriba y
                abajo que se leían como un error de maquetación en vez de una
                decisión. Repartir en vez de centrar se adapta a cualquier
                sobrante sin números fijos, y de paso el área táctil crece. */}
            {(panel?.bajo_stock?.length ?? 0) > 0 ? (
              <div className="flex flex-col justify-between h-full w-full gap-3 min-w-0">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-700 dark:text-rose-400 shrink-0 border border-rose-500/20">
                    <PackageX size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-label sm:text-body font-bold text-rose-900 dark:text-rose-200 truncate leading-tight">
                        Stock crítico ({panel!.bajo_stock.length})
                      </span>
                      {panel!.bajo_stock.some((i) => i.existencias === 0) && (
                        <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
                      )}
                    </div>
                    <p className="text-caption text-rose-700/80 dark:text-rose-400/80 font-medium truncate mt-0.5 leading-tight">
                      {panel!.bajo_stock.length === 1
                        ? panel!.bajo_stock[0].nombre
                        : `${panel!.bajo_stock.filter((i) => i.existencias === 0).length} agotados`}
                    </p>
                  </div>
                </div>

                <div className="flex w-full items-center justify-center gap-1.5 text-label font-bold text-rose-700 dark:text-rose-300 bg-rose-100/90 dark:bg-rose-900/40 px-3 py-2.5 rounded-xl border border-rose-200/60 dark:border-rose-800/60 shrink-0">
                  <span>Revisar inventario</span>
                  <ChevronRight size={15} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full w-full gap-3 min-w-0">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0 border border-emerald-500/20">
                    <CheckCircle2 size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-label sm:text-body font-bold text-emerald-800 dark:text-emerald-300 block leading-tight">
                      Inventario en orden
                    </span>
                    <span className="text-caption text-slate-500 dark:text-slate-400 block mt-0.5 leading-tight">
                      Existencias óptimas en todos los artículos
                    </span>
                  </div>
                </div>

                <div className="flex w-full items-center justify-center gap-1.5 text-label font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100/80 dark:bg-emerald-950/80 px-3 py-2.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/60 shrink-0">
                  <span>Ver inventario</span>
                  <ChevronRight size={15} />
                </div>
              </div>
            )}
          </section>
        </main>
      </PullToRefresh>

      {/* Bottom Sheet de Stock Crítico (Solución Emil Kowalski: holgura nativa sin layout shift) */}
      <BottomSheet
        abierto={mostrarStockSheet}
        onCerrar={() => setMostrarStockSheet(false)}
        titulo="Stock Crítico"
        subtitulo={
          panel?.bajo_stock && panel.bajo_stock.length > 0
            ? `${panel.bajo_stock.length} producto${panel.bajo_stock.length === 1 ? '' : 's'} que requiere${panel.bajo_stock.length === 1 ? '' : 'n'} atención`
            : undefined
        }
        maxHeight="85vh"
        footer={
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setMostrarStockSheet(false)}
              className="m3-press flex-1 rounded-xl bg-slate-100 dark:bg-slate-800 py-3 text-label font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Cerrar
            </button>
            {onIrAInventario && (
              <button
                type="button"
                onClick={() => {
                  haptics.impact('medium');
                  setMostrarStockSheet(false);
                  onIrAInventario();
                }}
                className="m3-press flex-1 rounded-xl bg-emerald-700 hover:bg-emerald-800 py-3 text-label font-bold text-white shadow-md shadow-emerald-700/20 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Ir al Inventario</span>
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-2 py-1">
          {panel?.bajo_stock && panel.bajo_stock.length > 0 ? (
            panel.bajo_stock.map((item) => {
              const estaAgotado = item.existencias === 0;
              return (
                <div
                  key={item.producto_id}
                  onClick={() => {
                    if (onIrAInventario) {
                      haptics.selection();
                      setMostrarStockSheet(false);
                      onIrAInventario();
                    }
                  }}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50/90 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60 active:scale-[0.985] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        estaAgotado ? 'bg-rose-500 animate-pulse' : 'bg-amber-500'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate leading-tight">
                        {item.nombre}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 font-medium truncate mt-0.5">
                        {item.codigo ? `#${item.codigo}` : 'Sin código'} · Mínimo sugerido: {item.stock_minimo} unid.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <span
                      className={`text-xs font-extrabold px-2.5 py-1 rounded-lg tabular-nums ${
                        estaAgotado
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {estaAgotado ? 'Agotado (0)' : `Quedan ${item.existencias}`}
                    </span>
                    {item.precio_venta_usd_cents > 0 && (
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatearMoneda(item.precio_venta_usd_cents, 'USD')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-slate-400">
              <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Todo el inventario está en orden
              </p>
              <p className="text-xs text-slate-400 mt-1">
                No hay productos agotados ni por debajo del stock mínimo.
              </p>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Confirmación de cierre de sesión: es la única acción destructiva de
          esta pantalla y merece un paso extra, sin usar window.confirm. */}
      <BottomSheet
        abierto={confirmandoSalida}
        onCerrar={() => setConfirmandoSalida(false)}
        titulo="¿Cerrar sesión?"
        subtitulo={usuario?.email ? `Vas a salir de la cuenta ${usuario.email}.` : undefined}
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmandoSalida(false)}
              className="m3-press flex-1 rounded-xl bg-slate-100 dark:bg-slate-800 py-3 text-label font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.impact('medium');
                setConfirmandoSalida(false);
                salir();
              }}
              className="m3-press flex-1 rounded-xl bg-rose-600 hover:bg-rose-700 py-3 text-label font-bold text-white shadow-md shadow-rose-600/20 cursor-pointer"
            >
              Sí, cerrar sesión
            </button>
          </div>
        }
      >
        <p className="text-label text-slate-500 dark:text-slate-400">
          Vas a tener que volver a iniciar sesión con Google para entrar de nuevo.
        </p>
      </BottomSheet>
    </div>
  );
}
