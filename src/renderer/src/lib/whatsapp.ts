import type { ParametrosSistema } from '../../../shared/types';
import { formatearMoneda } from '@core/moneda';
import { telefonoWhatsapp } from '@core/telefono';

/**
 * Genera el enlace directo a WhatsApp con mensaje pre-rellenado para cobro de saldos pendientes
 * o saludo a clientes, usando la plantilla configurada en parámetros del sistema.
 */
export function enlaceWhatsApp(
  telefono: string,
  nombre: string,
  saldoUsdCents: number,
  parametros?: ParametrosSistema | null
): string {
  const numero = telefonoWhatsapp(telefono, parametros?.codigo_pais_whatsapp) ?? '';

  if (saldoUsdCents <= 0) {
    return `https://wa.me/${numero}?text=${encodeURIComponent(`Hola ${nombre.split(' ')[0]}!`)}`;
  }

  const saldoUsd = formatearMoneda(saldoUsdCents, 'USD');
  const tasa = (parametros?.tasa_cambio_cents ?? 3662) / 100;
  const saldoCs = formatearMoneda(Math.round(saldoUsdCents * tasa), 'COR');

  const cuentasTxt =
    (parametros?.cuentas_bancarias ?? []).length > 0
      ? (parametros?.cuentas_bancarias ?? [])
          .map((cta) => `${cta.banco} (${cta.moneda}): ${cta.numero}${cta.titular ? ' - ' + cta.titular : ''}`)
          .join('\n')
      : '';

  const plantilla =
    parametros?.plantilla_cobro_whatsapp ||
    'Hola {cliente}, te saludamos de Glow Heaven ✨ Te recordamos que tienes un saldo pendiente de {saldo_usd} ({saldo_cs}). Si ya realizaste tu abono, por favor compártenos el comprobante. ¡Muchas gracias!';

  const mensaje = plantilla
    .replace(/\{cliente\}/g, nombre)
    .replace(/\{saldo_usd\}/g, saldoUsd)
    .replace(/\{saldo_cs\}/g, saldoCs)
    .replace(/\{cuentas_bancarias\}/g, cuentasTxt ? `\nCuentas bancarias:\n${cuentasTxt}` : '');

  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
