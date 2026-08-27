import React from 'react';
import {
  CalendarDays,
  Calculator,
  ShoppingBag,
  Users,
  Settings,
} from 'lucide-react';

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
      badgeColor: 'bg-rose-500 text-white',
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
    <aside className="w-56 bg-slate-900 text-slate-300 flex flex-col justify-between shrink-0 p-3 select-none">
      <div className="space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          Menú Principal
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all text-left ${
                isActive
                  ? 'bg-glow-600 text-white shadow-md font-semibold'
                  : 'hover:bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${item.badgeColor}`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Pie de Sidebar */}
      <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/50 text-[11px] text-slate-400">
        <div className="font-semibold text-slate-200 mb-0.5">Glow Heaven v1.0</div>
        <div>Modo Local Seguro</div>
      </div>
    </aside>
  );
};
