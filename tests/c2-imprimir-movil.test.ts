/**
 * Fase C2 · T6: "Guardar PDF" en el celular abre la impresión del sistema
 * desde un iframe oculto (el mismo recorrido de DocumentoSheet).
 *
 * La revisión del 10/10 encontró que, si el documento nunca terminaba de
 * cargar, el iframe quedaba colgado y nadie avisaba; y que la hoja no tenía
 * cómo saber cuándo terminaba la impresión para bloquear un doble toque.
 * Las pruebas usan un `document` mínimo: corren en Node, sin navegador.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imprimirDocumento } from '../mobile/src/lib/imprimir-documento';

interface IframeFalso {
  parentNode: { removeChild: (n: unknown) => void } | null;
  style: Record<string, string>;
  onload: null | (() => void);
  setAttribute: () => void;
  contentDocument: { readyState: string; open: () => void; write: (s: string) => void; close: () => void };
  contentWindow: { focus: () => void; print: () => void };
}

let iframes: IframeFalso[] = [];
let print: ReturnType<typeof vi.fn>;

function instalarDocumento(readyState: string, falla = false) {
  iframes = [];
  print = vi.fn(() => {
    if (falla) throw new Error('sin impresión');
  });
  const body = {
    appendChild(n: IframeFalso) {
      n.parentNode = body;
      iframes.push(n);
    },
    removeChild(n: IframeFalso) {
      n.parentNode = null;
    },
  };
  vi.stubGlobal('document', {
    body,
    createElement: () => ({
      parentNode: null,
      style: {},
      onload: null,
      setAttribute: () => {},
      contentDocument: { readyState, open: () => {}, write: () => {}, close: () => {} },
      contentWindow: { focus: () => {}, print },
    }),
  });
  vi.stubGlobal('window', { setTimeout, clearTimeout });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Guardar PDF en el celular', () => {
  it('con el documento listo abre la impresión una vez, avisa que terminó y después quita el iframe', () => {
    instalarDocumento('complete');
    const onError = vi.fn();
    const onFin = vi.fn();
    imprimirDocumento('<p>Proforma</p>', onError, onFin);
    vi.advanceTimersByTime(400);
    expect(print).toHaveBeenCalledTimes(1);
    expect(onFin).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(iframes[0].parentNode).toBeNull();
  });

  it('si el documento nunca termina de cargar, quita el iframe, avisa y termina', () => {
    instalarDocumento('loading');
    const onError = vi.fn();
    const onFin = vi.fn();
    imprimirDocumento('<p>Proforma</p>', onError, onFin);
    vi.advanceTimersByTime(30_000);
    expect(print).not.toHaveBeenCalled();
    expect(iframes[0].parentNode).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it('si la impresión falla, quita el iframe, avisa una vez y termina', () => {
    instalarDocumento('complete', true);
    const onError = vi.fn();
    const onFin = vi.fn();
    imprimirDocumento('<p>Proforma</p>', onError, onFin);
    vi.advanceTimersByTime(30_000);
    expect(iframes[0].parentNode).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onFin).toHaveBeenCalledTimes(1);
  });

  it('una carga tardía, después de rendirse, no abre la impresión', () => {
    instalarDocumento('loading');
    const onError = vi.fn();
    imprimirDocumento('<p>Proforma</p>', onError, vi.fn());
    vi.advanceTimersByTime(30_000);
    iframes[0].onload?.();
    vi.advanceTimersByTime(1_000);
    expect(print).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
