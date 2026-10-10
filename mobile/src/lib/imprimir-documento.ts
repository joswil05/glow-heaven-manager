/** El recorrido de impresión de DocumentoSheet, compartido sin otro motor PDF. */
export function imprimirDocumento(contenido: string, onError: (mensaje: string) => void): void {
  if (!contenido) return;
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0', width: '0', height: '0',
    border: '0', visibility: 'hidden',
  });
  document.body.appendChild(iframe);
  const quitar = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };
  const doc = iframe.contentDocument;
  if (!doc) {
    quitar();
    onError('No se pudo preparar el documento.');
    return;
  }
  try {
    doc.open();
    doc.write(contenido);
    doc.close();
  } catch {
    quitar();
    onError('No se pudo preparar el documento.');
    return;
  }
  // El mismo tiempo y recorrido actual: esperar maquetación/fuentes y abrir
  // el diálogo del sistema, donde la persona elige Guardar como PDF.
  const lanzar = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      window.setTimeout(quitar, 60_000);
    } catch {
      quitar();
      onError('No se pudo abrir la impresión. Intentá otra vez.');
    }
  };
  if (doc.readyState === 'complete') window.setTimeout(lanzar, 400);
  else iframe.onload = () => window.setTimeout(lanzar, 400);
}
