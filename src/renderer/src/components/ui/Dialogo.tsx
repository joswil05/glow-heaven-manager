import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Portal } from './Portal';
import { Confirmar } from './Confirmar';
import { cn } from '../../lib/cn';

/**
 * El marco de un formulario en ventana: velo, título, cuerpo y pie.
 *
 * Existe para que todos los formularios se porten igual en lo que no se ve
 * hasta que falla (guía de Emil Kowalski):
 *
 *  - **No pierde lo escrito.** Con `hayCambios`, Escape o un clic afuera
 *    preguntan antes de cerrar, con el foco en "Seguir editando". Antes, un
 *    clic de más en el velo borraba cinco piezas anotadas.
 *  - **Sale, no desaparece.** La entrada es la de siempre (220 ms); la salida
 *    es más corta (120 ms), porque cerrar es una respuesta del sistema y no
 *    tiene que hacer esperar. Mientras sale se sigue viendo lo último que
 *    mostró, aunque quien lo abrió ya haya soltado sus datos.
 *  - **Ctrl+Enter envía** (`onEnviar`), sin animación: una acción de teclado
 *    se repite muchas veces y no se anima.
 *
 * Con `prefers-reduced-motion`, la regla global de `index.css` deja sólo la
 * opacidad.
 */
export interface DialogoProps {
  abierto: boolean;
  titulo: React.ReactNode;
  /** Qué se escribió sin guardar: si hay algo, cerrar pregunta antes. */
  hayCambios?: boolean;
  onCerrar: () => void;
  /** Ctrl+Enter (Cmd+Enter en Mac). */
  onEnviar?: () => void;
  pie?: React.ReactNode;
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

/** Lo que dura la salida: el mismo número que `.animate-modal-salida`. */
const SALIDA_MS = 120;

export const Dialogo: React.FC<DialogoProps> = ({
  abierto,
  titulo,
  hayCambios = false,
  onCerrar,
  onEnviar,
  pie,
  children,
  ancho = 'md',
  encima = false,
  sinCerrar = false,
  rol = 'dialog',
}) => {
  const idTitulo = useId();
  const [montado, setMontado] = useState(abierto);
  const [saliendo, setSaliendo] = useState(false);
  const [preguntando, setPreguntando] = useState(false);

  // Lo último que se mostró abierto: la salida lo sigue mostrando aunque
  // quien abrió el diálogo ya haya soltado sus datos (`venta = null`).
  const ultimo = useRef({ titulo, pie, children });
  if (abierto) ultimo.current = { titulo, pie, children };

  useEffect(() => {
    if (abierto) {
      setMontado(true);
      setSaliendo(false);
      return;
    }
    if (!montado) return;
    setPreguntando(false);
    setSaliendo(true);
    const t = setTimeout(() => {
      setMontado(false);
      setSaliendo(false);
    }, SALIDA_MS);
    return () => clearTimeout(t);
    // `montado` no va en las dependencias: sólo importa cuándo cambia `abierto`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const pedirCierre = () => {
    if (hayCambios) setPreguntando(true);
    else onCerrar();
  };

  // Las referencias más nuevas, para que el listener no quede con las viejas.
  const vivo = useRef({ pedirCierre, onEnviar, preguntando });
  vivo.current = { pedirCierre, onEnviar, preguntando };

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => {
      // Mientras pregunta, las teclas son de la pregunta.
      if (vivo.current.preguntando) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        vivo.current.pedirCierre();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && vivo.current.onEnviar) {
        e.preventDefault();
        vivo.current.onEnviar();
      }
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierto]);

  if (!montado) return null;
  const visto = abierto ? { titulo, pie, children } : ultimo.current;

  return (
    <Portal>
      <div
        className={cn(
          'fixed inset-0 flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 cursor-pointer',
          encima ? 'z-[110]' : 'z-[100]',
          saliendo ? 'animate-velo-salida pointer-events-none' : 'animate-fade-in'
        )}
        role={rol}
        aria-modal="true"
        aria-labelledby={idTitulo}
        onClick={(e) => {
          if (e.target === e.currentTarget) pedirCierre();
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className={cn(
            'bg-superficie rounded-xl shadow-2xl w-full max-h-[90vh] flex flex-col border border-borde cursor-default',
            ANCHOS[ancho],
            saliendo ? 'animate-modal-salida' : 'animate-modal-pop'
          )}
        >
          <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-borde shrink-0">
            <h3 id={idTitulo} className="text-title text-texto min-w-0 truncate">
              {visto.titulo}
            </h3>
            {!sinCerrar && (
              <button
                type="button"
                onClick={pedirCierre}
                aria-label="Cerrar"
                className="p-1 rounded-md text-texto-3 hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </header>

          <div className="p-5 space-y-5 overflow-y-auto">{visto.children}</div>

          {visto.pie && (
            <footer className="flex items-center justify-between gap-3 px-5 py-4 border-t border-borde flex-wrap shrink-0">
              {visto.pie}
            </footer>
          )}
        </div>
      </div>

      <Confirmar
        abierto={preguntando}
        titulo="¿Descartar lo que escribiste?"
        descripcion="Lo que anotaste en este formulario no se guardó."
        textoCancelar="Seguir editando"
        textoConfirmar="Descartar"
        peligroso
        onCerrar={() => setPreguntando(false)}
        onConfirmar={() => {
          setPreguntando(false);
          onCerrar();
        }}
      />
    </Portal>
  );
};
