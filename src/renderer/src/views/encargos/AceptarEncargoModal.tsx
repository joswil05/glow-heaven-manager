import React, { useEffect, useRef, useState } from 'react';
import type { MetodoPago, MonedaPago, ParametrosSistema, VentaCompleta } from '../../../../shared/types';
import { Button, Dialogo, Field, Input, Select } from '../../components/ui';
import { formatearMoneda, usdCentavosACorCentavos } from '@core/moneda';
import { textoPagadoDeVenta } from '@core/abonos';
import { parsearACentavos } from '@core/numeros';
import { hoyISO } from '@core/fechas';
import { monedaPorDefecto, metodoPorDefecto } from '@core/preferencias';
import { cn } from '../../lib/cn';
import { TarjetasMoneda, etiquetaMonto, montoSugerido } from '../../components/TarjetasMoneda';
import { useHayCambios } from '../../lib/useHayCambios';

/**
 * "Aceptó": la clienta dijo que sí a la cotización. Es un paso propio desde
 * la 2.16: el anticipo puede llegar después, y el encargo igual pasa a "por
 * comprar". Si pagó algo en el mismo momento, se registra acá mismo, con los
 * mismos datos que un abono; el pago va primero y aceptar después (ver
 * `aceptarEncargo`), así deshacer revierte los dos.
 */
interface AceptarEncargoModalProps {
  venta: VentaCompleta | null;
  parametros: ParametrosSistema | null;
  onAceptado: (evento_grupo_id: string) => void;
  onCerrar: () => void;
}

const METODOS: { valor: MetodoPago; etiqueta: string }[] = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

const $ = (c: number) => formatearMoneda(c, 'USD');

export const AceptarEncargoModal: React.FC<AceptarEncargoModalProps> = ({ venta, parametros, onAceptado, onCerrar }) => {
  const [pago, setPago] = useState(false);
  const [monto, setMonto] = useState('');
  const [moneda, setMoneda] = useState<MonedaPago>('USD');
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  /** Lo del monto, en su campo. */
  const [error, setError] = useState<string | null>(null);
  /** Lo que responde el servidor (sin conexión…): arriba, aparte del monto (ENC-21). */
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [versionFormulario, setVersionFormulario] = useState(0);
  const montoRef = useRef<HTMLInputElement>(null);
  const noPagoRef = useRef<HTMLButtonElement>(null);

  // Lo que falta del anticipo: lo más probable es que pague eso.
  const falta = venta ? Math.max(0, venta.anticipo_esperado_usd_cents - venta.pagado_usd_cents) : 0;

  useEffect(() => {
    if (!venta) return;
    setPago(false);
    // El anticipo está en dólares: si arranca en córdobas, se convierte con
    // la tasa del encargo, o "47.50" se leería como C$47.50.
    const monedaInicial = monedaPorDefecto(parametros);
    setMonto(montoSugerido(falta, monedaInicial, venta.tasa_cambio_cents));
    setMoneda(monedaInicial);
    setMetodo(metodoPorDefecto(parametros));
    setReferencia('');
    setFecha(hoyISO());
    setError(null);
    setErrorServidor(null);
    setVersionFormulario((n) => n + 1);
    // Se reinicia al abrir otro encargo, no cuando cambian los parámetros.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venta]);

  // Todo lo que se escribió cuenta, no sólo el monto (ENC-20): la referencia o
  // el método se perdían con Escape sin preguntar.
  const hayCambios = useHayCambios(
    JSON.stringify([pago, monto, moneda, metodo, referencia.trim(), fecha]),
    versionFormulario
  );

  // Si el monto sigue siendo lo que falta del anticipo, se escribe en la
  // moneda nueva: "47.50" dólares no son C$47.50 (PAG-02).
  const cambiarMoneda = (m: MonedaPago) => {
    if (venta && monto === montoSugerido(falta, moneda, venta.tasa_cambio_cents)) {
      setMonto(montoSugerido(falta, m, venta.tasa_cambio_cents));
    }
    setMoneda(m);
  };

  const elegirPago = (si: boolean) => {
    setPago(si);
    setError(null);
  };

  const centavos = parsearACentavos(monto, { min: 0.01 });
  const enUsd =
    venta && centavos !== null
      ? moneda === 'COR'
        ? Math.round((centavos * 100) / venta.tasa_cambio_cents)
        : centavos
      : 0;

  const guardar = async () => {
    if (!venta || guardando) return;
    if (pago && centavos === null) {
      setError('Escribí cuánto pagó, o elegí "Todavía no".');
      montoRef.current?.focus();
      return;
    }
    setGuardando(true);
    setError(null);
    setErrorServidor(null);
    const r = await window.api.ventas.aceptar(
      venta.id,
      pago && centavos !== null
        ? { fecha, monto_cents: centavos, moneda, metodo, referencia: referencia.trim() || undefined }
        : undefined
    );
    setGuardando(false);
    if (!r.success) return setErrorServidor(r.error);
    onAceptado(r.data.evento_grupo_id);
    onCerrar();
  };

  const opcion = (activa: boolean) =>
    cn(
      'rounded-md px-3 py-1.5 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
      activa ? 'bg-superficie text-texto font-medium shadow-2xs' : 'text-texto-3 hover:text-texto'
    );

  return (
    <Dialogo
      abierto={Boolean(venta)}
      titulo={venta ? `${venta.cliente_nombre ?? 'La clienta'} aceptó` : ''}
      ancho="md"
      encima
      hayCambios={hayCambios}
      ocupado={guardando}
      onCerrar={onCerrar}
      onEnviar={guardar}
      // "Cancelar" pregunta, como Escape, si hay algo escrito.
      pie={(cerrar) => (
        venta && (
          <>
            <span className="text-label text-texto-2 tabular">
              {venta.codigo} · {$(venta.total_usd_cents)}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={cerrar} disabled={guardando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={guardar} disabled={guardando} className="min-w-[7.5rem]">
                {guardando ? 'Guardando…' : 'Aceptó'}
              </Button>
            </div>
          </>
        )
      )}
    >
      {venta && (
        <>
          {errorServidor && (
            <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-label text-danger-800">
              {errorServidor}
            </p>
          )}
          <p className="text-body text-texto-2">
            Pasa a <strong className="text-texto">por comprar</strong>. El anticipo es de{' '}
            <span className="tabular">{$(venta.anticipo_esperado_usd_cents)}</span>
            {venta.pagado_usd_cents > 0 && (
              <>
                {' '}
                y ya pagó <span className="tabular">{textoPagadoDeVenta(venta)}</span>
              </>
            )}
            .
          </p>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-body text-texto">¿Pagó algo ya?</p>
            <div className="inline-flex rounded-lg bg-superficie-2 p-0.5" role="radiogroup" aria-label="Si pagó algo al aceptar">
              <button ref={noPagoRef} type="button" role="radio" aria-checked={!pago} onClick={() => elegirPago(false)} className={opcion(!pago)} autoFocus>
                Todavía no
              </button>
              <button type="button" role="radio" aria-checked={pago} onClick={() => elegirPago(true)} className={opcion(pago)}>
                Sí, pagó
              </button>
            </div>
          </div>

          {pago && (
            <div className="space-y-3 animate-fila-nueva">
              {/* Las tarjetas de Registrar y Corregir abono (PAG-01). */}
              <TarjetasMoneda valor={moneda} onCambiar={cambiarMoneda} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={etiquetaMonto(moneda)} error={error ?? undefined}>
                  <Input
                    ref={montoRef}
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                    placeholder="0.00"
                    className="text-right tabular"
                    inputMode="decimal"
                    autoFocus
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </Field>
                <Field label="Fecha">
                  <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                </Field>
              </div>
              {/* La equivalencia, como en Registrar abono: acá no había (PAG-02). */}
              {centavos !== null && (
                <p className="text-caption text-texto-3 tabular">
                  {formatearMoneda(centavos, moneda)} a la tasa de este encargo (
                  {formatearMoneda(venta.tasa_cambio_cents, 'COR')}) son{' '}
                  {moneda === 'COR'
                    ? $(enUsd)
                    : formatearMoneda(usdCentavosACorCentavos(centavos, venta.tasa_cambio_cents), 'COR')}
                  .
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
                  <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Opcional" />
                </Field>
              </div>
              {enUsd > 0 && enUsd < falta && (
                <p className="text-caption text-texto-3 tabular">
                  Del anticipo quedan faltando {$(falta - enUsd)}.
                </p>
              )}
            </div>
          )}

          {error && !pago && <p className="text-label text-danger-600">{error}</p>}
        </>
      )}
    </Dialogo>
  );
};
