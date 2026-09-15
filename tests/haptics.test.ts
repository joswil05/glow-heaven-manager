/**
 * La vibración, en los dos sistemas.
 *
 * El error que motivó esto: el módulo entero estaba construido sobre
 * `navigator.vibrate()`, que en iPhone no existe. La comprobación daba falso
 * y cada llamada no hacía nada, sin error ni aviso, así que en un Android se
 * veía perfecto y en un iPhone no pasaba nada.
 *
 * Estas pruebas simulan los dos navegadores y comprueban que cada uno reciba
 * lo que puede recibir. No pueden comprobar que el teléfono vibre de verdad
 * —eso sólo se siente con el aparato en la mano— pero sí que no se vuelva a
 * caer en el camino muerto.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/** Deja el entorno como un Android: existe `navigator.vibrate`. */
function simularAndroid(): { llamadas: (number | number[])[] } {
  const llamadas: (number | number[])[] = [];
  vi.stubGlobal('navigator', {
    vibrate: (patron: number | number[]) => {
      llamadas.push(patron);
      return true;
    },
  });
  vi.stubGlobal('document', {
    createElement: () => ({}), // sin soporte de `switch`
    body: { appendChild: () => {} },
  });
  return { llamadas };
}

/** Deja el entorno como un iPhone con iOS 17.4+: sin vibrate, con `switch`. */
function simularIphoneModerno(): { clicks: number } {
  const contador = { clicks: 0 };
  const creado: Record<string, unknown> = {};

  vi.stubGlobal('navigator', {}); // sin `vibrate`, como Safari
  vi.stubGlobal('document', {
    createElement: () => ({
      // La propiedad existe: así se detecta Safari 17.4 en adelante.
      switch: false,
      style: {},
      setAttribute: () => {},
      click: () => {
        contador.clicks += 1;
      },
      isConnected: true,
      checked: false,
      ...creado,
    }),
    body: { appendChild: () => {} },
  });
  return contador;
}

/** Un iPhone viejo: ni vibrate ni `switch`. */
function simularIphoneViejo(): void {
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('document', {
    createElement: () => ({ style: {}, setAttribute: () => {}, click: () => {} }),
    body: { appendChild: () => {} },
  });
}

/** El módulo cachea la detección, así que hay que recargarlo en cada caso. */
async function cargarHaptics() {
  vi.resetModules();
  return import('../mobile/src/lib/haptics');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('en un Android', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('usa la vibración nativa, con la duración de cada estilo', async () => {
    const { llamadas } = simularAndroid();
    const { haptics } = await cargarHaptics();

    haptics.selection();
    haptics.impact('light');
    haptics.impact('medium');
    haptics.impact('heavy');

    expect(llamadas).toEqual([8, 12, 22, 35]);
  });

  it('manda las secuencias como patrón, no como pulsos sueltos', async () => {
    const { llamadas } = simularAndroid();
    const { haptics } = await cargarHaptics();

    haptics.success();
    haptics.error();

    expect(llamadas[0]).toEqual([12, 45, 22]);
    expect(llamadas[1]).toEqual([30, 40, 30, 40, 45]);
  });

  it('se declara disponible por vibración', async () => {
    simularAndroid();
    const { estadoHaptico } = await cargarHaptics();
    expect(estadoHaptico()).toEqual({ disponible: true, via: 'vibracion' });
  });
});

describe('en un iPhone con iOS 17.4 o más nuevo', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('no se queda mudo: dispara el toque del interruptor', async () => {
    const contador = simularIphoneModerno();
    const { haptics } = await cargarHaptics();

    haptics.impact('heavy');

    expect(contador.clicks, 'en iPhone no se sintió nada').toBeGreaterThan(0);
  });

  it('cada llamada produce su toque', async () => {
    const contador = simularIphoneModerno();
    const { haptics } = await cargarHaptics();

    haptics.selection();
    haptics.impact('light');
    haptics.impact('medium');

    expect(contador.clicks).toBe(3);
  });

  it('una secuencia se imita con varios toques espaciados', async () => {
    vi.useFakeTimers();
    const contador = simularIphoneModerno();
    const { haptics } = await cargarHaptics();

    haptics.error(); // [30, 40, 30, 40, 45] -> tres momentos con vibración
    expect(contador.clicks, 'el primer toque va inmediato').toBe(1);

    vi.advanceTimersByTime(500);
    expect(contador.clicks).toBe(3);
  });

  it('se declara disponible por interruptor', async () => {
    simularIphoneModerno();
    const { estadoHaptico } = await cargarHaptics();
    expect(estadoHaptico()).toEqual({ disponible: true, via: 'interruptor' });
  });
});

describe('en un iPhone viejo', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('no revienta: simplemente no hay vibración', async () => {
    simularIphoneViejo();
    const { haptics, estadoHaptico } = await cargarHaptics();

    expect(() => {
      haptics.selection();
      haptics.impact('heavy');
      haptics.success();
      haptics.error();
    }).not.toThrow();

    expect(estadoHaptico()).toEqual({ disponible: false, via: 'ninguno' });
  });
});
