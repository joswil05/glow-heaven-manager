import { ipcMain } from 'electron';
import crypto from 'node:crypto';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { PedidosRepo } from '../db/repositories/pedidos.repo';
import { IpcResult, CambiarEstadoItemInput } from '../../shared/ipc-contracts';
import { formatErrorMessage } from '../../shared/errors';

export function registerPedidosHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.PEDIDOS_LIST,
    async (
      _,
      args?: { estado_derivado?: string; requiere_atencion?: boolean }
    ): Promise<IpcResult<any>> => {
      try {
        const data = PedidosRepo.list(args?.estado_derivado, args?.requiere_atencion);
        return { success: true, data };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PEDIDOS_GET_BY_ID,
    async (_, id: number): Promise<IpcResult<any>> => {
      try {
        const data = PedidosRepo.getById(id);
        if (!data) {
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: `Pedido con ID ${id} no encontrado` },
          };
        }
        return { success: true, data };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PEDIDOS_CAMBIAR_ESTADO_ITEM,
    async (_, input: CambiarEstadoItemInput): Promise<IpcResult<{ evento_grupo_id: string }>> => {
      try {
        const grupoId = crypto.randomUUID();
        PedidosRepo.cambiarEstadoItem(
          input.item_id,
          input.nuevo_estado,
          grupoId,
          input.motivo
        );
        return { success: true, data: { evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );
}
