/**
 * Simulación del puente IPC para abrir la interfaz en un navegador normal
 * (`npm run dev` sin Electron). Guarda todo en memoria y se pierde al
 * recargar: sirve para trabajar en la interfaz, no para probar la lógica.
 *
 * La lógica de negocio de verdad se prueba en `tests/integracion.test.ts`,
 * contra los repositorios de Firestore. Este archivo no debe replicarla.
 */

import type { ApiPuente, Resultado } from '../../shared/ipc-contracts';
import type {
  ParametrosSistema,
  Categoria,
  ClienteDetalle,
  ProductoConStock,
  Compra,
  CompraCompleta,
  Venta,
  VentaCompleta,
  Pago,
  PanelData,
  Acceso,
  CompraLinea,
  EfectoIngreso,
  PrecioDesactualizado,
} from '../../shared/types';
import type { LineaCompraInput, GuardarCompraInput } from '../../shared/ipc-contracts';
import { calcularPrecio, margenEfectivo } from '@core/precios';
import {
  calcularPaquete,
  efectoDeEntradas,
  efectoDeCorreccion,
  precioParaCosto,
  type ProductoAntesDelPaquete,
} from '@core/paquete';
import { algunoContiene, normalizar } from '@core/texto';
import { esDeuda, esCotizacion, estadoInicialEncargo } from '@core/cobranza';
import { hoyISO, sumarDiasAFecha } from '@core/fechas';

const ok = <T>(data: T): Promise<Resultado<T>> => Promise.resolve({ success: true, data });
const grupo = () => ({ evento_grupo_id: `g_${Math.random().toString(36).slice(2)}` });
const hoy = () => hoyISO();

interface Almacen {
  accesos: Acceso[];
  parametros: ParametrosSistema;
  categorias: Categoria[];
  clientes: ClienteDetalle[];
  productos: ProductoConStock[];
  compras: CompraCompleta[];
  ventas: VentaCompleta[];
  pin: string | null;
  siguienteId: number;
}

function almacenInicial(): Almacen {
  const parametros: ParametrosSistema = {
    tasa_cambio_cents: 3662,
    tax_bp: 700,
    tarifa_envio_cents_lb: 700,
    margen_defecto_bp: 4500,
    paso_redondeo_usd_cents: 100,
    anticipo_defecto_bp: 5000,
    mostrar_cordobas: true,
    stock_minimo_defecto: 2,
    nombre_negocio: 'Glow Heaven',
    telefono_negocio: '8888-8888',
    onboarding_completado: true,
    plantilla_cobro_whatsapp:
      'Hola {cliente}, te saludamos de Glow Heaven ✨ Te recordamos que tienes un saldo pendiente de {saldo_usd} ({saldo_cs}). Si ya realizaste tu abono, por favor compártenos el comprobante. ¡Muchas gracias!',
    plantilla_factura_whatsapp:
      '¡Hola {cliente}! ✨ Muchas gracias por tu compra en Glow Heaven 🛍️\n\n📄 Factura: {codigo}\n💵 Total: {total_usd} (≈ {total_cs})\n{estado_pago}\n\n{cuentas_bancarias}\n¡Esperamos que disfrutes tus prendas! 💖',
    plantilla_proforma_whatsapp:
      '¡Hola {cliente}! ✨ Te compartimos la cotización de tu encargo en Glow Heaven 📦✈️\n\n📋 Cotización: {codigo}\n💰 Total estimado: {total_usd} (≈ {total_cs})\n🔒 Anticipo requerido (50%): {anticipo}\n🤝 Saldo contra entrega: {saldo}\n\n{cuentas_bancarias}\n¡Quedamos atentas a tu comprobante! 💕',
    cuentas_bancarias: [
      { banco: 'BAC Credomatic', moneda: 'USD', numero: '360-123456-7', titular: 'Glow Heaven' },
      { banco: 'LAFISE Bancentro', moneda: 'NIO', numero: '102-987654-3', titular: 'Glow Heaven' },
    ],
    dias_alerta_mora: 15,
    dias_alerta_encargos: 10,
    moneda_defecto_venta: 'USD',
    metodo_pago_defecto: 'EFECTIVO',
    cuotas_defecto_cantidad: 4,
    cuotas_defecto_dias: 15,
    pantalla_inicio: 'panel',
    pantalla_inicio_movil: 'panel',
    codigo_pais_whatsapp: '505',
  };

  const categorias: Categoria[] = [
    { id: 1, nombre: 'Ropa', margen_defecto_bp: 5000, activa: true },
    { id: 2, nombre: 'Ropa interior', margen_defecto_bp: 6000, activa: true },
    { id: 3, nombre: 'Bolsos y accesorios', margen_defecto_bp: 5000, activa: true },
    { id: 4, nombre: 'Hogar', margen_defecto_bp: 4500, activa: true },
  ];

  const armarProducto = (
    id: number,
    nombre: string,
    categoria_id: number,
    existencias: number,
    costo: number,
    stock_minimo = 2
  ): ProductoConStock => {
    const margen =
      categorias.find((c) => c.id === categoria_id)?.margen_defecto_bp ??
      parametros.margen_defecto_bp;
    const precio = calcularPrecio({
      costo_unitario_usd_cents: costo,
      modo: 'MARGEN',
      margen_bp: margen,
      paso_redondeo_usd_cents: parametros.paso_redondeo_usd_cents,
    });

    return {
      id,
      codigo: `P-${String(id).padStart(4, '0')}`,
      nombre,
      categoria_id,
      categoria_nombre: categorias.find((c) => c.id === categoria_id)?.nombre,
      tiene_variantes: false,
      valor_inventario_usd_cents: costo * existencias,
      costo_unitario_usd_cents: costo,
      modo_precio: 'MARGEN',
      precio_venta_usd_cents: precio.precio_usd_cents,
      stock_minimo,
      peso_unitario_mlb: 250,
      activo: true,
      existencias,
      ganancia_unitaria_usd_cents: precio.ganancia_usd_cents,
      variantes: [{ id: id * 10, producto_id: id, existencias, activo: true }],
    };
  };

  const productos: ProductoConStock[] = [
    armarProducto(1, 'Boxers Calvin Klein', 2, 6, 710),
    armarProducto(2, 'Termo Owala 32oz', 4, 4, 1058),
    armarProducto(3, 'Camisa Polo Ralph Lauren', 1, 3, 2140),
    armarProducto(4, 'Sandalias Nike', 1, 1, 1520, 2),
    armarProducto(5, 'Perfume Bath & Body', 4, 0, 890, 3),
  ];
  // Como quedaron los productos cargados antes de v2.12: el precio se calculó
  // sin el flete. Así el simulador muestra el aviso de "precios para revisar".
  productos[1] = {
    ...productos[1],
    precio_venta_usd_cents: 1400,
    ganancia_unitaria_usd_cents: 1400 - productos[1].costo_unitario_usd_cents,
  };

  const clientes: ClienteDetalle[] = [
    {
      id: 1,
      nombre: 'María López',
      telefono: '8888-0001',
      ciudad: 'León',
      activo: true,
      compras_count: 3,
      total_comprado_usd_cents: 21500,
      saldo_pendiente_usd_cents: 6000,
      ultima_compra: hoy(),
    },
    {
      id: 2,
      nombre: 'José Ramírez',
      telefono: '8888-0002',
      ciudad: 'Chichigalpa',
      activo: true,
      compras_count: 1,
      total_comprado_usd_cents: 5500,
      saldo_pendiente_usd_cents: 0,
    },
  ];

  return {
    parametros,
    categorias,
    clientes,
    productos,
    compras: [],
    ventas: [],
    accesos: [
      {
        id: 'duenia',
        correo: 'ross@glowheaven.com',
        nombre: 'Dueña',
        pendiente: false,
        fijo: true,
      },
    ],
    pin: 'demo',
    siguienteId: 100,
  };
}

let db = almacenInicial();

function armarPanel(): PanelData {
  const inversion = db.productos.reduce(
    (a, p) =>
      a +
      (p.valor_inventario_usd_cents && p.valor_inventario_usd_cents > 0
        ? p.valor_inventario_usd_cents
        : p.existencias * (p.costo_unitario_usd_cents || 0)),
    0
  );
  const conDeuda = db.ventas.filter((v) => esDeuda(v));
  const porCobrarTotal = conDeuda.reduce((a, v) => a + Math.max(0, v.saldo_usd_cents), 0);
  const cotizado = db.ventas
    .filter((v) => esCotizacion(v))
    .reduce((a, v) => a + v.saldo_usd_cents, 0);

  const bajoStock = db.productos
    .filter((p) => p.stock_minimo > 0 && p.existencias <= p.stock_minimo)
    .map((p) => ({
      producto_id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      stock_minimo: p.stock_minimo,
      existencias: p.existencias,
      costo_unitario_usd_cents: p.costo_unitario_usd_cents,
      precio_venta_usd_cents: p.precio_venta_usd_cents,
    }));

  const mes = new Date();
  const historico = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(mes);
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    const clave = d.toISOString().slice(0, 7);
    const semilla = [3200, 5400, 4100, 7300, 6800, 8900][i];
    return {
      mes: clave,
      ventas_count: Math.round(semilla / 1500),
      ingresos_usd_cents: Math.round(semilla * 2.4),
      costos_usd_cents: Math.round(semilla * 1.4),
      ganancia_usd_cents: semilla,
    };
  });

  return {
    resumen: {
      inversion_inventario_usd_cents: inversion,
      por_cobrar_usd_cents: porCobrarTotal,
      cotizado_sin_confirmar_usd_cents: cotizado,
      anticipos_por_entregar_usd_cents: db.ventas
        .filter((v) => v.tipo === 'ENCARGO' && v.estado !== 'ENTREGADA')
        .reduce((a, v) => a + v.pagado_usd_cents, 0),
      unidades_en_inventario: db.productos.reduce((a, p) => a + p.existencias, 0),
      productos_activos: db.productos.length,
    },
    ganancia_mes_actual: historico[5],
    ganancia_mes_anterior: historico[4],
    historico,
    total_por_cobrar: conDeuda.length,
    total_bajo_stock: bajoStock.length,
    por_cobrar:
      conDeuda.slice(0, 10).map((v) => ({
        venta_id: v.id,
        codigo: v.codigo,
        fecha: v.fecha,
        tipo: v.tipo,
        estado: v.estado,
        cliente_id: v.cliente_id,
        cliente_nombre: v.cliente_nombre ?? 'Mostrador',
        total_usd_cents: v.total_usd_cents,
        pagado_usd_cents: v.pagado_usd_cents,
        saldo_usd_cents: v.saldo_usd_cents,
        cuotas_vencidas: 0,
      })) ?? [],
    bajo_stock: bajoStock.slice(0, 10),
    mas_vendidos: db.productos.slice(0, 3).map((p) => ({
      producto_id: p.id,
      nombre: p.nombre,
      unidades_vendidas_90d: 6 - p.id,
      ganancia_90d_usd_cents: p.ganancia_unitaria_usd_cents * (6 - p.id),
      existencias: p.existencias,
    })),
    sin_rotacion: db.productos
      .filter((p) => p.existencias > 0)
      .slice(3)
      .map((p) => ({
        producto_id: p.id,
        nombre: p.nombre,
        unidades_vendidas_90d: 0,
        ganancia_90d_usd_cents: 0,
        existencias: p.existencias,
      })),
    alertas: [
      ...(bajoStock.some((p) => p.existencias === 0)
        ? [
            {
              id: 'agotados',
              severidad: 'atencion' as const,
              titulo: `${bajoStock.filter((p) => p.existencias === 0).length} producto(s) agotado(s)`,
              detalle: bajoStock
                .filter((p) => p.existencias === 0)
                .map((p) => p.nombre)
                .join(', '),
              destino: { vista: 'inventario' },
            },
          ]
        : []),
      ...(bajoStock.some((p) => p.existencias > 0)
        ? [
            {
              id: 'bajo-stock',
              severidad: 'info' as const,
              titulo: `${bajoStock.filter((p) => p.existencias > 0).length} producto(s) por acabarse`,
              detalle: 'Llegaron al mínimo que configuraste.',
              destino: { vista: 'inventario' },
            },
          ]
        : []),
    ],
  };
}

/** Deriva el costo del valor sin tocar el precio: lo que hace una venta. */
function sinCambiarPrecio(p: ProductoConStock): ProductoConStock {
  const costo =
    p.existencias > 0
      ? Math.round(p.valor_inventario_usd_cents / p.existencias)
      : p.costo_unitario_usd_cents;
  return {
    ...p,
    costo_unitario_usd_cents: costo,
    ganancia_unitaria_usd_cents: p.precio_venta_usd_cents - costo,
  };
}

function antesDelPaquete(p: ProductoConStock): ProductoAntesDelPaquete {
  return {
    existencias: p.existencias,
    valor_inventario_usd_cents: p.valor_inventario_usd_cents,
    costo_unitario_usd_cents: p.costo_unitario_usd_cents,
    precio_venta_usd_cents: p.precio_venta_usd_cents,
    modo_precio: p.modo_precio,
    margen_bp: margenEfectivo(p, db.categorias, db.parametros.margen_defecto_bp),
    multiplicador_bp: p.multiplicador_bp,
    precio_manual_usd_cents: p.precio_manual_usd_cents,
  };
}

/** Las líneas guardadas del simulador, con la misma cuenta que el repositorio. */
function lineasCosteadas(input: GuardarCompraInput, compra_id: number, previas: CompraLinea[] = []): CompraLinea[] {
  let max = Math.max(0, ...previas.map((l) => l.id), ...input.lineas.map((l) => l.id ?? 0));
  const conId = input.lineas.map((l) => ({ ...l, id: l.id ?? ++max }));
  const calc = calcularPaquete(
    conId.map((l) => ({
      clave: String(l.id),
      producto_id: l.producto_id,
      destino: l.destino,
      cantidad: l.cantidad,
      precio_linea_usd_cents: l.precio_linea_usd_cents,
      exento: l.exento,
      peso_manual_mlb: l.peso_linea_mlb ?? null,
    })),
    {
      tax_bp: db.parametros.tax_bp,
      envio_total_usd_cents: input.envio_total_usd_cents,
      otros_costos_usd_cents: input.otros_costos_usd_cents,
      tax_total_override_usd_cents: input.tax_total_override_usd_cents,
      peso_total_mlb: input.peso_total_mlb ?? 0,
      pesoUnitario: (id) => db.productos.find((p) => p.id === id)?.peso_unitario_mlb ?? 0,
    }
  );
  return conId.map((l: LineaCompraInput & { id: number }, i) => {
    const c = calc.lineas.find((x) => x.clave === String(l.id))!;
    return {
      id: l.id,
      compra_id,
      producto_id: l.producto_id,
      variante_id: l.variante_id,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      precio_linea_usd_cents: c.precio_linea_usd_cents,
      tax_linea_usd_cents: c.tax_linea_usd_cents,
      exento: l.exento,
      peso_linea_mlb: c.peso_linea_mlb,
      peso_estimado: c.peso_estimado,
      envio_asignado_usd_cents: c.envio_asignado_usd_cents,
      otros_asignados_usd_cents: c.otros_asignados_usd_cents,
      costo_linea_usd_cents: c.costo_linea_usd_cents,
      costo_unitario_usd_cents: c.costo_unitario_usd_cents,
      destino: l.destino,
      venta_id: l.venta_id,
      venta_linea_id: l.venta_linea_id,
      orden: i,
      es_multipack: l.es_multipack,
      packs_comprados: l.packs_comprados,
      unidades_por_pack: l.unidades_por_pack,
      precio_por_pack_usd_cents: l.precio_por_pack_usd_cents,
    };
  });
}

function totalesDe(lineas: CompraLinea[], envio: number, otros: number) {
  const subtotal = lineas.reduce((a, l) => a + l.precio_linea_usd_cents, 0);
  const tax = lineas.reduce((a, l) => a + l.tax_linea_usd_cents, 0);
  return {
    subtotal_productos_usd_cents: subtotal,
    tax_total_usd_cents: tax,
    total_usd_cents: subtotal + tax + envio + otros,
  };
}

/** Le mete a un producto del simulador las unidades de una línea. */
function meterUnidades(p: ProductoConStock, cantidad: number, variante_id?: number): ProductoConStock {
  const variantes = p.variantes.length > 0 ? [...p.variantes] : [{ id: p.id * 10, producto_id: p.id, existencias: 0, activo: true }];
  const idx = Math.max(0, variante_id ? variantes.findIndex((v) => v.id === variante_id) : 0);
  variantes[idx] = { ...variantes[idx], existencias: variantes[idx].existencias + cantidad };
  return { ...p, variantes, existencias: p.existencias + cantidad };
}

function recalcularProducto(p: ProductoConStock): ProductoConStock {
  const margen =
    p.margen_bp ??
    db.categorias.find((c) => c.id === p.categoria_id)?.margen_defecto_bp ??
    db.parametros.margen_defecto_bp;

  const costo =
    p.costo_unitario_usd_cents !== undefined && p.costo_unitario_usd_cents > 0
      ? p.costo_unitario_usd_cents
      : p.existencias > 0
      ? Math.round(p.valor_inventario_usd_cents / p.existencias)
      : 0;

  const precio = calcularPrecio({
    costo_unitario_usd_cents: costo,
    modo: p.modo_precio,
    margen_bp: margen,
    multiplicador_bp: p.multiplicador_bp,
    precio_manual_usd_cents: p.precio_manual_usd_cents,
    paso_redondeo_usd_cents: db.parametros.paso_redondeo_usd_cents,
  });

  return {
    ...p,
    costo_unitario_usd_cents: costo,
    valor_inventario_usd_cents: p.existencias * costo,
    precio_venta_usd_cents: precio.precio_usd_cents,
    ganancia_unitaria_usd_cents: precio.ganancia_usd_cents,
  };
}

const api: ApiPuente = {
  auth: {
    iniciarGoogle: () =>
      ok({
        uid: 'mock-google-1',
        email: 'ross@glowheaven.com',
        nombre: 'Ross',
      }),
    obtenerUsuario: () =>
      ok({
        uid: 'mock-google-1',
        email: 'ross@glowheaven.com',
        nombre: 'Ross',
      }),
    cerrarSesion: () => ok({ ok: true as const }),
  },
  parametros: {
    get: () => ok(db.parametros),
    update: (valores) => {
      db.parametros = { ...db.parametros, ...(valores as Partial<ParametrosSistema>) };
      db.productos = db.productos.map(recalcularProducto);
      return ok(grupo());
    },
    recalcularPrecios: () => {
      db.productos = db.productos.map(recalcularProducto);
      return ok({ productos: db.productos.length });
    },
  },
  categorias: {
    list: () => ok(db.categorias),
    guardar: (input) => {
      if (input.id) {
        db.categorias = db.categorias.map((c) =>
          c.id === input.id ? { ...c, ...input } : c
        );
        db.productos = db.productos.map(recalcularProducto);
        return ok({ ...grupo(), id: input.id });
      }
      const id = db.siguienteId++;
      db.categorias.push({
        id,
        nombre: input.nombre,
        // Sin margen propio hereda el global, igual que el repositorio real.
        margen_defecto_bp: input.margen_defecto_bp ?? db.parametros.margen_defecto_bp,
        activa: true,
      });
      return ok({ ...grupo(), id });
    },
    archivar: (id) => {
      db.categorias = db.categorias.filter((c) => c.id !== id);
      return ok(grupo());
    },
  },
  productos: {
    list: (filtros) => {
      let r = filtros?.soloInactivos
        ? db.productos.filter((p) => !p.activo)
        : filtros?.incluirInactivos
          ? db.productos
          : db.productos.filter((p) => p.activo);
      if (filtros?.busqueda) {
        r = r.filter((p) => algunoContiene([p.nombre, p.codigo], filtros.busqueda!));
      }
      if (filtros?.categoria_id) r = r.filter((p) => p.categoria_id === filtros.categoria_id);
      if (filtros?.paquete_id !== undefined) {
        r =
          filtros.paquete_id === 'SIN_PAQUETE'
            ? r.filter((p) => !p.paquete_id && (p.paquetes ?? []).length === 0)
            : r.filter(
                (p) =>
                  p.paquete_id === filtros.paquete_id ||
                  (p.paquetes ?? []).includes(filtros.paquete_id as number)
              );
      }
      if (filtros?.soloConStock) r = r.filter((p) => p.existencias > 0);
      if (filtros?.soloBajoStock)
        r = r.filter((p) => p.stock_minimo > 0 && p.existencias <= p.stock_minimo);
      // Una copia, como la que llega por IPC. Devolver el mismo arreglo que
      // se modifica en el lugar hacía que React no viera un producto recién
      // creado.
      return ok([...r]);
    },
    get: (id) => ok(db.productos.find((p) => p.id === id) ?? null),
    crear: (input) => {
      // Igual que el repositorio: la ficha es catálogo. Nace sin existencias
      // ni costo; la mercadería entra por un paquete.
      const id = db.siguienteId++;
      const nuevo: ProductoConStock = recalcularProducto({
        id,
        codigo: `P-${String(id).padStart(4, '0')}`,
        nombre: input.nombre,
        categoria_id: input.categoria_id,
        categoria_nombre: db.categorias.find((c) => c.id === input.categoria_id)?.nombre,
        tiene_variantes: input.tiene_variantes ?? false,
        valor_inventario_usd_cents: 0,
        costo_unitario_usd_cents: 0,
        modo_precio: input.modo_precio ?? 'MARGEN',
        margen_bp: input.margen_bp,
        multiplicador_bp: input.multiplicador_bp,
        precio_manual_usd_cents: input.precio_manual_usd_cents,
        precio_venta_usd_cents: 0,
        stock_minimo: input.stock_minimo ?? 2,
        peso_unitario_mlb: input.peso_unitario_mlb ?? 0,
        unidades_por_paquete: input.unidades_por_paquete,
        paquetes: [],
        foto: input.foto,
        notas: input.notas,
        activo: true,
        existencias: 0,
        ganancia_unitaria_usd_cents: 0,
        variantes:
          input.tiene_variantes && input.variantes?.length
            ? input.variantes.map((v, i) => ({
                id: id * 10 + i,
                producto_id: id,
                talla: v.talla,
                color: v.color,
                existencias: 0,
                activo: true,
              }))
            : [{ id: id * 10, producto_id: id, existencias: 0, activo: true }],
      });
      db.productos.push(nuevo);
      return ok({ ...grupo(), id });
    },
    actualizar: (input) => {
      db.productos = db.productos.map((p) => {
        if (p.id !== input.id) return p;
        const { variantes: _v, ...catalogo } = input;
        const junto = { ...p, ...catalogo } as ProductoConStock;
        const precio = precioParaCosto(
          { ...antesDelPaquete(junto) },
          junto.costo_unitario_usd_cents,
          db.parametros.paso_redondeo_usd_cents
        );
        return sinCambiarPrecio({ ...junto, precio_venta_usd_cents: precio });
      });
      return ok(grupo());
    },
    ajustarStock: (variante_id, existencias) => {
      db.productos = db.productos.map((p) => {
        if (!p.variantes.some((v) => v.id === variante_id)) return p;
        const variantes = p.variantes.map((v) =>
          v.id === variante_id ? { ...v, existencias } : v
        );
        const total = variantes.reduce((a, v) => a + v.existencias, 0);
        return sinCambiarPrecio({
          ...p,
          variantes,
          existencias: total,
          valor_inventario_usd_cents: p.costo_unitario_usd_cents * total,
        });
      });
      return ok(grupo());
    },
    archivar: (id) => {
      db.productos = db.productos.map((p) => (p.id === id ? { ...p, activo: false } : p));
      return ok(grupo());
    },
    reactivar: (id) => {
      db.productos = db.productos.map((p) => (p.id === id ? { ...p, activo: true } : p));
      return ok(grupo());
    },
    eliminarDefinitivo: (id) => {
      db.productos = db.productos.filter((p) => p.id !== id);
      return ok(grupo());
    },
    movimientos: () => ok([]),
    simularPrecio: (input) =>
      ok(
        calcularPrecio({
          ...input,
          margen_bp: input.margen_bp ?? db.parametros.margen_defecto_bp,
          paso_redondeo_usd_cents: db.parametros.paso_redondeo_usd_cents,
        })
      ),
    preciosDesactualizados: () => {
      const salida: PrecioDesactualizado[] = [];
      for (const p of db.productos.filter((x) => x.activo)) {
        if (p.modo_precio === 'MANUAL' || p.costo_unitario_usd_cents <= 0) continue;
        const calculado = precioParaCosto(
          antesDelPaquete(p),
          p.costo_unitario_usd_cents,
          db.parametros.paso_redondeo_usd_cents
        );
        if (calculado === p.precio_venta_usd_cents) continue;
        salida.push({
          producto_id: p.id,
          codigo: p.codigo,
          nombre: p.nombre,
          modo_precio: p.modo_precio,
          existencias: p.existencias,
          costo_unitario_usd_cents: p.costo_unitario_usd_cents,
          precio_actual_usd_cents: p.precio_venta_usd_cents,
          precio_calculado_usd_cents: calculado,
        });
      }
      return ok(salida);
    },
    aplicarPrecios: (ids) => {
      let actualizados = 0;
      db.productos = db.productos.map((p) => {
        if (!ids.includes(p.id) || p.modo_precio === 'MANUAL') return p;
        actualizados++;
        return sinCambiarPrecio({
          ...p,
          precio_venta_usd_cents: precioParaCosto(
            antesDelPaquete(p),
            p.costo_unitario_usd_cents,
            db.parametros.paso_redondeo_usd_cents
          ),
        });
      });
      return ok({ ...grupo(), actualizados });
    },
  },
  compras: {
    list: () => ok(db.compras as Compra[]),
    get: (id) => ok(db.compras.find((c) => c.id === id) ?? null),
    guardar: (input) => {
      const previa = input.id ? db.compras.find((c) => c.id === input.id) : undefined;
      if (previa?.estado === 'RECIBIDA') {
        return Promise.resolve({
          success: false as const,
          error: 'Este paquete ya está en el inventario. Para cambiarle algo usá "Corregir".',
        });
      }
      const id = input.id ?? db.siguienteId++;
      const lineas = lineasCosteadas(input, id, previa?.lineas);
      const compra: CompraCompleta = {
        id,
        codigo: previa?.codigo ?? `PQ-${String(id).padStart(4, '0')}`,
        fecha: input.fecha,
        estado: 'BORRADOR',
        envio_total_usd_cents: input.envio_total_usd_cents,
        otros_costos_usd_cents: input.otros_costos_usd_cents ?? 0,
        tax_total_override_usd_cents: input.tax_total_override_usd_cents ?? undefined,
        ...totalesDe(lineas, input.envio_total_usd_cents, input.otros_costos_usd_cents ?? 0),
        peso_total_mlb: input.peso_total_mlb ?? 0,
        tasa_cambio_cents: db.parametros.tasa_cambio_cents,
        notas: input.notas,
        activo: true,
        unidades_totales: lineas.reduce((a, l) => a + l.cantidad, 0),
        lineas,
      };
      db.compras = [compra, ...db.compras.filter((c) => c.id !== id)];
      return ok({ ...grupo(), id });
    },
    previsualizar: (input) => {
      const lineas = lineasCosteadas(input, 0);
      const envio = input.envio_total_usd_cents;
      const otros = input.otros_costos_usd_cents ?? 0;
      const t = totalesDe(lineas, envio, otros);
      return ok({
        lineas,
        subtotal_productos_usd_cents: t.subtotal_productos_usd_cents,
        tax_total_usd_cents: t.tax_total_usd_cents,
        envio_total_usd_cents: envio,
        otros_costos_usd_cents: otros,
        total_pagado_usd_cents: t.total_usd_cents,
        peso_total_mlb: input.peso_total_mlb ?? 0,
        unidades_totales: lineas.reduce((a, l) => a + l.cantidad, 0),
        criterio_flete: envio + otros === 0 ? ('SIN_FLETE' as const) : ('UNIDADES' as const),
      });
    },
    recibir: (id) => {
      const compra = db.compras.find((c) => c.id === id);
      if (!compra) return Promise.resolve({ success: false as const, error: 'El paquete no existe.' });

      // Las líneas sin producto se asocian por nombre, o se crea uno.
      const lineas = compra.lineas.map((l) => {
        if (l.destino !== 'INVENTARIO' || l.producto_id) return l;
        const existente = db.productos.find((p) => normalizar(p.nombre) === normalizar(l.descripcion));
        if (existente) return { ...l, producto_id: existente.id };
        const nuevoId = db.siguienteId++;
        db.productos.push(
          recalcularProducto({
            id: nuevoId,
            codigo: `P-${String(nuevoId).padStart(4, '0')}`,
            nombre: l.descripcion,
            tiene_variantes: false,
            valor_inventario_usd_cents: 0,
            costo_unitario_usd_cents: 0,
            modo_precio: 'MARGEN',
            precio_venta_usd_cents: 0,
            stock_minimo: db.parametros.stock_minimo_defecto,
            peso_unitario_mlb: 0,
            paquetes: [],
            activo: true,
            existencias: 0,
            ganancia_unitaria_usd_cents: 0,
            variantes: [{ id: nuevoId * 10, producto_id: nuevoId, existencias: 0, activo: true }],
          })
        );
        return { ...l, producto_id: nuevoId };
      });

      const efectos: EfectoIngreso[] = [];
      const ids = [...new Set(lineas.filter((l) => l.destino === 'INVENTARIO').map((l) => l.producto_id!))];
      for (const pid of ids) {
        const p = db.productos.find((x) => x.id === pid)!;
        const suyas = lineas.filter((l) => l.destino === 'INVENTARIO' && l.producto_id === pid);
        const efecto = efectoDeEntradas(
          antesDelPaquete(p),
          suyas.map((l) => ({ cantidad: l.cantidad, costo_linea_usd_cents: l.costo_linea_usd_cents })),
          db.parametros.paso_redondeo_usd_cents
        );
        let nuevo = p;
        for (const l of suyas) nuevo = meterUnidades(nuevo, l.cantidad, l.variante_id);
        nuevo = {
          ...nuevo,
          valor_inventario_usd_cents: efecto.valor_despues_usd_cents,
          costo_unitario_usd_cents: efecto.costo_despues_usd_cents,
          precio_venta_usd_cents: efecto.precio_despues_usd_cents,
          ganancia_unitaria_usd_cents: efecto.precio_despues_usd_cents - efecto.costo_despues_usd_cents,
          paquete_id: id,
          paquetes: [...new Set([...(p.paquetes ?? []), id])],
          activo: true,
        };
        db.productos = db.productos.map((x) => (x.id === pid ? nuevo : x));
        efectos.push({ producto_id: pid, nombre: p.nombre, modo_precio: p.modo_precio, ...efecto });
      }

      db.compras = db.compras.map((c) =>
        c.id === id ? { ...c, lineas, estado: 'RECIBIDA', resumen_ingreso: efectos, cerrado_en: new Date().toISOString() } : c
      );
      return ok({
        ...grupo(),
        codigo: compra.codigo,
        productos_afectados: efectos.length,
        productos: efectos,
        encargos_actualizados: 0,
      });
    },
    corregir: (input) => {
      const compra = db.compras.find((c) => c.id === input.id);
      if (!compra || compra.estado !== 'RECIBIDA') {
        return Promise.resolve({ success: false as const, error: 'Este paquete no está en el inventario.' });
      }
      const viejas = new Map(compra.lineas.map((l) => [l.id, l]));
      const lineas = lineasCosteadas(input, compra.id, compra.lineas);
      const efectos: EfectoIngreso[] = [];
      const ids = [...new Set(lineas.filter((l) => l.destino === 'INVENTARIO').map((l) => l.producto_id!))];
      for (const pid of ids) {
        const p = db.productos.find((x) => x.id === pid);
        if (!p) continue;
        const suyas = lineas.filter((l) => l.destino === 'INVENTARIO' && l.producto_id === pid);
        const cambios = suyas
          .filter((l) => viejas.has(l.id))
          .map((l) => ({
            unidades_de_la_linea: l.cantidad,
            diferencia_usd_cents: l.costo_linea_usd_cents - viejas.get(l.id)!.costo_linea_usd_cents,
          }))
          .filter((c) => c.diferencia_usd_cents !== 0);
        const nuevas = suyas.filter((l) => !viejas.has(l.id));
        if (cambios.length === 0 && nuevas.length === 0) continue;
        const efecto = efectoDeCorreccion(
          antesDelPaquete(p),
          cambios,
          nuevas.map((l) => ({ cantidad: l.cantidad, costo_linea_usd_cents: l.costo_linea_usd_cents })),
          db.parametros.paso_redondeo_usd_cents
        );
        let nuevo = p;
        for (const l of nuevas) nuevo = meterUnidades(nuevo, l.cantidad, l.variante_id);
        nuevo = {
          ...nuevo,
          valor_inventario_usd_cents: efecto.valor_despues_usd_cents,
          costo_unitario_usd_cents: efecto.costo_despues_usd_cents,
          precio_venta_usd_cents: efecto.precio_despues_usd_cents,
          ganancia_unitaria_usd_cents: efecto.precio_despues_usd_cents - efecto.costo_despues_usd_cents,
        };
        db.productos = db.productos.map((x) => (x.id === pid ? nuevo : x));
        efectos.push({
          producto_id: pid,
          nombre: p.nombre,
          modo_precio: p.modo_precio,
          ...efecto,
          correccion_usd_cents: efecto.aplicado_usd_cents,
        });
      }
      const envio = input.envio_total_usd_cents;
      const otros = input.otros_costos_usd_cents ?? 0;
      db.compras = db.compras.map((c) =>
        c.id === compra.id
          ? {
              ...c,
              fecha: input.fecha,
              lineas,
              envio_total_usd_cents: envio,
              otros_costos_usd_cents: otros,
              ...totalesDe(lineas, envio, otros),
              peso_total_mlb: input.peso_total_mlb ?? 0,
              notas: input.notas,
              unidades_totales: lineas.reduce((a, l) => a + l.cantidad, 0),
              corregido_en: new Date().toISOString(),
            }
          : c
      );
      return ok({
        ...grupo(),
        codigo: compra.codigo,
        productos_afectados: efectos.length,
        productos: efectos,
        encargos_actualizados: 0,
      });
    },
    reconstruir: () =>
      ok({
        lineas: [],
        subtotal_productos_usd_cents: 0,
        tax_total_usd_cents: 0,
        envio_total_usd_cents: 0,
        otros_costos_usd_cents: 0,
        total_usd_cents: 0,
        unidades_totales: 0,
        avisos: ['El simulador no tiene paquetes de antes del cambio.'],
      }),
    completarReconstruccion: () => ok({ ...grupo(), lineas: 0 }),
    historialProducto: (producto_id) =>
      ok(
        db.compras.flatMap((c) =>
          c.lineas
            .filter((l) => l.producto_id === producto_id && l.destino === 'INVENTARIO')
            .map((linea) => ({ compra_id: c.id, codigo: c.codigo, fecha: c.fecha, estado: c.estado, linea }))
        )
      ),
    archivar: (id) => {
      const c = db.compras.find((x) => x.id === id);
      if (c?.estado === 'RECIBIDA' && c.lineas.length > 0) {
        return Promise.resolve({
          success: false as const,
          error: 'Este paquete ya está en el inventario y no se puede eliminar. Si algo está mal, usá "Corregir".',
        });
      }
      db.compras = db.compras.filter((x) => x.id !== id);
      return ok(grupo());
    },
  },
  ventas: {
    list: (filtros) => {
      let r = db.ventas.filter((v) => v.activo);
      if (filtros?.tipo) r = r.filter((v) => v.tipo === filtros.tipo);
      if (filtros?.estado) r = r.filter((v) => v.estado === filtros.estado);
      if (filtros?.cliente_id) r = r.filter((v) => v.cliente_id === filtros.cliente_id);
      if (filtros?.soloConSaldo) r = r.filter((v) => v.saldo_usd_cents > 0);

      // La ventana por fecha y el tope existen en el repositorio de verdad.
      // Si el simulador los ignora, la pantalla se ve distinta acá que en la
      // app real y probarla contra el simulador no prueba nada.
      if (filtros?.desde) r = r.filter((v) => (v.fecha || '') >= filtros.desde!);
      if (filtros?.hasta) r = r.filter((v) => (v.fecha || '') <= filtros.hasta!);

      r = [...r].sort((a, b) => {
        const cmp = (b.fecha || '').localeCompare(a.fecha || '');
        return cmp !== 0 ? cmp : b.id - a.id;
      });

      // El cursor: se sigue después de la última venta de la página anterior,
      // con el mismo orden (fecha, después id) que usa el repositorio real.
      const corte = filtros?.despuesDe;
      if (corte) {
        const desde = r.findIndex(
          (v) => v.fecha === corte.fecha && v.id === corte.id
        );
        r = desde === -1
          ? r.filter(
              (v) =>
                (v.fecha || '') < corte.fecha ||
                (v.fecha === corte.fecha && v.id < corte.id)
            )
          : r.slice(desde + 1);
      }

      if (filtros?.limite) r = r.slice(0, filtros.limite);

      return ok(r as Venta[]);
    },
    get: (id) => ok(db.ventas.find((v) => v.id === id) ?? null),
    crear: (input) => {
      const id = db.siguienteId++;
      const lineas = input.lineas.map((l, i) => {
        const producto = l.producto_id
          ? db.productos.find((p) => p.id === l.producto_id)
          : undefined;
        const precio = l.precio_unitario_usd_cents ?? producto?.precio_venta_usd_cents ?? 0;
        const costo =
          l.costo_estimado_unitario_usd_cents ?? producto?.costo_unitario_usd_cents ?? 0;
        return {
          id: i + 1,
          venta_id: id,
          producto_id: l.producto_id,
          variante_id: l.variante_id,
          descripcion: l.descripcion ?? producto?.nombre ?? 'Producto',
          cantidad: l.cantidad,
          precio_unitario_usd_cents: precio,
          costo_unitario_usd_cents: costo,
          subtotal_usd_cents: precio * l.cantidad,
          costo_total_usd_cents: costo * l.cantidad,
          es_paquete: l.es_paquete ?? false,
          orden: i,
        };
      });

      const total = lineas.reduce((a, l) => a + l.subtotal_usd_cents, 0);
      const costo = lineas.reduce((a, l) => a + l.costo_total_usd_cents, 0);
      const esEncargo = input.tipo === 'ENCARGO';

      // Descontar existencias, igual que el proceso main.
      if (!esEncargo) {
        for (const l of lineas) {
          if (!l.producto_id) continue;
          db.productos = db.productos.map((p) =>
            p.id === l.producto_id
              ? sinCambiarPrecio({
                  ...p,
                  existencias: Math.max(0, p.existencias - l.cantidad),
                  valor_inventario_usd_cents: Math.max(
                    0,
                    p.valor_inventario_usd_cents - l.costo_total_usd_cents
                  ),
                  variantes: p.variantes.map((v, i) =>
                    i === 0
                      ? { ...v, existencias: Math.max(0, v.existencias - l.cantidad) }
                      : v
                  ),
                })
              : p
          );
        }
      }

      let pagadoUsdCents = 0;
      const pagosIniciales: Pago[] = [];

      if (input.pago_inicial) {
        const tasa = db.parametros.tasa_cambio_cents;
        const montoInput =
          input.pago_inicial.monto_cents ??
          (input.pago_inicial.moneda === 'COR' ? Math.round((total * tasa) / 100) : total);
        const montoUsd =
          input.pago_inicial.moneda === 'COR' ? Math.round((montoInput * 100) / tasa) : montoInput;
        pagadoUsdCents = Math.min(total, Math.max(0, montoUsd));

        if (pagadoUsdCents > 0) {
          pagosIniciales.push({
            id: db.siguienteId++,
            venta_id: id,
            cliente_id: input.cliente_id,
            fecha: input.fecha,
            monto_usd_cents: pagadoUsdCents,
            monto_cor_cents:
              input.pago_inicial.moneda === 'COR'
                ? montoInput
                : Math.round((pagadoUsdCents * tasa) / 100),
            moneda: input.pago_inicial.moneda,
            tasa_cambio_cents: tasa,
            metodo: input.pago_inicial.metodo,
            referencia: input.pago_inicial.referencia,
            es_anticipo: esEncargo,
            activo: true,
          });
        }
      }

      const saldoUsdCents = Math.max(0, total - pagadoUsdCents);
      const anticipoEsperado = esEncargo
        ? Math.round((total * (input.anticipo_bp ?? db.parametros.anticipo_defecto_bp)) / 10000)
        : 0;

      db.ventas.unshift({
        id,
        codigo: `${esEncargo ? 'E' : 'V'}-${String(id).padStart(4, '0')}`,
        cliente_id: input.cliente_id,
        cliente_nombre: db.clientes.find((c) => c.id === input.cliente_id)?.nombre,
        fecha: input.fecha,
        tipo: input.tipo,
        estado: esEncargo
          ? estadoInicialEncargo({
              total_usd_cents: total,
              pagado_usd_cents: pagadoUsdCents,
              anticipo_esperado_usd_cents: anticipoEsperado,
            })
          : input.entregar_ahora === false
            ? 'PENDIENTE'
            : 'ENTREGADA',
        tasa_cambio_cents: db.parametros.tasa_cambio_cents,
        total_usd_cents: total,
        costo_total_usd_cents: costo,
        ganancia_usd_cents: total - costo,
        pagado_usd_cents: pagadoUsdCents,
        saldo_usd_cents: saldoUsdCents,
        anticipo_esperado_usd_cents: anticipoEsperado,
        notas: input.notas,
        activo: true,
        lineas,
        pagos: pagosIniciales,
        cuotas: input.plan_cuotas
          ? Array.from({ length: input.plan_cuotas.cantidad }, (_, i) => ({
              id: id * 100 + i,
              venta_id: id,
              numero: i + 1,
              fecha_vencimiento: sumarDiasAFecha(
                input.fecha,
                input.plan_cuotas!.cada_dias * i
              ),
              monto_usd_cents: Math.floor((saldoUsdCents > 0 ? saldoUsdCents : total) / input.plan_cuotas!.cantidad),
              pagado_usd_cents: 0,
            }))
          : [],
      });

      if (input.cliente_id) {
        const c = db.clientes.find((cl) => cl.id === input.cliente_id);
        if (c) {
          c.compras_count = (c.compras_count || 0) + 1;
          c.total_comprado_usd_cents = (c.total_comprado_usd_cents || 0) + total;
          c.saldo_pendiente_usd_cents = (c.saldo_pendiente_usd_cents || 0) + saldoUsdCents;
        }
      }

      return ok({ ...grupo(), id });
    },
    cambiarEstado: (id, estado) => {
      const venta = db.ventas.find((v) => v.id === id);
      // El mock no mueve inventario, pero imita el contrato: una venta con
      // productos que se anula movería mercadería y no sería reversible.
      const movioMercaderia =
        estado === 'CANCELADA' && (venta?.lineas ?? []).some((l) => l.producto_id);
      db.ventas = db.ventas.map((v) => (v.id === id ? { ...v, estado } : v));
      return ok({ ...grupo(), reversible: !movioMercaderia });
    },
  },
  pagos: {
    registrar: (input) => {
      const venta = db.ventas.find((v) => v.id === input.venta_id);
      if (!venta) return ok({ ...grupo(), pago_id: 0, pagado_usd_cents: 0, saldo_usd_cents: 0, excedente_usd_cents: 0, anticipo_cubierto: false });

      const montoUsd =
        input.moneda === 'COR'
          ? Math.round((input.monto_cents * 100) / venta.tasa_cambio_cents)
          : input.monto_cents;

      const pago: Pago = {
        id: db.siguienteId++,
        venta_id: venta.id,
        cliente_id: venta.cliente_id,
        fecha: input.fecha,
        monto_usd_cents: montoUsd,
        monto_cor_cents:
          input.moneda === 'COR'
            ? input.monto_cents
            : Math.round((montoUsd * venta.tasa_cambio_cents) / 100),
        moneda: input.moneda,
        tasa_cambio_cents: venta.tasa_cambio_cents,
        metodo: input.metodo,
        referencia: input.referencia,
        es_anticipo: venta.tipo === 'ENCARGO' && venta.pagos.length === 0,
        activo: true,
      };

      venta.pagos.push(pago);
      venta.pagado_usd_cents += montoUsd;
      venta.saldo_usd_cents = venta.total_usd_cents - venta.pagado_usd_cents;

      const cubierto =
        venta.anticipo_esperado_usd_cents > 0 &&
        venta.pagado_usd_cents >= venta.anticipo_esperado_usd_cents;
      if (venta.tipo === 'ENCARGO' && venta.estado === 'COTIZADA' && cubierto) {
        venta.estado = 'PENDIENTE';
      }

      return ok({
        ...grupo(),
        pago_id: pago.id,
        pagado_usd_cents: venta.pagado_usd_cents,
        saldo_usd_cents: venta.saldo_usd_cents,
        excedente_usd_cents: Math.max(0, -venta.saldo_usd_cents),
        anticipo_cubierto: cubierto,
      });
    },
    registrarAbonoCliente: (input) => {
      let targetVentaId = input.venta_id;
      if (!targetVentaId) {
        const ventaConSaldo = db.ventas
          .filter((v) => v.cliente_id === input.cliente_id && v.saldo_usd_cents > 0 && v.estado !== 'CANCELADA')
          .sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
        targetVentaId = ventaConSaldo?.id ?? 0;
      }
      const venta = db.ventas.find((v) => v.id === targetVentaId);
      if (!venta) return ok({ ...grupo(), pago_id: 0, pagado_usd_cents: 0, saldo_usd_cents: 0, excedente_usd_cents: 0, anticipo_cubierto: false });
      const montoUsd = input.moneda === 'COR'
        ? Math.round((input.monto_cents * 100) / venta.tasa_cambio_cents)
        : input.monto_cents;
      const pago: Pago = {
        id: db.siguienteId++,
        venta_id: venta.id,
        cliente_id: venta.cliente_id,
        fecha: input.fecha,
        monto_usd_cents: montoUsd,
        monto_cor_cents: input.moneda === 'COR' ? input.monto_cents : Math.round((montoUsd * venta.tasa_cambio_cents) / 100),
        moneda: input.moneda,
        tasa_cambio_cents: venta.tasa_cambio_cents,
        metodo: input.metodo,
        referencia: input.referencia,
        es_anticipo: false,
        activo: true,
      };
      venta.pagos.push(pago);
      venta.pagado_usd_cents += montoUsd;
      venta.saldo_usd_cents = venta.total_usd_cents - venta.pagado_usd_cents;
      return ok({ ...grupo(), pago_id: pago.id, pagado_usd_cents: venta.pagado_usd_cents, saldo_usd_cents: venta.saldo_usd_cents, excedente_usd_cents: Math.max(0, -venta.saldo_usd_cents), anticipo_cubierto: false });
    },
    listarPorCliente: (cliente_id) => {
      const todos = db.ventas
        .flatMap((v) =>
          v.pagos
            .filter((p) => (p.cliente_id === cliente_id || v.cliente_id === cliente_id) && p.activo !== false)
            .map((p) => ({
              ...p,
              venta_codigo: v.codigo,
            }))
        )
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
      return ok(todos);
    },
    anular: (pago_id) => {
      for (const v of db.ventas) {
        const pago = v.pagos.find((p) => p.id === pago_id);
        if (!pago) continue;
        v.pagos = v.pagos.filter((p) => p.id !== pago_id);
        v.pagado_usd_cents -= pago.monto_usd_cents;
        v.saldo_usd_cents = v.total_usd_cents - v.pagado_usd_cents;
      }
      return ok(grupo());
    },
    listarPorVenta: (venta_id) => {
      const v = db.ventas.find((x) => x.id === venta_id);
      return ok((v?.pagos || []).map((p) => ({ ...p, venta_codigo: v?.codigo })));
    },
    recientes: () =>
      ok(
        db.ventas
          .flatMap((v) =>
            v.pagos.map((p) => ({
              ...p,
              venta_codigo: v.codigo,
              cliente_nombre: db.clientes.find((c) => c.id === v.cliente_id)?.nombre || 'Cliente',
            }))
          )
          .slice(0, 20)
      ),
    enRango: (desde, hasta) =>
      ok(
        db.ventas
          .flatMap((v) =>
            v.pagos.map((p) => ({
              ...p,
              venta_codigo: v.codigo,
              cliente_nombre: db.clientes.find((c) => c.id === v.cliente_id)?.nombre || 'Cliente',
            }))
          )
          .filter((p) => (p.fecha || '') >= desde && (p.fecha || '') <= hasta)
          .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.id - a.id)
      ),
  },
  accesos: {
    list: () => ok([...db.accesos]),
    invitar: (correo) => {
      const limpio = correo.trim().toLowerCase();
      if (!limpio.includes('@')) throw new Error('Escribí un correo válido.');
      if (!db.accesos.some((a) => a.correo === limpio)) {
        db.accesos.push({ id: limpio, correo: limpio, pendiente: true, fijo: false });
      }
      return ok(grupo());
    },
    quitar: (id) => {
      db.accesos = db.accesos.filter((a) => a.id !== id || a.fijo);
      return ok(grupo());
    },
  },
  clientes: {
    list: (busqueda) => {
      if (!busqueda) return ok(db.clientes);
      return ok(
        db.clientes.filter((c) => algunoContiene([c.nombre, c.alias, c.telefono], busqueda))
      );
    },
    get: (id) => ok(db.clientes.find((c) => c.id === id) ?? null),
    guardar: (input) => {
      if (input.id) {
        db.clientes = db.clientes.map((c) => (c.id === input.id ? { ...c, ...input } : c));
        return ok({ ...grupo(), id: input.id });
      }
      const id = db.siguienteId++;
      db.clientes.push({
        ...input,
        id,
        activo: true,
        compras_count: 0,
        total_comprado_usd_cents: 0,
        saldo_pendiente_usd_cents: 0,
      });
      return ok({ ...grupo(), id });
    },
    archivar: (id) => {
      db.clientes = db.clientes.filter((c) => c.id !== id);
      return ok(grupo());
    },
  },
  panel: {
    cargar: () => ok(armarPanel()),
  },
  acceso: {
    tienePin: () => ok({ tiene: db.pin !== null }),
    establecerPin: (pin) => {
      db.pin = pin;
      return ok({ ok: true as const });
    },
    verificarPin: (pin) => ok({ valido: pin === db.pin }),
    cambiarPin: (_actual, nuevo) => {
      db.pin = nuevo;
      return ok({ ok: true as const });
    },
  },
  nube: {
    estado: () => ok({ configurado: true, conectado: true, correo: 'demo@navegador' }),
    configurar: (correo: string) => ok({ configurado: true, conectado: true, correo }),
    reconectar: () => ok({ configurado: true, conectado: true, correo: 'demo@navegador' }),
  },
  sistema: {
    deshacer: () => ok({ revertido: false, descripcion: 'Deshacer no funciona en el navegador.' }),
    info: () =>
      ok({
        version: '2.0.0 (navegador)',
        ruta_base_datos: 'memoria',
        tamano_base_datos_bytes: 0,
      }),
  },
  documentos: {
    imprimir: async () => {
      window.print();
      return ok({ ok: true });
    },
    guardarPdf: async () => {
      window.print();
      return ok({ guardado: true });
    },
  },
};

/**
 * Instala la API simulada solo si no existe la real. Dentro de Electron el
 * preload ya la puso y esto no hace nada.
 */
export function setupBrowserMockApi(): void {
  if (typeof window === 'undefined') return;
  if ((window as unknown as { api?: unknown }).api) return;

  db = almacenInicial();
  (window as unknown as { api: ApiPuente }).api = api;
  console.info('[Glow Heaven] API simulada activa: los datos son de ejemplo y no se guardan.');
}
