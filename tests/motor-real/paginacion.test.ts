/**
 * Traer la historia de a pedazos sin perder ni repetir una venta.
 *
 * Un listado paginado falla de una forma particularmente fea: no se rompe,
 * simplemente le falta una venta. Nadie lo nota hasta que alguien busca la
 * compra de diciembre y no está, y para entonces ya no se sabe si el error es
 * de la pantalla o si la venta nunca se registró.
 *
 * El corte va por fecha Y por id. La fecha sola no alcanza: cinco ventas del
 * mismo día comparten la fecha, y un corte que sólo mire la fecha se saltea
 * cuatro o las repite. Estas pruebas se aseguran de que las páginas pegadas
 * den exactamente la misma lista que traer todo de una.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g } from './arnes';
import { haceDias } from '../../src/core/fechas';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

async function crearVentas(cantidad: number, fechaDe: (i: number) => string) {
  const { Ventas } = await repos();
  const ids: number[] = [];
  for (let i = 0; i < cantidad; i++) {
    ids.push(
      await Ventas.crear(
        {
          fecha: fechaDe(i),
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: `art ${i}`, cantidad: 1, precio_unitario_usd_cents: 1000 + i }],
        },
        g()
      )
    );
  }
  return ids;
}

/** Recorre la lista entera de a `tamano`, como lo hace el botón de la pantalla. */
async function recorrerPaginando(tamano: number) {
  const { Ventas } = await repos();
  const todas: { id: number; fecha: string }[] = [];
  let cursor: { fecha: string; id: number } | undefined;

  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const pagina = await Ventas.listar({ limite: tamano, despuesDe: cursor });
    todas.push(...pagina.map((v) => ({ id: v.id, fecha: v.fecha })));
    if (pagina.length < tamano) break;
    const ultima = pagina[pagina.length - 1];
    cursor = { fecha: ultima.fecha, id: ultima.id };
  }
  return todas;
}

describe('traer la historia de a páginas', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'las páginas pegadas dan la misma lista que traer todo de una',
    async () => {
      const { Ventas } = await repos();
      await crearVentas(23, (i) => haceDias(i * 3));

      const deUnaVez = await Ventas.listar({});
      const paginando = await recorrerPaginando(5);

      expect(paginando.map((v) => v.id)).toEqual(deUnaVez.map((v) => v.id));
    },
    120_000
  );

  it.skipIf(!disponible)(
    'varias ventas del mismo día no se saltean ni se repiten',
    async () => {
      // Acá es donde falla un cursor que sólo mira la fecha: las nueve ventas
      // comparten día, así que la fecha no alcanza para saber por dónde iba.
      const mismoDia = haceDias(10);
      const ids = await crearVentas(9, () => mismoDia);

      const paginando = await recorrerPaginando(4);

      expect(paginando).toHaveLength(9);
      expect(new Set(paginando.map((v) => v.id)).size, 'hubo ventas repetidas').toBe(9);
      expect([...paginando.map((v) => v.id)].sort((a, b) => a - b)).toEqual(
        [...ids].sort((a, b) => a - b)
      );
    },
    120_000
  );

  it.skipIf(!disponible)(
    'con días repetidos y sueltos mezclados tampoco se pierde nada',
    async () => {
      const { Ventas } = await repos();
      // Tres el lunes, una el martes, cuatro el miércoles, una suelta.
      await crearVentas(3, () => haceDias(20));
      await crearVentas(1, () => haceDias(15));
      await crearVentas(4, () => haceDias(9));
      await crearVentas(1, () => haceDias(1));

      const deUnaVez = await Ventas.listar({});
      const paginando = await recorrerPaginando(3);

      expect(paginando.map((v) => v.id)).toEqual(deUnaVez.map((v) => v.id));
      expect(paginando).toHaveLength(9);
    },
    120_000
  );

  it.skipIf(!disponible)(
    'la página cinco cuesta lo mismo que la primera',
    async () => {
      // Es la diferencia entre un cursor y un `skip`: saltarse las primeras
      // veinte para traer las siguientes cinco costaría veinticinco lecturas.
      const { Ventas } = await repos();
      await crearVentas(25, (i) => haceDias(i));

      const primera = await Ventas.listar({ limite: 5 });
      expect(primera).toHaveLength(5);

      let cursor = {
        fecha: primera[primera.length - 1].fecha,
        id: primera[primera.length - 1].id,
      };
      let quinta: Awaited<ReturnType<typeof Ventas.listar>> = [];
      for (let i = 0; i < 4; i++) {
        quinta = await Ventas.listar({ limite: 5, despuesDe: cursor });
        const ultima = quinta[quinta.length - 1];
        cursor = { fecha: ultima.fecha, id: ultima.id };
      }

      expect(quinta, 'la quinta página trajo otra cantidad que la primera').toHaveLength(5);
      // Y no se pisa con la primera.
      const idsPrimera = new Set(primera.map((v) => v.id));
      expect(quinta.some((v) => idsPrimera.has(v.id)), 'la página cinco repitió la uno').toBe(
        false
      );
    },
    120_000
  );

  it.skipIf(!disponible)(
    'el corte respeta la ventana: no se cuela nada de antes',
    async () => {
      const { Ventas } = await repos();
      await crearVentas(6, (i) => haceDias(i)); // adentro
      await crearVentas(6, (i) => haceDias(200 + i)); // afuera

      const desde = haceDias(30);
      const primera = await Ventas.listar({ desde, limite: 4 });
      const ultima = primera[primera.length - 1];
      const segunda = await Ventas.listar({
        desde,
        limite: 4,
        despuesDe: { fecha: ultima.fecha, id: ultima.id },
      });

      const juntas = [...primera, ...segunda];
      expect(juntas).toHaveLength(6);
      expect(
        juntas.every((v) => v.fecha >= desde),
        'la segunda página trajo algo de fuera de la ventana'
      ).toBe(true);
    },
    120_000
  );

  it.skipIf(!disponible)(
    'pedir sólo las ventas de un tipo no trae las del otro',
    async () => {
      // Antes la pantalla traía los encargos del período para descartarlos en
      // memoria: pagaba documentos que nunca iba a mostrar.
      const { Ventas } = await repos();
      for (let i = 0; i < 5; i++) {
        await Ventas.crear(
          {
            fecha: haceDias(i),
            tipo: 'INVENTARIO',
            lineas: [{ descripcion: 'v', cantidad: 1, precio_unitario_usd_cents: 1000 }],
          },
          g()
        );
        await Ventas.crear(
          {
            fecha: haceDias(i),
            tipo: 'ENCARGO',
            lineas: [{ descripcion: 'e', cantidad: 1, precio_unitario_usd_cents: 2000 }],
          },
          g()
        );
      }

      const ventas = await Ventas.listar({ tipo: 'INVENTARIO', limite: 20 });
      expect(ventas).toHaveLength(5);
      expect(ventas.every((v) => v.tipo === 'INVENTARIO')).toBe(true);
    },
    120_000
  );
});
