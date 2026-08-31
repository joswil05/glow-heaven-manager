import { ipcMain, shell } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { BackupService } from '../services/backup.service';
import { EventosRepo } from '../db/repositories/eventos.repo';
import { IpcResult } from '../../shared/ipc-contracts';
import { formatErrorMessage } from '../../shared/errors';

export function registerSistemaHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.SISTEMA_CREAR_BACKUP,
    async (_, { destinoPath }: { destinoPath?: string } = {}): Promise<IpcResult<any>> => {
      try {
        const data = await BackupService.crearBackup(destinoPath);
        return { success: true, data };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SISTEMA_DESHACER_ULTIMO_GRUPO,
    async (_, grupoId?: string): Promise<IpcResult<any>> => {
      try {
        const data = EventosRepo.deshacerUltimoGrupo(grupoId);
        return { success: true, data };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SISTEMA_ABRIR_WHATSAPP,
    async (
      _,
      { telefono, mensaje }: { telefono: string; mensaje: string }
    ): Promise<IpcResult<void>> => {
      try {
        // Limpiar teléfono (solo números) y agregar prefijo 505 si no lo tiene
        let clean = telefono.replace(/\D/g, '');
        if (clean.length === 8) {
          clean = `505${clean}`;
        }

        const url = `https://wa.me/${clean}?text=${encodeURIComponent(mensaje)}`;
        await shell.openExternal(url);
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );
}
