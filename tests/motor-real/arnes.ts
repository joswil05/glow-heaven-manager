/**
 * Arnés compartido de las pruebas contra el emulador oficial de Firestore.
 *
 * Se extrajo de `tests/emulador.test.ts` para que las suites nuevas no
 * copien y peguen el arranque de sesión, la lista blanca y el borrado entre
 * pruebas. El emulador es un servidor compartido: las suites corren en serie
 * (`fileParallelism: false`) porque cada una limpia la base.
 */
import { randomUUID } from 'node:crypto';
import { hoyISO } from '../../src/core/fechas';

export const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
export const HOST_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
export const PROYECTO = 'glow-heaven-db-app';
export const URL_BASE = `http://${HOST}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`;

const CORREO = 'pruebas@glowheaven.local';
const CLAVE = 'prueba1234';

/** Identificador de grupo de eventos: cada operación de negocio lleva el suyo. */
export const g = (): string => randomUUID();

/**
 * Fecha de hoy con el MISMO reloj que usa la aplicación.
 *
 * Con `toISOString()` esto era la fecha en UTC, y Nicaragua está seis horas
 * atrás: después de las seis de la tarde el arnés sembraba con la fecha de
 * mañana y las pruebas de fecha fallaban sin que hubiera nada roto en la app.
 */
export const HOY = hoyISO();

export async function emuladorVivo(): Promise<boolean> {
  try {
    const r = await fetch(`http://${HOST}/`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

let uidPrueba = '';

/** Borra todos los documentos del emulador. */
export async function limpiar(): Promise<void> {
  await fetch(URL_BASE, { method: 'DELETE' });
}

/**
 * Da de alta el UID en `usuarios_autorizados`. Las reglas exigen lista
 * blanca; desde el cliente esa colección es de sólo lectura, así que se
 * siembra con el token `owner` del emulador.
 */
export async function autorizarUid(uid = uidPrueba): Promise<void> {
  if (!uid) return;
  await fetch(
    `http://${HOST}/v1/projects/${PROYECTO}/databases/(default)/documents/usuarios_autorizados/${uid}`,
    {
      method: 'PATCH',
      headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { activo: { booleanValue: true } } }),
    }
  );
}

/** Crea la cuenta de prueba en el emulador de Auth y abre sesión. */
export async function iniciarSesion(): Promise<void> {
  const { initializeApp, getApps, getApp } = await import('firebase/app');
  const {
    getAuth,
    connectAuthEmulator,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
  } = await import('firebase/auth');
  const { FIREBASE_CONFIG } = await import('../../src/shared/firebase-config');

  const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST_AUTH}`, { disableWarnings: true });

  try {
    await createUserWithEmailAndPassword(auth, CORREO, CLAVE);
  } catch {
    // La cuenta ya existía de una corrida anterior.
  }
  const credencial = await signInWithEmailAndPassword(auth, CORREO, CLAVE);
  uidPrueba = credencial.user.uid;
}

/**
 * Carga los repositorios de forma dinámica: así se usa el SDK real y no el
 * motor falso en memoria de `tests/setup-firestore.ts`.
 */
export async function repos() {
  const [productos, ventas, compras, pagos, clientes, parametros, panel, eventos] =
    await Promise.all([
      import('../../src/main/firebase/repositories/productos.repo'),
      import('../../src/main/firebase/repositories/ventas.repo'),
      import('../../src/main/firebase/repositories/compras.repo'),
      import('../../src/main/firebase/repositories/pagos.repo'),
      import('../../src/main/firebase/repositories/clientes.repo'),
      import('../../src/main/firebase/repositories/parametros.repo'),
      import('../../src/main/firebase/repositories/panel.repo'),
      import('../../src/main/firebase/repositories/eventos.repo'),
    ]);

  return {
    Productos: productos.ProductosRepoFirestore,
    Ventas: ventas.VentasRepoFirestore,
    Compras: compras.ComprasRepoFirestore,
    Pagos: pagos.PagosRepoFirestore,
    Clientes: clientes.ClientesRepoFirestore,
    Parametros: parametros.ParametrosRepoFirestore,
    Panel: panel.PanelRepoFirestore,
    Eventos: eventos.EventosRepoFirestore,
  };
}

/** Deja la base vacía, con la sesión autorizada y los parámetros sembrados. */
export async function baseLimpia(): Promise<void> {
  await limpiar();
  await autorizarUid();
  const { Parametros } = await repos();
  Parametros.invalidarCache();
  await Parametros.getParametros();
  await Parametros.getCategorias();
}
