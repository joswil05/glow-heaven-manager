/**
 * "¿Qué hay del último paquete?"
 *
 * El negocio funciona por tandas: se vende casi todo y llega un paquete nuevo
 * que renueva la bodega. Por eso la pregunta cotidiana mirando el inventario
 * no es "¿qué tengo?" sino "¿qué de esto vino en el paquete que estoy
 * vendiendo?", y antes había que acordarse de memoria.
 *
 * La ficha de cada producto anota el último paquete que lo repuso. Estas
 * pruebas fijan las tres cosas que tienen que ser ciertas para que ese dato
 * sirva:
 *
 *   · que recibir un paquete lo anote (antes no lo hacía: el campo existía y
 *     sólo se llenaba si creabas el producto a mano);
 *   · que el filtro devuelva exactamente lo de ese paquete, ni de más ni de
 *     menos;
 *   · que un producto repuesto por un paquete nuevo pase a ser de ese, porque
 *     es el que lo tiene hoy en la bodega.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

/** Un paquete con los productos que se le pidan, recibido. */
async function paqueteRecibido(
  productos: { descripcion: string; cantidad: number; precio_linea_usd_cents: number }[],
  envio_total_usd_cents = 1000
): Promise<number> {
  const { Compras } = await repos();
  const id = await Compras.guardar(
    {
      fecha: HOY,
      envio_total_usd_cents,
      lineas: productos.map((p) => ({
        descripcion: p.descripcion,
        cantidad: p.cantidad,
        precio_linea_usd_cents: p.precio_linea_usd_cents,
        peso_linea_mlb: 100,
        destino: 'INVENTARIO' as const,
      })),
    },
    g()
  );
  await Compras.recibir(id, g());
  return id;
}

describe('el inventario visto por paquete', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'recibir un paquete deja anotado de dónde vino cada producto',
    async () => {
      const { Productos } = await repos();
      const paquete = await paqueteRecibido([
        { descripcion: 'Gloss', cantidad: 5, precio_linea_usd_cents: 4000 },
        { descripcion: 'Labial', cantidad: 3, precio_linea_usd_cents: 2000 },
      ]);

      const todos = await Productos.listar({});
      expect(todos).toHaveLength(2);
      for (const p of todos) {
        expect(
          p.paquete_id,
          `'${p.nombre}' entró por un paquete y quedó sin anotar de cuál`
        ).toBe(paquete);
      }
    },
    90_000
  );

  it.skipIf(!disponible)(
    'el filtro trae lo de ese paquete y nada más',
    async () => {
      const { Productos } = await repos();
      const primero = await paqueteRecibido([
        { descripcion: 'Gloss', cantidad: 5, precio_linea_usd_cents: 4000 },
        { descripcion: 'Labial', cantidad: 3, precio_linea_usd_cents: 2000 },
      ]);
      const segundo = await paqueteRecibido([
        { descripcion: 'Bolso', cantidad: 2, precio_linea_usd_cents: 9000 },
      ]);

      const delPrimero = await Productos.listar({ paquete_id: primero });
      const delSegundo = await Productos.listar({ paquete_id: segundo });

      expect(delPrimero.map((p) => p.nombre).sort()).toEqual(['Gloss', 'Labial']);
      expect(delSegundo.map((p) => p.nombre)).toEqual(['Bolso']);

      // Y juntos son todo: el filtro no esconde nada.
      const todos = await Productos.listar({});
      expect(delPrimero.length + delSegundo.length).toBe(todos.length);
    },
    120_000
  );

  it.skipIf(!disponible)(
    'un producto repuesto pasa a ser del paquete nuevo',
    async () => {
      // Es la pregunta de "¿esto de qué paquete es?" mirando la bodega: lo
      // que está en el estante ahora lo trajo el paquete nuevo.
      const { Productos } = await repos();
      const viejo = await paqueteRecibido([
        { descripcion: 'Gloss', cantidad: 5, precio_linea_usd_cents: 4000 },
      ]);

      const antes = await Productos.listar({ paquete_id: viejo });
      expect(antes).toHaveLength(1);

      const nuevo = await paqueteRecibido([
        { descripcion: 'Gloss', cantidad: 4, precio_linea_usd_cents: 4400 },
      ]);

      // Sigue siendo UN producto: el stock se suma, no se duplica la ficha.
      const todos = await Productos.listar({});
      expect(todos, 'el producto repetido creó una ficha gemela').toHaveLength(1);
      expect(todos[0].existencias).toBe(9);

      // Buscar por el paquete VIEJO tiene que seguir encontrándolo: ese paquete
      // sí lo trajo. Antes el producto guardaba un solo número —el último— y
      // filtrar por el viejo contestaba que no lo había traído, que es falso.
      expect(
        await Productos.listar({ paquete_id: viejo }),
        'el paquete viejo trajo este producto y dejó de encontrarlo'
      ).toHaveLength(1);
      expect(await Productos.listar({ paquete_id: nuevo })).toHaveLength(1);

      // Para el costo, en cambio, manda el último: es el que tiene la
      // mercadería que está hoy en el estante.
      const ficha = await Productos.getById(todos[0].id);
      expect(ficha!.paquete_id).toBe(nuevo);
      expect(ficha!.paquetes).toEqual([viejo, nuevo]);
    },
    120_000
  );

  it.skipIf(!disponible)(
    'los productos cargados a mano quedan aparte, no se pierden',
    async () => {
      const { Productos } = await repos();
      await paqueteRecibido([{ descripcion: 'Gloss', cantidad: 5, precio_linea_usd_cents: 4000 }]);
      await Productos.crear(
        { nombre: 'Muestra suelta', stock_inicial: { cantidad: 2, costo_unitario_usd_cents: 500 } },
        g()
      );

      const sueltos = await Productos.listar({ paquete_id: 'SIN_PAQUETE' });
      expect(sueltos.map((p) => p.nombre)).toEqual(['Muestra suelta']);
    },
    90_000
  );

  it.skipIf(!disponible)(
    'filtrar por un paquete que no trajo nada devuelve vacío, no todo',
    async () => {
      // Un filtro que ante la duda muestra todo es peor que no tenerlo:
      // parece que el paquete trajo mercadería que nunca trajo.
      const { Productos } = await repos();
      await paqueteRecibido([{ descripcion: 'Gloss', cantidad: 5, precio_linea_usd_cents: 4000 }]);

      const deOtro = await Productos.listar({ paquete_id: 9999 });
      expect(deOtro).toHaveLength(0);
    },
    90_000
  );
});
