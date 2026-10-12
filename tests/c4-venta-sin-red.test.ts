/**
 * Fase C4 · T4: vender sin señal.
 *
 * Lo que se vendió sin señal todavía no está en Firestore, pero ya salió de
 * la tienda: el stock que se ve lo descuenta hasta que la venta sube y los
 * datos la traen. Y el recibo de una venta sin número sale sin esa línea.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ParametrosSistema, VentaCompleta } from '../src/shared/types';
import { mensajeWhatsappDocumento } from '../src/core/documentos/mensajes';
import { descontarCola, reflejar, type EnCola } from '../mobile/src/lib/cola';
import { conEspera, esErrorPasajero } from '../mobile/src/lib/subir-cola';

function producto(id: number, existencias: number[]) {
  return {
    id,
    nombre: `Producto ${id}`,
    existencias: existencias.reduce((s, n) => s + n, 0),
    variantes: existencias.map((n, i) => ({ id: id * 10 + i + 1, existencias: n })),
  };
}

function enCola(
  id: string,
  lineas: { producto_id: number; variante_id: number; cantidad: number }[],
  extra: Partial<EnCola> = {},
  tipo: 'VENTA' | 'ENCARGO' = 'VENTA'
): EnCola {
  return {
    operacion_id: id,
    grupo: `g-${id}`,
    creada_en: '2026-10-11T18:00:00.000Z',
    operacion: {
      tipo,
      input: {
        fecha: '2026-10-11',
        tipo: tipo === 'VENTA' ? 'INVENTARIO' : 'ENCARGO',
        lineas: lineas.map((l) => ({ ...l, precio_unitario_usd_cents: 1000 })),
      },
    },
    estado: 'PENDIENTE',
    intentos: 0,
    resumen: { titulo: 'Venta', detalle: id, monto_usd_cents: 1000 },
    ...extra,
  };
}

describe('El stock que se ve descuenta lo vendido sin señal', () => {
  const productos = [producto(1, [5, 2]), producto(2, [3])];

  it('una venta pendiente aparta sus unidades, del producto y de su tono', () => {
    const vistos = descontarCola(productos, [enCola('a', [{ producto_id: 1, variante_id: 11, cantidad: 2 }])]);
    expect(vistos[0].existencias).toBe(5);
    expect(vistos[0].variantes.map((v) => v.existencias)).toEqual([3, 2]);
    expect(vistos[1]).toBe(productos[1]);
  });

  it('cuentan la que está subiendo, la que hay que revisar y la subida que los datos todavía no traen', () => {
    const cola = [
      enCola('a', [{ producto_id: 2, variante_id: 21, cantidad: 1 }], { estado: 'SUBIENDO' }),
      enCola('b', [{ producto_id: 2, variante_id: 21, cantidad: 1 }], { estado: 'REVISAR', motivo: 'Sin unidades' }),
      enCola('c', [{ producto_id: 2, variante_id: 21, cantidad: 1 }], { estado: 'SUBIDA' }),
      enCola('d', [{ producto_id: 2, variante_id: 21, cantidad: 1 }], { estado: 'SUBIDA', reflejada: true }),
    ];
    expect(descontarCola(productos, cola)[1].existencias).toBe(0);
  });

  it('un encargo no saca de la bodega, y nada queda por debajo de cero', () => {
    const cola = [
      enCola('e', [{ producto_id: 1, variante_id: 11, cantidad: 4 }], {}, 'ENCARGO'),
      enCola('f', [{ producto_id: 2, variante_id: 21, cantidad: 9 }]),
    ];
    const vistos = descontarCola(productos, cola);
    expect(vistos[0]).toBe(productos[0]);
    expect(vistos[1].existencias).toBe(0);
    expect(vistos[1].variantes[0].existencias).toBe(0);
  });

  it('sin nada en la cola devuelve la misma lista', () => {
    expect(descontarCola(productos, [])).toBe(productos);
  });
});

describe('El recibo de una venta sin número todavía', () => {
  const venta = {
    id: 0,
    codigo: '',
    tipo: 'INVENTARIO',
    estado: 'ENTREGADA',
    tasa_cambio_cents: 3700,
    total_usd_cents: 2400,
    saldo_usd_cents: 0,
    lineas: [],
  } as unknown as VentaCompleta;
  const parametros = { tasa_cambio_cents: 3700 } as unknown as ParametrosSistema;

  it('sale sin la línea de la factura y con lo demás', () => {
    const texto = mensajeWhatsappDocumento(venta, parametros);
    expect(texto).not.toContain('Factura');
    expect(texto).toContain('$24.00');
    expect(texto).toContain('Pagado en su totalidad');
  });

  it('con número, la línea está', () => {
    expect(mensajeWhatsappDocumento({ ...venta, codigo: 'V-0031' }, parametros)).toContain('Factura: V-0031');
  });
});

describe('Lo subido deja de apartar stock cuando los datos lo traen', () => {
  it('reflejar marca sólo las subidas', () => {
    const cola = [
      enCola('a', [{ producto_id: 1, variante_id: 11, cantidad: 1 }], { estado: 'SUBIDA' }),
      enCola('b', [{ producto_id: 1, variante_id: 11, cantidad: 1 }]),
    ];
    const despues = reflejar(cola);
    expect(despues.map((o) => o.reflejada ?? false)).toEqual([true, false]);
    expect(despues[1]).toBe(cola[1]);
    expect(reflejar(despues)).toBe(despues);
  });
});

describe('El primer intento con señal tiene un tope', () => {
  afterEach(() => vi.useRealTimers());

  it('si responde a tiempo, devuelve lo que respondió', async () => {
    await expect(conEspera(Promise.resolve(31), 8000)).resolves.toBe(31);
  });

  it('si la señal no alcanza, falla como pasajero y la venta va a la cola', async () => {
    vi.useFakeTimers();
    const nunca = new Promise<number>(() => undefined);
    const intento = conEspera(nunca, 8000);
    const resultado = expect(intento).rejects.toSatisfy(esErrorPasajero);
    await vi.advanceTimersByTimeAsync(8000);
    await resultado;
  });

  it('un error del negocio no es pasajero; uno de red sí', () => {
    expect(esErrorPasajero(new Error("No hay suficientes unidades de 'Labial'."))).toBe(false);
    expect(esErrorPasajero(Object.assign(new Error('offline'), { code: 'unavailable' }))).toBe(true);
    expect(esErrorPasajero(Object.assign(new Error('Server responded with status 0'), { code: 'unknown' }))).toBe(true);
    expect(esErrorPasajero(Object.assign(new Error('x'), { code: 'permission-denied' }))).toBe(false);
  });
});
