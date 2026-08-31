import { ipcMain } from 'electron';
import crypto from 'node:crypto';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { ClientesRepo } from '../db/repositories/clientes.repo';
import { IpcResult, CrearClienteInput, ActualizarClienteInput } from '../../shared/ipc-contracts';
import { CrearClienteSchema, ActualizarClienteSchema } from '../../shared/schemas/cliente.schema';
import { formatErrorMessage } from '../../shared/errors';

export function registerClientesHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CLIENTES_LIST,
    async (_, args?: { query?: string; activo?: boolean }): Promise<IpcResult<any>> => {
      try {
        const data = ClientesRepo.list(args?.query, args?.activo ?? true);
        return { success: true, data };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLIENTES_GET_BY_ID,
    async (_, id: number): Promise<IpcResult<any>> => {
      try {
        const data = ClientesRepo.getById(id);
        if (!data) {
          return {
            success: false,
            error: { code: 'NOT_FOUND', message: `Cliente con ID ${id} no encontrado` },
          };
        }
        return { success: true, data };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLIENTES_CREATE,
    async (_, rawData: CrearClienteInput): Promise<IpcResult<any>> => {
      try {
        const data = CrearClienteSchema.parse(rawData);
        const grupoId = crypto.randomUUID();
        const nuevoCliente = ClientesRepo.create(data, grupoId);
        return { success: true, data: { ...nuevoCliente, evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLIENTES_UPDATE,
    async (
      _,
      { id, data: rawData }: { id: number; data: ActualizarClienteInput }
    ): Promise<IpcResult<any>> => {
      try {
        const data = ActualizarClienteSchema.parse(rawData);
        const grupoId = crypto.randomUUID();
        const clienteActualizado = ClientesRepo.update(id, data, grupoId);
        return { success: true, data: { ...clienteActualizado, evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );
}
