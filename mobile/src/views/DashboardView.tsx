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
import { BottomSheet } from '../components/BottomSheet';
import { useAuth } from '../context/AuthContext';
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
  const { theme, effectiveTheme, toggleTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  const [panel, setPanel] = useState<PanelData | null>(cacheDashboardGlobal.panel);
  const [serie, setSerie] = useState<DiaVentas[]>(cacheDashboardGlobal.serie);
  const [hoy, setHoy] = useState<ResumenHoy>(cacheDashboardGlobal.hoy);
  const [encargos, setEncargos] = useState<EncargoPendiente[]>(cacheDashboardGlobal.encargos);
  const [cargando, setCargando] = useState(!cacheDashboardGlobal.panel);
  const [error, setError] = useState<string | null>(null);

  // Día seleccionado en el gráfico para ver el detalle
  const [diaSeleccionado, setDiaSeleccionado] = useState<DiaVentas | null>(null);
  // Confirmación antes de cerrar sesión: es un botón destructivo que vive a
  // un dedo del de actualizar, en la esquina que más pulgar recibe.
  const [confirmandoSalida, setConfirmandoSalida] = useState(false);
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
  const maxSerie = Math.max(1, ...serie.map((d) => d.total_usd_cents));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#f8fafc] dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 transition-colors">
      {/* Top App Bar fija y limpia */}
      <header className="shrink-0 z-20 bg-white/95 dark:bg-[#121826]/95 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/80 pt-safe-t px-4 pb-2 shadow-[0_1px_3px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-colors">
        <div className="flex items-center justify-between py-1.5">
          <div className="flex items-center gap-2.5">
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
            <div>
              <span className="text-caption font-bold tracking-widest uppercase text-emerald-700 dark:text-emerald-400 block leading-none mb-0.5">
                Glow Heaven
              </span>
              <h1 className="text-title font-extrabold text-slate-900 dark:text-white leading-tight">
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
      <PullToRefresh onRefresh={() => cargar(true)}>
        <main ref={scrollRevealRef} className="flex flex-col gap-4 px-3.5 pt-3 pb-24 scroll-smooth">
          {error && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-label font-semibold text-rose-700 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => cargar(true)} className="underline text-rose-800">Reintentar</button>
            </div>
          )}

          {/* Tarjeta Hero: Ventas de Hoy (Diseño Prominente y Claro) */}
          <section
            className="scroll-reveal relative overflow-hidden rounded-[24px] p-5 shadow-md shadow-emerald-900/10"
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
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-caption font-bold tracking-wide uppercase text-white backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 animate-pulse" />
                  Ventas de hoy
                </span>
                <span className="text-label font-semibold text-white/90 bg-black/15 px-2 py-0.5 rounded-full">
                  {hoy.ventas_count} {hoy.ventas_count === 1 ? 'venta' : 'ventas'}
                </span>
              </div>

              {/* Solo dólares: esta pantalla es para leer el negocio, no para
                  cobrar. Los córdobas viven donde de verdad se cobra
                  (Cobros y Abonos, catálogo). */}
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <span className="text-caption font-medium text-emerald-100 uppercase tracking-wider block mb-0.5">Total generado</span>
                  <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-white leading-none">
                    {formatearMoneda(hoy.total_usd_cents, 'USD')}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-caption text-emerald-100 block mb-0.5">Ganancia</span>
                  <span className="text-body font-bold text-white tabular-nums bg-white/20 px-2.5 py-1 rounded-lg inline-block">
                    +{formatearMoneda(hoy.ganancia_usd_cents, 'USD')}
                  </span>
                </div>
              </div>

              {/* Botones de acción rápida: Venta Rápida y Registrar Abono */}
              <div className="mt-4 grid grid-cols-2 gap-2">
                {onIrAVenta && (
                  <button
                    type="button"
                    onClick={() => {
                      haptics.impact('medium');
                      onIrAVenta();
                    }}
                    className="m3-press flex items-center justify-center gap-1.5 rounded-xl bg-white h-11 px-3 text-label font-bold text-emerald-900 shadow-md active:scale-95 transition-transform cursor-pointer"
                  >
                    <PlusCircle size={16} className="text-emerald-600" />
                    <span>Venta Rápida</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    haptics.impact('medium');
                    onIrACobranza?.();
                  }}
                  className="m3-press flex items-center justify-center gap-1.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-800 border border-white/20 h-11 px-3 text-label font-bold text-white shadow-md active:scale-95 transition-transform cursor-pointer backdrop-blur-sm"
                >
                  <HandCoins size={16} className="text-emerald-300" />
                  <span>Cobros y Abonos</span>
                </button>
              </div>
            </div>
          </section>

          {/* Tarjetas métricas de Por Cobrar e Inventario (mismo peso visual,
              soloUsd porque acá se lee el negocio, no se cobra) */}
          <section className="scroll-reveal grid grid-cols-2 gap-2.5">
            <div
              onClick={() => {
                haptics.impact('light');
                onIrACobranza?.();
              }}
              className="m3-card p-4 flex flex-col justify-between cursor-pointer hover:border-amber-300 dark:hover:border-amber-500/50 transition-colors active:scale-[0.99]"
            >
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  <p className="text-label font-semibold text-slate-500 dark:text-slate-400">Por cobrar</p>
                </div>
                <MoneyDual usdCents={panel?.resumen.por_cobrar_usd_cents ?? 0} size="md" soloUsd />
              </div>
              <span className="text-caption text-slate-400 dark:text-slate-500 mt-2 font-semibold flex items-center justify-between">
                <span>Gestionar cobros</span>
                <ChevronRight size={13} />
              </span>
            </div>

            <div className="m3-card p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <p className="text-label font-semibold text-slate-500 dark:text-slate-400">Inventario</p>
                </div>
                <MoneyDual usdCents={panel?.resumen.inversion_inventario_usd_cents ?? 0} size="md" soloUsd />
              </div>
              <span className="text-caption text-slate-400 dark:text-slate-500 mt-2 font-semibold">Costo invertido</span>
            </div>
          </section>

          {/* Gráfico 7 días interactivo */}
          <section className="scroll-reveal m3-card p-4">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2 text-body font-bold text-slate-800 dark:text-slate-100">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                  <TrendingUp size={16} />
                </div>
                <span>Ventas últimos 7 días</span>
              </div>
              <span className="text-caption font-semibold text-slate-400 dark:text-slate-500">USD</span>
            </div>

            {/* Detalle flotante si se toca una barra */}
            {diaSeleccionado && (
              <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200/70 dark:border-slate-700 px-3 py-2 text-label animate-m3-fade">
                <span className="font-semibold text-slate-700 dark:text-slate-200 capitalize">
                  {nombreDia(diaSeleccionado.fecha)} {diaSeleccionado.fecha.slice(5)}:
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {formatearMoneda(diaSeleccionado.total_usd_cents, 'USD')} ({diaSeleccionado.cantidad} vtas.)
                </span>
              </div>
            )}

            <div className="flex h-36 items-end justify-between gap-2 pt-1">
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
                    className="group flex flex-1 flex-col items-center gap-2 h-full justify-end cursor-pointer"
                  >
                    {/* Pista de la barra: sin caja ni borde propios cuando no
                        hay venta, para que un día vacío se lea como "no hubo
                        venta" y no como un bloque a medio cargar. */}
                    <div
                      className={`relative w-full max-w-[30px] rounded-lg overflow-hidden transition-all ${
                        estaSeleccionado ? 'ring-2 ring-emerald-500' : ''
                      }`}
                      style={{ height: '84px' }}
                    >
                      {/* Escala con `transform` en vez de animar `height`: el
                          navegador compone la barra sin recalcular layout en
                          cada frame. */}
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '5px',
                          background: tieneVenta
                            ? 'linear-gradient(180deg, #10b981 0%, #059669 100%)'
                            : (isDark ? '#334155' : '#e2e8f0'),
                          transform: `scaleY(${tieneVenta ? Math.max(0.16, porcentaje / 100) : 3 / 84})`,
                          transformOrigin: 'bottom',
                          transition: 'transform 300ms ease-out',
                        }}
                      />
                    </div>
                    <span
                      className="text-label uppercase tracking-tight transition-colors leading-none"
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
                  <h2 className="text-label font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Gestión de Cobranzas
                  </h2>
                </div>

                {cuotasVencidas.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950/80 px-2.5 py-0.5 text-caption font-extrabold text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                    <AlertTriangle size={11} />
                    {cuotasVencidas.length} {cuotasVencidas.length === 1 ? 'vencida' : 'vencidas'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-caption font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/80">
                    {cuentasPorCobrar.length} al día
                  </span>
                )}
              </div>

              {/* Solo dólares: es el resumen para leer, no la pantalla de
                  cobro (esa es Cobros y Abonos). */}
              <div className="flex items-baseline justify-between rounded-xl bg-slate-50 dark:bg-slate-900/50 px-3.5 py-3 border border-slate-100 dark:border-slate-800">
                <span className="text-label font-semibold text-slate-500 dark:text-slate-400">Total en la calle</span>
                <span className="text-title font-black text-slate-900 dark:text-white tabular-nums">
                  {formatearMoneda(totalPorCobrarUsd, 'USD')}
                </span>
              </div>

              {onIrACobranza && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    onIrACobranza();
                  }}
                  className="m3-press w-full flex items-center justify-between px-3.5 py-3 rounded-xl bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-200 text-label font-bold transition-all cursor-pointer border border-slate-200/50 dark:border-slate-700/50"
                >
                  <span>Ver listado y registrar abonos ({cuentasPorCobrar.length})</span>
                  <ChevronRight size={16} className="text-slate-400" />
                </button>
              )}
            </section>
          )}

          {/* Stock crítico */}
          {(panel?.bajo_stock.length ?? 0) > 0 && (
            <section className="scroll-reveal flex flex-col gap-1.5">
              <h2 className="flex items-center gap-1 text-caption font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                <PackageX size={13} />
                Stock crítico ({panel!.bajo_stock.length})
              </h2>
              <div className="m3-card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 rounded-xl">
                {panel!.bajo_stock.slice(0, 6).map((p) => (
                  <div key={p.producto_id} className="flex items-center justify-between px-3.5 py-2.5">
                    <p className="truncate text-body font-semibold text-slate-800 dark:text-slate-200">{p.nombre}</p>
                    <span className="shrink-0 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 px-2 py-0.5 text-caption font-bold text-amber-700 dark:text-amber-400 ml-2">
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
              <h2 className="flex items-center gap-1 text-caption font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                <Clock3 size={13} />
                Encargos pendientes ({encargos.length})
              </h2>
              <div className="m3-card overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 rounded-xl">
                {encargos.slice(0, 6).map((e) => (
                  <div key={e.id} className="flex items-center justify-between px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-body font-bold text-slate-800 dark:text-slate-200">{e.cliente_nombre}</p>
                      <p className="text-caption text-slate-400 dark:text-slate-500 font-medium">{e.codigo}</p>
                    </div>
                    <span className="text-label font-bold text-slate-800 dark:text-slate-200 tabular-nums shrink-0 ml-2">
                      {formatearMoneda(e.saldo_usd_cents, 'USD')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </PullToRefresh>

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
