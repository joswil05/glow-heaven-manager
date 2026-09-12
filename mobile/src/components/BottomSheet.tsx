import { type ReactNode, useEffect, useState } from 'react';
import { X } from 'lucide-react';

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

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex flex-col justify-end"
      style={{
        bottom: tecladoActivo ? `${keyboardOffset}px` : 0,
        height: viewportHeight ? `${viewportHeight}px` : '100dvh',
      }}
    >
      {/* Scrim / Fondo oscuro con blur */}
      <div
        onClick={onCerrar}
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-[3px] animate-m3-fade"
        aria-hidden="true"
      />

      {/* Hoja deslizable (Bottom Sheet) */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          maxHeight: alturaMaximaEfectiva,
        }}
        className="relative z-10 w-full flex flex-col rounded-t-[28px] shadow-2xl animate-m3-slide-up overflow-hidden border-t border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#161f30] text-slate-900 dark:text-slate-100 transition-[background-color,border-color] duration-200"
      >
        {/* Barra de arrastre (Drag Handle) nativa de Android */}
        <div className="w-full pt-3 pb-1 flex justify-center cursor-pointer shrink-0 group active:scale-95 transition-transform" onClick={onCerrar}>
          <div className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-slate-400 dark:group-hover:bg-slate-500 group-hover:w-14 transition-all duration-150" />
        </div>

        {/* Cabecera compacta */}
        {(titulo || subtitulo) && (
          <div className="flex items-start justify-between px-5 pt-1 pb-2.5 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
            <div>
              {titulo && <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 leading-tight">{titulo}</h2>}
              {subtitulo && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{subtitulo}</p>}
            </div>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="m3-press flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        )}

        {/* Contenido scrolleable fluido */}
        <div
          className="flex-1 overflow-y-auto px-5 py-3 overscroll-contain min-h-0"
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
            className="shrink-0 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-[#161f30] px-5 pt-2.5"
            style={{
              paddingBottom: tecladoActivo ? '0.75rem' : 'max(env(safe-area-inset-bottom, 0px), 1rem)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

