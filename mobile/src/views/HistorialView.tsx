import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, ShoppingBag, HandCoins, Loader2, FileText, Pencil, Search, X } from 'lucide-react';
import type { Venta, PagoCompleto } from '@shared/types';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { PagosRepoFirestore } from '@repos/pagos.repo';
import { BorradoRepoFirestore } from '@repos/borrado.repo';
import { porQueNoSeBorraAbono, porQueNoSeBorraVenta } from '@core/borrado';
import { formatearMoneda } from '@core/moneda';
import { algunoContiene } from '@core/texto';
import { hoyISO } from '@core/fechas';
import { diaDeHistorial, ordenHistorial, textoEquivalente, textoPagado, textoQuien } from '@core/abonos';
import { useDatosNegocio } from '../context/DataContext';
import { useSnackbar } from '../components/Snackbar';
import { BottomSheet } from '../components/BottomSheet';
import { PullToRefresh } from '../components/PullToRefresh';
import { nuevoGrupoEvento } from '../lib/util';
import { DocumentoSheet } from '../components/DocumentoSheet';
import { CorregirVentaSheet } from '../components/CorregirVentaSheet';
import { CorregirAbonoSheet } from '../components/CorregirAbonoSheet';
import { haptics } from '../lib/haptics';
import { AnularOBorrarPanel } from '../components/AnularOBorrarPanel';

/**
 * Historial: qué pasó, y dónde se corrige.
 *
 * Es la tercera pregunta del negocio. Las otras dos tienen su pestaña:
 *
 *   Vender    quiero vender algo AHORA        (una acción, en presente)
 *   Cobros    quién me debe HOY               (un estado actual)
 *   Historial qué pasó                        (un registro del pasado)
 *
 * No se pisan. Una venta cobrada por completo desaparece de Cobros (ya no debe
 * nada) pero sigue acá, porque igual ocurrió. Hasta la 2.16.1 esto se llamaba
 * Actividad y se llegaba tocando el chip "N ventas" de Inicio: nadie lo
 * encontraba, y corregir quedaba escondido.
 *
 * Regla que las separa: en Cobros se cobra, acá se corrige.
 */

type Filtro = 'todo' | 'ventas' | 'abonos';

interface Item {
  clave: string;
  tipo: 'venta' | 'abono';
  id: number;
  fecha: string;
  creado_en?: string;
  titulo: string;
  codigo: string;
  cancelada?: boolean;
  venta?: Venta;
  pago?: PagoCompleto;
}

/** De a cuánto se trae. "Ver más" duplica. */
const TANDA = 50;

export function HistorialView() {
  const { version, marcarCambio, recargarProductos, parametros } = useDatosNegocio();
  const { mostrar, mostrarDeshacer } = useSnackbar();

  const [ventas, setVentas] = useState<Venta[]>([]);
  const [pagos, setPagos] = useState<PagoCompleto[]>([]);
  const [limite, setLimite] = useState(TANDA);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todo');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState<Item | null>(null);
  const [confirmandoAnular, setConfirmandoAnular] = useState(false);
  const [documentoDeVenta, setDocumentoDeVenta] = useState<number | null>(null);
  const [ventaCorrigiendo, setVentaCorrigiendo] = useState<number | null>(null);
  const [abonoCorrigiendo, setAbonoCorrigiendo] = useState<PagoCompleto | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [vs, ps] = await Promise.all([
        VentasRepoFirestore.recientes(limite),
        PagosRepoFirestore.recientes(limite),
      ]);
      setVentas(vs);
      setPagos(ps);
    } catch (err) {
      console.error('[HistorialView] Error cargando el historial:', err);
      mostrar('No se pudo cargar el historial.', 'error');
    } finally {
      setCargando(false);
    }
  }, [mostrar, limite]);

  useEffect(() => {
    cargar();
  }, [cargar, version]);

  /**
   * Hasta dónde se muestra. Ventas y abonos se traen por separado, y cada
   * lista llega hasta una fecha distinta: sin este corte, "Todo" mostraba
   * días con los abonos pero sin las ventas. Se corta en el día más nuevo en
   * que alguna de las dos se quedó sin traer, sin incluirlo (puede estar a
   * medias). "Ver más" corre el corte.
   */
  const corte = useMemo(() => {
    const ultimos = [
      ventas.length >= limite ? ventas[ventas.length - 1]?.fecha : undefined,
      pagos.length >= limite ? pagos[pagos.length - 1]?.fecha : undefined,
    ].filter(Boolean) as string[];
    return ultimos.length > 0 ? ultimos.sort()[ultimos.length - 1] : null;
  }, [ventas, pagos, limite]);

  const items = useMemo<Item[]>(() => {
    const deVentas: Item[] = ventas.map((v) => ({
      clave: `v-${v.id}`,
      tipo: 'venta',
      id: v.id,
      fecha: v.fecha,
      creado_en: v.creado_en,
      titulo: v.cliente_nombre || 'Mostrador',
      codigo: v.codigo,
      cancelada: v.estado === 'CANCELADA',
      venta: v,
    }));
    const deAbonos: Item[] = pagos.map((p) => ({
      clave: `p-${p.id}`,
      tipo: 'abono',
      id: p.id,
      fecha: p.fecha,
      creado_en: p.creado_en,
      titulo: p.cliente_nombre || 'Mostrador',
      codigo: p.venta_codigo || '',
      pago: p,
    }));
    let todos = filtro === 'ventas' ? deVentas : filtro === 'abonos' ? deAbonos : [...deVentas, ...deAbonos];
    if (corte) {
      const antes = todos.filter((it) => it.fecha > corte);
      todos = antes.length > 0 ? antes : todos.filter((it) => it.fecha >= corte);
    }
    if (busqueda.trim()) todos = todos.filter((it) => algunoContiene([it.titulo, it.codigo], busqueda));
    return todos.sort(ordenHistorial);
  }, [ventas, pagos, filtro, busqueda, corte]);

  const hoy = hoyISO();

  function cerrarDetalle() {
    setSeleccionado(null);
    setConfirmandoAnular(false);
  }

  // El panel de "¿Qué pasó?" muestra "Cancelando…" mientras esto corre.
  async function anular(item: Item) {
    try {
      // Con Deshacer, como en Windows (CEL-03).
      const grupo = nuevoGrupoEvento();
      const alDeshacer = () => {
        marcarCambio();
        void recargarProductos(true);
      };
      if (item.tipo === 'abono' && item.pago) {
        await PagosRepoFirestore.anular(item.pago.id, grupo);
        mostrarDeshacer('Abono anulado. El saldo volvió a subir.', grupo, alDeshacer);
      } else if (item.tipo === 'venta' && item.venta) {
        await VentasRepoFirestore.cambiarEstado(item.venta.id, 'CANCELADA', grupo);
        mostrarDeshacer('Venta anulada. Se devolvieron las existencias.', grupo, alDeshacer);
        // Las unidades volvieron a la bodega: Catálogo y Vender tienen que
        // verlas. `marcarCambio` sólo refresca los totales; los productos
        // tienen su propia caché. Lo encontró la fase de pruebas de la 2.16.1.
        void recargarProductos(true);
      }
      haptics.impact('medium');
      cerrarDetalle();
      marcarCambio();
    } catch (err) {
      console.error('[HistorialView] Error anulando:', err);
      // Un encargo con piezas que ya llegaron no se anula desde acá: el
      // repositorio explica por qué, y eso es lo que tiene que leer ella.
      mostrar(err instanceof Error && err.message ? err.message : 'No se pudo anular. Probá de nuevo.', 'error');
    }
  }

  /** "Fue un error": se borra sin dejar rastro. Devuelve el error, si lo hubo. */
  async function borrar(item: Item, pin: string): Promise<string | null> {
    try {
      if (item.tipo === 'abono' && item.pago) {
        await BorradoRepoFirestore.abono(item.pago.id, pin || undefined, nuevoGrupoEvento());
        mostrar('Abono borrado. El saldo volvió a subir.', 'success');
      } else if (item.tipo === 'venta' && item.venta) {
        const r = await BorradoRepoFirestore.venta(item.venta.id, pin || undefined, nuevoGrupoEvento());
        mostrar(`${r.que} se borró.`, 'success');
        void recargarProductos(true);
      }
      haptics.impact('medium');
      cerrarDetalle();
      marcarCambio();
      return null;
    } catch (err) {
      return err instanceof Error && err.message ? err.message : 'No se pudo borrar. Probá de nuevo.';
    }
  }

  const FILTROS: { valor: Filtro; etiqueta: string }[] = [
    { valor: 'todo', etiqueta: 'Todo' },
    { valor: 'ventas', etiqueta: 'Ventas' },
    { valor: 'abonos', etiqueta: 'Abonos' },
  ];

  const sel = seleccionado;
  const sePuedeCorregir = Boolean(sel && !sel.cancelada && (sel.tipo === 'abono' || sel.venta?.tipo === 'INVENTARIO'));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-fondo text-texto">
      <header className="shrink-0 z-20 border-b border-borde bg-superficie/95 px-4 pb-2 pt-safe-t shadow-m3-1 backdrop-blur-md">
        <div className="flex items-center gap-2.5 py-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-borde bg-superficie-2 text-texto-2">
            <History size={18} />
          </span>
          <div className="min-w-0">
            <span className="mb-0.5 block text-caption font-bold uppercase leading-none tracking-widest text-texto-3">
              Glow Heaven
            </span>
            <h1 className="truncate text-title font-extrabold leading-tight text-texto">Historial</h1>
          </div>
        </div>

        <div className="relative mt-1 flex items-center">
          <Search size={16} className="pointer-events-none absolute left-3 text-texto-3" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar clienta o código"
            aria-label="Buscar en el historial"
            className="h-10 w-full rounded-xl border border-borde bg-superficie-2 pl-9 pr-9 text-xs font-medium text-texto placeholder:text-texto-3 outline-none focus:bg-superficie focus:ring-2 focus:ring-acento"
            autoComplete="off"
            enterKeyHint="search"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => setBusqueda('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 rounded-full p-1 text-texto-3 cursor-pointer"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-1.5 overflow-x-auto sin-scrollbar py-0.5">
          {FILTROS.map(({ valor, etiqueta }) => (
            <button
              key={valor}
              type="button"
              onClick={() => {
                haptics.selection();
                setFiltro(valor);
              }}
              aria-pressed={filtro === valor}
              className={`m3-press shrink-0 rounded-full px-3 py-1 text-xs font-bold active:scale-[0.97] transition-transform cursor-pointer ${
                filtro === valor ? 'bg-acento text-acento-texto' : 'border border-borde bg-superficie-2 text-texto-2'
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </header>

      <PullToRefresh onRefresh={cargar}>
        <main className="flex flex-col px-3.5 pb-28 pt-2">
          {cargando && items.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-texto-3">
              <Loader2 size={24} className="animate-spin" />
              <p className="text-xs font-medium">Cargando historial…</p>
            </div>
          )}

          {!cargando && items.length === 0 && (
            <p className="py-16 text-center text-body text-texto-3">
              {busqueda.trim() ? 'Nada coincide con esa búsqueda.' : 'Todavía no hay movimientos.'}
            </p>
          )}

          {items.map((it, i) => {
            const dia = diaDeHistorial(it.fecha, hoy);
            const nuevoDia = i === 0 || diaDeHistorial(items[i - 1].fecha, hoy) !== dia;
            const quien = textoQuien(it.tipo === 'venta' ? it.venta! : it.pago!);
            return (
              <div key={it.clave}>
                {nuevoDia && (
                  <h2 className="px-1 pb-1.5 pt-3 text-caption font-bold uppercase tracking-wider text-texto-3">{dia}</h2>
                )}
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setConfirmandoAnular(false);
                    setSeleccionado(it);
                  }}
                  className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-borde bg-superficie p-3 text-left shadow-xs active:scale-[0.99] transition-transform cursor-pointer"
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      it.tipo === 'venta' ? 'bg-superficie-2 text-texto-2' : 'bg-acento-suave text-acento-fuerte'
                    }`}
                  >
                    {it.tipo === 'venta' ? <ShoppingBag size={16} /> : <HandCoins size={16} />}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-body font-bold leading-tight text-texto">{it.titulo}</span>
                    <span className="truncate text-caption font-medium text-texto-3">
                      {it.tipo === 'venta' ? 'Venta' : 'Abono'}
                      {it.codigo ? ` · ${it.codigo}` : ''} · {quien}
                    </span>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span
                      className={`text-base font-black tabular-nums leading-none ${
                        it.cancelada ? 'text-texto-3 line-through' : 'text-texto'
                      }`}
                    >
                      {it.tipo === 'abono' ? textoPagado(it.pago!) : formatearMoneda(it.venta!.total_usd_cents, 'USD')}
                    </span>
                    {it.cancelada ? (
                      <span className="rounded-full bg-peligro-suave px-2 py-0.5 text-caption font-bold text-peligro-fuerte">
                        Anulada
                      </span>
                    ) : (
                      it.tipo === 'abono' && (
                        <span className="text-[11px] font-semibold tabular-nums text-texto-3">{textoEquivalente(it.pago!)}</span>
                      )
                    )}
                  </div>
                </button>
              </div>
            );
          })}

          {corte && !busqueda.trim() && (
            <button
              type="button"
              onClick={() => setLimite((l) => l + TANDA)}
              disabled={cargando}
              className="m3-press mt-2 self-center rounded-full border border-borde bg-superficie-2 px-4 py-2 text-xs font-bold text-texto-2 disabled:opacity-50 cursor-pointer"
            >
              {cargando ? 'Trayendo…' : 'Ver más'}
            </button>
          )}
        </main>
      </PullToRefresh>

      <BottomSheet
        abierto={sel !== null}
        onCerrar={cerrarDetalle}
        titulo={sel?.titulo ?? ''}
        subtitulo={
          sel ? `${sel.tipo === 'venta' ? 'Venta' : 'Abono'}${sel.codigo ? ` · ${sel.codigo}` : ''} · ${diaDeHistorial(sel.fecha, hoy)}` : undefined
        }
        footer={
          sel && confirmandoAnular ? undefined : sel && sel.cancelada ? (
            // Una venta cancelada que en realidad fue un error también se borra.
            <button
              type="button"
              onClick={() => setConfirmandoAnular(true)}
              className="m3-press rounded-xl px-4 py-2.5 text-sm font-bold text-peligro cursor-pointer"
            >
              Fue un error: borrarla
            </button>
          ) : sel ? (
            <div className="flex flex-col gap-1.5">
              {sePuedeCorregir && (
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    // Una hoja a la vez: la de corregir reemplaza a esta.
                    if (sel.tipo === 'venta') setVentaCorrigiendo(sel.venta?.id ?? null);
                    else setAbonoCorrigiendo(sel.pago ?? null);
                    cerrarDetalle();
                  }}
                  className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento px-4 py-3.5 text-sm font-bold text-acento-texto active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <Pencil size={17} />
                  {sel.tipo === 'venta' ? 'Corregir venta' : 'Corregir abono'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmandoAnular(true)}
                className="m3-press rounded-xl px-4 py-2.5 text-sm font-bold text-peligro cursor-pointer"
              >
                {sel.tipo === 'venta' ? 'Cancelar esta venta' : 'Anular este abono'}
              </button>
            </div>
          ) : undefined
        }
      >
        {sel && (
          <div className="flex flex-col gap-3 pb-2">
            <div className="rounded-2xl border border-borde bg-superficie-2 px-4 py-3">
              <span className="text-caption font-bold uppercase tracking-widest text-texto-3">
                {sel.tipo === 'venta' ? 'Total de la venta' : 'Pagó'}
              </span>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="text-2xl font-black tabular-nums text-texto">
                  {sel.tipo === 'abono' ? textoPagado(sel.pago!) : formatearMoneda(sel.venta!.total_usd_cents, 'USD')}
                </span>
                <span className="text-sm font-bold tabular-nums text-texto-2">
                  {sel.tipo === 'abono'
                    ? textoEquivalente(sel.pago!)
                    : formatearMoneda(Math.round((sel.venta!.total_usd_cents * sel.venta!.tasa_cambio_cents) / 100), 'COR')}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-texto-3">
                {sel.tipo === 'abono' &&
                  `${sel.pago!.metodo === 'EFECTIVO' ? 'Efectivo' : sel.pago!.metodo === 'TRANSFERENCIA' ? 'Transferencia' : 'Otro'} · `}
                Registró {textoQuien(sel.tipo === 'venta' ? sel.venta! : sel.pago!)}
              </p>
            </div>

            {sel.tipo === 'venta' && (
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setDocumentoDeVenta(sel.venta?.id ?? null);
                }}
                className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl border border-borde bg-superficie-2 px-4 py-3 text-sm font-bold text-texto active:scale-[0.98] transition-transform cursor-pointer"
              >
                <FileText size={17} />
                {sel.venta?.tipo === 'ENCARGO' ? 'Ver proforma' : 'Ver factura'}
              </button>
            )}

            {sel.cancelada && <p className="text-body text-texto-2">Esta venta ya está cancelada.</p>}

            {confirmandoAnular && (
              <AnularOBorrarPanel
                anular={
                  sel.tipo === 'venta'
                    ? {
                        opcion: 'Se devolvió o se reembolsó',
                        detalle:
                          'Las existencias vuelven al inventario y se anulan sus abonos. Queda en el historial como cancelada.' +
                          (sel.fecha !== hoy ? ' Es de otro día: cambian cifras ya pasadas.' : ''),
                        boton: 'Sí, cancelar la venta',
                        enCurso: 'Cancelando…',
                        noSePuede: sel.cancelada ? 'Ya está cancelada.' : null,
                      }
                    : {
                        opcion: 'La plata se devolvió',
                        detalle: `El saldo vuelve a subir ${textoPagado(sel.pago!)}. Queda en el historial como anulado.`,
                        boton: 'Sí, anular el abono',
                        enCurso: 'Anulando…',
                      }
                }
                borrar={{
                  opcion: sel.tipo === 'venta' ? 'Fue un error al cargarla' : 'Fue un error al cargarlo',
                  detalle:
                    sel.tipo === 'venta'
                      ? 'Nunca pasó: se cargó dos veces, o por error. Se borra con sus abonos, sin dejar rastro.'
                      : 'Nunca entró: se cargó dos veces, o por error. Se borra sin dejar rastro.',
                  boton: sel.tipo === 'venta' ? 'Sí, borrarla' : 'Sí, borrarlo',
                  enCurso: 'Borrando…',
                  noSePuede:
                    sel.tipo === 'venta' && sel.venta
                      ? porQueNoSeBorraVenta(sel.venta, [])
                      : sel.pago
                        ? porQueNoSeBorraAbono(sel.pago)
                        : null,
                }}
                pedirPin={Boolean(parametros?.pin_seguridad)}
                onAnular={() => anular(sel)}
                onBorrar={(pin) => borrar(sel, pin)}
                onCancelar={() => setConfirmandoAnular(false)}
              />
            )}
          </div>
        )}
      </BottomSheet>

      <DocumentoSheet ventaId={documentoDeVenta} onCerrar={() => setDocumentoDeVenta(null)} />
      <CorregirVentaSheet ventaId={ventaCorrigiendo} onCerrar={() => setVentaCorrigiendo(null)} />
      <CorregirAbonoSheet
        pago={abonoCorrigiendo}
        codigo={abonoCorrigiendo?.venta_codigo}
        onCerrar={() => setAbonoCorrigiendo(null)}
      />
    </div>
  );
}
