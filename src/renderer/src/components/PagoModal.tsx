import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { VentaCompleta, MetodoPago, MonedaPago, ParametrosSistema, Pago } from '../../../shared/types';
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
  Dialogo,
} from './ui';
import { parsearDecimal } from '@core/numeros';
import {
  usdCentavosACorCentavos,
  formatearMoneda,
  formatearFecha,
  relativoAHoy,
} from '@core/moneda';
import { useToast } from '../context/ToastContext';
import { textoPagado, textoEquivalente, textoQuien } from '@core/abonos';
import { cn } from '../lib/cn';
import { hoyISO } from '@core/fechas';
import { monedaPorDefecto, metodoPorDefecto } from '@core/preferencias';

interface PagoModalProps {
  abierto: boolean;
  venta: VentaCompleta | null;
  onCerrar: () => void;
  onRegistrado: () => Promise<void>;
  /** Para arrancar con la moneda y el método que ella eligió. */
  parametros?: ParametrosSistema | null;
  /** Abre la corrección de un abono ya registrado, encima de este diálogo. */
  onCorregir?: (pago: Pago) => void;
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
  parametros,
  onCorregir,
}) => {
  const { showToast, showUndoToast } = useToast();

  const [montoTexto, setMontoTexto] = useState('');
  const [moneda, setMoneda] = useState<MonedaPago>(monedaPorDefecto(parametros));
  const [metodo, setMetodo] = useState<MetodoPago>(metodoPorDefecto(parametros));
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [fecha, setFecha] = useState(() => hoyISO());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [anulandoId, setAnulandoId] = useState<number | null>(null);
  /** Lo que el formulario sugirió al abrirse: si sigue igual, cerrar no pregunta. */
  const [montoInicial, setMontoInicial] = useState('');

  useEffect(() => {
    if (!abierto || !venta) return;
    setError(null);
    // La moneda y el método que ella eligió en Configuración. Hasta la 2.15
    // se pisaban acá con dólares y efectivo, y la preferencia no servía.
    const monedaInicial = monedaPorDefecto(parametros);
    setMoneda(monedaInicial);
    setMetodo(metodoPorDefecto(parametros));
    setReferencia('');
    setNotas('');
    setFecha(hoyISO());

    // La cuota pendiente más vieja es lo que el cliente viene a pagar casi
    // siempre. Si no hay plan, el saldo completo.
    const cuotaPendiente = venta.cuotas.find((c) => c.pagado_usd_cents < c.monto_usd_cents);
    const sugerido = cuotaPendiente
      ? cuotaPendiente.monto_usd_cents - cuotaPendiente.pagado_usd_cents
      : venta.saldo_usd_cents;

    // El sugerido está en dólares: si arranca en córdobas, se convierte con la
    // tasa de la venta. Sin esto, "25.00" se leería como C$25.
    const enMoneda = monedaInicial === 'COR' ? usdCentavosACorCentavos(sugerido, venta.tasa_cambio_cents) : sugerido;
    const texto = sugerido > 0 ? (enMoneda / 100).toFixed(2) : '';
    setMontoTexto(texto);
    setMontoInicial(texto);
    // Se reinicia al abrir, no cuando cambian los parámetros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, venta]);

  const montoCents = Math.round((parsearDecimal(montoTexto) ?? 0) * 100);

  const montoEnUsd = useMemo(() => {
    if (!venta) return 0;
    return moneda === 'COR'
      ? Math.round((montoCents * 100) / venta.tasa_cambio_cents)
      : montoCents;
  }, [montoCents, moneda, venta]);

  const saldoDespues = venta ? venta.saldo_usd_cents - montoEnUsd : 0;
  const esAnticipo =
    !!venta && venta.tipo === 'ENCARGO' && venta.pagado_usd_cents < venta.anticipo_esperado_usd_cents;
  const anticipoQuedaCubierto =
    !!venta && esAnticipo && venta.pagado_usd_cents + montoEnUsd >= venta.anticipo_esperado_usd_cents;
  const hayCambios = montoTexto !== montoInicial || referencia.trim() !== '' || notas.trim() !== '';
  /** El error del monto va en su campo; el resto, arriba. */
  const errorMonto = error === 'Escribí cuánto pagó la clienta.' ? error : undefined;

  const registrar = async () => {
    if (!venta || guardando) return;
    if (montoCents <= 0) {
      setError('Escribí cuánto pagó la clienta.');
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
          ? `Abono registrado. La clienta pagó ${formatearMoneda(r.data.excedente_usd_cents, 'USD')} de más.`
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
    <Dialogo
      abierto={abierto && Boolean(venta)}
      titulo={venta ? `Registrar abono · ${venta.codigo}` : 'Registrar abono'}
      ancho="xl"
      hayCambios={hayCambios}
      onCerrar={onCerrar}
      onEnviar={registrar}
      pie={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
            Cerrar
          </Button>
          <Button variant="primary" onClick={registrar} disabled={guardando || montoCents <= 0} className="min-w-[9.5rem]">
            {guardando ? 'Registrando…' : 'Registrar abono'}
          </Button>
        </div>
      }
    >
      {venta && (
        <div className="space-y-4">
          <p className="text-caption text-texto-3 -mt-2">{venta.cliente_nombre ?? 'Mostrador'}</p>

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

          {error && !errorMonto && (
            <div className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3">
              <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-label text-danger-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Cuánto pagó" error={errorMonto}>
              <Input
                value={montoTexto}
                onChange={(e) => {
                  setMontoTexto(e.target.value);
                  if (errorMonto) setError(null);
                }}
                placeholder="0.00"
                className="text-right tabular"
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
            <Field label="Referencia">
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
                    Queda saldada y la clienta paga {formatearMoneda(-saldoDespues, 'USD')} de
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
                      {/* En la moneda en que pagó, y entre paréntesis la otra. */}
                      <div className="text-label text-texto tabular">
                        {textoPagado(p)} <span className="text-texto-3">({textoEquivalente(p)})</span>
                      </div>
                      <div className="text-caption text-texto-3">
                        {formatearFecha(p.fecha)} · {p.metodo.toLowerCase()}
                        {p.es_anticipo ? ' · anticipo' : ''}
                        {p.referencia ? ` · ${p.referencia}` : ''}
                        {` · ${textoQuien(p)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onCorregir && (
                        <Button size="sm" variant="ghost" className="text-texto-3 hover:text-texto" onClick={() => onCorregir(p)}>
                          Corregir
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-texto-3 hover:text-danger-700"
                        onClick={() => setAnulandoId(p.id)}
                      >
                        Anular
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

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
    </Dialogo>
  );
};
