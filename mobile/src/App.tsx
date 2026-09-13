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

import { ShieldAlert } from 'lucide-react';

const UIDS_AUTORIZADOS = new Set([
  'PLCUbpheiAhjelGqcZznVypc3O72', // espinozajoswill@gmail.com
  'ZdM86RTlEEQLYWHSBZPvsKq2YgJ3', // angierlinartej2020@gmail.com
]);

function AppContenido() {
  const { usuario, cargando, salir } = useAuth();
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

  if (!UIDS_AUTORIZADOS.has(usuario.uid)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo dark:bg-slate-950 p-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm bg-white dark:bg-slate-900 p-6 rounded-2xl border border-rose-200 dark:border-rose-900 shadow-lg">
          <div className="h-12 w-12 rounded-full bg-rose-100 dark:bg-rose-950/80 flex items-center justify-center text-rose-600 dark:text-rose-400">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Acceso no autorizado</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              La cuenta <strong className="text-slate-700 dark:text-slate-200">{usuario.email}</strong> no tiene permisos de acceso al sistema de Glow Heaven.
            </p>
          </div>
          <button
            type="button"
            onClick={() => salir()}
            className="w-full mt-2 py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            Cerrar sesión e ingresar con otra cuenta
          </button>
        </div>
      </div>
    );
  }

  return (
    <SnackbarProvider>
      <DataProvider>
        <div className="flex flex-col h-[100dvh] overflow-hidden bg-fondo dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors duration-200">
          <div className="flex-1 min-h-0 relative">
            <div className={`h-full w-full overflow-hidden ${vista === 'panel' ? 'block animate-vista' : 'hidden'}`}>
              <DashboardView
                onIrAVenta={() => setVista('vender')}
                onIrACobranza={() => setVista('cobranza')}
                onIrAInventario={() => setVista('inventario')}
              />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'vender' ? 'block animate-vista' : 'hidden'}`}>
              <QuickSaleView />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'cobranza' ? 'block animate-vista' : 'hidden'}`}>
              <CobranzaView />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'inventario' ? 'block animate-vista' : 'hidden'}`}>
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

