/**
 * El histórico mensual sin releer la historia.
 *
 * Dos cosas tienen que ser ciertas a la vez, y son las dos que se prueban acá:
 *
 *   1. Los números del panel siguen siendo los mismos. Un resumen guardado
 *      que se desvía de la realidad es peor que no tenerlo: el panel muestra
 *      una ganancia inventada y nadie tiene con qué contrastarla.
 *   2. Abrir el panel deja de costar la historia entera del negocio.
 *
 * La segunda sin la primera es un ahorro que miente.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  reiniciarFirestoreFalso,
  reiniciarContadores,
  contadores,
} from './firestore-fake';
import { PanelRepoFirestore } from '../src/main/firebase/repositories/panel.repo';
import { ResumenesRepoFirestore } from '../src/main/firebase/repositories/resumenes.repo';
import { VentasRepoFirestore } from '../src/main/firebase/repositories/ventas.repo';
import { ProductosRepoFirestore } from '../src/main/firebase/repositories/productos.repo';
import { ParametrosRepoFirestore } from '../src/main/firebase/repositories/parametros.repo';
import { PagosRepoFirestore } from '../src/main/firebase/repositories/pagos.repo';
import { mesISO } from '../src/core/fechas';

const g = () => `grupo-${Math.random().toString(36).slice(2)}`;

/** Una venta entregada Y COBRADA: sale del conjunto de "por cobrar". */
async function ventaCobrada(fecha: string, precioCents: number): Promise<number> {
  const id = await ventaEntregada(fecha, precioCents);
  await PagosRepoFirestore.registrar(
    { venta_id: id, fecha, monto_cents: precioCents, moneda: 'USD', metodo: 'EFECTIVO' },
    g()
  );
  return id;
}

/** Una venta entregada, en la fecha que se le pida. */
async function ventaEntregada(fecha: string, precioCents: number): Promise<number> {
  const id = await VentasRepoFirestore.crear(
    {
      fecha,
      tipo: 'INVENTARIO',
      lineas: [{ descripcion: 'x', cantidad: 1, precio_unitario_usd_cents: precioCents }],
    },
    g()
  );
  await VentasRepoFirestore.cambiarEstado(id, 'ENTREGADA', g());
  return id;
}

function mesHace(meses: number): string {
  let [anio, mes] = mesISO().split('-').map(Number);
  for (let i = 0; i < meses; i++) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      anio -= 1;
    }
  }
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

async function base(): Promise<void> {
  reiniciarFirestoreFalso();
  PanelRepoFirestore.invalidarCache();
  ParametrosRepoFirestore.invalidarCache();
  await ParametrosRepoFirestore.getParametros();
  await ParametrosRepoFirestore.getCategorias();
}

describe('el histórico mensual', () => {
  beforeEach(base);

  it('suma lo mismo que recorrer las ventas a mano', async () => {
    await ventaEntregada(`${mesISO()}-05`, 10000);
    await ventaEntregada(`${mesISO()}-06`, 5000);
    await ventaEntregada(`${mesHace(2)}-10`, 7000);

    const serie = await PanelRepoFirestore.historico(6);
    const esteMes = serie.find((m) => m.mes === mesISO())!;
    const haceDos = serie.find((m) => m.mes === mesHace(2))!;

    expect(esteMes.ventas_count).toBe(2);
    expect(esteMes.ingresos_usd_cents).toBe(15000);
    expect(haceDos.ventas_count).toBe(1);
    expect(haceDos.ingresos_usd_cents).toBe(7000);
  });

  it('sólo cuenta lo entregado: una venta pendiente no es ganancia todavía', async () => {
    await ventaEntregada(`${mesISO()}-05`, 10000);
    // Una venta de inventario nace ENTREGADA salvo que se diga lo contrario.
    await VentasRepoFirestore.crear(
      {
        fecha: `${mesISO()}-07`,
        tipo: 'INVENTARIO',
        entregar_ahora: false,
        lineas: [{ descripcion: 'pendiente', cantidad: 1, precio_unitario_usd_cents: 99000 }],
      },
      g()
    );

    const serie = await PanelRepoFirestore.historico(6);
    const esteMes = serie.find((m) => m.mes === mesISO())!;
    expect(esteMes.ventas_count).toBe(1);
    expect(esteMes.ingresos_usd_cents).toBe(10000);
  });

  it('devuelve los meses en orden, del más viejo al más nuevo', async () => {
    const serie = await PanelRepoFirestore.historico(6);
    expect(serie).toHaveLength(6);
    for (let i = 1; i < serie.length; i++) {
      expect(serie[i - 1].mes < serie[i].mes).toBe(true);
    }
    expect(serie[serie.length - 1].mes).toBe(mesISO());
  });

  it('anular una venta vieja corrige su mes: el resumen guardado no se queda pegado', async () => {
    // Un mes cerrado se calcula una vez y se guarda. Si después se anula una
    // de sus ventas y el resumen no se entera, el panel muestra para siempre
    // una ganancia que ya no existe.
    const mesViejo = mesHace(5);
    const vieja = await ventaEntregada(`${mesViejo}-10`, 20000);
    await ventaEntregada(`${mesViejo}-11`, 5000);

    const antes = await PanelRepoFirestore.historico(6);
    expect(antes.find((m) => m.mes === mesViejo)!.ingresos_usd_cents).toBe(25000);

    await VentasRepoFirestore.cambiarEstado(vieja, 'CANCELADA', g());
    PanelRepoFirestore.invalidarCache();

    const despues = await PanelRepoFirestore.historico(6);
    expect(
      despues.find((m) => m.mes === mesViejo)!.ingresos_usd_cents,
      'el resumen del mes viejo quedó con una venta que ya se anuló'
    ).toBe(5000);
  });

  it('un mes cerrado se calcula una vez y después sale del caché', async () => {
    const mesViejo = mesHace(4);
    await ventaEntregada(`${mesViejo}-10`, 8000);

    // Primera pasada: lo calcula y lo guarda.
    await ResumenesRepoFirestore.historico(6, []);

    reiniciarContadores();
    await ResumenesRepoFirestore.historico(6, []);
    const segunda = contadores();

    expect(
      segunda.consultas,
      'volvió a consultar las ventas de un mes que ya tenía guardado'
    ).toBe(0);
  });
});

describe('el costo de abrir el panel', () => {
  beforeEach(base);

  it('no crece con la antigüedad del negocio', async () => {
    // Un producto para que el inventario no quede vacío.
    await ProductosRepoFirestore.crear(
      { nombre: 'P', stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 100 } },
      g()
    );

    // Tres meses de historia, cobrada: es lo que hace un negocio que
    // funciona. Lo que queda por cobrar es un puñado, no la historia entera.
    for (let m = 0; m < 3; m++) {
      for (let i = 0; i < 10; i++) await ventaCobrada(`${mesHace(m)}-1${i % 9}`, 1000);
    }
    PanelRepoFirestore.invalidarCache();
    reiniciarContadores();
    await PanelRepoFirestore.cargar(true);
    const joven = contadores().lecturas;

    // Dos años de historia, el mismo negocio más viejo.
    await base();
    await ProductosRepoFirestore.crear(
      { nombre: 'P', stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 100 } },
      g()
    );
    for (let m = 0; m < 24; m++) {
      for (let i = 0; i < 10; i++) await ventaCobrada(`${mesHace(m)}-1${i % 9}`, 1000);
    }
    PanelRepoFirestore.invalidarCache();
    reiniciarContadores();
    await PanelRepoFirestore.cargar(true);
    const viejo = contadores().lecturas;

    // Antes esto era lineal: 240 ventas costaban 240 lecturas por apertura.
    // Ahora sólo se leen las recientes, las que deben y los encargos vivos,
    // y ninguno de esos tres conjuntos crece con los años.
    //
    // Nota sobre "lo que se debe": ese conjunto crece con la morosidad, no
    // con el tiempo. Un negocio con doscientas ventas impagas tiene un
    // problema bastante peor que su factura de lecturas.
    expect(
      viejo,
      `negocio de 2 años: ${viejo} lecturas; de 3 meses: ${joven}. ` +
        'El costo sigue atado a la antigüedad.'
    ).toBeLessThan(joven * 2);
  });
});
