/**
 * Fase C4 · T2: la cola de lo que se hizo sin señal.
 *
 * La parte pura: el orden de llegada, cuál sube después, sacar una sola, y
 * qué pasa con la que quedó a mitad de subir cuando se cerró la app.
 */
import { describe, it, expect } from 'vitest';
import { encolar, marcar, quitar, retomar, siguiente, type EnCola } from '../mobile/src/lib/cola';

function enCola(id: string, estado: EnCola['estado'] = 'PENDIENTE'): EnCola {
  return {
    operacion_id: id,
    grupo: `grupo-${id}`,
    creada_en: '2026-10-11T18:00:00.000Z',
    operacion: {
      tipo: 'ABONO',
      input: { venta_id: 7, fecha: '2026-10-11', monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' },
    },
    estado,
    intentos: 0,
    resumen: { titulo: 'Abono', detalle: 'V-0007', monto_usd_cents: 1000 },
  };
}

const ids = (cola: EnCola[]) => cola.map((o) => o.operacion_id);

describe('La cola de lo hecho sin señal', () => {
  it('encolar conserva el orden de llegada y no repite la misma operación', () => {
    let cola: EnCola[] = [];
    cola = encolar(cola, enCola('a'));
    cola = encolar(cola, enCola('b'));
    cola = encolar(cola, enCola('c'));
    cola = encolar(cola, enCola('b'));
    expect(ids(cola)).toEqual(['a', 'b', 'c']);
  });

  it('siguiente da la pendiente más vieja e ignora las que hay que revisar y las ya subidas', () => {
    expect(siguiente([enCola('a', 'SUBIDA'), enCola('b', 'REVISAR'), enCola('c'), enCola('d')])?.operacion_id).toBe('c');
    expect(siguiente([enCola('a', 'SUBIDA'), enCola('b', 'REVISAR')])).toBeNull();
    expect(siguiente([])).toBeNull();
  });

  it('marcar cambia sólo esa operación y no toca la cola de antes', () => {
    const cola = [enCola('a'), enCola('b')];
    const nueva = marcar(cola, 'b', { estado: 'REVISAR', motivo: 'No hay suficientes unidades' });
    expect(nueva[1]).toMatchObject({ operacion_id: 'b', estado: 'REVISAR', motivo: 'No hay suficientes unidades' });
    expect(nueva[0]).toBe(cola[0]);
    expect(cola[1].estado).toBe('PENDIENTE');
  });

  it('quitar saca sólo esa', () => {
    const cola = [enCola('a'), enCola('b'), enCola('c')];
    expect(ids(quitar(cola, 'b'))).toEqual(['a', 'c']);
    expect(ids(quitar(cola, 'z'))).toEqual(['a', 'b', 'c']);
  });

  it('al abrir la app, la que quedó subiendo vuelve a pendiente y las ya subidas se van', () => {
    // Se cerró a mitad de una subida: no se sabe si llegó. Vuelve a la fila;
    // si había llegado, la marca de Firestore devuelve lo mismo.
    const abierta = retomar([enCola('a', 'SUBIDA'), enCola('b', 'SUBIENDO'), enCola('c', 'REVISAR'), enCola('d')]);
    expect(abierta.map((o) => [o.operacion_id, o.estado])).toEqual([
      ['b', 'PENDIENTE'],
      ['c', 'REVISAR'],
      ['d', 'PENDIENTE'],
    ]);
  });
});
