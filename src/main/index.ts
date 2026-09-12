import { app, BrowserWindow, dialog } from 'electron';
import { getFirestoreDb } from './firebase/client';
import { AccesoFirebase } from './firebase/auth';
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
    }
  });

  app.whenReady().then(async () => {
    try {
      getFirestoreDb();

      // Las reglas de Firestore exigen una sesión. Si falta configurarla, la
      // aplicación abre igual y lo pide desde Configuración: cerrarla dejaría
      // al usuario sin ninguna pantalla donde resolverlo.
      const acceso = await AccesoFirebase.conectar();

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
