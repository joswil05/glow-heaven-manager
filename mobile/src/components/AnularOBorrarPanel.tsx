import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { haptics } from '../lib/haptics';

/**
 * Deshacer una venta o un abono desde el celular: primero se pregunta qué
 * pasó, como en la computadora (`components/AnularOBorrar.tsx` del escritorio).
 *
 * Si pasó y se deshizo de verdad, se cancela y queda en el historial. Si
 * nunca pasó, se borra sin dejar rastro (`core/borrado.ts`). Ninguna opción
 * viene elegida; la que no se puede se ve apagada con el motivo.
 */
interface Opcion {
  /** "Se devolvió o se reembolsó". */
  opcion: string;
  detalle: string;
  /** "Sí, cancelar la venta". */
  boton: string;
  /** "Cancelando…". */
  enCurso: string;
  /** Por qué no se puede, o null. */
  noSePuede?: string | null;
}

interface Props {
  anular: Opcion;
  borrar: Opcion;
  /** Si el negocio tiene PIN, borrar lo pide. */
  pedirPin: boolean;
  onAnular: () => Promise<void>;
  /** Si devuelve un mensaje, es un error y el panel sigue abierto. */
  onBorrar: (pin: string) => Promise<string | null>;
  onCancelar: () => void;
}

type Que = 'ANULAR' | 'BORRAR';

export function AnularOBorrarPanel({ anular, borrar, pedirPin, onAnular, onBorrar, onCancelar }: Props) {
  const [eleccion, setEleccion] = useState<Que | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const opciones: { valor: Que; o: Opcion }[] = [
    { valor: 'ANULAR', o: anular },
    { valor: 'BORRAR', o: borrar },
  ];

  async function confirmar() {
    if (ocupado) return;
    if (!eleccion) {
      setError('Elegí qué pasó.');
      return;
    }
    if (eleccion === 'BORRAR' && pedirPin && !pin.trim()) {
      setError('Escribí el PIN para borrar.');
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      if (eleccion === 'ANULAR') {
        await onAnular();
        return;
      }
      const fallo = await onBorrar(pin.trim());
      if (fallo) {
        setError(fallo);
        if (/PIN/.test(fallo)) setPin('');
      }
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="rounded-2xl border border-borde bg-superficie-2 p-3.5">
      <h4 className="text-sm font-bold text-texto">¿Qué pasó?</h4>
      <div role="radiogroup" aria-label="Qué pasó" className="mt-2 flex flex-col gap-2">
        {opciones.map(({ valor, o }) => {
          const apagada = Boolean(o.noSePuede);
          const activa = eleccion === valor;
          return (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={activa}
              aria-disabled={apagada || undefined}
              onClick={() => {
                if (apagada) return;
                haptics.selection();
                setEleccion(valor);
                setError(null);
              }}
              className={`tocable w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                activa ? 'border-acento bg-superficie ring-1 ring-acento' : 'border-borde bg-superficie'
              } ${apagada ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <span className={`block text-sm font-bold ${apagada ? 'text-texto-3' : 'text-texto'}`}>{o.opcion}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-texto-2">{o.noSePuede ?? o.detalle}</span>
            </button>
          );
        })}
      </div>

      {eleccion === 'BORRAR' && pedirPin && (
        <label className="mt-3 block">
          <span className="mb-1 block text-[12px] font-bold text-texto-2">PIN</span>
          {/* 16 px: en iPhone, un campo más chico hace zoom al tocarlo. */}
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            aria-label="PIN"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setError(null);
            }}
            className="w-full rounded-xl border border-borde-fuerte bg-superficie px-3 py-2.5 text-base text-texto focus:border-acento focus:outline-none"
          />
        </label>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12px] font-bold text-peligro-fuerte">
          {error}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={onCancelar}
          className="m3-press tocable rounded-xl border border-borde bg-superficie px-3 py-3 text-sm font-bold text-texto disabled:opacity-50 cursor-pointer"
        >
          No
        </button>
        <button
          type="button"
          disabled={ocupado}
          onClick={confirmar}
          className="m3-press tocable flex items-center justify-center gap-2 rounded-xl bg-peligro px-3 py-3 text-sm font-bold text-peligro-texto disabled:opacity-50 cursor-pointer"
        >
          {ocupado && <Loader2 size={16} className="animate-spin" />}
          {(() => {
            const o = eleccion === 'BORRAR' ? borrar : anular;
            return ocupado ? o.enCurso : o.boton;
          })()}
        </button>
      </div>
    </div>
  );
}
