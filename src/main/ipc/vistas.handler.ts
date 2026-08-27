import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { VistasRepo } from '../db/repositories/vistas.repo';
import { IpcResult } from '../../shared/ipc-contracts';
import { formatErrorMessage } from '../../shared/errors';

export function registerVistasHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.VISTAS_GET_HOY, async (): Promise<IpcResult<any>> => {
    try {
      const data = VistasRepo.getHoyData();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.VISTAS_GET_ALERTAS, async (): Promise<IpcResult<any>> => {
    try {
      const data = VistasRepo.getAlertas();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.VISTAS_GET_CAPITAL_LIBRE, async (): Promise<IpcResult<any>> => {
    try {
      const data = VistasRepo.getCapitalLibre();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: formatErrorMessage(error) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.VISTAS_GET_SEMAFORO, async (): Promise<IpcResult<any>> => {
    try {
      const data = VistasRepo.getSemaforoCompras();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: formatErrorMessage(error) };
    }
  });
}
