import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  MessageCircle,
  AlertTriangle,
  PackageX,
  Clock3,
  LogOut,
  TrendingUp,
  DollarSign,
  PlusCircle,
  ChevronRight,
  HandCoins,
  CheckCircle2,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { PanelRepoFirestore } from '@repos/panel.repo';
import type { PanelData } from '@shared/types';
import { formatearMoneda } from '@core/moneda';
import {
  cargarTendenciaDiaria,
  cargarEncargosPendientes,
  type DiaVentas,
  type ResumenHoy,
  type EncargoPendiente,
} from '../lib/panel-movil';
import { linkWhatsapp } from '../lib/util';
import { MoneyDual } from '../components/MoneyDual';
import { useAuth } from '../context/AuthContext';
import { useDatosNegocio } from '../context/DataContext';
import { useTheme } from '../context/ThemeContext';
import { PullToRefresh } from '../components/PullToRefresh';
import { AbonoModalSheet, type VentaCobroItem } from '../components/AbonoModalSheet';
import { AbonoSelectorSheet } from '../components/AbonoSelectorSheet';
import { haptics } from '../lib/haptics';

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function nombreDia(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return DIAS_CORTOS[d.getDay()];
}

// Caché en memoria para carga instantánea (<50ms) al alternar pestañas
let cacheDashboard: {
  panel: PanelData | null;
  serie: DiaVentas[];
  hoy: ResumenHoy;
  encargos: EncargoPendiente[];
  tiempo: number;
} = {
  panel: null,
  serie: [],
  hoy: { total_usd_cents: 0, ganancia_usd_cents: 0, ventas_count: 0 },
  encargos: [],
  tiempo: 0,
};

export function DashboardView({ onIrAVenta }: { onIrAVenta?: () => void }) {
  const { usuario, salir } = useAuth();
  const { parametros } = useDatosNegocio();
  const { theme, effectiveTheme, toggleTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const tasa = parametros?.tasa_cambio_cents ?? 3662;

  const [panel, setPanel] = useState<PanelData | null>(cacheDashboard.panel);
  const [serie, setSerie] = useState<DiaVentas[]>(cacheDashboard.serie);
  const [hoy, setHoy] = useState<ResumenHoy>(cacheDashboard.hoy);
  const [encargos, setEncargos] = useState<EncargoPendiente[]>(cacheDashboard.encargos);
  const [cargando, setCargando] = useState(!cacheDashboard.panel);
  const [error, setError] = useState<string | null>(null);

  // Día seleccionado en el gráfico para ver el detalle
  const [diaSeleccionado, setDiaSeleccionado] = useState<DiaVentas | null>(null);

  // Estados para Abonos y Cobros
  const [sheetAbonoSelectorAbierto, setSheetAbonoSelectorAbierto] = useState(false);
  const [ventaParaCobrar, setVentaParaCobrar] = useState<VentaCobroItem | null>(null);
  const [filtroCobro, setFiltroCobro] = useState<'todas' | 'vencidas'>('todas');

  const cargar = useCallback(async (forzar = false) => {
    const ahora = Date.now();
    // Usar datos en caché si existen y tienen menos de 45 segundos, salvo que se fuerce
    if (!forzar && cacheDashboard.panel && ahora - cacheDashboard.tiempo < 45000) {
      return;
    }

    if (!cacheDashboard.panel) {
      setCargando(true);
    }
    setError(null);
    try {
      const [panelData, tendencia, encargosPendientes] = await Promise.all([
        PanelRepoFirestore.cargar(),
        cargarTendenciaDiaria(7),
        cargarEncargosPendientes(),
      ]);
      cacheDashboard = {
        panel: panelData,
        serie: tendencia.serie,
        hoy: tendencia.hoy,
        encargos: encargosPendientes,
        tiempo: Date.now(),
      };
      setPanel(panelData);
      setSerie(tendencia.serie);
      setHoy(tendencia.hoy);
      setEncargos(encargosPendientes);
    } catch (err) {
      console.error('[DashboardView] Error cargando el panel:', err);
      if (!cacheDashboard.panel) {
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
  const cuentasAMostrar = filtroCobro === 'vencidas' ? cuotasVencidas : cuentasPorCobrar;
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
              className="m3-press flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 transition-all border border-slate-200/50 dark:border-slate-700/60 cursor-pointer"
            >
              {theme === 'system' ? (
                <Monitor size={16} className="text-slate-500 dark:text-slate-400" />
              ) : effectiveTheme === 'dark' ? (
                <Moon size={16} className="text-emerald-400" />
              ) : (
                <Sun size={16} className="text-amber-500" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                haptics.selection();
                cargar(true);
              }}
              aria-label="Actualizar datos"
              className="m3-press flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-90 transition-all border border-slate-200/50 dark:border-slate-700/60 cursor-pointer"
            >
              <RefreshCw size={16} className={cargando ? 'animate-spin text-emerald-600 dark:text-emerald-400' : ''} />
            </button>
            <button
              type="button"
              onClick={() => {
                haptics.impact('light');
                salir();
              }}
              aria-label="Cerrar sesión"
              className="m3-press flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100/90 dark:bg-slate-800/90 text-slate-400 dark:text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 active:scale-90 transition-all border border-slate-200/50 dark:border-slate-700/60 cursor-pointer"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Contenido con Pull-to-Refresh nativo */}
      <PullToRefresh onRefresh={() => cargar(true)}>
        <main className="flex flex-col gap-3 px-3.5 pt-2.5 pb-40">
          {error && (
            <div className="rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs font-semibold text-rose-700 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => cargar(true)} className="underline text-rose-800">Reintentar</button>
            </div>
          )}

          {/* Tarjeta Hero: Ventas de Hoy (Diseño Prominente y Claro) */}
          <section
            className="relative overflow-hidden rounded-[24px] p-4 shadow-md shadow-emerald-900/10"
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
                    setSheetAbonoSelectorAbierto(true);
                  }}
                  className="m3-press flex items-center justify-center gap-1.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-800 border border-white/20 h-10 px-3 text-xs font-bold text-white shadow-md active:scale-95 transition-transform cursor-pointer backdrop-blur-sm"
                >
                  <HandCoins size={15} className="text-emerald-300" />
                  <span>Registrar Abono</span>
                </button>
              </div>
            </div>
          </section>

          {/* Tarjetas métricas de Por Cobrar e Inventario */}
          <section className="grid grid-cols-2 gap-2.5">
            <div
              onClick={() => {
                haptics.impact('light');
                setSheetAbonoSelectorAbierto(true);
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
                    Abonar
                  </span>
                </div>
                <MoneyDual usdCents={panel?.resumen.por_cobrar_usd_cents ?? 0} size="sm" />
              </div>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium">Toca para abonar</span>
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
          <section className="m3-card p-4">
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

          {/* Cuentas por Cobrar / Abonos de Clientes */}
          {cuentasPorCobrar.length > 0 && (
            <section className="flex flex-col gap-3">
              {/* Encabezado con balance total y título sin colisión horizontal */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 shrink-0">
                      <HandCoins size={14} />
                    </span>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 truncate">
                      Cuentas por Cobrar
                    </h2>
                  </div>

                  {/* Total general acumulado por cobrar */}
                  <div className="text-right shrink-0">
                    <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">
                      {formatearMoneda(totalPorCobrarUsd, 'USD')}
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium ml-1">
                      (≈ {formatearMoneda(totalPorCobrarCor, 'COR')})
                    </span>
                  </div>
                </div>

                {/* Filtro Segmentado: Todas / Vencidas con ancho completo y objetivos táctiles cómodos */}
                <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100/90 dark:bg-slate-900/90 border border-slate-200/70 dark:border-slate-800 text-xs font-bold gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setFiltroCobro('todas');
                    }}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition-all cursor-pointer ${
                      filtroCobro === 'todas'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-extrabold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-semibold'
                    }`}
                  >
                    <span>Todas</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        filtroCobro === 'todas'
                          ? 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                          : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {cuentasPorCobrar.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setFiltroCobro('vencidas');
                    }}
                    className={`flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg transition-all cursor-pointer ${
                      filtroCobro === 'vencidas'
                        ? 'bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-400 shadow-xs font-extrabold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-semibold'
                    }`}
                  >
                    <span>Vencidas</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        filtroCobro === 'vencidas'
                          ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-400'
                          : cuotasVencidas.length > 0
                            ? 'bg-rose-500 text-white'
                            : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {cuotasVencidas.length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Lista de deudores */}
              <div className="flex flex-col gap-2.5">
                {cuentasAMostrar.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 px-4 bg-white dark:bg-[#161f30] rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center shadow-xs">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
                      <CheckCircle2 size={20} />
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100">¡Al día! No hay cuentas vencidas</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Todas tus cuentas al crédito están dentro de su plazo acordado.
                    </p>
                  </div>
                ) : (
                  cuentasAMostrar.map((f) => {
                    const vencida = f.cuotas_vencidas > 0;
                    const saldoCor = Math.round((f.saldo_usd_cents * tasa) / 100);
                    const inicial = (f.cliente_nombre || 'C').charAt(0).toUpperCase();

                    return (
                      <div
                        key={f.venta_id}
                        className={`flex flex-col gap-2.5 rounded-2xl border p-3.5 shadow-xs transition-all ${
                          vencida
                            ? 'border-rose-300/80 bg-rose-50/40 dark:border-rose-900/60 dark:bg-rose-950/20'
                            : 'border-slate-200/90 bg-white dark:border-slate-800 dark:bg-[#161f30] hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        {/* Fila 1: Avatar + Nombre + Referencia + Badge de estado */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0 border ${
                                vencida
                                  ? 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/80 dark:text-rose-300 dark:border-rose-800'
                                  : 'bg-emerald-100/90 text-emerald-800 border-emerald-200/70 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800'
                              }`}
                            >
                              {inicial}
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate leading-tight">
                                {f.cliente_nombre}
                              </h3>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate mt-0.5">
                                {f.codigo} · {f.fecha}
                              </p>
                            </div>
                          </div>

                          {/* Badge de vencimiento o al día */}
                          {vencida ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950/80 px-2.5 py-0.5 text-[10px] font-extrabold text-rose-700 dark:text-rose-400 shrink-0 border border-rose-200 dark:border-rose-800">
                              <AlertTriangle size={11} />
                              {f.cuotas_vencidas} {f.cuotas_vencidas === 1 ? 'vencida' : 'vencidas'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 shrink-0 border border-emerald-200/60 dark:border-emerald-800/80">
                              Al día
                            </span>
                          )}
                        </div>

                        {/* Fila 2: Saldo pendiente destacado */}
                        <div className="flex items-baseline justify-between px-3 py-2 rounded-xl bg-slate-50/90 border border-slate-100/90 dark:bg-slate-900/60 dark:border-slate-800/80">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Saldo pendiente
                          </span>
                          <div className="text-right">
                            <span className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                              {formatearMoneda(f.saldo_usd_cents, 'USD')}
                            </span>
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 ml-1.5">
                              (≈ {formatearMoneda(saldoCor, 'COR')})
                            </span>
                          </div>
                        </div>

                        {/* Fila 3: Botones de acción cómodos */}
                        <div className="flex items-center gap-2 pt-0.5">
                          {/* Botón WhatsApp */}
                          <a
                            href={
                              linkWhatsapp(
                                f.cliente_telefono,
                                `Hola ${f.cliente_nombre}, te escribo de Glow Heaven por tu saldo pendiente de ${formatearMoneda(
                                  f.saldo_usd_cents,
                                  'USD'
                                )} (≈ ${formatearMoneda(
                                  saldoCor,
                                  'COR'
                                )}) de la venta ${f.codigo}. ¿Cuándo podés completar el pago? Muchas gracias.`
                              ) ?? undefined
                            }
                            onClick={() => haptics.impact('light')}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Escribir a ${f.cliente_nombre} por WhatsApp`}
                            className={`m3-press flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl border text-xs font-bold transition-all ${
                              f.cliente_telefono
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/80 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 active:scale-98'
                                : 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-900/40 dark:text-slate-600 dark:border-slate-800 pointer-events-none'
                            }`}
                          >
                            <MessageCircle size={15} />
                            <span>WhatsApp</span>
                          </a>

                          {/* Botón Abonar */}
                          <button
                            type="button"
                            onClick={() => {
                              haptics.impact('medium');
                              setVentaParaCobrar({
                                venta_id: f.venta_id,
                                codigo: f.codigo,
                                cliente_nombre: f.cliente_nombre,
                                cliente_telefono: f.cliente_telefono,
                                saldo_usd_cents: f.saldo_usd_cents,
                              });
                            }}
                            className="m3-press flex-1 flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm active:scale-98 transition-all cursor-pointer"
                            aria-label={`Registrar abono de ${f.cliente_nombre}`}
                          >
                            <DollarSign size={15} />
                            <span>Abonar</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}


          {/* Stock crítico */}
          {(panel?.bajo_stock.length ?? 0) > 0 && (
            <section className="flex flex-col gap-1.5">
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
            <section className="flex flex-col gap-1.5">
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

      {/* Selector de Abono (buscar clienta o venta) */}
      <AbonoSelectorSheet
        abierto={sheetAbonoSelectorAbierto}
        onCerrar={() => setSheetAbonoSelectorAbierto(false)}
        cuentasPorCobrar={cuentasPorCobrar}
        onSeleccionarVenta={(v) => {
          setVentaParaCobrar(v);
        }}
      />

      {/* Modal Bottom Sheet de Abono / Cobro */}
      <AbonoModalSheet
        venta={ventaParaCobrar}
        onCerrar={() => setVentaParaCobrar(null)}
        onAbonoRegistrado={() => {
          // Optimistic local update
          if (ventaParaCobrar && cacheDashboard.panel) {
            cacheDashboard.panel.por_cobrar = cacheDashboard.panel.por_cobrar.filter(
              (c) => c.venta_id !== ventaParaCobrar.venta_id
            );
          }
          cargar(true);
        }}
      />
    </div>
  );
}
