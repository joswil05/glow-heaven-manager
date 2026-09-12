/**
 * Corre las pruebas contra el emulador de Firestore.
 *
 * Existe para no depender de `cross-env`: pasar una variable de entorno
 * antes del comando no funciona igual en Windows que en el resto.
 */
import { spawn } from 'node:child_process';

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const HOST_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

const vivo = await fetch(`http://${HOST}/`, { signal: AbortSignal.timeout(2500) })
  .then((r) => r.ok)
  .catch(() => false);

if (!vivo) {
  console.error(
    `\nEl emulador de Firestore no responde en ${HOST}.\n` +
      'Abrí otra terminal y corré:  npm run emulador\n'
  );
  process.exit(1);
}

// `shell: true` en Windows: sin eso, spawn no sabe resolver los .cmd de npm.
const proc = spawn('npx vitest run --config vitest.emulador.config.ts', {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    FIRESTORE_EMULATOR_HOST: HOST,
    FIREBASE_AUTH_EMULATOR_HOST: HOST_AUTH,
  },
});

proc.on('close', (code) => process.exit(code ?? 0));
