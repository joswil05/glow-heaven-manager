import { EstadoItem, EstadoCotizacion } from '../shared/types';

export interface ValidacionTransicionItemInput {
  estado_actual: EstadoItem;
  nuevo_estado: EstadoItem;
  anticipo_verificado: boolean;
  tiene_lote_asignado: boolean;
  saldo_pendiente_cor_cents: number;
}

export interface ValidacionTransicionResult {
  permitido: boolean;
  motivo_rechazo?: string;
}

export interface ItemEstadoDerivadoInput {
  id: number;
  estado: EstadoItem;
  activo: boolean;
}

export interface EstadoPedidoDerivadoResult {
  estado_derivado: EstadoItem;
  requiere_atencion: boolean;
  motivos_atencion: string[];
}

// Jerarquía de progreso de estados para derivación del pedido (menor índice = más atrasado)
const ORDEN_JERARQUIA_ESTADOS: EstadoItem[] = [
  'PENDIENTE_ANTICIPO',
  'ANTICIPO_OK',
  'EN_LISTA_USA',
  'COMPRADO',
  'EN_TRANSITO',
  'EN_NICARAGUA',
  'LISTO_ENTREGA',
  'ENTREGADO',
  'CERRADO',
];

const TRANSICIONES_VALIDAS_ITEM: Record<EstadoItem, EstadoItem[]> = {
  COTIZADO: ['PENDIENTE_ANTICIPO', 'CANCELADO'],
  PENDIENTE_ANTICIPO: ['ANTICIPO_OK', 'EN_LISTA_USA', 'CANCELADO'],
  ANTICIPO_OK: ['EN_LISTA_USA', 'CANCELADO'],
  EN_LISTA_USA: [
    'COMPRADO',
    'NO_DISPONIBLE',
    'CAMBIO_PRECIO',
    'SUSTITUTO_PROPUESTO',
    'CANCELADO',
  ],
  COMPRADO: ['EN_TRANSITO', 'NO_DISPONIBLE', 'CANCELADO'],
  EN_TRANSITO: ['EN_NICARAGUA', 'CANCELADO'],
  EN_NICARAGUA: ['LISTO_ENTREGA', 'CANCELADO'],
  LISTO_ENTREGA: ['ENTREGADO', 'ABANDONADO', 'CANCELADO'],
  ENTREGADO: ['CERRADO', 'DEVUELTO'],
  CERRADO: [],
  NO_DISPONIBLE: ['EN_LISTA_USA', 'CANCELADO'],
  CAMBIO_PRECIO: ['EN_LISTA_USA', 'CANCELADO'],
  SUSTITUTO_PROPUESTO: ['EN_LISTA_USA', 'CANCELADO'],
  ABANDONADO: ['CANCELADO'],
  DEVUELTO: ['CANCELADO'],
  CANCELADO: [],
};

const TRANSICIONES_VALIDAS_COTIZACION: Record<EstadoCotizacion, EstadoCotizacion[]> = {
  BORRADOR: ['ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA'],
  ENVIADA: ['ACEPTADA', 'RECHAZADA', 'VENCIDA'],
  ACEPTADA: [],
  RECHAZADA: [],
  VENCIDA: [],
};

/**
 * Valida si una transición de estado de un ítem es legal según la máquina de estados y las reglas de negocio.
 */
export function validarTransicionItem(
  input: ValidacionTransicionItemInput
): ValidacionTransicionResult {
  const permitidos = TRANSICIONES_VALIDAS_ITEM[input.estado_actual] || [];

  if (!permitidos.includes(input.nuevo_estado)) {
    return {
      permitido: false,
      motivo_rechazo: `No se permite cambiar de '${input.estado_actual}' a '${input.nuevo_estado}'.`,
    };
  }

  // Regla del semáforo: paso a compras USA exige anticipo verificado
  if (
    input.nuevo_estado === 'EN_LISTA_USA' &&
    !input.anticipo_verificado
  ) {
    return {
      permitido: false,
      motivo_rechazo:
        'Bloqueo de seguridad: No se puede enviar el producto a la lista de compras de USA sin el anticipo verificado en banco.',
    };
  }

  // Regla logística: paso a EN_TRANSITO exige lote asignado
  if (
    input.nuevo_estado === 'EN_TRANSITO' &&
    !input.tiene_lote_asignado
  ) {
    return {
      permitido: false,
      motivo_rechazo:
        'El producto debe estar asignado a un lote de importación antes de marcarlo en tránsito.',
    };
  }

  return { permitido: true };
}

/**
 * Valida transiciones del ciclo de vida de la cotización.
 */
export function validarTransicionCotizacion(
  actual: EstadoCotizacion,
  nuevo: EstadoCotizacion
): ValidacionTransicionResult {
  const permitidos = TRANSICIONES_VALIDAS_COTIZACION[actual] || [];
  if (!permitidos.includes(nuevo)) {
    return {
      permitido: false,
      motivo_rechazo: `No se puede cambiar la cotización de '${actual}' a '${nuevo}'.`,
    };
  }
  return { permitido: true };
}

/**
 * Calcula el estado derivado del pedido tomando el estado más atrasado de los ítems activos
 * y determina si requiere atención por excepciones.
 */
export function derivarEstadoPedido(
  items: ItemEstadoDerivadoInput[]
): EstadoPedidoDerivadoResult {
  const itemsActivos = items.filter((i) => i.activo && i.estado !== 'CANCELADO');

  if (itemsActivos.length === 0) {
    return {
      estado_derivado: 'CANCELADO',
      requiere_atencion: false,
      motivos_atencion: [],
    };
  }

  const motivos: string[] = [];
  let requiere_atencion = false;

  for (const item of itemsActivos) {
    if (item.estado === 'NO_DISPONIBLE') {
      requiere_atencion = true;
      motivos.push(`Ítem #${item.id} no disponible en tienda`);
    } else if (item.estado === 'CAMBIO_PRECIO') {
      requiere_atencion = true;
      motivos.push(`Ítem #${item.id} cambió de precio`);
    } else if (item.estado === 'SUSTITUTO_PROPUESTO') {
      requiere_atencion = true;
      motivos.push(`Ítem #${item.id} tiene sustituto propuesto`);
    }
  }

  // Buscar el estado de menor índice en la jerarquía (más atrasado)
  let menorIndice = Number.MAX_SAFE_INTEGER;
  let estadoMasAtrasado: EstadoItem = 'PENDIENTE_ANTICIPO';

  for (const item of itemsActivos) {
    let indice = ORDEN_JERARQUIA_ESTADOS.indexOf(item.estado);
    // Si es estado de excepción, su progreso equivale a EN_LISTA_USA
    if (indice === -1) {
      if (
        item.estado === 'NO_DISPONIBLE' ||
        item.estado === 'CAMBIO_PRECIO' ||
        item.estado === 'SUSTITUTO_PROPUESTO'
      ) {
        indice = ORDEN_JERARQUIA_ESTADOS.indexOf('EN_LISTA_USA');
      } else {
        indice = 0;
      }
    }

    if (indice < menorIndice) {
      menorIndice = indice;
      estadoMasAtrasado = ORDEN_JERARQUIA_ESTADOS[indice] || item.estado;
    }
  }

  return {
    estado_derivado: estadoMasAtrasado,
    requiere_atencion,
    motivos_atencion: motivos,
  };
}

/**
 * Etiquetas en español para cada estado del ítem.
 * Única fuente del texto que ve el usuario: la interfaz nunca escribe estos
 * nombres a mano, para que un estado nuevo no pueda quedar sin traducir.
 */
export const ETIQUETAS_ESTADO_ITEM: Record<EstadoItem, string> = {
  COTIZADO: 'Cotizado',
  PENDIENTE_ANTICIPO: 'Anticipo pendiente',
  ANTICIPO_OK: 'Anticipo recibido',
  EN_LISTA_USA: 'En lista de compras USA',
  COMPRADO: 'Comprado en USA',
  EN_TRANSITO: 'En tránsito a Nicaragua',
  EN_NICARAGUA: 'En Nicaragua',
  LISTO_ENTREGA: 'Listo para entregar',
  ENTREGADO: 'Entregado al cliente',
  CERRADO: 'Cerrado',
  NO_DISPONIBLE: 'No disponible (agotado)',
  CAMBIO_PRECIO: 'Cambió de precio en USA',
  SUSTITUTO_PROPUESTO: 'Sustituto propuesto',
  ABANDONADO: 'Abandonado por el cliente',
  DEVUELTO: 'Devuelto',
  CANCELADO: 'Cancelado',
};

/**
 * Transiciones legales desde un estado. La interfaz construye su menú con
 * esto, de modo que no pueda ofrecer un cambio que el validador rechazará.
 */
export function transicionesPermitidas(actual: EstadoItem): EstadoItem[] {
  return TRANSICIONES_VALIDAS_ITEM[actual] ?? [];
}
