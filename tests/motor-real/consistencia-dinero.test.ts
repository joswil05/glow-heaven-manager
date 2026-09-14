/**
 * Fase 3: venta ↔ abonos ↔ cuotas ↔ deuda de la clienta, contra el motor real.
 *
 * Todo lo que se prueba acá es una invariante del negocio, no un detalle de
 * implementación. La más importante:
 *
 *   Anular una venta tiene que dejar a la clienta exactamente como estaba
 *   antes de que esa venta existiera.
 *
 * Si eso no se cumple, la lista de cobranza le pide plata a alguien que no
 * debe, o deja de pedírsela a alguien que sí.
 *
 * Corre contra el emulador oficial porque acá importan las transacciones, la
 * concurrencia y las reglas: el Firestore falso no las tiene.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

if (!disponible) {
  // eslint-disable-next-line no-console
  console.warn('\n  Emulador no disponible: corré `npm run emulador`.\n');
}

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

describe('la deuda de la clienta', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'anular una venta deja a la clienta como estaba antes de venderle',
    async () => {
      const { Clientes, Ventas } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const antes = await Clientes.calcularTotales(ana);

      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [
            { descripcion: 'Perfume', cantidad: 1, precio_unitario_usd_cents: 5000 },
          ],
        },
        g()
      );

      await Ventas.cambiarEstado(venta, 'CANCELADA', g());

      const despues = await Clientes.calcularTotales(ana);
      expect(despues).toEqual(antes);
    },
    30_000
  );

  it.skipIf(!disponible)(
    'anular una venta con abonos deja la deuda en cero, no en negativo',
    async () => {
      const { Clientes, Ventas, Pagos } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 10000 }],
        },
        g()
      );

      await Pagos.registrar(
        { venta_id: venta, fecha: HOY, monto_cents: 3000, moneda: 'USD', metodo: 'EFECTIVO' },
        g()
      );

      await Ventas.cambiarEstado(venta, 'CANCELADA', g());

      const totales = await Clientes.calcularTotales(ana);
      expect(totales.saldo_pendiente_usd_cents).toBe(0);
      expect(totales.total_comprado_usd_cents).toBe(0);
      expect(totales.compras_count).toBe(0);

      // Los abonos de una venta cancelada no pueden seguir contados como cobrados.
      const pagos = await Pagos.listarPorVenta(venta);
      expect(pagos).toHaveLength(0);
    },
    30_000
  );

  it.skipIf(!disponible)(
    'un excedente no le baja la deuda de OTRAS ventas a la clienta',
    async () => {
      const { Clientes, Ventas, Pagos } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const v1 = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'A', cantidad: 1, precio_unitario_usd_cents: 5000 }],
        },
        g()
      );
      const v2 = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'B', cantidad: 1, precio_unitario_usd_cents: 5000 }],
        },
        g()
      );

      // Paga de más en la primera: $80 sobre una venta de $50.
      await Pagos.registrar(
        { venta_id: v1, fecha: HOY, monto_cents: 8000, moneda: 'USD', metodo: 'EFECTIVO' },
        g()
      );

      const totales = await Clientes.calcularTotales(ana);
      // Debe seguir debiendo los $50 de la segunda venta, enteros.
      expect(totales.saldo_pendiente_usd_cents).toBe(5000);
      void v2;
    },
    30_000
  );
});

describe('anular abonos', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'anular el mismo abono dos veces no devuelve el saldo dos veces',
    async () => {
      const { Ventas, Pagos, Clientes } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'X', cantidad: 1, precio_unitario_usd_cents: 10000 }],
        },
        g()
      );

      const pago = await Pagos.registrar(
        { venta_id: venta, fecha: HOY, monto_cents: 4000, moneda: 'USD', metodo: 'EFECTIVO' },
        g()
      );

      await Pagos.anular(pago.pago_id, g());
      await Pagos.anular(pago.pago_id, g());

      const v = (await Ventas.getById(venta))!;
      expect(v.pagado_usd_cents).toBe(0);
      expect(v.saldo_usd_cents).toBe(10000);
    },
    30_000
  );

  it.skipIf(!disponible)(
    'no deja registrar un abono en una venta cancelada',
    async () => {
      const { Ventas, Pagos, Clientes } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'X', cantidad: 1, precio_unitario_usd_cents: 10000 }],
        },
        g()
      );
      await Ventas.cambiarEstado(venta, 'CANCELADA', g());

      await expect(
        Pagos.registrar(
          { venta_id: venta, fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' },
          g()
        )
      ).rejects.toThrow();
    },
    30_000
  );

  it.skipIf(!disponible)(
    'el abono en córdobas por el saldo exacto deja la venta en cero',
    async () => {
      const { Ventas, Pagos, Clientes } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const fallos: string[] = [];

      // Montos elegidos para tropezar con el redondeo de la conversión.
      for (const total of [999, 1234, 3333, 4567, 7777, 10001, 12345]) {
        const venta = await Ventas.crear(
          {
            cliente_id: ana,
            fecha: HOY,
            tipo: 'INVENTARIO',
            lineas: [{ descripcion: 'X', cantidad: 1, precio_unitario_usd_cents: total }],
          },
          g()
        );

        const v = (await Ventas.getById(venta))!;
        // Lo que la pantalla le muestra a la clienta para pagar en córdobas.
        const enCordobas = Math.round((v.saldo_usd_cents * v.tasa_cambio_cents) / 100);

        const r = await Pagos.registrar(
          { venta_id: venta, fecha: HOY, monto_cents: enCordobas, moneda: 'COR', metodo: 'EFECTIVO' },
          g()
        );

        if (r.saldo_usd_cents !== 0) {
          fallos.push(
            `venta de ${total}c: pagó C$${enCordobas} y quedó saldo ${r.saldo_usd_cents}c`
          );
        }
      }

      expect(fallos, `quedan saldos fantasma:\n  ${fallos.join('\n  ')}`).toEqual([]);
    },
    60_000
  );
});

describe('encargos con anticipo', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'anular el anticipo vuelve a bloquear el encargo, y volver a pagarlo lo desbloquea',
    async () => {
      const { Ventas, Pagos, Clientes } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const encargo = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'ENCARGO',
          anticipo_bp: 5000,
          lineas: [{ descripcion: 'Encargo', cantidad: 1, precio_unitario_usd_cents: 10000 }],
        },
        g()
      );

      expect((await Ventas.getById(encargo))!.estado).toBe('COTIZADA');

      const pago = await Pagos.registrar(
        { venta_id: encargo, fecha: HOY, monto_cents: 5000, moneda: 'USD', metodo: 'EFECTIVO' },
        g()
      );
      expect((await Ventas.getById(encargo))!.estado).toBe('PENDIENTE');

      await Pagos.anular(pago.pago_id, g());
      expect((await Ventas.getById(encargo))!.estado).toBe('COTIZADA');

      await Pagos.registrar(
        { venta_id: encargo, fecha: HOY, monto_cents: 5000, moneda: 'USD', metodo: 'EFECTIVO' },
        g()
      );
      expect((await Ventas.getById(encargo))!.estado).toBe('PENDIENTE');
    },
    45_000
  );
});

describe('dos personas trabajando a la vez', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'dos abonos simultáneos sobre la misma venta se cuentan los dos',
    async () => {
      // El caso real: la misma venta cobrada desde Windows y desde el celular
      // casi al mismo tiempo. Los dos documentos de pago se crean; lo que hay
      // que comprobar es que el SALDO de la venta refleje los dos.
      const { Ventas, Pagos, Clientes } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'X', cantidad: 1, precio_unitario_usd_cents: 10000 }],
        },
        g()
      );

      await Promise.all([
        Pagos.registrar(
          { venta_id: venta, fecha: HOY, monto_cents: 3000, moneda: 'USD', metodo: 'EFECTIVO' },
          g()
        ),
        Pagos.registrar(
          { venta_id: venta, fecha: HOY, monto_cents: 2000, moneda: 'USD', metodo: 'TRANSFERENCIA' },
          g()
        ),
      ]);

      const pagos = await Pagos.listarPorVenta(venta);
      const sumaReal = pagos.reduce((s, p) => s + p.monto_usd_cents, 0);
      const v = (await Ventas.getById(venta))!;

      expect(sumaReal).toBe(5000);
      expect(
        v.pagado_usd_cents,
        `los pagos suman ${sumaReal} pero la venta dice ${v.pagado_usd_cents}`
      ).toBe(5000);
      expect(v.saldo_usd_cents).toBe(5000);
    },
    45_000
  );

  it.skipIf(!disponible)(
    'la misma venta enviada dos veces no descuenta el stock dos veces',
    async () => {
      // Doble clic en "Registrar venta" antes de que responda la red.
      const { Ventas, Productos, Clientes } = await repos();

      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const producto = await Productos.crear(
        {
          nombre: 'Crema',
          stock_inicial: { cantidad: 10, costo_unitario_usd_cents: 500 },
        },
        g()
      );
      const variante = await Productos.varianteUnica(producto);

      const linea = {
        producto_id: producto,
        variante_id: variante ?? undefined,
        cantidad: 3,
        precio_unitario_usd_cents: 1500,
      };

      const resultados = await Promise.allSettled([
        Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [linea] }, g()),
        Ventas.crear({ cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [linea] }, g()),
      ]);

      const creadas = resultados.filter((r) => r.status === 'fulfilled').length;
      const p = (await Productos.listar()).find((x) => x.id === producto)!;

      // Si las dos pasaron, el stock tiene que reflejar LAS DOS (10 - 6 = 4).
      // Lo que no puede pasar es que queden dos ventas y el stock baje una vez.
      expect(p.existencias).toBe(10 - 3 * creadas);
    },
    45_000
  );
});
