import { app, BrowserWindow } from 'electron';
import { getDb, closeDb } from './db/database';
import { runMigrations } from './db/migrations';
import { registerAllIpcHandlers } from './ipc';
import { createMainWindow } from './windows/main.window';
import { BackupService } from './services/backup.service';

// Prevenir múltiples instancias de la app
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

  app.whenReady().then(() => {
    // 1. Inicializar base de datos SQLite y migraciones
    const db = getDb();
    runMigrations(db);

    // 2. Registrar todos los canales IPC
    registerAllIpcHandlers();

    // 3. Crear ventana principal
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  // Respaldo automático obligatorio al cerrar la aplicación (Bloqueador 3)
  app.on('before-quit', async () => {
    try {
      console.log('Creando respaldo automático antes de cerrar...');
      await BackupService.crearBackup();
    } catch (err) {
      console.error('Error durante el respaldo automático al salir:', err);
    } finally {
      closeDb();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
