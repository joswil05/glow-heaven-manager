import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { FIREBASE_CONFIG } from '../../shared/firebase-config';

/**
 * Instancia única de Firebase Auth del proceso principal.
 *
 * Vive acá y no dentro de `auth.ts` ni de `google-auth.service.ts` porque los
 * dos la necesitan y se importan entre sí: tenerla en un tercer módulo evita
 * el ciclo. Además `connectAuthEmulator` sólo admite una llamada por
 * instancia, así que dos accesores separados rompían las pruebas contra el
 * emulador.
 *
 * Ojo con la persistencia: en Node NO hay ninguna. Se comprobó que
 * `setPersistence(auth, browserLocalPersistence)` se acepta sin error pero
 * cae en silencio a memoria (no escribe nada y `currentUser` queda en null al
 * reiniciar). Por eso la sesión se rehidrata a mano en
 * `GoogleAuthService.restaurarSesion()` y no confiando en el SDK.
 */
let instancia: Auth | null = null;

export function getAuthInstance(): Auth {
  if (!instancia) {
    const appFb = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
    instancia = getAuth(appFb);

    // La variable de entorno redirige al emulador local para probar sin tocar
    // las cuentas reales.
    const emulador = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    if (emulador) {
      const url = emulador.startsWith('http') ? emulador : `http://${emulador}`;
      connectAuthEmulator(instancia, url, { disableWarnings: true });
    }
  }
  return instancia;
}

/**
 * `true` sólo si el SDK tiene una sesión viva de verdad.
 *
 * No alcanza con que exista el archivo de sesión en disco: ese archivo se
 * escribió en un arranque anterior y no prueba nada sobre la sesión actual.
 * Firestore rechaza las peticiones sin sesión, así que la aplicación tiene que
 * preguntarle al SDK, no a su propio caché.
 */
export function haySesionViva(): boolean {
  try {
    return getAuthInstance().currentUser !== null;
  } catch {
    // Si Auth ni siquiera se puede construir, con más razón no hay sesión.
    // Devolver `false` mantiene a la aplicación en "sin conexión", que es la
    // respuesta honesta, en vez de tumbar la llamada IPC entera.
    return false;
  }
}
