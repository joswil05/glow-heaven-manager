import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { DataProvider, useDatosNegocio } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { QuickSaleView } from './views/QuickSaleView';
import { CobranzaView } from './views/CobranzaView';
import { InventoryQuickView } from './views/InventoryQuickView';
import { AjustesView } from './views/AjustesView';
import { ActividadView } from './views/ActividadView';
import { BottomNav } from './components/BottomNav';
import { SnackbarProvider } from './components/Snackbar';

// `ajustes` no esta en el dock: se toca cada varias semanas y el dock es
// para lo de cada minuto. Se entra por el engranaje del Inicio.
export type Vista = 'panel' | 'vender' | 'cobranza' | 'inventario' | 'ajustes' | 'actividad';

import { ShieldAlert, WifiOff } from 'lucide-react';
import { usandoEmuladorLocal } from './lib/firebase-mobile';
import type { ResultadoAcceso as EstadoAcceso } from '../../src/main/firebase/repositories/accesos.repo';

/**
 * Quien puede pasar de la pantalla de acceso.
 *
 * Antes esto era una lista de UID escrita acá, gemela de la que estaba en
 * `firestore.rules`. Agregar a alguien exigía tocar las dos y publicar las dos
 * apps, así que la dueña no podía hacerlo sola.
 *
 * Ahora se le pregunta a la base, que es donde vive la respuesta, y de paso se
 * reclama la invitación si la hay: es lo que convierte un correo invitado en
 * acceso, la primera vez que esa persona entra.
 *
 * Sigue siendo una comprobación de interfaz, no de seguridad. Quien de verdad
 * decide qué se puede leer y escribir son las reglas de Firestore, del lado del
 * servidor; acá sirve para mostrar un mensaje claro en vez de una pantalla
 * rota.
 */
async function puedeEntrar(uid: string, correo: string | null): Promise<EstadoAcceso> {
  if (usandoEmuladorLocal) return 'autorizado';
  const { AccesosRepoFirestore } = await import(
    '../../src/main/firebase/repositories/accesos.repo'
  );
  return AccesosRepoFirestore.verificarOReclamar(uid, correo);
}

function AppContenido() {
  const { usuario, cargando, salir } = useAuth();
  /** `null` mientras se averigua. */
  const [acceso, setAcceso] = useState<EstadoAcceso | null>(null);
  /** Sube para volver a preguntar cuando la conexión falló. */
  const [reintento, setReintento] = useState(0);

  useEffect(() => {
    if (!usuario) {
      setAcceso(null);
      return;
    }
    let vivo = true;
    setAcceso(null);
    puedeEntrar(usuario.uid, usuario.email ?? null)
      .then((r) => vivo && setAcceso(r))
      // Si ni siquiera se pudo preguntar, es un problema de conexión, no un
      // veto. Decirle "no tenés acceso" a quien sí lo tiene es peor que no
      // decir nada.
      .catch(() => vivo && setAcceso('sin-conexion'))
      .finally(() => undefined);
    return () => {
      vivo = false;
    };
  }, [usuario, reintento]);

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo transition-colors duration-200">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-superficie shadow-md border border-borde">
            <Loader2 size={24} className="animate-spin text-acento" />
          </div>
          <span className="text-xs font-semibold text-texto-3">Cargando Glow Heaven…</span>
        </div>
      </div>
    );
  }

  if (!usuario) {
    return <LoginView />;
  }

  if (acceso === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo transition-colors duration-200">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-superficie shadow-md border border-borde">
            <Loader2 size={24} className="animate-spin text-acento" />
          </div>
          <span className="text-xs font-semibold text-texto-3">Comprobando tu acceso…</span>
        </div>
      </div>
    );
  }

  if (acceso === 'sin-conexion') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo p-6">
        <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-borde bg-superficie p-6 text-center shadow-lg">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-superficie-2 text-texto-3">
            <WifiOff size={26} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-texto">No pudimos comprobar tu acceso</h2>
            <p className="mt-1 text-sm text-texto-3">
              Parece que no hay conexión. Tu cuenta está bien; sólo hace falta internet para
              entrar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReintento((n) => n + 1)}
            className="m3-press mt-1 w-full rounded-xl bg-acento px-4 py-2.5 text-sm font-semibold text-acento-texto transition-colors cursor-pointer"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (acceso !== 'autorizado') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fondo p-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm bg-superficie p-6 rounded-2xl border border-peligro-suave shadow-lg">
          <div className="h-12 w-12 rounded-full bg-peligro-suave flex items-center justify-center text-peligro">
            <ShieldAlert size={28} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-texto">Acceso no autorizado</h2>
            <p className="text-sm text-texto-3 mt-1">
              La cuenta <strong className="text-texto-2">{usuario.email}</strong> no tiene permisos de acceso al sistema de Glow Heaven.
            </p>
          </div>
          <button
            type="button"
            onClick={() => salir()}
            className="w-full mt-2 py-2.5 px-4 rounded-xl bg-inverso text-inverso-texto hover:opacity-90 font-semibold text-sm transition-colors cursor-pointer"
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
        <Navegacion />
      </DataProvider>
    </SnackbarProvider>
  );
}

/**
 * Las pantallas y la barra de abajo.
 *
 * Vive adentro del proveedor de datos a proposito: es el unico lugar desde el
 * que se pueden leer los parametros, y ahi esta con que pantalla quiere abrir.
 * Antes `vista` colgaba de `AppContenido`, que renderiza el proveedor y por lo
 * tanto no puede consultarlo.
 */
function Navegacion() {
  const { parametros } = useDatosNegocio();
  const [vista, setVista] = useState<Vista>('panel');
  /**
   * Se aplica UNA sola vez.
   *
   * Los parametros se releen despues de cada venta y cada abono. Sin este
   * candado, la app la devolveria a su pantalla preferida en medio de lo que
   * estuviera haciendo.
   */
  const inicioAplicado = useRef(false);

  useEffect(() => {
    if (inicioAplicado.current || !parametros) return;
    inicioAplicado.current = true;
    const preferida = parametros.pantalla_inicio_movil as Vista | undefined;
    const validas: Vista[] = ['panel', 'vender', 'cobranza', 'inventario'];
    if (preferida && preferida !== 'panel' && validas.includes(preferida)) {
      setVista(preferida);
    }
  }, [parametros]);

  return (
        <div className="flex flex-col h-[100dvh] overflow-hidden bg-fondo text-texto transition-colors duration-200">
          <div className="flex-1 min-h-0 relative">
            <div className={`h-full w-full overflow-hidden ${vista === 'panel' ? 'block animate-vista' : 'hidden'}`}>
              <DashboardView
                onIrAAjustes={() => setVista('ajustes')}
                onIrAActividad={() => setVista('actividad')}
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
            <div className={`h-full w-full overflow-hidden ${vista === 'ajustes' ? 'block animate-vista' : 'hidden'}`}>
              <AjustesView onVolver={() => setVista('panel')} />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'actividad' ? 'block animate-vista' : 'hidden'}`}>
              <ActividadView onVolver={() => setVista('panel')} />
            </div>
          </div>
          {vista !== 'ajustes' && vista !== 'actividad' && <BottomNav actual={vista} onCambiar={setVista} />}
        </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AppContenido />
    </ThemeProvider>
  );
}

