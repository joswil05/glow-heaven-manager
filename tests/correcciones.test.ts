/**
 * Corregir una venta y un abono, contra los repositorios reales (Firestore
 * falso). Ver `docs/PLAN_ENCARGOS_Y_SIN_CONEXION.md`, sección 2b.
 *
 * El caso que lo pidió: V-0007 (29/9) se cargó con dos productos equivocados,
 * y la única salida fue borrarla desde la consola de Firebase. Eso dejó los
 * productos "agotados" y el pago contado como cobrado.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reiniciarFirestoreFalso, volcar } from './firestore-fake';
import { ProductosRepoFirestore as Productos } from '../src/main/firebase/repositories/productos.repo';
import { ComprasRepoFirestore as Compras } from '../src/main/firebase/repositories/compras.repo';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { PagosRepoFirestore as Pagos } from '../src/main/firebase/repositories/pagos.repo';
import { ClientesRepoFirestore as Clientes } from '../src/main/firebase/repositories/clientes.repo';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { EventosRepoFirestore as Eventos } from '../src/main/firebase/repositories/eventos.repo';
import { valorDeLotes } from '../src/core/lotes';
import { hoyISO } from '../src/core/fechas';
import type { LineaVentaInput } from '../src/shared/ipc-contracts';

const g = () => randomUUID();
const HOY = hoyISO();

beforeEach(async () => {
  reiniciarFirestoreFalso();
  Parametros.invalidarCache();
  Panel.invalidarCache();
  await Parametros.getParametros();
  await Parametros.getCategorias();
  // Deshacer compara instantes; en el falso todo cae en el mismo milisegundo
  // (ver CONTEXTO_SESION, sección 4).
  const registrar = Eventos.registrarVarios.bind(Eventos);
  vi.spyOn(Eventos, 'registrarVarios').mockImplementation(async (eventos) => {
    await registrar(eventos);
    await new Promise((r) => setTimeout(r, 3));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Un producto con `n` unidades, cada una a `costo` ¢ (sin flete ni impuesto). */
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

const leerProducto = async (id: number) => (await Productos.listar({ incluirInactivos: true })).find((p) => p.id === id)!;
const existencias = async (id: number) => (await leerProducto(id)).existencias;

/** La bodega de un producto es la suma exacta de sus lotes. */
async function cuadra(id: number) {
  const doc = volcar('productos').find((d) => Number(d.id) === id) as { valor_inventario_usd_cents: number; lotes: never[] };
  expect(doc.valor_inventario_usd_cents).toBe(valorDeLotes(doc.lotes));
}

const lineaDe = (producto_id: number, cantidad: number, precio: number): LineaVentaInput => ({
  producto_id,
  cantidad,
  precio_unitario_usd_cents: precio,
});

/** Una venta de inventario, sin pago (fiada) salvo que se pida. */
const vender = (lineas: LineaVentaInput[], extra: Record<string, unknown> = {}) =>
  Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas, ...extra }, g());

const leer = async (id: number) => (await Ventas.getById(id))!;

describe('corregir una venta', () => {
  it('un producto por otro: el equivocado vuelve a su lote y sale el correcto, con el mismo número', async () => {
    const polvo = await producto('Polvo Rosa', 1, 706);
    const banana = await producto('Banana Republic', 2, 1134);
    const v = await vender([lineaDe(polvo, 1, 1500)]);
    const codigo = (await leer(v)).codigo;
    expect(await existencias(polvo)).toBe(0);

    await Ventas.corregir(v, { fecha: HOY, lineas: [lineaDe(banana, 1, 1500)] }, g());

    const c = await leer(v);
    expect(c.codigo).toBe(codigo);
    expect(c.lineas.map((l) => l.producto_id)).toEqual([banana]);
    expect([c.total_usd_cents, c.costo_total_usd_cents, c.ganancia_usd_cents, c.saldo_usd_cents]).toEqual([1500, 1134, 366, 1500]);
    expect(await existencias(polvo)).toBe(1);
    expect(await existencias(banana)).toBe(1);
    const lotePolvo = (await leerProducto(polvo)).lotes![0];
    expect([lotePolvo.vendidas, lotePolvo.ingreso_usd_cents, lotePolvo.costo_vendido_usd_cents]).toEqual([0, 0, 0]);
    const loteBanana = (await leerProducto(banana)).lotes![0];
    expect([loteBanana.vendidas, loteBanana.ingreso_usd_cents]).toEqual([1, 1500]);
    await cuadra(polvo);
    await cuadra(banana);
  });

  it('subir la cantidad saca más; bajarla devuelve', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 2500)]);
    await Ventas.corregir(v, { fecha: HOY, lineas: [lineaDe(termo, 2, 2500)] }, g());
    expect(await existencias(termo)).toBe(1);
    expect((await leer(v)).total_usd_cents).toBe(5000);
    await Ventas.corregir(v, { fecha: HOY, lineas: [lineaDe(termo, 1, 2500)] }, g());
    expect(await existencias(termo)).toBe(2);
    await cuadra(termo);
  });

  it('sólo el precio: la bodega no se mueve, y el lote anota el precio nuevo', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 2500)]);
    const movimientosAntes = volcar('movimientos_inventario').length;
    await Ventas.corregir(v, { fecha: HOY, lineas: [lineaDe(termo, 1, 2200)] }, g());
    expect(await existencias(termo)).toBe(2);
    expect((await leerProducto(termo)).lotes![0].ingreso_usd_cents).toBe(2200);
    expect(volcar('movimientos_inventario').length).toBe(movimientosAntes);
    expect((await leer(v)).ganancia_usd_cents).toBe(1200);
  });

  it('sin stock suficiente se rechaza, contando lo que la venta devuelve, y no cambia nada', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 2500)]);
    const antes = await leer(v);
    await expect(Ventas.corregir(v, { fecha: HOY, lineas: [lineaDe(termo, 4, 2500)] }, g())).rejects.toThrow(
      /Disponibles: 3 \(contando las de esta venta\), pedidas: 4/
    );
    expect(await existencias(termo)).toBe(2);
    expect((await leer(v)).lineas).toEqual(antes.lineas);
  });

  it('si lo pagado queda por encima del total nuevo, se pide corregir el abono primero', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 2, 2500)], { pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO' } });
    await expect(Ventas.corregir(v, { fecha: HOY, lineas: [lineaDe(termo, 1, 2500)] }, g())).rejects.toThrow(/Corregí el abono/);
    expect(await existencias(termo)).toBe(1);
  });

  it('el saldo se recalcula con lo que ya pagó', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 2500)], { pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO', monto_cents: 1000 } });
    await Ventas.corregir(v, { fecha: HOY, lineas: [lineaDe(termo, 2, 2500)] }, g());
    const c = await leer(v);
    expect([c.total_usd_cents, c.pagado_usd_cents, c.saldo_usd_cents]).toEqual([5000, 1000, 4000]);
  });

  it('cambiar la clienta: la deuda pasa de una a otra', async () => {
    const termo = await producto('Termo', 3, 1000);
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const bea = await Clientes.guardar({ nombre: 'Bea' }, g());
    const v = await vender([lineaDe(termo, 1, 2500)], { cliente_id: ana });
    await Ventas.corregir(v, { cliente_id: bea, fecha: HOY, lineas: [lineaDe(termo, 1, 2500)] }, g());
    const deuda = async (id: number) => (await Clientes.getById(id))!.saldo_pendiente_usd_cents;
    expect([await deuda(ana), await deuda(bea)]).toEqual([0, 2500]);
    // Y a mostrador: sin clienta.
    await Ventas.corregir(v, { fecha: HOY, lineas: [lineaDe(termo, 1, 2500)] }, g());
    expect((await leer(v)).cliente_id).toBeUndefined();
    expect(await deuda(bea)).toBe(0);
  });

  it('con descuento, el lote anota lo cobrado ya descontado', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 2500)]);
    await Ventas.corregir(
      v,
      { fecha: HOY, descuento_tipo: 'PORCENTAJE', descuento_valor: 10, lineas: [lineaDe(termo, 2, 2500)] },
      g()
    );
    const c = await leer(v);
    expect([c.subtotal_usd_cents, c.descuento_usd_cents, c.total_usd_cents]).toEqual([5000, 500, 4500]);
    expect((await leerProducto(termo)).lotes![0].ingreso_usd_cents).toBe(4500);
  });

  it('la fecha y una línea libre también se corrigen', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 2500)]);
    await Ventas.corregir(
      v,
      { fecha: '2026-09-28', lineas: [lineaDe(termo, 1, 2500), { descripcion: 'Envío', cantidad: 1, precio_unitario_usd_cents: 300 }] },
      g()
    );
    const c = await leer(v);
    expect([c.fecha, c.total_usd_cents, c.lineas.length]).toEqual(['2026-09-28', 2800, 2]);
    expect(c.lineas[1]).toMatchObject({ descripcion: 'Envío', costo_total_usd_cents: 0 });
  });

  it('una venta a cuotas conserva sus fechas y reparte el total nuevo', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 3000)], { plan_cuotas: { cantidad: 3, cada_dias: 15 } });
    const fechas = (await leer(v)).cuotas.map((q) => q.fecha_vencimiento);
    await Ventas.corregir(v, { fecha: HOY, lineas: [lineaDe(termo, 2, 3000)] }, g());
    const c = await leer(v);
    expect(c.cuotas.map((q) => q.fecha_vencimiento)).toEqual(fechas);
    expect(c.cuotas.reduce((s, q) => s + q.monto_usd_cents, 0)).toBe(6000);
  });

  it('un encargo, o una venta anulada, no se corrigen así', async () => {
    const termo = await producto('Termo', 3, 1000);
    const e = await Ventas.crear(
      { fecha: HOY, tipo: 'ENCARGO', lineas: [{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 5000 }] },
      g()
    );
    await expect(Ventas.corregir(e, { fecha: HOY, lineas: [lineaDe(termo, 1, 2500)] }, g())).rejects.toThrow(/encargo/i);
    const v = await vender([lineaDe(termo, 1, 2500)]);
    await Ventas.cambiarEstado(v, 'CANCELADA', g());
    await expect(Ventas.corregir(v, { fecha: HOY, lineas: [lineaDe(termo, 1, 2500)] }, g())).rejects.toThrow(/anulada/);
  });

  it('el rastro: un evento con la venta de antes, que no se deshace, y un movimiento por producto que cambió', async () => {
    const polvo = await producto('Polvo Rosa', 1, 706);
    const banana = await producto('Banana Republic', 2, 1134);
    const v = await vender([lineaDe(polvo, 1, 1500)]);
    const movimientosAntes = volcar('movimientos_inventario').length;
    const grupo = g();
    await Ventas.corregir(v, { fecha: HOY, lineas: [lineaDe(banana, 1, 1500)] }, grupo);

    const nuevos = volcar('movimientos_inventario').slice(movimientosAntes) as { tipo: string; producto_id: number; cantidad: number; detalle: string }[];
    expect(nuevos.map((m) => [m.tipo, m.producto_id, m.cantidad])).toEqual(
      expect.arrayContaining([
        ['ENTRADA', polvo, 1],
        ['SALIDA', banana, 1],
      ])
    );
    expect(nuevos).toHaveLength(2);
    const r = await Eventos.deshacerGrupo(grupo);
    expect(r.revertido).toBe(false);
    expect((await leer(v)).lineas[0].producto_id).toBe(banana);
  });
});

describe('corregir un abono', () => {
  it('cambiar el monto recalcula lo pagado y el saldo de la venta', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 2500)]);
    const { pago_id } = await Pagos.registrar({ venta_id: v, fecha: HOY, monto_cents: 1500, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    await Pagos.corregir(pago_id, { fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'TRANSFERENCIA', referencia: 'BAC 123' }, g());
    const c = await leer(v);
    expect([c.pagado_usd_cents, c.saldo_usd_cents]).toEqual([1000, 1500]);
    expect(c.pagos[0]).toMatchObject({ monto_usd_cents: 1000, metodo: 'TRANSFERENCIA', referencia: 'BAC 123' });
  });

  it('en córdobas usa la tasa congelada del abono, no la de hoy', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 2500)]);
    const { pago_id } = await Pagos.registrar({ venta_id: v, fecha: HOY, monto_cents: 36620, moneda: 'COR', metodo: 'EFECTIVO' }, g());
    // La tasa del día cambió después del abono.
    await Parametros.actualizar({ tasa_cambio_cents: 4000 }, g());
    // C$549.30 a la tasa del abono (36.62) son $15.00.
    await Pagos.corregir(pago_id, { fecha: HOY, monto_cents: 54930, moneda: 'COR', metodo: 'EFECTIVO' }, g());
    const c = await leer(v);
    expect(c.pagos[0]).toMatchObject({ monto_cor_cents: 54930, monto_usd_cents: 1500, tasa_cambio_cents: 3662 });
    expect(c.saldo_usd_cents).toBe(1000);
  });

  it('se puede deshacer', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 2500)]);
    const { pago_id } = await Pagos.registrar({ venta_id: v, fecha: HOY, monto_cents: 1500, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    const grupo = g();
    await Pagos.corregir(pago_id, { fecha: HOY, monto_cents: 500, moneda: 'USD', metodo: 'EFECTIVO' }, grupo);
    expect((await Eventos.deshacerGrupo(grupo)).revertido).toBe(true);
    const c = await leer(v);
    expect([c.pagado_usd_cents, c.saldo_usd_cents, c.pagos[0].monto_usd_cents]).toEqual([1500, 1000, 1500]);
  });

  it('un abono anulado, o de una venta anulada, no se corrige', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 2500)]);
    const { pago_id } = await Pagos.registrar({ venta_id: v, fecha: HOY, monto_cents: 1500, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    await Pagos.anular(pago_id, g());
    await expect(Pagos.corregir(pago_id, { fecha: HOY, monto_cents: 500, moneda: 'USD', metodo: 'EFECTIVO' }, g())).rejects.toThrow(/anulado/);
  });

  it('un monto en cero no se acepta', async () => {
    const termo = await producto('Termo', 3, 1000);
    const v = await vender([lineaDe(termo, 1, 2500)]);
    const { pago_id } = await Pagos.registrar({ venta_id: v, fecha: HOY, monto_cents: 1500, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    await expect(Pagos.corregir(pago_id, { fecha: HOY, monto_cents: 0, moneda: 'USD', metodo: 'EFECTIVO' }, g())).rejects.toThrow(/mayor que cero/);
  });
});

describe('aceptar queda firme', () => {
  const encargo = () =>
    Ventas.crear(
      { fecha: HOY, tipo: 'ENCARGO', anticipo_bp: 5000, lineas: [{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 5000 }] },
      g()
    );

  it('anular un abono no desacepta un encargo', async () => {
    const e = await encargo();
    await Ventas.aceptar(e, g());
    const { pago_id } = await Pagos.registrar({ venta_id: e, fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    await Pagos.anular(pago_id, g());
    expect((await leer(e)).estado).toBe('PENDIENTE');
  });

  it('corregir un abono para que cubra el anticipo acepta el encargo', async () => {
    const e = await encargo();
    const { pago_id } = await Pagos.registrar({ venta_id: e, fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    expect((await leer(e)).estado).toBe('COTIZADA');
    await Pagos.corregir(pago_id, { fecha: HOY, monto_cents: 2500, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    expect([(await leer(e)).estado, (await leer(e)).aceptado_el]).toEqual(['PENDIENTE', HOY]);
  });
});
