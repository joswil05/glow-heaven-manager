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
