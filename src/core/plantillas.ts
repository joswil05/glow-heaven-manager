import { formatearMoneda } from './moneda';
import { CuentaBancariaJSON } from '../shared/types';

export interface DatosMensajeCotizacion {
  cliente_nombre: string;
  codigo_cotizacion: string;
  items: { descripcion: string; precio_cor_cents: number; precio_usd_cents: number }[];
  total_cor_cents: number;
  total_usd_cents: number;
  anticipo_cor_cents: number;
  anticipo_usd_cents: number;
  anticipo_porcentaje?: number; // 50 o 70
  cuentas_bancarias: CuentaBancariaJSON[];
}

export interface ParadaRutaDia {
  orden: number;
  cliente_nombre: string;
  telefono: string;
  ciudad: string;
  direccion: string;
  saldo_cobrar_cor_cents: number;
  saldo_cobrar_usd_cents: number;
  items_descripcion: string[];
}

/**
 * Genera el texto formateado para enviar la cotización por WhatsApp con cuentas bancarias.
 */
export function generarMensajeCotizacionWhatsApp(datos: DatosMensajeCotizacion): string {
  const pct = datos.anticipo_porcentaje ?? 50;

  const itemsTexto = datos.items
    .map(
      (item) =>
        `• *${item.descripcion}*: ${formatearMoneda(item.precio_cor_cents, 'COR')} (${formatearMoneda(item.precio_usd_cents, 'USD')})`
    )
    .join('\n');

  const cuentasTexto = datos.cuentas_bancarias.length > 0
    ? datos.cuentas_bancarias
        .map(
          (c) =>
            `💳 *${c.banco}* (${c.moneda}): ${c.numero}\n   _Titular: ${c.titular}_`
        )
        .join('\n')
    : '_(Consultar cuentas bancarias disponibles)_';

  return `✨ *GLOW HEAVEN - COTIZACIÓN* ✨
*Ref:* ${datos.codigo_cotizacion}
*Cliente:* ${datos.cliente_nombre}

📦 *Detalle de tus productos:*
${itemsTexto}

━━━━━━━━━━━━━━━━━━━━
💰 *TOTAL:* ${formatearMoneda(datos.total_cor_cents, 'COR')} / ${formatearMoneda(datos.total_usd_cents, 'USD')}
🔒 *Anticipo ${pct}% para ordenar:* ${formatearMoneda(datos.anticipo_cor_cents, 'COR')} (${formatearMoneda(datos.anticipo_usd_cents, 'USD')})
💵 *Saldo contraentrega:* ${formatearMoneda(datos.total_cor_cents - datos.anticipo_cor_cents, 'COR')}
━━━━━━━━━━━━━━━━━━━━

🏦 *Cuentas para tu anticipo:*
${cuentasTexto}

📍 _Envíanos tu comprobante para ordenar tu pedido de inmediato._ ¡Gracias por tu preferencia!`;
}

/**
 * Genera el resumen estructurado de la hoja de ruta del día para enviar al WhatsApp del usuario (U7).
 */
export function generarMensajeRutaDiaWhatsApp(fecha: string, paradas: ParadaRutaDia[]): string {
  const totalCor = paradas.reduce((acc, p) => acc + p.saldo_cobrar_cor_cents, 0);

  const paradasTexto = paradas
    .map((p) => {
      const items = p.items_descripcion.join(', ');
      return `*#${p.orden} - ${p.cliente_nombre}* (📞 ${p.telefono})
📍 ${p.ciudad} - ${p.direccion}
📦 ${items}
💵 *Cobrar:* ${formatearMoneda(p.saldo_cobrar_cor_cents, 'COR')} (${formatearMoneda(p.saldo_cobrar_usd_cents, 'USD')})
`;
    })
    .join('\n────────────────────\n');

  return `🛵 *Ruta de Entregas - ${fecha}*
*Total clientes:* ${paradas.length}
*Total a cobrar en mano:* ${formatearMoneda(totalCor, 'COR')}

${paradasTexto}
`;
}
