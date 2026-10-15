/**
 * Vender en el celular (U3): lo puro. El ícono de un producto sin foto sale
 * de su categoría (VEN-3).
 */
import { describe, it, expect } from 'vitest';
import { Droplets, Footprints, Home, Package, Shirt, ShoppingBag, Sparkles, SprayCan } from 'lucide-react';
import { iconoDeCategoria } from '../mobile/src/lib/categorias';

describe('iconoDeCategoria', () => {
  it('reconoce las categorías de fábrica por su nombre', () => {
    expect(iconoDeCategoria('Perfumería')).toBe(SprayCan);
    expect(iconoDeCategoria('Maquillaje')).toBe(Sparkles);
    expect(iconoDeCategoria('Skincare')).toBe(Droplets);
    expect(iconoDeCategoria('Calzado')).toBe(Footprints);
    expect(iconoDeCategoria('Bolsos y accesorios')).toBe(ShoppingBag);
    expect(iconoDeCategoria('Ropa interior')).toBe(Shirt);
    expect(iconoDeCategoria('Hogar')).toBe(Home);
  });

  it('lo que no reconoce, o sin categoría, va con una caja', () => {
    expect(iconoDeCategoria('Otros')).toBe(Package);
    expect(iconoDeCategoria(undefined)).toBe(Package);
    expect(iconoDeCategoria('')).toBe(Package);
  });
});
