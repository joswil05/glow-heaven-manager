import type { ParametrosSistema } from '../../../shared/types';
import { mensajeCobro, mensajeSaludo, enlaceMensaje } from '@core/mensajes';

/**
 * El WhatsApp de cobro de una venta o de la cuenta de una clienta.
 *
 * El mensaje sale de `@core/mensajes`, el mismo de todos los botones de las
 * dos apps; acá sólo se elige entre recordar lo que debe o saludar si no debe
 * nada. Los córdobas los calcula quien llama, con la tasa de cada venta: con
 * la de hoy, pagar exactamente lo del mensaje no cerraba la cuenta.
 */
export function enlaceCobro(
  c: {
    telefono?: string | null;
    cliente: string;
    saldo_usd_cents: number;
    /** El saldo en córdobas con la tasa de su venta (o la suma, venta por venta). */
    saldo_cor_cents: number;
    codigo?: string;
  },
  parametros: ParametrosSistema | null | undefined
): string {
  const mensaje =
    c.saldo_usd_cents > 0
      ? mensajeCobro(
          { cliente: c.cliente, saldo_usd_cents: c.saldo_usd_cents, saldo_cor_cents: c.saldo_cor_cents, codigo: c.codigo },
          parametros
        )
      : mensajeSaludo(c.cliente);
  return enlaceMensaje(c.telefono, mensaje, parametros);
}
