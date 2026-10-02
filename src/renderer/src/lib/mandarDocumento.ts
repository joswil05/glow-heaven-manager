import type { ParametrosSistema } from '../../../shared/types';
import { enlaceMensaje } from '@core/mensajes';

/**
 * Mandar una factura o una proforma por WhatsApp.
 *
 * Es el mismo camino desde "Mandar la cotización" y desde el botón WhatsApp
 * de la ventana de la Factura o la Proforma (DOC-07): guarda el documento en
 * PDF en Documentos/Glow Heaven, abre esa carpeta con el archivo
 * seleccionado (para arrastrarlo al chat) y abre el chat con el mensaje.
 * Antes la ventana del documento abría el chat sólo con el texto.
 *
 * Sin teléfono, WhatsApp se abre para elegir el chat. Devuelve el error, si
 * no se pudo guardar el PDF; el chat no se abre sin el archivo.
 */
export async function mandarDocumento(o: {
  codigo: string;
  html: string;
  carpeta: 'Cotizaciones' | 'Facturas';
  telefono?: string | null;
  mensaje: string;
  parametros: ParametrosSistema | null | undefined;
}): Promise<string | null> {
  const pdf = await window.api.documentos?.prepararCotizacion({ codigo: o.codigo, html: o.html, carpeta: o.carpeta });
  if (pdf && !pdf.success) return pdf.error;
  window.open(enlaceMensaje(o.telefono, o.mensaje, o.parametros), '_blank');
  return null;
}
