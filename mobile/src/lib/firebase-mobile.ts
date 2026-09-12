import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut,
  type User,
} from 'firebase/auth';
import { FIREBASE_CONFIG } from '@shared/firebase-config';

/**
 * Autenticación en el navegador móvil.
 * Usa la configuración oficial de Firebase (authDomain: glow-heaven-db-app.firebaseapp.com)
 * registrada en Google Cloud Console para evitar errores de redirect_uri_mismatch.
 */
const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
export const auth = getAuth(app);

const persistenciaLista = setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn('[firebase-mobile] No se pudo fijar la persistencia de sesión:', err);
});

const googleProvider = new GoogleAuthProvider();
// Fuerza el selector de cuenta: en un celular compartido entre dueña y
// empleadas, entrar con la cuenta equivocada por defecto es el error típico.
googleProvider.setCustomParameters({ prompt: 'select_account' });

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

/**
 * Inicia sesión con Google usando popup, con fallback inteligente a redirección
 * si Safari bloquea las ventanas emergentes.
 */
export async function iniciarSesionGoogle(): Promise<User | null> {
  await persistenciaLista;
  try {
    const resultado = await signInWithPopup(auth, googleProvider);
    return resultado.user;
  } catch (err: any) {
    const codigo = err?.code;
    // Si Safari bloqueó el popup por directiva del navegador, recurrir a redirect
    if (codigo === 'auth/popup-blocked') {
      console.warn('[firebase-mobile] Popup bloqueado por el navegador, iniciando redirección...');
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

export async function resolverRedireccionPendiente(): Promise<User | null> {
  try {
    const resultado = await getRedirectResult(auth);
    return resultado?.user ?? null;
  } catch (err) {
    console.warn('[firebase-mobile] Error resolviendo el redirect de Google:', err);
    return null;
  }
}

export async function cerrarSesion(): Promise<void> {
  await signOut(auth);
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
    default:
      return (err as Error)?.message ?? 'No se pudo iniciar sesión con Google.';
  }
}
