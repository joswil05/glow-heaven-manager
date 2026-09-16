import type {
  ParametrosSistema,
  Categoria,
  ClienteDetalle,
  ProductoConStock,
  MovimientoInventario,
  Compra,
  CompraCompleta,
  Venta,
  VentaCompleta,
  PagoCompleto,
  PanelData,
  ModoPrecio,
  DestinoLinea,
  TipoVenta,
  EstadoVenta,
  EstadoCompra,
  MetodoPago,
  MonedaPago,
  TipoDescuento,
} from './types';

/**
 * Toda llamada IPC devuelve esto. El renderer nunca recibe una excepción
 * cruda de Electron: recibe un fallo con un mensaje que se le puede mostrar
 * a una persona.
 */
export type Resultado<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/** Acciones que se pueden deshacer devuelven el grupo al que pertenecen. */
export interface ConGrupo {
  evento_grupo_id: string;
}

/**
 * Como `ConGrupo`, pero además dice si la acción se puede deshacer.
 *
 * Una acción que movió mercadería no se revierte restaurando documentos, así
 * que la pantalla no debe ofrecer "Deshacer": la usuaria lo apretaría y sólo
 * recibiría una negativa.
 */
export interface ConGrupoReversible extends ConGrupo {
  reversible: boolean;
}

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------

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
  stock_minimo?: number;
  peso_unitario_mlb?: number;
  unidades_por_paquete?: number;
  packs_comprados?: number;
  costo_pack_usa_usd_cents?: number;
  aplicar_tax_usa?: boolean;
  paquete_id?: number;
  precio_venta_usd_cents?: number;
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

export interface SimularPrecioInput {
  costo_unitario_usd_cents: number;
  modo: ModoPrecio;
  margen_bp?: number;
  multiplicador_bp?: number;
  precio_manual_usd_cents?: number;
}

export interface SimularPrecioOutput {
  precio_crudo_usd_cents: number;
  precio_usd_cents: number;
  costo_unitario_usd_cents: number;
  ganancia_usd_cents: number;
  margen_sobre_costo_bp: number;
  margen_sobre_venta_bp: number;
  bajo_costo: boolean;
  ajuste_redondeo_usd_cents: number;
}

// ---------------------------------------------------------------------------
// Paquetes
// ---------------------------------------------------------------------------

export interface LineaCompraInput {
  id?: number;
  producto_id?: number;
  variante_id?: number;
  descripcion: string;
  cantidad: number;
  precio_linea_usd_cents: number;
  tax_linea_usd_cents?: number;
  peso_linea_mlb: number;
  destino: DestinoLinea;
  venta_id?: number;
  precio_venta_usd_cents?: number;
  es_multipack?: boolean;
  packs_comprados?: number;
  unidades_por_pack?: number;
  precio_por_pack_usd_cents?: number;
}

export interface GuardarCompraInput {
  id?: number;
  fecha: string;
  estado?: EstadoCompra;
  envio_total_usd_cents: number;
  otros_costos_usd_cents?: number;
  tax_total_override_usd_cents?: number;
  notas?: string;
  peso_total_mlb?: number;
  lineas: LineaCompraInput[];
}

export interface PreviewCompraLinea {
  id: number;
  cantidad: number;
  precio_linea_usd_cents: number;
  tax_linea_usd_cents: number;
  envio_asignado_usd_cents: number;
  otros_asignados_usd_cents: number;
  costo_linea_usd_cents: number;
  costo_unitario_usd_cents: number;
  peso_linea_mlb: number;
}

export interface PreviewCompra {
  lineas: PreviewCompraLinea[];
  subtotal_productos_usd_cents: number;
  tax_total_usd_cents: number;
  envio_total_usd_cents: number;
  otros_costos_usd_cents: number;
  total_pagado_usd_cents: number;
  peso_total_mlb: number;
  unidades_totales: number;
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

export interface LineaVentaInput {
  producto_id?: number;
  variante_id?: number;
  descripcion?: string;
  cantidad: number;
  precio_unitario_usd_cents?: number;
  es_paquete?: boolean;
  costo_estimado_unitario_usd_cents?: number;
}

export interface PagoInicialInput {
  monto_cents?: number;
  moneda: MonedaPago;
  metodo: MetodoPago;
  referencia?: string;
  notas?: string;
}

export interface CrearVentaInput {
  cliente_id?: number;
  fecha: string;
  tipo: TipoVenta;
  lineas: LineaVentaInput[];
  notas?: string;
  anticipo_bp?: number;
  plan_cuotas?: { cantidad: number; cada_dias: number; primera_fecha?: string };
  entregar_ahora?: boolean;
  pago_inicial?: PagoInicialInput;
  descuento_tipo?: TipoDescuento;
  descuento_valor?: number;
  descuento_motivo?: string;
}

export interface FiltrosVenta {
  tipo?: TipoVenta;
  estado?: EstadoVenta;
  cliente_id?: number;
  soloConSaldo?: boolean;
  /** Ventana de fechas: `desde` se resuelve en el servidor. */
  desde?: string;
  hasta?: string;
  /** Tope de documentos a traer. */
  limite?: number;
  /**
   * Dónde seguir: la última venta de la página anterior. Es un cursor, no un
   * salto, así que la página cinco cuesta lo mismo que la primera.
   */
  despuesDe?: { fecha: string; id: number };
}

export interface RegistrarPagoInput {
  venta_id: number;
  fecha: string;
  monto_cents: number;
  moneda: MonedaPago;
  metodo: MetodoPago;
  referencia?: string;
  notas?: string;
  es_anticipo?: boolean;
  cuota_id?: number;
}

export interface AbonoClienteInput {
  cliente_id: number;
  fecha: string;
  monto_cents: number;
  moneda: MonedaPago;
  metodo: MetodoPago;
  referencia?: string;
  notas?: string;
  venta_id?: number;
}

export interface ResultadoPago extends ConGrupo {
  pago_id: number;
  pagado_usd_cents: number;
  saldo_usd_cents: number;
  excedente_usd_cents: number;
  anticipo_cubierto: boolean;
}

// ---------------------------------------------------------------------------
// Clientes y configuración
// ---------------------------------------------------------------------------

export interface GuardarClienteInput {
  id?: number;
  nombre: string;
  alias?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  notas?: string;
}

export interface CategoriaInput {
  id?: number;
  nombre: string;
  /** Si no viene, la categoría hereda el margen global. */
  margen_defecto_bp?: number;
}

export interface EstadoNube {
  configurado: boolean;
  conectado: boolean;
  correo?: string;
  error?: string;
}

export interface UsuarioGoogle {
  uid: string;
  email: string;
  nombre: string;
  foto?: string;
}

export interface InfoSistema {
  version: string;
  ruta_base_datos: string;
  tamano_base_datos_bytes: number;
}

// ---------------------------------------------------------------------------
// Superficie completa expuesta al renderer
// ---------------------------------------------------------------------------

export interface ApiPuente {
  auth: {
    iniciarGoogle(): Promise<Resultado<UsuarioGoogle>>;
    obtenerUsuario(): Promise<Resultado<UsuarioGoogle | null>>;
    cerrarSesion(): Promise<Resultado<{ ok: true }>>;
  };
  parametros: {
    get(): Promise<Resultado<ParametrosSistema>>;
    update(
      valores: Record<string, unknown>
    ): Promise<Resultado<ConGrupo>>;
    recalcularPrecios(): Promise<Resultado<{ productos: number }>>;
  };
  categorias: {
    list(): Promise<Resultado<Categoria[]>>;
    guardar(input: CategoriaInput): Promise<Resultado<ConGrupo & { id: number }>>;
    archivar(id: number): Promise<Resultado<ConGrupo>>;
  };
  productos: {
    list(filtros?: FiltrosProducto): Promise<Resultado<ProductoConStock[]>>;
    get(id: number): Promise<Resultado<ProductoConStock | null>>;
    crear(input: CrearProductoInput): Promise<Resultado<ConGrupo & { id: number }>>;
    actualizar(input: ActualizarProductoInput): Promise<Resultado<ConGrupo>>;
    ajustarStock(
      variante_id: number,
      existencias: number,
      motivo?: string,
      producto_id?: number
    ): Promise<Resultado<ConGrupo>>;
    archivar(id: number): Promise<Resultado<ConGrupo>>;
    reactivar(id: number): Promise<Resultado<ConGrupo>>;
    eliminarDefinitivo(id: number): Promise<Resultado<ConGrupo>>;
    movimientos(producto_id: number): Promise<Resultado<MovimientoInventario[]>>;
    simularPrecio(input: SimularPrecioInput): Promise<Resultado<SimularPrecioOutput>>;
  };
  compras: {
    list(): Promise<Resultado<Compra[]>>;
    get(id: number): Promise<Resultado<CompraCompleta | null>>;
    guardar(input: GuardarCompraInput): Promise<Resultado<ConGrupo & { id: number }>>;
    previsualizar(input: GuardarCompraInput): Promise<Resultado<PreviewCompra>>;
    recibir(id: number): Promise<Resultado<ConGrupo & { productos_afectados: number }>>;
    archivar(id: number): Promise<Resultado<ConGrupo>>;
  };
  ventas: {
    list(filtros?: FiltrosVenta): Promise<Resultado<Venta[]>>;
    get(id: number): Promise<Resultado<VentaCompleta | null>>;
    crear(input: CrearVentaInput): Promise<Resultado<ConGrupo & { id: number }>>;
    cambiarEstado(id: number, estado: EstadoVenta): Promise<Resultado<ConGrupoReversible>>;
  };
  pagos: {
    registrar(input: RegistrarPagoInput): Promise<Resultado<ResultadoPago>>;
    registrarAbonoCliente(input: AbonoClienteInput): Promise<Resultado<ResultadoPago>>;
    listarPorCliente(cliente_id: number): Promise<Resultado<PagoCompleto[]>>;
    listarPorVenta(venta_id: number): Promise<Resultado<PagoCompleto[]>>;
    anular(pago_id: number): Promise<Resultado<ConGrupo>>;
    recientes(limite?: number): Promise<Resultado<PagoCompleto[]>>;
    /** Los abonos de un período, para exportarlos. */
    enRango(desde: string, hasta: string): Promise<Resultado<PagoCompleto[]>>;
  };
  clientes: {
    list(busqueda?: string): Promise<Resultado<ClienteDetalle[]>>;
    get(id: number): Promise<Resultado<ClienteDetalle | null>>;
    guardar(input: GuardarClienteInput): Promise<Resultado<ConGrupo & { id: number }>>;
    archivar(id: number): Promise<Resultado<ConGrupo>>;
  };
  panel: {
    cargar(): Promise<Resultado<PanelData>>;
  };
  acceso: {
    tienePin(): Promise<Resultado<{ tiene: boolean }>>;
    establecerPin(pin: string): Promise<Resultado<{ ok: true }>>;
    verificarPin(pin: string): Promise<Resultado<{ valido: boolean }>>;
    cambiarPin(actual: string, nuevo: string): Promise<Resultado<{ ok: true }>>;
  };
  nube: {
    estado(): Promise<Resultado<EstadoNube>>;
    configurar(correo: string, clave: string): Promise<Resultado<EstadoNube>>;
    reconectar(): Promise<Resultado<EstadoNube>>;
  };
  sistema: {
    deshacer(grupo_id?: string): Promise<Resultado<{ revertido: boolean; descripcion: string }>>;
    info(): Promise<Resultado<InfoSistema>>;
  };
  documentos?: {
    imprimir(html: string): Promise<Resultado<{ ok: boolean }>>;
    guardarPdf(input: {
      html: string;
      nombreSugerido: string;
    }): Promise<Resultado<{ guardado: boolean; ruta?: string }>>;
  };
  actualizador?: {
    onUpdateChecking(cb: () => void): () => void;
    onUpdateAvailable(cb: (info: { version: string }) => void): () => void;
    onUpdateProgress(cb: (progress: { percent: number }) => void): () => void;
    onUpdateDownloaded(cb: (info: { version: string }) => void): () => void;
    reiniciarYAplicar(): Promise<void>;
    verificarManual(): Promise<{ success: boolean; updateInfo?: any; error?: string }>;
  };
}

