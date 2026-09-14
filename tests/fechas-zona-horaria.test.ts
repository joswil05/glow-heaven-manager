/**
 * Fase 5: qué día es "hoy" para este negocio.
 *
 * El negocio opera en Nicaragua (America/Managua, UTC-6, sin horario de
 * verano). Todo el código de las dos apps calcula la fecha así:
 *
 *     new Date().toISOString().slice(0, 10)
 *
 * `toISOString()` devuelve UTC. A las 6 de la tarde de Managua, en UTC ya es
 * el día siguiente. Es decir: en el horario en que más se vende, la app
 * escribe y compara contra una fecha que no es la del calendario de acá.
 *
 * Estas pruebas fijan el reloj a instantes concretos y comparan contra la
 * fecha real en Managua, calculada con la base de zonas horarias del sistema.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { hoyISO, mesISO } from '@core/fechas';

/** La fecha del calendario en Nicaragua para un instante dado. */
function fechaEnManagua(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Managua',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

/** El mes del calendario en Nicaragua, como lo arma el panel. */
function mesEnManagua(instante: Date): string {
  return fechaEnManagua(instante).slice(0, 7);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('qué día es hoy para el negocio', () => {
  it('la fecha en Managua y la de la app coinciden a media mañana', () => {
    // 10:00 de Managua = 16:00 UTC. Mismo día en los dos lados.
    const instante = new Date('2026-09-14T16:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(instante);

    expect(hoyISO()).toBe(fechaEnManagua(instante));
  });

  it('a las 7 de la noche la app todavía dice el día correcto', () => {
    // 19:00 de Managua = 01:00 UTC del día siguiente. Es la hora pico de
    // cobro: una venta registrada acá se guarda con la fecha de mañana.
    const instante = new Date('2026-09-15T01:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(instante);

    expect(hoyISO(), `en Managua son las 19:00 del ${fechaEnManagua(instante)}`).toBe(
      fechaEnManagua(instante)
    );
  });

  it('a las 11 de la noche del último día del mes, sigue siendo ese mes', () => {
    // 23:00 del 30 de septiembre en Managua = 05:00 UTC del 1 de octubre.
    // Si el cierre de mes se corre, la ganancia de septiembre pierde la
    // última noche y octubre arranca con ventas que no le tocan.
    const instante = new Date('2026-10-01T05:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(instante);

    const mesApp = mesISO();
    expect(mesApp, `en Managua todavía es ${mesEnManagua(instante)}`).toBe(
      mesEnManagua(instante)
    );
  });

  it('la fecha del documento que se le entrega a la clienta es la de hoy', () => {
    // La factura imprime `venta.fecha`, que sale del mismo cálculo. Una
    // factura fechada mañana es un documento mal emitido.
    const instante = new Date('2026-09-15T03:30:00Z'); // 21:30 en Managua
    vi.useFakeTimers();
    vi.setSystemTime(instante);

    const fechaQueSeGuarda = hoyISO();
    expect(fechaQueSeGuarda).toBe(fechaEnManagua(instante));
  });
});
