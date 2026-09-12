import { describe, it, expect } from 'vitest';
import { repartirMayorResiduo } from '@core/prorrateo';

const suma = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe('repartirMayorResiduo', () => {
  it('reparte proporcional cuando divide exacto', () => {
    const r = repartirMayorResiduo(1000, [
      { id: 1, base_valor: 1 },
      { id: 2, base_valor: 1 },
    ]);
    expect(r.get(1)).toBe(500);
    expect(r.get(2)).toBe(500);
  });

  it('la suma cuadra exacto aunque no divida', () => {
    const r = repartirMayorResiduo(1000, [
      { id: 1, base_valor: 1 },
      { id: 2, base_valor: 1 },
      { id: 3, base_valor: 1 },
    ]);
    expect(suma(r)).toBe(1000);
    expect([...r.values()].sort()).toEqual([333, 333, 334]);
  });

  it('cuadra para cualquier monto y cualquier cantidad de partes', () => {
    for (let monto = 1; monto <= 5000; monto += 97) {
      for (let n = 2; n <= 9; n++) {
        const bases = Array.from({ length: n }, (_, i) => ({
          id: i + 1,
          base_valor: (i * 37 + 11) % 100,
        }));
        expect(suma(repartirMayorResiduo(monto, bases))).toBe(monto);
      }
    }
  });

  it('reparte parejo cuando todas las bases son cero', () => {
    const r = repartirMayorResiduo(300, [
      { id: 1, base_valor: 0 },
      { id: 2, base_valor: 0 },
      { id: 3, base_valor: 0 },
    ]);
    expect([...r.values()]).toEqual([100, 100, 100]);
  });

  it('una sola base se lleva todo', () => {
    const r = repartirMayorResiduo(777, [{ id: 9, base_valor: 5 }]);
    expect(r.get(9)).toBe(777);
  });

  it('monto cero reparte ceros, no vacío', () => {
    const r = repartirMayorResiduo(0, [
      { id: 1, base_valor: 3 },
      { id: 2, base_valor: 7 },
    ]);
    expect(r.get(1)).toBe(0);
    expect(r.get(2)).toBe(0);
  });

  it('es reproducible: mismos datos, mismo reparto', () => {
    const bases = [
      { id: 1, base_valor: 100 },
      { id: 2, base_valor: 100 },
      { id: 3, base_valor: 100 },
    ];
    const a = repartirMayorResiduo(1000, bases);
    const b = repartirMayorResiduo(1000, bases);
    expect([...a.entries()]).toEqual([...b.entries()]);
  });
});
