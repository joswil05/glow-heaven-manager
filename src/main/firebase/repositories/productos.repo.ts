import {
  doc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
} from 'firebase/firestore';
import {
  getFirestoreDb,
  siguienteId,
  idOrdenable,
  leerDoc,
  aplicarLote,
  sinUndefined,
  type OperacionLote,
} from '../client';
import { calcularPrecio } from '../../../core/precios';
import { costoUnitario, registrarSalida, ajustarExistencias } from '../../../core/inventario';
import { ParametrosRepoFirestore } from './parametros.repo';
import { EventosRepoFirestore } from './eventos.repo';
import type {
  ProductoConStock,
  ProductoVariante,
  ModoPrecio,
  MovimientoInventario,
  Categoria,
  ParametrosSistema,
} from '../../../shared/types';

export interface VarianteInput {
  id?: number;
  talla?: string;
  color?: string;
  existencias?: number;
}

export interface CrearProductoInput {
  nombre: string;
  categoria_id?: number;
  tiene_variantes?: boolean;
  variantes?: VarianteInput[];
  modo_precio?: ModoPrecio;
  margen_bp?: number;
  multiplicador_bp?: number;
  precio_manual_usd_cents?: number;
  costo_unitario_usd_cents?: number;
  precio_venta_usd_cents?: number;
  stock_minimo?: number;
  peso_unitario_mlb?: number;
  unidades_por_paquete?: number;
  packs_comprados?: number;
  costo_pack_usa_usd_cents?: number;
  aplicar_tax_usa?: boolean;
  paquete_id?: number;
  /** Miniatura como data URL, o cadena vacía para quitarla. */
  foto?: string;
  notas?: string;
  stock_inicial?: { cantidad: number; costo_unitario_usd_cents: number };
}

export type ActualizarProductoInput = Partial<CrearProductoInput> & { id: number };

export interface FiltrosProducto {
  busqueda?: string;
  categoria_id?: number;
  soloConStock?: boolean;
  soloBajoStock?: boolean;
  soloInactivos?: boolean;
  incluirInactivos?: boolean;
}

export interface ProductoDoc {
  id: number;
  codigo: string;
  nombre: string;
  categoria_id?: number;
  tiene_variantes: boolean;
  variantes: ProductoVariante[];
  valor_inventario_usd_cents: number;
  costo_unitario_usd_cents: number;
  modo_precio: ModoPrecio;
  margen_bp?: number;
  multiplicador_bp?: number;
  precio_manual_usd_cents?: number;
  precio_venta_usd_cents: number;
  stock_minimo: number;
  peso_unitario_mlb: number;
  unidades_por_paquete?: number;
  packs_comprados?: number;
  costo_pack_usa_usd_cents?: number;
  aplicar_tax_usa?: boolean;
  paquete_id?: number;
  foto?: string;
  notas?: string;
  activo: boolean;
  creado_en?: string;
  actualizado_en?: string;
}

function existenciasDe(p: Pick<ProductoDoc, 'variantes'>): number {
  return (p.variantes || [])
    .filter((v) => v.activo !== false)
    .reduce((sum, v) => sum + (v.existencias || 0), 0);
}

function aProductoConStock(p: ProductoDoc, catMap: Map<number, string>): ProductoConStock {
  const variantesActivas = (p.variantes || []).filter((v) => v.activo !== false);
  const existencias = variantesActivas.reduce((s, v) => s + (v.existencias || 0), 0);
  const valorInventario =
    p.valor_inventario_usd_cents && p.valor_inventario_usd_cents > 0
      ? p.valor_inventario_usd_cents
      : existencias * (p.costo_unitario_usd_cents || 0);

  return {
    ...p,
    valor_inventario_usd_cents: valorInventario,
    variantes: variantesActivas,
    categoria_nombre: p.categoria_id ? catMap.get(p.categoria_id) : undefined,
    existencias,
    ganancia_unitaria_usd_cents:
      (p.precio_venta_usd_cents ?? 0) - (p.costo_unitario_usd_cents ?? 0),
  };
}

/** Margen que aplica a un producto: el suyo, el de su categoría, o el global. */
function margenEfectivo(
  p: Pick<ProductoDoc, 'margen_bp' | 'categoria_id'>,
  categorias: Categoria[],
  parametros: ParametrosSistema
): number {
  if (p.margen_bp !== undefined && p.margen_bp !== null) return p.margen_bp;
  const cat = p.categoria_id ? categorias.find((c) => c.id === p.categoria_id) : undefined;
  return cat?.margen_defecto_bp ?? parametros.margen_defecto_bp;
}

export class ProductosRepoFirestore {
  static async listar(filtros: FiltrosProducto = {}): Promise<ProductoConStock[]> {
    const db = getFirestoreDb();
    const filtroActivo = filtros.soloInactivos
      ? where('activo', '==', false)
      : filtros.incluirInactivos
        ? undefined
        : where('activo', '==', true);

    const [snap, categorias] = await Promise.all([
      getDocs(
        filtroActivo
          ? query(collection(db, 'productos'), filtroActivo)
          : query(collection(db, 'productos'))
      ),
      ParametrosRepoFirestore.getCategorias(),
    ]);

    const catMap = new Map(categorias.map((c) => [c.id, c.nombre]));
    let productos = snap.docs.map((d) => aProductoConStock(d.data() as ProductoDoc, catMap));

    if (filtros.busqueda) {
      const q = filtros.busqueda.toLowerCase().trim();
      productos = productos.filter(
        (p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q)
      );
    }
    if (filtros.categoria_id) {
      productos = productos.filter((p) => p.categoria_id === filtros.categoria_id);
    }
    if (filtros.soloConStock) {
      productos = productos.filter((p) => p.existencias > 0);
    }
    if (filtros.soloBajoStock) {
      productos = productos.filter((p) => p.stock_minimo > 0 && p.existencias <= p.stock_minimo);
    }

    return productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  static async getById(id: number): Promise<ProductoConStock | null> {
    const [p, categorias] = await Promise.all([
      leerDoc<ProductoDoc>('productos', id),
      ParametrosRepoFirestore.getCategorias(),
    ]);
    if (!p || !p.activo) return null;
    return aProductoConStock(p, new Map(categorias.map((c) => [c.id, c.nombre])));
  }

  static async crear(input: CrearProductoInput, evento_grupo_id: string): Promise<number> {
    const [nuevoId, parametros, categorias] = await Promise.all([
      siguienteId('productos'),
      ParametrosRepoFirestore.getParametros(),
      ParametrosRepoFirestore.getCategorias(),
    ]);

    const codigo = `P-${String(nuevoId).padStart(4, '0')}`;
    const stockInicial = input.stock_inicial;
    let valorInicial = stockInicial
      ? Math.max(0, Math.round(stockInicial.cantidad * stockInicial.costo_unitario_usd_cents))
      : 0;

    const variantes: ProductoVariante[] =
      input.tiene_variantes && input.variantes && input.variantes.length > 0
        ? input.variantes.map((v, i) => ({
            id: i + 1,
            producto_id: nuevoId,
            talla: v.talla?.trim() || undefined,
            color: v.color?.trim() || undefined,
            existencias: Math.max(0, Math.round(v.existencias ?? 0)),
            activo: true,
          }))
        : [
            {
              id: 1,
              producto_id: nuevoId,
              existencias: stockInicial?.cantidad ?? 0,
              activo: true,
            },
          ];

    const totalExistencias = variantes.reduce((s, v) => s + v.existencias, 0);
    let costo = costoUnitario({
      existencias: totalExistencias,
      valor_total_usd_cents: valorInicial,
    });

    const costoEntrante = input.costo_unitario_usd_cents ?? stockInicial?.costo_unitario_usd_cents;
    if (costo === 0 && costoEntrante && costoEntrante > 0) {
      costo = Math.max(0, Math.round(costoEntrante));
      if (valorInicial === 0 && totalExistencias > 0) {
        valorInicial = totalExistencias * costo;
      }
    }

    const modoPrecio = input.modo_precio ?? (input.precio_venta_usd_cents ? 'MANUAL' : 'MARGEN');
    const precioManual =
      input.precio_manual_usd_cents !== undefined
        ? input.precio_manual_usd_cents
        : input.precio_venta_usd_cents;

    const calculo = calcularPrecio({
      costo_unitario_usd_cents: costo,
      modo: modoPrecio,
      margen_bp: margenEfectivo(
        { margen_bp: input.margen_bp, categoria_id: input.categoria_id },
        categorias,
        parametros
      ),
      multiplicador_bp: input.multiplicador_bp,
      precio_manual_usd_cents: precioManual,
      paso_redondeo_usd_cents: parametros.paso_redondeo_usd_cents,
    });

    const now = new Date().toISOString();
    const nuevoProducto: ProductoDoc = {
      id: nuevoId,
      codigo,
      nombre: input.nombre.trim(),
      categoria_id: input.categoria_id,
      tiene_variantes: Boolean(input.tiene_variantes),
      variantes: variantes.map((v) => sinUndefined(v as unknown as Record<string, unknown>)) as unknown as ProductoVariante[],
      valor_inventario_usd_cents: valorInicial,
      costo_unitario_usd_cents: costo,
      modo_precio: modoPrecio,
      margen_bp: input.margen_bp,
      multiplicador_bp: input.multiplicador_bp,
      precio_manual_usd_cents: precioManual,
      precio_venta_usd_cents: calculo.precio_usd_cents,
      stock_minimo: input.stock_minimo ?? parametros.stock_minimo_defecto,
      peso_unitario_mlb: input.peso_unitario_mlb ?? 0,
      unidades_por_paquete: input.unidades_por_paquete,
      packs_comprados: input.packs_comprados,
      costo_pack_usa_usd_cents: input.costo_pack_usa_usd_cents,
      aplicar_tax_usa: input.aplicar_tax_usa,
      paquete_id: input.paquete_id,
      foto: input.foto?.trim() || undefined,
      notas: input.notas?.trim() || undefined,
      activo: true,
      creado_en: now,
      actualizado_en: now,
    };

    const operaciones: OperacionLote[] = [
      {
        coleccion: 'productos',
        id: nuevoId,
        merge: false,
        datos: sinUndefined(nuevoProducto as unknown as Record<string, unknown>),
      },
    ];

    if (stockInicial && stockInicial.cantidad > 0) {
      operaciones.push(
        await this.operacionMovimiento({
          producto_id: nuevoId,
          variante_id: variantes[0].id,
          tipo: 'ENTRADA',
          cantidad: stockInicial.cantidad,
          costo_total_usd_cents: valorInicial,
          existencias_despues: totalExistencias,
          referencia_tipo: input.paquete_id ? 'COMPRA' : 'AJUSTE',
          referencia_id: input.paquete_id,
          detalle: input.paquete_id ? `Paquete #${input.paquete_id}` : 'Existencias iniciales',
        })
      );
    }

    await aplicarLote(operaciones);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'productos',
      entidad_id: nuevoId,
      tipo_evento: 'CREACION',
      detalle: `Producto '${nuevoProducto.nombre}' agregado al inventario`,
    });

    return nuevoId;
  }

  static async actualizar(
    input: ActualizarProductoInput,
    evento_grupo_id: string
  ): Promise<void> {
    const [p, parametros, categorias] = await Promise.all([
      leerDoc<ProductoDoc>('productos', input.id),
      ParametrosRepoFirestore.getParametros(),
      ParametrosRepoFirestore.getCategorias(),
    ]);
    if (!p) throw new Error(`El producto #${input.id} no existe.`);

    const anterior = { ...p } as unknown as Record<string, unknown>;

    const nuevoModo = input.modo_precio ?? p.modo_precio;
    const nuevaCategoria =
      input.categoria_id !== undefined ? input.categoria_id : p.categoria_id;
    const nuevoMargen = input.margen_bp !== undefined ? input.margen_bp : p.margen_bp;

    // Las existencias no se editan acá: cambian con ventas, paquetes y el
    // ajuste manual, que sí dejan movimiento. Editar el producto solo puede
    // agregar o quitar variantes.
    let variantes = p.variantes || [];
    if (input.variantes) {
      const porClave = new Map(
        variantes.map((v) => [`${v.talla ?? ''}|${v.color ?? ''}`.toLowerCase(), v])
      );
      let maxId = variantes.reduce((max, v) => Math.max(max, v.id), 0);

      variantes = input.variantes.map((v) => {
        const clave = `${v.talla?.trim() ?? ''}|${v.color?.trim() ?? ''}`.toLowerCase();
        const existente = porClave.get(clave);
        return {
          id: existente?.id ?? v.id ?? ++maxId,
          producto_id: input.id,
          talla: v.talla?.trim() || undefined,
          color: v.color?.trim() || undefined,
          existencias: existente ? existente.existencias : Math.max(0, Math.round(v.existencias ?? 0)),
          activo: true,
        };
      });
    }

    const existencias = existenciasDe({ variantes });

    // Si se especifica un costo unitario explícito (ej: corrección de precio de compra al editar),
    // se toma ese valor y se recalcula el valor total del inventario.
    let costo: number;
    let nuevoValorInventario = p.valor_inventario_usd_cents ?? 0;

    if (input.costo_unitario_usd_cents !== undefined) {
      costo = Math.max(0, Math.round(input.costo_unitario_usd_cents));
      nuevoValorInventario = existencias * costo;
    } else {
      costo = costoUnitario({
        existencias,
        valor_total_usd_cents: p.valor_inventario_usd_cents ?? 0,
      });
      // Si las existencias son 0, mantener el costo unitario previo del producto
      if (costo === 0 && p.costo_unitario_usd_cents) {
        costo = p.costo_unitario_usd_cents;
      }
      // Si el inventario no tenía valor registrado pero hay existencias y costo:
      if (nuevoValorInventario <= 0 && existencias > 0 && costo > 0) {
        nuevoValorInventario = existencias * costo;
      }
    }

    const calculo = calcularPrecio({
      costo_unitario_usd_cents: costo,
      modo: nuevoModo,
      margen_bp: margenEfectivo(
        { margen_bp: nuevoMargen, categoria_id: nuevaCategoria },
        categorias,
        parametros
      ),
      multiplicador_bp:
        input.multiplicador_bp !== undefined ? input.multiplicador_bp : p.multiplicador_bp,
      precio_manual_usd_cents:
        input.precio_manual_usd_cents !== undefined
          ? input.precio_manual_usd_cents
          : p.precio_manual_usd_cents,
      paso_redondeo_usd_cents: parametros.paso_redondeo_usd_cents,
    });

    await aplicarLote([
      {
        coleccion: 'productos',
        id: input.id,
        merge: true,
        datos: sinUndefined({
          nombre: input.nombre !== undefined ? input.nombre.trim() : p.nombre,
          categoria_id: nuevaCategoria ?? null,
          tiene_variantes:
            input.tiene_variantes !== undefined ? input.tiene_variantes : p.tiene_variantes,
          variantes: variantes.map((v) =>
            sinUndefined(v as unknown as Record<string, unknown>)
          ),
          modo_precio: nuevoModo,
          margen_bp: nuevoMargen ?? null,
          multiplicador_bp:
            (input.multiplicador_bp !== undefined ? input.multiplicador_bp : p.multiplicador_bp) ??
            null,
          precio_manual_usd_cents:
            (input.precio_manual_usd_cents !== undefined
              ? input.precio_manual_usd_cents
              : p.precio_manual_usd_cents) ?? null,
          costo_unitario_usd_cents: costo,
          valor_inventario_usd_cents: nuevoValorInventario,
          precio_venta_usd_cents: calculo.precio_usd_cents,
          stock_minimo: input.stock_minimo !== undefined ? input.stock_minimo : p.stock_minimo,
          peso_unitario_mlb:
            input.peso_unitario_mlb !== undefined ? input.peso_unitario_mlb : p.peso_unitario_mlb,
          unidades_por_paquete:
            input.unidades_por_paquete !== undefined
              ? input.unidades_por_paquete
              : (p.unidades_por_paquete ?? null),
          packs_comprados:
            input.packs_comprados !== undefined
              ? input.packs_comprados
              : (p.packs_comprados ?? null),
          costo_pack_usa_usd_cents:
            input.costo_pack_usa_usd_cents !== undefined
              ? input.costo_pack_usa_usd_cents
              : (p.costo_pack_usa_usd_cents ?? null),
          aplicar_tax_usa:
            input.aplicar_tax_usa !== undefined
              ? input.aplicar_tax_usa
              : (p.aplicar_tax_usa ?? null),
          paquete_id:
            input.paquete_id !== undefined ? input.paquete_id : (p.paquete_id ?? null),
          foto: input.foto !== undefined ? input.foto.trim() || null : (p.foto ?? null),
          notas: input.notas !== undefined ? input.notas?.trim() || null : (p.notas ?? null),
          actualizado_en: new Date().toISOString(),
        }),
      },
    ]);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'productos',
      entidad_id: input.id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior,
      detalle: `Producto '${input.nombre ?? p.nombre}' actualizado`,
    });
  }

  /**
   * Conteo físico: fija las existencias de una variante a un número exacto.
   *
   * La versión anterior le pasaba el delta a `ajustarExistencias`, que espera
   * el total objetivo. Subir una variante de 3 a 5 en un producto con 10
   * unidades recalculaba el valor del inventario como si quedaran 2, y se
   * perdía la mayor parte del capital registrado.
   */
  static async ajustar(
    variante_id: number,
    nuevasExistencias: number,
    evento_grupo_id: string,
    motivo?: string,
    producto_id?: number
  ): Promise<void> {
    const db = getFirestoreDb();

    // Con el id del producto se va directo. Sin él hay que buscarlo, que es
    // una lectura de toda la colección: la interfaz siempre lo manda.
    let productoId = producto_id;
    if (productoId === undefined) {
      const snap = await getDocs(query(collection(db, 'productos'), where('activo', '==', true)));
      const encontrado = snap.docs.find((d) =>
        ((d.data() as ProductoDoc).variantes || []).some((v) => v.id === variante_id)
      );
      if (!encontrado) throw new Error(`Variante #${variante_id} no encontrada.`);
      productoId = Number(encontrado.id);
    }

    const [parametros, categorias] = await Promise.all([
      ParametrosRepoFirestore.getParametros(),
      ParametrosRepoFirestore.getCategorias(),
    ]);

    const productoRef = doc(db, 'productos', String(productoId));
    let resultado: { anterior: Record<string, unknown>; movimiento: OperacionLote } | null = null;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(productoRef);
      if (!snap.exists()) throw new Error(`El producto #${productoId} no existe.`);

      const p = snap.data() as ProductoDoc;
      const anterior = { ...p } as unknown as Record<string, unknown>;

      const idx = (p.variantes || []).findIndex((v) => v.id === variante_id);
      if (idx === -1) throw new Error(`Variante #${variante_id} no encontrada.`);

      const existenciasViejas = p.variantes[idx].existencias ?? 0;
      const objetivoVariante = Math.max(0, Math.round(nuevasExistencias));
      if (objetivoVariante === existenciasViejas) return;

      const totalAntes = existenciasDe(p);
      const totalDespues = totalAntes - existenciasViejas + objetivoVariante;

      // `ajustarExistencias` recibe el TOTAL objetivo del producto y costo de respaldo si estaba en cero.
      const nuevoEstado = ajustarExistencias(
        { existencias: totalAntes, valor_total_usd_cents: p.valor_inventario_usd_cents ?? 0 },
        totalDespues,
        p.costo_unitario_usd_cents
      );

      const variantes = p.variantes.map((v, i) =>
        i === idx ? { ...v, existencias: objetivoVariante } : v
      );

      let costo = costoUnitario({
        existencias: totalDespues,
        valor_total_usd_cents: nuevoEstado.valor_total_usd_cents,
      });
      if (costo === 0 && p.costo_unitario_usd_cents && p.costo_unitario_usd_cents > 0) {
        costo = p.costo_unitario_usd_cents;
      }

      const calculo = calcularPrecio({
        costo_unitario_usd_cents: costo,
        modo: p.modo_precio,
        margen_bp: margenEfectivo(p, categorias, parametros),
        multiplicador_bp: p.multiplicador_bp,
        precio_manual_usd_cents: p.precio_manual_usd_cents,
        paso_redondeo_usd_cents: parametros.paso_redondeo_usd_cents,
      });

      tx.set(
        productoRef,
        sinUndefined({
          variantes: variantes.map((v) => sinUndefined(v as unknown as Record<string, unknown>)),
          valor_inventario_usd_cents: nuevoEstado.valor_total_usd_cents,
          costo_unitario_usd_cents: costo,
          precio_venta_usd_cents: calculo.precio_usd_cents,
          actualizado_en: new Date().toISOString(),
        }),
        { merge: true }
      );

      resultado = {
        anterior,
        movimiento: await this.operacionMovimiento({
          producto_id: productoId!,
          variante_id,
          tipo: 'AJUSTE',
          cantidad: objetivoVariante - existenciasViejas,
          costo_total_usd_cents: 0,
          existencias_despues: totalDespues,
          referencia_tipo: 'AJUSTE',
          detalle: motivo ?? 'Conteo manual',
        }),
      };
    });

    if (!resultado) return;
    const { anterior, movimiento } = resultado;

    await aplicarLote([movimiento]);
    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'productos',
      entidad_id: productoId,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior,
      detalle: `Existencias ajustadas a ${nuevasExistencias}`,
    });
  }

  /**
   * Entrada de mercadería, en una transacción.
   *
   * Leer y escribir por separado pierde actualizaciones: dos entradas al
   * mismo producto casi a la vez guardan cada una el total que leyó, y una
   * de las dos desaparece.
   */
  static async entrada(params: {
    producto_id: number;
    variante_id?: number;
    cantidad: number;
    costo_total_usd_cents: number;
    referencia_tipo?: string;
    referencia_id?: number;
    detalle?: string;
  }): Promise<void> {
    const cantidad = Math.max(0, Math.round(params.cantidad));
    if (cantidad === 0) return;

    const db = getFirestoreDb();
    const [parametros, categorias] = await Promise.all([
      ParametrosRepoFirestore.getParametros(),
      ParametrosRepoFirestore.getCategorias(),
    ]);

    const productoRef = doc(db, 'productos', String(params.producto_id));
    let existenciasDespues = 0;
    let varianteUsada = 0;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(productoRef);
      if (!snap.exists()) throw new Error(`El producto #${params.producto_id} no existe.`);

      const p = snap.data() as ProductoDoc;
      const variantes = [...(p.variantes || [])];
      const varianteId =
        params.variante_id ?? variantes.find((v) => v.activo !== false)?.id ?? 1;
      varianteUsada = varianteId;

      const idx = variantes.findIndex((v) => v.id === varianteId);
      if (idx === -1) {
        variantes.push({
          id: varianteId,
          producto_id: params.producto_id,
          existencias: cantidad,
          activo: true,
        });
      } else {
        variantes[idx] = {
          ...variantes[idx],
          existencias: (variantes[idx].existencias || 0) + cantidad,
        };
      }

      const nuevoValor =
        (p.valor_inventario_usd_cents || 0) +
        Math.max(0, Math.round(params.costo_total_usd_cents));
      existenciasDespues = existenciasDe({ variantes });

      const costo = costoUnitario({
        existencias: existenciasDespues,
        valor_total_usd_cents: nuevoValor,
      });
      const calculo = calcularPrecio({
        costo_unitario_usd_cents: costo,
        modo: p.modo_precio,
        margen_bp: margenEfectivo(p, categorias, parametros),
        multiplicador_bp: p.multiplicador_bp,
        precio_manual_usd_cents: p.precio_manual_usd_cents,
        paso_redondeo_usd_cents: parametros.paso_redondeo_usd_cents,
      });

      // El costo y el precio se recalculan dentro de la misma transacción:
      // antes había una segunda lectura y escritura para refrescarlos.
      tx.set(
        productoRef,
        sinUndefined({
          variantes: variantes.map((v) => sinUndefined(v as unknown as Record<string, unknown>)),
          valor_inventario_usd_cents: nuevoValor,
          costo_unitario_usd_cents: costo,
          precio_venta_usd_cents: calculo.precio_usd_cents,
          actualizado_en: new Date().toISOString(),
        }),
        { merge: true }
      );
    });

    await aplicarLote([
      await this.operacionMovimiento({
        producto_id: params.producto_id,
        variante_id: varianteUsada,
        tipo: 'ENTRADA',
        cantidad,
        costo_total_usd_cents: params.costo_total_usd_cents,
        existencias_despues: existenciasDespues,
        referencia_tipo: params.referencia_tipo,
        referencia_id: params.referencia_id,
        detalle: params.detalle,
      }),
    ]);
  }

  /**
   * Salida por venta. Devuelve el costo con el que salió, para congelarlo en
   * la venta: el promedio se mueve con cada paquete y reescribiría la
   * ganancia histórica si se recalculara después.
   */
  static async salida(params: {
    producto_id: number;
    variante_id?: number;
    cantidad: number;
    referencia_tipo?: string;
    referencia_id?: number;
    detalle?: string;
    permitirNegativo?: boolean;
  }): Promise<{ costo_salida_usd_cents: number; insuficiente: boolean; unidades_retiradas: number }> {
    const db = getFirestoreDb();
    const [parametros, categorias] = await Promise.all([
      ParametrosRepoFirestore.getParametros(),
      ParametrosRepoFirestore.getCategorias(),
    ]);

    const productoRef = doc(db, 'productos', String(params.producto_id));
    let salida = { costo_salida_usd_cents: 0, insuficiente: false, unidades_retiradas: 0 };
    let existenciasDespues = 0;
    let varianteUsada = 0;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(productoRef);
      if (!snap.exists()) throw new Error(`El producto #${params.producto_id} no existe.`);

      const p = snap.data() as ProductoDoc;
      const variantes = [...(p.variantes || [])];
      const varianteId =
        params.variante_id ?? variantes.find((v) => v.activo !== false)?.id ?? 1;
      varianteUsada = varianteId;

      const total = existenciasDe({ variantes });
      const resultado = registrarSalida(
        { existencias: total, valor_total_usd_cents: p.valor_inventario_usd_cents || 0 },
        params.cantidad
      );

      if (resultado.insuficiente && !params.permitirNegativo) {
        throw new Error(
          `No hay suficientes unidades de '${p.nombre}'. Disponibles: ${total}, pedidas: ${params.cantidad}.`
        );
      }

      const idx = variantes.findIndex((v) => v.id === varianteId);
      if (idx === -1) {
        throw new Error(
          `Variante #${varianteId} no encontrada en producto #${params.producto_id}.`
        );
      }

      const retiradas = Math.min(variantes[idx].existencias || 0, resultado.unidades_retiradas);
      variantes[idx] = {
        ...variantes[idx],
        existencias: (variantes[idx].existencias || 0) - retiradas,
      };

      existenciasDespues = existenciasDe({ variantes });

      let costo = costoUnitario({
        existencias: existenciasDespues,
        valor_total_usd_cents: resultado.valor_total_usd_cents,
      });
      // Preservar costo histórico si el producto se agota para no perder su valor base en reposiciones/ajustes
      if (costo === 0 && p.costo_unitario_usd_cents && p.costo_unitario_usd_cents > 0) {
        costo = p.costo_unitario_usd_cents;
      }
      const calculo = calcularPrecio({
        costo_unitario_usd_cents: costo,
        modo: p.modo_precio,
        margen_bp: margenEfectivo(p, categorias, parametros),
        multiplicador_bp: p.multiplicador_bp,
        precio_manual_usd_cents: p.precio_manual_usd_cents,
        paso_redondeo_usd_cents: parametros.paso_redondeo_usd_cents,
      });

      tx.set(
        productoRef,
        sinUndefined({
          variantes: variantes.map((v) => sinUndefined(v as unknown as Record<string, unknown>)),
          valor_inventario_usd_cents: resultado.valor_total_usd_cents,
          costo_unitario_usd_cents: costo,
          precio_venta_usd_cents: calculo.precio_usd_cents,
          actualizado_en: new Date().toISOString(),
        }),
        { merge: true }
      );

      salida = {
        costo_salida_usd_cents: resultado.costo_salida_usd_cents,
        insuficiente: resultado.insuficiente,
        unidades_retiradas: resultado.unidades_retiradas,
      };
    });

    await aplicarLote([
      await this.operacionMovimiento({
        producto_id: params.producto_id,
        variante_id: varianteUsada,
        tipo: 'SALIDA',
        cantidad: salida.unidades_retiradas,
        costo_total_usd_cents: salida.costo_salida_usd_cents,
        existencias_despues: existenciasDespues,
        referencia_tipo: params.referencia_tipo,
        referencia_id: params.referencia_id,
        detalle: params.detalle,
      }),
    ]);

    return salida;
  }

  static async desactivar(id: number, evento_grupo_id: string): Promise<void> {
    return this.archivar(id, evento_grupo_id);
  }

  static async archivar(id: number, evento_grupo_id: string): Promise<void> {
    const anterior = await EventosRepoFirestore.snapshot('productos', id);
    if (!anterior) throw new Error(`El producto #${id} no existe.`);

    await aplicarLote([
      {
        coleccion: 'productos',
        id,
        datos: { activo: false, actualizado_en: new Date().toISOString() },
        merge: true,
      },
    ]);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'productos',
      entidad_id: id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior,
      detalle: `Producto '${anterior.nombre}' descatalogado/archivado`,
    });
  }

  static async reactivar(id: number, evento_grupo_id: string): Promise<void> {
    const anterior = await EventosRepoFirestore.snapshot('productos', id);
    if (!anterior) throw new Error(`El producto #${id} no existe.`);

    await aplicarLote([
      {
        coleccion: 'productos',
        id,
        datos: { activo: true, actualizado_en: new Date().toISOString() },
        merge: true,
      },
    ]);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'productos',
      entidad_id: id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior,
      detalle: `Producto '${anterior.nombre}' reactivado en catálogo activo`,
    });
  }

  static async existenciasTotales(producto_id: number): Promise<number> {
    const p = await leerDoc<ProductoDoc>('productos', producto_id);
    return p ? existenciasDe(p) : 0;
  }

  static async varianteUnica(producto_id: number): Promise<number> {
    const p = await leerDoc<ProductoDoc>('productos', producto_id);
    if (!p) throw new Error(`El producto #${producto_id} no existe.`);
    const primera = (p.variantes || []).find((v) => v.activo !== false);
    if (!primera) throw new Error(`El producto #${producto_id} no tiene variantes activas.`);
    return primera.id;
  }

  static async buscarPorNombre(nombre: string): Promise<ProductoConStock | null> {
    const productos = await this.listar();
    const target = nombre.trim().toLowerCase();
    return productos.find((p) => p.nombre.trim().toLowerCase() === target) ?? null;
  }

  /**
   * Historial de un producto, ordenado y acotado en el servidor.
   * Traer la colección completa para mostrar diez filas crece sin techo.
   */
  static async movimientos(producto_id: number, limite = 50): Promise<MovimientoInventario[]> {
    const db = getFirestoreDb();
    const snap = await getDocs(
      query(
        collection(db, 'movimientos_inventario'),
        where('producto_id', '==', producto_id),
        orderBy('id', 'desc'),
        limit(limite)
      )
    );
    return snap.docs.map((d) => d.data() as MovimientoInventario);
  }

  static async listarMovimientos(producto_id: number): Promise<MovimientoInventario[]> {
    return this.movimientos(producto_id, 50);
  }

  static async simularPrecio(input: Parameters<typeof calcularPrecio>[0]) {
    return calcularPrecio(input);
  }

  /** Arma la operación de un movimiento sin escribirla, para agruparla. */
  static async operacionMovimiento(
    mov: Omit<MovimientoInventario, 'id' | 'fecha'>
  ): Promise<OperacionLote> {
    const id = idOrdenable();
    return {
      coleccion: 'movimientos_inventario',
      id,
      merge: false,
      datos: sinUndefined({ ...mov, id, fecha: new Date().toISOString() } as unknown as Record<
        string,
        unknown
      >),
    };
  }
}
