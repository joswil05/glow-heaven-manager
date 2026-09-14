import { app, BrowserWindow, dialog } from 'electron';
import { getFirestoreDb } from './firebase/client';
import { AccesoFirebase } from './firebase/auth';
import { GoogleAuthService } from './firebase/google-auth.service';
import { ParametrosRepoFirestore } from './firebase/repositories/parametros.repo';
import { registrarHandlers } from './ipc';
import { createMainWindow } from './windows/main.window';
import { iniciarActualizador } from './updater';

app.setName('glow-heaven-manager');

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
      return;
    }

    // Sin esto la aplicacion se volvia IMPOSIBLE de abrir: si la instancia
    // viva se quedaba sin ventana (se cerro, se cayo el renderer, o el
    // proceso sobrevivio a un cierre sucio), el candado de instancia unica
    // hacia que cada nuevo lanzamiento se cerrara de inmediato, y el proceso
    // viejo no tenia ventana que mostrar. Hacer doble clic en el icono no
    // hacia nada, para siempre, hasta matar el proceso a mano.
    //
    // Si la instancia que tiene el candado no tiene ventana, la abre: es la
    // unica que puede hacerlo.
    if (app.isReady()) {
      iniciarActualizador(createMainWindow());
    }
  });

  app.whenReady().then(async () => {
    try {
      getFirestoreDb();

      // Reabrir la sesión de Google guardada. En Node el SDK de Firebase no
      // persiste nada entre arranques, así que sin esto cada reinicio dejaba a
      // la aplicación sin credenciales frente a Firestore, mostrándose
      // "conectada" pero sin poder leer ni escribir nada.
      const usuarioGoogle = await GoogleAuthService.restaurarSesion();

      // Las reglas de Firestore exigen una sesión. Si falta configurarla, la
      // aplicación abre igual y lo pide desde Configuración: cerrarla dejaría
      // al usuario sin ninguna pantalla donde resolverlo.
      const acceso = usuarioGoogle
        ? { conectado: true }
        : await AccesoFirebase.conectar();

      if (acceso.conectado) {
        // Semilla de parámetros y categorías, solo con sesión válida.
        await ParametrosRepoFirestore.getParametros();
        await ParametrosRepoFirestore.getCategorias();
      }

      registrarHandlers();
      const win = createMainWindow();
      iniciarActualizador(win);

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          const nuevaWin = createMainWindow();
          iniciarActualizador(nuevaWin);
        }
      });
    } catch (err) {
      console.error('Error durante la inicialización de la aplicación:', err);
      dialog.showErrorBox(
        'Error al iniciar Glow Heaven Manager',
        `No se pudo conectar con Firebase:\n\n${(err as Error)?.message || String(err)}`
      );
      app.exit(1);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
