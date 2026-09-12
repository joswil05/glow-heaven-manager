import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { VentaCompleta, MetodoPago, MonedaPago } from '../../../shared/types';
import {
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Badge,
  Money,
  BarraProgreso,
  Confirmar,
} from './ui';
import { parsearDecimal } from '@core/numeros';
import {
  usdCentavosACorCentavos,
  formatearMoneda,
  formatearFecha,
  relativoAHoy,
} from '@core/moneda';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';

interface PagoModalProps {
  abierto: boolean;
  venta: VentaCompleta | null;
  onCerrar: () => void;
  onRegistrado: () => Promise<void>;
}

const METODOS: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

export const PagoModal: React.FC<PagoModalProps> = ({
  abierto,
  venta,
  onCerrar,
  onRegistrado,
}) => {
  const { showToast, showUndoToast } = useToast();

  const [montoTexto, setMontoTexto] = useState('');
  const [moneda, setMoneda] = useState<MonedaPago>('USD');
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<number | null>(null);

  useEffect(() => {
    if (!abierto || !venta) return;
    setError(null);
    setMoneda('USD');
    setMetodo('EFECTIVO');
    setReferencia('');
    setNotas('');
    setFecha(new Date().toISOString().slice(0, 10));

    // La cuota pendiente más vieja es lo que el cliente viene a pagar casi
    // siempre. Si no hay plan, el saldo completo.
    const cuotaPendiente = venta.cuotas.find((c) => c.pagado_usd_cents < c.monto_usd_cents);
    const sugerido = cuotaPendiente
      ? cuotaPendiente.monto_usd_cents - cuotaPendiente.pagado_usd_cents
      : venta.saldo_usd_cents;

    setMontoTexto(sugerido > 0 ? (sugerido / 100).toFixed(2) : '');
  }, [abierto, venta]);

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierto, onCerrar]);

  const montoCents = Math.round((parsearDecimal(montoTexto) ?? 0) * 100);

  const montoEnUsd = useMemo(() => {
    if (!venta) return 0;
    return moneda === 'COR'
      ? Math.round((montoCents * 100) / venta.tasa_cambio_cents)
      : montoCents;
  }, [montoCents, moneda, venta]);

  if (!abierto || !venta) return null;

  const saldoDespues = venta.saldo_usd_cents - montoEnUsd;
  const esAnticipo =
    venta.tipo === 'ENCARGO' && venta.pagado_usd_cents < venta.anticipo_esperado_usd_cents;
  const anticipoQuedaCubierto =
    esAnticipo && venta.pagado_usd_cents + montoEnUsd >= venta.anticipo_esperado_usd_cents;

  const registrar = async () => {
    if (montoCents <= 0) {
      setError('Escribí cuánto pagó el cliente.');
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const r = await window.api.pagos.registrar({
        venta_id: venta.id,
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

      const mensaje =
        r.data.excedente_usd_cents > 0
          ? `Abono registrado. El cliente pagó ${formatearMoneda(r.data.excedente_usd_cents, 'USD')} de más.`
          : r.data.saldo_usd_cents <= 0
            ? 'Abono registrado. La venta quedó saldada.'
            : `Abono registrado. Queda ${formatearMoneda(r.data.saldo_usd_cents, 'USD')}.`;

      showUndoToast(mensaje, onRegistrado, r.data.evento_grupo_id);
      await onRegistrado();
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  const anular = async (pagoId: number) => {
    const r = await window.api.pagos.anular(pagoId);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast('Abono anulado', onRegistrado, r.data.evento_grupo_id);
    await onRegistrado();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-velo/40 backdrop-blur-xs p-4 cursor-pointer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-pago"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-superficie rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-borde/80 animate-modal-pop overflow-hidden cursor-default"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-borde shrink-0">
          <div>
            <h3 id="titulo-pago" className="text-title text-texto">
              Registrar abono
            </h3>
            <p className="text-caption text-texto-3">
              {venta.codigo} · {venta.cliente_nombre ?? 'Mostrador'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar">
            <X className="w-4 h-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Estado de la cuenta */}
          <div className="rounded-lg border border-borde bg-superficie-2 p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <span className="block text-caption text-texto-3">Total de la venta</span>
                <Money usd_cents={venta.total_usd_cents} size="md" />
              </div>
              <div className="text-right">
                <span className="block text-caption text-texto-3">Debe</span>
                <Money usd_cents={venta.saldo_usd_cents} size="md" soloUsd />
              </div>
            </div>
            <BarraProgreso
              actual={venta.pagado_usd_cents}
              total={venta.total_usd_cents}
              tono={venta.saldo_usd_cents <= 0 ? 'success' : 'brand'}
              etiqueta="Pagado de la venta"
            />
            <p className="mt-1.5 text-caption text-texto-3">
              Ya pagó {formatearMoneda(venta.pagado_usd_cents, 'USD')} de{' '}
              {formatearMoneda(venta.total_usd_cents, 'USD')}
            </p>
          </div>

          {esAnticipo && (
            <div className="rounded-md border border-warning-200 bg-warning-50 p-3">
              <p className="text-label text-warning-800">
                Este encargo espera un anticipo de{' '}
                {formatearMoneda(venta.anticipo_esperado_usd_cents, 'USD')}. Cuando se complete,
                el encargo queda listo para comprar.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3">
              <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-label text-danger-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Cuánto pagó">
              <Input
                value={montoTexto}
                onChange={(e) => setMontoTexto(e.target.value)}
                placeholder="0.00"
                className="text-right"
                autoFocus
              />
            </Field>
            <Field label="Moneda">
              <Select value={moneda} onChange={(e) => setMoneda(e.target.value as MonedaPago)}>
                <option value="USD">Dólares</option>
                <option value="COR">Córdobas</option>
              </Select>
            </Field>
            <Field label="Fecha">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
          </div>

          {moneda === 'COR' && montoCents > 0 && (
            <p className="text-caption text-texto-3">
              {formatearMoneda(montoCents, 'COR')} a la tasa de esta venta
              ({formatearMoneda(venta.tasa_cambio_cents, 'COR')}) son{' '}
              {formatearMoneda(montoEnUsd, 'USD')}.
            </p>
          )}

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
            <Field label="Referencia" hint="Número de transferencia, si aplica">
              <Input
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Opcional"
              />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Opcional"
            />
          </Field>

          {/* Cómo queda después */}
          {montoCents > 0 && (
            <div
              className={cn(
                'rounded-md border p-3 flex items-start gap-2',
                saldoDespues <= 0
                  ? 'border-success-200 bg-success-50'
                  : 'border-acento bg-acento-suave'
              )}
            >
              <CheckCircle2
                className={cn(
                  'w-4 h-4 shrink-0 mt-0.5',
                  saldoDespues <= 0 ? 'text-success-600' : 'text-acento'
                )}
              />
              <div className="text-label">
                {saldoDespues < 0 ? (
                  <p className="text-success-800">
                    Queda saldada y el cliente paga {formatearMoneda(-saldoDespues, 'USD')} de
                    más.
                  </p>
                ) : saldoDespues === 0 ? (
                  <p className="text-success-800">Con esto la venta queda saldada.</p>
                ) : (
                  <p className="text-acento-fuerte">
                    Después de este abono va a deber {formatearMoneda(saldoDespues, 'USD')} (
                    {formatearMoneda(
                      usdCentavosACorCentavos(saldoDespues, venta.tasa_cambio_cents),
                      'COR'
                    )}
                    ).
                  </p>
                )}
                {anticipoQuedaCubierto && (
                  <p className="text-success-800 mt-0.5">
                    El anticipo queda cubierto: ya podés comprar este encargo.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Cuotas */}
          {venta.cuotas.length > 0 && (
            <div className="rounded-lg border border-borde">
              <div className="px-4 py-2.5 border-b border-borde text-label font-medium text-texto-2">
                Plan de cuotas
              </div>
              <ul className="divide-y divide-borde">
                {venta.cuotas.map((c) => {
                  const saldada = c.pagado_usd_cents >= c.monto_usd_cents;
                  return (
                    <li key={c.id} className="px-4 py-2 flex items-center justify-between gap-2">
                      <span className="text-label text-texto-2">
                        Cuota {c.numero} · {relativoAHoy(c.fecha_vencimiento)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-label tabular text-texto">
                          {formatearMoneda(c.monto_usd_cents, 'USD')}
                        </span>
                        <Badge tone={saldada ? 'success' : c.vencida ? 'danger' : 'neutral'}>
                          {saldada ? 'Pagada' : c.vencida ? 'Vencida' : 'Pendiente'}
                        </Badge>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Abonos anteriores */}
          {venta.pagos.length > 0 && (
            <div className="rounded-lg border border-borde">
              <div className="px-4 py-2.5 border-b border-borde text-label font-medium text-texto-2">
                Abonos registrados
              </div>
              <ul className="divide-y divide-borde">
                {venta.pagos.map((p) => (
                  <li key={p.id} className="px-4 py-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-label text-texto tabular">
                        {formatearMoneda(p.monto_usd_cents, 'USD')}
                        {p.moneda === 'COR' && (
                          <span className="text-texto-3">
                            {' '}
                            ({formatearMoneda(p.monto_cor_cents, 'COR')})
                          </span>
                        )}
                      </div>
                      <div className="text-caption text-texto-3">
                        {formatearFecha(p.fecha)} · {p.metodo.toLowerCase()}
                        {p.es_anticipo ? ' · anticipo' : ''}
                        {p.referencia ? ` · ${p.referencia}` : ''}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-texto-3 hover:text-danger-700"
                      onClick={() => setAnulandoId(p.id)}
                    >
                      Anular
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Confirmar
          abierto={anulandoId !== null}
          peligroso
          titulo="¿Anular este abono?"
          consecuencias={[
            'El saldo de la venta vuelve a subir por ese monto.',
            'El abono desaparece del historial de la venta.',
          ]}
          textoConfirmar="Sí, anular el abono"
          onConfirmar={() => anulandoId !== null && anular(anulandoId)}
          onCerrar={() => setAnulandoId(null)}
        />

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-borde shrink-0">
          <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
            Cerrar
          </Button>
          <Button variant="primary" onClick={registrar} disabled={guardando || montoCents <= 0}>
            {guardando ? 'Registrando...' : 'Registrar abono'}
          </Button>
        </footer>
      </div>
    </div>
  );
};
