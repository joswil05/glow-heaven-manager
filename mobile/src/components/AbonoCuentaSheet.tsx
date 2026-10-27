import { useEffect, useId, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { FilaPorCobrar, MetodoPago, MonedaPago } from '@shared/types';
import { PagosRepoFirestore } from '@repos/pagos.repo';
import { formatearMoneda } from '@core/moneda';
import { parsearACentavos } from '@core/numeros';
import { cordobasQueSeDeben } from '@core/mensajes';
import { monedaPorDefecto, metodoPorDefecto } from '@core/preferencias';
import { repartirAbono } from '@core/reparto';
import { BottomSheet } from './BottomSheet';
import { OpcionesSegmentadas, OPCIONES_METODO } from './OpcionesSegmentadas';
import { useSnackbar } from './Snackbar';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';
import { hoyISO, nuevoGrupoEvento } from '../lib/util';
import { SIN_RED, useExigirConexion } from '../lib/useExigirConexion';

const OPCIONES_MONEDA = [
  { valor: 'COR', texto: 'Córdobas (C$)' },
  { valor: 'USD', texto: 'Dólares ($)' },
] as const;

/**
 * Un abono a la cuenta de la clienta (CLI-2): se reparte entre sus ventas con
 * saldo, la más vieja primero, con la misma función que Windows
 * (`PagosRepoFirestore.registrarAbonoCliente`). Antes de registrar se ve a
 * qué venta va cada parte. Pide señal: la cola del teléfono sabe abonar a una
 * venta, no repartir.
 */
export function AbonoCuentaSheet({
  clienta,
  ventas,
  abierto,
  onCerrar,
  onRegistrado,
}: {
  clienta: { id: number; nombre: string } | null;
  /** Sus ventas con saldo, como las trae el panel. */
  ventas: readonly FilaPorCobrar[];
  abierto: boolean;
  onCerrar: () => void;
  onRegistrado: () => void;
}) {
  const { parametros } = useDatosNegocio();
  const { mostrarDeshacer } = useSnackbar();
  const exigirConexion = useExigirConexion();
  const tasa = parametros?.tasa_cambio_cents ?? 3662;
  const id = useId();

  const [moneda, setMoneda] = useState<MonedaPago>(() => monedaPorDefecto(parametros));
  const [metodo, setMetodo] = useState<MetodoPago>(() => metodoPorDefecto(parametros));
  const [montoTexto, setMontoTexto] = useState('');
  const [fecha, setFecha] = useState(() => hoyISO());
  const [referencia, setReferencia] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);

  useEffect(() => {
    if (!abierto) return;
    setMoneda(monedaPorDefecto(parametros));
    setMetodo(metodoPorDefecto(parametros));
    setMontoTexto('');
    setFecha(hoyISO());
    setReferencia('');
    setError(null);
    // Sólo al abrir: lo que se escribió no se pisa mientras está abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const deudaUsd = ventas.reduce((s, v) => s + (v.saldo_usd_cents || 0), 0);
  const deudaCor = cordobasQueSeDeben(ventas, tasa);
  const deudaEnMoneda = moneda === 'COR' ? deudaCor : deudaUsd;
  const centavos = montoTexto.trim() ? parsearACentavos(montoTexto, { min: 0 }) : null;
  const partes =
    centavos && centavos > 0
      ? repartirAbono(
          ventas.map((v) => ({
            id: v.venta_id,
            codigo: v.codigo,
            fecha: v.fecha,
            saldo_usd_cents: v.saldo_usd_cents,
            tasa_cambio_cents: v.tasa_cambio_cents,
            estado: v.estado,
          })),
          centavos,
          moneda
        )
      : [];

  async function registrar() {
    if (!clienta || ocupado.current) return;
    if (centavos === null || centavos <= 0) {
      haptics.error();
      setError('Escribí cuánto pagó.');
      return;
    }
    if (!exigirConexion(SIN_RED.abonoCuenta, setError)) return;
    // En iPhone sólo vibra dentro del toque: antes de esperar.
    haptics.impact('heavy');
    ocupado.current = true;
    setGuardando(true);
    setError(null);
    const grupo = nuevoGrupoEvento();
    try {
      await PagosRepoFirestore.registrarAbonoCliente(
        {
          cliente_id: clienta.id,
          fecha,
          monto_cents: centavos,
          moneda,
          metodo,
          referencia: referencia.trim() || undefined,
        },
        grupo
      );
      mostrarDeshacer(
        partes.length > 1 ? `Abono registrado y repartido entre ${partes.length} ventas.` : 'Abono registrado.',
        grupo,
        onRegistrado
      );
      onRegistrado();
      onCerrar();
    } catch (err) {
      console.error('[AbonoCuentaSheet] No se pudo registrar el abono:', err);
      haptics.error();
      setError(err instanceof Error ? err.message : 'No se pudo registrar el abono.');
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  return (
    <BottomSheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo="Abono a la cuenta"
      subtitulo={clienta ? `${clienta.nombre} · se reparte entre sus ventas` : undefined}
      hayCambios={montoTexto.trim() !== ''}
      ocupado={guardando}
      footer={
        <button
          type="button"
          onClick={() => void registrar()}
          disabled={guardando}
          className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento px-5 py-3.5 text-sm font-bold text-acento-texto active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {guardando && <Loader2 size={18} className="animate-spin" />}
          {guardando ? 'Registrando…' : 'Registrar abono'}
        </button>
      }
    >
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex items-center justify-between rounded-2xl bg-superficie-2/80 border border-borde p-4">
          <div>
            <span className="text-xs font-medium text-texto-3">Debe en total</span>
            <p className="text-xl font-bold text-texto tracking-tight tabular-nums">{formatearMoneda(deudaUsd, 'USD')}</p>
            <p className="text-xs text-texto-3 tabular-nums">≈ {formatearMoneda(deudaCor, 'COR')}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.impact('light');
              setMontoTexto((deudaEnMoneda / 100).toFixed(2));
              setError(null);
            }}
            className="m3-press rounded-xl bg-superficie-2 border border-borde px-3 py-1.5 text-xs font-bold text-texto-2"
          >
            Pagar todo
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span id={`${id}-moneda`} className="text-xs font-semibold text-texto-2">
            Moneda en que pagó
          </span>
          <OpcionesSegmentadas
            etiquetaId={`${id}-moneda`}
            opciones={OPCIONES_MONEDA}
            valor={moneda}
            onCambiar={(m) => setMoneda(m as MonedaPago)}
          />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-texto-2">Cuánto pagó ({moneda === 'COR' ? 'C$' : '$'})</span>
          <input
            // Texto, no `type="number"`: el navegador convierte "1,500" en
            // "1.500" antes de que la app lo vea.
            type="text"
            inputMode="decimal"
            value={montoTexto}
            onChange={(e) => {
              setMontoTexto(e.target.value);
              setError(null);
            }}
            placeholder="0.00"
            aria-invalid={Boolean(error)}
            className={`w-full rounded-2xl border bg-superficie px-4 py-2.5 text-base font-bold text-texto placeholder:text-texto-3 outline-none focus:ring-2 focus:ring-acento ${
              error ? 'border-peligro' : 'border-borde'
            }`}
          />
        </label>
        {error && (
          <p role="alert" className="-mt-2 text-xs font-semibold text-peligro">
            {error}
          </p>
        )}

        {partes.length > 0 && (
          <div className="rounded-2xl border border-borde bg-superficie p-3">
            <p className="text-caption font-bold uppercase tracking-wider text-texto-3">Así se reparte</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {partes.map((p) => (
                <li key={p.venta_id} className="flex items-center justify-between gap-2 text-xs text-texto-2">
                  <span>
                    {p.codigo} · {p.saldo_despues_usd_cents <= 0 ? 'queda pagada' : `queda ${formatearMoneda(p.saldo_despues_usd_cents, 'USD')}`}
                  </span>
                  <span className="font-bold tabular-nums text-texto">{formatearMoneda(p.monto_cents, moneda)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <span id={`${id}-metodo`} className="text-xs font-semibold text-texto-2">
            Cómo pagó
          </span>
          <OpcionesSegmentadas
            etiquetaId={`${id}-metodo`}
            opciones={OPCIONES_METODO}
            valor={metodo}
            onCambiar={(m) => setMetodo(m as MetodoPago)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-texto-2">Fecha</span>
            <input
              type="date"
              value={fecha}
              max={hoyISO()}
              onChange={(e) => setFecha(e.target.value || hoyISO())}
              className="h-11 w-full rounded-xl border border-borde bg-superficie px-3 text-base text-texto outline-none focus:border-acento"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-texto-2">Referencia</span>
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Opcional"
              className="h-11 w-full rounded-xl border border-borde bg-superficie px-3 text-base text-texto placeholder:text-texto-3 outline-none focus:border-acento"
            />
          </label>
        </div>
      </div>
    </BottomSheet>
  );
}
