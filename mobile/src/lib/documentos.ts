import { generarHtmlFactura, generarHtmlProforma } from '@core/documentos/plantillas';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import type { ParametrosSistema } from '@shared/types';

/**
 * Facturas y proformas desde el celular.
 *
 * El escritorio genera el PDF con `printToPDF` de Electron, que en el
 * navegador no existe. Acá se imprime el documento y el sistema ofrece
 * "Guardar como PDF" como destino: el archivo que sale es el mismo, con los
 * márgenes en milímetros que definen las plantillas.
 *
 * NO se usa `window.open`: en la PWA instalada no hay una ventana real donde
 * abrir un popup — es el mismo problema que tumbaba el inicio de sesión. Con
 * un iframe oculto la impresión sale del documento actual y funciona igual en
 * el navegador y en la app instalada.
 */
function imprimirEnIframe(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden',
  });
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error('No se pudo preparar el documento para imprimir.');
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Se espera a que el iframe termine de maquetar: imprimir antes deja la
  // hoja a medio armar, y las fuentes web todavía sin cargar.
  const lanzar = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      // El iframe se quita después: sacarlo enseguida cancela el diálogo.
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 60_000);
    }
  };

  if (doc.readyState === 'complete') setTimeout(lanzar, 350);
  else iframe.onload = () => setTimeout(lanzar, 350);
}

export type TipoDocumento = 'factura' | 'proforma';

/**
 * Arma el documento de una venta y abre el diálogo de impresión.
 *
 * La proforma es para un encargo que todavía no se entregó (es una
 * cotización); la factura, para lo ya vendido. Se elige por el tipo de venta
 * en vez de preguntar, porque la persona no tendría con qué decidir.
 */
export async function abrirDocumentoDeVenta(
  venta_id: number,
  parametros: ParametrosSistema,
  tipo?: TipoDocumento
): Promise<void> {
  const venta = await VentasRepoFirestore.getById(venta_id);
  if (!venta) throw new Error('No se encontró la venta.');

  const elegido: TipoDocumento = tipo ?? (venta.tipo === 'ENCARGO' ? 'proforma' : 'factura');
  const html =
    elegido === 'proforma'
      ? generarHtmlProforma(venta, parametros)
      : generarHtmlFactura(venta, parametros);

  imprimirEnIframe(html);
}
