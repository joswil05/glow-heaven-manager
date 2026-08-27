import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { AdjuntosRepo } from '../db/repositories/adjuntos.repo';
import { IpcResult, GuardarBufferInput } from '../../shared/ipc-contracts';
import { formatErrorMessage } from '../../shared/errors';

export function registerAdjuntosHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.ADJUNTOS_GUARDAR_BUFFER,
    async (_, input: GuardarBufferInput): Promise<IpcResult<any>> => {
      try {
        const data = AdjuntosRepo.guardarBuffer(input);
        return { success: true, data };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );
}
