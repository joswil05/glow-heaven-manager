/**
 * Fase 0 de la auditoría de interfaz del 29 de septiembre
 * (`docs/AUDITORIA_UX_2026-09-29.md`): lo que cambiaba datos o plata sin que
 * nadie lo decidiera. Cada prueba reproduce un hallazgo y lleva su ID.
 *
 * Contra los repositorios reales y el Firestore falso, como el resto de las
 * suites de negocio.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { VentaCompleta, ParametrosSistema } from '../src/shared/types';
import type { LineaCompraInput } from '../src/shared/ipc-contracts';
import { reiniciarFirestoreFalso } from './firestore-fake';
import { aplicarLote, leerDoc } from '../src/main/firebase/client';
import { ParametrosRepoFirestore as Parametros } from '../src/main/firebase/repositories/parametros.repo';
import { ProductosRepoFirestore as Productos } from '../src/main/firebase/repositories/productos.repo';
import { VentasRepoFirestore as Ventas } from '../src/main/firebase/repositories/ventas.repo';
import { PagosRepoFirestore as Pagos } from '../src/main/firebase/repositories/pagos.repo';
import { PanelRepoFirestore as Panel } from '../src/main/firebase/repositories/panel.repo';
import { ClientesRepoFirestore as Clientes } from '../src/main/firebase/repositories/clientes.repo';
import { ComprasRepoFirestore as Compras } from '../src/main/firebase/repositories/compras.repo';
import { generarHtmlFactura, generarHtmlProforma } from '../src/core/documentos/plantillas';
import { mensajeWhatsappDocumento } from '../src/core/documentos/mensajes';
import { preciosParaRevisar } from '../src/core/revisar-precios';
import { codigoDeVenta } from '../src/core/codigos';
import { formatearMoneda, usdCentavosACorCentavos } from '../src/core/moneda';
import { hoyISO } from '../src/core/fechas';

const g = () => randomUUID();
const HOY = hoyISO();

beforeEach(async () => {
  reiniciarFirestoreFalso();
  Parametros.invalidarCache();
  Panel.invalidarCache();
  await Parametros.getParametros();
  await Parametros.getCategorias();
});

const precio = async (id: number) => (await Productos.getById(id))!.precio_venta_usd_cents;
/** El documento tal cual, aunque esté descatalogado (`getById` no los devuelve). */
const existe = async (id: number) => (await leerDoc('productos', id)) !== null;

const conStock = (nombre: string, costo = 2000) =>
  Productos.crear({ nombre, modo_precio: 'MARGEN', stock_inicial: { cantidad: 3, costo_unitario_usd_cents: costo } }, g());

// ---------------------------------------------------------------------------

describe('DOC-01 · los documentos usan la tasa de la venta, no la de hoy', () => {
  const venta = {
    id: 7,
    codigo: 'V-0007',
    fecha: '2026-06-14',
    tipo: 'INVENTARIO',
    estado: 'ENTREGADA',
    tasa_cambio_cents: 3600,
    subtotal_usd_cents: 10000,
    descuento_usd_cents: 0,
    total_usd_cents: 10000,
    costo_total_usd_cents: 5000,
    ganancia_usd_cents: 5000,
    pagado_usd_cents: 4000,
    saldo_usd_cents: 6000,
    anticipo_esperado_usd_cents: 5000,
    anticipo_bp: 5000,
    cliente_nombre: 'Ana',
    lineas: [
      {
        id: 1,
        venta_id: 7,
        descripcion: 'Perfume',
        cantidad: 1,
        precio_unitario_usd_cents: 10000,
        costo_unitario_usd_cents: 5000,
        subtotal_usd_cents: 10000,
        costo_total_usd_cents: 5000,
        es_paquete: false,
        orden: 1,
      },
    ],
    pagos: [],
    cuotas: [],
  } as unknown as VentaCompleta;
  // La tasa cambió desde la venta: hoy es 37.00, la venta se hizo a 36.00.
  const hoy = { nombre_negocio: 'Glow Heaven', tasa_cambio_cents: 3700, cuentas_bancarias: [] } as unknown as ParametrosSistema;
  const totalCs = formatearMoneda(360000, 'COR');

  it('la factura reimpresa dice el mismo total en córdobas que el día de la venta', () => {
    const html = generarHtmlFactura(venta, hoy);
    expect(html).toContain('T.C. 36.00');
    expect(html).toContain(totalCs);
    expect(html).not.toContain('T.C. 37.00');
  });

  it('la proforma también', () => {
    const html = generarHtmlProforma({ ...venta, tipo: 'ENCARGO', codigo: 'E-0007' } as VentaCompleta, hoy);
    expect(html).toContain('T.C. 36.00');
    expect(html).toContain(totalCs);
  });

  it('y el mensaje de WhatsApp que acompaña al documento', () => {
    expect(mensajeWhatsappDocumento(venta, hoy)).toContain(totalCs);
  });
});

// ---------------------------------------------------------------------------

describe('CFG-01 · guardar la configuración no cambia precios en silencio', () => {
  it('cambiar un mensaje no toca ningún precio, aunque se mande el margen de siempre', async () => {
    const id = await conStock('Perfume');
    // Un precio que no coincide con la fórmula: es justo el que "Revisar
    // precios" deja decidir a ella.
    await aplicarLote([{ coleccion: 'productos', id, merge: true, datos: { precio_venta_usd_cents: 3500 } }]);
    const p = await Parametros.getParametros();

    // Lo que mandaba Configuración al guardar un mensaje: todos los campos,
    // el margen y el redondeo incluidos, aunque no hubieran cambiado.
    await Parametros.actualizar(
      {
        plantilla_cobro_whatsapp: 'Hola {cliente}',
        margen_defecto_bp: p.margen_defecto_bp,
        paso_redondeo_usd_cents: p.paso_redondeo_usd_cents,
      },
      g()
    );
    await Parametros.actualizar({ tasa_cambio_cents: 3700, nombre_negocio: 'Glow' }, g());

    expect(await precio(id)).toBe(3500);
  });

  it('cambiar el margen tampoco: los precios quedan para revisar y sólo cambian los elegidos', async () => {
    const perfume = await conStock('Perfume', 2000);
    const bolso = await conStock('Bolso', 2000);
    const antes = await precio(perfume);

    await Parametros.actualizar({ margen_defecto_bp: 10000 }, g());

    expect(await precio(perfume)).toBe(antes);
    expect(await precio(bolso)).toBe(antes);

    const lista = preciosParaRevisar(
      await Productos.listar(),
      await Parametros.getCategorias(),
      await Parametros.getParametros()
    );
    expect(lista.map((x) => x.producto.id).sort()).toEqual([perfume, bolso].sort());
    expect(lista.find((x) => x.producto.id === perfume)!.calculado).toBe(4000);

    await Productos.aplicarPrecios([perfume], g());
    expect(await precio(perfume)).toBe(4000);
    expect(await precio(bolso)).toBe(antes);
  });

  it('cambiar el margen de una categoría tampoco', async () => {
    const [cat] = await Parametros.getCategorias();
    const id = await Productos.crear(
      { nombre: 'Blusa', modo_precio: 'MARGEN', categoria_id: cat.id, stock_inicial: { cantidad: 2, costo_unitario_usd_cents: 2000 } },
      g()
    );
    const antes = await precio(id);

    await Parametros.guardarCategoria({ id: cat.id, nombre: cat.nombre, margen_defecto_bp: 20000 }, g());

    expect(await precio(id)).toBe(antes);
    Parametros.invalidarCache();
    const lista = preciosParaRevisar(await Productos.listar(), await Parametros.getCategorias(), await Parametros.getParametros());
    expect(lista.find((x) => x.producto.id === id)!.calculado).toBe(6000);
  });
});

// ---------------------------------------------------------------------------

describe('INV-01 · no se elimina un producto con historia', () => {
  const linea = (producto_id: number, cantidad: number): LineaCompraInput => ({
    producto_id,
    descripcion: 'Labial',
    cantidad,
    precio_linea_usd_cents: cantidad * 500,
    destino: 'INVENTARIO',
  });

  it('uno que se vendió no se puede eliminar, y sigue ahí', async () => {
    const id = await conStock('Labial');
    await Ventas.crear(
      { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: id, cantidad: 1, precio_unitario_usd_cents: 2500 }] },
      g()
    );
    await Productos.archivar(id, g());

    await expect(Productos.eliminarDefinitivo(id, g())).rejects.toThrow(/vendi/i);
    expect(await existe(id)).toBe(true);
  });

  it('uno que vino en un paquete tampoco', async () => {
    const id = await Productos.crear({ nombre: 'Labial', modo_precio: 'MARGEN' }, g());
    const paquete = await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [linea(id, 2)] }, g());
    await Compras.recibir(paquete, g());
    await Productos.archivar(id, g());

    await expect(Productos.eliminarDefinitivo(id, g())).rejects.toThrow(/paquete/i);
    expect(await existe(id)).toBe(true);
  });

  it('uno que está en un paquete sin cerrar tampoco', async () => {
    const id = await Productos.crear({ nombre: 'Labial', modo_precio: 'MARGEN' }, g());
    await Compras.guardar({ fecha: HOY, envio_total_usd_cents: 0, lineas: [linea(id, 2)] }, g());
    await Productos.archivar(id, g());

    await expect(Productos.eliminarDefinitivo(id, g())).rejects.toThrow(/paquete/i);
  });

  it('uno sin ventas ni paquetes sí se elimina', async () => {
    const id = await Productos.crear({ nombre: 'Error de tipeo', modo_precio: 'MARGEN' }, g());
    await Productos.archivar(id, g());
    expect(await existe(id)).toBe(true);
    await Productos.eliminarDefinitivo(id, g());
    expect(await existe(id)).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('CVE-02 · el código de venta es el mismo en las dos apps', () => {
  it('el recibo del celular arma el mismo código que guarda el repositorio', async () => {
    const venta = await Ventas.crear(
      { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ descripcion: 'Algo', cantidad: 1, precio_unitario_usd_cents: 1000 }] },
      g()
    );
    expect(codigoDeVenta(venta)).toBe((await Ventas.getById(venta))!.codigo);
    expect(codigoDeVenta(24)).toBe('V-0024');
    expect(codigoDeVenta(24, 'ENCARGO')).toBe('E-0024');
  });
});

// ---------------------------------------------------------------------------

describe('CCO-01 · "Pagar todo" en córdobas con la tasa de la venta', () => {
  it('cada fila de Cobros trae la tasa de su venta, y pagar todo con ella deja la venta saldada', async () => {
    const ana = await Clientes.guardar({ nombre: 'Ana' }, g());
    const venta = await Ventas.crear(
      { cliente_id: ana, fecha: HOY, tipo: 'INVENTARIO', lineas: [{ descripcion: 'Bolso', cantidad: 1, precio_unitario_usd_cents: 4999 }] },
      g()
    );
    const tasaDeLaVenta = (await Ventas.getById(venta))!.tasa_cambio_cents;
    // La tasa de hoy ya es otra.
    await Parametros.actualizar({ tasa_cambio_cents: tasaDeLaVenta + 150 }, g());
    Panel.invalidarCache();

    const fila = (await Panel.cargar(true)).por_cobrar.find((f) => f.venta_id === venta)!;
    expect(fila.tasa_cambio_cents).toBe(tasaDeLaVenta);

    await Pagos.registrar(
      {
        venta_id: venta,
        fecha: HOY,
        monto_cents: usdCentavosACorCentavos(fila.saldo_usd_cents, fila.tasa_cambio_cents!),
        moneda: 'COR',
        metodo: 'EFECTIVO',
      },
      g()
    );
    const despues = (await Ventas.getById(venta))!;
    expect(despues.saldo_usd_cents).toBe(0);
    expect(despues.pagado_usd_cents).toBe(4999);
  });
});
