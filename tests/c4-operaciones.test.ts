/**
 * Fase C4 · T1: la misma operación nunca se escribe dos veces.
 *
 * Sin señal, el celular guarda la venta, el abono o la clienta en una cola y
 * los sube al volver la red. Si la subida llega a guardarse pero la respuesta
 * se pierde, la cola la vuelve a mandar: con el mismo `operacion_id`, el
 * repositorio encuentra la marca `operaciones/<id>` y devuelve lo que quedó
 * guardado, sin escribir nada más.
 *
 * Y un corte a mitad no puede dejar la base a medias: antes la venta sacaba
 * la mercadería en pasos separados y, si la red caía entre uno y otro, quedaban
 * unidades descontadas sin venta que las explicara.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { cortarRed, reiniciarFirestoreFalso, restaurarRed, volcar } from './firestore-fake';
import { ProductosRepoFirestore as Productos } from '../src/main/firebase/repositories/productos.repo';
import { ComprasRepoFirestore as Compras } from '../src/main/firebase/repositories/compras.repo';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { PagosRepoFirestore as Pagos } from '../src/main/firebase/repositories/pagos.repo';
import { ClientesRepoFirestore as Clientes } from '../src/main/firebase/repositories/clientes.repo';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { valorDeLotes } from '../src/core/lotes';
import { hoyISO } from '../src/core/fechas';
import type { CrearVentaInput } from '../src/shared/ipc-contracts';

const g = () => randomUUID();
const HOY = hoyISO();

beforeEach(async () => {
  reiniciarFirestoreFalso();
  Parametros.invalidarCache();
  Panel.invalidarCache();
  await Parametros.getParametros();
  await Parametros.getCategorias();
});

afterEach(() => {
  restaurarRed();
});

async function producto(nombre: string, n: number, costo: number) {
  const id = await Productos.crear({ nombre, modo_precio: 'MARGEN', margen_bp: 5000 }, g());
  const pq = await Compras.guardar(
    {
      fecha: '2026-09-16',
      envio_total_usd_cents: 0,
      lineas: [{ producto_id: id, descripcion: nombre, cantidad: n, precio_linea_usd_cents: n * costo, exento: true, destino: 'INVENTARIO' }],
    },
    g()
  );
  await Compras.recibir(pq, g());
  return id;
}

const existencias = async (id: number) =>
  (await Productos.listar({ incluirInactivos: true })).find((p) => p.id === id)!.existencias;

const marcas = (op: string) => volcar('operaciones').filter((m) => m.operacion_id === op);

function bodegaCuadra(id: number) {
  const doc = volcar('productos').find((d) => Number(d.id) === id) as { valor_inventario_usd_cents: number; lotes: never[] };
  expect(doc.valor_inventario_usd_cents).toBe(valorDeLotes(doc.lotes));
}

const venta = (lineas: CrearVentaInput['lineas'], extra: Partial<CrearVentaInput> = {}): CrearVentaInput => ({
  fecha: HOY,
  tipo: 'INVENTARIO',
  lineas,
  ...extra,
});

describe('Una venta con operacion_id', () => {
  it('subida dos veces deja una venta, un pago, un solo descuento de bodega y una marca', async () => {
    const id = await producto('Labial C4', 5, 400);
    const input = venta([{ producto_id: id, cantidad: 2, precio_unitario_usd_cents: 1200 }], {
      pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO' },
    });

    const primera = await Ventas.crear(input, g(), 'op-venta-1');
    const segunda = await Ventas.crear(input, g(), 'op-venta-1');

    expect(segunda).toBe(primera);
    expect(volcar('ventas')).toHaveLength(1);
    expect(volcar('pagos')).toHaveLength(1);
    expect(await existencias(id)).toBe(3);
    expect(marcas('op-venta-1')).toHaveLength(1);
    bodegaCuadra(id);
  });

  it.each([0, 1, 2, 3])('cortada después de %i confirmaciones no deja la base a medias, y el reintento termina en una sola venta', async (n) => {
    const a = await producto('Gloss C4', 3, 300);
    const b = await producto('Rubor C4', 3, 500);
    const input = venta([
      { producto_id: a, cantidad: 1, precio_unitario_usd_cents: 900 },
      { producto_id: b, cantidad: 1, precio_unitario_usd_cents: 1500 },
    ]);

    // Según dónde caiga el corte, la venta falla o alcanza a guardarse entera
    // (lo que se corta después, como los totales de la clienta, no la deshace).
    cortarRed(n);
    await Ventas.crear(input, g(), 'op-corte').catch(() => undefined);
    restaurarRed();

    // O no se hizo nada, o se hizo todo: nunca unidades descontadas sin venta.
    const ventasTrasElCorte = volcar('ventas').length;
    const enBodega = [await existencias(a), await existencias(b)];
    if (ventasTrasElCorte === 0) expect(enBodega).toEqual([3, 3]);
    else expect(enBodega).toEqual([2, 2]);

    await Ventas.crear(input, g(), 'op-corte');
    expect(volcar('ventas')).toHaveLength(1);
    expect([await existencias(a), await existencias(b)]).toEqual([2, 2]);
    expect(marcas('op-corte')).toHaveLength(1);
    bodegaCuadra(a);
    bodegaCuadra(b);
  });

  it('una venta que no se puede hacer (sin unidades) no deja marca: se puede reintentar', async () => {
    const id = await producto('Último C4', 1, 500);
    const input = venta([{ producto_id: id, cantidad: 2, precio_unitario_usd_cents: 900 }]);

    await expect(Ventas.crear(input, g(), 'op-sin-unidades')).rejects.toThrow(/No hay suficientes/);

    expect(marcas('op-sin-unidades')).toHaveLength(0);
    expect(volcar('ventas')).toHaveLength(0);
    expect(await existencias(id)).toBe(1);
  });

  it('hecha sin señal, guarda la tasa del momento en que se vendió', async () => {
    const id = await producto('Perfume C4', 2, 2000);
    const input = venta([{ producto_id: id, cantidad: 1, precio_unitario_usd_cents: 5000 }], {
      tasa_cambio_cents: 3700,
      pago_inicial: { moneda: 'COR', metodo: 'EFECTIVO' },
    });

    await Ventas.crear(input, g(), 'op-tasa');

    const [guardada] = volcar('ventas') as { tasa_cambio_cents: number }[];
    const [pago] = volcar('pagos') as { tasa_cambio_cents: number; monto_cor_cents: number }[];
    expect(guardada.tasa_cambio_cents).toBe(3700);
    expect(pago.tasa_cambio_cents).toBe(3700);
    expect(pago.monto_cor_cents).toBe(185000);
  });

  it('sin operacion_id sigue como siempre: dos ventas iguales son dos ventas', async () => {
    const id = await producto('Sombra C4', 4, 300);
    const input = venta([{ producto_id: id, cantidad: 1, precio_unitario_usd_cents: 800 }]);
    await Ventas.crear(input, g());
    await Ventas.crear(input, g());
    expect(volcar('ventas')).toHaveLength(2);
    expect(await existencias(id)).toBe(2);
  });
});

describe('Un abono con operacion_id', () => {
  it('subido dos veces deja un pago y el saldo baja una vez', async () => {
    const id = await producto('Bolso C4', 2, 1000);
    const cliente_id = await Clientes.guardar({ nombre: 'Clienta Abono C4' }, g());
    const venta_id = await Ventas.crear(venta([{ producto_id: id, cantidad: 1, precio_unitario_usd_cents: 3000 }], { cliente_id }), g());

    const pago = { venta_id, monto_cents: 1000, moneda: 'USD' as const, metodo: 'EFECTIVO' as const, fecha: HOY };
    const primero = await Pagos.registrar(pago, g(), 'op-abono-1');
    const segundo = await Pagos.registrar(pago, g(), 'op-abono-1');

    expect(segundo.pago_id).toBe(primero.pago_id);
    expect(volcar('pagos')).toHaveLength(1);
    const [v] = volcar('ventas') as { saldo_usd_cents: number }[];
    expect(v.saldo_usd_cents).toBe(2000);
    expect(marcas('op-abono-1')).toHaveLength(1);
  });
});

describe('Una clienta con operacion_id', () => {
  it('subida dos veces deja una sola clienta', async () => {
    const primera = await Clientes.guardar({ nombre: 'Clienta Nueva C4', telefono: '88887771' }, g(), 'op-clienta-1');
    const segunda = await Clientes.guardar({ nombre: 'Clienta Nueva C4', telefono: '88887771' }, g(), 'op-clienta-1');

    expect(segunda).toBe(primera);
    expect(volcar('clientes').filter((c) => c.nombre === 'Clienta Nueva C4')).toHaveLength(1);
    expect(marcas('op-clienta-1')).toHaveLength(1);
  });
});
