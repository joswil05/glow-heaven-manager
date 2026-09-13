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

/** Detecta un teléfono/tablet Android o iOS (para decidir popup vs. redirect). */
export function esDispositivoMovil(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Android|iPad|iPhone|iPod/i.test(ua) || esDispositivoIOS();
}

/**
 * Detecta si la app corre "instalada" (agregada a la pantalla de inicio),
 * sin barra de navegador. En ese modo no existe una ventana real donde
 * abrir un popup: Chrome/Android lo simula y pierde el foco al mostrar el
 * selector de cuenta de Google, lo que Firebase reporta como
 * "auth/popup-closed-by-user" aunque nadie cerró nada.
 */
export function esPwaInstalada(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as any).standalone === true
  );
}

/**
 * Inicia sesión con Google. En celular (o PWA instalada) usa redirección
 * directamente: el popup es poco confiable ahí y suele cerrarse solo antes
 * de terminar. En escritorio usa popup, con fallback a redirect si el
 * navegador lo bloquea o lo cierra de forma espuria.
 */
export async function iniciarSesionGoogle(): Promise<User | null> {
  await persistenciaLista;

  if (esDispositivoMovil() || esPwaInstalada()) {
    await signInWithRedirect(auth, googleProvider);
    return null;
  }

  try {
    const resultado = await signInWithPopup(auth, googleProvider);
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
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    throw err;
  }
}

/**
 * Resuelve el resultado de un `signInWithRedirect` pendiente (al volver de
 * Google). Nunca lanza: devuelve el error para que quien llama decida qué
 * mostrar, en vez de tragárselo en silencio.
 */
export async function resolverRedireccionPendiente(): Promise<{ user: User | null; error: unknown }> {
  try {
    const resultado = await getRedirectResult(auth);
    return { user: resultado?.user ?? null, error: null };
  } catch (err) {
    console.warn('[firebase-mobile] Error resolviendo el redirect de Google:', err);
    return { user: null, error: err };
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
    case 'app/redirect-timeout':
      return 'El regreso desde Google tardó demasiado. Esto puede pasar en la app instalada en el celular. Probá otra vez, o abrí el enlace en Chrome (sin abrir la app instalada) para entrar por primera vez.';
    default:
      return (err as Error)?.message ?? 'No se pudo iniciar sesión con Google.';
  }
}
