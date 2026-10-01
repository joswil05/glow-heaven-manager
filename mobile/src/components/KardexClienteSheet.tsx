import { useEffect, useRef, useState } from 'react';
import {
  Clock,
  DollarSign,
  MessageCircle,
  Loader2,
  Calendar,
  CreditCard,
  Banknote,
  Receipt,
  AlertCircle,
} from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { PagosRepoFirestore } from '@repos/pagos.repo';
import { BorradoRepoFirestore } from '@repos/borrado.repo';
import { porQueNoSeBorraAbono } from '@core/borrado';
import { AnularOBorrarPanel } from './AnularOBorrarPanel';
import { formatearMoneda, formatearFecha } from '@core/moneda';
import { textoEquivalente, textoPagado, textoQuien } from '@core/abonos';
import { linkWhatsapp, nuevoGrupoEvento } from '../lib/util';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';
import { Ban, Pencil } from 'lucide-react';
import { CorregirAbonoSheet } from './CorregirAbonoSheet';
import type { PagoCompleto } from '@shared/types';
import type { VentaCobroItem } from './AbonoModalSheet';

export interface ClienteKardexInfo {
  cliente_id?: number;
  cliente_nombre: string;
  cliente_telefono?: string;
  saldo_usd_cents?: number;
  venta_id?: number;
  codigo?: string;
  /** La tasa de esa venta: con ella se pasa el saldo a córdobas. */
  tasa_cambio_cents?: number;
}

interface KardexClienteSheetProps {
  cliente: ClienteKardexInfo | null;
  abierto: boolean;
  onCerrar: () => void;
  onAbonar: (venta: VentaCobroItem) => void;
  /** Se llama tras anular, para que el resto de la app se entere. */
  onCambio?: () => void;
}

export function KardexClienteSheet({
  cliente: clienteAbierto,
  abierto,
  onCerrar,
  onAbonar,
  onCambio,
}: KardexClienteSheetProps) {
  // Cerrada, se sigue mostrando lo último mientras la hoja baja: sin esto el
  // componente desaparecía antes de que la hoja pudiera animar su salida.
  const ultimoCliente = useRef(clienteAbierto);
  if (clienteAbierto) ultimoCliente.current = clienteAbierto;
  const cliente = clienteAbierto ?? ultimoCliente.current;
  const { parametros, version } = useDatosNegocio();
  const [pagos, setPagos] = useState<PagoCompleto[]>([]);
  /**
   * Un abono mal cargado (el caso típico: elegir C$ cuando eran dólares) se
   * CORRIGE desde la 2.16.1: mismo abono, con su monto, su moneda o su fecha
   * bien puestos. Antes sólo se podía anular y cargar otro, dos asientos para
   * un solo error.
   *
   * Anular queda para lo que no pasó. Marca el pago como inactivo y devuelve
   * el saldo; la consulta del historial filtra por `activo`, así que el abono
   * deja de verse acá y la anulación queda en la auditoría. El texto de la
   * confirmación dice exactamente eso.
   */
  const [pagoAAnular, setPagoAAnular] = useState<PagoCompleto | null>(null);
  /** Mientras se corrige, esta hoja se esconde y vuelve al terminar. */
  const [pagoCorrigiendo, setPagoCorrigiendo] = useState<PagoCompleto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tasa = cliente?.tasa_cambio_cents || parametros?.tasa_cambio_cents || 3662;

  useEffect(() => {
    if (!abierto || !cliente) {
      setPagos([]);
      setError(null);
      return;
    }

    let cancelado = false;
    async function cargarHistorial() {
      setCargando(true);
      setError(null);
      try {
        let resultados: PagoCompleto[] = [];
        if (cliente!.cliente_id) {
          resultados = await PagosRepoFirestore.listarPorCliente(cliente!.cliente_id);
        } else if (cliente!.venta_id) {
          resultados = await PagosRepoFirestore.listarPorVenta(cliente!.venta_id);
        }
        if (!cancelado) {
          setPagos(resultados);
        }
      } catch (err: any) {
        console.error('[KardexClienteSheet] Error cargando pagos:', err);
        if (!cancelado) {
          setError('No se pudo cargar el historial de abonos.');
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargarHistorial();
    return () => {
      cancelado = true;
    };
    // `version` sube después de corregir o anular: la lista se vuelve a leer.
  }, [abierto, cliente, version]);

  if (!cliente) return null;

  const saldoUsd = cliente.saldo_usd_cents ?? 0;
  const saldoCor = Math.round((saldoUsd * tasa) / 100);
  async function anularAbono(p: PagoCompleto) {
    try {
      await PagosRepoFirestore.anular(p.id, nuevoGrupoEvento());
      setPagoAAnular(null);
      onCambio?.();
      // Tras anular se ofrece cargar el abono correcto, que es a lo que la
      // persona vino. Son DOS asientos en el historial, no una edicion.
      if (cliente?.venta_id) {
        onAbonar({
          venta_id: cliente.venta_id,
          codigo: cliente.codigo ?? '',
          cliente_nombre: cliente.cliente_nombre,
          cliente_telefono: cliente.cliente_telefono,
          saldo_usd_cents: (cliente.saldo_usd_cents ?? 0) + p.monto_usd_cents,
          tasa_cambio_cents: cliente.tasa_cambio_cents,
        });
      }
    } catch (err) {
      console.error('[KardexClienteSheet] Error anulando el abono:', err);
      setError('No se pudo anular el abono. Probá de nuevo.');
    }
  }

  /** "Fue un error": el abono se borra sin dejar rastro. Devuelve el error, si lo hubo. */
  async function borrarAbono(p: PagoCompleto, pin: string): Promise<string | null> {
    try {
      await BorradoRepoFirestore.abono(p.id, pin || undefined, nuevoGrupoEvento());
      setPagoAAnular(null);
      onCambio?.();
      return null;
    } catch (err) {
      return err instanceof Error && err.message ? err.message : 'No se pudo borrar. Probá de nuevo.';
    }
  }

  const totalAbonadoUsd = pagos.reduce((acc, p) => acc + (p.monto_usd_cents || 0), 0);

  return (
    <>
    <CorregirAbonoSheet
      pago={pagoCorrigiendo}
      codigo={pagoCorrigiendo?.venta_codigo}
      onCerrar={() => setPagoCorrigiendo(null)}
    />
    <BottomSheet
      abierto={abierto && pagoCorrigiendo === null}
      onCerrar={() => {
        haptics.impact('light');
        onCerrar();
      }}
      titulo="Abonos"
      subtitulo={cliente.cliente_nombre}
    >
      <div className="flex flex-col gap-3 pb-3">
        {/* Resumen de Cuenta del Cliente */}
        <div className="rounded-2xl bg-gradient-to-br from-superficie-2 to-superficie-2 border border-borde p-3.5 flex flex-col gap-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-extrabold text-texto truncate">
                {cliente.cliente_nombre}
              </h3>
              {cliente.cliente_telefono && (
                <p className="text-[11px] text-texto-3 font-medium">
                  {cliente.cliente_telefono}
                </p>
              )}
            </div>

            {/* Acceso WhatsApp */}
            {cliente.cliente_telefono && (
              <a
                href={
                  linkWhatsapp(
                    cliente.cliente_telefono,
                    `Hola ${cliente.cliente_nombre}, te saludamos de Glow Heaven ✨ Te compartimos el estado de tus abonos y saldo pendiente: ${formatearMoneda(
                      saldoUsd,
                      'USD'
                    )} (≈ ${formatearMoneda(saldoCor, 'COR')}). ¡Muchas gracias por tu preferencia!`
                  ) ?? undefined
                }
                onClick={() => haptics.impact('light')}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-superficie-2 text-texto-2 border border-borde text-[11px] font-bold active:scale-95 transition-all shrink-0"
              >
                <MessageCircle size={14} />
                <span>WhatsApp</span>
              </a>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-borde">
            <div className="flex flex-col">
              <span className="text-caption font-bold uppercase tracking-wider text-texto-3">
                Saldo pendiente
              </span>
              <p
                className={`text-sm font-black tabular-nums ${
                  saldoUsd > 0
                    ? 'text-peligro'
                    : 'text-acento'
                }`}
              >
                {formatearMoneda(saldoUsd, 'USD')}
              </p>
              <p className="text-caption text-texto-3 font-medium">
                ≈ {formatearMoneda(saldoCor, 'COR')}
              </p>
            </div>

            <div className="flex flex-col text-right">
              <span className="text-caption font-bold uppercase tracking-wider text-texto-3">
                Total abonado
              </span>
              <p className="text-sm font-black text-texto tabular-nums">
                {formatearMoneda(totalAbonadoUsd, 'USD')}
              </p>
              <p className="text-caption text-texto-3 font-medium">
                {pagos.length} {pagos.length === 1 ? 'pago' : 'pagos'}
              </p>
            </div>
          </div>
        </div>

        {/* Botón de Abonar directo */}
        <button
          type="button"
          onClick={() => {
            haptics.impact('medium');
            onAbonar({
              venta_id: cliente.venta_id || pagos[0]?.venta_id || 0,
              codigo: cliente.codigo || pagos[0]?.venta_codigo || `C-${cliente.cliente_id}`,
              cliente_nombre: cliente.cliente_nombre,
              cliente_telefono: cliente.cliente_telefono,
              saldo_usd_cents: saldoUsd,
              tasa_cambio_cents: cliente.tasa_cambio_cents,
            });
            onCerrar();
          }}
          className={`flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-extrabold text-xs shadow-xs transition-all active:scale-[0.98] cursor-pointer ${
            saldoUsd > 0
              ? 'bg-acento hover:bg-acento text-acento-texto shadow-m3-2'
              : 'bg-superficie-2 hover:bg-superficie-3 text-texto-2 border border-borde'
          }`}
        >
          <DollarSign size={16} className={saldoUsd > 0 ? 'text-peligro' : 'text-acento'} />
          <span>{saldoUsd > 0 ? 'Registrar abono' : 'Registrar anticipo'}</span>
        </button>

        {/* Lista de Abonos */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-texto-2 flex items-center gap-1.5">
              <Clock size={13} className="text-texto-3" />
              Historial de Pagos ({pagos.length})
            </span>
          </div>

          {cargando ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 className="animate-spin text-acento" size={24} />
              <span className="text-xs text-texto-3 font-medium">Cargando…</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-peligro-suave border border-peligro-suave text-peligro-fuerte text-xs">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          ) : pagos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center rounded-2xl bg-superficie border border-borde">
              <div className="w-10 h-10 rounded-full bg-superficie-2 text-texto-3 flex items-center justify-center mb-2">
                <Receipt size={20} />
              </div>
              <p className="text-xs font-bold text-texto-2">
                Aún no hay abonos registrados
              </p>
              <p className="text-[11px] text-texto-3 mt-0.5">
                Los pagos y amortizaciones que reciba esta clienta aparecerán aquí.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Mueve plata: se confirma antes, y se dice exactamente qué va
                  a pasar con el historial y con el saldo. */}
              {pagoAAnular && (
                <AnularOBorrarPanel
                  anular={{
                    opcion: 'La plata se devolvió',
                    detalle: `El saldo vuelve a subir ${textoPagado(pagoAAnular)}. Queda en el historial como anulado; si sólo el monto, la moneda o la fecha están mal, mejor corregilo.`,
                    boton: 'Sí, anular el abono',
                    enCurso: 'Anulando…',
                  }}
                  borrar={{
                    opcion: 'Fue un error al cargarlo',
                    detalle: 'Nunca entró: se cargó dos veces, o por error. Se borra sin dejar rastro.',
                    boton: 'Sí, borrarlo',
                    enCurso: 'Borrando…',
                    noSePuede: porQueNoSeBorraAbono(pagoAAnular),
                  }}
                  pedirPin={Boolean(parametros?.pin_seguridad)}
                  onAnular={() => anularAbono(pagoAAnular)}
                  onBorrar={(pin) => borrarAbono(pagoAAnular, pin)}
                  onCancelar={() => setPagoAAnular(null)}
                />
              )}

              {pagos.map((p) => {
                const esEfectivo = p.metodo === 'EFECTIVO';
                const esTransferencia = p.metodo === 'TRANSFERENCIA';

                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-1.5 p-3 rounded-2xl bg-superficie border border-borde shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-superficie-2 text-texto-3">
                          {esEfectivo ? <Banknote size={11} /> : <CreditCard size={11} />}
                        </span>
                        <span className="text-xs font-bold text-texto-2">
                          {esEfectivo ? 'Efectivo' : esTransferencia ? 'Transferencia' : 'Otro'}
                        </span>
                        {p.es_anticipo && (
                          <span className="text-[10px] font-extrabold bg-superficie-2 bg-superficie-3 text-texto-2 px-1.5 py-0.5 rounded-md">
                            Anticipo
                          </span>
                        )}
                        {p.venta_codigo && (
                          <span className="text-[10px] font-mono font-semibold text-texto-3 bg-superficie-2 px-1.5 py-0.5 rounded-md">
                            {p.venta_codigo}
                          </span>
                        )}
                      </div>

                      {/* En la moneda en que pagó, y abajo su equivalente. */}
                      <div className="text-right">
                        <span className="text-xs font-black text-texto tabular-nums">{textoPagado(p)}</span>
                        <p className="text-[10px] text-texto-3 font-medium tabular-nums">{textoEquivalente(p)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[11px] text-texto-3 pt-0.5">
                      <span className="flex min-w-0 items-center gap-1 truncate">
                        <Calendar size={11} className="shrink-0" />
                        {formatearFecha(p.fecha)} · {textoQuien(p)}
                        {p.referencia && ` · Ref: ${p.referencia}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setPagoAAnular(null);
                          setPagoCorrigiendo(p);
                        }}
                        aria-label={`Corregir el abono de ${textoPagado(p)}`}
                        className="m3-press flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-acento-suave px-3 py-2 text-xs font-bold text-acento-fuerte active:scale-[0.98] cursor-pointer"
                      >
                        <Pencil size={13} />
                        Corregir
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          haptics.selection();
                          setPagoAAnular(p);
                        }}
                        aria-label={`Anular el abono de ${textoPagado(p)}`}
                        className="m3-press flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-texto-3 active:scale-[0.98] cursor-pointer"
                      >
                        <Ban size={13} />
                        Anular
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
    </>
  );
}
