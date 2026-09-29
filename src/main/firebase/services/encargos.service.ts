import { VentasRepoFirestore } from '../repositories/ventas.repo';
import { PagosRepoFirestore } from '../repositories/pagos.repo';
import type { PagoAlAceptar } from '../../../shared/ipc-contracts';

/**
 * "Aceptó": la clienta dijo que sí a la cotización, y quizás pagó algo en el
 * mismo momento. Vive acá y no en una pantalla porque lo usan la computadora
 * (por IPC) y el celular, y el orden importa.
 *
 * Primero el pago, después aceptar. Deshacer rechaza un grupo si el documento
 * cambió después del evento que lo restaura: si se aceptara primero, el pago
 * tocaría la venta y el grupo quedaría sin poder deshacerse. Así, `aceptar`
 * es lo último que toca la venta y su instantánea ya incluye el pago.
 *
 * Un pago que cubre el anticipo ya acepta el encargo solo; `aceptar` entonces
 * no hace nada.
 */
export async function aceptarEncargo(
  venta_id: number,
  pago: PagoAlAceptar | undefined,
  evento_grupo_id: string
): Promise<void> {
  if (pago && pago.monto_cents > 0) {
    await PagosRepoFirestore.registrar({ ...pago, venta_id, es_anticipo: true }, evento_grupo_id);
  }
  await VentasRepoFirestore.aceptar(venta_id, evento_grupo_id);
}
