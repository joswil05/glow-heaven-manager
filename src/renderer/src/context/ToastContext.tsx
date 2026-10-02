import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { CheckCircle2, AlertCircle, Info, RotateCcw, X } from 'lucide-react';
import { Button } from '../components/ui';

export interface ToastOptions {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  undoable?: boolean;
  onUndo?: () => void;
}

interface ToastItem extends ToastOptions {
  id: string;
  /** Lo que le queda a la vista. Sólo corre mientras se puede leer. */
  restanteMs: number;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  showUndoToast: (message: string, onUndoSuccess?: () => void, grupoId?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/** Si el foco está donde se escribe: ahí Ctrl+Z es del campo, no de la app. */
function enUnCampo(el: Element | null): boolean {
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName !== 'INPUT') return false;
  const tipo = ((el as HTMLInputElement).type || 'text').toLowerCase();
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(tipo);
}

const PASO_MS = 250;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  /**
   * El tiempo de un aviso es para leerlo, no para correr (BAS-03): se para
   * con el mouse encima y mientras la ventana está oculta. "Deshacer (10s)"
   * se consumía mientras Ross miraba otra cosa.
   */
  const [sobreAvisos, setSobreAvisos] = useState(false);
  const [oculta, setOculta] = useState(() => document.visibilityState === 'hidden');

  useEffect(() => {
    const alCambiar = () => setOculta(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, []);

  const hay = toasts.length > 0;
  useEffect(() => {
    if (!hay || sobreAvisos || oculta) return;
    const t = setInterval(() => {
      setToasts((prev) =>
        prev.map((x) => ({ ...x, restanteMs: x.restanteMs - PASO_MS })).filter((x) => x.restanteMs > 0)
      );
    }, PASO_MS);
    return () => clearInterval(t);
  }, [hay, sobreAvisos, oculta]);

  const removeToast = useCallback((id: string) => {
    // Cerrado con su X, el mouse ya no está sobre él: si no, los demás
    // quedaban parados hasta volver a pasar por encima.
    setSobreAvisos(false);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    // Un error se lee más despacio que un "listo": dice qué pasó y qué hacer.
    ({ message, type = 'info', duration = type === 'error' ? 8000 : 4000 }: ToastOptions) => {
      const id = Math.random().toString(36).substring(2, 9);
      setToasts((prev) => [...prev, { id, message, type, duration, restanteMs: duration }]);
    },
    []
  );

  const showUndoToast = useCallback(
    (message: string, onUndoSuccess?: () => void, grupoId?: string) => {
      const id = Math.random().toString(36).substring(2, 9);
      const duration = 10000; // 10 segundos

      const handleUndo = async () => {
        removeToast(id);
        try {
          const res = await window.api.sistema.deshacer(grupoId);
          if (res.success && res.data.revertido) {
            showToast({
              message: `Deshecho: ${res.data.descripcion}`,
              type: 'info',
              duration: 3000,
            });
            if (onUndoSuccess) onUndoSuccess();
          } else {
            showToast({
              message: res.success ? res.data.descripcion : res.error,
              type: 'error',
            });
          }
        } catch {
          showToast({ message: 'Error al intentar deshacer.', type: 'error' });
        }
      };

      setToasts((prev) => [
        ...prev,
        { id, message, type: 'success', duration, undoable: true, onUndo: handleUndo, restanteMs: duration },
      ]);
    },
    [removeToast, showToast]
  );

  // Atajo global Ctrl+Z contextual cuando hay un toast activo.
  //
  // Dentro de un campo, Ctrl+Z es "borrar lo que escribí": hasta la 2.16.2
  // también deshacía la última operación guardada (un abono, una venta)
  // mientras su aviso siguiera en pantalla. Y deshace el aviso MÁS RECIENTE,
  // no el más viejo: deshacer va de atrás para adelante.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (enUnCampo(document.activeElement)) return;
        const undoableToast = [...toasts].reverse().find((t) => t.undoable && t.onUndo);
        if (undoableToast && undoableToast.onUndo) {
          e.preventDefault();
          undoableToast.onUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toasts]);

  const value = useMemo(() => ({ showToast, showUndoToast }), [showToast, showUndoToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Contenedor de Toasts flotante en la esquina inferior derecha */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-md w-full px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            onMouseEnter={() => setSobreAvisos(true)}
            onMouseLeave={() => setSobreAvisos(false)}
            className="pointer-events-auto bg-inverso text-inverso-texto px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between gap-3 border border-inverso-2 animate-fade-in"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-success-500 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-danger-500 shrink-0" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-acento-suave shrink-0" />}
              {/* Hasta tres líneas: los errores explican qué hacer, y en una
                  sola línea se cortaban justo ahí. */}
              <span className="text-body leading-snug line-clamp-3 break-words" title={toast.message}>
                {toast.message}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {toast.undoable && toast.onUndo && (
                <Button variant="primary" size="sm" onClick={toast.onUndo}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Deshacer ({Math.ceil(toast.restanteMs / 1000)}s)</span>
                </Button>
              )}
              <button
                onClick={() => removeToast(toast.id)}
                className="text-inverso-texto-2 hover:text-inverso-texto p-1 rounded-md transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de un ToastProvider');
  }
  return context;
};
