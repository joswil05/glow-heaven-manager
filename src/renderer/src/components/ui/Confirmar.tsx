import React, { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Portal } from './Portal';
import { cn } from '../../lib/cn';

/**
 * Diálogo de confirmación para acciones que no se deshacen solas.
 *
 * Reemplaza a `window.confirm()`, que se usaba para anular ventas y abonos:
 * un cuadro del sistema, sin el idioma de la aplicación, sin poder enumerar
 * las consecuencias y sin distinguir entre "cerrar sin guardar" y "destruir
 * un registro con dinero adentro".
 */
export interface ConfirmarProps {
  abierto: boolean;
  titulo: string;
  /** Qué va a pasar exactamente. Una línea por consecuencia. */
  consecuencias?: string[];
  descripcion?: string;
  textoConfirmar: string;
  textoCancelar?: string;
  peligroso?: boolean;
  onConfirmar: () => void;
  onCerrar: () => void;
}

export const Confirmar: React.FC<ConfirmarProps> = ({
  abierto,
  titulo,
  consecuencias = [],
  descripcion,
  textoConfirmar,
  textoCancelar = 'No, dejar como está',
  peligroso = false,
  onConfirmar,
  onCerrar,
}) => {
  const salidaRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    // El foco arranca en la salida, no en el botón que destruye.
    salidaRef.current?.focus();

    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
        role="alertdialog"
      aria-modal="true"
      aria-labelledby="titulo-confirmar"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-superficie rounded-xl shadow-2xl w-full max-w-md animate-modal-pop border border-borde cursor-default"
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
                peligroso ? 'bg-danger-50 text-danger-600' : 'bg-acento-suave text-acento'
              )}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 id="titulo-confirmar" className="text-title text-texto">
                {titulo}
              </h3>
              {descripcion && (
                <p className="mt-1 text-body text-texto-2">{descripcion}</p>
              )}
            </div>
          </div>

          {consecuencias.length > 0 && (
            <ul
              className={cn(
                'mt-4 rounded-md border p-3 space-y-1.5',
                peligroso ? 'border-danger-200 bg-danger-50' : 'border-borde bg-superficie-2'
              )}
            >
              {consecuencias.map((c, i) => (
                <li
                  key={i}
                  className={cn(
                    'text-label flex gap-2',
                    peligroso ? 'text-danger-800' : 'text-texto-2'
                  )}
                >
                  <span aria-hidden="true">·</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-borde">
          <Button ref={salidaRef} variant="secondary" onClick={onCerrar}>
            {textoCancelar}
          </Button>
          <Button
            variant={peligroso ? 'danger' : 'primary'}
            onClick={() => {
              onConfirmar();
              onCerrar();
            }}
          >
            {textoConfirmar}
          </Button>
        </footer>
      </div>
    </div>
    </Portal>
  );
};
