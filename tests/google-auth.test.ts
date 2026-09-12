import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GoogleAuthService } from '../src/main/firebase/google-auth.service';

describe('GoogleAuthService', () => {
  const sessionPath = path.join(process.cwd(), 'data', 'auth_session.json');

  beforeEach(() => {
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
    GoogleAuthService.cerrarSesion();
  });

  afterEach(() => {
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
  });

  it('devuelve null cuando no hay sesión activa ni archivo', () => {
    const usuario = GoogleAuthService.obtenerUsuarioActual();
    expect(usuario).toBeNull();
  });

  it('lee la sesión persistida correctamente', () => {
    const dir = path.dirname(sessionPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(
      sessionPath,
      JSON.stringify({
        uid: 'user-google-123',
        email: 'test@glowheaven.com',
        nombre: 'Ross',
      }),
      'utf-8'
    );

    const usuario = GoogleAuthService.obtenerUsuarioActual();
    expect(usuario).not.toBeNull();
    expect(usuario?.email).toBe('test@glowheaven.com');
    expect(usuario?.nombre).toBe('Ross');
  });

  it('elimina la sesión al cerrar sesión', async () => {
    const dir = path.dirname(sessionPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(
      sessionPath,
      JSON.stringify({
        uid: 'user-google-123',
        email: 'test@glowheaven.com',
        nombre: 'Ross',
      }),
      'utf-8'
    );

    expect(GoogleAuthService.obtenerUsuarioActual()).not.toBeNull();
    await GoogleAuthService.cerrarSesion();
    expect(GoogleAuthService.obtenerUsuarioActual()).toBeNull();
    expect(fs.existsSync(sessionPath)).toBe(false);
  });
});
