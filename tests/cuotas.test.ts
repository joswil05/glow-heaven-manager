import { describe, it, expect } from 'vitest';
import { repartirEnCuotas, reescalarCuotas } from '@core/cuotas';

const cuota = (numero: number, monto: number, fecha: string, pagado = 0) => ({
  id: numero,
  venta_id: 1,
  numero,
  fecha_vencimiento: fecha,
  monto_usd_cents: monto,
  pagado_usd_cents: pagado,
});

describe('lo pagado, cuota por cuota', () => {
  it('se aplica en orden, sin pasarse de cada cuota', () => {
    const r = repartirEnCuotas([cuota(1, 1000, '2026-10-01'), cuota(2, 1000, '2026-10-15')], 1500);
    expect(r.map((c) => c.pagado_usd_cents)).toEqual([1000, 500]);
  });
});

describe('una venta corregida reparte sus cuotas de nuevo', () => {
  const plan = [cuota(1, 1000, '2026-10-01', 1000), cuota(2, 1000, '2026-10-15'), cuota(3, 1000, '2026-10-29')];

  it('conserva las fechas y reparte el monto nuevo al centavo', () => {
    const r = reescalarCuotas(plan, 3200);
    expect(r.map((c) => c.fecha_vencimiento)).toEqual(['2026-10-01', '2026-10-15', '2026-10-29']);
    expect(r.reduce((s, c) => s + c.monto_usd_cents, 0)).toBe(3200);
    expect(r.map((c) => c.monto_usd_cents)).toEqual([1067, 1067, 1066]);
  });

  it('sin nada que financiar, no quedan cuotas', () => {
    expect(reescalarCuotas(plan, 0)).toEqual([]);
  });

  it('sin plan, sigue sin plan', () => {
    expect(reescalarCuotas([], 5000)).toEqual([]);
  });
});
