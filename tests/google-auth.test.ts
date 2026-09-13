import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleAuthService } from '../src/main/firebase/google-auth.service';

/**
 * Contrato de la sesión del escritorio.
 *
 * Antes estas pruebas afirmaban que encontrar el archivo `auth_session.json`
 * bastaba para dar por iniciada la sesión. Esa suposición causó un incidente:
 * tras cada reinicio la aplicación se mostraba conectada mientras el SDK de
 * Firebase no tenía ninguna sesión, así que Firestore rechazaba todo; para
 * tapar el síntoma se terminó abriendo la base a peticiones sin autenticar en
 * `firestore.rules`.
 *
 * La regla ahora es: el archivo es sólo un insumo para RECONECTAR
 * (`restaurarSesion`), nunca una prueba de que haya sesión. En estas pruebas
 * nunca hay sesión viva de Firebase, así que `obtenerUsuarioActual()` debe
 * devolver null incluso con el archivo presente.
 */
describe('GoogleAuthService', () => {
  const sessionPath = path.join(process.cwd(), 'data', 'auth_session.json');

  function escribirSesion(datos: Record<string, unknown>): void {
    const dir = path.dirname(sessionPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(sessionPath, JSON.stringify(datos), 'utf-8');
  }

  beforeEach(() => {
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
    GoogleAuthService.cerrarSesion();
  });

  afterEach(() => {
    if (fs.existsSync(sessionPath)) fs.unlinkSync(sessionPath);
  });

  it('devuelve null cuando no hay sesión activa ni archivo', () => {
    expect(GoogleAuthService.obtenerUsuarioActual()).toBeNull();
  });

  it('NO da por iniciada la sesión sólo porque exista el archivo', () => {
    escribirSesion({
      uid: 'user-google-123',
      email: 'test@glowheaven.com',
      nombre: 'Ross',
      idToken: 'token-viejo',
    });

    // Sin sesión viva en el SDK, la respuesta honesta es "no hay nadie".
    // Si esto vuelve a devolver un usuario, la aplicación volverá a creerse
    // conectada sin poder leer Firestore.
    expect(GoogleAuthService.obtenerUsuarioActual()).toBeNull();
  });

  it('restaurarSesion devuelve null y no deja basura si no hay archivo', async () => {
    expect(await GoogleAuthService.restaurarSesion()).toBeNull();
    expect(fs.existsSync(sessionPath)).toBe(false);
  });

  it('restaurarSesion descarta una sesión guardada sin token', async () => {
    // Formato de una versión anterior: no sirve para reconectar con Firebase.
    escribirSesion({
      uid: 'user-google-123',
      email: 'test@glowheaven.com',
      nombre: 'Ross',
    });

    expect(await GoogleAuthService.restaurarSesion()).toBeNull();
    expect(fs.existsSync(sessionPath)).toBe(false);
  });

  it('elimina la sesión al cerrar sesión', async () => {
    escribirSesion({
      uid: 'user-google-123',
      email: 'test@glowheaven.com',
      nombre: 'Ross',
      idToken: 'token-viejo',
    });

    await GoogleAuthService.cerrarSesion();
    expect(GoogleAuthService.obtenerUsuarioActual()).toBeNull();
    expect(fs.existsSync(sessionPath)).toBe(false);
  });
});
