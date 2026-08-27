import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels';
import type {
  IpcResult,
  GuardarParametrosInicialesInput,
  CategoriaCambio,
  CrearClienteInput,
  ActualizarClienteInput,
  CrearCotizacionInput,
  CrearPagoInput,
  GuardarBufferInput,
  HoyViewData,
} from '../shared/ipc-contracts';
import type {
  Cliente,
  ClienteDetalle,
  Cotizacion,
  CotizacionCompleta,
  Pedido,
  PedidoCompleto,
  Pago,
  ParametrosSistema,
  Categoria,
  Tienda,
  AlertaRow,
  CapitalLibreData,
  EstadoCotizacion,
  EstadoItem,
} from '../shared/types';

export const api = {
  parametros: {
    get: (): Promise<IpcResult<ParametrosSistema>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PARAMETROS_GET),
    update: (clave: string, valor: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PARAMETROS_UPDATE, { clave, valor }),
    guardarIniciales: (input: GuardarParametrosInicialesInput): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PARAMETROS_GUARDAR_INICIALES, input),
  },
  categorias: {
    list: (): Promise<IpcResult<Categoria[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORIAS_LIST),
    update: (cambios: CategoriaCambio[]): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORIAS_UPDATE, { cambios }),
  },
  tiendas: {
    list: (): Promise<IpcResult<Tienda[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.TIENDAS_LIST),
  },
  clientes: {
    list: (query?: string, activo: boolean = true): Promise<IpcResult<Cliente[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIENTES_LIST, { query, activo }),
    getById: (id: number): Promise<IpcResult<ClienteDetalle>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIENTES_GET_BY_ID, id),
    create: (data: CrearClienteInput): Promise<IpcResult<Cliente>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIENTES_CREATE, data),
    update: (id: number, data: ActualizarClienteInput): Promise<IpcResult<Cliente>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CLIENTES_UPDATE, { id, data }),
  },
  cotizaciones: {
    list: (estado?: EstadoCotizacion, cliente_id?: number): Promise<IpcResult<Cotizacion[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COTIZACIONES_LIST, { estado, cliente_id }),
    getById: (id: number): Promise<IpcResult<CotizacionCompleta>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COTIZACIONES_GET_BY_ID, id),
    create: (data: CrearCotizacionInput): Promise<IpcResult<CotizacionCompleta>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COTIZACIONES_CREATE, data),
    marcarEnviada: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COTIZACIONES_MARCAR_ENVIADA, id),
    aceptar: (id: number): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COTIZACIONES_ACEPTAR, id),
    rechazar: (id: number, motivo?: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COTIZACIONES_RECHAZAR, { id, motivo }),
    convertirAPedido: (
      cotizacion_id: number,
      notas?: string
    ): Promise<IpcResult<PedidoCompleto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.COTIZACIONES_CONVERTIR_A_PEDIDO, { cotizacion_id, notas }),
  },
  pedidos: {
    list: (
      estado_derivado?: string,
      requiere_atencion?: boolean
    ): Promise<IpcResult<Pedido[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEDIDOS_LIST, { estado_derivado, requiere_atencion }),
    getById: (id: number): Promise<IpcResult<PedidoCompleto>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEDIDOS_GET_BY_ID, id),
    cambiarEstadoItem: (
      item_id: number,
      nuevo_estado: EstadoItem,
      motivo?: string
    ): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PEDIDOS_CAMBIAR_ESTADO_ITEM, {
        item_id,
        nuevo_estado,
        motivo,
      }),
  },
  pagos: {
    create: (data: CrearPagoInput): Promise<IpcResult<Pago>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PAGOS_CREATE, data),
    verificar: (pago_id: number, verificado: boolean): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PAGOS_VERIFICAR, { pago_id, verificado }),
    listByPedido: (pedido_id: number): Promise<IpcResult<Pago[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PAGOS_LIST_BY_PEDIDO, pedido_id),
  },
  vistas: {
    getHoy: (): Promise<IpcResult<HoyViewData>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VISTAS_GET_HOY),
    getAlertas: (): Promise<IpcResult<AlertaRow[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VISTAS_GET_ALERTAS),
    getCapitalLibre: (): Promise<IpcResult<CapitalLibreData>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VISTAS_GET_CAPITAL_LIBRE),
    getSemaforo: (): Promise<IpcResult<any[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.VISTAS_GET_SEMAFORO),
  },
  adjuntos: {
    guardarBuffer: (input: GuardarBufferInput): Promise<IpcResult<{ id: number; ruta_archivo: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.ADJUNTOS_GUARDAR_BUFFER, input),
  },
  sistema: {
    crearBackup: (
      destinoPath?: string
    ): Promise<IpcResult<{ ruta_backup: string; timestamp: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SISTEMA_CREAR_BACKUP, { destinoPath }),
    deshacerUltimoGrupo: (): Promise<IpcResult<{ revertido: boolean; descripcion: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SISTEMA_DESHACER_ULTIMO_GRUPO),
    abrirWhatsApp: (telefono: string, mensaje: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SISTEMA_ABRIR_WHATSAPP, { telefono, mensaje }),
  },
};

export type ElectronApi = typeof api;
