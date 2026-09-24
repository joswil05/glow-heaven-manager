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
  leerVarios,
  aplicarLote,
  sinUndefined,
  type OperacionLote,
} from '../client';
import { calcularPrecio, margenEfectivo as margenDe } from '../../../core/precios';
import { algunoContiene } from '../../../core/texto';
import { precioParaCosto } from '../../../core/paquete';
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
  PrecioDesactualizado,
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
  precio_venta_usd_cents?: number;
  stock_minimo?: number;
  peso_unitario_mlb?: number;
  /** Si se vende también por pack, cuántas unidades trae. */
  unidades_por_paquete?: number;
  /** Miniatura como data URL, o cadena vacía para quitarla. */
  foto?: string;
  notas?: string;
  /**
   * Existencias con las que nace, al costo final que se indique.
   *
   * La pantalla ya no lo usa: la mercadería entra por un paquete. Queda para
   * cargar datos desde afuera y para las pruebas.
   */
  stock_inicial?: { cantidad: number; costo_unitario_usd_cents: number };
}

/**
 * Lo que se puede cambiar de un producto que ya existe: su ficha de catálogo y
 * cómo se decide su precio. El costo NO: sale de los paquetes que lo trajeron.
 *
 * Antes la ficha permitía reescribir el costo, y cada guardado lo recalculaba
 * con el flete redondeado por unidad: abrir y guardar dos fichas bajaba la
 * bodega 5 centavos, y un producto que entró por un paquete quedaba con costo
 * cero. Un costo mal cargado se arregla corrigiendo su paquete.
 */
export type ActualizarProductoInput = Partial<Omit<CrearProductoInput, 'stock_inicial'>> & {
  id: number;
};

export interface FiltrosProducto {
  busqueda?: string;
  categoria_id?: number;
  soloConStock?: boolean;
  soloBajoStock?: boolean;
  soloInactivos?: boolean;
  incluirInactivos?: boolean;
  /**
   * Sólo lo que trajo este paquete.
   *
   * El negocio funciona por tandas: se vende casi todo y llega un paquete
   * nuevo que renueva la bodega. Por eso "¿qué hay del último paquete?" es
   * una pregunta cotidiana, y sin esto había que acordarse de memoria.
   *
   * `SIN_PAQUETE` son los productos que no vinieron de ninguno: los que se
   * cargaron a mano y los que ya estaban antes de que existiera el registro.
   */
  paquete_id?: number | 'SIN_PAQUETE';
}

export interface ProductoDoc {
  id: number;
  codigo: string;
  nombre: string;
  categoria_id?: number;
  tiene_variantes: boolean;
  variantes: ProductoVariante[];
  /** La fuente de verdad del costo: lo que valen al costo las existencias. */
  valor_inventario_usd_cents: number;
  /** Derivado: valor ÷ existencias. */
  costo_unitario_usd_cents: number;
  /**
   * HEREDADOS de `v2.11`, cuando el flete se le repartía al producto después
   * de cargarlo. Nadie los escribe ni los usa para calcular. Los lee sólo
   * `ComprasRepo.reconstruir`, para rearmar el contenido de un paquete de esa
   * época tal como la bodega lo registró.
   */
  costo_base_unitario_usd_cents?: number;
  flete_total_usd_cents?: number;
  flete_unitario_usd_cents?: number;
  precio_tienda_unitario_usd_cents?: number;
  /**
   * TODOS los paquetes que trajeron este producto alguna vez.
   *
   * `paquete_id` guarda sólo el último, que es el que manda para el costo. Pero
   * para buscar no alcanza: si el gloss vino en el 3, en el 7 y en el 11, el
   * producto dice 11 y filtrar por el 3 no lo encontraba, aunque el 3 sí lo
   * trajo. Con la lista, la pregunta "¿qué trajo este paquete?" se contesta
   * bien aunque el producto se haya repetido.
   */
  paquetes?: number[];
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
  return margenDe(p, categorias, parametros.margen_defecto_bp);
}

/**
 * El costo por unidad que se muestra y con el que se calcula el precio.
 *
 * Sin existencias no hay de dónde derivarlo, y se usa el último conocido: un
 * producto agotado no pasa a costar cero.
 */
function costoActual(p: Pick<ProductoDoc, 'variantes' | 'valor_inventario_usd_cents' | 'costo_unitario_usd_cents'>): number {
  const c = costoUnitario({
    existencias: existenciasDe(p),
    valor_total_usd_cents: p.valor_inventario_usd_cents ?? 0,
  });
  return c > 0 ? c : Math.max(0, p.costo_unitario_usd_cents ?? 0);
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
      productos = productos.filter((p) =>
        algunoContiene([p.nombre, p.codigo], filtros.busqueda!)
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
    if (filtros.paquete_id !== undefined) {
      // Se busca en TODOS los paquetes que lo trajeron, no sólo en el último.
      // Con un producto repetido, mirar sólo el último contesta que el paquete
      // viejo no lo trajo, y sí lo trajo.
      productos =
        filtros.paquete_id === 'SIN_PAQUETE'
          ? productos.filter((p) => !p.paquete_id && (p.paquetes ?? []).length === 0)
          : productos.filter(
              (p) =>
                p.paquete_id === filtros.paquete_id ||
                (p.paquetes ?? []).includes(filtros.paquete_id as number)
            );
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
    // Un producto sin nombre no se puede buscar, ni listar, ni poner en una
    // factura: aparece como una fila en blanco que nadie sabe qué es.
    if (!input.nombre?.trim()) {
      throw new Error('El producto necesita un nombre.');
    }

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
              // Clamp igual que en la rama de variantes. Sin esto un producto
              // podía nacer con existencias negativas, y esa cifra se arrastra
              // a la valuación de la bodega y a los totales del panel.
              existencias: Math.max(0, Math.round(stockInicial?.cantidad ?? 0)),
              activo: true,
            },
          ];

    const totalExistencias = variantes.reduce((s, v) => s + v.existencias, 0);

    // El costo llega con el primer paquete. Un producto que nace sin
    // existencias nace sin costo, y está bien: no hay nada en la bodega que
    // valga algo.
    const costoIndicado = Math.max(0, Math.round(stockInicial?.costo_unitario_usd_cents ?? 0));
    let costo = costoUnitario({
      existencias: totalExistencias,
      valor_total_usd_cents: valorInicial,
    });
    if (costo === 0 && costoIndicado > 0) {
      costo = costoIndicado;
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
      paquetes: [],
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
          referencia_tipo: 'AJUSTE',
          detalle: 'Existencias iniciales',
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
    const nuevoMultiplicador =
      input.multiplicador_bp !== undefined ? input.multiplicador_bp : p.multiplicador_bp;
    const nuevoManual =
      input.precio_manual_usd_cents !== undefined
        ? input.precio_manual_usd_cents
        : p.precio_manual_usd_cents;

    // Las existencias no se editan acá: cambian con paquetes, ventas y el
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
          existencias: existente ? existente.existencias : 0,
          activo: true,
        };
      });
    }

    // El costo no se toca: sale de los paquetes. El precio sí se recalcula,
    // porque lo que se está editando puede ser justamente el margen, la
    // categoría o el modo de precio.
    const precio = precioParaCosto(
      {
        modo_precio: nuevoModo,
        margen_bp: margenEfectivo(
          { margen_bp: nuevoMargen, categoria_id: nuevaCategoria },
          categorias,
          parametros
        ),
        multiplicador_bp: nuevoMultiplicador,
        precio_manual_usd_cents: nuevoManual,
        precio_venta_usd_cents: p.precio_venta_usd_cents,
      },
      costoActual({ ...p, variantes }),
      parametros.paso_redondeo_usd_cents
    );

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
          multiplicador_bp: nuevoMultiplicador ?? null,
          precio_manual_usd_cents: nuevoManual ?? null,
          precio_venta_usd_cents: precio,
          stock_minimo: input.stock_minimo !== undefined ? input.stock_minimo : p.stock_minimo,
          peso_unitario_mlb:
            input.peso_unitario_mlb !== undefined ? input.peso_unitario_mlb : p.peso_unitario_mlb,
          unidades_por_paquete:
            input.unidades_por_paquete !== undefined
              ? input.unidades_por_paquete
              : (p.unidades_por_paquete ?? null),
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
   * Los productos cuyo precio guardado no es el que corresponde a su costo.
   *
   * Pasa con productos cargados antes de `v2.12`: el precio se calculaba
   * antes de que llegara el flete, y después cambiaba solo al vender. No se
   * corrige por detrás: son los precios que ella les da a sus clientas, así
   * que se le muestran y ella decide cuáles aplicar.
   *
   * Un precio escrito a mano no aparece: ese lo decidió ella.
   */
  static async preciosDesactualizados(): Promise<PrecioDesactualizado[]> {
    const [productos, parametros, categorias] = await Promise.all([
      this.listar(),
      ParametrosRepoFirestore.getParametros(),
      ParametrosRepoFirestore.getCategorias(),
    ]);

    const salida: PrecioDesactualizado[] = [];
    for (const p of productos) {
      if (p.modo_precio === 'MANUAL') continue;
      const costo = costoActual(p);
      if (costo <= 0) continue;
      const calculado = precioParaCosto(
        { ...p, margen_bp: margenEfectivo(p, categorias, parametros) },
        costo,
        parametros.paso_redondeo_usd_cents
      );
      if (calculado === p.precio_venta_usd_cents) continue;
      salida.push({
        producto_id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        modo_precio: p.modo_precio,
        existencias: p.existencias,
        costo_unitario_usd_cents: costo,
        precio_actual_usd_cents: p.precio_venta_usd_cents,
        precio_calculado_usd_cents: calculado,
      });
    }
    return salida;
  }

  /**
   * Aplica el precio que corresponde a su costo a los productos elegidos.
   *
   * Recalcula al momento, no usa el número que vio la pantalla: si entre ver
   * la lista y apretar el botón entró un paquete, manda el costo de ahora.
   */
  static async aplicarPrecios(ids: number[], evento_grupo_id: string): Promise<number> {
    if (ids.length === 0) return 0;
    const [productos, parametros, categorias] = await Promise.all([
      leerVarios<ProductoDoc>('productos', ids),
      ParametrosRepoFirestore.getParametros(),
      ParametrosRepoFirestore.getCategorias(),
    ]);

    const ahora = new Date().toISOString();
    const operaciones: OperacionLote[] = [];
    const eventos: { id: number; anterior: ProductoDoc; nuevo: number }[] = [];

    for (const p of productos.values()) {
      if (p.modo_precio === 'MANUAL') continue;
      const costo = costoActual(p);
      if (costo <= 0) continue;
      const nuevo = precioParaCosto(
        { ...p, margen_bp: margenEfectivo(p, categorias, parametros) },
        costo,
        parametros.paso_redondeo_usd_cents
      );
      if (nuevo === p.precio_venta_usd_cents) continue;
      operaciones.push({
        coleccion: 'productos',
        id: p.id,
        merge: true,
        datos: { precio_venta_usd_cents: nuevo, actualizado_en: ahora },
      });
      eventos.push({ id: p.id, anterior: p, nuevo });
    }

    await aplicarLote(operaciones);
    for (const e of eventos) {
      await EventosRepoFirestore.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'productos',
        entidad_id: e.id,
        tipo_evento: 'ACTUALIZACION',
        valor_anterior: e.anterior as unknown as Record<string, unknown>,
        detalle: `Precio de '${e.anterior.nombre}' ajustado a su costo`,
      });
    }
    return operaciones.length;
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
    //
    // Y buscarlo es AMBIGUO: los ids de variante se asignan como `i + 1`
    // dentro de cada producto, así que no son únicos entre productos (casi
    // todos tienen una variante 1). Antes acá se usaba `find`, que se quedaba
    // con el primero que apareciera: el ajuste de existencias se aplicaba en
    // silencio a un producto distinto del que la usuaria había elegido.
    // Ante la duda, es preferible fallar y que se vea.
    let productoId = producto_id;
    if (productoId === undefined) {
      const snap = await getDocs(query(collection(db, 'productos'), where('activo', '==', true)));
      const candidatos = snap.docs.filter((d) =>
        ((d.data() as ProductoDoc).variantes || []).some((v) => v.id === variante_id)
      );

      if (candidatos.length === 0) {
        throw new Error(`Variante #${variante_id} no encontrada.`);
      }
      if (candidatos.length > 1) {
        throw new Error(
          `No se puede determinar a qué producto pertenece la variante #${variante_id}: ` +
            `la comparten ${candidatos.length} productos. Volvé a intentarlo desde la lista de inventario.`
        );
      }
      productoId = Number(candidatos[0].id);
    }

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


      tx.set(
        productoRef,
        sinUndefined({
          variantes: variantes.map((v) => sinUndefined(v as unknown as Record<string, unknown>)),
          valor_inventario_usd_cents: nuevoEstado.valor_total_usd_cents,
          costo_unitario_usd_cents: costo,
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
   * Devuelve unidades al inventario, en una transacción: una venta anulada o
   * una venta que falló a la mitad.
   *
   * La mercadería NUEVA no entra por acá sino por `ComprasRepo.recibir`, que
   * es el que sabe de impuesto, flete y paquete.
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

      // El precio NO se recalcula: esto es una devolución (una venta anulada
      // o revertida), no mercadería nueva. El precio sólo sigue al costo
      // cuando entra un paquete o ella cambia el margen; si se moviera con
      // cada devolución, el precio que le dio a una clienta cambiaría solo.
      tx.set(
        productoRef,
        sinUndefined({
          variantes: variantes.map((v) => sinUndefined(v as unknown as Record<string, unknown>)),
          valor_inventario_usd_cents: nuevoValor,
          costo_unitario_usd_cents: costo,
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
   *
   * No toca el precio. Antes lo recalculaba con el costo del momento, y vender
   * una unidad le cambiaba el precio a las que quedaban: $39 antes de vender,
   * $42 después, sin que nadie lo tocara.
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

      const existenciasVariante = variantes[idx].existencias || 0;
      if (params.cantidad > existenciasVariante && !params.permitirNegativo) {
        throw new Error(
          `No hay suficientes existencias de la variante seleccionada en '${p.nombre}'. Disponibles: ${existenciasVariante}, pedidas: ${params.cantidad}.`
        );
      }

      const retiradas = params.permitirNegativo ? params.cantidad : Math.min(existenciasVariante, resultado.unidades_retiradas);
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

      tx.set(
        productoRef,
        sinUndefined({
          variantes: variantes.map((v) => sinUndefined(v as unknown as Record<string, unknown>)),
          valor_inventario_usd_cents: resultado.valor_total_usd_cents,
          costo_unitario_usd_cents: costo,
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

  static async eliminarDefinitivo(id: number, evento_grupo_id: string): Promise<void> {
    const anterior = await EventosRepoFirestore.snapshot('productos', id);
    if (!anterior) throw new Error(`El producto #${id} no existe.`);

    await aplicarLote([
      {
        coleccion: 'productos',
        id,
        borrar: true,
      },
    ]);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'productos',
      entidad_id: id,
      tipo_evento: 'ELIMINACION',
      valor_anterior: anterior,
      detalle: `Producto '${anterior.nombre}' eliminado definitivamente de la base de datos`,
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
