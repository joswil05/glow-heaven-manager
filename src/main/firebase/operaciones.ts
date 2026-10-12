import { doc, getDoc, type DocumentReference, type Transaction } from 'firebase/firestore';
import { getFirestoreDb, type OperacionLote } from './client';

/**
 * La marca de una operación que vino de la cola del celular (C4).
 *
 * Sin señal, el celular guarda una venta, un abono o una clienta y los sube
 * al volver la red. Si la subida llega a guardarse pero la respuesta se pierde,
 * la cola la vuelve a mandar con el mismo `operacion_id`: el repositorio
 * encuentra esta marca y devuelve lo que quedó guardado, sin escribir nada más.
 *
 * La marca se escribe en la MISMA escritura que lo que registra (la misma
 * transacción o el mismo lote): o están las dos, o ninguna. Las reglas de
 * Firestore sólo dejan crearla si no existe, y nadie la cambia ni la borra.
 */
export interface MarcaOperacion {
  operacion_id: string;
  tipo: 'VENTA' | 'ABONO' | 'CLIENTA';
  /** El id de lo que quedó guardado: la venta, el pago o la clienta. */
  resultado_id: number;
  creada_en: string;
}

export const COLECCION_OPERACIONES = 'operaciones';

function validar(operacion_id: string): string {
  const id = operacion_id.trim();
  if (!id || id.includes('/') || id.length > 200) {
    throw new Error('El identificador de la operación no es válido.');
  }
  return id;
}

export function refMarca(operacion_id: string): DocumentReference {
  return doc(getFirestoreDb(), COLECCION_OPERACIONES, validar(operacion_id));
}

export async function leerMarca(operacion_id: string): Promise<MarcaOperacion | null> {
  const snap = await getDoc(refMarca(operacion_id));
  return snap.exists() ? (snap.data() as MarcaOperacion) : null;
}

export async function leerMarcaEn(tx: Transaction, operacion_id: string): Promise<MarcaOperacion | null> {
  const snap = await tx.get(refMarca(operacion_id));
  return snap.exists() ? (snap.data() as MarcaOperacion) : null;
}

export function marcaParaLote(
  operacion_id: string,
  tipo: MarcaOperacion['tipo'],
  resultado_id: number
): OperacionLote {
  const id = validar(operacion_id);
  const marca: MarcaOperacion = { operacion_id: id, tipo, resultado_id, creada_en: new Date().toISOString() };
  return { coleccion: COLECCION_OPERACIONES, id, merge: false, datos: { ...marca } };
}
