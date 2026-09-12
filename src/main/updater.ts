import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';

export function iniciarActualizador(win: BrowserWindow): void {
  // Evitar chequeos en desarrollo
  if (!app.isPackaged || process.env.VITE_DEV_SERVER_URL) {
    console.log('[AutoUpdater] Modo desarrollo activo. Se omite la búsqueda automática de actualizaciones.');
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Verificando si hay actualizaciones disponibles...');
    if (!win.isDestroyed()) {
      win.webContents.send('app:update-checking');
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[AutoUpdater] ¡Nueva versión encontrada!: v${info.version}`);
    if (!win.isDestroyed()) {
      win.webContents.send('app:update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] La aplicación está en la versión más reciente.');
    if (!win.isDestroyed()) {
      win.webContents.send('app:update-not-available');
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error en el actualizador:', err);
    if (!win.isDestroyed()) {
      win.webContents.send('app:update-error', err?.message || 'Error al buscar actualización');
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Descargando actualización: ${progress.percent.toFixed(1)}%`);
    if (!win.isDestroyed()) {
      win.webContents.send('app:update-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[AutoUpdater] Actualización v${info.version} descargada y lista para instalar.`);
    if (!win.isDestroyed()) {
      win.webContents.send('app:update-downloaded', {
        version: info.version,
      });
    }
  });

  // Manejador IPC para reiniciar e instalar
  ipcMain.handle('app:restart-and-install-update', () => {
    console.log('[AutoUpdater] Cerrando app e instalando nueva versión...');
    autoUpdater.quitAndInstall(false, true);
  });

  // Manejador IPC para chequeo manual desde Configuración
  ipcMain.handle('app:check-for-updates', async () => {
    try {
      const res = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: res?.updateInfo };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // Chequeo inicial retardado (4s tras el inicio)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[AutoUpdater] No se pudo verificar actualización inicial:', err?.message);
    });
  }, 4000);
}
