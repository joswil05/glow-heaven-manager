import { formatearMoneda, formatearPorcentaje } from '../moneda';
import { enlaceWhatsapp } from '../telefono';
import { anticipoBpDe, noConseguidas } from '../encargos';
import type { VentaCompleta, ParametrosSistema, CuentaBancaria } from '../../shared/types';

/**
 * El mensaje con que se manda una cotización, si ella no escribió uno propio.
 * `{anticipo_pct}` es el porcentaje de ESE encargo, y `{no_conseguido}` nombra
 * lo que no se consiguió (vacío si se consiguió todo).
 */
export const PLANTILLA_PROFORMA_DEFECTO =
  '¡Hola {cliente}! ✨ Te compartimos la cotización de tu encargo en Glow Heaven 📦✈️\n\n' +
  '📋 Cotización: {codigo}\n' +
  '💰 Total estimado: {total_usd} (≈ {total_cs})\n' +
  '🔒 Anticipo requerido ({anticipo_pct}): {anticipo}\n' +
  '🤝 Saldo contra entrega: {saldo}{no_conseguido}\n\n' +
  '{cuentas_bancarias}\n' +
  '¡Quedamos atentas a tu comprobante! 💕';

/**
 * Las plantillas por defecto de antes de la 2.16, con el "50%" escrito a mano.
 * Configuración guardaba la suya tal cual en cuanto se tocaba cualquier
 * ajuste, así que producción la tiene como si fuera propia (respaldo del
 * 26/9). Si la guardada es EXACTAMENTE una de estas, nadie la escribió: se usa
 * la nueva. Una plantilla que ella cambió aunque sea en una letra se respeta.
 */
const PROFORMA_DEFECTO_VIEJAS = [
  '¡Hola {cliente}! ✨ Te compartimos la cotización de tu encargo en Glow Heaven 📦✈️\n\n📋 Cotización: {codigo}\n💰 Total estimado: {total_usd} (≈ {total_cs})\n🔒 Anticipo requerido (50%): {anticipo}\n🤝 Saldo contra entrega: {saldo}\n\n{cuentas_bancarias}\n¡Quedamos atentas a tu comprobante! 💕',
  '¡Hola {cliente}! ✨ Te compartimos la cotización de tu encargo en Glow Heaven 📦✈️\n\n📋 Cotización: {codigo}\n💰 Total estimado: {total_usd} (≈ {total_cs})\n🔒 Anticipo requerido (50%): {anticipo}\n🤝 Saldo contra entrega: {saldo}\n\n{cuentas_bancarias}\n\n¡Quedamos atentas a tu comprobante de transferencia para procesar tu orden! 💕',
];

/** La plantilla de la cotización que vale hoy: la propia de ella, o la de siempre. */
export function plantillaProforma(parametros: ParametrosSistema | null | undefined): string {
  const guardada = parametros?.plantilla_proforma_whatsapp?.replace(/\r\n/g, '\n');
  if (!guardada || PROFORMA_DEFECTO_VIEJAS.includes(guardada)) return PLANTILLA_PROFORMA_DEFECTO;
  return guardada;
}

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
    const plantilla = plantillaProforma(parametros);
    const faltan = noConseguidas(venta.lineas ?? []);

    let texto = comunes(plantilla)
      .replace(/\{anticipo_pct\}/g, formatearPorcentaje(anticipoBpDe(venta)))
      .replace(/\{anticipo\}/g, formatearMoneda(venta.anticipo_esperado_usd_cents, 'USD'))
      .replace(/\{saldo\}/g, formatearMoneda(venta.saldo_usd_cents, 'USD'))
      .replace(/\{no_conseguido\}/g, faltan ? `\n🔎 No logramos conseguir: ${faltan}` : '')
      .replace(/\{cuentas_bancarias\}/g, cuentasTxt ? `Cuentas para depósito:\n${cuentasTxt}` : '');

    // Una plantilla propia sin el marcador igual lo dice: que la clienta no
    // crea que se cotizó todo lo que pidió.
    if (faltan && !plantilla.includes('{no_conseguido}')) {
      texto += `\n\nNo logramos conseguir: ${faltan}`;
    }
    return texto;
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

/**
 * Enlace de WhatsApp con el mensaje ya armado.
 *
 * El número pasa por `enlaceWhatsapp`, que le pone el código de país. Antes
 * acá se hacía un `replace(/\D/g, '')` a secas: el teléfono de una clienta
 * guardado como "8888-7777" salía como `wa.me/88887777`, un número que
 * WhatsApp no resuelve.
 */
export function enlaceWhatsappDocumento(
  venta: VentaCompleta,
  parametros: ParametrosSistema | null
): string {
  return enlaceWhatsapp(
    venta.cliente?.telefono,
    mensajeWhatsappDocumento(venta, parametros),
    parametros?.codigo_pais_whatsapp
  );
}
