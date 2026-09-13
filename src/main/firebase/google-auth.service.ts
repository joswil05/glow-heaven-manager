import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { app, shell, BrowserWindow, safeStorage } from 'electron';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { FIREBASE_CONFIG } from '../../shared/firebase-config';
import { getAuthInstance, haySesionViva } from './auth-instance';
import type { UsuarioGoogle } from '../../shared/ipc-contracts';

/** Lo que se guarda en disco: el usuario más el token con que se lo consiguió. */
interface SesionGuardada extends UsuarioGoogle {
  idToken?: string;
}

function getSessionPath(): string {
  try {
    if (app && app.getPath) {
      const dir = app.getPath('userData');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return path.join(dir, 'auth_session.json');
    }
  } catch {
    // Fallback
  }
  const fallbackDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
  return path.join(fallbackDir, 'auth_session.json');
}

export class GoogleAuthService {
  private static usuarioActivo: UsuarioGoogle | null = null;

  /** Lee y descifra el archivo de sesión. No prueba que la sesión siga viva. */
  private static leerSesionGuardada(): SesionGuardada | null {
    const ruta = getSessionPath();
    if (!fs.existsSync(ruta)) return null;

    try {
      const raw = fs.readFileSync(ruta);
      let contenidoStr = '';
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        try {
          contenidoStr = safeStorage.decryptString(raw);
        } catch {
          // Si el archivo estaba en texto plano antes de la actualización
          contenidoStr = raw.toString('utf-8');
        }
      } else {
        contenidoStr = raw.toString('utf-8');
      }
      return JSON.parse(contenidoStr) as SesionGuardada;
    } catch (err) {
      console.error('Error al leer sesión guardada:', err);
      return null;
    }
  }

  private static borrarSesionGuardada(): void {
    try {
      const ruta = getSessionPath();
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    } catch {
      // Si no se puede borrar, el próximo inicio de sesión lo sobrescribe.
    }
  }

  /**
   * Quién está usando la aplicación, según el SDK y no según el disco.
   *
   * Antes esto devolvía el usuario con sólo encontrar el archivo de sesión, lo
   * que hacía que la aplicación se mostrara "conectada" después de cada
   * reinicio aunque no hubiera ninguna sesión real. Firestore rechazaba todo,
   * y para tapar ese síntoma se terminó abriendo la base a peticiones sin
   * autenticar en las reglas. La verdad la tiene el SDK.
   */
  static obtenerUsuarioActual(): UsuarioGoogle | null {
    if (!haySesionViva()) return null;
    if (this.usuarioActivo) return this.usuarioActivo;

    // Sesión viva pero sin datos en memoria: completar desde el disco.
    const guardada = this.leerSesionGuardada();
    if (guardada) {
      const { idToken: _descartado, ...usuario } = guardada;
      this.usuarioActivo = usuario;
      return this.usuarioActivo;
    }
    return null;
  }

  /**
   * Reabre la sesión de Firebase al arrancar, con el token que quedó guardado.
   *
   * En Node el SDK no persiste nada: se comprobó que
   * `setPersistence(browserLocalPersistence)` se acepta pero cae en silencio a
   * memoria. Así que la sesión se rehidrata a mano acá.
   *
   * El token de Google dura una hora. Si ya venció, no hay forma de renovarlo
   * sin que la persona vuelva a pasar por Google, así que se limpia la sesión
   * y la aplicación muestra la pantalla de ingreso. Es un clic, y el navegador
   * normalmente ya tiene la cuenta elegida.
   */
  static async restaurarSesion(): Promise<UsuarioGoogle | null> {
    if (haySesionViva()) return this.obtenerUsuarioActual();

    const guardada = this.leerSesionGuardada();
    if (!guardada?.idToken) {
      if (guardada) {
        // Sesión de una versión vieja, sin token: no sirve para reconectar.
        this.borrarSesionGuardada();
      }
      this.usuarioActivo = null;
      return null;
    }

    try {
      const credencial = GoogleAuthProvider.credential(guardada.idToken);
      await signInWithCredential(getAuthInstance(), credencial);

      const { idToken: _descartado, ...usuario } = guardada;
      this.usuarioActivo = usuario;
      console.log('[GoogleAuthService] Sesión restaurada para', usuario.email);
      return this.usuarioActivo;
    } catch (err) {
      console.warn(
        '[GoogleAuthService] La sesión guardada ya no sirve (el token de Google dura una hora). Hay que volver a ingresar:',
        (err as Error)?.message || err
      );
      this.borrarSesionGuardada();
      this.usuarioActivo = null;
      return null;
    }
  }

  static async cerrarSesion(): Promise<{ ok: true }> {
    this.usuarioActivo = null;
    const ruta = getSessionPath();
    if (fs.existsSync(ruta)) {
      try {
        fs.unlinkSync(ruta);
      } catch (err) {
        console.error('Error al eliminar sesión guardada:', err);
      }
    }
    try {
      const { getAuth, signOut } = await import('firebase/auth');
      const { getApps, initializeApp, getApp } = await import('firebase/app');
      const appFb = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
      await signOut(getAuth(appFb));
    } catch {
      // Silencioso
    }
    return { ok: true };
  }

  static async iniciarSesionGoogle(): Promise<UsuarioGoogle> {
    return new Promise((resolve, reject) => {
      let server: http.Server | null = null;
      let terminado = false;
      const csrfState = crypto.randomBytes(24).toString('hex');

      const limpiar = () => {
        if (!terminado) {
          terminado = true;
          if (server) {
            try {
              server.close();
            } catch {
              // Ignore
            }
          }
        }
      };

      // Timeout de 5 minutos por si el usuario cierra el navegador
      const timeout = setTimeout(() => {
        limpiar();
        reject(new Error('El inicio de sesión expiró o tardó demasiado. Intentá de nuevo.'));
      }, 300000);

      server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', `http://${req.headers.host}`);

        // 1. Ruta de servicio de la página de login
        if (url.pathname === '/' || url.pathname === '/auth') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(GoogleAuthService.generarPaginaHtml(csrfState));
          return;
        }

        // 2. Recepción de credenciales desde el navegador
        if (url.pathname === '/callback' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body);

              // Validación CSRF de State (M-2)
              if (!data.state || data.state !== csrfState) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Validación CSRF fallida: state mismatch' }));
                clearTimeout(timeout);
                limpiar();
                reject(new Error('Token de estado CSRF inválido en autenticación Google.'));
                return;
              }

              if (!data.email || !data.uid) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Datos de usuario inválidos' }));
                return;
              }

              const usuario: UsuarioGoogle = {
                uid: data.uid,
                email: data.email,
                nombre: data.nombre || data.email.split('@')[0],
                foto: data.foto || undefined,
              };

              // Sincronizar credencial con la instancia Firebase Auth en Node.
              // Sin esto Firestore rechaza todo: las reglas exigen que la
              // petición traiga un usuario de la lista blanca (M-1).
              if (!data.idToken) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Falta el token de Google.' }));
                clearTimeout(timeout);
                limpiar();
                reject(new Error('Google no devolvió el token de identidad.'));
                return;
              }

              {
                try {
                  const cred = GoogleAuthProvider.credential(data.idToken);
                  await signInWithCredential(getAuthInstance(), cred);
                  console.log('[GoogleAuthService] Sesión de Firebase sincronizada en proceso principal.');
                } catch (authErr) {
                  console.error('[GoogleAuthService] Error al sincronizar credencial con Auth principal:', authErr);
                  res.writeHead(401, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'No se pudo sincronizar la credencial con Firebase.' }));
                  clearTimeout(timeout);
                  limpiar();
                  reject(authErr instanceof Error ? authErr : new Error(String(authErr)));
                  return;
                }
              }

              // Guardar sesión persistente cifrada con safeStorage (A-1)
              GoogleAuthService.usuarioActivo = usuario;
              const sessionRaw = JSON.stringify({ ...usuario, idToken: data.idToken }, null, 2);
              const sessionPath = getSessionPath();
              if (safeStorage && safeStorage.isEncryptionAvailable()) {
                const encrypted = safeStorage.encryptString(sessionRaw);
                fs.writeFileSync(sessionPath, encrypted);
              } else {
                fs.writeFileSync(sessionPath, sessionRaw, 'utf-8');
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true }));

              clearTimeout(timeout);
              limpiar();

              // Enfocar la ventana principal de Electron
              const win = BrowserWindow.getAllWindows()[0];
              if (win) {
                if (win.isMinimized()) win.restore();
                win.focus();
              }

              resolve(usuario);
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Error procesando autenticación' }));
              clearTimeout(timeout);
              limpiar();
              reject(err);
            }
          });
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server?.address();
        if (!addr || typeof addr === 'string') {
          limpiar();
          reject(new Error('No se pudo iniciar el servidor local de autenticación.'));
          return;
        }

        // Abrir en el navegador predeterminado del sistema (Chrome, Edge, etc.)
        const loginUrl = `http://localhost:${addr.port}/auth`;
        shell.openExternal(loginUrl).catch((err) => {
          limpiar();
          reject(new Error(`No se pudo abrir el navegador: ${err.message}`));
        });
      });
    });
  }

  private static generarPaginaHtml(csrfState: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Glow Heaven - Iniciar Sesión con Google</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body {
      background: #0f1117;
      color: #f3f4f6;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: #181b25;
      border: 1px solid #282c3c;
      border-radius: 16px;
      padding: 36px 32px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .logo {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #ec4899, #8b5cf6);
      border-radius: 12px;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: bold;
      color: white;
    }
    h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; color: #fff; }
    p { font-size: 14px; color: #9ca3af; margin-bottom: 24px; line-height: 1.5; }
    .btn-google {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      width: 100%;
      padding: 12px 18px;
      background: #ffffff;
      color: #1f2937;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    .btn-google:hover { background: #f3f4f6; transform: translateY(-1px); }
    .btn-google:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }
    .status { margin-top: 16px; font-size: 13px; color: #9ca3af; }
    .success { color: #10b981; font-weight: 500; }
    .error { color: #ef4444; font-weight: 500; }
    .spinner {
      border: 3px solid rgba(255,255,255,0.1);
      border-left-color: #8b5cf6;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      animation: spin 1s linear infinite;
      margin: 16px auto;
      display: none;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
  <script type="module">
    import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
    import { getAuth, signInWithPopup, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

    const firebaseConfig = ${JSON.stringify(FIREBASE_CONFIG)};
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();

    const btn = document.getElementById('loginBtn');
    const status = document.getElementById('status');
    const spinner = document.getElementById('spinner');

    async function login() {
      btn.disabled = true;
      spinner.style.display = 'block';
      status.textContent = 'Abriendo ventana de Google...';
      status.className = 'status';

      try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        status.textContent = '¡Verificado! Conectando con la aplicación...';
        status.className = 'status';

        const credential = GoogleAuthProvider.credentialFromResult(result);
        const idToken = credential?.idToken || (await user.getIdToken());

        const res = await fetch('/callback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: user.uid,
            email: user.email,
            nombre: user.displayName,
            foto: user.photoURL,
            idToken: idToken,
            state: '${csrfState}'
          })
        });

        if (res.ok) {
          spinner.style.display = 'none';
          status.textContent = '¡Inicio de sesión exitoso! Ya podés volver a Glow Heaven Manager.';
          status.className = 'status success';
          btn.style.display = 'none';
          setTimeout(() => { window.close(); }, 2000);
        } else {
          throw new Error('No se pudo guardar la sesión en la aplicación.');
        }
      } catch (err) {
        spinner.style.display = 'none';
        btn.disabled = false;
        let msg = err.message || 'Error al autenticar';
        if (err.code === 'auth/popup-closed-by-user') {
          msg = 'La ventana de inicio de sesión fue cerrada.';
        } else if (err.code === 'auth/configuration-not-found') {
          msg = 'Debes habilitar el proveedor Google en la consola de Firebase.';
        }
        status.textContent = msg;
        status.className = 'status error';
      }
    }

    btn.addEventListener('click', login);
    // Intentar abrir el selector automáticamente al cargar
    setTimeout(login, 400);
  </script>
</head>
<body>
  <div class="card">
    <div class="logo">GH</div>
    <h1>Glow Heaven Manager</h1>
    <p>Iniciá sesión con tu cuenta de Google para acceder a tu catálogo, ventas y clientes.</p>

    <button id="loginBtn" class="btn-google">
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
        <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
      </svg>
      Continuar con Google
    </button>

    <div id="spinner" class="spinner"></div>
    <div id="status" class="status">Cargando inicio de sesión...</div>
  </div>
</body>
</html>`;
  }
}
