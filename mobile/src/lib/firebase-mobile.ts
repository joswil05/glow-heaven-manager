import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  browserPopupRedirectResolver,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  type User,
} from 'firebase/auth';
import { FIREBASE_CONFIG } from '@shared/firebase-config';

/**
 * Autenticación en el navegador móvil.
 *
 * ---------------------------------------------------------------------------
 * POR QUÉ ESTE ARCHIVO NO USA `getAuth()` (leer antes de "simplificar")
 * ---------------------------------------------------------------------------
 * `getAuth(app)` instala el resolver de popup/redirect por defecto. En la
 * inicialización del SDK (@firebase/auth 1.13.x) eso dispara esto:
 *
 *     if (this._popupRedirectResolver?._shouldInitProactively) {
 *         try { await this._popupRedirectResolver._initialize(this); }
 *         catch (e) { /* ignora * / }
 *     }
 *
 * y `_shouldInitProactively` es `_isMobileBrowser() || _isSafari() || _isIOS()`
 * — o sea, SIEMPRE en celular. Ese `_initialize` carga un iframe oculto en
 * `https://<authDomain>/__/auth/iframe`. El `try/catch` cubre errores, pero no
 * cubre que el iframe simplemente no responda: `onAuthStateChanged` no dispara
 * hasta que esa promesa termine, y la app se queda en "Cargando…" para siempre.
 *
 * Ese iframe es de tercera parte cuando el authDomain no es el dominio de la
 * app. iOS Safari lo bloquea siempre (ITP) y Chrome le particiona el
 * almacenamiento, así que no puede leer el evento de login que escribió el
 * handler. Es el mismo iframe que entrega el resultado del popup, por eso
 * fallaban las dos vías (popup con "auth/popup-closed-by-user", redirect con
 * un cuelgue infinito).
 *
 * La solución es hacer que todo el login ocurra en el MISMO origen que la app:
 * ahí el iframe deja de ser de tercera parte y el problema desaparece en iOS y
 * en Android por igual.
 */

/**
 * Dominios que pueden hacer el login "en casa" (mismo origen).
 *
 * Para entrar acá, el `/__/auth/handler` del dominio tiene que estar
 * registrado como URI de redirección autorizado en Google Cloud Console
 * (APIs y servicios → Credenciales → ID de cliente de OAuth 2.0). Si no lo
 * está, Google responde `redirect_uri_mismatch` y el login falla de entrada.
 *
 * Comprobado el 2026-09-13 contra accounts.google.com:
 *   - glow-heaven-db-app.firebaseapp.com → registrado ✅
 *   - glow-heaven-db-app.web.app         → redirect_uri_mismatch ❌
 *   - glow-heaven-movil.web.app          → redirect_uri_mismatch ❌
 *
 * Para habilitar los otros dos: agregar `https://<dominio>/__/auth/handler` a
 * los URI de redirección autorizados en Cloud Console y sumarlos acá.
 */
const DOMINIOS_CON_LOGIN_PROPIO = new Set(['glow-heaven-db-app.firebaseapp.com']);

/** Dominio donde el login sí está registrado y funciona en cualquier celular. */
export const DOMINIO_LOGIN_FUNCIONAL = FIREBASE_CONFIG.authDomain;

/** URL de la app servida desde el dominio donde el login funciona. */
export const URL_APP_LOGIN_FUNCIONAL = `https://${DOMINIO_LOGIN_FUNCIONAL}/`;

function hostActual(): string {
  return typeof window === 'undefined' ? '' : window.location.hostname;
}

/**
 * El authDomain que realmente usamos. Si la app se está sirviendo desde un
 * dominio que puede hacer el login en su propio origen, usamos ese; así el
 * iframe y el handler de Google quedan en el mismo origen que la app.
 */
const authDomainEnUso = DOMINIOS_CON_LOGIN_PROPIO.has(hostActual())
  ? hostActual()
  : FIREBASE_CONFIG.authDomain;

/**
 * `true` cuando el login ocurre en el mismo origen que la app. Cuando es
 * `false`, el login depende de un iframe de tercera parte que iOS bloquea y
 * que en la PWA instalada de Android se cuelga: la interfaz avisa y ofrece
 * abrir la app en el dominio que sí funciona.
 */
export const loginEsMismoOrigen = hostActual() === authDomainEnUso;

// `client.ts` (Firestore) también hace `initializeApp` de forma perezosa, pero
// reutiliza la app existente con `getApp()`. Este módulo se carga primero
// (AuthContext lo importa al arrancar), así que la app queda creada con el
// authDomain de arriba y Firestore hereda la misma instancia.
const app =
  getApps().length === 0
    ? initializeApp({ ...FIREBASE_CONFIG, authDomain: authDomainEnUso })
    : getApp();

/**
 * Auth SIN el resolver por defecto: eso es lo que evita el iframe bloqueante
 * al arrancar. El resolver se pasa a mano solo en el momento de iniciar
 * sesión o de resolver una redirección pendiente.
 *
 * La lista de persistencia deja que el SDK caiga a localStorage si IndexedDB
 * está rota o bloqueada, en vez de quedarse sin sesión.
 */
function crearAuth() {
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    });
  } catch {
    // Ya estaba inicializada (recarga en caliente, doble import): reutilizar.
    return getAuth(app);
  }
}

export const auth = crearAuth();

const googleProvider = new GoogleAuthProvider();
// Fuerza el selector de cuenta: en un celular compartido entre dueña y
// empleadas, entrar con la cuenta equivocada por defecto es el error típico.
googleProvider.setCustomParameters({ prompt: 'select_account' });

/**
 * Marca en sessionStorage que salimos hacia Google. Sin esto tendríamos que
 * llamar a `getRedirectResult` en cada arranque, y esa llamada es justamente
 * la que levanta el iframe: así solo pagamos ese costo cuando de verdad
 * volvemos de una redirección.
 */
const CLAVE_REDIRECT = 'gh:login-redirect-en-curso';

export function hayRedireccionEnCurso(): boolean {
  try {
    return sessionStorage.getItem(CLAVE_REDIRECT) === '1';
  } catch {
    return false;
  }
}

function marcarRedireccion(activa: boolean): void {
  try {
    if (activa) sessionStorage.setItem(CLAVE_REDIRECT, '1');
    else sessionStorage.removeItem(CLAVE_REDIRECT);
  } catch {
    /* sessionStorage bloqueado: seguimos igual */
  }
}

/**
 * Detecta si la app se está abriendo dentro del visor interno de una aplicación
 * como WhatsApp, Instagram, Facebook o TikTok (WKWebView en iOS).
 * En estos navegadores integrados, Google OAuth bloquea el acceso por seguridad y
 * el almacenamiento de sesión se borra entre redirecciones.
 */
export function esNavegadorInterno(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  return /WhatsApp|FBAN|FBAV|Instagram|Line|Twitter|Snapchat|BytedanceWebview/i.test(ua);
}

export function esDispositivoIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Detecta un teléfono/tablet Android o iOS (para decidir popup vs. redirect). */
export function esDispositivoMovil(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPad|iPhone|iPod/i.test(ua) || esDispositivoIOS();
}

/**
 * Detecta si la app corre "instalada" (agregada a la pantalla de inicio),
 * sin barra de navegador. En ese modo `window.open` no abre una ventana real
 * que el SDK pueda vigilar, así que el popup no sirve.
 */
export function esPwaInstalada(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as any).standalone === true
  );
}

/**
 * Inicia sesión con Google. En celular (o PWA instalada) usa redirección: el
 * popup no es confiable ahí. En escritorio usa popup, con fallback a redirect
 * si el navegador lo bloquea o lo cierra de forma espuria.
 */
export async function iniciarSesionGoogle(): Promise<User | null> {
  if (esDispositivoMovil() || esPwaInstalada()) {
    marcarRedireccion(true);
    try {
      await signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
    } catch (err) {
      marcarRedireccion(false);
      throw err;
    }
    return null;
  }

  try {
    const resultado = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    return resultado.user;
  } catch (err: any) {
    const codigo = err?.code;
    // Si el navegador bloqueó o cerró el popup de forma espuria, recurrir a redirect
    if (
      codigo === 'auth/popup-blocked' ||
      codigo === 'auth/popup-closed-by-user' ||
      codigo === 'auth/cancelled-popup-request'
    ) {
      console.warn('[firebase-mobile] Popup no disponible, iniciando redirección...');
      marcarRedireccion(true);
      try {
        await signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
      } catch (errRedirect) {
        marcarRedireccion(false);
        throw errRedirect;
      }
      return null;
    }
    throw err;
  }
}

/**
 * Resuelve el resultado de un `signInWithRedirect` pendiente (al volver de
 * Google). Nunca lanza: devuelve el error para que quien llama decida qué
 * mostrar, en vez de tragárselo en silencio.
 *
 * Solo se debe llamar cuando `hayRedireccionEnCurso()` es `true`: es esta
 * llamada la que levanta el iframe del authDomain.
 */
export async function resolverRedireccionPendiente(): Promise<{ user: User | null; error: unknown }> {
  try {
    const resultado = await getRedirectResult(auth, browserPopupRedirectResolver);
    return { user: resultado?.user ?? null, error: null };
  } catch (err) {
    console.warn('[firebase-mobile] Error resolviendo el redirect de Google:', err);
    return { user: null, error: err };
  } finally {
    marcarRedireccion(false);
  }
}

export async function cerrarSesion(): Promise<void> {
  await signOut(auth);
}

/**
 * Borra la base de datos local (IndexedDB) donde Firebase guarda la sesión y
 * recarga. Sirve como escape cuando un intento anterior dejó la sesión local
 * a medias.
 */
export function limpiarSesionLocalYRecargar(): void {
  marcarRedireccion(false);
  try {
    const borrar = indexedDB.deleteDatabase('firebaseLocalStorageDb');
    const recargar = () => window.location.reload();
    borrar.onsuccess = recargar;
    borrar.onerror = recargar;
    borrar.onblocked = recargar;
    // Por si alguno de esos eventos nunca llega, no dejamos a la usuaria
    // esperando: recargamos igual después de un instante.
    setTimeout(recargar, 1500);
  } catch {
    window.location.reload();
  }
}

export function alCambiarSesion(cb: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, cb);
}

/** Mensaje humano para los códigos de error más comunes de Google Sign-In. */
export function traducirErrorAuth(err: unknown): string {
  const codigo = (err as { code?: string })?.code ?? '';
  switch (codigo) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Se cerró la ventana de Google antes de terminar.';
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana de Google. Probá de nuevo.';
    case 'auth/network-request-failed':
      return 'No hay conexión a internet.';
    case 'auth/unauthorized-domain':
      return 'Este dominio no está autorizado en Firebase Authentication.';
    case 'app/redirect-timeout':
      return loginEsMismoOrigen
        ? 'El regreso desde Google tardó demasiado. Probá otra vez.'
        : 'El regreso desde Google no se completó. Esta dirección de la app no puede terminar el login en el celular: abrila desde el botón de abajo.';
    default:
      return (err as Error)?.message ?? 'No se pudo iniciar sesión con Google.';
  }
}
