/**
 * Fase 4: deshacer.
 *
 * "Deshacer" aparece en el toast que sale justo después de cada acción, con
 * una cuenta regresiva. Es lo primero que toca alguien que se equivocó, así
 * que tiene que dejar el sistema exactamente como estaba: no basta con que
 * desaparezca el documento principal.
 *
 * Hay dos mecanismos distintos para revertir una venta y conviene tenerlos
 * claros porque NO hacen lo mismo:
 *
 *   · Anular (cambiarEstado a CANCELADA) suma de vuelta la mercadería y
 *     anula los abonos. Funciona a cualquier edad de la venta.
 *   · Deshacer restaura la instantánea del documento y borra el rastro.
 *
 * Estas pruebas corren contra el motor real porque las reglas de Firestore
 * prohíben borrar `movimientos_inventario`, y un lote al que se le rechaza
 * una operación no escribe ninguna: eso el Firestore falso no lo ve.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

async function stockDe(productoId: number): Promise<number> {
  const { Productos } = await repos();
  const p = (await Productos.listar()).find((x) => x.id === productoId);
  return p?.existencias ?? 0;
}

describe('deshacer contra el motor real', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'deshacer la creación de un producto lo quita de verdad',
    async () => {
      const { Productos, Eventos } = await repos();

      const grupo = g();
      const producto = await Productos.crear(
        { nombre: 'Efímero', stock_inicial: { cantidad: 3, costo_unitario_usd_cents: 100 } },
        grupo
      );

      const r = await Eventos.deshacerGrupo(grupo);
      expect(r.revertido).toBe(true);
      expect(await Productos.getById(producto)).toBeNull();
    },
    45_000
  );

  it.skipIf(!disponible)(
    'deshacer un abono devuelve el saldo de la venta',
    async () => {
      // Camino más transitado de todos: se registra un abono y aparece el
      // toast con "Deshacer" 10 segundos. Está en PagoModal, ClientesView y
      // CobranzaView.
      const { Ventas, Pagos, Clientes, Eventos } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Set', cantidad: 1, precio_unitario_usd_cents: 10000 }],
        },
        g()
      );

      const grupoAbono = g();
      const abono = await Pagos.registrar(
        { venta_id: venta, fecha: HOY, monto_cents: 4000, moneda: 'USD', metodo: 'EFECTIVO' },
        grupoAbono
      );
      expect((await Ventas.getById(venta))!.saldo_usd_cents).toBe(6000);

      const r = await Eventos.deshacerGrupo(grupoAbono);
      expect(r.revertido).toBe(true);

      // El abono ya no existe, así que la venta tiene que volver a deber todo.
      const pagos = await Pagos.listarPorVenta(venta);
      expect(pagos.find((p) => p.id === abono.pago_id)).toBeUndefined();

      const v = (await Ventas.getById(venta))!;
      expect(v.pagado_usd_cents, 'el abono se borró pero la venta lo sigue contando').toBe(0);
      expect(v.saldo_usd_cents).toBe(10000);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'deshacer la anulación de una venta se rechaza en vez de duplicar la mercadería',
    async () => {
      // Camino expuesto en VentasView: anular una venta muestra el toast con
      // "Deshacer". Anular ya devolvió la mercadería a la bodega; si deshacer
      // revive la venta sin volver a descontarla, las unidades quedan
      // contadas dos veces.
      const { Productos, Ventas, Clientes, Eventos } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const producto = await Productos.crear(
        { nombre: 'Doble conteo', stock_inicial: { cantidad: 10, costo_unitario_usd_cents: 500 } },
        g()
      );
      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: producto, cantidad: 4, precio_unitario_usd_cents: 1200 }],
        },
        g()
      );
      expect(await stockDe(producto)).toBe(6);

      const grupoAnulacion = g();
      await Ventas.cambiarEstado(venta, 'CANCELADA', grupoAnulacion);
      expect(await stockDe(producto)).toBe(10);

      const r = await Eventos.deshacerGrupo(grupoAnulacion);

      // Revivir la venta sin volver a descontar dejaría las unidades contadas
      // dos veces. Se rechaza entero: la anulación queda como está.
      expect(r.revertido).toBe(false);
      const v = (await Ventas.getById(venta))!;
      expect(v.estado).toBe('CANCELADA');
      expect(
        await stockDe(producto),
        'la anulación tiene que quedar intacta, no a medias'
      ).toBe(10);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'una venta que sacó mercadería no se deshace: se anula',
    async () => {
      // Borrar el documento de la venta no devuelve las unidades. Antes se
      // hacía igual y la mercadería quedaba vendida para siempre, sin venta
      // que lo explicara. Ahora se rechaza y se indica el camino correcto.
      const { Productos, Ventas, Clientes, Eventos } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const producto = await Productos.crear(
        { nombre: 'Base', stock_inicial: { cantidad: 10, costo_unitario_usd_cents: 500 } },
        g()
      );

      const grupo = g();
      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: producto, cantidad: 4, precio_unitario_usd_cents: 1200 }],
        },
        grupo
      );
      expect(await stockDe(producto)).toBe(6);

      const r = await Eventos.deshacerGrupo(grupo);
      expect(r.revertido).toBe(false);
      expect(r.descripcion).toMatch(/anul/i);

      // Nada quedó a medias: la venta sigue y el stock también.
      expect(await Ventas.getById(venta)).not.toBeNull();
      expect(await stockDe(producto)).toBe(6);

      // Y el camino que sí funciona devuelve todo.
      await Ventas.cambiarEstado(venta, 'CANCELADA', g());
      expect(await stockDe(producto)).toBe(10);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'deshacer una venta sin mercadería deja a la clienta sin esa deuda',
    async () => {
      const { Ventas, Clientes, Eventos } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const grupo = g();
      await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Suelto', cantidad: 1, precio_unitario_usd_cents: 7000 }],
        },
        grupo
      );

      await Eventos.deshacerGrupo(grupo);

      const cliente = (await Clientes.getById(ana))!;
      expect(cliente.saldo_pendiente_usd_cents ?? 0).toBe(0);
      expect(cliente.total_comprado_usd_cents ?? 0).toBe(0);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'deshacer el mismo grupo dos veces no revierte nada la segunda vez',
    async () => {
      const { Productos, Eventos } = await repos();

      const grupo = g();
      await Productos.crear(
        { nombre: 'Doble', stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 100 } },
        grupo
      );

      expect((await Eventos.deshacerGrupo(grupo)).revertido).toBe(true);
      expect((await Eventos.deshacerGrupo(grupo)).revertido).toBe(false);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'deshacer una edición vieja no pisa lo que pasó después',
    async () => {
      // La instantánea se guarda con merge:false: vuelve el documento
      // ENTERO, con las existencias que tenía cuando se editó. Si en el medio
      // se vendió algo, esa venta se le devuelve al stock sin que nadie la
      // haya anulado.
      const { Productos, Ventas, Clientes, Eventos } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const producto = await Productos.crear(
        { nombre: 'Pisado', stock_inicial: { cantidad: 10, costo_unitario_usd_cents: 500 } },
        g()
      );

      // 1. Se edita el producto (por ejemplo, se le corrige el nombre).
      const grupoEdicion = g();
      await Productos.actualizar({ id: producto, nombre: 'Pisado corregido' }, grupoEdicion);

      // 2. Desde el otro dispositivo se vende, mientras el toast de deshacer
      //    sigue en pantalla.
      await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: producto, cantidad: 3, precio_unitario_usd_cents: 1000 }],
        },
        g()
      );
      expect(await stockDe(producto)).toBe(7);

      // 3. Se aprieta "Deshacer" sobre la edición.
      await Eventos.deshacerGrupo(grupoEdicion);

      // La venta sigue existiendo, así que el stock tiene que seguir en 7.
      expect(
        await stockDe(producto),
        'deshacer la edición resucitó unidades que ya se vendieron'
      ).toBe(7);
    },
    45_000
  );
});
