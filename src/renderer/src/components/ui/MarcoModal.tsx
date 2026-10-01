import React, { useEffect, useId, useRef, useState } from 'react';
import { Portal } from './Portal';
import { cn } from '../../lib/cn';

/**
 * El marco de toda ventana: velo, capa, foco, teclado, pregunta antes de
 * descartar y salida animada.
 *
 * Hasta la 2.16 había dos marcos. Siete formularios usaban `Dialogo`, que
 * preguntaba antes de descartar; los nueve más usados (Nueva venta,
 * Registrar paquete, Producto, Clienta…) tenían el suyo, y Escape o un clic
 * afuera los cerraban sin preguntar. Un paquete de treinta líneas se perdía
 * con una tecla. Ahora hay uno solo, en tres pisos:
 *
 *  - Este marco: lo que tienen todas las ventanas. `Confirmar` lo usa tal
 *    cual.
 *  - `Ventana`: el marco más la pregunta "¿Descartar lo que escribiste?".
 *    La usan los editores grandes que traen su propio interior (pasos,
 *    columnas).
 *  - `Dialogo`: la ventana con título, cuerpo y pie, para los formularios
 *    comunes.
 *
 * Lo que garantiza el marco:
 *
 *  - **No se cierra a mitad de algo.** Con `ocupado` (guardando, aplicando),
 *    Escape, el velo y la X no hacen nada.
 *  - **Escape por capas.** Primero cierra lo desplegado (una lista de
 *    sugerencias: `alEscape`, o un campo que ya lo usó y llamó a
 *    `preventDefault`), después la ventana. Y sólo actúa la ventana de más
 *    arriba: con una confirmación encima, Escape es de la confirmación.
 *  - **El foco no se escapa.** Tab da la vuelta dentro de la ventana, y al
 *    cerrar vuelve al botón que la abrió.
 *  - **Sale, no desaparece.** La entrada dura 220 ms; la salida, 120 ms,
 *    porque cerrar es una respuesta y no tiene que hacer esperar. Mientras
 *    sale se sigue viendo lo último que mostró.
 *  - **Ctrl+Enter envía** (`onEnviar`), sin animación: lo que se hace con el
 *    teclado se repite y no se anima.
 *  - **Un arrastre no cierra.** Sólo cierra un clic que empezó y terminó en
 *    el velo: seleccionar el texto de un campo y soltar afuera cerraba.
 */

/** Las ventanas abiertas, de abajo hacia arriba. Sólo la última escucha. */
const pila: string[] = [];

/** Registra una ventana abierta y dice si es la de más arriba. */
export function useCapaModal(abierta: boolean): () => boolean {
  const id = useId();
  useEffect(() => {
    if (!abierta) return;
    pila.push(id);
    return () => {
      const i = pila.lastIndexOf(id);
      if (i >= 0) pila.splice(i, 1);
    };
  }, [abierta, id]);
  return () => pila[pila.length - 1] === id;
}

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab y Shift+Tab dan la vuelta dentro del panel. */
export function retenerFoco(e: KeyboardEvent, panel: HTMLElement | null): void {
  if (!panel) return;
  const focos = Array.from(panel.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(
    (el) => el.getClientRects().length > 0
  );
  if (focos.length === 0) {
    e.preventDefault();
    panel.focus({ preventScroll: true });
    return;
  }
  const primero = focos[0];
  const ultimo = focos[focos.length - 1];
  const activo = document.activeElement;
  if (!panel.contains(activo)) {
    e.preventDefault();
    (e.shiftKey ? ultimo : primero).focus();
  } else if (e.shiftKey && (activo === primero || activo === panel)) {
    e.preventDefault();
    ultimo.focus();
  } else if (!e.shiftKey && activo === ultimo) {
    e.preventDefault();
    primero.focus();
  }
}

/**
 * El foco entra a la ventana al abrirse (si nada adentro lo tomó con
 * `autoFocus`) y vuelve a quien la abrió cuando termina de salir.
 *
 * Quién la abrió se anota mientras se dibuja, no en un efecto: `autoFocus`
 * mueve el foco antes de que corra cualquier efecto, y lo anotado habría
 * sido el propio campo de la ventana.
 */
export function useFocoDeVentana(
  abierta: boolean,
  montada: boolean,
  panel: React.RefObject<HTMLElement>
): void {
  const antes = useRef<HTMLElement | null>(null);
  const estabaAbierta = useRef(false);
  if (abierta && !estabaAbierta.current && typeof document !== 'undefined') {
    antes.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  estabaAbierta.current = abierta;

  useEffect(() => {
    if (!montada) return;
    const p = panel.current;
    if (p && !p.contains(document.activeElement)) p.focus({ preventScroll: true });
    return () => {
      const a = antes.current;
      if (a && a.isConnected) a.focus({ preventScroll: true });
    };
    // `panel` es una ref: no cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montada]);
}

/** Lo que dura la salida: el mismo número que `.animate-modal-salida`. */
export const SALIDA_MS = 120;

export interface MarcoModalProps {
  abierto: boolean;
  /** Escape, el velo o `cerrar`. `Ventana` decide ahí si pregunta. */
  onPedirCierre: () => void;
  /** Guardando o aplicando: nada la cierra hasta que termine. */
  ocupado?: boolean;
  /** Ctrl+Enter (Cmd+Enter en Mac). */
  onEnviar?: () => void;
  /** Una capa interna. Devuelve `true` si Escape ya la cerró. */
  alEscape?: () => boolean;
  /** El id del título, para `aria-labelledby`. */
  idTitulo: string;
  rol?: 'dialog' | 'alertdialog';
  /** Encima de otra ventana (z-[110] en vez de z-[100]). */
  encima?: boolean;
  /** Tamaño y forma del panel. */
  clasePanel: string;
  onKeyDownPanel?: React.KeyboardEventHandler<HTMLDivElement>;
  /** El interior. Como función, recibe `cerrar`: la misma salida que Escape. */
  children: React.ReactNode | ((cerrar: () => void) => React.ReactNode);
}

export const MarcoModal: React.FC<MarcoModalProps> = ({
  abierto,
  onPedirCierre,
  ocupado = false,
  onEnviar,
  alEscape,
  idTitulo,
  rol = 'dialog',
  encima = false,
  clasePanel,
  onKeyDownPanel,
  children,
}) => {
  const [montado, setMontado] = useState(abierto);
  const [saliendo, setSaliendo] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const clicEnElVelo = useRef(false);
  const esLaDeArriba = useCapaModal(abierto);
  useFocoDeVentana(abierto, montado, panelRef);

  // Lo último que se mostró abierto: la salida lo sigue mostrando aunque
  // quien abrió la ventana ya haya soltado sus datos (`venta = null`).
  const ultimo = useRef(children);
  if (abierto) ultimo.current = children;

  useEffect(() => {
    if (abierto) {
      setMontado(true);
      setSaliendo(false);
      return;
    }
    if (!montado) return;
    setSaliendo(true);
    const t = setTimeout(() => {
      setMontado(false);
      setSaliendo(false);
    }, SALIDA_MS);
    return () => clearTimeout(t);
    // `montado` no va en las dependencias: sólo importa cuándo cambia `abierto`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const cerrar = () => {
    if (!ocupado) onPedirCierre();
  };

  // Las referencias más nuevas, para que el listener no quede con las viejas.
  const vivo = useRef({ cerrar, onEnviar, alEscape });
  vivo.current = { cerrar, onEnviar, alEscape };

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (!esLaDeArriba()) return;
      if (e.key === 'Escape') {
        // Un campo que ya usó el Escape (cerró su lista) lo marca así.
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (vivo.current.alEscape?.()) return;
        vivo.current.cerrar();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && vivo.current.onEnviar) {
        e.preventDefault();
        vivo.current.onEnviar();
      } else if (e.key === 'Tab') {
        retenerFoco(e, panelRef.current);
      }
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  if (!montado) return null;
  const interior = abierto ? children : ultimo.current;

  return (
    <Portal>
      <div
        className={cn(
          'fixed inset-0 flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4',
          encima ? 'z-[110]' : 'z-[100]',
          saliendo ? 'animate-velo-salida pointer-events-none' : 'animate-velo-entrada'
        )}
        role={rol}
        aria-modal="true"
        aria-labelledby={idTitulo}
        onMouseDown={(e) => {
          clicEnElVelo.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (clicEnElVelo.current && e.target === e.currentTarget) cerrar();
          clicEnElVelo.current = false;
        }}
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          onKeyDown={onKeyDownPanel}
          className={cn(
            'bg-superficie shadow-2xl border border-borde w-full flex flex-col cursor-default focus:outline-none',
            clasePanel,
            saliendo ? 'animate-modal-salida' : 'animate-modal-pop'
          )}
        >
          {typeof interior === 'function' ? interior(cerrar) : interior}
        </div>
      </div>
    </Portal>
  );
};
