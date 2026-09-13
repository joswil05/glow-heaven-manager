import React, { useState, useEffect, useRef } from 'react';
import { Button, Field, Input, Portal } from '../../components/ui';
import { cn } from '../../lib/cn';

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
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
        role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ajuste"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <form
        onSubmit={enviar}
        onClick={(e) => e.stopPropagation()}
        className="bg-superficie rounded-2xl shadow-2xl w-full max-w-sm border border-borde animate-modal-pop overflow-hidden cursor-default"
      >
        <div className="p-6 space-y-4">
          <div>
            <h3 id="titulo-ajuste" className="text-title font-bold text-texto tracking-tight">
              Ajustar existencias
            </h3>
            <p className="mt-0.5 text-body text-texto-2 font-medium truncate">{ajuste.nombre}</p>
          </div>

          <Field
            label="¿Cuántas unidades físicas tenés?"
            hint={`El sistema registra actualmente: ${ajuste.actual} unidad(es)`}
            error={texto.trim() && !valido ? 'Escribí un número válido mayor o igual a 0.' : undefined}
          >
            <Input
              ref={campoRef}
              type="number"
              min="0"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="text-right font-bold text-base"
            />
          </Field>

          {valido && diferencia !== 0 && (
            <div
              className={cn(
                'rounded-xl border p-3 text-caption flex items-center gap-2.5 transition-colors',
                diferencia > 0
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                  : 'bg-rose-50 text-rose-800 border-rose-200/80'
              )}
            >
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-bold shrink-0',
                  diferencia > 0
                    ? 'bg-emerald-200/80 text-emerald-900'
                    : 'bg-rose-200/80 text-rose-900'
                )}
              >
                {diferencia > 0 ? `+${diferencia}` : diferencia}
              </span>
              <span>
                {diferencia > 0
                  ? `Se sumarán ${diferencia} unidad(es) al inventario.`
                  : `Se descontarán ${Math.abs(diferencia)} unidad(es) del inventario.`}{' '}
                El cambio quedará registrado en el historial.
              </span>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-borde bg-superficie-2/40">
          <Button type="button" variant="secondary" onClick={onCerrar} className="rounded-xl">
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!valido} className="rounded-xl font-semibold shadow-xs">
            Guardar conteo
          </Button>
        </footer>
      </form>
    </div>
    </Portal>
  );
};
