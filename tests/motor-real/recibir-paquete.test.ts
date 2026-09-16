/**
 * Recibir un paquete: la operación más cara de equivocarse.
 *
 * Es la que mete la mercadería a la bodega y fija el costo con el que después
 * se calcula cada precio y cada ganancia. Si entra dos veces, el inventario
 * queda inflado y los costos promedio se ensucian; y a diferencia de una venta
 * mal registrada, esto no se nota mirando la pantalla: los números simplemente
 * quedan más altos de lo que deberían.
 *
 * `recibir()` lee el paquete, comprueba que no esté RECIBIDA, hace las
 * entradas de stock y recién al final lo marca. Entre la comprobación y la
 * marca hay una ventana: es la misma forma que tenía el error de los abonos
 * simultáneos, así que se prueba igual.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

async function paqueteDeUnaLinea(cantidad = 6) {
  const { Compras } = await repos();
  return Compras.guardar(
    {
      fecha: HOY,
      envio_total_usd_cents: 1200,
      lineas: [
        {
          descripcion: 'Boxers Calvin Klein',
          cantidad,
          precio_linea_usd_cents: 3000,
          peso_linea_mlb: 1500,
          destino: 'INVENTARIO',
        },
      ],
    },
    g()
  );
}

async function stockDe(nombre: string): Promise<number> {
  const { Productos } = await repos();
  const p = (await Productos.listar()).find((x) => x.nombre === nombre);
  return p?.existencias ?? 0;
}

describe('recibir un paquete', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'dos veces seguidas: la segunda se rechaza y el stock no se duplica',
    async () => {
      const { Compras } = await repos();
      const compraId = await paqueteDeUnaLinea(6);

      await Compras.recibir(compraId, g());
      expect(await stockDe('Boxers Calvin Klein')).toBe(6);

      await expect(Compras.recibir(compraId, g())).rejects.toThrow();
      expect(await stockDe('Boxers Calvin Klein')).toBe(6);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'dos veces AL MISMO TIEMPO: entra una sola vez',
    async () => {
      // Doble clic en "Recibir", o los dos dispositivos a la vez. Las dos
      // llamadas leen el paquete todavía en BORRADOR y las dos se creen
      // autorizadas a meter la mercadería.
      const { Compras } = await repos();
      const compraId = await paqueteDeUnaLinea(6);

      const resultados = await Promise.allSettled([
        Compras.recibir(compraId, g()),
        Compras.recibir(compraId, g()),
      ]);

      const exitosas = resultados.filter((r) => r.status === 'fulfilled').length;

      // Las dos llamadas buscan el producto por nombre, no lo encuentran
      // (todavía no existe) y cada una crea el suyo: la bodega termina con dos
      // productos iguales, cada uno con su lote. Por eso no alcanza con mirar
      // el stock del primero que aparezca.
      const { Productos } = await repos();
      const iguales = (await Productos.listar()).filter(
        (x) => x.nombre === 'Boxers Calvin Klein'
      );
      const unidades = iguales.reduce((s, x) => s + x.existencias, 0);

      expect(
        iguales.length,
        `quedaron ${iguales.length} productos llamados igual en el inventario`
      ).toBe(1);
      expect(
        unidades,
        `${exitosas} de 2 recepciones pasaron y la bodega quedó con ${unidades} unidades`
      ).toBe(6);
      expect(exitosas, 'sólo una recepción puede prosperar').toBe(1);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'el paquete recibido queda marcado, aunque haya habido carrera',
    async () => {
      const { Compras } = await repos();
      const compraId = await paqueteDeUnaLinea(4);

      await Promise.allSettled([
        Compras.recibir(compraId, g()),
        Compras.recibir(compraId, g()),
      ]);

      const compra = (await Compras.getById(compraId))!;
      expect(compra.estado).toBe('RECIBIDA');
    },
    60_000
  );

  it.skipIf(!disponible)(
    'el costo del paquete llega entero al producto, sin perder el envío',
    async () => {
      const { Compras } = await repos();
      const compraId = await paqueteDeUnaLinea(6);
      await Compras.recibir(compraId, g());

      const { Productos } = await repos();
      const p = (await Productos.listar()).find((x) => x.nombre === 'Boxers Calvin Klein')!;

      // $30 de producto + 7% de tax ($2.10) + $12 de envío = $44.10,
      // entre 6 unidades = $7.35 cada una. El tax por defecto del sistema
      // entra aunque no se declare en la línea.
      expect(p.existencias).toBe(6);
      expect(p.costo_unitario_usd_cents).toBe(735);
      expect(p.valor_inventario_usd_cents).toBe(4410);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'guardar un paquete a medias no lo deja trabado para siempre',
    async () => {
      // Guardar el flete antes de cargar los productos marcaba el paquete
      // como recibido en el acto, y desde ahí `guardar` se negaba a editarlo.
      // El paquete quedaba trabado con su costo adentro y sin forma de
      // agregarle la mercadería.
      const { Compras } = await repos();

      const vacio = await Compras.guardar(
        {
          fecha: HOY,
          envio_total_usd_cents: 3500,
          lineas: [],
        },
        g()
      );

      // Nace como borrador: guardar el envío antes de cargar los productos
      // no puede dejar el paquete trabado para siempre.
      const recienGuardado = await Compras.getById(vacio);
      expect(
        recienGuardado?.estado,
        'un paquete sin líneas nació marcado como recibido: ya no se puede editar'
      ).toBe('BORRADOR');

      // Y todavía se le pueden agregar los productos.
      await Compras.guardar(
        {
          id: vacio,
          fecha: HOY,
          envio_total_usd_cents: 3500,
          lineas: [
            {
              descripcion: 'Bolso',
              cantidad: 2,
              precio_linea_usd_cents: 4000,
              peso_linea_mlb: 100,
              destino: 'INVENTARIO',
            },
          ],
        },
        g()
      );

      const { productos_afectados } = await Compras.recibir(vacio, g());
      expect(productos_afectados, 'después de cargarle las líneas sí se pudo recibir').toBe(1);
    },
    60_000
  );

});
