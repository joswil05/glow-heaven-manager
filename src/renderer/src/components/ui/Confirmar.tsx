import React, { useEffect, useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { MarcoModal } from './MarcoModal';
import { cn } from '../../lib/cn';

/**
 * Diálogo de confirmación para acciones que no se deshacen solas.
 *
 * Reemplaza a `window.confirm()`, que se usaba para anular ventas y abonos:
 * un cuadro del sistema, sin el idioma de la aplicación, sin poder enumerar
 * las consecuencias y sin distinguir entre "cerrar sin guardar" y "destruir
 * un registro con dinero adentro".
 *
 * Si `onConfirmar` devuelve una promesa, la confirmación se queda abierta
 * mientras corre, con el botón en `textoOcupado` ("Anulando…") y nada que la
 * cierre, y se va cuando termina. Antes cerraba al instante: anular una venta
 * tarda, y sin respuesta en pantalla se volvía a apretar.
 */
export interface ConfirmarProps {
  abierto: boolean;
  titulo: string;
  /** Qué va a pasar exactamente. Una línea por consecuencia. */
  consecuencias?: string[];
  descripcion?: string;
  textoConfirmar: string;
  /** Lo que dice el botón mientras la acción corre. */
  textoOcupado?: string;
  textoCancelar?: string;
  peligroso?: boolean;
  onConfirmar: () => unknown;
  onCerrar: () => void;
}

export const Confirmar: React.FC<ConfirmarProps> = ({
  abierto,
  titulo,
  consecuencias = [],
  descripcion,
  textoConfirmar,
  textoOcupado = 'Un momento…',
  textoCancelar = 'No, dejar como está',
  peligroso = false,
  onConfirmar,
  onCerrar,
}) => {
  const idTitulo = useId();
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!abierto) setOcupado(false);
  }, [abierto]);

  const confirmar = async () => {
    if (ocupado) return;
    const r = onConfirmar();
    if (r instanceof Promise) {
      setOcupado(true);
      try {
        await r;
      } finally {
        setOcupado(false);
      }
    }
    onCerrar();
  };

  return (
    <MarcoModal
      abierto={abierto}
      onPedirCierre={onCerrar}
      ocupado={ocupado}
      idTitulo={idTitulo}
      rol="alertdialog"
      encima
      clasePanel="rounded-xl max-w-md"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center shrink-0',
              peligroso ? 'bg-peligro-suave text-peligro-fuerte' : 'bg-acento-suave text-acento-fuerte'
            )}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 id={idTitulo} className="text-title text-texto">
              {titulo}
            </h3>
            {descripcion && <p className="mt-1 text-body text-texto-2">{descripcion}</p>}
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
              <li key={i} className={cn('text-label flex gap-2', peligroso ? 'text-danger-800' : 'text-texto-2')}>
                <span aria-hidden="true">·</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-borde">
        {/* El foco arranca en la salida, no en el botón que destruye. */}
        <Button autoFocus variant="secondary" onClick={onCerrar} disabled={ocupado}>
          {textoCancelar}
        </Button>
        <Button variant={peligroso ? 'danger' : 'primary'} onClick={confirmar} disabled={ocupado}>
          {ocupado ? textoOcupado : textoConfirmar}
        </Button>
      </footer>
    </MarcoModal>
  );
};
