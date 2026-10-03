/**
 * "Fue un error" contra el Firestore de verdad, con sus reglas.
 *
 * El motor en memoria (`tests/borrado.test.ts`) no aplica `firestore.rules`.
 * Acá se prueba lo que sólo el servidor decide: que un movimiento de
 * inventario se pueda borrar junto con su venta, y que mientras la venta
 * exista nadie pueda tocarle el historial.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';
import { revisarInvariantes } from './invariantes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

async function borrado() {
  return (await import('../../src/main/firebase/repositories/borrado.repo')).BorradoRepoFirestore;
}

/** Los movimientos de una venta, leídos del servidor. */
async function movimientosDe(venta_id: number) {
  const { getDocs, query, collection, where } = await import('firebase/firestore');
  const { getFirestoreDb } = await import('../../src/main/firebase/client');
  const snap = await getDocs(query(collection(getFirestoreDb(), 'movimientos_inventario'), where('referencia_id', '==', venta_id)));
  return snap.docs.filter((d) => d.data().referencia_tipo === 'VENTA').map((d) => d.id);
}

/** El código con que el servidor rechaza una escritura, o '' si la acepta. */
async function codigoDeError(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return '';
  } catch (err) {
    return String((err as { code?: string }).code ?? (err as Error).message);
  }
}

describe('"Fue un error" contra el emulador', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'borrar una venta se lleva sus movimientos, sus abonos y sus eventos, y la bodega vuelve a estar como antes',
    async () => {
      const { Productos, Ventas, Clientes, Panel } = await repos();
      const Borrado = await borrado();

      const termo = await Productos.crear(
        { nombre: 'Termo', modo_precio: 'MANUAL', precio_manual_usd_cents: 4500, stock_inicial: { cantidad: 3, costo_unitario_usd_cents: 3918 } },
        g()
      );
      const antes = (await Productos.getById(termo))!;
      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const v = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: termo, cantidad: 2, precio_unitario_usd_cents: 4500 }],
          pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO', monto_cents: 2000 },
        },
        g()
      );
      expect(await movimientosDe(v)).toHaveLength(1);

      await Borrado.venta(v, undefined, g());

      expect(await Ventas.getById(v)).toBeNull();
      expect(await movimientosDe(v)).toHaveLength(0);
      const despues = (await Productos.getById(termo))!;
      expect([despues.existencias, despues.valor_inventario_usd_cents]).toEqual([antes.existencias, antes.valor_inventario_usd_cents]);
      Panel.invalidarCache();
      const fallas = await revisarInvariantes();
      expect(fallas.map((f) => `${f.invariante}: ${f.detalle}`)).toEqual([]);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'una cancelada del 29 de septiembre se borra el 3 de octubre sin devolver dos veces ni dejar el resumen anterior',
    async () => {
      const { Productos, Ventas, Clientes, Panel } = await repos();
      const { ComprasRepoFirestore: Compras } = await import('../../src/main/firebase/repositories/compras.repo');
      const { PagosRepoFirestore: Pagos } = await import('../../src/main/firebase/repositories/pagos.repo');
      const { ResumenesRepoFirestore: Resumenes } = await import('../../src/main/firebase/repositories/resumenes.repo');
      const { leerDoc } = await import('../../src/main/firebase/client');
      const Borrado = await borrado();
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date('2026-09-29T18:00:00Z'));
        const termo = await Productos.crear({ nombre: 'Termo', modo_precio: 'MANUAL', precio_manual_usd_cents: 4500 }, g());
        const paquete = await Compras.guardar({
          fecha: '2026-09-29',
          envio_total_usd_cents: 0,
          lineas: [{ producto_id: termo, descripcion: 'Termo', cantidad: 3, precio_linea_usd_cents: 3000, exento: true, destino: 'INVENTARIO' }],
        }, g());
        await Compras.recibir(paquete, g());
        const antes = (await Productos.getById(termo))!;
        const ana = await Clientes.guardar({ nombre: 'Ana Prueba de cambio de mes' }, g());
        const v = await Ventas.crear({
          cliente_id: ana,
          fecha: '2026-09-29',
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: termo, cantidad: 2, precio_unitario_usd_cents: 4500 }],
          pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO', monto_cents: 2000 },
        }, g());
        await Ventas.cambiarEstado(v, 'CANCELADA', g());

        vi.setSystemTime(new Date('2026-10-03T18:00:00Z'));
        await Resumenes.guardar([await Resumenes.calcularMes('2026-09')]);
        expect(await leerDoc('resumenes_mensuales', '2026-09')).not.toBeNull();
        await Borrado.venta(v, undefined, g());

        expect(await Ventas.getById(v)).toBeNull();
        expect(await movimientosDe(v)).toHaveLength(0);
        expect(await Pagos.listarPorVenta(v)).toHaveLength(0);
        expect(await leerDoc('resumenes_mensuales', '2026-09')).toBeNull();
        const despues = (await Productos.getById(termo))!;
        expect([despues.existencias, despues.valor_inventario_usd_cents, despues.lotes]).toEqual([
          antes.existencias, antes.valor_inventario_usd_cents, antes.lotes,
        ]);
        Panel.invalidarCache();
        const fallas = await revisarInvariantes();
        expect(fallas.map((f) => `${f.invariante}: ${f.detalle}`)).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    },
    60_000
  );

  it.skipIf(!disponible)(
    'mientras la venta exista, las reglas no dejan borrarle el historial',
    async () => {
      const { Productos, Ventas } = await repos();
      const { aplicarLote } = await import('../../src/main/firebase/client');

      const termo = await Productos.crear(
        { nombre: 'Termo', modo_precio: 'MANUAL', precio_manual_usd_cents: 4500, stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 3918 } },
        g()
      );
      const v = await Ventas.crear(
        { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: termo, cantidad: 1, precio_unitario_usd_cents: 4500 }] },
        g()
      );
      const [movimiento] = await movimientosDe(v);

      // Sin la venta en el mismo lote: no.
      expect(await codigoDeError(() => aplicarLote([{ coleccion: 'movimientos_inventario', id: movimiento, borrar: true }]))).toBe(
        'permission-denied'
      );
      // Tampoco se edita.
      expect(
        await codigoDeError(() =>
          aplicarLote([{ coleccion: 'movimientos_inventario', id: movimiento, merge: true, datos: { cantidad: 99 } }])
        )
      ).toBe('permission-denied');
      expect(await movimientosDe(v)).toEqual([movimiento]);
    },
    60_000
  );
});
