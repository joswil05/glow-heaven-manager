/** Divide el DOM ya estilizado, sin regenerar textos ni cuentas de negocio. */
export function paginarProforma(doc: Document, anchoMm: number, altoMm: number): HTMLElement[] {
  const origen = Array.from(doc.body.children) as HTMLElement[];
  const paginas: HTMLElement[] = [];
  const altoPx = Math.floor(altoMm * 96 / 25.4);
  const estiloPagina = doc.body.style.cssText;
  let pagina: HTMLElement;

  function nuevaPagina() {
    const el = doc.createElement('div');
    el.style.cssText = estiloPagina;
    Object.assign(el.style, {
      width: `${anchoMm}mm`, inlineSize: `${anchoMm}mm`,
      height: `${altoPx}px`, blockSize: `${altoPx}px`,
      margin: '0', padding: '0', display: 'flow-root',
    });
    doc.body.appendChild(el);
    paginas.push(el);
    pagina = el;
  }

  function cabe(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const limite = pagina.getBoundingClientRect();
    // Incluye el texto: una caja fijada no garantiza que sus letras quepan.
    const rango = doc.createRange();
    rango.selectNodeContents(el);
    const texto = rango.getBoundingClientRect();
    return Math.max(rect.bottom, texto.bottom) <= limite.bottom + .1
      && Math.max(rect.right, texto.right) <= limite.right + .1;
  }

  // Medir columnas antes de sacar la tabla completa de su posición original.
  const columnas = new Map<HTMLElement, number[]>();
  for (const el of origen) {
    if (el.matches('.items-table')) {
      columnas.set(el, Array.from((el as HTMLTableElement).tHead!.rows[0].cells)
        .map(celda => celda.getBoundingClientRect().width));
    }
  }
  doc.body.replaceChildren();
  nuevaPagina();

  for (const el of origen) {
    if (!el.matches('.items-table')) {
      pagina!.appendChild(el);
      if (!cabe(el)) {
        el.remove();
        if (pagina!.children.length) nuevaPagina();
        pagina!.appendChild(el);
        if (!cabe(el)) throw new Error('Una sección de la proforma no cabe completa en una página A4.');
      }
      continue;
    }

    const tabla = el as HTMLTableElement;
    const filas = Array.from(tabla.tBodies[0].rows);
    let fragmento: HTMLTableElement;
    let cuerpo: HTMLTableSectionElement;
    function nuevaTabla() {
      fragmento = tabla.cloneNode(false) as HTMLTableElement;
      const grupo = doc.createElement('colgroup');
      for (const ancho of columnas.get(el)!) {
        const col = doc.createElement('col');
        col.style.width = `${ancho}px`;
        grupo.appendChild(col);
      }
      fragmento.appendChild(grupo);
      fragmento.appendChild(tabla.tHead!.cloneNode(true));
      cuerpo = tabla.tBodies[0].cloneNode(false) as HTMLTableSectionElement;
      fragmento.appendChild(cuerpo);
      pagina!.appendChild(fragmento);
    }
    nuevaTabla();
    for (const fila of filas) {
      cuerpo!.appendChild(fila);
      if (!cabe(fragmento!)) {
        fila.remove();
        if (!cuerpo!.rows.length) fragmento!.remove();
        if (pagina!.children.length) nuevaPagina();
        nuevaTabla();
        cuerpo!.appendChild(fila);
        if (!cabe(fragmento!)) {
          throw new Error('Una descripción de la proforma es demasiado larga para una página A4. Acortala antes de compartir.');
        }
      }
    }
  }
  return paginas;
}
