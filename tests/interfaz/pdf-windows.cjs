/** Referencia con Electron y las mismas opciones de htmlAPdf en main/ipc/index.ts.
 * No inicia Firestore ni la app productiva; sólo carga HTML de fixtures locales.
 * Ejecutar: node_modules/.bin/electron tests/interfaz/pdf-windows.cjs
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

app.whenReady().then(async () => {
  for (const nombre of ['corta', 'larga']) {
    const html = await fs.readFile(path.resolve('scratch/c2-pdf', `${nombre}.html`), 'utf8');
    const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdf = await win.webContents.printToPDF({ printBackground: true, landscape: false,
        pageSize: 'A4', margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } });
      await fs.writeFile(path.resolve('scratch/c2-pdf', `${nombre}-windows.pdf`), pdf);
      console.log(`${nombre}: PDF de referencia Windows, ${pdf.length} bytes`);
    } finally { if (!win.isDestroyed()) win.close(); }
  }
  app.quit();
}).catch(err => { console.error(err); app.exit(1); });
// No salir entre las dos ventanas de referencia.
app.on('window-all-closed', () => {});
