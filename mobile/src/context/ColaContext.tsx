import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { PagosRepoFirestore } from '@repos/pagos.repo';
import { ClientesRepoFirestore } from '@repos/clientes.repo';
import { useAuth } from './AuthContext';
import { useConexion } from './ConexionContext';
import { useDatosNegocio } from './DataContext';
import { encolar as encolarEn, quitar as quitarDe, retomar, type EnCola, type Operacion } from '../lib/cola';
import { abrirAlmacenCola, type AlmacenCola } from '../lib/cola-local';
import { crearSubidor, type ColaViva, type ReposCola, type ResumenSubida } from '../lib/subir-cola';
import { nuevoGrupoEvento } from '../lib/util';

/**
 * La cola de lo que se hizo sin señal, para toda la app (C4 · T3).
 *
 * Carga la cola de esta cuenta al entrar y la sube al volver la red, al abrir
 * con red y al volver la app al frente. Después de cada subida avisa a las
 * pantallas, que traen lo nuevo solas. Las pantallas anotan con `encolar` y
 * muestran lo pendiente con `cola`.
 */

const REPOS: ReposCola = {
  crearVenta: (input, grupo, operacion_id) => VentasRepoFirestore.crear(input, grupo, operacion_id),
  registrarPago: (input, grupo, operacion_id) => PagosRepoFirestore.registrar(input, grupo, operacion_id),
  guardarClienta: (datos, grupo, operacion_id) => ClientesRepoFirestore.guardar(datos, grupo, operacion_id),
};

/** Con señal y algo pendiente, se reintenta cada tanto aunque nada cambie. */
const REINTENTO_MS = 30_000;

export interface NuevaEnCola {
  /**
   * El mismo id del primer intento, si lo hubo: si la venta llegó a guardarse
   * y sólo se perdió la respuesta, la subida encuentra su marca.
   */
  operacion_id?: string;
  grupo: string;
  operacion: Operacion;
  resumen: EnCola['resumen'];
}

interface ColaState {
  cola: EnCola[];
  /** false: IndexedDB no abrió y lo pendiente se pierde si se cierra la app. */
  persistente: boolean;
  encolar: (nueva: NuevaEnCola) => EnCola;
  /** Saca una que todavía no subió. false si está subiendo justo ahora. */
  quitar: (operacion_id: string) => boolean;
  /** Vuelve a la fila una que había que revisar. */
  reintentar: (operacion_id: string) => void;
  subir: () => Promise<ResumenSubida | null>;
}

interface Sesion {
  viva: ColaViva;
  subir: () => Promise<ResumenSubida>;
  /** Ya se leyó lo guardado: recién ahí se sube. */
  cargada: boolean;
}

const Contexto = createContext<ColaState | null>(null);

export function ColaProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const { enLinea } = useConexion();
  const { marcarCambio, recargarProductos } = useDatosNegocio();
  const [cola, setCola] = useState<EnCola[]>([]);
  const [persistente, setPersistente] = useState(true);
  const sesion = useRef<Sesion | null>(null);
  const enLineaRef = useRef(enLinea);
  enLineaRef.current = enLinea;

  const alTerminar = useRef<(r: ResumenSubida) => void>(() => undefined);
  alTerminar.current = (r) => {
    if (r.subidas === 0) return;
    marcarCambio();
    void recargarProductos(true);
  };

  const uid = usuario?.uid ?? null;
  useEffect(() => {
    setCola([]);
    if (!uid) {
      sesion.current = null;
      return;
    }

    // Todo lo de esta cuenta vive en este cierre: si la sesión cambia en
    // medio de una subida, lo que termine después no escribe en la nueva.
    let abierta = true;
    let actual: EnCola[] = [];
    let almacen: AlmacenCola | null = null;
    let guardando: Promise<void> = Promise.resolve();

    const viva: ColaViva = {
      leer: () => actual,
      cambiar: (cambio) => {
        if (!abierta) return Promise.resolve();
        actual = cambio(actual);
        setCola(actual);
        const foto = actual;
        guardando = guardando
          .then(() => almacen?.guardar(uid, foto))
          .catch(() => {
            if (abierta) setPersistente(false);
          });
        return guardando;
      },
    };
    const subidor = crearSubidor(viva, REPOS);
    const nueva: Sesion = {
      viva,
      cargada: false,
      subir: async () => {
        const resumen = await subidor();
        if (abierta) alTerminar.current(resumen);
        return resumen;
      },
    };
    sesion.current = nueva;

    void (async () => {
      almacen = await abrirAlmacenCola();
      if (!abierta) return;
      setPersistente(almacen.persistente);
      const guardada = retomar(await almacen.leer(uid).catch(() => []));
      if (!abierta) return;
      // Lo que se anotó mientras abría la base va después de lo guardado.
      await viva.cambiar((ahora) => [
        ...guardada,
        ...ahora.filter((o) => !guardada.some((g) => g.operacion_id === o.operacion_id)),
      ]);
      nueva.cargada = true;
      if (enLineaRef.current) void nueva.subir();
    })();

    return () => {
      abierta = false;
      if (sesion.current === nueva) sesion.current = null;
    };
  }, [uid]);

  const subir = useCallback(async () => {
    const s = sesion.current;
    if (!s?.cargada) return null;
    return s.subir();
  }, []);

  // Al volver la red.
  useEffect(() => {
    if (enLinea) void subir();
  }, [enLinea, subir]);

  // Al volver la app al frente: en el iPhone, la app suspendida no siempre
  // recibe el aviso de que volvió la red.
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState === 'visible' && enLineaRef.current) void subir();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [subir]);

  // Con señal y algo esperando (un error pasajero frenó la subida), se
  // reintenta cada tanto.
  const hayPendientes = cola.some((o) => o.estado === 'PENDIENTE');
  useEffect(() => {
    if (!enLinea || !hayPendientes) return;
    const id = window.setInterval(() => void subir(), REINTENTO_MS);
    return () => window.clearInterval(id);
  }, [enLinea, hayPendientes, subir]);

  const encolar = useCallback(
    (nueva: NuevaEnCola): EnCola => {
      const s = sesion.current;
      if (!s) throw new Error('No hay una sesión abierta para anotar esto.');
      const op: EnCola = {
        operacion_id: nueva.operacion_id ?? nuevoGrupoEvento(),
        grupo: nueva.grupo,
        creada_en: new Date().toISOString(),
        operacion: nueva.operacion,
        estado: 'PENDIENTE',
        intentos: 0,
        resumen: nueva.resumen,
      };
      void s.viva.cambiar((c) => encolarEn(c, op));
      if (enLineaRef.current) void subir();
      return op;
    },
    [subir]
  );

  const quitar = useCallback((operacion_id: string): boolean => {
    const s = sesion.current;
    if (!s) return false;
    const op = s.viva.leer().find((o) => o.operacion_id === operacion_id);
    if (!op || op.estado === 'SUBIENDO') return false;
    void s.viva.cambiar((c) => quitarDe(c, operacion_id));
    return true;
  }, []);

  const reintentar = useCallback(
    (operacion_id: string) => {
      const s = sesion.current;
      if (!s) return;
      void s.viva.cambiar((c) =>
        c.map((o) => (o.operacion_id === operacion_id && o.estado === 'REVISAR' ? { ...o, estado: 'PENDIENTE' as const, motivo: undefined } : o))
      );
      if (enLineaRef.current) void subir();
    },
    [subir]
  );

  return (
    <Contexto.Provider value={{ cola, persistente, encolar, quitar, reintentar, subir }}>{children}</Contexto.Provider>
  );
}

export function useCola(): ColaState {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useCola debe usarse dentro de <ColaProvider>');
  return ctx;
}
