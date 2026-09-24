/**
 * El paquete como única puerta de entrada del inventario.
 *
 * Cada caso de acá fue antes un error reproducido con números (ver
 * `docs/PLAN_PAQUETES_E_INVENTARIO.md`, sección 3). Con el modelo anterior
 * —el paquete sin contenido y el flete repartido después a los productos que
 * lo tuvieran anotado— los trece fallaban. Los números de los comentarios son
 * los que daba la versión anterior.
 *
 * Los montos son los del caso real: $77.00 de flete entre 45 unidades, que no
 * divide exacto. Con $10 entre 10 unidades los errores de redondeo pasan en
 * verde, y así fue como las pruebas anteriores no los vieron.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reiniciarFirestoreFalso } from './firestore-fake';
import { aplicarLote } from '../src/main/firebase/client';
import { ProductosRepoFirestore as Productos } from '../src/main/firebase/repositories/productos.repo';
import { ComprasRepoFirestore as Compras } from '../src/main/firebase/repositories/compras.repo';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { calcularPrecio } from '../src/core/precios';
import { hoyISO } from '../src/core/fechas';
import type { LineaCompraInput } from '../src/shared/ipc-contracts';

const g = () => randomUUID();
const HOY = hoyISO();

beforeEach(async () => {
  reiniciarFirestoreFalso();
  Parametros.invalidarCache();
  Panel.invalidarCache();
  await Parametros.getParametros();
  await Parametros.getCategorias();
});

const producto = (nombre: string, extra: Record<string, unknown> = {}) =>
  Productos.crear({ nombre, modo_precio: 'MARGEN', ...extra }, g());

const linea = (
  producto_id: number,
  descripcion: string,
  cantidad: number,
  tiendaUnitario: number,
  extra: Partial<LineaCompraInput> = {}
): LineaCompraInput => ({
  producto_id,
  descripcion,
  cantidad,
  precio_linea_usd_cents: cantidad * tiendaUnitario,
  destino: 'INVENTARIO',
  ...extra,
});

/** Un paquete con sus líneas, ya en el inventario. */
async function paqueteRecibido(envio: number, lineas: LineaCompraInput[]) {
  const id = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: envio, lineas }, g());
  const resultado = await Compras.recibir(id, g());
  return { id, resultado };
}

const bodega = async () =>
  (await Productos.listar({ incluirInactivos: true })).reduce(
    (s, p) => s + (p.valor_inventario_usd_cents || 0),
    0
  );

/** El paquete real: 40 talladores a $3.40 y 5 carteras a $25, $77 de flete. */
async function paqueteReal() {
  const talladores = await producto('Talladores');
  const cartera = await producto('Cartera');
  const { id, resultado } = await paqueteRecibido(7700, [
    linea(talladores, 'Talladores', 40, 340),
    linea(cartera, 'Cartera', 5, 2500),
  ]);
  return { talladores, cartera, paquete: id, resultado };
}

describe('el costo entra con el paquete', () => {
  it('la bodega vale exactamente lo que se pagó, al centavo', async () => {
    // Antes: abrir y guardar las dos fichas bajaba la bodega 5 centavos.
    const { talladores, cartera, paquete } = await paqueteReal();
    const c = (await Compras.getById(paquete))!;

    // $136.00 + $9.52 + $125.00 + $8.75 + $77.00
    expect(c.total_usd_cents).toBe(35627);
    expect(await bodega(), 'lo que entró a la bodega es lo que se pagó').toBe(35627);
    expect(c.lineas.reduce((s, l) => s + l.envio_asignado_usd_cents, 0)).toBe(7700);

    // Editar la ficha no toca el costo.
    await Productos.actualizar({ id: talladores, nombre: 'Talladores de cintura' }, g());
    await Productos.actualizar({ id: cartera, margen_bp: 6000 }, g());
    expect(await bodega()).toBe(35627);
  });

  it('el paquete dice lo que se pagó, no sólo el flete', async () => {
    // Antes: "total pagado" $77.00 con 0 líneas, y la bodega de ese paquete
    // valía $356.35.
    const { paquete } = await paqueteReal();
    const c = (await Compras.getById(paquete))!;
    expect(c.lineas).toHaveLength(2);
    expect(c.subtotal_productos_usd_cents).toBe(26100);
    expect(c.tax_total_usd_cents).toBe(952 + 875);
    expect(c.total_usd_cents).toBe(26100 + 1827 + 7700);
  });

  it('el precio sale del costo con el flete adentro', async () => {
    // Antes: costo $28.46, precio $39.00. Con el 45% le tocaban $42.00; el
    // margen real era del 37%.
    const { cartera } = await paqueteReal();
    const params = await Parametros.getParametros();
    const p = (await Productos.getById(cartera))!;
    const debido = calcularPrecio({
      costo_unitario_usd_cents: p.costo_unitario_usd_cents,
      modo: 'MARGEN',
      margen_bp: params.margen_defecto_bp,
      paso_redondeo_usd_cents: params.paso_redondeo_usd_cents,
    });

    expect(p.costo_unitario_usd_cents, '$125 + $8.75 + $8.56 de flete, entre 5').toBe(2846);
    expect(p.precio_venta_usd_cents).toBe(debido.precio_usd_cents);
  });

  it('vender no cambia el precio de lo que queda', async () => {
    // Antes: $39.00 antes de vender una cartera, $42.00 después.
    const { cartera } = await paqueteReal();
    const antes = (await Productos.getById(cartera))!.precio_venta_usd_cents;
    await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: cartera, cantidad: 1 }] }, g());
    expect((await Productos.getById(cartera))!.precio_venta_usd_cents).toBe(antes);
  });

  it('ajustar existencias tampoco cambia el precio', async () => {
    const { cartera } = await paqueteReal();
    const p = (await Productos.getById(cartera))!;
    await Productos.ajustar(p.variantes[0].id, 3, g(), 'Producto dañado', cartera);
    expect((await Productos.getById(cartera))!.precio_venta_usd_cents).toBe(p.precio_venta_usd_cents);
  });
});

describe('reponer un producto con otro paquete', () => {
  it('lo que llega entra con SU precio, SU impuesto y SU flete', async () => {
    // Antes, con "ajustar existencias", la bodega quedaba $17.21 de más y el
    // Labial cargaba los $50 de flete enteros.
    const { cartera } = await paqueteReal();
    await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: cartera, cantidad: 3 }] }, g());
    const tras1 = await bodega();
    const quedaba = (await Productos.getById(cartera))!;

    const labial = await producto('Labial');
    const { id: pq2 } = await paqueteRecibido(5000, [
      linea(cartera, 'Cartera', 10, 2500),
      linea(labial, 'Labial', 10, 500),
    ]);

    const c2 = (await Compras.getById(pq2))!;
    // 10 × $25 + 7% + $25 de flete, y 10 × $5 + 7% + $25 de flete.
    expect(c2.lineas.map((l) => l.costo_linea_usd_cents)).toEqual([29250, 7850]);
    expect(c2.total_usd_cents).toBe(37100);
    expect(await bodega()).toBe(tras1 + 37100);

    const c = (await Productos.getById(cartera))!;
    expect(c.existencias).toBe(12);
    expect(c.valor_inventario_usd_cents).toBe(quedaba.valor_inventario_usd_cents + 29250);
    // Sigue siendo UNA ficha, y los dos paquetes la encuentran.
    expect(c.paquetes).toEqual(expect.arrayContaining([pq2]));
    expect(c.paquete_id).toBe(pq2);
  });

  it('el flete repartido nunca es más que el pagado', async () => {
    // Antes: un paquete de $50 llegó a repartir $110 entre sus productos.
    const { cartera } = await paqueteReal();
    await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: cartera, cantidad: 3 }] }, g());
    const labial = await producto('Labial');
    const { id: pq2 } = await paqueteRecibido(5000, [
      linea(cartera, 'Cartera', 10, 2500),
      linea(labial, 'Labial', 10, 500),
    ]);
    const c2 = (await Compras.getById(pq2))!;
    expect(c2.lineas.reduce((s, l) => s + l.envio_asignado_usd_cents, 0)).toBe(5000);
  });

  it('el precio sigue al costo nuevo y lo muestra en el resumen', async () => {
    const { cartera } = await paqueteReal();
    const antes = (await Productos.getById(cartera))!;
    const { resultado } = await paqueteRecibido(0, [linea(cartera, 'Cartera', 5, 3500)]);

    const efecto = resultado.productos.find((p) => p.producto_id === cartera)!;
    const despues = (await Productos.getById(cartera))!;
    expect(efecto.existencias_antes).toBe(5);
    expect(efecto.existencias_despues).toBe(10);
    expect(efecto.precio_antes_usd_cents).toBe(antes.precio_venta_usd_cents);
    expect(efecto.precio_despues_usd_cents).toBe(despues.precio_venta_usd_cents);
    expect(despues.precio_venta_usd_cents, 'la tienda subió: el precio sube').toBeGreaterThan(
      antes.precio_venta_usd_cents
    );
  });
});

describe('corregir un paquete que ya está en el inventario', () => {
  it('un flete mal escrito se corrige sólo sobre lo que queda en bodega', async () => {
    const p = await producto('Perfume');
    const { id } = await paqueteRecibido(1000, [linea(p, 'Perfume', 10, 2000)]);
    const venta = await Ventas.crear(
      { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: p, cantidad: 4 }] },
      g()
    );
    const costoVendido = (await Ventas.getById(venta))!.costo_total_usd_cents;
    const antes = (await Productos.getById(p))!;
    const c = (await Compras.getById(id))!;

    // El courier cobró $30, no $10: $20 más, de los que 6 de 10 unidades
    // siguen en bodega.
    const r = await Compras.corregir(
      {
        id,
        fecha: c.fecha,
        envio_total_usd_cents: 3000,
        lineas: c.lineas.map((l) => ({ ...l, peso_linea_mlb: null })),
      },
      g()
    );

    const despues = (await Productos.getById(p))!;
    expect(r.productos[0].correccion_usd_cents).toBe(1200);
    expect(despues.valor_inventario_usd_cents).toBe(antes.valor_inventario_usd_cents + 1200);
    expect(
      (await Ventas.getById(venta))!.costo_total_usd_cents,
      'lo vendido conserva el costo con que salió'
    ).toBe(costoVendido);
    expect((await Compras.getById(id))!.total_usd_cents).toBe(20000 + 1400 + 3000);
  });

  it('corregir el flete no le mueve el impuesto a las líneas', async () => {
    const { paquete } = await paqueteReal();
    const c = (await Compras.getById(paquete))!;
    await Compras.corregir(
      { id: paquete, fecha: c.fecha, envio_total_usd_cents: 8000, lineas: c.lineas.map((l) => ({ ...l })) },
      g()
    );
    const corregido = (await Compras.getById(paquete))!;
    expect(corregido.lineas.map((l) => l.tax_linea_usd_cents)).toEqual(c.lineas.map((l) => l.tax_linea_usd_cents));
  });

  it('un producto olvidado entra, y el flete del paquete sigue siendo el pagado', async () => {
    // Antes: cargarle un producto olvidado a un paquete viejo, después de
    // reponer, dejaba $88.71 de flete en bodega de un paquete de $77.
    const { cartera, paquete } = await paqueteReal();
    await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: cartera, cantidad: 3 }] }, g());
    const olvidado = await producto('Olvidado');
    const c = (await Compras.getById(paquete))!;
    const antes = await bodega();

    const r = await Compras.corregir(
      {
        id: paquete,
        fecha: c.fecha,
        envio_total_usd_cents: c.envio_total_usd_cents,
        lineas: [...c.lineas.map((l) => ({ ...l })), linea(olvidado, 'Olvidado', 1, 1000)],
      },
      g()
    );

    const corregido = (await Compras.getById(paquete))!;
    expect(corregido.lineas.reduce((s, l) => s + l.envio_asignado_usd_cents, 0)).toBe(7700);
    const nueva = corregido.lineas.find((l) => l.producto_id === olvidado)!;
    const aplicado = r.productos.reduce((s, p) => s + (p.correccion_usd_cents ?? 0), 0);
    expect(await bodega(), 'entra la línea nueva y se ajusta lo que quedaba').toBe(
      antes + nueva.costo_linea_usd_cents + aplicado
    );
    expect(aplicado, 'los demás devuelven parte del flete').toBeLessThan(0);
  });

  it('corregir lo que ya se vendió todo no dice que ajustó productos', async () => {
    // Visto en la app instalada: la corrección quedaba en el paquete, la
    // bodega no se movía, y el resumen decía igual "1 producto se ajustó".
    const p = await producto('Perfume');
    const { id } = await paqueteRecibido(1000, [linea(p, 'Perfume', 2, 2000)]);
    await Ventas.crear({ fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: p, cantidad: 2 }] }, g());
    const c = (await Compras.getById(id))!;
    const antes = await bodega();

    const r = await Compras.corregir(
      { id, fecha: c.fecha, envio_total_usd_cents: 3000, lineas: c.lineas.map((l) => ({ ...l, peso_linea_mlb: null })) },
      g()
    );
    expect(r.productos_afectados).toBe(0);
    expect(await bodega()).toBe(antes);
    expect((await Compras.getById(id))!.total_usd_cents, 'el paquete sí registra lo pagado').toBe(4000 + 280 + 3000);
  });

  it('no deja cambiar cantidades ni quitar líneas que ya entraron', async () => {
    const { paquete } = await paqueteReal();
    const c = (await Compras.getById(paquete))!;
    await expect(
      Compras.corregir(
        { id: paquete, fecha: c.fecha, envio_total_usd_cents: 7700, lineas: [{ ...c.lineas[0], cantidad: 41 }, c.lineas[1]] },
        g()
      )
    ).rejects.toThrow(/sólo se puede corregir el precio/);
    await expect(
      Compras.corregir({ id: paquete, fecha: c.fecha, envio_total_usd_cents: 7700, lineas: [c.lineas[0]] }, g())
    ).rejects.toThrow(/No se puede quitar/);
  });
});

describe('abrir y guardar la ficha no toca el costo', () => {
  it('ni siquiera en un producto que nació al recibir el paquete', async () => {
    // Antes: guardaba precio de tienda $0.00, y abrir y guardar la ficha
    // dejaba el producto con costo $0.00 y valor $0.00.
    const id = await Compras.guardar(
      {
        fecha: HOY,
        envio_total_usd_cents: 1000,
        lineas: [{ descripcion: 'Gloss', cantidad: 5, precio_linea_usd_cents: 4000, destino: 'INVENTARIO' }],
      },
      g()
    );
    await Compras.recibir(id, g());
    const p = (await Productos.listar({}))[0];
    expect(p.valor_inventario_usd_cents).toBe(4000 + 280 + 1000);

    await Productos.actualizar({ id: p.id, nombre: p.nombre, margen_bp: 5000 }, g());
    const despues = (await Productos.getById(p.id))!;
    expect(despues.valor_inventario_usd_cents).toBe(p.valor_inventario_usd_cents);
    expect(despues.costo_unitario_usd_cents).toBe(p.costo_unitario_usd_cents);
  });
});

describe('un paquete sin fecha', () => {
  it('no se guarda: la fecha ordena y filtra todo lo demás', async () => {
    // Visto en la app instalada: con la fecha borrada, el editor dejaba pasar
    // el paquete al inventario.
    const p = await producto('Gloss');
    for (const fecha of ['', '2026-13-45', 'ayer']) {
      await expect(
        Compras.guardar({ fecha, envio_total_usd_cents: 0, lineas: [linea(p, 'Gloss', 1, 1000)] }, g())
      ).rejects.toThrow(/fecha/);
    }
  });
});

describe('el impuesto', () => {
  const gloss = (extra: Partial<LineaCompraInput> = {}): LineaCompraInput => ({
    descripcion: 'Gloss',
    cantidad: 5,
    precio_linea_usd_cents: 4000,
    destino: 'INVENTARIO',
    ...extra,
  });

  it('sin el total del recibo, cada línea paga su 7%', async () => {
    // Antes el editor mandaba 0 como "total del recibo", y el motor repartía
    // cero de impuesto.
    const r = await Compras.previsualizar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [gloss()] });
    expect(r.tax_total_usd_cents).toBe(280);
  });

  it('una línea exenta no paga ni recibe impuesto del recibo', async () => {
    const r = await Compras.previsualizar({
      fecha: HOY,
      envio_total_usd_cents: 0,
      tax_total_override_usd_cents: 300,
      lineas: [gloss(), gloss({ descripcion: 'Libro', exento: true })],
    });
    expect(r.lineas.map((l) => l.tax_linea_usd_cents)).toEqual([300, 0]);
  });
});

describe('las tarjetas cuentan lo que dicen', () => {
  it('una cotización de encargo no es deuda', async () => {
    // Antes: un encargo sin un centavo pagado entraba entero en "Te deben".
    await Ventas.crear(
      {
        fecha: HOY,
        tipo: 'ENCARGO',
        lineas: [{ descripcion: 'Bolso que quizá pida', cantidad: 1, precio_unitario_usd_cents: 9000 }],
      },
      g()
    );
    const panel = await Panel.cargar(true);
    expect(panel.resumen.por_cobrar_usd_cents).toBe(0);
    expect(panel.resumen.cotizado_sin_confirmar_usd_cents).toBe(9000);
  });

  it('un encargo que nace con el anticipo cubierto queda confirmado', async () => {
    // Antes: pagado $45 de $45 de anticipo, y quedaba COTIZADA.
    const id = await Ventas.crear(
      {
        fecha: HOY,
        tipo: 'ENCARGO',
        anticipo_bp: 5000,
        pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO', monto_cents: 4500 },
        lineas: [{ descripcion: 'Bolso encargado', cantidad: 1, precio_unitario_usd_cents: 9000 }],
      },
      g()
    );
    expect((await Ventas.getById(id))!.estado).toBe('PENDIENTE');
    expect((await Ventas.listar({ tipo: 'ENCARGO', estado: 'PENDIENTE' })).map((v) => v.id)).toContain(id);

    // Y lo que falta sí es deuda: la clienta confirmó.
    const panel = await Panel.cargar(true);
    expect(panel.resumen.por_cobrar_usd_cents).toBe(4500);
  });

  it('"Stock crítico" cuenta todos, no los diez de la lista', async () => {
    // Antes: 13 productos en el mínimo y la tarjeta decía 10.
    for (let i = 1; i <= 13; i++) {
      await Productos.crear(
        { nombre: `Casi agotado ${i}`, stock_minimo: 3, stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 500 } },
        g()
      );
    }
    const panel = await Panel.cargar(true);
    expect(panel.bajo_stock).toHaveLength(10);
    expect(panel.total_bajo_stock).toBe(13);
  });
});

describe('los precios que no corresponden a su costo', () => {
  it('se listan para que ella decida, y se aplican sólo los elegidos', async () => {
    const a = await Productos.crear(
      { nombre: 'Viejo A', margen_bp: 5000, stock_inicial: { cantidad: 2, costo_unitario_usd_cents: 1000 } },
      g()
    );
    const b = await Productos.crear(
      { nombre: 'Viejo B', margen_bp: 5000, stock_inicial: { cantidad: 2, costo_unitario_usd_cents: 1000 } },
      g()
    );
    const manual = await Productos.crear(
      { nombre: 'A mano', modo_precio: 'MANUAL', precio_manual_usd_cents: 999, stock_inicial: { cantidad: 2, costo_unitario_usd_cents: 1000 } },
      g()
    );
    // Como quedaban en la versión anterior: precio calculado sin el flete.
    await aplicarLote([
      { coleccion: 'productos', id: a, merge: true, datos: { precio_venta_usd_cents: 1300 } },
      { coleccion: 'productos', id: b, merge: true, datos: { precio_venta_usd_cents: 1300 } },
    ]);

    const lista = await Productos.preciosDesactualizados();
    expect(lista.map((x) => x.producto_id).sort()).toEqual([a, b]);
    expect(lista.find((x) => x.producto_id === a)!.precio_calculado_usd_cents).toBe(1500);
    expect(lista.some((x) => x.producto_id === manual), 'un precio a mano no se toca').toBe(false);

    await Productos.aplicarPrecios([a], g());
    expect((await Productos.getById(a))!.precio_venta_usd_cents).toBe(1500);
    expect((await Productos.getById(b))!.precio_venta_usd_cents, 'b no se eligió').toBe(1300);
  });
});

describe('un paquete de antes del cambio', () => {
  /**
   * Siembra lo que dejaba la versión anterior: el paquete sólo con el flete, y
   * los productos cargados a mano con el paquete anotado, su costo partido en
   * base y flete, y su movimiento de entrada.
   */
  async function sembrarPaqueteViejo() {
    await aplicarLote([
      {
        coleccion: 'compras',
        id: 1,
        merge: false,
        datos: {
          id: 1, codigo: 'PQ-0001', fecha: HOY, estado: 'RECIBIDA', activo: true,
          envio_total_usd_cents: 7700, otros_costos_usd_cents: 0,
          subtotal_productos_usd_cents: 0, tax_total_usd_cents: 0, total_usd_cents: 7700,
          peso_total_mlb: 11000, tasa_cambio_cents: 3662, lineas: [],
        },
      },
      ...[
        { id: 101, nombre: 'Talladores', n: 40, tienda: 340, base: 364, flete: 6844 },
        { id: 102, nombre: 'Cartera', n: 5, tienda: 2500, base: 2675, flete: 856 },
      ].flatMap((p) => [
        {
          coleccion: 'productos',
          id: p.id,
          merge: false,
          datos: {
            id: p.id, codigo: `P-0${p.id}`, nombre: p.nombre, tiene_variantes: false,
            variantes: [{ id: 1, producto_id: p.id, existencias: p.n, activo: true }],
            valor_inventario_usd_cents: p.n * p.base + p.flete,
            costo_unitario_usd_cents: Math.round((p.n * p.base + p.flete) / p.n),
            costo_base_unitario_usd_cents: p.base,
            precio_tienda_unitario_usd_cents: p.tienda,
            flete_total_usd_cents: p.flete,
            modo_precio: 'MARGEN', precio_venta_usd_cents: 1000, stock_minimo: 2,
            peso_unitario_mlb: 0, paquete_id: 1, paquetes: [1], activo: true,
          },
        },
        {
          coleccion: 'movimientos_inventario',
          id: `m-${p.id}`,
          merge: false,
          datos: {
            id: `m-${p.id}`, producto_id: p.id, variante_id: 1, tipo: 'ENTRADA', cantidad: p.n,
            costo_total_usd_cents: p.n * p.base, existencias_despues: p.n,
            referencia_tipo: 'COMPRA', referencia_id: 1, detalle: 'Paquete #1',
          },
        },
      ]),
    ]);
  }

  it('su contenido se reconstruye tal como lo registró la bodega, sin moverla', async () => {
    await sembrarPaqueteViejo();
    const antes = await bodega();
    expect(antes).toBe(35635);

    const r = await Compras.reconstruir(1);
    expect(r.lineas.map((l) => [l.descripcion, l.cantidad, l.costo_linea_usd_cents])).toEqual([
      ['Cartera', 5, 14231],
      ['Talladores', 40, 21404],
    ]);
    expect(r.total_usd_cents, 'lo que la bodega registró de este paquete').toBe(35635);
    expect(r.avisos).toEqual([]);

    await Compras.completarReconstruccion(1, g());
    const c = (await Compras.getById(1))!;
    expect(c.total_usd_cents).toBe(35635);
    expect(c.reconstruido).toBe(true);
    expect(await bodega(), 'completar el contenido no mueve la bodega').toBe(antes);

    await expect(Compras.completarReconstruccion(1, g())).rejects.toThrow(/ya tiene su contenido/);
  });

  it('después de completarlo, corregir su flete no le mueve el impuesto', async () => {
    // La versión anterior sumaba el 7% redondeado por unidad: los talladores
    // pagaron 40 × $0.24 = $9.60, no el 7% de $136.00 = $9.52. Si al corregir
    // el flete se recalculara el impuesto, la bodega se movería 8 centavos
    // por algo que nadie tocó.
    await sembrarPaqueteViejo();
    await Compras.completarReconstruccion(1, g());
    const c = (await Compras.getById(1))!;
    const antes = await bodega();

    const r = await Compras.corregir(
      { id: 1, fecha: c.fecha, envio_total_usd_cents: 7700, peso_total_mlb: 11000, lineas: c.lineas.map((l) => ({ ...l })) },
      g()
    );

    const corregido = (await Compras.getById(1))!;
    expect(corregido.lineas.find((l) => l.descripcion === 'Talladores')!.tax_linea_usd_cents).toBe(960);
    expect(r.productos.reduce((s, p) => s + (p.correccion_usd_cents ?? 0), 0), 'nada cambió').toBe(0);
    expect(await bodega()).toBe(antes);
  });

  it('no se corrige ni se elimina antes de completar su contenido', async () => {
    await sembrarPaqueteViejo();
    await expect(
      Compras.corregir({ id: 1, fecha: HOY, envio_total_usd_cents: 8000, lineas: [] }, g())
    ).rejects.toThrow(/completá su contenido/);
    await expect(Compras.archivar(1, g())).rejects.toThrow(/no se puede eliminar/);
  });
});
