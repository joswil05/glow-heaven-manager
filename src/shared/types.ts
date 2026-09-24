// ============================================================================
// Tipos compartidos entre el proceso main y el renderer.
// Todo el dinero viaja en centavos USD enteros.
// ============================================================================

export type ModoPrecio = 'MARGEN' | 'MULTIPLICADOR' | 'MANUAL';

export type EstadoCompra = 'BORRADOR' | 'EN_CAMINO' | 'RECIBIDA';

export type DestinoLinea = 'INVENTARIO' | 'ENCARGO';

export type TipoVenta = 'INVENTARIO' | 'ENCARGO';

export type EstadoVenta = 'COTIZADA' | 'PENDIENTE' | 'ENTREGADA' | 'CANCELADA';

export type MetodoPago = 'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO';

export type MonedaPago = 'USD' | 'COR';

export type TipoMovimiento = 'ENTRADA' | 'SALIDA' | 'AJUSTE';

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

export interface CuentaBancaria {
  banco: string; // BAC, LAFISE, Banpro, BDF, etc.
  moneda: 'USD' | 'NIO';
  numero: string;
  titular?: string;
  tipo?: string; // Corriente, Ahorros
}

export interface ParametrosSistema {
  /** Córdobas por dólar, en centavos. 3662 = C$36.62. Solo para mostrar. */
  tasa_cambio_cents: number;
  /** Tax de compra en USA. 700 = 7%. */
  tax_bp: number;
  /** Tarifa de envío por libra, en centavos USD. 700 = $7.00. */
  tarifa_envio_cents_lb: number;
  /** Ganancia por defecto sobre el costo. 4500 = 45%. */
  margen_defecto_bp: number;
  /** Escalón de redondeo del precio. 100 = $1, 500 = $5. */
  paso_redondeo_usd_cents: number;
  /** Anticipo por defecto en encargos. 5000 = 50%. */
  anticipo_defecto_bp: number;
  mostrar_cordobas: boolean;
  stock_minimo_defecto: number;
  nombre_negocio: string;
  telefono_negocio: string;
  onboarding_completado: boolean;
  pin_seguridad?: string;

  // Nuevas configuraciones de confort y cobranza
  plantilla_cobro_whatsapp?: string;
  plantilla_factura_whatsapp?: string;
  plantilla_proforma_whatsapp?: string;
  cuentas_bancarias?: CuentaBancaria[];
  /** Días de gracia antes de avisar por una cuota atrasada. */
  dias_alerta_mora?: number;
  /** Días que puede llevar un encargo pendiente antes de avisar. */
  dias_alerta_encargos?: number;
  /**
   * Con qué moneda arrancan los cobros.
   *
   * Ojo con el vocabulario: acá dice `NIO` y el resto de la app dice `COR`
   * para lo mismo. Se convierte al leerlo; no se cambia el valor guardado
   * porque ya hay bases con `NIO` adentro.
   */
  moneda_defecto_venta?: 'USD' | 'NIO';
  /** Con qué método arrancan los cobros. */
  metodo_pago_defecto?: MetodoPago;
  /** Cuántas cuotas propone una venta a crédito. */
  cuotas_defecto_cantidad?: number;
  /** Cada cuántos días vence cada cuota. */
  cuotas_defecto_dias?: number;
  /** Con qué pantalla abre la app de Windows. */
  pantalla_inicio?: string;
  /** Con qué pantalla abre el celular. */
  pantalla_inicio_movil?: string;
  /**
   * Código de país para los enlaces de WhatsApp, sin el `+`. 505 es
   * Nicaragua. Una clienta de afuera necesita el suyo, porque si no el
   * enlace no abre y no avisa.
   */
  codigo_pais_whatsapp?: string;
}

/** Alguien con acceso al negocio, o invitado a tenerlo. */
export interface Acceso {
  /** El UID de Firebase, o el correo si todavía no entró nunca. */
  id: string;
  correo: string;
  nombre?: string;
  /** `true` mientras no haya entrado con esa cuenta. */
  pendiente: boolean;
  /** No se puede quitar: es la dueña, o sos vos mismo. */
  fijo: boolean;
  desde?: string;
}

export interface Categoria {
  id: number;
  nombre: string;
  margen_defecto_bp: number;
  activa: boolean;
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export interface Cliente {
  id: number;
  nombre: string;
  alias?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  notas?: string;
  activo: boolean;
  creado_en?: string;
}

export interface ClienteDetalle extends Cliente {
  compras_count: number;
  total_comprado_usd_cents: number;
  saldo_pendiente_usd_cents: number;
  ultima_compra?: string;
}

// ---------------------------------------------------------------------------
// Inventario
// ---------------------------------------------------------------------------

export interface ProductoVariante {
  id: number;
  producto_id: number;
  talla?: string;
  color?: string;
  existencias: number;
  activo: boolean;
}

export interface Producto {
  id: number;
  codigo: string;
  nombre: string;
  categoria_id?: number;
  tiene_variantes: boolean;

  /** Valor total del inventario al costo. Fuente de verdad del promedio. */
  valor_inventario_usd_cents: number;
  /** Derivado de valor / existencias. */
  costo_unitario_usd_cents: number;
  /**
   * HEREDADOS de `v2.11`, cuando el flete se le repartía al producto. Ya no
   * los escribe ni los lee ningún cálculo: el costo sale de las líneas de los
   * paquetes. Quedan en los documentos viejos y sólo los usa la
   * reconstrucción del contenido de un paquete anterior al cambio.
   */
  costo_base_unitario_usd_cents?: number;
  flete_total_usd_cents?: number;
  flete_unitario_usd_cents?: number;
  precio_tienda_unitario_usd_cents?: number;
  /** Todos los paquetes que lo trajeron alguna vez. `paquete_id` es el último. */
  paquetes?: number[];

  modo_precio: ModoPrecio;
  margen_bp?: number;
  multiplicador_bp?: number;
  precio_manual_usd_cents?: number;
  precio_venta_usd_cents: number;

  stock_minimo: number;
  peso_unitario_mlb: number;
  /** Si se vende también por pack, cuántas unidades trae (ej. 5 boxers). */
  unidades_por_paquete?: number;
  /** HEREDADOS: la compra del pack ahora vive en la línea del paquete. */
  packs_comprados?: number;
  costo_pack_usa_usd_cents?: number;
  aplicar_tax_usa?: boolean;
  /** El último paquete que lo repuso. */
  paquete_id?: number;
  /**
   * Miniatura del producto como data URL. Se guarda ya reducida (400px de
   * lado, JPEG) para que quepa holgada en el documento de Firestore, que
   * admite 1 MB.
   */
  foto?: string;
  notas?: string;
  activo: boolean;
  creado_en?: string;
  actualizado_en?: string;
}

export interface ProductoConStock extends Producto {
  categoria_nombre?: string;
  existencias: number;
  ganancia_unitaria_usd_cents: number;
  variantes: ProductoVariante[];
  ultima_venta?: string;
}

export interface MovimientoInventario {
  /** Identificador ordenable por tiempo. No se muestra nunca. */
  id: string;
  producto_id: number;
  variante_id?: number;
  tipo: TipoMovimiento;
  cantidad: number;
  costo_total_usd_cents: number;
  existencias_despues: number;
  referencia_tipo?: string;
  referencia_id?: number;
  detalle?: string;
  fecha?: string;
}

// ---------------------------------------------------------------------------
// Compras (paquetes recibidos)
// ---------------------------------------------------------------------------

export interface CompraLinea {
  id: number;
  compra_id: number;
  producto_id?: number;
  variante_id?: number;
  descripcion: string;
  cantidad: number;

  /** Lo que costó la línea completa en la tienda, sin impuesto. */
  precio_linea_usd_cents: number;
  tax_linea_usd_cents: number;
  /** La tienda no cobró impuesto por esta línea. */
  exento?: boolean;
  peso_linea_mlb: number;
  /** El peso salió del reparto, no lo escribió nadie. */
  peso_estimado?: boolean;
  envio_asignado_usd_cents: number;
  otros_asignados_usd_cents: number;
  /** Tienda + impuesto + flete + otros, de la línea completa. Es el exacto. */
  costo_linea_usd_cents: number;
  /** El costo por unidad, redondeado. Para mostrar. */
  costo_unitario_usd_cents: number;

  destino: DestinoLinea;
  venta_id?: number;
  /** La línea del encargo que trae esto. Sin ella se busca por descripción. */
  venta_linea_id?: number;
  orden: number;

  // Complementarios para mostrar
  producto_nombre?: string;
  cliente_nombre?: string;

  // Cómo se escribió, para devolverlo igual al editar
  es_multipack?: boolean;
  packs_comprados?: number;
  unidades_por_pack?: number;
  precio_por_pack_usd_cents?: number;
}

/** Cómo quedó un producto después de que le entró (o se corrigió) un paquete. */
export interface EfectoIngreso {
  producto_id: number;
  nombre: string;
  modo_precio: ModoPrecio;
  existencias_antes: number;
  existencias_despues: number;
  valor_antes_usd_cents: number;
  valor_despues_usd_cents: number;
  costo_antes_usd_cents: number;
  costo_despues_usd_cents: number;
  precio_antes_usd_cents: number;
  precio_despues_usd_cents: number;
  bajo_costo: boolean;
  /** En una corrección: lo que se le sumó o restó al valor de la bodega. */
  correccion_usd_cents?: number;
}

export interface ResultadoIngreso {
  codigo: string;
  productos_afectados: number;
  productos: EfectoIngreso[];
  /** Encargos que congelaron su costo real con este paquete. */
  encargos_actualizados: number;
}

/** Una línea en la que vino un producto, con el paquete que la trajo. */
export interface EntradaDeProducto {
  compra_id: number;
  codigo: string;
  fecha: string;
  estado: EstadoCompra;
  linea: CompraLinea;
}

/** El contenido de un paquete anterior al cambio, reconstruido para revisarlo. */
export interface ReconstruccionPaquete {
  lineas: CompraLinea[];
  subtotal_productos_usd_cents: number;
  tax_total_usd_cents: number;
  envio_total_usd_cents: number;
  otros_costos_usd_cents: number;
  total_usd_cents: number;
  unidades_totales: number;
  /** Productos anotados en el paquete que no se pudieron incluir, y por qué. */
  avisos: string[];
}

/** Un producto cuyo precio guardado no es el que corresponde a su costo. */
export interface PrecioDesactualizado {
  producto_id: number;
  codigo: string;
  nombre: string;
  modo_precio: ModoPrecio;
  existencias: number;
  costo_unitario_usd_cents: number;
  precio_actual_usd_cents: number;
  precio_calculado_usd_cents: number;
}

export interface Compra {
  id: number;
  codigo: string;
  fecha: string;
  estado: EstadoCompra;

  envio_total_usd_cents: number;
  otros_costos_usd_cents: number;
  tax_total_override_usd_cents?: number;

  subtotal_productos_usd_cents: number;
  tax_total_usd_cents: number;
  total_usd_cents: number;
  peso_total_mlb: number;
  /** Cómo se repartió el flete: por peso, por unidades, o no había flete. */
  criterio_flete?: 'PESO' | 'UNIDADES' | 'SIN_FLETE';

  tasa_cambio_cents: number;
  notas?: string;
  activo: boolean;
  creado_en?: string;
  /** Cuándo pasó al inventario. */
  cerrado_en?: string;
  /** La última vez que se corrigió después de estar en el inventario. */
  corregido_en?: string;
  /**
   * El contenido se reconstruyó de los productos: es un paquete de antes de
   * que los paquetes guardaran lo que traían.
   */
  reconstruido?: boolean;
  /** Cómo quedó cada producto al entrar este paquete. */
  resumen_ingreso?: EfectoIngreso[];
}

export interface CompraCompleta extends Compra {
  lineas: CompraLinea[];
  unidades_totales: number;
}

// ---------------------------------------------------------------------------
// Ventas y encargos
// ---------------------------------------------------------------------------

export interface VentaLinea {
  id: number;
  venta_id: number;
  producto_id?: number;
  variante_id?: number;
  descripcion: string;
  cantidad: number;

  precio_unitario_usd_cents: number;
  costo_unitario_usd_cents: number;
  subtotal_usd_cents: number;
  costo_total_usd_cents: number;

  es_paquete: boolean;
  orden: number;

  producto_nombre?: string;
  talla?: string;
  color?: string;
}

export type TipoDescuento = 'PORCENTAJE' | 'MONTO_FIJO';

export interface Venta {
  id: number;
  codigo: string;
  cliente_id?: number;
  fecha: string;
  tipo: TipoVenta;
  estado: EstadoVenta;

  tasa_cambio_cents: number;

  subtotal_usd_cents?: number;
  descuento_usd_cents?: number;
  descuento_tipo?: TipoDescuento;
  descuento_valor?: number;
  descuento_motivo?: string;

  total_usd_cents: number;
  costo_total_usd_cents: number;
  ganancia_usd_cents: number;
  pagado_usd_cents: number;
  saldo_usd_cents: number;
  anticipo_esperado_usd_cents: number;

  notas?: string;
  activo: boolean;
  creado_en?: string;

  cliente_nombre?: string;
}

export interface VentaCompleta extends Venta {
  cliente?: Cliente;
  lineas: VentaLinea[];
  pagos: Pago[];
  cuotas: Cuota[];
}

export interface Cuota {
  id: number;
  venta_id: number;
  numero: number;
  fecha_vencimiento: string;
  monto_usd_cents: number;
  pagado_usd_cents: number;
  /** Derivado: no hay columna en la base. */
  vencida?: boolean;
}

export interface Pago {
  id: number;
  venta_id: number;
  cliente_id?: number;
  fecha: string;
  monto_usd_cents: number;
  monto_cor_cents: number;
  moneda: MonedaPago;
  tasa_cambio_cents: number;
  metodo: MetodoPago;
  referencia?: string;
  es_anticipo: boolean;
  cuota_id?: number;
  notas?: string;
  activo: boolean;
  creado_en?: string;
}

export interface PagoCompleto extends Pago {
  venta_codigo?: string;
  cliente_nombre?: string;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface ResumenFinanciero {
  inversion_inventario_usd_cents: number;
  por_cobrar_usd_cents: number;
  /**
   * Encargos cotizados que todavía no cubrieron su anticipo. No es una deuda:
   * la clienta no confirmó. Se muestra aparte para no inflar lo que te deben.
   */
  cotizado_sin_confirmar_usd_cents: number;
  anticipos_por_entregar_usd_cents: number;
  unidades_en_inventario: number;
  productos_activos: number;
}

export interface GananciaMes {
  mes: string;
  ventas_count: number;
  ingresos_usd_cents: number;
  costos_usd_cents: number;
  ganancia_usd_cents: number;
}

export interface FilaPorCobrar {
  venta_id: number;
  codigo: string;
  fecha: string;
  tipo: TipoVenta;
  estado: EstadoVenta;
  cliente_id?: number;
  cliente_nombre: string;
  cliente_telefono?: string;
  total_usd_cents: number;
  pagado_usd_cents: number;
  saldo_usd_cents: number;
  proxima_cuota?: string;
  cuotas_vencidas: number;
}

export interface FilaBajoStock {
  producto_id: number;
  codigo: string;
  nombre: string;
  stock_minimo: number;
  existencias: number;
  costo_unitario_usd_cents: number;
  precio_venta_usd_cents: number;
}

export interface FilaRotacion {
  producto_id: number;
  nombre: string;
  unidades_vendidas_90d: number;
  ganancia_90d_usd_cents: number;
  existencias: number;
}

export type SeveridadAlerta = 'urgente' | 'atencion' | 'info';

export interface Alerta {
  id: string;
  severidad: SeveridadAlerta;
  titulo: string;
  detalle: string;
  /** A dónde lleva el clic. */
  destino?: { vista: string; id?: number };
}

export interface PanelData {
  resumen: ResumenFinanciero;
  ganancia_mes_actual: GananciaMes | null;
  ganancia_mes_anterior: GananciaMes | null;
  historico: GananciaMes[];
  por_cobrar: FilaPorCobrar[];
  /** Cuántas ventas tienen saldo. `por_cobrar` trae sólo las primeras diez. */
  total_por_cobrar: number;
  bajo_stock: FilaBajoStock[];
  /** Cuántos productos están en el mínimo. `bajo_stock` trae sólo diez. */
  total_bajo_stock: number;
  mas_vendidos: FilaRotacion[];
  sin_rotacion: FilaRotacion[];
  alertas: Alerta[];
}

// ---------------------------------------------------------------------------
// Auditoría
// ---------------------------------------------------------------------------

export interface EventoAuditoria {
  /** Identificador ordenable por tiempo. No se muestra nunca. */
  id: string;
  evento_grupo_id: string;
  entidad_tipo: string;
  entidad_id: number;
  tipo_evento: string;
  estado_anterior?: string;
  estado_nuevo?: string;
  valor_anterior?: string;
  valor_nuevo?: string;
  detalle?: string;
  timestamp?: string;
  /**
   * Si esta acción se puede deshacer restaurando documentos.
   *
   * `deshacerGrupo` sabe reponer documentos, no mover mercadería. Una acción
   * que además movió existencias (cancelar una venta que ya había salido del
   * inventario, entregar un encargo) no se puede revertir así: restaurar el
   * documento dejaría la venta viva y la mercadería contada dos veces. Esas
   * se marcan con `false` y se rechazan enteras en vez de revertirse a medias.
   */
  reversible?: boolean;
}
