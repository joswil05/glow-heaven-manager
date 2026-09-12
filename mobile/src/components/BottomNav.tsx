import { LayoutDashboard, ShoppingBag, Search } from 'lucide-react';
import type { Vista } from '../App';
import { haptics } from '../lib/haptics';

interface BottomNavProps {
  actual: Vista;
  onCambiar: (v: Vista) => void;
  badgeCarrito?: number;
}

const ITEMS: { vista: Vista; etiqueta: string; Icono: typeof LayoutDashboard }[] = [
  { vista: 'panel', etiqueta: 'Panel', Icono: LayoutDashboard },
  { vista: 'vender', etiqueta: 'Vender', Icono: ShoppingBag },
  { vista: 'inventario', etiqueta: 'Catálogo', Icono: Search },
];

export function BottomNav({ actual, onCambiar, badgeCarrito = 0 }: BottomNavProps) {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        boxShadow: '0 -4px 20px rgba(0, 0, 0, 0.06)',
        zIndex: 40,
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
      }}
      aria-label="Navegación principal Android"
    >
      <div
        className="mx-auto flex w-full max-w-lg items-center justify-around px-2 pt-2 pb-1"
        style={{ display: 'flex', width: '100%', justifyContent: 'space-around' }}
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
              className="flex flex-1 flex-col items-center justify-center py-1 px-1 tocable outline-none transition-transform duration-100 active:scale-95"
              style={{
                flex: '1 1 0%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              aria-current={activo ? 'page' : undefined}
            >
              {/* Contenedor Pill de Material 3 */}
              <div className="relative">
                <div
                  className="flex items-center justify-center w-16 h-8 rounded-full transition-all duration-200"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '60px',
                    height: '32px',
                    borderRadius: '9999px',
                    backgroundColor: activo ? '#d1fae5' : 'transparent',
                    color: activo ? '#065f46' : '#64748b',
                  }}
                >
                  <Icono
                    size={20}
                    style={{
                      strokeWidth: activo ? 2.5 : 1.8,
                      color: activo ? '#047857' : '#64748b',
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
              </div>

              {/* Etiqueta de texto M3 */}
              <span
                style={{
                  fontSize: '11px',
                  marginTop: '4px',
                  letterSpacing: '-0.01em',
                  fontWeight: activo ? 700 : 500,
                  color: activo ? '#047857' : '#64748b',
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
