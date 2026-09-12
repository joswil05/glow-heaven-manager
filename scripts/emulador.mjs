/**
 * Levanta el emulador de Firestore con el Java que tenga la máquina.
 *
 * `firebase emulators:start` necesita Java en el PATH. Acá el JDK está en
 * `~/.jdks` (portable, instalado sin permisos de administrador) y no está en
 * el PATH del sistema, así que el comando fallaba con "Could not spawn java"
 * y había que exportar JAVA_HOME a mano cada vez.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PROYECTO = 'glow-heaven-db-app';

/** Busca un JDK en `~/.jdks` si el entorno no trae uno. */
function buscarJava() {
  if (process.env.JAVA_HOME) return process.env.JAVA_HOME;

  const carpeta = path.join(os.homedir(), '.jdks');
  if (!fs.existsSync(carpeta)) return null;

  const candidatos = fs
    .readdirSync(carpeta)
    .map((n) => path.join(carpeta, n))
    .filter((ruta) => fs.existsSync(path.join(ruta, 'bin')))
    .sort()
    .reverse();

  return candidatos[0] ?? null;
}

const javaHome = buscarJava();
const env = { ...process.env };

if (javaHome) {
  env.JAVA_HOME = javaHome;
  env.PATH = `${path.join(javaHome, 'bin')}${path.delimiter}${env.PATH}`;
} else {
  console.warn(
    '\n  No encontré un JDK en ~/.jdks ni JAVA_HOME definido.\n' +
      '  Si el emulador no arranca, instalá Java 21 o exportá JAVA_HOME.\n'
  );
}

// `shell: true` en Windows: sin eso, spawn no resuelve los .cmd de npm.
const proc = spawn(
  `npx firebase emulators:start --only firestore,auth --project ${PROYECTO}`,
  { stdio: 'inherit', shell: true, env }
);

proc.on('close', (code) => process.exit(code ?? 0));
