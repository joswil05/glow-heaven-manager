/**
 * Editar y eliminar: que lo que depende de algo reaccione cuando ese algo
 * cambia o desaparece. Contra los repositorios reales (Firestore falso).
 *
 * Salió de la fase de pruebas del 29 de septiembre (2.16.1): la simulación
 * del negocio contra el emulador encontró una clienta eliminada con un
 * encargo en curso, y revisando cómo se arma Cobros apareció que su lista se
 * cortaba en diez ventas.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reiniciarFirestoreFalso } from './firestore-fake';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { PagosRepoFirestore as Pagos } from '../src/main/firebase/repositories/pagos.repo';
import { ClientesRepoFirestore as Clientes } from '../src/main/firebase/repositories/clientes.repo';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { EventosRepoFirestore as Eventos } from '../src/main/firebase/repositories/eventos.repo';
import { hoyISO } from '../src/core/fechas';
import { ProductosRepoFirestore as Productos } from '../src/main/firebase/repositories/productos.repo';
import { revisarInvariantes } from './motor-real/invariantes';
import { aceptarEncargo } from '../src/main/firebase/services/encargos.service';

/**
 * Después de cada escenario, el negocio entero tiene que cuadrar: las mismas
 * revisiones que corre la simulación contra el emulador (stock y lotes,
 * saldos, fichas de clientas, la lista de Cobros, Inicio).
 */
async function cuadra() {
  Panel.invalidarCache();
  const fallas = await revisarInvariantes();
  expect(fallas.map((f) => `${f.invariante}: ${f.detalle}`)).toEqual([]);
}

const producto = (nombre: string, cantidad: number, costo = 900, precio = 2500) =>
  Productos.crear(
    { nombre, modo_precio: 'MANUAL', precio_manual_usd_cents: precio, stock_inicial: { cantidad, costo_unitario_usd_cents: costo } },
    g()
  );
const existencias = async (id: number) => (await Productos.getById(id))!.existencias;

const g = () => randomUUID();
const HOY = hoyISO();

beforeEach(async () => {
  reiniciarFirestoreFalso();
  Parametros.invalidarCache();
  Panel.invalidarCache();
  await Parametros.getParametros();
  const registrar = Eventos.registrarVarios.bind(Eventos);
  vi.spyOn(Eventos, 'registrarVarios').mockImplementation(async (eventos) => {
    await registrar(eventos);
    await new Promise((r) => setTimeout(r, 3));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const suelta = (precio: number) => ({ descripcion: 'Algo', cantidad: 1, precio_unitario_usd_cents: precio });

describe('eliminar una clienta', () => {
  it('con un encargo en curso no se elimina, aunque todavía no sea deuda', async () => {
    const carmen = await Clientes.guardar({ nombre: 'Carmen' }, g());
    const e = await Ventas.crear(
      { cliente_id: carmen, fecha: HOY, tipo: 'ENCARGO', lineas: [suelta(5000)] },
      g()
    );
    expect((await Ventas.getById(e))!.estado).toBe('COTIZADA');
    const codigo = (await Ventas.getById(e))!.codigo;

    await expect(Clientes.archivar(carmen, g())).rejects.toThrow(new RegExp(`${codigo}.*en curso`));
    expect(await Clientes.getById(carmen)).not.toBeNull();
  });

  it('con una venta apartada por entregar tampoco', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const v = await Ventas.crear(
      {
        cliente_id: ana,
        fecha: HOY,
        tipo: 'INVENTARIO',
        entregar_ahora: false,
        lineas: [suelta(2000)],
        pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO' },
      },
      g()
    );
    const codigo = (await Ventas.getById(v))!.codigo;
    await expect(Clientes.archivar(ana, g())).rejects.toThrow(new RegExp(`${codigo}.*por entregar`));
  });

  it('con todo cerrado se elimina, y deshacer la trae de vuelta', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    await Ventas.crear(
      { cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [suelta(2000)], pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO' } },
      g()
    );
    const grupo = g();
    await Clientes.archivar(ana, grupo);
    expect(await Clientes.getById(ana)).toBeNull();
    expect((await Eventos.deshacerGrupo(grupo)).revertido).toBe(true);
    expect((await Clientes.getById(ana))?.nombre).toBe('Ana');
  });

  it('con deuda sigue sin poder eliminarse', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    await Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [suelta(2000)] }, g());
    await expect(Clientes.archivar(ana, g())).rejects.toThrow(/todavía debe/);
  });
});

describe('Cobros trae todo lo que se debe', () => {
  it('con doce ventas fiadas, la lista tiene las doce y suma lo mismo que Inicio', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    for (let i = 0; i < 12; i++) {
      await Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [suelta(1000 + i)] }, g());
    }
    const panel = await Panel.cargar(true);
    expect(panel.total_por_cobrar).toBe(12);
    expect(panel.por_cobrar).toHaveLength(12);
    expect(panel.por_cobrar.reduce((s, f) => s + f.saldo_usd_cents, 0)).toBe(panel.resumen.por_cobrar_usd_cents);
  });

  it('corregir un abono se ve en la fila de Cobros y en la ficha de la clienta', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const v = await Ventas.crear(
      { cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [suelta(5000)], pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO', monto_cents: 1000 } },
      g()
    );
    const [pago] = (await Ventas.getById(v))!.pagos;
    await Pagos.corregir(pago.id, { fecha: HOY, monto_cents: 3000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    Panel.invalidarCache();
    const fila = (await Panel.cargar(true)).por_cobrar.find((f) => f.venta_id === v)!;
    expect(fila.saldo_usd_cents).toBe(2000);
    expect((await Clientes.getById(ana))!.saldo_pendiente_usd_cents).toBe(2000);
  });
});

describe('Ventas: corregir y anular', () => {
  it('cambiar la clienta de una venta: la deuda y sus abonos se van con ella', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const bea = await Clientes.guardar({ nombre: 'Bea' }, g());
    const labial = await producto('Labial', 5);
    const v = await Ventas.crear(
      {
        cliente_id: ana,
        fecha: HOY,
        tipo: 'INVENTARIO',
        lineas: [{ producto_id: labial, cantidad: 2 }],
        pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO', monto_cents: 1000 },
      },
      g()
    );
    await Ventas.corregir(v, { cliente_id: bea, fecha: HOY, lineas: [{ producto_id: labial, cantidad: 2, precio_unitario_usd_cents: 2500 }] }, g());

    expect((await Clientes.getById(ana))!.saldo_pendiente_usd_cents).toBe(0);
    expect((await Clientes.getById(ana))!.compras_count).toBe(0);
    expect((await Clientes.getById(bea))!.saldo_pendiente_usd_cents).toBe(4000);
    expect((await Pagos.listarPorCliente(bea)).map((p) => p.monto_usd_cents)).toEqual([1000]);
    expect(await Pagos.listarPorCliente(ana)).toEqual([]);
    const fila = (await Panel.cargar(true)).por_cobrar.find((f) => f.venta_id === v)!;
    expect(fila.cliente_nombre).toBe('Bea');
    await cuadra();
  });

  it('anular una venta ya corregida devuelve lo corregido, no lo de antes', async () => {
    const labial = await producto('Labial', 5);
    const perfume = await producto('Perfume', 3);
    const v = await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: labial, cantidad: 1 }] }, g());
    await Ventas.corregir(v, { fecha: HOY, lineas: [{ producto_id: perfume, cantidad: 2, precio_unitario_usd_cents: 3000 }] }, g());
    expect([await existencias(labial), await existencias(perfume)]).toEqual([5, 1]);

    await Ventas.cambiarEstado(v, 'CANCELADA', g());
    expect([await existencias(labial), await existencias(perfume)]).toEqual([5, 3]);
    await cuadra();
  });

  it('corregir no se deshace (movió mercadería) y lo dice, sin tocar nada', async () => {
    const labial = await producto('Labial', 5);
    const v = await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: labial, cantidad: 1 }] }, g());
    const grupo = g();
    await Ventas.corregir(v, { fecha: HOY, lineas: [{ producto_id: labial, cantidad: 3, precio_unitario_usd_cents: 2500 }] }, grupo);
    const r = await Eventos.deshacerGrupo(grupo);
    expect(r.revertido).toBe(false);
    expect(r.descripcion).toMatch(/movió mercadería/);
    expect(await existencias(labial)).toBe(2);
    expect((await Ventas.getById(v))!.lineas[0].cantidad).toBe(3);
    await cuadra();
  });

  it('una venta en cuotas corregida reparte de nuevo sus cuotas, y anular un abono las vuelve a abrir', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const bolso = await producto('Bolso', 3, 2000, 9000);
    const v = await Ventas.crear(
      { cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: bolso, cantidad: 1 }], plan_cuotas: { cantidad: 3, cada_dias: 15 } },
      g()
    );
    const r = await Pagos.registrar({ venta_id: v, fecha: HOY, monto_cents: 3000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    await Ventas.corregir(v, { cliente_id: ana, fecha: HOY, lineas: [{ producto_id: bolso, cantidad: 1, precio_unitario_usd_cents: 7500 }] }, g());
    let c = (await Ventas.getById(v))!;
    expect(c.cuotas.reduce((s, q) => s + q.monto_usd_cents, 0)).toBe(7500);
    expect(c.cuotas.map((q) => q.pagado_usd_cents)).toEqual([2500, 500, 0]);

    await Pagos.anular(r.pago_id, g());
    c = (await Ventas.getById(v))!;
    expect(c.cuotas.map((q) => q.pagado_usd_cents)).toEqual([0, 0, 0]);
    expect(c.saldo_usd_cents).toBe(7500);
    await cuadra();
  });
});

describe('Abonos: corregir, anular y deshacer', () => {
  it('corregir un abono y deshacerlo deja todo como estaba: saldo, cuotas y la ficha', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const v = await Ventas.crear(
      { cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [suelta(6000)], plan_cuotas: { cantidad: 2, cada_dias: 15 } },
      g()
    );
    const r = await Pagos.registrar({ venta_id: v, fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    const antes = (await Ventas.getById(v))!;

    const grupo = g();
    await Pagos.corregir(r.pago_id, { fecha: HOY, monto_cents: 109860, moneda: 'COR', metodo: 'TRANSFERENCIA' }, grupo);
    expect((await Ventas.getById(v))!.saldo_usd_cents).toBe(3000);
    expect((await Clientes.getById(ana))!.saldo_pendiente_usd_cents).toBe(3000);

    expect((await Eventos.deshacerGrupo(grupo)).revertido).toBe(true);
    const despues = (await Ventas.getById(v))!;
    expect([despues.saldo_usd_cents, despues.pagado_usd_cents]).toEqual([antes.saldo_usd_cents, antes.pagado_usd_cents]);
    expect(despues.cuotas.map((q) => q.pagado_usd_cents)).toEqual(antes.cuotas.map((q) => q.pagado_usd_cents));
    expect(despues.pagos[0]).toMatchObject({ moneda: 'USD', monto_usd_cents: 1000, metodo: 'EFECTIVO' });
    expect((await Clientes.getById(ana))!.saldo_pendiente_usd_cents).toBe(5000);
    await cuadra();
  });

  it('un abono a la clienta sin elegir venta se reparte de la más vieja a la más nueva', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const v1 = await Ventas.crear({ cliente_id: ana, fecha: '2026-09-01', tipo: 'INVENTARIO', lineas: [suelta(2000)] }, g());
    const v2 = await Ventas.crear({ cliente_id: ana, fecha: '2026-09-10', tipo: 'INVENTARIO', lineas: [suelta(3000)] }, g());
    await Pagos.registrarAbonoCliente({ cliente_id: ana, fecha: HOY, monto_cents: 2500, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    expect([(await Ventas.getById(v1))!.saldo_usd_cents, (await Ventas.getById(v2))!.saldo_usd_cents]).toEqual([0, 2500]);
    expect((await Clientes.getById(ana))!.saldo_pendiente_usd_cents).toBe(2500);
    await cuadra();
  });

  it('en un encargo: el abono corregido que cubre el anticipo lo acepta; bajarlo después no lo desacepta', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const e = await Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'ENCARGO', anticipo_bp: 5000, lineas: [suelta(10000)] }, g());
    const r = await Pagos.registrar({ venta_id: e, fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    expect((await Ventas.getById(e))!.estado).toBe('COTIZADA');
    // Mientras no acepta, no es deuda: Cobros no lo muestra.
    expect((await Panel.cargar(true)).por_cobrar.some((f) => f.venta_id === e)).toBe(false);

    await Pagos.corregir(r.pago_id, { fecha: HOY, monto_cents: 5000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    expect((await Ventas.getById(e))!.estado).toBe('PENDIENTE');
    Panel.invalidarCache();
    expect((await Panel.cargar(true)).por_cobrar.find((f) => f.venta_id === e)?.saldo_usd_cents).toBe(5000);

    await Pagos.corregir(r.pago_id, { fecha: HOY, monto_cents: 2000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    const c = (await Ventas.getById(e))!;
    expect([c.estado, c.saldo_usd_cents]).toEqual(['PENDIENTE', 8000]);
    expect((await Clientes.getById(ana))!.saldo_pendiente_usd_cents).toBe(8000);
    await cuadra();
  });
});

describe('Clientas: editar', () => {
  it('cambiarle el nombre se ve en sus ventas y en Cobros', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const v = await Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [suelta(2000)] }, g());
    await Clientes.guardar({ id: ana, nombre: 'Ana María', telefono: '88881111' }, g());
    expect((await Ventas.listar({})).find((x) => x.id === v)?.cliente_nombre).toBe('Ana María');
    Panel.invalidarCache();
    const fila = (await Panel.cargar(true)).por_cobrar.find((f) => f.venta_id === v)!;
    expect([fila.cliente_nombre, fila.cliente_telefono]).toEqual(['Ana María', '+505 8888 1111']);
    await cuadra();
  });
});

describe('Encargos: anular y deshacer', () => {
  it('anular quedándose el anticipo: no se debe nada y el anticipo sigue contado', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const e = await Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'ENCARGO', anticipo_bp: 5000, lineas: [suelta(8000)] }, g());
    await aceptarEncargo(e, { fecha: HOY, monto_cents: 4000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    await Ventas.cambiarEstado(e, 'CANCELADA', g(), { anticipo: 'RETENER', motivo: 'NO_ACEPTO' });
    expect((await Clientes.getById(ana))!.saldo_pendiente_usd_cents).toBe(0);
    expect((await Pagos.listarPorVenta(e)).map((p) => p.monto_usd_cents)).toEqual([4000]);
    expect((await Panel.cargar(true)).por_cobrar.some((f) => f.venta_id === e)).toBe(false);
    await cuadra();
  });

  it('anular devolviendo el anticipo: el abono se anula y la clienta no debe', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const e = await Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'ENCARGO', anticipo_bp: 5000, lineas: [suelta(8000)] }, g());
    await aceptarEncargo(e, { fecha: HOY, monto_cents: 4000, moneda: 'USD', metodo: 'EFECTIVO' }, g());
    await Ventas.cambiarEstado(e, 'CANCELADA', g(), { anticipo: 'DEVOLVER' });
    expect(await Pagos.listarPorVenta(e)).toEqual([]);
    expect((await Clientes.getById(ana))!.saldo_pendiente_usd_cents).toBe(0);
    await cuadra();
  });

  it('deshacer "aceptó con un pago" lo devuelve a esperando respuesta, sin el pago', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const e = await Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'ENCARGO', anticipo_bp: 5000, lineas: [suelta(8000)] }, g());
    const grupo = g();
    await aceptarEncargo(e, { fecha: HOY, monto_cents: 4000, moneda: 'USD', metodo: 'EFECTIVO' }, grupo);
    expect((await Eventos.deshacerGrupo(grupo)).revertido).toBe(true);
    const c = (await Ventas.getById(e))!;
    expect([c.estado, c.pagado_usd_cents, c.saldo_usd_cents]).toEqual(['COTIZADA', 0, 8000]);
    expect((await Clientes.getById(ana))!.saldo_pendiente_usd_cents).toBe(0);
    await cuadra();
  });
});

describe('Inventario: ajustar y archivar', () => {
  it('un conteo físico después de vender, y después anular la venta: la bodega suma bien', async () => {
    const labial = await producto('Labial', 5);
    const v = await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: labial, cantidad: 2 }] }, g());
    const variante = await Productos.varianteUnica(labial);
    await Productos.ajustar(variante, 2, g(), 'Conteo físico', labial);
    expect(await existencias(labial)).toBe(2);
    await Ventas.cambiarEstado(v, 'CANCELADA', g());
    expect(await existencias(labial)).toBe(4);
    await cuadra();
  });

  it('un producto archivado sigue en sus ventas, y corregir esa venta le devuelve la unidad', async () => {
    const labial = await producto('Labial', 1);
    const perfume = await producto('Perfume', 2);
    const v = await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: labial, cantidad: 1 }] }, g());
    await Productos.archivar(labial, g());
    expect((await Ventas.getById(v))!.lineas[0].descripcion).toBe('Labial');
    await Ventas.corregir(v, { fecha: HOY, lineas: [{ producto_id: perfume, cantidad: 1, precio_unitario_usd_cents: 2500 }] }, g());
    const guardado = (await Productos.listar({ incluirInactivos: true })).find((p) => p.id === labial)!;
    expect(guardado.existencias).toBe(1);
    expect(await existencias(perfume)).toBe(1);
    await cuadra();
  });
});
