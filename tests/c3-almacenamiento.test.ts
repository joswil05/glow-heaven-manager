/**
 * Fase C3 · T1: pedirle al teléfono que no borre lo que la app guardó.
 *
 * Sin red, el celular muestra lo último que cargó, y eso vive en el
 * almacenamiento del sitio. Safari puede borrarlo si no se usa por días; el
 * pedido de almacenamiento persistente lo evita donde se concede. No se
 * muestra nada: si no se concede, la app sigue igual.
 */
import { describe, it, expect, vi } from 'vitest';
import { pedirAlmacenamientoPersistente } from '../mobile/src/lib/almacenamiento-movil';

describe('Pedir almacenamiento persistente', () => {
  it('lo pide una vez y devuelve si se concedió', async () => {
    const persist = vi.fn(async () => true);
    expect(await pedirAlmacenamientoPersistente({ storage: { persist } })).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('sin soporte en el navegador no rompe', async () => {
    expect(await pedirAlmacenamientoPersistente({})).toBe(false);
    expect(await pedirAlmacenamientoPersistente({ storage: {} })).toBe(false);
    expect(await pedirAlmacenamientoPersistente(undefined)).toBe(false);
  });

  it('si el pedido falla, sigue sin avisar', async () => {
    const persist = vi.fn(async () => {
      throw new Error('no permitido');
    });
    expect(await pedirAlmacenamientoPersistente({ storage: { persist } })).toBe(false);
  });
});
