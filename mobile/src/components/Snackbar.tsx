import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { haptics } from '../lib/haptics';

export type SnackbarType = 'success' | 'error' | 'info';

interface SnackbarContextType {
  mostrar: (mensaje: string, tipo?: SnackbarType, duracionMs?: number) => void;
}

const SnackbarContext = createContext<SnackbarContextType>({
  mostrar: () => {},
});

export function useSnackbar() {
  return useContext(SnackbarContext);
}

interface MensajeActivo {
  id: number;
  texto: string;
  tipo: SnackbarType;
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [mensajes, setMensajes] = useState<MensajeActivo[]>([]);

  const mostrar = useCallback((texto: string, tipo: SnackbarType = 'info', duracionMs = 3200) => {
    // Haptic feedback estilo iOS según el tipo de alerta
    if (tipo === 'success') {
      haptics.success();
    } else if (tipo === 'error') {
      haptics.error();
    } else {
      haptics.selection();
    }

    const id = Date.now() + Math.random();
    setMensajes((prev) => [...prev, { id, texto, tipo }]);

    setTimeout(() => {
      setMensajes((prev) => prev.filter((m) => m.id !== id));
    }, duracionMs);
  }, []);

  const cerrar = (id: number) => {
    setMensajes((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <SnackbarContext.Provider value={{ mostrar }}>
      {children}
      {/* Contenedor flotante de Notificaciones en la parte superior (estilo Android Heads-Up) */}
      <div
        className="fixed inset-x-0 z-[110] pointer-events-none flex flex-col items-center gap-2 px-4"
        style={{ top: 'max(env(safe-area-inset-top, 0px), 0.75rem)' }}
      >
        {mensajes.map((m) => (
          <div
            key={m.id}
            onClick={() => cerrar(m.id)}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl backdrop-blur-md animate-m3-slide-down text-white text-xs font-semibold max-w-sm w-full transition-all"
            style={{
              backgroundColor:
                m.tipo === 'success'
                  ? '#0f172a'
                  : m.tipo === 'error'
                    ? '#be123c'
                    : '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
            }}
          >
            {m.tipo === 'success' && <CheckCircle2 size={18} className="shrink-0 text-emerald-400" />}
            {m.tipo === 'error' && <AlertCircle size={18} className="shrink-0 text-rose-300" />}
            {m.tipo === 'info' && <Info size={18} className="shrink-0 text-sky-400" />}
            <span className="flex-1 leading-snug">{m.texto}</span>
            <button
              type="button"
              className="text-white/60 hover:text-white shrink-0 p-1 cursor-pointer"
              aria-label="Cerrar notificación"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </SnackbarContext.Provider>
  );
}
