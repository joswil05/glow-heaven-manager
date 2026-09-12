import React from 'react';
import { Plus, PackagePlus, LogOut, RefreshCw, Sun, Moon, Monitor } from 'lucide-react';
import { formatearMoneda } from '@core/moneda';
import { Button } from '../ui';
import { cn } from '../../lib/cn';
import { useTheme } from '../../context/ThemeContext';
import type { UsuarioGoogle } from '../../../../shared/ipc-contracts';

interface HeaderProps {
  /** Nombre de la sección que se está viendo. */
  titulo: string;
  tasaCambioCents: number;
  usuario?: UsuarioGoogle | null;
  cargando?: boolean;
  onNuevaVenta: () => void;
  onNuevoPaquete: () => void;
  onCerrarSesion: () => void;
  onRefrescar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  titulo,
  tasaCambioCents,
  usuario,
  cargando = false,
  onNuevaVenta,
  onNuevoPaquete,
  onCerrarSesion,
  onRefrescar,
}) => {
  const inicial = (usuario?.nombre || usuario?.email || 'U').charAt(0).toUpperCase();
  const { theme, effectiveTheme, toggleTheme } = useTheme();

  return (
    <header className="h-14 bg-superficie border-b border-borde flex items-center justify-between px-4 shrink-0 select-none">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-title font-bold text-texto truncate tracking-tight">{titulo}</h1>
        
        {/* Badge estilizado para la tasa de cambio con botón de recarga interactivo */}
        <div className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-superficie-2/80 border border-borde/80 text-caption font-medium text-texto-2 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="tabular font-semibold text-texto">
            1 USD = {formatearMoneda(tasaCambioCents, 'COR')}
          </span>
          {onRefrescar && (
            <button
              type="button"
              onClick={onRefrescar}
              disabled={cargando}
              title={cargando ? 'Actualizando datos del sistema...' : 'Actualizar datos ahora'}
              aria-label="Actualizar datos del sistema"
              className={cn(
                'p-0.5 rounded text-texto-3 hover:text-texto hover:bg-superficie transition-all active:scale-90 cursor-pointer group',
                cargando && 'cursor-not-allowed opacity-70'
              )}
            >
              <RefreshCw
                className={cn(
                  'w-3 h-3 transition-transform duration-500',
                  cargando ? 'animate-spin text-acento' : 'group-hover:rotate-180'
                )}
              />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Button variant="secondary" size="sm" onClick={onNuevoPaquete} className="rounded-xl">
          <PackagePlus className="w-3.5 h-3.5 text-texto-2" />
          <span className="hidden sm:inline font-medium">Paquete</span>
        </Button>

        <Button variant="primary" size="sm" onClick={onNuevaVenta} className="rounded-xl shadow-sm shadow-acento/20 font-semibold">
          <Plus className="w-3.5 h-3.5" />
          <span>Nueva venta</span>
          <kbd className="hidden lg:inline-flex ml-1 px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-mono font-medium text-white leading-none">
            Ctrl+N
          </kbd>
        </Button>

        <div className="h-5 w-px bg-borde mx-0.5 hidden sm:block" />

        {/* Selector rápido de Modo Oscuro / Claro */}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          title={`Tema actual: ${theme === 'system' ? 'Sistema (' + (effectiveTheme === 'dark' ? 'Oscuro' : 'Claro') + ')' : theme === 'dark' ? 'Oscuro' : 'Claro'}. Clic para cambiar.`}
          aria-label="Cambiar tema de apariencia"
          className="text-texto-2 hover:text-acento hover:bg-superficie-2/80 rounded-xl px-2 transition-transform active:scale-90"
        >
          {theme === 'system' ? (
            <Monitor className="w-4 h-4 text-texto-2" />
          ) : effectiveTheme === 'dark' ? (
            <Moon className="w-4 h-4 text-emerald-400" />
          ) : (
            <Sun className="w-4 h-4 text-amber-500" />
          )}
        </Button>

        {/* Perfil del usuario Google */}
        {usuario && (
          <div className="flex items-center gap-2 pl-1 py-1 pr-1.5 rounded-xl hover:bg-superficie-2/60 transition-colors">
            {usuario.foto ? (
              <img
                src={usuario.foto}
                alt={usuario.nombre}
                className="w-7 h-7 rounded-full object-cover border border-borde shadow-xs"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-acento/15 text-acento text-xs font-semibold flex items-center justify-center border border-acento/20">
                {inicial}
              </div>
            )}
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-semibold text-texto truncate max-w-[130px] leading-tight">
                {usuario.nombre}
              </span>
              <span className="text-[10px] text-texto-3 truncate max-w-[130px] leading-tight">
                {usuario.email}
              </span>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={onCerrarSesion}
          title="Cerrar sesión de Google"
          aria-label="Cerrar sesión"
          className="text-texto-3 hover:text-danger-600 rounded-xl"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
};
