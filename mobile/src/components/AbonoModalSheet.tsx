import { useEffect, useRef, useState } from 'react';
import { DollarSign, MessageCircle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { PagosRepoFirestore } from '@repos/pagos.repo';
import { EventosRepoFirestore } from '@repos/eventos.repo';
import { formatearMoneda, usdCentavosACorCentavos } from '@core/moneda';
import { parsearACentavos } from '@core/numeros';
import { monedaPorDefecto, metodoPorDefecto } from '@core/preferencias';
import { nuevoGrupoEvento, hoyISO } from '../lib/util';
import { mensajeReciboAbono, enlaceMensaje } from '@core/mensajes';
import { useDatosNegocio } from '../context/DataContext';
import { useSnackbar } from './Snackbar';
import { haptics } from '../lib/haptics';
import type { MetodoPago, MonedaPago } from '@shared/types';

export interface VentaCobroItem {
  venta_id: number;
  codigo: string;
  cliente_nombre: string;
  cliente_telefono?: string;
  saldo_usd_cents: number;
  /**
   * La tasa congelada de la venta. El abono se registra con ésta, así que el
   * saldo en córdobas y "Pagar todo" tienen que salir de la misma: con la de
   * hoy, "Pagar todo" dejaba centavos pendientes o cobraba de más.
   */
  tasa_cambio_cents?: number;
}

interface AbonoModalSheetProps {
  venta: VentaCobroItem | null;
  onCerrar: () => void;
  onAbonoRegistrado: () => void;
}

/** Lo que se debe, escrito en la moneda elegida, con la tasa de la venta. */
const saldoEn = (usd: number, moneda: MonedaPago, tasa: number) =>
  ((moneda === 'COR' ? usdCentavosACorCentavos(usd, tasa) : usd) / 100).toFixed(2);

/**
 * Registrar un abono desde el celular, con lo mismo que la ventana de
 * Windows (CCO-02, CCO-03): la moneda y el método de Configuración, la fecha,
 * la equivalencia con la tasa de la venta, "cómo queda" y Deshacer. Los
 * errores van en el campo, y la confirmación es una: la pantalla de éxito
 * (había además un aviso flotante, CCO-04).
 */
export function AbonoModalSheet({ venta: ventaAbierta, onCerrar, onAbonoRegistrado }: AbonoModalSheetProps) {
  // Cerrada, se sigue mostrando lo último mientras la hoja baja: sin esto el
  // componente desaparecía antes de que la hoja pudiera animar su salida.
  const ultimaVenta = useRef(ventaAbierta);
  if (ventaAbierta) ultimaVenta.current = ventaAbierta;
  const venta = ventaAbierta ?? ultimaVenta.current;
  const { parametros } = useDatosNegocio();
  const { mostrar } = useSnackbar();

  const [moneda, setMoneda] = useState<MonedaPago>(monedaPorDefecto(parametros));
  const [metodo, setMetodo] = useState<MetodoPago>(metodoPorDefecto(parametros));
  const [montoTexto, setMontoTexto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState(() => hoyISO());
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const [exito, setExito] = useState<{
    montoFormateado: string;
    nuevoSaldoUsdCents: number;
    grupo: string;
  } | null>(null);

  // Al abrirse, con la moneda y el método que ella eligió en Configuración:
  // arrancaba siempre en córdobas y efectivo.
  const abierta = Boolean(ventaAbierta);
  useEffect(() => {
    if (!abierta) return;
    setMoneda(monedaPorDefecto(parametros));
    setMetodo(metodoPorDefecto(parametros));
    setMontoTexto('');
    setReferencia('');
    setFecha(hoyISO());
    setError(null);
    setExito(null);
    // Se reinicia al abrir, no cuando cambian los parámetros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, ventaAbierta?.venta_id]);

  if (!venta) return null;

  // La de la venta. La de hoy sólo si la venta no la trae (un anticipo suelto).
  const tasa = venta.tasa_cambio_cents || parametros?.tasa_cambio_cents || 3662;
  const saldoCordobas = usdCentavosACorCentavos(venta.saldo_usd_cents, tasa);
  const centavos = parsearACentavos(montoTexto, { min: 0.01 });
  const montoUsd = centavos === null ? 0 : moneda === 'COR' ? Math.round((centavos * 100) / tasa) : centavos;
  const saldoDespues = venta.saldo_usd_cents - montoUsd;

  function llenarSaldoTotal() {
    haptics.impact('medium');
    setMontoTexto(saldoEn(venta!.saldo_usd_cents, moneda, tasa));
    setError(null);
  }

  function cambiarMoneda(m: MonedaPago) {
    haptics.selection();
    // Después de "Pagar todo", el número se escribe en la moneda nueva: si no,
    // $50.00 pasaban a ser C$50.00.
    if (montoTexto === saldoEn(venta!.saldo_usd_cents, moneda, tasa)) {
      setMontoTexto(saldoEn(venta!.saldo_usd_cents, m, tasa));
    }
    setMoneda(m);
  }

  async function handleConfirmar() {
    if (guardando) return;
    if (centavos === null) {
      haptics.error();
      setError(montoTexto.trim() ? 'El monto tiene que ser mayor a cero.' : 'Escribí cuánto pagó.');
      return;
    }

    haptics.impact('heavy');
    setGuardando(true);
    setError(null);
    try {
      const grupo = nuevoGrupoEvento();
      const res = await PagosRepoFirestore.registrar(
        {
          venta_id: venta!.venta_id,
          fecha,
          monto_cents: centavos,
          moneda,
          metodo,
          referencia: referencia.trim() || undefined,
        },
        grupo
      );

      setExito({
        montoFormateado: formatearMoneda(centavos, moneda),
        nuevoSaldoUsdCents: res.saldo_usd_cents,
        grupo,
      });
      haptics.success();
      onAbonoRegistrado();
    } catch (err: any) {
      haptics.error();
      console.error('[AbonoModalSheet] Error registrando abono:', err);
      setError(err?.message || 'No se pudo registrar el abono.');
    } finally {
      setGuardando(false);
    }
  }

  // Deshacer, como en Windows (CEL-03): perdonar el error es más rápido que
  // corregirlo o anularlo.
  async function deshacerAbono() {
    if (!exito || deshaciendo) return;
    haptics.impact('medium');
    setDeshaciendo(true);
    try {
      const r = await EventosRepoFirestore.deshacerGrupo(exito.grupo);
      if (r.revertido) {
        mostrar('Abono deshecho.', 'info');
        onAbonoRegistrado();
        handleCerrarTodo();
      } else {
        mostrar(r.descripcion, 'error');
      }
    } catch (err: any) {
      mostrar(err?.message || 'No se pudo deshacer el abono.', 'error');
    } finally {
      setDeshaciendo(false);
    }
  }

  function handleCerrarTodo() {
    setExito(null);
    setMontoTexto('');
    setReferencia('');
    onCerrar();
  }

  const otra = moneda === 'COR' ? formatearMoneda(montoUsd, 'USD') : formatearMoneda(usdCentavosACorCentavos(centavos ?? 0, tasa), 'COR');

  return (
    <BottomSheet
      abierto={Boolean(ventaAbierta)}
      onCerrar={handleCerrarTodo}
      // Un monto o una referencia escritos y no registrados: cerrar pregunta.
      hayCambios={!exito && (montoTexto.trim() !== '' || referencia.trim() !== '')}
      titulo="Registrar abono"
      subtitulo={`${venta.cliente_nombre} · Venta #${venta.codigo}`}
    >
      {exito ? (
        <div className="flex flex-col items-center text-center py-4 gap-4 animate-m3-fade">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-acento-suave text-acento-fuerte">
            <CheckCircle2 size={36} />
          </div>

          <div>
            <h3 className="text-xl font-bold text-texto">Abono registrado</h3>
            <p className="text-sm text-texto-2 mt-1">
              Se recibieron <strong className="text-acento-fuerte">{exito.montoFormateado}</strong> de {venta.cliente_nombre}.
            </p>
            <p className="text-xs text-texto-3 mt-1 tabular-nums">
              {exito.nuevoSaldoUsdCents > 0 ? (
                <>
                  Queda debiendo{' '}
                  <strong className="text-texto-2 font-semibold">
                    {formatearMoneda(exito.nuevoSaldoUsdCents, 'USD')}
                  </strong>{' '}
                  (≈ {formatearMoneda(usdCentavosACorCentavos(exito.nuevoSaldoUsdCents, tasa), 'COR')})
                </>
              ) : (
                'La venta quedó saldada.'
              )}
            </p>
          </div>

          <div className="flex flex-col w-full gap-2 mt-2">
            {venta.cliente_telefono && (
              <a
                href={enlaceMensaje(
                  venta.cliente_telefono,
                  mensajeReciboAbono({
                    cliente: venta.cliente_nombre,
                    pagado: exito.montoFormateado,
                    codigo: venta.codigo,
                    saldo_usd_cents: exito.nuevoSaldoUsdCents,
                    saldo_cor_cents: usdCentavosACorCentavos(exito.nuevoSaldoUsdCents, tasa),
                  }),
                  parametros
                )}
                target="_blank"
                rel="noreferrer"
                className="tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento hover:bg-acento px-4 py-3.5 text-sm font-semibold text-acento-texto shadow-sm active:scale-[0.98] transition-transform"
              >
                <MessageCircle size={18} />
                Enviar recibo por WhatsApp
              </a>
            )}

            <button
              type="button"
              onClick={handleCerrarTodo}
              className="tocable flex w-full items-center justify-center rounded-2xl bg-superficie-2 px-4 py-3 text-sm font-semibold text-texto-2 active:scale-[0.98] transition-transform"
            >
              Listo
            </button>
            <button
              type="button"
              onClick={() => void deshacerAbono()}
              disabled={deshaciendo}
              className="tocable flex w-full items-center justify-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-semibold text-texto-3 active:scale-[0.98] transition-transform disabled:opacity-50"
            >
              {deshaciendo ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
              {deshaciendo ? 'Deshaciendo…' : 'Deshacer el abono'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-6">
          {/* Tarjeta de saldo pendiente */}
          <div className="flex items-center justify-between rounded-2xl bg-superficie-2/80 border border-borde p-4">
            <div>
              <span className="text-xs font-medium text-texto-3">Saldo pendiente</span>
              <p className="text-xl font-bold text-texto tracking-tight tabular-nums">
                {formatearMoneda(venta.saldo_usd_cents, 'USD')}
              </p>
              <p className="text-xs text-texto-3 tabular-nums">≈ {formatearMoneda(saldoCordobas, 'COR')}</p>
            </div>
            <button
              type="button"
              onClick={llenarSaldoTotal}
              className="m3-press rounded-xl bg-superficie-2 border border-borde px-3 py-1.5 text-xs font-bold text-texto-2 hover:bg-superficie-3"
            >
              Pagar todo
            </button>
          </div>

          {/* La moneda primero: el monto se lee en ella. */}
          <div className="flex flex-col gap-1">
            <span id="moneda-abono-celular" className="text-xs font-semibold text-texto-2">
              Moneda en que pagó
            </span>
            <div role="radiogroup" aria-labelledby="moneda-abono-celular" className="flex rounded-xl bg-superficie-2/90 p-1">
              {(['COR', 'USD'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={moneda === m}
                  onClick={() => cambiarMoneda(m)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-[background-color,color,box-shadow] duration-150 ${
                    moneda === m ? 'bg-superficie-3 text-texto shadow-sm' : 'text-texto-3'
                  }`}
                >
                  {m === 'COR' ? 'Córdobas (C$)' : 'Dólares ($)'}
                </button>
              ))}
            </div>
          </div>

          {/* Campo de Monto */}
          <div className="flex flex-col gap-1">
            <label htmlFor="monto-abono-celular" className="text-xs font-semibold text-texto-2">
              Cuánto pagó ({moneda === 'COR' ? 'C$' : '$'})
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-texto-3 font-bold text-sm">
                {moneda === 'COR' ? 'C$' : '$'}
              </span>
              <input
                id="monto-abono-celular"
                // Texto, no `type="number"`: el navegador convierte "1,500"
                // en "1.500" antes de que la aplicación lo vea, y eso se lee
                // como uno con medio. El parser de `@core/numeros` sí sabe
                // distinguir miles de decimales, pero necesita el texto crudo.
                // `inputMode` mantiene el teclado numérico en el celular.
                type="text"
                inputMode="decimal"
                value={montoTexto}
                onChange={(e) => {
                  setMontoTexto(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="0.00"
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'error-abono-celular' : undefined}
                className={`w-full rounded-2xl border bg-superficie pl-10 pr-4 py-2.5 text-base font-bold text-texto placeholder:text-texto-3 outline-none focus:ring-2 focus:ring-acento ${
                  error ? 'border-peligro' : 'border-borde focus:border-acento-suave'
                }`}
              />
            </div>
            {/* El error en su campo, no en un aviso que se va (CCO-04). */}
            {error && (
              <p id="error-abono-celular" role="alert" className="text-xs font-semibold text-peligro">
                {error}
              </p>
            )}
            {centavos !== null && (
              <p className="text-xs text-texto-3 tabular-nums">
                {formatearMoneda(centavos, moneda)} a la tasa de esta venta ({formatearMoneda(tasa, 'COR')}) son {otra}.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="metodo-abono-celular" className="text-xs font-semibold text-texto-2">
                Cómo pagó
              </label>
              <select
                id="metodo-abono-celular"
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as MetodoPago)}
                className="w-full h-10 rounded-xl border border-borde bg-superficie px-3 text-xs font-medium text-texto outline-none focus:border-acento-suave"
              >
                <option value="EFECTIVO" className="bg-superficie-3 text-texto">Efectivo</option>
                <option value="TRANSFERENCIA" className="bg-superficie-3 text-texto">Transferencia</option>
                <option value="OTRO" className="bg-superficie-3 text-texto">Otro método</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="fecha-abono-celular" className="text-xs font-semibold text-texto-2">
                Fecha
              </label>
              <input
                id="fecha-abono-celular"
                type="date"
                value={fecha}
                max={hoyISO()}
                onChange={(e) => setFecha(e.target.value || hoyISO())}
                className="w-full h-10 rounded-xl border border-borde bg-superficie px-3 text-xs font-medium text-texto outline-none focus:border-acento-suave"
              />
            </div>
          </div>

          {/* Referencia opcional */}
          <div className="flex flex-col gap-1">
            <label htmlFor="referencia-abono-celular" className="text-xs font-semibold text-texto-2">
              Referencia
            </label>
            <input
              id="referencia-abono-celular"
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Opcional"
              className="w-full rounded-xl border border-borde bg-superficie px-3.5 py-2.5 text-xs text-texto placeholder:text-texto-3 outline-none focus:border-acento-suave"
            />
          </div>

          {/* Cómo queda, antes de registrar. */}
          {centavos !== null && (
            <p
              className={`rounded-2xl px-4 py-3 text-xs font-semibold tabular-nums ${
                saldoDespues <= 0 ? 'bg-acento-suave text-acento-fuerte' : 'bg-superficie-2 text-texto-2'
              }`}
            >
              {saldoDespues < 0
                ? `Queda saldada y paga ${formatearMoneda(-saldoDespues, 'USD')} de más.`
                : saldoDespues === 0
                  ? 'Con esto la venta queda saldada.'
                  : `Después de este abono va a deber ${formatearMoneda(saldoDespues, 'USD')} (≈ ${formatearMoneda(
                      usdCentavosACorCentavos(saldoDespues, tasa),
                      'COR'
                    )}).`}
            </p>
          )}

          {/* Botón de Confirmación */}
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={guardando}
            className="m3-press mt-2 tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento px-5 py-3.5 text-sm font-bold text-acento-texto shadow-lg shadow-m3-2 active:scale-[0.98] disabled:opacity-50"
          >
            {guardando ? <Loader2 size={18} className="animate-spin" /> : <DollarSign size={18} />}
            {guardando ? 'Guardando…' : 'Registrar abono'}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
