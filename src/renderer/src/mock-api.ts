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
} from '../../shared/types';
import { calcularPrecio } from '@core/precios';
import { costearPaquete } from '@core/costeo';

const ok = <T>(data: T): Promise<Resultado<T>> => Promise.resolve({ success: true, data });
const grupo = () => ({ evento_grupo_id: `g_${Math.random().toString(36).slice(2)}` });
const hoy = () => new Date().toISOString().slice(0, 10);

interface Almacen {
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
  const enCamino = db.compras
    .filter((c) => c.estado === 'EN_CAMINO')
    .reduce((a, c) => a + c.total_usd_cents, 0);
  const porCobrarTotal = db.ventas.reduce((a, v) => a + Math.max(0, v.saldo_usd_cents), 0);

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
      inversion_en_camino_usd_cents: enCamino,
      por_cobrar_usd_cents: porCobrarTotal,
      anticipos_por_entregar_usd_cents: db.ventas
        .filter((v) => v.tipo === 'ENCARGO' && v.estado !== 'ENTREGADA')
        .reduce((a, v) => a + v.pagado_usd_cents, 0),
      unidades_en_inventario: db.productos.reduce((a, p) => a + p.existencias, 0),
      productos_activos: db.productos.length,
    },
    ganancia_mes_actual: historico[5],
    ganancia_mes_anterior: historico[4],
    historico,
    por_cobrar:
      db.ventas.filter((v) => v.saldo_usd_cents > 0).map((v) => ({
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
    bajo_stock: bajoStock,
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
      db.categorias.push({ id, nombre: input.nombre, margen_defecto_bp: input.margen_defecto_bp, activa: true });
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
        const q = filtros.busqueda.toLowerCase();
        r = r.filter(
          (p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
        );
      }
      if (filtros?.categoria_id) r = r.filter((p) => p.categoria_id === filtros.categoria_id);
      if (filtros?.soloConStock) r = r.filter((p) => p.existencias > 0);
      if (filtros?.soloBajoStock)
        r = r.filter((p) => p.stock_minimo > 0 && p.existencias <= p.stock_minimo);
      return ok(r);
    },
    get: (id) => ok(db.productos.find((p) => p.id === id) ?? null),
    crear: (input) => {
      const id = db.siguienteId++;
      const existencias = input.stock_inicial?.cantidad ?? 0;
      const nuevo: ProductoConStock = recalcularProducto({
        id,
        codigo: `P-${String(id).padStart(4, '0')}`,
        nombre: input.nombre,
        categoria_id: input.categoria_id,
        categoria_nombre: db.categorias.find((c) => c.id === input.categoria_id)?.nombre,
        tiene_variantes: input.tiene_variantes ?? false,
        valor_inventario_usd_cents:
          existencias * (input.stock_inicial?.costo_unitario_usd_cents ?? 0),
        costo_unitario_usd_cents: input.stock_inicial?.costo_unitario_usd_cents ?? 0,
        modo_precio: input.modo_precio ?? 'MARGEN',
        margen_bp: input.margen_bp,
        multiplicador_bp: input.multiplicador_bp,
        precio_manual_usd_cents: input.precio_manual_usd_cents,
        precio_venta_usd_cents: 0,
        stock_minimo: input.stock_minimo ?? 2,
        peso_unitario_mlb: input.peso_unitario_mlb ?? 0,
        unidades_por_paquete: input.unidades_por_paquete,
        packs_comprados: input.packs_comprados,
        costo_pack_usa_usd_cents: input.costo_pack_usa_usd_cents,
        aplicar_tax_usa: input.aplicar_tax_usa,
        paquete_id: input.paquete_id,
        foto: input.foto,
        notas: input.notas,
        activo: true,
        existencias,
        ganancia_unitaria_usd_cents: 0,
        variantes:
          input.tiene_variantes && input.variantes?.length
            ? input.variantes.map((v, i) => ({
                id: id * 10 + i,
                producto_id: id,
                talla: v.talla,
                color: v.color,
                existencias: v.existencias ?? 0,
                activo: true,
              }))
            : [{ id: id * 10, producto_id: id, existencias, activo: true }],
      });
      db.productos.push(nuevo);
      return ok({ ...grupo(), id });
    },
    actualizar: (input) => {
      db.productos = db.productos.map((p) =>
        p.id === input.id ? recalcularProducto({ ...p, ...input } as ProductoConStock) : p
      );
      return ok(grupo());
    },
    ajustarStock: (variante_id, existencias) => {
      db.productos = db.productos.map((p) => {
        if (!p.variantes.some((v) => v.id === variante_id)) return p;
        const variantes = p.variantes.map((v) =>
          v.id === variante_id ? { ...v, existencias } : v
        );
        const total = variantes.reduce((a, v) => a + v.existencias, 0);
        return recalcularProducto({
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
  },
  compras: {
    list: () => ok(db.compras as Compra[]),
    get: (id) => ok(db.compras.find((c) => c.id === id) ?? null),
    guardar: (input) => {
      const tieneLineas = input.lineas && input.lineas.length > 0;
      const costeo = tieneLineas
        ? costearPaquete(
            input.lineas.map((l, i) => ({
              id: i + 1,
              cantidad: l.cantidad,
              precio_linea_usd_cents: l.precio_linea_usd_cents,
              peso_linea_mlb: l.peso_linea_mlb,
              tax_linea_usd_cents: l.tax_linea_usd_cents,
            })),
            {
              tax_bp: db.parametros.tax_bp,
              envio_total_usd_cents: input.envio_total_usd_cents,
              otros_costos_usd_cents: input.otros_costos_usd_cents,
              tax_total_override_usd_cents: input.tax_total_override_usd_cents,
            }
          )
        : null;

      const id = input.id ?? db.siguienteId++;
      const envioFinal = costeo ? costeo.envio_total_usd_cents : input.envio_total_usd_cents;
      const otrosFinal = costeo ? costeo.otros_costos_usd_cents : (input.otros_costos_usd_cents || 0);
      const subtotalFinal = costeo ? costeo.subtotal_productos_usd_cents : 0;
      const taxFinal = costeo ? costeo.tax_total_usd_cents : (input.tax_total_override_usd_cents || 0);
      const totalFinal = costeo ? costeo.total_pagado_usd_cents : envioFinal + otrosFinal + taxFinal;
      const pesoFinal = costeo ? costeo.peso_total_mlb : (input.peso_total_mlb || 0);

      const compra: CompraCompleta = {
        id,
        codigo: `PQ-${String(id).padStart(4, '0')}`,
        fecha: input.fecha,
        estado: input.estado ?? (tieneLineas ? 'BORRADOR' : 'RECIBIDA'),
        envio_total_usd_cents: envioFinal,
        otros_costos_usd_cents: otrosFinal,
        subtotal_productos_usd_cents: subtotalFinal,
        tax_total_usd_cents: taxFinal,
        total_usd_cents: totalFinal,
        peso_total_mlb: pesoFinal,
        tasa_cambio_cents: db.parametros.tasa_cambio_cents,
        notas: input.notas,
        activo: true,
        unidades_totales: costeo ? costeo.unidades_totales : 0,
        lineas: tieneLineas
          ? input.lineas.map((l, i) => ({
              id: i + 1,
              compra_id: id,
              descripcion: l.descripcion,
              cantidad: costeo!.lineas[i].cantidad,
              precio_linea_usd_cents: costeo!.lineas[i].precio_linea_usd_cents,
              tax_linea_usd_cents: costeo!.lineas[i].tax_linea_usd_cents,
              peso_linea_mlb: costeo!.lineas[i].peso_linea_mlb,
              envio_asignado_usd_cents: costeo!.lineas[i].envio_asignado_usd_cents,
              otros_asignados_usd_cents: costeo!.lineas[i].otros_asignados_usd_cents,
              costo_linea_usd_cents: costeo!.lineas[i].costo_linea_usd_cents,
              costo_unitario_usd_cents: costeo!.lineas[i].costo_unitario_usd_cents,
              destino: l.destino,
              venta_id: l.venta_id,
              orden: i,
              precio_venta_usd_cents: l.precio_venta_usd_cents,
              es_multipack: l.es_multipack,
              packs_comprados: l.packs_comprados,
              unidades_por_pack: l.unidades_por_pack,
              precio_por_pack_usd_cents: l.precio_por_pack_usd_cents,
            }))
          : [],
      };

      db.compras = [compra, ...db.compras.filter((c) => c.id !== id)];
      return ok({ ...grupo(), id });
    },
    previsualizar: (input) =>
      ok(
        costearPaquete(
          input.lineas.map((l, i) => ({
            id: i + 1,
            cantidad: l.cantidad,
            precio_linea_usd_cents: l.precio_linea_usd_cents,
            peso_linea_mlb: l.peso_linea_mlb,
            tax_linea_usd_cents: l.tax_linea_usd_cents,
          })),
          {
            tax_bp: db.parametros.tax_bp,
            envio_total_usd_cents: input.envio_total_usd_cents,
            otros_costos_usd_cents: input.otros_costos_usd_cents,
            tax_total_override_usd_cents: input.tax_total_override_usd_cents,
          }
        )
      ),
    recibir: (id) => {
      const compra = db.compras.find((c) => c.id === id);
      if (!compra) return ok({ ...grupo(), productos_afectados: 0 });

      let afectados = 0;
      for (const linea of compra.lineas) {
        if (linea.destino !== 'INVENTARIO') continue;
        afectados++;
        const existente = db.productos.find(
          (p) => p.nombre.toLowerCase() === linea.descripcion.toLowerCase()
        );
        if (existente) {
          db.productos = db.productos.map((p) =>
            p.id === existente.id
              ? recalcularProducto({
                  ...p,
                  existencias: p.existencias + linea.cantidad,
                  valor_inventario_usd_cents:
                    p.valor_inventario_usd_cents + linea.costo_linea_usd_cents,
                  modo_precio: linea.precio_venta_usd_cents ? 'MANUAL' : p.modo_precio,
                  precio_manual_usd_cents: linea.precio_venta_usd_cents ?? p.precio_manual_usd_cents,
                  precio_venta_usd_cents: linea.precio_venta_usd_cents ?? p.precio_venta_usd_cents,
                  unidades_por_paquete: linea.unidades_por_pack ?? p.unidades_por_paquete,
                  variantes: p.variantes.map((v, i) =>
                    i === 0 ? { ...v, existencias: v.existencias + linea.cantidad } : v
                  ),
                })
              : p
          );
        } else {
          const nuevoId = db.siguienteId++;
          db.productos.push(
            recalcularProducto({
              id: nuevoId,
              codigo: `P-${String(nuevoId).padStart(4, '0')}`,
              nombre: linea.descripcion,
              tiene_variantes: false,
              valor_inventario_usd_cents: linea.costo_linea_usd_cents,
              costo_unitario_usd_cents: linea.costo_unitario_usd_cents,
              modo_precio: linea.precio_venta_usd_cents ? 'MANUAL' : 'MARGEN',
              precio_manual_usd_cents: linea.precio_venta_usd_cents,
              precio_venta_usd_cents: linea.precio_venta_usd_cents ?? 0,
              stock_minimo: db.parametros.stock_minimo_defecto,
              peso_unitario_mlb: Math.round(linea.peso_linea_mlb / linea.cantidad),
              unidades_por_paquete: linea.unidades_por_pack,
              activo: true,
              existencias: linea.cantidad,
              ganancia_unitaria_usd_cents: 0,
              variantes: [
                { id: nuevoId * 10, producto_id: nuevoId, existencias: linea.cantidad, activo: true },
              ],
            })
          );
        }
      }

      db.compras = db.compras.map((c) => (c.id === id ? { ...c, estado: 'RECIBIDA' } : c));
      return ok({ ...grupo(), productos_afectados: afectados });
    },
    archivar: (id) => {
      db.compras = db.compras.filter((c) => c.id !== id);
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
              ? recalcularProducto({
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

      db.ventas.unshift({
        id,
        codigo: `${esEncargo ? 'E' : 'V'}-${String(id).padStart(4, '0')}`,
        cliente_id: input.cliente_id,
        cliente_nombre: db.clientes.find((c) => c.id === input.cliente_id)?.nombre,
        fecha: input.fecha,
        tipo: input.tipo,
        estado: esEncargo ? (saldoUsdCents === 0 ? 'PENDIENTE' : 'COTIZADA') : input.entregar_ahora === false ? 'PENDIENTE' : 'ENTREGADA',
        tasa_cambio_cents: db.parametros.tasa_cambio_cents,
        total_usd_cents: total,
        costo_total_usd_cents: costo,
        ganancia_usd_cents: total - costo,
        pagado_usd_cents: pagadoUsdCents,
        saldo_usd_cents: saldoUsdCents,
        anticipo_esperado_usd_cents: esEncargo
          ? Math.round((total * (input.anticipo_bp ?? db.parametros.anticipo_defecto_bp)) / 10000)
          : 0,
        notas: input.notas,
        activo: true,
        lineas,
        pagos: pagosIniciales,
        cuotas: input.plan_cuotas
          ? Array.from({ length: input.plan_cuotas.cantidad }, (_, i) => ({
              id: id * 100 + i,
              venta_id: id,
              numero: i + 1,
              fecha_vencimiento: (() => {
                const d = new Date(`${input.fecha}T00:00:00`);
                d.setDate(d.getDate() + input.plan_cuotas!.cada_dias * i);
                return d.toISOString().slice(0, 10);
              })(),
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
      db.ventas = db.ventas.map((v) => (v.id === id ? { ...v, estado } : v));
      return ok(grupo());
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
    recientes: () => ok(db.ventas.flatMap((v) => v.pagos).slice(0, 20)),
  },
  clientes: {
    list: (busqueda) => {
      if (!busqueda) return ok(db.clientes);
      const q = busqueda.toLowerCase();
      return ok(
        db.clientes.filter(
          (c) => c.nombre.toLowerCase().includes(q) || (c.telefono ?? '').includes(q)
        )
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
