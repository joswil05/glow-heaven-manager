import { ipcMain } from 'electron';
import crypto from 'node:crypto';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { CotizacionesRepo } from '../db/repositories/cotizaciones.repo';
import { IpcResult, CrearCotizacionInput } from '../../shared/ipc-contracts';
import { CrearCotizacionSchema } from '../../shared/schemas/cotizacion.schema';
import { EstadoCotizacion } from '../../shared/types';
import { formatErrorMessage } from '../../shared/errors';

export function registerCotizacionesHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.COTIZACIONES_LIST,
    async (
      _,
      args?: { estado?: EstadoCotizacion; cliente_id?: number }
    ): Promise<IpcResult<any>> => {
      try {
        const data = CotizacionesRepo.list(args?.estado, args?.cliente_id);
        return { success: true, data };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.COTIZACIONES_GET_BY_ID,
    async (_, id: number): Promise<IpcResult<any>> => {
      try {
        const data = CotizacionesRepo.getById(id);
        if (!data) {
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: `Cotización con ID ${id} no encontrada` },
          };
        }
        return { success: true, data };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.COTIZACIONES_CREATE,
    async (_, rawData: CrearCotizacionInput): Promise<IpcResult<any>> => {
      try {
        const data = CrearCotizacionSchema.parse(rawData);
        const grupoId = crypto.randomUUID();
        const nuevaCotizacion = CotizacionesRepo.create(data as any, grupoId);
        return { success: true, data: nuevaCotizacion };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.COTIZACIONES_MARCAR_ENVIADA,
    async (_, id: number): Promise<IpcResult<{ evento_grupo_id: string }>> => {
      try {
        const grupoId = crypto.randomUUID();
        CotizacionesRepo.cambiarEstado(id, 'ENVIADA', grupoId);
        return { success: true, data: { evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.COTIZACIONES_ACEPTAR,
    async (_, id: number): Promise<IpcResult<{ evento_grupo_id: string }>> => {
      try {
        const grupoId = crypto.randomUUID();
        CotizacionesRepo.cambiarEstado(id, 'ACEPTADA', grupoId);
        return { success: true, data: { evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.COTIZACIONES_RECHAZAR,
    async (_, { id }: { id: number; motivo?: string }): Promise<IpcResult<{ evento_grupo_id: string }>> => {
      try {
        const grupoId = crypto.randomUUID();
        CotizacionesRepo.cambiarEstado(id, 'RECHAZADA', grupoId);
        return { success: true, data: { evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.COTIZACIONES_CONVERTIR_A_PEDIDO,
    async (
      _,
      { cotizacion_id, notas }: { cotizacion_id: number; notas?: string }
    ): Promise<IpcResult<any>> => {
      try {
        const grupoId = crypto.randomUUID();
        const nuevoPedido = CotizacionesRepo.convertirAPedido(
          cotizacion_id,
          grupoId,
          notas
        );
        return { success: true, data: { ...nuevoPedido, evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );
}
