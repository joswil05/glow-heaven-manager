/**
 * Fase C3 · T5: sin red, los parámetros nunca se inventan.
 *
 * `getParametros` crea los valores por defecto cuando no encuentra el
 * documento: es lo que deja andando una base nueva. Sin red eso es un
 * peligro: el celular que todavía no guardó los parámetros no los encuentra
 * en su caché, la escritura queda en cola y, al volver la señal, pisa la tasa,
 * el nombre y el teléfono reales del negocio. Sin red tiene que fallar, no
 * escribir.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { reiniciarFirestoreFalso, volcar } from './firestore-fake';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';

beforeEach(() => {
  reiniciarFirestoreFalso();
  Parametros.invalidarCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Los parámetros sin red', () => {
  it('sin red y sin el documento, falla y no escribe nada', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(Parametros.getParametros()).rejects.toThrow('sin-conexion');
    expect(volcar('parametros')).toEqual([]);
  });

  it('con red y sin el documento, crea los valores por defecto como siempre', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const p = await Parametros.getParametros();
    expect(p.tax_bp).toBe(700);
    expect(volcar('parametros')).toHaveLength(1);
  });

  it('en Windows, sin navegador, los crea como siempre', async () => {
    const p = await Parametros.getParametros();
    expect(p.tarifa_envio_cents_lb).toBe(700);
    expect(volcar('parametros')).toHaveLength(1);
  });
});
