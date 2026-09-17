import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  reiniciarFirestoreFalso,
  reiniciarContadores,
  contadores,
  volcar,
} from './firestore-fake';
import { ProductosRepoFirestore as ProductosRepo } from '../src/main/firebase/repositories/productos.repo';
import { ComprasRepoFirestore as ComprasRepo } from '../src/main/firebase/repositories/compras.repo';
import { VentasRepoFirestore as VentasRepo } from '../src/main/firebase/repositories/ventas.repo';
import { PagosRepoFirestore as PagosRepo } from '../src/main/firebase/repositories/pagos.repo';
import { ClientesRepoFirestore as ClientesRepo } from '../src/main/firebase/repositories/clientes.repo';
import { ParametrosRepoFirestore as ParametrosRepo } from '../src/main/firebase/repositories/parametros.repo';
import { PanelRepoFirestore as PanelRepo } from '../src/main/firebase/repositories/panel.repo';
import { EventosRepoFirestore as EventosRepo } from '../src/main/firebase/repositories/eventos.repo';
import { hoyISO } from '../src/core/fechas';

const g = () => randomUUID();
const HOY = hoyISO();

beforeEach(async () => {
  reiniciarFirestoreFalso();
  ParametrosRepo.invalidarCache();
  PanelRepo.invalidarCache();
  // Siembra los parámetros y categorías, igual que hace el arranque real.
  await ParametrosRepo.getParametros();
  await ParametrosRepo.getCategorias();
});

// ---------------------------------------------------------------------------

describe('el paquete real de $77', () => {
  async function armarPaquete() {
    const maria = await ClientesRepo.guardar({ nombre: 'María', telefono: '8888-0001' }, g());
    const jose = await ClientesRepo.guardar({ nombre: 'José', telefono: '8888-0002' }, g());

    const encargoMaria = await VentasRepo.crear(
      {
        cliente_id: maria,
        fecha: HOY,
        tipo: 'ENCARGO',
        lineas: [{ descripcion: 'Bolso Tommy', cantidad: 1, precio_unitario_usd_cents: 9000 }],
      },
      g()
    );
    const encargoJose = await VentasRepo.crear(
      {
        cliente_id: jose,
        fecha: HOY,
        tipo: 'ENCARGO',
        lineas: [{ descripcion: 'Termo Owala', cantidad: 1, precio_unitario_usd_cents: 5500 }],
      },
      g()
    );

    const compraId = await ComprasRepo.guardar(
      {
        fecha: HOY,
        envio_total_usd_cents: 7700,
        lineas: [
          {
            descripcion: 'Bolso Tommy',
            cantidad: 1,
            precio_linea_usd_cents: 4500,
            peso_linea_mlb: 2000,
            destino: 'ENCARGO',
            venta_id: encargoMaria,
          },
          {
            descripcion: 'Termo Owala',
            cantidad: 1,
            precio_linea_usd_cents: 2800,
            peso_linea_mlb: 1500,
            destino: 'ENCARGO',
            venta_id: encargoJose,
          },
          {
            descripcion: 'Boxers Calvin Klein',
            cantidad: 6,
            precio_linea_usd_cents: 3000,
            peso_linea_mlb: 1500,
            destino: 'INVENTARIO',
          },
          {
            descripcion: 'Camisas Polo',
            cantidad: 3,
            precio_linea_usd_cents: 5400,
            peso_linea_mlb: 3000,
            destino: 'INVENTARIO',
          },
          {
            descripcion: 'Sandalias',
            cantidad: 2,
            precio_linea_usd_cents: 2200,
            peso_linea_mlb: 3000,
            destino: 'INVENTARIO',
          },
        ],
      },
      g()
    );

    return { compraId, encargoMaria, encargoJose, maria, jose };
  }

  it('reparte el envío completo sin perder ni inventar centavos', async () => {
    const { compraId } = await armarPaquete();
    const compra = (await ComprasRepo.getById(compraId))!;

    expect(compra.peso_total_mlb).toBe(11000);
    const sumaEnvio = compra.lineas.reduce((a, l) => a + l.envio_asignado_usd_cents, 0);
    expect(sumaEnvio).toBe(7700);
  });

  it('reparte por peso, no por valor', async () => {
    const { compraId } = await armarPaquete();
    const compra = (await ComprasRepo.getById(compraId))!;

    const bolso = compra.lineas.find((l) => l.descripcion === 'Bolso Tommy')!;
    const boxers = compra.lineas.find((l) => l.descripcion === 'Boxers Calvin Klein')!;

    expect(bolso.envio_asignado_usd_cents).toBe(1400); // 2.0 lb x $7
    expect(boxers.envio_asignado_usd_cents).toBe(1050); // 1.5 lb x $7
  });

  it('el producto de encargo carga su parte del envío igual que el resto', async () => {
    const { compraId } = await armarPaquete();
    const compra = (await ComprasRepo.getById(compraId))!;
    const termo = compra.lineas.find((l) => l.descripcion === 'Termo Owala')!;
    const boxers = compra.lineas.find((l) => l.descripcion === 'Boxers Calvin Klein')!;
    expect(termo.envio_asignado_usd_cents).toBe(boxers.envio_asignado_usd_cents);
  });

  it('el total del paquete es lo que de verdad se pagó', async () => {
    const { compraId } = await armarPaquete();
    const compra = (await ComprasRepo.getById(compraId))!;

    expect(compra.subtotal_productos_usd_cents).toBe(17900);
    expect(compra.tax_total_usd_cents).toBe(1253);
    expect(compra.total_usd_cents).toBe(17900 + 1253 + 7700);
  });

  it('al recibirlo, solo lo de inventario entra al stock', async () => {
    const { compraId } = await armarPaquete();
    const r = await ComprasRepo.recibir(compraId, g());
    expect(r.productos_afectados).toBe(3);

    const inventario = await ProductosRepo.listar();
    expect(inventario.map((p) => p.nombre).sort()).toEqual([
      'Boxers Calvin Klein',
      'Camisas Polo',
      'Sandalias',
    ]);
  });

  it('el paquete de 6 boxers entra como 6 unidades con su costo repartido', async () => {
    const { compraId } = await armarPaquete();
    await ComprasRepo.recibir(compraId, g());

    const inventario = await ProductosRepo.listar();
    const boxers = inventario.find((p) => p.nombre === 'Boxers Calvin Klein')!;
    expect(boxers.existencias).toBe(6);
    expect(boxers.valor_inventario_usd_cents).toBe(4260);
    expect(boxers.costo_unitario_usd_cents).toBe(710);
  });

  it('el encargo congela su costo real cuando llega el paquete', async () => {
    const { compraId, encargoMaria } = await armarPaquete();
    await ComprasRepo.recibir(compraId, g());

    const encargo = (await VentasRepo.getById(encargoMaria))!;
    // Bolso: $45.00 + $3.15 tax + $14.00 envío = $62.15
    expect(encargo.costo_total_usd_cents).toBe(6215);
    expect(encargo.ganancia_usd_cents).toBe(9000 - 6215);
  });

  it('un paquete recibido no se puede editar ni recibir dos veces', async () => {
    const { compraId } = await armarPaquete();
    await ComprasRepo.recibir(compraId, g());

    await expect(ComprasRepo.recibir(compraId, g())).rejects.toThrow(/ya estaba recibido/i);
    await expect(
      ComprasRepo.guardar({ id: compraId, fecha: HOY, envio_total_usd_cents: 1, lineas: [] }, g())
    ).rejects.toThrow(/no se puede editar/i);
  });
});

// ---------------------------------------------------------------------------

describe('precio de venta con margen sobre el costo real', () => {
  it('el precio cubre el margen pedido y termina en número redondo', async () => {
    const id = await ProductosRepo.crear(
      {
        nombre: 'Termo',
        margen_bp: 4000,
        stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 4260 },
      },
      g()
    );

    const p = (await ProductosRepo.getById(id))!;
    expect(p.costo_unitario_usd_cents).toBe(4260);
    expect(p.precio_venta_usd_cents).toBe(6000);
    expect(p.precio_venta_usd_cents % 100).toBe(0);
    expect(p.ganancia_unitaria_usd_cents).toBe(1740);
  });

  it('cambiar el margen global recalcula todo el inventario', async () => {
    const id = await ProductosRepo.crear(
      { nombre: 'Perfume', stock_inicial: { cantidad: 2, costo_unitario_usd_cents: 2000 } },
      g()
    );
    const antes = (await ProductosRepo.getById(id))!.precio_venta_usd_cents;

    await ParametrosRepo.actualizar({ margen_defecto_bp: 10000 }, g());

    const despues = (await ProductosRepo.getById(id))!.precio_venta_usd_cents;
    expect(despues).toBeGreaterThan(antes);
    expect(despues).toBe(4000);
  });

  it('un precio manual se respeta aunque no sea redondo', async () => {
    const id = await ProductosRepo.crear(
      {
        nombre: 'Bolso',
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 8550,
        stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 4000 },
      },
      g()
    );
    expect((await ProductosRepo.getById(id))!.precio_venta_usd_cents).toBe(8550);
  });

  it('recalcular precios no pisa un precio manual', async () => {
    const manual = await ProductosRepo.crear(
      {
        nombre: 'Fijo',
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 3300,
        stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 1000 },
      },
      g()
    );
    await ParametrosRepo.actualizar({ margen_defecto_bp: 20000 }, g());
    expect((await ProductosRepo.getById(manual))!.precio_venta_usd_cents).toBe(3300);
  });
});

// ---------------------------------------------------------------------------

describe('costo promedio entre paquetes', () => {
  it('el mismo producto en dos paquetes promedia su costo', async () => {
    const id = await ProductosRepo.crear({ nombre: 'Termo Owala' }, g());

    await ProductosRepo.entrada({ producto_id: id, cantidad: 4, costo_total_usd_cents: 3680 });
    expect((await ProductosRepo.getById(id))!.costo_unitario_usd_cents).toBe(920);

    await ProductosRepo.entrada({ producto_id: id, cantidad: 6, costo_total_usd_cents: 6900 });
    const p = (await ProductosRepo.getById(id))!;
    expect(p.existencias).toBe(10);
    expect(p.costo_unitario_usd_cents).toBe(1058);
  });

  it('permite corregir el costo unitario de compra al editar el producto', async () => {
    const id = await ProductosRepo.crear(
      {
        nombre: 'Vestido Shein',
        stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 1000 },
        modo_precio: 'MARGEN',
        margen_bp: 5000,
      },
      g()
    );

    const creado = (await ProductosRepo.getById(id))!;
    expect(creado.costo_unitario_usd_cents).toBe(1000);
    expect(creado.valor_inventario_usd_cents).toBe(5000);

    // Se corrige el costo de compra unitario a $8.00 (800 centavos)
    await ProductosRepo.actualizar(
      {
        id,
        costo_unitario_usd_cents: 800,
      },
      g()
    );

    const actualizado = (await ProductosRepo.getById(id))!;
    expect(actualizado.costo_unitario_usd_cents).toBe(800);
    expect(actualizado.valor_inventario_usd_cents).toBe(4000); // 5 * 800
    // Al 50% de margen sobre $8.00, precio venta = $12.00 (1200 centavos)
    expect(actualizado.precio_venta_usd_cents).toBe(1200);
  });

  it('crear producto con variantes y costo unitario calcula correctamente el invertido en bodega', async () => {
    const id = await ProductosRepo.crear(
      {
        nombre: 'Camisa Ralph Lauren',
        tiene_variantes: true,
        variantes: [
          { talla: 'S', color: 'Azul', existencias: 3 },
          { talla: 'M', color: 'Rojo', existencias: 2 },
        ],
        costo_unitario_usd_cents: 2000, // $20.00
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 3500,
      },
      g()
    );

    const creado = (await ProductosRepo.getById(id))!;
    expect(creado.existencias).toBe(5);
    expect(creado.costo_unitario_usd_cents).toBe(2000);
    expect(creado.valor_inventario_usd_cents).toBe(10000); // 5 * 2000 = $100.00
  });

  it('ajustar existencias desde cero hacia arriba preserva el costo unitario y recalcula la valuación', async () => {
    // Producto creado sin stock
    const id = await ProductosRepo.crear(
      {
        nombre: 'Perfume Lancome',
        stock_inicial: { cantidad: 0, costo_unitario_usd_cents: 4500 },
        costo_unitario_usd_cents: 4500,
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 7000,
      },
      g()
    );

    let p = (await ProductosRepo.getById(id))!;
    expect(p.existencias).toBe(0);

    // Ajuste de stock: se ingresan 4 unidades
    const varianteId = p.variantes[0].id;
    await ProductosRepo.ajustar(varianteId, 4, g(), 'Conteo físico', id);

    p = (await ProductosRepo.getById(id))!;
    expect(p.existencias).toBe(4);
    expect(p.costo_unitario_usd_cents).toBe(4500);
    expect(p.valor_inventario_usd_cents).toBe(18000); // 4 * 4500 = $180.00
  });
});

// ---------------------------------------------------------------------------

describe('vender del inventario', () => {
  async function conStock() {
    const producto = await ProductosRepo.crear(
      {
        nombre: 'Boxers',
        margen_bp: 6000,
        stock_inicial: { cantidad: 6, costo_unitario_usd_cents: 710 },
      },
      g()
    );
    const cliente = await ClientesRepo.guardar({ nombre: 'Ana' }, g());
    return { producto, cliente };
  }

  it('vender una unidad descuenta stock y congela la ganancia', async () => {
    const { producto, cliente } = await conStock();
    const precio = (await ProductosRepo.getById(producto))!.precio_venta_usd_cents;

    const venta = await VentasRepo.crear(
      {
        cliente_id: cliente,
        fecha: HOY,
        tipo: 'INVENTARIO',
        lineas: [{ producto_id: producto, cantidad: 1 }],
      },
      g()
    );

    expect((await ProductosRepo.getById(producto))!.existencias).toBe(5);

    const v = (await VentasRepo.getById(venta))!;
    expect(v.total_usd_cents).toBe(precio);
    expect(v.costo_total_usd_cents).toBe(710);
    expect(v.ganancia_usd_cents).toBe(precio - 710);
    expect(v.estado).toBe('ENTREGADA');
  });

  it('vender el paquete completo saca las 6 unidades', async () => {
    const { producto } = await conStock();
    const precio = (await ProductosRepo.getById(producto))!.precio_venta_usd_cents;

    const venta = await VentasRepo.crear(
      {
        fecha: HOY,
        tipo: 'INVENTARIO',
        lineas: [{ producto_id: producto, cantidad: 6, es_paquete: true }],
      },
      g()
    );

    const prodAgotado = (await ProductosRepo.getById(producto))!;
    expect(prodAgotado.existencias).toBe(0);
    expect(prodAgotado.costo_unitario_usd_cents).toBe(710);
    expect(prodAgotado.valor_inventario_usd_cents).toBe(0);

    const v = (await VentasRepo.getById(venta))!;
    expect(v.total_usd_cents).toBe(precio * 6);
    expect(v.costo_total_usd_cents).toBe(4260);
  });

  it('no deja vender más de lo que hay', async () => {
    const { producto } = await conStock();
    await expect(
      VentasRepo.crear(
        { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: producto, cantidad: 10 }] },
        g()
      )
    ).rejects.toThrow(/No hay suficientes unidades/i);

    expect((await ProductosRepo.getById(producto))!.existencias).toBe(6);
    expect(await VentasRepo.listar()).toHaveLength(0);
  });

  it('si una línea falla, ninguna otra deja el inventario tocado', async () => {
    const { producto } = await conStock();
    const otro = await ProductosRepo.crear(
      { nombre: 'Gorra', stock_inicial: { cantidad: 4, costo_unitario_usd_cents: 500 } },
      g()
    );

    // La primera línea alcanza; la segunda no. La venta entera debe fallar
    // sin haber movido la primera.
    await expect(
      VentasRepo.crear(
        {
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [
            { producto_id: otro, cantidad: 2 },
            { producto_id: producto, cantidad: 99 },
          ],
        },
        g()
      )
    ).rejects.toThrow(/No hay suficientes unidades/i);

    expect((await ProductosRepo.getById(otro))!.existencias).toBe(4);
    expect((await ProductosRepo.getById(producto))!.existencias).toBe(6);
    expect(await VentasRepo.listar()).toHaveLength(0);
    expect(volcar('movimientos_inventario')).toHaveLength(2); // solo las entradas iniciales
  });

  it('cancelar una venta devuelve la mercadería al inventario', async () => {
    const { producto } = await conStock();
    const venta = await VentasRepo.crear(
      { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: producto, cantidad: 2 }] },
      g()
    );
    expect((await ProductosRepo.getById(producto))!.existencias).toBe(4);

    await VentasRepo.cambiarEstado(venta, 'CANCELADA', g());
    expect((await ProductosRepo.getById(producto))!.existencias).toBe(6);
  });
});

// ---------------------------------------------------------------------------

describe('pagos y cuotas', () => {
  async function ventaAPlazos() {
    const producto = await ProductosRepo.crear(
      {
        nombre: 'Cartera',
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 12000,
        stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 6000 },
      },
      g()
    );
    const cliente = await ClientesRepo.guardar({ nombre: 'Rosa' }, g());
    const venta = await VentasRepo.crear(
      {
        cliente_id: cliente,
        fecha: HOY,
        tipo: 'INVENTARIO',
        lineas: [{ producto_id: producto, cantidad: 1 }],
        plan_cuotas: { cantidad: 4, cada_dias: 15 },
      },
      g()
    );
    return { venta, cliente };
  }

  it('el plan de cuotas reparte el total exacto', async () => {
    const { venta } = await ventaAPlazos();
    const v = (await VentasRepo.getById(venta))!;
    expect(v.cuotas).toHaveLength(4);
    expect(v.cuotas.reduce((a, c) => a + c.monto_usd_cents, 0)).toBe(12000);
  });

  it('las cuotas vencen escalonadas, no todas el mismo día', async () => {
    const { venta } = await ventaAPlazos();
    const v = (await VentasRepo.getById(venta))!;
    const fechas = v.cuotas.map((c) => c.fecha_vencimiento);
    expect(new Set(fechas).size).toBe(4);
  });

  it('los abonos bajan el saldo y se aplican a las cuotas en orden', async () => {
    const { venta } = await ventaAPlazos();

    await PagosRepo.registrar(
      { venta_id: venta, fecha: HOY, monto_cents: 3000, moneda: 'USD', metodo: 'EFECTIVO' },
      g()
    );
    let v = (await VentasRepo.getById(venta))!;
    expect(v.pagado_usd_cents).toBe(3000);
    expect(v.saldo_usd_cents).toBe(9000);
    expect(v.cuotas[0].pagado_usd_cents).toBe(3000);
    expect(v.cuotas[1].pagado_usd_cents).toBe(0);

    await PagosRepo.registrar(
      { venta_id: venta, fecha: HOY, monto_cents: 4500, moneda: 'USD', metodo: 'EFECTIVO' },
      g()
    );
    v = (await VentasRepo.getById(venta))!;
    expect(v.pagado_usd_cents).toBe(7500);
    expect(v.cuotas[1].pagado_usd_cents).toBe(3000);
    expect(v.cuotas[2].pagado_usd_cents).toBe(1500);
  });

  it('un abono en córdobas usa la tasa congelada de la venta', async () => {
    const { venta } = await ventaAPlazos();
    await PagosRepo.registrar(
      { venta_id: venta, fecha: HOY, monto_cents: 366200, moneda: 'COR', metodo: 'TRANSFERENCIA' },
      g()
    );
    expect((await VentasRepo.getById(venta))!.pagado_usd_cents).toBe(10000);
  });

  it('anular un abono devuelve el saldo y reajusta las cuotas', async () => {
    const { venta } = await ventaAPlazos();
    const p = await PagosRepo.registrar(
      { venta_id: venta, fecha: HOY, monto_cents: 6000, moneda: 'USD', metodo: 'EFECTIVO' },
      g()
    );
    expect((await VentasRepo.getById(venta))!.saldo_usd_cents).toBe(6000);

    await PagosRepo.anular(p.pago_id, g());
    const v = (await VentasRepo.getById(venta))!;
    expect(v.pagado_usd_cents).toBe(0);
    expect(v.saldo_usd_cents).toBe(12000);
    expect(v.cuotas.every((c) => c.pagado_usd_cents === 0)).toBe(true);
  });

  it('pagar de más registra el excedente en vez de descartarlo', async () => {
    const { venta } = await ventaAPlazos();
    const r = await PagosRepo.registrar(
      { venta_id: venta, fecha: HOY, monto_cents: 13000, moneda: 'USD', metodo: 'EFECTIVO' },
      g()
    );
    expect(r.excedente_usd_cents).toBe(1000);
  });
});

// ---------------------------------------------------------------------------

describe('encargos con anticipo', () => {
  it('el encargo se desbloquea solo cuando el anticipo está completo', async () => {
    const cliente = await ClientesRepo.guardar({ nombre: 'Luis' }, g());
    const encargo = await VentasRepo.crear(
      {
        cliente_id: cliente,
        fecha: HOY,
        tipo: 'ENCARGO',
        anticipo_bp: 5000,
        lineas: [{ descripcion: 'Reloj', cantidad: 1, precio_unitario_usd_cents: 10000 }],
      },
      g()
    );

    let v = (await VentasRepo.getById(encargo))!;
    expect(v.estado).toBe('COTIZADA');
    expect(v.anticipo_esperado_usd_cents).toBe(5000);

    await PagosRepo.registrar(
      { venta_id: encargo, fecha: HOY, monto_cents: 2000, moneda: 'USD', metodo: 'EFECTIVO' },
      g()
    );
    expect((await VentasRepo.getById(encargo))!.estado).toBe('COTIZADA');

    const r = await PagosRepo.registrar(
      { venta_id: encargo, fecha: HOY, monto_cents: 3000, moneda: 'USD', metodo: 'EFECTIVO' },
      g()
    );
    expect(r.anticipo_cubierto).toBe(true);
    v = (await VentasRepo.getById(encargo))!;
    expect(v.estado).toBe('PENDIENTE');
  });
});

// ---------------------------------------------------------------------------

describe('panel', () => {
  it('el por cobrar no se multiplica por la cantidad de abonos', async () => {
    const producto = await ProductosRepo.crear(
      {
        nombre: 'Set',
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 10000,
        stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 5000 },
      },
      g()
    );
    const venta = await VentasRepo.crear(
      { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: producto, cantidad: 1 }] },
      g()
    );

    for (let i = 0; i < 3; i++) {
      await PagosRepo.registrar(
        { venta_id: venta, fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' },
        g()
      );
    }

    expect((await PanelRepo.resumen()).por_cobrar_usd_cents).toBe(7000);
  });

  it('separa la inversión parada de lo que está en camino', async () => {
    await ProductosRepo.crear(
      { nombre: 'En bodega', stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 1000 } },
      g()
    );
    await ComprasRepo.guardar(
      {
        fecha: HOY,
        estado: 'EN_CAMINO',
        envio_total_usd_cents: 2000,
        lineas: [
          {
            descripcion: 'Pedido nuevo',
            cantidad: 2,
            precio_linea_usd_cents: 8000,
            peso_linea_mlb: 2000,
            destino: 'INVENTARIO',
          },
        ],
      },
      g()
    );

    const r = await PanelRepo.resumen();
    expect(r.inversion_inventario_usd_cents).toBe(5000);
    expect(r.inversion_en_camino_usd_cents).toBe(8000 + 560 + 2000);
    expect(r.unidades_en_inventario).toBe(5);
  });

  it('la ganancia del mes solo cuenta lo entregado', async () => {
    const producto = await ProductosRepo.crear(
      {
        nombre: 'Gorra',
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 3000,
        stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 1000 },
      },
      g()
    );

    await VentasRepo.crear(
      { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: producto, cantidad: 2 }] },
      g()
    );
    await VentasRepo.crear(
      {
        fecha: HOY,
        tipo: 'INVENTARIO',
        entregar_ahora: false,
        lineas: [{ producto_id: producto, cantidad: 1 }],
      },
      g()
    );

    const panel = await PanelRepo.cargar();
    expect(panel.ganancia_mes_actual!.ganancia_usd_cents).toBe(4000);
    expect(panel.ganancia_mes_actual!.ventas_count).toBe(1);
  });

  it('avisa de productos por acabarse', async () => {
    await ProductosRepo.crear(
      {
        nombre: 'Crema',
        stock_minimo: 3,
        stock_inicial: { cantidad: 2, costo_unitario_usd_cents: 500 },
      },
      g()
    );

    const alertas = await PanelRepo.alertas();
    expect(alertas.some((a) => a.id === 'bajo-stock')).toBe(true);
  });

  it('avisa si algo quedó por debajo del costo', async () => {
    await ProductosRepo.crear(
      {
        nombre: 'Mal precio',
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 500,
        stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 4000 },
      },
      g()
    );

    const alerta = (await PanelRepo.alertas()).find((a) => a.id === 'bajo-costo');
    expect(alerta).toBeDefined();
    expect(alerta!.severidad).toBe('urgente');
  });
});

// ---------------------------------------------------------------------------

describe('deshacer', () => {
  it('deshacer la creación de un producto lo quita', async () => {
    const grupo = g();
    const id = await ProductosRepo.crear({ nombre: 'Se va a borrar' }, grupo);
    expect(await ProductosRepo.getById(id)).not.toBeNull();

    const r = await EventosRepo.deshacerGrupo(grupo);
    expect(r.revertido).toBe(true);
    expect(await ProductosRepo.getById(id)).toBeNull();
  });

  it('deshacer una edición restaura los valores anteriores', async () => {
    const id = await ProductosRepo.crear({ nombre: 'Original', stock_minimo: 5 }, g());

    const grupo = g();
    await ProductosRepo.actualizar({ id, nombre: 'Cambiado', stock_minimo: 99 }, grupo);
    expect((await ProductosRepo.getById(id))!.nombre).toBe('Cambiado');

    await EventosRepo.deshacerGrupo(grupo);
    const p = (await ProductosRepo.getById(id))!;
    expect(p.nombre).toBe('Original');
    expect(p.stock_minimo).toBe(5);
  });

  it('deshacer un cambio de configuración vuelve al valor previo', async () => {
    const antes = (await ParametrosRepo.getParametros()).margen_defecto_bp;

    const grupo = g();
    await ParametrosRepo.actualizar({ margen_defecto_bp: 9999 }, grupo);
    expect((await ParametrosRepo.getParametros()).margen_defecto_bp).toBe(9999);

    await EventosRepo.deshacerGrupo(grupo);
    expect((await ParametrosRepo.getParametros()).margen_defecto_bp).toBe(antes);
  });

  it('sin nada que deshacer lo dice, no finge que funcionó', async () => {
    const r = await EventosRepo.deshacerGrupo('grupo-que-no-existe');
    expect(r.revertido).toBe(false);
  });

  it('un evento con una colección desconocida no escribe en ningún lado', async () => {
    const grupo = g();
    await EventosRepo.registrarEvento({
      evento_grupo_id: grupo,
      entidad_tipo: 'coleccion_inventada',
      entidad_id: 1,
      tipo_evento: 'CREACION',
      detalle: 'intento de escribir fuera del modelo',
    });

    await EventosRepo.deshacerGrupo(grupo);
    expect(volcar('coleccion_inventada')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('reglas de negocio protegidas', () => {
  it('no se archiva un cliente que todavía debe', async () => {
    const producto = await ProductosRepo.crear(
      {
        nombre: 'Algo',
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 5000,
        stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 1000 },
      },
      g()
    );
    const cliente = await ClientesRepo.guardar({ nombre: 'Deudor' }, g());
    await VentasRepo.crear(
      {
        cliente_id: cliente,
        fecha: HOY,
        tipo: 'INVENTARIO',
        lineas: [{ producto_id: producto, cantidad: 1 }],
      },
      g()
    );

    await expect(ClientesRepo.archivar(cliente, g())).rejects.toThrow(/todavía debe/i);
  });

  it('no se archiva una categoría con productos adentro', async () => {
    const categorias = await ParametrosRepo.getCategorias();
    await ProductosRepo.crear({ nombre: 'Con categoría', categoria_id: categorias[0].id }, g());

    await expect(
      ParametrosRepo.archivarCategoria(categorias[0].id, g())
    ).rejects.toThrow(/producto/i);
  });

  it('rechaza un escalón de redondeo que no existe', async () => {
    await expect(
      ParametrosRepo.actualizar({ paso_redondeo_usd_cents: 37 }, g())
    ).rejects.toThrow(/escalón de redondeo/i);
  });

  it('rechaza una tasa de cambio en cero', async () => {
    await expect(ParametrosRepo.actualizar({ tasa_cambio_cents: 0 }, g())).rejects.toThrow(/tasa/i);
  });
});

// ---------------------------------------------------------------------------

describe('los totales del cliente reflejan sus compras', () => {
  it('comprar sube el total y la deuda del cliente', async () => {
    const producto = await ProductosRepo.crear(
      {
        nombre: 'Blusa',
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 4000,
        stock_inicial: { cantidad: 3, costo_unitario_usd_cents: 1000 },
      },
      g()
    );
    const cliente = await ClientesRepo.guardar({ nombre: 'Carmen' }, g());

    const venta = await VentasRepo.crear(
      {
        cliente_id: cliente,
        fecha: HOY,
        tipo: 'INVENTARIO',
        lineas: [{ producto_id: producto, cantidad: 2 }],
      },
      g()
    );

    let c = (await ClientesRepo.getById(cliente))!;
    expect(c.compras_count).toBe(1);
    expect(c.total_comprado_usd_cents).toBe(8000);
    expect(c.saldo_pendiente_usd_cents).toBe(8000);

    await PagosRepo.registrar(
      { venta_id: venta, fecha: HOY, monto_cents: 8000, moneda: 'USD', metodo: 'EFECTIVO' },
      g()
    );

    c = (await ClientesRepo.getById(cliente))!;
    expect(c.saldo_pendiente_usd_cents).toBe(0);
    expect(c.total_comprado_usd_cents).toBe(8000);
  });
});

// ---------------------------------------------------------------------------

describe('costo de comunicación con Firestore', () => {
  /** Un negocio con algo de historia, para que los números signifiquen algo. */
  async function sembrarNegocio() {
    const cliente = await ClientesRepo.guardar({ nombre: 'Cliente' }, g());
    for (let i = 0; i < 12; i++) {
      const p = await ProductosRepo.crear(
        {
          nombre: `Producto ${i}`,
          modo_precio: 'MANUAL',
          precio_manual_usd_cents: 2000,
          stock_inicial: { cantidad: 10, costo_unitario_usd_cents: 800 },
        },
        g()
      );
      await VentasRepo.crear(
        {
          cliente_id: cliente,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: p, cantidad: 1 }],
        },
        g()
      );
    }
  }

  it('abrir el panel no relee las mismas colecciones una y otra vez', async () => {
    await sembrarNegocio();

    reiniciarContadores();
    await PanelRepo.cargar();
    const c = contadores();

    // 12 productos + 12 ventas + 1 cliente + categorías + parámetros.
    // Antes de consolidar, el panel leía productos 5 veces y ventas 6:
    // pasaba de 150 lecturas para los mismos datos.
    expect(c.lecturas).toBeLessThanOrEqual(60);
  });

  it('la primera apertura guarda los resúmenes de meses cerrados, y la segunda ya no', async () => {
    // El panel escribe, y es a propósito: al calcular un mes ya cerrado lo
    // guarda para no volver a calcularlo nunca. Es una escritura por mes, una
    // sola vez en la vida de ese mes.
    //
    // Lo que sí tiene que cumplirse es que sea UNA vez: un panel que
    // reescribe lo mismo en cada apertura sería una fuga silenciosa, y las
    // escrituras cuestan más que las lecturas.
    await sembrarNegocio();

    reiniciarContadores();
    await PanelRepo.cargar(true);
    const primera = contadores();

    reiniciarContadores();
    await PanelRepo.cargar(true);
    const segunda = contadores();

    expect(
      segunda.escrituras,
      `la segunda apertura volvió a escribir ${segunda.escrituras} resumen(es)`
    ).toBe(0);
    expect(primera.escrituras).toBeLessThanOrEqual(12);
  });

  it('listar el inventario cuesta una pasada, no una por producto', async () => {
    await sembrarNegocio();

    reiniciarContadores();
    await ProductosRepo.listar();
    const c = contadores();

    expect(c.lecturas).toBeLessThanOrEqual(25);
  });

  it('abrir una venta no lee un producto por línea', async () => {
    const cliente = await ClientesRepo.guardar({ nombre: 'Cliente' }, g());
    const lineas = [];
    for (let i = 0; i < 5; i++) {
      const p = await ProductosRepo.crear(
        {
          nombre: `Item ${i}`,
          modo_precio: 'MANUAL',
          precio_manual_usd_cents: 1000,
          stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 400 },
        },
        g()
      );
      lineas.push({ producto_id: p, cantidad: 1 });
    }
    const venta = await VentasRepo.crear(
      { cliente_id: cliente, fecha: HOY, tipo: 'INVENTARIO', lineas },
      g()
    );

    reiniciarContadores();
    await VentasRepo.getById(venta);
    const c = contadores();

    expect(c.lecturas).toBeLessThanOrEqual(12);
  });

  it('el historial de movimientos no arrastra toda la colección', async () => {
    const p = await ProductosRepo.crear(
      { nombre: 'Movido', stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 100 } },
      g()
    );
    for (let i = 0; i < 40; i++) {
      await ProductosRepo.entrada({ producto_id: p, cantidad: 1, costo_total_usd_cents: 100 });
    }

    reiniciarContadores();
    await ProductosRepo.movimientos(p, 10);
    const c = contadores();

    expect(c.lecturas).toBeLessThanOrEqual(10);
  });

  it('registrar un abono no dispara una decena de operaciones', async () => {
    const producto = await ProductosRepo.crear(
      {
        nombre: 'Cosa',
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 10000,
        stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 1000 },
      },
      g()
    );
    const venta = await VentasRepo.crear(
      { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: producto, cantidad: 1 }] },
      g()
    );

    reiniciarContadores();
    await PagosRepo.registrar(
      { venta_id: venta, fecha: HOY, monto_cents: 5000, moneda: 'USD', metodo: 'EFECTIVO' },
      g()
    );
    const c = contadores();

    expect(c.lecturas).toBeLessThanOrEqual(6);
    expect(c.escrituras).toBeLessThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------

describe('el arnés de pruebas es tan estricto como Firestore', () => {
  it('rechaza undefined dentro de un array, igual que el SDK real', async () => {
    const { doc, setDoc } = await import('./firestore-fake');

    // Este es el caso que el motor falso dejaba pasar y el emulador oficial
    // encontró: las líneas de una venta van en un array de objetos, y ahí
    // quedaba `producto_id: undefined` en cada encargo.
    await expect(
      setDoc(doc(null, 'prueba', '1'), {
        lineas: [{ producto_id: undefined, descripcion: 'algo' }],
      })
    ).rejects.toThrow(/undefined/i);
  });
});

// ---------------------------------------------------------------------------

describe('flujo Opción 1: paquete de courier rápido y multipack de boxers', () => {
  it('permite registrar paquete solo con datos de courier y luego asociar boxers multipack', async () => {
    // 1. Guardar paquete courier rápido (10 lb, $70.00 flete = $7.00/lb) sin transcribir productos
    const paqueteId = await ComprasRepo.guardar(
      {
        fecha: HOY,
        envio_total_usd_cents: 7000,
        peso_total_mlb: 10000,
        notas: 'Caja courier Ross con ropa y boxers',
        lineas: [],
      },
      g()
    );

    const paquete = await ComprasRepo.getById(paqueteId);
    expect(paquete).not.toBeNull();
    expect(paquete!.envio_total_usd_cents).toBe(7000);
    expect(paquete!.peso_total_mlb).toBe(10000);
    // Nace BORRADOR: guardar el flete antes de tener los productos no puede
    // ser una decisión irreversible. Cerrarlo es un acto aparte.
    expect(paquete!.estado).toBe('BORRADOR');
    expect(paquete!.lineas).toHaveLength(0);

    await ComprasRepo.recibir(paqueteId, g());
    const cerrado = await ComprasRepo.getById(paqueteId);
    expect(
      cerrado!.estado,
      'el paquete de sólo flete no se pudo cerrar: ese flujo quedó roto'
    ).toBe('RECIBIDA');

    // 2. En Inventario, "Boxers Calvin Klein": 1 pack de 5, comprado a $12.00.
    //
    // Se carga el PRECIO DE LA TIENDA por unidad y nada más. El impuesto y el
    // flete los pone la aplicación, que es de lo que se trata todo esto: antes
    // había que calcular el costo aterrizado a mano, y si te olvidabas del
    // flete —o lo cargabas sin paquete— el margen quedaba inflado sin aviso.
    //
    //   precio de tienda:  $12.00 / 5   = $2.40
    //   impuesto 7%:       round(240×7%) = $0.17   →  base $2.57
    //   flete:             los $70 del paquete entre las 5 unidades = $14.00
    //   costo unitario:    $2.57 + $14.00 = $16.57
    //
    // Los $70 caen enteros sobre estas 5 unidades porque es lo único que se
    // cargó en el paquete. Si después se le agregan más productos, el reparto
    // se rehace solo y a éste le baja.
    const precioTiendaUnit = 240;
    const baseConImpuesto = 257;
    const fleteUnit = 1400;
    const costoAterrizadoUnit = baseConImpuesto + fleteUnit;

    const productoId = await ProductosRepo.crear(
      {
        nombre: 'Boxers Calvin Klein Multipack',
        paquete_id: paqueteId,
        unidades_por_paquete: 5,
        peso_unitario_mlb: 200,
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 700, // $7.00 venta individual
        precio_venta_usd_cents: 700,
        precio_tienda_unitario_usd_cents: precioTiendaUnit,
        stock_inicial: {
          cantidad: 5, // Entran 5 unidades físicas
          costo_unitario_usd_cents: precioTiendaUnit,
        },
      },
      g()
    );

    const producto = await ProductosRepo.getById(productoId);
    expect(producto).not.toBeNull();
    expect(producto!.existencias).toBe(5);
    expect(producto!.unidades_por_paquete).toBe(5);
    expect(producto!.paquete_id).toBe(paqueteId);
    expect(producto!.costo_base_unitario_usd_cents, 'precio de tienda + 7%').toBe(baseConImpuesto);
    expect(producto!.flete_unitario_usd_cents, 'los $70 del paquete entre 5').toBe(fleteUnit);
    expect(producto!.costo_unitario_usd_cents).toBe(costoAterrizadoUnit);
    expect(producto!.precio_venta_usd_cents).toBe(700);

    // 3. Venta de 1 boxer individual por $7.00
    await VentasRepo.crear(
      {
        fecha: HOY,
        tipo: 'INVENTARIO',
        lineas: [
          {
            producto_id: productoId,
            cantidad: 1,
            precio_unitario_usd_cents: 700,
          },
        ],
      },
      g()
    );

    const prodDespuesVenta1 = await ProductosRepo.getById(productoId);
    expect(prodDespuesVenta1!.existencias).toBe(4); // Quedan 4 boxers

    // 4. Venta de las 4 unidades restantes
    await VentasRepo.crear(
      {
        fecha: HOY,
        tipo: 'INVENTARIO',
        lineas: [
          {
            producto_id: productoId,
            cantidad: 4,
            precio_unitario_usd_cents: 650, // descuento por llevar 4
          },
        ],
      },
      g()
    );

    const prodFinal = await ProductosRepo.getById(productoId);
    expect(prodFinal!.existencias).toBe(0);
  });

  it('guarda y preserva la configuración de multipack (packs comprados, costo usa y tax) al crear y editar', async () => {
    const id = await ProductosRepo.crear(
      {
        nombre: 'Boxers Tommy Hilfiger Pack de 5',
        unidades_por_paquete: 5,
        packs_comprados: 2,
        costo_pack_usa_usd_cents: 1200,
        aplicar_tax_usa: true,
        stock_inicial: { cantidad: 10, costo_unitario_usd_cents: 257 },
      },
      g()
    );

    let p = (await ProductosRepo.getById(id))!;
    expect(p.existencias).toBe(10);
    expect(p.unidades_por_paquete).toBe(5);
    expect(p.packs_comprados).toBe(2);
    expect(p.costo_pack_usa_usd_cents).toBe(1200);
    expect(p.aplicar_tax_usa).toBe(true);

    // Al editar se actualiza la configuración
    await ProductosRepo.actualizar(
      {
        id,
        packs_comprados: 3,
        costo_pack_usa_usd_cents: 1500,
      },
      g()
    );

    p = (await ProductosRepo.getById(id))!;
    expect(p.packs_comprados).toBe(3);
    expect(p.costo_pack_usa_usd_cents).toBe(1500);
    expect(p.unidades_por_paquete).toBe(5);
    expect(p.aplicar_tax_usa).toBe(true);
  });


  it('permite registrar una venta pagada al contado sin dejar deuda pendiente', async () => {
    const clienteId = await ClientesRepo.guardar(
      { nombre: 'Karla Gómez', telefono: '8888-9999' },
      g()
    );

    const productoId = await ProductosRepo.crear(
      {
        nombre: 'Blusa floral',
        modo_precio: 'MANUAL',
        precio_manual_usd_cents: 2000,
        peso_unitario_mlb: 0,
        stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 1000 },
      },
      g()
    );

    const ventaId = await VentasRepo.crear(
      {
        cliente_id: clienteId,
        fecha: HOY,
        tipo: 'INVENTARIO',
        lineas: [{ producto_id: productoId, cantidad: 2, precio_unitario_usd_cents: 2000 }],
        pago_inicial: {
          monto_cents: 4000,
          metodo: 'EFECTIVO',
          moneda: 'USD',
        },
      },
      g()
    );

    const venta = await VentasRepo.getById(ventaId);
    expect(venta).not.toBeNull();
    expect(venta!.total_usd_cents).toBe(4000);
    expect(venta!.pagado_usd_cents).toBe(4000);
    expect(venta!.saldo_usd_cents).toBe(0);
    expect(venta!.estado).toBe('ENTREGADA');

    // El cliente no debe tener saldo pendiente
    const cliente = await ClientesRepo.getById(clienteId);
    expect(cliente!.saldo_pendiente_usd_cents).toBe(0);
    expect(cliente!.total_comprado_usd_cents).toBe(4000);

    // Debe existir el comprobante de pago vinculado a la venta
    expect(venta!.pagos).toHaveLength(1);
    expect(venta!.pagos[0].monto_usd_cents).toBe(4000);
    expect(venta!.pagos[0].metodo).toBe('EFECTIVO');
  });

  it('permite archivar/eliminar un paquete que ya estaba en estado RECIBIDA', async () => {
    const paqueteId = await ComprasRepo.guardar(
      {
        fecha: HOY,
        envio_total_usd_cents: 1400,
        peso_total_mlb: 2000,
        lineas: [],
        estado: 'RECIBIDA',
      },
      g()
    );

    // No debe lanzar error aunque esté recibida
    await expect(ComprasRepo.archivar(paqueteId, g())).resolves.not.toThrow();

    const paquetesActivos = await ComprasRepo.listar();
    expect(paquetesActivos.some((p) => p.id === paqueteId)).toBe(false);
  });

  it('eliminarDefinitivo purga el producto por completo de la base de datos', async () => {
    const pId = await ProductosRepo.crear(
      {
        nombre: 'Producto de prueba a borrar',
        precio_venta_usd_cents: 1500,
        costo_unitario_usd_cents: 800,
        variantes: [{ existencias: 3 }],
      },
      g()
    );

    let prod = await ProductosRepo.getById(pId);
    expect(prod).not.toBeNull();

    await ProductosRepo.eliminarDefinitivo(pId, g());

    prod = await ProductosRepo.getById(pId);
    expect(prod).toBeNull();

    const lista = await ProductosRepo.listar({ incluirInactivos: true });
    expect(lista.some((p) => p.id === pId)).toBe(false);
  });
});


