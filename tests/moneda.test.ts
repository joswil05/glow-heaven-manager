import { describe, it, expect } from 'vitest';
import {
  usdCentavosACorCentavos,
  corCentavosAUsdCentavos,
  formatearMoneda,
  formatearMonedaDual,
  formatearPeso,
  formatearPorcentaje,
  formatearFecha,
  relativoAHoy,
} from '../src/core/moneda';

describe('src/core/moneda.ts', () => {
  it('convierte USD centavos a Córdoba centavos con tasa entera', () => {
    // $100.00 USD a tasa C$36.6243 (3662 centavos por USD)
    // 10000 * 3662 / 100 = 366200 centavos C$ (C$ 3662.00)
    const cor = usdCentavosACorCentavos(10000, 3662);
    expect(cor).toBe(366200);
  });

  it('convierte Córdoba centavos a USD centavos redondeado', () => {
    const usd = corCentavosAUsdCentavos(366200, 3662);
    expect(usd).toBe(10000);
  });

  it('formatea moneda correctamente', () => {
    expect(formatearMoneda(1250, 'USD')).toBe('$12.50');
    expect(formatearMoneda(366200, 'COR')).toBe('C$3,662.00');
    expect(formatearMoneda(0, 'USD')).toBe('$0.00');
  });

  it('formatea moneda dual de forma legible', () => {
    const dual = formatearMonedaDual(10000, 366200);
    expect(dual.usd).toBe('$100.00');
    expect(dual.cor).toBe('C$3,662.00');
    expect(dual.textoDual).toBe('C$3,662.00 / $100.00');
  });

  it('formatea peso de milésimas de libra a lb', () => {
    expect(formatearPeso(1500)).toBe('1.50 lb');
    expect(formatearPeso(800)).toBe('0.80 lb');
    expect(formatearPeso(3500)).toBe('3.50 lb');
  });

  it('formatea basis points a porcentaje', () => {
    expect(formatearPorcentaje(3500)).toBe('35%');
    expect(formatearPorcentaje(3250)).toBe('32.5%');
    expect(formatearPorcentaje(700)).toBe('7%');
  });
});

describe('formatearFecha', () => {
  it('escribe la fecha como la diría una persona', () => {
    const esteAno = new Date().getFullYear();
    expect(formatearFecha(`${esteAno}-09-11`)).toBe('11 sep');
    expect(formatearFecha('2024-01-05')).toBe('5 ene 2024');
  });

  it('sin fecha devuelve vacío, no "Invalid Date"', () => {
    expect(formatearFecha(undefined)).toBe('');
    expect(formatearFecha('')).toBe('');
  });
});

describe('relativoAHoy', () => {
  const enDias = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  it('dice cuánto falta en vez de obligar a restar contra el calendario', () => {
    expect(relativoAHoy(enDias(0))).toBe('vence hoy');
    expect(relativoAHoy(enDias(1))).toBe('vence mañana');
    expect(relativoAHoy(enDias(3))).toBe('vence en 3 días');
  });

  it('distingue vencido de por vencer', () => {
    expect(relativoAHoy(enDias(-1))).toBe('venció ayer');
    expect(relativoAHoy(enDias(-5))).toBe('venció hace 5 días');
  });
});
