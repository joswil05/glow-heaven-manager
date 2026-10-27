import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronRight, HandCoins, Loader2, MessageCircle, Pencil, Phone, Trash2, X, ReceiptText } from 'lucide-react';
import type { ClienteDetalle, FilaPorCobrar, PagoCompleto, Venta } from '@shared/types';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { PagosRepoFirestore } from '@repos/pagos.repo';
import { ClientesRepoFirestore } from '@repos/clientes.repo';
import { formatearMoneda } from '@core/moneda';
import { cordobasQueSeDeben, enlaceMensaje, mensajeCobro, mensajeEstadoCuenta, mensajeSaludo } from '@core/mensajes';
import { diaDeHistorial, textoPagado, textoTotalDeVenta } from '@core/abonos';
import { BottomSheet, usePantallaEncima } from './BottomSheet';
import { AbonoCuentaSheet } from './AbonoCuentaSheet';
import { ClientaFormSheet } from './ClientaFormSheet';
import { OpcionesSegmentadas } from './OpcionesSegmentadas';
import type { VentaCobroItem } from './AbonoModalSheet';
import { useSnackbar } from './Snackbar';
import { useDatosNegocio } from '../context/DataContext';
import { historiaDeClienta, pagadoPorClienta } from '../lib/clientas';
import { haptics } from '../lib/haptics';
import { hoyISO, nuevoGrupoEvento } from '../lib/util';
import { SIN_RED, useExigirConexion } from '../lib/useExigirConexion';

type Pestana = 'compras' | 'abonos' | 'pedidos';

const ESTADO_PEDIDO: Record<string, string> = {
  COTIZADA: 'Cotizado',
  PENDIENTE: 'En curso',
  ENTREGADA: 'Entregado',
  CANCELADA: 'Anulado',
};

/**
 * La ficha de una clienta a pantalla completa (CLI-2): cómo llamarla, lo que
 * debe y lo que ya pagó, sus acciones y su historia ("Compras · Abonos ·
 * Pedidos"). Cada compra con deuda abre la hoja de cobro de siempre.
 */
export function FichaClienta({
  clienta,
  porCobrar,
  onCerrar,
  onCambio,
  onVerCobro,
  onAbonarVenta,
}: {
  clienta: ClienteDetalle | null;
  /** Lo que se debe en todo el negocio: de acá salen sus ventas con saldo. */
  porCobrar: readonly FilaPorCobrar[];
  onCerrar: () => void;
  /** Algo cambió (un abono, su ficha): la lista vuelve a cargar. */
  onCambio: () => void;
  /** Abre la hoja de cobro de una de sus ventas. */
  onVerCobro: (fila: FilaPorCobrar) => void;
  /** Abona a una venta, con la hoja de abono de siempre (sirve sin señal). */
  onAbonarVenta: (venta: VentaCobroItem) => void;
}) {
  const { parametros, version } = useDatosNegocio();
  const { mostrar } = useSnackbar();
  const exigirConexion = useExigirConexion();
  const tasa = parametros?.tasa_cambio_cents ?? 3662;
  const hoy = hoyISO();

  const [ventas, setVentas] = useState<Venta[]>([]);
  const [pagos, setPagos] = useState<PagoCompleto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [pestana, setPestana] = useState<Pestana>('compras');
  const [eligiendoAbono, setEligiendoAbono] = useState(false);
  const [abonoCuenta, setAbonoCuenta] = useState(false);
  const [editando, setEditando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [recarga, setRecarga] = useState(0);

  const idClienta = clienta?.id;
  useEffect(() => {
    if (idClienta == null) return;
    let vigente = true;
    setCargando(true);
    setErrorCarga('');
    Promise.all([VentasRepoFirestore.listar({ cliente_id: idClienta }), PagosRepoFirestore.listarPorCliente(idClienta)])
      .then(([vs, ps]) => {
        if (!vigente) return;
        setVentas(vs);
        setPagos(ps);
      })
      .catch(() => {
        if (vigente) setErrorCarga('No se pudo cargar su historia. Revisá la conexión.');
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, [idClienta, version, recarga]);

  useEffect(() => {
    setPestana('compras');
  }, [idClienta]);

  // "Atrás" y Escape la cierran, y el foco entra a la ficha al abrirse.
  const panel = useRef<HTMLDivElement>(null);
  usePantallaEncima(idClienta != null, onCerrar, panel);
  useEffect(() => {
    if (idClienta != null) panel.current?.focus({ preventScroll: true });
  }, [idClienta]);

  if (!clienta) return null;

  const deudas = porCobrar.filter((f) => f.cliente_id === clienta.id && f.saldo_usd_cents > 0);
  const debe = deudas.reduce((s, f) => s + f.saldo_usd_cents, 0);
  const debeCor = cordobasQueSeDeben(deudas, tasa);
  const vencida = deudas.some((f) => f.cuotas_vencidas > 0);
  const historia = historiaDeClienta(ventas, pagos);

  const telefono = clienta.telefono;
  const enlaceSaludo = telefono ? enlaceMensaje(telefono, mensajeSaludo(clienta.nombre), parametros) : null;
  const enlaceRecordar =
    telefono && debe > 0
      ? enlaceMensaje(
          telefono,
          mensajeCobro(
            { cliente: clienta.nombre, saldo_usd_cents: debe, saldo_cor_cents: debeCor, codigo: deudas.map((f) => f.codigo).join(', ') },
            parametros
          ),
          parametros
        )
      : null;
  const enlaceEstado = telefono
    ? enlaceMensaje(
        telefono,
        mensajeEstadoCuenta({
          cliente: clienta.nombre,
          saldo_usd_cents: debe,
          saldo_cor_cents: debeCor,
          abonos: historia.abonos.map((p) => ({ fecha: p.fecha, pagado: textoPagado(p) })),
        }),
        parametros
      )
    : null;

  async function eliminar() {
    if (!clienta || borrando) return;
    if (!exigirConexion(SIN_RED.clienta, setErrorEliminar)) return;
    haptics.impact('medium');
    setBorrando(true);
    setErrorEliminar('');
    try {
      await ClientesRepoFirestore.archivar(clienta.id, nuevoGrupoEvento());
      mostrar(`${clienta.nombre} se eliminó`, 'success');
      setEliminando(false);
      onCambio();
      onCerrar();
    } catch (e) {
      haptics.error();
      setErrorEliminar(e instanceof Error ? e.message : 'No se pudo eliminar.');
    } finally {
      setBorrando(false);
    }
  }

  const accion =
    'm3-press tocable flex items-center justify-center gap-1.5 rounded-xl border border-borde bg-superficie-2 px-3 py-2.5 text-label font-bold text-texto-2 active:scale-[0.98] transition-transform cursor-pointer';

  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ficha-clienta-titulo"
      className="fixed inset-0 z-50 flex flex-col bg-fondo text-texto outline-none"
    >
      <header className="shrink-0 bg-superficie/95 backdrop-blur-md border-b border-borde pt-safe-t px-4 pb-2 shadow-m3-1">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-acento-suave bg-acento-suave text-xs font-black text-acento-fuerte">
              {(clienta.nombre || 'C').charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <span className="text-caption font-bold tracking-widest uppercase text-texto-3 block leading-none mb-0.5">Clienta</span>
              <h1 id="ficha-clienta-titulo" className="text-title font-extrabold text-texto leading-tight truncate">
                {clienta.nombre}
              </h1>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => {
              haptics.impact('light');
              onCerrar();
            }}
            className="m3-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-borde bg-superficie-2/90 text-texto-2 cursor-pointer"
          >
            <X size={17} />
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto px-3.5 pt-3 pb-8">
        <div className="flex flex-col gap-4">
          {/* Lo que debe y lo que ya pagó. */}
          <section className="rounded-2xl border border-borde bg-superficie px-4 py-3">
            {debe > 0 ? (
              <>
                <span className="text-caption font-bold uppercase tracking-widest text-texto-3">Debe</span>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5">
                  <span className={`text-2xl font-black tabular-nums ${vencida ? 'text-alerta-fuerte' : 'text-texto'}`}>
                    {formatearMoneda(debe, 'USD')}
                  </span>
                  <span className="text-sm font-bold tabular-nums text-texto-2">≈ {formatearMoneda(debeCor, 'COR')}</span>
                </div>
                {vencida && (
                  <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-alerta-suave px-2 py-0.5 text-caption font-extrabold text-alerta-fuerte">
                    <AlertTriangle size={10} />
                    Tiene cuotas vencidas
                  </p>
                )}
              </>
            ) : (
              <p className="text-body font-bold text-texto">No debe nada</p>
            )}
            <p className="mt-1.5 text-caption text-texto-3 tabular-nums">
              Ya pagó {formatearMoneda(pagadoPorClienta(clienta), 'USD')} de {formatearMoneda(clienta.total_comprado_usd_cents || 0, 'USD')} comprados
            </p>
          </section>

          {/* Cómo hablarle. */}
          <section className="flex flex-col gap-2">
            <p className="text-sm text-texto-2">
              {telefono ? telefono : 'Sin teléfono en su ficha'}
              {clienta.ciudad ? ` · ${clienta.ciudad}` : ''}
            </p>
            {telefono && (
              <div className="grid grid-cols-2 gap-2">
                <a href={`tel:${telefono}`} onClick={() => haptics.impact('light')} className={accion}>
                  <Phone size={15} />
                  Llamar
                </a>
                <a href={enlaceSaludo ?? undefined} target="_blank" rel="noreferrer" onClick={() => haptics.impact('light')} className={accion}>
                  <MessageCircle size={15} />
                  WhatsApp
                </a>
              </div>
            )}
          </section>

          {/* Sus acciones. */}
          <section className="flex flex-col gap-2">
            <button
              type="button"
              disabled={deudas.length === 0}
              onClick={() => {
                haptics.impact('light');
                setEligiendoAbono(true);
              }}
              className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento px-4 py-3.5 text-sm font-bold text-acento-texto active:scale-[0.98] transition-transform disabled:opacity-50 cursor-pointer"
            >
              <HandCoins size={17} />
              Registrar abono
            </button>
            <div className="grid grid-cols-2 gap-2">
              {enlaceRecordar && (
                <a href={enlaceRecordar} target="_blank" rel="noreferrer" onClick={() => haptics.impact('light')} className={accion}>
                  <MessageCircle size={15} />
                  Recordar
                </a>
              )}
              {enlaceEstado && (
                <a href={enlaceEstado} target="_blank" rel="noreferrer" onClick={() => haptics.impact('light')} className={accion}>
                  <ReceiptText size={15} />
                  Estado de cuenta
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  haptics.impact('light');
                  setEditando(true);
                }}
                className={accion}
              >
                <Pencil size={15} />
                Editar
              </button>
              <button
                type="button"
                onClick={() => {
                  haptics.impact('light');
                  setErrorEliminar('');
                  setEliminando(true);
                }}
                className={`${accion} text-peligro`}
              >
                <Trash2 size={15} />
                Eliminar
              </button>
            </div>
          </section>

          {/* Su historia: "Compras · Abonos · Pedidos". */}
          <section className="flex flex-col gap-2">
            <span id="ficha-historia" className="sr-only">
              Su historia
            </span>
            <OpcionesSegmentadas
              etiquetaId="ficha-historia"
              opciones={[
                { valor: 'compras', texto: `Compras (${historia.compras.length})` },
                { valor: 'abonos', texto: `Abonos (${historia.abonos.length})` },
                { valor: 'pedidos', texto: `Pedidos (${historia.pedidos.length})` },
              ]}
              valor={pestana}
              onCambiar={(p) => setPestana(p as Pestana)}
            />
            {cargando && ventas.length === 0 && pagos.length === 0 ? (
              <p role="status" className="py-3 text-sm text-texto-2">
                Cargando…
              </p>
            ) : errorCarga ? (
              <div role="alert" className="flex items-center justify-between rounded-xl bg-peligro-suave px-3 py-2 text-xs font-semibold text-peligro-fuerte">
                <span>{errorCarga}</span>
                <button type="button" onClick={() => setRecarga((n) => n + 1)} className="underline">
                  Reintentar
                </button>
              </div>
            ) : (
              <div className="m3-card px-3.5 py-1">
                <div className="flex flex-col divide-y divide-borde">
                  {pestana === 'compras' &&
                    (historia.compras.length === 0 ? (
                      <p className="py-2.5 text-sm text-texto-2">Todavía no compró nada.</p>
                    ) : (
                      historia.compras.map((v) => {
                        const fila = deudas.find((f) => f.venta_id === v.id);
                        const contenido = (
                          <>
                            <span className="min-w-0">
                              <span className="block truncate text-body font-bold text-texto">
                                {v.codigo} · {diaDeHistorial(v.fecha, hoy)}
                              </span>
                              <span
                                className={`block text-caption font-semibold ${
                                  v.estado === 'CANCELADA' ? 'text-texto-3' : fila ? 'text-alerta-fuerte' : 'text-texto-3'
                                }`}
                              >
                                {v.estado === 'CANCELADA'
                                  ? 'Anulada'
                                  : fila
                                    ? `Debe ${formatearMoneda(fila.saldo_usd_cents, 'USD')}`
                                    : 'Pagada'}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-base font-black tabular-nums text-texto">
                              {formatearMoneda(v.total_usd_cents, 'USD')}
                              {fila && <ChevronRight size={15} className="text-texto-3" />}
                            </span>
                          </>
                        );
                        return fila ? (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => {
                              haptics.selection();
                              onVerCobro(fila);
                            }}
                            className="tocable flex w-full items-center justify-between gap-3 py-2.5 text-left cursor-pointer"
                          >
                            {contenido}
                          </button>
                        ) : (
                          <div key={v.id} className="flex w-full items-center justify-between gap-3 py-2.5">
                            {contenido}
                          </div>
                        );
                      })
                    ))}
                  {pestana === 'abonos' &&
                    (historia.abonos.length === 0 ? (
                      <p className="py-2.5 text-sm text-texto-2">Todavía no abonó.</p>
                    ) : (
                      historia.abonos.map((p) => (
                        <div key={p.id} className="flex w-full items-center justify-between gap-3 py-2.5">
                          <span className="min-w-0">
                            <span className="block truncate text-body font-bold text-texto">{diaDeHistorial(p.fecha, hoy)}</span>
                            <span className="block truncate text-caption text-texto-3">
                              {p.venta_codigo} · {p.metodo === 'EFECTIVO' ? 'Efectivo' : p.metodo === 'TRANSFERENCIA' ? 'Transferencia' : 'Otro'}
                            </span>
                          </span>
                          <span className="shrink-0 text-base font-black tabular-nums text-texto">{textoPagado(p)}</span>
                        </div>
                      ))
                    ))}
                  {pestana === 'pedidos' &&
                    (historia.pedidos.length === 0 ? (
                      <p className="py-2.5 text-sm text-texto-2">No tiene pedidos.</p>
                    ) : (
                      historia.pedidos.map((v) => (
                        <div key={v.id} className="flex w-full items-center justify-between gap-3 py-2.5">
                          <span className="min-w-0">
                            <span className="block truncate text-body font-bold text-texto">
                              {v.codigo} · {diaDeHistorial(v.fecha, hoy)}
                            </span>
                            <span className="block text-caption text-texto-3">{ESTADO_PEDIDO[v.estado] ?? v.estado}</span>
                          </span>
                          <span className="shrink-0 text-base font-black tabular-nums text-texto">{textoTotalDeVenta(v)}</span>
                        </div>
                      ))
                    ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Registrar abono: a la cuenta (repartido) o a una venta. */}
      <BottomSheet abierto={eligiendoAbono} onCerrar={() => setEligiendoAbono(false)} titulo="Registrar abono" subtitulo={clienta.nombre}>
        <div className="flex flex-col gap-2 pb-2">
          <button
            type="button"
            onClick={() => {
              haptics.selection();
              setEligiendoAbono(false);
              setAbonoCuenta(true);
            }}
            className="tocable flex w-full items-center justify-between gap-3 rounded-2xl border border-acento-suave bg-acento-suave p-3 text-left cursor-pointer"
          >
            <span className="min-w-0">
              <span className="block text-sm font-bold text-acento-fuerte">A la cuenta</span>
              <span className="block text-xs text-texto-2">
                Se reparte entre {deudas.length === 1 ? 'su venta' : `sus ${deudas.length} ventas`}, la más vieja primero
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-acento-fuerte" />
          </button>
          <p className="px-1 pt-1 text-caption font-bold uppercase tracking-wider text-texto-3">O a una venta</p>
          {deudas.map((f) => (
            <button
              key={f.venta_id}
              type="button"
              onClick={() => {
                haptics.selection();
                setEligiendoAbono(false);
                onAbonarVenta({
                  venta_id: f.venta_id,
                  codigo: f.codigo,
                  cliente_nombre: f.cliente_nombre,
                  cliente_telefono: f.cliente_telefono,
                  saldo_usd_cents: f.saldo_usd_cents,
                  tasa_cambio_cents: f.tasa_cambio_cents,
                });
              }}
              aria-label={`A la venta ${f.codigo}, debe ${formatearMoneda(f.saldo_usd_cents, 'USD')}`}
              className="tocable flex w-full items-center justify-between gap-3 rounded-2xl border border-borde bg-superficie p-3 text-left cursor-pointer"
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold text-texto">{f.codigo}</span>
                <span className="block text-xs text-texto-3">{diaDeHistorial(f.fecha, hoy)}</span>
              </span>
              <span className="shrink-0 text-sm font-black tabular-nums text-texto">{formatearMoneda(f.saldo_usd_cents, 'USD')}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      <AbonoCuentaSheet
        clienta={clienta}
        ventas={deudas}
        abierto={abonoCuenta}
        onCerrar={() => setAbonoCuenta(false)}
        onRegistrado={() => {
          setRecarga((n) => n + 1);
          onCambio();
        }}
      />

      <ClientaFormSheet
        abierto={editando}
        clienta={clienta}
        onCerrar={() => setEditando(false)}
        onGuardada={() => onCambio()}
      />

      <BottomSheet
        abierto={eliminando}
        onCerrar={() => setEliminando(false)}
        titulo={`¿Eliminar a ${clienta.nombre}?`}
        ocupado={borrando}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={borrando}
              onClick={() => setEliminando(false)}
              className="m3-press tocable rounded-xl border border-borde bg-superficie px-3 py-3 text-sm font-bold text-texto disabled:opacity-50 cursor-pointer"
            >
              No
            </button>
            <button
              type="button"
              disabled={borrando}
              onClick={() => void eliminar()}
              className="m3-press tocable flex items-center justify-center gap-2 rounded-xl bg-peligro px-3 py-3 text-sm font-bold text-peligro-texto disabled:opacity-50 cursor-pointer"
            >
              {borrando && <Loader2 size={16} className="animate-spin" />}
              Sí, eliminar
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-2 pb-2">
          <p className="text-sm text-texto-2">
            Deja de aparecer en la lista y al elegir clienta. Sus ventas y abonos quedan en el historial.
          </p>
          {errorEliminar && (
            <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">
              {errorEliminar}
            </p>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
