/**
 * Fase 2 de la auditoría de interfaz (`docs/AUDITORIA_UX_2026-09-29.md`),
 * contra el Firestore de verdad: el abono a la cuenta de la clienta.
 *
 * La ventana de abono muestra antes a qué ventas va la plata, con
 * `repartirAbono`. Acá se prueba que lo que registra el repositorio es eso
 * mismo, y que en córdobas suma lo que ella pagó.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';
import { repartirAbono } from '../../src/core/reparto';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

describe('Fase 2 de la auditoría del 29/9, contra el emulador', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  /** Ana con dos ventas de $50: una a 36.00 del 1/9 y otra a 37.00 de hoy. */
  async function anaConDosTasas() {
    const { Clientes, Ventas, Parametros } = await repos();
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const fiada = (fecha: string) =>
      Ventas.crear(
        {
          cliente_id: ana,
          fecha,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 5000 }],
        },
        g()
      );
    await Parametros.actualizar({ tasa_cambio_cents: 3600 }, g());
    const vieja = await fiada('2026-09-01');
    await Parametros.actualizar({ tasa_cambio_cents: 3700 }, g());
    const nueva = await fiada(HOY);
    return { ana, vieja, nueva };
  }

  it.skipIf(!disponible)(
    'TRA-02 · un abono en córdobas a la cuenta registra lo que ella pagó, ni un centavo más',
    async () => {
      // C$2,500: C$1,800 saldan la de 36.00 y C$700 van a la de 37.00. Antes
      // se pasaba todo a dólares con la tasa de la primera y se volvía a
      // córdobas con la de cada una: quedaban registrados C$2,519.28.
      const { Pagos } = await repos();
      const { ana, vieja, nueva } = await anaConDosTasas();
      await Pagos.registrarAbonoCliente(
        { cliente_id: ana, fecha: HOY, monto_cents: 250000, moneda: 'COR', metodo: 'EFECTIVO' },
        g()
      );
      const pagos = [...(await Pagos.listarPorVenta(vieja)), ...(await Pagos.listarPorVenta(nueva))];
      expect(pagos.reduce((s, p) => s + p.monto_cor_cents, 0)).toBe(250000);
      expect((await Pagos.listarPorVenta(vieja)).map((p) => p.monto_cor_cents)).toEqual([180000]);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'TRA-02 · lo que la ventana muestra antes de registrar es lo que queda registrado',
    async () => {
      const { Pagos, Ventas } = await repos();
      const { ana, vieja, nueva } = await anaConDosTasas();
      for (const [monto, moneda] of [
        [250000, 'COR'],
        [3000, 'USD'],
        [900000, 'COR'],
      ] as const) {
        const antes = [(await Ventas.getById(vieja))!, (await Ventas.getById(nueva))!];
        const vista = repartirAbono(antes, monto, moneda);
        await Pagos.registrarAbonoCliente({ cliente_id: ana, fecha: HOY, monto_cents: monto, moneda, metodo: 'EFECTIVO' }, g());
        for (const parte of vista) {
          expect((await Ventas.getById(parte.venta_id))!.saldo_usd_cents).toBe(parte.saldo_despues_usd_cents);
        }
      }
    },
    60_000
  );
});
