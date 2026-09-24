import { useCallback, useEffect, useState } from 'react';
import {
  RefreshCw,
  PackageX,
  Settings,
  TrendingUp,
  PlusCircle,
  ChevronRight,
  HandCoins,
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
import { useDatosNegocio } from '../context/DataContext';
import { PullToRefresh } from '../components/PullToRefresh';
import { haptics } from '../lib/haptics';

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function nombreDia(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return DIAS_CORTOS[d.getDay()];
}

export function DashboardView({
  onIrAAjustes,
  onIrAActividad,
  onIrAVenta,
  onIrACobranza,
  onIrAInventario,
}: {
  onIrAAjustes?: () => void;
  onIrAActividad?: () => void;
  onIrAVenta?: () => void;
  onIrACobranza?: () => void;
  onIrAInventario?: () => void;
}) {
  const { usuario } = useAuth();
  const { version } = useDatosNegocio();

  const [panel, setPanel] = useState<PanelData | null>(cacheDashboardGlobal.panel);
  const [serie, setSerie] = useState<DiaVentas[]>(cacheDashboardGlobal.serie);
  const [hoy, setHoy] = useState<ResumenHoy>(cacheDashboardGlobal.hoy);
  const [cargando, setCargando] = useState(!cacheDashboardGlobal.panel);
  const [error, setError] = useState<string | null>(null);

  // Día seleccionado en el gráfico para ver el detalle
  const [diaSeleccionado, setDiaSeleccionado] = useState<DiaVentas | null>(null);
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

  // `version` sube con cada venta, abono o ajuste hecho en cualquier pestaña.
  // Las cuatro vistas viven montadas a la vez, así que sin esto el efecto
  // corría una sola vez en toda la sesión y el panel quedaba congelado.
  useEffect(() => {
    cargar(version > 0);
  }, [cargar, version]);

  const cuentasPorCobrar = panel?.por_cobrar ?? [];
  const cuotasVencidas = cuentasPorCobrar.filter((f) => f.cuotas_vencidas > 0);
  const maxSerie = Math.max(1, ...serie.map((d) => d.total_usd_cents));

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-fondo text-texto transition-colors">
      {/* Top App Bar fija y limpia */}
      <header className="shrink-0 z-20 bg-superficie/95 backdrop-blur-md border-b border-borde pt-safe-t px-4 pb-2 shadow-m3-1 transition-colors">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            {/* Avatar: mismo tamaño (36px) que el ícono de sección de las
                otras 3 pantallas, redondo en vez de cuadrado porque es una
                persona, no una categoría — para que el encabezado se sienta
                de la misma familia sin perder la identidad de "inicio". */}
            <div
              className="relative shrink-0 overflow-hidden rounded-full border border-borde shadow-xs"
              style={{ width: '36px', height: '36px', minWidth: '36px', minHeight: '36px' }}
            >
              {usuario?.photoURL ? (
                <img
                  src={usuario.photoURL}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-superficie-2 text-texto-2 font-extrabold text-xs">
                  {(usuario?.displayName || usuario?.email || 'G').charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <span className="text-caption font-bold tracking-widest uppercase text-texto-3 block leading-none mb-0.5">
                Glow Heaven
              </span>
              <h1 className="text-title font-extrabold text-texto leading-tight truncate">
                {usuario?.displayName?.split(' ')[0] || 'Mi Negocio'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* El tema y "cerrar sesión" vivían acá apretados. Ahora tienen
                su lugar en Ajustes, y el encabezado queda para lo del día:
                actualizar los datos. */}
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                cargar(true);
              }}
              aria-label="Actualizar datos"
              className="m3-press group flex h-9 w-9 items-center justify-center rounded-xl border border-borde bg-superficie-2/90 text-texto-2 active:scale-90 transition-[background-color,color,transform] duration-150 ease-out cursor-pointer"
            >
              <RefreshCw size={16} className={cargando ? 'animate-spin text-texto-2' : 'transition-transform duration-200 group-hover:rotate-180'} />
            </button>

            <button
              type="button"
              onClick={() => {
                haptics.selection();
                onIrAAjustes?.();
              }}
              aria-label="Ajustes"
              className="m3-press flex h-9 w-9 items-center justify-center rounded-xl border border-borde bg-superficie-2/90 text-texto-2 active:scale-90 transition-[background-color,color,transform] duration-150 ease-out cursor-pointer"
            >
              <Settings size={16} />
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
            <div className="rounded-xl bg-peligro-suave border border-peligro-suave px-3.5 py-2 text-caption sm:text-label font-semibold text-peligro flex items-center justify-between shrink-0">
              <span>{error}</span>
              <button onClick={() => cargar(true)} className="underline text-peligro">Reintentar</button>
            </div>
          )}

          {/* Tarjeta destacada del día.
              Antes era una losa de verde saturado a todo lo ancho. En tema
              claro pasaba, pero en oscuro un bloque de color a máxima
              saturación se come la pantalla y deja al número —que es el dato
              que importa— compitiendo contra su propio fondo.
              Ahora es una superficie normal con un resplandor verde suave en
              una esquina: el color de marca sigue ahí, pero el héroe es la
              cifra. Es lo que hacen los paneles de referencia. */}
          <section
            className="relative overflow-hidden rounded-[20px] border border-acento/30 bg-superficie p-3.5 sm:p-4 shadow-m3-2 shrink-0 flex flex-col justify-between"
            style={{
              // El degradado sale de los tokens, así que se adapta al tema en
              // vez de ser un color quemado. Se ve, pero no tapa: el número
              // sigue leyéndose contra la superficie, no contra el color.
              backgroundImage:
                'radial-gradient(130% 110% at 88% -10%, rgb(var(--acento) / 0.30), transparent 58%),' +
                'linear-gradient(180deg, rgb(var(--acento) / 0.07), transparent 45%)',
            }}
          >
            <div className="relative z-10 flex flex-col gap-2 sm:gap-2.5">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-acento px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase text-acento-texto">
                  Ventas de hoy
                </span>
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    onIrAActividad?.();
                  }}
                  className="m3-press flex items-center gap-1 rounded-full border border-borde bg-superficie-2/80 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-texto-2 backdrop-blur-sm active:scale-95 transition-transform cursor-pointer"
                >
                  {hoy.ventas_count} {hoy.ventas_count === 1 ? 'venta' : 'ventas'}
                  <ChevronRight size={12} />
                </button>
              </div>

              <div className="flex items-end justify-between gap-2">
                <div>
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-texto-3">
                    Total generado
                  </span>
                  {/* La cifra del día es el dato más importante de la app:
                      que pese como tal. */}
                  <p className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-texto leading-none">
                    {formatearMoneda(hoy.total_usd_cents, 'USD')}
                  </p>
                </div>

                <div className="text-right">
                  <span className="mb-0.5 block text-[11px] text-texto-3">Ganancia</span>
                  <span className="inline-block rounded-lg bg-acento-suave px-2 py-0.5 text-caption font-bold tabular-nums text-acento-fuerte sm:text-label sm:px-2.5 sm:py-1">
                    +{formatearMoneda(hoy.ganancia_usd_cents, 'USD')}
                  </span>
                </div>
              </div>

              {/* Una sola acción en verde: dos botones con el mismo peso no
                  son una jerarquía, son un empate. */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                {onIrAVenta && (
                  <button
                    type="button"
                    onClick={() => {
                      haptics.impact('medium');
                      onIrAVenta();
                    }}
                    className="m3-press flex h-10 items-center justify-center gap-1.5 rounded-xl bg-acento px-3 text-caption font-bold text-acento-texto active:scale-95 transition-transform cursor-pointer sm:text-label"
                  >
                    <PlusCircle size={15} />
                    <span>Venta Rápida</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    haptics.impact('medium');
                    onIrACobranza?.();
                  }}
                  className="m3-press flex h-10 items-center justify-center gap-1.5 rounded-xl border border-borde bg-superficie-2 px-3 text-caption font-bold text-texto active:scale-95 transition-transform cursor-pointer sm:text-label"
                >
                  <HandCoins size={15} className="text-texto-2" />
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
              className="m3-card p-3 sm:p-3.5 flex flex-col justify-between cursor-pointer hover:border-alerta-suave transition-colors active:scale-[0.99]"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-alerta shrink-0" />
                    <p className="text-caption sm:text-label font-semibold text-texto-3 truncate">Por cobrar</p>
                  </div>
                  {cuotasVencidas.length > 0 && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-peligro-suave text-peligro border border-peligro-suave shrink-0">
                      {cuotasVencidas.length} ven.
                    </span>
                  )}
                </div>
                <MoneyDual usdCents={panel?.resumen.por_cobrar_usd_cents ?? 0} size="md" soloUsd />
              </div>
              <span className="text-[11px] sm:text-caption text-texto-3 mt-1.5 font-semibold flex items-center justify-between">
                <span>Gestionar cobros</span>
                <ChevronRight size={13} />
              </span>
            </div>

            <div
              onClick={() => {
                haptics.impact('light');
                onIrAInventario?.();
              }}
              className="m3-card p-3 sm:p-3.5 flex flex-col justify-between cursor-pointer hover:border-borde-fuerte transition-colors active:scale-[0.99]"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="h-2 w-2 rounded-full bg-texto-3 shrink-0" />
                    <p className="text-caption sm:text-label font-semibold text-texto-3 truncate">Inventario</p>
                  </div>
                  {(panel?.total_bajo_stock ?? 0) > 0 && (
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-alerta-suave text-alerta border border-alerta-suave shrink-0 flex items-center gap-0.5">
                      <PackageX size={10} />
                      {panel!.total_bajo_stock} bajo
                    </span>
                  )}
                </div>
                <MoneyDual usdCents={panel?.resumen.inversion_inventario_usd_cents ?? 0} size="md" soloUsd />
              </div>
              <span className="text-[11px] sm:text-caption text-texto-3 mt-1.5 font-semibold flex items-center justify-between">
                <span>{panel?.resumen.unidades_en_inventario ?? 0} unid. disponibles</span>
                <ChevronRight size={13} />
              </span>
            </div>
          </section>

          {/* Gráfico 7 días interactivo (Altura balanceada, sin estiramiento) */}
          <section className="m3-card p-3 sm:p-3.5 shrink-0 flex flex-col gap-2">
            <div className="flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2 text-body font-bold text-texto">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-superficie-2 text-texto-2 shrink-0">
                  <TrendingUp size={16} />
                </div>
                <span className="text-caption sm:text-label font-bold text-texto">Ventas últimos 7 días</span>
              </div>
              <span className="text-[11px] sm:text-caption font-semibold text-texto-3">USD</span>
            </div>

            {/* Detalle flotante si se toca una barra */}
            {diaSeleccionado && (
              <div className="my-0.5 flex items-center justify-between rounded-xl bg-superficie-2/90 border border-borde px-2.5 py-1 text-caption sm:text-label animate-m3-fade shrink-0">
                <span className="font-semibold text-texto-2 capitalize">
                  {nombreDia(diaSeleccionado.fecha)} {diaSeleccionado.fecha.slice(5)}:
                </span>
                <span className="font-bold text-texto">
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
                        estaSeleccionado ? 'ring-2 ring-acento' : ''
                      }`}
                      style={{ height: '76px' }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '6px',
                          background: tieneVenta
                            ? 'rgb(var(--acento))'
                            : 'rgb(var(--borde))',
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
                          ? 'rgb(var(--acento))'
                          : tieneVenta
                            ? 'rgb(var(--texto))'
                            : 'rgb(var(--texto-3))',
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
              if (panel?.bajo_stock && panel.total_bajo_stock > 0) {
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
                ? 'bg-peligro-suave border-peligro-suave hover:border-peligro-suave'
                : 'bg-acento-suave border-acento-suave'
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
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-peligro-suave text-peligro-fuerte shrink-0 border border-peligro-suave">
                    <PackageX size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-label sm:text-body font-bold text-peligro truncate leading-tight">
                        Stock crítico ({panel!.total_bajo_stock})
                      </span>
                      {panel!.bajo_stock.some((i) => i.existencias === 0) && (
                        <span className="h-2 w-2 rounded-full bg-peligro animate-pulse shrink-0" />
                      )}
                    </div>
                    <p className="text-caption text-peligro/80 font-medium truncate mt-0.5 leading-tight">
                      {panel!.total_bajo_stock === 1
                        ? panel!.bajo_stock[0].nombre
                        : `${panel!.bajo_stock.filter((i) => i.existencias === 0).length} agotados`}
                    </p>
                  </div>
                </div>

                <div className="flex w-full items-center justify-center gap-1.5 text-label font-bold text-peligro bg-peligro-suave px-3 py-2.5 rounded-xl border border-peligro-suave shrink-0">
                  <span>Revisar inventario</span>
                  <ChevronRight size={15} />
                </div>
              </div>
            ) : (
              <div className="flex flex-col justify-between h-full w-full gap-3 min-w-0">
                <div className="flex items-start gap-2.5 min-w-0">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-acento-suave text-acento-fuerte shrink-0 border border-acento-suave">
                    <CheckCircle2 size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-label sm:text-body font-bold text-acento block leading-tight">
                      Inventario en orden
                    </span>
                    <span className="text-caption text-texto-3 block mt-0.5 leading-tight">
                      Existencias óptimas en todos los artículos
                    </span>
                  </div>
                </div>

                <div className="flex w-full items-center justify-center gap-1.5 text-label font-bold text-acento bg-acento-suave px-3 py-2.5 rounded-xl border border-acento-suave shrink-0">
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
          panel?.bajo_stock && panel.total_bajo_stock > 0
            ? `${panel.total_bajo_stock} producto${panel.total_bajo_stock === 1 ? '' : 's'} que requiere${panel.total_bajo_stock === 1 ? '' : 'n'} atención`
            : undefined
        }
        maxHeight="85vh"
        footer={
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setMostrarStockSheet(false)}
              className="m3-press flex-1 rounded-xl bg-superficie-2 py-3 text-label font-bold text-texto-2 cursor-pointer"
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
                className="m3-press flex-1 rounded-xl bg-acento hover:bg-acento py-3 text-label font-bold text-acento-texto shadow-md shadow-m3-2 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Ir al Inventario</span>
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-2 py-1">
          {panel?.bajo_stock && panel.total_bajo_stock > 0 ? (
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
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-superficie-2 border border-borde active:scale-[0.985] transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        estaAgotado ? 'bg-peligro animate-pulse' : 'bg-alerta'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-texto truncate leading-tight">
                        {item.nombre}
                      </p>
                      <p className="text-xs text-texto-3 font-medium truncate mt-0.5">
                        {item.codigo ? `#${item.codigo}` : 'Sin código'} · Mínimo sugerido: {item.stock_minimo} unid.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 gap-1">
                    <span
                      className={`text-xs font-extrabold px-2.5 py-1 rounded-lg tabular-nums ${
                        estaAgotado
                          ? 'bg-peligro-suave text-peligro-fuerte'
                          : 'bg-alerta-suave text-alerta-fuerte'
                      }`}
                    >
                      {estaAgotado ? 'Agotado (0)' : `Quedan ${item.existencias}`}
                    </span>
                    {item.precio_venta_usd_cents > 0 && (
                      <span className="text-[11px] font-semibold text-texto-3 tabular-nums">
                        {formatearMoneda(item.precio_venta_usd_cents, 'USD')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center text-texto-3">
              <CheckCircle2 size={36} className="mx-auto text-acento mb-2" />
              <p className="text-sm font-bold text-texto-2">
                Todo el inventario está en orden
              </p>
              <p className="text-xs text-texto-3 mt-1">
                No hay productos agotados ni por debajo del stock mínimo.
              </p>
            </div>
          )}
        </div>
      </BottomSheet>

      {/* Confirmación de cierre de sesión: es la única acción destructiva de
          esta pantalla y merece un paso extra, sin usar window.confirm. */}
    </div>
  );
}
