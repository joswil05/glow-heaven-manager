/**
 * Fase 0 de la auditoría de interfaz del 29 de septiembre
 * (`docs/AUDITORIA_UX_2026-09-29.md`), contra el Firestore de verdad.
 *
 * Las mismas reglas están probadas con el motor en memoria en
 * `tests/fase0-auditoria.test.ts`. Acá se repiten las que dependen de cómo
 * responde el servidor: consultas con dos filtros, transacciones y la caché de
 * parámetros. Si una de estas dos suites pasa y la otra no, el motor falso
 * dejó de parecerse al real.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';
import { preciosParaRevisar } from '../../src/core/revisar-precios';
import { codigoDeVenta } from '../../src/core/codigos';
import { usdCentavosACorCentavos } from '../../src/core/moneda';
import type { LineaCompraInput } from '../../src/shared/ipc-contracts';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

/** El documento tal cual, aunque esté descatalogado (`getById` no los devuelve). */
async function existe(id: number): Promise<boolean> {
  const { leerDoc } = await import('../../src/main/firebase/client');
  return (await leerDoc('productos', id)) !== null;
}

describe('Fase 0 de la auditoría del 29/9, contra el emulador', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'CFG-01 · guardar un mensaje no cambia ningún precio, aunque viaje el margen de siempre',
    async () => {
      const { Productos, Parametros } = await repos();
      const { aplicarLote } = await import('../../src/main/firebase/client');

      const id = await Productos.crear(
        { nombre: 'Perfume', modo_precio: 'MARGEN', stock_inicial: { cantidad: 3, costo_unitario_usd_cents: 2000 } },
        g()
      );
      // Un precio que no sale de la fórmula: el que la dueña puso a mano en la
      // planilla y que guardar Configuración le pisaba.
      await aplicarLote([{ coleccion: 'productos', id, merge: true, datos: { precio_venta_usd_cents: 3500 } }]);
      const p = await Parametros.getParametros();

      await Parametros.actualizar(
        {
          plantilla_cobro_whatsapp: 'Hola {cliente}',
          margen_defecto_bp: p.margen_defecto_bp,
          paso_redondeo_usd_cents: p.paso_redondeo_usd_cents,
        },
        g()
      );
      await Parametros.actualizar({ tasa_cambio_cents: 3700, nombre_negocio: 'Glow' }, g());

      expect((await Productos.getById(id))!.precio_venta_usd_cents).toBe(3500);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'CFG-01 · un margen nuevo deja los precios para revisar, y sólo cambian los que se eligen',
    async () => {
      const { Productos, Parametros } = await repos();
      const crear = (nombre: string) =>
        Productos.crear(
          { nombre, modo_precio: 'MARGEN', stock_inicial: { cantidad: 3, costo_unitario_usd_cents: 2000 } },
          g()
        );
      const perfume = await crear('Perfume');
      const bolso = await crear('Bolso');
      const precio = async (id: number) => (await Productos.getById(id))!.precio_venta_usd_cents;
      const antes = await precio(perfume);

      await Parametros.actualizar({ margen_defecto_bp: 10000 }, g());

      expect(await precio(perfume)).toBe(antes);
      expect(await precio(bolso)).toBe(antes);

      const lista = preciosParaRevisar(
        await Productos.listar(),
        await Parametros.getCategorias(),
        await Parametros.getParametros()
      );
      expect(lista.map((x) => x.producto.id).sort()).toEqual([perfume, bolso].sort());
      expect(lista.find((x) => x.producto.id === perfume)!.calculado).toBe(4000);

      await Productos.aplicarPrecios([perfume], g());
      expect(await precio(perfume)).toBe(4000);
      expect(await precio(bolso)).toBe(antes);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'COB-01 · el abono cargado en la venta más nueva cae en esa venta, no en la más vieja',
    async () => {
      // "Abonar" en una fila de Cobros abría el abono de la CLIENTA, que paga
      // primero lo más viejo: la plata terminaba en otra venta. Ahora la fila
      // registra con el `venta_id` de esa fila.
      const { Clientes, Ventas, Pagos } = await repos();
      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const fiada = (total: number) =>
        Ventas.crear(
          {
            cliente_id: ana,
            fecha: HOY,
            tipo: 'INVENTARIO',
            lineas: [{ descripcion: 'Suelto', cantidad: 1, precio_unitario_usd_cents: total }],
          },
          g()
        );
      const vieja = await fiada(5000);
      const nueva = await fiada(3000);

      await Pagos.registrar(
        { venta_id: nueva, fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' },
        g()
      );

      expect((await Ventas.getById(nueva))!.saldo_usd_cents).toBe(2000);
      expect((await Ventas.getById(vieja))!.saldo_usd_cents).toBe(5000);

      // Y el abono sin venta elegida sigue yendo a la más vieja, que es lo que
      // hace "Registrar abono" de la cabecera: son dos caminos distintos.
      await Pagos.registrarAbonoCliente(
        { cliente_id: ana, fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' },
        g()
      );
      expect((await Ventas.getById(vieja))!.saldo_usd_cents).toBe(4000);
      expect((await Ventas.getById(nueva))!.saldo_usd_cents).toBe(2000);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'INV-01 · un producto con ventas o paquetes no se elimina; uno sin historia sí',
    async () => {
      const { Productos, Ventas, Compras } = await repos();
      const linea = (producto_id: number): LineaCompraInput => ({
        producto_id,
        descripcion: 'Labial',
        cantidad: 2,
        precio_linea_usd_cents: 1000,
        destino: 'INVENTARIO',
      });

      // Vendido.
      const vendido = await Productos.crear(
        { nombre: 'Vendido', modo_precio: 'MARGEN', stock_inicial: { cantidad: 3, costo_unitario_usd_cents: 2000 } },
        g()
      );
      await Ventas.crear(
        { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: vendido, cantidad: 1, precio_unitario_usd_cents: 2500 }] },
        g()
      );
      await Productos.archivar(vendido, g());
      await expect(Productos.eliminarDefinitivo(vendido, g())).rejects.toThrow(/vendi/i);
      expect(await existe(vendido)).toBe(true);

      // En un paquete recibido.
      const recibido = await Productos.crear({ nombre: 'Recibido', modo_precio: 'MARGEN' }, g());
      const paquete = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [linea(recibido)] }, g());
      await Compras.recibir(paquete, g());
      await Productos.archivar(recibido, g());
      await expect(Productos.eliminarDefinitivo(recibido, g())).rejects.toThrow(/paquete/i);
      expect(await existe(recibido)).toBe(true);

      // En un paquete que todavía no se recibió.
      const enBorrador = await Productos.crear({ nombre: 'En borrador', modo_precio: 'MARGEN' }, g());
      await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [linea(enBorrador)] }, g());
      await Productos.archivar(enBorrador, g());
      await expect(Productos.eliminarDefinitivo(enBorrador, g())).rejects.toThrow(/paquete/i);
      expect(await existe(enBorrador)).toBe(true);

      // Sin historia: un error de tipeo se puede borrar.
      const suelto = await Productos.crear({ nombre: 'Error de tipeo', modo_precio: 'MARGEN' }, g());
      await Productos.archivar(suelto, g());
      await Productos.eliminarDefinitivo(suelto, g());
      expect(await existe(suelto)).toBe(false);
    },
    90_000
  );

  it.skipIf(!disponible)(
    'CCO-01 y CVE-02 · la fila de Cobros trae la tasa y el código de su venta, y pagar todo con esa tasa la salda',
    async () => {
      const { Clientes, Ventas, Pagos, Parametros, Panel } = await repos();
      const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
      const venta = await Ventas.crear(
        {
          cliente_id: ana,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 4999 }],
        },
        g()
      );
      const guardada = (await Ventas.getById(venta))!;
      expect(codigoDeVenta(venta)).toBe(guardada.codigo);

      // La tasa de hoy ya es otra.
      await Parametros.actualizar({ tasa_cambio_cents: guardada.tasa_cambio_cents + 150 }, g());
      Panel.invalidarCache();

      const fila = (await Panel.cargar(true)).por_cobrar.find((f) => f.venta_id === venta)!;
      expect(fila.tasa_cambio_cents).toBe(guardada.tasa_cambio_cents);

      await Pagos.registrar(
        {
          venta_id: venta,
          fecha: HOY,
          monto_cents: usdCentavosACorCentavos(fila.saldo_usd_cents, fila.tasa_cambio_cents!),
          moneda: 'COR',
          metodo: 'EFECTIVO',
        },
        g()
      );
      const despues = (await Ventas.getById(venta))!;
      expect(despues.saldo_usd_cents).toBe(0);
      expect(despues.pagado_usd_cents).toBe(4999);
    },
    60_000
  );
});
