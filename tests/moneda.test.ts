import { describe, it, expect } from 'vitest';
import {
  usdCentavosACorCentavos,
  corCentavosAUsdCentavos,
  formatearMoneda,
  formatearMonedaDual,
  formatearPeso,
  formatearPorcentaje,
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
