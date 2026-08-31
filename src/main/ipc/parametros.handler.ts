import { ipcMain } from 'electron';
import crypto from 'node:crypto';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { ParametrosRepo } from '../db/repositories/parametros.repo';
import {
  IpcResult,
  GuardarParametrosInicialesInput,
  ActualizarCategoriasInput,
} from '../../shared/ipc-contracts';
import { formatErrorMessage } from '../../shared/errors';

export function registerParametrosHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PARAMETROS_GET, async (): Promise<IpcResult<any>> => {
    try {
      const data = ParametrosRepo.getParametros();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.PARAMETROS_UPDATE,
    async (_, { clave, valor }: { clave: string; valor: string }): Promise<IpcResult<void>> => {
      try {
        ParametrosRepo.updateParametro(clave, valor);
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PARAMETROS_GUARDAR_INICIALES,
    async (_, input: GuardarParametrosInicialesInput): Promise<IpcResult<void>> => {
      try {
        ParametrosRepo.guardarParametrosIniciales(input);
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.CATEGORIAS_LIST, async (): Promise<IpcResult<any>> => {
    try {
      const data = ParametrosRepo.getCategorias();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.CATEGORIAS_UPDATE,
    async (_, input: ActualizarCategoriasInput): Promise<IpcResult<{ evento_grupo_id: string }>> => {
      try {
        const grupoId = crypto.randomUUID();
        ParametrosRepo.actualizarCategorias(input.cambios, grupoId);
        return { success: true, data: { evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.TIENDAS_LIST, async (): Promise<IpcResult<any>> => {
    try {
      const data = ParametrosRepo.getTiendas();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: formatErrorMessage(error) };
    }
  });
}
