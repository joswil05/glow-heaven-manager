import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { haptics } from '../lib/haptics';

/** Distancia que por sí sola basta para cerrar, si se soltó sin impulso. */
const UMBRAL_CIERRE_PX = 110;
/** Velocidad (px/ms) a partir de la cual un tirón corto ya cierra. */
const VELOCIDAD_CIERRE = 0.11;
/** Movimiento por debajo del cual el gesto se considera un toque, no arrastre. */
const TOLERANCIA_TOQUE_PX = 4;
/** Lo que dura la salida: el mismo número que `.animate-m3-salida-hoja`. */
const SALIDA_MS = 200;

/**
 * "Atrás" de Android cierra la hoja de arriba (CEL-01).
 *
 * Antes la app no tocaba el historial: con una hoja abierta, el gesto atrás
 * salía de la app o volvía a la pantalla anterior, y lo cargado se perdía.
 *
 * Mientras haya alguna hoja abierta, el historial tiene UNA entrada de
 * guardia encima de la app. "Atrás" se come esa entrada y cierra la hoja de
 * arriba; si quedan otras, se vuelve a poner. Una sola entrada y no una por
 * hoja: una hoja que se cierra y otra que se abre en el mismo toque (el
 * detalle que abre el abono), o React montando dos veces en desarrollo,
 * cruzaban `back()` y `pushState` y el historial terminaba saliendo de la app.
 * La guardia se saca un instante después de que se cierra la última hoja, por
 * si en ese mismo toque se abre otra.
 */
const pila: string[] = [];
const alVolverPorHoja = new Map<string, () => void>();
let guardiaPuesta = false;
let popsAIgnorar = 0;
let escuchando = false;

function ponerGuardia() {
  if (guardiaPuesta) return;
  window.history.pushState({ hojaGlowHeaven: true }, '');
  guardiaPuesta = true;
}

function sacarGuardiaSiNoHayHojas() {
  window.setTimeout(() => {
    if (pila.length > 0 || !guardiaPuesta) return;
    guardiaPuesta = false;
    popsAIgnorar++;
    window.history.back();
  }, 0);
}

function escucharAtras() {
  if (escuchando) return;
  escuchando = true;
  window.addEventListener('popstate', () => {
    if (popsAIgnorar > 0) {
      popsAIgnorar--;
      return;
    }
    // Sin guardia, el "atrás" no era nuestro.
    if (!guardiaPuesta) return;
    guardiaPuesta = false;
    const arriba = pila[pila.length - 1];
    if (arriba) alVolverPorHoja.get(arriba)?.();
  });
}

interface BottomSheetProps {
  abierto: boolean;
  onCerrar: () => void;
  /**
   * Qué se escribió sin guardar. Con algo, el velo, la X, arrastrarla hacia
   * abajo y "atrás" preguntan antes de descartar (CEL-02).
   */
  hayCambios?: boolean;
  titulo?: string;
  subtitulo?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxHeight?: string;
}

export function BottomSheet({
  abierto,
  onCerrar,
  hayCambios = false,
  titulo,
  subtitulo,
  children,
  footer,
  maxHeight = '90vh',
}: BottomSheetProps) {
  const [viewportHeight, setViewportHeight] = useState<number>(() => {
    if (typeof window !== 'undefined' && window.visualViewport) {
      return window.visualViewport.height;
    }
    return typeof window !== 'undefined' ? window.innerHeight : 800;
  });
  const [keyboardOffset, setKeyboardOffset] = useState<number>(0);
  const id = useId();
  const [montada, setMontada] = useState(abierto);
  const [saliendo, setSaliendo] = useState(false);
  const [preguntando, setPreguntando] = useState(false);

  // Lo último que se mostró abierta: la salida lo sigue mostrando aunque quien
  // la abrió ya haya soltado sus datos.
  const ultimo = useRef({ titulo, subtitulo, children, footer });
  if (abierto) ultimo.current = { titulo, subtitulo, children, footer };

  /** La salida que pregunta si hay algo escrito. */
  function pedirCierre() {
    if (hayCambios) setPreguntando(true);
    else onCerrar();
  }
  const vivo = useRef({ pedirCierre, hayCambios, onCerrar });
  vivo.current = { pedirCierre, hayCambios, onCerrar };

  const hojaRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  /* En un ref y no en estado: durante el arrastre esto cambia en cada frame y
   * un re-render por frame haría perder fotogramas justo cuando el dedo está
   * en la pantalla. El movimiento se escribe directo en el `transform` del
   * elemento, que es lo único que el navegador puede animar sin recalcular
   * layout ni pintar de nuevo. */
  const arrastre = useRef({ activo: false, inicioY: 0, y: 0, inicioMs: 0, punteroId: -1 });

  function puedeArrastrarDesdeContenido(e: React.PointerEvent<HTMLDivElement>): boolean {
    // Desde el contenido sólo se arrastra si ya está arriba del todo; si no,
    // el gesto le pertenece al scroll.
    return e.currentTarget.scrollTop <= 0;
  }

  function iniciarArrastre(e: React.PointerEvent<HTMLDivElement>) {
    // Un segundo dedo durante el arrastre haría saltar la hoja a su posición.
    if (arrastre.current.activo) return;

    // Si el gesto empezó sobre algo que se toca, es de ese elemento y no de la
    // hoja. Sin esto, `setPointerCapture` se queda el evento y la X de cerrar,
    // los botones de la lista y los campos dejan de responder.
    const origen = e.target as HTMLElement | null;
    if (origen?.closest('button, a, input, select, textarea, [role="button"]')) return;

    const hoja = hojaRef.current;
    if (!hoja) return;

    arrastre.current = {
      activo: true,
      inicioY: e.clientY,
      y: 0,
      inicioMs: performance.now(),
      punteroId: e.pointerId,
    };
    // Sin transición mientras el dedo manda: la hoja tiene que ir pegada a él.
    hoja.style.transition = 'none';
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function moverArrastre(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrastre.current;
    if (!a.activo || e.pointerId !== a.punteroId) return;
    const hoja = hojaRef.current;
    if (!hoja) return;

    const bruto = e.clientY - a.inicioY;
    // Hacia arriba no hay a dónde ir. En vez de un muro, resistencia: las
    // cosas reales no se frenan en seco, se van deteniendo.
    const y = bruto >= 0 ? bruto : bruto / 4;
    a.y = y;

    hoja.style.transform = `translateY(${y}px)`;
    // El velo se aclara junto con el gesto: mismo movimiento, misma dirección.
    if (scrimRef.current && y > 0) {
      const alto = hoja.offsetHeight || 1;
      scrimRef.current.style.opacity = String(Math.max(0, 1 - y / alto));
    }
  }

  function soltarArrastre(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrastre.current;
    if (!a.activo || e.pointerId !== a.punteroId) return;
    a.activo = false;

    const hoja = hojaRef.current;
    if (!hoja) return;

    const ms = Math.max(1, performance.now() - a.inicioMs);
    const velocidad = a.y / ms;

    // Un tirón corto y rápido alcanza: no hay que arrastrar media pantalla
    // para cerrar algo que ya se decidió cerrar. Con algo escrito, la hoja
    // vuelve a su sitio y pregunta.
    if ((a.y > UMBRAL_CIERRE_PX || velocidad > VELOCIDAD_CIERRE) && !hayCambios) {
      haptics.impact('light');
      // La salida es rápida: la persona ya decidió, el sistema sólo obedece.
      hoja.style.transition = 'transform 200ms cubic-bezier(0.32, 0.72, 0, 1)';
      hoja.style.transform = 'translateY(100%)';
      if (scrimRef.current) {
        scrimRef.current.style.transition = 'opacity 200ms ease-out';
        scrimRef.current.style.opacity = '0';
      }
      window.setTimeout(onCerrar, 190);
      return;
    }

    if (a.y > UMBRAL_CIERRE_PX || velocidad > VELOCIDAD_CIERRE) setPreguntando(true);

    // No alcanzó (o hay que preguntar): vuelve a su sitio con la misma curva
    // de las hojas de Android.
    hoja.style.transition = 'transform 260ms cubic-bezier(0.32, 0.72, 0, 1)';
    hoja.style.transform = 'translateY(0)';
    if (scrimRef.current) {
      scrimRef.current.style.transition = 'opacity 260ms ease-out';
      scrimRef.current.style.opacity = '1';
    }
  }

  /** Cierra sólo si fue un toque, no el final de un arrastre. */
  function cerrarSiFueToque() {
    if (Math.abs(arrastre.current.y) > TOLERANCIA_TOQUE_PX) return;
    pedirCierre();
  }

  const manejadoresArrastre = {
    onPointerDown: iniciarArrastre,
    onPointerMove: moverArrastre,
    onPointerUp: soltarArrastre,
    onPointerCancel: soltarArrastre,
  };

  // Entra y sale: cerrada, se sigue viendo 200 ms mientras baja (CEL-06).
  // Antes sólo tenía salida si se la arrastraba; con la X o al guardar
  // desaparecía de golpe.
  useEffect(() => {
    if (abierto) {
      setMontada(true);
      setSaliendo(false);
      return;
    }
    setPreguntando(false);
    if (!montada) return;
    setSaliendo(true);
    const t = window.setTimeout(() => {
      setMontada(false);
      setSaliendo(false);
    }, SALIDA_MS);
    return () => window.clearTimeout(t);
    // `montada` no va: sólo importa cuándo cambia `abierto`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // "Atrás" de Android cierra la hoja de arriba (CEL-01).
  useEffect(() => {
    if (!abierto) return;
    escucharAtras();
    pila.push(id);
    ponerGuardia();
    alVolverPorHoja.set(id, () => {
      if (vivo.current.hayCambios) {
        // Se queda abierta: vuelve la guardia y pregunta.
        ponerGuardia();
        setPreguntando(true);
      } else {
        vivo.current.onCerrar();
      }
    });
    return () => {
      alVolverPorHoja.delete(id);
      const i = pila.lastIndexOf(id);
      if (i >= 0) pila.splice(i, 1);
      // Quedan otras hojas: el próximo "atrás" es para la de abajo.
      if (pila.length > 0) ponerGuardia();
      else sacarGuardiaSiNoHayHojas();
    };
  }, [abierto, id]);

  // El foco entra a la hoja y, al cerrarse, vuelve a lo que la abrió (CEL-08).
  const focoAntes = useRef<HTMLElement | null>(null);
  const estabaAbierta = useRef(false);
  if (abierto && !estabaAbierta.current && typeof document !== 'undefined') {
    focoAntes.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  estabaAbierta.current = abierto;
  useEffect(() => {
    if (!montada) return;
    const hoja = hojaRef.current;
    if (hoja && !hoja.contains(document.activeElement)) hoja.focus({ preventScroll: true });
    return () => {
      const a = focoAntes.current;
      if (a && a.isConnected) a.focus({ preventScroll: true });
    };
  }, [montada]);

  // Bloquear scroll de fondo cuando la hoja está abierta
  useEffect(() => {
    if (!abierto) return;
    const originalStyle = window.getComputedStyle(document.body).overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, [abierto]);

  // Adaptarse dinámicamente al teclado virtual de Android/iOS (visualViewport)
  useEffect(() => {
    if (!abierto) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const actualizar = () => {
      const offset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      setKeyboardOffset(offset);
      setViewportHeight(vv.height);
    };

    actualizar();
    vv.addEventListener('resize', actualizar);
    vv.addEventListener('scroll', actualizar);
    return () => {
      vv.removeEventListener('resize', actualizar);
      vv.removeEventListener('scroll', actualizar);
    };
  }, [abierto]);

  if (!montada) return null;
  const visto = abierto ? { titulo, subtitulo, children, footer } : ultimo.current;

  const tecladoActivo = keyboardOffset > 0;
  const alturaMaximaEfectiva = maxHeight.endsWith('vh')
    ? `${Math.min(viewportHeight * 0.94, viewportHeight - 8)}px`
    : maxHeight;

  /* Se monta en <body> con un portal, no dentro de la vista.
   *
   * `position: fixed` y `z-index` sólo valen dentro de su contexto de
   * apilamiento. Cualquier ancestro con `transform`, `filter` o `opacity`
   * menor a 1 crea uno nuevo y encierra a la hoja: quedaba por debajo del dock
   * flotante, que le tapaba justo los botones de acción (confirmar venta,
   * abonar). Pasó al agregar la animación de cambio de pestaña, que dejaba un
   * `transform` aplicado en el contenedor de la vista.
   *
   * En <body> no hay ancestro que pueda encerrarla, así que el problema no
   * puede repetirse aunque mañana se le agregue un efecto a las vistas. Es la
   * misma solución que ya se aplicó en el escritorio con `Portal.tsx`. */
  return createPortal(
    <div
      className="fixed inset-x-0 top-0 z-[100] flex flex-col justify-end"
      style={{
        bottom: tecladoActivo ? `${keyboardOffset}px` : 0,
        height: viewportHeight ? `${viewportHeight}px` : '100dvh',
      }}
    >
      {/* Scrim / Fondo oscuro con blur */}
      <div
        ref={scrimRef}
        onClick={pedirCierre}
        className={`fixed inset-0 bg-velo/60 backdrop-blur-[3px] ${
          saliendo ? 'animate-m3-salida-velo pointer-events-none' : 'animate-m3-fade'
        }`}
        aria-hidden="true"
      />

      {/* Hoja deslizable (Bottom Sheet) */}
      <div
        ref={hojaRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={visto.titulo ? `${id}-titulo` : undefined}
        tabIndex={-1}
        style={{
          maxHeight: alturaMaximaEfectiva,
        }}
        className={`relative z-10 w-full flex flex-col rounded-t-[28px] shadow-2xl overflow-hidden border-t border-borde bg-superficie text-texto transition-[background-color,border-color] duration-200 focus:outline-none ${
          saliendo ? 'animate-m3-salida-hoja pointer-events-none' : 'animate-m3-slide-up'
        }`}
      >
        {/* Barra de arrastre. `touch-none` es necesario: sin eso el navegador
            se queda el gesto vertical para hacer scroll y nunca llegan los
            eventos de puntero. */}
        <div
          className="w-full pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing shrink-0 group touch-none"
          onClick={cerrarSiFueToque}
          {...manejadoresArrastre}
        >
          <div className="h-1.5 w-12 rounded-full bg-superficie-2 group-hover:bg-borde-fuerte group-hover:w-14 transition-[background-color,width] duration-150" />
        </div>

        {/* Cabecera compacta. También arrastra: es la zona ancha y sin
            elementos interactivos, la que el pulgar encuentra sin mirar. */}
        {(visto.titulo || visto.subtitulo) && (
          <div
            className="flex items-start justify-between px-5 pt-1 pb-2.5 border-b border-borde shrink-0 touch-none"
            {...manejadoresArrastre}
          >
            <div>
              {visto.titulo && (
                <h2 id={`${id}-titulo`} className="text-base font-extrabold text-texto leading-tight">
                  {visto.titulo}
                </h2>
              )}
              {visto.subtitulo && <p className="text-xs text-texto-3 mt-0.5 font-medium">{visto.subtitulo}</p>}
            </div>
            <button
              type="button"
              onClick={pedirCierre}
              aria-label="Cerrar"
              className="m3-press flex h-8 w-8 items-center justify-center rounded-full text-texto-3 hover:text-texto-2 hover:bg-superficie-2 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Contenido scrolleable. Arrastrar desde acá cierra la hoja sólo si
            la lista ya está arriba del todo; si no, el gesto es del scroll. Es
            lo que hace iOS y lo que el pulgar espera. */}
        <div
          className="flex-1 overflow-y-auto px-5 py-3 overscroll-contain min-h-0"
          onPointerDown={(e) => {
            if (puedeArrastrarDesdeContenido(e)) iniciarArrastre(e);
          }}
          onPointerMove={moverArrastre}
          onPointerUp={soltarArrastre}
          onPointerCancel={soltarArrastre}
          style={{
            paddingBottom: tecladoActivo
              ? '0.75rem'
              : visto.footer
              ? '0.75rem'
              : 'max(env(safe-area-inset-bottom, 0px), 1.5rem)',
          }}
        >
          {visto.children}
        </div>

        {/* Pie de página fijo opcional */}
        {visto.footer && (
          <div
            className="shrink-0 border-t border-borde bg-superficie px-5 pt-2.5"
            style={{
              paddingBottom: tecladoActivo ? '0.75rem' : 'max(env(safe-area-inset-bottom, 0px), 1rem)',
            }}
          >
            {visto.footer}
          </div>
        )}
      </div>

      {/* "¿Descartar lo que escribiste?": encima de la hoja, con el foco en
          seguir. Es la misma pregunta que hace Windows. */}
      {preguntando && (
        <div className="fixed inset-0 z-20 flex items-end" role="presentation">
          <div className="absolute inset-0 bg-velo/40 animate-m3-fade" onClick={() => setPreguntando(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${id}-pregunta`}
            className="relative w-full rounded-t-[28px] bg-superficie border-t border-borde px-5 pt-5 animate-m3-slide-up"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)' }}
          >
            <h3 id={`${id}-pregunta`} className="text-base font-extrabold text-texto">
              ¿Descartar lo que escribiste?
            </h3>
            <p className="mt-1 text-sm text-texto-2">Lo que anotaste en esta hoja no se guardó.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setPreguntando(false)}
                className="tocable rounded-2xl border border-borde bg-superficie-2 px-4 py-3 text-sm font-bold text-texto active:scale-[0.98] transition-transform cursor-pointer"
              >
                Seguir editando
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreguntando(false);
                  onCerrar();
                }}
                className="tocable rounded-2xl bg-peligro px-4 py-3 text-sm font-bold text-peligro-texto active:scale-[0.98] transition-transform cursor-pointer"
              >
                Descartar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

