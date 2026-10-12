"""
Pruebas sin red de la PWA móvil (C3 · consultar, C4 · operar).

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
from pruebas import (  # noqa: E402
    cerrar_hojas,
    ir_a,
    listar_coleccion,
    poner_en_el_carrito,
    stock_en_base,
    stock_en_catalogo,
    visible,
)

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


def esperar_ventas(page: Page, cuantas: int, segundos: int = 30) -> int:
    """Espera a que la base tenga `cuantas` ventas; devuelve las que hay."""
    hay = len(listar_coleccion("ventas"))
    for _ in range(segundos * 2):
        if hay >= cuantas:
            break
        page.wait_for_timeout(500)
        hay = len(listar_coleccion("ventas"))
    return hay


def registrar_venta(page: Page) -> None:
    visible(page, "span:text-is('Cobrar')").click()
    page.get_by_role("dialog").last.get_by_role("button", name="Registrar venta").click()


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


CARGAR_FUENTES = """async () => {
    const caras = await document.fonts.load("32px 'Plus Jakarta Sans'");
    await document.fonts.load("32px Roboto");
    return caras.length > 0;
}"""


def calentar_cache(contexto: BrowserContext) -> None:
    """
    Una pestaña nueva con red, ya con el service worker andando, para que
    guarde la hoja de estilos y las fuentes. Al recargar, Chromium las toma
    de su memoria sin pasar por el service worker; una pestaña nueva no
    (como reabrir la app en el teléfono).
    """
    nueva = contexto.new_page()
    try:
        nueva.goto(arnes.URL_APP)
        nueva.wait_for_selector("nav", timeout=30000)
        nueva.evaluate(CARGAR_FUENTES)
    finally:
        nueva.close()


@caso("sin señal, la app abre con lo último que cargó")
def caso_abre_sin_red(page: Page, contexto: BrowserContext) -> list[str]:
    cargar_con_red(page)
    esperar_service_worker(page)
    calentar_cache(contexto)
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


@caso("sin señal, la venta queda pendiente y al volver la red se sube una vez")
def caso_venta_sin_red(page: Page, contexto: BrowserContext) -> list[str]:
    """
    C4: sin señal la venta no se frena. Queda anotada en el teléfono, sin
    número; el carrito se vacía y el stock que se ve baja. Al volver la red
    se sube sola, toma su número y en la base hay una sola.
    """
    fallas = []
    ventas_antes = len(listar_coleccion("ventas"))
    en_bodega = stock_en_catalogo(page, "Labial Mate Rojo")
    problema = poner_en_el_carrito(page, "Labial Mate Rojo")
    if problema:
        return [problema]
    contexto.set_offline(True)
    try:
        expect(franja(page)).to_be_visible(timeout=10000)
        registrar_venta(page)
        expect(page.get_by_text("Pendiente de subir · sin número todavía")).to_be_visible(timeout=10000)
        expect(page.locator("span:text-is('Cobrar'):visible")).to_have_count(0)

        # Lo vendido ya salió de la tienda, aunque la venta no haya subido.
        sin_red = stock_en_catalogo(page, "Labial Mate Rojo")
        if en_bodega is not None and sin_red != en_bodega - 1:
            fallas.append(f"sin red, el Inventario muestra {sin_red} labiales y tendría que mostrar {en_bodega - 1}")
        ir_a(page, "Vender")
    finally:
        contexto.set_offline(False)

    expect(franja(page)).to_be_hidden(timeout=20000)
    # Sube sola: la pantalla cambia a su número, sin tocar nada.
    expect(page.get_by_text(re.compile(r"Comprobante #V-\d{4}"))).to_be_visible(timeout=30000)
    esperar_ventas(page, ventas_antes + 1)
    page.wait_for_timeout(2000)
    nuevas = len(listar_coleccion("ventas")) - ventas_antes
    if nuevas != 1:
        fallas.append(f"al volver la red quedaron {nuevas} ventas nuevas y tendría que haber una")
    if en_bodega is not None and stock_en_base("Labial Mate Rojo") != en_bodega - 1:
        fallas.append("la bodega no descontó la venta que subió")
    page.get_by_role("button", name="Nueva venta rápida").click()
    return fallas


@caso("si la red se corta justo al registrar la venta, al volver queda una sola")
def caso_venta_cortada(page: Page, contexto: BrowserContext) -> list[str]:
    """
    El toque salió con red y la red se cayó en medio: no se sabe si la venta
    llegó. Queda en la cola con el mismo identificador y, al volver, la base
    tiene una sola, haya llegado o no la primera vez.
    """
    ventas_antes = len(listar_coleccion("ventas"))
    problema = poner_en_el_carrito(page, "Labial Mate Rojo")
    if problema:
        return [problema]
    registrar_venta(page)
    contexto.set_offline(True)
    try:
        expect(page.get_by_text(re.compile(r"Comprobante #V-\d{4}|Pendiente de subir"))).to_be_visible(timeout=20000)
    finally:
        contexto.set_offline(False)

    expect(franja(page)).to_be_hidden(timeout=20000)
    expect(page.get_by_text(re.compile(r"Comprobante #V-\d{4}"))).to_be_visible(timeout=30000)
    esperar_ventas(page, ventas_antes + 1)
    page.wait_for_timeout(3000)
    nuevas = len(listar_coleccion("ventas")) - ventas_antes
    page.get_by_role("button", name="Nueva venta rápida").click()
    return [] if nuevas == 1 else [f"con el corte quedaron {nuevas} ventas nuevas y tendría que haber una"]


@caso("sin señal, abonar y anotar lo dicen y no escriben")
def caso_escrituras_sin_red(page: Page, contexto: BrowserContext) -> list[str]:
    """
    Lo que escribe no se cuelga en "Guardando…" ni falla con un error
    técnico: dice que se puede cuando vuelva la señal y conserva lo escrito.
    """
    ventas_antes = len(listar_coleccion("ventas"))
    pagos_antes = len(listar_coleccion("pagos"))
    contexto.set_offline(True)
    try:
        expect(franja(page)).to_be_visible(timeout=10000)

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
        fallas.append("sin red se anotó un pedido (o quedó en cola y se subió al volver)")
    if len(listar_coleccion("pagos")) != pagos_antes:
        fallas.append("sin red se registró un abono")
    return fallas


@caso("sin señal, la letra es la misma")
def caso_fuentes_sin_red(page: Page, contexto: BrowserContext) -> list[str]:
    """
    Las fuentes vienen de Google Fonts: si el service worker no las guarda,
    sin red la app cambia de letra.

    Dos trampas de la prueba, no de la app. Al recargar, Chromium toma la
    hoja de estilos y la fuente de su memoria sin pasar por el service
    worker: por eso se abren pestañas nuevas, que comparten el service worker
    y no esa memoria (como reabrir la app en el teléfono). Y se vacía el
    caché HTTP antes de cortar la red, para que lo único que quede sea lo que
    guardó el service worker. La letra se mide: el mismo texto con "Plus
    Jakarta Sans" y con la de respaldo; si miden igual, la fuente no está.
    """
    medir = """async () => {
        // La fuente se baja cuando algo la usa: hay que esperarla.
        if ((await document.fonts.load("32px 'Plus Jakarta Sans'")).length === 0) return false;
        const ancho = (familia) => {
            const s = document.createElement('span');
            s.textContent = 'Glow Heaven 0123456789 mmmmwwwwiiii';
            // Sin cortar el renglón: un texto más ancho que la pantalla mide lo mismo con cualquier letra.
            s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font-size:24px;font-family:${familia}`;
            document.body.appendChild(s);
            const w = s.getBoundingClientRect().width;
            s.remove();
            return w;
        };
        return ancho("'Plus Jakarta Sans', monospace") !== ancho('monospace');
    }"""
    con_red = contexto.new_page()
    con_red.goto(arnes.URL_APP)
    con_red.wait_for_selector("nav", timeout=30000)
    if not con_red.evaluate(medir):
        con_red.close()
        return ["con red, la fuente Plus Jakarta Sans no cargó: la prueba no puede medir"]
    con_red.close()

    contexto.new_cdp_session(page).send("Network.clearBrowserCache")
    contexto.set_offline(True)
    sin_red = contexto.new_page()
    try:
        sin_red.goto(arnes.URL_APP)
        sin_red.wait_for_selector("nav", timeout=30000)
        cargada = sin_red.evaluate(medir)
    finally:
        sin_red.close()
        contexto.set_offline(False)
    return [] if cargada else ["sin red, la fuente Plus Jakarta Sans no cargó: la letra cambia"]


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
