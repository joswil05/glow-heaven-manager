import { ipcMain } from 'electron';
import crypto from 'node:crypto';
import { IPC_CHANNELS } from '../../shared/ipc-channels';
import { PagosRepo } from '../db/repositories/pagos.repo';
import { AdjuntosRepo } from '../db/repositories/adjuntos.repo';
import { IpcResult, CrearPagoInput } from '../../shared/ipc-contracts';
import { CrearPagoSchema } from '../../shared/schemas/pago.schema';
import { formatErrorMessage } from '../../shared/errors';

export function registerPagosHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.PAGOS_CREATE,
    async (_, rawData: CrearPagoInput): Promise<IpcResult<any>> => {
      try {
        const validated = CrearPagoSchema.parse(rawData);
        const grupoId = crypto.randomUUID();

        const nuevoPago = PagosRepo.create(
          {
            ...rawData,
            ...validated,
          },
          grupoId
        );

        // Si incluye buffer de comprobante (Ctrl+V)
        if (rawData.buffer_comprobante && rawData.buffer_comprobante.length > 0) {
          AdjuntosRepo.guardarBuffer({
            buffer: rawData.buffer_comprobante,
            nombre_original: rawData.comprobante_nombre || 'comprobante_pago.png',
            entidad_tipo: 'PAGO',
            entidad_id: nuevoPago.id,
            tipo: 'COMPROBANTE',
          });
        }

        return { success: true, data: { ...nuevoPago, evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PAGOS_VERIFICAR,
    async (
      _,
      { pago_id, verificado }: { pago_id: number; verificado: boolean }
    ): Promise<IpcResult<{ evento_grupo_id: string }>> => {
      try {
        const grupoId = crypto.randomUUID();
        PagosRepo.verificar(pago_id, verificado, grupoId);
        return { success: true, data: { evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.PAGOS_LIST_BY_PEDIDO,
    async (_, pedido_id: number): Promise<IpcResult<any>> => {
      try {
        const data = PagosRepo.listByPedido(pedido_id);
        return { success: true, data };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );
}
