import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HandCoins,
  Search,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  MessageCircle,
  Clock3,
  X,
  UserCheck,
  RefreshCw,
  PlusCircle,
  ChevronRight,
} from 'lucide-react';
import { formatearMoneda } from '@core/moneda';
import type { FilaPorCobrar } from '@shared/types';
import {
  obtenerDatosDashboard,
  invalidarCacheDashboard,
  cacheDashboardGlobal,
} from '../lib/panel-movil';
import { linkWhatsapp } from '../lib/util';
import { useDatosNegocio } from '../context/DataContext';
import { PullToRefresh } from '../components/PullToRefresh';
import { AbonoModalSheet, type VentaCobroItem } from '../components/AbonoModalSheet';
import { AbonoSelectorSheet } from '../components/AbonoSelectorSheet';
import { KardexClienteSheet, type ClienteKardexInfo } from '../components/KardexClienteSheet';
import { haptics } from '../lib/haptics';
import { useScrollReveal } from '../lib/useScrollReveal';

export function CobranzaView() {
  const { parametros } = useDatosNegocio();
  const tasa = parametros?.tasa_cambio_cents ?? 3662;

  const [cuentas, setCuentas] = useState<FilaPorCobrar[]>(cacheDashboardGlobal.panel?.por_cobrar ?? []);
  const [cargando, setCargando] = useState(!cacheDashboardGlobal.panel);
  const [error, setError] = useState<string | null>(null);

  // Filtros y búsqueda
  const [filtro, setFiltro] = useState<'todas' | 'vencidas' | 'al_dia'>('todas');
  const [busqueda, setBusqueda] = useState('');

  // Modales y Sheets
  const [sheetAbonoSelectorAbierto, setSheetAbonoSelectorAbierto] = useState(false);
  const [ventaParaCobrar, setVentaParaCobrar] = useState<VentaCobroItem | null>(null);
  const [clienteParaKardex, setClienteParaKardex] = useState<ClienteKardexInfo | null>(null);

  const cargar = useCallback(async (forzar = false) => {
    if (forzar) {
      invalidarCacheDashboard();
    }
    setCargando(true);
    setError(null);
    try {
      const data = await obtenerDatosDashboard(forzar);
      setCuentas(data.panel?.por_cobrar ?? []);
    } catch (err) {
      console.error('[CobranzaView] Error al cargar cuentas por cobrar:', err);
      setError('No se pudieron sincronizar las cuentas por cobrar.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(false);
  }, [cargar]);

  // Cálculos consolidados
  const totalPorCobrarUsd = useMemo(
    () => cuentas.reduce((acc, c) => acc + (c.saldo_usd_cents || 0), 0),
    [cuentas]
  );
  const totalPorCobrarCor = Math.round((totalPorCobrarUsd * tasa) / 100);

  const cuentasVencidas = useMemo(
    () => cuentas.filter((c) => c.cuotas_vencidas > 0),
    [cuentas]
  );
  const cuentasAlDia = useMemo(
    () => cuentas.filter((c) => c.cuotas_vencidas === 0),
    [cuentas]
  );

  // Filtrado por tab y texto
  const cuentasFiltradas = useMemo(() => {
    let res = cuentas;
    if (filtro === 'vencidas') res = cuentasVencidas;
    if (filtro === 'al_dia') res = cuentasAlDia;

    const q = busqueda.trim().toLowerCase();
    if (q) {
      res = res.filter(
        (c) =>
          c.cliente_nombre.toLowerCase().includes(q) ||
          c.codigo.toLowerCase().includes(q) ||
          (c.cliente_telefono || '').includes(q)
      );
    }
    return res;
  }, [cuentas, filtro, busqueda, cuentasVencidas, cuentasAlDia]);

  const scrollRevealRef = useScrollReveal<HTMLElement>({ deps: [cuentasFiltradas] });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-fondo text-texto transition-colors">
      {/* Top App Bar fija */}
      <header className="shrink-0 z-20 bg-superficie/95 backdrop-blur-md border-b border-borde pt-safe-t px-4 pb-2 shadow-m3-1 transition-colors">
        <div className="flex items-center justify-between gap-2 py-1.5">
          {/* Mismo molde que las otras 3 pantallas: ícono + "Glow Heaven" +
              título en una sola línea. Antes esta pantalla era la única sin
              el eyebrow de marca, y repetía el conteo de cuentas dos veces
              (aquí y en el tab "Todas" de abajo) — se quitó la duplicación. */}
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-alerta-suave text-alerta border border-alerta-suave">
              <HandCoins size={18} />
            </span>
            <div className="min-w-0">
              <span className="text-caption font-bold tracking-widest uppercase text-acento block leading-none mb-0.5">
                Glow Heaven
              </span>
              <h1 className="text-title font-extrabold text-texto leading-tight truncate">
                Cobranza y Abonos
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                cargar(true);
              }}
              disabled={cargando}
              aria-label="Refrescar cuentas"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-superficie-2/90 text-texto-2 hover:bg-superficie-2 active:scale-95 transition-all border border-borde cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={15} className={cargando ? 'animate-spin text-acento' : ''} />
            </button>
          </div>
        </div>

        {/* Buscador Rápido de Clientas */}
        <div className="relative mt-2">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-3 pointer-events-none" />
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, venta o teléfono…"
            className="w-full h-10 pl-9 pr-9 rounded-xl bg-superficie-2 border border-borde text-xs font-semibold text-texto placeholder:text-texto-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-texto-3 hover:text-texto-2 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filtros en chips compactos consistentes con el catálogo */}
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto sin-scrollbar py-0.5">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setFiltro('todas');
            }}
            className={`m3-press shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              filtro === 'todas'
                ? 'bg-acento text-white shadow-xs ring-1 ring-acento'
                : 'bg-superficie-2 text-texto-2 hover:bg-superficie-3 border border-borde'
            }`}
          >
            <span>Todas</span>
            <span
              className={`text-[10px] py-0.2 px-1.5 rounded-full font-semibold ${
                filtro === 'todas'
                  ? 'bg-white/20 text-white'
                  : 'bg-superficie-3 text-texto-2'
              }`}
            >
              {cuentas.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setFiltro('vencidas');
            }}
            className={`m3-press shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              filtro === 'vencidas'
                ? 'bg-peligro text-peligro-texto shadow-xs'
                : cuentasVencidas.length > 0
                ? 'bg-peligro-suave text-peligro border border-peligro-suave'
                : 'bg-superficie-2 text-texto-2 hover:bg-superficie-3 border border-borde'
            }`}
          >
            <span>Vencidas</span>
            {cuentasVencidas.length > 0 && (
              <span
                className={`text-[10px] py-0.2 px-1.5 rounded-full font-bold ${
                  filtro === 'vencidas'
                    ? 'bg-white/20 text-white'
                    : 'bg-peligro-suave text-peligro'
                }`}
              >
                {cuentasVencidas.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setFiltro('al_dia');
            }}
            className={`m3-press shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              filtro === 'al_dia'
                ? 'bg-acento text-white shadow-xs ring-1 ring-acento'
                : 'bg-superficie-2 text-texto-2 hover:bg-superficie-3 border border-borde'
            }`}
          >
            <span>Al día</span>
            <span
              className={`text-[10px] py-0.2 px-1.5 rounded-full font-semibold ${
                filtro === 'al_dia'
                  ? 'bg-white/20 text-white'
                  : 'bg-superficie-3 text-texto-2'
              }`}
            >
              {cuentasAlDia.length}
            </span>
          </button>
        </div>
      </header>

      {/* Contenido con Pull-To-Refresh y Smooth Scroll */}
      <PullToRefresh onRefresh={() => cargar(true)}>
        <main ref={scrollRevealRef} className="flex flex-col gap-3 px-3.5 pt-3 pb-24 scroll-smooth">
          {error && (
            <div className="rounded-2xl bg-rose-50 border border-peligro-suave px-4 py-3 text-xs font-semibold text-peligro flex items-center justify-between">
              <span>{error}</span>
              <button onClick={() => cargar(true)} className="underline text-peligro">Reintentar</button>
            </div>
          )}

          {/* Tarjeta Hero de Cobranza: Resumen Financiero Consolidado */}
          <section
            className="scroll-reveal relative overflow-hidden rounded-[24px] p-4 shadow-md shadow-amber-900/10 text-white"
            style={{
              background: 'linear-gradient(135deg, #b45309 0%, #92400e 55%, #78350f 100%)',
            }}
          >
            {/* Esferas de luz sutil */}
            <div className="absolute -right-6 -bottom-6 h-32 w-32 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <div className="absolute left-1/3 -top-8 h-20 w-20 rounded-full bg-amber-400/20 blur-lg pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-caption font-bold tracking-wide uppercase text-white backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse" />
                  Total por cobrar en la calle
                </span>
                {cuentasVencidas.length > 0 && (
                  <span className="text-caption bg-red-500/90 text-white font-black px-2 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {cuentasVencidas.length} vencidas
                  </span>
                )}
              </div>

              <div className="mt-2.5 flex items-baseline justify-between gap-2">
                <div>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl sm:text-3xl font-black tracking-tight tabular-nums text-white leading-none">
                      {formatearMoneda(totalPorCobrarUsd, 'USD')}
                    </p>
                    <span className="text-xs font-semibold text-alerta-fuerte tabular-nums">
                      ≈ {formatearMoneda(totalPorCobrarCor, 'COR')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botón Acción Principal: Registrar Abono */}
              <div className="mt-3.5">
                <button
                  type="button"
                  onClick={() => {
                    haptics.impact('medium');
                    setSheetAbonoSelectorAbierto(true);
                  }}
                  className="w-full m3-press flex items-center justify-center gap-2 rounded-xl bg-white h-11 px-4 text-body font-bold text-alerta shadow-md active:scale-95 transition-transform cursor-pointer"
                >
                  <PlusCircle size={16} className="text-alerta" />
                  <span>Registrar nuevo abono a clienta</span>
                </button>
              </div>
            </div>
          </section>

          {/* Lista de Cuentas por Cobrar */}
          {cargando && cuentas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-texto-3">
              <div className="h-8 w-8 rounded-full border-2 border-alerta-suave border-t-transparent animate-spin" />
              <p className="text-xs font-medium">Sincronizando cuentas por cobrar…</p>
            </div>
          ) : cuentasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-superficie rounded-2xl border border-borde text-center shadow-xs">
              <div className="w-12 h-12 rounded-full bg-acento-suave text-acento flex items-center justify-center mb-2.5">
                <CheckCircle2 size={24} />
              </div>
              <p className="text-sm font-bold text-texto">
                {busqueda ? 'Sin coincidencias' : '¡Excelente! Sin cuentas en este filtro'}
              </p>
              <p className="text-xs text-texto-3 mt-1 max-w-xs">
                {busqueda
                  ? `No se encontró ninguna clienta o venta con "${busqueda}".`
                  : 'Todas las cuentas están al día o no hay saldos pendientes en esta sección.'}
              </p>
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="mt-3 text-xs font-bold text-acento underline"
                >
                  Limpiar búsqueda
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {cuentasFiltradas.map((f) => {
                const vencida = f.cuotas_vencidas > 0;
                const saldoCor = Math.round((f.saldo_usd_cents * tasa) / 100);
                const inicial = (f.cliente_nombre || 'C').charAt(0).toUpperCase();
                const totalVenta = f.total_usd_cents || 1;
                const pagado = f.pagado_usd_cents || 0;
                const porcentaje = Math.min(100, Math.max(0, Math.round((pagado / totalVenta) * 100)));

                return (
                  <div
                    key={f.venta_id}
                    className={`scroll-reveal flex flex-col gap-2.5 rounded-2xl border p-3.5 shadow-xs transition-all ${
                      vencida
                        ? 'border-peligro-suave bg-peligro-suave'
                        : 'border-borde bg-white  hover:border-borde'
                    }`}
                  >
                    {/* Fila 1: Avatar + Nombre + Referencia + Badge de estado */}
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setClienteParaKardex({
                            cliente_id: f.cliente_id,
                            cliente_nombre: f.cliente_nombre,
                            cliente_telefono: f.cliente_telefono,
                            saldo_usd_cents: f.saldo_usd_cents,
                            venta_id: f.venta_id,
                            codigo: f.codigo,
                          });
                        }}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group"
                        title="Ver historial de abonos (Kardex)"
                      >
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-black shrink-0 border ${
                            vencida
                              ? 'bg-peligro-suave text-peligro-fuerte border-peligro-suave'
                              : 'bg-acento-suave text-acento-fuerte border-acento-suave'
                          }`}
                        >
                          {inicial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2 className="text-body font-bold text-texto truncate leading-tight group-hover:text-acento transition-colors">
                            {f.cliente_nombre}
                          </h2>
                          <p className="text-caption text-texto-3 font-medium truncate mt-0.5 flex items-center gap-1">
                            <span>{f.codigo} · {f.fecha}</span>
                            <span className="text-acento font-semibold underline">· Kardex</span>
                          </p>
                        </div>
                      </button>

                      {/* Badge de vencimiento o al día */}
                      {vencida ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-peligro-suave px-2.5 py-0.5 text-caption font-extrabold text-peligro shrink-0 border border-peligro-suave">
                          <AlertTriangle size={11} />
                          {f.cuotas_vencidas} {f.cuotas_vencidas === 1 ? 'vencida' : 'vencidas'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-acento-suave px-2.5 py-0.5 text-caption font-bold text-acento shrink-0 border border-acento-suave">
                          Al día
                        </span>
                      )}
                    </div>

                    {/* Fila 2: Saldo pendiente destacado */}
                    <div className="flex items-baseline justify-between px-3 py-2 rounded-xl bg-superficie-2 border border-borde">
                      <div>
                        <span className="text-caption font-bold uppercase tracking-wider text-texto-3 block">
                          Saldo pendiente
                        </span>
                        <span className="text-caption text-texto-3 font-medium">
                          Pagado: {porcentaje}% de {formatearMoneda(f.total_usd_cents, 'USD')}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-black text-texto tabular-nums">
                          {formatearMoneda(f.saldo_usd_cents, 'USD')}
                        </span>
                        <span className="text-xs font-semibold text-texto-3 ml-1.5 block">
                          ≈ {formatearMoneda(saldoCor, 'COR')}
                        </span>
                      </div>
                    </div>

                    {/* Barra de progreso de pago */}
                    <div className="w-full bg-superficie-2 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          vencida ? 'bg-rose-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${porcentaje}%` }}
                      />
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
                        className={`m3-press flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl border text-label font-bold transition-all shrink-0 ${
                          f.cliente_telefono
                            ? 'bg-acento-suave text-acento-fuerte border-acento-suave hover:bg-acento-suave active:scale-95'
                            : 'bg-superficie-2 text-texto-3 border-borde-2 pointer-events-none'
                        }`}
                      >
                        <MessageCircle size={15} className="shrink-0" />
                        <span>WhatsApp</span>
                      </a>

                      {/* Botón Kardex / Historial */}
                      <button
                        type="button"
                        onClick={() => {
                          haptics.impact('light');
                          setClienteParaKardex({
                            cliente_id: f.cliente_id,
                            cliente_nombre: f.cliente_nombre,
                            cliente_telefono: f.cliente_telefono,
                            saldo_usd_cents: f.saldo_usd_cents,
                            venta_id: f.venta_id,
                            codigo: f.codigo,
                          });
                        }}
                        className="m3-press flex items-center justify-center gap-1 h-10 px-2.5 rounded-xl border border-borde bg-superficie-2 text-texto-2 text-label font-bold hover:bg-superficie-2 active:scale-95 transition-all cursor-pointer shrink-0"
                        title="Ver historial de abonos"
                      >
                        <Clock3 size={14} className="shrink-0" />
                        <span>Kardex</span>
                      </button>

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
                        className="m3-press flex-1 flex items-center justify-center gap-1.5 h-10 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-label font-extrabold shadow-sm active:scale-95 transition-all cursor-pointer min-w-0"
                        aria-label={`Registrar abono de ${f.cliente_nombre}`}
                      >
                        <DollarSign size={15} className="shrink-0" />
                        <span className="truncate">Abonar</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </PullToRefresh>

      {/* Selector de Abono (buscar clienta o venta) */}
      <AbonoSelectorSheet
        abierto={sheetAbonoSelectorAbierto}
        onCerrar={() => setSheetAbonoSelectorAbierto(false)}
        cuentasPorCobrar={cuentas}
        onSeleccionarVenta={(v) => {
          setVentaParaCobrar(v);
        }}
      />

      {/* Modal Bottom Sheet de Abono / Cobro */}
      <AbonoModalSheet
        venta={ventaParaCobrar}
        onCerrar={() => setVentaParaCobrar(null)}
        onAbonoRegistrado={() => {
          // Actualización optimista local
          if (ventaParaCobrar) {
            setCuentas((prev) => prev.filter((c) => c.venta_id !== ventaParaCobrar.venta_id));
            invalidarCacheDashboard();
          }
          cargar(true);
        }}
      />

      {/* Modal Bottom Sheet de Kardex de Abonos del Cliente */}
      <KardexClienteSheet
        cliente={clienteParaKardex}
        abierto={Boolean(clienteParaKardex)}
        onCerrar={() => setClienteParaKardex(null)}
        onAbonar={(v) => {
          setVentaParaCobrar(v);
        }}
      />
    </div>
  );
}
