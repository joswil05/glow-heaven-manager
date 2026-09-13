import { LayoutDashboard, ShoppingBag, Search, HandCoins } from 'lucide-react';
import type { Vista } from '../App';
import { haptics } from '../lib/haptics';
import { useTheme } from '../context/ThemeContext';

interface BottomNavProps {
  actual: Vista;
  onCambiar: (v: Vista) => void;
  badgeCarrito?: number;
  badgeCobranza?: number;
}

const ITEMS: { vista: Vista; etiqueta: string; Icono: typeof LayoutDashboard }[] = [
  { vista: 'panel', etiqueta: 'Inicio', Icono: LayoutDashboard },
  { vista: 'vender', etiqueta: 'Vender', Icono: ShoppingBag },
  { vista: 'cobranza', etiqueta: 'Cobros', Icono: HandCoins },
  { vista: 'inventario', etiqueta: 'Catálogo', Icono: Search },
];

export function BottomNav({ actual, onCambiar, badgeCarrito = 0, badgeCobranza = 0 }: BottomNavProps) {
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';

  return (
    <nav
      className="fixed inset-x-0 z-40 flex justify-center pointer-events-none px-3"
      style={{
        bottom: 'calc(0.65rem + env(safe-area-inset-bottom, 0px))',
      }}
      aria-label="Navegación principal flotante"
    >
      <div
        className="pointer-events-auto flex items-center justify-around w-full max-w-sm sm:max-w-md p-1.5 rounded-[26px] bg-superficie/95 backdrop-blur-2xl border border-borde shadow-[0_12px_36px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.6),0_0_1px_1px_rgba(255,255,255,0.08)] transition-all duration-300"
      >
        {ITEMS.map(({ vista, etiqueta, Icono }) => {
          const activo = actual === vista;
          return (
            <button
              key={vista}
              type="button"
              onClick={() => {
                if (actual !== vista) haptics.selection();
                onCambiar(vista);
              }}
              className="group relative flex flex-1 flex-col items-center justify-center py-1 px-1.5 rounded-2xl transition-transform duration-150 active:scale-[0.92] cursor-pointer outline-none select-none"
              aria-current={activo ? 'page' : undefined}
            >
              {/* Contenedor del icono con pill suave al estar activo */}
              <div
                className="relative flex items-center justify-center px-4 py-1 rounded-full transition-all duration-250 ease-out"
                style={{
                  backgroundColor: activo
                    ? isDark
                      ? 'rgba(16, 185, 129, 0.20)'
                      : '#dcfce7'
                    : 'transparent',
                }}
              >
                <Icono
                  size={20}
                  className="transition-all duration-200"
                  style={{
                    transform: activo ? 'scale(1.08)' : 'scale(1)',
                    strokeWidth: activo ? 2.4 : 1.9,
                    color: activo
                      ? isDark
                        ? '#34d399'
                        : '#059669'
                      : isDark
                        ? '#94a3b8'
                        : '#64748b',
                  }}
                />

                {/* Badge de carrito */}
                {vista === 'vender' && badgeCarrito > 0 && (
                  <span className="absolute -top-1 -right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-emerald-600 text-[9.5px] font-black text-white shadow-xs animate-in zoom-in-75">
                    {badgeCarrito}
                  </span>
                )}

                {/* Badge de cobranza */}
                {vista === 'cobranza' && badgeCobranza > 0 && (
                  <span className="absolute -top-1 -right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-600 text-[9.5px] font-black text-white shadow-xs animate-in zoom-in-75">
                    {badgeCobranza}
                  </span>
                )}
              </div>

              {/* Etiqueta de texto */}
              <span
                className="text-[10.5px] tracking-tight transition-colors duration-200 mt-0.5 leading-none"
                style={{
                  fontWeight: activo ? 700 : 500,
                  color: activo
                    ? isDark
                      ? '#34d399'
                      : '#059669'
                    : isDark
                      ? '#94a3b8'
                      : '#64748b',
                }}
              >
                {etiqueta}
              </span>

              {/* Punto indicador de estado activo */}
              {activo && (
                <span className="w-1 h-1 rounded-full bg-emerald-600 dark:bg-emerald-400 mt-0.5 transition-all animate-in fade-in-0 zoom-in-50 duration-200" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

