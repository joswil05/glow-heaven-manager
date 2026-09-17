/**
 * Que el costo incluya todo lo que salió del bolsillo.
 *
 * El caso real que originó esto: 22 productos, 45 unidades, $77 de flete que
 * nunca se repartió y un 7% de impuesto que sólo se aplicaba a los packs. La
 * aplicación decía que la bodega valía $279.65 y que se iban a ganar $273.35.
 * Los números de verdad eran $370.16 y $182.84 — la ganancia inflada un 49%.
 *
 * Lo que se prueba acá no es que la suma dé: es que NO SE PIERDA NI UN CENTAVO
 * al repartir, porque un reparto que no cuadra deja plata sin dueño y eso no se
 * ve en ninguna pantalla.
 */
import { describe, it, expect } from 'vitest';
import { desglosarCosto, repartirFlete, fletePorUnidad } from '../src/core/costo-producto';

describe('el costo de una unidad', () => {
  it('suma el impuesto de la tienda y la parte del flete', () => {
    // Pack de Talladores, el caso real: $17.00 el pack de 5 → $3.40 la unidad.
    const d = desglosarCosto({ base_usd_cents: 340, tax_bp: 700, flete_usd_cents: 171 });

    expect(d.base_usd_cents).toBe(340);
    expect(d.tax_usd_cents).toBe(24); // 7% de 3.40 = 0.238 → 24 centavos
    expect(d.flete_usd_cents).toBe(171);
    expect(d.total_usd_cents).toBe(535); // $5.35, contra los $3.64 que decía antes
  });

  it('sin flete sigue cobrando el impuesto', () => {
    // Es el caso de un producto cargado a mano sin paquete: el impuesto va
    // igual, porque se pagó igual.
    const d = desglosarCosto({ base_usd_cents: 2500, tax_bp: 700 });
    expect(d.tax_usd_cents).toBe(175);
    expect(d.total_usd_cents).toBe(2675);
  });

  it('con el impuesto en cero, el costo es el precio más el flete', () => {
    const d = desglosarCosto({ base_usd_cents: 1000, tax_bp: 0, flete_usd_cents: 171 });
    expect(d.tax_usd_cents).toBe(0);
    expect(d.total_usd_cents).toBe(1171);
  });

  it('usa el impuesto configurado, no uno fijo', () => {
    // El 7% estaba clavado en el código y se ignoraba el de Configuración.
    expect(desglosarCosto({ base_usd_cents: 1000, tax_bp: 700 }).tax_usd_cents).toBe(70);
    expect(desglosarCosto({ base_usd_cents: 1000, tax_bp: 1000 }).tax_usd_cents).toBe(100);
    expect(desglosarCosto({ base_usd_cents: 1000, tax_bp: 0 }).tax_usd_cents).toBe(0);
  });

  it('nada puede quedar en negativo ni con fracciones de centavo', () => {
    const d = desglosarCosto({ base_usd_cents: -500, tax_bp: 700, flete_usd_cents: -10 });
    expect(d.base_usd_cents).toBe(0);
    expect(d.total_usd_cents).toBe(0);
  });
});

describe('repartir el flete del paquete', () => {
  it('reparte el TOTAL de cada producto, no el costo por unidad', () => {
    // Guardar el total y no el por unidad es lo que hace que la cuenta cierre:
    // $77.00 entre 45 unidades da $1.7111… y en centavos enteros se pierden
    // cinco centavos que nadie ve irse.
    const r = repartirFlete(7700, [
      { producto_id: 1, unidades: 20 },
      { producto_id: 2, unidades: 20 },
      { producto_id: 3, unidades: 5 },
    ]);

    const total = (r.get(1) ?? 0) + (r.get(2) ?? 0) + (r.get(3) ?? 0);
    expect(total, 'el flete repartido tiene que dar el flete pagado, exacto').toBe(7700);
  });

  it('cuadra exacto aunque la división no sea redonda', () => {
    const productos = [
      { producto_id: 1, unidades: 1 },
      { producto_id: 2, unidades: 1 },
      { producto_id: 3, unidades: 1 },
    ];
    const r = repartirFlete(1000, productos);
    const total = productos.reduce((s, p) => s + (r.get(p.producto_id) ?? 0), 0);
    expect(total).toBe(1000);
  });

  it('el caso real: $77 entre 45 unidades, sin perder un centavo', () => {
    const productos = [
      { producto_id: 1, unidades: 6 },
      { producto_id: 2, unidades: 3 },
      { producto_id: 3, unidades: 3 },
      { producto_id: 4, unidades: 5 },
      { producto_id: 5, unidades: 5 },
      { producto_id: 6, unidades: 23 },
    ];
    const r = repartirFlete(7700, productos);
    const total = productos.reduce((s, p) => s + (r.get(p.producto_id) ?? 0), 0);

    expect(total, 'antes se perdían 5 centavos acá').toBe(7700);
  });

  it('reparte por peso cuando TODOS los productos lo tienen', () => {
    // Una cartera pesada carga más flete que un labial, que es como cobra el
    // courier.
    const r = repartirFlete(1000, [
      { producto_id: 1, unidades: 1, peso_unitario_mlb: 3000 }, // 3 lb
      { producto_id: 2, unidades: 1, peso_unitario_mlb: 1000 }, // 1 lb
    ]);

    expect(r.get(1)).toBe(750);
    expect(r.get(2)).toBe(250);
  });

  it('si a uno le falta el peso, reparte por unidades y no mezcla criterios', () => {
    // Mezclar los dos repartiría mal sin que se note: el que no tiene peso
    // quedaría en cero flete.
    const r = repartirFlete(1000, [
      { producto_id: 1, unidades: 1, peso_unitario_mlb: 3000 },
      { producto_id: 2, unidades: 1, peso_unitario_mlb: 0 },
    ]);

    expect(r.get(1)).toBe(500);
    expect(r.get(2)).toBe(500);
  });

  it('un producto agotado no se lleva flete', () => {
    // Si se lo llevara, esa plata desaparecería: no hay unidades sobre las
    // cuales recuperarla.
    const r = repartirFlete(1000, [
      { producto_id: 1, unidades: 0 },
      { producto_id: 2, unidades: 10 },
    ]);

    expect(r.get(1)).toBe(0);
    expect(r.get(2)).toBe(1000);
  });

  it('sin flete, nadie carga nada', () => {
    const r = repartirFlete(0, [{ producto_id: 1, unidades: 5 }]);
    expect(r.get(1)).toBe(0);
  });

  it('un paquete sin nada adentro no rompe', () => {
    expect(repartirFlete(7700, []).size).toBe(0);
  });
});

describe('el flete por unidad, para mostrar', () => {
  it('es una división del total, no un dato guardado', () => {
    expect(fletePorUnidad(7700, 45)).toBe(171);
    expect(fletePorUnidad(1000, 10)).toBe(100);
  });

  it('sin unidades no divide por cero', () => {
    expect(fletePorUnidad(1000, 0)).toBe(0);
  });
});
