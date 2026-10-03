import { PagosRepoFirestore, type RegistrarPagoInput } from '@repos/pagos.repo';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { aceptarEncargo } from '../../../src/main/firebase/services/encargos.service';

/** La hoja conserva su formulario; sólo cambia la acción al aceptar un encargo. */
export async function registrarAbonoMovil(
  input: RegistrarPagoInput,
  grupo: string,
  aceptar = false,
): Promise<{ saldo_usd_cents: number }> {
  if (!Number.isSafeInteger(input.monto_cents) || input.monto_cents <= 0) {
    throw new Error('El monto del abono tiene que ser mayor a cero y expresarse en centavos enteros.');
  }
  if (!aceptar) return PagosRepoFirestore.registrar(input, grupo);

  const { venta_id, es_anticipo: _anticipo, cuota_id: _cuota, ...pago } = input;
  // El servicio registra el pago primero y acepta después, con el mismo grupo
  // para Deshacer. Si falla la aceptación, no repetimos el pago ya guardado.
  await aceptarEncargo(venta_id, pago, grupo);
  const venta = await VentasRepoFirestore.getById(venta_id);
  if (!venta) throw new Error('No se pudo volver a leer el encargo.');
  return { saldo_usd_cents: venta.saldo_usd_cents };
}
