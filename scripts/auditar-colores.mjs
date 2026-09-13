/**
 * Audita pares fondo/texto mal emparejados en la interfaz móvil.
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
 *      en uno de los dos temas.
 *
 *   3. `--inverso-texto` fuera de `--inverso`. El peor caso: como el token se
 *      invierte con el tema, el texto desaparece en LOS DOS. Así quedó
 *      invisible el total del carrito.
 *
 * Se corre solo en `npm run build:mobile`. Si falla, no es un aviso de estilo:
 * hay texto que alguien no va a poder leer.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'mobile', 'src');

const BASES = ['acento', 'peligro', 'alerta', 'exito'];
const TOKEN = `(?:${BASES.join('|')}|texto|superficie|borde|fondo|inverso)(?:-(?:fuerte|suave|texto|texto-2|2|3))?`;
const RE_FONDO = new RegExp(`\\bbg-(${TOKEN})(?![\\w-])`, 'g');
const RE_TEXTO = new RegExp(`\\btext-(${TOKEN})(?![\\w-])`, 'g');
// Cada className, y cada rama de un ternario entre comillas.
const RE_CADENA = /className="([^"]*)"|'([^']*)'|`([^`]*)`/g;

function* archivos(dir) {
  for (const entrada of readdirSync(dir)) {
    const p = path.join(dir, entrada);
    if (statSync(p).isDirectory()) yield* archivos(p);
    else if (p.endsWith('.tsx')) yield p;
  }
}

const encontrados = (re, s) => [...new Set([...s.matchAll(re)].map((m) => m[1]))];

const fallas = [];
for (const archivo of archivos(RAIZ)) {
  const relativo = path.relative(RAIZ, archivo).replace(/\\/g, '/');
  readFileSync(archivo, 'utf8').split('\n').forEach((linea, i) => {
    for (const m of linea.matchAll(RE_CADENA)) {
      const s = m[1] ?? m[2] ?? m[3] ?? '';
      if (!s.includes('text-')) continue;

      const fondos = encontrados(RE_FONDO, s);
      const textos = encontrados(RE_TEXTO, s);

      for (const t of textos) {
        if (fondos.includes(t)) {
          fallas.push([relativo, i + 1, `invisible: el fondo y el texto son ambos --${t}`, s]);
          continue;
        }
        const esTextoDeRelleno = t.endsWith('-texto') || t.startsWith('inverso-texto');
        if (!esTextoDeRelleno || fondos.length === 0) continue;
        const base = t.startsWith('inverso') ? 'inverso' : t.slice(0, -'-texto'.length);
        if (!fondos.includes(base)) {
          fallas.push([
            relativo, i + 1,
            `text-${t} va encima de bg-${base}, pero acá el fondo es: ${fondos.join(', ')}`,
            s,
          ]);
        }
      }
    }
  });
}

if (fallas.length === 0) {
  console.log('✓ colores: ningún par fondo/texto mal emparejado');
  process.exit(0);
}

console.error(`\n✗ colores: ${fallas.length} par(es) fondo/texto mal emparejado(s)\n`);
for (const [archivo, linea, motivo, clases] of fallas) {
  console.error(`  mobile/src/${archivo}:${linea}`);
  console.error(`    ${motivo}`);
  console.error(`    ${clases.trim().slice(0, 110)}\n`);
}
process.exit(1);
