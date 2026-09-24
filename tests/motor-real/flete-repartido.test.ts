/**
 * Que el flete del paquete llegue al costo de cada producto, contra el
 * Firestore de verdad.
 *
 * Es el caso real que motivó todo esto: un paquete con $77.00 de flete y 45
 * unidades. En `v2.11` el paquete se anotaba sin contenido y el flete se le
 * repartía después a los productos que lo tuvieran anotado; eso suponía que
 * un producto viene de un solo paquete, y con el segundo el reparto se
 * inflaba. Desde `v2.12` el paquete trae sus líneas y el flete se reparte UNA
 * vez, entre ellas, al pasar al inventario.
 *
 * Contra el emulador importa algo que el Firestore falso no ve: pasar un
 * paquete al inventario es una sola transacción que lee el paquete, cada
 * producto y cada encargo, y recién después escribe. Firestore rechaza una
 * transacción que escribe antes de terminar de leer.
 *
 * Los montos no dividen exacto a propósito. Con $10 entre 10 unidades los
 * errores de redondeo pasaban en verde: así las pruebas anteriores no vieron
 * que guardar una ficha le sacaba 5 centavos a la bodega.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

async function producto(nombre: string): Promise<number> {
  const { Productos } = await repos();
  return Productos.crear({ nombre, modo_precio: 'MARGEN' }, g());
}

async function paquete(
  envio: number,
  lineas: { producto_id: number; descripcion: string; cantidad: number; tienda: number }[]
): Promise<number> {
  const { Compras } = await repos();
  const id = await Compras.guardar(
    {
      fecha: HOY,
      envio_total_usd_cents: envio,
      lineas: lineas.map((l) => ({
        producto_id: l.producto_id,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precio_linea_usd_cents: l.cantidad * l.tienda,
        destino: 'INVENTARIO' as const,
      })),
    },
    g()
  );
  await Compras.recibir(id, g());
  return id;
}

async function bodega(): Promise<number> {
  const { Productos } = await repos();
  return (await Productos.listar({ incluirInactivos: true })).reduce(
    (s, p) => s + (p.valor_inventario_usd_cents ?? 0),
    0
  );
}

describe('el flete llega al costo', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'el paquete real: $77 entre 45 unidades, y la bodega vale lo que se pagó',
    async () => {
      const { Compras, Panel } = await repos();
      const talladores = await producto('Talladores');
      const cartera = await producto('Cartera');
      const id = await paquete(7700, [
        { producto_id: talladores, descripcion: 'Talladores', cantidad: 40, tienda: 340 },
        { producto_id: cartera, descripcion: 'Cartera', cantidad: 5, tienda: 2500 },
      ]);

      const c = (await Compras.getById(id))!;
      expect(c.estado).toBe('RECIBIDA');
      expect(c.lineas.reduce((s, l) => s + l.envio_asignado_usd_cents, 0)).toBe(7700);
      expect(c.total_usd_cents).toBe(35627);
      expect(await bodega(), 'lo que entró es lo que se pagó, al centavo').toBe(35627);

      Panel.invalidarCache();
      const panel = await Panel.cargar(true);
      expect(
        panel.resumen.inversion_inventario_usd_cents,
        'el panel tiene que mostrar lo mismo que el inventario'
      ).toBe(35627);
    },
    120_000
  );

  it.skipIf(!disponible)(
    'el costo es tienda + impuesto + flete, y el precio sale de ahí',
    async () => {
      const { Productos, Parametros } = await repos();
      const cartera = await producto('Cartera');
      await paquete(1000, [{ producto_id: cartera, descripcion: 'Cartera', cantidad: 10, tienda: 1000 }]);

      const p = (await Productos.getById(cartera))!;
      // $100 de tienda + $7 de impuesto + $10 de flete = $117, entre 10.
      expect(p.valor_inventario_usd_cents).toBe(11700);
      expect(p.costo_unitario_usd_cents).toBe(1170);

      const params = await Parametros.getParametros();
      const margen = params.margen_defecto_bp;
      const esperado = Math.ceil(Math.round((1170 * (10000 + margen)) / 10000) / params.paso_redondeo_usd_cents) * params.paso_redondeo_usd_cents;
      expect(p.precio_venta_usd_cents, 'el precio lleva el flete adentro').toBe(esperado);
    },
    90_000
  );

  it.skipIf(!disponible)(
    'reponer con otro paquete suma su costo, y el flete nunca pasa del pagado',
    async () => {
      const { Compras, Productos, Ventas } = await repos();
      const cartera = await producto('Cartera');
      await paquete(7700, [{ producto_id: cartera, descripcion: 'Cartera', cantidad: 5, tienda: 2500 }]);
      await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: cartera, cantidad: 3 }] }, g());
      const antes = (await Productos.getById(cartera))!;

      const labial = await producto('Labial');
      const pq2 = await paquete(5000, [
        { producto_id: cartera, descripcion: 'Cartera', cantidad: 10, tienda: 2500 },
        { producto_id: labial, descripcion: 'Labial', cantidad: 10, tienda: 500 },
      ]);

      const c2 = (await Compras.getById(pq2))!;
      expect(c2.lineas.reduce((s, l) => s + l.envio_asignado_usd_cents, 0)).toBe(5000);
      const despues = (await Productos.getById(cartera))!;
      expect(despues.existencias).toBe(12);
      expect(despues.valor_inventario_usd_cents).toBe(antes.valor_inventario_usd_cents + 29250);
    },
    150_000
  );

  it.skipIf(!disponible)(
    'vender no cambia el precio de lo que queda',
    async () => {
      const { Productos, Ventas } = await repos();
      const cartera = await producto('Cartera');
      await paquete(7700, [{ producto_id: cartera, descripcion: 'Cartera', cantidad: 5, tienda: 2500 }]);
      const antes = (await Productos.getById(cartera))!.precio_venta_usd_cents;
      await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: cartera, cantidad: 1 }] }, g());
      expect((await Productos.getById(cartera))!.precio_venta_usd_cents).toBe(antes);
    },
    120_000
  );

  it.skipIf(!disponible)(
    'abrir la ficha y guardar sin tocar nada no cambia el costo',
    async () => {
      const { Productos } = await repos();
      const talladores = await producto('Talladores');
      const cartera = await producto('Cartera');
      await paquete(7700, [
        { producto_id: talladores, descripcion: 'Talladores', cantidad: 40, tienda: 340 },
        { producto_id: cartera, descripcion: 'Cartera', cantidad: 5, tienda: 2500 },
      ]);
      const antes = await bodega();

      for (let i = 0; i < 3; i++) {
        for (const id of [talladores, cartera]) {
          const p = (await Productos.getById(id))!;
          await Productos.actualizar({ id, nombre: p.nombre, margen_bp: p.margen_bp }, g());
        }
      }
      expect(await bodega(), 'la bodega se movió de tanto abrir y guardar fichas').toBe(antes);
    },
    150_000
  );

  it.skipIf(!disponible)(
    'corregir el flete mueve sólo lo que queda en bodega',
    async () => {
      const { Compras, Productos, Ventas } = await repos();
      const perfume = await producto('Perfume');
      const id = await paquete(1000, [{ producto_id: perfume, descripcion: 'Perfume', cantidad: 10, tienda: 2000 }]);
      await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: perfume, cantidad: 4 }] }, g());
      const antes = (await Productos.getById(perfume))!;
      const c = (await Compras.getById(id))!;

      await Compras.corregir(
        { id, fecha: c.fecha, envio_total_usd_cents: 3000, lineas: c.lineas.map((l) => ({ ...l, peso_linea_mlb: null })) },
        g()
      );

      // $20 más de flete; 6 de las 10 unidades siguen en bodega: $12.
      expect((await Productos.getById(perfume))!.valor_inventario_usd_cents).toBe(
        antes.valor_inventario_usd_cents + 1200
      );
    },
    150_000
  );
});
