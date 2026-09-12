import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  PackagePlus,
  ShoppingBag,
  ClipboardList,
  Users,
  Settings,
  HandCoins,
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
 * Menú principal. Eran cuatro grupos con título ("Resumen", "Mercadería",
 * "Dinero", "Ajustes") para siete destinos que caben de un vistazo, más el
 * nombre del negocio repetido abajo. Para una persona que usa esto todos los
 * días, los rótulos de grupo solo agregan ruido: ahora es una lista.
 */
export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  avisos = {},
  nombreNegocio = 'Glow Heaven',
}) => {
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
    <aside className="w-56 bg-barra flex flex-col shrink-0 select-none border-r border-borde">
      <div className="px-3.5 py-4 flex items-center gap-3 border-b border-barra-2">
        <div className="w-11 h-11 rounded-xl overflow-hidden border-2 border-acento/25 shadow-sm shrink-0 bg-white p-0.5">
          <img
            src={logoImg}
            alt="Glow Heaven"
            className="w-full h-full object-contain rounded-lg"
          />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-body font-bold text-barra-texto truncate leading-tight">
            {nombreNegocio}
          </span>
          <span className="text-[9px] text-acento font-semibold tracking-[0.15em] uppercase">
            PURE • MAGIC • DIVINE
          </span>
        </div>
      </div>

      <nav className="p-3 space-y-0.5" aria-label="Menú principal">
        {items.map((item) => {
          const Icon = item.icon;
          const activo = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              aria-current={activo ? 'page' : undefined}
              className={cn(
                'group w-full flex items-center justify-between px-3 py-2 rounded-lg text-body text-left border-l-2 cursor-pointer',
                'transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-out active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-inset',
                activo
                  ? 'bg-superficie text-texto border-l-acento font-medium shadow-xs'
                  : 'border-l-transparent text-barra-texto hover:bg-barra-2 hover:text-texto'
              )}
            >
              <span className="flex items-center gap-3">
                <Icon
                  className={cn(
                    'w-4 h-4 transition-transform duration-150 group-hover:translate-x-0.5',
                    activo ? 'text-acento' : 'text-barra-texto-2'
                  )}
                />
                <span className="transition-transform duration-150 group-hover:translate-x-0.5">{TITULOS[item.id]}</span>
              </span>
              {item.badge !== undefined && item.badge > 0 && (
                <Badge tone={item.tono ?? 'danger'}>{item.badge}</Badge>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
