import { formatearMoneda, formatearFecha } from './moneda';
import { enlaceWhatsapp } from './telefono';
import type { CuentaBancaria, ParametrosSistema } from '../shared/types';

/**
 * Los mensajes de WhatsApp a las clientas, en un solo lugar.
 *
 * Hasta la 2.16.5 había ocho armados a mano en las pantallas de las dos apps,
 * cada uno con su texto, sus montos y su número (TRA-03 de la auditoría de
 * interfaz): unos calculaban los córdobas con la tasa de hoy, uno pegaba
 * "+505" a mano y rompía los números de otro país, sólo dos usaban las
 * plantillas de Configuración, y mezclaban "tú" y "vos".
 *
 * Las reglas, para todos:
 *
 *  - **A las clientas se les habla de tú** (decisión de Joswill, 1/10). A Ross
 *    la app le habla de vos; los mensajes son del negocio a su clienta.
 *  - **Los córdobas de una venta que ya existe salen con la tasa de esa
 *    venta**: quien los arma pasa `saldo_cor_cents` ya convertido. Si la
 *    clienta paga exactamente lo que dice el mensaje, la cuenta cierra.
 *  - **Una conversión se dice con "≈"**.
 *  - **El número lleva el código de país de Configuración** (`enlaceMensaje`).
 *
 * La factura y la proforma tienen el suyo en `documentos/mensajes.ts`, que
 * también es el recibo de una venta.
 */

/** El recordatorio de cobro, si ella no escribió uno propio. */
export const PLANTILLA_COBRO_DEFECTO =
  'Hola {cliente}, te saludamos de Glow Heaven ✨ Te recordamos que tienes un saldo pendiente de {saldo_usd} (≈ {saldo_cs}). Si ya realizaste tu abono, por favor compártenos el comprobante. ¡Muchas gracias!';

/**
 * Las de antes, sin "≈". Configuración guardaba la plantilla tal cual en
 * cuanto se tocaba cualquier ajuste: si la guardada es EXACTAMENTE una de
 * éstas, nadie la escribió y vale la nueva. Una que ella cambió se respeta.
 */
const COBRO_DEFECTO_VIEJAS = [
  'Hola {cliente}, te saludamos de Glow Heaven ✨ Te recordamos que tienes un saldo pendiente de {saldo_usd} ({saldo_cs}). Si ya realizaste tu abono, por favor compártenos el comprobante. ¡Muchas gracias!',
];

export function plantillaCobro(parametros: ParametrosSistema | null | undefined): string {
  const guardada = parametros?.plantilla_cobro_whatsapp?.replace(/\r\n/g, '\n');
  if (!guardada || COBRO_DEFECTO_VIEJAS.includes(guardada)) return PLANTILLA_COBRO_DEFECTO;
  return guardada;
}

/** Las cuentas para depositar, una por línea, como las escribe Configuración. */
export function textoCuentas(parametros: ParametrosSistema | null | undefined): string {
  return ((parametros?.cuentas_bancarias ?? []) as CuentaBancaria[])
    .map((c) => `${c.banco} (${c.moneda}): ${c.numero}${c.titular ? ' - ' + c.titular : ''}`)
    .join('\n');
}

/** Lo que se debe, con su conversión ya hecha con la tasa de cada venta. */
export interface Deuda {
  cliente: string;
  saldo_usd_cents: number;
  /** El saldo en córdobas con la tasa de su venta (o la suma, venta por venta). */
  saldo_cor_cents: number;
  /** El código de la venta, si el recordatorio es de una sola. */
  codigo?: string;
}

/**
 * Lo que se debe en córdobas, venta por venta, cada una con su tasa. Una
 * venta sin tasa guardada (muy vieja) usa la de hoy.
 */
export function cordobasQueSeDeben(
  ventas: readonly { saldo_usd_cents: number; tasa_cambio_cents?: number | null; estado?: string; activo?: boolean }[],
  tasaDeHoy: number
): number {
  return ventas
    .filter((v) => v.saldo_usd_cents > 0 && v.estado !== 'CANCELADA' && v.activo !== false)
    .reduce((s, v) => s + Math.round((v.saldo_usd_cents * (v.tasa_cambio_cents || tasaDeHoy)) / 100), 0);
}

/** El recordatorio de cobro, con la plantilla de Configuración. */
export function mensajeCobro(deuda: Deuda, parametros: ParametrosSistema | null | undefined): string {
  const cuentas = textoCuentas(parametros);
  return plantillaCobro(parametros)
    .replace(/\{cliente\}/g, deuda.cliente || 'clienta')
    .replace(/\{saldo_usd\}/g, formatearMoneda(deuda.saldo_usd_cents, 'USD'))
    .replace(/\{saldo_cs\}/g, formatearMoneda(deuda.saldo_cor_cents, 'COR'))
    .replace(/\{codigo\}/g, deuda.codigo ?? '')
    .replace(/\{cuentas_bancarias\}/g, cuentas ? `\nCuentas bancarias:\n${cuentas}` : '');
}

/** Para escribirle a una clienta que no debe nada. */
export function mensajeSaludo(cliente: string): string {
  const primero = cliente.trim().split(/\s+/)[0];
  return primero ? `¡Hola ${primero}!` : '¡Hola!';
}

const saldoConConversion = (usd: number, cor: number) =>
  `${formatearMoneda(usd, 'USD')} (≈ ${formatearMoneda(cor, 'COR')})`;

/** El recibo de un abono: lo pagado, en la moneda en que se pagó. */
export function mensajeReciboAbono(r: {
  cliente: string;
  /** `textoPagado(pago)`: "C$600.00" si pagó en córdobas. */
  pagado: string;
  codigo: string;
  saldo_usd_cents: number;
  saldo_cor_cents: number;
}): string {
  const despues =
    r.saldo_usd_cents > 0
      ? `Tu saldo pendiente es ${saldoConConversion(r.saldo_usd_cents, r.saldo_cor_cents)}.`
      : 'Con este abono tu cuenta quedó saldada. 🎉';
  return `¡Hola ${r.cliente}! Recibimos tu abono de ${r.pagado} para la compra ${r.codigo}. ${despues} ¡Muchas gracias por tu pago! 💕`;
}

/** El estado de cuenta: los abonos recibidos y lo que queda. */
export function mensajeEstadoCuenta(e: {
  cliente: string;
  saldo_usd_cents: number;
  saldo_cor_cents: number;
  abonos: { fecha: string; pagado: string }[];
}): string {
  const lineas = e.abonos.map((a) => `• ${formatearFecha(a.fecha)}: ${a.pagado}`).join('\n');
  const saldo =
    e.saldo_usd_cents > 0
      ? `Saldo pendiente: ${saldoConConversion(e.saldo_usd_cents, e.saldo_cor_cents)}.`
      : 'No tienes saldo pendiente. 🎉';
  return (
    `Hola ${e.cliente}, te saludamos de Glow Heaven ✨ Te compartimos el estado de tu cuenta.\n\n` +
    (lineas ? `Abonos recibidos:\n${lineas}\n\n` : '') +
    `${saldo}\n¡Muchas gracias por tu preferencia!`
  );
}

/**
 * Para compartir un producto con una clienta.
 *
 * Dice qué tallas o tonos hay y no cuántas unidades quedan de cada uno
 * (decisión de Joswill, 1/10): no expone el inventario.
 */
export function mensajeCompartirProducto(p: {
  nombre: string;
  precio_usd_cents: number;
  tasa_cambio_cents: number;
  /** Las tallas o tonos con unidades, ya en texto. Vacío si no tiene. */
  disponibles: string[];
}): string {
  const cor = Math.round((p.precio_usd_cents * p.tasa_cambio_cents) / 100);
  return (
    `*${p.nombre}* · Glow Heaven\n` +
    `Precio: ${formatearMoneda(cor, 'COR')} / ${formatearMoneda(p.precio_usd_cents, 'USD')}\n` +
    (p.disponibles.length > 0 ? `Tallas o tonos: ${p.disponibles.join(', ')}\n` : '') +
    `\nDisponible para entrega inmediata. Escríbenos para apartarlo.`
  );
}

/**
 * El enlace a WhatsApp con el mensaje, al número de la clienta con el código
 * de país de Configuración. Sin teléfono, abre WhatsApp para elegir el chat.
 */
export function enlaceMensaje(
  telefono: string | null | undefined,
  mensaje: string,
  parametros: ParametrosSistema | null | undefined
): string {
  return enlaceWhatsapp(telefono, mensaje, parametros?.codigo_pais_whatsapp);
}
