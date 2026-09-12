/**
 * Canales IPC. El renderer nunca toca la base: todo pasa por acá.
 */
export const IPC = {
  // Configuración
  PARAMETROS_GET: 'parametros:get',
  PARAMETROS_UPDATE: 'parametros:update',
  PARAMETROS_RECALCULAR_PRECIOS: 'parametros:recalcularPrecios',

  CATEGORIAS_LIST: 'categorias:list',
  CATEGORIAS_GUARDAR: 'categorias:guardar',
  CATEGORIAS_ARCHIVAR: 'categorias:archivar',

  // Inventario
  PRODUCTOS_LIST: 'productos:list',
  PRODUCTOS_GET: 'productos:get',
  PRODUCTOS_CREAR: 'productos:crear',
  PRODUCTOS_ACTUALIZAR: 'productos:actualizar',
  PRODUCTOS_AJUSTAR_STOCK: 'productos:ajustarStock',
  PRODUCTOS_ARCHIVAR: 'productos:archivar',
  PRODUCTOS_REACTIVAR: 'productos:reactivar',
  PRODUCTOS_ELIMINAR_DEFINITIVO: 'productos:eliminarDefinitivo',
  PRODUCTOS_MOVIMIENTOS: 'productos:movimientos',
  PRODUCTOS_SIMULAR_PRECIO: 'productos:simularPrecio',

  // Paquetes recibidos
  COMPRAS_LIST: 'compras:list',
  COMPRAS_GET: 'compras:get',
  COMPRAS_GUARDAR: 'compras:guardar',
  COMPRAS_PREVISUALIZAR: 'compras:previsualizar',
  COMPRAS_RECIBIR: 'compras:recibir',
  COMPRAS_ARCHIVAR: 'compras:archivar',

  // Ventas y encargos
  VENTAS_LIST: 'ventas:list',
  VENTAS_GET: 'ventas:get',
  VENTAS_CREAR: 'ventas:crear',
  VENTAS_CAMBIAR_ESTADO: 'ventas:cambiarEstado',

  // Pagos
  PAGOS_REGISTRAR: 'pagos:registrar',
  PAGOS_REGISTRAR_ABONO_CLIENTE: 'pagos:registrarAbonoCliente',
  PAGOS_LISTAR_POR_CLIENTE: 'pagos:listarPorCliente',
  PAGOS_LISTAR_POR_VENTA: 'pagos:listarPorVenta',
  PAGOS_ANULAR: 'pagos:anular',
  PAGOS_RECIENTES: 'pagos:recientes',

  // Clientes
  CLIENTES_LIST: 'clientes:list',
  CLIENTES_GET: 'clientes:get',
  CLIENTES_GUARDAR: 'clientes:guardar',
  CLIENTES_ARCHIVAR: 'clientes:archivar',

  // Panel
  PANEL_CARGAR: 'panel:cargar',

  // Documentos e Impresión
  DOCUMENTOS_IMPRIMIR: 'documentos:imprimir',
  DOCUMENTOS_GUARDAR_PDF: 'documentos:guardarPdf',

  // Sistema
  SISTEMA_DESHACER: 'sistema:deshacer',
  SISTEMA_INFO: 'sistema:info',

  // Acceso
  ACCESO_TIENE_PIN: 'acceso:tienePin',
  ACCESO_ESTABLECER_PIN: 'acceso:establecerPin',
  ACCESO_VERIFICAR_PIN: 'acceso:verificarPin',
  ACCESO_CAMBIAR_PIN: 'acceso:cambiarPin',

  // Conexión con Firebase
  NUBE_ESTADO: 'nube:estado',
  NUBE_CONFIGURAR: 'nube:configurar',
  NUBE_RECONECTAR: 'nube:reconectar',

  // Autenticación con Google
  AUTH_GOOGLE_INICIAR: 'auth:google:iniciar',
  AUTH_GET_USER: 'auth:getUser',
  AUTH_LOGOUT: 'auth:logout',
} as const;

export type CanalIPC = (typeof IPC)[keyof typeof IPC];
