import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { app, safeStorage } from 'electron';

/**
 * PIN de bloqueo local.
 *
 * Vive en esta computadora, NO en Firestore. Guardarlo en la base creaba un
 * candado de arranque: la pantalla de PIN necesitaba leer Firestore, Firestore
 * exige sesión iniciada, y la sesión se configura en una pantalla a la que no
 * se podía llegar sin pasar el PIN. Una instalación nueva quedaba muerta.
 *
 * Además protege algo distinto que la cuenta de Firebase: la contraseña de
 * Firebase da acceso a los datos; el PIN evita que alguien que pasa frente a
 * la computadora abierta vea las ventas. Son dos cosas y viven aparte.
 */

const ARCHIVO = 'pin.bin';
const LARGO_SAL = 16;
const LARGO_CLAVE = 64;

function rutaArchivo(): string {
  return path.join(app.getPath('userData'), ARCHIVO);
}

function derivar(pin: string, sal: Buffer): Buffer {
  return scryptSync(pin.normalize('NFKC'), sal, LARGO_CLAVE);
}

function leer(): string | null {
  try {
    const ruta = rutaArchivo();
    if (!fs.existsSync(ruta)) return null;

    const crudo = fs.readFileSync(ruta);
    const texto = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(crudo)
      : crudo.toString('utf-8');

    return texto.trim() || null;
  } catch {
    return null;
  }
}

function escribir(valor: string): void {
  const ruta = rutaArchivo();
  const datos = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(valor)
    : Buffer.from(valor, 'utf-8');
  fs.writeFileSync(ruta, datos);
}

export class AccesoServiceFirestore {
  static async tienePin(): Promise<boolean> {
    return leer() !== null;
  }

  static async establecerPin(pin: string): Promise<void> {
    const limpio = pin.trim();
    if (limpio.length < 4) {
      throw new Error('El PIN tiene que tener al menos 4 caracteres.');
    }

    const sal = randomBytes(LARGO_SAL);
    const hash = derivar(limpio, sal);
    escribir(`${sal.toString('hex')}:${hash.toString('hex')}`);
  }

  static async verificarPin(pin: string): Promise<boolean> {
    const guardado = leer();
    if (!guardado) return false;

    const [salHex, hashHex] = guardado.split(':');
    if (!salHex || !hashHex) return false;

    try {
      const esperado = Buffer.from(hashHex, 'hex');
      const calculado = derivar(pin.trim(), Buffer.from(salHex, 'hex'));

      // Comparación de tiempo constante: usar === filtra información sobre
      // cuántos caracteres coinciden.
      return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
    } catch {
      return false;
    }
  }

  static async cambiarPin(pinActual: string, pinNuevo: string): Promise<void> {
    if ((await this.tienePin()) && !(await this.verificarPin(pinActual))) {
      throw new Error('El PIN actual no es correcto.');
    }
    await this.establecerPin(pinNuevo);
  }
}
