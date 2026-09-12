import { describe, it, expect } from 'vitest';
import {
  calcularPrecio,
  calcularPrecioPaquete,
  margenDeVenta,
  redondearHaciaArriba,
} from '@core/precios';

describe('redondearHaciaArriba', () => {
  it('sube al siguiente dólar entero', () => {
    expect(redondearHaciaArriba(4260, 100)).toBe(4300);
    expect(redondearHaciaArriba(4201, 100)).toBe(4300);
  });

  it('deja quieto lo que ya cae en el escalón', () => {
    expect(redondearHaciaArriba(4300, 100)).toBe(4300);
  });

  it('sube al siguiente múltiplo de $5', () => {
    expect(redondearHaciaArriba(4260, 500)).toBe(4500);
    expect(redondearHaciaArriba(4001, 500)).toBe(4500);
    expect(redondearHaciaArriba(4000, 500)).toBe(4000);
  });

  it('nunca redondea hacia abajo', () => {
    for (let v = 1; v <= 1000; v++) {
      expect(redondearHaciaArriba(v, 100)).toBeGreaterThanOrEqual(v);
    }
  });
});

describe('calcularPrecio - margen sobre costo', () => {
  it('la ganancia se mide contra el costo real, no contra el precio de USA', () => {
    // Boxers: $30 producto, pero el costo real con tax y envío es $42.60
    const r = calcularPrecio({
      costo_unitario_usd_cents: 4260,
      modo: 'MARGEN',
      margen_bp: 4000,
      paso_redondeo_usd_cents: 100,
    });

    expect(r.precio_crudo_usd_cents).toBe(5964); // 42.60 x 1.40
    expect(r.precio_usd_cents).toBe(6000); // sube a $60
    expect(r.ganancia_usd_cents).toBe(1740);
    // El margen entregado nunca queda por debajo del pedido.
    expect(r.margen_sobre_costo_bp).toBeGreaterThanOrEqual(4000);
  });

  it('el redondeo hacia arriba nunca deja el margen por debajo del pedido', () => {
    for (let costo = 100; costo <= 20000; costo += 137) {
      for (const margen of [2000, 3500, 4000, 5000, 10000]) {
        const r = calcularPrecio({
          costo_unitario_usd_cents: costo,
          modo: 'MARGEN',
          margen_bp: margen,
          paso_redondeo_usd_cents: 100,
        });
        expect(r.margen_sobre_costo_bp).toBeGreaterThanOrEqual(margen - 1);
        expect(r.bajo_costo).toBe(false);
      }
    }
  });

  it('reporta los dos márgenes por separado y no los confunde', () => {
    const r = calcularPrecio({
      costo_unitario_usd_cents: 5000,
      modo: 'MARGEN',
      margen_bp: 10000, // el doble
      paso_redondeo_usd_cents: 100,
    });
    expect(r.precio_usd_cents).toBe(10000);
    expect(r.margen_sobre_costo_bp).toBe(10000); // 100% sobre costo
    expect(r.margen_sobre_venta_bp).toBe(5000); // 50% del precio
  });

  it('un costo de cero no divide entre cero', () => {
    const r = calcularPrecio({
      costo_unitario_usd_cents: 0,
      modo: 'MARGEN',
      margen_bp: 4000,
      paso_redondeo_usd_cents: 100,
    });
    expect(r.margen_sobre_costo_bp).toBe(0);
    expect(r.precio_usd_cents).toBe(0);
  });
});

describe('calcularPrecio - multiplicador', () => {
  it('x2 sobre el costo real', () => {
    const r = calcularPrecio({
      costo_unitario_usd_cents: 4260,
      modo: 'MULTIPLICADOR',
      multiplicador_bp: 20000,
      paso_redondeo_usd_cents: 100,
    });
    expect(r.precio_crudo_usd_cents).toBe(8520);
    expect(r.precio_usd_cents).toBe(8600);
  });
});

describe('calcularPrecio - manual', () => {
  it('respeta el precio escrito sin subirlo al escalón', () => {
    const r = calcularPrecio({
      costo_unitario_usd_cents: 4260,
      modo: 'MANUAL',
      precio_manual_usd_cents: 5550,
      paso_redondeo_usd_cents: 100,
    });
    expect(r.precio_usd_cents).toBe(5550);
    expect(r.ajuste_redondeo_usd_cents).toBe(0);
  });

  it('avisa cuando el precio no cubre el costo', () => {
    const r = calcularPrecio({
      costo_unitario_usd_cents: 4260,
      modo: 'MANUAL',
      precio_manual_usd_cents: 3000,
      paso_redondeo_usd_cents: 100,
    });
    expect(r.bajo_costo).toBe(true);
    expect(r.ganancia_usd_cents).toBe(-1260);
  });
});

describe('calcularPrecioPaquete', () => {
  it('el paquete completo vale el unitario por la cantidad', () => {
    expect(calcularPrecioPaquete(1200, 6)).toBe(7200);
  });

  it('cantidad cero se trata como una unidad, no como precio cero', () => {
    expect(calcularPrecioPaquete(1200, 0)).toBe(1200);
  });
});

describe('margenDeVenta', () => {
  it('usa el costo congelado de la venta', () => {
    const r = margenDeVenta(6000, 4260);
    expect(r.ganancia_usd_cents).toBe(1740);
    expect(r.margen_sobre_costo_bp).toBe(4085);
  });

  it('una venta bajo costo da ganancia negativa, no cero', () => {
    const r = margenDeVenta(3000, 4260);
    expect(r.ganancia_usd_cents).toBe(-1260);
  });
});
