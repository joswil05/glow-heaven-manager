import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { Pago, MetodoPago, MonedaPago } from '@shared/types';
import { PagosRepoFirestore } from '@repos/pagos.repo';
import { formatearMoneda } from '@core/moneda';
import { parsearACentavos } from '@core/numeros';
import { useDatosNegocio } from '../context/DataContext';
import { useSnackbar } from './Snackbar';
import { BottomSheet } from './BottomSheet';
import { nuevoGrupoEvento } from '../lib/util';
import { haptics } from '../lib/haptics';

const montoOriginal = (p: Pago) => ((p.moneda === 'COR' ? p.monto_cor_cents : p.monto_usd_cents) / 100).toFixed(2);

/**
 * Corregir un abono mal cargado: el monto, la moneda, cómo pagó o la fecha.
 * Con la tasa del abono, no la de hoy.
 */
export function CorregirAbonoSheet({
  pago,
  codigo,
  onCerrar,
}: {
  pago: Pago | null;
  /** El código de la venta, para el título. */
  codigo?: string;
  onCerrar: () => void;
}) {
  const { marcarCambio } = useDatosNegocio();
  const { mostrar } = useSnackbar();
  const [montoTexto, setMontoTexto] = useState('');
  const [moneda, setMoneda] = useState<MonedaPago>('COR');
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [fecha, setFecha] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!pago) return;
    setMontoTexto(montoOriginal(pago));
    setMoneda(pago.moneda);
    setMetodo(pago.metodo);
    setFecha(pago.fecha);
    setError(null);
  }, [pago]);

  const montoCents = parsearACentavos(montoTexto, { min: 0.01 });
  const enDolares =
    pago && montoCents !== null && moneda === 'COR' ? Math.round((montoCents * 100) / pago.tasa_cambio_cents) : null;

  async function guardar() {
    if (!pago || guardando) return;
    if (montoCents === null) {
      setError('Escribí cuánto pagó de verdad.');
      return;
    }
    setGuardando(true);
    try {
      await PagosRepoFirestore.corregir(
        pago.id,
        { fecha, monto_cents: montoCents, moneda, metodo, referencia: pago.referencia, notas: pago.notas },
        nuevoGrupoEvento()
      );
      haptics.impact('medium');
      mostrar('Abono corregido', 'success');
      marcarCambio();
      onCerrar();
    } catch (err) {
      mostrar(err instanceof Error && err.message ? err.message : 'No se pudo corregir. Probá de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <BottomSheet
      abierto={pago !== null}
      onCerrar={onCerrar}
      titulo={codigo ? `Corregir abono · ${codigo}` : 'Corregir abono'}
      subtitulo={
        pago
          ? `Se cargó ${formatearMoneda(pago.moneda === 'COR' ? pago.monto_cor_cents : pago.monto_usd_cents, pago.moneda === 'COR' ? 'COR' : 'USD')} el ${pago.fecha}`
          : undefined
      }
      footer={
        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento px-5 py-3.5 text-sm font-extrabold text-acento-texto shadow-lg shadow-m3-2 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
        >
          {guardando ? <Loader2 size={19} className="animate-spin" /> : <CheckCircle2 size={19} />}
          <span>{guardando ? 'Guardando…' : 'Guardar corrección'}</span>
        </button>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="abono-monto" className="text-xs font-bold text-texto-2">
            Cuánto pagó ({moneda === 'COR' ? 'C$' : 'US$'})
          </label>
          <input
            id="abono-monto"
            // Texto, no `type="number"`: el parser de `@core/numeros` necesita
            // el texto crudo para distinguir miles de decimales.
            type="text"
            inputMode="decimal"
            autoFocus
            value={montoTexto}
            onChange={(e) => {
              setMontoTexto(e.target.value);
              setError(null);
            }}
            onFocus={(e) => e.currentTarget.select()}
            aria-invalid={error !== null}
            className="rounded-xl border border-borde bg-superficie px-3.5 py-2.5 text-base font-bold tabular-nums text-texto outline-none focus:ring-2 focus:ring-acento"
          />
          {error && <p className="text-[11px] font-semibold text-peligro">{error}</p>}
          {enDolares !== null && (
            <p className="text-[11px] text-texto-3 tabular-nums">
              A la tasa del abono son {formatearMoneda(enDolares, 'USD')}.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select
            value={moneda}
            onChange={(e) => setMoneda(e.target.value as MonedaPago)}
            aria-label="Moneda"
            className="h-10 rounded-xl border border-borde bg-superficie px-3 text-xs font-semibold text-texto outline-none"
          >
            <option value="COR">C$ Córdobas</option>
            <option value="USD">US$ Dólares</option>
          </select>
          <select
            value={metodo}
            onChange={(e) => setMetodo(e.target.value as MetodoPago)}
            aria-label="Cómo pagó"
            className="h-10 rounded-xl border border-borde bg-superficie px-3 text-xs font-semibold text-texto outline-none"
          >
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
            <option value="OTRO">Otro método</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="abono-fecha" className="text-xs font-bold text-texto-2">
            Fecha
          </label>
          <input
            id="abono-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-10 rounded-xl border border-borde bg-superficie px-3 text-xs font-semibold text-texto outline-none"
          />
        </div>
      </div>
    </BottomSheet>
  );
}
