/**
 * El motor de lotes, sin Firestore.
 *
 * Los números son los del ejemplo que se le mostró a Joswill: boxers que
 * llegan en agosto a $8.49 y en septiembre a $6.35.
 */
import { describe, it, expect } from 'vitest';
import {
  crearLote,
  sacarFIFO,
  devolverConsumos,
  corregirLote,
  costoBase,
  costoDeLasProximas,
  normalizarLotes,
  camposDesdeLotes,
  valorDeLotes,
  unidadesDeLotes,
  costoDeSacar,
  type Lote,
} from '@core/lotes';
import { lotesDeLinea, efectoDeCorreccion } from '@core/paquete';

const lote = (id: string, cantidad: number, valor: number, fecha: string, variante_id = 1, orden = 0): Lote =>
  crearLote({ id, variante_id, cantidad, valor_usd_cents: valor, fecha, orden, origen: 'PAQUETE' });

/** 6 boxers de agosto a $8.49 (ya se vendieron 2) y 10 de septiembre a $6.35. */
const boxers = (): Lote[] => [
  lote('pq1-l1', 4, 4 * 849, '2026-08-10', 1, 1001),
  lote('pq2-l1', 10, 6350, '2026-09-20', 1, 2001),
];

describe('primero sale lo más viejo', () => {
  it('las primeras ventas se miden contra el lote de agosto, no contra un promedio', () => {
    const r = sacarFIFO(boxers(), 1, 4, 'VENTA', 4 * 1274);
    expect(r.costo_usd_cents).toBe(4 * 849); // hoy: 4 × $6.96 = $27.84
    expect(r.consumos.map((c) => c.lote_id)).toEqual(['pq1-l1']);
    expect(unidadesDeLotes(r.lotes)).toBe(10);
    expect(valorDeLotes(r.lotes)).toBe(6350);
  });

  it('una venta que cruza dos lotes se lleva el costo de cada uno', () => {
    const r = sacarFIFO(boxers(), 1, 5, 'VENTA', 5 * 1000);
    expect(r.costo_usd_cents).toBe(4 * 849 + 635);
    expect(r.consumos.map((c) => [c.lote_id, c.cantidad])).toEqual([
      ['pq1-l1', 4],
      ['pq2-l1', 1],
    ]);
    // Lo cobrado se reparte por unidades entre los dos lotes.
    expect(r.consumos.map((c) => c.ingreso_usd_cents)).toEqual([4000, 1000]);
  });

  it('el valor de la bodega sigue siendo la suma exacta', () => {
    const antes = valorDeLotes(boxers());
    const r = sacarFIFO(boxers(), 1, 7, 'VENTA', 0);
    expect(r.costo_usd_cents + valorDeLotes(r.lotes)).toBe(antes);
  });

  it('una talla no le saca unidades a otra', () => {
    const lotes = [lote('a', 3, 3000, '2026-08-01', 1), lote('b', 3, 3300, '2026-07-01', 2)];
    const r = sacarFIFO(lotes, 1, 2, 'VENTA', 0);
    expect(r.consumos.every((c) => c.variante_id === 1)).toBe(true);
    expect(unidadesDeLotes(r.lotes, 2)).toBe(3);
  });

  it('vaciar un lote de $10.00 en tres unidades no pierde ni inventa centavos', () => {
    let lotes = [lote('x', 3, 1000, '2026-09-01')];
    const costos: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = sacarFIFO(lotes, 1, 1, 'VENTA', 0);
      costos.push(r.costo_usd_cents);
      lotes = r.lotes;
    }
    expect(costos.reduce((s, c) => s + c, 0)).toBe(1000);
    expect(valorDeLotes(lotes)).toBe(0);
    expect(costoDeSacar(3, 1000, 1)).toBe(333);
  });

  it('pedir más de lo que hay saca lo que hay y dice cuánto faltó', () => {
    const r = sacarFIFO(boxers(), 1, 20, 'VENTA', 0);
    expect(r.retiradas).toBe(14);
    expect(r.faltantes).toBe(6);
    expect(valorDeLotes(r.lotes)).toBe(0);
  });

  it('un lote agotado no se borra: guarda lo que dejó', () => {
    const r = sacarFIFO(boxers(), 1, 4, 'VENTA', 4 * 1274);
    const agosto = r.lotes.find((l) => l.id === 'pq1-l1')!;
    expect(agosto.cantidad).toBe(0);
    expect(agosto.vendidas).toBe(4);
    expect(agosto.ingreso_usd_cents).toBe(4 * 1274);
    expect(agosto.costo_vendido_usd_cents).toBe(4 * 849);
  });

  it('una baja cuenta como baja, no como venta', () => {
    const r = sacarFIFO(boxers(), 1, 1, 'BAJA');
    const agosto = r.lotes.find((l) => l.id === 'pq1-l1')!;
    expect(agosto.bajas).toBe(1);
    expect(agosto.vendidas).toBe(0);
  });
});

describe('devoluciones', () => {
  it('anular devuelve cada unidad a su lote, con su costo y descontando lo vendido', () => {
    const venta = sacarFIFO(boxers(), 1, 5, 'VENTA', 5000);
    const vuelta = devolverConsumos(venta.lotes, venta.consumos, 'VENTA');
    expect(vuelta.find((l) => l.id === 'pq1-l1')).toMatchObject({ cantidad: 4, valor_usd_cents: 3396, vendidas: 0, ingreso_usd_cents: 0 });
    expect(vuelta.find((l) => l.id === 'pq2-l1')).toMatchObject({ cantidad: 10, valor_usd_cents: 6350, vendidas: 0 });
  });

  it('si el lote ya no está, se rearma con lo que guardó la venta', () => {
    const venta = sacarFIFO(boxers(), 1, 2, 'VENTA', 2000);
    const sinElLote = venta.lotes.filter((l) => l.id !== 'pq1-l1');
    const vuelta = devolverConsumos(sinElLote, venta.consumos, 'VENTA');
    const rearmado = vuelta.find((l) => l.id === 'pq1-l1')!;
    expect(rearmado).toMatchObject({ cantidad: 2, valor_usd_cents: 2 * 849, fecha: '2026-08-10' });
    // Y vuelve a salir primero, como correspondía.
    expect(vuelta[0].id).toBe('pq1-l1');
  });
});

describe('corregir el costo de un paquete', () => {
  it('le toca sólo a lo que queda del lote', () => {
    // Línea de 10 unidades; quedan 4. La línea subió $0.78.
    const lotes = [lote('pq3-l2', 4, 4 * 1126, '2026-09-24')];
    const r = corregirLote(lotes, 'pq3-l2', 78, 10);
    expect(r.aplicado_usd_cents).toBe(31); // round(78 × 4 / 10)
    expect(r.lotes[0].valor_usd_cents).toBe(4 * 1126 + 31);
  });

  it('sin nada en el lote, la corrección no mueve la bodega', () => {
    const lotes = [lote('pq3-l2', 0, 0, '2026-09-24')];
    expect(corregirLote(lotes, 'pq3-l2', 500, 10).aplicado_usd_cents).toBe(0);
  });

  it('sin vender nada, la diferencia entra entera', () => {
    const lotes = [lote('pq3-l2', 10, 11260, '2026-09-24')];
    expect(corregirLote(lotes, 'pq3-l2', 78, 10).aplicado_usd_cents).toBe(78);
  });
});

describe('el precio se calcula sobre el lote más caro que queda', () => {
  it('con agosto adentro manda $8.49', () => {
    expect(costoBase(boxers())).toBe(849);
  });

  it('cuando se acaba agosto, baja a $6.35', () => {
    expect(costoBase(sacarFIFO(boxers(), 1, 4, 'VENTA', 0).lotes)).toBe(635);
  });

  it('sin nada en bodega no hay base', () => {
    expect(costoBase([])).toBe(0);
  });

  it('la ganancia que se anticipa usa las unidades que van a salir', () => {
    expect(costoDeLasProximas(boxers(), 1, 1)).toBe(849);
    expect(costoDeLasProximas(boxers(), 1, 5)).toBe(4 * 849 + 635);
  });
});

describe('la migración', () => {
  it('un producto sin lotes recibe un saldo por talla, con la bodega repartida por unidades', () => {
    const r = normalizarLotes(
      {
        variantes: [
          { id: 1, existencias: 2 },
          { id: 2, existencias: 3 },
        ],
        valor_inventario_usd_cents: 1001,
        paquete_id: 1,
      },
      'PQ-0001'
    );
    expect(r.cambiado).toBe(true);
    expect(r.lotes.map((l) => [l.variante_id, l.cantidad, l.origen, l.compra_codigo])).toEqual([
      [1, 2, 'SALDO', 'PQ-0001'],
      [2, 3, 'SALDO', 'PQ-0001'],
    ]);
    expect(valorDeLotes(r.lotes)).toBe(1001);
  });

  it('aplicada dos veces no cambia nada la segunda', () => {
    const p = { variantes: [{ id: 1, existencias: 5 }], valor_inventario_usd_cents: 3703 };
    const primera = normalizarLotes(p);
    const segunda = normalizarLotes({ ...p, lotes: primera.lotes });
    expect(segunda.cambiado).toBe(false);
  });

  it('si la app vieja vendió, las unidades salen del lote más viejo y el valor cuadra', () => {
    // Los lotes dicen 14; la app 2.13 vendió 2 al promedio y guardó 12 y $83.54.
    const r = normalizarLotes({
      variantes: [{ id: 1, existencias: 12 }],
      valor_inventario_usd_cents: 8354,
      lotes: boxers(),
    });
    expect(unidadesDeLotes(r.lotes)).toBe(12);
    expect(r.lotes.find((l) => l.id === 'pq1-l1')!.cantidad).toBe(2);
    expect(valorDeLotes(r.lotes)).toBe(8354);
  });

  it('si faltan unidades en los lotes, entran como saldo', () => {
    const r = normalizarLotes({
      variantes: [{ id: 1, existencias: 16 }],
      valor_inventario_usd_cents: 9746 + 1400,
      lotes: boxers(),
    });
    expect(unidadesDeLotes(r.lotes)).toBe(16);
    expect(r.lotes.find((l) => l.origen === 'SALDO')!.valor_usd_cents).toBe(1400);
    expect(valorDeLotes(r.lotes)).toBe(9746 + 1400);
  });

  it('un producto viejo sin valor anotado vale sus existencias por su costo', () => {
    const r = normalizarLotes({
      variantes: [{ id: 1, existencias: 3 }],
      valor_inventario_usd_cents: 0,
      costo_unitario_usd_cents: 500,
    });
    expect(valorDeLotes(r.lotes)).toBe(1500);
  });
});

describe('lo que el producto escribe', () => {
  it('existencias, valor y costo salen de los lotes', () => {
    const lotes = [lote('a', 4, 3396, '2026-08-10', 1), lote('b', 2, 1270, '2026-09-20', 2)];
    const r = camposDesdeLotes(
      [
        { id: 1, existencias: 99 },
        { id: 2, existencias: 99 },
      ],
      lotes,
      0
    );
    expect(r.variantes.map((v) => v.existencias)).toEqual([4, 2]);
    expect(r.valor_inventario_usd_cents).toBe(4666);
    expect(r.costo_unitario_usd_cents).toBe(849);
  });

  it('agotado, se queda con el último costo conocido', () => {
    expect(camposDesdeLotes([{ id: 1, existencias: 0 }], [], 849).costo_unitario_usd_cents).toBe(849);
  });
});

describe('una línea repartida entre tallas', () => {
  // Una línea de antes de la 2.14 cuyas unidades se repartieron después entre
  // dos tallas queda en un lote por talla. El paquete las cuenta juntas y una
  // corrección se reparte entre las dos.
  const partida = (): Lote[] => [
    crearLote({ id: 'pq1-l12', variante_id: 1, cantidad: 3, valor_usd_cents: 1582, fecha: '2026-09-16', orden: 10012, origen: 'PAQUETE', compra_id: 1, compra_linea_id: 12 }),
    crearLote({ id: 'pq1-l12-t2', variante_id: 2, cantidad: 3, valor_usd_cents: 1581, fecha: '2026-09-16', orden: 10012, origen: 'PAQUETE', compra_id: 1, compra_linea_id: 12 }),
  ];

  it('los dos lotes son de la línea', () => {
    expect(lotesDeLinea(partida(), 1, 12).map((l) => l.id)).toEqual(['pq1-l12', 'pq1-l12-t2']);
  });

  it('corregir la línea mueve los dos, en total lo que cambió', () => {
    const r = efectoDeCorreccion(
      { lotes: partida(), existencias: 6, valor_inventario_usd_cents: 3163, costo_unitario_usd_cents: 527, precio_venta_usd_cents: 800, modo_precio: 'MANUAL', margen_bp: 5000, precio_manual_usd_cents: 800 },
      lotesDeLinea(partida(), 1, 12).map((l) => ({ unidades_de_la_linea: 6, diferencia_usd_cents: 600, lote_id: l.id })),
      [],
      100
    );
    expect(r.aplicado_usd_cents).toBe(600);
    expect(valorDeLotes(r.lotes_despues)).toBe(3163 + 600);
  });

  it('sin lotes propios, es el saldo de siempre', () => {
    const saldo = normalizarLotes({ variantes: [{ id: 1, existencias: 2 }], valor_inventario_usd_cents: 1000, paquete_id: 1 }).lotes;
    expect(lotesDeLinea(saldo, 1, 5)).toHaveLength(1);
    expect(lotesDeLinea(saldo, 1, 5)[0].origen).toBe('SALDO');
  });
});
