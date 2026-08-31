export const IPC_CHANNELS = {
  // Parámetros
  PARAMETROS_GET: 'parametros:get',
  PARAMETROS_UPDATE: 'parametros:update',
  PARAMETROS_UPDATE_MANY: 'parametros:update-many',
  PARAMETROS_GUARDAR_INICIALES: 'parametros:guardar-iniciales',

  // Categorías y Tiendas
  CATEGORIAS_LIST: 'categorias:list',
  CATEGORIAS_UPDATE: 'categorias:update',
  TIENDAS_LIST: 'tiendas:list',

  // Clientes
  CLIENTES_LIST: 'clientes:list',
  CLIENTES_GET_BY_ID: 'clientes:get-by-id',
  CLIENTES_CREATE: 'clientes:create',
  CLIENTES_UPDATE: 'clientes:update',

  // Cotizaciones
  COTIZACIONES_LIST: 'cotizaciones:list',
  COTIZACIONES_GET_BY_ID: 'cotizaciones:get-by-id',
  COTIZACIONES_CREATE: 'cotizaciones:create',
  COTIZACIONES_MARCAR_ENVIADA: 'cotizaciones:marcar-enviada',
  COTIZACIONES_ACEPTAR: 'cotizaciones:aceptar',
  COTIZACIONES_RECHAZAR: 'cotizaciones:rechazar',
  COTIZACIONES_CONVERTIR_A_PEDIDO: 'cotizaciones:convertir-a-pedido',

  // Pedidos
  PEDIDOS_LIST: 'pedidos:list',
  PEDIDOS_GET_BY_ID: 'pedidos:get-by-id',
  PEDIDOS_CAMBIAR_ESTADO_ITEM: 'pedidos:cambiar-estado-item',

  // Pagos
  PAGOS_CREATE: 'pagos:create',
  PAGOS_VERIFICAR: 'pagos:verificar',
  PAGOS_LIST_BY_PEDIDO: 'pagos:list-by-pedido',

  // Vistas
  VISTAS_GET_HOY: 'vistas:get-hoy',
  VISTAS_GET_ALERTAS: 'vistas:get-alertas',
  VISTAS_GET_CAPITAL_LIBRE: 'vistas:get-capital-libre',
  VISTAS_GET_SEMAFORO: 'vistas:get-semaforo',
  VISTAS_GET_LISTA_COMPRAS: 'vistas:get-lista-compras',
  VISTAS_GET_PENDIENTES_LISTA: 'vistas:get-pendientes-lista',

  // Adjuntos
  ADJUNTOS_GUARDAR_BUFFER: 'adjuntos:guardar-buffer',

  // Sistema
  SISTEMA_CREAR_BACKUP: 'sistema:crear-backup',
  SISTEMA_DESHACER_ULTIMO_GRUPO: 'sistema:deshacer-ultimo-grupo',
  SISTEMA_ABRIR_WHATSAPP: 'sistema:abrir-whatsapp',
} as const;
