import { describe, it, expect } from 'vitest';
import {
  etapaEncargo,
  piezasDe,
  textoEtapa,
  estadoPieza,
  costoEstimadoDePieza,
  sinPaquete,
} from '@core/encargos';

describe('de dónde sale cada pieza', () => {
  it('en un paquete que no llegó, está en camino; cuando llega, llegó', () => {
    expect(estadoPieza({ compra_id: 3 })).toBe('EN_CAMINO');
    expect(estadoPieza({ compra_id: 3, llego_el: '2026-10-12' })).toBe('LLEGO');
  });

  it('con un producto del catálogo y sin paquete, sale de la bodega', () => {
    expect(estadoPieza({ producto_id: 7 })).toBe('DE_BODEGA');
  });

  it('comprada y sin paquete todavía: espera paquete; al entrar en uno, está en camino', () => {
    // Ella no sabe en qué paquete viene: sólo que ya lo compró.
    expect(estadoPieza({ comprado_el: '2026-09-25' })).toBe('COMPRADA');
    expect(estadoPieza({ comprado_el: '2026-09-25', compra_id: 3 })).toBe('EN_CAMINO');
    expect(estadoPieza({})).toBe('POR_COMPRAR');
  });

  it('si vino en un paquete, no sale de la bodega aunque apunte a un producto', () => {
    // Era el doble descuento: la pieza llegaba en el paquete y al entregarla se
    // descontaba además una unidad del estante.
    expect(estadoPieza({ producto_id: 7, compra_id: 3, llego_el: '2026-10-12' })).toBe('LLEGO');
  });
});

describe('la etapa del encargo', () => {
  const pendiente = (lineas: Parameters<typeof piezasDe>[0]) => ({
    estado: 'PENDIENTE' as const,
    piezas: piezasDe(lineas),
  });

  it('confirmado y sin comprar', () => {
    expect(etapaEncargo(pendiente([{}, {}]))).toBe('POR_COMPRAR');
  });

  it('con una pieza comprada y otra no, todavía hay algo por comprar', () => {
    expect(etapaEncargo(pendiente([{ compra_id: 3 }, {}]))).toBe('POR_COMPRAR');
  });

  it('todo comprado y una sola pieza llegó: en camino, "1 de 2 llegó"', () => {
    const v = pendiente([{ compra_id: 3, llego_el: '2026-10-12' }, { compra_id: 4 }]);
    expect(etapaEncargo(v)).toBe('EN_CAMINO');
    expect(textoEtapa('EN_CAMINO', v.piezas)).toBe('En camino · 1 de 2 llegó');
    expect(textoEtapa('EN_CAMINO', { total: 3, compradas: 3, llegadas: 2, de_bodega: 0 })).toBe('En camino · 2 de 3 llegaron');
    // Uno sin confirmar que ya se compró lo dice.
    expect(textoEtapa('COTIZADO', { total: 2, compradas: 1, llegadas: 1, de_bodega: 0 })).toBe('Cotizado · en camino');
    expect(textoEtapa('COTIZADO', { total: 1, compradas: 1, llegadas: 1, de_bodega: 0 })).toBe('Cotizado · llegó');
    expect(textoEtapa('COTIZADO', { total: 1, compradas: 0, llegadas: 0, de_bodega: 0 })).toBe('Cotizado');
  });

  it('comprado y esperando paquete ya no está por comprar: está en camino', () => {
    const v = pendiente([{ comprado_el: '2026-09-25' }, { compra_id: 4 }]);
    expect(etapaEncargo(v)).toBe('EN_CAMINO');
    expect(v.piezas).toEqual({ total: 2, compradas: 2, llegadas: 0, de_bodega: 0, esperan_paquete: 1 });
  });

  it('cuántas piezas todavía no vienen en ningún paquete', () => {
    // Las que ofrece el paquete: por comprar o compradas, sin paquete.
    expect(sinPaquete(piezasDe([{}, { comprado_el: '2026-09-25' }, { compra_id: 3 }, { producto_id: 7 }]))).toBe(2);
    // Un resumen guardado antes de este campo no sabe de compradas sin paquete.
    expect(sinPaquete({ total: 3, compradas: 1, llegadas: 0, de_bodega: 1 })).toBe(1);
    expect(sinPaquete(undefined)).toBe(0);
  });

  it('todo llegó o sale de la bodega: por entregar', () => {
    expect(etapaEncargo(pendiente([{ compra_id: 3, llego_el: '2026-10-12' }, { producto_id: 7 }]))).toBe(
      'POR_ENTREGAR'
    );
  });

  it('lo guardado manda: cotizado, entregado, anulado', () => {
    expect(etapaEncargo({ estado: 'COTIZADA' })).toBe('COTIZADO');
    expect(etapaEncargo({ estado: 'ENTREGADA' })).toBe('ENTREGADO');
    expect(etapaEncargo({ estado: 'CANCELADA' })).toBe('ANULADO');
  });

  it('un encargo anterior a la 2.14, sin resumen de piezas, queda por comprar', () => {
    expect(etapaEncargo({ estado: 'PENDIENTE' })).toBe('POR_COMPRAR');
  });
});

describe('cotizar con números', () => {
  it('tienda + 7% + peso por la tarifa', () => {
    // Un perfume de $45.00 que pesa 1.5 lb, a $7.00 la libra.
    expect(
      costoEstimadoDePieza({ tienda_usd_cents: 4500, peso_mlb: 1500, tax_bp: 700, tarifa_cents_lb: 700 })
    ).toBe(4500 + 315 + 1050);
  });
});
