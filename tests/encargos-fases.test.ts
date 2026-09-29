/**
 * El camino de un encargo contra los repositorios reales (Firestore falso):
 * buscarlo, mandar la cotización, aceptar, "no se consiguió" y deshacer.
 *
 * Cada caso es una regla de `docs/PLAN_ENCARGOS_Y_SIN_CONEXION.md`, sección 2.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { reiniciarFirestoreFalso, reiniciarContadores, contadores } from './firestore-fake';
import { doc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../src/main/firebase/client';
import { ProductosRepoFirestore as Productos } from '../src/main/firebase/repositories/productos.repo';
import { ComprasRepoFirestore as Compras } from '../src/main/firebase/repositories/compras.repo';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { PagosRepoFirestore as Pagos } from '../src/main/firebase/repositories/pagos.repo';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { ClientesRepoFirestore as Clientes } from '../src/main/firebase/repositories/clientes.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { EventosRepoFirestore as Eventos } from '../src/main/firebase/repositories/eventos.repo';
import { aceptarEncargo } from '../src/main/firebase/services/encargos.service';
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

  // Deshacer rechaza un grupo si el documento cambió DESPUÉS del evento que
  // lo restaura, y lo decide comparando instantes. El Firestore falso es tan
  // rápido que todo cae en el mismo milisegundo y ese control nunca salta:
  // con esto, cada evento deja pasar un poco de tiempo, como la red de verdad.
  // Sin esto, aceptar antes de pagar pasaba las pruebas y rompía en la app.
  const registrar = Eventos.registrarVarios.bind(Eventos);
  vi.spyOn(Eventos, 'registrarVarios').mockImplementation(async (eventos) => {
    await registrar(eventos);
    await new Promise((r) => setTimeout(r, 3));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Un encargo de dos piezas con precio, cotizado y sin pago. */
const encargo = (lineas?: LineaVentaInput[], extra: Record<string, unknown> = {}) =>
  Ventas.crear(
    {
      fecha: HOY,
      tipo: 'ENCARGO',
      anticipo_bp: 5000,
      lineas: lineas ?? [
        { descripcion: 'Bolso Coach', cantidad: 1, precio_unitario_usd_cents: 6000, costo_estimado_unitario_usd_cents: 3800 },
        { descripcion: 'Perfume raro', cantidad: 1, precio_unitario_usd_cents: 4000, costo_estimado_unitario_usd_cents: 2500 },
      ],
      ...extra,
    },
    g()
  );

const leer = async (id: number) => (await Ventas.getById(id))!;
const etapa = async (id: number) => etapaEncargo(await leer(id));
const pieza = async (id: number, i: number) => (await leer(id)).lineas[i];

/** La pieza `i` del encargo, lista para meterla en un paquete. */
async function lineaDePieza(venta_id: number, i: number, precio = 3000): Promise<LineaCompraInput> {
  const l = await pieza(venta_id, i);
  return {
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    precio_linea_usd_cents: precio,
    exento: true,
    destino: 'ENCARGO',
    venta_id,
    venta_linea_id: l.id,
  };
}

const pagar = (venta_id: number, monto_cents: number, grupo = g()) =>
  Pagos.registrar({ venta_id, fecha: HOY, monto_cents, moneda: 'USD', metodo: 'EFECTIVO' }, grupo);

describe('mandar la cotización', () => {
  it('anotado con todo el precio, queda por mandar', async () => {
    const e = await encargo();
    const v = await leer(e);
    expect(await etapa(e)).toBe('POR_MANDAR');
    expect(v.cotizado_el).toBe(HOY);
  });

  it('mandada, espera respuesta', async () => {
    const e = await encargo();
    await Ventas.marcarEnviada(e, g());
    const v = await leer(e);
    expect(v.cotizacion_enviada_el).toBe(HOY);
    expect(await etapa(e)).toBe('ESPERANDO');
  });

  it('si después cambia un precio, vuelve a estar por mandar', async () => {
    const e = await encargo();
    await Ventas.marcarEnviada(e, g());
    const p = await pieza(e, 0);
    await Ventas.cotizar(e, [{ id: p.id, precio_unitario_usd_cents: 6500 }], g());
    expect(await etapa(e)).toBe('POR_MANDAR');
    // Cambiar sólo la descripción no la deja vieja: el precio es el mismo.
    await Ventas.marcarEnviada(e, g());
    await Ventas.cotizar(e, [{ id: p.id, precio_unitario_usd_cents: 6500, descripcion: 'Bolso Coach Tabby' }], g());
    expect(await etapa(e)).toBe('ESPERANDO');
  });

  it('sin precio no se manda', async () => {
    const e = await encargo([{ descripcion: 'Bolso que vio en Instagram', cantidad: 1, precio_unitario_usd_cents: 0 }]);
    await expect(Ventas.marcarEnviada(e, g())).rejects.toThrow(/Falta cotizar/);
  });

  it('deshacer lo deja por mandar', async () => {
    const e = await encargo();
    const grupo = g();
    await Ventas.marcarEnviada(e, grupo);
    await Eventos.deshacerGrupo(grupo);
    expect(await etapa(e)).toBe('POR_MANDAR');
  });
});

describe('aceptar', () => {
  it('sin anticipo: queda por comprar, y ya cuenta como deuda', async () => {
    const e = await encargo();
    await Ventas.marcarEnviada(e, g());
    await Ventas.aceptar(e, g());
    const v = await leer(e);
    expect([v.estado, v.aceptado_el]).toEqual(['PENDIENTE', HOY]);
    expect(await etapa(e)).toBe('POR_COMPRAR');
    expect((await Panel.cargar(true)).resumen.por_cobrar_usd_cents).toBe(10000);
  });

  it('aceptar dos veces no hace nada la segunda', async () => {
    const e = await encargo();
    await Ventas.aceptar(e, g());
    await expect(Ventas.aceptar(e, g())).resolves.toBeUndefined();
    expect((await leer(e)).estado).toBe('PENDIENTE');
  });

  it('con un pago menor que el anticipo: acepta, y deshacer vuelve todo atrás', async () => {
    const e = await encargo();
    const grupo = g();
    await aceptarEncargo(e, { fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' }, grupo);
    let v = await leer(e);
    expect([v.estado, v.pagado_usd_cents, v.saldo_usd_cents]).toEqual(['PENDIENTE', 1000, 9000]);
    expect(v.pagos.filter((p) => p.activo)).toHaveLength(1);

    const r = await Eventos.deshacerGrupo(grupo);
    expect(r.revertido).toBe(true);
    v = await leer(e);
    expect([v.estado, v.pagado_usd_cents, v.saldo_usd_cents]).toEqual(['COTIZADA', 0, 10000]);
    expect(v.pagos.filter((p) => p.activo)).toHaveLength(0);
  });

  it('un pago que cubre el anticipo acepta; deshacerlo lo vuelve a cotizado', async () => {
    const e = await encargo();
    const grupo = g();
    const r = await pagar(e, 5000, grupo);
    expect(r.anticipo_cubierto).toBe(true);
    expect([(await leer(e)).estado, (await leer(e)).aceptado_el]).toEqual(['PENDIENTE', HOY]);

    await Eventos.deshacerGrupo(grupo);
    const v = await leer(e);
    // Hasta la 2.15 el pago se borraba y el encargo quedaba confirmado.
    expect([v.estado, v.pagado_usd_cents, v.aceptado_el]).toEqual(['COTIZADA', 0, undefined]);
  });

  it('con anticipo de 0%, cotizar ya no lo confirma; un pago sí', async () => {
    const e = await encargo(
      [{ descripcion: 'Perfume', cantidad: 1, precio_unitario_usd_cents: 0 }],
      { anticipo_bp: 0 }
    );
    const p = await pieza(e, 0);
    await Ventas.cotizar(e, [{ id: p.id, precio_unitario_usd_cents: 5000 }], g());
    expect((await leer(e)).estado).toBe('COTIZADA');
    await pagar(e, 100);
    expect((await leer(e)).estado).toBe('PENDIENTE');
  });

  it('un encargo que nace pagado queda aceptado con la fecha del encargo', async () => {
    // Así el aviso "aceptó hace N días y no está comprado" cuenta desde ahí.
    const hace20 = sumarDiasAFecha(HOY, -20);
    const e = await encargo(undefined, {
      fecha: hace20,
      pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO', monto_cents: 5000 },
    });
    expect([(await leer(e)).estado, (await leer(e)).aceptado_el]).toEqual(['PENDIENTE', hace20]);
  });

  it('sin precio no se acepta', async () => {
    const e = await encargo([{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 0 }]);
    await expect(Ventas.aceptar(e, g())).rejects.toThrow(/Falta cotizar/);
  });

  it('deshacer aceptar lo deja esperando', async () => {
    const e = await encargo();
    await Ventas.marcarEnviada(e, g());
    const grupo = g();
    await Ventas.aceptar(e, grupo);
    await Eventos.deshacerGrupo(grupo);
    expect(await etapa(e)).toBe('ESPERANDO');
  });
});

describe('no se consiguió', () => {
  it('sale del total, el costo, el saldo y el anticipo; lo demás sigue', async () => {
    const e = await encargo();
    const p = await pieza(e, 1);
    await Ventas.descartarPiezas(e, [p.id], true, g());
    const v = await leer(e);
    expect([v.total_usd_cents, v.costo_total_usd_cents, v.saldo_usd_cents, v.anticipo_esperado_usd_cents]).toEqual([
      6000, 3800, 6000, 3000,
    ]);
    expect(v.lineas[1].descartada_el).toBe(HOY);
    expect(v.piezas).toMatchObject({ total: 2, descartadas: 1 });
    expect(await etapa(e)).toBe('POR_MANDAR');
  });

  it('desde cotizar: una pieza sin precio se descarta y la otra se cotiza', async () => {
    const e = await encargo([
      { descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 0 },
      { descripcion: 'Perfume raro', cantidad: 1, precio_unitario_usd_cents: 0 },
    ]);
    const [a, b] = (await leer(e)).lineas;
    await Ventas.cotizar(
      e,
      [
        { id: a.id, precio_unitario_usd_cents: 6000, costo_estimado_unitario_usd_cents: 3800 },
        { id: b.id, precio_unitario_usd_cents: 0, descartada: true },
      ],
      g()
    );
    const v = await leer(e);
    expect([v.total_usd_cents, v.piezas?.descartadas, v.piezas?.sin_precio]).toEqual([6000, 1, 0]);
    expect(await etapa(e)).toBe('POR_MANDAR');
  });

  it('volver a buscar le devuelve su precio al total', async () => {
    const e = await encargo();
    const p = await pieza(e, 1);
    await Ventas.descartarPiezas(e, [p.id], true, g());
    await Ventas.descartarPiezas(e, [p.id], false, g());
    const v = await leer(e);
    expect([v.total_usd_cents, v.costo_total_usd_cents, v.lineas[1].descartada_el]).toEqual([10000, 6300, undefined]);
  });

  it('una pieza comprada no se descarta', async () => {
    const e = await encargo();
    const p = await pieza(e, 0);
    await Ventas.marcarCompradas(e, [p.id], true, g());
    await expect(Ventas.descartarPiezas(e, [p.id], true, g())).rejects.toThrow(/ya se compró/);
  });

  it('si lo pagado queda por encima del total nuevo, se pide corregir el pago', async () => {
    const e = await encargo();
    await pagar(e, 7000);
    const p = await pieza(e, 0);
    await expect(Ventas.descartarPiezas(e, [p.id], true, g())).rejects.toThrow(/Corregí el pago/);
  });

  it('descartar en una cotización ya mandada la deja por mandar; en una aceptada, no', async () => {
    const e = await encargo();
    await Ventas.marcarEnviada(e, g());
    await Ventas.descartarPiezas(e, [(await pieza(e, 1)).id], true, g());
    expect(await etapa(e)).toBe('POR_MANDAR');

    const aceptado = await encargo();
    await Ventas.aceptar(aceptado, g());
    await Ventas.descartarPiezas(aceptado, [(await pieza(aceptado, 1)).id], true, g());
    expect(await etapa(aceptado)).toBe('POR_COMPRAR');
  });

  it('al entregar, una pieza descartada no pide precio ni stock', async () => {
    // La descartada apunta a un producto sin existencias: antes habría
    // bloqueado la entrega por falta de unidades en la bodega.
    const prod = await Productos.crear({ nombre: 'Crema', modo_precio: 'MARGEN', margen_bp: 5000 }, g());
    const e = await encargo([
      { descripcion: 'Bolso Coach', cantidad: 1, precio_unitario_usd_cents: 6000 },
      { producto_id: prod, descripcion: 'Crema', cantidad: 1, precio_unitario_usd_cents: 2000 },
    ]);
    await Ventas.aceptar(e, g());
    await Ventas.descartarPiezas(e, [(await pieza(e, 1)).id], true, g());
    const pq = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [await lineaDePieza(e, 0)] }, g());
    await Compras.recibir(pq, g());
    expect(await etapa(e)).toBe('POR_ENTREGAR');
    await Ventas.cambiarEstado(e, 'ENTREGADA', g());
    expect((await leer(e)).estado).toBe('ENTREGADA');
  });

  it('deshacer lo devuelve a como estaba', async () => {
    const e = await encargo();
    const grupo = g();
    await Ventas.descartarPiezas(e, [(await pieza(e, 1)).id], true, grupo);
    await Eventos.deshacerGrupo(grupo);
    const v = await leer(e);
    expect([v.total_usd_cents, v.piezas?.descartadas ?? 0]).toEqual([10000, 0]);
  });
});

describe('lo que cuesta cada paso', () => {
  // Firestore cobra por documento leído. Mandar es un paso de todos los días:
  // lee sólo el encargo. Aceptar y descartar cambian la deuda de la clienta,
  // así que además leen sus ventas para refrescar sus totales: lo mismo que
  // ya cuesta cotizar.
  it('mandar lee el encargo; aceptar y descartar, el encargo y las ventas de la clienta', async () => {
    const cliente = await Clientes.guardar({ nombre: 'Ana' }, g());
    for (let i = 0; i < 3; i++) {
      await Ventas.crear(
        { cliente_id: cliente, fecha: HOY, tipo: 'INVENTARIO', lineas: [{ descripcion: 'Labial', cantidad: 1, precio_unitario_usd_cents: 900 }] },
        g()
      );
    }
    const e = await encargo(undefined, { cliente_id: cliente });
    const segunda = (await pieza(e, 1)).id;
    const lecturas = async (fn: () => Promise<unknown>) => {
      reiniciarContadores();
      await fn();
      return contadores().lecturas;
    };
    const ventasDeAna = 4;

    expect(await lecturas(() => Ventas.marcarEnviada(e, g()))).toBe(1);
    expect(await lecturas(() => Ventas.descartarPiezas(e, [segunda], true, g()))).toBe(1 + ventasDeAna);
    expect(await lecturas(() => Ventas.aceptar(e, g()))).toBe(1 + ventasDeAna);
    // Ya aceptado: lee el encargo, ve que no hay nada que hacer, y no escribe.
    reiniciarContadores();
    await Ventas.aceptar(e, g());
    expect(contadores()).toMatchObject({ lecturas: 1, escrituras: 0 });
  });
});

describe('los avisos del camino', () => {
  // Con los días de aviso de siempre: 10. Mandar y aceptar escriben la fecha
  // de hoy, así que para que algo sea "de hace días" se corre la fecha a mano.
  const correrFecha = (id: number, datos: Record<string, unknown>) =>
    setDoc(doc(getFirestoreDb(), 'ventas', String(id)), datos, { merge: true });
  const avisos = async () => (await Panel.cargar(true)).alertas;

  it('una cotización mandada hace días, sin respuesta, avisa; una de hace poco, no', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const vieja = await encargo(undefined, { cliente_id: ana });
    await Ventas.marcarEnviada(vieja, g());
    await correrFecha(vieja, { cotizacion_enviada_el: sumarDiasAFecha(HOY, -12) });
    const nueva = await encargo();
    await Ventas.marcarEnviada(nueva, g());

    const lista = await avisos();
    const aviso = lista.find((a) => a.id === `encargo-respuesta-${vieja}`);
    expect(aviso?.titulo).toBe('Le mandaste la cotización a Ana hace más de 10 días y no respondió');
    expect(aviso?.destino).toEqual({ vista: 'encargos', id: vieja });
    expect(lista.map((a) => a.id)).not.toContain(`encargo-respuesta-${nueva}`);
  });

  it('aceptado y sin comprar avisa desde que aceptó, no desde que lo pidió', async () => {
    const e = await encargo(undefined, { fecha: sumarDiasAFecha(HOY, -30) });
    await Ventas.aceptar(e, g());
    expect((await avisos()).map((a) => a.id)).not.toContain(`encargo-comprar-${e}`);

    await correrFecha(e, { aceptado_el: sumarDiasAFecha(HOY, -12) });
    const aviso = (await avisos()).find((a) => a.id === `encargo-comprar-${e}`);
    expect(aviso?.destino).toEqual({ vista: 'encargos', id: e });
  });

  it('un pedido sin cotizar lleva a la pantalla de encargos', async () => {
    // Un pedido no debe nada: no está en "por cobrar", y antes su aviso
    // terminaba abriéndose en Ventas.
    const e = await encargo([{ descripcion: 'Perfume raro', cantidad: 1, precio_unitario_usd_cents: 0 }], {
      fecha: sumarDiasAFecha(HOY, -20),
    });
    const aviso = (await avisos()).find((a) => a.id === `encargo-cotizar-${e}`);
    expect(aviso?.destino).toEqual({ vista: 'encargos', id: e });
  });
});
