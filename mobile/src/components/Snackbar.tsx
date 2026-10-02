import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X, RotateCcw } from 'lucide-react';
import { haptics } from '../lib/haptics';
import { EventosRepoFirestore } from '@repos/eventos.repo';

export type SnackbarType = 'success' | 'error' | 'info';

interface SnackbarContextType {
  mostrar: (mensaje: string, tipo?: SnackbarType, duracionMs?: number) => void;
  /**
   * Un aviso con "Deshacer", como en Windows (CEL-03): revierte el grupo de
   * eventos de lo que se acaba de guardar. `alDeshacer` vuelve a leer lo que
   * se ve en pantalla.
   */
  mostrarDeshacer: (mensaje: string, evento_grupo_id: string, alDeshacer?: () => void) => void;
}

const SnackbarContext = createContext<SnackbarContextType>({
  mostrar: () => {},
  mostrarDeshacer: () => {},
});

export function useSnackbar() {
  return useContext(SnackbarContext);
}

interface MensajeActivo {
  id: number;
  texto: string;
  tipo: SnackbarType;
  restanteMs: number;
  deshacer?: { grupo: string; alDeshacer?: () => void };
}

/**
 * Cuánto dura cada aviso. Un error se lee más despacio que un "listo": dice
 * qué pasó y qué hacer, y a 3,2 s se iba antes de leerlo (CEL-04). Deshacer,
 * diez segundos como en Windows.
 */
const DURACION = { success: 3200, info: 3200, error: 8000, deshacer: 10000 };
const PASO_MS = 250;

export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [mensajes, setMensajes] = useState<MensajeActivo[]>([]);
  // El tiempo es para leer, no para correr: se para mientras se toca un aviso
  // y mientras la app no está a la vista.
  const [tocando, setTocando] = useState(false);
  const [oculta, setOculta] = useState(() => document.visibilityState === 'hidden');
  const ultimoId = useRef(0);

  useEffect(() => {
    const alCambiar = () => setOculta(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, []);

  const hay = mensajes.length > 0;
  useEffect(() => {
    if (!hay || tocando || oculta) return;
    const t = setInterval(() => {
      setMensajes((prev) =>
        prev.map((m) => ({ ...m, restanteMs: m.restanteMs - PASO_MS })).filter((m) => m.restanteMs > 0)
      );
    }, PASO_MS);
    return () => clearInterval(t);
  }, [hay, tocando, oculta]);

  const agregar = useCallback((m: Omit<MensajeActivo, 'id'>) => {
    ultimoId.current += 1;
    const id = ultimoId.current;
    setMensajes((prev) => [...prev, { ...m, id }]);
  }, []);

  const mostrar = useCallback(
    (texto: string, tipo: SnackbarType = 'info', duracionMs?: number) => {
      // Haptic feedback estilo iOS según el tipo de alerta
      if (tipo === 'success') {
        haptics.success();
      } else if (tipo === 'error') {
        haptics.error();
      } else {
        haptics.selection();
      }
      agregar({ texto, tipo, restanteMs: duracionMs ?? DURACION[tipo] });
    },
    [agregar]
  );

  const mostrarDeshacer = useCallback(
    (texto: string, grupo: string, alDeshacer?: () => void) => {
      haptics.success();
      agregar({ texto, tipo: 'success', restanteMs: DURACION.deshacer, deshacer: { grupo, alDeshacer } });
    },
    [agregar]
  );

  const cerrar = (id: number) => {
    setTocando(false);
    setMensajes((prev) => prev.filter((m) => m.id !== id));
  };

  const deshacer = async (m: MensajeActivo) => {
    // La vibración antes de esperar: en iPhone sólo vibra dentro del toque.
    haptics.impact('medium');
    cerrar(m.id);
    try {
      const r = await EventosRepoFirestore.deshacerGrupo(m.deshacer!.grupo);
      if (r.revertido) {
        mostrar(`Deshecho: ${r.descripcion}`, 'info');
        m.deshacer!.alDeshacer?.();
      } else {
        mostrar(r.descripcion, 'error');
      }
    } catch (err) {
      mostrar(err instanceof Error ? err.message : 'No se pudo deshacer.', 'error');
    }
  };

  return (
    <SnackbarContext.Provider value={{ mostrar, mostrarDeshacer }}>
      {children}
      {/* Contenedor flotante de Notificaciones en la parte superior (estilo Android Heads-Up) */}
      <div
        className="fixed inset-x-0 z-[110] pointer-events-none flex flex-col items-center gap-2 px-4"
        style={{ top: 'max(env(safe-area-inset-top, 0px), 0.75rem)' }}
      >
        {mensajes.map((m) => (
          <div
            key={m.id}
            role={m.tipo === 'error' ? 'alert' : 'status'}
            onPointerDown={() => setTocando(true)}
            onPointerUp={() => setTocando(false)}
            onPointerLeave={() => setTocando(false)}
            onPointerCancel={() => setTocando(false)}
            onClick={() => !m.deshacer && cerrar(m.id)}
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
            {m.deshacer && (
              <button
                type="button"
                onClick={() => void deshacer(m)}
                className="tocable m3-press shrink-0 inline-flex items-center gap-1 rounded-xl bg-acento px-3 py-1.5 text-xs font-bold text-acento-texto"
              >
                <RotateCcw size={13} />
                Deshacer
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cerrar(m.id);
              }}
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
