/**
 * Lo que cuesta abrir una pantalla, medido en documentos.
 *
 * Firestore cobra por documento leído, así que lo que importa no es cuánto se
 * muestra sino cuánto se TRAE. Sin acotar, abrir la pantalla de ventas lee la
 * historia entera del negocio, y esa cuenta crece todos los meses para
 * siempre: a los tres años, cada apertura son miles de lecturas de datos que
 * nadie está mirando.
 *
 * Estas pruebas fijan que la ventana por fecha se resuelva EN EL SERVIDOR.
 * Un filtro en memoria se ve igual en pantalla y no ahorra ni un centavo: la
 * única forma de notar la diferencia es contando lecturas, que es lo que se
 * hace acá.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  reiniciarFirestoreFalso,
  reiniciarContadores,
  contadores,
} from './firestore-fake';
import { VentasRepoFirestore } from '../src/main/firebase/repositories/ventas.repo';
import { ClientesRepoFirestore } from '../src/main/firebase/repositories/clientes.repo';
import { ParametrosRepoFirestore } from '../src/main/firebase/repositories/parametros.repo';

const g = () => `grupo-${Math.random().toString(36).slice(2)}`;

/** Ventas repartidas en meses, como una historia que se acumula. */
async function sembrarHistoria(meses: number, porMes: number): Promise<void> {
  for (let m = 0; m < meses; m++) {
    const mes = 12 - (m % 12);
    const anio = 2026 - Math.floor(m / 12);
    for (let i = 0; i < porMes; i++) {
      await VentasRepoFirestore.crear(
        {
          fecha: `${anio}-${String(mes).padStart(2, '0')}-15`,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'x', cantidad: 1, precio_unitario_usd_cents: 1000 }],
        },
        g()
      );
    }
  }
}

describe('el costo de listar ventas', () => {
  beforeEach(async () => {
    reiniciarFirestoreFalso();
    ParametrosRepoFirestore.invalidarCache();
    await ParametrosRepoFirestore.getParametros();
    await ParametrosRepoFirestore.getCategorias();
  });

  it('con ventana de un mes, no se paga la historia entera', async () => {
    // 12 meses de historia, 10 ventas por mes.
    await sembrarHistoria(12, 10);

    reiniciarContadores();
    const delMes = await VentasRepoFirestore.listar({ desde: '2026-12-01' });
    const conVentana = contadores().lecturas;

    reiniciarContadores();
    const todas = await VentasRepoFirestore.listar({});
    const sinVentana = contadores().lecturas;

    expect(todas.length).toBe(120);
    expect(delMes.length).toBe(10);
    expect(
      conVentana,
      `la ventana costó ${conVentana} lecturas y traer todo ${sinVentana}: ` +
        'el recorte no llegó al servidor'
    ).toBeLessThan(sinVentana);
  });

  it('el costo de la ventana no crece con la antigüedad del negocio', async () => {
    // La misma ventana de un mes, sobre dos negocios de distinta edad.
    await sembrarHistoria(3, 10);
    reiniciarContadores();
    await VentasRepoFirestore.listar({ desde: '2026-12-01' });
    const negocioJoven = contadores().lecturas;

    reiniciarFirestoreFalso();
    ParametrosRepoFirestore.invalidarCache();
    await ParametrosRepoFirestore.getParametros();
    await ParametrosRepoFirestore.getCategorias();
    await sembrarHistoria(24, 10);

    reiniciarContadores();
    await VentasRepoFirestore.listar({ desde: '2026-12-01' });
    const negocioViejo = contadores().lecturas;

    expect(
      negocioViejo,
      `un negocio de 2 años costó ${negocioViejo} lecturas y uno de 3 meses ${negocioJoven}: ` +
        'el costo sigue atado a la antigüedad'
    ).toBeLessThanOrEqual(negocioJoven + 2);
  });

  it('el tope limita lo que se trae, no sólo lo que se muestra', async () => {
    await sembrarHistoria(6, 20);

    reiniciarContadores();
    const acotadas = await VentasRepoFirestore.listar({ desde: '2020-01-01', limite: 15 });
    const lecturas = contadores().lecturas;

    expect(acotadas.length).toBeLessThanOrEqual(15);
    expect(
      lecturas,
      `se pidieron 15 y se leyeron ${lecturas}: el tope no llegó al servidor`
    ).toBeLessThanOrEqual(20);
  });

  it('la ventana devuelve lo más reciente primero', async () => {
    await sembrarHistoria(6, 5);
    const ventas = await VentasRepoFirestore.listar({ desde: '2020-01-01', limite: 10 });

    for (let i = 1; i < ventas.length; i++) {
      expect(ventas[i - 1].fecha >= ventas[i].fecha).toBe(true);
    }
  });

  it('las ventas de una clienta NO se recortan por fecha', async () => {
    // Una compra vieja sigue siendo parte de su historia: acotarla por fecha
    // le escondería deuda a quien la está cobrando.
    const ana = await ClientesRepoFirestore.guardar({ nombre: 'Ana' }, g());
    await VentasRepoFirestore.crear(
      {
        cliente_id: ana,
        fecha: '2024-03-10',
        tipo: 'INVENTARIO',
        lineas: [{ descripcion: 'vieja', cantidad: 1, precio_unitario_usd_cents: 5000 }],
      },
      g()
    );
    await VentasRepoFirestore.crear(
      {
        cliente_id: ana,
        fecha: '2026-12-01',
        tipo: 'INVENTARIO',
        lineas: [{ descripcion: 'nueva', cantidad: 1, precio_unitario_usd_cents: 3000 }],
      },
      g()
    );

    // Sin ventana: la historia completa de la clienta, que es lo que pide la
    // pantalla de detalle. Una compra vieja impaga sigue siendo deuda.
    const suyas = await VentasRepoFirestore.listar({ cliente_id: ana });
    expect(suyas.length, 'el detalle de una clienta trae toda su historia').toBe(2);

    // Y si alguien SÍ manda ventana, se respeta: el filtro no cambia de
    // significado según el camino.
    const acotadas = await VentasRepoFirestore.listar({ cliente_id: ana, desde: '2026-12-01' });
    expect(acotadas.length).toBe(1);
  });

  it('los encargos pendientes NO se recortan por fecha', async () => {
    // Un encargo de hace tres meses sigue pendiente. Si la ventana lo
    // escondiera, el paquete se compraría sin él.
    const encargo = await VentasRepoFirestore.crear(
      {
        fecha: '2026-06-01',
        tipo: 'ENCARGO',
        anticipo_bp: 5000,
        lineas: [{ descripcion: 'encargo viejo', cantidad: 1, precio_unitario_usd_cents: 9000 }],
      },
      g()
    );
    // El anticipo entró: el encargo ya se puede comprar.
    const { PagosRepoFirestore } = await import('../src/main/firebase/repositories/pagos.repo');
    await PagosRepoFirestore.registrar(
      { venta_id: encargo, fecha: '2026-06-02', monto_cents: 4500, moneda: 'USD', metodo: 'EFECTIVO' },
      g()
    );

    // La pantalla de paquetes pide esto SIN ventana, a propósito.
    const pendientes = await VentasRepoFirestore.listar({
      tipo: 'ENCARGO',
      estado: 'PENDIENTE',
    });
    expect(pendientes.length, 'un encargo viejo sigue pendiente').toBe(1);
  });
});
