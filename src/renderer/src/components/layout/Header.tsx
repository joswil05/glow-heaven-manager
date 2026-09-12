import React from 'react';
import { Plus, PackagePlus, LogOut, RefreshCw } from 'lucide-react';
import { formatearMoneda } from '@core/moneda';
import { Button } from '../ui';
import type { UsuarioGoogle } from '../../../../shared/ipc-contracts';

interface HeaderProps {
  /** Nombre de la sección que se está viendo. */
  titulo: string;
  tasaCambioCents: number;
  usuario?: UsuarioGoogle | null;
  onNuevaVenta: () => void;
  onNuevoPaquete: () => void;
  onCerrarSesion: () => void;
  onRefrescar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  titulo,
  tasaCambioCents,
  usuario,
  onNuevaVenta,
  onNuevoPaquete,
  onCerrarSesion,
  onRefrescar,
}) => {
  const inicial = (usuario?.nombre || usuario?.email || 'U').charAt(0).toUpperCase();

  return (
    <header className="h-14 bg-superficie border-b border-borde flex items-center justify-between px-4 shrink-0 select-none">
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-title text-texto truncate">{titulo}</h1>
        <span className="text-caption text-texto-3 tabular hidden sm:inline">
          {formatearMoneda(tasaCambioCents, 'COR')} por dólar
        </span>
        {onRefrescar && (
          <button
            type="button"
            onClick={onRefrescar}
            title="Actualizar datos ahora"
            aria-label="Actualizar datos"
            className="p-1 rounded text-texto-3 hover:text-texto hover:bg-superficie-2 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onNuevoPaquete}>
          <PackagePlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Paquete</span>
        </Button>

        <Button variant="primary" size="sm" onClick={onNuevaVenta}>
          <Plus className="w-3.5 h-3.5" />
          <span>Nueva venta</span>
        </Button>

        <div className="h-5 w-px bg-borde mx-1 hidden sm:block" />

        {/* Perfil del usuario Google */}
        {usuario && (
          <div className="flex items-center gap-2 pl-1">
            {usuario.foto ? (
              <img
                src={usuario.foto}
                alt={usuario.nombre}
                className="w-7 h-7 rounded-full object-cover border border-borde"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-acento/15 text-acento text-xs font-semibold flex items-center justify-center border border-acento/20">
                {inicial}
              </div>
            )}
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-medium text-texto truncate max-w-[130px]">
                {usuario.nombre}
              </span>
              <span className="text-[10px] text-texto-3 truncate max-w-[130px]">
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
          className="text-texto-3 hover:text-danger-600"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
};
