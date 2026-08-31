import { describe, it, expect } from 'vitest';
import { parsearDecimal, parsearACentavos } from '@core/numeros';

describe('src/core/numeros.ts', () => {
  it('acepta punto decimal', () => {
    expect(parsearDecimal('36.62')).toBe(36.62);
  });

  it('acepta coma decimal, que es lo natural al escribir en español', () => {
    expect(parsearDecimal('36,62')).toBe(36.62);
  });

  it('ignora espacios alrededor', () => {
    expect(parsearDecimal('  6.50  ')).toBe(6.5);
  });

  it('rechaza vacío, texto y valores no finitos', () => {
    expect(parsearDecimal('')).toBeNull();
    expect(parsearDecimal('   ')).toBeNull();
    expect(parsearDecimal('abc')).toBeNull();
    expect(parsearDecimal('36.6.2')).toBeNull();
    expect(parsearDecimal('Infinity')).toBeNull();
  });

  it('convierte a centavos redondeando', () => {
    expect(parsearACentavos('36,62')).toBe(3662);
    expect(parsearACentavos('0.005')).toBe(1);
  });

  it('rechaza valores fuera del rango pedido', () => {
    expect(parsearACentavos('-5', { min: 0 })).toBeNull();
    expect(parsearACentavos('150', { min: 0, max: 100 })).toBeNull();
    expect(parsearACentavos('50', { min: 0, max: 100 })).toBe(5000);
  });
});
