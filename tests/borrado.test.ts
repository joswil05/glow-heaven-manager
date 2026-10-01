/**
 * "Fue un error": borrar una venta o un abono que nunca pasó, sin rastro.
 *
 * La regla (`core/borrado.ts`) y el repositorio (`borrado.repo.ts`) contra
 * el motor en memoria. Las reglas de Firestore (que un movimiento sólo se
 * borre con su venta) se prueban contra el emulador en
 * `tests/motor-real/borrado.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reiniciarFirestoreFalso, volcar } from './firestore-fake';
import { porQueNoSeBorraAbono, porQueNoSeBorraVenta, DIAS_PARA_BORRAR } from '../src/core/borrado';
import { ProductosRepoFirestore as Productos } from '../src/main/firebase/repositories/productos.repo';
import { ComprasRepoFirestore as Compras } from '../src/main/firebase/repositories/compras.repo';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { PagosRepoFirestore as Pagos } from '../src/main/firebase/repositories/pagos.repo';
import { ClientesRepoFirestore as Clientes } from '../src/main/firebase/repositories/clientes.repo';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { EventosRepoFirestore as Eventos } from '../src/main/firebase/repositories/eventos.repo';
import { BorradoRepoFirestore as Borrado } from '../src/main/firebase/repositories/borrado.repo';
import { revisarInvariantes } from './motor-real/invariantes';
import type { LineaVentaInput } from '../src/shared/ipc-contracts';

const g = () => randomUUID();
/**
 * El repositorio se prueba con el reloj fijo a mitad de mes: la regla mira
 * la semana y el mes, y una prueba que corre el día 1 no puede tener "ayer"
 * en el mismo mes. Sólo se falsea la fecha; los temporizadores siguen reales.
 */
const HOY = '2026-09-15';
const AYER = '2026-09-14';

describe('cuándo se puede borrar (core/borrado.ts)', () => {
  const ahora = new Date('2026-09-30T18:00:00Z'); // 30/9, mediodía en Managua
  const venta = { codigo: 'V-0024', tipo: 'INVENTARIO', fecha: '2026-09-29', creado_en: '2026-09-29T20:00:00Z' };

  it('una venta de esta semana, sin plata de otro día, se puede', () => {
    expect(porQueNoSeBorraVenta(venta, [{ fecha: '2026-09-29', activo: true }], ahora)).toBeNull();
  });

  it('una cargada hace más de una semana no: se anula', () => {
    const vieja = { ...venta, fecha: '2026-09-21', creado_en: '2026-09-21T20:00:00Z' };
    expect(porQueNoSeBorraVenta(vieja, [], ahora)).toBe(
      `V-0024 se cargó hace más de ${DIAS_PARA_BORRAR} días. Si no pasó, anulala.`
    );
  });

  it('una de un mes cerrado no, aunque se haya cargado ayer', () => {
    const deAgosto = { ...venta, fecha: '2026-08-31' };
    expect(porQueNoSeBorraVenta(deAgosto, [], ahora)).toMatch(/mes que ya cerró/);
  });

  it('con un abono de otro día no: esa plata entró de verdad', () => {
    expect(porQueNoSeBorraVenta(venta, [{ fecha: '2026-09-30', activo: true }], ahora)).toBe(
      'V-0024 tiene un abono del 30/9/2026: esa plata entró de verdad. Si ese abono también fue un error, borralo primero; si no, anulala.'
    );
    // Un abono ya anulado no cuenta.
    expect(porQueNoSeBorraVenta(venta, [{ fecha: '2026-09-30', activo: false }], ahora)).toBeNull();
  });

  it('un encargo con una pieza comprada no; uno sin comprar, sí', () => {
    const encargo = { ...venta, codigo: 'E-0025', tipo: 'ENCARGO' };
    expect(
      porQueNoSeBorraVenta({ ...encargo, lineas: [{ descripcion: 'Termo Stanley', comprado_el: '2026-09-29' }] }, [], ahora)
    ).toMatch(/'Termo Stanley' ya se compró/);
    expect(porQueNoSeBorraVenta({ ...encargo, lineas: [{ descripcion: 'Termo Stanley' }] }, [], ahora)).toBeNull();
  });

  it('lo viejo sin hora de carga se mide por su fecha', () => {
    expect(porQueNoSeBorraVenta({ ...venta, creado_en: undefined }, [], ahora)).toBeNull();
    expect(porQueNoSeBorraAbono({ fecha: '2026-09-02' }, ahora)).toMatch(/hace más de 7 días/);
  });

  it('un abono: la misma regla de tiempo', () => {
    expect(porQueNoSeBorraAbono({ fecha: '2026-09-30', creado_en: '2026-09-30T15:00:00Z' }, ahora)).toBeNull();
    expect(porQueNoSeBorraAbono({ fecha: '2026-09-22', creado_en: '2026-09-22T15:00:00Z' }, ahora)).toMatch(/anulalo/);
  });
});

describe('borrar una venta o un abono (borrado.repo.ts)', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${HOY}T18:00:00Z`));
    reiniciarFirestoreFalso();
    Parametros.invalidarCache();
    Panel.invalidarCache();
    await Parametros.getParametros();
    await Parametros.getCategorias();
    const registrar = Eventos.registrarVarios.bind(Eventos);
    vi.spyOn(Eventos, 'registrarVarios').mockImplementation(async (eventos) => {
      await registrar(eventos);
      await new Promise((r) => setTimeout(r, 3));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  /** Un producto que entró con un paquete: `n` unidades a `costo` ¢. */
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

  const linea = (producto_id: number, cantidad: number, precio: number): LineaVentaInput => ({
    producto_id,
    cantidad,
    precio_unitario_usd_cents: precio,
  });

  /** El producto tal como está guardado: lotes, unidades y valor. */
  const fotoProducto = (id: number) => {
    const d = volcar('productos').find((p) => Number(p.id) === id) as Record<string, unknown>;
    return { lotes: d.lotes, variantes: d.variantes, valor: d.valor_inventario_usd_cents };
  };

  async function cuadra() {
    Panel.invalidarCache();
    const fallas = await revisarInvariantes();
    expect(fallas.map((f) => `${f.invariante}: ${f.detalle}`)).toEqual([]);
  }

  it('una venta con su pago: no queda ni la venta, ni el pago, ni sus movimientos ni sus eventos', async () => {
    const termo = await producto('Termo Owala', 2, 3918);
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const antes = fotoProducto(termo);
    const eventosAntes = volcar('eventos').length;
    const movimientosAntes = volcar('movimientos_inventario').length;

    const v = await Ventas.crear(
      { cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [linea(termo, 1, 4500)], pago_inicial: { moneda: 'COR', metodo: 'EFECTIVO', monto_cents: 60000 } },
      g()
    );
    expect(volcar('pagos')).toHaveLength(1);

    const r = await Borrado.venta(v, undefined, g());

    expect(r).toEqual({ que: 'V-0001', abonos: 1 });
    expect(volcar('ventas')).toHaveLength(0);
    expect(volcar('pagos')).toHaveLength(0);
    expect(volcar('movimientos_inventario')).toHaveLength(movimientosAntes);
    expect(volcar('eventos')).toHaveLength(eventosAntes);
    // Las unidades vuelven a su lote exacto, como si la venta no hubiera existido.
    expect(fotoProducto(termo)).toEqual(antes);
    const clienta = (await Clientes.getById(ana))!;
    expect([clienta.compras_count, clienta.total_comprado_usd_cents, clienta.saldo_pendiente_usd_cents]).toEqual([0, 0, 0]);
    await cuadra();
  });

  it('si era la última, la próxima venta reusa su número; si no, queda el hueco', async () => {
    const termo = await producto('Termo', 5, 1000);
    const v1 = await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [linea(termo, 1, 2500)] }, g());
    const v2 = await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [linea(termo, 1, 2500)] }, g());

    await Borrado.venta(v2, undefined, g());
    const v3 = await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [linea(termo, 1, 2500)] }, g());
    expect((await Ventas.getById(v3))!.codigo).toBe('V-0002');

    await Borrado.venta(v1, undefined, g());
    const v4 = await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [linea(termo, 1, 2500)] }, g());
    expect((await Ventas.getById(v4))!.codigo).toBe('V-0003');
    await cuadra();
  });

  it('una venta ya anulada también se barre, con los movimientos de su devolución', async () => {
    const termo = await producto('Termo', 2, 1000);
    const antes = fotoProducto(termo);
    const movimientosAntes = volcar('movimientos_inventario').length;
    const v = await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [linea(termo, 2, 2500)] }, g());
    await Ventas.cambiarEstado(v, 'CANCELADA', g());
    expect(volcar('movimientos_inventario')).toHaveLength(movimientosAntes + 2);

    await Borrado.venta(v, undefined, g());

    expect(volcar('ventas')).toHaveLength(0);
    expect(volcar('movimientos_inventario')).toHaveLength(movimientosAntes);
    expect(fotoProducto(termo)).toEqual(antes);
    await cuadra();
  });

  it('un encargo sin comprar se borra entero', async () => {
    const ana = await Clientes.guardar({ nombre: 'Katherine' }, g());
    const e = await Ventas.crear(
      { cliente_id: ana, fecha: HOY, tipo: 'ENCARGO', lineas: [{ descripcion: 'Termo Stanley', cantidad: 1, precio_unitario_usd_cents: 4500 }] },
      g()
    );
    const r = await Borrado.venta(e, undefined, g());
    expect(r.que).toBe('E-0001');
    expect(volcar('ventas')).toHaveLength(0);
    expect(volcar('eventos').filter((x) => x.entidad_tipo === 'ventas')).toHaveLength(0);
    await cuadra();
  });

  it('con PIN, sin el PIN correcto no borra nada', async () => {
    await Parametros.actualizar({ pin_seguridad: '301121' }, g());
    const termo = await producto('Termo', 1, 1000);
    const v = await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [linea(termo, 1, 2500)] }, g());

    await expect(Borrado.venta(v, '0000', g())).rejects.toThrow('El PIN no es correcto.');
    await expect(Borrado.venta(v, undefined, g())).rejects.toThrow('El PIN no es correcto.');
    expect(volcar('ventas')).toHaveLength(1);
    expect((await Ventas.getById(v))!.estado).toBe('ENTREGADA');

    await Borrado.venta(v, '301121', g());
    expect(volcar('ventas')).toHaveLength(0);
  });

  it('lo que la regla no deja, no se toca: la venta sigue viva y entera', async () => {
    const termo = await producto('Termo', 1, 1000);
    const v = await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [linea(termo, 1, 2500)] }, g());
    // Una venta de ayer con un abono de hoy: plata que entró de verdad.
    await Ventas.corregir(v, { fecha: AYER, lineas: [linea(termo, 1, 2500)] }, g());
    await Pagos.registrar({ venta_id: v, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO', fecha: HOY }, g());
    const antes = { ventas: volcar('ventas'), pagos: volcar('pagos'), movimientos: volcar('movimientos_inventario').length };

    await expect(Borrado.venta(v, undefined, g())).rejects.toThrow(/esa plata entró de verdad/);

    expect(volcar('ventas')).toEqual(antes.ventas);
    expect(volcar('pagos')).toEqual(antes.pagos);
    expect(volcar('movimientos_inventario')).toHaveLength(antes.movimientos);
  });

  it('un abono que nunca entró: la venta vuelve a deber, y el abono no queda ni anulado', async () => {
    const termo = await producto('Termo', 1, 1000);
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const v = await Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [linea(termo, 1, 2500)] }, g());
    await Pagos.registrar({ venta_id: v, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO', fecha: HOY }, g());
    const [pago] = await Pagos.listarPorVenta(v);
    const eventosDelPago = () => volcar('eventos').filter((e) => e.entidad_tipo === 'pagos');
    expect(eventosDelPago().length).toBeGreaterThan(0);

    await Borrado.abono(pago.id, undefined, g());

    expect(volcar('pagos')).toHaveLength(0);
    expect(eventosDelPago()).toHaveLength(0);
    const venta = (await Ventas.getById(v))!;
    expect([venta.pagado_usd_cents, venta.saldo_usd_cents]).toEqual([0, 2500]);
    expect((await Clientes.getById(ana))!.saldo_pendiente_usd_cents).toBe(2500);
    // El próximo abono reusa el número.
    await Pagos.registrar({ venta_id: v, monto_cents: 500, moneda: 'USD', metodo: 'EFECTIVO', fecha: HOY }, g());
    expect((await Pagos.listarPorVenta(v)).map((p) => p.id)).toEqual([pago.id]);
    await cuadra();
  });
});
