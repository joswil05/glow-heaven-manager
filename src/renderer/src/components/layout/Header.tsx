import React, { useState } from 'react';
import { Search, Plus, Sparkles, HardDriveDownload } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { formatearMoneda } from '@core/moneda';

interface HeaderProps {
  tasaCambioCents: number;
  onOpenCommandPalette: () => void;
  onNewCotizacion: () => void;
  semaforoCounts?: { rojo: number; amarillo: number; verde: number };
}

export const Header: React.FC<HeaderProps> = ({
  tasaCambioCents,
  onOpenCommandPalette,
  onNewCotizacion,
  semaforoCounts = { rojo: 0, amarillo: 0, verde: 0 },
}) => {
  const { showToast } = useToast();
  const [backingUp, setBackingUp] = useState(false);

  const handleManualBackup = async () => {
    try {
      setBackingUp(true);
      const res = await window.api.sistema.crearBackup();
      if (res.success) {
        showToast({
          message: 'Copia de seguridad creada con éxito.',
          type: 'success',
        });
      } else {
        showToast({
          message: `Error al crear respaldo: ${res.error.message}`,
          type: 'error',
        });
      }
    } catch {
      showToast({ message: 'Error de conexión al respaldar', type: 'error' });
    } finally {
      setBackingUp(false);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between shrink-0 select-none">
      {/* Izquierda: Marca y Tasa del día */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-glow-600 to-glow-400 flex items-center justify-center text-white shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 leading-none">Glow Heaven</h1>
            <span className="text-[11px] font-semibold text-glow-600 uppercase tracking-wider">Manager</span>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-200" />

        {/* Tasa Oficial BCN */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80">
          <span className="text-xs text-slate-500 font-medium">Tasa BCN:</span>
          <span className="text-xs font-bold text-slate-800">
            {formatearMoneda(tasaCambioCents, 'COR')} / $1
          </span>
        </div>

        {/* Semáforo de Compras */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80 text-xs">
          <span className="text-slate-500 font-medium">Compras USA:</span>
          <div className="flex items-center gap-1.5 font-semibold">
            {semaforoCounts.verde > 0 && (
              <span className="flex items-center gap-1 text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {semaforoCounts.verde} Listas
              </span>
            )}
            {semaforoCounts.amarillo > 0 && (
              <span className="flex items-center gap-1 text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                {semaforoCounts.amarillo} Por verificar
              </span>
            )}
            {semaforoCounts.rojo > 0 && (
              <span className="flex items-center gap-1 text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                {semaforoCounts.rojo} Bloqueadas
              </span>
            )}
            {semaforoCounts.verde === 0 && semaforoCounts.amarillo === 0 && semaforoCounts.rojo === 0 && (
              <span className="text-slate-400">Sin pedidos activos</span>
            )}
          </div>
        </div>
      </div>

      {/* Derecha: Botones y Acciones con Atajos Visibles (U3) */}
      <div className="flex items-center gap-3">
        {/* Buscador Omnibox Ctrl+K */}
        <button
          onClick={onOpenCommandPalette}
          className="flex items-center gap-3 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-medium transition-colors border border-slate-200"
          title="Buscar clientes o pedidos (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span>Buscar...</span>
          <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-300 text-[10px] font-mono text-slate-500">
            Ctrl+K
          </kbd>
        </button>

        {/* Respaldo Manual Ctrl+B */}
        <button
          onClick={handleManualBackup}
          disabled={backingUp}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors border border-slate-200 disabled:opacity-50"
          title="Respaldar base de datos ahora (Ctrl+B)"
        >
          <HardDriveDownload className="w-3.5 h-3.5" />
          <span>{backingUp ? 'Respaldando...' : 'Respaldar'}</span>
          <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-300 text-[10px] font-mono text-slate-500">
            Ctrl+B
          </kbd>
        </button>

        {/* Nueva Cotización Ctrl+N */}
        <button
          onClick={onNewCotizacion}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-glow-600 hover:bg-glow-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Nueva Cotización</span>
          <kbd className="px-1.5 py-0.5 bg-glow-800/60 rounded text-[10px] font-mono text-white/90">
            Ctrl+N
          </kbd>
        </button>
      </div>
    </header>
  );
};
