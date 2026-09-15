/**
 * Fase 3: el inventario tiene que poder deshacerse sin dejar residuo.
 *
 * La regla del negocio es simple de decir y difícil de cumplir: la mercadería
 * que sale por una venta tiene que volver entera si esa venta se anula, sin
 * importar cuánto tiempo pasó ni qué pasó en el medio. Si no vuelve, el stock
 * en pantalla deja de ser el stock de la bodega, y a partir de ahí todo lo que
 * se decida mirando esa pantalla está mal.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

/** Existencias totales de un producto, sumando sus variantes activas. */
async function stockDe(productoId: number): Promise<number> {
  const { Productos } = await repos();
  const p = (await Productos.listar()).find((x) => x.id === productoId);
  return p?.existencias ?? 0;
}

describe('devolución de mercadería al anular', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'la mercadería vuelve entera, aunque el costo del producto haya cambiado después',
    async () => {
      const { Productos, Ventas, Clientes } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const producto = await Productos.crear(
        { nombre: 'Labial', stock_inicial: { cantidad: 10, costo_unitario_usd_cents: 500 } },
        g()
      );

      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: producto, cantidad: 4, precio_unitario_usd_cents: 1000 }],
        },
        g()
      );
      expect(await stockDe(producto)).toBe(6);

      // Llega un paquete nuevo mucho más caro: el costo promedio se mueve.
      await Productos.entrada({
        producto_id: producto,
        cantidad: 10,
        costo_total_usd_cents: 20000,
      });
      expect(await stockDe(producto)).toBe(16);

      await Ventas.cambiarEstado(venta, 'CANCELADA', g());

      // Las 4 unidades vuelven: 16 + 4 = 20.
      expect(await stockDe(producto)).toBe(20);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'anular dos veces la misma venta no devuelve la mercadería dos veces',
    async () => {
      const { Productos, Ventas, Clientes } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const producto = await Productos.crear(
        { nombre: 'Rímel', stock_inicial: { cantidad: 8, costo_unitario_usd_cents: 400 } },
        g()
      );
      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: producto, cantidad: 3, precio_unitario_usd_cents: 900 }],
        },
        g()
      );

      await Ventas.cambiarEstado(venta, 'CANCELADA', g());
      await Ventas.cambiarEstado(venta, 'CANCELADA', g());

      expect(await stockDe(producto)).toBe(8);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'anular la misma venta dos veces AL MISMO TIEMPO no devuelve el doble',
    async () => {
      // `cambiarEstado` lee la venta, ve que no está cancelada, devuelve la
      // mercadería y recién entonces escribe el estado nuevo. Es la misma
      // forma que tenían los abonos simultáneos y la recepción de paquetes.
      const { Productos, Ventas, Clientes } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const producto = await Productos.crear(
        { nombre: 'Doble anulación', stock_inicial: { cantidad: 10, costo_unitario_usd_cents: 500 } },
        g()
      );
      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: producto, cantidad: 4, precio_unitario_usd_cents: 1200 }],
        },
        g()
      );
      expect(await stockDe(producto)).toBe(6);

      await Promise.allSettled([
        Ventas.cambiarEstado(venta, 'CANCELADA', g()),
        Ventas.cambiarEstado(venta, 'CANCELADA', g()),
      ]);

      const stock = await stockDe(producto);
      expect(stock, `la bodega quedó con ${stock} unidades; sólo volvían 4`).toBe(10);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'un encargo entregado que después se anula también devuelve la mercadería',
    async () => {
      // La venta de inventario descuenta al crearse y devuelve al anularse.
      // El encargo descuenta al ENTREGARSE. La vuelta tiene que existir igual:
      // si no, cada encargo entregado y luego anulado se come el stock.
      const { Productos, Ventas, Clientes } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const producto = await Productos.crear(
        { nombre: 'Bolso', stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 3000 } },
        g()
      );

      const encargo = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'ENCARGO',
          lineas: [{ producto_id: producto, cantidad: 2, precio_unitario_usd_cents: 6000 }],
        },
        g()
      );
      expect(await stockDe(producto)).toBe(5);

      await Ventas.cambiarEstado(encargo, 'ENTREGADA', g());
      expect(await stockDe(producto)).toBe(3);

      await Ventas.cambiarEstado(encargo, 'CANCELADA', g());
      expect(await stockDe(producto)).toBe(5);
    },
    45_000
  );
});

describe('el stock nunca miente', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'no se puede vender más de lo que hay, ni siquiera con dos ventas a la vez',
    async () => {
      const { Productos, Ventas, Clientes } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const producto = await Productos.crear(
        { nombre: 'Escaso', stock_inicial: { cantidad: 3, costo_unitario_usd_cents: 100 } },
        g()
      );
      const variante = await Productos.varianteUnica(producto);

      const linea = {
        producto_id: producto,
        variante_id: variante ?? undefined,
        cantidad: 3,
        precio_unitario_usd_cents: 500,
      };

      // Las dos piden las 3 unidades que hay. Una sola puede ganar.
      const resultados = await Promise.allSettled([
        Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [linea] }, g()),
        Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [linea] }, g()),
      ]);

      const stock = await stockDe(producto);
      const exitosas = resultados.filter((r) => r.status === 'fulfilled').length;

      expect(stock, `quedaron ${exitosas} ventas y el stock en ${stock}`).toBeGreaterThanOrEqual(0);
      expect(exitosas).toBe(1);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'dos conteos físicos simultáneos dejan el número que se pidió, no la suma',
    async () => {
      // `ajustar` fija un total absoluto, no un delta, así que repetirlo tiene
      // que dar lo mismo. Es la última mutación de inventario del barrido de
      // concurrencia: entrada y salida ya van en transacción.
      const { Productos } = await repos();

      const producto = await Productos.crear(
        { nombre: 'Conteo', stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 1000 } },
        g()
      );
      const variante = (await Productos.varianteUnica(producto))!;

      await Promise.allSettled([
        Productos.ajustar(variante, 12, g(), 'Conteo físico', producto),
        Productos.ajustar(variante, 12, g(), 'Conteo físico', producto),
      ]);

      const p = (await Productos.listar()).find((x) => x.id === producto)!;
      expect(p.existencias, `quedaron ${p.existencias} unidades y se contaron 12`).toBe(12);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'vaciar el stock y volver a cargarlo no deja el costo unitario en NaN',
    async () => {
      const { Productos } = await repos();

      const producto = await Productos.crear(
        { nombre: 'Vaciable', stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 1000 } },
        g()
      );

      const varianteVaciable = (await Productos.varianteUnica(producto))!;
      await Productos.ajustar(varianteVaciable, 0, g(), 'Conteo físico', producto);
      let p = (await Productos.listar()).find((x) => x.id === producto)!;
      expect(p.existencias).toBe(0);
      expect(Number.isFinite(p.costo_unitario_usd_cents)).toBe(true);

      await Productos.entrada({
        producto_id: producto,
        cantidad: 4,
        costo_total_usd_cents: 8000,
      });
      p = (await Productos.listar()).find((x) => x.id === producto)!;

      expect(p.existencias).toBe(4);
      expect(Number.isFinite(p.costo_unitario_usd_cents)).toBe(true);
      // Sin stock previo, el costo del lote nuevo manda: $80 / 4 = $20.
      expect(p.costo_unitario_usd_cents).toBe(2000);
      expect(p.valor_inventario_usd_cents).toBe(8000);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'el valor de la bodega siempre es existencias por costo unitario',
    async () => {
      const { Productos } = await repos();

      const producto = await Productos.crear(
        { nombre: 'Valuado', stock_inicial: { cantidad: 7, costo_unitario_usd_cents: 333 } },
        g()
      );

      const pasos: Array<() => Promise<unknown>> = [
        () => Productos.entrada({ producto_id: producto, cantidad: 3, costo_total_usd_cents: 1500 }),
        () => Productos.salida({ producto_id: producto, cantidad: 2 }),
        async () =>
          Productos.ajustar(
            (await Productos.varianteUnica(producto))!,
            12,
            g(),
            'Conteo físico',
            producto
          ),
        () => Productos.entrada({ producto_id: producto, cantidad: 1, costo_total_usd_cents: 900 }),
        () => Productos.salida({ producto_id: producto, cantidad: 5 }),
      ];

      const desvios: string[] = [];
      for (let i = 0; i < pasos.length; i++) {
        await pasos[i]();
        const p = (await Productos.listar()).find((x) => x.id === producto)!;
        const esperado = p.existencias * p.costo_unitario_usd_cents;
        const desvio = Math.abs((p.valor_inventario_usd_cents ?? 0) - esperado);
        // Un centavo por unidad es el redondeo del promedio ponderado.
        if (desvio > p.existencias + 1) {
          desvios.push(
            `paso ${i + 1}: valor ${p.valor_inventario_usd_cents} vs ${p.existencias} x ${p.costo_unitario_usd_cents} = ${esperado}`
          );
        }
      }

      expect(desvios, desvios.join('; ')).toEqual([]);
    },
    60_000
  );
});
