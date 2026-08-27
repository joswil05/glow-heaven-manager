import type {
  AlertaRow,
  EstadoItem,
} from './types';

export type IpcResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };

export interface GuardarParametrosInicialesInput {
  cuentas_bancarias: {
    banco: string;
    numero: string;
    titular: string;
    moneda: 'COR' | 'USD';
  }[];
  tarifa_flete_usd: number; // en float para capturar desde UI (ej: 6.50)
  flete_minimo_usd?: number; // ej: 15.00
  otros_costos_fijos_usd?: number; // ej: 10.00 de casillero fijo
  arancel_default_porcentaje: number; // ej: 32.5
  comisiones_categoria: {
    categoria_id: number;
    porcentaje: number; // ej: 35
  }[];
  saldo_inicial_bancos_cor: number; // ej: 25000.00
  ruta_backup?: string;
  telefono_usuario?: string;
}

export interface CrearClienteInput {
  nombre: string;
  alias?: string;
  telefono: string;
  direccion?: string;
  ciudad?: string;
  cedula?: string;
  notas?: string;
  incumplio_anteriormente?: boolean;
}

export interface ActualizarClienteInput extends Partial<CrearClienteInput> {
  activo?: boolean;
}

export interface ItemCotizacionDraftInput {
  id?: number;
  descripcion: string;
  tienda_id?: number;
  categoria_id?: number;
  url?: string;
  precio_usa_usd_cents: number;
  peso_mlb: number;
}

export interface CrearCotizacionInput {
  cliente_id: number;
  items: ItemCotizacionDraftInput[];
  anticipo_bp?: number; // 5000 o 7000
  notas?: string;
}

export interface ActualizarCotizacionInput {
  items: ItemCotizacionDraftInput[];
  anticipo_bp?: number;
  notas?: string;
}

export interface CrearPagoInput {
  pedido_id: number;
  monto_cents: number;
  moneda_pago: 'COR' | 'USD';
  metodo_pago: string;
  referencia?: string;
  verificado: boolean;
  tipo_pago: 'ANTICIPO' | 'SALDO' | 'COMPLETO';
  buffer_comprobante?: Uint8Array;
  comprobante_nombre?: string;
}

export interface CambiarEstadoItemInput {
  item_id: number;
  nuevo_estado: EstadoItem;
  motivo?: string;
}

export interface HoyViewData {
  alertas_decision: AlertaRow[];
  total_anticipos_recibidos_cor_cents: number;
  total_saldos_por_cobrar_cor_cents: number;
  entregas_hoy_count: number;
  esperando_otros_count: number;
}

export interface GuardarBufferInput {
  buffer: Uint8Array;
  nombre_original: string;
  entidad_tipo: 'PEDIDO' | 'PAGO' | 'ITEM';
  entidad_id: number;
  tipo: 'COMPROBANTE' | 'FOTO_PRODUCTO';
  mime_type?: string;
}
