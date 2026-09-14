/**
 * Fase 6: qué se niega a guardar el sistema.
 *
 * Los formularios de las dos apps validan por su cuenta, y cada uno a su
 * manera. Probar formulario por formulario sería probar la misma regla dos
 * veces y dejar el hueco abierto igual: alcanza con que una pantalla se
 * olvide de validar para que el dato malo entre.
 *
 * Por eso las guardas se prueban donde las dos apps coinciden: el
 * repositorio. Lo que acá se rechace queda rechazado para Windows, para el
 * celular y para cualquier pantalla que se agregue después.
 *
 * Varias de estas pruebas describen el comportamiento actual aunque no sea el
 * ideal; cuando así sea, el comentario lo dice.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

describe('lo que no se puede guardar', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)('una venta sin líneas se rechaza', async () => {
    const { Ventas } = await repos();
    await expect(
      Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [] }, g())
    ).rejects.toThrow();
  });

  it.skipIf(!disponible)('una línea sin producto y sin descripción se rechaza', async () => {
    const { Ventas } = await repos();
    await expect(
      Ventas.crear(
        {
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: '   ', cantidad: 1, precio_unitario_usd_cents: 1000 }],
        },
        g()
      )
    ).rejects.toThrow();
  });

  it.skipIf(!disponible)(
    'una venta con cantidad cero o negativa se guarda como una unidad, no como cero',
    async () => {
      // `Math.max(1, ...)` en el repositorio: una cantidad inválida no puede
      // producir una línea fantasma de cero unidades.
      const { Ventas } = await repos();

      const venta = await Ventas.crear(
        {
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Suelto', cantidad: 0, precio_unitario_usd_cents: 1500 }],
        },
        g()
      );

      const v = (await Ventas.getById(venta))!;
      expect(v.lineas[0].cantidad).toBe(1);
      expect(v.total_usd_cents).toBe(1500);
    },
    30_000
  );

  it.skipIf(!disponible)(
    'un precio negativo no genera una venta con total negativo',
    async () => {
      const { Ventas } = await repos();

      const venta = await Ventas.crear(
        {
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Suelto', cantidad: 2, precio_unitario_usd_cents: -5000 }],
        },
        g()
      );

      const v = (await Ventas.getById(venta))!;
      expect(v.total_usd_cents).toBeGreaterThanOrEqual(0);
      expect(v.saldo_usd_cents).toBeGreaterThanOrEqual(0);
    },
    30_000
  );

  it.skipIf(!disponible)(
    'un descuento mayor que la venta no deja el total en negativo',
    async () => {
      // Una venta con total negativo le da plata a la clienta: el panel la
      // sumaría como ingreso negativo y la deuda quedaría a favor de ella.
      const { Ventas } = await repos();

      const venta = await Ventas.crear(
        {
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Suelto', cantidad: 1, precio_unitario_usd_cents: 5000 }],
          descuento_tipo: 'MONTO_FIJO',
          descuento_valor: 999999,
        },
        g()
      );

      const v = (await Ventas.getById(venta))!;
      expect(v.total_usd_cents, 'el total no puede quedar por debajo de cero').toBeGreaterThanOrEqual(0);
    },
    30_000
  );

  it.skipIf(!disponible)(
    'un descuento porcentual mayor a 100 no da vuelta la venta',
    async () => {
      const { Ventas } = await repos();

      const venta = await Ventas.crear(
        {
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Suelto', cantidad: 1, precio_unitario_usd_cents: 5000 }],
          descuento_tipo: 'PORCENTAJE',
          descuento_valor: 250,
        },
        g()
      );

      const v = (await Ventas.getById(venta))!;
      expect(v.total_usd_cents).toBeGreaterThanOrEqual(0);
    },
    30_000
  );

  it.skipIf(!disponible)('un cliente sin nombre se rechaza', async () => {
    const { Clientes } = await repos();
    await expect(Clientes.guardar({ nombre: '   ' }, g())).rejects.toThrow();
  });

  it.skipIf(!disponible)('un producto sin nombre se rechaza', async () => {
    const { Productos } = await repos();
    await expect(Productos.crear({ nombre: '  ' }, g())).rejects.toThrow();
  });

  it.skipIf(!disponible)(
    'un producto no puede nacer con existencias negativas',
    async () => {
      const { Productos } = await repos();

      const id = await Productos.crear(
        {
          nombre: 'Raro',
          stock_inicial: { cantidad: -5, costo_unitario_usd_cents: 100 },
        },
        g()
      );

      const p = (await Productos.listar()).find((x) => x.id === id)!;
      expect(p.existencias).toBeGreaterThanOrEqual(0);
      expect(p.valor_inventario_usd_cents ?? 0).toBeGreaterThanOrEqual(0);
    },
    30_000
  );

  it.skipIf(!disponible)(
    'un abono de cero o negativo se rechaza',
    async () => {
      const { Ventas, Pagos } = await repos();

      const venta = await Ventas.crear(
        {
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Suelto', cantidad: 1, precio_unitario_usd_cents: 5000 }],
        },
        g()
      );

      for (const monto of [0, -100]) {
        await expect(
          Pagos.registrar(
            { venta_id: venta, fecha: HOY, monto_cents: monto, moneda: 'USD', metodo: 'EFECTIVO' },
            g()
          )
        ).rejects.toThrow();
      }
    },
    30_000
  );

  it.skipIf(!disponible)(
    'un abono sobre una venta que no existe se rechaza',
    async () => {
      const { Pagos } = await repos();
      await expect(
        Pagos.registrar(
          { venta_id: 999999, fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' },
          g()
        )
      ).rejects.toThrow();
    },
    30_000
  );

  it.skipIf(!disponible)(
    'la tasa de cambio no puede quedar en cero ni negativa',
    async () => {
      const { Parametros } = await repos();
      for (const tasa of [0, -100]) {
        await expect(
          Parametros.actualizar({ tasa_cambio_cents: tasa }, g())
        ).rejects.toThrow();
      }
    },
    30_000
  );
});
