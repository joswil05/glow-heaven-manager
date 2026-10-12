import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useCola } from '../context/ColaContext';
import { useConexion } from '../context/ConexionContext';
import { contarCola, textoAviso } from '../lib/cola';
import { haptics } from '../lib/haptics';

/**
 * Con red, lo que espera subir se muestra sólo si tarda: una subida de un
 * segundo no hace aparecer y desaparecer una barra.
 */
const ESPERA_ANTES_DE_MOSTRAR_MS = 1200;

function useRetrasado(activo: boolean, ms: number): boolean {
  const [listo, setListo] = useState(false);
  useEffect(() => {
    if (!activo) {
      setListo(false);
      return;
    }
    const id = window.setTimeout(() => setListo(true), ms);
    return () => window.clearTimeout(id);
  }, [activo, ms]);
  return activo && listo;
}

/**
 * El aviso de la cola (C4 · T7): cuánto espera y cuánto hay que revisar. Sin
 * red va dentro de la franja; con red, en una barra arriba, sólo si hay algo
 * para revisar o si lo pendiente tarda en subir.
 */
export function useAvisoCola() {
  const { cola, abrirPendientes } = useCola();
  const { enLinea } = useConexion();
  const cuenta = contarCola(cola);
  const tardaEnSubir = useRetrasado(enLinea && cuenta.pendientes > 0, ESPERA_ANTES_DE_MOSTRAR_MS);
  return {
    texto: textoAviso(cuenta),
    hayParaRevisar: cuenta.revisar > 0,
    barraConRed: enLinea && (cuenta.revisar > 0 || tardaEnSubir),
    abrirPendientes,
  };
}

/** Dentro de la franja "Sin conexión". */
export function BotonPendientes({ texto, onAbrir }: { texto: string; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptics.selection();
        onAbrir();
      }}
      className="tocable shrink-0 rounded-full bg-alerta px-2.5 py-0.5 text-[11px] font-bold text-alerta-texto active:scale-[0.97] transition-transform"
    >
      {texto}
    </button>
  );
}

/**
 * Con red, arriba de todo como la franja: ocupa el margen del notch, y quien
 * la muestra se lo saca a las pantallas de abajo. No se anima.
 */
export function BarraCola({ texto, revisar, onAbrir }: { texto: string; revisar: boolean; onAbrir: () => void }) {
  return (
    <div className={`shrink-0 pt-safe-t ${revisar ? 'bg-peligro-suave text-peligro-fuerte' : 'bg-superficie-2 text-texto-2'}`}>
      <button
        type="button"
        onClick={() => {
          haptics.selection();
          onAbrir();
        }}
        className="flex min-h-8 w-full items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-semibold"
      >
        {revisar ? (
          <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
        ) : (
          <Loader2 size={14} className="shrink-0 animate-spin" aria-hidden="true" />
        )}
        {texto}
      </button>
    </div>
  );
}
