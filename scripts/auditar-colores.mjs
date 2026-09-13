/**
 * Audita pares fondo/texto mal emparejados en las DOS apps.
 *
 * Móvil y escritorio comparten la misma paleta (mobile/src/index.css y
 * src/renderer/src/temas.css), así que se auditan igual.
 *
 * Existe porque en la migración a tokens se colaron varias veces errores que
 * el ojo solo detecta probando AMBOS temas, y que en una revisión de código
 * pasan desapercibidos porque cada clase, por separado, se ve razonable:
 *
 *   1. Fondo y texto con el MISMO token. Pasó en cuatro chips de ícono, que
 *      eran un tinte (`bg-rose-500/15`) y quedaron macizos al perder la
 *      opacidad en un reemplazo masivo: ícono del mismo color que su fondo.
 *
 *   2. `--x-texto` fuera de un fondo `--x`. Ese token es el texto que va
 *      ENCIMA del relleno `--x`; sobre una superficie normal queda ilegible
 *      en uno de los dos temas. El blanco sobre el verde daba 2.05 en oscuro.
 *
 *   3. `--inverso-texto` fuera de `--inverso`. El peor caso: como el token se
 *      invierte con el tema, el texto desaparece en LOS DOS. Así quedó
 *      invisible el total del carrito.
 *
 * Corre dentro de `npm run build:mobile`. Si falla, no es un aviso de estilo:
 * hay texto que alguien no va a poder leer.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAICES = [
  ['móvil', path.join(BASE, 'mobile', 'src')],
  ['escritorio', path.join(BASE, 'src', 'renderer', 'src')],
];

const BASES = ['acento', 'peligro', 'alerta', 'exito'];
// `barra` y `serie-N` solo existen en escritorio; se auditan igual.
const TOKEN =
  `(?:${BASES.join('|')}|texto|superficie|borde|fondo|inverso|barra|serie-1|serie-2|serie-3)` +
  `(?:-(?:fuerte|suave|texto|texto-2|2|3))?`;
// La opacidad importa: `bg-acento/10 text-acento` es un TINTE con el color
// encima, perfectamente legible. Solo un fondo OPACO del mismo token que su
// texto es invisible. Se captura el modificador para poder distinguirlos.
const RE_FONDO = new RegExp(`\\bbg-(${TOKEN})(\\/\\d{1,3})?(?![\\w-])`, 'g');
const RE_TEXTO = new RegExp(`\\btext-(${TOKEN})(\\/\\d{1,3})?(?![\\w-])`, 'g');
// Por debajo de esto el fondo es un tinte, no un relleno.
const OPACO_DESDE = 60;
// Cada className, y cada rama de un ternario entre comillas.
const RE_CADENA = /className="([^"]*)"|'([^']*)'|`([^`]*)`/g;

function* archivos(dir) {
  for (const entrada of readdirSync(dir)) {
    const p = path.join(dir, entrada);
    if (statSync(p).isDirectory()) yield* archivos(p);
    else if (p.endsWith('.tsx')) yield p;
  }
}

/** Tokens usados como RELLENO opaco (los tintes no cuentan). */
function fondosOpacos(s) {
  const r = new Set();
  for (const m of s.matchAll(RE_FONDO)) {
    const alfa = m[2] ? Number(m[2].slice(1)) : 100;
    if (alfa >= OPACO_DESDE) r.add(m[1]);
  }
  return [...r];
}
/** Todos los tokens de fondo, con o sin tinte (para el mensaje de error). */
const todosLosFondos = (s) => [...new Set([...s.matchAll(RE_FONDO)].map((m) => m[1]))];
const textosDe = (s) => [...new Set([...s.matchAll(RE_TEXTO)].map((m) => m[1]))];

const fallas = [];
for (const [app, raiz] of RAICES) {
  if (!existsSync(raiz)) continue;
  for (const archivo of archivos(raiz)) {
    const relativo = `${app}: ${path.relative(raiz, archivo).split(path.sep).join('/')}`;
    readFileSync(archivo, 'utf8').split('\n').forEach((linea, i) => {
      for (const m of linea.matchAll(RE_CADENA)) {
        const s = m[1] ?? m[2] ?? m[3] ?? '';
        if (!s.includes('text-')) continue;

        const opacos = fondosOpacos(s);
        const fondos = todosLosFondos(s);
        const textos = textosDe(s);

        for (const t of textos) {
          if (opacos.includes(t)) {
            fallas.push([relativo, i + 1, `invisible: el fondo y el texto son ambos --${t}`, s]);
            continue;
          }
          const esTextoDeRelleno = t.endsWith('-texto') || t.startsWith('inverso-texto');
          if (!esTextoDeRelleno || fondos.length === 0) continue;
          const base = t.startsWith('inverso') ? 'inverso' : t.slice(0, -'-texto'.length);
          if (!fondos.includes(base)) {
            fallas.push([
              relativo,
              i + 1,
              `text-${t} va encima de bg-${base}, pero acá el fondo es: ${fondos.join(', ')}`,
              s,
            ]);
          }
        }
      }
    });
  }
}

if (fallas.length === 0) {
  console.log('✓ colores: ningún par fondo/texto mal emparejado (móvil + escritorio)');
  process.exit(0);
}

console.error(`\n✗ colores: ${fallas.length} par(es) fondo/texto mal emparejado(s)\n`);
for (const [archivo, linea, motivo, clases] of fallas) {
  console.error(`  ${archivo}:${linea}`);
  console.error(`    ${motivo}`);
  console.error(`    ${clases.trim().slice(0, 110)}\n`);
}
process.exit(1);
