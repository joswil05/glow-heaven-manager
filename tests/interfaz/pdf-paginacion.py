"""Paginación real de la candidata C2 con el fixture largo, sin Auth/Firestore.

Requiere Vite móvil ya activo en localhost:5174. Las expectativas salen de
Windows: 01..11 / 12..26 / 27..35 y pie en página 4, no del adaptador.
El PDF es rasterizado: se verifica su estructura y el DOM que se convierte
en cada imagen. Esto no reemplaza inspección visual ni Safari/PWA en iPhone.
"""
from __future__ import annotations

import json
import hashlib
from pathlib import Path
import re
import sys
from tempfile import TemporaryDirectory
import traceback

from playwright.sync_api import expect, sync_playwright
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
URL = "http://localhost:5174/?c2-pdf=1"
GRUPOS_WINDOWS = [list(range(1, 12)), list(range(12, 27)), list(range(27, 36)), []]
ANCHO_UTIL_PX = 180 * 96 / 25.4
ALTO_UTIL_PX = 265 * 96 / 25.4
MAX_PIXELES = 3_000_000  # Presupuesto orientativo, no compatibilidad real iOS.

# Sólo observación desde Playwright; no necesita hooks en código productivo.
OBSERVADOR = r"""
(() => {
  let paginas = [], renders = [], lienzos = [], identificadores = new WeakMap(), idsRender = new WeakMap();
  const normalizar = texto => texto.replace(/\s+/g, ' ').trim();
  const rectangulo = (r, origen) => ({
    x: r.left - origen.left, y: r.top - origen.top,
    derecha: r.right - origen.left, abajo: r.bottom - origen.top,
    ancho: r.width, alto: r.height,
  });
  const medir = (el, origen) => {
    const textos = [];
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let nodo; (nodo = walker.nextNode());) {
      if (!nodo.textContent.trim()) continue;
      const rango = el.ownerDocument.createRange();
      rango.selectNodeContents(nodo);
      for (const r of rango.getClientRects()) {
        if (r.width && r.height) textos.push(rectangulo(r, origen));
      }
    }
    return {texto: normalizar(el.textContent),
      rect: rectangulo(el.getBoundingClientRect(), origen), textos};
  };
  const capturarDocumento = (doc, destino, ids) => {
    for (const raiz of doc.querySelectorAll('.html2pdf__container')) {
      const origen = raiz.getBoundingClientRect();
      if (!origen.width || !origen.height) continue;
      let indice = ids.get(raiz);
      if (indice === undefined) {
        indice = destino.length;
        ids.set(raiz, indice);
        destino.push(null);
      }
      const tabla = raiz.querySelector('.items-table');
      destino[indice] = {
        ancho: origen.width, alto: origen.height,
        filas: [...(tabla?.querySelectorAll('tbody tr') || [])].map(fila => ({
          ...medir(fila, origen),
          celdas: [...fila.cells].map(celda => normalizar(celda.textContent)),
        })),
        cabeceras: [...(tabla?.querySelectorAll('thead') || [])].map(el => medir(el, origen)),
        secciones: Object.fromEntries(['conditions-card', 'totals-table', 'policy-box', 'footer']
          .map(clase => [clase, [...raiz.querySelectorAll('.' + clase)].map(el => medir(el, origen))])),
        diagnosticos: {
          descartada: [...raiz.querySelectorAll('p')].filter(el => el.textContent.trim().startsWith('No se consiguió:'))
            .map(el => medir(el, origen)),
          saldo: [...raiz.querySelectorAll('.conditions-card .cond-block:nth-child(2), .conditions-card .cond-block:nth-child(2) .cond-amount, .totals-table tr:last-child, .totals-table tr:last-child td')]
            .map(el => medir(el, origen)),
          pie: [...raiz.querySelectorAll('.footer, .footer p')].map(el => medir(el, origen)),
        },
      };
    }
  };
  const capturar = () => {
    capturarDocumento(document, paginas, identificadores);
    for (const iframe of document.querySelectorAll('iframe.html2canvas-container:not([data-proforma-pdf])')) {
      try {
        if (iframe.contentDocument) capturarDocumento(iframe.contentDocument, renders, idsRender);
      } catch (_) { /* Sólo DOM de render del mismo origen. */ }
    }
  };
  new MutationObserver(capturar).observe(document, {
    childList: true, subtree: true, attributes: true,
  });
  const registrarLienzo = lienzo => {
    capturar();
    if (lienzo.width && lienzo.height) lienzos.push({ancho: lienzo.width, alto: lienzo.height});
  };
  for (const propiedad of ['width', 'height']) {
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, propiedad);
    Object.defineProperty(HTMLCanvasElement.prototype, propiedad, {
      ...original,
      set(valor) { original.set.call(this, valor); registrarLienzo(this); },
    });
  }
  for (const metodo of ['getContext', 'toDataURL']) {
    const original = HTMLCanvasElement.prototype[metodo];
    HTMLCanvasElement.prototype[metodo] = function (...args) {
      registrarLienzo(this);
      return original.apply(this, args);
    };
  }
  window.observacionPaginacion = {
    reiniciar() { paginas = []; renders = []; lienzos = []; identificadores = new WeakMap(); idsRender = new WeakMap(); },
    leer() { capturar(); return {paginas, renders, lienzos}; },
  };
})();
"""


def normalizar(texto: str) -> str:
    return " ".join(texto.split())


def moneda(centavos: int, prefijo: str = "$") -> str:
    return f"{prefijo}{centavos // 100:,}.{centavos % 100:02d}"


def firma_raster(ruta: Path) -> list:
    """Ignora metadatos/fechas: el observador debe conservar cada imagen del PDF."""
    return [(int(imagen.image.width), int(imagen.image.height), hashlib.sha256(imagen.data).hexdigest())
            for hoja in PdfReader(ruta).pages for imagen in hoja.images]


def main() -> None:
    fixture = next(f for f in json.loads((ROOT / "tests/interfaz/fixtures-pdf.json").read_text(encoding="utf-8"))
                   if f["nombre"] == "larga")
    venta = fixture["venta"]
    # Este fixture controlado tiene exactamente 35 piezas identificables.
    assert [linea["id"] for linea in venta["lineas"]] == list(range(1, 36))
    errores: list[str] = []

    def comprobar(condicion: bool, mensaje: str) -> None:
        if not condicion:
            errores.append(mensaje)

    def dentro(medida: dict, pagina: dict, etiqueta: str) -> None:
        # Caja completa y cada segmento de texto: ni fila partida ni texto cortado.
        for rect in [medida["rect"], *medida["textos"]]:
            if not (rect["x"] >= -1 and rect["y"] >= -1
                    and rect["derecha"] <= min(pagina["ancho"], ANCHO_UTIL_PX) + 1
                    and rect["abajo"] <= min(pagina["alto"], ALTO_UTIL_PX) + 1):
                errores.append(f"{etiqueta}: contenido fuera del área útil: {rect}")
                break
        caja = medida["rect"]
        for rect in medida["textos"]:
            if not (rect["x"] >= caja["x"] - 1 and rect["y"] >= caja["y"] - 1
                    and rect["derecha"] <= caja["derecha"] + 1 and rect["abajo"] <= caja["abajo"] + 1):
                errores.append(f"{etiqueta}: texto fuera de su fila/sección (altura fijada): {rect}")
                break

    with TemporaryDirectory(prefix="glow-pdf-paginacion-") as temporal, sync_playwright() as p:
        navegador = p.chromium.launch(headless=True)
        try:
            # Control real sin observador: no modificar fuente ni simular render.
            control = navegador.new_page(viewport={"width": 390, "height": 844},
                                         is_mobile=True, has_touch=True, bypass_csp=True)
            control.goto(URL)
            control.wait_for_load_state("networkidle", timeout=60_000)
            boton_control = control.get_by_role("button", name="Descargar PDF de prueba", exact=True)
            expect(boton_control).to_be_enabled(timeout=60_000)
            with control.expect_download(timeout=60_000) as descarga_control:
                boton_control.click()
            ruta_control = Path(temporal) / "corta-control.pdf"
            descarga_control.value.save_as(str(ruta_control))
            firma_control = firma_raster(ruta_control)
            control.close()
            page = navegador.new_page(viewport={"width": 390, "height": 844},
                                      is_mobile=True, has_touch=True, bypass_csp=True)
            page.add_init_script(OBSERVADOR)
            peticiones_base: list[str] = []
            errores_pagina: list[str] = []
            peticiones_fallidas: list[dict] = []
            page.on("pageerror", lambda error: errores_pagina.append(str(error)))
            page.on("requestfailed", lambda request: peticiones_fallidas.append(
                {"url": request.url, "error": request.failure}))

            def peticion(request) -> None:
                if re.search(r"firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|(?:localhost|127\.0\.0\.1):(?:8080|9099)", request.url):
                    peticiones_base.append(request.url)

            page.on("request", peticion)
            page.goto(URL)
            page.wait_for_load_state("networkidle", timeout=60_000)
            boton = page.get_by_role("button", name="Descargar PDF de prueba", exact=True)
            def esperar_pdf() -> None:
                try:
                    expect(boton).to_be_enabled(timeout=60_000)
                except AssertionError:
                    print(json.dumps({"alertas": page.get_by_role("alert").all_text_contents(),
                                      "errores_pagina": errores_pagina,
                                      "peticiones_fallidas": peticiones_fallidas}, ensure_ascii=False), flush=True)
                    raise
            esperar_pdf()
            with page.expect_download(timeout=60_000) as descarga_corta:
                boton.click()
            ruta_corta = Path(temporal) / "corta-observada.pdf"
            descarga_corta.value.save_as(str(ruta_corta))
            comprobar(firma_raster(ruta_corta) == firma_control,
                      "El observador cambia las imágenes de la proforma corta respecto al control")
            corta = page.evaluate("window.observacionPaginacion.leer()")
            comprobar(bool(corta["renders"]), "No se observó el iframe temporal html2canvas de la corta")
            print(json.dumps({"corta_imagen_igual_control": firma_raster(ruta_corta) == firma_control,
                              "corta_renders_html2canvas": len(corta["renders"]),
                              "corta_host": [p["diagnosticos"] for p in corta["paginas"]],
                              "corta_render": [p["diagnosticos"] for p in corta["renders"]]}, ensure_ascii=False), flush=True)
            for superficie, lista in [("host", corta["paginas"]), ("html2canvas", corta["renders"])]:
                for indice, pagina in enumerate(lista):
                    for nombre, medidas in pagina["diagnosticos"].items():
                        for medida in medidas:
                            dentro(medida, pagina, f"Corta {superficie} {nombre} página {indice + 1}")
            # Descartar la preparación corta inicial: observar sólo el render largo.
            page.evaluate("window.observacionPaginacion.reiniciar()")
            page.get_by_role("combobox", name="Proforma de prueba", exact=True).select_option("1")
            esperar_pdf()
            with page.expect_download(timeout=60_000) as descarga:
                boton.click()
            ruta = Path(temporal) / "E-0002.pdf"
            descarga.value.save_as(str(ruta))
            observado = page.evaluate("window.observacionPaginacion.leer()")
            comprobar(not peticiones_base, f"Hubo solicitudes de Auth/Firestore: {peticiones_base}")
            comprobar(descarga.value.suggested_filename == "E-0002.pdf", "Nombre de archivo inesperado")
            comprobar(ruta.read_bytes().startswith(b"%PDF-"), "La descarga no es un PDF")
            pdf = PdfReader(ruta)
            comprobar(len(pdf.pages) == 4, f"PDF largo: {len(pdf.pages)} páginas, se esperaban 4")
            paginas = observado["paginas"]
            comprobar(len(paginas) == len(pdf.pages),
                      f"Contenedores por página: {len(paginas)} frente a {len(pdf.pages)} páginas PDF")
            comprobar(len(paginas) == 4, f"Se esperaban 4 renders independientes; hubo {len(paginas)}")
            grupos = []
            for indice, pagina in enumerate(paginas):
                grupos.append([int(re.search(r"Pieza de prueba (\d{2})", fila["texto"]).group(1))
                               for fila in pagina["filas"]])
                comprobar(abs(pagina["ancho"] - ANCHO_UTIL_PX) < 2,
                          f"Página {indice + 1}: ancho distinto de Windows: {pagina['ancho']}")
                comprobar(pagina["alto"] <= ALTO_UTIL_PX + 1,
                          f"Página {indice + 1}: render largo de {pagina['alto']:.2f}px")
                if pagina["filas"]:
                    comprobar(len(pagina["cabeceras"]) == 1,
                              f"Página {indice + 1}: falta cabecera de tabla única")
                    for cabecera in pagina["cabeceras"]:
                        comprobar(cabecera["texto"] == "Artículo / Descripción Cantidad Precio Unit. Total Cotizado",
                                  f"Página {indice + 1}: cabecera alterada: {cabecera['texto']}")
                        dentro(cabecera, pagina, f"Cabecera página {indice + 1}")
                for fila in pagina["filas"]:
                    identificador = int(re.search(r"Pieza de prueba (\d{2})", fila["texto"]).group(1))
                    linea = venta["lineas"][identificador - 1]
                    comprobar(fila["celdas"] == [normalizar(linea["descripcion"]), str(linea["cantidad"]),
                              moneda(linea["precio_unitario_usd_cents"]), moneda(linea["subtotal_usd_cents"])],
                              f"Pieza {identificador:02d}: texto o importes alterados: {fila['celdas']}")
                    dentro(fila, pagina, f"Pieza {identificador:02d}")
            comprobar(grupos == GRUPOS_WINDOWS, f"Agrupación distinta de Windows: {grupos}")
            comprobar([pieza for grupo in grupos for pieza in grupo] == list(range(1, 36)),
                      f"Las piezas 01..35 no aparecen exactamente una vez y en orden: {grupos}")

            secciones = {
                "conditions-card": ["Anticipo requerido para ordenar", moneda(venta["anticipo_esperado_usd_cents"]),
                                    "Saldo contra entrega", moneda(venta["saldo_usd_cents"]), "A cancelar al recibir tus prendas"],
                "totals-table": ["Total Cotizado USD:", moneda(venta["total_usd_cents"]), "Total C$ (T.C. 36.00):",
                                 "C$35,451.00", "Anticipo Abonado: $0.00", "Saldo Pendiente:"],
                "policy-box": ["Políticas y tiempos de entrega de encargos",
                               "Tiempo estimado de entrega: 12 a 18 días hábiles tras confirmar el anticipo.",
                               "Una vez realizada la compra en USA, no se permiten cancelaciones ni cambios de talla o color.",
                               "En caso de que el proveedor cancele la prenda por falta de stock, se reembolsará el 100% de tu anticipo."],
                "footer": ["Para confirmar el pedido. Enviar el comprobante de la transferencia bancaria. El pedido se coloca una vez recibido el anticipo.",
                           "Glow Heaven Prueba · +505 8888 0000 · Managua, Nicaragua"],
            }
            for clase, textos in secciones.items():
                ocurrencias = [(indice, pagina, medida) for indice, pagina in enumerate(paginas)
                               for medida in pagina["secciones"][clase]]
                comprobar(len(ocurrencias) == 1, f"{clase}: se esperaba una aparición completa; hubo {len(ocurrencias)}")
                for indice, pagina, medida in ocurrencias:
                    comprobar(indice == (3 if clase == "footer" else 2),
                              f"{clase}: quedó en página {indice + 1}, distinta de Windows")
                    comprobar(all(texto in medida["texto"] for texto in textos),
                              f"{clase}: contenido incompleto: {medida['texto']}")
                    dentro(medida, pagina, clase)

            for indice, hoja in enumerate(pdf.pages):
                comprobar(abs(float(hoja.mediabox.width) - 595.276) < 1
                          and abs(float(hoja.mediabox.height) - 841.89) < 1,
                          f"Página {indice + 1}: tamaño distinto de A4")
                operaciones = hoja.get_contents().operations
                matrices = [args for args, op in operaciones if op == b"cm"]
                imagenes = [args for args, op in operaciones if op == b"Do"]
                comprobar(len(matrices) == 1 and len(imagenes) == 1,
                          f"Página {indice + 1}: debe contener una imagen del render completo")
                if len(matrices) == 1:
                    ancho, _, _, alto, x, y = map(float, matrices[0])
                    comprobar(abs(x - 42.5197) < .5 and abs(ancho - 510.2362) < .5
                              and y >= 44.85 and y + alto <= 797.04,
                              f"Página {indice + 1}: imagen fuera de márgenes Windows: {matrices}")
            max_lienzo = max((l["ancho"] * l["alto"] for l in observado["lienzos"]), default=0)
            comprobar(max_lienzo > 0, "No se observó ningún canvas real")
            comprobar(max_lienzo <= MAX_PIXELES, f"Canvas máximo {max_lienzo:,} píxeles supera presupuesto 3MP")
            print(json.dumps({"paginas_pdf": len(pdf.pages), "grupos": grupos,
                              "canvas_max_pixeles": max_lienzo, "bytes": ruta.stat().st_size,
                              "solicitudes_base": len(peticiones_base)}, ensure_ascii=False), flush=True)
        finally:
            navegador.close()
    assert not errores, "\n".join(errores)
    print("APROBADO: 4 páginas, 35 piezas únicas completas, cabeceras repetidas, totales/políticas/pie y canvas <=3MP. iPhone pendiente.", flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
