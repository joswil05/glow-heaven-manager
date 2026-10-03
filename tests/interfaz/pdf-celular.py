"""Experimento C2: descarga real del PDF. No prueba un teléfono físico.

Antes: emulador, sembrar-pdf.test.ts y Vite móvil en localhost:5174.
La entrada experimental sólo debe existir en DEV: /?c2-pdf=1.
"""
from pathlib import Path
import json
import sys
import traceback
from playwright.sync_api import sync_playwright, expect
import arnes
from pruebas import listar_coleccion

ROOT = Path(__file__).resolve().parents[2]
SALIDA = ROOT / "scratch" / "c2-pdf"


def main() -> int:
    SALIDA.mkdir(parents=True, exist_ok=True)
    arnes.crear_usuario_autorizado()
    ventas_antes = listar_coleccion("ventas")
    with sync_playwright() as p:
        navegador = p.chromium.launch(headless=True)
        contexto = navegador.new_context(viewport={"width": 390, "height": 844},
                                        is_mobile=True, has_touch=True, bypass_csp=True)
        page = contexto.new_page()
        # Primero ingresamos por el arnés existente, después la página de prueba.
        arnes.abrir_app(page)
        page.add_init_script("""
          new MutationObserver(() => {
            const raiz = document.querySelector('.html2pdf__container');
            const pie = raiz?.querySelector('.footer');
            if (pie) window.limitesPdf = {pie: pie.getBoundingClientRect().bottom,
              lienzo: raiz.getBoundingClientRect().bottom,
              altura: raiz.querySelector('body').style.height,
              alturaLogica: raiz.querySelector('body').style.blockSize};
          }).observe(document, {childList: true, subtree: true});
          Object.defineProperty(navigator, 'canShare', {value: () => window.admiteArchivos !== false});
          Object.defineProperty(navigator, 'share', {value: datos => {
            window.pdfCompartido = {nombre: datos.files[0].name, tipo: datos.files[0].type,
              bytes: datos.files[0].size, mensaje: datos.text, activo: navigator.userActivation.isActive};
            window.cabeceraPdf = datos.files[0].slice(0, 5).text();
            if (window.cancelarShare) return Promise.reject(new DOMException('Cancelado', 'AbortError'));
            if (window.rechazarShare) return Promise.reject(new DOMException('Permiso rechazado', 'NotAllowedError'));
            return new Promise(resolve => { window.terminarShare = resolve; });
          }});
          Object.defineProperty(navigator, 'clipboard', {value: {writeText: texto => {
            if (window.rechazarCopia) return Promise.reject(new DOMException('Sin permiso', 'NotAllowedError'));
            window.mensajeCopiado = texto; return Promise.resolve();
          }}});
        """)
        page.goto(arnes.URL_APP + "/?c2-pdf=1")
        peticiones_base = []
        page.on("request", lambda r: peticiones_base.append(r.url)
                if "firestore.googleapis.com" in r.url or "127.0.0.1:8080" in r.url else None)
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
        assert page.evaluate("window.cabeceraPdf") == "%PDF-"
        assert page.evaluate("window.mensajeCopiado") == enviado["mensaje"]
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

        compartir = page.get_by_role("button", name="Compartir PDF de prueba", exact=True)
        page.evaluate("window.admiteArchivos=false; window.pdfCompartido=null")
        compartir.click()
        expect(page.get_by_text("Este navegador no comparte archivos. Descargá el PDF y adjuntalo desde el teléfono.", exact=True)).to_be_visible()
        assert page.evaluate("window.pdfCompartido") is None
        expect(boton).to_be_enabled()

        page.evaluate("window.admiteArchivos=true; window.cancelarShare=true")
        compartir.click()
        expect(page.get_by_text("Compartir cancelado. Mensaje copiado para pegarlo en WhatsApp.", exact=True)).to_be_visible()
        expect(compartir).to_be_enabled()

        page.evaluate("window.cancelarShare=false; window.rechazarCopia=true")
        compartir.click()
        page.evaluate("window.terminarShare()")
        expect(page.get_by_text("Compartido. No se pudo copiar el mensaje; podés copiarlo con el botón de abajo.", exact=True)).to_be_visible()
        page.get_by_role("button", name="Copiar mensaje", exact=True).click()
        expect(page.get_by_text("No se pudo copiar. Seleccioná el mensaje y copialo.", exact=True)).to_be_visible()
        page.evaluate("window.rechazarCopia=false")
        page.get_by_role("button", name="Copiar mensaje", exact=True).click()
        expect(page.get_by_text("Mensaje copiado para pegarlo en WhatsApp.", exact=True)).to_be_visible()
        assert page.evaluate("window.mensajeCopiado") == "Mensaje editado"

        page.evaluate("window.rechazarShare=true")
        compartir.click()
        expect(page.get_by_role("alert")).to_have_text("Permiso rechazado")
        expect(compartir).to_be_enabled()

        inicio = page.evaluate("performance.now()")
        page.get_by_role("combobox", name="Proforma de prueba", exact=True).select_option("1")
        expect(boton).to_be_enabled(timeout=60_000)
        with page.expect_download(timeout=60_000) as descarga_larga:
            boton.click()
        largo = descarga_larga.value
        assert largo.suggested_filename == "E-0002.pdf"
        ruta_larga = SALIDA / "larga-movil.pdf"
        largo.save_as(str(ruta_larga))
        assert ruta_larga.read_bytes()[:5] == b"%PDF-" and ruta_larga.stat().st_size > 1000
        limites = page.evaluate("window.limitesPdf")
        assert limites and limites["pie"] <= limites["lienzo"] + 1, f"Se corta el pie del PDF: {limites}"
        medicion = {"corta_bytes": ruta.stat().st_size, "larga_bytes": ruta_larga.stat().st_size,
                    "larga_ms_navegador_local": round(page.evaluate("performance.now()") - inicio)}

        # Caso de generación fallida: fuentes bloqueadas en contexto nuevo,
        # sin caché ni bypass del adaptador. Debe permitir reintentar/cerrar.
        fallo = navegador.new_context(viewport={"width": 390, "height": 844}, is_mobile=True,
                                      has_touch=True, bypass_csp=True)
        fallo.route("https://fonts.googleapis.com/**", lambda r: r.abort())
        pagina_fallo = fallo.new_page()
        pagina_fallo.on("request", lambda r: peticiones_base.append(r.url)
                        if "firestore.googleapis.com" in r.url or "127.0.0.1:8080" in r.url else None)
        pagina_fallo.goto(arnes.URL_APP + "/?c2-pdf=1")
        expect(pagina_fallo.get_by_role("alert")).to_contain_text("No se pudo cargar la letra", timeout=60_000)
        expect(pagina_fallo.get_by_role("button", name="Descargar PDF de prueba", exact=True)).to_be_disabled()
        expect(pagina_fallo.get_by_role("button", name="Reintentar PDF", exact=True)).to_be_enabled()
        assert pagina_fallo.locator("iframe[data-proforma-pdf]").count() == 0
        assert pagina_fallo.locator(".html2pdf__overlay").count() == 0
        pagina_fallo.get_by_role("button", name="Cerrar", exact=True).click()
        expect(pagina_fallo.get_by_role("dialog")).not_to_be_visible()
        fallo.close()
        assert not peticiones_base, peticiones_base
        assert listar_coleccion("ventas") == ventas_antes, "El experimento escribió ventas"
        (SALIDA / "pruebas-locales.json").write_text(json.dumps(medicion, indent=2), encoding="utf-8")
        print("APROBADO: PDF corto/largo, ocupado, share, cancelar, alternativas, fallo de fuentes y sin escrituras. Teléfono y fidelidad pendientes.", flush=True)
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
