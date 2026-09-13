import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { QuickSaleView } from './views/QuickSaleView';
import { CobranzaView } from './views/CobranzaView';
import { InventoryQuickView } from './views/InventoryQuickView';
import { BottomNav } from './components/BottomNav';
import { SnackbarProvider } from './components/Snackbar';

export type Vista = 'panel' | 'vender' | 'cobranza' | 'inventario';

function AppContenido() {
  const { usuario, cargando } = useAuth();
  const [vista, setVista] = useState<Vista>('panel');

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo dark:bg-slate-950 transition-colors duration-200">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 shadow-md border border-slate-100 dark:border-slate-800">
            <Loader2 size={24} className="animate-spin text-emerald-600" />
          </div>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Cargando Glow Heaven…</span>
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
        <div className="flex flex-col h-[100dvh] overflow-hidden bg-fondo dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-200">
          <div className="flex-1 min-h-0 relative">
            <div className={`h-full w-full overflow-hidden ${vista === 'panel' ? 'block' : 'hidden'}`}>
              <DashboardView
                onIrAVenta={() => setVista('vender')}
                onIrACobranza={() => setVista('cobranza')}
                onIrAInventario={() => setVista('inventario')}
              />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'vender' ? 'block' : 'hidden'}`}>
              <QuickSaleView />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'cobranza' ? 'block' : 'hidden'}`}>
              <CobranzaView />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'inventario' ? 'block' : 'hidden'}`}>
              <InventoryQuickView />
            </div>
          </div>
          <BottomNav actual={vista} onCambiar={setVista} />
        </div>
      </DataProvider>
    </SnackbarProvider>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppContenido />
    </ThemeProvider>
  );
}

