import { useState, useRef, type ReactNode, type TouchEvent } from 'react';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const UMBRAL = 70; // Píxeles necesarios para activar el refresh

  function handleTouchStart(e: TouchEvent) {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    } else {
      startY.current = null;
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (startY.current === null || refreshing) return;
    const currentY = e.touches[0].clientY;
    const delta = currentY - startY.current;

    if (delta > 0 && containerRef.current?.scrollTop === 0) {
      // Amortiguación no lineal tipo resorte
      const factor = Math.min(1, delta / (UMBRAL * 2.5));
      const distanciaAmortiguada = delta * (1 - factor * 0.5);
      setPullDistance(Math.min(distanciaAmortiguada, 90));
    } else {
      setPullDistance(0);
    }
  }

  async function handleTouchEnd() {
    if (startY.current === null) return;
    startY.current = null;

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
      className="relative flex-1 h-full overflow-y-auto overscroll-y-contain"
    >
      {/* Indicador circular nativo Material 3 */}
      <div
        className="absolute top-2 inset-x-0 flex justify-center pointer-events-none z-30 transition-transform duration-200"
        style={{
          transform: `translateY(${pullDistance}px)`,
          opacity: pullDistance > 10 || refreshing ? 1 : 0,
        }}
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg border border-slate-100 text-acento">
          <Loader2
            size={20}
            className={`${refreshing ? 'animate-spin' : ''}`}
            style={{
              transform: refreshing ? undefined : `rotate(${(pullDistance / UMBRAL) * 360}deg)`,
            }}
          />
        </div>
      </div>

      <div
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance * 0.35}px)` : undefined,
          transition: pullDistance === 0 ? 'transform 200ms ease-out' : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
