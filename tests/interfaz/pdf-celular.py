"""Experimento C2: descarga real del PDF. No prueba un teléfono físico.

Antes: emulador, sembrar-pdf.test.ts y Vite móvil en localhost:5174.
La entrada experimental sólo debe existir en DEV: /?c2-pdf=1.
"""
from pathlib import Path
import sys
import traceback
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
        page.add_init_script("""
          Object.defineProperty(navigator, 'canShare', {value: () => true});
          Object.defineProperty(navigator, 'share', {value: datos => {
            window.pdfCompartido = {nombre: datos.files[0].name, tipo: datos.files[0].type,
              bytes: datos.files[0].size, mensaje: datos.text, activo: navigator.userActivation.isActive};
            return new Promise(resolve => { window.terminarShare = resolve; });
          }});
          Object.defineProperty(navigator, 'clipboard', {value: {writeText: () => Promise.resolve()}});
        """)
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
        page.screenshot(path=str(SALIDA / "hoja-pdf.png"))
        page.get_by_role("button", name="Compartir PDF de prueba", exact=True).click()
        expect(page.get_by_role("button", name="Compartiendo…", exact=True)).to_be_disabled()
        expect(page.get_by_role("button", name="Cerrar", exact=True)).to_be_disabled()
        page.get_by_role("button", name="Cerrar", exact=True).dispatch_event("click")
        expect(page.get_by_role("dialog")).to_be_visible()
        page.mouse.click(8, 8)  # Velo, encima de la hoja.
        cabecera = page.get_by_role("heading", name="Proforma de prueba", exact=True).bounding_box()
        page.mouse.move(cabecera["x"] + 10, cabecera["y"] + 10)
        page.mouse.down()
        page.mouse.move(cabecera["x"] + 10, cabecera["y"] + 170, steps=5)
        page.mouse.up()
        expect(page.get_by_role("dialog")).to_be_visible()
        page.evaluate("window.popsPrueba=0; addEventListener('popstate', () => window.popsPrueba++)")
        page.evaluate("history.back()")
        page.wait_for_function("window.popsPrueba === 1 && history.state?.hojaGlowHeaven === true")
        expect(page.get_by_role("dialog")).to_be_visible()
        page.evaluate("window.terminarShare()")
        expect(page.get_by_text("Compartido. Mensaje copiado para pegarlo en WhatsApp.", exact=True)).to_be_visible()
        enviado = page.evaluate("window.pdfCompartido")
        assert enviado["nombre"] == "E-0001.pdf" and enviado["tipo"] == "application/pdf"
        assert enviado["bytes"] == ruta.stat().st_size and enviado["activo"]
        assert "$85.00" in enviado["mensaje"] and "María" in enviado["mensaje"], enviado
        page.get_by_role("button", name="Cerrar", exact=True).click()
        expect(page.get_by_role("dialog")).not_to_be_visible()
        page.get_by_role("button", name="Abrir prueba de proforma", exact=True).click()
        expect(page.get_by_role("button", name="Cerrar", exact=True)).to_be_disabled()
        expect(boton).to_be_enabled(timeout=60_000)
        page.get_by_role("textbox", name="Mensaje de prueba", exact=True).fill("Mensaje editado")
        page.get_by_role("button", name="Cerrar", exact=True).click()
        expect(page.get_by_role("alertdialog")).to_be_visible()
        page.get_by_role("button", name="Seguir editando", exact=True).click()
        expect(page.get_by_role("textbox", name="Mensaje de prueba", exact=True)).to_have_value("Mensaje editado")
        print("APROBADO: descarga PDF real. Fidelidad y teléfono pendientes.", flush=True)
        navegador.close()
    return 0


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        raise SystemExit(main())
    except Exception as err:
        traceback.print_exc()
        print(f"FALLÓ: {err}", flush=True)
        raise SystemExit(1)
