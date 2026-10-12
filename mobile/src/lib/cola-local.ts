/**
 * Dónde vive la cola en el teléfono (C4 · T2).
 *
 * En IndexedDB: una base `gh-cola` con un almacén y una entrada por cuenta.
 * Lo que Ross vendió sin señal sobrevive a cerrar la app y a reiniciar el
 * teléfono. Si IndexedDB no abre (Safari en navegación privada puede
 * negarlo), la cola vive en memoria mientras la app siga abierta, y la
 * interfaz lo dice: "Lo pendiente no queda guardado si cerrás la app".
 */
import type { EnCola } from './cola';

export interface AlmacenCola {
  /** false: la cola vive en memoria y se pierde al cerrar la app. */
  readonly persistente: boolean;
  leer(uid: string): Promise<EnCola[]>;
  guardar(uid: string, cola: EnCola[]): Promise<void>;
}

const BASE = 'gh-cola';
const ALMACEN = 'colas';

function indexedDBDelNavegador(): IDBFactory | undefined {
  try {
    return typeof indexedDB === 'undefined' ? undefined : indexedDB;
  } catch {
    return undefined;
  }
}

function abrirBase(fabrica: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = fabrica.open(BASE, 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore(ALMACEN);
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
    pedido.onblocked = () => reject(new Error('La base de la cola está bloqueada.'));
  });
}

function leerDe(db: IDBDatabase, uid: string): Promise<EnCola[]> {
  return new Promise((resolve, reject) => {
    const pedido = db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(uid);
    pedido.onsuccess = () => resolve(Array.isArray(pedido.result) ? (pedido.result as EnCola[]) : []);
    pedido.onerror = () => reject(pedido.error);
  });
}

/** Resuelve cuando la escritura terminó, no cuando se pidió. */
function guardarEn(db: IDBDatabase, uid: string, cola: EnCola[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALMACEN, 'readwrite');
    tx.objectStore(ALMACEN).put(cola, uid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('No se pudo guardar lo pendiente.'));
  });
}

function enIndexedDB(fabrica: IDBFactory, primera: IDBDatabase): AlmacenCola {
  let db: IDBDatabase | null = primera;

  // Safari a veces pierde la conexión con la base cuando la app pasa mucho
  // tiempo en segundo plano. Se abre otra vez, una sola, antes de dar el error.
  async function conBase<T>(hacer: (d: IDBDatabase) => Promise<T>): Promise<T> {
    try {
      db ??= await abrirBase(fabrica);
      return await hacer(db);
    } catch {
      db = await abrirBase(fabrica);
      return hacer(db);
    }
  }

  return {
    persistente: true,
    leer: (uid) => conBase((d) => leerDe(d, uid)),
    guardar: (uid, cola) => conBase((d) => guardarEn(d, uid, cola)),
  };
}

function enMemoria(): AlmacenCola {
  const colas = new Map<string, EnCola[]>();
  return {
    persistente: false,
    leer: async (uid) => colas.get(uid) ?? [],
    guardar: async (uid, cola) => {
      colas.set(uid, cola);
    },
  };
}

export async function abrirAlmacenCola(fabrica = indexedDBDelNavegador()): Promise<AlmacenCola> {
  if (!fabrica) return enMemoria();
  try {
    return enIndexedDB(fabrica, await abrirBase(fabrica));
  } catch {
    return enMemoria();
  }
}
