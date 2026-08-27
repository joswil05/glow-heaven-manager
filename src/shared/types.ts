export type EstadoCotizacion = 'BORRADOR' | 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'VENCIDA';

export type EstadoItem =
  | 'COTIZADO'
  | 'PENDIENTE_ANTICIPO'
  | 'ANTICIPO_OK'
  | 'EN_LISTA_USA'
  | 'COMPRADO'
  | 'EN_TRANSITO'
  | 'EN_NICARAGUA'
  | 'LISTO_ENTREGA'
  | 'ENTREGADO'
  | 'CERRADO'
  | 'NO_DISPONIBLE'
  | 'CAMBIO_PRECIO'
  | 'SUSTITUTO_PROPUESTO'
  | 'ABANDONADO'
  | 'DEVUELTO'
  | 'CANCELADO';

export type EstadoLote = 'ABIERTO' | 'COMPRADO' | 'EN_TRANSITO' | 'EN_NICARAGUA' | 'LIQUIDADO';

export type BaseProrrateo = 'PESO' | 'VALOR' | 'UNIDAD';

export type TipoCostoLote =
  | 'FLETE'
  | 'ARANCEL'
  | 'IVA_ADUANA'
  | 'CASILLERO'
  | 'HANDLING'
  | 'SEGURO'
  | 'EMPAQUE'
  | 'OTRO';

export type MetodoPago =
  | 'TRANSFERENCIA_BAC'
  | 'TRANSFERENCIA_BANPRO'
  | 'TRANSFERENCIA_LAFISE'
  | 'EFECTIVO'
  | 'OTRO';

export type TipoPago = 'ANTICIPO' | 'SALDO' | 'COMPLETO';

export type ColorSemaforo = 'ROJO' | 'AMARILLO' | 'VERDE';

export interface CuentaBancariaJSON {
  id?: number;
  banco: string;
  numero: string;
  titular: string;
  moneda: 'COR' | 'USD';
  tipo?: string;
}

export interface ParametrosSistema {
  tasa_cambio_oficial_cents: number; // Centavos de C$ por 1 USD (ej: 3662 para C$36.6243)
  tarifa_flete_cents_lb: number; // Centavos USD por lb (ej: 650 para $6.50)
  flete_minimo_usd_cents: number; // Centavos USD (ej: 1500 para $15.00)
  otros_costos_fijos_usd_cents: number; // Centavos USD de casillero/handling fijo (ej: 1000 para $10.00)
  umbral_arancel_excedente_usd_cents: number; // Centavos USD (ej: 5000 para $50.00)
  arancel_default_bp: number; // Basis points (ej: 3000 para 30%)
  tax_usa_default_bp: number; // Basis points (ej: 700 para 7.00%)
  comision_minima_cotizacion_cor_cents: number; // Centavos C$ (ej: 30000 para C$300)
  anticipo_default_bp: number; // Basis points (5000 = 50%, 7000 = 70%)
  saldo_inicial_bancos_cor_cents: number; // Centavos C$ capturados en onboarding
  saldo_inicial_fecha?: string;
  ruta_backup_configurada?: string;
  cuentas_bancarias: CuentaBancariaJSON[];
  telefono_usuario?: string;
}

export interface Categoria {
  id: number;
  nombre: string;
  comision_defecto_bp: number;
  arancel_estimado_bp: number;
  redondeo_cor_cents: number;
  activa: boolean;
}

export interface Tienda {
  id: number;
  nombre: string;
  url_base?: string;
  tax_rate_bp: number;
  activa: boolean;
}

export interface Cliente {
  id: number;
  nombre: string;
  alias?: string;
  telefono: string;
  direccion?: string;
  ciudad: string;
  cedula?: string;
  notas?: string;
  incumplio_anteriormente: boolean;
  activo: boolean;
  creado_en?: string;
}

export interface ClienteDetalle extends Cliente {
  pedidos_activos_count: number;
  saldo_total_pendiente_cor_cents: number;
  total_compras_cor_cents: number;
}

export interface CotizacionItem {
  id?: number;
  cotizacion_id?: number;
  tienda_id?: number;
  categoria_id?: number;
  descripcion: string;
  url?: string;
  precio_usa_usd_cents: number;
  tax_usa_usd_cents: number;
  peso_mlb: number;
  comision_bp: number;
  comision_cor_cents: number;
  arancel_estimado_usd_cents: number;
  flete_estimado_usd_cents: number;
  costo_aterrizado_estimado_usd_cents: number;
  precio_final_usd_cents: number;
  precio_final_cor_cents: number;
  anticipo_usd_cents: number;
  anticipo_cor_cents: number;
  saldo_usd_cents: number;
  saldo_cor_cents: number;
  orden: number;
}

export interface Cotizacion {
  id: number;
  codigo: string;
  cliente_id: number;
  fecha: string;
  valida_hasta: string;
  tasa_cambio_cents: number;
  tarifa_flete_cents_lb: number;
  estado: EstadoCotizacion;
  subtotal_usa_usd_cents: number;
  tax_usa_total_usd_cents: number;
  flete_estimado_total_usd_cents: number;
  arancel_estimado_total_usd_cents: number;
  costo_aterrizado_total_usd_cents: number;
  comision_total_cor_cents: number;
  total_usd_cents: number;
  total_cor_cents: number;
  anticipo_bp: number;
  anticipo_total_usd_cents: number;
  anticipo_total_cor_cents: number;
  saldo_total_usd_cents: number;
  saldo_total_cor_cents: number;
  notas?: string;
  activo: boolean;
  creado_en?: string;
}

export interface CotizacionCompleta extends Cotizacion {
  cliente: Cliente;
  items: CotizacionItem[];
}

export interface PedidoItem {
  id: number;
  pedido_id: number;
  cotizacion_item_id?: number;
  lote_id?: number;
  tienda_id?: number;
  categoria_id?: number;
  descripcion: string;
  url?: string;
  precio_usa_usd_cents: number;
  tax_usa_usd_cents: number;
  peso_mlb: number;
  estado: EstadoItem;
  costo_aterrizado_estimado_cents: number;
  costo_aterrizado_real_cents: number;
  margen_real_cents: number;
  prioridad: number;
  notas_tolerancia?: string;
  sustituto_de_item_id?: number;
  activo: boolean;
  creado_en?: string;
  // Campos complementarios
  tienda_nombre?: string;
  categoria_nombre?: string;
}

export interface Pedido {
  id: number;
  codigo: string;
  cotizacion_id?: number;
  cliente_id: number;
  fecha: string;
  tasa_cambio_cents: number;
  estado_derivado: EstadoItem;
  requiere_atencion: boolean;
  anticipo_verificado: boolean;
  total_usd_cents: number;
  total_cor_cents: number;
  anticipo_esperado_cor_cents: number;
  saldo_pendiente_cor_cents: number;
  saldo_pendiente_usd_cents: number;
  notas?: string;
  activo: boolean;
  creado_en?: string;
}

export interface PedidoCompleto extends Pedido {
  cliente: Cliente;
  items: PedidoItem[];
  pagos: Pago[];
  color_semaforo: ColorSemaforo;
}

export interface Pago {
  id: number;
  pedido_id: number;
  cliente_id: number;
  fecha: string;
  monto_usd_cents: number;
  monto_cor_cents: number;
  moneda_pago: 'COR' | 'USD';
  tasa_cambio_cents: number;
  metodo_pago: MetodoPago;
  referencia?: string;
  verificado: boolean;
  tipo_pago: TipoPago;
  comprobante_adjunto_id?: number;
  activo: boolean;
  creado_en?: string;
}

export interface EventoAuditoria {
  id: number;
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

export interface AlertaRow {
  tipo_alerta: string;
  severidad: string;
  entidad_id: number;
  entidad_tipo: string;
  pedido_id: number;
  cliente_nombre: string;
  cliente_telefono: string;
  mensaje: string;
  detalle_estado: string;
}

export interface CapitalLibreData {
  total_anticipos_recibidos_cor_cents: number;
  total_saldos_cobrados_cor_cents: number;
  total_por_cobrar_cor_cents: number;
  saldo_inicial_bancos_cor_cents: number;
}
