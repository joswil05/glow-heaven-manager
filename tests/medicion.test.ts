import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reiniciarFirestoreFalso, reiniciarContadores, contadores } from './firestore-fake';
import { ProductosRepoFirestore as P } from '../src/main/firebase/repositories/productos.repo';
import { VentasRepoFirestore as V } from '../src/main/firebase/repositories/ventas.repo';
import { ClientesRepoFirestore as C } from '../src/main/firebase/repositories/clientes.repo';
import { ParametrosRepoFirestore as Par } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';

const g = () => randomUUID();
const HOY = new Date().toISOString().slice(0, 10);

beforeEach(async () => {
  reiniciarFirestoreFalso();
  Par.invalidarCache();
  await Par.getParametros();
  await Par.getCategorias();
});

describe('medicion', () => {
  it('costo del panel a distintas escalas', async () => {
    for (const n of [12, 50, 200]) {
      reiniciarFirestoreFalso();
      Par.invalidarCache();
      await Par.getParametros();
      await Par.getCategorias();

      const cli = await C.guardar({ nombre: 'Cliente' }, g());
      for (let i = 0; i < n; i++) {
        const p = await P.crear(
          { nombre: `P${i}`, modo_precio: 'MANUAL', precio_manual_usd_cents: 2000,
            stock_inicial: { cantidad: 10, costo_unitario_usd_cents: 800 } }, g());
        await V.crear({ cliente_id: cli, fecha: HOY, tipo: 'INVENTARIO',
          lineas: [{ producto_id: p, cantidad: 1 }] }, g());
      }

      reiniciarContadores();
      await Panel.cargar();
      const c = contadores();
      console.log(`  ${n} productos + ${n} ventas -> ${c.lecturas} lecturas`);
    }
    expect(true).toBe(true);
  });
});
