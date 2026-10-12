/**
 * Fase C3 · T2: saber si hay conexión y de cuándo son los datos.
 *
 * Sin red, la franja dice "Sin conexión · datos de las 10:42". Esa hora es el
 * último momento en que Firestore confirmó datos del servidor, y tiene que
 * sobrevivir a cerrar la app: se abre sin señal y la hora sigue ahí.
 */
import { describe, it, expect } from 'vitest';
import {
  CLAVE_DATOS_DE,
  crearConexion,
  textoDatosDe,
  type EntornoConexion,
} from '../mobile/src/lib/conexion-movil';

function entornoFalso(inicial: { enLinea: boolean; ahora?: number; guardado?: Record<string, string> }) {
  let enLinea = inicial.enLinea;
  let ahora = inicial.ahora ?? 0;
  const guardado: Record<string, string> = { ...(inicial.guardado ?? {}) };
  const oyentes: Record<string, Set<() => void>> = { online: new Set(), offline: new Set() };
  const entorno: EntornoConexion = {
    enLinea: () => enLinea,
    escuchar(evento, fn) {
      oyentes[evento].add(fn);
      return () => oyentes[evento].delete(fn);
    },
    leer: (clave) => guardado[clave] ?? null,
    guardar: (clave, valor) => {
      guardado[clave] = valor;
    },
    ahora: () => ahora,
  };
  return {
    entorno,
    guardado,
    avanzar(ms: number) {
      ahora += ms;
    },
    disparar(evento: 'online' | 'offline') {
      enLinea = evento === 'online';
      oyentes[evento].forEach((fn) => fn());
    },
    oyentes: () => oyentes.online.size + oyentes.offline.size,
  };
}

describe('El estado de la conexión', () => {
  it('arranca sin red con la hora que quedó guardada', () => {
    const f = entornoFalso({ enLinea: false, guardado: { [CLAVE_DATOS_DE]: '1760000000000' } });
    expect(crearConexion(f.entorno).estado()).toEqual({ enLinea: false, datosDe: 1760000000000 });
  });

  it('al cortarse la red estando sincronizada, guarda ese instante', () => {
    const f = entornoFalso({ enLinea: true, ahora: 1000 });
    const c = crearConexion(f.entorno);
    c.sincronizado();
    f.avanzar(60_000);
    f.disparar('offline');
    expect(c.estado()).toEqual({ enLinea: false, datosDe: 61_000 });
    expect(f.guardado[CLAVE_DATOS_DE]).toBe('61000');
  });

  it('si Firestore pasa a la caché estando sincronizada, también guarda ese instante', () => {
    const f = entornoFalso({ enLinea: true, ahora: 5000 });
    const c = crearConexion(f.entorno);
    c.sincronizado();
    f.avanzar(1000);
    c.desdeCache();
    expect(c.estado().datosDe).toBe(6000);
  });

  it('si nunca hubo datos del servidor, no hay hora', () => {
    const f = entornoFalso({ enLinea: true });
    const c = crearConexion(f.entorno);
    f.disparar('offline');
    expect(c.estado()).toEqual({ enLinea: false, datosDe: null });
  });

  it('servir desde la caché sin haber estado sincronizada no cambia la hora', () => {
    const f = entornoFalso({ enLinea: false, ahora: 9000, guardado: { [CLAVE_DATOS_DE]: '4000' } });
    const c = crearConexion(f.entorno);
    c.desdeCache();
    expect(c.estado().datosDe).toBe(4000);
  });

  it('una hora guardada que no es número se ignora', () => {
    const f = entornoFalso({ enLinea: false, guardado: { [CLAVE_DATOS_DE]: 'basura' } });
    expect(crearConexion(f.entorno).estado().datosDe).toBeNull();
  });

  it('avisa a quien escucha al cambiar, y deja de avisar al desuscribirse', () => {
    const f = entornoFalso({ enLinea: true });
    const c = crearConexion(f.entorno);
    const vistos: boolean[] = [];
    const quitar = c.suscribir((e) => vistos.push(e.enLinea));
    f.disparar('offline');
    f.disparar('online');
    quitar();
    f.disparar('offline');
    expect(vistos).toEqual([false, true]);
  });

  it('detener deja de escuchar los eventos del navegador', () => {
    const f = entornoFalso({ enLinea: true });
    const c = crearConexion(f.entorno);
    expect(f.oyentes()).toBe(2);
    c.detener();
    expect(f.oyentes()).toBe(0);
  });
});

describe('Cómo se dice de cuándo son los datos', () => {
  const ahora = new Date(2026, 9, 11, 17, 30);
  const ms = (...p: [number, number, number, number, number]) => new Date(...p).getTime();

  it('de hoy: la hora', () => {
    expect(textoDatosDe(ms(2026, 9, 11, 10, 42), ahora)).toBe('de las 10:42');
    expect(textoDatosDe(ms(2026, 9, 11, 9, 5), ahora)).toBe('de las 9:05');
  });

  it('la una es singular', () => {
    expect(textoDatosDe(ms(2026, 9, 11, 1, 15), ahora)).toBe('de la 1:15');
  });

  it('de ayer', () => {
    expect(textoDatosDe(ms(2026, 9, 10, 18, 5), ahora)).toBe('de ayer a las 18:05');
  });

  it('más viejos: el día y el mes', () => {
    expect(textoDatosDe(ms(2026, 9, 3, 18, 5), ahora)).toBe('del 3 oct a las 18:05');
  });

  it('de otro año, con el año', () => {
    expect(textoDatosDe(ms(2025, 11, 30, 8, 0), ahora)).toBe('del 30 dic 2025 a las 8:00');
  });
});
