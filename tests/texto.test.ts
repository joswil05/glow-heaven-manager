/**
 * Buscar 'maria' tiene que encontrar a María.
 *
 * Es el defecto más silencioso que puede tener un buscador: la clienta está
 * guardada, aparece en la lista, y al escribir su nombre la pantalla dice que
 * no hay resultados. Nadie sospecha del acento; se sospecha de los datos.
 */
import { describe, it, expect } from 'vitest';
import { normalizar, contiene, algunoContiene } from '../src/core/texto';

describe('buscar sin pelearse con los acentos', () => {
  it('encuentra a María escribiendo maria', () => {
    expect(contiene('María López', 'maria')).toBe(true);
  });

  it('también al revés: escribir con tilde encuentra lo guardado sin tilde', () => {
    expect(contiene('Maria Lopez', 'maría')).toBe(true);
  });

  it('la ñ no esconde a nadie: nunez encuentra a Núñez', () => {
    expect(contiene('Ana Núñez', 'nunez')).toBe(true);
    expect(contiene('Ana Nunez', 'núñez')).toBe(true);
  });

  it('ignora mayúsculas y espacios de sobra', () => {
    expect(contiene('José Ramírez', '  JOSE  ')).toBe(true);
  });

  it('sigue siendo una búsqueda, no un comodín: lo que no está no aparece', () => {
    expect(contiene('María López', 'beatriz')).toBe(false);
    expect(contiene('María López', 'lopezz')).toBe(false);
  });

  it('una búsqueda vacía no filtra nada', () => {
    expect(contiene('cualquier cosa', '')).toBe(true);
    expect(contiene('cualquier cosa', '   ')).toBe(true);
  });

  it('un campo vacío no rompe ni coincide de casualidad', () => {
    expect(contiene(null, 'maria')).toBe(false);
    expect(contiene(undefined, 'maria')).toBe(false);
    expect(contiene('', 'maria')).toBe(false);
  });

  it('busca en varias columnas a la vez', () => {
    expect(algunoContiene(['V-0007', 'María López', null], 'maria')).toBe(true);
    expect(algunoContiene(['V-0007', 'María López', null], 'v-0007')).toBe(true);
    expect(algunoContiene(['V-0007', 'María López', null], 'jose')).toBe(false);
  });

  it('no toca el texto original: normalizar es sólo para comparar', () => {
    const nombre = 'María López';
    expect(normalizar(nombre)).toBe('maria lopez');
    expect(nombre).toBe('María López');
  });

  it('los teléfonos y códigos siguen funcionando igual', () => {
    expect(contiene('88887777', '8888')).toBe(true);
    expect(contiene('V-0012', 'v-00')).toBe(true);
  });
});
