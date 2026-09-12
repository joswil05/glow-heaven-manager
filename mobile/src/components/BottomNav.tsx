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
      className="fixed bottom-0 left-0 right-0 w-full z-40 bg-white dark:bg-[#121826] border-t border-slate-200/80 dark:border-slate-800/80 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_25px_rgba(0,0,0,0.5)] transition-colors duration-200"
      style={{
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
      }}
      aria-label="Navegación principal Android"
    >
      <div
        className="mx-auto flex w-full max-w-lg items-center justify-around px-2 pt-2 pb-1"
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
              className="flex flex-1 flex-col items-center justify-center py-1 px-1 tocable outline-none transition-transform duration-140 active:scale-[0.93] cursor-pointer"
              aria-current={activo ? 'page' : undefined}
            >
              {/* Contenedor Pill de Material 3 */}
              <div className="relative">
                <div
                  className="flex items-center justify-center w-15 h-8 rounded-full transition-all duration-200"
                  style={{
                    transform: activo ? 'scale(1.04)' : 'scale(1)',
                    backgroundColor: activo
                      ? isDark
                        ? 'rgba(16, 185, 129, 0.22)'
                        : '#d1fae5'
                      : 'transparent',
                  }}
                >
                  <Icono
                    size={20}
                    className="transition-transform duration-200"
                    style={{
                      transform: activo ? 'scale(1.06)' : 'scale(1)',
                      strokeWidth: activo ? 2.5 : 1.8,
                      color: activo
                        ? isDark
                          ? '#34d399'
                          : '#047857'
                        : isDark
                          ? '#94a3b8'
                          : '#64748b',
                    }}
                  />
                </div>

                {/* Badge de carrito */}
                {vista === 'vender' && badgeCarrito > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      display: 'flex',
                      height: '18px',
                      minWidth: '18px',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '9999px',
                      backgroundColor: '#059669',
                      padding: '0 4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#ffffff',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    }}
                  >
                    {badgeCarrito}
                  </span>
                )}

                {/* Badge de cobranza (cuotas pendientes/vencidas) */}
                {vista === 'cobranza' && badgeCobranza > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      display: 'flex',
                      height: '18px',
                      minWidth: '18px',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '9999px',
                      backgroundColor: '#dc2626',
                      padding: '0 4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      color: '#ffffff',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    }}
                  >
                    {badgeCobranza}
                  </span>
                )}
              </div>

              {/* Etiqueta de texto M3 */}
              <span
                style={{
                  fontSize: '11px',
                  marginTop: '4px',
                  letterSpacing: '-0.01em',
                  fontWeight: activo ? 700 : 500,
                  color: activo
                    ? isDark
                      ? '#34d399'
                      : '#047857'
                    : isDark
                      ? '#94a3b8'
                      : '#64748b',
                }}
              >
                {etiqueta}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
