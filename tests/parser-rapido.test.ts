import { describe, it, expect } from 'vitest';
import { parsearTextoRapido } from '../src/core/parser-rapido';

describe('src/core/parser-rapido.ts', () => {
  it('interpreta texto estructurado con tienda, producto, precio y peso', () => {
    const texto = 'sephora dior sauvage 100ml $128 1.5lb';
    const resultado = parsearTextoRapido(texto);

    expect(resultado.tienda?.toLowerCase()).toContain('sephora');
    expect(resultado.descripcion.toLowerCase()).toContain('dior sauvage 100ml');
    expect(resultado.precio_usa_usd_cents).toBe(12800);
    expect(resultado.peso_mlb).toBe(1500);
    expect(resultado.categoria_sugerida).toBe('Perfumería');
  });

  it('interpreta precio con decimales y peso fraccionario', () => {
    const texto = 'Ulta labial matte nyx $8.50 0.2lb';
    const resultado = parsearTextoRapido(texto);

    expect(resultado.precio_usa_usd_cents).toBe(850);
    expect(resultado.peso_mlb).toBe(200);
    expect(resultado.categoria_sugerida).toBe('Maquillaje');
  });

  it('interpreta links de tiendas conocidas', () => {
    const url = 'https://www.amazon.com/dp/B08N5WRWNW';
    const resultado = parsearTextoRapido(url);

    expect(resultado.tienda).toBe('Amazon');
    expect(resultado.url).toBe(url);
  });
});
