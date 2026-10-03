"""Fidelidad de la candidata respecto al A4 de Windows, con fixtures.

Sólo requiere Vite local. Sin Auth ni Firestore. No sustituye el iPhone.
Los valores esperados salen del papel A4 con márgenes 16/15 mm de la
plantilla revisada, no de llamar al adaptador para calcularlos.
"""
from pathlib import Path
import sys
import traceback
from playwright.sync_api import sync_playwright, expect
from pypdf import PdfReader
import arnes

SALIDA = Path(__file__).resolve().parents[2] / "scratch" / "c2-pdf"


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 390, "height": 844}, bypass_csp=True)
        page.add_init_script("""
          new MutationObserver(() => {
            const raiz = document.querySelector('.html2pdf__container');
            const titulo = raiz?.querySelector('.brand-title');
            if (titulo) window.medicionPdf = {
              ancho: raiz.querySelector('.header').getBoundingClientRect().width,
              altoTitulo: titulo.getBoundingClientRect().height,
              pieCortado: (() => {
                const pie = raiz.querySelector('.footer');
                const rango = document.createRange();
                rango.selectNodeContents(pie);
                return rango.getBoundingClientRect().bottom > raiz.getBoundingClientRect().bottom + 1;
              })(),
            };
          }).observe(document, {childList: true, subtree: true});
        """)
        base = []
        page.on("request", lambda r: base.append(r.url) if "firestore.googleapis.com" in r.url
                or "127.0.0.1:8080" in r.url else None)
        page.goto(arnes.URL_APP + "/?c2-pdf=1")
        boton = page.get_by_role("button", name="Descargar PDF de prueba", exact=True)
        for indice, nombre in enumerate(["corta", "larga"]):
            if indice:
                page.get_by_role("combobox", name="Proforma de prueba", exact=True).select_option(str(indice))
            expect(boton).to_be_enabled(timeout=60_000)
            with page.expect_download(timeout=60_000) as descarga:
                boton.click()
            ruta = SALIDA / f"{nombre}-movil.pdf"
            descarga.value.save_as(str(ruta))
            medidas = page.evaluate("window.medicionPdf")
            assert abs(medidas["ancho"] - 680.315) < 2, f"Ancho útil distinto de Windows: {medidas}"
            assert medidas["altoTitulo"] <= 40, f"La identidad se parte en dos líneas: {medidas}"
            assert not medidas["pieCortado"], f"El texto del pie queda fuera del lienzo: {medidas}"
            for hoja in PdfReader(ruta).pages:
                matrices = [args for args, op in hoja.get_contents().operations if op == b"cm"]
                assert len(matrices) == 1, "No hay una página rasterizada verificable"
                ancho, _, _, alto, x, y = map(float, matrices[0])
                assert abs(x - 42.5197) < .5 and abs(ancho - 510.2362) < .5, f"Margen lateral incorrecto: {matrices}"
                assert y >= 44.85 and y + alto <= 797.04, f"Contenido fuera de los márgenes verticales: {matrices}"
        assert not base, base
        browser.close()
    print("APROBADO: ancho, identidad en una línea y márgenes A4 de ambas proformas. Paginación/teléfono pendientes.", flush=True)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
