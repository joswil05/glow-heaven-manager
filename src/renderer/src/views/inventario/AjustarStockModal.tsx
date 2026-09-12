import React, { useState, useEffect, useRef } from 'react';
import { Button, Field, Input } from '../../components/ui';

/**
 * Conteo físico de una variante.
 *
 * Antes era un `window.prompt`, que no dice qué había antes, no deja ver la
 * diferencia y devuelve texto suelto: escribir "diez" pasaba la validación
 * como cero. Acá el número de ahora está a la vista y el cambio se anuncia
 * antes de aplicarlo.
 */
export interface AjusteStock {
  variante_id: number;
  producto_id: number;
  nombre: string;
  actual: number;
}

interface Props {
  ajuste: AjusteStock | null;
  onCerrar: () => void;
  onConfirmar: (ajuste: AjusteStock, nuevas: number) => void;
}

export const AjustarStockModal: React.FC<Props> = ({ ajuste, onCerrar, onConfirmar }) => {
  const [texto, setTexto] = useState('');
  const campoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ajuste) return;
    setTexto(String(ajuste.actual));
    requestAnimationFrame(() => campoRef.current?.select());
  }, [ajuste]);

  useEffect(() => {
    if (!ajuste) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [ajuste, onCerrar]);

  if (!ajuste) return null;

  const nuevas = Number.parseInt(texto, 10);
  const valido = Number.isFinite(nuevas) && nuevas >= 0;
  const diferencia = valido ? nuevas - ajuste.actual : 0;

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valido) return;
    onConfirmar(ajuste, nuevas);
    onCerrar();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-velo/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ajuste"
    >
      <form onSubmit={enviar} className="bg-superficie rounded-xl shadow-2xl w-full max-w-sm">
        <div className="p-5 space-y-3">
          <div>
            <h3 id="titulo-ajuste" className="text-title text-texto">
              Contar existencias
            </h3>
            <p className="mt-0.5 text-body text-texto-2">{ajuste.nombre}</p>
          </div>

          <Field
            label="¿Cuántas unidades tenés en realidad?"
            hint={`El sistema tiene anotadas ${ajuste.actual}`}
            error={texto.trim() && !valido ? 'Escribí un número de unidades.' : undefined}
          >
            <Input
              ref={campoRef}
              type="number"
              min="0"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="text-right"
            />
          </Field>

          {valido && diferencia !== 0 && (
            <p className="rounded-md border border-borde bg-superficie-2 p-2.5 text-label text-texto-2">
              {diferencia > 0
                ? `Se van a sumar ${diferencia} unidad${diferencia === 1 ? '' : 'es'}.`
                : `Se van a quitar ${-diferencia} unidad${diferencia === -1 ? '' : 'es'}.`}{' '}
              Queda el movimiento anotado en el historial.
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-borde">
          <Button type="button" variant="secondary" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!valido}>
            Guardar el conteo
          </Button>
        </footer>
      </form>
    </div>
  );
};
