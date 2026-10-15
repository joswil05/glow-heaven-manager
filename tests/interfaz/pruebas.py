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
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

# La consola de Windows no tiene "≈" ni otros caracteres que pueden venir en
# el mensaje de una falla: sin esto, imprimir la falla tumbaba la suite entera
# y los casos de después no corrían. `sin_conexion.py` importa este módulo y
# queda cubierto también.
for _flujo in (sys.stdout, sys.stderr):
    try:
        _flujo.reconfigure(errors="replace")
    except (AttributeError, ValueError):
        pass

from playwright.sync_api import sync_playwright, Page, expect  # noqa: E402

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
        # Una hoja que ya baja puede seguir visible durante 200 ms, pero su
        # botón se desmontará antes de que Playwright termine el click.
        botones = page.locator("[role='dialog']:not(.animate-m3-salida-hoja):not([inert]) button[aria-label='Cerrar']")
        abiertos = [botones.nth(i) for i in range(botones.count()) if botones.nth(i).is_visible()]
        if not abiertos:
            break
        # La de más arriba primero: con dos hojas apiladas (el detalle y, encima,
        # la factura) el botón de la de abajo está tapado y no se puede tocar.
        try:
            abiertos[-1].click(timeout=3000)
        except Exception:
            # Estaba bajando sola (su animación todavía no le ponía la clase
            # de salida) y el botón se desmontó en medio del toque: no queda
            # nada que cerrar acá. Pasó en tres casos distintos.
            page.wait_for_timeout(300)
            continue
        page.wait_for_timeout(300)
        # Con algo escrito, cerrar pregunta: acá se descarta.
        descartar = visible(page, "[role='alertdialog'] button", "Descartar")
        if descartar is not None:
            descartar.click()
        page.wait_for_timeout(400)
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
    for etiqueta in ["Inicio", "Vender", "Cobros", "Historial", "Inventario"]:
        if page.locator("nav button", has_text=etiqueta).count() == 0:
            fallas.append(f"falta la pestaña {etiqueta!r}")
    return fallas


@caso("el inventario muestra los productos sembrados con su stock")
def caso_catalogo(page: Page) -> list[str]:
    ir_a(page, "Inventario")
    fallas = []
    cuerpo = page.locator("body").inner_text()
    for nombre in ["Labial Mate Rojo", "Perfume Carolina Herrera"]:
        if nombre not in cuerpo:
            fallas.append(f"el inventario no muestra {nombre!r}")
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
        # Lo que diga la base, con el formato que le haya dado el repositorio
        # ("8888-0000" o "+505 8888 0000"): lo que importa es que no esté vacío.
        guardado_antes = leer_doc("parametros", "sistema").get("telefono_negocio") or ""
        if not guardado_antes or telefono.input_value() != guardado_antes:
            fallas.append(f"el teléfono guardado es {guardado_antes!r} y el campo dice {telefono.input_value()!r}")
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
            if re.sub(r"\D", "", guardado.get("telefono_negocio") or "")[-8:] != "77771111":
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


def app_sigue_abierta(page: Page) -> bool:
    return page.url.startswith(arnes.URL_APP) and page.locator("nav button", has_text="Inicio").count() > 0


def volver_a_la_app(page: Page) -> None:
    if not app_sigue_abierta(page):
        arnes.abrir_app(page)


@caso("CEL-01 · 'atrás' de Android cierra la hoja de arriba, y con algo escrito pregunta")
def caso_atras_cierra_la_hoja(page: Page) -> list[str]:
    """
    Antes la app no tocaba el historial: con una hoja abierta, "atrás" salía de
    la app o volvía a la pantalla anterior, y lo cargado se perdía.
    """
    fallas = []
    ir_a(page, "Cobros")
    fila = visible(page, "button", "Ana Prueba")
    if fila is None:
        return ["no encontré la fila de Ana en Cobros"]
    fila.click()
    page.wait_for_timeout(900)
    if page.locator("[role='dialog']").count() == 0:
        return ["tocar la fila no abrió su detalle"]

    page.go_back()
    page.wait_for_timeout(700)
    if not app_sigue_abierta(page):
        fallas.append("'atrás' con una hoja abierta salió de la app")
        volver_a_la_app(page)
        return fallas
    if page.locator("[role='dialog']").count() > 0:
        fallas.append("'atrás' no cerró la hoja")
        cerrar_hojas(page)

    # Con un abono a medio escribir, "atrás" pregunta y la hoja se queda.
    problema = abrir_hoja_de_abono(page)
    if problema:
        return fallas + [problema]
    campo = en_hoja(page, "input[inputmode='decimal']")
    campo.fill("150")
    page.go_back()
    page.wait_for_timeout(700)
    if not app_sigue_abierta(page):
        volver_a_la_app(page)
        return fallas + ["'atrás' con un abono escrito salió de la app"]
    pregunta = visible(page, "[role='alertdialog']")
    if pregunta is None:
        fallas.append("'atrás' con un abono escrito no preguntó antes de descartarlo")
    else:
        visible(page, "[role='alertdialog'] button", "Seguir editando").click()
        page.wait_for_timeout(300)
        campo = en_hoja(page, "input[inputmode='decimal']")
        if campo is None or campo.input_value() != "150":
            fallas.append("después de 'Seguir editando' se perdió el monto")
    cerrar_hojas(page)
    return fallas


@caso("CEL-02, CEL-06 y CEL-08 · la hoja pregunta antes de descartar, sale animada y se nombra por su título")
def caso_hoja_con_cambios(page: Page) -> list[str]:
    fallas = []
    volver_a_la_app(page)
    problema = abrir_hoja_de_abono(page)
    if problema:
        return [problema]
    hoja = page.locator("[role='dialog']").last
    if not hoja.get_attribute("aria-labelledby"):
        fallas.append("la hoja no se nombra por su título (aria-labelledby)")
    campo = en_hoja(page, "input[inputmode='decimal']")
    campo.fill("150")
    # Tocar el velo, arriba de la hoja.
    page.mouse.click(195, 40)
    page.wait_for_timeout(400)
    pregunta = visible(page, "[role='alertdialog']")
    if pregunta is None:
        fallas.append("con un abono escrito, tocar afuera cerró la hoja sin preguntar")
        return fallas
    visible(page, "[role='alertdialog'] button", "Descartar").click()
    salio = page.evaluate("""() => new Promise((listo) => requestAnimationFrame(() => requestAnimationFrame(() =>
      listo(document.querySelector('.animate-m3-salida-hoja') !== null))))""")
    if not salio:
        fallas.append("al cerrarse, la hoja desaparece de golpe en vez de bajar")
    page.wait_for_timeout(500)
    if page.locator("[role='dialog']").count() > 0:
        fallas.append("'Descartar' no cerró la hoja")
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


def href_decodificado(loc) -> str:
    from urllib.parse import unquote
    return unquote(loc.get_attribute("href") or "") if loc is not None else ""


@caso("TRA-03 · los WhatsApp del celular salen del mismo módulo: recordatorio, recibo y estado de cuenta")
def caso_whatsapp_movil(page: Page) -> list[str]:
    """
    Cada hoja armaba su mensaje a mano, mezclando "tú" y "vos" ("¿Cuándo
    podés completar el pago?"), con la tasa de hoy y sin la plantilla de
    Configuración (CCO-05, TRA-03).
    """
    fallas = []
    venta = next(v for v in listar_coleccion("ventas") if v.get("codigo") == "V-0001")
    tasa = venta["tasa_cambio_cents"]

    # El recordatorio del detalle de la deuda.
    ir_a(page, "Cobros")
    fila = visible(page, "button", "Ana Prueba")
    if fila is None:
        return ["no encontré la fila de Ana en Cobros"]
    fila.click()
    page.wait_for_timeout(900)
    enlace = en_hoja(page, "a", "WhatsApp")
    texto = href_decodificado(enlace)
    if "te saludamos de Glow Heaven" not in texto:
        fallas.append(f"el recordatorio del detalle no sale de la plantilla de cobro ({texto[30:90]!r})")
    if "podés" in texto:
        fallas.append("el recordatorio del detalle le habla de vos a la clienta")
    saldo_cs = f"C${round(venta['saldo_usd_cents'] * tasa / 100) / 100:,.2f}"
    if saldo_cs not in texto:
        fallas.append(f"el recordatorio no dice {saldo_cs}, con la tasa de la venta")
    cerrar_hojas(page)

    # El recibo de un abono de $5.
    problema = abrir_hoja_de_abono(page)
    if problema:
        return fallas + [problema]
    dolares = en_hoja(page, "button", "Dólares")
    if dolares is not None:
        dolares.click()
        page.wait_for_timeout(200)
    en_hoja(page, "input[inputmode='decimal']").fill("5")
    en_hoja(page, "button", "Registrar abono").click()
    page.wait_for_timeout(2500)
    recibo = en_hoja(page, "a", "recibo")
    texto = href_decodificado(recibo)
    if not texto:
        fallas.append("después de registrar el abono no hay recibo para mandar")
    elif "Recibimos tu abono de $5.00" not in texto or "(≈ C$" not in texto:
        fallas.append(f"el recibo del abono no es el del módulo ({texto[30:110]!r})")
    cerrar_hojas(page)
    listo = visible(page, "button", "Listo")
    if listo is not None:
        listo.click()
        page.wait_for_timeout(400)
    return fallas


@caso("CCA-01 · compartir un producto dice qué tallas o tonos hay, sin cuántas unidades")
def caso_compartir_producto(page: Page) -> list[str]:
    fallas = []
    ir_a(page, "Inventario")
    page.evaluate("""() => {
      window.__abiertos = [];
      window.open = (u) => { window.__abiertos.push(String(u)); return null; };
    }""")
    ficha = visible(page, "main button", "Labial Mate Rojo")
    if ficha is None:
        return ["el inventario no deja abrir la ficha del labial"]
    ficha.click()
    page.wait_for_timeout(900)
    compartir = en_hoja(page, "button", "Compartir")
    if compartir is None:
        cerrar_hojas(page)
        return ["la ficha no ofrece compartir por WhatsApp"]
    compartir.click()
    page.wait_for_timeout(300)
    from urllib.parse import unquote
    abiertos = page.evaluate("window.__abiertos")
    texto = unquote(abiertos[-1]) if abiertos else ""
    if "disp." in texto or "unidades" in texto:
        fallas.append("el mensaje para la clienta dice cuántas unidades quedan")
    if "—" in texto:
        fallas.append("el mensaje lleva una raya larga")
    if "Contáctanos" in texto and "Escríbenos" not in texto and "Tallas o tonos" not in texto:
        fallas.append("el mensaje no es el del módulo")
    cerrar_hojas(page)
    return fallas


def poner_parametros(campos: dict) -> None:
    """Cambia campos de texto de los parámetros en el emulador, como Ajustes."""
    mascara = "&".join(f"updateMask.fieldPaths={k}" for k in campos)
    url = (
        f"http://{arnes.HOST_FIRESTORE}/v1/projects/{arnes.PROYECTO}"
        f"/databases/(default)/documents/parametros/sistema?{mascara}"
    )
    cuerpo = {"fields": {k: {"stringValue": v} for k, v in campos.items()}}
    arnes._peticion(url, metodo="PATCH", cuerpo=cuerpo, cabeceras={"Authorization": "Bearer owner"})


def abrir_la_app_de_nuevo(page: Page) -> None:
    """Vuelve a leer los parámetros: la app los lee al abrir."""
    page.reload()
    page.wait_for_timeout(3000)


def pagos_activos(venta_id: int) -> int:
    return sum(1 for p in listar_coleccion("pagos") if p.get("venta_id") == venta_id and p.get("activo") is not False)


@caso("CCO-02 a CCO-04 · la hoja de abono arranca con la moneda de Configuración, dice cómo queda, y confirma una vez")
def caso_hoja_de_abono(page: Page) -> list[str]:
    """
    La hoja arrancaba en córdobas y efectivo aunque Configuración dijera otra
    cosa; no tenía fecha, ni equivalencia, ni "cómo queda"; cambiar la moneda
    después de "Pagar todo" no convertía el número; los errores iban en un
    aviso que se iba, y al registrar había dos confirmaciones y ningún
    Deshacer (CEL-03).
    """
    fallas = []
    antes = leer_doc("parametros", "sistema")
    poner_parametros({"moneda_defecto_venta": "USD", "metodo_pago_defecto": "TRANSFERENCIA"})
    abrir_la_app_de_nuevo(page)
    venta = next(v for v in listar_coleccion("ventas") if v.get("codigo") == "V-0001")
    try:
        problema = abrir_hoja_de_abono(page)
        if problema:
            return [problema]
        hoja = page.locator("[role='dialog']").last
        dolares = hoja.get_by_role("radio", name=re.compile("Dólares"))
        if dolares.count() == 0 or dolares.get_attribute("aria-checked") != "true":
            fallas.append("no arranca en dólares, la moneda de Configuración")
        if hoja.get_by_label("Cómo pagó").input_value() != "TRANSFERENCIA":
            fallas.append("no arranca con transferencia, el método de Configuración")
        if hoja.locator("input[type='date']").count() == 0:
            fallas.append("no tiene fecha")

        # "Pagar todo" en dólares y después córdobas: el número se convierte.
        campo = en_hoja(page, "input[inputmode='decimal']")
        en_hoja(page, "button", "Pagar todo").click()
        page.wait_for_timeout(200)
        saldo = venta["saldo_usd_cents"]
        hoja.get_by_role("radio", name=re.compile("Córdobas")).click()
        page.wait_for_timeout(200)
        esperado = f"{round(saldo * venta['tasa_cambio_cents'] / 100) / 100:.2f}"
        if campo.input_value() != esperado:
            fallas.append(f"después de 'Pagar todo', pasar a córdobas deja {campo.input_value()!r}, no {esperado}")

        # Vacío: el error en el campo, no en un aviso flotante.
        campo.fill("")
        en_hoja(page, "button", "Registrar abono").click()
        page.wait_for_timeout(400)
        if "Escribí cuánto pagó" not in hoja.inner_text():
            fallas.append("sin monto, el error no aparece en la hoja")

        hoja.get_by_role("radio", name=re.compile("Dólares")).click()
        campo.fill("5")
        page.wait_for_timeout(300)
        texto = hoja.inner_text()
        if "son C$" not in texto:
            fallas.append("no dice la equivalencia del abono")
        if "va a deber" not in texto:
            fallas.append("no dice cómo queda la venta")

        cuantos = pagos_activos(venta["id"])
        en_hoja(page, "button", "Registrar abono").click()
        page.wait_for_timeout(2500)
        if "registrado con éxito" in page.locator("body").inner_text():
            fallas.append("además de la pantalla de éxito, sale un aviso que dice lo mismo")
        if pagos_activos(venta["id"]) != cuantos + 1:
            fallas.append("el abono no se registró")
        deshacer = en_hoja(page, "button", "Deshacer el abono")
        if deshacer is None:
            fallas.append("después de registrar no se puede deshacer")
        else:
            deshacer.click()
            page.wait_for_timeout(2500)
            if pagos_activos(venta["id"]) != cuantos:
                fallas.append("'Deshacer el abono' no lo deshizo")
    finally:
        cerrar_hojas(page)
        poner_parametros({
            "moneda_defecto_venta": antes.get("moneda_defecto_venta") or "NIO",
            "metodo_pago_defecto": antes.get("metodo_pago_defecto") or "EFECTIVO",
        })
        abrir_la_app_de_nuevo(page)
    return fallas


@caso("CCO-06 y CCO-07 · los abonos de una venta son de esa venta, y anular pregunta antes de abrir otra hoja")
def caso_anular_y_preguntar(page: Page) -> list[str]:
    fallas = []
    venta = next(v for v in listar_coleccion("ventas") if v.get("codigo") == "V-0001")
    # Un abono de $1 para anular, aunque los casos de antes no hayan corrido.
    problema = abrir_hoja_de_abono(page)
    if problema:
        return [problema]
    en_hoja(page, "[role='radio']", "Dólares").click()
    en_hoja(page, "input[inputmode='decimal']").fill("1")
    en_hoja(page, "button", "Registrar abono").click()
    page.wait_for_timeout(2500)
    cerrar_hojas(page)

    ir_a(page, "Cobros")
    fila = visible(page, "button", "Ana Prueba")
    if fila is None:
        return ["no encontré la fila de Ana en Cobros"]
    fila.click()
    page.wait_for_timeout(900)
    historial = en_hoja(page, "button", "Historial")
    if historial is None:
        cerrar_hojas(page)
        return ["el detalle de la deuda no ofrece ver sus abonos"]
    historial.click()
    page.wait_for_timeout(1500)
    hoja = page.locator("[role='dialog']").last
    texto = hoja.inner_text()
    if "abonado a v-0001" not in texto.lower():
        fallas.append("la tarjeta no dice que lo abonado es de V-0001")

    cuantos = pagos_activos(venta["id"])
    anular = hoja.get_by_role("button", name=re.compile("^Anular el abono")).first
    if anular.count() == 0:
        cerrar_hojas(page)
        return fallas + ["V-0001 no tiene abonos para anular"]
    anular.click()
    page.wait_for_timeout(400)
    hoja.get_by_role("radio", name=re.compile("La plata se devolvió")).click()
    hoja.get_by_role("button", name="Sí, anular el abono").click()
    page.wait_for_timeout(2500)
    if pagos_activos(venta["id"]) != cuantos - 1:
        fallas.append("el abono no se anuló")
    titulo = page.locator("[role='dialog']").last.inner_text()
    if "Cuánto pagó" in titulo:
        fallas.append("después de anular se abrió sola la hoja de 'Registrar abono'")
    if "¿Cargar el abono correcto?" not in titulo:
        fallas.append("después de anular no pregunta si cargar el abono correcto")
    deshacer = visible(page, "button", "Deshacer")
    if deshacer is None:
        fallas.append("después de anular no ofrece Deshacer")
    else:
        deshacer.click()
        page.wait_for_timeout(2500)
        if pagos_activos(venta["id"]) != cuantos:
            fallas.append("Deshacer no devolvió el abono anulado")
    cerrar_hojas(page)
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
    """Las unidades que el Inventario muestra para un producto ("17 disp.")."""
    import re
    ir_a(page, "Inventario")
    m = re.search(re.escape(nombre) + r"[\s\S]{0,300}?(\d+) en bodega", page.locator("body").inner_text())
    return int(m.group(1)) if m else None


def stock_en_base(nombre: str) -> int:
    p = next(x for x in listar_coleccion("productos") if x.get("nombre") == nombre)
    return sum(v.get("existencias", 0) for v in p.get("variantes", []) if v.get("activo", True))


@caso("lo que se corrige o se cancela en el Historial se ve en Cobros y en el Inventario")
def caso_reacciona(page: Page) -> list[str]:
    """
    Fase de pruebas de la 2.16.1: editar o anular algo tiene que verse en las
    otras pantallas sin recargar la app. Cancelar una venta desde el Historial
    devolvía las unidades a la bodega, pero el Inventario seguía mostrando el
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
        fallas.append(f"el Inventario muestra {antes} labiales y la bodega tiene {stock_en_base('Labial Mate Rojo')}")

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
    # Desde "Fue un error" (30/9) primero se pregunta qué pasó.
    se_devolvio = en_hoja(page, "[role='radio']", "Se devolvió o se reembolsó")
    if se_devolvio is None:
        return fallas + ["cancelar no pregunta qué pasó"]
    se_devolvio.click()
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
        fallas.append(f"después de cancelar, el Inventario muestra {despues} labiales y la bodega tiene {esperado}")

    ir_a(page, "Cobros")
    if visible(page, "button", "Ana Prueba") is not None and venta["saldo_usd_cents"] > 0:
        otras = [v for v in listar_coleccion("ventas") if v.get("cliente_id") == venta.get("cliente_id")
                 and v.get("estado") != "CANCELADA" and v.get("saldo_usd_cents", 0) > 0]
        if not otras:
            fallas.append("Ana sigue en Cobros después de cancelar su única venta con saldo")
    return fallas


@caso("Fue un error · una venta cancelada que fue un error se borra del Historial sin dejar rastro")
def caso_fue_un_error(page: Page) -> list[str]:
    """
    Joswill, 30/9: lo que se cargó por error no tiene que quedar a la vista.
    La venta de Ana quedó cancelada en el caso anterior; borrarla se lleva la
    venta, sus abonos y sus movimientos (`docs/PLAN_EQUIVOCACIONES_Y_FORMATOS.md`).
    """
    fallas = []
    venta = next((v for v in listar_coleccion("ventas") if v.get("codigo") == "V-0001"), None)
    if venta is None or venta.get("estado") != "CANCELADA":
        return ["el caso anterior no dejó V-0001 cancelada"]

    problema = abrir_historial(page, "Ventas")
    if problema:
        return [problema]
    fila = visible(page, "main button", "Ana Prueba")
    if fila is None:
        return ["la venta cancelada de Ana no está en el Historial"]
    fila.click()
    page.wait_for_timeout(800)
    borrar = en_hoja(page, "button", "Fue un error: borrarla")
    if borrar is None:
        return ["el detalle de una venta cancelada no ofrece borrarla"]
    borrar.click()
    page.wait_for_timeout(300)

    # Cancelarla otra vez no se puede: la opción dice por qué.
    otra_vez = en_hoja(page, "[role='radio']", "Se devolvió o se reembolsó")
    if otra_vez is None or otra_vez.get_attribute("aria-disabled") != "true":
        fallas.append("una venta ya cancelada ofrece cancelarla otra vez")
    error = en_hoja(page, "[role='radio']", "Fue un error al cargarla")
    if error is None:
        return fallas + ["no se ofrece 'Fue un error'"]
    error.click()
    confirmar = en_hoja(page, "button", "Sí, borrarla")
    if confirmar is None:
        return fallas + ["no hay con qué confirmar el borrado"]
    confirmar.click()
    page.wait_for_timeout(2500)

    if any(v.get("id") == venta["id"] for v in listar_coleccion("ventas")):
        fallas.append("la venta sigue en la base")
    if any(p.get("venta_id") == venta["id"] for p in listar_coleccion("pagos")):
        fallas.append("sus abonos siguen en la base")
    if any(
        m.get("referencia_tipo") == "VENTA" and m.get("referencia_id") == venta["id"]
        for m in listar_coleccion("movimientos_inventario")
    ):
        fallas.append("sus movimientos de inventario siguen en la base")
    if visible(page, "main button", "Ana Prueba") is not None:
        fallas.append("la venta sigue a la vista en el Historial")
    return fallas


@caso("COL-01 y COL-02 · ningún texto queda con el color base sobre su tinte, en claro ni en oscuro")
def caso_tintes(page: Page) -> list[str]:
    """
    Los avisos de deuda vencida y de stock agotado son lo que más importa leer
    y eran lo menos legible: peligro sobre su tinte da 3,93:1 en claro.
    """
    return textos_ilegibles_sobre_tinte(
        page, ["Inicio", "Vender", "Cobros", "Historial", "Inventario"], ir_a
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


def pantalla(page: Page) -> str:
    """El texto de la pantalla que se ve: las cinco vistas están montadas a la vez."""
    m = visible(page, "main")
    return m.inner_text() if m is not None else ""


@caso("C1 · Inicio del celular dice cómo va cada paquete, sin 'Stock crítico'")
def caso_c1_inicio_celular(page: Page) -> list[str]:
    fallas = []
    ir_a(page, "Inicio")
    texto = pantalla(page)
    if re.search(r"stock cr[ií]tico|agotad", texto, re.I):
        fallas.append("Inicio sigue mostrando stock crítico o agotados")
    if not re.search(r"1 de 3 vendid", texto):
        fallas.append("no dice cuántas se vendieron del paquete en venta")
    if "se vendió todo" not in texto.lower():
        fallas.append("no muestra el resumen del paquete que se vendió todo")
    listo = visible(page, "button", "Listo")
    if listo is None:
        fallas.append("el resumen no se puede cerrar")
    else:
        listo.click()
        page.wait_for_timeout(1200)
        if "se vendió todo" in pantalla(page).lower():
            fallas.append("'Listo' no cierra el resumen")
    return fallas


@caso("ENT-1 · la entrada dice qué hacer y tiene el botón de Google, sin folleto")
def caso_ent1_entrada(page: Page) -> list[str]:
    fallas = []
    # Un contexto nuevo no tiene sesión: abre en la entrada.
    contexto = page.context.browser.new_context(
        viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, bypass_csp=True
    )
    try:
        entrada = contexto.new_page()
        entrada.goto(arnes.URL_APP)
        expect(entrada.get_by_role("button", name="Continuar con Google")).to_be_visible(timeout=20000)
        expect(entrada.get_by_role("heading", name="Entrá con tu cuenta de Glow Heaven")).to_be_visible()
        texto = entrada.locator("body").text_content() or ""
        for viejo in ["Punto de Venta Móvil", "Gestión en vivo", "cuenta autorizada"]:
            if viejo in texto:
                fallas.append(f"la entrada todavía dice {viejo!r}")
    finally:
        contexto.close()
    return fallas


@caso("INI-1 · Inicio va en el orden de Ross, sin gráfica ni botón de recargar")
def caso_ini1_orden(page: Page) -> list[str]:
    fallas = []
    ir_a(page, "Inicio")
    principal = page.locator("main:visible").last
    te_deben = page.get_by_role("region", name=re.compile("^Te deben"))
    # Quién debe depende de lo que pagaron los casos de antes: se toma la
    # primera clienta que aparezca, no una fija.
    filas = te_deben.locator(".m3-card button")
    expect(filas.first).to_be_visible(timeout=15000)
    nombre = (filas.first.locator("span.truncate").first.text_content() or "").strip()
    texto = principal.text_content() or ""
    orden = ["Ventas de hoy", "Vender", "Abono", "Pedido", "Paquete", "Te deben", "Encargos", "Paquetes", "Lo último"]
    posiciones = [texto.find(t) for t in orden]
    for t, pos in zip(orden, posiciones):
        if pos < 0:
            fallas.append(f"Inicio no muestra {t!r}")
    if all(p >= 0 for p in posiciones) and posiciones != sorted(posiciones):
        fallas.append(f"Inicio no va en el orden aprobado: {[t for _, t in sorted(zip(posiciones, orden))]}")
    if "Últimos 7 días" not in texto:
        fallas.append("falta la línea de los últimos 7 días")
    for viejo in ["Ventas últimos 7 días", "Ver cobros", "unid. disponibles"]:
        if viejo in texto:
            fallas.append(f"Inicio todavía muestra {viejo!r}")
    if page.get_by_role("button", name="Actualizar datos").count():
        fallas.append("sigue el botón de recargar")
    lo_ultimo = page.get_by_role("region", name="Lo último")
    if not re.search(r"Venta|Abono", lo_ultimo.text_content() or ""):
        fallas.append("'Lo último' no muestra ventas ni abonos")

    # Tocar a una clienta de "Te deben" abre Cobros buscándola.
    filas.first.click()
    page.wait_for_timeout(1200)
    campo = visible(page, "input[placeholder='Buscar clienta, venta o teléfono']")
    if campo is None:
        fallas.append("tocar a la clienta no abrió Cobros")
    else:
        if campo.input_value() != nombre:
            fallas.append(f"Cobros no la busca: el campo dice {campo.input_value()!r}")
        campo.fill("")

    # "Lo último" lleva al Historial.
    ir_a(page, "Inicio")
    page.get_by_role("region", name="Lo último").get_by_role("button").first.click()
    page.wait_for_timeout(1000)
    if page.locator("nav button[aria-current='page']", has_text="Historial").count() == 0:
        fallas.append("tocar 'Lo último' no lleva al Historial")
    return fallas


@caso("INI-1 · las acciones rápidas de Inicio venden, abonan, anotan un pedido y abren el paquete")
def caso_ini1_acciones(page: Page) -> list[str]:
    fallas = []
    ir_a(page, "Inicio")
    acciones = page.get_by_role("region", name="Acciones rápidas")

    acciones.get_by_role("button", name="Abono", exact=True).click()
    expect(page.get_by_role("dialog").last).to_contain_text("Elegí la clienta", timeout=10000)
    cerrar_hojas(page)

    acciones.get_by_role("button", name="Pedido", exact=True).click()
    pedido = page.get_by_role("dialog", name="Anotar un pedido", exact=True)
    expect(pedido).to_be_visible(timeout=10000)
    pedido.get_by_role("button", name="Cerrar", exact=True).click()
    expect(pedido).not_to_be_visible()
    page.locator("main:visible").last.get_by_role("button", name=re.compile("^Volver")).click()
    expect(acciones).to_be_visible()

    acciones.get_by_role("button", name="Paquete", exact=True).click()
    volver = page.get_by_role("button", name="Volver a Inicio", exact=True)
    expect(volver).to_be_visible(timeout=10000)
    volver.click()
    expect(acciones).to_be_visible()

    acciones.get_by_role("button", name="Vender", exact=True).click()
    page.wait_for_timeout(800)
    if page.locator("nav button[aria-current='page']", has_text="Vender").count() == 0:
        fallas.append("'Vender' no lleva a Vender")
    ir_a(page, "Inicio")
    return fallas


@caso("C1 · el Inventario del celular abre con lo que hay a la venta")
def caso_c1_inventario_celular(page: Page) -> list[str]:
    fallas = []
    ir_a(page, "Inventario")
    texto = pantalla(page)
    if "Termo Prueba" in texto:
        fallas.append("abre mostrando un producto sin unidades")
    if "Gloss Prueba" not in texto:
        fallas.append("no muestra lo que sí hay")
    return fallas


@caso("C1 · 'Llegó un paquete' registra la mercadería desde el celular")
def caso_c1_llego_un_paquete(page: Page) -> list[str]:
    fallas = []
    antes = len([c for c in listar_coleccion("compras") if c.get("estado") == "RECIBIDA"])
    ir_a(page, "Inventario")
    boton = visible(page, "button", "Llegó un paquete")
    if boton is None:
        return ["el Inventario no ofrece 'Llegó un paquete'"]
    boton.click()
    page.wait_for_timeout(800)
    # Desde el 11/10 se escriben las libras: el flete sale de la tarifa de
    # Configuración ($7.00 la libra en el decorado) y el impuesto es siempre
    # el 7%, sin campo para el del recibo.
    pantalla_visible = page.locator("main:visible").last
    expect(pantalla_visible.get_by_label("Impuesto del recibo ($)")).to_have_count(0)
    campo_de(page, "Peso de la caja (lb)").fill("2")
    expect(pantalla_visible).to_contain_text("Flete: $14.00, a $7.00 la libra.")
    visible(page, "button", "Seguir").click()
    # Seguir guarda el borrador antes de abrir el siguiente paso.
    page.get_by_role("button", name="Agregar pieza", exact=True).click()
    page.wait_for_timeout(500)
    en_hoja(page, "input[aria-label='Producto']").fill("Cartera Llegada")
    en_hoja(page, "button", "Nuevo: Cartera Llegada").click()
    en_hoja(page, "input[aria-label='Cantidad']").fill("2")
    en_hoja(page, "input[aria-label='Pagó por unidad ($)']").fill("15")
    en_hoja(page, "button", "Agregar").click()
    cerrar_hojas(page)
    # El diseño pide poder interrumpir y seguir: no alcanza con estado React.
    borrador = next((c for c in listar_coleccion("compras") if c.get("estado") == "BORRADOR"
                     and any(l.get("descripcion") == "Cartera Llegada" for l in c.get("lineas", []))), None)
    if borrador is None:
        return ["la pieza no quedó guardada en un borrador antes de recibir"]
    if any(p.get("nombre") == "Cartera Llegada" for p in listar_coleccion("productos")):
        fallas.append("el borrador creó mercadería antes de recibirla")
    page.reload()
    page.wait_for_timeout(2000)
    ir_a(page, "Inventario")
    visible(page, "button", "Llegó un paquete").click()
    page.wait_for_timeout(1000)
    visible(page, "button", f"Continuar {borrador['codigo']}").click()
    page.wait_for_timeout(800)
    visible(page, "button", "Seguir").click()
    page.wait_for_timeout(1500)
    # Las vistas permanecen montadas: usar la pantalla visible (relevo de T3).
    if "Cartera Llegada" not in pantalla(page):
        fallas.append("el paso de revisar no lista la pieza")
    visible(page, "button", "Recibir").click()
    # Recibir pregunta antes, con lo que entra (como "Pasar al inventario" en la PC).
    confirmacion = page.get_by_role("dialog", name="¿Pasar el paquete al inventario?", exact=True)
    expect(confirmacion).to_contain_text("Entran 2 unidades de 1 producto")
    confirmacion.get_by_role("button", name="Sí, pasarlo al inventario", exact=True).click()
    page.wait_for_timeout(3000)
    recibidas = [c for c in listar_coleccion("compras") if c.get("estado") == "RECIBIDA"]
    if len(recibidas) != antes + 1:
        fallas.append("el paquete no quedó recibido")
    recibido = next((c for c in recibidas if c.get("id") == borrador["id"]), None)
    if recibido is not None:
        if recibido.get("envio_total_usd_cents") != 1400 or recibido.get("peso_total_mlb") != 2000:
            fallas.append(f"flete y peso guardados: {recibido.get('envio_total_usd_cents')} y {recibido.get('peso_total_mlb')}, no 1400 y 2000")
        if recibido.get("tax_total_override_usd_cents") is not None:
            fallas.append("el paquete guardó un impuesto de recibo en vez del 7%")
    producto = next((p for p in listar_coleccion("productos") if p.get("nombre") == "Cartera Llegada"), None)
    if producto is None:
        fallas.append("el producto nuevo no se creó")
    elif sum(v.get("existencias", 0) for v in producto.get("variantes", [])) != 2:
        fallas.append("las dos piezas no entraron al inventario")
    if visible(page, "button", "Listo") is not None:
        visible(page, "button", "Listo").click()
    # La recepción vuelve a Inventario sin reload: el paquete que se acaba de
    # recibir debe estar disponible en el selector que ya estaba montado.
    filtro = page.get_by_role("combobox", name="Filtrar inventario", exact=True)
    expect(filtro).to_be_visible()
    opcion = filtro.locator(f"option[value='paquete:{borrador['id']}']")
    expect(opcion).to_have_text(borrador["codigo"])
    filtro.select_option(f"paquete:{borrador['id']}")
    expect(page.locator("main:visible")).to_contain_text("Cartera Llegada")
    filtro.select_option("todos")
    return fallas


@caso("C1 · paquete valida en su campo y pregunta antes de descartar o quitar")
def caso_c1_paquete_validacion(page: Page) -> list[str]:
    ir_a(page, "Inventario")
    page.get_by_role("button", name="Llegó un paquete", exact=True).click()
    page.get_by_role("button", name="Seguir", exact=True).click()
    peso = page.get_by_label("Peso de la caja (lb)", exact=True)
    expect(peso).to_have_attribute("aria-invalid", "true")
    expect(peso).to_be_focused()
    peso.fill("1,5")
    expect(peso).to_have_attribute("aria-invalid", "false")
    expect(page.locator("main:visible").last).to_contain_text("Flete: $10.50, a $7.00 la libra.")
    page.get_by_role("button", name="Seguir", exact=True).click()
    page.get_by_role("button", name="Agregar pieza", exact=True).click()
    hoja = page.get_by_role("dialog").last
    hoja.get_by_label("Producto", exact=True).fill("Labial Mate Rojo")
    # La sugerencia también dice cuántas hay en bodega, como la PC.
    hoja.get_by_role("button", name=re.compile(r"^Labial Mate Rojo")).click()
    hoja.get_by_label("Pagó por unidad ($)", exact=True).fill("15")
    cantidad = hoja.get_by_label("Cantidad", exact=True)
    cantidad.fill("0")
    hoja.get_by_role("button", name="Agregar", exact=True).click()
    expect(cantidad).to_have_attribute("aria-invalid", "true")
    expect(cantidad).to_be_focused()
    cantidad.fill("2")
    expect(cantidad).to_have_attribute("aria-invalid", "false")
    hoja.get_by_role("button", name="Cerrar", exact=True).click()
    page.get_by_role("alertdialog").get_by_role("button", name="Seguir editando").click()
    expect(cantidad).to_have_value("2")
    hoja.get_by_role("button", name="Agregar", exact=True).click()
    expect(hoja.get_by_label("Producto", exact=True)).to_have_value("")
    hoja.get_by_role("button", name="Cerrar", exact=True).click()
    page.get_by_role("button", name="Quitar Labial Mate Rojo", exact=True).click()
    page.get_by_role("button", name="Conservar", exact=True).click()
    page.get_by_role("button", name="Quitar Labial Mate Rojo", exact=True).click()
    page.get_by_role("dialog").last.get_by_role("button", name="Quitar", exact=True).click()
    expect(page.get_by_role("button", name="Quitar Labial Mate Rojo", exact=True)).to_have_count(0)
    codigo = page.locator("header:visible").inner_text().splitlines()[0]
    guardado = next((c for c in listar_coleccion("compras") if c.get("codigo") == codigo), None)
    fallas = [] if guardado and not guardado.get("lineas") else ["quitar la pieza no actualizó el borrador"]
    page.get_by_role("button", name="Volver al inventario", exact=True).click()
    return fallas


@caso("C1 · el paquete del celular hace lo de la PC: tallas, pack, sin impuesto, otros gastos y editar")
def caso_c1_paquete_como_la_pc(page: Page) -> list[str]:
    fallas = []
    ir_a(page, "Inventario")
    page.get_by_role("button", name="Llegó un paquete", exact=True).click()
    principal = page.locator("main:visible").last
    page.get_by_label("Peso de la caja (lb)", exact=True).fill("3")
    # Otros gastos se usan de vez en cuando: plegados, como en la PC.
    page.get_by_role("button", name="Otros gastos (aduana, reempaque)", exact=True).click()
    page.get_by_label("Otros gastos ($)", exact=True).fill("2")
    page.get_by_role("button", name="Seguir", exact=True).click()
    page.get_by_role("button", name="Agregar pieza", exact=True).click()
    hoja = page.get_by_role("dialog", name="Agregar pieza", exact=True)
    # Un producto nuevo con tallas: su ficha se crea al agregarlo, como en la PC,
    # y cada talla que vino es una línea.
    hoja.get_by_label("Producto", exact=True).fill("Blusa Paquete C1")
    hoja.get_by_role("button", name="Nuevo: Blusa Paquete C1", exact=True).click()
    hoja.get_by_label("Tiene tallas o tonos", exact=True).check()
    hoja.get_by_label("Talla 1", exact=True).fill("S")
    hoja.get_by_label("Cantidad de la talla 1", exact=True).fill("2")
    hoja.get_by_role("button", name="Agregar otra", exact=True).click()
    hoja.get_by_label("Talla 2", exact=True).fill("M")
    hoja.get_by_label("Cantidad de la talla 2", exact=True).fill("1")
    hoja.get_by_label("Pagó por unidad ($)", exact=True).fill("10")
    hoja.get_by_role("button", name="Agregar", exact=True).click()
    expect(hoja.get_by_role("status")).to_contain_text("Blusa Paquete C1: agregada al paquete.")
    # Un pack que la tienda no le cobró impuesto, de un producto que nace al recibir.
    hoja.get_by_label("Producto", exact=True).fill("Boxers Paquete C1")
    hoja.get_by_role("button", name="Nuevo: Boxers Paquete C1", exact=True).click()
    hoja.get_by_role("radio", name="En pack", exact=True).click()
    hoja.get_by_label("Packs", exact=True).fill("2")
    hoja.get_by_label("Unidades por pack", exact=True).fill("5")
    hoja.get_by_label("Pagó por pack ($)", exact=True).fill("20")
    hoja.get_by_label(re.compile(r"^La tienda cobró el impuesto")).uncheck()
    hoja.get_by_role("button", name="Agregar", exact=True).click()
    expect(hoja.get_by_role("status")).to_contain_text("Boxers Paquete C1: agregada al paquete.")
    hoja.get_by_role("button", name="Cerrar", exact=True).click()
    expect(hoja).not_to_be_visible()

    borrador = next((c for c in listar_coleccion("compras") if c.get("estado") == "BORRADOR"
                     and any(l.get("descripcion") == "Boxers Paquete C1" for l in c.get("lineas", []))), None)
    if borrador is None:
        return ["las piezas no quedaron guardadas en un borrador"]
    if borrador.get("otros_costos_usd_cents") != 200:
        fallas.append(f"otros gastos guardados: {borrador.get('otros_costos_usd_cents')}, no 200")
    blusa = next((p for p in listar_coleccion("productos") if p.get("nombre") == "Blusa Paquete C1"), None)
    if blusa is None:
        return fallas + ["el producto con tallas no se creó al agregarlo"]
    tallas = {v.get("talla"): v.get("id") for v in blusa.get("variantes", [])}
    lineas_blusa = sorted((l.get("variante_id"), l.get("cantidad"), l.get("precio_linea_usd_cents"))
                          for l in borrador["lineas"] if l.get("producto_id") == blusa.get("id"))
    if lineas_blusa != sorted([(tallas.get("S"), 2, 2000), (tallas.get("M"), 1, 1000)]):
        fallas.append(f"las tallas no quedaron una por línea: {lineas_blusa}")
    pack = next(l for l in borrador["lineas"] if l.get("descripcion") == "Boxers Paquete C1")
    esperado = {"cantidad": 10, "precio_linea_usd_cents": 4000, "es_multipack": True, "packs_comprados": 2,
                "unidades_por_pack": 5, "precio_por_pack_usd_cents": 2000, "exento": True, "tax_linea_usd_cents": 0}
    distinto = {k: pack.get(k) for k, v in esperado.items() if pack.get(k) != v}
    if distinto:
        fallas.append(f"el pack no se guardó como lo guarda la PC: {distinto}")
    if any(p.get("nombre") == "Boxers Paquete C1" for p in listar_coleccion("productos")):
        fallas.append("un producto nuevo con sólo el nombre se creó antes de recibir")

    # Tocar una pieza la edita, y el borrador se guarda en el momento.
    principal.locator("button").filter(has_text="Blusa Paquete C1 · M").first.click()
    editar = page.get_by_role("dialog", name="Blusa Paquete C1 · M", exact=True)
    editar.get_by_label("Pagó por unidad ($)", exact=True).fill("12")
    editar.get_by_role("button", name="Guardar cambios", exact=True).click()
    expect(editar).not_to_be_visible()
    borrador = next(c for c in listar_coleccion("compras") if c.get("id") == borrador["id"])
    talla_m = next((l for l in borrador["lineas"] if l.get("variante_id") == tallas.get("M")), {})
    if talla_m.get("precio_linea_usd_cents") != 1200:
        fallas.append(f"editar la pieza guardó {talla_m.get('precio_linea_usd_cents')}, no 1200")

    page.get_by_role("button", name="Seguir", exact=True).click()
    expect(principal).to_contain_text("Así entra a la bodega")
    expect(principal).to_contain_text("Precio de venta")
    expect(principal).to_contain_text("Otros gastos")
    page.get_by_role("button", name="Recibir", exact=True).click()
    confirmacion = page.get_by_role("dialog", name="¿Pasar el paquete al inventario?", exact=True)
    expect(confirmacion).to_contain_text("Entran 13 unidades de 2 productos")
    confirmacion.get_by_role("button", name="Sí, pasarlo al inventario", exact=True).click()
    expect(page.locator("main:visible").last).to_contain_text("Ya está en el inventario", timeout=10000)
    productos = {p.get("nombre"): p for p in listar_coleccion("productos")}
    existencias = {v.get("talla"): v.get("existencias") for v in productos["Blusa Paquete C1"].get("variantes", [])}
    if existencias != {"S": 2, "M": 1}:
        fallas.append(f"las tallas entraron así: {existencias}")
    boxers = productos.get("Boxers Paquete C1")
    if boxers is None or sum(v.get("existencias", 0) for v in boxers.get("variantes", [])) != 10:
        fallas.append("los dos packs de 5 no entraron como 10 unidades")
    page.get_by_role("button", name="Listo", exact=True).click()
    return fallas


@caso("C1 · la pieza de encargo comprada llega en el paquete del celular con su costo real")
def caso_c1_paquete_encargo(page: Page) -> list[str]:
    fallas = []
    encargo = next((v for v in listar_coleccion("ventas")
                    if any(l.get("descripcion") == "Sandalias Encargo C1" for l in v.get("lineas", []))), None)
    if encargo is None:
        return ["falta el encargo sembrado con la pieza comprada"]
    ir_a(page, "Inventario")
    page.get_by_role("button", name="Llegó un paquete", exact=True).click()
    page.get_by_label("Peso de la caja (lb)", exact=True).fill("1")
    page.get_by_role("button", name="Seguir", exact=True).click()
    principal = page.locator("main:visible").last
    expect(principal).to_contain_text("Una pieza de encargo ya comprada espera paquete.")
    principal.get_by_role("button", name="Agregarla", exact=True).click()
    hoja = page.get_by_role("dialog", name="Piezas que esperan paquete", exact=True)
    precio = hoja.get_by_label("Pagó por cada una ($): Sandalias Encargo C1", exact=True)
    expect(precio).to_be_visible()
    # Sin lo que costó no se agrega: el error va en su campo.
    hoja.get_by_role("button", name="Agregar 1 pieza", exact=True).click()
    expect(precio).to_have_attribute("aria-invalid", "true")
    expect(precio).to_be_focused()
    precio.fill("25")
    hoja.get_by_role("button", name="Agregar 1 pieza", exact=True).click()
    expect(hoja).not_to_be_visible()
    expect(principal).to_contain_text("Encargo de Clienta Paquete C1")
    borrador = next((c for c in listar_coleccion("compras") if c.get("estado") == "BORRADOR"
                     and any(l.get("venta_id") == encargo["id"] for l in c.get("lineas", []))), None)
    if borrador is None:
        return ["la pieza de encargo no quedó en el borrador"]
    linea = next(l for l in borrador["lineas"] if l.get("venta_id") == encargo["id"])
    if linea.get("destino") != "ENCARGO" or linea.get("precio_linea_usd_cents") != 2500:
        fallas.append(f"la línea del encargo quedó así: {linea.get('destino')} {linea.get('precio_linea_usd_cents')}")
    pieza = next(l for l in leer_doc("ventas", str(encargo["id"])).get("lineas", [])
                 if l.get("descripcion") == "Sandalias Encargo C1")
    if pieza.get("compra_id") != borrador["id"]:
        fallas.append("el encargo no sabe que su pieza viene en este paquete")
    page.get_by_role("button", name="Seguir", exact=True).click()
    expect(principal).to_contain_text("no suma existencias en bodega")
    page.get_by_role("button", name="Recibir", exact=True).click()
    confirmacion = page.get_by_role("dialog", name="¿Pasar el paquete al inventario?", exact=True)
    expect(confirmacion).to_contain_text("1 pieza va para un encargo.")
    confirmacion.get_by_role("button", name="Sí, pasarlo al inventario", exact=True).click()
    expect(page.locator("main:visible").last).to_contain_text("1 encargo ya tiene su costo real", timeout=10000)
    pieza = next(l for l in leer_doc("ventas", str(encargo["id"])).get("lineas", [])
                 if l.get("descripcion") == "Sandalias Encargo C1")
    # $25.00 en la tienda + 7% ($1.75) + el flete de la libra ($7.00).
    if not pieza.get("llego_el") or pieza.get("costo_unitario_usd_cents") != 3375:
        fallas.append(f"la pieza llegó con costo {pieza.get('costo_unitario_usd_cents')}, no 3375")
    page.get_by_role("button", name="Listo", exact=True).click()
    return fallas


@caso("C1 · corregir desde el celular un paquete que ya entró: sólo el costo, y la diferencia va a la bodega")
def caso_c1_corregir_paquete(page: Page) -> list[str]:
    fallas = []
    compra = next((c for c in listar_coleccion("compras") if c.get("estado") == "RECIBIDA"
                   and any(l.get("descripcion") == "Boxers Paquete C1" for l in c.get("lineas", []))), None)
    if compra is None:
        return ["falta el paquete con los boxers (lo recibe el caso de tallas y pack)"]
    boxers = next(p for p in listar_coleccion("productos") if p.get("nombre") == "Boxers Paquete C1")
    ir_a(page, "Inventario")
    filtro = page.get_by_role("combobox", name="Filtrar inventario", exact=True)
    filtro.select_option(f"paquete:{compra['id']}")
    page.get_by_role("button", name=f"Corregir {compra['codigo']}", exact=True).click()
    expect(page.get_by_role("heading", name=f"Corregir {compra['codigo']}", exact=True)).to_be_visible()
    principal = page.locator("main:visible").last
    # Lo que ya entró no se quita ni cambia de cantidad.
    expect(principal.get_by_role("button", name="Quitar Boxers Paquete C1", exact=True)).to_have_count(0)
    principal.locator("button").filter(has_text="Boxers Paquete C1").first.click()
    hoja = page.get_by_role("dialog", name="Boxers Paquete C1", exact=True)
    expect(hoja.get_by_label("Packs", exact=True)).to_be_disabled()
    hoja.get_by_label("Pagó por pack ($)", exact=True).fill("22")
    hoja.get_by_role("button", name="Guardar cambios", exact=True).click()
    expect(hoja).not_to_be_visible()
    sin_tocar = next(c for c in listar_coleccion("compras") if c.get("id") == compra["id"])
    linea_antes = next(l for l in sin_tocar["lineas"] if l.get("descripcion") == "Boxers Paquete C1")
    if linea_antes.get("precio_linea_usd_cents") != 4000:
        fallas.append("la corrección se guardó antes de confirmarla")
    page.get_by_role("button", name="Seguir", exact=True).click()
    page.get_by_role("button", name="Guardar corrección", exact=True).click()
    confirmacion = page.get_by_role("dialog", name=f"¿Guardar la corrección de {compra['codigo']}?", exact=True)
    expect(confirmacion).to_contain_text("lo que sigue en bodega")
    confirmacion.get_by_role("button", name="Sí, corregirlo", exact=True).click()
    resultado = page.locator("main:visible").last
    expect(resultado).to_contain_text(f"{compra['codigo']} quedó corregido", timeout=10000)
    # Sin impuesto, $2.00 más por pack en dos packs: la bodega sube $4.00.
    expect(resultado).to_contain_text("La bodega sube $4.00")
    corregida = next(c for c in listar_coleccion("compras") if c.get("id") == compra["id"])
    linea = next(l for l in corregida["lineas"] if l.get("descripcion") == "Boxers Paquete C1")
    if linea.get("precio_linea_usd_cents") != 4400 or linea.get("cantidad") != 10:
        fallas.append(f"la línea corregida quedó en {linea.get('precio_linea_usd_cents')} por {linea.get('cantidad')}")
    if not corregida.get("corregido_en"):
        fallas.append("el paquete no dice que se corrigió")
    despues = next(p for p in listar_coleccion("productos") if p.get("id") == boxers.get("id"))
    if despues.get("valor_inventario_usd_cents") != boxers.get("valor_inventario_usd_cents", 0) + 400:
        fallas.append(f"la bodega de los boxers pasó de {boxers.get('valor_inventario_usd_cents')}"
                      f" a {despues.get('valor_inventario_usd_cents')}")
    page.get_by_role("button", name="Listo", exact=True).click()
    page.get_by_role("combobox", name="Filtrar inventario", exact=True).select_option("todos")
    return fallas


@caso("C1 · un borrador del celular se elimina, con Deshacer")
def caso_c1_eliminar_borrador(page: Page) -> list[str]:
    ir_a(page, "Inventario")
    page.get_by_role("button", name="Llegó un paquete", exact=True).click()
    page.get_by_label("Peso de la caja (lb)", exact=True).fill("1")
    page.get_by_role("button", name="Seguir", exact=True).click()
    page.get_by_role("button", name="Atrás", exact=True).click()
    codigo = page.locator("header:visible").inner_text().splitlines()[0]
    page.get_by_role("button", name="Eliminar este borrador", exact=True).click()
    hoja = page.get_by_role("dialog", name=f"¿Eliminar {codigo}?", exact=True)
    hoja.get_by_role("button", name="Eliminar", exact=True).click()
    expect(page.get_by_role("button", name="Llegó un paquete", exact=True)).to_be_visible()
    eliminado = next(c for c in listar_coleccion("compras") if c.get("codigo") == codigo)
    fallas = [] if eliminado.get("activo") is False else ["el borrador sigue activo"]
    page.get_by_role("button", name="Deshacer", exact=True).click()
    page.wait_for_timeout(1500)
    vuelto = next(c for c in listar_coleccion("compras") if c.get("codigo") == codigo)
    if vuelto.get("activo") is not True:
        fallas.append("Deshacer no devolvió el borrador")
    return fallas


def producto_c2() -> dict:
    return next(p for p in listar_coleccion("productos") if p.get("nombre") == "Labial Mate Rojo")


def eventos_producto_c2(producto_id: int) -> list[dict]:
    return [e for e in listar_coleccion("eventos")
            if e.get("entidad_tipo") == "productos" and e.get("entidad_id") == producto_id
            and e.get("tipo_evento") == "ACTUALIZACION"]


def comprobar_inventario_c2(antes: dict, despues: dict) -> None:
    for campo in ("variantes", "lotes", "valor_inventario_usd_cents", "costo_unitario_usd_cents"):
        assert despues.get(campo) == antes.get(campo), f"cambiar precio modificó {campo}"


def abrir_precio_c2(page: Page):
    ir_a(page, "Inventario")
    fila = page.locator("main:visible button").filter(has_text="Labial Mate Rojo").first
    expect(fila).to_be_visible()
    fila.click()
    ficha = page.get_by_role("dialog", name="Labial Mate Rojo", exact=True)
    expect(ficha).to_be_visible()
    ficha.get_by_role("button", name="Cambiar precio", exact=True).click()
    hoja = page.get_by_role("dialog", name="Cambiar precio", exact=True)
    expect(hoja).to_be_visible()
    return hoja


@caso("C2 · Inventario filtra y cambia un precio con Deshacer")
def caso_c2_inventario_precio(page: Page) -> list[str]:
    original = producto_c2()
    hoja = abrir_precio_c2(page)
    campo = hoja.get_by_label("Precio nuevo ($)", exact=True)
    expect(campo).to_have_attribute("inputmode", "decimal")
    campo.fill("0")
    hoja.get_by_role("button", name="Guardar precio", exact=True).click()
    expect(campo).to_have_attribute("aria-invalid", "true")
    expect(campo).to_be_focused()
    campo.fill("25.50")
    expect(campo).to_have_attribute("aria-invalid", "false")
    hoja.get_by_role("button", name="Guardar precio", exact=True).click()
    expect(page.get_by_role("status").filter(has_text="Precio guardado")).to_be_visible()
    expect(hoja).not_to_be_visible()
    ficha = page.get_by_role("dialog", name="Labial Mate Rojo", exact=True)
    expect(ficha.get_by_text("$25.50", exact=True)).to_be_visible()
    cambiado = producto_c2()
    assert cambiado["precio_venta_usd_cents"] == 2550
    assert cambiado["precio_manual_usd_cents"] == 2550
    assert cambiado["modo_precio"] == "MANUAL"
    comprobar_inventario_c2(original, cambiado)
    page.get_by_role("button", name="Deshacer", exact=True).click()
    expect(ficha.get_by_text(f"${original['precio_venta_usd_cents'] / 100:,.2f}", exact=True)).to_be_visible()
    deshecho = producto_c2()
    for atributo in ("precio_venta_usd_cents", "precio_manual_usd_cents", "modo_precio"):
        assert deshecho.get(atributo) == original.get(atributo), f"Deshacer no restauró {atributo}"
    comprobar_inventario_c2(original, deshecho)
    cerrar_hojas(page)
    fila = page.locator("main:visible button").filter(has_text="Labial Mate Rojo").first
    expect(fila.get_by_text(f"${original['precio_venta_usd_cents'] / 100:,.2f}", exact=True)).to_be_visible()
    return []


@caso("C2 · Inventario valida el precio, confirma descarte y guarda una vez")
def caso_c2_inventario_precio_validacion(page: Page) -> list[str]:
    original = producto_c2()
    eventos_antes = len(eventos_producto_c2(original["id"]))
    hoja = abrir_precio_c2(page)
    campo = hoja.get_by_label("Precio nuevo ($)", exact=True)
    guardar = hoja.get_by_role("button", name="Guardar precio", exact=True)
    # Un precio sin cambios no tiene que crear un grupo ni tocar la bodega.
    if guardar.is_enabled():
        guardar.click()
    if not hoja.is_visible():
        page.get_by_role("dialog", name="Labial Mate Rojo", exact=True).get_by_role("button", name="Cambiar precio", exact=True).click()
        expect(hoja).to_be_visible()
    assert len(eventos_producto_c2(original["id"])) == eventos_antes
    for valor in ("", "0", "-2", "letras", "90071992547409.92"):
        campo.fill(valor)
        guardar.click()
        expect(campo).to_have_attribute("aria-invalid", "true")
        expect(campo).to_be_focused()
        expect(hoja).to_be_visible()
        assert len(eventos_producto_c2(original["id"])) == eventos_antes
        assert producto_c2()["precio_venta_usd_cents"] == original["precio_venta_usd_cents"]
    campo.fill("0.01")
    expect(campo).to_have_attribute("aria-invalid", "false")
    expect(hoja.get_by_text(re.compile("perdés|pérdida|perder", re.I))).to_be_visible()
    hoja.get_by_role("button", name="Cerrar", exact=True).click()
    descarte = page.get_by_role("alertdialog")
    expect(descarte).to_be_visible()
    descarte.get_by_role("button", name="Seguir editando", exact=True).click()
    expect(campo).to_have_value("0.01")
    hoja.get_by_role("button", name="Cerrar", exact=True).click()
    descarte.get_by_role("button", name="Descartar", exact=True).click()
    expect(hoja).not_to_be_visible()
    assert len(eventos_producto_c2(original["id"])) == eventos_antes
    comprobar_inventario_c2(original, producto_c2())
    page.get_by_role("dialog", name="Labial Mate Rojo", exact=True).get_by_role("button", name="Cambiar precio", exact=True).click()
    expect(hoja).to_be_visible()
    expect(campo).to_have_value(f"{original['precio_venta_usd_cents'] / 100:.2f}")
    campo.fill("25.50")
    # Dos activaciones seguidas, sin esperar el primer guardado.
    guardar.evaluate("el => { el.click(); el.click(); }")
    expect(page.get_by_role("status").filter(has_text="Precio guardado")).to_be_visible()
    expect(hoja).not_to_be_visible()
    eventos = eventos_producto_c2(original["id"])
    assert len(eventos) == eventos_antes + 1, "dos toques escribieron más de un cambio de precio"
    assert eventos[-1].get("evento_grupo_id"), "cambiar precio no dejó grupo para Deshacer"
    assert producto_c2()["precio_venta_usd_cents"] == 2550
    comprobar_inventario_c2(original, producto_c2())
    page.get_by_role("button", name="Deshacer", exact=True).click()
    ficha = page.get_by_role("dialog", name="Labial Mate Rojo", exact=True)
    expect(ficha.get_by_text(f"${original['precio_venta_usd_cents'] / 100:,.2f}", exact=True)).to_be_visible()
    comprobar_inventario_c2(original, producto_c2())
    cerrar_hojas(page)
    return []


@caso("C2 · Inventario usa un filtro excluyente y restablece búsqueda y selección")
def caso_c2_inventario_filtro(page: Page) -> list[str]:
    ir_a(page, "Inventario")
    filtro = page.get_by_role("combobox", name="Filtrar inventario", exact=True)
    expect(filtro).to_be_visible()
    expect(page.locator("select:visible")).to_have_count(1)
    expect(filtro.locator("optgroup[label='Categorías'] option").first).to_be_attached()
    expect(filtro.locator("optgroup[label='Paquetes'] option").first).to_be_attached()
    paquetes = listar_coleccion("compras")
    abierto = next(c for c in paquetes if any(l.get("descripcion") == "Gloss Prueba" for l in c.get("lineas", [])))
    cerrado = next(c for c in paquetes if any(l.get("descripcion") == "Termo Prueba" for l in c.get("lineas", [])))
    categorias = listar_coleccion("categorias")
    categoria = next(c for c in categorias if c.get("nombre") == "Ropa")
    fila_gloss = page.locator("main:visible button").filter(has_text="Gloss Prueba").first
    filtro.select_option(f"paquete:{abierto['id']}")
    expect(fila_gloss).to_be_visible()
    expect(page.locator("main:visible button").filter(has_text="Bolso Prueba").first).to_be_visible()
    filtro.select_option(f"categoria:{categoria['id']}")
    expect(filtro).to_have_value(f"categoria:{categoria['id']}")
    expect(fila_gloss).not_to_be_visible()
    expect(page.locator("main:visible")).to_contain_text("Ningún producto coincide")
    filtro.select_option(f"paquete:{abierto['id']}")
    expect(fila_gloss).to_be_visible()
    filtro.select_option(f"paquete:{cerrado['id']}")
    expect(page.locator("main:visible button").filter(has_text="Termo Prueba").first).to_be_visible()
    expect(page.locator("main:visible")).to_contain_text("Vendidos")
    buscar = page.get_by_placeholder("Buscar por nombre, código o tono", exact=True)
    buscar.fill("sin coincidencia c2")
    expect(page.locator("main:visible")).to_contain_text("Ningún producto coincide")
    page.get_by_role("button", name="Restablecer filtros", exact=True).click()
    expect(buscar).to_have_value("")
    expect(filtro).to_have_value("todos")
    expect(fila_gloss).to_be_visible()
    expect(page.locator("main:visible button").filter(has_text="Termo Prueba")).to_have_count(0)
    fila = page.locator("main:visible button").filter(has_text="Labial Mate Rojo").first
    expect(fila).to_contain_text(re.compile(r"P-\d+"))
    expect(fila).not_to_contain_text("#")
    expect(fila).to_contain_text("en bodega")
    buscar.fill("sin coincidencia c2")
    vacio = page.locator("main:visible")
    expect(vacio).to_contain_text("Ningún producto coincide")
    expect(vacio).not_to_contain_text('""')
    expect(vacio).not_to_contain_text(re.compile(r"categoría\s+Todos|en\s+[\"“]Todos", re.I))
    page.get_by_role("button", name="Restablecer filtros", exact=True).click()
    expect(fila).to_be_visible()
    return []


@caso("C2 · Inventario muestra costo, ganancia y pérdida a 390 px en ambos temas")
def caso_c2_precio_legible(page: Page) -> list[str]:
    original = producto_c2()
    costo = original["costo_unitario_usd_cents"]
    assert costo > 1, "esta fixture necesita costo positivo para comprobar una pérdida"
    viewport = page.viewport_size or {"width": 390, "height": 844}
    oscuro_antes = page.evaluate("document.documentElement.classList.contains('dark')")
    fallas = []
    try:
        for tema, oscuro in (("claro", False), ("oscuro", True)):
            page.set_viewport_size({"width": 390, "height": 844})
            page.evaluate("o => document.documentElement.classList.toggle('dark', o)", oscuro)
            hoja = abrir_precio_c2(page)
            expect(hoja.get_by_text("Costo por unidad", exact=True)).to_be_visible()
            expect(hoja.locator("dl").get_by_text(f"${costo / 100:,.2f}", exact=True)).to_be_visible()
            expect(hoja.get_by_text("Precio actual", exact=True)).to_be_visible()
            campo = hoja.get_by_label("Precio nuevo ($)", exact=True)
            expect(campo).to_have_attribute("inputmode", "decimal")
            campo.fill(f"{(costo + 100) / 100:.2f}")
            expect(hoja.get_by_text("Ganancia por unidad: $1.00", exact=True)).to_be_visible()
            campo.fill("0.01")
            perdida = hoja.get_by_text(f"Perdés ${(costo - 1) / 100:,.2f} por unidad.", exact=True)
            expect(perdida).to_be_visible()
            page.wait_for_timeout(250)  # deja terminar la transición de los tokens del tema
            contraste = perdida.evaluate(JS_CONTRASTE)
            if contraste < 4.5:
                fallas.append(f"pérdida en {tema}: contraste {contraste:.2f}:1")
            # Altura disponible reducida como con un teclado. No equivale a
            # probar el teclado físico de Safari; inputmode se comprueba arriba.
            page.set_viewport_size({"width": 390, "height": 500})
            campo.focus()
            campo.scroll_into_view_if_needed()
            expect(campo).to_be_visible()
            guardar = hoja.get_by_role("button", name="Guardar precio", exact=True)
            expect(guardar).to_be_visible()
            for nombre, elemento in (("precio", campo), ("Guardar precio", guardar)):
                cabe = elemento.evaluate("""el => {
                  const r = el.getBoundingClientRect();
                  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                  return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 &&
                    r.bottom <= innerHeight + 1 && !!hit && (el === hit || el.contains(hit));
                }""")
                if not cabe:
                    fallas.append(f"{nombre} se recorta o queda tapado en {tema}, con altura reducida")
            perdida.scroll_into_view_if_needed()
            expect(perdida).to_be_visible()
            expect(guardar).to_be_visible()
            assert hoja.evaluate("el => el.scrollWidth <= el.clientWidth + 1"), "la hoja desborda horizontalmente"
            cerrar_hojas(page)
        assert producto_c2()["precio_venta_usd_cents"] == original["precio_venta_usd_cents"]
        comprobar_inventario_c2(original, producto_c2())
    finally:
        page.set_viewport_size(viewport)
        page.evaluate("o => document.documentElement.classList.toggle('dark', o)", oscuro_antes)
        cerrar_hojas(page)
    return fallas


@caso("C2 · Encargos lista fases, incluye pedidos viejos y vuelve a su origen")
def caso_c2_encargos_lista(page: Page) -> list[str]:
    ir_a(page, "Inicio")
    expect(page.locator("nav button:visible")).to_have_count(5)
    tarjeta = page.get_by_role("button", name=re.compile("Encargos"))
    expect(tarjeta).to_be_visible()
    expect(tarjeta).to_contain_text("1 por cotizar")
    # INI-1: la tarjeta de Inicio dice sólo lo que espera a Ross; lo que
    # espera la respuesta de la clienta no es trabajo para hoy.
    expect(tarjeta).to_contain_text("1 por entregar")
    expect(tarjeta).not_to_contain_text("esperando")
    tarjeta.click()
    principal = page.locator("main:visible").last
    expect(principal.get_by_role("heading", name="Encargos", exact=True)).to_be_visible()
    expect(principal).to_contain_text("Bolso C2 sin precio")
    expect(principal).to_contain_text("Botas C2 antiguas")
    expect(principal).to_contain_text("Labial C2 reservado")
    expect(principal).to_contain_text("Clienta C2")
    for fase, descripcion in [("Por buscar", "Bolso C2 sin precio"),
                              ("Esperando respuesta", "Botas C2 antiguas"),
                              ("Por entregar", "Labial C2 reservado")]:
        filtro = principal.get_by_role("button", name=re.compile("^" + fase))
        filtro.click()
        expect(filtro).to_have_attribute("aria-pressed", "true")
        expect(principal).to_contain_text(descripcion)
        if fase == "Por buscar":
            expect(principal).not_to_contain_text("$0.00")
    principal.get_by_role("button", name=re.compile("Labial C2 reservado")).click()
    detalle = page.get_by_role("dialog").last
    expect(detalle).to_contain_text("Seguí este paso en la computadora")
    for accion in ["Comprar", "Recibir", "Entregar", "Anular"]:
        expect(detalle.get_by_role("button", name=accion, exact=True)).to_have_count(0)
    detalle.get_by_role("button", name="Cerrar", exact=True).click()
    principal.get_by_role("button", name=re.compile("^Volver")).click()
    expect(tarjeta).to_be_visible()
    expect(page.locator("nav button:visible")).to_have_count(5)
    ir_a(page, "Vender")
    page.get_by_role("button", name="Anotar un pedido", exact=True).click()
    principal = page.locator("main:visible").last
    expect(principal.get_by_role("heading", name="Encargos", exact=True)).to_be_visible()
    # T4 ahora consume la intención de alta que T3 dejaba pendiente.
    pedido = page.get_by_role("dialog", name="Anotar un pedido", exact=True)
    expect(pedido).to_be_visible()
    pedido.get_by_role("button", name="Cerrar", exact=True).click()
    expect(pedido).not_to_be_visible()
    principal.get_by_role("button", name=re.compile("^Volver")).click()
    expect(page.get_by_role("button", name="Anotar un pedido", exact=True)).to_be_visible()
    return []


@caso("C2 · aceptar un encargo reutiliza abono y Deshacer antes de aceptar sin pago")
def caso_c2_aceptar_encargo(page: Page) -> list[str]:
    """Un abono menor al anticipo acepta sólo por el gesto explícito de Aceptó."""
    original = next(v for v in listar_coleccion("ventas")
                    if any(l.get("descripcion") == "Botas C2 antiguas" for l in v.get("lineas", [])))
    venta_id = original["id"]
    assert original["estado"] == "COTIZADA" and original["pagado_usd_cents"] == 0
    assert original["tasa_cambio_cents"] == 3700 and original["anticipo_esperado_usd_cents"] > 100
    pagos_antes = {p["id"] for p in listar_coleccion("pagos")}
    eventos_antes = {e["id"] for e in listar_coleccion("eventos")}
    bodega_antes = foto_bodega_pedido_c2()

    ir_a(page, "Inicio")
    page.get_by_role("button", name=re.compile("Encargos")).click()
    principal = page.locator("main:visible").last

    def abrir_aceptacion():
        principal.get_by_role("button", name=re.compile("^Todos")).click()
        principal.get_by_role("button", name=re.compile("Botas C2 antiguas")).click()
        detalle = page.get_by_role("dialog").last
        expect(detalle.get_by_role("button", name="Aceptó", exact=True)).to_be_visible()
        detalle.get_by_role("button", name="Aceptó", exact=True).click()
        eleccion = page.get_by_role("dialog", name=re.compile(r" aceptó$"))
        expect(eleccion.get_by_role("button", name="Todavía no", exact=True)).to_be_visible()
        expect(eleccion.get_by_role("button", name="Registrar abono", exact=True)).to_be_visible()
        return eleccion

    # Abrir o cancelar el formulario no confirma una aceptación ni mueve dinero.
    eleccion = abrir_aceptacion()
    assert leer_doc("ventas", str(venta_id))["estado"] == "COTIZADA"
    eleccion.get_by_role("button", name="Registrar abono", exact=True).click()
    abono = page.get_by_role("dialog", name="Registrar abono", exact=True)
    expect(abono).to_be_visible()
    assert leer_doc("ventas", str(venta_id))["estado"] == "COTIZADA"
    abono.get_by_role("button", name="Cerrar", exact=True).click()
    expect(abono).not_to_be_visible()
    assert leer_doc("ventas", str(venta_id))["estado"] == "COTIZADA"
    assert {p["id"] for p in listar_coleccion("pagos")} == pagos_antes
    cerrar_hojas(page)

    # La hoja existente conserva moneda, tasa, éxito y su propio Deshacer.
    eleccion = abrir_aceptacion()
    eleccion.get_by_role("button", name="Registrar abono", exact=True).click()
    expect(abono).to_be_visible()
    abono.get_by_role("radio", name="Córdobas (C$)", exact=True).click()
    monto = abono.get_by_label("Cuánto pagó (C$)", exact=True)
    expect(monto).to_have_attribute("inputmode", "decimal")
    abono.get_by_role("button", name="Registrar abono", exact=True).click()
    expect(monto).to_have_attribute("aria-invalid", "true")
    expect(monto).to_be_focused()
    monto.fill("37.00")
    abono.get_by_label("Referencia", exact=True).fill("Aceptación C2 prueba")
    abono.get_by_role("button", name="Registrar abono", exact=True).click()
    expect(abono.get_by_role("heading", name="Abono registrado", exact=True)).to_be_visible()
    expect(abono).to_contain_text("C$37.00")
    aceptada = leer_doc("ventas", str(venta_id))
    assert aceptada["estado"] == "PENDIENTE", "el abono pequeño debe aceptar al elegir Aceptó"
    assert aceptada["pagado_usd_cents"] == 100 and aceptada["saldo_usd_cents"] == 2900
    nuevos = [p for p in listar_coleccion("pagos") if p["id"] not in pagos_antes]
    assert len(nuevos) == 1, "aceptar con pago tiene que crear un solo abono"
    pago = nuevos[0]
    assert pago["venta_id"] == venta_id and pago["moneda"] == "COR"
    assert pago["monto_cor_cents"] == 3700 and pago["monto_usd_cents"] == 100
    assert pago["tasa_cambio_cents"] == 3700, "el abono usa la tasa congelada del encargo"
    eventos = [e for e in listar_coleccion("eventos") if e["id"] not in eventos_antes]
    del_pago = [e for e in eventos if e.get("entidad_tipo") == "pagos" and e.get("entidad_id") == pago["id"]]
    de_aceptar = [e for e in eventos if e.get("entidad_tipo") == "ventas" and e.get("entidad_id") == venta_id]
    assert del_pago and de_aceptar, "el grupo tiene que registrar el abono y la aceptación"
    assert len({e["evento_grupo_id"] for e in del_pago + de_aceptar}) == 1, "ambas acciones se deshacen juntas"
    assert foto_bodega_pedido_c2() == bodega_antes

    # Pausar únicamente el servicio local deja probar la protección mientras
    # Deshacer está realmente pendiente, sin depender de la velocidad de red.
    page.evaluate("""async () => {
      const url = performance.getEntriesByType('resource').map(r => r.name)
        .find(url => new URL(url).pathname.endsWith('/eventos.repo.ts'));
      if (!url) throw new Error('No se encontró el repositorio local de eventos');
      const { EventosRepoFirestore: repo } = await import(url);
      const original = repo.deshacerGrupo;
      repo.deshacerGrupo = async (...args) => {
        await new Promise(resolve => { window.soltarDeshacerC2 = resolve; });
        return original.apply(repo, args);
      };
      window.restaurarDeshacerC2 = () => { repo.deshacerGrupo = original; };
    }""")
    try:
        abono.get_by_role("button", name="Deshacer el abono", exact=True).click()
        expect(abono).to_have_attribute("aria-busy", "true")
        expect(abono.get_by_role("button", name="Listo", exact=True)).to_be_disabled()
        expect(abono.get_by_role("button", name="Cerrar", exact=True)).to_be_disabled()
        page.evaluate("history.back()")
        page.wait_for_timeout(300)
        expect(abono).to_be_visible()
    finally:
        page.evaluate("() => { window.soltarDeshacerC2?.(); window.restaurarDeshacerC2?.(); }")
    expect(page.get_by_text("Abono deshecho.", exact=True)).to_be_visible()
    expect(abono).not_to_be_visible()
    deshecha = leer_doc("ventas", str(venta_id))
    assert deshecha["estado"] == "COTIZADA" and deshecha["pagado_usd_cents"] == 0
    assert deshecha["saldo_usd_cents"] == 3000
    assert {p["id"] for p in listar_coleccion("pagos")} == pagos_antes, "Deshacer elimina el abono de ese grupo"
    cerrar_hojas(page)
    expect(principal.get_by_role("region", name="Esperando respuesta", exact=True)).to_contain_text("Botas C2 antiguas")

    # Reusar la misma cotización, ahora aceptando sin pago, evita depender del alta T4.
    eleccion = abrir_aceptacion()
    eleccion.get_by_role("button", name="Todavía no", exact=True).click()
    assert leer_doc("ventas", str(venta_id))["estado"] == "COTIZADA", "elegir no paga ni acepta antes de confirmar"
    eleccion.get_by_role("button", name="Aceptó", exact=True).click()
    expect(eleccion).not_to_be_visible()
    cerrar_hojas(page)
    expect(principal.get_by_role("region", name="Por comprar", exact=True)).to_contain_text("Botas C2 antiguas")
    sin_pago = leer_doc("ventas", str(venta_id))
    assert sin_pago["estado"] == "PENDIENTE" and sin_pago["pagado_usd_cents"] == 0
    assert sin_pago["saldo_usd_cents"] == 3000
    assert {p["id"] for p in listar_coleccion("pagos")} == pagos_antes
    assert foto_bodega_pedido_c2() == bodega_antes
    volver_desde_encargos_c2(page)
    return []


def abrir_pedido_c2(page: Page):
    """La entrada real desde Vender; T4 conecta la intención de T3."""
    if page.locator("nav button:visible").count() == 0:
        cerrar_hojas(page)
        page.locator("main:visible").last.get_by_role("button", name="Volver", exact=True).click()
    ir_a(page, "Vender")
    page.get_by_role("button", name="Anotar un pedido", exact=True).click()
    hoja = page.get_by_role("dialog", name="Anotar un pedido", exact=True)
    expect(hoja).to_be_visible()
    return hoja


def elegir_clienta_pedido_c2(page: Page, hoja, nombre: str = "Ana Prueba") -> None:
    hoja.get_by_role("button", name="Elegir clienta", exact=True).click()
    selector = page.get_by_role("dialog", name="Elegí la clienta", exact=True)
    selector.get_by_placeholder("Buscar por nombre o teléfono", exact=True).fill(nombre)
    selector.get_by_role("button", name=re.compile(re.escape(nombre))).click()
    expect(selector).not_to_be_visible()
    expect(hoja).to_contain_text(nombre)


def pieza_pedido_c2(hoja, numero: int = 1):
    return hoja.get_by_role("group", name=f"Pieza {numero}", exact=True)


def volver_desde_encargos_c2(page: Page) -> None:
    cerrar_hojas(page)
    principal = page.locator("main:visible").last
    principal.get_by_role("button", name="Volver", exact=True).click()
    expect(page.locator("nav button:visible")).to_have_count(5)


def foto_bodega_pedido_c2() -> list[dict]:
    campos = ("id", "variantes", "lotes", "valor_inventario_usd_cents", "costo_unitario_usd_cents")
    return sorted([{campo: p.get(campo) for campo in campos} for p in listar_coleccion("productos")], key=lambda p: p["id"])


def pedidos_por_pieza_c2(descripcion: str) -> list[dict]:
    return [v for v in listar_coleccion("ventas") if any(l.get("descripcion") == descripcion for l in v.get("lineas", []))]


@caso("C2 · anotar un pedido sin precio no crea deuda ni descuenta bodega")
def caso_c2_anotar_sin_precio(page: Page) -> list[str]:
    antes = foto_bodega_pedido_c2()
    movimientos_antes = listar_coleccion("movimientos_inventario")
    ana = next(c for c in listar_coleccion("clientes") if c.get("nombre") == "Ana Prueba")
    saldo_antes = ana.get("saldo_pendiente_usd_cents", 0)
    ventas_antes = len(listar_coleccion("ventas"))
    hoja = abrir_pedido_c2(page)
    elegir_clienta_pedido_c2(page, hoja)
    pieza = pieza_pedido_c2(hoja)
    pieza.get_by_label("Qué quiere", exact=True).fill("Bolso C2")
    cantidad = pieza.get_by_label("Cantidad", exact=True)
    cantidad.fill("2")
    expect(cantidad).to_have_attribute("inputmode", "numeric")
    precio = pieza.get_by_label("Precio ($)", exact=True)
    expect(precio).to_have_value("")
    expect(precio).to_have_attribute("inputmode", "decimal")
    hoja.get_by_role("button", name="Guardar pedido", exact=True).click()
    expect(page.get_by_text("Pedido anotado", exact=True)).to_be_visible()
    expect(hoja).not_to_be_visible()
    pedidos = pedidos_por_pieza_c2("Bolso C2")
    assert len(pedidos) == 1, "guardar el pedido debe crear un solo documento"
    pedido = pedidos[0]
    assert len(listar_coleccion("ventas")) == ventas_antes + 1
    assert pedido["tipo"] == "ENCARGO" and pedido["estado"] == "COTIZADA"
    assert pedido["cliente_id"] == ana["id"]
    assert pedido["total_usd_cents"] == 0 and pedido["saldo_usd_cents"] == 0
    assert pedido["piezas"]["sin_precio"] == 1
    assert pedido["lineas"][0]["cantidad"] == 2 and pedido["lineas"][0]["precio_unitario_usd_cents"] == 0
    assert foto_bodega_pedido_c2() == antes, "anotar un encargo no cambia unidades, lotes ni costos"
    assert listar_coleccion("movimientos_inventario") == movimientos_antes
    despues = next(c for c in listar_coleccion("clientes") if c["id"] == ana["id"])
    assert despues.get("saldo_pendiente_usd_cents", 0) == saldo_antes
    principal = page.locator("main:visible").last
    principal.get_by_role("button", name=re.compile("^Por buscar")).click()
    expect(principal.get_by_role("button", name=re.compile(re.escape(pedido["codigo"])))).to_contain_text("Bolso C2")
    volver_desde_encargos_c2(page)
    return []


@caso("C2 · anotar con clienta nueva y precio guarda una vez sin convertir la cotización en deuda")
def caso_c2_anotar_clienta_nueva(page: Page) -> list[str]:
    bodega = foto_bodega_pedido_c2()
    ventas_antes = len(listar_coleccion("ventas"))
    clientas_antes = len(listar_coleccion("clientes"))
    hoja = abrir_pedido_c2(page)
    hoja.get_by_role("button", name="Elegir clienta", exact=True).click()
    selector = page.get_by_role("dialog", name="Elegí la clienta", exact=True)
    selector.get_by_role("button", name=re.compile("Crear nueva clienta")).click()
    alta = page.get_by_role("dialog", name="Clienta nueva", exact=True)
    alta.get_by_label("Nombre", exact=True).fill("Clienta nueva C2 pedido")
    alta.get_by_label("Teléfono", exact=True).fill("88889999")
    alta.get_by_role("button", name="Guardar y elegir", exact=True).evaluate("b => { b.click(); b.click(); }")
    expect(alta).not_to_be_visible()
    expect(hoja).to_contain_text(re.compile("Clienta nueva C2 pedido", re.I))
    pieza = pieza_pedido_c2(hoja)
    pieza.get_by_label("Qué quiere", exact=True).fill("Perfume C2 precio opcional")
    pieza.get_by_label("Precio ($)", exact=True).fill("12.50")
    hoja.get_by_role("button", name="Guardar pedido", exact=True).evaluate("b => { b.click(); b.click(); }")
    expect(page.get_by_text("Pedido anotado", exact=True)).to_be_visible()
    assert len(listar_coleccion("clientes")) == clientas_antes + 1, "el doble toque no debe duplicar a la clienta"
    assert len(listar_coleccion("ventas")) == ventas_antes + 1, "el doble toque no debe duplicar el pedido"
    pedidos = pedidos_por_pieza_c2("Perfume C2 precio opcional")
    assert len(pedidos) == 1
    pedido = pedidos[0]
    assert pedido["tipo"] == "ENCARGO" and pedido["estado"] == "COTIZADA"
    assert pedido["total_usd_cents"] == 1250 and pedido["lineas"][0]["precio_unitario_usd_cents"] == 1250
    assert not any(p.get("venta_id") == pedido["id"] for p in listar_coleccion("pagos"))
    clienta = next(c for c in listar_coleccion("clientes") if c["id"] == pedido["cliente_id"])
    assert clienta.get("saldo_pendiente_usd_cents", 0) == 0, "cotizada todavía no cuenta como deuda"
    assert foto_bodega_pedido_c2() == bodega
    volver_desde_encargos_c2(page)
    return []


@caso("C2 · anotar valida clienta y piezas en sus campos antes de escribir")
def caso_c2_anotar_validacion(page: Page) -> list[str]:
    ventas_antes = listar_coleccion("ventas")
    eventos_antes = listar_coleccion("eventos")
    hoja = abrir_pedido_c2(page)
    guardar = hoja.get_by_role("button", name="Guardar pedido", exact=True)
    guardar.click()
    elegir = hoja.get_by_role("button", name="Elegir clienta", exact=True)
    expect(elegir).to_have_attribute("aria-invalid", "true")
    expect(elegir).to_be_focused()
    elegir_clienta_pedido_c2(page, hoja)
    pieza = pieza_pedido_c2(hoja)
    descripcion = pieza.get_by_label("Qué quiere", exact=True)
    guardar.click()
    expect(descripcion).to_have_attribute("aria-invalid", "true")
    expect(descripcion).to_be_focused()
    descripcion.fill("Pedido C2 validar sin guardar")
    expect(descripcion).to_have_attribute("aria-invalid", "false")
    cantidad = pieza.get_by_label("Cantidad", exact=True)
    for valor in ("0", "1.5", "letras", "9007199254740992"):
        cantidad.fill(valor)
        guardar.click()
        expect(cantidad).to_have_attribute("aria-invalid", "true")
        expect(cantidad).to_be_focused()
        assert listar_coleccion("ventas") == ventas_antes
    cantidad.fill("1")
    expect(cantidad).to_have_attribute("aria-invalid", "false")
    precio = pieza.get_by_label("Precio ($)", exact=True)
    for valor in ("-1", "letras", "90071992547409.92"):
        precio.fill(valor)
        guardar.click()
        expect(precio).to_have_attribute("aria-invalid", "true")
        expect(precio).to_be_focused()
        assert listar_coleccion("ventas") == ventas_antes
    precio.fill("")
    expect(precio).to_have_attribute("aria-invalid", "false")
    assert listar_coleccion("eventos") == eventos_antes
    hoja.get_by_role("button", name="Cerrar", exact=True).click()
    page.get_by_role("alertdialog").get_by_role("button", name="Descartar", exact=True).click()
    # Esperar a que baje: si `cerrar_hojas` la encuentra todavía sin su clase
    # de salida, toca un "Cerrar" que se desmonta en medio del toque.
    expect(hoja).not_to_be_visible()
    volver_desde_encargos_c2(page)
    return []


@caso("C2 · anotar confirma descarte por X y Atrás, conserva carrito y la clienta ya guardada")
def caso_c2_anotar_descarte_y_carrito(page: Page) -> list[str]:
    if page.locator("nav button:visible").count() == 0:
        volver_desde_encargos_c2(page)
    problema = poner_en_el_carrito(page, "Perfume Carolina Herrera")
    assert problema is None, problema
    clienta_vender = visible(page, "header button")
    assert clienta_vender is not None
    clienta_vender.click()
    selector = page.get_by_role("dialog", name="Elegí la clienta", exact=True)
    selector.get_by_placeholder("Buscar por nombre o teléfono", exact=True).fill("Ana Prueba")
    selector.get_by_role("button", name=re.compile("Ana Prueba")).click()
    expect(selector).not_to_be_visible()
    cobrar = visible(page, "span:text-is('Cobrar')")
    assert cobrar is not None
    cobrar.click()
    carrito = page.get_by_role("dialog", name="Carrito", exact=True)
    expect(carrito).to_contain_text("Ana Prueba")
    expect(carrito).to_contain_text("Perfume Carolina Herrera")
    carrito_antes = carrito.inner_text()
    carrito.get_by_role("button", name="Cerrar", exact=True).click()
    expect(carrito).not_to_be_visible()
    ventas_antes = listar_coleccion("ventas")
    hoja = abrir_pedido_c2(page)
    hoja.get_by_role("button", name="Elegir clienta", exact=True).click()
    page.get_by_role("dialog", name="Elegí la clienta", exact=True).get_by_role("button", name=re.compile("Crear nueva clienta")).click()
    alta = page.get_by_role("dialog", name="Clienta nueva", exact=True)
    alta.get_by_label("Nombre", exact=True).fill("Clienta C2 que conserva su ficha")
    alta.get_by_role("button", name="Guardar y elegir", exact=True).click()
    expect(alta).not_to_be_visible()
    clientas_antes = listar_coleccion("clientes")
    primera = pieza_pedido_c2(hoja)
    primera.get_by_label("Qué quiere", exact=True).fill("Pedido C2 que se descarta")
    hoja.get_by_role("button", name="Agregar otra pieza", exact=True).click()
    segunda = pieza_pedido_c2(hoja, 2)
    expect(segunda.get_by_label("Qué quiere", exact=True)).to_be_focused()
    segunda.get_by_label("Qué quiere", exact=True).fill("Segunda pieza C2")
    segunda.get_by_role("button", name="Quitar pieza", exact=True).click()
    confirmar_quitar = page.get_by_role("alertdialog")
    expect(confirmar_quitar).to_be_visible()
    page.wait_for_timeout(350)
    expect(confirmar_quitar.get_by_role("button", name="No, conservar", exact=True)).to_be_focused()
    page.evaluate("window.history.back()")
    expect(confirmar_quitar).not_to_be_visible()
    expect(hoja).to_be_visible()
    expect(segunda.get_by_label("Qué quiere", exact=True)).to_have_value("Segunda pieza C2")
    segunda.get_by_role("button", name="Quitar pieza", exact=True).click()
    confirmar_quitar.get_by_role("button", name="No, conservar", exact=True).click()
    expect(segunda.get_by_label("Qué quiere", exact=True)).to_have_value("Segunda pieza C2")
    segunda.get_by_role("button", name="Quitar pieza", exact=True).click()
    confirmar_quitar.get_by_role("button", name="Sí, quitar pieza", exact=True).click()
    expect(segunda).to_have_count(0)
    hoja.get_by_role("button", name="Cerrar", exact=True).click()
    descarte = page.get_by_role("alertdialog")
    expect(descarte).to_be_visible()
    descarte.get_by_role("button", name="Seguir editando", exact=True).click()
    expect(primera.get_by_label("Qué quiere", exact=True)).to_have_value("Pedido C2 que se descarta")
    # El historial de BottomSheet intercepta Atrás sin navegar fuera de la app.
    page.evaluate("window.history.back()")
    expect(descarte).to_be_visible()
    descarte.get_by_role("button", name="Descartar", exact=True).click()
    expect(hoja).not_to_be_visible()
    assert listar_coleccion("ventas") == ventas_antes
    assert listar_coleccion("clientes") == clientas_antes, "descartar el pedido no borra una clienta que ya se guardó"
    volver_desde_encargos_c2(page)
    expect(visible(page, "header button", "Ana Prueba")).to_be_visible()
    visible(page, "span:text-is('Cobrar')").click()
    expect(carrito).to_be_visible()
    assert carrito.inner_text() == carrito_antes, "abrir o descartar un pedido no cambia el carrito ni su clienta"
    carrito.get_by_role("button", name="Cerrar", exact=True).click()
    return []


@caso("C2 · seleccionar clienta confirma descarte sin permitir guardar detrás")
def caso_c2_clienta_descarte_bloquea_guardar(page: Page) -> list[str]:
    ir_a(page, "Vender")
    clientas_antes = listar_coleccion("clientes")
    ventas_antes = listar_coleccion("ventas")
    elegir = visible(page, "header button")
    assert elegir is not None, "Vender tiene que ofrecer elegir clienta desde su cabecera"
    elegir.click()
    selector = page.get_by_role("dialog", name="Elegí la clienta", exact=True)
    selector.get_by_role("button", name=re.compile("Crear nueva clienta")).click()
    alta = page.get_by_role("dialog", name="Clienta nueva", exact=True, include_hidden=True)
    # La hoja de búsqueda termina de salir después de abrir el alta: no debe
    # restaurar el foco en Vender mientras otra hoja siga encima.
    page.wait_for_timeout(350)
    expect(alta.get_by_label("Nombre", exact=True)).to_be_focused()
    alta.get_by_label("Nombre", exact=True).fill("Clienta C2 que no debe guardarse detrás")
    guardar = alta.get_by_role("button", name="Guardar y elegir", exact=True, include_hidden=True)
    alta.get_by_role("button", name="Cancelar", exact=True).click()
    descarte = page.get_by_role("alertdialog", name="¿Descartar lo que escribiste?", exact=True)
    expect(descarte).to_be_visible()
    expect(descarte.get_by_role("button", name="Seguir editando", exact=True)).to_be_focused()
    # Una confirmación puede deshabilitar el fondo o aislarlo con inert;
    # en ambos casos, Tab nunca debe ofrecer Guardar detrás de la pregunta.
    for _ in range(6):
        page.keyboard.press("Tab")
        assert not guardar.evaluate("el => document.activeElement === el"), "Tab permite guardar mientras se decide descartar"
    assert listar_coleccion("clientes") == clientas_antes
    assert listar_coleccion("ventas") == ventas_antes
    descarte.get_by_role("button", name="Descartar", exact=True).click()
    expect(selector).to_be_visible()
    expect(alta).not_to_be_visible()
    assert listar_coleccion("clientes") == clientas_antes, "descartar no crea una clienta"
    selector.get_by_role("button", name="Cerrar", exact=True).click()
    return []


def crear_pedido_cotizar_c2(page: Page, piezas: list[tuple[str, str, str]]) -> dict:
    hoja = abrir_pedido_c2(page)
    elegir_clienta_pedido_c2(page, hoja)
    for indice, (descripcion, cantidad, precio) in enumerate(piezas, 1):
        if indice > 1:
            hoja.get_by_role("button", name="Agregar otra pieza", exact=True).click()
        pieza = pieza_pedido_c2(hoja, indice)
        pieza.get_by_label("Qué quiere", exact=True).fill(descripcion)
        pieza.get_by_label("Cantidad", exact=True).fill(cantidad)
        pieza.get_by_label("Precio ($)", exact=True).fill(precio)
    hoja.get_by_role("button", name="Guardar pedido", exact=True).click()
    expect(hoja).not_to_be_visible()
    pedidos = pedidos_por_pieza_c2(piezas[0][0])
    assert len(pedidos) == 1, "la fixture T5 necesita un único pedido independiente"
    return pedidos[0]


def abrir_editor_cotizacion_c2(page: Page, pedido: dict):
    cerrar_hojas(page)
    if page.locator("nav button:visible").count() > 0:
        ir_a(page, "Inicio")
        page.get_by_role("button", name=re.compile("Encargos")).click()
    principal = page.locator("main:visible").last
    principal.get_by_role("button", name=re.compile("^Todos")).click()
    principal.get_by_role("button", name=re.compile(re.escape(pedido["codigo"]) + r"\b")).click()
    detalle = page.get_by_role("dialog", name="Ana Prueba", exact=True)
    expect(detalle).to_be_visible()
    accion = detalle.get_by_role("button", name=re.compile(r"^(Cotizar|Cambiar precios)$"))
    expect(accion).to_be_visible()
    accion.click()
    editor = page.get_by_role("dialog", name=re.compile(r"^(Cotizar|Precios de) " + re.escape(pedido["codigo"]) + "$"))
    expect(editor).to_be_visible()
    return editor


def repositorio_ventas_fixture_c2(page: Page, accion: str, dato: dict):
    """Sólo preparación: la conducta bajo prueba se ejecuta por la interfaz."""
    return page.evaluate("""async ({accion, dato}) => {
      const url = performance.getEntriesByType('resource').map(r => r.name)
        .find(url => new URL(url).pathname.endsWith('/ventas.repo.ts'));
      if (!url) throw new Error('No se encontró el repositorio local de ventas');
      const { VentasRepoFirestore: ventas } = await import(url);
      if (accion === 'enviada') {
        await ventas.marcarEnviada(dato.id, crypto.randomUUID(), dato.version);
        return;
      }
      const pagosUrl = new URL(url);
      pagosUrl.pathname = pagosUrl.pathname.replace('/ventas.repo.ts', '/pagos.repo.ts');
      const { PagosRepoFirestore: pagos } = await import(pagosUrl.href);
      const fecha = new Intl.DateTimeFormat('en-CA').format(new Date());
      const id = await ventas.crear({
        tipo: 'ENCARGO', cliente_id: dato.cliente_id, fecha, anticipo_bp: 10000,
        lineas: [
          { descripcion: 'Bolso C2 cotizar sobrepago', cantidad: 1, precio_unitario_usd_cents: 6000 },
          { descripcion: 'Gloss C2 cotizar sobrepago', cantidad: 1, precio_unitario_usd_cents: 2000 },
        ],
      }, crypto.randomUUID());
      await pagos.registrar({ venta_id: id, fecha, monto_cents: 3000,
        moneda: 'USD', metodo: 'EFECTIVO' }, crypto.randomUUID());
      return id;
    }""", {"accion": accion, "dato": dato})


@caso("C2 · cotizar estima costo unitario exacto y descarta sin perder el precio original")
def caso_c2_cotizar_costo_y_descarte(page: Page) -> list[str]:
    parametros = leer_doc("parametros", "sistema")
    assert int(parametros["tax_bp"]) == 700 and int(parametros["tarifa_envio_cents_lb"]) == 700
    pedido = crear_pedido_cotizar_c2(page, [
        ("Bolso C2 cotizar dos unidades", "2", ""),
        ("Gloss C2 cotizar descartado", "1", "12.50"),
    ])
    bodega = foto_bodega_pedido_c2()
    movimientos = listar_coleccion("movimientos_inventario")
    editor = abrir_editor_cotizacion_c2(page, pedido)
    bolso = editor.get_by_role("group", name="Bolso C2 cotizar dos unidades", exact=True)
    tienda = bolso.get_by_label("Precio en tienda ($)", exact=True)
    peso = bolso.get_by_label("Peso por pieza (lb)", exact=True)
    expect(tienda).to_have_attribute("inputmode", "decimal")
    expect(peso).to_have_attribute("inputmode", "decimal")
    tienda.fill("10")
    peso.fill("1")
    expect(bolso.get_by_label("Costo por pieza ($)", exact=True)).to_have_value("17.70")
    precio = bolso.get_by_label("Precio por pieza ($)", exact=True)
    expect(precio).to_have_attribute("inputmode", "decimal")
    precio.fill("30")
    gloss = editor.get_by_role("group", name="Gloss C2 cotizar descartado", exact=True)
    gloss.get_by_role("button", name="No se consiguió", exact=True).click()
    expect(gloss.get_by_role("button", name="No se consiguió", exact=True)).to_have_attribute("aria-pressed", "true")
    editor.get_by_role("button", name="Guardar cotización", exact=True).click()
    expect(editor).not_to_be_visible()
    actual = leer_doc("ventas", str(pedido["id"]))
    assert actual["total_usd_cents"] == 6000 and actual["subtotal_usd_cents"] == 6000
    assert actual["costo_total_usd_cents"] == 3540 and actual["saldo_usd_cents"] == 6000
    primera = next(l for l in actual["lineas"] if l["descripcion"] == "Bolso C2 cotizar dos unidades")
    assert primera["cantidad"] == 2 and primera["precio_unitario_usd_cents"] == 3000
    assert primera["precio_tienda_usd_cents"] == 1000 and primera["peso_mlb"] == 1000
    assert primera["costo_unitario_usd_cents"] == 1770 and primera["costo_total_usd_cents"] == 3540
    descartada = next(l for l in actual["lineas"] if l["descripcion"] == "Gloss C2 cotizar descartado")
    assert descartada["descartada_el"] and descartada["precio_unitario_usd_cents"] == 1250
    assert descartada["subtotal_usd_cents"] == 0 and descartada["costo_total_usd_cents"] == 0
    assert actual["cotizacion_version"] == pedido.get("cotizacion_version", 0) + 1
    assert actual["piezas"]["descartadas"] == 1 and actual["piezas"]["sin_precio"] == 0
    assert foto_bodega_pedido_c2() == bodega
    assert listar_coleccion("movimientos_inventario") == movimientos
    cerrar_hojas(page)
    expect(page.locator("main:visible").last.get_by_role("region", name="Por mandar", exact=True)).to_contain_text(actual["codigo"])
    volver_desde_encargos_c2(page)
    return []


@caso("C2 · cotizar de nuevo una versión enviada vuelve a Por mandar")
def caso_c2_cotizar_version_enviada(page: Page) -> list[str]:
    pedido = crear_pedido_cotizar_c2(page, [("Bolso C2 cotizar versión enviada", "2", "30")])
    # Preparar una cotización ya enviada sin depender de la UI todavía ausente
    # de T6. No se simula acá el gesto de mandar: sólo el de cambiar su precio.
    repositorio_ventas_fixture_c2(page, "enviada", {"id": pedido["id"], "version": pedido.get("cotizacion_version", 0)})
    enviada = leer_doc("ventas", str(pedido["id"]))
    assert enviada["cotizacion_enviada_version"] == enviada.get("cotizacion_version", 0)
    page.reload()
    expect(page.locator("nav button:visible")).to_have_count(5)
    editor = abrir_editor_cotizacion_c2(page, enviada)
    pieza = editor.get_by_role("group", name="Bolso C2 cotizar versión enviada", exact=True)
    pieza.get_by_label("Precio por pieza ($)", exact=True).fill("31")
    editor.get_by_role("button", name="Guardar cotización", exact=True).click()
    expect(editor).not_to_be_visible()
    actual = leer_doc("ventas", str(pedido["id"]))
    assert actual["total_usd_cents"] == 6200
    assert actual["cotizacion_version"] == enviada.get("cotizacion_version", 0) + 1
    assert actual["cotizacion_enviada_version"] == enviada["cotizacion_enviada_version"]
    assert actual["cotizacion_enviada_el"] == enviada["cotizacion_enviada_el"]
    cerrar_hojas(page)
    expect(page.locator("main:visible").last.get_by_role("region", name="Por mandar", exact=True)).to_contain_text(actual["codigo"])
    volver_desde_encargos_c2(page)
    return []


@caso("C2 · cotizar rechaza sobrepago sin escrituras parciales y conserva el borrador")
def caso_c2_cotizar_sobrepago(page: Page) -> list[str]:
    ana = next(c for c in listar_coleccion("clientes") if c.get("nombre") == "Ana Prueba")
    venta_id = repositorio_ventas_fixture_c2(page, "sobrepago", {"cliente_id": ana["id"]})
    pedido = leer_doc("ventas", str(venta_id))
    assert pedido["estado"] == "COTIZADA" and pedido["pagado_usd_cents"] == 3000
    assert pedido["total_usd_cents"] == 8000 and pedido["anticipo_esperado_usd_cents"] == 8000
    page.reload()
    expect(page.locator("nav button:visible")).to_have_count(5)
    editor = abrir_editor_cotizacion_c2(page, pedido)
    antes = leer_doc("ventas", str(venta_id))
    pagos = listar_coleccion("pagos")
    eventos = listar_coleccion("eventos")
    bodega = foto_bodega_pedido_c2()
    movimientos = listar_coleccion("movimientos_inventario")
    pieza = editor.get_by_role("group", name="Bolso C2 cotizar sobrepago", exact=True)
    pieza.get_by_role("button", name="No se consiguió", exact=True).click()
    editor.get_by_role("button", name="Guardar cotización", exact=True).click()
    expect(editor.get_by_role("alert")).to_contain_text("Corregí el pago")
    expect(editor).to_be_visible()
    expect(pieza.get_by_role("button", name="No se consiguió", exact=True)).to_have_attribute("aria-pressed", "true")
    expect(editor.get_by_role("group", name="Gloss C2 cotizar sobrepago", exact=True)
        .get_by_label("Precio por pieza ($)", exact=True)).to_have_value("20.00")
    assert leer_doc("ventas", str(venta_id)) == antes
    assert listar_coleccion("pagos") == pagos and listar_coleccion("eventos") == eventos
    assert foto_bodega_pedido_c2() == bodega and listar_coleccion("movimientos_inventario") == movimientos
    cerrar_hojas(page)
    volver_desde_encargos_c2(page)
    return []


def modulo_t6(ruta: str) -> str:
    return "/@fs/" + (Path(__file__).resolve().parents[2] / ruta).as_posix()


def preparar_mandar_c2(page: Page, sufijo: str):
    """Cotizada con tasa vieja y abono pequeño COR: sigue sin aceptar."""
    cliente = next(c for c in listar_coleccion("clientes") if c.get("nombre") == "Clienta C2")
    rutas = {"ventas": modulo_t6("src/main/firebase/repositories/ventas.repo.ts"),
             "pagos": modulo_t6("src/main/firebase/repositories/pagos.repo.ts"),
             "parametros": modulo_t6("src/main/firebase/repositories/parametros.repo.ts"),
             "mensajes": modulo_t6("src/core/documentos/mensajes.ts")}
    descripcion = "Perfume C2 mandar " + sufijo
    fixture = page.evaluate("""async ({rutas, cliente, descripcion}) => {
      const {VentasRepoFirestore: V} = await import(rutas.ventas);
      const {PagosRepoFirestore: P} = await import(rutas.pagos);
      const {ParametrosRepoFirestore: A} = await import(rutas.parametros);
      const M = await import(rutas.mensajes);
      const parametros = await A.getParametros();
      const g = () => crypto.randomUUID();
      let id;
      try {
        await A.actualizar({tasa_cambio_cents: 3600}, g());
        id = await V.crear({cliente_id: cliente, fecha: '2026-10-01', tipo: 'ENCARGO',
          anticipo_bp: 5000, lineas: [{descripcion, cantidad: 1,
          precio_unitario_usd_cents: 0}]}, g());
        const sinPrecio = await V.getById(id);
        await V.cotizar(id, [{id: sinPrecio.lineas[0].id,
          precio_unitario_usd_cents: 3000}], g());
        await P.registrar({venta_id: id, fecha: '2026-10-01', monto_cents: 3600,
          moneda: 'COR', metodo: 'EFECTIVO'}, g());
      } finally {
        await A.actualizar({tasa_cambio_cents: parametros.tasa_cambio_cents}, g());
      }
      const venta = await V.getById(id);
      return {id, descripcion, mensaje: M.mensajeWhatsappDocumento(venta, parametros),
        enlace: M.enlaceWhatsappDocumento(venta, parametros)};
    }""", {"rutas": rutas, "cliente": cliente["id"], "descripcion": descripcion})
    original = leer_doc("ventas", str(fixture["id"]))
    assert original["estado"] == "COTIZADA" and original["pagado_usd_cents"] == 100
    assert original["tasa_cambio_cents"] == 3600
    arnes.abrir_app(page)
    ir_a(page, "Inicio")
    page.get_by_role("button", name=re.compile("Encargos")).click()
    principal = page.locator("main:visible").last
    principal.get_by_role("button", name=re.compile("^Todos")).click()
    principal.get_by_role("button", name=re.compile(re.escape(descripcion))).click()
    detalle = page.get_by_role("dialog").last
    expect(detalle.get_by_role("button", name="Mandar cotización", exact=True)).to_be_visible()
    detalle.get_by_role("button", name="Mandar cotización", exact=True).click()
    hoja = page.get_by_role("dialog", name="Mandar cotización", exact=True)
    expect(hoja).to_be_visible()
    return fixture, original, hoja


def sin_escrituras_mandar_c2(original: dict, eventos: list[dict]) -> None:
    assert leer_doc("ventas", str(original["id"])) == original, "abrir/copiar/imprimir/WhatsApp modificó el encargo"
    assert listar_coleccion("eventos") == eventos, "una vista previa confirmó la cotización sin el gesto explícito"


def interceptar_salidas_mandar_c2(page: Page) -> None:
    """Intercepta salidas, conservando generación y DOM real de la proforma."""
    page.evaluate("""() => {
      window.__t6 = {copias: [], enlaces: [], impresos: [], rechazarCopia: false};
      window.__t6Descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
      Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {
        writeText: async texto => {
          if (window.__t6.rechazarCopia) throw new DOMException('Permiso denegado', 'NotAllowedError');
          window.__t6.copias.push(texto);
        }
      }});
      window.__t6Click = e => {
        const enlace = e.target.closest?.('a');
        if (enlace && ['wa.me', 'api.whatsapp.com'].includes(new URL(enlace.href).hostname)) {
          e.preventDefault(); window.__t6.enlaces.push(enlace.href);
        }
      };
      document.addEventListener('click', window.__t6Click, true);
      window.__t6Append = Node.prototype.appendChild;
      Node.prototype.appendChild = function (nodo) {
        const resultado = window.__t6Append.call(this, nodo);
        // Sólo el iframe de impresión: la vista previa de "Ver proforma" se
        // arma fuera del documento y todavía no tiene ventana.
        if (nodo instanceof HTMLIFrameElement && nodo.contentWindow) {
          nodo.contentWindow.print = () => window.__t6.impresos.push(nodo.contentDocument.documentElement.outerHTML);
          nodo.contentWindow.focus = () => {};
        }
        return resultado;
      };
    }""")


def restaurar_salidas_mandar_c2(page: Page) -> None:
    page.evaluate("""() => {
      if (window.__t6Append) Node.prototype.appendChild = window.__t6Append;
      if (window.__t6Click) document.removeEventListener('click', window.__t6Click, true);
      if (window.__t6Descriptor) Object.defineProperty(navigator, 'clipboard', window.__t6Descriptor);
      else delete navigator.clipboard;
    }""")


@caso("C2 · mandar cotización conserva la fase hasta confirmar que la mandó")
def caso_c2_mandar_confirmacion(page: Page) -> list[str]:
    fixture, original, hoja = preparar_mandar_c2(page, "confirmacion")
    eventos = listar_coleccion("eventos")
    interceptar_salidas_mandar_c2(page)
    try:
        mensaje = hoja.get_by_label("Mensaje para la clienta", exact=True)
        assert mensaje.inner_text().strip() == fixture["mensaje"].strip(), "la vista debe usar el mensaje original compartido"
        expect(hoja.locator("textarea, [contenteditable='true']")).to_have_count(0)
        assert "C$1,080.00" in fixture["mensaje"], "el mensaje usa la tasa congelada36, no la actual37"
        sin_escrituras_mandar_c2(original, eventos)
        hoja.get_by_role("button", name="Copiar mensaje", exact=True).click()
        expect(page.get_by_role("status").filter(has_text="Mensaje copiado")).to_be_visible()
        assert page.evaluate("window.__t6.copias") == [fixture["mensaje"]]
        hoja.get_by_role("link", name="WhatsApp", exact=True).click()
        assert page.evaluate("window.__t6.enlaces") == [fixture["enlace"]]
        sin_escrituras_mandar_c2(original, eventos)
        # Dos toques seguidos abren una sola impresión (revisión del 10/10).
        hoja.get_by_role("button", name="Guardar PDF", exact=True).evaluate("b => {b.click(); b.click();}")
        page.wait_for_function("window.__t6.impresos.length >= 1")
        page.wait_for_timeout(900)
        assert page.evaluate("window.__t6.impresos.length") == 1, "dos toques abrieron dos impresiones"
        html = page.evaluate("window.__t6.impresos[0]")
        assert fixture["descripcion"] in html and "$30.00" in html and "C$1,080.00" in html
        assert "C$36.00" in html, "la proforma debe mostrar el abono en su moneda"
        sin_escrituras_mandar_c2(original, eventos)
        hoja.get_by_role("button", name="Cerrar", exact=True).click()
        expect(hoja).not_to_be_visible()
        sin_escrituras_mandar_c2(original, eventos)
        page.get_by_role("dialog").last.get_by_role("button", name="Mandar cotización", exact=True).click()
        expect(hoja).to_be_visible()
        hoja.get_by_role("button", name="Ya la mandé", exact=True).evaluate("b => {b.click(); b.click();}")
        expect(hoja).not_to_be_visible()
        despues = leer_doc("ventas", str(original["id"]))
        assert despues["cotizacion_enviada_version"] == original["cotizacion_version"]
        assert despues["estado"] == "COTIZADA", "mandar todavía no significa que aceptó"
        assert despues["pagado_usd_cents"] == original["pagado_usd_cents"]
        nuevos = [e for e in listar_coleccion("eventos") if e["id"] not in {a["id"] for a in eventos}]
        assert len(nuevos) == 1, "doble toque debe registrar un solo envío"
        detalle = page.get_by_role("dialog").last
        expect(detalle).to_contain_text(re.compile("Esperando|respuesta", re.I))
        assert page.evaluate("window.__t6.enlaces.length") == 1
        page.evaluate("""async ({ruta, id}) => {
          const {VentasRepoFirestore: V} = await import(ruta);
          const actual = await V.getById(id);
          await V.cotizar(id, [{id: actual.lineas[0].id,
            precio_unitario_usd_cents: 3500}], crypto.randomUUID());
        }""", {"ruta": modulo_t6("src/main/firebase/repositories/ventas.repo.ts"), "id": fixture["id"]})
        recotizada = leer_doc("ventas", str(original["id"]))
        assert recotizada["cotizacion_version"] > recotizada["cotizacion_enviada_version"]
        restaurar_salidas_mandar_c2(page)
        arnes.abrir_app(page)
        ir_a(page, "Inicio")
        page.get_by_role("button", name=re.compile("Encargos")).click()
        expect(page.get_by_role("region", name="Por mandar", exact=True)).to_contain_text(fixture["descripcion"])
    finally:
        restaurar_salidas_mandar_c2(page)
        cerrar_hojas(page)
        volver_desde_encargos_c2(page)
    return []


@caso("C2 · mandar informa copia rechazada y reintenta guardar sin repetir WhatsApp")
def caso_c2_mandar_errores(page: Page) -> list[str]:
    fixture, original, hoja = preparar_mandar_c2(page, "errores")
    eventos = listar_coleccion("eventos")
    interceptar_salidas_mandar_c2(page)
    repos = modulo_t6("src/main/firebase/repositories/ventas.repo.ts")
    try:
        page.evaluate("window.__t6.rechazarCopia = true")
        hoja.get_by_role("button", name="Copiar mensaje", exact=True).click()
        expect(hoja.get_by_role("alert")).to_contain_text(re.compile("copiar|permiso|seleccion", re.I))
        expect(page.get_by_role("status").filter(has_text="Mensaje copiado")).to_have_count(0)
        assert page.evaluate("window.__t6.copias") == []
        assert hoja.get_by_label("Mensaje para la clienta", exact=True).inner_text().strip() == fixture["mensaje"].strip()
        sin_escrituras_mandar_c2(original, eventos)
        hoja.get_by_role("link", name="WhatsApp", exact=True).click()
        # Falla controlada sólo de la frontera de escritura. El reintento sí
        # llama al método original y se verifica contra el emulador real.
        page.evaluate("""async ruta => {
          const {VentasRepoFirestore: V} = await import(ruta);
          window.__t6MarcarOriginal = V.marcarEnviada;
          let fallar = true;
          V.marcarEnviada = async (...args) => {
            if (fallar) { fallar = false; throw new Error('No se pudo guardar el envío. Probá de nuevo.'); }
            return window.__t6MarcarOriginal.apply(V, args);
          };
        }""", repos)
        hoja.get_by_role("button", name="Ya la mandé", exact=True).click()
        expect(hoja.get_by_role("alert")).to_contain_text("No se pudo guardar el envío")
        expect(hoja).to_be_visible()
        sin_escrituras_mandar_c2(original, eventos)
        hoja.get_by_role("button", name="Ya la mandé", exact=True).click()
        expect(hoja).not_to_be_visible()
        assert leer_doc("ventas", str(original["id"]))["cotizacion_enviada_version"] == original["cotizacion_version"]
        assert page.evaluate("window.__t6.enlaces") == [fixture["enlace"]], "reintentar escritura volvió a abrir WhatsApp"
    finally:
        page.evaluate("""async ruta => {
          const {VentasRepoFirestore: V} = await import(ruta);
          if (window.__t6MarcarOriginal) V.marcarEnviada = window.__t6MarcarOriginal;
        }""", repos)
        restaurar_salidas_mandar_c2(page)
        cerrar_hojas(page)
        volver_desde_encargos_c2(page)
    return []


@caso("C2 · mandar rechaza la versión que cambió mientras estaba abierta")
def caso_c2_mandar_version(page: Page) -> list[str]:
    fixture, original, hoja = preparar_mandar_c2(page, "version")
    # Otra sesión recotiza por el repositorio real mientras sigue visible la
    # versión anterior. No puede marcar como mandada la nueva que no mostró.
    page.evaluate("""async ({ruta, id}) => {
      const {VentasRepoFirestore: V} = await import(ruta);
      const actual = await V.getById(id);
      await V.cotizar(id, [{id: actual.lineas[0].id,
        precio_unitario_usd_cents: 3500}], crypto.randomUUID());
    }""", {"ruta": modulo_t6("src/main/firebase/repositories/ventas.repo.ts"), "id": fixture["id"]})
    recotizada = leer_doc("ventas", str(original["id"]))
    assert recotizada["cotizacion_version"] > original["cotizacion_version"]
    eventos = listar_coleccion("eventos")
    hoja.get_by_role("button", name="Ya la mandé", exact=True).click()
    expect(hoja.get_by_role("alert")).to_contain_text(re.compile("cotización cambió|volvé a verla|actualizada", re.I))
    expect(hoja).to_be_visible()
    sin_escrituras_mandar_c2(recotizada, eventos)
    cerrar_hojas(page)
    volver_desde_encargos_c2(page)
    return []


@caso("C2 · el ciclo entero en el celular: anotar, cotizar, mandar y aceptar")
def caso_c2_ciclo_completo(page: Page) -> list[str]:
    """
    Cada hoja tiene su caso; éste las encadena por la interfaz, como lo hace
    Ross: un pedido sin precio, cotizado, mandado y aceptado sin pago. Lo que
    se prueba es que cada paso deja el detalle listo para el siguiente.
    """
    descripcion = "Cartera C2 ciclo completo"
    bodega = foto_bodega_pedido_c2()
    pagos = listar_coleccion("pagos")

    hoja = abrir_pedido_c2(page)
    elegir_clienta_pedido_c2(page, hoja)
    pieza = pieza_pedido_c2(hoja)
    pieza.get_by_label("Qué quiere", exact=True).fill(descripcion)
    pieza.get_by_label("Cantidad", exact=True).fill("1")
    hoja.get_by_role("button", name="Guardar pedido", exact=True).click()
    expect(hoja).not_to_be_visible()
    pedidos = pedidos_por_pieza_c2(descripcion)
    assert len(pedidos) == 1, "anotar crea un solo pedido"
    pedido = pedidos[0]
    assert pedido["estado"] == "COTIZADA" and pedido["total_usd_cents"] == 0

    editor = abrir_editor_cotizacion_c2(page, pedido)
    expect(editor).to_have_accessible_name("Cotizar " + pedido["codigo"])
    editor.get_by_role("group", name=descripcion, exact=True).get_by_label("Precio por pieza ($)", exact=True).fill("40")
    editor.get_by_role("button", name="Guardar cotización", exact=True).click()
    expect(editor).not_to_be_visible()
    cotizado = leer_doc("ventas", str(pedido["id"]))
    assert cotizado["total_usd_cents"] == 4000 and cotizado["estado"] == "COTIZADA"

    detalle = page.get_by_role("dialog", name="Ana Prueba", exact=True)
    mandar = detalle.get_by_role("button", name="Mandar cotización", exact=True)
    expect(mandar).to_be_visible()
    mandar.click()
    hoja_mandar = page.get_by_role("dialog", name="Mandar cotización", exact=True)
    expect(hoja_mandar).to_be_visible()
    hoja_mandar.get_by_role("button", name="Ya la mandé", exact=True).click()
    expect(hoja_mandar).not_to_be_visible()
    mandado = leer_doc("ventas", str(pedido["id"]))
    assert mandado["cotizacion_enviada_version"] == mandado["cotizacion_version"]

    aceptar = detalle.get_by_role("button", name="Aceptó", exact=True)
    expect(aceptar).to_be_visible()
    aceptar.click()
    eleccion = page.get_by_role("dialog", name=re.compile(r" aceptó$"))
    eleccion.get_by_role("button", name="Todavía no", exact=True).click()
    eleccion.get_by_role("button", name="Aceptó", exact=True).click()
    expect(eleccion).not_to_be_visible()
    final = leer_doc("ventas", str(pedido["id"]))
    assert final["estado"] == "PENDIENTE" and final["total_usd_cents"] == 4000
    assert final["pagado_usd_cents"] == 0 and final["saldo_usd_cents"] == 4000
    assert listar_coleccion("pagos") == pagos, "aceptar sin pago no registra abonos"
    assert foto_bodega_pedido_c2() == bodega, "un encargo no toca la bodega"
    cerrar_hojas(page)
    expect(page.locator("main:visible").last.get_by_role("region", name="Por comprar", exact=True)).to_contain_text(descripcion)
    volver_desde_encargos_c2(page)
    return []


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
                traceback.print_exc()
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
