import { describe, it, expect } from 'vitest';
import {
  montoPagado,
  montoEquivalente,
  textoPagado,
  textoEquivalente,
  textoLoPagado,
  nombreCorto,
  diaDeHistorial,
  abonoQueSigueAlTotal,
} from '@core/abonos';

const abono = (moneda: 'USD' | 'COR', usd: number, cor: number, extra: Record<string, unknown> = {}) => ({
  id: 1,
  moneda,
  monto_usd_cents: usd,
  monto_cor_cents: cor,
  tasa_cambio_cents: 3662,
  activo: true,
  ...extra,
});

describe('un abono se muestra como se pagó', () => {
  it('uno en córdobas, en córdobas, y su equivalente en dólares con su tasa', () => {
    const p = abono('COR', 1638, 60000);
    expect(montoPagado(p)).toEqual({ cents: 60000, moneda: 'COR' });
    expect(montoEquivalente(p)).toEqual({ cents: 1638, moneda: 'USD' });
    expect(textoPagado(p)).toBe('C$600.00');
    expect(textoEquivalente(p)).toBe('$16.38');
  });

  it('uno en dólares, en dólares', () => {
    const p = abono('USD', 2000, 73240);
    expect(textoPagado(p)).toBe('$20.00');
    expect(textoEquivalente(p)).toBe('C$732.40');
  });
});

describe('lo pagado de una venta, en la moneda de sus abonos', () => {
  it('si todos fueron en córdobas, en córdobas', () => {
    expect(textoLoPagado([abono('COR', 1000, 36620), abono('COR', 1000, 36620)])).toBe('C$732.40');
  });

  it('si mezcló monedas, en dólares', () => {
    expect(textoLoPagado([abono('COR', 1000, 36620), abono('USD', 1000, 36620)])).toBe('$20.00');
  });

  it('los anulados no cuentan', () => {
    expect(textoLoPagado([abono('COR', 1000, 36620), abono('USD', 5000, 0, { activo: false })])).toBe('C$366.20');
  });
});

describe('quién lo registró, como se dice', () => {
  it('el primer nombre de la cuenta', () => {
    expect(nombreCorto({ uid: 'x', nombre: 'Rosa María Pérez' })).toBe('Rosa');
  });

  it('sin nombre, lo de antes de la arroba del correo', () => {
    expect(nombreCorto({ uid: 'x', nombre: 'joswill.e@gmail.com' })).toBe('Joswill.e');
  });

  it('sin dato, nada', () => {
    expect(nombreCorto(undefined)).toBeUndefined();
  });
});

describe('el día, como lo diría una persona', () => {
  it('hoy, ayer, y después el día de la semana', () => {
    expect(diaDeHistorial('2026-09-29', '2026-09-29')).toBe('Hoy');
    expect(diaDeHistorial('2026-09-28', '2026-09-29')).toBe('Ayer');
    expect(diaDeHistorial('2026-09-27', '2026-09-29')).toBe('dom 27 sep');
  });

  it('de otro año, con el año', () => {
    expect(diaDeHistorial('2025-12-31', '2026-09-29')).toBe('mié 31 dic 2025');
  });
});

describe('una venta al contado sigue a su abono', () => {
  const venta = { total_usd_cents: 2000, pagado_usd_cents: 2000 };

  it('pagada entera con un abono en córdobas: el abono baja en córdobas, con su tasa', () => {
    const r = abonoQueSigueAlTotal(venta, [abono('COR', 2000, 73240)], 1500);
    expect(r).toMatchObject({ monto_usd_cents: 1500, monto_cor_cents: 54930 });
    expect(r && textoPagado({ ...r.pago, ...r })).toBe('C$549.30');
  });

  it('y sube igual si la venta sube', () => {
    expect(abonoQueSigueAlTotal(venta, [abono('USD', 2000, 73240)], 2500)).toMatchObject({
      monto_usd_cents: 2500,
      monto_cor_cents: 91550,
    });
  });

  it('con dos abonos no adivina cuál tocar', () => {
    expect(abonoQueSigueAlTotal(venta, [abono('USD', 1000, 36620), abono('USD', 1000, 36620)], 1500)).toBeNull();
  });

  it('a crédito, con saldo, tampoco', () => {
    expect(abonoQueSigueAlTotal({ total_usd_cents: 2000, pagado_usd_cents: 500 }, [abono('USD', 500, 18310)], 1500)).toBeNull();
  });

  it('si el total no cambia, no hay nada que ajustar', () => {
    expect(abonoQueSigueAlTotal(venta, [abono('USD', 2000, 73240)], 2000)).toBeNull();
  });

  it('un centavo de redondeo al pagar en córdobas cuenta como pagada entera', () => {
    expect(
      abonoQueSigueAlTotal({ total_usd_cents: 2001, pagado_usd_cents: 2000 }, [abono('COR', 2000, 73277)], 1500)
    ).not.toBeNull();
  });
});
