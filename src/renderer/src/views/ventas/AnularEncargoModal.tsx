import React, { useEffect, useRef, useState } from 'react';
import type { MotivoAnulacion, OpcionesAnulacion, Venta, VentaCompleta } from '../../../../shared/types';
import { Button, Dialogo, Field, Input } from '../../components/ui';
import { estadoPieza, etapaEncargo } from '@core/encargos';
import { porQueNoSeBorraVenta } from '@core/borrado';
import { formatearMoneda, formatearFecha } from '@core/moneda';
import { cn } from '../../lib/cn';

/**
 * Anular un encargo, decidiendo qué pasa con lo que ya se compró.
 *
 * Una pieza que ya llegó está en manos de Ross: va a la bodega (entra con su
 * costo real) o se perdió. Lo que la clienta ya pagó se le devuelve o queda
 * como pago. El motivo dice por qué no se concretó: no lo quiere más, no
 * aceptó la cotización, o no se consiguió. Arranca en el que corresponde a la
 * fase. Ver `docs/PLAN_LOTES_Y_ENCARGOS.md`, sección 5.6.
 *
 * "Fue un error" es la otra salida: el encargo nunca pasó (un dedazo, un
 * duplicado) y se borra sin dejar rastro, con el PIN si el negocio tiene uno.
 * Ver `core/borrado.ts`. Un encargo ya anulado sólo puede borrarse.
 */
interface AnularEncargoModalProps {
  venta: Venta | VentaCompleta | null;
  /** Si devuelve una promesa, la ventana dice "Anulando…" hasta que termine. */
  onConfirmar: (opciones: OpcionesAnulacion) => unknown;
  /** "Fue un error". Si devuelve un mensaje, es un error y la ventana sigue abierta. */
  onBorrar?: (pin: string) => Promise<string | null>;
  /** Si el negocio tiene PIN, borrar lo pide. */
  pedirPin?: boolean;
  onCerrar: () => void;
}

type Destino = 'BODEGA' | 'PERDIDA';
/** "Ya no lo quiere" se guarda sin motivo, como siempre. "Fue un error" no anula: borra. */
type Motivo = MotivoAnulacion | 'YA_NO' | 'ERROR';

const MOTIVOS: { valor: Motivo; texto: string }[] = [
  { valor: 'YA_NO', texto: 'Ya no lo quiere' },
  { valor: 'NO_ACEPTO', texto: 'No aceptó' },
  { valor: 'NO_SE_CONSIGUIO', texto: 'No se consiguió' },
];

/** El motivo más probable según en qué va el encargo. */
function motivoDeLaFase(v: Venta | VentaCompleta): Motivo {
  const e = etapaEncargo(v);
  if (e === 'POR_BUSCAR') return 'NO_SE_CONSIGUIO';
  if (e === 'ESPERANDO') return 'NO_ACEPTO';
  return 'YA_NO';
}

/** Una opción de un selector, como los del resto de la app. */
const Opcion: React.FC<{ activa: boolean; onClick: () => void; children: React.ReactNode }> = ({
  activa,
  onClick,
  children,
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={activa}
    onClick={onClick}
    className={cn(
      'rounded-md px-3 py-1 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
      activa ? 'bg-superficie text-texto font-medium shadow-2xs' : 'text-texto-3 hover:text-texto'
    )}
  >
    {children}
  </button>
);

export const AnularEncargoModal: React.FC<AnularEncargoModalProps> = ({
  venta,
  onConfirmar,
  onBorrar,
  pedirPin = false,
  onCerrar,
}) => {
  const [completa, setCompleta] = useState<VentaCompleta | null>(null);
  const [destinos, setDestinos] = useState<Record<number, Destino>>({});
  const [anticipo, setAnticipo] = useState<'DEVOLVER' | 'RETENER'>('DEVOLVER');
  const [motivo, setMotivo] = useState<Motivo>('YA_NO');
  const [anulando, setAnulando] = useState(false);
  const [pin, setPin] = useState('');
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const salidaRef = useRef<HTMLButtonElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const yaAnulado = venta?.estado === 'CANCELADA';

  // Las piezas hacen falta enteras: una venta de la lista viene sin líneas.
  useEffect(() => {
    if (!venta) return;
    setDestinos({});
    setAnticipo('DEVOLVER');
    setMotivo(venta.estado === 'CANCELADA' ? 'ERROR' : motivoDeLaFase(venta));
    setPin('');
    setErrorPin(null);
    setError(null);
    if ('lineas' in venta && venta.lineas) {
      setCompleta(venta);
      return;
    }
    setCompleta(null);
    let vivo = true;
    window.api.ventas.get(venta.id).then((r) => {
      if (vivo && r.success && r.data) setCompleta(r.data);
    });
    return () => {
      vivo = false;
    };
  }, [venta]);

  const lineas = completa?.lineas ?? [];
  const llegadas = lineas.filter((l) => estadoPieza(l) === 'LLEGO');
  const enCamino = lineas.filter((l) => estadoPieza(l) === 'EN_CAMINO');
  const esperando = lineas.filter((l) => estadoPieza(l) === 'COMPRADA');
  const pagado = venta?.pagado_usd_cents || 0;
  const borrando = motivo === 'ERROR';
  const noSeBorra = completa ? porQueNoSeBorraVenta(completa, completa.pagos) : null;
  const motivos: { valor: Motivo; texto: string }[] = [
    ...(yaAnulado ? [] : MOTIVOS),
    ...(onBorrar ? [{ valor: 'ERROR' as const, texto: 'Fue un error' }] : []),
  ];

  const borrar = async () => {
    if (!onBorrar || anulando) return;
    if (noSeBorra) {
      setError(noSeBorra);
      return;
    }
    if (pedirPin && !pin.trim()) {
      setErrorPin('Escribí el PIN para borrar.');
      pinRef.current?.focus();
      return;
    }
    setAnulando(true);
    setError(null);
    try {
      const fallo = await onBorrar(pin.trim());
      if (!fallo) {
        onCerrar();
        return;
      }
      if (/PIN/.test(fallo)) {
        setErrorPin(fallo);
        setPin('');
        pinRef.current?.focus();
      } else {
        setError(fallo);
      }
    } finally {
      setAnulando(false);
    }
  };

  // Anular tarda (devuelve piezas, recalcula saldos): sin respuesta en
  // pantalla se apretaba dos veces (ENC-23). Se queda abierta hasta que termina.
  const confirmar = async () => {
    if (borrando) return borrar();
    if (anulando) return;
    const piezas: OpcionesAnulacion['piezas'] = {};
    for (const l of llegadas) piezas[l.id] = { destino: destinos[l.id] ?? 'BODEGA' };
    const r = onConfirmar({ anticipo, piezas, motivo: motivo === 'YA_NO' ? undefined : motivo });
    if (r instanceof Promise) {
      setAnulando(true);
      try {
        await r;
      } finally {
        setAnulando(false);
      }
    }
    onCerrar();
  };

  return (
    <Dialogo
      abierto={Boolean(venta)}
      titulo={venta ? (yaAnulado ? `¿Borrar ${venta.codigo}?` : `¿Anular ${venta.codigo}?`) : ''}
      rol="alertdialog"
      ancho="md"
      encima
      ocupado={anulando}
      onCerrar={onCerrar}
      pie={
        <div className="flex items-center justify-end gap-2 w-full">
          {/* El foco arranca en la salida, no en la acción que destruye. */}
          <Button ref={salidaRef} variant="secondary" onClick={onCerrar} autoFocus disabled={anulando}>
            No, dejarlo como está
          </Button>
          <Button variant="danger" onClick={confirmar} disabled={!completa || anulando}>
            {borrando ? (anulando ? 'Borrando…' : 'Borrar el encargo') : anulando ? 'Anulando…' : 'Anular el encargo'}
          </Button>
        </div>
      }
    >
      {!completa || !venta ? (
        <p className="text-label text-texto-3">Cargando sus piezas…</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-body text-texto">Por qué</p>
            <div className="inline-flex rounded-lg bg-superficie-2 p-0.5" role="radiogroup" aria-label="Por qué se anula">
              {motivos.map((m) => (
                <Opcion
                  key={m.valor}
                  activa={motivo === m.valor}
                  onClick={() => {
                    setMotivo(m.valor);
                    setError(null);
                  }}
                >
                  {m.texto}
                </Opcion>
              ))}
            </div>
          </div>

          {borrando &&
            (noSeBorra ? (
              <p className="text-label text-texto-2">{noSeBorra}</p>
            ) : (
              <>
                <ul className="rounded-md border border-danger-200 bg-danger-50 p-3 space-y-1.5">
                  {[
                    pagado > 0
                      ? `Se borran ${venta.codigo} y sus abonos (${formatearMoneda(pagado, 'USD')}).`
                      : `Se borra ${venta.codigo}.`,
                    'Nunca pasó: no queda en el historial ni en las cuentas de la clienta.',
                  ].map((c, i) => (
                    <li key={i} className="text-label flex gap-2 text-danger-800">
                      <span aria-hidden="true">·</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
                {pedirPin && (
                  <Field label="PIN" error={errorPin ?? undefined}>
                    <Input
                      ref={pinRef}
                      autoFocus
                      type="password"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label="PIN"
                      value={pin}
                      onChange={(e) => {
                        setPin(e.target.value);
                        setErrorPin(null);
                      }}
                    />
                  </Field>
                )}
              </>
            ))}

          {error && (
            <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-800">
              {error}
            </p>
          )}

          {!borrando && llegadas.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-body text-texto truncate">{l.descripcion}</p>
                <p className="text-caption text-texto-3">
                  Llegó{l.compra_codigo ? ` en ${l.compra_codigo}` : ''}
                  {l.llego_el ? ` el ${formatearFecha(l.llego_el)}` : ''} · te costó{' '}
                  {formatearMoneda(l.costo_total_usd_cents, 'USD')}
                </p>
              </div>
              <div className="inline-flex rounded-lg bg-superficie-2 p-0.5" role="radiogroup" aria-label={`Qué pasa con ${l.descripcion}`}>
                <Opcion
                  activa={(destinos[l.id] ?? 'BODEGA') === 'BODEGA'}
                  onClick={() => setDestinos((d) => ({ ...d, [l.id]: 'BODEGA' }))}
                >
                  A la bodega
                </Opcion>
                <Opcion
                  activa={destinos[l.id] === 'PERDIDA'}
                  onClick={() => setDestinos((d) => ({ ...d, [l.id]: 'PERDIDA' }))}
                >
                  Se perdió
                </Opcion>
              </div>
            </div>
          ))}

          {!borrando && enCamino.length > 0 && (
            <p className="text-label text-texto-2">
              {enCamino.length === 1
                ? `“${enCamino[0].descripcion}” ya se compró: entra a la bodega con ${enCamino[0].compra_codigo ?? 'su paquete'}.`
                : `${enCamino.length} piezas ya se compraron: entran a la bodega con su paquete.`}
            </p>
          )}

          {!borrando && esperando.length > 0 && (
            <p className="text-label text-texto-2">
              {esperando.length === 1
                ? `“${esperando[0].descripcion}” ya se compró: cuando llegue, cargala en su paquete para la bodega.`
                : `${esperando.length} piezas ya se compraron: cuando lleguen, cargalas en su paquete para la bodega.`}
            </p>
          )}

          {!borrando && pagado > 0 && (
            <div className="flex items-center justify-between gap-3 flex-wrap border-t border-borde pt-4">
              <p className="text-body text-texto">Pagó {formatearMoneda(pagado, 'USD')}</p>
              <div className="inline-flex rounded-lg bg-superficie-2 p-0.5" role="radiogroup" aria-label="Qué pasa con lo que pagó">
                <Opcion activa={anticipo === 'DEVOLVER'} onClick={() => setAnticipo('DEVOLVER')}>
                  Devolvérselo
                </Opcion>
                <Opcion activa={anticipo === 'RETENER'} onClick={() => setAnticipo('RETENER')}>
                  Quedármelo
                </Opcion>
              </div>
            </div>
          )}

          {!borrando && llegadas.length === 0 && enCamino.length === 0 && esperando.length === 0 && pagado === 0 && venta.total_usd_cents > 0 && (
            <p className="text-label text-texto-2">Deja de contar en tus ganancias.</p>
          )}
        </>
      )}
    </Dialogo>
  );
};
