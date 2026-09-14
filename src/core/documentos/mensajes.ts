import { formatearMoneda } from '../moneda';
import type { VentaCompleta, ParametrosSistema, CuentaBancaria } from '../../shared/types';

/**
 * Mensaje de WhatsApp que acompaña a una factura o proforma.
 *
 * Vive acá y no dentro de una pantalla porque las DOS apps lo mandan, y si
 * cada una arma el suyo terminan diciendo cosas distintas del mismo negocio.
 * Estaba escrito dentro del modal de escritorio; el celular no tenía forma de
 * mandarlo.
 *
 * Acá sí van los emoji, al revés que en el documento: esto es un mensaje
 * personal a una clienta. El comprobante que lo acompaña es el que tiene que
 * ser sobrio, porque se archiva.
 *
 * Las plantillas se editan en la configuración de Windows
 * (`plantilla_factura_whatsapp` y `plantilla_proforma_whatsapp`), y lo que se
 * escribe allá vale también para el celular.
 */
export function mensajeWhatsappDocumento(
  venta: VentaCompleta,
  parametros: ParametrosSistema | null
): string {
  const tasa = parametros?.tasa_cambio_cents ?? 3662;
  const totalCs = Math.round((venta.total_usd_cents * tasa) / 100);
  const esEncargo = venta.tipo === 'ENCARGO';

  const cuentasTxt = ((parametros?.cuentas_bancarias ?? []) as CuentaBancaria[])
    .map((c) => `${c.banco} (${c.moneda}): ${c.numero}${c.titular ? ' - ' + c.titular : ''}`)
    .join('\n');

  const comunes = (t: string) =>
    t
      .replace(/\{cliente\}/g, venta.cliente_nombre ?? 'Clienta')
      .replace(/\{codigo\}/g, venta.codigo)
      .replace(/\{total_usd\}/g, formatearMoneda(venta.total_usd_cents, 'USD'))
      .replace(/\{total_cs\}/g, formatearMoneda(totalCs, 'COR'));

  if (esEncargo) {
    const plantilla =
      parametros?.plantilla_proforma_whatsapp ||
      '¡Hola {cliente}! ✨ Te compartimos la cotización de tu encargo en Glow Heaven 📦✈️\n\n' +
        '📋 Cotización: {codigo}\n' +
        '💰 Total estimado: {total_usd} (≈ {total_cs})\n' +
        '🔒 Anticipo requerido (50%): {anticipo}\n' +
        '🤝 Saldo contra entrega: {saldo}\n\n' +
        '{cuentas_bancarias}\n\n' +
        '¡Quedamos atentas a tu comprobante de transferencia para procesar tu orden! 💕';

    return comunes(plantilla)
      .replace(/\{anticipo\}/g, formatearMoneda(venta.anticipo_esperado_usd_cents, 'USD'))
      .replace(/\{saldo\}/g, formatearMoneda(venta.saldo_usd_cents, 'USD'))
      .replace(/\{cuentas_bancarias\}/g, cuentasTxt ? `Cuentas para depósito:\n${cuentasTxt}` : '');
  }

  const plantilla =
    parametros?.plantilla_factura_whatsapp ||
    '¡Hola {cliente}! ✨ Muchas gracias por tu compra en Glow Heaven 🛍️\n\n' +
      '📄 Factura: {codigo}\n' +
      '💵 Total: {total_usd} (≈ {total_cs})\n' +
      '{estado_pago}\n\n' +
      '{cuentas_bancarias}\n\n' +
      '¡Esperamos que disfrutes muchísimo tus prendas! 💖';

  const estadoPago =
    venta.saldo_usd_cents <= 0
      ? '✓ Pagado en su totalidad'
      : `⚠ Saldo pendiente: ${formatearMoneda(venta.saldo_usd_cents, 'USD')}`;

  return comunes(plantilla)
    .replace(/\{estado_pago\}/g, estadoPago)
    .replace(
      /\{cuentas_bancarias\}/g,
      cuentasTxt && venta.saldo_usd_cents > 0 ? `Cuentas bancarias:\n${cuentasTxt}` : ''
    );
}

/** Enlace de WhatsApp con el mensaje ya armado. */
export function enlaceWhatsappDocumento(
  venta: VentaCompleta,
  parametros: ParametrosSistema | null
): string {
  const telefono = (venta.cliente?.telefono ?? '').replace(/\D/g, '');
  const texto = encodeURIComponent(mensajeWhatsappDocumento(venta, parametros));
  return telefono ? `https://wa.me/${telefono}?text=${texto}` : `https://wa.me/?text=${texto}`;
}
