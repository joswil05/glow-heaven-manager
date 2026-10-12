/**
 * "Llegó un paquete" en el celular, igual de completo que el editor de la PC.
 *
 * Joswill (11/10): "el formulario de inventarios está demasiado limitado, debe
 * ser igual de funcional que el que tenemos en la app de windows". La cuenta
 * del paquete ya vive en el núcleo (`core/paquete.ts`); lo que se prueba acá
 * es lo que la hoja del celular arma con lo que escribe Ross: packs, impuesto
 * por línea, cantidades por talla, piezas de encargo, una línea editada que
 * conserva su precio, la corrección de un paquete que ya entró y la ficha de
 * un producto nuevo. Tiene que mandar los mismos campos que manda la PC
 * (`PaqueteEditor.armarInput`).
 */
import { describe, it, expect } from 'vitest';
import type { CompraLinea, ProductoConStock, VentaCompleta, VentaLinea, Lote } from '../src/shared/types';
import type { LineaCompraInput } from '../src/shared/ipc-contracts';
import { calcularPaquete, efectoDeEntradas, idLoteDeLinea } from '../src/core/paquete';
import {
  calcularVista,
  consecuenciasDeRecibir,
  efectosDelPaquete,
  claveDeProducto,
  fichaTieneDatos,
  fichaVacia,
  filasDeProducto,
  leerFicha,
  leerPieza,
  leerPiezasDeEncargo,
  lineaDeGuardada,
  piezasQuePuedenVenir,
  resumenParaRecibir,
  textosDeLinea,
  textosParaProducto,
  type TextosPieza,
} from '../mobile/src/lib/paquete-movil';

const BASE = { producto_id: 5, variante_id: 1, descripcion: 'Gloss', destino: 'INVENTARIO' as const };

function textos(parcial: Partial<TextosPieza>): TextosPieza {
  return { enPack: false, filas: [{ texto: '1' }], precio: '', unidadesPorPack: '5', pagoImpuesto: true, peso: '', ...parcial };
}

function producto(parcial: Partial<ProductoConStock> & Pick<ProductoConStock, 'id' | 'nombre'>): ProductoConStock {
  return {
    codigo: `P-${String(parcial.id).padStart(4, '0')}`,
    tiene_variantes: false,
    valor_inventario_usd_cents: 0,
    costo_unitario_usd_cents: 0,
    modo_precio: 'MARGEN',
    precio_venta_usd_cents: 0,
    stock_minimo: 2,
    peso_unitario_mlb: 0,
    activo: true,
    existencias: 0,
    ganancia_unitaria_usd_cents: 0,
    variantes: [{ id: 1, producto_id: parcial.id, existencias: 0, activo: true }],
    ...parcial,
  };
}

function guardada(parcial: Partial<CompraLinea> & Pick<CompraLinea, 'id' | 'descripcion'>): CompraLinea {
  return {
    compra_id: 4,
    cantidad: 1,
    precio_linea_usd_cents: 1000,
    tax_linea_usd_cents: 70,
    peso_linea_mlb: 0,
    envio_asignado_usd_cents: 0,
    otros_asignados_usd_cents: 0,
    costo_linea_usd_cents: 1070,
    costo_unitario_usd_cents: 1070,
    destino: 'INVENTARIO',
    orden: 0,
    ...parcial,
  };
}

describe('una pieza del paquete: lo mismo que arma la PC', () => {
  it('por unidad: cantidad por lo que pagó cada una, con impuesto y peso estimado', () => {
    const r = leerPieza(textos({ filas: [{ texto: '3' }], precio: '12.50' }), BASE);
    expect(r.errores).toEqual({});
    expect(r.lineas).toEqual([
      {
        ...BASE,
        cantidad: 3,
        precio_linea_usd_cents: 3750,
        exento: undefined,
        peso_linea_mlb: null,
        es_multipack: undefined,
        packs_comprados: undefined,
        unidades_por_pack: undefined,
        precio_por_pack_usd_cents: undefined,
      },
    ]);
  });

  it('en pack: los packs por las unidades de cada uno, y el precio por pack', () => {
    const r = leerPieza(textos({ enPack: true, filas: [{ texto: '2' }], unidadesPorPack: '5', precio: '20' }), BASE);
    expect(r.errores).toEqual({});
    expect(r.lineas[0]).toMatchObject({
      cantidad: 10,
      precio_linea_usd_cents: 4000,
      es_multipack: true,
      packs_comprados: 2,
      unidades_por_pack: 5,
      precio_por_pack_usd_cents: 2000,
    });
  });

  it('si la tienda no cobró impuesto queda exenta; el peso escrito va en milésimas de libra', () => {
    const r = leerPieza(textos({ precio: '10', pagoImpuesto: false, peso: '1,5' }), BASE);
    expect(r.lineas[0]).toMatchObject({ exento: true, peso_linea_mlb: 1500 });
  });

  it('con tallas: una línea por talla que vino, y el peso repartido por unidades sin perder una milésima', () => {
    const filas = [
      { variante_id: 1, nombre: 'S', texto: '2' },
      { variante_id: 2, nombre: 'M', texto: '' },
      { variante_id: 3, nombre: 'L', texto: '1' },
    ];
    const r = leerPieza(textos({ filas, precio: '10', peso: '1' }), { ...BASE, variante_id: undefined });
    expect(r.errores).toEqual({});
    expect(r.lineas.map((l) => [l.variante_id, l.cantidad, l.precio_linea_usd_cents, l.peso_linea_mlb])).toEqual([
      [1, 2, 2000, 667],
      [3, 1, 1000, 333],
    ]);
  });

  it('cada error va a su campo: cantidad, precio, unidades del pack y peso', () => {
    expect(leerPieza(textos({ filas: [{ texto: '0' }], precio: '5' }), BASE).errores.cantidad).toBeTruthy();
    expect(leerPieza(textos({ filas: [{ texto: '1.5' }], precio: '5' }), BASE).errores.cantidad).toBeTruthy();
    expect(leerPieza(textos({ precio: '' }), BASE).errores.precio).toBeTruthy();
    expect(leerPieza(textos({ precio: 'abc' }), BASE).errores.precio).toBeTruthy();
    expect(leerPieza(textos({ enPack: true, unidadesPorPack: '0', precio: '5' }), BASE).errores.unidadesPorPack).toBeTruthy();
    expect(leerPieza(textos({ precio: '5', peso: 'abc' }), BASE).errores.peso).toBeTruthy();
    expect(leerPieza(textos({ precio: '5', peso: '0' }), BASE).errores.peso).toBeTruthy();
  });

  it('con tallas, alguna tiene que traer algo; una cantidad mal escrita marca su fila', () => {
    const vacias = leerPieza(textos({ filas: [{ variante_id: 1, texto: '' }, { variante_id: 2, texto: '0' }], precio: '5' }), BASE);
    expect(vacias.errores.cantidad).toBeTruthy();
    expect(vacias.errores.fila).toBe(0);
    const mala = leerPieza(textos({ filas: [{ variante_id: 1, texto: '2' }, { variante_id: 2, texto: 'x' }], precio: '5' }), BASE);
    expect(mala.errores.fila).toBe(1);
    expect(mala.lineas).toEqual([]);
  });

  it('un producto con tallas arranca con una fila por talla activa; uno con pack arranca en pack', () => {
    const conTallas = producto({
      id: 7, nombre: 'Blusa', tiene_variantes: true,
      variantes: [
        { id: 1, producto_id: 7, talla: 'S', existencias: 0, activo: true },
        { id: 2, producto_id: 7, talla: 'M', color: 'Rojo', existencias: 0, activo: true },
        { id: 3, producto_id: 7, talla: 'XL', existencias: 0, activo: false },
      ],
    });
    expect(filasDeProducto(conTallas)).toEqual([
      { variante_id: 1, nombre: 'S', texto: '' },
      { variante_id: 2, nombre: 'M · Rojo', texto: '' },
    ]);
    const boxers = producto({ id: 8, nombre: 'Boxers', unidades_por_paquete: 3 });
    expect(textosParaProducto(boxers)).toMatchObject({ enPack: true, unidadesPorPack: '3', filas: [{ variante_id: 1, texto: '1' }] });
    expect(textosParaProducto(null)).toMatchObject({ enPack: false, filas: [{ texto: '1' }] });
  });
});

describe('editar una línea que ya está en el paquete', () => {
  const linea: LineaCompraInput = { id: 3, ...BASE, cantidad: 3, precio_linea_usd_cents: 1000, destino: 'INVENTARIO' };

  it('sin tocar el precio conserva el guardado: $10 entre 3 no vuelve como $9.99', () => {
    const t = textosDeLinea(linea);
    expect(t.precio).toBe('3.33');
    expect(leerPieza(t, linea, { original: linea }).lineas[0].precio_linea_usd_cents).toBe(1000);
    expect(leerPieza({ ...t, pagoImpuesto: false }, linea, { original: linea }).lineas[0]).toMatchObject({
      id: 3, precio_linea_usd_cents: 1000, exento: true,
    });
    expect(leerPieza({ ...t, precio: '4' }, linea, { original: linea }).lineas[0].precio_linea_usd_cents).toBe(1200);
  });

  it('una línea en pack vuelve en pack', () => {
    const pack: LineaCompraInput = { ...linea, cantidad: 10, precio_linea_usd_cents: 4000, es_multipack: true, packs_comprados: 2, unidades_por_pack: 5, precio_por_pack_usd_cents: 2000 };
    expect(textosDeLinea(pack)).toMatchObject({ enPack: true, filas: [{ variante_id: 1, texto: '2' }], unidadesPorPack: '5', precio: '20.00' });
  });

  it('en una corrección la cantidad ya entró: no se corrige', () => {
    const t = textosDeLinea(linea);
    const r = leerPieza({ ...t, filas: [{ ...t.filas[0], texto: '4' }] }, linea, { original: linea, cantidadFija: true });
    expect(r.errores.cantidad).toBeTruthy();
  });

  it('una línea guardada vuelve a la hoja como la escribió: el peso estimado no se toma por escrito', () => {
    const base = { id: 1, descripcion: 'Termo', producto_id: 2, variante_id: 1, cantidad: 2 };
    expect(lineaDeGuardada(guardada({ ...base, peso_linea_mlb: 800, peso_estimado: true })).peso_linea_mlb).toBeNull();
    expect(lineaDeGuardada(guardada({ ...base, peso_linea_mlb: 800, peso_estimado: false })).peso_linea_mlb).toBe(800);
    expect(lineaDeGuardada(guardada({ ...base, peso_linea_mlb: 800 })).peso_linea_mlb).toBe(800);
    expect(lineaDeGuardada(guardada({ ...base, peso_linea_mlb: 0 })).peso_linea_mlb).toBeNull();
    const l = lineaDeGuardada(guardada({ ...base, exento: true, es_multipack: true, packs_comprados: 1, unidades_por_pack: 2, precio_por_pack_usd_cents: 1000, producto_nombre: 'Termo Azul' }));
    expect(l).toEqual({
      id: 1, producto_id: 2, variante_id: 1, descripcion: 'Termo', cantidad: 2, precio_linea_usd_cents: 1000,
      exento: true, peso_linea_mlb: null, destino: 'INVENTARIO', venta_id: undefined, venta_linea_id: undefined,
      es_multipack: true, packs_comprados: 1, unidades_por_pack: 2, precio_por_pack_usd_cents: 1000,
    });
  });
});

describe('la cuenta en vivo usa la del núcleo', () => {
  const lineas: LineaCompraInput[] = [
    { id: 1, ...BASE, cantidad: 2, precio_linea_usd_cents: 2000, peso_linea_mlb: 1000, destino: 'INVENTARIO' },
    { id: 2, descripcion: 'Cartera', cantidad: 1, precio_linea_usd_cents: 3000, exento: true, peso_linea_mlb: null, destino: 'INVENTARIO' },
  ];
  const datos = { tax_bp: 700, envio_total_usd_cents: 1400, otros_costos_usd_cents: 300, tax_total_override_usd_cents: null, peso_total_mlb: 2000, pesoUnitario: () => 0 };

  it('da lo mismo que calcularPaquete, con la clave de cada línea', () => {
    const vista = calcularVista(lineas, datos);
    const nucleo = calcularPaquete(
      lineas.map((l) => ({ clave: String(l.id), producto_id: l.producto_id, destino: l.destino, cantidad: l.cantidad,
        precio_linea_usd_cents: l.precio_linea_usd_cents, exento: l.exento, peso_manual_mlb: l.peso_linea_mlb })),
      datos
    );
    expect(vista).toEqual(nucleo);
    expect(vista.total_pagado_usd_cents).toBe(2000 + 3000 + 140 + 1400 + 300);
  });

  it('al corregir, una línea a la que no se le tocó precio ni impuesto conserva el impuesto que tenía', () => {
    const originales = new Map([[1, guardada({ id: 1, descripcion: 'Gloss', cantidad: 2, precio_linea_usd_cents: 2000, tax_linea_usd_cents: 138 })]]);
    expect(calcularVista(lineas, { ...datos, originales }).lineas[0].tax_linea_usd_cents).toBe(138);
    const otroPrecio = [{ ...lineas[0], precio_linea_usd_cents: 2100 }, lineas[1]];
    expect(calcularVista(otroPrecio, { ...datos, originales }).lineas[0].tax_linea_usd_cents).toBe(147);
  });
});

describe('cómo queda cada producto: el precio antes y después', () => {
  const ctx = { categorias: [{ id: 3, nombre: 'Maquillaje', margen_defecto_bp: 5000, activa: true }], margen_defecto_bp: 4500, paso_redondeo_usd_cents: 100 };
  const datos = { tax_bp: 700, envio_total_usd_cents: 0, otros_costos_usd_cents: 0, tax_total_override_usd_cents: null, peso_total_mlb: 0, pesoUnitario: () => 0 };

  it('un producto que ya existe: lo mismo que efectoDeEntradas, con su margen de categoría', () => {
    const gloss = producto({ id: 5, nombre: 'Gloss', categoria_id: 3, precio_venta_usd_cents: 900 });
    const lineas: LineaCompraInput[] = [{ id: 1, ...BASE, cantidad: 2, precio_linea_usd_cents: 1000, destino: 'INVENTARIO' }];
    const calc = calcularVista(lineas, datos);
    const efectos = efectosDelPaquete(lineas, calc, [gloss], ctx);
    const esperado = efectoDeEntradas(
      { existencias: 0, valor_inventario_usd_cents: 0, costo_unitario_usd_cents: 0, precio_venta_usd_cents: 900, modo_precio: 'MARGEN', margen_bp: 5000, lotes: undefined },
      [{ cantidad: 2, costo_linea_usd_cents: calc.lineas[0].costo_linea_usd_cents, variante_id: 1 }],
      100
    );
    expect(claveDeProducto(lineas[0], [gloss])).toBe('p5');
    expect(efectos.get('p5')?.precio_despues_usd_cents).toBe(esperado.precio_despues_usd_cents);
    expect(efectos.get('p5')?.precio_antes_usd_cents).toBe(900);
  });

  it('un precio escrito a mano no se toca, y avisa si quedó debajo del costo', () => {
    const fijo = producto({ id: 5, nombre: 'Gloss', modo_precio: 'MANUAL', precio_manual_usd_cents: 500, precio_venta_usd_cents: 500 });
    const lineas: LineaCompraInput[] = [{ id: 1, ...BASE, cantidad: 1, precio_linea_usd_cents: 1000, destino: 'INVENTARIO' }];
    const e = efectosDelPaquete(lineas, calcularVista(lineas, datos), [fijo], ctx).get('p5')!;
    expect(e.precio_despues_usd_cents).toBe(500);
    expect(e.bajo_costo).toBe(true);
  });

  it('un producto que se crea al recibir sale con el margen de siempre; si ya existe con ese nombre, es ése', () => {
    const lineas: LineaCompraInput[] = [{ id: 1, descripcion: 'Cartera Nueva', cantidad: 1, precio_linea_usd_cents: 1000, destino: 'INVENTARIO' }];
    const calc = calcularVista(lineas, datos);
    const nuevo = efectosDelPaquete(lineas, calc, [], ctx).get('ncartera nueva')!;
    expect(nuevo.existencias_antes).toBe(0);
    expect(nuevo.precio_despues_usd_cents).toBe(1600); // $10.70 + 45% = $15.52, hacia arriba
    const existente = producto({ id: 9, nombre: 'cartera nueva', precio_venta_usd_cents: 2000, modo_precio: 'MANUAL', precio_manual_usd_cents: 2000 });
    expect(claveDeProducto(lineas[0], [existente])).toBe('p9');
    expect(efectosDelPaquete(lineas, calc, [existente], ctx).get('p9')?.precio_despues_usd_cents).toBe(2000);
  });

  it('al corregir, el cambio de costo va al lote de la línea, sólo en lo que queda de él', () => {
    const lote: Lote = {
      id: idLoteDeLinea(4, 1), variante_id: 1, cantidad: 1, valor_usd_cents: 1070, cantidad_inicial: 2,
      costo_unitario_usd_cents: 1070, fecha: '2026-10-01', orden: 40001, origen: 'PAQUETE', compra_id: 4,
      compra_codigo: 'PQ-0004', compra_linea_id: 1, vendidas: 1, ingreso_usd_cents: 2000, costo_vendido_usd_cents: 1070, bajas: 0,
    };
    const gloss = producto({ id: 5, nombre: 'Gloss', existencias: 1, valor_inventario_usd_cents: 1070, costo_unitario_usd_cents: 1070, precio_venta_usd_cents: 1600, lotes: [lote],
      variantes: [{ id: 1, producto_id: 5, existencias: 1, activo: true }] });
    const original = guardada({ id: 1, descripcion: 'Gloss', producto_id: 5, variante_id: 1, cantidad: 2, precio_linea_usd_cents: 2000, tax_linea_usd_cents: 140, costo_linea_usd_cents: 2140, costo_unitario_usd_cents: 1070 });
    const originales = new Map([[1, original]]);
    const corregida: LineaCompraInput[] = [{ ...lineaDeGuardada(original), precio_linea_usd_cents: 3000 }];
    const calc = calcularVista(corregida, { ...datos, originales });
    const e = efectosDelPaquete(corregida, calc, [gloss], ctx, { compra_id: 4, originales }).get('p5')!;
    expect(e.existencias_antes).toBe(1);
    expect(e.existencias_despues).toBe(1);
    // La línea pasó de $21.40 a $32.10: a la unidad que queda le toca la mitad.
    expect(e.valor_despues_usd_cents).toBe(1070 + 535);
  });
});

describe('antes de pasarlo al inventario: qué entra', () => {
  it('cuenta unidades y productos de la bodega, las piezas de encargo y los precios que cambian', () => {
    const lineas: LineaCompraInput[] = [
      { id: 1, ...BASE, cantidad: 2, precio_linea_usd_cents: 1000, destino: 'INVENTARIO' },
      { id: 2, ...BASE, variante_id: 2, cantidad: 1, precio_linea_usd_cents: 500, destino: 'INVENTARIO' },
      { id: 3, descripcion: 'Sandalias', cantidad: 1, precio_linea_usd_cents: 2000, destino: 'ENCARGO', venta_id: 8, venta_linea_id: 1 },
    ];
    const datos = { tax_bp: 700, envio_total_usd_cents: 0, otros_costos_usd_cents: 0, tax_total_override_usd_cents: null, peso_total_mlb: 0, pesoUnitario: () => 0 };
    const calc = calcularVista(lineas, datos);
    const efectos = new Map([['p5', { precio_antes_usd_cents: 900, precio_despues_usd_cents: 1100 } as never]]);
    const r = resumenParaRecibir(lineas, calc, efectos);
    expect(r).toEqual({ unidades: 3, productos: 1, piezasEncargo: 1, total_usd_cents: calc.total_pagado_usd_cents, cambianDePrecio: 1 });
    expect(consecuenciasDeRecibir(r)).toEqual([
      `Entran 3 unidades de 1 producto por $${(calc.total_pagado_usd_cents / 100).toFixed(2)}.`,
      '1 producto cambia de precio.',
      '1 pieza va para un encargo.',
    ]);
  });
});

describe('piezas de encargo que pueden venir en el paquete', () => {
  const pieza = (parcial: Partial<VentaLinea> & Pick<VentaLinea, 'id' | 'descripcion'>): VentaLinea => ({
    venta_id: 8, cantidad: 1, precio_unitario_usd_cents: 3000, costo_unitario_usd_cents: 0, subtotal_usd_cents: 3000,
    costo_total_usd_cents: 0, es_paquete: false, orden: 0, ...parcial,
  });
  const venta = {
    id: 8,
    lineas: [
      pieza({ id: 1, descripcion: 'Por comprar' }),
      pieza({ id: 2, descripcion: 'Comprada', comprado_el: '2026-10-05' }),
      pieza({ id: 3, descripcion: 'De la bodega', producto_id: 5 }),
      pieza({ id: 4, descripcion: 'No se consiguió', descartada_el: '2026-10-03' }),
      pieza({ id: 5, descripcion: 'En otro paquete', compra_id: 9 }),
      pieza({ id: 6, descripcion: 'En éste', compra_id: 4 }),
      pieza({ id: 7, descripcion: 'Ya en la lista' }),
    ],
  } as unknown as VentaCompleta;
  const enLista: LineaCompraInput[] = [{ id: 1, descripcion: 'Ya en la lista', cantidad: 1, precio_linea_usd_cents: 0, destino: 'ENCARGO', venta_id: 8, venta_linea_id: 7 }];

  it('sólo lo que se compró o falta comprar, nunca lo de la bodega, lo descartado ni lo de otro paquete', () => {
    expect(piezasQuePuedenVenir(venta, enLista, 4).map((p) => p.id)).toEqual([1, 2, 6]);
    expect(piezasQuePuedenVenir(venta, enLista, 4, true).map((p) => p.id)).toEqual([2]);
  });

  it('cada pieza elegida pide lo que costó; el impuesto se puede apagar', () => {
    const [porComprar, comprada] = [venta.lineas[0], { ...venta.lineas[1], cantidad: 2 }];
    const r = leerPiezasDeEncargo([
      { venta_id: 8, pieza: porComprar, precio: '', pagoImpuesto: true },
      { venta_id: 8, pieza: comprada, precio: '12', pagoImpuesto: false },
    ]);
    expect(r.errores).toEqual({ '8:1': expect.any(String) });
    const ok = leerPiezasDeEncargo([{ venta_id: 8, pieza: comprada, precio: '12', pagoImpuesto: false }]);
    expect(ok.errores).toEqual({});
    expect(ok.lineas).toEqual([
      { descripcion: 'Comprada', cantidad: 2, precio_linea_usd_cents: 2400, exento: true, peso_linea_mlb: null, destino: 'ENCARGO', venta_id: 8, venta_linea_id: 2 },
    ]);
  });
});

describe('la ficha de un producto nuevo', () => {
  it('con sólo el nombre se crea al recibir; con cualquier dato más, se crea al agregarlo', () => {
    expect(fichaTieneDatos(fichaVacia())).toBe(false);
    expect(fichaTieneDatos({ ...fichaVacia(), categoria_id: 3 })).toBe(true);
    expect(fichaTieneDatos({ ...fichaVacia(), tieneTallas: true })).toBe(true);
    expect(fichaTieneDatos({ ...fichaVacia(), modo: 'MANUAL' })).toBe(true);
    expect(fichaTieneDatos({ ...fichaVacia(), sePackea: true })).toBe(true);
    expect(fichaTieneDatos({ ...fichaVacia(), notas: 'Tienda Ross' })).toBe(true);
  });

  it('arma lo mismo que la ficha de la PC (ProductoModal)', () => {
    const r = leerFicha('boxers calvin klein', {
      ...fichaVacia(), categoria_id: 3, tieneTallas: true,
      tallas: [{ talla: ' M ', color: '', cantidad: '2' }, { talla: '', color: 'Negro', cantidad: '' }],
      modo: 'MARGEN', margen: '40', sePackea: true, unidadesPorPack: '3', notas: ' Tienda ',
    }, 2);
    expect(r.errores).toEqual({});
    expect(r.input).toEqual({
      nombre: 'Boxers Calvin Klein', categoria_id: 3, tiene_variantes: true,
      variantes: [{ talla: 'M', color: undefined }, { talla: undefined, color: 'Negro' }],
      modo_precio: 'MARGEN', margen_bp: 4000, multiplicador_bp: undefined, precio_manual_usd_cents: undefined,
      stock_minimo: 2, unidades_por_paquete: 3, foto: undefined, notas: 'Tienda',
    });
    expect(leerFicha('Termo', { ...fichaVacia(), modo: 'MULTIPLICADOR', multiplicador: '2.5' }, 2).input).toMatchObject({ modo_precio: 'MULTIPLICADOR', multiplicador_bp: 25000, margen_bp: undefined });
    expect(leerFicha('Termo', { ...fichaVacia(), modo: 'MANUAL', precioFijo: '18' }, 2).input).toMatchObject({ modo_precio: 'MANUAL', precio_manual_usd_cents: 1800 });
  });

  it('cada error en su campo', () => {
    expect(leerFicha('  ', fichaVacia(), 2).errores.nombre).toBeTruthy();
    expect(leerFicha('Termo', { ...fichaVacia(), modo: 'MANUAL', precioFijo: '' }, 2).errores.precio).toBeTruthy();
    expect(leerFicha('Termo', { ...fichaVacia(), modo: 'MANUAL', precioFijo: '0' }, 2).errores.precio).toBeTruthy();
    expect(leerFicha('Termo', { ...fichaVacia(), margen: 'abc' }, 2).errores.margen).toBeTruthy();
    expect(leerFicha('Termo', { ...fichaVacia(), modo: 'MULTIPLICADOR', multiplicador: '0' }, 2).errores.multiplicador).toBeTruthy();
    expect(leerFicha('Termo', { ...fichaVacia(), sePackea: true, unidadesPorPack: '1' }, 2).errores.pack).toBeTruthy();
    const talla = leerFicha('Blusa', { ...fichaVacia(), tieneTallas: true, tallas: [{ talla: 'S', color: '', cantidad: '1' }, { talla: ' ', color: '', cantidad: '' }] }, 2);
    expect(talla.errores.tallas).toBeTruthy();
    expect(talla.errores.tallaVacia).toBe(1);
    expect(leerFicha('Blusa', { ...fichaVacia(), tieneTallas: true, tallas: [] }, 2).errores.tallas).toBeTruthy();
  });
});
