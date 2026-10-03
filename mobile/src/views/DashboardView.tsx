import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  Settings,
  TrendingUp,
  PlusCircle,
  ChevronRight,
  HandCoins,
} from 'lucide-react';
import type { AvancePaquete, PanelData, ProductoConStock } from '@shared/types';
import { textoAvance } from '@core/avance-paquete';
import { ComprasRepoFirestore } from '@repos/compras.repo';
import { formatearMoneda } from '@core/moneda';
import {
  obtenerDatosDashboard,
  cacheDashboardGlobal,
  invalidarCacheDashboard,
  type DiaVentas,
  type ResumenHoy,
} from '../lib/panel-movil';
import { MoneyDual } from '../components/MoneyDual';
import { BottomSheet } from '../components/BottomSheet';
import { AvancePaqueteCard, ResumenPaqueteCard } from '../components/AvancePaqueteCard';
import { FichaProductoSheet } from '../components/FichaProductoSheet';
import { useSnackbar } from '../components/Snackbar';
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
  onIrAEncargos,
}: {
  onIrAAjustes?: () => void;
  onIrAActividad?: () => void;
  onIrAVenta?: () => void;
  onIrACobranza?: () => void;
  onIrAInventario?: () => void;
  onIrAEncargos?: () => void;
}) {
  const { usuario } = useAuth();
  const { version, productos, parametros } = useDatosNegocio();
  const { mostrar } = useSnackbar();

  const [panel, setPanel] = useState<PanelData | null>(cacheDashboardGlobal.panel);
  const [serie, setSerie] = useState<DiaVentas[]>(cacheDashboardGlobal.serie);
  const [hoy, setHoy] = useState<ResumenHoy>(cacheDashboardGlobal.hoy);
  const [fasesEncargo, setFasesEncargo] = useState(cacheDashboardGlobal.fasesEncargo);
  const [cargando, setCargando] = useState(!cacheDashboardGlobal.panel);
  const [error, setError] = useState<string | null>(null);

  // Día seleccionado en el gráfico para ver el detalle
  const [diaSeleccionado, setDiaSeleccionado] = useState<DiaVentas | null>(null);
  // Fase C1: el paquete cuya bodega se está mirando, y la ficha de un producto.
  const [paqueteAbierto, setPaqueteAbierto] = useState<AvancePaquete | null>(null);
  // Cerrada la hoja, se sigue mostrando lo último mientras baja.
  const ultimoPaquete = useRef<AvancePaquete | null>(null);
  if (paqueteAbierto) ultimoPaquete.current = paqueteAbierto;
  const paqueteVisto = paqueteAbierto ?? ultimoPaquete.current;
  const [fichaProducto, setFichaProducto] = useState<ProductoConStock | null>(null);
  /** Resúmenes que Ross cerró recién: se esconden sin esperar a recargar. */
  const [resumenesVistos, setResumenesVistos] = useState<number[]>([]);

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
      setFasesEncargo(data.fasesEncargo);
    } catch (err) {
      console.error('[DashboardView] Error cargando el panel:', err);
      if (!cacheDashboardGlobal.panel) {
        setError('No se pudo cargar el panel.');
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

  // Cómo va cada paquete (Fase C1): reemplaza a "Stock crítico".
  const paquetes = panel?.paquetes ?? [];
  const enVenta = paquetes.filter((p) => p.estado === 'EN_VENTA');
  const resumenesPorVer = paquetes.filter(
    (p) => p.estado === 'VENDIDO' && !p.resumen_visto_el && !resumenesVistos.includes(p.compra_id)
  );
  async function cerrarResumen(compra_id: number) {
    setResumenesVistos((v) => [...v, compra_id]);
    try {
      await ComprasRepoFirestore.marcarResumenVisto(compra_id);
      invalidarCacheDashboard();
    } catch (err) {
      console.error('[DashboardView] No se pudo guardar el resumen visto:', err);
      mostrar('No se pudo guardar. Probá de nuevo.', 'error');
      setResumenesVistos((v) => v.filter((x) => x !== compra_id));
    }
  }

  const cuentasPorCobrar = panel?.por_cobrar ?? [];
  const cuotasVencidas = cuentasPorCobrar.filter((f) => f.cuotas_vencidas > 0);
  const maxSerie = Math.max(1, ...serie.map((d) => d.total_usd_cents));
  const encargosEnCurso = Object.values(fasesEncargo).reduce((suma, n) => suma + n, 0);
  const resumenEncargos = [
    fasesEncargo.POR_BUSCAR > 0 ? `${fasesEncargo.POR_BUSCAR} por cotizar` : '',
    fasesEncargo.ESPERANDO > 0 ? `${fasesEncargo.ESPERANDO} esperando respuesta` : '',
  ].filter(Boolean).join(' · ') || (encargosEnCurso > 0 ? `${encargosEnCurso} en curso` : 'No hay encargos en curso');

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
            <div className="rounded-xl bg-peligro-suave border border-peligro-suave px-3.5 py-2 text-caption sm:text-label font-semibold text-peligro-fuerte flex items-center justify-between shrink-0">
              <span>{error}</span>
              <button onClick={() => cargar(true)} className="underline">Reintentar</button>
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
                    <span>Venta rápida</span>
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
                  <span>Cobros</span>
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
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-peligro-suave text-peligro-fuerte border border-peligro-suave shrink-0">
                      {cuotasVencidas.length} ven.
                    </span>
                  )}
                </div>
                <MoneyDual usdCents={panel?.resumen.por_cobrar_usd_cents ?? 0} size="md" soloUsd />
              </div>
              <span className="text-[11px] sm:text-caption text-texto-3 mt-1.5 font-semibold flex items-center justify-between">
                <span>Ver cobros</span>
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

          <button
            type="button"
            onClick={() => { haptics.selection(); onIrAEncargos?.(); }}
            className="tocable m3-card flex min-h-16 w-full shrink-0 items-center justify-between gap-3 p-3.5 text-left"
          >
            <span className="min-w-0">
              <span className="block text-base font-bold text-texto">Encargos</span>
              <span className="mt-0.5 block text-xs text-texto-2">{resumenEncargos}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-texto-2" />
          </button>

          {/* Paquetes (Fase C1): reemplaza a "Stock crítico". El resumen de uno
              que se vendió todo, hasta que Ross toca "Listo"; y cómo va cada
              uno en venta. Alto según el contenido: la tarjeta de antes se
              estiraba y dejaba un hueco en el medio (CIN-02). */}
          <section aria-label="Paquetes" className="flex flex-col gap-2.5 shrink-0">
            {resumenesPorVer.map((p) => (
              <ResumenPaqueteCard key={p.compra_id} avance={p} onListo={() => void cerrarResumen(p.compra_id)} />
            ))}
            {enVenta.slice(0, 2).map((p) => (
              <AvancePaqueteCard key={p.compra_id} avance={p} onAbrir={() => setPaqueteAbierto(p)} />
            ))}
            {enVenta.length === 0 && resumenesPorVer.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  haptics.impact('light');
                  onIrAInventario?.();
                }}
                className="tocable m3-card w-full p-3.5 flex items-center justify-between gap-2 text-left cursor-pointer"
              >
                <span className="text-sm text-texto-2">No hay ningún paquete en venta</span>
                <span className="flex items-center gap-1 text-xs font-bold text-texto-2">
                  Ver inventario
                  <ChevronRight size={14} />
                </span>
              </button>
            )}
          </section>
        </main>
      </PullToRefresh>

      {/* Lo que queda en bodega de un paquete. Tocar un producto abre su
          ficha, no el inventario en general (CIN-07). */}
      <BottomSheet
        abierto={Boolean(paqueteAbierto)}
        onCerrar={() => setPaqueteAbierto(null)}
        titulo={paqueteVisto ? `${paqueteVisto.codigo}: queda en bodega` : 'Queda en bodega'}
        subtitulo={paqueteVisto ? textoAvance(paqueteVisto) : undefined}
        maxHeight="85vh"
      >
        <div className="flex flex-col gap-2 py-1">
          {(paqueteVisto?.quedan ?? []).map((q) => (
            <button
              key={`${q.producto_id}-${q.variante_id}`}
              type="button"
              onClick={() => {
                haptics.selection();
                const p = productos.find((x) => x.id === q.producto_id);
                if (!p) return;
                setPaqueteAbierto(null);
                setFichaProducto(p);
              }}
              className="tocable flex items-center justify-between gap-3 p-3 rounded-2xl bg-superficie-2 border border-borde text-left cursor-pointer"
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold text-texto truncate">{q.nombre}</span>
                {q.detalle && <span className="block text-xs text-texto-3 truncate">{q.detalle}</span>}
              </span>
              <span className="flex items-center gap-1 text-xs font-semibold text-texto-2 tabular-nums shrink-0">
                {q.cantidad} en bodega
                <ChevronRight size={14} className="text-texto-3" />
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <FichaProductoSheet
        producto={fichaProducto}
        tasaCambioCents={parametros?.tasa_cambio_cents ?? 3662}
        onCerrar={() => setFichaProducto(null)}
      />

      {/* Confirmación de cierre de sesión: es la única acción destructiva de
          esta pantalla y merece un paso extra, sin usar window.confirm. */}
    </div>
  );
}
