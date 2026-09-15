/**
 * El panel del celular: la pantalla que se mira todos los días.
 *
 * `mobile/src/lib/panel-movil.ts` es la única lógica de negocio que vive sólo
 * en la app móvil, y no tenía ninguna prueba. Lo que calcula acá se muestra
 * como plata en la primera pantalla: si la tendencia semanal suma mal, o si
 * "hoy" agarra el día equivocado, el número está mal en el lugar donde más se
 * mira y nadie tiene con qué contrastarlo.
 *
 * Además estas pruebas cubren el cambio que hizo que la tendencia reutilice la
 * instantánea del panel en vez de releer la colección de ventas: era código
 * sin pruebas y se le cambió la fuente de datos.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { reiniciarFirestoreFalso, reiniciarContadores, contadores } from './firestore-fake';
import { ParametrosRepoFirestore } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore } from '../src/main/firebase/repositories/panel.repo';
import { VentasRepoFirestore } from '../src/main/firebase/repositories/ventas.repo';
import { ClientesRepoFirestore } from '../src/main/firebase/repositories/clientes.repo';
import {
  cargarTendenciaDiaria,
  cargarEncargosPendientes,
  obtenerDatosDashboard,
  invalidarCacheDashboard,
} from '../mobile/src/lib/panel-movil';
import { hoyISO, haceDias } from '../src/core/fechas';

const g = () => `grupo-${Math.random().toString(36).slice(2)}`;

/** Deja el reloj quieto en una hora de trabajo, para que "hoy" no se mueva. */
function congelarReloj(): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-14T16:00:00Z')); // 10:00 en Managua
}

async function venta(fecha: string, precioCents: number, tipo: 'INVENTARIO' | 'ENCARGO' = 'INVENTARIO') {
  return VentasRepoFirestore.crear(
    {
      fecha,
      tipo,
      lineas: [{ descripcion: 'Suelto', cantidad: 1, precio_unitario_usd_cents: precioCents }],
    },
    g()
  );
}

describe('la tendencia semanal del panel móvil', () => {
  beforeEach(async () => {
    reiniciarFirestoreFalso();
    invalidarCacheDashboard();
    PanelRepoFirestore.invalidarCache();
    ParametrosRepoFirestore.invalidarCache();
    await ParametrosRepoFirestore.getParametros();
    await ParametrosRepoFirestore.getCategorias();
    congelarReloj();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('devuelve exactamente siete días, incluidos los que no tuvieron ventas', async () => {
    await venta(hoyISO(), 5000);

    const { serie } = await cargarTendenciaDiaria(7);

    expect(serie).toHaveLength(7);
    expect(serie[0].fecha).toBe(haceDias(6));
    expect(serie[6].fecha).toBe(hoyISO());
    // Los días sin ventas van en cero, no se saltean: si faltaran, la gráfica
    // comprimiría la semana y una caída parecería un día normal.
    expect(serie.filter((d) => d.cantidad === 0)).toHaveLength(6);
  });

  it('suma varias ventas del mismo día en una sola barra', async () => {
    const hoy = hoyISO();
    await venta(hoy, 1000);
    await venta(hoy, 2500);
    await venta(hoy, 700);

    const { serie, hoy: resumen } = await cargarTendenciaDiaria(7);
    const barraDeHoy = serie.find((d) => d.fecha === hoy)!;

    expect(barraDeHoy.cantidad).toBe(3);
    expect(barraDeHoy.total_usd_cents).toBe(4200);
    expect(resumen.ventas_count).toBe(3);
    expect(resumen.total_usd_cents).toBe(4200);
  });

  it('no cuenta las ventas anuladas', async () => {
    const hoy = hoyISO();
    const v1 = await venta(hoy, 5000);
    await venta(hoy, 3000);

    await VentasRepoFirestore.cambiarEstado(v1, 'CANCELADA', g());
    PanelRepoFirestore.invalidarCache();

    const { hoy: resumen } = await cargarTendenciaDiaria(7);
    expect(resumen.ventas_count).toBe(1);
    expect(resumen.total_usd_cents).toBe(3000);
  });

  it('deja fuera lo que quedó antes de la ventana', async () => {
    await venta(haceDias(30), 9999);
    await venta(hoyISO(), 1000);

    const { serie } = await cargarTendenciaDiaria(7);
    const total = serie.reduce((s, d) => s + d.total_usd_cents, 0);

    expect(total, 'la venta de hace un mes no puede entrar en la semana').toBe(1000);
  });

  it('el resumen de hoy sólo cuenta hoy, no el resto de la semana', async () => {
    await venta(haceDias(1), 8000);
    await venta(haceDias(2), 6000);
    await venta(hoyISO(), 1500);

    const { hoy: resumen, serie } = await cargarTendenciaDiaria(7);

    expect(resumen.total_usd_cents).toBe(1500);
    expect(resumen.ventas_count).toBe(1);
    // Pero la serie sí tiene los tres días.
    expect(serie.filter((d) => d.cantidad > 0)).toHaveLength(3);
  });
});

describe('el costo de abrir el panel móvil', () => {
  beforeEach(async () => {
    reiniciarFirestoreFalso();
    invalidarCacheDashboard();
    PanelRepoFirestore.invalidarCache();
    ParametrosRepoFirestore.invalidarCache();
    await ParametrosRepoFirestore.getParametros();
    await ParametrosRepoFirestore.getCategorias();
    congelarReloj();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('la tendencia no vuelve a leer las ventas: usa la instantánea del panel', async () => {
    for (let i = 0; i < 12; i++) await venta(hoyISO(), 1000 + i);

    // Primero el panel, que es lo que hace `obtenerDatosDashboard`.
    await PanelRepoFirestore.cargar();

    reiniciarContadores();
    await cargarTendenciaDiaria(7);

    expect(
      contadores().lecturas,
      'la tendencia volvió a leer la colección de ventas'
    ).toBe(0);
    expect(contadores().consultas).toBe(0);
  });

  it('abrir el panel no lee la colección de ventas dos veces', async () => {
    for (let i = 0; i < 20; i++) await venta(hoyISO(), 500);

    PanelRepoFirestore.invalidarCache();
    invalidarCacheDashboard();
    reiniciarContadores();

    await obtenerDatosDashboard(true);
    const primeraApertura = contadores().lecturas;

    // El panel pide tres recortes de ventas —las recientes, las que deben y
    // los encargos vivos— y una misma venta puede caer en más de uno, así que
    // se lee hasta tres veces. Con un negocio chico eso cuesta MÁS que traer
    // todo de una: 20 ventas impagas y recientes entran en los tres.
    //
    // Es un intercambio hecho a propósito. El costo de antes era el total de
    // la historia y crecía todos los meses; el de ahora es como mucho tres
    // veces un conjunto acotado, y no crece nunca. Para un negocio de un año
    // ya conviene; para uno de tres, la diferencia es abismal.
    expect(
      primeraApertura,
      `abrir el panel costó ${primeraApertura} lecturas con 20 ventas`
    ).toBeLessThan(20 * 3 + 20);
  });

  it('la caché de 45 segundos evita releer en cada cambio de pestaña', async () => {
    await venta(hoyISO(), 1000);
    await obtenerDatosDashboard(true);

    reiniciarContadores();
    await obtenerDatosDashboard();
    await obtenerDatosDashboard();

    expect(contadores().lecturas).toBe(0);
  });
});

describe('los encargos pendientes', () => {
  beforeEach(async () => {
    reiniciarFirestoreFalso();
    invalidarCacheDashboard();
    PanelRepoFirestore.invalidarCache();
    ParametrosRepoFirestore.invalidarCache();
    await ParametrosRepoFirestore.getParametros();
    await ParametrosRepoFirestore.getCategorias();
    congelarReloj();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lista sólo los encargos que todavía están en curso', async () => {
    const ana = await ClientesRepoFirestore.guardar({ nombre: 'Ana', telefono: '88887777' }, g());

    await VentasRepoFirestore.crear(
      {
        cliente_id: ana,
        fecha: hoyISO(),
        tipo: 'ENCARGO',
        lineas: [{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 9000 }],
      },
      g()
    );
    const entregado = await VentasRepoFirestore.crear(
      {
        cliente_id: ana,
        fecha: hoyISO(),
        tipo: 'ENCARGO',
        lineas: [{ descripcion: 'Perfume', cantidad: 1, precio_unitario_usd_cents: 4000 }],
      },
      g()
    );
    await VentasRepoFirestore.cambiarEstado(entregado, 'ENTREGADA', g());
    // Una venta normal no es un encargo y no debe aparecer.
    await venta(hoyISO(), 2000);

    PanelRepoFirestore.invalidarCache();
    const pendientes = await cargarEncargosPendientes();

    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].cliente_nombre).toBe('Ana');
    expect(pendientes[0].cliente_telefono).toBe('88887777');
  });

  it('un encargo sin clienta se muestra como mostrador, no vacío', async () => {
    await VentasRepoFirestore.crear(
      {
        fecha: hoyISO(),
        tipo: 'ENCARGO',
        lineas: [{ descripcion: 'Suelto', cantidad: 1, precio_unitario_usd_cents: 3000 }],
      },
      g()
    );

    PanelRepoFirestore.invalidarCache();
    const pendientes = await cargarEncargosPendientes();

    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].cliente_nombre).toBe('Mostrador');
  });
});
