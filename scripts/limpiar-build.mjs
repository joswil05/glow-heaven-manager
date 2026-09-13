/**
 * Borra la salida de compilación antes de volver a compilar.
 *
 * Vite limpia `dist/` solo, pero `vite-plugin-electron` NO limpia
 * `dist-electron/`: cada compilación agrega un bundle nuevo con hash y deja
 * todos los anteriores. Se habían acumulado 45 bundles (45 MB) de los cuales
 * el programa usa uno solo.
 *
 * Eso no era basura inofensiva: `electron-builder.yml` empaqueta
 * `dist-electron/**\/*`, así que los 44 bundles muertos viajaban dentro del
 * instalador y de cada auto-actualización que descarga la dueña.
 *
 * Node puro, sin dependencias nuevas, para que funcione igual en Windows.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const objetivos = ['dist', 'dist-electron'];

for (const objetivo of objetivos) {
  const ruta = path.join(raiz, objetivo);
  if (!fs.existsSync(ruta)) continue;

  let antes = 0;
  try {
    antes = medir(ruta);
  } catch {
    antes = 0;
  }

  fs.rmSync(ruta, { recursive: true, force: true });
  console.log(`[limpiar-build] ${objetivo}/ borrado (${(antes / 1024 / 1024).toFixed(1)} MB)`);
}

function medir(dir) {
  let total = 0;
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, entrada.name);
    total += entrada.isDirectory() ? medir(ruta) : fs.statSync(ruta).size;
  }
  return total;
}
