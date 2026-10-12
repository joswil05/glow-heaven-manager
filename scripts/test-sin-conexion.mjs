/**
 * Corre las pruebas sin red de la PWA móvil (C3).
 *
 * No usa el servidor de desarrollo, por dos motivos: en desarrollo no hay
 * service worker (así que "abrir sin red" no se puede probar), y el cliente
 * de Vite recarga la página cuando vuelve la conexión. Acá se arma el build
 * de producción apuntado al emulador y se sirve con `vite preview`.
 *
 * Ese build va a OTRA carpeta, `dist-mobile-pruebas`, a propósito: lleva el
 * emulador y la puerta de pruebas adentro, y nunca se tiene que publicar
 * (`desplegar-movil.mjs` sólo lee `dist-mobile`).
 *
 * Necesita el emulador andando:  npm run emulador
 */
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as esperar } from 'node:timers/promises';

const HOST_FIRESTORE = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const HOST_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const PUERTO = 5175;
const URL_APP = `http://localhost:${PUERTO}`;
const SALIDA = resolve('dist-mobile-pruebas');

const entorno = {
  ...process.env,
  FIRESTORE_EMULATOR_HOST: HOST_FIRESTORE,
  FIREBASE_AUTH_EMULATOR_HOST: HOST_AUTH,
  URL_APP_PRUEBAS: URL_APP,
};

/** Igual que en test-interfaz.mjs: en Windows `kill()` deja huérfanos. */
function cerrarServidor(proc) {
  if (!proc.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    proc.kill();
  }
}

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
  return new Promise((listo) => {
    const proc = spawn(comando, { shell: true, stdio: 'inherit', env: entorno, ...opciones });
    proc.on('close', (codigo) => listo(codigo ?? 0));
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

console.log('\n  armando el build de pruebas…');
const armado = await correr(
  `npx vite build --config mobile/vite.config.ts --outDir "${SALIDA}" --emptyOutDir --logLevel warn`
);
if (armado !== 0) {
  console.error('  no se pudo armar el build de pruebas');
  process.exit(1);
}

const servidor = spawn(
  `npx vite preview --config mobile/vite.config.ts --outDir "${SALIDA}" --port ${PUERTO} --strictPort`,
  { shell: true, stdio: 'ignore', env: entorno }
);

let codigoSalida = 1;
try {
  if (!(await esperarA(URL_APP, 'El servidor del build'))) {
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

  console.log('\n  pruebas sin red:\n');
  codigoSalida = await correr('python tests/interfaz/sin_conexion.py');
} finally {
  cerrarServidor(servidor);
}

process.exit(codigoSalida);
