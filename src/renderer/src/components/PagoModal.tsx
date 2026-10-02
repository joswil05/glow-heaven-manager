import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { VentaCompleta, Venta, MetodoPago, MonedaPago, ParametrosSistema, Pago } from '../../../shared/types';
import {
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Badge,
  Money,
  BarraProgreso,
  Dialogo,
} from './ui';
import { AnularOBorrarAbono } from './AnularOBorrar';
import { TarjetasMoneda, etiquetaMonto, montoSugerido } from './TarjetasMoneda';
import { parsearDecimal } from '@core/numeros';
import {
  usdCentavosACorCentavos,
  formatearMoneda,
  formatearFecha,
  relativoAHoy,
} from '@core/moneda';
import { useToast } from '../context/ToastContext';
import {
  textoPagado,
  textoEquivalente,
  textoQuien,
  textoPagadoDeVenta,
  textoTotalEn,
  monedaDeLosAbonos,
} from '@core/abonos';
import { repartirAbono, ventasPorAntiguedad, tasaDeLaVenta } from '@core/reparto';
import { cordobasQueSeDeben } from '@core/mensajes';
import { METODO_TEXTO } from '@core/exportar';
import { cn } from '../lib/cn';
import { hoyISO } from '@core/fechas';
import { monedaPorDefecto, metodoPorDefecto } from '@core/preferencias';

/** Una clienta para elegir en el modo "a la cuenta". */
interface ClientaParaAbonar {
  id: number;
  nombre: string;
  saldo_pendiente_usd_cents: number;
}

interface PagoModalProps {
  abierto: boolean;
  /** "A esta venta": el abono va a esta venta. */
  venta?: VentaCompleta | null;
  /**
   * "A la cuenta de la clienta": reparte por antigüedad, y muestra antes a
   * qué ventas va. Con `clienteId` la clienta viene dada (su ficha); sin él,
   * se elige de `clientas` (Cobros).
   */
  cuenta?: { clienteId?: number; clientas?: ClientaParaAbonar[] } | null;
  onCerrar: () => void;
  onRegistrado: () => Promise<void>;
  /** Para arrancar con la moneda y el método que ella eligió. */
  parametros?: ParametrosSistema | null;
  /** Abre la corrección de un abono ya registrado, encima de este diálogo. */
  onCorregir?: (pago: Pago) => void;
}

const METODOS: MetodoPago[] = ['EFECTIVO', 'TRANSFERENCIA', 'OTRO'];

const ERROR_MONTO = 'Escribí cuánto pagó la clienta.';
const ERROR_CLIENTA = 'Elegí a qué clienta es el abono.';

/**
 * Registrar un abono: la única ventana de abono de Windows (TRA-02).
 *
 * Había cuatro: ésta (Ventas y Encargos), la de Cobros, una desplegable en la
 * ficha de Clientes y la de Aceptó, cada una con sus controles, sus textos y
 * sus protecciones. La de Cobros, la más a mano, no tenía equivalencia, ni
 * "cómo queda", ni Deshacer, y no decía a qué ventas iba la plata. Ahora las
 * dos puertas abren ésta, en uno de sus dos modos.
 */
export const PagoModal: React.FC<PagoModalProps> = ({
  abierto,
  venta,
  cuenta,
  onCerrar,
  onRegistrado,
  parametros,
  onCorregir,
}) => {
  const { showToast, showUndoToast } = useToast();
  const aLaCuenta = !venta && Boolean(cuenta);

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
  /** Lo sugerido, en dólares: al cambiar de moneda se vuelve a escribir. */
  const [sugeridoUsd, setSugeridoUsd] = useState(0);

  // Modo "a la cuenta": la clienta y sus ventas con saldo.
  const [clienteId, setClienteId] = useState<number | undefined>();
  const [ventasCuenta, setVentasCuenta] = useState<Venta[] | null>(null);

  useEffect(() => {
    if (!abierto || (!venta && !cuenta)) return;
    setError(null);
    // La moneda y el método que ella eligió en Configuración, en las dos
    // puertas (TRA-11): Cobros y Clientes arrancaban fijos en córdobas.
    const monedaInicial = monedaPorDefecto(parametros);
    setMoneda(monedaInicial);
    setMetodo(metodoPorDefecto(parametros));
    setReferencia('');
    setNotas('');
    setFecha(hoyISO());

    if (venta) {
      // La cuota pendiente más vieja es lo que viene a pagar casi siempre. Si
      // no hay plan, el saldo completo.
      const cuotaPendiente = venta.cuotas.find((c) => c.pagado_usd_cents < c.monto_usd_cents);
      const sugerido = cuotaPendiente
        ? cuotaPendiente.monto_usd_cents - cuotaPendiente.pagado_usd_cents
        : venta.saldo_usd_cents;
      // En la moneda elegida, con la tasa de la venta: "25.00" no es C$25.
      const texto = montoSugerido(sugerido, monedaInicial, venta.tasa_cambio_cents);
      setSugeridoUsd(sugerido);
      setMontoTexto(texto);
      setMontoInicial(texto);
    } else {
      // A la cuenta, el monto es lo que llegó: no se sugiere nada.
      setSugeridoUsd(0);
      setMontoTexto('');
      setMontoInicial('');
      setClienteId(cuenta?.clienteId);
    }
    // Se reinicia al abrir, no cuando cambian los parámetros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, venta, cuenta?.clienteId]);

  // Las ventas de la clienta, para mostrar a cuáles va el abono.
  useEffect(() => {
    if (!abierto || !aLaCuenta || !clienteId) {
      setVentasCuenta(null);
      return;
    }
    let vigente = true;
    setVentasCuenta(null);
    window.api.ventas.list({ cliente_id: clienteId }).then((r) => {
      if (!vigente) return;
      if (r.success) setVentasCuenta(r.data);
      else setError(r.error);
    });
    return () => {
      vigente = false;
    };
  }, [abierto, aLaCuenta, clienteId]);

  const montoCents = Math.round((parsearDecimal(montoTexto) ?? 0) * 100);
  const tasaVenta = venta?.tasa_cambio_cents ?? 3662;

  const montoEnUsd = useMemo(() => {
    if (!venta) return 0;
    return moneda === 'COR' ? Math.round((montoCents * 100) / venta.tasa_cambio_cents) : montoCents;
  }, [montoCents, moneda, venta]);

  const debeCuenta = useMemo(() => ventasPorAntiguedad(ventasCuenta ?? []), [ventasCuenta]);
  const partes = useMemo(
    () => (aLaCuenta && montoCents > 0 ? repartirAbono(debeCuenta, montoCents, moneda) : []),
    [aLaCuenta, debeCuenta, montoCents, moneda]
  );
  const debeCuentaUsd = debeCuenta.reduce((s, v) => s + v.saldo_usd_cents, 0);
  const pagaCuentaUsd = partes.reduce((s, p) => s + p.monto_usd_cents, 0);

  const saldoDespues = venta ? venta.saldo_usd_cents - montoEnUsd : debeCuentaUsd - pagaCuentaUsd;
  const esAnticipo =
    !!venta && venta.tipo === 'ENCARGO' && venta.pagado_usd_cents < venta.anticipo_esperado_usd_cents;
  const anticipoQuedaCubierto =
    !!venta && esAnticipo && venta.pagado_usd_cents + montoEnUsd >= venta.anticipo_esperado_usd_cents;
  const hayCambios =
    montoTexto !== montoInicial ||
    referencia.trim() !== '' ||
    notas.trim() !== '' ||
    (aLaCuenta && !cuenta?.clienteId && clienteId !== undefined);
  /** Los errores de un campo van en su campo; el resto, arriba. */
  const errorMonto = error === ERROR_MONTO ? error : undefined;
  const errorClienta = error === ERROR_CLIENTA ? error : undefined;
  const montoRef = useRef<HTMLInputElement>(null);
  const clientaRef = useRef<HTMLSelectElement>(null);

  const cambiarMoneda = (m: MonedaPago) => {
    // Si el monto sigue siendo el sugerido, se escribe en la moneda nueva.
    if (montoTexto === montoInicial && sugeridoUsd > 0) {
      const texto = montoSugerido(sugeridoUsd, m, tasaVenta);
      setMontoTexto(texto);
      setMontoInicial(texto);
    }
    setMoneda(m);
  };

  const registrar = async () => {
    if (guardando || (!venta && !aLaCuenta)) return;
    if (aLaCuenta && !clienteId) {
      setError(ERROR_CLIENTA);
      clientaRef.current?.focus();
      return;
    }
    if (montoCents <= 0) {
      // El botón queda activo y el error va al campo, con el foco ahí (PAG-05):
      // un botón gris no decía por qué.
      setError(ERROR_MONTO);
      montoRef.current?.focus();
      return;
    }
    if (aLaCuenta && ventasCuenta && debeCuenta.length === 0) {
      setError('No tiene ninguna venta ni encargo con saldo: no hay a qué cargar el abono.');
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const comun = {
        fecha,
        monto_cents: montoCents,
        moneda,
        metodo,
        referencia: referencia.trim() || undefined,
        notas: notas.trim() || undefined,
      };
      const r = venta
        ? await window.api.pagos.registrar({ venta_id: venta.id, ...comun })
        : await window.api.pagos.registrarAbonoCliente({ cliente_id: clienteId!, ...comun });

      if (!r.success) {
        setError(r.error);
        return;
      }

      const pagado = formatearMoneda(montoCents, moneda);
      const mensaje = venta
        ? r.data.excedente_usd_cents > 0
          ? `Abono de ${pagado} registrado. Pagó ${formatearMoneda(r.data.excedente_usd_cents, 'USD')} de más.`
          : r.data.saldo_usd_cents <= 0
            ? `Abono de ${pagado} registrado. La venta quedó saldada.`
            : `Abono de ${pagado} registrado. Queda ${formatearMoneda(r.data.saldo_usd_cents, 'USD')}.`
        : saldoDespues < 0
          ? `Abono de ${pagado} registrado. Quedó al día y pagó ${formatearMoneda(-saldoDespues, 'USD')} de más.`
          : saldoDespues === 0
            ? `Abono de ${pagado} registrado. Quedó al día.`
            : `Abono de ${pagado} registrado. Queda debiendo ${formatearMoneda(saldoDespues, 'USD')}.`;

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

  const clientas = cuenta?.clientas ?? [];
  const nombreClienta = venta
    ? (venta.cliente_nombre ?? 'Mostrador')
    : clientas.find((c) => c.id === clienteId)?.nombre;

  /** La equivalencia de lo escrito, con la tasa de cada venta que lo recibe. */
  const equivalencia = (() => {
    if (montoCents <= 0) return null;
    if (venta) {
      const otra = moneda === 'COR' ? formatearMoneda(montoEnUsd, 'USD') : formatearMoneda(usdCentavosACorCentavos(montoCents, tasaVenta), 'COR');
      return `${formatearMoneda(montoCents, moneda)} a la tasa de esta venta (${formatearMoneda(tasaVenta, 'COR')}) son ${otra}.`;
    }
    if (partes.length === 0) return null;
    const otra =
      moneda === 'COR'
        ? formatearMoneda(pagaCuentaUsd, 'USD')
        : formatearMoneda(
            partes.reduce((s, p) => s + Math.round((p.monto_cents * tasaDeLaVenta(debeCuenta.find((v) => v.id === p.venta_id)!)) / 100), 0),
            'COR'
          );
    return partes.length === 1
      ? `${formatearMoneda(montoCents, moneda)} a la tasa de ${partes[0].codigo} son ${otra}.`
      : `${formatearMoneda(montoCents, moneda)} son ${otra}, con la tasa de cada venta.`;
  })();

  return (
    <Dialogo
      abierto={abierto && (Boolean(venta) || aLaCuenta)}
      titulo={venta ? `Registrar abono · ${venta.codigo}` : 'Registrar abono'}
      ancho={venta ? 'xl' : 'lg'}
      hayCambios={hayCambios}
      ocupado={guardando}
      onCerrar={onCerrar}
      onEnviar={registrar}
      // "Cancelar" pregunta, como Escape, si hay algo escrito. Decía
      // "Cerrar", y en las demás ventanas "Cancelar" (PAG-07).
      pie={(cerrar) => (
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="secondary" onClick={cerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={registrar} disabled={guardando} className="min-w-[9.5rem]">
            {guardando ? 'Registrando…' : 'Registrar abono'}
          </Button>
        </div>
      )}
    >
      {(venta || aLaCuenta) && (
        <div className="space-y-4">
          {venta || cuenta?.clienteId ? (
            <p className="text-caption text-texto-3 -mt-2">
              {aLaCuenta ? `A la cuenta de ${nombreClienta ?? 'la clienta'}: paga primero lo más viejo.` : nombreClienta}
            </p>
          ) : (
            <Field label="Clienta" error={errorClienta}>
              <Select
                ref={clientaRef}
                value={clienteId ?? ''}
                onChange={(e) => {
                  setClienteId(e.target.value ? Number(e.target.value) : undefined);
                  if (errorClienta) setError(null);
                }}
                autoFocus
              >
                <option value="">Elegí la clienta</option>
                {clientas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.saldo_pendiente_usd_cents > 0 ? ` · debe ${formatearMoneda(c.saldo_pendiente_usd_cents, 'USD')}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {/* Estado de la cuenta de la venta */}
          {venta && (
            <div className="rounded-lg border border-borde bg-superficie-2 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <span className="block text-caption text-texto-3">Total de la venta</span>
                  <Money usd_cents={venta.total_usd_cents} size="md" tasa_cambio_cents={venta.tasa_cambio_cents} />
                </div>
                <div className="text-right">
                  <span className="block text-caption text-texto-3">Debe</span>
                  {/* Con su conversión, como el total (PAG-04). */}
                  <Money usd_cents={venta.saldo_usd_cents} size="md" tasa_cambio_cents={venta.tasa_cambio_cents} />
                </div>
              </div>
              <BarraProgreso
                actual={venta.pagado_usd_cents}
                total={venta.total_usd_cents}
                tono={venta.saldo_usd_cents <= 0 ? 'success' : 'brand'}
                etiqueta="Pagado de la venta"
              />
              {/* En la moneda en que viene pagando: la lista de abajo dice
                  "C$600.00" y acá decía "$16.38" (PAG-03). */}
              <p className="mt-1.5 text-caption text-texto-3">
                Ya pagó {textoPagadoDeVenta(venta)} de{' '}
                {textoTotalEn(monedaDeLosAbonos(venta.pagos), venta.total_usd_cents, venta.tasa_cambio_cents)}
              </p>
            </div>
          )}

          {esAnticipo && venta && (
            <div className="rounded-md border border-warning-200 bg-warning-50 p-3">
              <p className="text-label text-warning-800">
                Este encargo espera un anticipo de{' '}
                {formatearMoneda(venta.anticipo_esperado_usd_cents, 'USD')}. Cuando se complete,
                el encargo queda listo para comprar.
              </p>
            </div>
          )}

          {error && !errorMonto && !errorClienta && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3">
              <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-label text-danger-800">{error}</p>
            </div>
          )}

          {/* La moneda primero y a la vista: el monto se lee en ella (PAG-01). */}
          <TarjetasMoneda valor={moneda} onCambiar={cambiarMoneda} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={etiquetaMonto(moneda)} error={errorMonto}>
              <Input
                ref={montoRef}
                value={montoTexto}
                onChange={(e) => {
                  setMontoTexto(e.target.value);
                  if (errorMonto) setError(null);
                }}
                // Seleccionado al entrar: lo sugerido se reemplaza escribiendo
                // encima, sin borrarlo a mano (PAG-09).
                onFocus={(e) => e.currentTarget.select()}
                placeholder="0.00"
                className="text-right tabular"
                inputMode="decimal"
                autoFocus={Boolean(venta || cuenta?.clienteId)}
              />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
          </div>

          {equivalencia && <p className="text-caption text-texto-3 tabular">{equivalencia}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Cómo pagó">
              <Select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)}>
                {METODOS.map((m) => (
                  <option key={m} value={m}>
                    {METODO_TEXTO[m]}
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

          {/* A qué ventas va: antes de registrar, no después (TRA-02, COB-03). */}
          {aLaCuenta && clienteId !== undefined && (
            <ADondeVa
              cargando={ventasCuenta === null}
              debe={debeCuenta}
              partes={partes}
              moneda={moneda}
              tasaDeHoy={parametros?.tasa_cambio_cents ?? 3662}
            />
          )}

          {/* Cómo queda después */}
          {montoCents > 0 && (venta || partes.length > 0) && (
            <div
              className={cn(
                'rounded-md border p-3 flex items-start gap-2',
                saldoDespues <= 0 ? 'border-success-200 bg-success-50' : 'border-borde bg-superficie-2'
              )}
            >
              {/* El visto sólo cuando queda saldada: dice "terminado" (PAG-06). */}
              {saldoDespues <= 0 ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-success-600" />
              ) : (
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-texto-3" />
              )}
              <div className="text-label tabular">
                {saldoDespues < 0 ? (
                  <p className="text-success-800">
                    {venta ? 'Queda saldada' : 'Queda al día'} y paga {formatearMoneda(-saldoDespues, 'USD')} de más.
                  </p>
                ) : saldoDespues === 0 ? (
                  <p className="text-success-800">
                    {venta ? 'Con esto la venta queda saldada.' : 'Con esto queda al día.'}
                  </p>
                ) : (
                  <p className="text-texto">
                    Después de este abono va a deber {formatearMoneda(saldoDespues, 'USD')} (≈{' '}
                    {formatearMoneda(
                      venta
                        ? usdCentavosACorCentavos(saldoDespues, venta.tasa_cambio_cents)
                        : cordobasQueSeDeben(
                            debeCuenta.map((v) => ({
                              ...v,
                              saldo_usd_cents:
                                partes.find((p) => p.venta_id === v.id)?.saldo_despues_usd_cents ?? v.saldo_usd_cents,
                            })),
                            parametros?.tasa_cambio_cents ?? 3662
                          ),
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
          {venta && venta.cuotas.length > 0 && (
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
          {venta && venta.pagos.length > 0 && (
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
                        {/* "Otro método", no "· otro" (PAG-08). */}
                        {formatearFecha(p.fecha)} · {p.metodo === 'OTRO' ? 'Otro método' : METODO_TEXTO[p.metodo]}
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

      <AnularOBorrarAbono
        abono={venta?.pagos.find((p) => p.id === anulandoId) ?? null}
        pedirPin={Boolean(parametros?.pin_seguridad)}
        onAnular={async (p) => {
          await anular(p.id);
          return null;
        }}
        onBorrado={onRegistrado}
        onCerrar={() => setAnulandoId(null)}
      />
    </Dialogo>
  );
};

/**
 * Lo que debe, venta por venta, y lo que recibe cada una de este abono. Es
 * lo que antes no se veía: tocar "Registrar abono" en Cobros mandaba la plata
 * a la venta más vieja sin decirlo.
 */
const ADondeVa: React.FC<{
  cargando: boolean;
  debe: Venta[];
  partes: ReturnType<typeof repartirAbono>;
  moneda: MonedaPago;
  tasaDeHoy: number;
}> = ({ cargando, debe, partes, moneda, tasaDeHoy }) => {
  if (cargando) return <p className="text-caption text-texto-3">Buscando lo que debe…</p>;
  if (debe.length === 0) {
    return (
      <p className="text-label text-texto-2 rounded-md bg-superficie-2 p-3">
        No debe nada: no tiene ventas ni encargos con saldo.
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-borde">
      <div className="px-4 py-2.5 border-b border-borde flex items-baseline justify-between gap-2">
        <span className="text-label font-medium text-texto-2">A qué va el abono</span>
        <span className="text-caption text-texto-3 tabular">
          Debe {formatearMoneda(debe.reduce((s, v) => s + v.saldo_usd_cents, 0), 'USD')} (≈{' '}
          {formatearMoneda(cordobasQueSeDeben(debe, tasaDeHoy), 'COR')})
        </span>
      </div>
      <ul className="divide-y divide-borde">
        {debe.map((v) => {
          const parte = partes.find((p) => p.venta_id === v.id);
          return (
            <li key={v.id} className="px-4 py-2 flex items-center justify-between gap-3 tabular">
              <div className="min-w-0">
                <span className="text-label text-texto">{v.codigo}</span>
                <span className="text-caption text-texto-3"> · {formatearFecha(v.fecha)} · debe {formatearMoneda(v.saldo_usd_cents, 'USD')}</span>
              </div>
              <span className={cn('text-label shrink-0', parte ? 'text-texto' : 'text-texto-3')}>
                {!parte
                  ? 'No le toca'
                  : `${formatearMoneda(parte.monto_cents, moneda)} · ${
                      parte.saldo_despues_usd_cents <= 0
                        ? 'queda saldada'
                        : `queda ${formatearMoneda(parte.saldo_despues_usd_cents, 'USD')}`
                    }`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
