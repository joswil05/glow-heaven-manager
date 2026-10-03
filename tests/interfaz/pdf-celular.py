"""Experimento C2: descarga real del PDF. No prueba un teléfono físico.

Antes: emulador, sembrar-pdf.test.ts y Vite móvil en localhost:5174.
La entrada experimental sólo debe existir en DEV: /?c2-pdf=1.
"""
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright, expect
import arnes

ROOT = Path(__file__).resolve().parents[2]
SALIDA = ROOT / "scratch" / "c2-pdf"


def main() -> int:
    SALIDA.mkdir(parents=True, exist_ok=True)
    arnes.crear_usuario_autorizado()
    with sync_playwright() as p:
        navegador = p.chromium.launch(headless=True)
        contexto = navegador.new_context(viewport={"width": 390, "height": 844},
                                        is_mobile=True, has_touch=True, bypass_csp=True)
        page = contexto.new_page()
        # Primero ingresamos por el arnés existente, después la página de prueba.
        arnes.abrir_app(page)
        page.goto(arnes.URL_APP + "/?c2-pdf=1")
        boton = page.get_by_role("button", name="Descargar PDF de prueba", exact=True)
        expect(boton).to_be_visible(timeout=10_000)
        with page.expect_download(timeout=60_000) as descarga:
            boton.click()
        archivo = descarga.value
        ruta = SALIDA / "corta-movil.pdf"
        archivo.save_as(str(ruta))
        assert ruta.read_bytes()[:5] == b"%PDF-", "No se descargó un PDF"
        assert ruta.stat().st_size > 1000, "El archivo parece vacío"
        print("APROBADO: descarga PDF real. Fidelidad y teléfono pendientes.", flush=True)
        navegador.close()
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        raise SystemExit(main())
    except Exception as err:
        print(f"FALLÓ: {err}", flush=True)
        raise SystemExit(1)
