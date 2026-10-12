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
    abrir_hoja_de_abono,
    cerrar_hojas,
    en_hoja,
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


def saldo_de_ana() -> int:
    return next(v for v in listar_coleccion("ventas") if v.get("codigo") == "V-0001")["saldo_usd_cents"]


def ficha_de_ana(page: Page):
    ir_a(page, "Cobros")
    visible(page, "button", "Ana Prueba").click()
    return page.get_by_role("dialog").last


@caso("sin señal, un abono queda pendiente y al volver la red se sube una vez")
def caso_abono_sin_red(page: Page, contexto: BrowserContext) -> list[str]:
    """
    C4: sin señal el abono no se frena: queda en el teléfono. La ficha de la
    clienta dice "1 abono pendiente de subir" sin cambiar el saldo; al volver
    la red se sube una vez y el saldo baja lo que se pagó.
    """
    fallas = []
    pagos_antes = {p.get("id") for p in listar_coleccion("pagos")}
    saldo_antes = saldo_de_ana()
    contexto.set_offline(True)
    try:
        expect(franja(page)).to_be_visible(timeout=10000)
        problema = abrir_hoja_de_abono(page)
        if problema:
            return [problema]
        en_hoja(page, "input[inputmode='decimal']").fill("10")
        en_hoja(page, "button", "Registrar abono").click()
        expect(page.get_by_role("dialog").last).to_contain_text("Pendiente de subir", timeout=10000)
        en_hoja(page, "button", "Listo").click()
        cerrar_hojas(page)

        # La ficha lo dice, sin tocar el saldo: todavía no está en la base.
        ficha = ficha_de_ana(page)
        expect(ficha).to_contain_text("1 abono pendiente de subir", timeout=10000)
        expect(ficha).to_contain_text(f"${saldo_antes / 100:,.2f}")
        cerrar_hojas(page)
    finally:
        contexto.set_offline(False)

    expect(franja(page)).to_be_hidden(timeout=20000)
    nuevos = []
    for _ in range(60):
        nuevos = [p for p in listar_coleccion("pagos") if p.get("id") not in pagos_antes]
        if nuevos:
            break
        page.wait_for_timeout(500)
    page.wait_for_timeout(2000)
    nuevos = [p for p in listar_coleccion("pagos") if p.get("id") not in pagos_antes]
    if len(nuevos) != 1:
        return [f"al volver la red quedaron {len(nuevos)} abonos nuevos y tendría que haber uno"]
    saldo_despues = saldo_de_ana()
    if saldo_despues != saldo_antes - nuevos[0]["monto_usd_cents"]:
        fallas.append(f"el saldo pasó de {saldo_antes} a {saldo_despues} con un abono de {nuevos[0]['monto_usd_cents']}")

    # La ficha ya muestra el saldo nuevo, sin la nota.
    ficha = ficha_de_ana(page)
    expect(ficha).to_contain_text(f"${saldo_despues / 100:,.2f}", timeout=15000)
    expect(ficha).not_to_contain_text("pendiente de subir")
    cerrar_hojas(page)
    return fallas


def crear_clienta_sin_red(page: Page, nombre: str, telefono: str = "") -> None:
    """Desde "Elegí la clienta", el alta: sin señal no se guarda, viaja con la operación."""
    selector = page.get_by_role("dialog", name="Elegí la clienta", exact=True)
    selector.get_by_role("button", name=re.compile("Crear nueva clienta")).click()
    alta = page.get_by_role("dialog", name="Clienta nueva", exact=True)
    alta.get_by_label("Nombre", exact=True).fill(nombre)
    if telefono:
        alta.get_by_label("Teléfono", exact=True).fill(telefono)
    alta.get_by_role("button", name="Guardar y elegir", exact=True).click()
    expect(alta).not_to_be_visible(timeout=10000)


def volver_a_la_barra(page: Page) -> None:
    cerrar_hojas(page)
    volver = principal(page).get_by_role("button", name="Volver", exact=True)
    if volver.count():
        volver.click()
    expect(page.locator("nav button:visible")).to_have_count(5)


@caso("sin señal, un pedido con clienta nueva queda pendiente y al subir se crean una vez")
def caso_pedido_sin_red(page: Page, contexto: BrowserContext) -> list[str]:
    """
    C4: sin señal, anotar un pedido no se frena, ni con una clienta nueva: la
    clienta viaja con el pedido y no se guarda sola. Al volver la red se
    crean una clienta y un encargo con ella, una sola vez.
    """
    fallas = []
    ventas_antes = len(listar_coleccion("ventas"))
    clientas_antes = len(listar_coleccion("clientes"))
    contexto.set_offline(True)
    try:
        expect(franja(page)).to_be_visible(timeout=10000)
        ir_a(page, "Vender")
        page.get_by_role("button", name="Anotar un pedido", exact=True).click()
        hoja = page.get_by_role("dialog", name="Anotar un pedido", exact=True)
        expect(hoja).to_be_visible(timeout=10000)
        hoja.get_by_role("button", name="Elegir clienta", exact=True).click()
        crear_clienta_sin_red(page, "Clienta sin señal C4", "88776655")
        expect(hoja).to_contain_text("Clienta sin señal C4")
        pieza = hoja.get_by_role("group", name="Pieza 1", exact=True)
        pieza.get_by_label("Qué quiere", exact=True).fill("Bolso pedido sin señal C4")
        hoja.get_by_role("button", name="Guardar pedido", exact=True).click()
        expect(page.get_by_text(re.compile(r"Pedido anotado"))).to_be_visible(timeout=10000)
        expect(hoja).not_to_be_visible(timeout=10000)
        if len(listar_coleccion("clientes")) != clientas_antes:
            fallas.append("sin red la clienta nueva se guardó sola en la base")
    finally:
        contexto.set_offline(False)

    expect(franja(page)).to_be_hidden(timeout=20000)
    esperar_ventas(page, ventas_antes + 1)
    page.wait_for_timeout(2000)
    pedidos = [v for v in listar_coleccion("ventas")
               if any(l.get("descripcion") == "Bolso pedido sin señal C4" for l in v.get("lineas", []))]
    clientas_nuevas = len(listar_coleccion("clientes")) - clientas_antes
    if len(pedidos) != 1:
        fallas.append(f"al volver la red quedaron {len(pedidos)} pedidos y tendría que haber uno")
    if clientas_nuevas != 1:
        fallas.append(f"al volver la red quedaron {clientas_nuevas} clientas nuevas y tendría que haber una")
    if len(pedidos) == 1 and clientas_nuevas == 1:
        clienta = next((c for c in listar_coleccion("clientes") if c.get("id") == pedidos[0].get("cliente_id")), None)
        if clienta is None or "sin señal c4" not in clienta.get("nombre", "").lower():
            fallas.append("el pedido no quedó con la clienta nueva")
        if pedidos[0].get("tipo") != "ENCARGO":
            fallas.append("lo que subió no es un encargo")
    volver_a_la_barra(page)
    return fallas


@caso("sin señal, una venta a una clienta nueva sube con ella")
def caso_venta_clienta_nueva_sin_red(page: Page, contexto: BrowserContext) -> list[str]:
    """El mismo selector de clienta en Vender: la clienta nueva sube antes que la venta."""
    fallas = []
    ventas_antes = len(listar_coleccion("ventas"))
    clientas_antes = len(listar_coleccion("clientes"))
    problema = poner_en_el_carrito(page, "Labial Mate Rojo")
    if problema:
        return [problema]
    contexto.set_offline(True)
    try:
        expect(franja(page)).to_be_visible(timeout=10000)
        visible(page, "span:text-is('Cobrar')").click()
        carrito = page.get_by_role("dialog", name="Carrito", exact=True)
        carrito.get_by_role("button", name=re.compile("elegir clienta")).click()
        crear_clienta_sin_red(page, "Compradora sin señal C4")
        expect(carrito).to_contain_text("Compradora sin señal C4")
        carrito.get_by_role("button", name="Registrar venta").click()
        expect(page.get_by_text("Pendiente de subir · sin número todavía")).to_be_visible(timeout=10000)
    finally:
        contexto.set_offline(False)

    expect(franja(page)).to_be_hidden(timeout=20000)
    expect(page.get_by_text(re.compile(r"Comprobante #V-\d{4}"))).to_be_visible(timeout=30000)
    esperar_ventas(page, ventas_antes + 1)
    page.wait_for_timeout(2000)
    ventas = listar_coleccion("ventas")
    clientas = listar_coleccion("clientes")
    if len(ventas) - ventas_antes != 1:
        fallas.append(f"al volver la red quedaron {len(ventas) - ventas_antes} ventas nuevas y tendría que haber una")
    if len(clientas) - clientas_antes != 1:
        fallas.append(f"al volver la red quedaron {len(clientas) - clientas_antes} clientas nuevas y tendría que haber una")
    nueva = next((c for c in clientas if "compradora sin señal c4" in c.get("nombre", "").lower()), None)
    ultima = max(ventas, key=lambda v: v.get("id", 0))
    if nueva is None or ultima.get("cliente_id") != nueva.get("id"):
        fallas.append("la venta no quedó con la clienta nueva")
    page.get_by_role("button", name="Nueva venta rápida").click()
    return fallas


def dejar_sin_stock(nombre: str) -> None:
    """Como si la PC hubiera vendido lo último: cada tono del producto queda en cero."""
    duenia = {"Authorization": "Bearer owner"}
    base = f"http://{arnes.HOST_FIRESTORE}/v1/projects/{arnes.PROYECTO}/databases/(default)/documents"
    documentos = arnes._peticion(f"{base}/productos?pageSize=300", cabeceras=duenia).get("documents", [])
    doc = next(d for d in documentos if d["fields"].get("nombre", {}).get("stringValue") == nombre)
    variantes = doc["fields"]["variantes"]
    for variante in variantes.get("arrayValue", {}).get("values", []):
        variante["mapValue"]["fields"]["existencias"] = {"integerValue": "0"}
    campos = {"variantes": variantes}
    mascara = "updateMask.fieldPaths=variantes"
    if "existencias" in doc["fields"]:
        campos["existencias"] = {"integerValue": "0"}
        mascara += "&updateMask.fieldPaths=existencias"
    respuesta = arnes._peticion(
        f"http://{arnes.HOST_FIRESTORE}/v1/{doc['name']}?{mascara}",
        metodo="PATCH", cuerpo={"fields": campos}, cabeceras=duenia,
    )
    assert "error" not in respuesta, respuesta


def cerrar_venta_hecha(page: Page) -> None:
    """Si un caso anterior dejó la pantalla de "Venta registrada", vuelve al catálogo."""
    ir_a(page, "Vender")
    otra = visible(page, "button", "Nueva venta rápida")
    if otra is not None:
        otra.click()
        page.wait_for_timeout(500)


def aviso_de_la_cola(page: Page, texto: str):
    """El botón que dice cuánto espera ("Pendientes (1)", "Para revisar (1)") y abre la hoja."""
    return page.get_by_role("button", name=re.compile(texto))


@caso("lo que no se puede subir queda para revisar, con su motivo, y descartar pregunta antes")
def caso_para_revisar(page: Page, contexto: BrowserContext) -> list[str]:
    """
    C4 · T7: una venta sin señal de lo último que quedaba, que la PC vendió
    mientras tanto, no se pierde en silencio. Junto a la franja se ve cuánto
    espera; al subir, el negocio la rechaza y queda "Para revisar" con el
    motivo, también con red. "Descartar" pregunta antes, y entonces se va.
    """
    fallas = []
    cerrar_venta_hecha(page)
    ventas_antes = len(listar_coleccion("ventas"))
    problema = poner_en_el_carrito(page, "Ultimo Disponible")
    if problema:
        return [problema]
    contexto.set_offline(True)
    try:
        expect(franja(page)).to_be_visible(timeout=10000)
        registrar_venta(page)
        expect(page.get_by_text("Pendiente de subir · sin número todavía")).to_be_visible(timeout=10000)
        expect(aviso_de_la_cola(page, r"^Pendientes \(1\)")).to_be_visible(timeout=10000)
        dejar_sin_stock("Ultimo Disponible")
    finally:
        contexto.set_offline(False)

    expect(franja(page)).to_be_hidden(timeout=20000)
    revisar = aviso_de_la_cola(page, r"^Para revisar \(1\)")
    expect(revisar).to_be_visible(timeout=30000)
    expect(page.get_by_text(re.compile(r"No se pudo subir: No hay suficientes unidades de 'Ultimo Disponible'"))).to_be_visible()
    page.get_by_role("button", name="Nueva venta rápida").click()

    revisar.click()
    hoja = page.get_by_role("dialog", name="Pendientes", exact=True)
    expect(hoja).to_contain_text("No hay suficientes unidades de 'Ultimo Disponible'")
    expect(hoja.get_by_role("button", name="Intentar de nuevo")).to_be_visible()
    hoja.get_by_role("button", name="Descartar").click()
    confirmar = page.get_by_role("alertdialog", name="¿Descartar esta venta?", exact=True)
    expect(confirmar).to_be_visible()
    confirmar.get_by_role("button", name="Sí, descartar").click()
    expect(aviso_de_la_cola(page, r"^Para revisar")).to_have_count(0, timeout=10000)
    cerrar_hojas(page)
    page.wait_for_timeout(1500)
    if len(listar_coleccion("ventas")) != ventas_antes:
        fallas.append("la venta que no se pudo subir igual quedó guardada")
    return fallas


@caso("lo pendiente se ve arriba en el Historial, sin número, y al subir toma su número")
def caso_historial_pendiente(page: Page, contexto: BrowserContext) -> list[str]:
    cerrar_venta_hecha(page)
    ventas_antes = len(listar_coleccion("ventas"))
    problema = poner_en_el_carrito(page, "Labial Mate Rojo")
    if problema:
        return [problema]
    contexto.set_offline(True)
    try:
        expect(franja(page)).to_be_visible(timeout=10000)
        registrar_venta(page)
        expect(page.get_by_text("Pendiente de subir · sin número todavía")).to_be_visible(timeout=10000)
        page.get_by_role("button", name="Nueva venta rápida").click()
        ir_a(page, "Historial")
        expect(principal(page)).to_contain_text("Pendiente de subir", timeout=10000)
        expect(principal(page).get_by_text("sin número todavía")).to_be_visible()
    finally:
        contexto.set_offline(False)

    expect(franja(page)).to_be_hidden(timeout=20000)
    esperar_ventas(page, ventas_antes + 1)
    nueva = max(listar_coleccion("ventas"), key=lambda v: v.get("id", 0))
    expect(principal(page)).to_contain_text(nueva["codigo"], timeout=20000)
    expect(principal(page)).not_to_contain_text("Pendiente de subir", timeout=20000)
    return []


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
