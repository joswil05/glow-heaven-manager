import React, { useEffect, useId, useRef, useState } from 'react';
import { Button, Dialogo, Field, Input } from './ui';
import { cn } from '../lib/cn';
import { useToast } from '../context/ToastContext';
import { textoPagado } from '@core/abonos';
import { porQueNoSeBorraAbono } from '@core/borrado';
import type { Pago } from '../../../shared/types';

/**
 * Deshacer una venta o un abono: primero se pregunta qué pasó.
 *
 * Anular y borrar no son lo mismo (`core/borrado.ts`). Si pasó y se deshizo
 * en la vida real (una devolución, un reembolso), se anula y queda en el
 * historial. Si nunca pasó (un dedazo, un duplicado, la clienta
 * equivocada), se borra sin dejar rastro. Es una sola puerta para las dos
 * cosas, así no hay que saber cuál botón buscar.
 *
 * Ninguna opción viene elegida: la pregunta es el punto. Si el borrado no se
 * puede (más de una semana, un mes cerrado, plata de otro día), la opción se
 * ve apagada con el motivo, que dice qué hacer en su lugar.
 */
export interface AnularOBorrarProps {
  abierto: boolean;
  /** "V-0024", "el abono de C$600.00". */
  que: string;
  anular: {
    /** "Se devolvió o se reembolsó". */
    opcion: string;
    /** "Pasó y se deshizo: queda en el historial como anulada." */
    detalle: string;
    consecuencias: string[];
    /** "Sí, anular la venta". */
    boton: string;
    /** "Ya está anulada.": sólo queda borrarla. */
    noSePuede?: string | null;
  };
  borrar: {
    /** "Fue un error al cargarla". */
    opcion: string;
    /** "Nunca pasó: … Se borra sin dejar rastro." */
    detalle: string;
    consecuencias: string[];
    /** "Sí, borrar la venta". */
    boton: string;
    /** Por qué no se puede, o null. */
    noSePuede: string | null;
  };
  /** Si el negocio tiene PIN, borrar lo pide. */
  pedirPin: boolean;
  /** Anula. Si devuelve un mensaje, es un error y la ventana sigue abierta. */
  onAnular: () => Promise<string | null>;
  /** Borra. Si devuelve un mensaje, es un error y la ventana sigue abierta. */
  onBorrar: (pin: string) => Promise<string | null>;
  onCerrar: () => void;
}

type Que = 'ANULAR' | 'BORRAR';

const OpcionGrande: React.FC<{
  activa: boolean;
  deshabilitada?: boolean;
  titulo: string;
  detalle: string;
  onClick: () => void;
}> = ({ activa, deshabilitada, titulo, detalle, onClick }) => (
  <button
    type="button"
    role="radio"
    aria-checked={activa}
    aria-disabled={deshabilitada || undefined}
    onClick={deshabilitada ? undefined : onClick}
    className={cn(
      'w-full rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
      activa ? 'border-acento bg-superficie ring-1 ring-acento' : 'border-borde bg-superficie-2',
      deshabilitada ? 'cursor-not-allowed' : !activa && 'hover:border-borde-fuerte'
    )}
  >
    <span className={cn('block text-body font-medium', deshabilitada ? 'text-texto-3' : 'text-texto')}>{titulo}</span>
    <span className="mt-0.5 block text-label text-texto-2">{detalle}</span>
  </button>
);

export const AnularOBorrar: React.FC<AnularOBorrarProps> = ({
  abierto,
  que,
  anular,
  borrar,
  pedirPin,
  onAnular,
  onBorrar,
  onCerrar,
}) => {
  const [eleccion, setEleccion] = useState<Que | null>(null);
  const [pin, setPin] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [errorEleccion, setErrorEleccion] = useState<string | null>(null);
  const [errorPin, setErrorPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const idError = useId();

  useEffect(() => {
    if (!abierto) return;
    setEleccion(null);
    setPin('');
    setOcupado(false);
    setErrorEleccion(null);
    setErrorPin(null);
    setError(null);
  }, [abierto]);

  const elegir = (q: Que) => {
    setEleccion(q);
    setErrorEleccion(null);
    setError(null);
  };

  const confirmar = async () => {
    if (ocupado) return;
    if (!eleccion) {
      setErrorEleccion('Elegí qué pasó.');
      return;
    }
    if (eleccion === 'BORRAR' && pedirPin && !pin.trim()) {
      setErrorPin('Escribí el PIN para borrar.');
      pinRef.current?.focus();
      return;
    }
    setOcupado(true);
    setError(null);
    setErrorPin(null);
    try {
      const fallo = eleccion === 'BORRAR' ? await onBorrar(pin.trim()) : await onAnular();
      if (!fallo) {
        onCerrar();
        return;
      }
      // El PIN equivocado se dice en su campo; lo demás, arriba de los botones.
      if (/PIN/.test(fallo)) {
        setErrorPin(fallo);
        setPin('');
        pinRef.current?.focus();
      } else {
        setError(fallo);
      }
    } finally {
      setOcupado(false);
    }
  };

  const consecuencias = eleccion === 'BORRAR' ? borrar.consecuencias : eleccion === 'ANULAR' ? anular.consecuencias : [];

  return (
    <Dialogo
      abierto={abierto}
      titulo={`¿Qué pasó con ${que}?`}
      rol="alertdialog"
      ancho="sm"
      encima
      ocupado={ocupado}
      onCerrar={onCerrar}
      onEnviar={confirmar}
      pie={
        <div className="flex items-center justify-end gap-2 w-full">
          {/* El foco arranca en la salida, no en lo que destruye. */}
          <Button variant="secondary" onClick={onCerrar} autoFocus disabled={ocupado}>
            No, dejarlo como está
          </Button>
          <Button variant="danger" onClick={confirmar} disabled={ocupado}>
            {ocupado
              ? eleccion === 'BORRAR'
                ? 'Borrando…'
                : 'Anulando…'
              : eleccion === 'BORRAR'
                ? borrar.boton
                : anular.boton}
          </Button>
        </div>
      }
    >
      <div role="radiogroup" aria-label="Qué pasó" aria-describedby={errorEleccion ? idError : undefined} className="space-y-2">
        <OpcionGrande
          activa={eleccion === 'ANULAR'}
          deshabilitada={Boolean(anular.noSePuede)}
          titulo={anular.opcion}
          detalle={anular.noSePuede ?? anular.detalle}
          onClick={() => elegir('ANULAR')}
        />
        <OpcionGrande
          activa={eleccion === 'BORRAR'}
          deshabilitada={borrar.noSePuede !== null}
          titulo={borrar.opcion}
          detalle={borrar.noSePuede ?? borrar.detalle}
          onClick={() => elegir('BORRAR')}
        />
        {errorEleccion && (
          <p id={idError} role="alert" className="text-caption text-danger-700">
            {errorEleccion}
          </p>
        )}
      </div>

      {consecuencias.length > 0 && (
        <ul className="rounded-md border border-danger-200 bg-danger-50 p-3 space-y-1.5">
          {consecuencias.map((c, i) => (
            <li key={i} className="text-label flex gap-2 text-danger-800">
              <span aria-hidden="true">·</span>
              <span>{c}</span>
            </li>
          ))}
        </ul>
      )}

      {eleccion === 'BORRAR' && pedirPin && (
        <Field label="PIN" error={errorPin ?? undefined}>
          {/* Aparece al elegir "Fue un error": `autoFocus` lo enfoca al aparecer,
              sin el `setTimeout` que robaba el cursor (CONTEXTO_SESION, sección 4). */}
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

      {error && (
        <p role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-label text-danger-800">
          {error}
        </p>
      )}
    </Dialogo>
  );
};

/**
 * La misma pregunta para un abono. La usan Cobros, la ficha de la clienta y
 * la ventana de abonos de una venta, con los mismos textos en las tres.
 */
export const AnularOBorrarAbono: React.FC<{
  abono: (Pago & { cliente_nombre?: string }) | null;
  pedirPin: boolean;
  /** Anula. Si devuelve un mensaje, es un error y la ventana sigue abierta. */
  onAnular: (abono: Pago) => Promise<string | null>;
  /** Después de borrarlo: recargar lo que lo mostraba. */
  onBorrado: () => unknown;
  onCerrar: () => void;
}> = ({ abono, pedirPin, onAnular, onBorrado, onCerrar }) => {
  const { showToast } = useToast();
  const monto = abono ? textoPagado(abono) : '';
  const de = abono?.cliente_nombre ? ` de ${abono.cliente_nombre}` : '';

  return (
    <AnularOBorrar
      abierto={abono !== null}
      que={`el abono de ${monto}`}
      anular={{
        opcion: 'La plata se devolvió',
        detalle: 'Entró y se devolvió: queda en el historial como anulado.',
        consecuencias: [`${monto}${de}.`, 'Lo que debía vuelve a quedar pendiente.'],
        boton: 'Sí, anular el abono',
      }}
      borrar={{
        opcion: 'Fue un error al cargarlo',
        detalle: 'Nunca entró: se cargó dos veces, o por error. Se borra sin dejar rastro.',
        consecuencias: [
          `Se borra el abono de ${monto}${de}.`,
          'Lo que debía vuelve a quedar pendiente.',
          'No queda en el historial de abonos.',
        ],
        boton: 'Sí, borrar el abono',
        noSePuede: abono ? porQueNoSeBorraAbono(abono) : null,
      }}
      pedirPin={pedirPin}
      onAnular={() => (abono ? onAnular(abono) : Promise.resolve(null))}
      onBorrar={async (pin) => {
        if (!abono) return null;
        const r = await window.api.pagos.borrarPorError(abono.id, pin || undefined);
        if (!r.success) return r.error;
        showToast({ message: 'Abono borrado.', type: 'success' });
        await onBorrado();
        return null;
      }}
      onCerrar={onCerrar}
    />
  );
};
