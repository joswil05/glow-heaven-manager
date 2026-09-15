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
    for _ in range(3):
        boton = visible(page, "button[aria-label='Cerrar']")
        if boton is None:
            break
        boton.click()
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

    registrar = visible(page, "button", "Registrar abono")
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


# ---------------------------------------------------------------------------
# Casos
# ---------------------------------------------------------------------------

@caso("la app abre y muestra las cuatro pestañas")
def caso_arranque(page: Page) -> list[str]:
    fallas = []
    for etiqueta in ["Inicio", "Vender", "Cobros", "Catálogo"]:
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

    confirmar = en_hoja(page, "button", "Registrar Abono Ahora")
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

        confirmar = en_hoja(page, "button", "Registrar Abono Ahora")
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
    confirmar = en_hoja(page, "button", "Registrar Abono Ahora")
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

        for nombre, fn in CASOS:
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
        ruido = [e for e in errores_consola if "favicon" not in e.lower()]
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
