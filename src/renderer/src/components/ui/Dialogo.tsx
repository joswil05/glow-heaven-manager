import React, { useId } from 'react';
import { X } from 'lucide-react';
import { Ventana } from './Ventana';
import { cn } from '../../lib/cn';

/**
 * Un formulario en ventana: título, cuerpo y pie sobre `Ventana`.
 *
 * Todo lo que se porta igual en todas las ventanas (preguntar antes de
 * descartar, Escape por capas, Ctrl+Enter, el foco que no se escapa, la
 * salida animada) vive en `MarcoModal` y `Ventana`. Acá sólo está la forma.
 *
 * El foco inicial va con `autoFocus`, que actúa cuando el campo aparece; un
 * `setTimeout` para enfocar le robaba el cursor a lo que ya se estaba
 * escribiendo.
 */
export interface DialogoProps {
  abierto: boolean;
  titulo: React.ReactNode;
  /** Qué se escribió sin guardar: si hay algo, cerrar pregunta antes. */
  hayCambios?: boolean;
  /** Guardando: nada la cierra hasta que termine. */
  ocupado?: boolean;
  onCerrar: () => void;
  /** Ctrl+Enter (Cmd+Enter en Mac). */
  onEnviar?: () => void;
  /** Una capa interna (una lista abierta). Devuelve `true` si Escape la cerró. */
  alEscape?: () => boolean;
  /**
   * Los botones de abajo. Como función recibe `cerrar`, la salida que
   * pregunta si hay algo escrito: es la que tiene que usar "Cancelar".
   */
  pie?: React.ReactNode | ((cerrar: () => void) => React.ReactNode);
  children?: React.ReactNode;
  /** Ancho máximo: `max-w-md` (sm) … `max-w-2xl` (xl). */
  ancho?: 'sm' | 'md' | 'lg' | 'xl';
  /** Encima de otro diálogo (z-[110] en vez de z-[100]). */
  encima?: boolean;
  /** Sin la X del encabezado (un diálogo que sólo se cierra por sus botones). */
  sinCerrar?: boolean;
  /** `alertdialog` para lo que destruye algo (anular). */
  rol?: 'dialog' | 'alertdialog';
}

const ANCHOS = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-xl', xl: 'max-w-2xl' } as const;

export const Dialogo: React.FC<DialogoProps> = ({
  abierto,
  titulo,
  hayCambios = false,
  ocupado = false,
  onCerrar,
  onEnviar,
  alEscape,
  pie,
  children,
  ancho = 'md',
  encima = false,
  sinCerrar = false,
  rol = 'dialog',
}) => {
  const idTitulo = useId();

  return (
    <Ventana
      abierto={abierto}
      onCerrar={onCerrar}
      hayCambios={hayCambios}
      ocupado={ocupado}
      onEnviar={onEnviar}
      alEscape={alEscape}
      idTitulo={idTitulo}
      rol={rol}
      encima={encima}
      clasePanel={cn('rounded-xl max-h-[90vh]', ANCHOS[ancho])}
    >
      {(cerrar) => (
        <>
          <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-borde shrink-0">
            <h3 id={idTitulo} className="text-title text-texto min-w-0 truncate">
              {titulo}
            </h3>
            {!sinCerrar && (
              <button
                type="button"
                onClick={cerrar}
                aria-label="Cerrar"
                className="p-1 rounded-md text-texto-3 hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </header>

          <div className="p-5 space-y-5 overflow-y-auto">{children}</div>

          {pie && (
            <footer className="flex items-center justify-between gap-3 px-5 py-4 border-t border-borde flex-wrap shrink-0">
              {typeof pie === 'function' ? pie(cerrar) : pie}
            </footer>
          )}
        </>
      )}
    </Ventana>
  );
};
