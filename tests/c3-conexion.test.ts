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
  ESPERA_SERVIDOR_MS,
  crearConexion,
  textoDatosDe,
  type EntornoConexion,
} from '../mobile/src/lib/conexion-movil';

function entornoFalso(inicial: { enLinea: boolean; ahora?: number; guardado?: Record<string, string> }) {
  let enLinea = inicial.enLinea;
  let ahora = inicial.ahora ?? 0;
  const guardado: Record<string, string> = { ...(inicial.guardado ?? {}) };
  const oyentes: Record<string, Set<() => void>> = { online: new Set(), offline: new Set() };
  let pendientes: { cuando: number; fn: () => void }[] = [];
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
    programar(fn, ms) {
      const p = { cuando: ahora + ms, fn };
      pendientes.push(p);
      return () => {
        pendientes = pendientes.filter((x) => x !== p);
      };
    },
  };
  return {
    entorno,
    guardado,
    avanzar(ms: number) {
      ahora += ms;
      const vencidos = pendientes.filter((p) => p.cuando <= ahora);
      pendientes = pendientes.filter((p) => p.cuando > ahora);
      vencidos.forEach((p) => p.fn());
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

describe('Cuando el navegador dice que hay red y no la hay', () => {
  // Un Wi-Fi sin internet o la señal débil: `navigator.onLine` dice que sí,
  // y Firestore sigue sirviendo desde la caché. Si dura más que la espera,
  // es sin conexión; menos que eso es el arranque normal, mientras conecta.
  it('Firestore en la caché más que la espera: sin conexión', () => {
    const f = entornoFalso({ enLinea: true });
    const c = crearConexion(f.entorno);
    c.desdeCache();
    f.avanzar(ESPERA_SERVIDOR_MS - 1);
    expect(c.estado().enLinea).toBe(true);
    f.avanzar(1);
    expect(c.estado().enLinea).toBe(false);
  });

  it('si el servidor confirma antes, no parpadea', () => {
    const f = entornoFalso({ enLinea: true });
    const c = crearConexion(f.entorno);
    const vistos: boolean[] = [];
    c.suscribir((e) => vistos.push(e.enLinea));
    c.desdeCache();
    f.avanzar(500);
    c.sincronizado();
    f.avanzar(ESPERA_SERVIDOR_MS);
    expect(vistos.every(Boolean)).toBe(true);
  });

  it('al confirmar el servidor, vuelve a haber conexión', () => {
    const f = entornoFalso({ enLinea: true });
    const c = crearConexion(f.entorno);
    c.desdeCache();
    f.avanzar(ESPERA_SERVIDOR_MS);
    c.sincronizado();
    expect(c.estado().enLinea).toBe(true);
  });

  it('con el evento online pero Firestore todavía en la caché, sigue sin conexión', () => {
    const f = entornoFalso({ enLinea: false });
    const c = crearConexion(f.entorno);
    c.desdeCache();
    f.avanzar(ESPERA_SERVIDOR_MS);
    f.disparar('online');
    expect(c.estado().enLinea).toBe(false);
    c.sincronizado();
    expect(c.estado().enLinea).toBe(true);
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
