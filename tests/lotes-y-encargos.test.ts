/**
 * Lotes y encargos contra los repositorios reales (Firestore falso).
 *
 * Cada caso es una regla de `docs/PLAN_LOTES_Y_ENCARGOS.md`. Los números son
 * los del ejemplo que se le mostró a Joswill: boxers de agosto a $8.49 y de
 * septiembre a $6.35.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { reiniciarFirestoreFalso } from './firestore-fake';
import { getFirestoreDb } from '../src/main/firebase/client';
import { ProductosRepoFirestore as Productos } from '../src/main/firebase/repositories/productos.repo';
import { ComprasRepoFirestore as Compras } from '../src/main/firebase/repositories/compras.repo';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { EventosRepoFirestore as Eventos } from '../src/main/firebase/repositories/eventos.repo';
import { etapaEncargo } from '../src/core/encargos';
import { hoyISO, sumarDiasAFecha } from '../src/core/fechas';
import type { LineaCompraInput, LineaVentaInput } from '../src/shared/ipc-contracts';

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
  Productos.crear({ nombre, modo_precio: 'MARGEN', margen_bp: 5000, ...extra }, g());

/**
 * Una línea cuyo costo final queda exacto: sin flete ni impuesto, el costo
 * unitario es el precio de tienda. Así los números del ejemplo se leen tal
 * cual.
 */
const linea = (producto_id: number, descripcion: string, cantidad: number, costoUnitario: number, extra: Partial<LineaCompraInput> = {}): LineaCompraInput => ({
  producto_id,
  descripcion,
  cantidad,
  precio_linea_usd_cents: cantidad * costoUnitario,
  exento: true,
  destino: 'INVENTARIO',
  ...extra,
});

async function paquete(fecha: string, lineas: LineaCompraInput[], envio = 0) {
  const id = await Compras.guardar({ fecha, envio_total_usd_cents: envio, lineas }, g());
  await Compras.recibir(id, g());
  return id;
}

const bodega = async () =>
  (await Productos.listar({ incluirInactivos: true })).reduce((s, p) => s + p.valor_inventario_usd_cents, 0);

const vender = (producto_id: number, cantidad: number, extra: Record<string, unknown> = {}) =>
  Ventas.crear(
    {
      fecha: HOY,
      tipo: 'INVENTARIO',
      lineas: [{ producto_id, cantidad }],
      pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO' },
      ...extra,
    },
    g()
  );

/** 6 boxers en agosto a $8.49 (se venden 2) y 10 en septiembre a $6.35. */
async function boxers() {
  const id = await producto('Boxers');
  const agosto = await paquete('2026-08-10', [linea(id, 'Boxers', 6, 849)]);
  await vender(id, 2);
  const septiembre = await paquete('2026-09-20', [linea(id, 'Boxers', 10, 635)]);
  return { id, agosto, septiembre };
}

describe('lotes: primero sale lo más viejo', () => {
  it('cada paquete deja su lote, y la bodega es su suma exacta', async () => {
    const { id } = await boxers();
    const p = (await Productos.getById(id))!;
    expect(p.existencias).toBe(14);
    expect(p.lotes!.filter((l) => l.cantidad > 0).map((l) => [l.cantidad, l.valor_usd_cents])).toEqual([
      [4, 4 * 849],
      [10, 6350],
    ]);
    expect(p.valor_inventario_usd_cents).toBe(4 * 849 + 6350);
  });

  it('las próximas ventas se llevan el costo de agosto, no un promedio', async () => {
    const { id } = await boxers();
    const v = (await Ventas.getById(await vender(id, 5)))!;
    // Hoy: 5 × $6.96 = $34.80. Con lotes: 4 × $8.49 + $6.35.
    expect(v.costo_total_usd_cents).toBe(4 * 849 + 635);
    expect(v.lineas[0].lotes_consumidos!.map((c) => c.cantidad)).toEqual([4, 1]);
    expect(await bodega()).toBe(9 * 635);
  });

  it('anular devuelve cada unidad a su lote, con su costo', async () => {
    const { id } = await boxers();
    const antes = await bodega();
    const venta = await vender(id, 5);
    await Ventas.cambiarEstado(venta, 'CANCELADA', g());
    expect(await bodega()).toBe(antes);
    const lotes = (await Productos.getById(id))!.lotes!.filter((l) => l.cantidad > 0);
    // Agosto ya había vendido 2 antes: vuelve a ese número, no a cero.
    expect(lotes.map((l) => [l.cantidad, l.valor_usd_cents, l.vendidas])).toEqual([
      [4, 4 * 849, 2],
      [10, 6350, 0],
    ]);
  });

  it('el precio se calcula sobre el lote más caro que queda', async () => {
    const { id } = await boxers();
    // 50% sobre $8.49 = $12.735, redondeado hacia arriba.
    const p = (await Productos.getById(id))!;
    expect(p.costo_unitario_usd_cents).toBe(849);
    expect(p.precio_venta_usd_cents).toBeGreaterThanOrEqual(1274);
  });

  it('vendido el lote caro, el precio no baja solo: se propone', async () => {
    const { id } = await boxers();
    const precioAntes = (await Productos.getById(id))!.precio_venta_usd_cents;
    await vender(id, 4);
    const p = (await Productos.getById(id))!;
    expect(p.precio_venta_usd_cents).toBe(precioAntes);
    expect(p.costo_unitario_usd_cents).toBe(635);
    const propuestos = await Productos.preciosDesactualizados();
    const propuesto = propuestos.find((x) => x.producto_id === id)!;
    expect(propuesto.precio_calculado_usd_cents).toBeLessThan(precioAntes);
  });

  it('un producto dañado sale del lote más viejo y cuenta como baja', async () => {
    const { id } = await boxers();
    const p = (await Productos.getById(id))!;
    await Productos.ajustar(p.variantes[0].id, 13, g(), 'Producto dañado', id);
    const q = (await Productos.getById(id))!;
    const agosto = q.lotes!.find((l) => l.compra_codigo === 'PQ-0001')!;
    expect([agosto.cantidad, agosto.bajas]).toEqual([3, 1]);
    expect(q.valor_inventario_usd_cents).toBe(3 * 849 + 6350);
  });

  it('un conteo que da de más entra al costo del lote más nuevo', async () => {
    const { id } = await boxers();
    const p = (await Productos.getById(id))!;
    await Productos.ajustar(p.variantes[0].id, 15, g(), 'Conteo físico', id);
    const q = (await Productos.getById(id))!;
    expect(q.valor_inventario_usd_cents).toBe(4 * 849 + 6350 + 635);
    expect(q.lotes!.some((l) => l.origen === 'AJUSTE' && l.cantidad === 1)).toBe(true);
  });

  it('corregir un paquete cambia sólo su lote, en lo que queda de él', async () => {
    const { id, agosto } = await boxers();
    const compra = (await Compras.getById(agosto))!;
    // La línea de agosto costó $0.10 más por unidad: $0.60 en la línea de 6.
    await Compras.corregir(
      {
        id: agosto,
        fecha: compra.fecha,
        envio_total_usd_cents: 0,
        lineas: compra.lineas.map((l) => ({ ...l, precio_linea_usd_cents: l.precio_linea_usd_cents + 60 })),
      },
      g()
    );
    const lotes = (await Productos.getById(id))!.lotes!;
    // Quedan 4 de 6: le toca round(60 × 4 / 6) = 40. Septiembre no se mueve.
    expect(lotes.find((l) => l.compra_codigo === 'PQ-0001')!.valor_usd_cents).toBe(4 * 849 + 40);
    expect(lotes.find((l) => l.compra_codigo === 'PQ-0002')!.valor_usd_cents).toBe(6350);
  });

  it('el detalle del paquete dice cuánto se vendió y cuánto dejó, con el descuento', async () => {
    const id = await producto('Gloss');
    const pq = await paquete(HOY, [linea(id, 'Gloss', 5, 1000)]);
    await vender(id, 2, {
      lineas: [{ producto_id: id, cantidad: 2, precio_unitario_usd_cents: 2000 }],
      descuento_tipo: 'MONTO_FIJO',
      descuento_valor: 5,
    });
    const l = (await Compras.getById(pq))!.lineas[0];
    expect(l.lote_propio).toBe(true);
    expect(l.lote_quedan).toBe(3);
    expect(l.lote_vendidas).toBe(2);
    expect(l.lote_ingreso_usd_cents).toBe(4000 - 500);
    expect(l.lote_costo_vendido_usd_cents).toBe(2000);
  });
});

describe('la migración a lotes, sin script', () => {
  it('un producto de antes (sin lotes) se vende bien y la bodega no cambia', async () => {
    const id = await producto('Perfume viejo', { stock_inicial: { cantidad: 3, costo_unitario_usd_cents: 1234 } });
    expect((await Productos.getById(id))!.lotes!.map((l) => l.origen)).toEqual(['SALDO']);
    const v = (await Ventas.getById(await vender(id, 1)))!;
    expect(v.costo_total_usd_cents).toBe(1234);
    expect(await bodega()).toBe(2 * 1234);
  });

  it('si la app vieja vendió sin tocar los lotes, la próxima operación los cuadra', async () => {
    const { id } = await boxers();
    // La 2.13 vendió 2 al promedio ($6.96): bajó existencias y valor, y no
    // tocó los lotes.
    const db = getFirestoreDb();
    const ref = doc(db, 'productos', String(id));
    const d = (await getDoc(ref)).data()!;
    await setDoc(
      ref,
      {
        variantes: [{ ...d.variantes[0], existencias: 12 }],
        valor_inventario_usd_cents: 4 * 849 + 6350 - 1392,
      },
      { merge: true }
    );
    const antes = await bodega();
    await vender(id, 1);
    const p = (await Productos.getById(id))!;
    expect(p.existencias).toBe(11);
    // Lo que no cuadraba salió del lote más viejo; el valor total manda.
    const suma = p.lotes!.reduce((s, l) => s + l.valor_usd_cents, 0);
    expect(suma).toBe(p.valor_inventario_usd_cents);
    expect(antes - p.valor_inventario_usd_cents).toBeGreaterThan(0);
  });
});

/** Un encargo confirmado, con una pieza por comprar. */
async function encargo(extra: Record<string, unknown> = {}, lineas?: LineaVentaInput[]) {
  return Ventas.crear(
    {
      fecha: HOY,
      tipo: 'ENCARGO',
      anticipo_bp: 5000,
      pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO', monto_cents: 2500 },
      lineas: lineas ?? [{ descripcion: 'Perfume Bombshell', cantidad: 1, precio_unitario_usd_cents: 5000 }],
      ...extra,
    },
    g()
  );
}

async function lineaDeEncargo(venta_id: number): Promise<LineaCompraInput> {
  const v = (await Ventas.getById(venta_id))!;
  return {
    descripcion: v.lineas[0].descripcion,
    cantidad: v.lineas[0].cantidad,
    precio_linea_usd_cents: 3000,
    exento: true,
    destino: 'ENCARGO',
    venta_id,
    venta_linea_id: v.lineas[0].id,
  };
}

const etapa = async (id: number) => {
  const v = (await Ventas.listar({ tipo: 'ENCARGO' })).find((x) => x.id === id)!;
  return etapaEncargo(v);
};

describe('encargos: cada pieza sabe de dónde sale', () => {
  it('confirmado → en camino → llegó, sin escribirlo a mano', async () => {
    const e = await encargo();
    expect(await etapa(e)).toBe('POR_COMPRAR');

    const pq = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    expect(await etapa(e)).toBe('EN_CAMINO');
    expect((await Ventas.getById(e))!.lineas[0].compra_codigo).toBe('PQ-0001');

    await Compras.recibir(pq, g());
    const v = (await Ventas.getById(e))!;
    expect(await etapa(e)).toBe('POR_ENTREGAR');
    expect(v.lineas[0].llego_el).toBe(HOY);
    expect(v.costo_total_usd_cents).toBe(3000);
  });

  it('una pieza no puede venir en dos paquetes', async () => {
    const e = await encargo();
    await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    await expect(
      Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g())
    ).rejects.toThrow(/ya viene en PQ-0001/);
  });

  it('quitarla del paquete, o eliminarlo, la vuelve a "por comprar"', async () => {
    const e = await encargo();
    const pq = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    await Compras.archivar(pq, g());
    expect(await etapa(e)).toBe('POR_COMPRAR');
    expect((await Ventas.getById(e))!.lineas[0].compra_id).toBeUndefined();
  });

  it('no se entrega lo que no llegó', async () => {
    const e = await encargo();
    await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    await expect(Ventas.cambiarEstado(e, 'ENTREGADA', g())).rejects.toThrow(/todavía no llegó: viene en PQ-0001/);
    expect((await Ventas.getById(e))!.estado).toBe('PENDIENTE');
  });

  it('una pieza que vino en un paquete no descuenta de la bodega al entregarla', async () => {
    // Era el doble descuento: la pieza apuntaba a un producto del catálogo.
    const perfume = await producto('Perfume Bombshell');
    await paquete(HOY, [linea(perfume, 'Perfume Bombshell', 2, 3000)]);
    const e = await encargo({}, [{ producto_id: perfume, descripcion: 'Perfume Bombshell', cantidad: 1, precio_unitario_usd_cents: 5000 }]);
    const pq = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    await Compras.recibir(pq, g());
    await Ventas.cambiarEstado(e, 'ENTREGADA', g());
    expect((await Productos.getById(perfume))!.existencias).toBe(2);
  });

  it('una pieza de la bodega sale del lote más viejo y el encargo toma ese costo', async () => {
    const perfume = await producto('Perfume Bombshell');
    await paquete('2026-08-01', [linea(perfume, 'Perfume Bombshell', 1, 2800)]);
    await paquete('2026-09-01', [linea(perfume, 'Perfume Bombshell', 1, 3100)]);
    const e = await encargo({}, [
      { producto_id: perfume, descripcion: 'Perfume Bombshell', cantidad: 1, precio_unitario_usd_cents: 5000, costo_estimado_unitario_usd_cents: 3500 },
    ]);
    expect(await etapa(e)).toBe('POR_ENTREGAR');
    await Ventas.cambiarEstado(e, 'ENTREGADA', g());
    const v = (await Ventas.getById(e))!;
    expect(v.costo_total_usd_cents).toBe(2800);
    expect(v.ganancia_usd_cents).toBe(2200);
    expect((await Productos.getById(perfume))!.existencias).toBe(1);

    // Y anularlo después la devuelve a su lote.
    await Ventas.cambiarEstado(e, 'CANCELADA', g());
    const lotes = (await Productos.getById(perfume))!.lotes!.filter((l) => l.cantidad > 0);
    expect(lotes.map((l) => l.valor_usd_cents)).toEqual([2800, 3100]);
  });
});

describe('encargos: anular', () => {
  it('con la pieza en un paquete que se está cargando, la pieza pasa a la bodega de ese paquete', async () => {
    const e = await encargo();
    const pq = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    await Ventas.cambiarEstado(e, 'CANCELADA', g());
    expect((await Compras.getById(pq))!.lineas[0].destino).toBe('INVENTARIO');
    await Compras.recibir(pq, g());
    const p = (await Productos.listar()).find((x) => x.nombre === 'Perfume Bombshell')!;
    expect([p.existencias, p.valor_inventario_usd_cents]).toEqual([1, 3000]);
  });

  it('con la pieza ya llegada, sin decir qué hacer con ella, no se anula', async () => {
    const e = await encargo();
    const pq = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    await Compras.recibir(pq, g());
    await expect(Ventas.cambiarEstado(e, 'CANCELADA', g())).rejects.toThrow(/ya llegó/);
    expect((await Ventas.getById(e))!.estado).toBe('PENDIENTE');
  });

  it('a la bodega: entra con su costo real; y el anticipo se puede quedar', async () => {
    const e = await encargo();
    const pq = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    await Compras.recibir(pq, g());
    const v = (await Ventas.getById(e))!;
    await Ventas.cambiarEstado(e, 'CANCELADA', g(), {
      anticipo: 'RETENER',
      piezas: { [v.lineas[0].id]: { destino: 'BODEGA' } },
    });
    const p = (await Productos.listar()).find((x) => x.nombre === 'Perfume Bombshell')!;
    expect([p.existencias, p.valor_inventario_usd_cents]).toEqual([1, 3000]);
    expect(p.lotes!.find((l) => l.cantidad > 0)!.origen).toBe('ENCARGO');
    expect((await Ventas.getById(e))!.pagos).toHaveLength(1);
  });

  it('perdida: no entra nada; y el anticipo, sin decir nada, se devuelve', async () => {
    const e = await encargo();
    const pq = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    await Compras.recibir(pq, g());
    const v = (await Ventas.getById(e))!;
    await Ventas.cambiarEstado(e, 'CANCELADA', g(), { piezas: { [v.lineas[0].id]: { destino: 'PERDIDA' } } });
    expect(await bodega()).toBe(0);
    expect((await Ventas.getById(e))!.pagos).toHaveLength(0);
  });
});

describe('encargos: avisos', () => {
  it('confirmado hace días y sin comprar; llegado hace días y sin entregar', async () => {
    const hace20 = sumarDiasAFecha(HOY, -20);
    const sinComprar = await encargo({ fecha: hace20 });
    const llegado = await encargo({ fecha: hace20 });
    const pq = await Compras.guardar({ fecha: hace20, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(llegado)] }, g());
    await Compras.recibir(pq, g());

    const alertas = (await Panel.cargar(true)).alertas.map((a) => a.id);
    expect(alertas).toContain(`encargo-comprar-${sinComprar}`);
    expect(alertas).toContain(`encargo-entregar-${llegado}`);
    expect(alertas).not.toContain(`encargo-comprar-${llegado}`);
  });
});

describe('encargos: comprado, sin saber en qué paquete viene', () => {
  // Ella compra y lo más probable es que venga en el próximo paquete, pero no
  // lo sabe. "Ya lo compré" deja la pieza esperando paquete.
  const piezaDe = async (e: number) => (await Ventas.getById(e))!.lineas[0];

  it('"ya lo compré" la saca de por comprar; y se puede desmarcar', async () => {
    const e = await encargo();
    const pieza = await piezaDe(e);
    await Ventas.marcarCompradas(e, [pieza.id], true, g());
    const v = (await Ventas.getById(e))!;
    expect(v.lineas[0].comprado_el).toBe(HOY);
    expect(await etapa(e)).toBe('EN_CAMINO');
    expect(v.piezas).toEqual({ total: 1, compradas: 1, llegadas: 0, de_bodega: 0, esperan_paquete: 1, sin_precio: 0, descartadas: 0 });

    await Ventas.marcarCompradas(e, [pieza.id], false, g());
    expect(await etapa(e)).toBe('POR_COMPRAR');
    expect((await piezaDe(e)).comprado_el).toBeUndefined();
  });

  it('comprada, ya no avisa que falta comprarla', async () => {
    const e = await encargo({ fecha: sumarDiasAFecha(HOY, -20) });
    await Ventas.marcarCompradas(e, [(await piezaDe(e)).id], true, g());
    const alertas = (await Panel.cargar(true)).alertas.map((a) => a.id);
    expect(alertas).not.toContain(`encargo-comprar-${e}`);
  });

  it('un cotizado también se puede comprar', async () => {
    const e = await encargo({ pago_inicial: undefined });
    expect((await Ventas.getById(e))!.estado).toBe('COTIZADA');
    await Ventas.marcarCompradas(e, [(await piezaDe(e)).id], true, g());
    expect((await piezaDe(e)).comprado_el).toBe(HOY);
  });

  it('no se entrega mientras espera paquete', async () => {
    const e = await encargo();
    await Ventas.marcarCompradas(e, [(await piezaDe(e)).id], true, g());
    await expect(Ventas.cambiarEstado(e, 'ENTREGADA', g())).rejects.toThrow(/todavía no llegó/);
  });

  it('el paquete que la trae la pone en camino; si ese paquete se elimina, vuelve a esperar', async () => {
    const e = await encargo();
    await Ventas.marcarCompradas(e, [(await piezaDe(e)).id], true, g());
    const pq = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    expect((await piezaDe(e)).compra_codigo).toBe('PQ-0001');
    expect((await Ventas.getById(e))!.piezas!.esperan_paquete).toBe(0);

    await Compras.archivar(pq, g());
    const pieza = await piezaDe(e);
    expect(pieza.compra_id).toBeUndefined();
    expect(pieza.comprado_el).toBe(HOY);
    expect((await Ventas.getById(e))!.piezas!.esperan_paquete).toBe(1);
  });

  it('lo que ya viene en un paquete o sale de la bodega no se marca', async () => {
    const e = await encargo();
    await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    await expect(Ventas.marcarCompradas(e, [(await piezaDe(e)).id], true, g())).rejects.toThrow(/no hay piezas/i);
  });

  it('deshacer lo devuelve a como estaba', async () => {
    const e = await encargo();
    const grupo = g();
    await Ventas.marcarCompradas(e, [(await piezaDe(e)).id], true, grupo);
    await Eventos.deshacerGrupo(grupo);
    expect(await etapa(e)).toBe('POR_COMPRAR');
  });
});

describe('pedidos: anotar sin precio, cotizar después', () => {
  // Una clienta pide algo que ella nunca compró: no sabe cuánto vale ni si lo
  // va a conseguir. Lo anota para acordarse y lo cotiza cuando lo encuentra.
  const pedido = (lineas?: LineaVentaInput[]) =>
    Ventas.crear(
      {
        fecha: HOY,
        tipo: 'ENCARGO',
        anticipo_bp: 5000,
        lineas: lineas ?? [{ descripcion: 'Bolso que vio en Instagram', cantidad: 1, precio_unitario_usd_cents: 0 }],
      },
      g()
    );
  const cotizacion = (id: number, precio: number, extra: Record<string, unknown> = {}) => ({
    id,
    precio_unitario_usd_cents: precio,
    costo_estimado_unitario_usd_cents: 3800,
    precio_tienda_usd_cents: 3000,
    peso_mlb: 1000,
    ...extra,
  });

  it('se anota sin precio: queda por buscar y no cuenta en nada', async () => {
    const e = await pedido();
    const v = (await Ventas.getById(e))!;
    expect([v.estado, v.total_usd_cents, v.saldo_usd_cents]).toEqual(['COTIZADA', 0, 0]);
    expect(await etapa(e)).toBe('POR_BUSCAR');
    const panel = await Panel.cargar(true);
    expect([panel.resumen.por_cobrar_usd_cents, panel.resumen.cotizado_sin_confirmar_usd_cents]).toEqual([0, 0]);
  });

  it('sin precio no se cobra un anticipo', async () => {
    await expect(
      Ventas.crear(
        {
          fecha: HOY,
          tipo: 'ENCARGO',
          lineas: [{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 0 }],
          pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO', monto_cents: 1000 },
        },
        g()
      )
    ).rejects.toThrow(/sin precio/);
  });

  it('cotizarlo le pone precio, costo y anticipo: queda por mandar', async () => {
    const e = await pedido();
    const pieza = (await Ventas.getById(e))!.lineas[0];
    await Ventas.cotizar(e, [cotizacion(pieza.id, 6000, { descripcion: 'Bolso Coach Tabby negro' })], g());
    const v = (await Ventas.getById(e))!;
    expect([v.total_usd_cents, v.saldo_usd_cents, v.anticipo_esperado_usd_cents, v.costo_total_usd_cents]).toEqual([6000, 6000, 3000, 3800]);
    expect(v.lineas[0].descripcion).toBe('Bolso Coach Tabby negro');
    expect(v.lineas[0].precio_tienda_usd_cents).toBe(3000);
    expect(await etapa(e)).toBe('POR_MANDAR');
    expect((await Panel.cargar(true)).resumen.cotizado_sin_confirmar_usd_cents).toBe(6000);
  });

  it('un cotizado se puede corregir; uno confirmado no cambia el precio que ella aceptó', async () => {
    const cotizado = await encargo({ pago_inicial: undefined });
    const p1 = (await Ventas.getById(cotizado))!.lineas[0];
    await Ventas.cotizar(cotizado, [cotizacion(p1.id, 5500)], g());
    expect((await Ventas.getById(cotizado))!.total_usd_cents).toBe(5500);

    const confirmado = await encargo();
    const p2 = (await Ventas.getById(confirmado))!.lineas[0];
    await expect(Ventas.cotizar(confirmado, [cotizacion(p2.id, 5500)], g())).rejects.toThrow(/confirm/);
  });

  it('no se entrega sin precio', async () => {
    const e = await pedido();
    await expect(Ventas.cambiarEstado(e, 'ENTREGADA', g())).rejects.toThrow(/no tiene precio/);
  });

  it('una pieza que ya llegó conserva su costo real al cotizarla', async () => {
    const e = await pedido();
    const pieza = (await Ventas.getById(e))!.lineas[0];
    const pq = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDeEncargo(e)] }, g());
    await Compras.recibir(pq, g());
    await Ventas.cotizar(e, [cotizacion(pieza.id, 6000, { costo_estimado_unitario_usd_cents: 9999 })], g());
    expect((await Ventas.getById(e))!.costo_total_usd_cents).toBe(3000);
  });

  it('no se consiguió: se anula con ese motivo', async () => {
    const e = await pedido();
    await Ventas.cambiarEstado(e, 'CANCELADA', g(), { motivo: 'NO_SE_CONSIGUIO' });
    const v = (await Ventas.getById(e))!;
    expect([v.estado, v.motivo_anulacion]).toEqual(['CANCELADA', 'NO_SE_CONSIGUIO']);
  });

  it('un pedido que lleva días sin cotizar avisa, para no olvidarlo', async () => {
    const viejo = await Ventas.crear(
      { fecha: sumarDiasAFecha(HOY, -20), tipo: 'ENCARGO', lineas: [{ descripcion: 'Perfume raro', cantidad: 1, precio_unitario_usd_cents: 0 }] },
      g()
    );
    const nuevo = await pedido();
    const alertas = await Panel.cargar(true);
    const aviso = alertas.alertas.find((a) => a.id === `encargo-cotizar-${viejo}`);
    expect(aviso?.detalle).toContain('Perfume raro');
    expect(alertas.alertas.map((a) => a.id)).not.toContain(`encargo-cotizar-${nuevo}`);
  });

  it('la lista dice qué pidió, sin tener que abrirlo', async () => {
    const e = await pedido([
      { descripcion: 'Bolso Coach', cantidad: 1, precio_unitario_usd_cents: 0 },
      { descripcion: 'Perfume', cantidad: 2, precio_unitario_usd_cents: 0 },
    ]);
    const v = (await Ventas.listar({ tipo: 'ENCARGO' })).find((x) => x.id === e)!;
    expect(v.que_pidio).toBe('Bolso Coach, 2 Perfume');
  });

  it('deshacer la cotización la deja como estaba', async () => {
    const e = await pedido();
    const pieza = (await Ventas.getById(e))!.lineas[0];
    const grupo = g();
    await Ventas.cotizar(e, [cotizacion(pieza.id, 6000)], grupo);
    await Eventos.deshacerGrupo(grupo);
    expect(await etapa(e)).toBe('POR_BUSCAR');
    expect((await Ventas.getById(e))!.total_usd_cents).toBe(0);
  });
});
