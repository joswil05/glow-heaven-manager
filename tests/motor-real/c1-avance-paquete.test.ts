/**
 * Fase C1 contra el Firestore de verdad: el panel dice cómo va cada paquete,
 * vender la última unidad lo deja VENDIDO, anular esa venta lo vuelve a poner
 * en venta, y no quedan alertas de agotados.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

describe('Fase C1: el avance de cada paquete, contra el emulador', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  async function paqueteConUnTermo() {
    const { Compras, Productos } = await repos();
    const compra = await Compras.guardar(
      {
        fecha: HOY,
        envio_total_usd_cents: 500,
        lineas: [{ descripcion: 'Termo', cantidad: 1, precio_linea_usd_cents: 2000, peso_linea_mlb: 100, destino: 'INVENTARIO' }],
      },
      g()
    );
    await Compras.recibir(compra, g());
    const termo = (await Productos.listar({})).find((p) => p.nombre === 'Termo')!;
    return { compra, termo: termo.id };
  }

  it.skipIf(!disponible)(
    'vender la última unidad deja el paquete VENDIDO y sin alerta de agotados; anularla lo reabre',
    async () => {
      const { Panel, Ventas } = await repos();
      const { compra, termo } = await paqueteConUnTermo();

      let panel = await Panel.cargar(true);
      expect(panel.paquetes.find((p) => p.compra_id === compra)?.estado).toBe('EN_VENTA');

      const venta = await Ventas.crear(
        { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: termo, cantidad: 1, precio_unitario_usd_cents: 4000 }] },
        g()
      );
      panel = await Panel.cargar(true);
      const vendido = panel.paquetes.find((p) => p.compra_id === compra)!;
      expect(vendido.estado).toBe('VENDIDO');
      expect(vendido.vendido_usd_cents).toBe(4000);
      expect(panel.alertas.map((a) => a.id)).not.toContain('agotados');

      await Ventas.cambiarEstado(venta, 'CANCELADA', g());
      panel = await Panel.cargar(true);
      expect(panel.paquetes.find((p) => p.compra_id === compra)?.estado).toBe('EN_VENTA');
    },
    60_000
  );

  it.skipIf(!disponible)('cerrar el resumen queda guardado en el paquete', async () => {
    const { Compras, Panel } = await repos();
    const { compra } = await paqueteConUnTermo();
    await Compras.marcarResumenVisto(compra);
    const panel = await Panel.cargar(true);
    expect(panel.paquetes.find((p) => p.compra_id === compra)?.resumen_visto_el).toBeTruthy();
  }, 60_000);
});
