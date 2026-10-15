import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { DataProvider, useDatosNegocio } from './context/DataContext';
import { ThemeProvider } from './context/ThemeContext';
import { ConexionProvider, useConexion } from './context/ConexionContext';
import { ColaProvider, useCola } from './context/ColaContext';
import { contarCola } from './lib/cola';
import { accesoRecordado, decidirAcceso, olvidarAcceso, recordarAcceso } from './lib/acceso-movil';
import { LoginView } from './views/LoginView';
import { DashboardView } from './views/DashboardView';
import { QuickSaleView } from './views/QuickSaleView';
import { CobranzaView } from './views/CobranzaView';
import { InventoryQuickView } from './views/InventoryQuickView';
import { AjustesView } from './views/AjustesView';
import { HistorialView } from './views/HistorialView';
import { RegistrarPaqueteView } from './views/RegistrarPaqueteView';
import { EncargosView } from './views/EncargosView';
import { MasView, type DestinoMas } from './views/MasView';
import { BottomNav } from './components/BottomNav';
import { FranjaSinConexion } from './components/FranjaSinConexion';
import { BarraCola, BotonPendientes, useAvisoCola } from './components/AvisoCola';
import { PendientesSheet } from './components/PendientesSheet';
import { SnackbarProvider } from './components/Snackbar';

// La barra tiene cinco pestañas (NAV-1): Inicio, Vender, Clientas
// (`cobranza`), Inventario y Más. Lo que no es de cada minuto se abre desde
// "Más": las ventas (`historial`), los encargos y los ajustes.
export type Vista =
  | 'panel'
  | 'vender'
  | 'cobranza'
  | 'historial'
  | 'inventario'
  | 'mas'
  | 'paquetes'
  | 'reportes'
  | 'ajustes'
  | 'registrar-paquete'
  | 'encargos';

/** Lo que "Más" ya ofrece. Paquetes y Reportes se suman cuando existan. */
const EN_MAS: readonly DestinoMas[] = ['historial', 'encargos', 'ajustes'];

import { ShieldAlert, WifiOff } from 'lucide-react';
import { usandoEmuladorLocal } from './lib/firebase-mobile';
import { pedirAlmacenamientoPersistente } from './lib/almacenamiento-movil';
import { SIN_RED, useExigirConexion } from './lib/useExigirConexion';
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
  const { enLinea } = useConexion();
  /** Entró sin señal por el recuerdo: al volver la red se confirma. */
  const entroPorRecuerdo = useRef(false);

  useEffect(() => {
    if (!usuario) {
      setAcceso(null);
      return;
    }
    const sinRed = navigator.onLine === false;
    const recordado = accesoRecordado(usuario.uid);
    // Sin red y con el acceso recordado (C3), se entra sin esperar a que
    // Firestore se rinda.
    const sinPreguntar = decidirAcceso({ enLinea: !sinRed, recordado, resultado: null });
    if (sinPreguntar !== 'preguntar') {
      entroPorRecuerdo.current = true;
      setAcceso(sinPreguntar);
      return;
    }
    let vivo = true;
    setAcceso(null);
    puedeEntrar(usuario.uid, usuario.email ?? null)
      // Si ni siquiera se pudo preguntar, es un problema de conexión, no un
      // veto. Decirle "no tenés acceso" a quien sí lo tiene es peor que no
      // decir nada; y si esta cuenta ya entró en este teléfono, entra.
      .catch((): EstadoAcceso => 'sin-conexion')
      .then((resultado) => {
        if (!vivo) return;
        if (resultado === 'autorizado') recordarAcceso(usuario.uid);
        if (resultado === 'sin-permiso') olvidarAcceso(usuario.uid);
        const decision = decidirAcceso({ enLinea: navigator.onLine !== false, recordado, resultado });
        if (decision === 'autorizado' && resultado === 'sin-conexion') entroPorRecuerdo.current = true;
        setAcceso(decision === 'preguntar' ? 'sin-conexion' : decision);
      });
    return () => {
      vivo = false;
    };
  }, [usuario, reintento]);

  // Volvió la red después de entrar por el recuerdo: se pregunta en segundo
  // plano, sin sacar a nadie de lo que está haciendo. Sólo un "sin permiso"
  // del servidor cierra la puerta.
  useEffect(() => {
    if (!enLinea || !usuario || !entroPorRecuerdo.current) return;
    entroPorRecuerdo.current = false;
    puedeEntrar(usuario.uid, usuario.email ?? null)
      .then((resultado) => {
        if (resultado === 'autorizado') recordarAcceso(usuario.uid);
        if (resultado === 'sin-permiso') {
          olvidarAcceso(usuario.uid);
          setAcceso('sin-permiso');
        }
      })
      .catch(() => undefined);
  }, [enLinea, usuario]);

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
          <div className="h-12 w-12 rounded-full bg-peligro-suave flex items-center justify-center text-peligro-fuerte">
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
        <ColaProvider>
          <Navegacion />
        </ColaProvider>
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
  const { parametros, sinDatosGuardados } = useDatosNegocio();
  const { enLinea, datosDe } = useConexion();
  // Lo que espera subir y lo que hay que revisar (C4): en la franja sin red,
  // en una barra con red.
  const aviso = useAvisoCola();
  const hayFranjaArriba = !enLinea || aviso.barraConRed;
  const exigirConexion = useExigirConexion();
  const [vista, setVista] = useState<Vista>('panel');
  const [origenEncargos, setOrigenEncargos] = useState<'panel' | 'vender' | 'mas'>('panel');
  const [nuevoEncargoAlEntrar, setNuevoEncargoAlEntrar] = useState(false);
  /** "Llegó un paquete" abre vacío; con un número, corrige ese paquete. */
  const [paqueteACorregir, setPaqueteACorregir] = useState<number | null>(null);
  /** Adónde vuelve "Llegó un paquete": se abre desde Inventario o desde Inicio. */
  const [origenPaquete, setOrigenPaquete] = useState<'inventario' | 'panel'>('inventario');
  // Insignias (NAV-3): Inicio cuenta clientas con vencidos y encargos por
  // mandar o por entregar; lo que espera subir sale de la cola (C4).
  const [insignias, setInsignias] = useState({ clientas: 0, encargos: 0 });
  const { cola } = useCola();
  const enCola = contarCola(cola);
  const sinSubir = enCola.pendientes + enCola.revisar;
  /** Inicio abre Cobros buscando a una clienta de "Te deben". */
  const [busquedaCobros, setBusquedaCobros] = useState<{ texto: string; n: number } | null>(null);
  function abrirPaquete(origen: 'inventario' | 'panel', corregir: number | null) {
    if (!exigirConexion(SIN_RED.inventario)) return;
    setPaqueteACorregir(corregir);
    setOrigenPaquete(origen);
    setVista('registrar-paquete');
  }
  function abrirEncargos(origen: 'panel' | 'vender' | 'mas', nuevo = false) {
    setOrigenEncargos(origen);
    setNuevoEncargoAlEntrar(nuevo);
    setVista('encargos');
  }
  /**
   * Se aplica UNA sola vez.
   *
   * Los parametros se releen despues de cada venta y cada abono. Sin este
   * candado, la app la devolveria a su pantalla preferida en medio de lo que
   * estuviera haciendo.
   */
  const inicioAplicado = useRef(false);

  // Una vez por sesión, ya adentro: que el teléfono no borre lo guardado,
  // que es lo que la app muestra sin señal (C3).
  useEffect(() => {
    void pedirAlmacenamientoPersistente(navigator);
  }, []);

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
          {!enLinea && (
            <FranjaSinConexion datosDe={datosDe}>
              {aviso.texto && <BotonPendientes texto={aviso.texto} onAbrir={aviso.abrirPendientes} />}
            </FranjaSinConexion>
          )}
          {aviso.barraConRed && aviso.texto && (
            <BarraCola texto={aviso.texto} revisar={aviso.hayParaRevisar} onAbrir={aviso.abrirPendientes} />
          )}
          <div
            className="flex-1 min-h-0 relative"
            style={hayFranjaArriba ? ({ '--safe-t': '0px' } as CSSProperties) : undefined}
          >
            {sinDatosGuardados && !parametros && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-fondo p-6">
                <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-superficie-2 text-texto-3">
                    <WifiOff size={24} aria-hidden="true" />
                  </span>
                  <h2 className="text-lg font-bold text-texto">Todavía no hay datos en este teléfono</h2>
                  <p className="text-sm text-texto-2">
                    Conectate una vez y después la app abre aunque no haya señal.
                  </p>
                </div>
              </div>
            )}
            <div className={`h-full w-full overflow-hidden ${vista === 'panel' ? 'block animate-vista' : 'hidden'}`}>
              <DashboardView
                onIrAActividad={() => setVista('historial')}
                onIrAVenta={() => setVista('vender')}
                onIrACobranza={(buscar) => {
                  if (buscar) setBusquedaCobros({ texto: buscar, n: Date.now() });
                  setVista('cobranza');
                }}
                onIrAInventario={() => setVista('inventario')}
                onIrAEncargos={() => abrirEncargos('panel')}
                onAnotarPedido={() => abrirEncargos('panel', true)}
                onLlegoPaquete={() => abrirPaquete('panel', null)}
                onInsignias={setInsignias}
              />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'vender' ? 'block animate-vista' : 'hidden'}`}>
              {/* Anotar un pedido no pide señal: queda en el teléfono (C4). */}
              <QuickSaleView onAnotarPedido={() => abrirEncargos('vender', true)} />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'cobranza' ? 'block animate-vista' : 'hidden'}`}>
              <CobranzaView buscar={busquedaCobros} />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'inventario' ? 'block animate-vista' : 'hidden'}`}>
              <InventoryQuickView
                onRegistrarPaquete={() => abrirPaquete('inventario', null)}
                onCorregirPaquete={(id) => abrirPaquete('inventario', id)}
              />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'ajustes' ? 'block animate-vista' : 'hidden'}`}>
              <AjustesView onVolver={() => setVista('mas')} />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'mas' ? 'block animate-vista' : 'hidden'}`}>
              <MasView
                disponibles={EN_MAS}
                encargosPorHacer={insignias.encargos}
                sinSubir={sinSubir}
                onAbrir={(destino) => {
                  if (destino === 'encargos') abrirEncargos('mas');
                  else setVista(destino);
                }}
              />
            </div>
            <div className={`h-full w-full overflow-hidden ${vista === 'historial' ? 'block animate-vista' : 'hidden'}`}>
              <HistorialView />
            </div>
            {vista === 'registrar-paquete' && (
              <RegistrarPaqueteView
                key={paqueteACorregir ?? 'nuevo'}
                corregirId={paqueteACorregir}
                volverA={origenPaquete === 'panel' ? 'a Inicio' : 'al inventario'}
                onVolver={() => { setPaqueteACorregir(null); setVista(origenPaquete); }}
              />
            )}
            {vista === 'encargos' && (
              <EncargosView onVolver={() => setVista(origenEncargos)} abrirNuevoAlEntrar={nuevoEncargoAlEntrar} />
            )}
          </div>
          {/* Las ventas se abren desde "Más": mientras se miran, la pestaña
              marcada es "Más", y tocarla vuelve a la lista. */}
          {vista !== 'ajustes' && vista !== 'registrar-paquete' && vista !== 'encargos' && (
            <BottomNav
              actual={vista === 'historial' ? 'mas' : vista}
              onCambiar={setVista}
              insignias={{ cobranza: insignias.clientas, mas: insignias.encargos + sinSubir }}
            />
          )}
          <PendientesSheet />
        </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <ConexionProvider>
        <AppContenido />
      </ConexionProvider>
    </ThemeProvider>
  );
}

