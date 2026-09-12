import { BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;

export function createMainWindow(): BrowserWindow {
  const iconPath = process.env.VITE_DEV_SERVER_URL
    ? path.join(__dirname, '../../build/icon.ico')
    : path.join(__dirname, '../../dist/icon.ico');

  mainWindow = new BrowserWindow({
    title: 'Glow Heaven Manager',
    icon: iconPath,
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#ffffff',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    console.log('[Main Window] Evento ready-to-show recibido. Mostrando ventana...');
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main Window] webContents: did-finish-load completado.');
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Main Window] Error al cargar página:', errorCode, errorDescription, validatedURL);
  });

  // Respaldo por si ready-to-show tarda o se demora el primer render
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.log('[Main Window] Fallback de 2s ejecutado para mostrar ventana.');
      mainWindow.show();
    }
  }, 2000);

  // Abrir enlaces externos en el navegador del sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Cargar contenido según el entorno
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  return mainWindow;
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}
