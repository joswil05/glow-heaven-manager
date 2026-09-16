import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reiniciarFirestoreFalso, reiniciarContadores, contadores } from './firestore-fake';
import { ProductosRepoFirestore as P } from '../src/main/firebase/repositories/productos.repo';
import { VentasRepoFirestore as V } from '../src/main/firebase/repositories/ventas.repo';
import { ClientesRepoFirestore as C } from '../src/main/firebase/repositories/clientes.repo';
import { ParametrosRepoFirestore as Par } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { hoyISO } from '../src/core/fechas';

const g = () => randomUUID();
const HOY = hoyISO();

beforeEach(async () => {
  reiniciarFirestoreFalso();
  Par.invalidarCache();
  Panel.invalidarCache();
  await Par.getParametros();
  await Par.getCategorias();
});

describe('medicion', () => {
  it('costo del panel a distintas escalas', async () => {
    for (const n of [12, 50, 200]) {
      reiniciarFirestoreFalso();
      Par.invalidarCache();
      Panel.invalidarCache();
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

describe('el costo de abrir la pantalla de ventas', () => {
  beforeEach(async () => {
    reiniciarFirestoreFalso();
    Par.invalidarCache();
    await Par.getParametros();
    await Par.getCategorias();
  });

  it('no crece con el tamaño del directorio de clientas', async () => {
    // Ponerle nombre a las ventas que se muestran no puede costar el
    // directorio entero. Con 50 ventas en pantalla y 500 clientas, eso serían
    // 550 lecturas, y 500 de ellas crecen con el directorio para siempre.
    const pocasClientas = 3;
    const muchasClientas = 60;

    async function costoDeAbrir(cuantasClientas: number): Promise<number> {
      reiniciarFirestoreFalso();
      Par.invalidarCache();
      await Par.getParametros();
      await Par.getCategorias();

      const ids: number[] = [];
      for (let i = 0; i < cuantasClientas; i++) {
        ids.push(await C.guardar({ nombre: `Clienta ${i}` }, g()));
      }

      // Diez ventas, todas de las tres primeras clientas.
      for (let i = 0; i < 10; i++) {
        await V.crear(
          {
            cliente_id: ids[i % 3],
            fecha: HOY,
            tipo: 'INVENTARIO',
            lineas: [{ descripcion: 'x', cantidad: 1, precio_unitario_usd_cents: 1000 }],
          },
          g()
        );
      }

      reiniciarContadores();
      await V.listar({ desde: HOY, limite: 50 });
      return contadores().lecturas;
    }

    const conPocas = await costoDeAbrir(pocasClientas);
    const conMuchas = await costoDeAbrir(muchasClientas);

    expect(
      conMuchas,
      `con ${muchasClientas} clientas costó ${conMuchas} lecturas y con ${pocasClientas} costó ` +
        `${conPocas}: el directorio entero se está leyendo`
    ).toBeLessThanOrEqual(conPocas);
  });
});
