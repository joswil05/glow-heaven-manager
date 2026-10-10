/** Cuánto se espera a que el documento cargue antes de darlo por fallido. */
const ESPERA_CARGA_MS = 15_000;

/**
 * El recorrido de impresión de DocumentoSheet, compartido sin otro motor PDF:
 * un iframe oculto y el diálogo del sistema, donde se elige Guardar como PDF.
 *
 * `onFin` avisa una sola vez que terminó, se haya abierto la impresión o no:
 * la hoja la usa para no aceptar un segundo toque mientras tanto. Si el
 * documento no carga en `ESPERA_CARGA_MS`, se quita el iframe y se avisa; una
 * carga que llega después ya no abre la impresión (revisión del 10/10).
 */
export function imprimirDocumento(
  contenido: string,
  onError: (mensaje: string) => void,
  onFin?: () => void
): void {
  if (!contenido) {
    onFin?.();
    return;
  }
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0', width: '0', height: '0',
    border: '0', visibility: 'hidden',
  });
  document.body.appendChild(iframe);
  const quitar = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };

  let terminado = false;
  let espera: number | undefined;
  const terminar = (error?: string) => {
    if (terminado) return;
    terminado = true;
    if (espera !== undefined) window.clearTimeout(espera);
    if (error) {
      quitar();
      onError(error);
    }
    onFin?.();
  };

  const doc = iframe.contentDocument;
  if (!doc) {
    terminar('No se pudo preparar el documento.');
    return;
  }
  try {
    doc.open();
    doc.write(contenido);
    doc.close();
  } catch {
    terminar('No se pudo preparar el documento.');
    return;
  }
  // El mismo tiempo y recorrido actual: esperar maquetación/fuentes y abrir
  // el diálogo del sistema, donde la persona elige Guardar como PDF.
  const lanzar = () => {
    if (terminado) return;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(quitar, 60_000);
      terminar();
    } catch {
      terminar('No se pudo abrir la impresión. Intentá otra vez.');
    }
  };
  espera = window.setTimeout(
    () => terminar('No se pudo preparar el documento. Intentá otra vez.'),
    ESPERA_CARGA_MS
  );
  if (doc.readyState === 'complete') window.setTimeout(lanzar, 400);
  else iframe.onload = () => window.setTimeout(lanzar, 400);
}
