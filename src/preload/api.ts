import { ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type { ApiPuente } from '../shared/ipc-contracts';

/**
 * Puente entre el renderer y el proceso main.
 * `ApiPuente` es el contrato: si un método no está en el tipo, TypeScript
 * lo rechaza acá y en la interfaz al mismo tiempo.
 */
export const api: ApiPuente = {
  auth: {
    iniciarGoogle: () => ipcRenderer.invoke(IPC.AUTH_GOOGLE_INICIAR),
    obtenerUsuario: () => ipcRenderer.invoke(IPC.AUTH_GET_USER),
    cerrarSesion: () => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
  },
  parametros: {
    get: () => ipcRenderer.invoke(IPC.PARAMETROS_GET),
    update: (valores) => ipcRenderer.invoke(IPC.PARAMETROS_UPDATE, valores),
    recalcularPrecios: () => ipcRenderer.invoke(IPC.PARAMETROS_RECALCULAR_PRECIOS),
  },
  categorias: {
    list: () => ipcRenderer.invoke(IPC.CATEGORIAS_LIST),
    guardar: (input) => ipcRenderer.invoke(IPC.CATEGORIAS_GUARDAR, input),
    archivar: (id) => ipcRenderer.invoke(IPC.CATEGORIAS_ARCHIVAR, id),
  },
  productos: {
    list: (filtros) => ipcRenderer.invoke(IPC.PRODUCTOS_LIST, filtros),
    get: (id) => ipcRenderer.invoke(IPC.PRODUCTOS_GET, id),
    crear: (input) => ipcRenderer.invoke(IPC.PRODUCTOS_CREAR, input),
    actualizar: (input) => ipcRenderer.invoke(IPC.PRODUCTOS_ACTUALIZAR, input),
    ajustarStock: (variante_id, existencias, motivo, producto_id) =>
      ipcRenderer.invoke(
        IPC.PRODUCTOS_AJUSTAR_STOCK,
        variante_id,
        existencias,
        motivo,
        producto_id
      ),
    archivar: (id) => ipcRenderer.invoke(IPC.PRODUCTOS_ARCHIVAR, id),
    reactivar: (id) => ipcRenderer.invoke(IPC.PRODUCTOS_REACTIVAR, id),
    eliminarDefinitivo: (id) => ipcRenderer.invoke(IPC.PRODUCTOS_ELIMINAR_DEFINITIVO, id),
    movimientos: (producto_id) => ipcRenderer.invoke(IPC.PRODUCTOS_MOVIMIENTOS, producto_id),
    simularPrecio: (input) => ipcRenderer.invoke(IPC.PRODUCTOS_SIMULAR_PRECIO, input),
  },
  compras: {
    list: () => ipcRenderer.invoke(IPC.COMPRAS_LIST),
    get: (id) => ipcRenderer.invoke(IPC.COMPRAS_GET, id),
    guardar: (input) => ipcRenderer.invoke(IPC.COMPRAS_GUARDAR, input),
    previsualizar: (input) => ipcRenderer.invoke(IPC.COMPRAS_PREVISUALIZAR, input),
    recibir: (id) => ipcRenderer.invoke(IPC.COMPRAS_RECIBIR, id),
    archivar: (id) => ipcRenderer.invoke(IPC.COMPRAS_ARCHIVAR, id),
  },
  ventas: {
    list: (filtros) => ipcRenderer.invoke(IPC.VENTAS_LIST, filtros),
    get: (id) => ipcRenderer.invoke(IPC.VENTAS_GET, id),
    crear: (input) => ipcRenderer.invoke(IPC.VENTAS_CREAR, input),
    cambiarEstado: (id, estado) => ipcRenderer.invoke(IPC.VENTAS_CAMBIAR_ESTADO, id, estado),
  },
  accesos: {
    list: () => ipcRenderer.invoke(IPC.ACCESOS_LIST),
    invitar: (correo) => ipcRenderer.invoke(IPC.ACCESOS_INVITAR, correo),
    quitar: (id, correo) => ipcRenderer.invoke(IPC.ACCESOS_QUITAR, id, correo),
  },
  pagos: {
    registrar: (input) => ipcRenderer.invoke(IPC.PAGOS_REGISTRAR, input),
    registrarAbonoCliente: (input) => ipcRenderer.invoke(IPC.PAGOS_REGISTRAR_ABONO_CLIENTE, input),
    listarPorCliente: (cliente_id) => ipcRenderer.invoke(IPC.PAGOS_LISTAR_POR_CLIENTE, cliente_id),
    listarPorVenta: (venta_id) => ipcRenderer.invoke(IPC.PAGOS_LISTAR_POR_VENTA, venta_id),
    anular: (pago_id) => ipcRenderer.invoke(IPC.PAGOS_ANULAR, pago_id),
    recientes: (limite) => ipcRenderer.invoke(IPC.PAGOS_RECIENTES, limite),
    enRango: (desde, hasta) => ipcRenderer.invoke(IPC.PAGOS_EN_RANGO, desde, hasta),
  },
  clientes: {
    list: (busqueda) => ipcRenderer.invoke(IPC.CLIENTES_LIST, busqueda),
    get: (id) => ipcRenderer.invoke(IPC.CLIENTES_GET, id),
    guardar: (input) => ipcRenderer.invoke(IPC.CLIENTES_GUARDAR, input),
    archivar: (id) => ipcRenderer.invoke(IPC.CLIENTES_ARCHIVAR, id),
  },
  panel: {
    cargar: () => ipcRenderer.invoke(IPC.PANEL_CARGAR),
  },
  acceso: {
    tienePin: () => ipcRenderer.invoke(IPC.ACCESO_TIENE_PIN),
    establecerPin: (pin) => ipcRenderer.invoke(IPC.ACCESO_ESTABLECER_PIN, pin),
    verificarPin: (pin) => ipcRenderer.invoke(IPC.ACCESO_VERIFICAR_PIN, pin),
    cambiarPin: (actual, nuevo) => ipcRenderer.invoke(IPC.ACCESO_CAMBIAR_PIN, actual, nuevo),
  },
  nube: {
    estado: () => ipcRenderer.invoke(IPC.NUBE_ESTADO),
    configurar: (correo, clave) => ipcRenderer.invoke(IPC.NUBE_CONFIGURAR, correo, clave),
    reconectar: () => ipcRenderer.invoke(IPC.NUBE_RECONECTAR),
  },
  sistema: {
    deshacer: (grupo_id) => ipcRenderer.invoke(IPC.SISTEMA_DESHACER, grupo_id),
    info: () => ipcRenderer.invoke(IPC.SISTEMA_INFO),
  },
  documentos: {
    imprimir: (html: string) => ipcRenderer.invoke(IPC.DOCUMENTOS_IMPRIMIR, html),
    guardarPdf: (input: { html: string; nombreSugerido: string }) =>
      ipcRenderer.invoke(IPC.DOCUMENTOS_GUARDAR_PDF, input),
  },
  actualizador: {
    onUpdateChecking: (cb) => {
      const listener = () => cb();
      ipcRenderer.on('app:update-checking', listener);
      return () => {
        ipcRenderer.removeListener('app:update-checking', listener);
      };
    },
    onUpdateAvailable: (cb) => {
      const listener = (_: any, data: any) => cb(data);
      ipcRenderer.on('app:update-available', listener);
      return () => {
        ipcRenderer.removeListener('app:update-available', listener);
      };
    },
    onUpdateProgress: (cb) => {
      const listener = (_: any, data: any) => cb(data);
      ipcRenderer.on('app:update-progress', listener);
      return () => {
        ipcRenderer.removeListener('app:update-progress', listener);
      };
    },
    onUpdateDownloaded: (cb) => {
      const listener = (_: any, data: any) => cb(data);
      ipcRenderer.on('app:update-downloaded', listener);
      return () => {
        ipcRenderer.removeListener('app:update-downloaded', listener);
      };
    },
    reiniciarYAplicar: () => ipcRenderer.invoke('app:restart-and-install-update'),
    verificarManual: () => ipcRenderer.invoke('app:check-for-updates'),
  },
};

