import React, { useState } from 'react';
import {
  LayoutDashboard,
  Boxes,
  PackagePlus,
  ShoppingBag,
  ClipboardList,
  Users,
  Settings,
  HandCoins,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Badge } from '../ui';
import { cn } from '../../lib/cn';
import logoImg from '../../assets/logo.jpg';

export type NavTab =
  | 'panel'
  | 'inventario'
  | 'paquetes'
  | 'ventas'
  | 'encargos'
  | 'cobranza'
  | 'clientes'
  | 'config';

export interface AvisosNav {
  bajoStock?: number;
  porCobrar?: number;
  encargosPendientes?: number;
}

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  avisos?: AvisosNav;
  nombreNegocio?: string;
}

export const TITULOS: Record<NavTab, string> = {
  panel: 'Inicio',
  inventario: 'Inventario',
  paquetes: 'Paquetes',
  ventas: 'Ventas',
  encargos: 'Encargos',
  cobranza: 'Cobros y Abonos',
  clientes: 'Clientes',
  config: 'Configuración',
};

/**
 * Menú lateral de navegación ergonómico y plegable.
 * Soporta modo expandido (w-56 / 224px) y modo rail colapsado (w-[68px])
 * con íconos centrados, tooltips nativos y persistencia en localStorage.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  avisos = {},
  nombreNegocio = 'Glow Heaven',
}) => {
  const [colapsada, setColapsada] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gh_sidebar_colapsada') === 'true';
    } catch {
      return false;
    }
  });

  const toggleColapso = () => {
    setColapsada((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('gh_sidebar_colapsada', String(next));
      } catch {
        // Ignorar
      }
      return next;
    });
  };

  const items: {
    id: NavTab;
    icon: typeof LayoutDashboard;
    badge?: number;
    tono?: 'danger' | 'warning';
  }[] = [
    { id: 'panel', icon: LayoutDashboard },
    { id: 'inventario', icon: Boxes, badge: avisos.bajoStock, tono: 'warning' },
    { id: 'paquetes', icon: PackagePlus },
    { id: 'ventas', icon: ShoppingBag },
    { id: 'encargos', icon: ClipboardList, badge: avisos.encargosPendientes, tono: 'warning' },
    { id: 'cobranza', icon: HandCoins, badge: avisos.porCobrar, tono: 'danger' },
    { id: 'clientes', icon: Users },
    { id: 'config', icon: Settings },
  ];

  return (
    <aside
      className={cn(
        'bg-barra flex flex-col shrink-0 select-none border-r border-borde transition-[width] duration-200 ease-out z-10',
        colapsada ? 'w-[68px]' : 'w-56'
      )}
    >
      {/* Encabezado con Logo y Marca */}
      <div
        className={cn(
          'flex items-center border-b border-borde/60 transition-[padding] duration-200 ease-out',
          colapsada ? 'py-3.5 px-2 justify-center' : 'px-3.5 py-3.5 gap-3'
        )}
      >
        <div
          className={cn(
            'rounded-xl overflow-hidden ring-1 ring-borde/80 shadow-2xs shrink-0 bg-superficie p-1 transition-[width,height] duration-200 ease-out',
            colapsada ? 'w-9 h-9' : 'w-10 h-10'
          )}
          title={colapsada ? nombreNegocio : undefined}
        >
          <img
            src={logoImg}
            alt={nombreNegocio}
            className="w-full h-full object-contain rounded-lg"
          />
        </div>

        {!colapsada && (
          <div className="flex flex-col min-w-0 animate-fade-in">
            <span className="text-body font-bold text-texto tracking-tight truncate leading-tight">
              {nombreNegocio}
            </span>
            <span className="text-[11px] text-texto-3 font-medium tracking-normal truncate mt-0.5">
              Gestión Boutique
            </span>
          </div>
        )}
      </div>

      {/* Lista de Destinos de Navegación */}
      <nav className={cn('space-y-1 flex-1', colapsada ? 'p-1.5' : 'p-3')} aria-label="Menú principal">
        {items.map((item) => {
          const Icon = item.icon;
          const activo = activeTab === item.id;
          const tieneBadge = item.badge !== undefined && item.badge > 0;

          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              aria-current={activo ? 'page' : undefined}
              title={colapsada ? `${TITULOS[item.id]}${tieneBadge ? ` (${item.badge})` : ''}` : undefined}
              className={cn(
                'group w-full flex items-center rounded-lg text-body text-left cursor-pointer relative',
                'transition-[background-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-inset',
                colapsada ? 'justify-center py-2.5 px-0' : 'justify-between px-3 py-2',
                activo
                  ? 'bg-acento-suave/60 text-acento-fuerte font-semibold shadow-2xs'
                  : 'text-texto-2 hover:bg-superficie-2/70 hover:text-texto font-medium'
              )}
            >
              {activo && (
                <span
                  className={cn(
                    'absolute top-1.5 bottom-1.5 w-1 bg-acento rounded-r-full transition-[left] duration-150 ease-out',
                    colapsada ? 'left-0.5' : 'left-0'
                  )}
                  aria-hidden="true"
                />
              )}

              <span className={cn('flex items-center', colapsada ? 'justify-center' : 'gap-3')}>
                <Icon
                  className={cn(
                    'w-4 h-4 transition-transform duration-150',
                    colapsada ? 'group-hover:scale-110' : 'group-hover:translate-x-0.5',
                    activo ? 'text-acento-fuerte' : 'text-texto-3 group-hover:text-texto-2'
                  )}
                />
                {!colapsada && (
                  <span className="transition-transform duration-150 group-hover:translate-x-0.5">
                    {TITULOS[item.id]}
                  </span>
                )}
              </span>

              {/* Badges: número completo si expandido, dot discreto si colapsado */}
              {tieneBadge && (
                <>
                  {!colapsada ? (
                    <Badge tone={item.tono ?? 'danger'}>{item.badge}</Badge>
                  ) : (
                    <span
                      className={cn(
                        'absolute top-1.5 right-2 w-2 h-2 rounded-full ring-2 ring-barra',
                        item.tono === 'warning' ? 'bg-alerta' : 'bg-peligro'
                      )}
                    />
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>

      {/* Pie de Barra Lateral con Botón de Plegar/Expandir */}
      <div className="p-2 border-t border-borde/60 mt-auto shrink-0">
        <button
          type="button"
          onClick={toggleColapso}
          title={colapsada ? 'Expandir barra lateral' : 'Plegar barra lateral'}
          className={cn(
            'w-full flex items-center rounded-lg text-caption font-medium text-texto-3 hover:text-texto hover:bg-superficie-2/70 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] cursor-pointer py-2',
            colapsada ? 'justify-center px-0' : 'justify-between px-3'
          )}
        >
          {!colapsada && <span>Plegar menú</span>}
          {colapsada ? (
            <ChevronRight className="w-4 h-4 text-texto-3 hover:text-texto transition-colors" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-texto-3 hover:text-texto transition-colors" />
          )}
        </button>
      </div>
    </aside>
  );
};
