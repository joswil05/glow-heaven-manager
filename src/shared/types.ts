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
  cuentas_bancarias?: CuentaBancaria[];
  dias_alerta_mora?: number;
  dias_alerta_encargos?: number;
  moneda_defecto_venta?: 'USD' | 'NIO';
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

  modo_precio: ModoPrecio;
  margen_bp?: number;
  multiplicador_bp?: number;
  precio_manual_usd_cents?: number;
  precio_venta_usd_cents: number;

  stock_minimo: number;
  peso_unitario_mlb: number;
  /** Si viene en paquete con varias unidades (ej. 5 boxers por pack). */
  unidades_por_paquete?: number;
  /** Cantidad de packs comprados en la adquisición inicial (ej. 2 packs de 5). */
  packs_comprados?: number;
  /** Costo de compra en USA por el paquete completo (en centavos USD). */
  costo_pack_usa_usd_cents?: number;
  /** Si se aplicó tax de USA (7%) al calcular el costo unitario del pack. */
  aplicar_tax_usa?: boolean;
  /** Paquete de courier del que provino (opcional). */
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

  precio_linea_usd_cents: number;
  tax_linea_usd_cents: number;
  peso_linea_mlb: number;
  envio_asignado_usd_cents: number;
  otros_asignados_usd_cents: number;
  costo_linea_usd_cents: number;
  costo_unitario_usd_cents: number;

  destino: DestinoLinea;
  venta_id?: number;
  orden: number;

  // Complementarios para mostrar
  producto_nombre?: string;
  cliente_nombre?: string;

  // Precio de venta manual elegido por el usuario para este producto
  precio_venta_usd_cents?: number;
  // Soporte de multipacks (ej. paquetes de boxers)
  es_multipack?: boolean;
  packs_comprados?: number;
  unidades_por_pack?: number;
  precio_por_pack_usd_cents?: number;
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

  tasa_cambio_cents: number;
  notas?: string;
  activo: boolean;
  creado_en?: string;
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

export interface Venta {
  id: number;
  codigo: string;
  cliente_id?: number;
  fecha: string;
  tipo: TipoVenta;
  estado: EstadoVenta;

  tasa_cambio_cents: number;

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

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface ResumenFinanciero {
  inversion_inventario_usd_cents: number;
  inversion_en_camino_usd_cents: number;
  por_cobrar_usd_cents: number;
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
  bajo_stock: FilaBajoStock[];
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
}
