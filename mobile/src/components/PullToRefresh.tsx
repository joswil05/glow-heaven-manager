import { useState, useRef, type ReactNode, type TouchEvent } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  className?: string;
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const startX = useRef<number | null>(null);
  const isPulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const UMBRAL = 70; // Píxeles necesarios para activar el refresh

  function handleTouchStart(e: TouchEvent) {
    // Solo permitir pull-to-refresh si el contenedor está en la cima absoluta (scrollTop <= 0)
    if (containerRef.current && containerRef.current.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      startX.current = e.touches[0].clientX;
      isPulling.current = false;
    } else {
      startY.current = null;
      startX.current = null;
      isPulling.current = false;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (startY.current === null || refreshing) return;
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const deltaY = currentY - startY.current;
    const deltaX = currentX - (startX.current ?? currentX);

    // Si el usuario desliza hacia ARRIBA para scrollear hacia abajo (deltaY <= 0)
    // o si el gesto es predominantemente horizontal (ej. swipe en gráficas):
    // Cancelar inmediatamente la detección de pull para ceder 100% el control al scroll nativo fluido
    if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY)) {
      startY.current = null;
      startX.current = null;
      isPulling.current = false;
      if (pullDistance !== 0) setPullDistance(0);
      return;
    }

    // Solo si se arrastra hacia abajo y seguimos en el tope superior
    if (containerRef.current && containerRef.current.scrollTop <= 0) {
      isPulling.current = true;
      const factor = Math.min(1, deltaY / (UMBRAL * 2.5));
      const distanciaAmortiguada = deltaY * (1 - factor * 0.5);
      const nuevaDistancia = Math.min(distanciaAmortiguada, 90);
      setPullDistance(nuevaDistancia);

      // Prevenir el pull-to-refresh nativo del navegador Chrome solo mientras se tira hacia abajo
      if (nuevaDistancia > 8 && e.cancelable) {
        e.preventDefault();
      }
    }
  }

  async function handleTouchEnd() {
    if (startY.current === null && !isPulling.current) return;
    startY.current = null;
    startX.current = null;
    isPulling.current = false;

    if (pullDistance >= UMBRAL && !refreshing) {
      setRefreshing(true);
      setPullDistance(UMBRAL * 0.8);
      try {
        await onRefresh();
      } catch (err) {
        console.error('[PullToRefresh] Error al refrescar:', err);
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        touchAction: 'pan-y',
        WebkitOverflowScrolling: 'touch',
      }}
      className={`relative flex-1 min-h-0 w-full overscroll-y-contain ${className || 'overflow-y-auto'}`}
    >
      {/* Indicador circular nativo Material 3 */}
      <div
        className="absolute top-2 inset-x-0 flex justify-center pointer-events-none z-30 transition-transform duration-200"
        style={{
          transform: `translateY(${pullDistance}px)`,
          opacity: pullDistance > 10 || refreshing ? 1 : 0,
        }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg border border-slate-100 text-emerald-600">
          <Loader2
            size={20}
            className={refreshing ? 'animate-spin' : ''}
            style={{
              transform: refreshing ? undefined : `rotate(${(pullDistance / UMBRAL) * 360}deg)`,
            }}
          />
        </div>
      </div>

      <div
        className="h-full flex flex-col"
        style={
          pullDistance > 0
            ? {
                transform: `translateY(${pullDistance * 0.35}px)`,
              }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
