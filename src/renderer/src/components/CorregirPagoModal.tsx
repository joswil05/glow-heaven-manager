import React, { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Pago, Venta, MetodoPago, MonedaPago } from '../../../shared/types';
import { Button, Field, Input, Select, Textarea, Dialogo } from './ui';
import { parsearDecimal } from '@core/numeros';
import { formatearMoneda, formatearFecha } from '@core/moneda';
import { textoPagado, textoQuien } from '@core/abonos';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';

interface CorregirPagoModalProps {
  abierto: boolean;
  pago: Pago | null;
  /** La venta del abono, para decir cómo queda. Sin ella, sólo se corrige. */
  venta?: Pick<Venta, 'codigo' | 'total_usd_cents' | 'pagado_usd_cents'> | null;
  /** El código de la venta, cuando no se tiene la venta entera. */
  codigo?: string;
  /** Se abre sobre otro diálogo ("Registrar abono"). */
  encima?: boolean;
  onCerrar: () => void;
  onCorregido: () => Promise<void>;
}

const METODOS: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

/** El monto como se escribió: en córdobas si se pagó en córdobas. */
const montoOriginal = (p: Pago) => ((p.moneda === 'COR' ? p.monto_cor_cents : p.monto_usd_cents) / 100).toFixed(2);

/**
 * Corrige un abono mal cargado: el monto, la moneda, la fecha, cómo pagó, la
 * referencia o las notas. Con la tasa del abono, no la de hoy: corregir el
 * monto no cambia a cuánto estaba el dólar ese día.
 */
export const CorregirPagoModal: React.FC<CorregirPagoModalProps> = ({
  abierto,
  pago,
  venta,
  codigo,
  encima,
  onCerrar,
  onCorregido,
}) => {
  const codigoVenta = venta?.codigo ?? codigo;
  const { showUndoToast } = useToast();
  const [montoTexto, setMontoTexto] = useState('');
  const [moneda, setMoneda] = useState<MonedaPago>('USD');
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [fecha, setFecha] = useState('');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto || !pago) return;
    setMontoTexto(montoOriginal(pago));
    setMoneda(pago.moneda);
    setMetodo(pago.metodo);
    setFecha(pago.fecha);
    setReferencia(pago.referencia ?? '');
    setNotas(pago.notas ?? '');
    setError(null);
    // Se carga al abrir: el mismo abono recargado no borra lo escrito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, pago?.id]);

  if (!pago) return null;

  const montoCents = Math.round((parsearDecimal(montoTexto) ?? 0) * 100);
  const tasa = pago.tasa_cambio_cents;
  const montoUsd = moneda === 'COR' ? Math.round((montoCents * 100) / tasa) : montoCents;
  const montoCor = moneda === 'COR' ? montoCents : Math.round((montoCents * tasa) / 100);
  const hayCambios =
    montoTexto !== montoOriginal(pago) ||
    moneda !== pago.moneda ||
    metodo !== pago.metodo ||
    fecha !== pago.fecha ||
    referencia.trim() !== (pago.referencia ?? '') ||
    notas.trim() !== (pago.notas ?? '');
  const errorMonto = error === 'Escribí cuánto pagó de verdad.' ? error : undefined;
  const pagadoDespues = venta ? venta.pagado_usd_cents - pago.monto_usd_cents + montoUsd : 0;
  const saldoDespues = venta ? venta.total_usd_cents - pagadoDespues : 0;

  const guardar = async () => {
    if (guardando) return;
    if (montoCents <= 0) {
      setError('Escribí cuánto pagó de verdad.');
      return;
    }
    if (!hayCambios) {
      onCerrar();
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await window.api.pagos.corregir(pago.id, {
        fecha,
        monto_cents: montoCents,
        moneda,
        metodo,
        referencia: referencia.trim() || undefined,
        notas: notas.trim() || undefined,
      });
      if (!r.success) {
        setError(r.error);
        return;
      }
      showUndoToast(
        `Abono corregido: ${formatearMoneda(montoCents, moneda === 'COR' ? 'COR' : 'USD')}`,
        onCorregido,
        r.data.evento_grupo_id
      );
      await onCorregido();
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={abierto}
      titulo={codigoVenta ? `Corregir abono · ${codigoVenta}` : 'Corregir abono'}
      ancho="md"
      encima={encima}
      hayCambios={hayCambios}
      onCerrar={onCerrar}
      onEnviar={guardar}
      // "Cancelar" pregunta, como Escape, si hay algo escrito.
      pie={(cerrar) => (
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="secondary" onClick={cerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={guardar} disabled={guardando} className="min-w-[9.5rem]">
            {guardando ? 'Guardando…' : 'Guardar corrección'}
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <p className="text-caption text-texto-3 -mt-2 tabular">
          Se cargó {textoPagado(pago)} el {formatearFecha(pago.fecha)} · {textoQuien(pago)}
        </p>

        {error && !errorMonto && (
          <div className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3">
            <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
            <p className="text-label text-danger-800">{error}</p>
          </div>
        )}

        {/* La moneda va primero y a la vista: el monto se lee en ella. La
            original queda marcada, para que cambiarla sea una decisión. */}
        <div>
          <span id="moneda-abono" className="block text-label text-texto-2 mb-1">
            Moneda en que pagó
          </span>
          <div role="radiogroup" aria-labelledby="moneda-abono" className="grid grid-cols-2 gap-2">
            {(['COR', 'USD'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={moneda === m}
                onClick={() => setMoneda(m)}
                className={cn(
                  'rounded-lg border-2 px-3 py-2 text-left transition-[background-color,border-color,color] duration-150',
                  moneda === m ? 'border-acento bg-acento-suave/30 text-texto' : 'border-borde text-texto-2 hover:bg-superficie-2'
                )}
              >
                <span className="block text-label font-semibold">{m === 'COR' ? 'Córdobas (C$)' : 'Dólares ($)'}</span>
                {pago.moneda === m && <span className="block text-caption text-texto-3">como se registró</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={`Cuánto pagó (${moneda === 'COR' ? 'C$' : '$'})`} error={errorMonto}>
            <Input
              value={montoTexto}
              onChange={(e) => {
                setMontoTexto(e.target.value);
                if (errorMonto) setError(null);
              }}
              onFocus={(e) => e.currentTarget.select()}
              placeholder="0.00"
              className="text-right tabular"
              inputMode="decimal"
              autoFocus
            />
          </Field>
          <Field label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>

        {montoCents > 0 &&
          (moneda !== pago.moneda ? (
            <div className="flex items-start gap-2 rounded-md border border-warning-200 bg-warning-50 p-3">
              <AlertTriangle className="w-4 h-4 text-warning-600 shrink-0 mt-0.5" />
              <p className="text-label text-warning-800 tabular">
                Lo registraste en {pago.moneda === 'COR' ? 'córdobas' : 'dólares'}. Si de verdad fue en{' '}
                {moneda === 'COR' ? 'córdobas' : 'dólares'}, {formatearMoneda(montoCents, moneda === 'COR' ? 'COR' : 'USD')}{' '}
                son {moneda === 'COR' ? formatearMoneda(montoUsd, 'USD') : formatearMoneda(montoCor, 'COR')} a la tasa del abono.
              </p>
            </div>
          ) : (
            <p className="text-caption text-texto-3 tabular">
              {formatearMoneda(montoCents, moneda === 'COR' ? 'COR' : 'USD')} a la tasa del abono ({formatearMoneda(tasa, 'COR')}) son{' '}
              {moneda === 'COR' ? formatearMoneda(montoUsd, 'USD') : formatearMoneda(montoCor, 'COR')}.
            </p>
          ))}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Cómo pagó">
            <Select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
              {METODOS.map((m) => (
                <option key={m.valor} value={m.valor}>
                  {m.etiqueta}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Referencia">
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Opcional" />
          </Field>
        </div>

        <Field label="Notas">
          <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
        </Field>

        {venta && montoCents > 0 && hayCambios && (
          <p className="text-label text-texto-2 rounded-md bg-superficie-2 p-3 tabular">
            {saldoDespues > 0
              ? `La venta queda debiendo ${formatearMoneda(saldoDespues, 'USD')}.`
              : saldoDespues === 0
                ? 'La venta queda saldada.'
                : `La venta queda saldada y pagó ${formatearMoneda(-saldoDespues, 'USD')} de más.`}
          </p>
        )}
      </div>
    </Dialogo>
  );
};
