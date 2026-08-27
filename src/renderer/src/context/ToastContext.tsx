import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, RotateCcw, X } from 'lucide-react';

export interface ToastOptions {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  undoable?: boolean;
  onUndo?: () => void;
}

interface ToastItem extends ToastOptions {
  id: string;
  remainingSeconds: number;
}

interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  showUndoToast: (message: string, onUndoSuccess?: () => void) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, type = 'info', duration = 4000 }: ToastOptions) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = {
        id,
        message,
        type,
        duration,
        remainingSeconds: Math.ceil(duration / 1000),
      };

      setToasts((prev) => [...prev, newToast]);

      setTimeout(() => {
        removeToast(id);
      }, duration);
    },
    [removeToast]
  );

  const showUndoToast = useCallback(
    (message: string, onUndoSuccess?: () => void) => {
      const id = Math.random().toString(36).substring(2, 9);
      const duration = 10000; // 10 segundos

      const handleUndo = async () => {
        removeToast(id);
        try {
          const res = await window.api.sistema.deshacerUltimoGrupo();
          if (res.success && res.data.revertido) {
            showToast({
              message: `Deshecho: ${res.data.descripcion}`,
              type: 'info',
              duration: 3000,
            });
            if (onUndoSuccess) onUndoSuccess();
          } else {
            showToast({
              message: res.success ? res.data.descripcion : 'No se pudo deshacer la acción.',
              type: 'error',
            });
          }
        } catch {
          showToast({ message: 'Error al intentar deshacer.', type: 'error' });
        }
      };

      const newToast: ToastItem = {
        id,
        message,
        type: 'success',
        duration,
        undoable: true,
        onUndo: handleUndo,
        remainingSeconds: 10,
      };

      setToasts((prev) => [...prev, newToast]);

      // Timer para cuenta regresiva
      const interval = setInterval(() => {
        setToasts((prev) =>
          prev
            .map((t) =>
              t.id === id ? { ...t, remainingSeconds: t.remainingSeconds - 1 } : t
            )
            .filter((t) => t.remainingSeconds > 0)
        );
      }, 1000);

      setTimeout(() => {
        clearInterval(interval);
        removeToast(id);
      }, duration);
    },
    [removeToast, showToast]
  );

  // Atajo global Ctrl+Z contextual cuando hay un toast activo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const undoableToast = toasts.find((t) => t.undoable && t.onUndo);
        if (undoableToast && undoableToast.onUndo) {
          e.preventDefault();
          undoableToast.onUndo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toasts]);

  return (
    <ToastContext.Provider value={{ showToast, showUndoToast }}>
      {children}
      {/* Contenedor de Toasts flotante en la esquina inferior derecha */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none max-w-md w-full px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center justify-between gap-3 border border-slate-700 animate-fade-in"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-sky-400 shrink-0" />}
              <span className="text-sm font-medium leading-snug truncate">{toast.message}</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {toast.undoable && toast.onUndo && (
                <button
                  onClick={toast.onUndo}
                  className="flex items-center gap-1.5 px-3 py-1 bg-glow-600 hover:bg-glow-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-colors shadow-sm"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Deshacer ({toast.remainingSeconds}s)</span>
                </button>
              )}
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white p-1 rounded-md transition-colors"
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
