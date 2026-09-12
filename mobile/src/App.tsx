import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { QuickSaleView } from './views/QuickSaleView';
import { InventoryQuickView } from './views/InventoryQuickView';
import { BottomNav } from './components/BottomNav';
import { SnackbarProvider } from './components/Snackbar';

export type Vista = 'panel' | 'vender' | 'inventario';

export function App() {
  const { usuario, cargando } = useAuth();
  const [vista, setVista] = useState<Vista>('panel');

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-md border border-slate-100">
            <Loader2 size={24} className="animate-spin text-emerald-600" />
          </div>
          <span className="text-xs font-semibold text-slate-500">Cargando Glow Heaven…</span>
        </div>
      </div>
    );
  }

  if (!usuario) {
    return <LoginView />;
  }

  return (
    <SnackbarProvider>
      <DataProvider>
        <div className="flex flex-col h-[100dvh] overflow-hidden bg-[#f8fafc]">
          <div className="flex-1 min-h-0 relative">
            <div className={`h-full w-full ${vista === 'panel' ? 'block' : 'hidden'}`}>
              <DashboardView onIrAVenta={() => setVista('vender')} />
            </div>
            <div className={`h-full w-full ${vista === 'vender' ? 'block' : 'hidden'}`}>
              <QuickSaleView />
            </div>
            <div className={`h-full w-full ${vista === 'inventario' ? 'block' : 'hidden'}`}>
              <InventoryQuickView />
            </div>
          </div>
          <BottomNav actual={vista} onCambiar={setVista} />
        </div>
      </DataProvider>
    </SnackbarProvider>
  );
}
