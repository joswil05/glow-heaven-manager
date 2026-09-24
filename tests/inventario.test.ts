import { describe, it, expect } from 'vitest';
import {
  costoUnitario,
  registrarEntrada,
  registrarSalida,
  ajustarExistencias,
} from '@core/inventario';

describe('costo promedio ponderado', () => {
  it('el mismo producto en dos paquetes promedia su costo', () => {
    // Paquete 1: 4 termos a $9.20
    let estado = registrarEntrada({ existencias: 0, valor_total_usd_cents: 0 }, 4, 3680);
    expect(estado.costo_unitario_usd_cents).toBe(920);

    // Paquete 2: 6 termos a $11.50
    estado = registrarEntrada(estado, 6, 6900);
    expect(estado.existencias).toBe(10);
    expect(estado.valor_total_usd_cents).toBe(10580);
    expect(estado.costo_unitario_usd_cents).toBe(1058); // $10.58
  });

  it('sin existencias el costo unitario es cero, no una división entre cero', () => {
    expect(costoUnitario({ existencias: 0, valor_total_usd_cents: 0 })).toBe(0);
    expect(costoUnitario({ existencias: 0, valor_total_usd_cents: 500 })).toBe(0);
  });
});

describe('salidas por venta', () => {
  it('la venta se lleva el costo promedio del momento', () => {
    const estado = { existencias: 10, valor_total_usd_cents: 10580 };
    const r = registrarSalida(estado, 1);
    expect(r.costo_salida_usd_cents).toBe(1058);
    expect(r.existencias).toBe(9);
    expect(r.valor_total_usd_cents).toBe(9522);
  });

  it('vaciar el inventario se lleva el valor completo sin dejar residuos', () => {
    // 3 unidades por $10.00: $3.333... cada una, imposible de partir exacto.
    const estado = { existencias: 3, valor_total_usd_cents: 1000 };
    const r1 = registrarSalida(estado, 1);
    const r2 = registrarSalida(r1, 1);
    const r3 = registrarSalida(r2, 1);

    expect(r3.existencias).toBe(0);
    expect(r3.valor_total_usd_cents).toBe(0);

    const costoTotalSalidas =
      r1.costo_salida_usd_cents + r2.costo_salida_usd_cents + r3.costo_salida_usd_cents;
    expect(costoTotalSalidas).toBe(1000);
  });

  it('pedir más de lo que hay no deja existencias negativas', () => {
    const r = registrarSalida({ existencias: 2, valor_total_usd_cents: 2000 }, 5);
    expect(r.insuficiente).toBe(true);
    expect(r.unidades_retiradas).toBe(2);
    expect(r.existencias).toBe(0);
    expect(r.valor_total_usd_cents).toBe(0);
  });

  it('vender un paquete completo saca todas sus unidades de una', () => {
    const estado = { existencias: 6, valor_total_usd_cents: 4260 };
    const r = registrarSalida(estado, 6);
    expect(r.existencias).toBe(0);
    expect(r.costo_salida_usd_cents).toBe(4260);
  });
});

describe('ajuste manual', () => {
  it('un conteo físico menor baja el valor manteniendo el costo unitario', () => {
    const r = ajustarExistencias({ existencias: 10, valor_total_usd_cents: 10580 }, 8);
    expect(r.existencias).toBe(8);
    expect(r.valor_total_usd_cents).toBe(8464); // 8 x $10.58
  });

  it('ajustar no inventa ni pierde centavos cuando el costo no divide exacto', () => {
    // Visto en la app instalada: 7 unidades por $93.28 ($13.33 c/u, redondeado).
    // Sacar una por dañada tiene que restar su costo, $13.33, y dejar $79.95.
    // Recalcular el total como $13.33 × 6 daba $79.98: 3 centavos de la nada.
    const abajo = ajustarExistencias({ existencias: 7, valor_total_usd_cents: 9328 }, 6);
    expect(abajo.valor_total_usd_cents).toBe(9328 - 1333);

    const arriba = ajustarExistencias({ existencias: 7, valor_total_usd_cents: 9328 }, 9);
    expect(arriba.valor_total_usd_cents).toBe(9328 + 2 * 1333);
  });

  it('ajustar a cero deja el valor en cero', () => {
    const r = ajustarExistencias({ existencias: 10, valor_total_usd_cents: 10580 }, 0);
    expect(r).toEqual({ existencias: 0, valor_total_usd_cents: 0 });
  });

  it('ajustar desde cero existencias con costo de respaldo calcula el valor correctamente', () => {
    // Si un producto estaba en 0 unidades y se le ajusta a 5 unidades indicando su costo unitario previo ($8.00 = 800 cents)
    const r = ajustarExistencias({ existencias: 0, valor_total_usd_cents: 0 }, 5, 800);
    expect(r.existencias).toBe(5);
    expect(r.valor_total_usd_cents).toBe(4000); // 5 x $8.00
  });

  it('ajustar desde cero existencias sin costo de respaldo deja el valor en 0', () => {
    const r = ajustarExistencias({ existencias: 0, valor_total_usd_cents: 0 }, 5);
    expect(r.existencias).toBe(5);
    expect(r.valor_total_usd_cents).toBe(0);
  });
});

describe('el ciclo completo cuadra', () => {
  it('caso multipack (pack de boxers): entra como unidades individuales y se vende individual o en bloque', () => {
    // Pack de 5 boxers comprado en USA a $12.00, con flete y tax aterriza a $16.50
    let estado = { existencias: 0, valor_total_usd_cents: 0 };
    const unidades = 5;
    const costoAterrizado = 1650; // $16.50
    estado = registrarEntrada(estado, unidades, costoAterrizado);

    expect(estado.existencias).toBe(5);
    expect(costoUnitario(estado)).toBe(330); // $3.30 c/u

    // Se vende 1 boxer individual
    let salida = registrarSalida(estado, 1);
    expect(salida.existencias).toBe(4);
    expect(salida.costo_salida_usd_cents).toBe(330);
    expect(salida.valor_total_usd_cents).toBe(1320); // 4 * $3.30

    // Se venden 2 boxers individuales más
    salida = registrarSalida(salida, 2);
    expect(salida.existencias).toBe(2);
    expect(salida.costo_salida_usd_cents).toBe(660);

    // Se venden los últimos 2
    salida = registrarSalida(salida, 2);
    expect(salida.existencias).toBe(0);
    expect(salida.valor_total_usd_cents).toBe(0);
  });
});

