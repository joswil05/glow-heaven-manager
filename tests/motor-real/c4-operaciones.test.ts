/**
 * Fase C4 · T1: la marca de una operación contra el emulador, con las reglas.
 *
 * El Firestore falso no tiene reglas ni choques entre transacciones; acá se
 * prueba lo que sólo el motor real puede decir: que la colección
 * `operaciones` está abierta para crear, que una marca no se pisa ni se borra,
 * y que dos subidas de la misma venta al mismo tiempo terminan en una.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../../src/main/firebase/client';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

async function contar(coleccion: string): Promise<number> {
  return (await getDocs(collection(getFirestoreDb(), coleccion))).size;
}

async function productoCon(n: number): Promise<number> {
  const { Productos, Compras } = await repos();
  const id = await Productos.crear({ nombre: `Labial C4 ${n}`, modo_precio: 'MARGEN', margen_bp: 5000 }, g());
  const paquete = await Compras.guardar(
    {
      fecha: HOY,
      envio_total_usd_cents: 0,
      lineas: [{ producto_id: id, descripcion: 'Labial C4', cantidad: n, precio_linea_usd_cents: n * 400, exento: true, destino: 'INVENTARIO' }],
    },
    g()
  );
  await Compras.recibir(paquete, g());
  return id;
}

async function existencias(id: number): Promise<number> {
  const { Productos } = await repos();
  return (await Productos.listar({ incluirInactivos: true })).find((p) => p.id === id)!.existencias;
}

describe('C4: la marca de cada operación, contra el emulador', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)('una venta subida dos veces queda una, con su marca', async () => {
    const { Ventas } = await repos();
    const id = await productoCon(5);
    const input = {
      fecha: HOY,
      tipo: 'INVENTARIO' as const,
      lineas: [{ producto_id: id, cantidad: 2, precio_unitario_usd_cents: 1200 }],
      pago_inicial: { moneda: 'USD' as const, metodo: 'EFECTIVO' as const },
    };

    const primera = await Ventas.crear(input, g(), 'op-real-venta');
    const segunda = await Ventas.crear(input, g(), 'op-real-venta');

    expect(segunda).toBe(primera);
    expect(await contar('ventas')).toBe(1);
    expect(await contar('pagos')).toBe(1);
    expect(await existencias(id)).toBe(3);
    const marca = await getDoc(doc(getFirestoreDb(), 'operaciones', 'op-real-venta'));
    expect(marca.data()).toMatchObject({ tipo: 'VENTA', resultado_id: primera });
  }, 30_000);

  it.skipIf(!disponible)('dos subidas de la misma venta al mismo tiempo terminan en una', async () => {
    // La segunda transacción choca con la primera, se reintenta, encuentra la
    // marca y devuelve la misma venta.
    const { Ventas } = await repos();
    const id = await productoCon(5);
    const input = {
      fecha: HOY,
      tipo: 'INVENTARIO' as const,
      lineas: [{ producto_id: id, cantidad: 1, precio_unitario_usd_cents: 900 }],
    };

    const [a, b] = await Promise.all([
      Ventas.crear(input, g(), 'op-real-par'),
      Ventas.crear(input, g(), 'op-real-par'),
    ]);

    expect(b).toBe(a);
    expect(await contar('ventas')).toBe(1);
    expect(await existencias(id)).toBe(4);
  }, 30_000);

  it.skipIf(!disponible)('un abono y una clienta subidos dos veces quedan una vez', async () => {
    const { Ventas, Pagos, Clientes } = await repos();
    const cliente_id = await Clientes.guardar({ nombre: 'Clienta C4 real' }, g(), 'op-real-clienta');
    expect(await Clientes.guardar({ nombre: 'Clienta C4 real' }, g(), 'op-real-clienta')).toBe(cliente_id);
    expect(await contar('clientes')).toBe(1);

    const venta_id = await Ventas.crear(
      { fecha: HOY, tipo: 'INVENTARIO', cliente_id, lineas: [{ descripcion: 'Bolso C4', cantidad: 1, precio_unitario_usd_cents: 3000 }] },
      g()
    );
    const pago = { venta_id, monto_cents: 1000, moneda: 'USD' as const, metodo: 'EFECTIVO' as const, fecha: HOY };
    const primero = await Pagos.registrar(pago, g(), 'op-real-abono');
    const segundo = await Pagos.registrar(pago, g(), 'op-real-abono');

    expect(segundo).toEqual(primero);
    expect(await contar('pagos')).toBe(1);
    expect((await Ventas.getById(venta_id))!.saldo_usd_cents).toBe(2000);
  }, 30_000);

  it.skipIf(!disponible)('una marca no se pisa ni se borra', async () => {
    const ref = doc(getFirestoreDb(), 'operaciones', 'op-real-fija');
    const marca = { operacion_id: 'op-real-fija', tipo: 'VENTA', resultado_id: 1, creada_en: new Date().toISOString() };

    await setDoc(ref, marca);
    await expect(setDoc(ref, { ...marca, resultado_id: 2 })).rejects.toThrow(/permission/i);
    await expect(deleteDoc(ref)).rejects.toThrow(/permission/i);
    expect((await getDoc(ref)).data()).toMatchObject({ resultado_id: 1 });
  }, 30_000);
});
