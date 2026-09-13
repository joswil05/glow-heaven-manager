import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { haptics } from '../lib/haptics';

/** Distancia que por sí sola basta para cerrar, si se soltó sin impulso. */
const UMBRAL_CIERRE_PX = 110;
/** Velocidad (px/ms) a partir de la cual un tirón corto ya cierra. */
const VELOCIDAD_CIERRE = 0.11;
/** Movimiento por debajo del cual el gesto se considera un toque, no arrastre. */
const TOLERANCIA_TOQUE_PX = 4;

interface BottomSheetProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo?: string;
  subtitulo?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxHeight?: string;
}

export function BottomSheet({
  abierto,
  onCerrar,
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
    // para cerrar algo que ya se decidió cerrar.
    if (a.y > UMBRAL_CIERRE_PX || velocidad > VELOCIDAD_CIERRE) {
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

    // No alcanzó: vuelve a su sitio con la misma curva de las hojas de Android.
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
    onCerrar();
  }

  const manejadoresArrastre = {
    onPointerDown: iniciarArrastre,
    onPointerMove: moverArrastre,
    onPointerUp: soltarArrastre,
    onPointerCancel: soltarArrastre,
  };

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

  if (!abierto) return null;

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
        onClick={onCerrar}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-[3px] animate-m3-fade"
        aria-hidden="true"
      />

      {/* Hoja deslizable (Bottom Sheet) */}
      <div
        ref={hojaRef}
        role="dialog"
        aria-modal="true"
        style={{
          maxHeight: alturaMaximaEfectiva,
        }}
        className="relative z-10 w-full flex flex-col rounded-t-[28px] shadow-2xl animate-m3-slide-up overflow-hidden border-t border-borde bg-superficie text-texto transition-[background-color,border-color] duration-200"
      >
        {/* Barra de arrastre. `touch-none` es necesario: sin eso el navegador
            se queda el gesto vertical para hacer scroll y nunca llegan los
            eventos de puntero. */}
        <div
          className="w-full pt-3 pb-1 flex justify-center cursor-grab active:cursor-grabbing shrink-0 group touch-none"
          onClick={cerrarSiFueToque}
          {...manejadoresArrastre}
        >
          <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-slate-400 dark:group-hover:bg-slate-500 group-hover:w-14 transition-[background-color,width] duration-150" />
        </div>

        {/* Cabecera compacta. También arrastra: es la zona ancha y sin
            elementos interactivos, la que el pulgar encuentra sin mirar. */}
        {(titulo || subtitulo) && (
          <div
            className="flex items-start justify-between px-5 pt-1 pb-2.5 border-b border-borde shrink-0 touch-none"
            {...manejadoresArrastre}
          >
            <div>
              {titulo && <h2 className="text-base font-extrabold text-texto leading-tight">{titulo}</h2>}
              {subtitulo && <p className="text-xs text-texto-3 mt-0.5 font-medium">{subtitulo}</p>}
            </div>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="m3-press flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:text-texto-2 hover:bg-superficie-2 cursor-pointer"
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
              : footer
              ? '0.75rem'
              : 'max(env(safe-area-inset-bottom, 0px), 1.5rem)',
          }}
        >
          {children}
        </div>

        {/* Pie de página fijo opcional */}
        {footer && (
          <div
            className="shrink-0 border-t border-borde bg-superficie px-5 pt-2.5"
            style={{
              paddingBottom: tecladoActivo ? '0.75rem' : 'max(env(safe-area-inset-bottom, 0px), 1rem)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

