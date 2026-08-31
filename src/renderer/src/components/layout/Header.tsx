import React, { useState } from 'react';
import { Search, Plus, HardDriveDownload } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { formatearMoneda } from '@core/moneda';
import { Button, StatusDot } from '../ui';

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
          <div className="w-8 h-8 rounded-md bg-navy-900 flex items-center justify-center text-white font-semibold text-label">
            GH
          </div>
          <div>
            <h1 className="text-title text-slate-900 leading-none">Glow Heaven</h1>
            <span className="text-caption text-slate-500 uppercase tracking-wide">
              Manager
            </span>
          </div>
        </div>

        <div className="h-6 w-px bg-slate-200" />

        {/* Tasa Oficial BCN */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80">
          <span className="text-label text-slate-500">Tasa BCN:</span>
          <span className="text-label font-semibold text-slate-800">
            {formatearMoneda(tasaCambioCents, 'COR')} / $1
          </span>
        </div>

        {/* Semáforo de Compras */}
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200/80">
          <span className="text-label text-slate-500">Compras USA:</span>
          <div className="flex items-center gap-3">
            {semaforoCounts.verde > 0 && (
              <StatusDot tone="success" label={`${semaforoCounts.verde} Listas`} />
            )}
            {semaforoCounts.amarillo > 0 && (
              <StatusDot tone="warning" label={`${semaforoCounts.amarillo} Por verificar`} />
            )}
            {semaforoCounts.rojo > 0 && (
              <StatusDot tone="danger" label={`${semaforoCounts.rojo} Bloqueadas`} />
            )}
            {semaforoCounts.verde === 0 && semaforoCounts.amarillo === 0 && semaforoCounts.rojo === 0 && (
              <span className="text-caption text-slate-400">Sin pedidos activos</span>
            )}
          </div>
        </div>
      </div>

      {/* Derecha: Botones y Acciones con Atajos Visibles (U3) */}
      <div className="flex items-center gap-3">
        {/* Buscador Omnibox Ctrl+K */}
        <Button
          variant="secondary"
          onClick={onOpenCommandPalette}
          title="Buscar clientes o pedidos (Ctrl+K)"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span>Buscar...</span>
          <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-300 text-caption font-mono text-slate-500">
            Ctrl+K
          </kbd>
        </Button>

        {/* Respaldo Manual Ctrl+B */}
        <Button
          variant="secondary"
          onClick={handleManualBackup}
          disabled={backingUp}
          title="Respaldar base de datos ahora (Ctrl+B)"
        >
          <HardDriveDownload className="w-3.5 h-3.5" />
          <span>{backingUp ? 'Respaldando...' : 'Respaldar'}</span>
          <kbd className="px-1.5 py-0.5 bg-white rounded border border-slate-300 text-caption font-mono text-slate-500">
            Ctrl+B
          </kbd>
        </Button>

        {/* Nueva Cotización Ctrl+N */}
        <Button variant="primary" onClick={onNewCotizacion}>
          <Plus className="w-4 h-4" />
          <span>Nueva Cotización</span>
          <kbd className="px-1.5 py-0.5 bg-brand-800/60 rounded text-caption font-mono text-white/90">
            Ctrl+N
          </kbd>
        </Button>
      </div>
    </header>
  );
};
