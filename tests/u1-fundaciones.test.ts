/**
 * U1 · Fundaciones del celular (docs/superpowers/plans/2026-10-12-u1-fundaciones.md).
 *
 * Lo que se puede comprobar sin abrir la app: de dónde sale la letra.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import tailwind from '../mobile/tailwind.config.js';

const raiz = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(raiz, ruta), 'utf8');

describe('T1 · la letra del sistema', () => {
  it('la app no pide letras a Google: ni hoja de estilos ni preconexión', () => {
    const html = leer('mobile/index.html');
    expect(html).not.toMatch(/<link[^>]+href="https:\/\/fonts\.googleapis\.com\/css2/);
    expect(html).not.toMatch(/<link[^>]+rel="preconnect"[^>]+fonts\.g/);
  });

  it('sus estilos empiezan por la letra del sistema y no nombran Plus Jakarta Sans', () => {
    const css = leer('mobile/src/index.css');
    expect(css).not.toContain('Plus Jakarta Sans');
    expect(css).toMatch(/font-family:\s*-apple-system/);
    const sans = (tailwind.theme?.extend?.fontFamily as { sans: string[] }).sans;
    expect(sans[0]).toBe('-apple-system');
    expect(sans.join(' ')).not.toContain('Plus Jakarta Sans');
  });
});

/** Los tokens `--nombre: R G B;` de un bloque del CSS (`:root` o `.dark`). */
function tokens(bloque: 'claro' | 'oscuro'): Record<string, [number, number, number]> {
  const css = leer('mobile/src/index.css');
  const inicio = css.indexOf(bloque === 'claro' ? ':root {' : '.dark {');
  const cuerpo = css.slice(inicio, css.indexOf('\n}', inicio));
  const salida: Record<string, [number, number, number]> = {};
  for (const m of cuerpo.matchAll(/--([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)\s*;/g)) {
    salida[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return salida;
}

/** Contraste WCAG 2 entre dos colores. */
function contraste(a: [number, number, number], b: [number, number, number]): number {
  const luz = (c: [number, number, number]) => {
    const [r, g, bl] = c.map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [l1, l2] = [luz(a), luz(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe.each(['claro', 'oscuro'] as const)('T2 · la paleta en %s', (tema) => {
  const t = tokens(tema);
  const par = (texto: string, fondo: string) => [texto, fondo, contraste(t[texto], t[fondo])] as const;

  it('los neutros son cálidos: el rojo pesa más que el azul', () => {
    for (const nombre of ['fondo', 'superficie-2', 'borde', 'texto-2']) {
      const [r, , b] = t[nombre];
      expect(r, nombre).toBeGreaterThan(b);
    }
  });

  it('todo texto llega a 4,5:1 sobre lo que lo lleva', () => {
    const pares = [
      ...['texto', 'texto-2', 'texto-3'].flatMap((x) => ['fondo', 'superficie', 'superficie-2'].map((f) => par(x, f))),
      ...['acento', 'acento-fuerte', 'alerta-fuerte', 'peligro', 'peligro-fuerte', 'exito-fuerte'].map((x) => par(x, 'superficie')),
      ...['acento', 'exito', 'alerta', 'peligro'].map((x) => par(`${x}-texto`, x)),
      ...['acento', 'exito', 'alerta', 'peligro'].map((x) => par(`${x}-fuerte`, `${x}-suave`)),
      par('inverso-texto', 'inverso'),
    ];
    const bajos = pares.filter(([, , c]) => c < 4.5).map(([x, f, c]) => `${x} sobre ${f}: ${c.toFixed(2)}`);
    expect(bajos).toEqual([]);
  });

  it('la marca tiene su token, sólo para el logo y los documentos', () => {
    expect(t.marca).toBeDefined();
  });
});
