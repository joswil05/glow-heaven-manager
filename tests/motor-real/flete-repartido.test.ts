/**
 * Que el flete del paquete llegue al costo de cada producto.
 *
 * Es el caso real que motivó todo esto: un paquete con $77.00 de flete, los
 * productos cargados a mano desde Inventario, y esos $77 sin llegar nunca a
 * ninguna parte. La aplicación decía que la bodega valía $279.65 cuando valía
 * $370.16, y que se iban a ganar $273.35 cuando eran $182.84.
 *
 * El error no se veía: cada número por separado era coherente con los demás.
 * Sólo se notaba comparando con el recibo del courier.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

/** Un paquete anotado como lo anota ella: sólo el flete y el peso. */
async function paqueteCon(envio_total_usd_cents: number): Promise<number> {
  const { Compras } = await repos();
  return Compras.guardar({ fecha: HOY, envio_total_usd_cents, lineas: [] }, g());
}

/** Un producto cargado desde Inventario, con su precio de tienda. */
async function cargarProducto(
  nombre: string,
  unidades: number,
  precioTiendaCents: number,
  paquete_id?: number
): Promise<number> {
  const { Productos } = await repos();
  return Productos.crear(
    {
      nombre,
      paquete_id,
      precio_tienda_unitario_usd_cents: precioTiendaCents,
      stock_inicial: { cantidad: unidades, costo_unitario_usd_cents: precioTiendaCents },
    },
    g()
  );
}

describe('el flete llega al costo', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'un producto cargado a mano paga su impuesto, aunque no venga de un paquete',
    async () => {
      // Antes el impuesto sólo se aplicaba si marcabas "es un pack". Un
      // producto suelto entraba con el precio de la tienda pelado.
      const { Productos } = await repos();
      const id = await cargarProducto('Cartera suelta', 1, 2500);
      const p = await Productos.getById(id);

      expect(p!.costo_unitario_usd_cents, '$25.00 + 7% = $26.75').toBe(2675);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'el flete del paquete se reparte entre lo que trajo',
    async () => {
      const { Productos } = await repos();
      const paquete = await paqueteCon(7700);

      // Dos productos, 45 unidades en total, como el caso real.
      await cargarProducto('Talladores', 40, 340, paquete);
      await cargarProducto('Cartera', 5, 2500, paquete);

      const productos = await Productos.listar({ paquete_id: paquete });
      const fleteTotal = productos.reduce(
        (s, p) => s + (p.flete_unitario_usd_cents ?? 0) * p.existencias,
        0
      );

      expect(
        Math.abs(fleteTotal - 7700),
        `se repartieron $${(fleteTotal / 100).toFixed(2)} de los $77.00 pagados`
      ).toBeLessThanOrEqual(45);
    },
    120_000
  );

  it.skipIf(!disponible)(
    'el costo es precio + impuesto + flete, y se puede ver desglosado',
    async () => {
      const { Productos } = await repos();
      const paquete = await paqueteCon(1000);
      const id = await cargarProducto('Uno solo', 10, 1000, paquete);

      const p = await Productos.getById(id);
      // $10.00 de tienda + 7% = $10.70 de base. $10.00 de flete entre 10
      // unidades = $1.00 cada una.
      expect(p!.costo_base_unitario_usd_cents).toBe(1070);
      expect(p!.flete_unitario_usd_cents).toBe(100);
      expect(p!.costo_unitario_usd_cents).toBe(1170);
      expect(
        p!.costo_base_unitario_usd_cents! + p!.flete_unitario_usd_cents!,
        'el desglose que se muestra tiene que sumar el costo que se usa'
      ).toBe(p!.costo_unitario_usd_cents);
    },
    90_000
  );

  it.skipIf(!disponible)(
    'agregar un producto al paquete le baja el flete a los que ya estaban',
    async () => {
      // Es lo que hace que no haga falta apretar ningún botón: se carga con
      // calma y el reparto se acomoda solo.
      const { Productos } = await repos();
      const paquete = await paqueteCon(1000);

      const primero = await cargarProducto('Primero', 10, 500, paquete);
      const soloUno = await Productos.getById(primero);
      expect(soloUno!.flete_unitario_usd_cents, 'solo, carga los $10 enteros').toBe(100);

      await cargarProducto('Segundo', 10, 500, paquete);
      const ahora = await Productos.getById(primero);
      expect(
        ahora!.flete_unitario_usd_cents,
        'con el segundo adentro, el flete por unidad tiene que bajar a la mitad'
      ).toBe(50);
    },
    120_000
  );

  it.skipIf(!disponible)(
    'el valor de la bodega sube con el flete, no se queda con el precio de tienda',
    async () => {
      const { Productos, Panel } = await repos();
      const paquete = await paqueteCon(1000);
      await cargarProducto('Cosa', 10, 1000, paquete);

      const productos = await Productos.listar({});
      const valor = productos.reduce((s, p) => s + (p.valor_inventario_usd_cents ?? 0), 0);

      // 10 unidades a $11.70 = $117.00, no $100.00.
      expect(valor).toBe(11700);

      Panel.invalidarCache();
      const panel = await Panel.cargar(true);
      expect(
        panel.resumen.inversion_inventario_usd_cents,
        'el panel tiene que mostrar lo mismo que el inventario'
      ).toBe(valor);
    },
    90_000
  );

  it.skipIf(!disponible)(
    'un paquete sin flete no cambia nada',
    async () => {
      const { Productos } = await repos();
      const paquete = await paqueteCon(0);
      const id = await cargarProducto('Sin flete', 5, 1000, paquete);

      const p = await Productos.getById(id);
      expect(p!.flete_unitario_usd_cents).toBe(0);
      expect(p!.costo_unitario_usd_cents).toBe(1070); // sólo precio + impuesto
    },
    90_000
  );
});
