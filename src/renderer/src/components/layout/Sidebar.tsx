import React from 'react';
import {
  CalendarDays,
  Calculator,
  ShoppingBag,
  Users,
  Settings,
} from 'lucide-react';
import { Badge } from '../ui';
import { cn } from '../../lib/cn';

export type NavTab = 'hoy' | 'cotizador' | 'pedidos' | 'clientes' | 'config';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pedidosRequierenAtencionCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  pedidosRequierenAtencionCount = 0,
}) => {
  const navItems = [
    {
      id: 'hoy' as NavTab,
      label: 'Hoy',
      icon: CalendarDays,
      description: 'Pendientes y resumen',
      badge: pedidosRequierenAtencionCount > 0 ? pedidosRequierenAtencionCount : undefined,
    },
    {
      id: 'cotizador' as NavTab,
      label: 'Cotizador',
      icon: Calculator,
      description: 'Calcular y cotizar',
    },
    {
      id: 'pedidos' as NavTab,
      label: 'Pedidos',
      icon: ShoppingBag,
      description: 'Semáforo y compras',
    },
    {
      id: 'clientes' as NavTab,
      label: 'Clientes',
      icon: Users,
      description: 'Directorio',
    },
    {
      id: 'config' as NavTab,
      label: 'Configuración',
      icon: Settings,
      description: 'Cuentas y parámetros',
    },
  ];

  return (
    <aside className="w-56 bg-navy-900 text-slate-300 flex flex-col justify-between shrink-0 p-3 select-none">
      <div className="space-y-1">
        <div className="px-3 py-2 text-caption font-medium tracking-wide text-slate-500 uppercase">
          Menú Principal
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 rounded-md text-body transition-colors text-left border-l-2',
                isActive
                  ? 'bg-navy-800 text-white border-l-brand-500 font-medium'
                  : 'border-l-transparent text-slate-400 hover:bg-navy-800/60 hover:text-white'
              )}
            >
              <div className="flex items-center gap-3">
                <Icon className={cn('w-4 h-4', isActive ? 'text-white' : 'text-slate-400')} />
                <span>{item.label}</span>
              </div>
              {item.badge && <Badge tone="danger">{item.badge}</Badge>}
            </button>
          );
        })}
      </div>

      {/* Pie de Sidebar */}
      <div className="p-3 bg-navy-800/60 rounded-lg border border-navy-700/50 text-caption text-slate-400">
        <div className="font-medium text-slate-200 mb-0.5">Glow Heaven v1.0</div>
        <div>Modo Local Seguro</div>
      </div>
    </aside>
  );
};
