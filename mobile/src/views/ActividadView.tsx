import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ShoppingBag, HandCoins, Loader2, Ban, AlertTriangle, FileText } from 'lucide-react';
import type { Venta, PagoCompleto } from '@shared/types';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { PagosRepoFirestore } from '@repos/pagos.repo';
import { formatearMoneda } from '@core/moneda';
import { useDatosNegocio } from '../context/DataContext';
import { useSnackbar } from '../components/Snackbar';
import { BottomSheet } from '../components/BottomSheet';
import { PullToRefresh } from '../components/PullToRefresh';
import { nuevoGrupoEvento } from '../lib/util';
import { abrirDocumentoDeVenta } from '../lib/documentos';
import { haptics } from '../lib/haptics';

/**
 * Actividad: qué pasó.
 *
 * Es la tercera pregunta del negocio, y la única que el celular no podía
 * contestar. Las otras dos ya tenían su pestaña:
 *
 *   Vender    quiero vender algo AHORA        (una acción, en presente)
 *   Cobros    quién me debe HOY               (un estado actual)
 *   Actividad qué pasó                        (un registro del pasado)
 *
 * No se pisan. Una venta cobrada por completo DESAPARECE de Cobros —ya no
 * debe nada— pero sigue acá, porque igual ocurrió. Esa diferencia no era
 * teórica: hasta ahora, un abono mal cargado que saldaba la cuenta hacía
 * desaparecer la fila de Cobros y quedaba imposible de anular. Cuanto más
 * grande el error, más probable que se volviera irreparable.
 *
 * Regla que las separa limpio: en Cobros se cobra, acá se corrige.
 */

type Filtro = 'todo' | 'ventas' | 'abonos';

interface ItemActividad {
  clave: string;
  tipo: 'venta' | 'abono';
  fecha: string;
  titulo: string;
  subtitulo: string;
  montoUsdCents: number;
  cancelada?: boolean;
  venta?: Venta;
  pago?: PagoCompleto;
}

export function ActividadView({ onVolver }: { onVolver: () => void }) {
  const { parametros, version, marcarCambio } = useDatosNegocio();
  const { mostrar } = useSnackbar();
  const tasa = parametros?.tasa_cambio_cents ?? 3662;

  const [ventas, setVentas] = useState<Venta[]>([]);
  const [pagos, setPagos] = useState<PagoCompleto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('todo');
  const [seleccionado, setSeleccionado] = useState<ItemActividad | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [abriendoDoc, setAbriendoDoc] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [vs, ps] = await Promise.all([
        VentasRepoFirestore.recientes(40),
        PagosRepoFirestore.recientes(40),
      ]);
      setVentas(vs);
      setPagos(ps);
    } catch (err) {
      console.error('[ActividadView] Error cargando la actividad:', err);
      mostrar('No se pudo cargar la actividad.', 'error');
    } finally {
      setCargando(false);
    }
  }, [mostrar]);

  useEffect(() => {
    cargar();
  }, [cargar, version]);

  const items = useMemo<ItemActividad[]>(() => {
    const deVentas: ItemActividad[] = ventas.map((v) => ({
      clave: `v-${v.id}`,
      tipo: 'venta',
      fecha: v.fecha,
      titulo: v.cliente_nombre || 'Venta de mostrador',
      subtitulo: v.codigo,
      montoUsdCents: v.total_usd_cents,
      cancelada: v.estado === 'CANCELADA',
      venta: v,
    }));
    const deAbonos: ItemActividad[] = pagos.map((p) => ({
      clave: `p-${p.id}`,
      tipo: 'abono',
      fecha: p.fecha,
      titulo: p.cliente_nombre || 'Abono',
      subtitulo: p.venta_codigo || 'Abono a cuenta',
      montoUsdCents: p.monto_usd_cents,
      pago: p,
    }));

    const todos =
      filtro === 'ventas' ? deVentas : filtro === 'abonos' ? deAbonos : [...deVentas, ...deAbonos];

    // Más nuevo primero: la pregunta casi siempre es "qué pasó recién".
    return todos.sort((a, b) => b.fecha.localeCompare(a.fecha));
  }, [ventas, pagos, filtro]);

  async function anular(item: ItemActividad) {
    setAnulando(true);
    try {
      if (item.tipo === 'abono' && item.pago) {
        await PagosRepoFirestore.anular(item.pago.id, nuevoGrupoEvento());
        mostrar('Abono anulado. El saldo volvió a subir.', 'success');
      } else if (item.tipo === 'venta' && item.venta) {
        await VentasRepoFirestore.cambiarEstado(item.venta.id, 'CANCELADA', nuevoGrupoEvento());
        mostrar('Venta cancelada. Se devolvieron las existencias.', 'success');
      }
      haptics.impact('medium');
      setSeleccionado(null);
      marcarCambio();
      await cargar();
    } catch (err) {
      console.error('[ActividadView] Error anulando:', err);
      mostrar('No se pudo anular. Probá de nuevo.', 'error');
    } finally {
      setAnulando(false);
    }
  }

  async function verDocumento(item: ItemActividad) {
    if (!item.venta || !parametros) return;
    setAbriendoDoc(true);
    try {
      await abrirDocumentoDeVenta(item.venta.id, parametros);
    } catch (err) {
      console.error('[ActividadView] Error abriendo el documento:', err);
      mostrar('No se pudo abrir el documento.', 'error');
    } finally {
      setAbriendoDoc(false);
    }
  }

  const FILTROS: { valor: Filtro; etiqueta: string }[] = [
    { valor: 'todo', etiqueta: 'Todo' },
    { valor: 'ventas', etiqueta: 'Ventas' },
    { valor: 'abonos', etiqueta: 'Abonos' },
  ];

  const esVieja = seleccionado ? esDeOtroDia(seleccionado.fecha) : false;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-fondo text-texto">
      <header className="shrink-0 z-20 border-b border-borde bg-superficie/95 px-4 pb-2 pt-safe-t shadow-m3-1 backdrop-blur-md">
        <div className="flex items-center gap-2.5 py-1.5">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              onVolver();
            }}
            aria-label="Volver"
            className="m3-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-borde bg-superficie-2 text-texto-2 active:scale-95 transition-transform cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <span className="mb-0.5 block text-caption font-bold uppercase leading-none tracking-widest text-texto-3">
              Glow Heaven
            </span>
            <h1 className="truncate text-title font-extrabold leading-tight text-texto">Actividad</h1>
          </div>
        </div>

        <div className="mt-1 flex items-center gap-1.5 overflow-x-auto sin-scrollbar py-0.5">
          {FILTROS.map(({ valor, etiqueta }) => (
            <button
              key={valor}
              type="button"
              onClick={() => {
                haptics.selection();
                setFiltro(valor);
              }}
              className={`m3-press shrink-0 rounded-full px-3 py-1 text-xs font-bold active:scale-[0.97] transition-transform cursor-pointer ${
                filtro === valor
                  ? 'bg-acento text-acento-texto'
                  : 'border border-borde bg-superficie-2 text-texto-2'
              }`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
      </header>

      <PullToRefresh onRefresh={cargar}>
        <main className="flex flex-col gap-2 px-3.5 pb-24 pt-3">
          {cargando && items.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-texto-3">
              <Loader2 size={24} className="animate-spin" />
              <p className="text-xs font-medium">Cargando actividad…</p>
            </div>
          )}

          {!cargando && items.length === 0 && (
            <p className="py-16 text-center text-body text-texto-3">Todavía no hay movimientos.</p>
          )}

          {items.map((it) => (
            <button
              key={it.clave}
              type="button"
              onClick={() => {
                haptics.selection();
                setSeleccionado(it);
              }}
              className="flex w-full items-center gap-3 rounded-2xl border border-borde bg-superficie p-3 text-left shadow-xs active:scale-[0.99] transition-transform cursor-pointer"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  it.tipo === 'venta'
                    ? 'bg-superficie-2 text-texto-2'
                    : 'bg-acento-suave text-acento-fuerte'
                }`}
              >
                {it.tipo === 'venta' ? <ShoppingBag size={16} /> : <HandCoins size={16} />}
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-body font-bold leading-tight text-texto">
                  {it.titulo}
                </span>
                <span className="truncate text-caption font-medium text-texto-3">
                  {it.tipo === 'venta' ? 'Venta' : 'Abono'} · {it.subtitulo} · {it.fecha}
                </span>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <span
                  className={`text-base font-black tabular-nums leading-none ${
                    it.cancelada ? 'text-texto-3 line-through' : 'text-texto'
                  }`}
                >
                  {formatearMoneda(it.montoUsdCents, 'USD')}
                </span>
                {it.cancelada && (
                  <span className="rounded-full bg-peligro-suave px-2 py-0.5 text-caption font-bold text-peligro-fuerte">
                    Cancelada
                  </span>
                )}
              </div>
            </button>
          ))}
        </main>
      </PullToRefresh>

      <BottomSheet
        abierto={seleccionado !== null}
        onCerrar={() => setSeleccionado(null)}
        titulo={seleccionado?.titulo ?? ''}
        subtitulo={
          seleccionado
            ? `${seleccionado.tipo === 'venta' ? 'Venta' : 'Abono'} · ${seleccionado.subtitulo} · ${seleccionado.fecha}`
            : undefined
        }
        footer={
          seleccionado && !seleccionado.cancelada ? (
            <button
              type="button"
              disabled={anulando}
              onClick={() => anular(seleccionado)}
              className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-peligro px-5 py-3.5 text-sm font-bold text-peligro-texto active:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer"
            >
              {anulando ? <Loader2 size={18} className="animate-spin" /> : <Ban size={18} />}
              {anulando
                ? 'Anulando…'
                : seleccionado.tipo === 'venta'
                  ? 'Cancelar esta venta'
                  : 'Anular este abono'}
            </button>
          ) : undefined
        }
      >
        {seleccionado && (
          <div className="flex flex-col gap-4 pb-2">
            <div className="rounded-2xl border border-borde bg-superficie-2 px-4 py-3">
              <span className="text-caption font-bold uppercase tracking-widest text-texto-3">
                {seleccionado.tipo === 'venta' ? 'Total de la venta' : 'Monto del abono'}
              </span>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="text-2xl font-black tabular-nums text-texto">
                  {formatearMoneda(seleccionado.montoUsdCents, 'USD')}
                </span>
                <span className="text-sm font-bold tabular-nums text-texto-2">
                  {formatearMoneda(Math.round((seleccionado.montoUsdCents * tasa) / 100), 'COR')}
                </span>
              </div>
            </div>

            {seleccionado.tipo === 'venta' && (
              <button
                type="button"
                disabled={abriendoDoc}
                onClick={() => verDocumento(seleccionado)}
                className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl border border-borde bg-superficie-2 px-4 py-3 text-sm font-bold text-texto active:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer"
              >
                {abriendoDoc ? <Loader2 size={17} className="animate-spin" /> : <FileText size={17} />}
                {seleccionado.venta?.tipo === 'ENCARGO' ? 'Ver proforma' : 'Ver factura'}
              </button>
            )}

            {seleccionado.cancelada ? (
              <p className="text-body text-texto-2">Esta venta ya está cancelada.</p>
            ) : (
              <div className="rounded-2xl border border-alerta-suave bg-alerta-suave p-3.5">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-alerta-fuerte" />
                  <p className="text-[11px] leading-relaxed text-alerta-fuerte">
                    {seleccionado.tipo === 'venta' ? (
                      <>
                        Se devuelven las existencias al inventario y se anulan los abonos de esta
                        venta. Deja de contarse en las ganancias.
                        {esVieja && ' Es de otro día: van a cambiar cifras ya pasadas.'}
                      </>
                    ) : (
                      <>
                        El saldo de la clienta vuelve a subir{' '}
                        {formatearMoneda(seleccionado.montoUsdCents, 'USD')} y el abono deja de
                        aparecer en su historial. La anulación queda asentada en la auditoría.
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}

/** Una anulación de otro día mueve cifras de un período ya pasado: se avisa. */
function esDeOtroDia(fecha: string): boolean {
  const hoy = new Date().toISOString().slice(0, 10);
  return fecha.slice(0, 10) !== hoy;
}
