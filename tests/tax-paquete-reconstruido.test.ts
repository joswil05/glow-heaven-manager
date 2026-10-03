import { beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reiniciarFirestoreFalso, volcar } from './firestore-fake';
import { aplicarLote } from '../src/main/firebase/client';
import { ComprasRepoFirestore as Compras } from '../src/main/firebase/repositories/compras.repo';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { ProductosRepoFirestore as Productos } from '../src/main/firebase/repositories/productos.repo';
import { calcularPaquete } from '../src/core/paquete';
import { hoyISO } from '../src/core/fechas';

const g = () => randomUUID();
const fecha = hoyISO();

beforeEach(async () => {
  reiniciarFirestoreFalso();
  Parametros.invalidarCache();
  await Parametros.getParametros();
  await Parametros.getCategorias();
});

async function reconstruirPaqueteViejo() {
  await aplicarLote([
    { coleccion: 'compras', id: 1, merge: false, datos: {
      id: 1, codigo: 'PQ-0001', fecha, estado: 'RECIBIDA', activo: true,
      envio_total_usd_cents: 200, otros_costos_usd_cents: 0,
      tax_total_override_usd_cents: 0, subtotal_productos_usd_cents: 0,
      tax_total_usd_cents: 0, total_usd_cents: 200, peso_total_mlb: 1000,
      tasa_cambio_cents: 3662, lineas: [],
    } },
    { coleccion: 'productos', id: 101, merge: false, datos: {
      id: 101, codigo: 'P-0101', nombre: 'Perfume prueba tax', activo: true,
      tiene_variantes: false, variantes: [{ id: 1, producto_id: 101, existencias: 2, activo: true }],
      valor_inventario_usd_cents: 2340, costo_unitario_usd_cents: 1170,
      costo_base_unitario_usd_cents: 1070, precio_tienda_unitario_usd_cents: 1000,
      flete_total_usd_cents: 200, modo_precio: 'MANUAL', precio_venta_usd_cents: 2000,
      precio_manual_usd_cents: 2000, stock_minimo: 2, peso_unitario_mlb: 0,
      paquete_id: 1, paquetes: [1],
    } },
    { coleccion: 'movimientos_inventario', id: 'entrada-101', merge: false, datos: {
      id: 'entrada-101', producto_id: 101, variante_id: 1, tipo: 'ENTRADA',
      cantidad: 2, costo_total_usd_cents: 2140, existencias_despues: 2,
      referencia_tipo: 'COMPRA', referencia_id: 1,
    } },
  ]);
  await Compras.completarReconstruccion(1, g());
}

it('completar contenido descarta el cero ficticio del editor viejo y conserva el impuesto real', async () => {
  await reconstruirPaqueteViejo();
  const cruda = volcar('compras')[0];
  expect(cruda.tax_total_override_usd_cents).toBeNull();
  expect(cruda.tax_total_usd_cents).toBe(140);
  expect(cruda.total_usd_cents).toBe(2340);
  expect(volcar('productos')[0].valor_inventario_usd_cents).toBe(2340);
});

it('abrir un paquete ya reconstruido no convierte impuesto histórico positivo en cero ni escribe datos', async () => {
  await reconstruirPaqueteViejo();
  // Documento reconstruido antes del hotfix: cabecera vieja contradice sus líneas.
  await aplicarLote([{ coleccion: 'compras', id: 1, merge: true, datos: { tax_total_override_usd_cents: 0 } }]);
  const antes = volcar('compras');
  const compra = (await Compras.getById(1))!;
  const vista = calcularPaquete(compra.lineas.map((l) => ({
    clave: String(l.id), destino: l.destino, cantidad: l.cantidad,
    precio_linea_usd_cents: l.precio_linea_usd_cents, exento: l.exento,
    tax_declarado_usd_cents: l.tax_linea_usd_cents,
  })), { tax_bp: 700, envio_total_usd_cents: compra.envio_total_usd_cents,
    tax_total_override_usd_cents: compra.tax_total_override_usd_cents,
    peso_total_mlb: compra.peso_total_mlb, pesoUnitario: () => 0 });
  expect(vista.tax_total_usd_cents).toBe(140);
  expect(vista.total_pagado_usd_cents).toBe(2340);
  expect(volcar('compras')).toEqual(antes);

  const resultado = await Compras.corregir({
    id: compra.id, fecha: compra.fecha, envio_total_usd_cents: compra.envio_total_usd_cents,
    peso_total_mlb: compra.peso_total_mlb, tax_total_override_usd_cents: compra.tax_total_override_usd_cents,
    lineas: compra.lineas,
  }, g());
  expect(resultado.productos.reduce((s, p) => s + (p.correccion_usd_cents ?? 0), 0)).toBe(0);
  expect((await Productos.getById(101))!.valor_inventario_usd_cents).toBe(2340);
});

it('un cero escrito de verdad sigue siendo cero, también en un paquete reconstruido sin impuesto', async () => {
  const id = await Compras.guardar({ fecha, envio_total_usd_cents: 200,
    tax_total_override_usd_cents: 0, lineas: [{ descripcion: 'Sin impuesto', cantidad: 1,
      precio_linea_usd_cents: 1000, destino: 'INVENTARIO' }] }, g());
  await Compras.recibir(id, g());
  await aplicarLote([{ coleccion: 'compras', id, merge: true, datos: { reconstruido: true } }]);
  const compra = (await Compras.getById(id))!;
  expect(compra.tax_total_override_usd_cents).toBe(0);
  expect(compra.tax_total_usd_cents).toBe(0);
  expect(compra.total_usd_cents).toBe(1200);
});

it('la dueña todavía puede corregir a cero el impuesto de un paquete reconstruido', async () => {
  await reconstruirPaqueteViejo();
  const compra = (await Compras.getById(1))!;
  await Compras.corregir({
    id: compra.id, fecha: compra.fecha, envio_total_usd_cents: compra.envio_total_usd_cents,
    peso_total_mlb: compra.peso_total_mlb, tax_total_override_usd_cents: 0,
    lineas: compra.lineas,
  }, g());
  const corregida = (await Compras.getById(1))!;
  expect(corregida.tax_total_override_usd_cents).toBe(0);
  expect(corregida.tax_total_usd_cents).toBe(0);
  expect(corregida.total_usd_cents).toBe(2200);
  expect((await Productos.getById(101))!.valor_inventario_usd_cents).toBe(2200);
});
