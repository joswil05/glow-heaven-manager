import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronRight,
  HandCoins,
  ShoppingBag,
  ClipboardList,
  PackagePlus,
  MessageCircle,
  AlertTriangle,
} from 'lucide-react';
import type { AvancePaquete, ProductoConStock } from '@shared/types';
import { textoAvance } from '@core/avance-paquete';
import { ComprasRepoFirestore } from '@repos/compras.repo';
import { formatearMoneda, usdCentavosACorCentavos } from '@core/moneda';
import { cordobasQueSeDeben, enlaceMensaje, mensajeCobro } from '@core/mensajes';
import { diaDeHistorial, textoEquivalente, textoPagado } from '@core/abonos';
import { obtenerDatosDashboard, obtenerUltimos, cacheDashboardGlobal, invalidarCacheDashboard } from '../lib/panel-movil';
import { deudasPorClienta, dosSemanas, insigniasDeLaBarra, textoEncargosDeInicio, type DeudaDeClienta } from '../lib/inicio';
import { hoyISO } from '../lib/util';
import { BottomSheet } from '../components/BottomSheet';
import { AvancePaqueteCard, ResumenPaqueteCard } from '../components/AvancePaqueteCard';
import { FichaProductoSheet } from '../components/FichaProductoSheet';
import { AbonoSelectorSheet } from '../components/AbonoSelectorSheet';
import { AbonoModalSheet, type VentaCobroItem } from '../components/AbonoModalSheet';
import { useSnackbar } from '../components/Snackbar';
import { useAuth } from '../context/AuthContext';
import { useDatosNegocio } from '../context/DataContext';
import { PullToRefresh } from '../components/PullToRefresh';
import { haptics } from '../lib/haptics';

/** Las clientas que se ven en "Te deben"; el resto, en Cobros. */
const DEUDAS_EN_INICIO = 3;

/** El rótulo de cada grupo de Inicio, con el mismo estilo que los días del Historial. */
function TituloDeGrupo({ id, texto, accion }: { id: string; texto: string; accion?: { texto: string; onTocar: () => void } }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1 pt-1">
      <h2 id={id} className="text-caption font-bold uppercase tracking-wider text-texto-3">
        {texto}
      </h2>
      {accion && (
        <button
          type="button"
          onClick={() => {
            haptics.selection();
            accion.onTocar();
          }}
          className="tocable flex min-h-9 items-center gap-0.5 text-caption font-semibold text-texto-2 cursor-pointer"
        >
          {accion.texto}
          <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

export function DashboardView({
  onIrAActividad,
  onIrAVenta,
  onIrACobranza,
  onIrAInventario,
  onIrAEncargos,
  onAnotarPedido,
  onLlegoPaquete,
  onInsignias,
}: {
  onIrAActividad?: () => void;
  onIrAVenta?: () => void;
  /** Con un nombre, Cobros abre buscándola. */
  onIrACobranza?: (buscar?: string) => void;
  onIrAInventario?: () => void;
  onIrAEncargos?: () => void;
  onAnotarPedido?: () => void;
  onLlegoPaquete?: () => void;
  /** Las insignias de la barra (NAV-3), con lo que Inicio ya cargó. */
  onInsignias?: (insignias: { clientas: number; encargos: number }) => void;
}) {
  const { usuario } = useAuth();
  const { version, productos, parametros, marcarCambio } = useDatosNegocio();
  const { mostrar } = useSnackbar();
  const tasa = parametros?.tasa_cambio_cents ?? 3662;

  const [datos, setDatos] = useState(() => ({ ...cacheDashboardGlobal }));
  const [error, setError] = useState<string | null>(null);

  // Fase C1: el paquete cuya bodega se está mirando, y la ficha de un producto.
  const [paqueteAbierto, setPaqueteAbierto] = useState<AvancePaquete | null>(null);
  // Cerrada la hoja, se sigue mostrando lo último mientras baja.
  const ultimoPaquete = useRef<AvancePaquete | null>(null);
  if (paqueteAbierto) ultimoPaquete.current = paqueteAbierto;
  const paqueteVisto = paqueteAbierto ?? ultimoPaquete.current;
  const [fichaProducto, setFichaProducto] = useState<ProductoConStock | null>(null);
  /** Resúmenes que Ross cerró recién: se esconden sin esperar a recargar. */
  const [resumenesVistos, setResumenesVistos] = useState<number[]>([]);
  // "Abono" de las acciones rápidas: las mismas hojas que en Cobros.
  const [selectorAbonoAbierto, setSelectorAbonoAbierto] = useState(false);
  const [ventaParaCobrar, setVentaParaCobrar] = useState<VentaCobroItem | null>(null);

  const cargar = useCallback(async (forzar = false) => {
    setError(null);
    try {
      const data = await obtenerDatosDashboard(forzar);
      setDatos({ ...data });
    } catch (err) {
      console.error('[DashboardView] Error cargando el panel:', err);
      if (!cacheDashboardGlobal.panel) {
        setError('No se pudo cargar el panel.');
      }
    }
    // Aparte: si "Lo último" no se puede traer, el resto de Inicio se ve igual.
    try {
      const ultimos = await obtenerUltimos(forzar);
      setDatos((d) => ({ ...d, ultimos }));
    } catch (err) {
      console.warn('[DashboardView] No se pudo traer lo último:', err);
    }
  }, []);

  // `version` sube con cada venta, abono o ajuste hecho en cualquier pestaña.
  // Las cuatro vistas viven montadas a la vez, así que sin esto el efecto
  // corría una sola vez en toda la sesión y el panel quedaba congelado.
  useEffect(() => {
    cargar(version > 0);
  }, [cargar, version]);

  const { panel, hoy, fasesEncargo, ultimos } = datos;

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

  const cuentas = panel?.por_cobrar ?? [];
  const insignias = insigniasDeLaBarra(cuentas, fasesEncargo);
  useEffect(() => {
    onInsignias?.({ clientas: insignias.clientas, encargos: insignias.encargos });
  }, [onInsignias, insignias.clientas, insignias.encargos]);
  const deudas = deudasPorClienta(cuentas);
  const totalQueTeDeben = deudas.reduce((s, d) => s + d.saldo_usd_cents, 0);
  const semanas = dosSemanas(datos.serie);
  const mostrarCordobas = parametros?.mostrar_cordobas ?? true;
  const hoyIso = hoyISO();

  /** El recordatorio de cobro de toda su cuenta, con la plantilla de Configuración. */
  function whatsappDeDeuda(d: DeudaDeClienta): string | null {
    if (!d.telefono) return null;
    return enlaceMensaje(
      d.telefono,
      mensajeCobro(
        {
          cliente: d.nombre,
          saldo_usd_cents: d.saldo_usd_cents,
          saldo_cor_cents: cordobasQueSeDeben(d.ventas, tasa),
          codigo: d.ventas.map((v) => v.codigo).join(', '),
        },
        parametros
      ),
      parametros
    );
  }

  const acciones = [
    { texto: 'Vender', Icono: ShoppingBag, principal: true, onTocar: onIrAVenta },
    { texto: 'Abono', Icono: HandCoins, principal: false, onTocar: () => setSelectorAbonoAbierto(true) },
    { texto: 'Pedido', Icono: ClipboardList, principal: false, onTocar: onAnotarPedido },
    { texto: 'Paquete', Icono: PackagePlus, principal: false, onTocar: onLlegoPaquete },
  ];

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
                {usuario?.displayName?.split(' ')[0] || parametros?.nombre_negocio || 'Glow Heaven'}
              </h1>
            </div>
          </div>

          {/* INI-3: se recarga deslizando hacia abajo (el botón de recargar
              repetía el gesto) y Ajustes está en "Más" (NAV-1). */}
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

          {/* Tarjeta destacada del día: la misma de siempre, ahora entera se
              toca para ver las ventas de hoy (INI-1). Las acciones que tenía
              abajo pasaron a su propia fila. */}
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              onIrAActividad?.();
            }}
            className="m3-press relative w-full overflow-hidden rounded-[20px] border border-acento/30 bg-superficie p-3.5 sm:p-4 text-left shadow-m3-2 shrink-0 active:scale-[0.99] transition-transform cursor-pointer"
            style={{
              // El degradado sale de los tokens, así que se adapta al tema en
              // vez de ser un color quemado. Se ve, pero no tapa: el número
              // sigue leyéndose contra la superficie, no contra el color.
              backgroundImage:
                'radial-gradient(130% 110% at 88% -10%, rgb(var(--acento) / 0.30), transparent 58%),' +
                'linear-gradient(180deg, rgb(var(--acento) / 0.07), transparent 45%)',
            }}
          >
            <span className="relative z-10 flex flex-col gap-2 sm:gap-2.5">
              <span className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-acento px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase text-acento-texto">
                  Ventas de hoy
                </span>
                <span className="flex items-center gap-1 rounded-full border border-borde bg-superficie-2/80 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-texto-2 backdrop-blur-sm">
                  {hoy.ventas_count} {hoy.ventas_count === 1 ? 'venta' : 'ventas'}
                  <ChevronRight size={12} />
                </span>
              </span>

              <span className="flex items-end justify-between gap-2">
                <span className="min-w-0">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-texto-3">
                    Total generado
                  </span>
                  {/* La cifra del día es el dato más importante de la app:
                      que pese como tal. Los córdobas, al lado. */}
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-3xl sm:text-4xl font-black tracking-tight tabular-nums text-texto leading-none">
                      {formatearMoneda(hoy.total_usd_cents, 'USD')}
                    </span>
                    {mostrarCordobas && (
                      <span className="text-caption font-semibold tabular-nums text-texto-3">
                        ≈ {formatearMoneda(usdCentavosACorCentavos(hoy.total_usd_cents, tasa), 'COR')}
                      </span>
                    )}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="mb-0.5 block text-[11px] text-texto-3">Ganancia</span>
                  <span className="inline-block rounded-lg bg-acento-suave px-2 py-0.5 text-caption font-bold tabular-nums text-acento-fuerte sm:text-label sm:px-2.5 sm:py-1">
                    +{formatearMoneda(hoy.ganancia_usd_cents, 'USD')}
                  </span>
                </span>
              </span>

              {/* INI-2: en lugar de la gráfica de 7 días. */}
              <span className="text-[11px] font-semibold tabular-nums text-texto-3">
                Últimos 7 días {formatearMoneda(semanas.ultimos7, 'USD')} · los 7 de antes{' '}
                {formatearMoneda(semanas.anteriores7, 'USD')}
              </span>
            </span>
          </button>

          {/* Acciones rápidas. Una sola en verde: dos botones con el mismo
              peso no son una jerarquía, son un empate. */}
          <section aria-label="Acciones rápidas" className="grid grid-cols-4 gap-2 shrink-0">
            {acciones.map(({ texto, Icono, principal, onTocar }) => (
              <button
                key={texto}
                type="button"
                onClick={() => {
                  haptics.impact(principal ? 'medium' : 'light');
                  onTocar?.();
                }}
                className={`m3-press tocable flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-caption font-bold active:scale-95 transition-transform cursor-pointer ${
                  principal
                    ? 'bg-acento text-acento-texto shadow-m3-1'
                    : 'border border-borde bg-superficie text-texto shadow-m3-1'
                }`}
              >
                <Icono size={18} className={principal ? '' : 'text-texto-2'} aria-hidden="true" />
                {texto}
              </button>
            ))}
          </section>

          {/* Te deben (INI-1): una fila por clienta, la que más debe primero.
              Antes "Por cobrar" decía cuánto pero no quién. */}
          <section aria-labelledby="inicio-te-deben" className="flex flex-col gap-1.5 shrink-0">
            <TituloDeGrupo
              id="inicio-te-deben"
              texto={`Te deben ${formatearMoneda(totalQueTeDeben, 'USD')}`}
              accion={deudas.length > 0 ? { texto: `Ver todas (${deudas.length})`, onTocar: () => onIrACobranza?.() } : undefined}
            />
            <div className="m3-card px-3.5 py-1">
              {deudas.length === 0 ? (
                <p className="py-2.5 text-sm text-texto-2">Nadie te debe nada.</p>
              ) : (
                <div className="flex flex-col divide-y divide-borde">
                  {deudas.slice(0, DEUDAS_EN_INICIO).map((d) => {
                    const urlWhatsapp = whatsappDeDeuda(d);
                    const vencida = d.cuotas_vencidas > 0;
                    return (
                      <div key={d.clave} className="flex items-center gap-2 py-2">
                        <button
                          type="button"
                          onClick={() => {
                            haptics.selection();
                            onIrACobranza?.(d.nombre);
                          }}
                          className="tocable flex min-w-0 flex-1 items-center justify-between gap-2 py-0.5 text-left cursor-pointer"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-body font-bold leading-tight text-texto">{d.nombre}</span>
                            <span className="block truncate text-caption font-medium text-texto-3">
                              {d.ventas.length} {d.ventas.length === 1 ? 'venta' : 'ventas'}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            <span className="text-base font-black tabular-nums leading-none text-texto">
                              {formatearMoneda(d.saldo_usd_cents, 'USD')}
                            </span>
                            {vencida && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-peligro-suave px-2 py-0.5 text-caption font-extrabold text-peligro-fuerte">
                                <AlertTriangle size={10} />
                                {d.cuotas_vencidas} venc.
                              </span>
                            )}
                          </span>
                        </button>
                        {urlWhatsapp ? (
                          <a
                            href={urlWhatsapp}
                            onClick={() => haptics.impact('light')}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Recordarle a ${d.nombre} por WhatsApp`}
                            className="m3-press tocable flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-borde bg-superficie-2 text-texto-2 active:scale-95 transition-transform"
                          >
                            <MessageCircle size={17} />
                          </a>
                        ) : (
                          <span
                            role="img"
                            aria-label={`${d.nombre} no tiene teléfono en su ficha`}
                            title="Sin teléfono en su ficha"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-borde bg-superficie-2 text-texto-3 opacity-50"
                          >
                            <MessageCircle size={17} />
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          {/* Encargos: sólo lo que espera algo de Ross (INI-1). */}
          <button
            type="button"
            onClick={() => { haptics.selection(); onIrAEncargos?.(); }}
            className="tocable m3-card flex min-h-16 w-full shrink-0 items-center justify-between gap-3 p-3.5 text-left"
          >
            <span className="min-w-0">
              <span className="block text-base font-bold text-texto">Encargos</span>
              <span className="mt-0.5 block text-xs text-texto-2">{textoEncargosDeInicio(fasesEncargo)}</span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-texto-2" />
          </button>

          {/* Paquetes (Fase C1): reemplaza a "Stock crítico". El resumen de uno
              que se vendió todo, hasta que Ross toca "Listo"; y cómo va cada
              uno en venta. Alto según el contenido: la tarjeta de antes se
              estiraba y dejaba un hueco en el medio (CIN-02). */}
          <section aria-labelledby="inicio-paquetes" className="flex flex-col gap-1.5 shrink-0">
            <TituloDeGrupo id="inicio-paquetes" texto="Paquetes" />
            <div className="flex flex-col gap-2.5">
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
            </div>
          </section>

          {/* Lo último (INI-1): las mismas filas del Historial, las cinco más
              nuevas. Tocar cualquiera abre el Historial. */}
          <section aria-labelledby="inicio-lo-ultimo" className="flex flex-col gap-1.5 shrink-0">
            <TituloDeGrupo
              id="inicio-lo-ultimo"
              texto="Lo último"
              accion={ultimos.length > 0 ? { texto: 'Ver todo', onTocar: () => onIrAActividad?.() } : undefined}
            />
            <div className="m3-card px-3.5 py-1">
              {ultimos.length === 0 ? (
                <p className="py-2.5 text-sm text-texto-2">Todavía no hay ventas ni abonos.</p>
              ) : (
                <div className="flex flex-col divide-y divide-borde">
                  {ultimos.map((m) => (
                    <button
                      key={m.clave}
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        onIrAActividad?.();
                      }}
                      className="tocable flex w-full items-center gap-3 py-2.5 text-left cursor-pointer"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          m.tipo === 'venta' ? 'bg-superficie-2 text-texto-2' : 'bg-acento-suave text-acento-fuerte'
                        }`}
                      >
                        {m.tipo === 'venta' ? <ShoppingBag size={16} /> : <HandCoins size={16} />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-body font-bold leading-tight text-texto">{m.titulo}</span>
                        <span className="truncate text-caption font-medium text-texto-3">
                          {m.tipo === 'venta' ? 'Venta' : 'Abono'}
                          {m.codigo ? ` · ${m.codigo}` : ''} · {diaDeHistorial(m.fecha, hoyIso)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span
                          className={`text-base font-black tabular-nums leading-none ${
                            m.cancelada ? 'text-texto-3 line-through' : 'text-texto'
                          }`}
                        >
                          {m.pago ? textoPagado(m.pago) : formatearMoneda(m.venta?.total_usd_cents ?? 0, 'USD')}
                        </span>
                        {m.cancelada ? (
                          <span className="rounded-full bg-peligro-suave px-2 py-0.5 text-caption font-bold text-peligro-fuerte">
                            Anulada
                          </span>
                        ) : (
                          m.pago && (
                            <span className="text-[11px] font-semibold tabular-nums text-texto-3">{textoEquivalente(m.pago)}</span>
                          )
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
        tasaCambioCents={tasa}
        onCerrar={() => setFichaProducto(null)}
      />

      {/* "Abono" de las acciones rápidas: elegir a quién y registrarlo, sin
          salir de Inicio. Sin señal también queda en la cola (C4). */}
      <AbonoSelectorSheet
        abierto={selectorAbonoAbierto}
        onCerrar={() => setSelectorAbonoAbierto(false)}
        cuentasPorCobrar={cuentas}
        onSeleccionarVenta={(v) => setVentaParaCobrar(v)}
      />
      <AbonoModalSheet
        venta={ventaParaCobrar}
        onCerrar={() => setVentaParaCobrar(null)}
        onAbonoRegistrado={() => {
          invalidarCacheDashboard();
          // Avisa a las demás pestañas, y esta misma vuelve a cargar.
          marcarCambio();
        }}
      />
    </div>
  );
}
