import { describe, it, expect } from 'vitest';
import { costearPaquete, repartirPeso } from '@core/costeo';
import type { LineaParaReparto } from '@core/costeo';

/**
 * El caso que originó el rediseño: un paquete real de 11 lb con $77.00 de
 * envío, donde dos productos eran encargo y el resto iba a inventario.
 */
describe('costearPaquete - paquete real de $77', () => {
  const lineas = [
    // Encargos
    { id: 1, cantidad: 1, precio_linea_usd_cents: 4500, peso_linea_mlb: 2000 }, // Bolso Tommy
    { id: 2, cantidad: 1, precio_linea_usd_cents: 2800, peso_linea_mlb: 1500 }, // Termo Owala
    // Inventario
    { id: 3, cantidad: 6, precio_linea_usd_cents: 3000, peso_linea_mlb: 1500 }, // Boxers x6
    { id: 4, cantidad: 3, precio_linea_usd_cents: 5400, peso_linea_mlb: 3000 },
    { id: 5, cantidad: 2, precio_linea_usd_cents: 2200, peso_linea_mlb: 3000 },
  ];

  const params = {
    tax_bp: 700,
    envio_total_usd_cents: 7700,
  };

  it('reparte el envío completo sin perder ni inventar centavos', () => {
    const r = costearPaquete(lineas, params);
    const sumaEnvio = r.lineas.reduce((a, l) => a + l.envio_asignado_usd_cents, 0);
    expect(sumaEnvio).toBe(7700);
  });

  it('reparte por peso, no por valor', () => {
    const r = costearPaquete(lineas, params);
    // 11 lb en total, $77 => $7.00/lb exacto.
    const bolso = r.lineas.find((l) => l.id === 1)!;
    const boxers = r.lineas.find((l) => l.id === 3)!;

    expect(bolso.envio_asignado_usd_cents).toBe(1400); // 2.0 lb x $7
    expect(boxers.envio_asignado_usd_cents).toBe(1050); // 1.5 lb x $7
  });

  it('el producto de encargo carga su parte del envío igual que el resto', () => {
    const r = costearPaquete(lineas, params);
    const termo = r.lineas.find((l) => l.id === 2)!;
    const boxers = r.lineas.find((l) => l.id === 3)!;
    // Mismo peso, misma parte del envío, sin importar el destino.
    expect(termo.envio_asignado_usd_cents).toBe(boxers.envio_asignado_usd_cents);
  });

  it('el total pagado cuadra con la suma de las líneas', () => {
    const r = costearPaquete(lineas, params);
    const sumaLineas = r.lineas.reduce((a, l) => a + l.costo_linea_usd_cents, 0);
    expect(sumaLineas).toBe(r.total_pagado_usd_cents);
  });

  it('calcula el tax al 7% sobre el precio del producto', () => {
    const r = costearPaquete(lineas, params);
    const bolso = r.lineas.find((l) => l.id === 1)!;
    expect(bolso.tax_linea_usd_cents).toBe(315); // 7% de $45.00
  });

  it('divide el costo del paquete de 6 boxers entre sus unidades', () => {
    const r = costearPaquete(lineas, params);
    const boxers = r.lineas.find((l) => l.id === 3)!;
    // $30.00 + $2.10 tax + $10.50 envío = $42.60 la línea
    expect(boxers.costo_linea_usd_cents).toBe(4260);
    expect(boxers.costo_unitario_usd_cents).toBe(710); // $7.10 por boxer
  });
});

describe('costearPaquete - tax real del recibo', () => {
  it('el total del recibo manda sobre el porcentaje', () => {
    const r = costearPaquete(
      [
        { id: 1, cantidad: 1, precio_linea_usd_cents: 5000, peso_linea_mlb: 1000 },
        { id: 2, cantidad: 1, precio_linea_usd_cents: 5000, peso_linea_mlb: 1000 },
      ],
      { tax_bp: 700, envio_total_usd_cents: 1400, tax_total_override_usd_cents: 683 }
    );

    expect(r.tax_total_usd_cents).toBe(683);
    const suma = r.lineas.reduce((a, l) => a + l.tax_linea_usd_cents, 0);
    expect(suma).toBe(683);
  });
});

describe('costearPaquete - casos límite', () => {
  it('sin líneas devuelve ceros y no explota', () => {
    const r = costearPaquete([], { tax_bp: 700, envio_total_usd_cents: 7700 });
    expect(r.lineas).toHaveLength(0);
    expect(r.total_pagado_usd_cents).toBe(0);
  });

  it('sin pesos declarados reparte el envío por unidad', () => {
    const r = costearPaquete(
      [
        { id: 1, cantidad: 1, precio_linea_usd_cents: 1000, peso_linea_mlb: 0 },
        { id: 2, cantidad: 1, precio_linea_usd_cents: 9000, peso_linea_mlb: 0 },
      ],
      { tax_bp: 0, envio_total_usd_cents: 1000 }
    );
    expect(r.lineas[0].envio_asignado_usd_cents).toBe(500);
    expect(r.lineas[1].envio_asignado_usd_cents).toBe(500);
  });

  it('un envío que no divide exacto sigue cuadrando', () => {
    const r = costearPaquete(
      [
        { id: 1, cantidad: 1, precio_linea_usd_cents: 1000, peso_linea_mlb: 333 },
        { id: 2, cantidad: 1, precio_linea_usd_cents: 1000, peso_linea_mlb: 333 },
        { id: 3, cantidad: 1, precio_linea_usd_cents: 1000, peso_linea_mlb: 334 },
      ],
      { tax_bp: 0, envio_total_usd_cents: 1000 }
    );
    const suma = r.lineas.reduce((a, l) => a + l.envio_asignado_usd_cents, 0);
    expect(suma).toBe(1000);
  });

  it('un envío de cero no rompe el costeo', () => {
    const r = costearPaquete(
      [{ id: 1, cantidad: 2, precio_linea_usd_cents: 2000, peso_linea_mlb: 1000 }],
      { tax_bp: 700, envio_total_usd_cents: 0 }
    );
    expect(r.lineas[0].costo_linea_usd_cents).toBe(2140);
  });
});

describe('repartirPeso', () => {
  const linea = (clave: string, extra: Partial<LineaParaReparto> = {}): LineaParaReparto => ({
    clave,
    manual_mlb: null,
    unidades: 1,
    pista_mlb: 0,
    ...extra,
  });

  it('reparte el peso del paquete y la suma cuadra exacto', () => {
    const r = repartirPeso([linea('a'), linea('b'), linea('c')], 11000);
    const total = [...r.values()].reduce((s, v) => s + v, 0);
    expect(total).toBe(11000);
  });

  it('usa el peso del inventario cuando lo conoce', () => {
    const r = repartirPeso(
      [linea('bolso', { pista_mlb: 3000 }), linea('termo', { pista_mlb: 1000 })],
      8000
    );
    expect(r.get('bolso')).toBe(6000);
    expect(r.get('termo')).toBe(2000);
  });

  it('reparte por unidades cuando ningún producto tiene peso conocido', () => {
    const r = repartirPeso([linea('a', { unidades: 6 }), linea('b', { unidades: 2 })], 8000);
    expect(r.get('a')).toBe(6000);
    expect(r.get('b')).toBe(2000);
  });

  it('respeta los pesos escritos a mano y reparte lo que sobra', () => {
    const r = repartirPeso(
      [linea('fijo', { manual_mlb: 5000 }), linea('libre1'), linea('libre2')],
      11000
    );
    expect(r.get('fijo')).toBe(5000);
    expect(r.get('libre1')).toBe(3000);
    expect(r.get('libre2')).toBe(3000);
  });

  it('no reparte peso negativo cuando lo escrito a mano ya pasa el total', () => {
    const r = repartirPeso([linea('fijo', { manual_mlb: 12000 }), linea('libre')], 11000);
    expect(r.get('fijo')).toBe(12000);
    expect(r.get('libre')).toBe(0);
  });

  it('pondera correctamente cuando hay distintas cantidades de unidades con pista_mlb', () => {
    // 1 bolso de 3 lb (3000 mlb) y 10 termos de 1 lb (1000 mlb c/u = 10000 mlb)
    // Total peso estimado = 13000 mlb. Paquete real = 13000 mlb.
    const r = repartirPeso(
      [
        linea('bolso', { pista_mlb: 3000, unidades: 1 }),
        linea('termos', { pista_mlb: 1000, unidades: 10 }),
      ],
      13000
    );
    expect(r.get('bolso')).toBe(3000);
    expect(r.get('termos')).toBe(10000);
  });

  it('asigna peso equitativo a productos sin pista previa cuando hay otros con pista', () => {
    // Bolso con pista 2000 mlb (1 unidad) y producto nuevo sin pista (1 unidad)
    // El producto nuevo debe tomar el promedio (2000 mlb) y repartirse 50/50
    const r = repartirPeso(
      [
        linea('bolso', { pista_mlb: 2000, unidades: 1 }),
        linea('nuevo', { pista_mlb: 0, unidades: 1 }),
      ],
      4000
    );
    expect(r.get('bolso')).toBe(2000);
    expect(r.get('nuevo')).toBe(2000);
  });
});
