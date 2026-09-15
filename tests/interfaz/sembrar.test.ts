/**
 * Siembra los datos que necesitan las pruebas de interfaz.
 *
 * No es una prueba de negocio: es el decorado. Vive como archivo de prueba a
 * propósito, porque así siembra usando los MISMOS repositorios que usa la
 * aplicación. Sembrar a mano por la API REST de Firestore significaría
 * escribir los documentos con una forma inventada, y una prueba de interfaz
 * que corre contra datos con la forma equivocada no prueba nada.
 *
 * Lo corre `tests/interfaz/correr.py` justo antes de abrir el navegador.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from '../motor-real/arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

describe('decorado para las pruebas de interfaz', () => {
  it.skipIf(!disponible)(
    'deja el negocio con productos, una clienta y una venta a crédito',
    async () => {
      await baseLimpia();
      const { Productos, Clientes, Ventas } = await repos();

      // Inventario con stock suficiente para vender varias veces.
      const labial = await Productos.crear(
        {
          nombre: 'Labial Mate Rojo',
          stock_inicial: { cantidad: 20, costo_unitario_usd_cents: 400 },
          precio_manual_usd_cents: 1200,
          modo_precio: 'MANUAL',
        },
        g()
      );
      await Productos.crear(
        {
          nombre: 'Perfume Carolina Herrera',
          stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 4500 },
          precio_manual_usd_cents: 9000,
          modo_precio: 'MANUAL',
        },
        g()
      );
      // Uno con una sola unidad, para probar el borde del stock.
      await Productos.crear(
        {
          nombre: 'Ultimo Disponible',
          stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 1000 },
          precio_manual_usd_cents: 2000,
          modo_precio: 'MANUAL',
        },
        g()
      );

      const ana = await Clientes.guardar(
        { nombre: 'Ana Prueba', telefono: '88887777' },
        g()
      );

      // Una venta a crédito de $100, sin pagar: es la que van a cobrar las
      // pruebas de abono.
      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: labial, cantidad: 2, precio_unitario_usd_cents: 5000 }],
        },
        g()
      );

      const v = (await Ventas.getById(venta))!;
      expect(v.saldo_usd_cents).toBe(10000);
      expect((await Productos.listar()).length).toBe(3);

      // eslint-disable-next-line no-console
      console.log(`  decorado listo: venta ${v.codigo} con saldo $100 de ${'Ana Prueba'}`);
    },
    60_000
  );
});
