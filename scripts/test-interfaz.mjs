/**
 * Corre las pruebas de interfaz de la PWA móvil.
 *
 * Levanta el servidor de desarrollo apuntado al emulador, siembra el decorado
 * con los repositorios de verdad, abre un navegador y aprieta lo que aprieta
 * una persona. Al terminar apaga lo que levantó.
 *
 * Necesita el emulador andando:  npm run emulador
 */
import { spawn, spawnSync } from 'node:child_process';
/**
 * Cierra el servidor y todo lo que lanzó.
 *
 * Con `shell: true`, en Windows `kill()` mata la consola intermedia y deja
 * vivo al proceso de adentro. Ese proceso huérfano quedaba con `dist` como
 * directorio de trabajo, y el siguiente `release:windows` fallaba con EPERM
 * al querer borrar la carpeta: la trampa que documenta CONTEXTO_SESION.
 */
function cerrarServidor(proc) {
  if (!proc.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    proc.kill();
  }
}

import { setTimeout as esperar } from 'node:timers/promises';

const HOST_FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const HOST_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const URL_APP = 'http://localhost:5174';

const entorno = {
  ...process.env,
  FIRESTORE_EMULATOR_HOST: HOST_FIRESTORE,
  FIREBASE_AUTH_EMULATOR_HOST: HOST_AUTH,
};

async function responde(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return r.ok || r.status < 500;
  } catch {
    return false;
  }
}

async function esperarA(url, etiqueta, intentos = 60) {
  for (let i = 0; i < intentos; i++) {
    if (await responde(url)) return true;
    await esperar(1000);
  }
  console.error(`\n  ${etiqueta} no respondió a tiempo en ${url}\n`);
  return false;
}

function correr(comando, opciones = {}) {
  return new Promise((resolve) => {
    const proc = spawn(comando, { shell: true, stdio: 'inherit', env: entorno, ...opciones });
    proc.on('close', (codigo) => resolve(codigo ?? 0));
  });
}

// ---------------------------------------------------------------------------

if (!(await responde(`http://${HOST_FIRESTORE}/`))) {
  console.error(
    `\nEl emulador de Firestore no responde en ${HOST_FIRESTORE}.\n` +
      'Abrí otra terminal y corré:  npm run emulador\n'
  );
  process.exit(1);
}

// El servidor de desarrollo, apuntado al emulador. Se queda vivo hasta el final.
const servidor = spawn('npx vite --config mobile/vite.config.ts', {
  shell: true,
  stdio: 'ignore',
  env: entorno,
});

let codigoSalida = 1;
try {
  if (!(await esperarA(URL_APP, 'El servidor de desarrollo'))) {
    process.exit(1);
  }

  console.log('\n  sembrando el decorado…');
  const siembra = await correr(
    'npx vitest run --config vitest.emulador.config.ts tests/interfaz/sembrar.test.ts --silent'
  );
  if (siembra !== 0) {
    console.error('  no se pudo sembrar el decorado');
    process.exit(1);
  }

  console.log('\n  pruebas de interfaz:\n');
  codigoSalida = await correr('python tests/interfaz/pruebas.py');
} finally {
  cerrarServidor(servidor);
}

process.exit(codigoSalida);
