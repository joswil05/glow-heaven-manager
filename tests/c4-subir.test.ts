/**
 * Fase C4 · T3: subir la cola cuando vuelve la señal.
 *
 * Con repositorios falsos se controla cada caso: el orden, de a una, qué
 * hace un error de red y qué hace uno del negocio. Con los repositorios de
 * verdad (sobre el Firestore falso) se prueba lo que depende de la marca de
 * T1: que reintentar lo que ya había subido no lo escribe dos veces.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { cortarRed, reiniciarFirestoreFalso, restaurarRed, volcar } from './firestore-fake';
import { ProductosRepoFirestore as Productos } from '../src/main/firebase/repositories/productos.repo';
import { ComprasRepoFirestore as Compras } from '../src/main/firebase/repositories/compras.repo';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { PagosRepoFirestore as Pagos } from '../src/main/firebase/repositories/pagos.repo';
import { ClientesRepoFirestore as Clientes } from '../src/main/firebase/repositories/clientes.repo';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { hoyISO } from '../src/core/fechas';
import { marcar, type ClientaNueva, type EnCola } from '../mobile/src/lib/cola';
import { crearSubidor, subirCola, type ColaViva, type ReposCola } from '../mobile/src/lib/subir-cola';
import type { CrearVentaInput } from '../src/shared/ipc-contracts';

const HOY = hoyISO();

function colaEnMemoria(inicial: EnCola[]): ColaViva {
  let cola = inicial;
  return {
    leer: () => cola,
    cambiar: async (cambio) => {
      cola = cambio(cola);
    },
  };
}

const estados = (cola: ColaViva) => cola.leer().map((o) => [o.operacion_id, o.estado]);

function venta(id: string, input: Partial<CrearVentaInput> = {}, clienta_nueva?: ClientaNueva): EnCola {
  return {
    operacion_id: id,
    grupo: `grupo-${id}`,
    creada_en: '2026-10-11T18:00:00.000Z',
    operacion: {
      tipo: 'VENTA',
      input: { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ descripcion: 'Suelto', cantidad: 1, precio_unitario_usd_cents: 1000 }], ...input },
      clienta_nueva,
    },
    estado: 'PENDIENTE',
    intentos: 0,
    resumen: { titulo: 'Venta', detalle: id, monto_usd_cents: 1000 },
  };
}

function abono(id: string, venta_id = 7): EnCola {
  return {
    operacion_id: id,
    grupo: `grupo-${id}`,
    creada_en: '2026-10-11T18:00:00.000Z',
    operacion: { tipo: 'ABONO', input: { venta_id, fecha: HOY, monto_cents: 500, moneda: 'USD', metodo: 'EFECTIVO' } },
    estado: 'PENDIENTE',
    intentos: 0,
    resumen: { titulo: 'Abono', detalle: id, monto_usd_cents: 500 },
  };
}

/** Repositorios que anotan cada llamada y fallan cuando se les pide. */
function reposFalsos(fallas: Record<string, unknown> = {}) {
  const llamadas: string[] = [];
  let enVuelo = 0;
  let maximoEnVuelo = 0;
  let ids = 100;
  async function llamar<T>(nombre: string, operacion_id: string, valor: T): Promise<T> {
    enVuelo += 1;
    maximoEnVuelo = Math.max(maximoEnVuelo, enVuelo);
    await new Promise((r) => setTimeout(r, 2));
    enVuelo -= 1;
    llamadas.push(nombre);
    if (fallas[operacion_id]) throw fallas[operacion_id];
    return valor;
  }
  const repos: ReposCola = {
    crearVenta: (input, _grupo, op) => llamar(`venta ${op} clienta ${input.cliente_id ?? '-'}`, op, ids++),
    registrarPago: (_input, _grupo, op) => llamar(`abono ${op}`, op, { pago_id: ids++ }),
    guardarClienta: (datos, _grupo, op) => llamar(`clienta ${op} ${datos.nombre}`, op, 40),
  };
  return { repos, llamadas, maximo: () => maximoEnVuelo };
}

const sinRed = () => Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });

describe('Subir la cola', () => {
  it('sube en el orden en que se hizo, de a una, y guarda el número', async () => {
    const cola = colaEnMemoria([venta('a'), abono('b'), venta('c', { tipo: 'ENCARGO' })]);
    const { repos, llamadas, maximo } = reposFalsos();

    const resumen = await subirCola(cola, repos);

    expect(llamadas).toEqual(['venta a clienta -', 'abono b', 'venta c clienta -']);
    expect(maximo()).toBe(1);
    expect(estados(cola)).toEqual([['a', 'SUBIDA'], ['b', 'SUBIDA'], ['c', 'SUBIDA']]);
    expect(cola.leer()[0].resultado).toEqual({ venta_id: 100, codigo: 'V-0100' });
    expect(cola.leer()[1].resultado).toEqual({ pago_id: 101 });
    expect(cola.leer()[2].resultado).toEqual({ venta_id: 102, codigo: 'E-0102' });
    expect(resumen).toEqual({ subidas: 3, revisar: 0, sinRed: false });
  });

  it('sin red, la operación queda pendiente y la subida se frena', async () => {
    const cola = colaEnMemoria([venta('a'), venta('b'), venta('c')]);
    const { repos, llamadas } = reposFalsos({ b: sinRed() });

    const resumen = await subirCola(cola, repos);

    expect(llamadas).toEqual(['venta a clienta -', 'venta b clienta -']);
    expect(estados(cola)).toEqual([['a', 'SUBIDA'], ['b', 'PENDIENTE'], ['c', 'PENDIENTE']]);
    expect(cola.leer()[1].intentos).toBe(1);
    expect(resumen.sinRed).toBe(true);
  });

  it('un error del negocio la deja para revisar, con el motivo, y la siguiente sube', async () => {
    const cola = colaEnMemoria([venta('a'), venta('b')]);
    const { repos } = reposFalsos({ a: new Error("No hay suficientes unidades de 'Labial'. Disponibles: 0, pedidas: 1.") });

    const resumen = await subirCola(cola, repos);

    expect(estados(cola)).toEqual([['a', 'REVISAR'], ['b', 'SUBIDA']]);
    expect(cola.leer()[0].motivo).toBe("No hay suficientes unidades de 'Labial'. Disponibles: 0, pedidas: 1.");
    expect(resumen).toEqual({ subidas: 1, revisar: 1, sinRed: false });
  });

  it('sin permiso queda para revisar con un motivo que se entiende', async () => {
    const cola = colaEnMemoria([venta('a')]);
    const { repos } = reposFalsos({ a: Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }) });

    await subirCola(cola, repos);

    expect(cola.leer()[0].estado).toBe('REVISAR');
    expect(cola.leer()[0].motivo).toMatch(/permiso/i);
    expect(cola.leer()[0].motivo).not.toMatch(/insufficient/);
  });

  it('la clienta nueva se crea primero y su id entra en la venta', async () => {
    const clienta: ClientaNueva = { operacion_id: 'c1', datos: { nombre: 'Maritza' } };
    const cola = colaEnMemoria([venta('a', {}, clienta)]);
    const { repos, llamadas } = reposFalsos();

    await subirCola(cola, repos);

    expect(llamadas).toEqual(['clienta c1 Maritza', 'venta a clienta 40']);
    expect(cola.leer()[0].resultado).toMatchObject({ cliente_id: 40 });
  });

  it('lo que se quita de la cola mientras sube otra ya no se sube', async () => {
    const cola = colaEnMemoria([venta('a'), venta('b')]);
    const { repos, llamadas } = reposFalsos();
    const original = repos.crearVenta;
    repos.crearVenta = async (input, grupo, op) => {
      if (op === 'a') await cola.cambiar((c) => c.filter((o) => o.operacion_id !== 'b'));
      return original(input, grupo, op);
    };

    await subirCola(cola, repos);

    expect(llamadas).toEqual(['venta a clienta -']);
    expect(estados(cola)).toEqual([['a', 'SUBIDA']]);
  });

  it('con el candado, dos subidas al mismo tiempo suben cada operación una vez', async () => {
    const cola = colaEnMemoria([venta('a'), venta('b')]);
    const { repos, llamadas, maximo } = reposFalsos();
    const subir = crearSubidor(cola, repos);

    await Promise.all([subir(), subir()]);

    expect(llamadas).toEqual(['venta a clienta -', 'venta b clienta -']);
    expect(maximo()).toBe(1);
  });

  it('lo que entra a la cola mientras sube también sube', async () => {
    const cola = colaEnMemoria([venta('a')]);
    const { repos, llamadas } = reposFalsos();
    const subir = crearSubidor(cola, repos);

    const primera = subir();
    await cola.cambiar((c) => [...c, venta('b')]);
    await subir();
    await primera;

    expect(llamadas).toEqual(['venta a clienta -', 'venta b clienta -']);
  });
});

describe('Subir la cola con los repositorios de verdad', () => {
  const g = () => randomUUID();
  const reales: ReposCola = {
    crearVenta: (input, grupo, op) => Ventas.crear(input, grupo, op),
    registrarPago: (input, grupo, op) => Pagos.registrar(input, grupo, op),
    guardarClienta: (datos, grupo, op) => Clientes.guardar(datos, grupo, op),
  };

  beforeEach(async () => {
    reiniciarFirestoreFalso();
    Parametros.invalidarCache();
    Panel.invalidarCache();
    await Parametros.getParametros();
    await Parametros.getCategorias();
  });

  afterEach(() => restaurarRed());

  async function producto(n: number) {
    const id = await Productos.crear({ nombre: 'Labial cola', modo_precio: 'MARGEN', margen_bp: 5000 }, g());
    const pq = await Compras.guardar(
      { fecha: '2026-09-16', envio_total_usd_cents: 0, lineas: [{ producto_id: id, descripcion: 'Labial cola', cantidad: n, precio_linea_usd_cents: n * 400, exento: true, destino: 'INVENTARIO' }] },
      g()
    );
    await Compras.recibir(pq, g());
    return id;
  }

  it('reintentar una venta que ya había subido devuelve la misma, sin escribirla otra vez', async () => {
    const id = await producto(3);
    const cola = colaEnMemoria([venta('op-real', { lineas: [{ producto_id: id, cantidad: 1, precio_unitario_usd_cents: 1200 }] })]);
    await subirCola(cola, reales);
    const primera = cola.leer()[0].resultado!.venta_id;

    // La app se cerró antes de guardar el resultado: al abrir, vuelve a la fila.
    await cola.cambiar((c) => marcar(c, 'op-real', { estado: 'PENDIENTE', resultado: undefined }));
    await subirCola(cola, reales);

    expect(cola.leer()[0].resultado!.venta_id).toBe(primera);
    expect(volcar('ventas')).toHaveLength(1);
    expect((await Productos.listar({ incluirInactivos: true })).find((p) => p.id === id)!.existencias).toBe(2);
  });

  it('con la red cortada queda pendiente, y al volver sube una vez', async () => {
    const cola = colaEnMemoria([venta('op-corte-cola')]);

    cortarRed(0);
    expect((await subirCola(cola, reales)).sinRed).toBe(true);
    expect(estados(cola)).toEqual([['op-corte-cola', 'PENDIENTE']]);
    expect(volcar('ventas')).toHaveLength(0);

    restaurarRed();
    await subirCola(cola, reales);
    expect(estados(cola)).toEqual([['op-corte-cola', 'SUBIDA']]);
    expect(volcar('ventas')).toHaveLength(1);
  });

  it('dos ventas a la misma clienta nueva la crean una vez', async () => {
    const clienta: ClientaNueva = { operacion_id: 'op-clienta-cola', datos: { nombre: 'Clienta de la cola', telefono: '88001122' } };
    const cola = colaEnMemoria([venta('op-v1', {}, clienta), venta('op-v2', {}, clienta)]);

    await subirCola(cola, reales);

    const clientas = volcar('clientes').filter((c) => c.nombre === 'Clienta de la cola');
    expect(clientas).toHaveLength(1);
    const ventas = volcar('ventas') as { cliente_id: number }[];
    expect(ventas.map((v) => v.cliente_id)).toEqual([clientas[0].id, clientas[0].id]);
  });
});
