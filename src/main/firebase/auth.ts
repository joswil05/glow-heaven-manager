import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  type Auth,
} from 'firebase/auth';
import { FIREBASE_CONFIG } from '../../shared/firebase-config';
import { GoogleAuthService } from './google-auth.service';

/**
 * Acceso autenticado a Firestore.
 *
 * Las reglas de la base exigen una sesión: sin esto, la aplicación no puede
 * leer ni escribir. Las credenciales se guardan cifradas con `safeStorage`
 * de Electron, que usa el almacén de claves del sistema operativo. No pueden
 * vivir en Firestore, que es justamente lo que protegen.
 */

const ARCHIVO = 'credenciales-firebase.bin';

export interface EstadoAcceso {
  configurado: boolean;
  conectado: boolean;
  correo?: string;
  error?: string;
}

let authInstance: Auth | null = null;
let conectado = false;
let ultimoError: string | undefined;

function getAuthInstance(): Auth {
  if (!authInstance) {
    const appFb = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
    authInstance = getAuth(appFb);

    // Mismo mecanismo que Firestore: la variable de entorno redirige al
    // emulador local para probar sin tocar las cuentas reales.
    const emulador = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    if (emulador) {
      const url = emulador.startsWith('http') ? emulador : `http://${emulador}`;
      connectAuthEmulator(authInstance, url, { disableWarnings: true });
    }
  }
  return authInstance;
}

function rutaArchivo(): string {
  return path.join(app.getPath('userData'), ARCHIVO);
}

function guardarCredenciales(correo: string, clave: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Este sistema no puede cifrar credenciales. No se guardaron por seguridad.'
    );
  }
  const cifrado = safeStorage.encryptString(JSON.stringify({ correo, clave }));
  fs.writeFileSync(rutaArchivo(), cifrado);
}

function leerCredenciales(): { correo: string; clave: string } | null {
  try {
    const ruta = rutaArchivo();
    if (!fs.existsSync(ruta)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;

    const texto = safeStorage.decryptString(fs.readFileSync(ruta));
    const datos = JSON.parse(texto) as { correo?: string; clave?: string };
    if (!datos.correo || !datos.clave) return null;
    return { correo: datos.correo, clave: datos.clave };
  } catch {
    return null;
  }
}

export class AccesoFirebase {
  /** Intenta iniciar sesión con lo que haya guardado. No lanza. */
  static async conectar(): Promise<EstadoAcceso> {
    const credenciales = leerCredenciales();
    if (!credenciales) {
      conectado = false;
      return { configurado: false, conectado: false };
    }

    try {
      await signInWithEmailAndPassword(
        getAuthInstance(),
        credenciales.correo,
        credenciales.clave
      );
      conectado = true;
      ultimoError = undefined;
      return { configurado: true, conectado: true, correo: credenciales.correo };
    } catch (err) {
      conectado = false;
      ultimoError = traducirError(err);
      return {
        configurado: true,
        conectado: false,
        correo: credenciales.correo,
        error: ultimoError,
      };
    }
  }

  /** Guarda credenciales nuevas solo si de verdad sirven para entrar. */
  static async configurar(correo: string, clave: string): Promise<EstadoAcceso> {
    const limpioCorreo = correo.trim();
    if (!limpioCorreo || !clave) {
      throw new Error('Escribí el correo y la contraseña de la cuenta de Firebase.');
    }

    try {
      await signInWithEmailAndPassword(getAuthInstance(), limpioCorreo, clave);
    } catch (err) {
      throw new Error(traducirError(err));
    }

    guardarCredenciales(limpioCorreo, clave);
    conectado = true;
    ultimoError = undefined;
    return { configurado: true, conectado: true, correo: limpioCorreo };
  }

  static estado(): EstadoAcceso {
    const usuarioGoogle = GoogleAuthService.obtenerUsuarioActual();
    if (usuarioGoogle) {
      return {
        configurado: true,
        conectado: true,
        correo: usuarioGoogle.email,
      };
    }
    const credenciales = leerCredenciales();
    return {
      configurado: credenciales !== null,
      conectado,
      correo: credenciales?.correo,
      error: ultimoError,
    };
  }

  static estaConectado(): boolean {
    if (GoogleAuthService.obtenerUsuarioActual()) return true;
    return conectado;
  }

  static olvidar(): void {
    try {
      const ruta = rutaArchivo();
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    } catch {
      // Si no se puede borrar, la próxima configuración lo sobrescribe.
    }
    conectado = false;
  }
}

/** Los códigos de Firebase no sirven para mostrarle a una persona. */
function traducirError(err: unknown): string {
  const codigo = (err as { code?: string })?.code ?? '';

  switch (codigo) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'El correo o la contraseña de Firebase no son correctos.';
    case 'auth/invalid-email':
      return 'Ese correo no tiene un formato válido.';
    case 'auth/user-disabled':
      return 'Esa cuenta está deshabilitada en la consola de Firebase.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos seguidos. Esperá unos minutos.';
    case 'auth/network-request-failed':
      return 'No hay conexión a internet.';
    case 'auth/operation-not-allowed':
      return 'Falta habilitar "Correo electrónico/contraseña" en Authentication.';
    default:
      return (err as Error)?.message ?? 'No se pudo conectar con Firebase.';
  }
}
