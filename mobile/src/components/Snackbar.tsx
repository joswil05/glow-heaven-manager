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
            /* Un aviso es una superficie ELEVADA, no una invertida. Antes
               usaba `rgb(var(--texto))` de fondo —el color del texto como
               fondo—, así que en tema oscuro salía un rectángulo blanco
               encandilando, y en error/info tenía dos colores escritos a
               mano (uno de ellos slate, azul). El tipo de aviso lo dice el
               ícono; no hace falta inundar todo el recuadro de color. */
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border bg-superficie-3 px-4 py-3 text-xs font-semibold text-texto shadow-m3-3 backdrop-blur-md animate-m3-slide-down ${
              m.tipo === 'error' ? 'border-peligro-suave' : 'border-borde'
            }`}
          >
            {m.tipo === 'success' && <CheckCircle2 size={18} className="shrink-0 text-acento" />}
            {m.tipo === 'error' && <AlertCircle size={18} className="shrink-0 text-peligro" />}
            {m.tipo === 'info' && <Info size={18} className="shrink-0 text-texto-2" />}
            <span className="flex-1 leading-snug">{m.texto}</span>
            <button
              type="button"
              className="shrink-0 p-1 text-texto-3 hover:text-texto cursor-pointer"
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
