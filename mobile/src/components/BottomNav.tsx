import { LayoutDashboard, ShoppingBag, Package, Users, LayoutGrid } from 'lucide-react';
import type { Vista } from '../App';
import { haptics } from '../lib/haptics';

interface BottomNavProps {
  actual: Vista;
  onCambiar: (v: Vista) => void;
  /**
   * Insignias (NAV-3): sólo cuando hay algo que hacer. Clientas, las que
   * tienen cobros vencidos; Más, los encargos por mandar o por entregar.
   */
  insignias?: Partial<Record<Vista, number>>;
}

// NAV-1: Cobros pasa a ser Clientas y el Historial entra en "Más".
const ITEMS: { vista: Vista; etiqueta: string; Icono: typeof LayoutDashboard }[] = [
  { vista: 'panel', etiqueta: 'Inicio', Icono: LayoutDashboard },
  { vista: 'vender', etiqueta: 'Vender', Icono: ShoppingBag },
  { vista: 'cobranza', etiqueta: 'Clientas', Icono: Users },
  { vista: 'inventario', etiqueta: 'Inventario', Icono: Package },
  { vista: 'mas', etiqueta: 'Más', Icono: LayoutGrid },
];

/** El color de cada insignia: lo vencido en el color de peligro, lo demás en el de la marca. */
const CLASE_INSIGNIA: Partial<Record<Vista, string>> = {
  cobranza: 'bg-peligro text-peligro-texto',
  mas: 'bg-acento text-acento-texto',
};

export function BottomNav({ actual, onCambiar, insignias = {} }: BottomNavProps) {
  return (
    <nav
      className="fixed inset-x-0 z-40 flex justify-center pointer-events-none px-3"
      style={{
        bottom: 'calc(0.65rem + env(safe-area-inset-bottom, 0px))',
      }}
      aria-label="Navegación principal flotante"
    >
      <div
        className="pointer-events-auto flex items-center justify-around w-full max-w-sm sm:max-w-md p-1.5 rounded-[26px] bg-superficie/95 backdrop-blur-2xl border border-borde shadow-m3-3"
      >
        {ITEMS.map(({ vista, etiqueta, Icono }) => {
          const activo = actual === vista;
          const insignia = insignias[vista] ?? 0;
          return (
            <button
              key={vista}
              type="button"
              onClick={() => {
                if (actual !== vista) haptics.selection();
                onCambiar(vista);
              }}
              // MOV-1: cambiar de pestaña no se anima; sólo responde al presionar.
              className="group relative flex flex-1 flex-col items-center justify-center py-1 px-1.5 rounded-2xl transition-transform duration-100 ease-out active:scale-[0.97] cursor-pointer outline-none select-none"
              aria-current={activo ? 'page' : undefined}
              aria-label={insignia > 0 ? `${etiqueta}, ${insignia} por hacer` : undefined}
            >
              {/* Contenedor del icono con pill suave al estar activo */}
              <div
                className="relative flex items-center justify-center px-3.5 py-1 rounded-full"
                style={{
                  backgroundColor: activo ? 'rgb(var(--acento) / 0.18)' : 'transparent',
                }}
              >
                <Icono
                  size={20}
                  style={{
                    transform: activo ? 'scale(1.08)' : 'scale(1)',
                    strokeWidth: activo ? 2.4 : 1.9,
                    color: activo ? 'rgb(var(--acento))' : 'rgb(var(--texto-3))',
                  }}
                />

                {insignia > 0 && (
                  <span
                    className={`absolute -top-1 -right-1.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full text-[9.5px] font-black shadow-xs ${CLASE_INSIGNIA[vista] ?? 'bg-acento text-acento-texto'}`}
                    data-insignia=""
                    aria-hidden="true"
                  >
                    {insignia}
                  </span>
                )}
              </div>

              {/* Etiqueta de texto */}
              <span
                className="text-[10.5px] tracking-tight mt-0.5 leading-none"
                style={{
                  fontWeight: activo ? 700 : 500,
                  color: activo ? 'rgb(var(--acento))' : 'rgb(var(--texto-3))',
                }}
              >
                {etiqueta}
              </span>

              {/* Punto indicador de estado activo */}
              {activo && <span className="w-1 h-1 rounded-full bg-acento mt-0.5" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
