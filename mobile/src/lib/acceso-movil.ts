/**
 * El acceso sin señal (C3 · T4).
 *
 * Antes, sin red, cualquier cuenta que no fuera la de la dueña se quedaba en
 * "No pudimos comprobar tu acceso", aunque hubiera entrado mil veces. Ahora
 * se recuerda, por cuenta y en este teléfono, que ya tuvo acceso.
 *
 * Es una comprobación de interfaz, no de seguridad: las reglas de Firestore
 * siguen decidiendo arriba, y sin red sólo se ve lo que ya estaba guardado
 * acá. Con red se pregunta como siempre, y "sin permiso" borra el recuerdo.
 */
import type { ResultadoAcceso } from '../../../src/main/firebase/repositories/accesos.repo';

export type EstadoAcceso = ResultadoAcceso;

const clave = (uid: string) => `gh:acceso:${uid}`;

function almacenDelNavegador(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function accesoRecordado(uid: string, almacen = almacenDelNavegador()): boolean {
  try {
    return Boolean(almacen?.getItem(clave(uid)));
  } catch {
    return false;
  }
}

export function recordarAcceso(uid: string, almacen = almacenDelNavegador()): void {
  try {
    almacen?.setItem(clave(uid), new Date().toISOString());
  } catch {
    /* sin almacenamiento: con red se pregunta igual */
  }
}

export function olvidarAcceso(uid: string, almacen = almacenDelNavegador()): void {
  try {
    almacen?.removeItem(clave(uid));
  } catch {
    /* nada que olvidar */
  }
}

/**
 * Qué mostrar con lo que se sabe. Pura: no lee ni escribe.
 *
 * Sin red y sin recuerdo se pregunta igual: la dueña pasa sin consultar a
 * nadie, y las demás cuentas pueden encontrar su permiso en la caché.
 */
export function decidirAcceso(p: {
  enLinea: boolean;
  recordado: boolean;
  resultado: EstadoAcceso | null;
}): EstadoAcceso | 'preguntar' {
  if (p.resultado === 'autorizado' || p.resultado === 'sin-permiso') return p.resultado;
  if (p.recordado && (!p.enLinea || p.resultado === 'sin-conexion')) return 'autorizado';
  if (p.resultado === 'sin-conexion') return 'sin-conexion';
  return 'preguntar';
}
