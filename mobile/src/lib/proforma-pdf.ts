import type { ParametrosSistema, VentaCompleta } from '@shared/types';
import { generarHtmlProforma } from '@core/documentos/plantillas';
import type { jsPDF } from 'jspdf';
import { paginarProforma } from './paginar-proforma';

/** Reutiliza las reglas que Windows imprime; no crea otra plantilla. */
function aplicarImpresion(doc: Document, frame: HTMLIFrameElement): [number, number, number, number] {
  const reglasPrint: string[] = [];
  let pagina: CSSStyleDeclaration | undefined;
  for (const hoja of Array.from(doc.styleSheets)) {
    // Las reglas propias están en <style>; Google Fonts es de otro origen.
    if (hoja.ownerNode?.nodeName !== 'STYLE') continue;
    for (const regla of Array.from(hoja.cssRules)) {
      if (regla.type === CSSRule.PAGE_RULE) pagina = (regla as CSSPageRule).style;
      if (regla.type === CSSRule.MEDIA_RULE && (regla as CSSMediaRule).conditionText === 'print') {
        reglasPrint.push(...Array.from((regla as CSSMediaRule).cssRules).map(r => r.cssText));
      }
    }
  }
  if (!pagina || pagina.getPropertyValue('size').toLowerCase() !== 'a4' || !reglasPrint.length) {
    throw new Error('La proforma no tiene una configuración de impresión A4 compatible.');
  }
  const margenes = ['top', 'left', 'bottom', 'right'].map(lado => {
    const valor = pagina!.getPropertyValue(`margin-${lado}`).trim();
    if (!/^\d+(?:\.\d+)?mm$/.test(valor)) throw new Error('No se pudo leer el margen de impresión de la proforma.');
    return Number(valor.slice(0, -2));
  });
  if (margenes[1] + margenes[3] >= 210 || margenes[0] + margenes[2] >= 297) {
    throw new Error('Los márgenes de la proforma no dejan espacio para imprimir.');
  }
  const estilo = doc.createElement('style');
  estilo.textContent = reglasPrint.join('\n');
  doc.head.appendChild(estilo);
  frame.style.width = `${210 - margenes[1] - margenes[3]}mm`;
  return [margenes[0], margenes[1], margenes[2], margenes[3]];
}

/** Candidata experimental C2/T1. La comparación física todavía no está aprobada. */
export async function generarArchivoProforma(
  venta: VentaCompleta,
  parametros: ParametrosSistema,
): Promise<File> {
  const { default: html2pdf } = await import('html2pdf.js');
  const frame = document.createElement('iframe');
  frame.title = 'Preparación de proforma';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.dataset.proformaPdf = 'true';
  Object.assign(frame.style, {
    position: 'fixed', left: '-10000px', top: '0', width: '210mm',
    height: '297mm', border: '0', pointerEvents: 'none',
  });
  let overlay: HTMLElement | null = null;
  try {
    const cargado = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('No se pudo cargar la proforma.')), 20_000);
      frame.onload = () => { window.clearTimeout(timeout); resolve(); };
      frame.onerror = () => { window.clearTimeout(timeout); reject(new Error('No se pudo cargar la proforma.')); };
    });
    frame.srcdoc = generarHtmlProforma(venta, parametros);
    document.body.appendChild(frame);
    await cargado;
    const doc = frame.contentDocument;
    if (!doc || !frame.contentWindow) throw new Error('No se pudo preparar la proforma.');
    const margenes = aplicarImpresion(doc, frame);
    // fonts.ready también resuelve cuando una fuente falla: verificar que se cargó.
    const fuentes = await Promise.all([400, 500, 600, 700, 800].map(peso =>
      doc.fonts.load(`${peso} 14px "Plus Jakarta Sans"`)));
    await doc.fonts.ready;
    if (fuentes.some(f => f.length === 0) || !doc.fonts.check('400 14px "Plus Jakarta Sans"')) {
      throw new Error('No se pudo cargar la letra de la proforma. Revisá la conexión y reintentá.');
    }
    await Promise.all(Array.from(doc.images).map(async img => {
      try { await img.decode(); }
      catch { throw new Error('No se pudo cargar una imagen de la proforma.'); }
      if (!img.naturalWidth) throw new Error('Una imagen de la proforma quedó vacía.');
    }));
    // html2pdf clona el body en la página anfitriona. Conservar sus estilos
    // resueltos evita heredar Tailwind/tema móvil o perder la CSS del iframe.
    // No cambiar la plantilla ni su maquetación para aprobar la comparación.
    // getComputedStyle es vivo: tomar todas las propiedades antes de escribir
    // evita que shorthands de font alteren valores que todavía no se copiaron.
    const estilos = [doc.body, ...Array.from(doc.body.querySelectorAll<HTMLElement>('*'))].map(el => {
      const estilo = frame.contentWindow!.getComputedStyle(el);
      return { el, valores: Array.from(estilo).map(p => [p, estilo.getPropertyValue(p)] as const) };
    });
    for (const { el, valores } of estilos) {
      for (const [propiedad, valor] of valores) {
        // La plantilla no fija alturas. Resolverlas a px impide que el clon
        // crezca cuando cambian las métricas de texto o se divide la tabla.
        if (propiedad === 'height' || propiedad === 'block-size' || propiedad === 'grid-template-rows') continue;
        el.style.setProperty(propiedad, valor);
      }
      el.style.height = 'auto';
      el.style.blockSize = 'auto';
    }
    const paginas = paginarProforma(doc, 210 - margenes[1] - margenes[3], 297 - margenes[0] - margenes[2]);
    const opciones = {
      margin: margenes,
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      pagebreak: { mode: [], avoid: [] },
    };
    let pdf: jsPDF | undefined;
    for (const pagina of paginas) {
      if (pdf) pdf.addPage();
      // set('pdf') conserva el mismo documento entre renders de una sola hoja.
      const opcionesPagina = { ...opciones, pdf };
      const worker = html2pdf().set(opcionesPagina).from(pagina).toContainer();
      overlay = await worker.get('overlay');
      await worker.toPdf();
      pdf = await worker.get('pdf');
      overlay?.remove();
      overlay = null;
    }
    const blob = pdf!.output('blob');
    if (!(blob instanceof Blob) || blob.size === 0) throw new Error('El PDF quedó vacío.');
    return new File([blob], `${venta.codigo}.pdf`, { type: 'application/pdf' });
  } finally {
    // La librería no siempre quita el overlay cuando falla el render.
    overlay?.remove();
    frame.remove();
  }
}
