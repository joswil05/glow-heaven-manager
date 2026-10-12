/**
 * El flete de un paquete sale del peso de la caja y de la tarifa por libra de
 * Configuración: Joswill pidió el 11/10 escribir sólo las libras, en las dos
 * apps, y que el impuesto sea siempre el porcentaje de Configuración.
 *
 * Un paquete ya guardado conserva el flete que tenía mientras no le cambien
 * el peso: pudo haberse escrito a mano antes de este cambio, o la tarifa pudo
 * cambiar después, y corregir otra cosa del paquete no tiene por qué mover el
 * costo de lo que ya entró a la bodega.
 */
import { describe, it, expect } from 'vitest';
import { fleteDePeso, fleteDelPaquete } from '../src/core/paquete';

describe('El flete sale del peso de la caja', () => {
  it('libras por la tarifa, en centavos', () => {
    expect(fleteDePeso(2000, 700)).toBe(1400); // 2 lb a $7.00
    expect(fleteDePeso(1430, 700)).toBe(1001); // 1.43 lb: $10.01
  });

  it('redondea al centavo', () => {
    expect(fleteDePeso(1234, 700)).toBe(864); // $8.638
  });

  it('sin peso, o con un dato que no es número, no hay flete', () => {
    expect(fleteDePeso(0, 700)).toBe(0);
    expect(fleteDePeso(-500, 700)).toBe(0);
    expect(fleteDePeso(Number.NaN, 700)).toBe(0);
  });
});

describe('El flete de un paquete ya guardado', () => {
  it('uno nuevo toma el del peso', () => {
    expect(fleteDelPaquete(3000, 700)).toBe(2100);
  });

  it('con el mismo peso conserva el que tenía, aunque no dé la tarifa', () => {
    const guardado = { peso_total_mlb: 2000, envio_total_usd_cents: 5000 };
    expect(fleteDelPaquete(2000, 700, guardado)).toBe(5000);
  });

  it('uno de antes, sin peso, conserva su flete hasta que le escriban el peso', () => {
    const viejo = { peso_total_mlb: undefined, envio_total_usd_cents: 7700 };
    expect(fleteDelPaquete(0, 700, viejo)).toBe(7700);
    expect(fleteDelPaquete(5000, 700, viejo)).toBe(3500);
  });

  it('si le cambian el peso, se calcula de nuevo', () => {
    const guardado = { peso_total_mlb: 2000, envio_total_usd_cents: 5000 };
    expect(fleteDelPaquete(2500, 700, guardado)).toBe(1750);
  });
});
