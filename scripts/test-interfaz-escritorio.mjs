/**
 * Corre las pruebas de interfaz de la app de escritorio.
 *
 * Construye el paquete, lo sirve como archivos estáticos y abre un navegador
 * contra él. Se prueba lo CONSTRUIDO, no el servidor de desarrollo: es el
 * mismo bundle que termina dentro de la ventana de Windows.
 *
 * No necesita el emulador: en el navegador la app usa su simulador, que es
 * donde viven los datos de esta suite.
 */
import { spawn } from 'node:child_process';
import { setTimeout as esperar } from 'node:timers/promises';

const PUERTO = 5199;
const URL_APP = `http://127.0.0.1:${PUERTO}`;

function correr(comando, opciones = {}) {
  return new Promise((resolve) => {
    const proc = spawn(comando, { shell: true, stdio: 'inherit', ...opciones });
    proc.on('close', (codigo) => resolve(codigo ?? 0));
  });
}

async function responde(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return r.ok || r.status < 500;
  } catch {
    return false;
  }
}

console.log('\n  construyendo el paquete…');
if ((await correr('npx vite build')) !== 0) {
  console.error('  la construcción falló');
  process.exit(1);
}

const servidor = spawn(`python -m http.server ${PUERTO} --bind 127.0.0.1`, {
  shell: true,
  stdio: 'ignore',
  cwd: 'dist',
});

let codigoSalida = 1;
try {
  let vivo = false;
  for (let i = 0; i < 30 && !vivo; i++) {
    vivo = await responde(URL_APP);
    if (!vivo) await esperar(500);
  }
  if (!vivo) {
    console.error(`\n  el servidor no respondió en ${URL_APP}\n`);
    process.exit(1);
  }

  console.log('\n  pruebas de interfaz (escritorio):\n');
  codigoSalida = await correr('python tests/interfaz-escritorio/pruebas.py');
} finally {
  servidor.kill();
}

process.exit(codigoSalida);
