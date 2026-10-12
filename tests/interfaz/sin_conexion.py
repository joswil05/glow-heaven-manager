"""
Pruebas sin red de la PWA móvil (C3 · sin internet: consultar).

Corren contra el build de producción apuntado al emulador, servido con
`vite preview` (`npm run test:sin-conexion`): en desarrollo no hay service
worker, y el cliente de Vite recarga la página cuando vuelve la conexión.

Cada caso recibe la página y el contexto, para cortar y volver la red con
`contexto.set_offline`. Un caso que corta la red la vuelve a dar al final,
pase lo que pase.
"""
from __future__ import annotations

import re
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from playwright.sync_api import sync_playwright, Page, BrowserContext, expect  # noqa: E402

import arnes  # noqa: E402
from pruebas import cerrar_hojas, ir_a, listar_coleccion, poner_en_el_carrito, visible  # noqa: E402

CASOS = []


def caso(nombre: str):
    def registrar(fn):
        CASOS.append((nombre, fn))
        return fn
    return registrar


def principal(page: Page):
    """La pantalla visible: las vistas de la app están montadas todas a la vez."""
    return page.locator("main:visible").last


def franja(page: Page):
    # "Sin conexión ·": los avisos de lo que no se puede ("Sin conexión: …")
    # también son `status`.
    return page.get_by_role("status").filter(has_text=re.compile(r"^Sin conexión ·"))


def cargar_con_red(page: Page) -> None:
    """Recorre lo que después se va a mirar sin red, para que quede en la caché."""
    for pestania in ("Cobros", "Inventario", "Inicio"):
        ir_a(page, pestania)
        arnes.esperar_datos(page)


def esperar_service_worker(page: Page) -> None:
    """Que el service worker esté listo y controle la página."""
    page.evaluate("() => navigator.serviceWorker.ready.then(() => true)")
    if not page.evaluate("() => Boolean(navigator.serviceWorker.controller)"):
        page.reload()
        page.wait_for_selector("nav", timeout=30000)
        arnes.esperar_datos(page)
    assert page.evaluate("() => Boolean(navigator.serviceWorker.controller)"), \
        "el service worker no tomó la página"


@caso("sin señal, la app abre con lo último que cargó")
def caso_abre_sin_red(page: Page, contexto: BrowserContext) -> list[str]:
    cargar_con_red(page)
    esperar_service_worker(page)
    contexto.set_offline(True)
    try:
        page.reload()
        page.wait_for_selector("nav", timeout=30000)
        expect(franja(page)).to_be_visible()
        ir_a(page, "Cobros")
        expect(principal(page)).to_contain_text("Ana Prueba")
        ir_a(page, "Inventario")
        expect(principal(page)).to_contain_text("Labial Mate Rojo")
    finally:
        contexto.set_offline(False)
    return []


@caso("sin señal, cada pantalla muestra lo suyo y al volver la red se actualiza")
def caso_pantallas_sin_red(page: Page, contexto: BrowserContext) -> list[str]:
    """
    Lo que se vio con red se ve sin red: ninguna pantalla dice "No se pudo"
    ni queda vacía si con red tenía datos. Al volver la red, la franja se va
    sola y la app no se recarga.
    """
    contexto.set_offline(True)
    try:
        expect(franja(page)).to_be_visible(timeout=10000)
        esperas = [
            ("Inicio", "Ventas de hoy"),
            ("Vender", "Labial Mate Rojo"),
            ("Cobros", "Ana Prueba"),
            ("Historial", "Ana Prueba"),
            ("Inventario", "Perfume Carolina Herrera"),
        ]
        for pestania, texto in esperas:
            ir_a(page, pestania)
            expect(principal(page)).to_contain_text(texto, timeout=15000)
            expect(principal(page)).not_to_contain_text("No se pudo")

        ir_a(page, "Cobros")
        visible(page, "button", "Ana Prueba").click()
        expect(page.get_by_role("dialog").last).to_contain_text("Ana Prueba", timeout=15000)
        cerrar_hojas(page)

        ir_a(page, "Inventario")
        principal(page).get_by_text("Labial Mate Rojo", exact=True).first.click()
        expect(page.get_by_role("dialog").last).to_contain_text("Labial Mate Rojo", timeout=15000)
        cerrar_hojas(page)

        ir_a(page, "Inicio")
        principal(page).get_by_role("button", name=re.compile(r"^Encargos")).click()
        expect(principal(page)).to_contain_text("Clienta C2", timeout=15000)
        expect(principal(page)).not_to_contain_text("No se pudo")
        principal(page).get_by_role("button", name="Volver", exact=True).click()
        expect(page.locator("nav button:visible")).to_have_count(5)
    finally:
        contexto.set_offline(False)

    expect(franja(page)).to_be_hidden(timeout=20000)
    expect(page.locator("nav")).to_be_visible()
    return []


@caso("sin señal, vender, cobrar y anotar lo dicen y no escriben")
def caso_escrituras_sin_red(page: Page, contexto: BrowserContext) -> list[str]:
    """
    Lo que escribe no se cuelga en "Guardando…" ni falla con un error
    técnico: dice que se puede cuando vuelva la señal y conserva lo escrito.
    """
    ventas_antes = len(listar_coleccion("ventas"))
    pagos_antes = len(listar_coleccion("pagos"))
    problema = poner_en_el_carrito(page, "Labial Mate Rojo")
    if problema:
        return [problema]
    contexto.set_offline(True)
    try:
        expect(franja(page)).to_be_visible(timeout=10000)

        # Vender: la hoja de cobro se puede mirar (dice cuánto cobrar); lo que
        # no se puede es registrar la venta. El carrito queda como estaba.
        ir_a(page, "Vender")
        visible(page, "span:text-is('Cobrar')").click()
        registrar = page.get_by_role("dialog").last.get_by_role("button", name="Registrar venta")
        expect(registrar).to_be_visible()
        registrar.click()
        expect(page.get_by_text("Sin conexión: la venta se cobra cuando vuelva la señal.", exact=False)).to_be_visible()
        expect(page.get_by_role("dialog").last.get_by_role("button", name="Registrar venta")).to_be_enabled()
        cerrar_hojas(page)
        # El carrito sigue: la barra de "Cobrar" está, fuera de la hoja.
        expect(page.locator("span:text-is('Cobrar'):visible").first).to_be_visible()

        # Cobros: el abono avisa antes de abrir el formulario.
        ir_a(page, "Cobros")
        visible(page, "button", "Ana Prueba").click()
        abono = page.get_by_role("dialog").last.get_by_role("button", name="Registrar abono")
        expect(abono).to_be_visible()
        abono.click()
        expect(page.get_by_text("Sin conexión: el abono se registra cuando vuelva la señal.")).to_be_visible()
        expect(page.get_by_role("dialog", name=re.compile("abono", re.I))).to_have_count(0)
        cerrar_hojas(page)

        # Encargos: "Anotar un pedido" avisa y no abre la hoja.
        ir_a(page, "Vender")
        page.get_by_role("button", name="Anotar un pedido", exact=True).click()
        expect(page.get_by_text("Sin conexión: los encargos se anotan y se cambian cuando vuelva la señal.")).to_be_visible()
        expect(page.get_by_role("dialog", name="Anotar un pedido")).to_have_count(0)
        if principal(page).get_by_role("button", name="Volver", exact=True).count():
            principal(page).get_by_role("button", name="Volver", exact=True).click()
    finally:
        contexto.set_offline(False)

    # Con la red de vuelta, que nada haya quedado en cola y se suba solo.
    expect(franja(page)).to_be_hidden(timeout=20000)
    page.wait_for_timeout(3000)
    fallas = []
    if len(listar_coleccion("ventas")) != ventas_antes:
        fallas.append("sin red se registró una venta (o quedó en cola y se subió al volver)")
    if len(listar_coleccion("pagos")) != pagos_antes:
        fallas.append("sin red se registró un abono")
    return fallas


def main() -> int:
    if not arnes.emulador_vivo():
        print("El emulador no responde. Corré `npm run emulador`.")
        return 1

    arnes.crear_usuario_autorizado()

    total_fallas = 0
    with sync_playwright() as p:
        navegador = p.chromium.launch(headless=True)
        contexto = navegador.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            bypass_csp=True,
        )
        page = contexto.new_page()

        errores_consola: list[str] = []
        arnes.registrar_consola(page, errores_consola)

        arnes.abrir_app(page)

        for nombre, fn in CASOS:
            try:
                fallas = fn(page, contexto)
            except Exception as err:
                traceback.print_exc()
                fallas = [f"la prueba se rompió: {str(err)[:200]}"]
            if fallas:
                total_fallas += len(fallas)
                print(f"  x  {nombre}")
                for f in fallas:
                    print(f"       {f}")
            else:
                print(f"  ok {nombre}")

        # Sin red, el navegador reporta cada pedido que no pudo salir: es lo
        # esperado. Lo que no se espera es que la app reviente por dentro.
        ENTORNO = (
            "favicon",
            "err_internet_disconnected",
            "err_network_changed",
            "err_connection_refused",
            "failed to fetch",
            "could not reach cloud firestore",
            "fonts.googleapis",
            "fonts.gstatic",
        )
        ruido = [e for e in errores_consola if not any(m in e.lower() for m in ENTORNO)]
        if ruido:
            total_fallas += len(ruido)
            print(f"  x  errores de consola ({len(ruido)})")
            for e in ruido[:8]:
                print(f"       {e[:170]}")
        else:
            print("  ok sin errores de consola")

        navegador.close()

    print(f"\n{'APROBADO' if total_fallas == 0 else f'{total_fallas} FALLA(S)'}")
    return 0 if total_fallas == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
