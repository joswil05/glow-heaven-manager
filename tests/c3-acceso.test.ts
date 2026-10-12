/**
 * Fase C3 · T4: entrar sin señal.
 *
 * Hoy, sin red, cualquier cuenta que no sea la de la dueña se queda en "No
 * pudimos comprobar tu acceso", aunque haya entrado mil veces. Ahora la app
 * recuerda, por cuenta, que ya tuvo acceso, y sin red la deja pasar. Con red
 * se pregunta como siempre: "sin permiso" borra el recuerdo.
 *
 * Es una comprobación de interfaz: las reglas de Firestore siguen decidiendo
 * arriba, y sin red sólo se ve lo que ya estaba guardado en este teléfono.
 */
import { describe, it, expect } from 'vitest';
import {
  accesoRecordado,
  decidirAcceso,
  olvidarAcceso,
  recordarAcceso,
} from '../mobile/src/lib/acceso-movil';

function almacenFalso(): Storage {
  const datos = new Map<string, string>();
  return {
    get length() {
      return datos.size;
    },
    clear: () => datos.clear(),
    getItem: (k) => datos.get(k) ?? null,
    key: (i) => [...datos.keys()][i] ?? null,
    removeItem: (k) => void datos.delete(k),
    setItem: (k, v) => void datos.set(k, String(v)),
  };
}

function almacenRoto(): Storage {
  const falla = () => {
    throw new Error('almacenamiento bloqueado');
  };
  return { length: 0, clear: falla, getItem: falla, key: falla, removeItem: falla, setItem: falla };
}

describe('Qué hacer con el acceso', () => {
  it('sin red y con el acceso recordado, entra sin preguntar', () => {
    expect(decidirAcceso({ enLinea: false, recordado: true, resultado: null })).toBe('autorizado');
  });

  it('sin red y sin recuerdo, pregunta: la dueña pasa sola, las demás prueban la caché', () => {
    expect(decidirAcceso({ enLinea: false, recordado: false, resultado: null })).toBe('preguntar');
    expect(decidirAcceso({ enLinea: false, recordado: false, resultado: 'sin-conexion' })).toBe('sin-conexion');
  });

  it('con red y sin respuesta todavía, pregunta', () => {
    expect(decidirAcceso({ enLinea: true, recordado: true, resultado: null })).toBe('preguntar');
    expect(decidirAcceso({ enLinea: true, recordado: false, resultado: null })).toBe('preguntar');
  });

  it('si no se pudo preguntar, el recuerdo decide', () => {
    expect(decidirAcceso({ enLinea: true, recordado: true, resultado: 'sin-conexion' })).toBe('autorizado');
    expect(decidirAcceso({ enLinea: true, recordado: false, resultado: 'sin-conexion' })).toBe('sin-conexion');
  });

  it('una respuesta del servidor manda sobre el recuerdo', () => {
    expect(decidirAcceso({ enLinea: true, recordado: true, resultado: 'sin-permiso' })).toBe('sin-permiso');
    expect(decidirAcceso({ enLinea: true, recordado: false, resultado: 'autorizado' })).toBe('autorizado');
  });
});

describe('El recuerdo del acceso, por cuenta', () => {
  it('se recuerda, se lee y se olvida', () => {
    const a = almacenFalso();
    expect(accesoRecordado('uid-1', a)).toBe(false);
    recordarAcceso('uid-1', a);
    expect(accesoRecordado('uid-1', a)).toBe(true);
    expect(accesoRecordado('uid-2', a)).toBe(false);
    olvidarAcceso('uid-1', a);
    expect(accesoRecordado('uid-1', a)).toBe(false);
  });

  it('con el almacenamiento bloqueado no rompe y no recuerda', () => {
    const a = almacenRoto();
    expect(() => recordarAcceso('uid-1', a)).not.toThrow();
    expect(() => olvidarAcceso('uid-1', a)).not.toThrow();
    expect(accesoRecordado('uid-1', a)).toBe(false);
  });
});
