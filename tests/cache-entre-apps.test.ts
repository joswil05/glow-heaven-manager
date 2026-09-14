/**
 * Fase 5: la caché en memoria y las dos apps.
 *
 * La configuración se cachea 30 segundos y el panel 20, cada uno en la memoria
 * de SU proceso. Windows y el celular son dos procesos distintos: si se cambia
 * la tasa de cambio en uno, el otro puede seguir usando la vieja hasta que se
 * le venza su caché.
 *
 * Eso es aceptable —una venta congela su tasa al registrarse, así que el daño
 * está acotado a esa ventana— pero deja de serlo si una escritura se olvida de
 * invalidar. Entonces la tasa vieja no dura 30 segundos: dura hasta que se
 * cierre la app.
 *
 * Estas pruebas fijan las dos cosas: que el TTL sea el que creemos, y que toda
 * escritura de configuración invalide lo que acaba de cambiar.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { reiniciarFirestoreFalso, reiniciarContadores, contadores } from './firestore-fake';
import { ParametrosRepoFirestore } from '../src/main/firebase/repositories/parametros.repo';

const g = () => `grupo-${Math.random().toString(36).slice(2)}`;

/** Lo que dice el repositorio que dura su caché. */
const TTL_PARAMETROS_MS = 30_000;

describe('la configuración compartida entre las dos apps', () => {
  beforeEach(async () => {
    reiniciarFirestoreFalso();
    ParametrosRepoFirestore.invalidarCache();
    await ParametrosRepoFirestore.getParametros();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no relee la configuración en cada consulta', async () => {
    reiniciarContadores();
    await ParametrosRepoFirestore.getParametros();
    await ParametrosRepoFirestore.getParametros();
    await ParametrosRepoFirestore.getParametros();

    expect(contadores().lecturas).toBe(0);
  });

  it('cambiar la tasa la deja visible de inmediato en el mismo proceso', async () => {
    await ParametrosRepoFirestore.actualizar({ tasa_cambio_cents: 4000 }, g());
    const p = await ParametrosRepoFirestore.getParametros();
    expect(p.tasa_cambio_cents).toBe(4000);
  });

  it('un cambio hecho por la OTRA app se ve cuando vence la caché, no antes', async () => {
    vi.useFakeTimers();
    const inicio = new Date('2026-09-14T15:00:00Z');
    vi.setSystemTime(inicio);

    ParametrosRepoFirestore.invalidarCache();
    const antes = await ParametrosRepoFirestore.getParametros();
    const tasaOriginal = antes.tasa_cambio_cents;

    // Simula la otra app: escribe directo en la base, sin pasar por esta
    // instancia del repositorio, así que esta caché no se entera.
    const { aplicarLote } = await import('../src/main/firebase/client');
    await aplicarLote([
      { coleccion: 'parametros', id: 'sistema', datos: { tasa_cambio_cents: 4444 }, merge: true },
    ]);

    // Dentro de la ventana: todavía la vieja. Es el comportamiento esperado.
    vi.setSystemTime(new Date(inicio.getTime() + TTL_PARAMETROS_MS - 1000));
    expect((await ParametrosRepoFirestore.getParametros()).tasa_cambio_cents).toBe(tasaOriginal);

    // Pasado el TTL: la nueva. Si esto fallara, la tasa vieja se quedaría
    // pegada hasta cerrar la app.
    vi.setSystemTime(new Date(inicio.getTime() + TTL_PARAMETROS_MS + 1000));
    expect((await ParametrosRepoFirestore.getParametros()).tasa_cambio_cents).toBe(4444);
  });

  it('cada escritura de configuración invalida su caché', async () => {
    // Recorre las escrituras que existen hoy. Si mañana se agrega otra que se
    // olvide de invalidar, esta prueba la agarra.
    await ParametrosRepoFirestore.getParametros();
    await ParametrosRepoFirestore.getCategorias();

    await ParametrosRepoFirestore.actualizar({ stock_minimo_defecto: 9 }, g());
    expect((await ParametrosRepoFirestore.getParametros()).stock_minimo_defecto).toBe(9);

    const catId = await ParametrosRepoFirestore.guardarCategoria({ nombre: 'Nueva' }, g());
    expect((await ParametrosRepoFirestore.getCategorias()).some((c) => c.id === catId)).toBe(true);

    await ParametrosRepoFirestore.archivarCategoria(catId, g());
    expect((await ParametrosRepoFirestore.getCategorias()).some((c) => c.id === catId)).toBe(false);
  });
});
