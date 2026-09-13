import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
  Firestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  where,
  writeBatch,
  runTransaction,
  type DocumentData,
} from 'firebase/firestore';
import { FIREBASE_CONFIG } from '../../shared/firebase-config';

let firestoreInstance: Firestore | null = null;

export function getFirestoreDb(): Firestore {
  if (!firestoreInstance) {
    const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();

    // En navegador/PWA móvil, habilitar caché local persistente con IndexedDB (M-6)
    if (typeof window !== 'undefined') {
      try {
        firestoreInstance = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        });
      } catch {
        firestoreInstance = getFirestore(app);
      }
    } else {
      firestoreInstance = getFirestore(app);
    }

    // `FIRESTORE_EMULATOR_HOST` redirige al emulador local. Es la variable
    // que ya usan las herramientas de Firebase, y permite probar contra el
    // motor de verdad sin tocar los datos del negocio.
    const emulador = process.env.FIRESTORE_EMULATOR_HOST;
    if (emulador) {
      const [host, puerto] = emulador.split(':');
      connectFirestoreEmulator(firestoreInstance, host || '127.0.0.1', Number(puerto) || 8080);
    }
  }
  return firestoreInstance;
}

/**
 * Genera el siguiente ID numérico consecutivo de forma atómica.
 */
export async function siguienteId(entidad: string): Promise<number> {
  const db = getFirestoreDb();
  const seqRef = doc(db, '_secuencias', entidad);

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(seqRef);
    const actual = snap.exists() ? ((snap.data() as DocumentData).valor ?? 0) : 0;
    const nuevo = Number(actual) + 1;
    tx.set(seqRef, { valor: nuevo, actualizado_en: new Date().toISOString() }, { merge: true });
    return nuevo;
  });
}

/**
 * Reserva N ids de una sola vez. Pedirlos uno por uno cuesta una transacción
 * por id, y recibir un paquete de veinte productos son veinte viajes.
 */
export async function reservarIds(entidad: string, cantidad: number): Promise<number[]> {
  if (cantidad <= 0) return [];
  const db = getFirestoreDb();
  const seqRef = doc(db, '_secuencias', entidad);

  const primero = await runTransaction(db, async (tx) => {
    const snap = await tx.get(seqRef);
    const actual = snap.exists() ? Number((snap.data() as DocumentData).valor ?? 0) : 0;
    tx.set(
      seqRef,
      { valor: actual + cantidad, actualizado_en: new Date().toISOString() },
      { merge: true }
    );
    return actual + 1;
  });

  return Array.from({ length: cantidad }, (_, i) => primero + i);
}

let contadorLocal = 0;

/**
 * Id único y ordenable por tiempo, generado sin ir a la red.
 *
 * `eventos` y `movimientos_inventario` solo se leen en orden cronológico y
 * nadie los referencia por número. Pedirles un consecutivo a Firestore
 * costaba una transacción extra por cada acción del usuario: casi la mitad
 * de las escrituras de registrar un abono eran para numerar su auditoría.
 *
 * El prefijo en base 36 del reloj hace que ordenar por id sea ordenar por
 * fecha; el contador rompe empates dentro del mismo milisegundo.
 */
export function idOrdenable(): string {
  contadorLocal = (contadorLocal + 1) % 1_000_000;
  const tiempo = Date.now().toString(36).padStart(9, '0');
  const secuencia = contadorLocal.toString(36).padStart(4, '0');
  const azar = Math.random().toString(36).slice(2, 6);
  return `${tiempo}-${secuencia}-${azar}`;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/** Lee un documento por id. Devuelve null si no existe. */
export async function leerDoc<T>(coleccion: string, id: number | string): Promise<T | null> {
  const db = getFirestoreDb();
  const snap = await getDoc(doc(db, coleccion, String(id)));
  return snap.exists() ? (snap.data() as T) : null;
}

/**
 * Lee varios documentos por id en paralelo, sin repetir los que se piden dos
 * veces. Firestore cobra por documento, así que pedir el mismo tres veces
 * cuesta tres.
 */
export async function leerVarios<T>(
  coleccion: string,
  ids: (number | string)[]
): Promise<Map<string, T>> {
  const unicos = [...new Set(ids.map(String))];
  const resultado = new Map<string, T>();
  if (unicos.length === 0) return resultado;

  const db = getFirestoreDb();
  const snaps = await Promise.all(
    unicos.map((id) => getDoc(doc(db, coleccion, id)))
  );

  for (const snap of snaps) {
    if (snap.exists()) resultado.set(snap.id, snap.data() as T);
  }
  return resultado;
}

/** Lee una colección entera filtrando por `activo == true`. */
export async function leerActivos<T>(coleccion: string, campo = 'activo'): Promise<T[]> {
  const db = getFirestoreDb();
  const snap = await getDocs(query(collection(db, coleccion), where(campo, '==', true)));
  return snap.docs.map((d) => d.data() as T);
}

// ---------------------------------------------------------------------------
// Escritura por lotes
// ---------------------------------------------------------------------------

export interface OperacionLote {
  coleccion: string;
  id: number | string;
  datos?: DocumentData;
  merge?: boolean;
  borrar?: boolean;
}

const MAX_OPERACIONES_LOTE = 500;

/**
 * Aplica un conjunto de escrituras en lotes de 500, que es el máximo de
 * Firestore. Escribir en un bucle de `setDoc` cuesta un viaje de red por
 * documento; un lote cuesta uno por cada 500.
 */
export async function aplicarLote(operaciones: OperacionLote[]): Promise<number> {
  if (operaciones.length === 0) return 0;
  const db = getFirestoreDb();

  for (let i = 0; i < operaciones.length; i += MAX_OPERACIONES_LOTE) {
    const trozo = operaciones.slice(i, i + MAX_OPERACIONES_LOTE);
    const lote = writeBatch(db);

    for (const op of trozo) {
      const ref = doc(db, op.coleccion, String(op.id));
      if (op.borrar) {
        lote.delete(ref);
      } else {
        lote.set(ref, op.datos ?? {}, { merge: op.merge !== false });
      }
    }

    await lote.commit();
  }

  return operaciones.length;
}

/**
 * Firestore rechaza `undefined` en CUALQUIER nivel del documento, incluidos
 * los objetos dentro de un array. Las líneas de una venta viven en un array y
 * sus campos opcionales (`producto_id`, `variante_id`) quedan sin definir en
 * un encargo: sin esta limpieza, guardar un encargo falla.
 */
export function sinUndefined<T>(datos: T): T {
  if (datos === undefined || datos === null) return datos;

  if (Array.isArray(datos)) {
    return datos
      .filter((v) => v !== undefined)
      .map((v) => sinUndefined(v)) as unknown as T;
  }

  if (typeof datos === 'object' && !(datos instanceof Date)) {
    const salida: DocumentData = {};
    for (const [k, v] of Object.entries(datos as DocumentData)) {
      if (v === undefined) continue;
      salida[k] = sinUndefined(v);
    }
    return salida as T;
  }

  return datos;
}
