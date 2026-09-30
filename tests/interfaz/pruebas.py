"""
Pruebas de interfaz de la PWA móvil, contra el emulador local.

Qué prueban que no probaba nada más
-----------------------------------
Todo lo demás del proyecto prueba por debajo de la pantalla. Acá se aprieta
lo que aprieta una persona, y se comprueba el resultado en la base: si el
formulario valida, si el error se ve, si tocar dos veces registra dos veces,
y si el monto que se escribe es el monto que se guarda.

La prueba del monto es la más importante: cierra de punta a punta el error por
el que "C$1,500" quedaba registrado como C$1.50.

Cada caso devuelve una lista de fallas. Vacía es aprobado.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from playwright.sync_api import sync_playwright, Page  # noqa: E402

import arnes  # noqa: E402

CASOS = []


def caso(nombre: str):
    """Registra una prueba. La función recibe la página y devuelve fallas."""
    def envoltorio(fn):
        CASOS.append((nombre, fn))
        return fn
    return envoltorio


# ---------------------------------------------------------------------------
# Ayudas de navegación
# ---------------------------------------------------------------------------

def cerrar_hojas(page: Page) -> None:
    """Cierra cualquier hoja abierta: tapan la barra de navegación."""
    for _ in range(4):
        botones = page.locator("button[aria-label='Cerrar']")
        abiertos = [botones.nth(i) for i in range(botones.count()) if botones.nth(i).is_visible()]
        if not abiertos:
            break
        # La de más arriba primero: con dos hojas apiladas (el detalle y, encima,
        # la factura) el botón de la de abajo está tapado y no se puede tocar.
        abiertos[-1].click()
        page.wait_for_timeout(500)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)


def ir_a(page: Page, pestania: str) -> None:
    cerrar_hojas(page)
    page.locator("nav button", has_text=pestania).first.click()
    page.wait_for_timeout(1200)


def abrir_hoja_de_abono(page: Page) -> str | None:
    """
    Recorre el camino real hasta el formulario del abono.

    Tocar la fila de la clienta abre su detalle; el formulario está detrás del
    botón "Registrar abono" de esa hoja.
    """
    ir_a(page, "Cobros")

    fila = visible(page, "button", "Ana Prueba")
    if fila is None:
        return "no encontré la fila de la clienta en Cobros"
    fila.click()
    page.wait_for_timeout(1200)

    # Dentro de la hoja: la pantalla de Cobros de abajo tiene su propio
    # "Registrar abono", tapado por la hoja y sin poder tocarse.
    registrar = en_hoja(page, "button", "Registrar abono")
    if registrar is None:
        return "el detalle de la clienta no ofrece 'Registrar abono'"
    registrar.click()
    page.wait_for_timeout(1200)
    return None


def en_hoja(page: Page, selector: str, texto: str | None = None):
    """
    Busca SOLO dentro de la hoja abierta.

    Las cuatro vistas de la app están montadas al mismo tiempo y la hoja se
    dibuja encima, así que un selector suelto encuentra botones de la pantalla
    de abajo que Playwright considera visibles pero no se pueden tocar.
    """
    hoja = page.locator("[role='dialog']").last
    loc = hoja.locator(selector, has_text=texto) if texto else hoja.locator(selector)
    for i in range(loc.count()):
        if loc.nth(i).is_visible():
            return loc.nth(i)
    return None


def visible(page: Page, selector: str, texto: str | None = None):
    """El primer elemento visible que coincide. Las vistas están todas montadas."""
    loc = page.locator(selector, has_text=texto) if texto else page.locator(selector)
    for i in range(loc.count()):
        if loc.nth(i).is_visible():
            return loc.nth(i)
    return None


def venta_en_base(codigo: str = "V-0001") -> dict:
    """Lee la venta sembrada desde el emulador, por la API REST."""
    r = arnes._peticion(f"{arnes.URL_DOCS.replace('/emulator/v1', '/v1')}")
    return r


def leer_doc(coleccion: str, doc_id: str) -> dict:
    """Devuelve los campos de un documento, ya desempaquetados."""
    url = (
        f"http://{arnes.HOST_FIRESTORE}/v1/projects/{arnes.PROYECTO}"
        f"/databases/(default)/documents/{coleccion}/{doc_id}"
    )
    r = arnes._peticion(url, cabeceras={"Authorization": "Bearer owner"})
    campos = r.get("fields", {})
    return {k: _valor(v) for k, v in campos.items()}


def listar_coleccion(coleccion: str) -> list[dict]:
    url = (
        f"http://{arnes.HOST_FIRESTORE}/v1/projects/{arnes.PROYECTO}"
        f"/databases/(default)/documents/{coleccion}?pageSize=300"
    )
    r = arnes._peticion(url, cabeceras={"Authorization": "Bearer owner"})
    salida = []
    for d in r.get("documents", []):
        salida.append({k: _valor(v) for k, v in d.get("fields", {}).items()})
    return salida


def _valor(v: dict):
    if "integerValue" in v:
        return int(v["integerValue"])
    if "doubleValue" in v:
        return float(v["doubleValue"])
    if "booleanValue" in v:
        return v["booleanValue"]
    if "stringValue" in v:
        return v["stringValue"]
    if "nullValue" in v:
        return None
    if "arrayValue" in v:
        return [_valor(x) for x in v["arrayValue"].get("values", [])]
    if "mapValue" in v:
        return {k: _valor(x) for k, x in v["mapValue"].get("fields", {}).items()}
    return v


# El contraste de un texto contra lo que tiene pintado debajo, con la fórmula
# de WCAG. Si el elemento no tiene fondo propio opaco, se mezcla con el primer
# ancestro que sí lo tenga.
JS_CONTRASTE = """(el) => {
  const num = (s) => (s.match(/[\\d.]+/g) || []).map(Number);
  const rgba = (s) => { const [r, g, b, a] = num(s); return [r, g, b, a === undefined ? 1 : a]; };
  let fondo = [255, 255, 255, 1];
  for (let n = el.parentElement; n; n = n.parentElement) {
    const c = rgba(getComputedStyle(n).backgroundColor);
    if (c[3] > 0.99) { fondo = c; break; }
  }
  const propio = rgba(getComputedStyle(el).backgroundColor);
  const mezcla = [0, 1, 2].map((i) => propio[i] * propio[3] + fondo[i] * (1 - propio[3]));
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const texto = rgba(getComputedStyle(el).color);
  const a = lum(texto), b = lum(mezcla);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}"""


# Todo texto que esté pintado sobre uno de los tintes (`--x-suave`) y no llegue
# al contraste mínimo. Es la regla de temas.css ("nunca --x sobre --x-suave")
# medida en la pantalla y no en el código: `auditar-colores.mjs` mira cada
# className por separado y no ve un texto cuyo fondo lo pone el contenedor.
# Los íconos no cuentan (no tienen texto) y el texto grande pide 3:1.
JS_TEXTO_SOBRE_TINTE = r"""() => {
  const raiz = getComputedStyle(document.documentElement);
  const token = (n) => raiz.getPropertyValue('--' + n).trim().split(/\s+/).map(Number);
  const tintes = ['peligro', 'alerta', 'exito', 'acento'].map((r) => token(r + '-suave'));
  const num = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const malos = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    if (el.getClientRects().length === 0) continue;
    let fondo = null;
    for (let n = el; n && !fondo; n = n.parentElement) {
      const c = num(getComputedStyle(n).backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.99)) fondo = c;
    }
    if (!fondo || !tintes.some((t) => t[0] === fondo[0] && t[1] === fondo[1] && t[2] === fondo[2])) continue;
    const estilo = getComputedStyle(el);
    const color = num(estilo.color);
    const alfa = color[3] === undefined ? 1 : color[3];
    const mezcla = [0, 1, 2].map((i) => color[i] * alfa + fondo[i] * (1 - alfa));
    const a = lum(mezcla), b = lum(fondo);
    const contraste = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const px = parseFloat(estilo.fontSize);
    const grande = px >= 24 || (px >= 18.66 && Number(estilo.fontWeight) >= 700);
    if (contraste < (grande ? 3 : 4.5)) {
      malos.add('"' + el.textContent.trim().slice(0, 32) + '" ' + contraste.toFixed(2) + ':1');
    }
  }
  return [...malos];
}"""


def textos_ilegibles_sobre_tinte(page: Page, pantallas, abrir) -> list[str]:
    """Recorre las pantallas en claro y en oscuro y junta lo que no se lee."""
    fallas: list[str] = []
    clases = "document.documentElement.classList"
    estaba_oscuro = page.evaluate(f"() => {clases}.contains('dark')")
    try:
        for tema, oscuro in (("claro", False), ("oscuro", True)):
            page.evaluate(f"(o) => {clases}.toggle('dark', o)", oscuro)
            for pantalla in pantallas:
                abrir(page, pantalla)
                page.wait_for_timeout(500)
                for malo in page.evaluate(JS_TEXTO_SOBRE_TINTE):
                    fallas.append(f"{pantalla} en {tema}: {malo}")
    finally:
        page.evaluate(f"(o) => {clases}.toggle('dark', o)", estaba_oscuro)
        page.wait_for_timeout(300)
    return fallas


def campo_de(page: Page, etiqueta: str):
    """El campo que vive dentro del `<label>` visible con ese texto."""
    rotulo = visible(page, "label", etiqueta)
    return rotulo.locator("input").first if rotulo is not None else None


def poner_en_el_carrito(page: Page, producto: str) -> str | None:
    """Deja un producto en el carrito de Vender, si todavía no hay ninguno."""
    ir_a(page, "Vender")
    if visible(page, "span:text-is('Cobrar')") is not None:
        return None
    agregar = visible(page, f"button[aria-label='Agregar {producto}']")
    if agregar is None:
        return f"Vender no ofrece agregar {producto!r}"
    agregar.click()
    page.wait_for_timeout(700)
    if visible(page, "span:text-is('Cobrar')") is None:
        return "agregar un producto no muestra la barra del carrito"
    return None


# ---------------------------------------------------------------------------
# Casos
# ---------------------------------------------------------------------------

@caso("la app abre y muestra las cinco pestañas")
def caso_arranque(page: Page) -> list[str]:
    fallas = []
    for etiqueta in ["Inicio", "Vender", "Cobros", "Historial", "Catálogo"]:
        if page.locator("nav button", has_text=etiqueta).count() == 0:
            fallas.append(f"falta la pestaña {etiqueta!r}")
    return fallas


@caso("el catálogo muestra los productos sembrados con su stock")
def caso_catalogo(page: Page) -> list[str]:
    ir_a(page, "Catálogo")
    fallas = []
    cuerpo = page.locator("body").inner_text()
    for nombre in ["Labial Mate Rojo", "Perfume Carolina Herrera"]:
        if nombre not in cuerpo:
            fallas.append(f"el catálogo no muestra {nombre!r}")
    return fallas


@caso("la cobranza muestra la deuda de la clienta")
def caso_cobranza_lista(page: Page) -> list[str]:
    ir_a(page, "Cobros")
    fallas = []
    cuerpo = page.locator("body").inner_text()
    if "Ana Prueba" not in cuerpo:
        fallas.append("la clienta con deuda no aparece en Cobros")
    if "$100.00" not in cuerpo and "100.00" not in cuerpo:
        fallas.append(f"no se ve el saldo de $100; texto: {cuerpo[:200]!r}")
    return fallas


@caso("CAJ-01 · Ajustes muestra el nombre y el teléfono guardados, y guardar sólo manda lo que cambió")
def caso_ajustes(page: Page) -> list[str]:
    """
    Las seis pantallas se montan al abrir la app, antes de que lleguen los
    parámetros. Ajustes copiaba nombre y teléfono una sola vez, vacíos, y como
    "vacío" era distinto de lo guardado ofrecía "Guardar cambios" sin que nadie
    hubiera tocado nada: un toque borraba el nombre del negocio en las dos apps
    y en todas las facturas.
    """
    fallas = []
    ir_a(page, "Inicio")
    boton = visible(page, "button[aria-label='Ajustes']")
    if boton is None:
        return ["Inicio no tiene el botón de Ajustes"]
    boton.click()
    page.wait_for_timeout(900)

    try:
        nombre = campo_de(page, "Nombre")
        telefono = campo_de(page, "Teléfono")
        if nombre is None or telefono is None:
            return ["Ajustes no muestra los campos del negocio"]

        if nombre.input_value() != "Glow Heaven Prueba":
            fallas.append(f"el nombre guardado es 'Glow Heaven Prueba' y el campo dice {nombre.input_value()!r}")
        if telefono.input_value() != "8888-0000":
            fallas.append(f"el teléfono guardado es '8888-0000' y el campo dice {telefono.input_value()!r}")
        if visible(page, "button", "Guardar cambios") is not None:
            fallas.append("ofrece 'Guardar cambios' sin que se haya tocado nada")
        if "recalcula" in page.locator("body").inner_text():
            fallas.append("dice que cambiar la tasa recalcula los precios, y no lo hace (CAJ-02)")

        # Un cambio de verdad: la barra aparece, y guardar no pisa lo demás.
        telefono.fill("7777-1111")
        page.wait_for_timeout(300)
        guardar = visible(page, "button", "Guardar cambios")
        if guardar is None:
            fallas.append("cambiar el teléfono no ofrece guardar")
        else:
            guardar.click()
            page.wait_for_timeout(2500)
            guardado = leer_doc("parametros", "sistema")
            if guardado.get("telefono_negocio") != "7777-1111":
                fallas.append(f"el teléfono no se guardó: quedó {guardado.get('telefono_negocio')!r}")
            if guardado.get("nombre_negocio") != "Glow Heaven Prueba":
                fallas.append(f"guardar el teléfono cambió el nombre del negocio a {guardado.get('nombre_negocio')!r}")
            if guardado.get("tasa_cambio_cents") != 3700:
                fallas.append(f"guardar el teléfono cambió la tasa a {guardado.get('tasa_cambio_cents')!r}")
            if visible(page, "button", "Guardar cambios") is not None:
                fallas.append("después de guardar sigue ofreciendo 'Guardar cambios'")
    finally:
        volver = visible(page, "button[aria-label='Volver']")
        if volver is not None:
            volver.click()
            page.wait_for_timeout(700)
    return fallas


@caso("CCO-01 · 'Pagar todo' en córdobas llena el saldo con la tasa de la venta")
def caso_pagar_todo(page: Page) -> list[str]:
    """
    El abono se registra con la tasa congelada de la venta. La hoja llenaba
    "Pagar todo" con la de hoy: con la venta a 36,00 y la tasa en 37,00 proponía
    C$3,700 por una cuenta que se cierra con C$3,600.
    """
    fallas = []
    venta = next(v for v in listar_coleccion("ventas") if v.get("codigo") == "V-0001")
    esperado = round(venta["saldo_usd_cents"] * venta["tasa_cambio_cents"] / 100) / 100

    problema = abrir_hoja_de_abono(page)
    if problema:
        return [problema]
    try:
        cordobas = en_hoja(page, "button", "Córdobas")
        if cordobas is not None:
            cordobas.click()
            page.wait_for_timeout(300)
        todo = en_hoja(page, "button", "Pagar todo")
        campo = en_hoja(page, "input[inputmode='decimal']")
        if todo is None or campo is None:
            return ["la hoja de abono no tiene 'Pagar todo' o el campo del monto"]
        todo.click()
        page.wait_for_timeout(300)
        if campo.input_value() != f"{esperado:.2f}":
            fallas.append(
                f"'Pagar todo' propone C${campo.input_value()} y la cuenta se cierra con C${esperado:,.2f} "
                f"(la venta se hizo a {venta['tasa_cambio_cents'] / 100:.2f})"
            )
        hoja = page.locator("[role='dialog']").last.inner_text()
        if f"C${esperado:,.2f}" not in hoja:
            fallas.append(f"la hoja no muestra el saldo en córdobas de la venta (C${esperado:,.2f})")
    finally:
        cerrar_hojas(page)
    return fallas


@caso("CHI-08 · la hoja de la factura muestra el total en córdobas con la tasa de la venta")
def caso_factura_con_su_tasa(page: Page) -> list[str]:
    """
    El PDF sale con la tasa de la venta (DOC-01). La hoja que lo ofrece
    calculaba el total con la de hoy: la pantalla y el documento decían montos
    distintos de la misma factura.
    """
    fallas = []
    venta = next(v for v in listar_coleccion("ventas") if v.get("codigo") == "V-0001")
    esperado = round(venta["total_usd_cents"] * venta["tasa_cambio_cents"] / 100) / 100

    problema = abrir_historial(page, "Ventas")
    if problema:
        return [problema]
    try:
        fila = visible(page, "main button", "Ana Prueba")
        if fila is None:
            return ["la venta de Ana Prueba no aparece en el Historial"]
        fila.click()
        page.wait_for_timeout(800)
        ver = en_hoja(page, "button", "Ver factura")
        if ver is None:
            return ["el detalle de la venta no ofrece 'Ver factura'"]
        ver.click()
        page.wait_for_timeout(2000)
        # El rótulo va en mayúsculas por CSS: se compara sin distinguirlas.
        hoja = next(
            (t for t in page.locator("[role='dialog']").all_inner_texts() if "total de la factura" in t.lower()),
            None,
        )
        if hoja is None:
            return ["la hoja de la factura no muestra su total"]
        if f"C${esperado:,.2f}" not in hoja:
            montos = re.findall(r"C\$[\d,]+\.\d\d", hoja)
            fallas.append(
                f"la factura es de C${esperado:,.2f} (venta a {venta['tasa_cambio_cents'] / 100:.2f}) "
                f"y la hoja dice {montos[:2]}"
            )
    finally:
        cerrar_hojas(page)
    return fallas


@caso("el campo del monto no deja registrar un monto mil veces menor")
def caso_abono_miles(page: Page) -> list[str]:
    """
    Cierre de punta a punta del error por el que "C$1,500" quedaba guardado
    como C$1.50.

    El campo es `type="number"`, así que el navegador filtra la coma antes de
    que el texto llegue a la aplicación. Lo que importa no es por cuál de los
    dos caminos se resuelve, sino que sea imposible que la clienta escriba mil
    quinientos y quede registrado un dólar y medio.
    """
    fallas = []
    problema = abrir_hoja_de_abono(page)
    if problema:
        return [problema]

    campo = en_hoja(page, "input[inputmode='decimal']")
    if campo is None:
        return ["no encontré el campo del monto en la hoja de abono"]

    cordobas = en_hoja(page, "button", "Córdobas")
    if cordobas is not None:
        cordobas.click()
        page.wait_for_timeout(400)

    antes = len(listar_coleccion("pagos"))

    campo.click()
    campo.type("1,500")
    page.wait_for_timeout(400)
    escrito = campo.input_value()

    confirmar = en_hoja(page, "button", "Registrar abono")
    if confirmar is None:
        return ["no encontré el botón de confirmar el abono"]

    if not confirmar.is_enabled():
        # Rechazado antes de guardar: también es un final correcto.
        return []

    confirmar.click()
    page.wait_for_timeout(2500)

    pagos = listar_coleccion("pagos")
    if len(pagos) == antes:
        # No se guardó nada: la validación lo frenó. Correcto.
        return []

    ultimo = pagos[-1]
    cor = ultimo.get("monto_cor_cents", 0)
    if cor != 150000:
        fallas.append(
            f"el campo quedó con {escrito!r} y se registraron C${cor / 100:.2f}; "
            f"tenían que ser C$1,500.00"
        )
    return fallas


@caso("un abono vacío, en cero o con letras no se registra")
def caso_abono_invalido(page: Page) -> list[str]:
    fallas = []
    antes = len(listar_coleccion("pagos"))

    problema = abrir_hoja_de_abono(page)
    if problema:
        return [problema]

    campo = en_hoja(page, "input[inputmode='decimal']")
    if campo is None:
        return ["no encontré el campo del monto"]

    for valor in ["", "0", "abc", "-50"]:
        campo.fill("")
        if valor:
            campo.type(valor)
        page.wait_for_timeout(300)

        confirmar = en_hoja(page, "button", "Registrar abono")
        if confirmar is not None and confirmar.is_enabled():
            confirmar.click()
            page.wait_for_timeout(1500)
            # Si el abono prosperó, la hoja se cierra: hay que reabrirla.
            if en_hoja(page, "input[inputmode='decimal']") is None:
                problema = abrir_hoja_de_abono(page)
                if problema:
                    break
                campo = en_hoja(page, "input[inputmode='decimal']")
                if campo is None:
                    break

    despues = len(listar_coleccion("pagos"))
    if despues != antes:
        fallas.append(
            f"un monto inválido creó {despues - antes} abono(s): la validación no lo frenó"
        )
    return fallas


@caso("tocar dos veces el botón de confirmar no registra dos abonos")
def caso_doble_toque(page: Page) -> list[str]:
    """
    El guardián contra el doble toque es lo único que separa un abono de dos.
    Si falla, la clienta queda con un pago de más en su historial y el saldo
    descontado dos veces.
    """
    fallas = []
    antes = len(listar_coleccion("pagos"))

    problema = abrir_hoja_de_abono(page)
    if problema:
        return [problema]

    campo = en_hoja(page, "input[inputmode='decimal']")
    confirmar = en_hoja(page, "button", "Registrar abono")
    if campo is None or confirmar is None:
        return ["no encontré el formulario del abono"]

    dolares = en_hoja(page, "button", "Dólares")
    if dolares is not None:
        dolares.click()
        page.wait_for_timeout(300)

    campo.click()
    campo.type("10")
    page.wait_for_timeout(300)

    # Dos toques seguidos, sin esperar la respuesta del primero.
    try:
        confirmar.click(timeout=4000)
        confirmar.click(timeout=1500, force=True)
    except Exception:
        pass  # Que el segundo no se pueda tocar es justamente lo deseable.

    page.wait_for_timeout(3000)

    creados = len(listar_coleccion("pagos")) - antes
    if creados > 1:
        fallas.append(f"dos toques crearon {creados} abonos")
    return fallas


@caso("la fecha que propone el formulario es la de hoy en Nicaragua")
def caso_fecha(page: Page) -> list[str]:
    from datetime import datetime, timedelta, timezone

    hoy_nicaragua = (datetime.now(timezone.utc) - timedelta(hours=6)).strftime("%Y-%m-%d")

    fallas = []
    ventas = listar_coleccion("ventas")
    if not ventas:
        return ["no hay ventas para comprobar la fecha"]

    # La venta sembrada se creó recién: su fecha tiene que ser la de hoy acá.
    fecha = ventas[0].get("fecha")
    if fecha != hoy_nicaragua:
        fallas.append(f"la venta quedó fechada {fecha!r} y en Nicaragua es {hoy_nicaragua!r}")
    return fallas


def abrir_historial(page: Page, filtro: str) -> str | None:
    """
    La pestaña Historial de la barra de abajo, con un filtro. Hasta la 2.16.1
    esto era "Actividad" y se llegaba tocando el contador de ventas de Inicio:
    nadie lo encontraba.
    """
    ir_a(page, "Historial")
    chip = visible(page, f"button:text-is('{filtro}')")
    if chip is None:
        return f"Historial no tiene el filtro {filtro!r}"
    chip.click()
    page.wait_for_timeout(500)
    return None


@caso("una venta y un abono se corrigen desde el Historial")
def caso_corregir(page: Page) -> list[str]:
    """
    Sin esto no había cómo arreglar una venta mal cargada desde ninguna de
    las dos apps: la salida fue borrarla desde la consola de Firebase.
    """
    fallas = []
    problema = abrir_historial(page, "Ventas")
    if problema:
        return [problema]
    fila = visible(page, "main button", "Ana Prueba")
    if fila is None:
        return ["la venta de Ana Prueba no aparece en el Historial"]
    fila.click()
    page.wait_for_timeout(800)
    corregir = en_hoja(page, "button", "Corregir venta")
    if corregir is None:
        return ["el detalle de la venta no ofrece 'Corregir venta'"]
    corregir.click()
    page.wait_for_timeout(2000)

    # Eran dos labiales y fueron tres.
    mas = en_hoja(page, "button[aria-label='Una más de Labial Mate Rojo']")
    if mas is None:
        return ["la hoja de corregir no muestra el labial con su cantidad"]
    mas.click()
    page.wait_for_timeout(300)
    guardar = en_hoja(page, "button", "Guardar corrección")
    if guardar is None or not guardar.is_enabled():
        return ["no se puede guardar la corrección"]
    guardar.click()
    page.wait_for_timeout(2500)

    venta = next((v for v in listar_coleccion("ventas") if v.get("codigo") == "V-0001"), None)
    if venta is None:
        return ["la venta sembrada ya no está: corregir no puede cambiar el número"]
    if venta["lineas"][0]["cantidad"] != 3 or venta["total_usd_cents"] != 15000:
        fallas.append(
            f"la venta quedó con {venta['lineas'][0]['cantidad']} labiales y "
            f"${venta['total_usd_cents'] / 100:.2f}; eran 3 y $150.00"
        )

    # El abono de C$1,500 (el de la prueba de miles): se ve en córdobas, dice
    # quién lo registró, y al corregirlo la moneda original está marcada.
    cerrar_hojas(page)
    problema = abrir_historial(page, "Abonos")
    if problema:
        return fallas + [problema]
    fila = visible(page, "main button", "C$1,500.00")
    if fila is None:
        return fallas + ["el abono de C$1,500 no se ve en córdobas en el Historial"]
    if "Sin dato de quién" in fila.inner_text():
        fallas.append("un abono registrado hoy no dice quién lo registró")
    fila.click()
    page.wait_for_timeout(800)
    corregir = en_hoja(page, "button", "Corregir abono")
    if corregir is None:
        return fallas + ["el detalle del abono no ofrece 'Corregir abono'"]
    corregir.click()
    page.wait_for_timeout(1000)
    cordobas = en_hoja(page, "[role='radio']", "Córdobas")
    if cordobas is None or cordobas.get_attribute("aria-checked") != "true":
        fallas.append("la corrección no arranca en córdobas, la moneda en que se registró")
    dolares = en_hoja(page, "[role='radio']", "Dólares")
    if dolares is not None:
        dolares.click()
        page.wait_for_timeout(200)
        if en_hoja(page, "p", "Lo registraste en córdobas") is None:
            fallas.append("pasarlo a dólares no avisa que se registró en córdobas")
        cordobas.click()
    campo = en_hoja(page, "input#abono-monto")
    if campo is None:
        return fallas + ["la hoja de corregir el abono no tiene el monto"]
    campo.fill("1,200")
    en_hoja(page, "button", "Guardar corrección").click()
    page.wait_for_timeout(2500)
    corregido = [
        p for p in listar_coleccion("pagos")
        if p.get("moneda") == "COR" and p.get("monto_cor_cents") == 120000
    ]
    if not corregido:
        fallas.append("el abono no quedó en C$1,200 después de corregirlo")
    elif not corregido[0].get("corregido_por"):
        fallas.append("el abono corregido no dice quién lo corrigió")
    cerrar_hojas(page)
    return fallas


def stock_en_catalogo(page: Page, nombre: str) -> int | None:
    """Las unidades que el Catálogo muestra para un producto ("17 disp.")."""
    import re
    ir_a(page, "Catálogo")
    m = re.search(re.escape(nombre) + r"[\s\S]{0,300}?(\d+) disp\.", page.locator("body").inner_text())
    return int(m.group(1)) if m else None


def stock_en_base(nombre: str) -> int:
    p = next(x for x in listar_coleccion("productos") if x.get("nombre") == nombre)
    return sum(v.get("existencias", 0) for v in p.get("variantes", []) if v.get("activo", True))


@caso("lo que se corrige o se cancela en el Historial se ve en Cobros y en el Catálogo")
def caso_reacciona(page: Page) -> list[str]:
    """
    Fase de pruebas de la 2.16.1: editar o anular algo tiene que verse en las
    otras pantallas sin recargar la app. Cancelar una venta desde el Historial
    devolvía las unidades a la bodega, pero el Catálogo seguía mostrando el
    stock de antes.
    """
    fallas = []
    venta = next(v for v in listar_coleccion("ventas") if v.get("codigo") == "V-0001")

    # Cobros muestra el saldo que quedó después de corregir venta y abono.
    ir_a(page, "Cobros")
    saldo = f"${venta['saldo_usd_cents'] / 100:,.2f}"
    if venta["saldo_usd_cents"] > 0 and saldo not in page.locator("body").inner_text():
        fallas.append(f"Cobros no muestra el saldo corregido de Ana ({saldo})")

    antes = stock_en_catalogo(page, "Labial Mate Rojo")
    if antes != stock_en_base("Labial Mate Rojo"):
        fallas.append(f"el Catálogo muestra {antes} labiales y la bodega tiene {stock_en_base('Labial Mate Rojo')}")

    # Cancelar V-0001 desde el Historial.
    problema = abrir_historial(page, "Ventas")
    if problema:
        return fallas + [problema]
    fila = visible(page, "main button", "Ana Prueba")
    if fila is None:
        return fallas + ["la venta de Ana no está en el Historial"]
    fila.click()
    page.wait_for_timeout(800)
    cancelar = en_hoja(page, "button", "Cancelar esta venta")
    if cancelar is None:
        return fallas + ["el detalle no ofrece cancelar la venta"]
    cancelar.click()
    page.wait_for_timeout(300)
    confirmar = en_hoja(page, "button", "Sí, cancelar la venta")
    if confirmar is None:
        return fallas + ["cancelar no pide confirmación"]
    confirmar.click()
    page.wait_for_timeout(2500)

    despues = stock_en_catalogo(page, "Labial Mate Rojo")
    esperado = stock_en_base("Labial Mate Rojo")
    if esperado != (antes or 0) + sum(l["cantidad"] for l in venta["lineas"]):
        fallas.append(f"cancelar no devolvió los labiales a la bodega: quedan {esperado}")
    if despues != esperado:
        fallas.append(f"después de cancelar, el Catálogo muestra {despues} labiales y la bodega tiene {esperado}")

    ir_a(page, "Cobros")
    if visible(page, "button", "Ana Prueba") is not None and venta["saldo_usd_cents"] > 0:
        otras = [v for v in listar_coleccion("ventas") if v.get("cliente_id") == venta.get("cliente_id")
                 and v.get("estado") != "CANCELADA" and v.get("saldo_usd_cents", 0) > 0]
        if not otras:
            fallas.append("Ana sigue en Cobros después de cancelar su única venta con saldo")
    return fallas


@caso("COL-01 y COL-02 · ningún texto queda con el color base sobre su tinte, en claro ni en oscuro")
def caso_tintes(page: Page) -> list[str]:
    """
    Los avisos de deuda vencida y de stock agotado son lo que más importa leer
    y eran lo menos legible: peligro sobre su tinte da 3,93:1 en claro.
    """
    return textos_ilegibles_sobre_tinte(
        page, ["Inicio", "Vender", "Cobros", "Historial", "Catálogo"], ir_a
    )


@caso("CVE-01 · 'Cobrar' del carrito se lee en claro y en oscuro")
def caso_cobrar_se_lee(page: Page) -> list[str]:
    """
    Es el botón principal de la venta y tenía el texto del color de la página
    sobre el verde: 1,68:1 en oscuro. Se mide, no se mira.
    """
    fallas = []
    problema = poner_en_el_carrito(page, "Perfume Carolina Herrera")
    if problema:
        return [problema]
    boton = visible(page, "span:text-is('Cobrar')").locator("xpath=..")
    raiz = "document.documentElement.classList"
    estaba_oscuro = page.evaluate(f"() => {raiz}.contains('dark')")
    try:
        for tema, oscuro in (("claro", False), ("oscuro", True)):
            page.evaluate(f"(o) => {raiz}.toggle('dark', o)", oscuro)
            page.wait_for_timeout(500)
            contraste = boton.evaluate(JS_CONTRASTE)
            if contraste < 4.5:
                fallas.append(f"en {tema} 'Cobrar' no se lee: contraste {contraste:.2f}:1")
    finally:
        page.evaluate(f"(o) => {raiz}.toggle('dark', o)", estaba_oscuro)
        page.wait_for_timeout(300)
    return fallas


@caso("CVE-02 · la venta registrada muestra el mismo código que queda guardado")
def caso_codigo_de_la_venta(page: Page) -> list[str]:
    """
    La pantalla de éxito armaba el código a mano ("V-2") y el sistema guarda
    "V-0002": el comprobante que se manda por WhatsApp no existía.
    """
    fallas = []
    problema = poner_en_el_carrito(page, "Perfume Carolina Herrera")
    if problema:
        return [problema]
    antes = {v.get("codigo") for v in listar_coleccion("ventas")}

    visible(page, "span:text-is('Cobrar')").click()
    page.wait_for_timeout(900)
    registrar = en_hoja(page, "button", "Registrar venta")
    if registrar is None:
        return ["el carrito no ofrece 'Registrar venta'"]
    registrar.click()
    page.wait_for_selector("text=Venta registrada", timeout=15000)
    page.wait_for_timeout(500)

    try:
        nuevos = [v.get("codigo") for v in listar_coleccion("ventas") if v.get("codigo") not in antes]
        if len(nuevos) != 1:
            return [f"registrar la venta creó {len(nuevos)} ventas"]
        pantalla = page.locator("body").inner_text()
        mostrado = re.search(r"Comprobante #(\S+)", pantalla)
        if mostrado is None:
            fallas.append("la pantalla de venta registrada no muestra el comprobante")
        elif mostrado.group(1) != nuevos[0]:
            fallas.append(f"la pantalla dice {mostrado.group(1)!r} y la venta quedó guardada como {nuevos[0]!r}")
        recibo = visible(page, "a", "Enviar recibo a WhatsApp")
        enlace = (recibo.get_attribute("href") or "") if recibo is not None else ""
        if enlace and nuevos[0] not in enlace:
            fallas.append(f"el recibo de WhatsApp no lleva el código {nuevos[0]!r}")
    finally:
        otra = visible(page, "button", "Nueva venta rápida")
        if otra is not None:
            otra.click()
            page.wait_for_timeout(700)
    return fallas


@caso("no quedan errores de consola al recorrer la app")
def caso_consola(page: Page) -> list[str]:
    # Lo llena el registrador; se evalúa al final de la corrida.
    return []


# ---------------------------------------------------------------------------
# Corredor
# ---------------------------------------------------------------------------

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

        # `SOLO=texto` corre sólo los casos cuyo nombre lo contiene: sirve para
        # iterar sobre uno sin esperar a toda la suite.
        solo = os.environ.get("SOLO", "")
        for nombre, fn in CASOS:
            if solo and solo.lower() not in nombre.lower():
                continue
            try:
                fallas = fn(page)
            except Exception as err:
                fallas = [f"la prueba se rompió: {str(err)[:200]}"]

            if fallas:
                total_fallas += len(fallas)
                print(f"  x  {nombre}")
                for f in fallas:
                    print(f"       {f}")
            else:
                print(f"  ok {nombre}")

        # Los errores de consola valen como falla: una pantalla que revienta
        # por dentro igual se ve bien por fuera.
        # Ruido del entorno, no de la aplicación: cuando el corredor apaga el
        # servidor de desarrollo, el navegador todavía tiene peticiones en
        # vuelo y las reporta como error. Contarlas haría fallar la suite por
        # cómo termina la prueba, no por lo que hace la app.
        ENTORNO = (
            "favicon",
            "err_network_io_suspended",
            "err_connection_refused",
            "websocket connection to",
            "[vite]",
        )
        ruido = [
            e for e in errores_consola if not any(m in e.lower() for m in ENTORNO)
        ]
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
