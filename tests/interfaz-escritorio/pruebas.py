"""
Pruebas de interfaz de la app de escritorio.

La PWA ya tenía las suyas en `tests/interfaz/`; la ventana de Windows no tenía
ninguna. Esta suite abre el paquete ya construido en un navegador y aprieta lo
que aprieta una persona.

Los datos se cargan llamando a la MISMA api que usa la pantalla (`window.api`),
que en el navegador es el simulador. No hay ningún gancho de pruebas metido en
el código: lo que se prueba es lo que se publica.

Se corre con:  npm run test:interfaz-escritorio
"""
import sys
from playwright.sync_api import sync_playwright, Page

URL = "http://127.0.0.1:5199"
RUIDO = ("ERR_NETWORK_IO_SUSPENDED", "ResizeObserver", "favicon")

CASOS = []


def caso(nombre):
    def envolver(fn):
        CASOS.append((nombre, fn))
        return fn
    return envolver


def sembrar_venta_vieja(page: Page) -> dict:
    """Una venta de hace ocho meses, a nombre de una clienta con tilde."""
    return page.evaluate("""async () => {
      const rc = await window.api.clientes.list('Lopez');
      const cliente = rc.data[0] || (await window.api.clientes.list('')).data[0];
      const d = new Date();
      d.setMonth(d.getMonth() - 8);
      const fecha = d.toISOString().slice(0, 10);
      const r = await window.api.ventas.crear({
        cliente_id: cliente.id,
        fecha,
        tipo: 'INVENTARIO',
        lineas: [{ descripcion: 'Bolso viejo', cantidad: 1, precio_unitario_usd_cents: 9000 }],
      });
      const v = await window.api.ventas.get(r.data.id);
      return { id: r.data.id, fecha, cliente: cliente.nombre, codigo: v.data.codigo };
    }""")


def ir_a_ventas(page: Page) -> None:
    page.get_by_role("button", name="Ventas", exact=True).click()
    page.wait_for_timeout(1200)


def caja_busqueda(page: Page):
    return page.locator("input[placeholder*='Buscar por clienta']")


@caso("la lista de ventas abre acotada al período, no a la historia entera")
def caso_ventana(page: Page) -> list[str]:
    venta = sembrar_venta_vieja(page)
    page.venta_vieja = venta  # type: ignore[attr-defined]
    ir_a_ventas(page)

    if venta["codigo"] in page.inner_text("body"):
        return [f"{venta['codigo']} es de hace ocho meses y aparece en 'Este mes'"]
    return []


@caso("buscar el nombre de la clienta trae su venta de fuera del período")
def caso_buscar_clienta(page: Page) -> list[str]:
    venta = page.venta_vieja  # type: ignore[attr-defined]
    fallas = []

    caja = caja_busqueda(page)
    if caja.count() != 1:
        return ["no hay caja de búsqueda en la pantalla de ventas"]

    # A propósito SIN tilde: es como se escribe de verdad.
    caja.fill("Lopez")
    page.wait_for_timeout(1800)

    cuerpo = page.inner_text("body")
    if venta["codigo"] not in cuerpo:
        fallas.append(f"buscando 'Lopez' no apareció {venta['codigo']}")
    if "fuera del per" not in cuerpo:
        fallas.append("la pantalla no avisa que hay resultados fuera del período")
    return fallas


@caso("buscar el código de la venta la encuentra")
def caso_buscar_codigo(page: Page) -> list[str]:
    venta = page.venta_vieja  # type: ignore[attr-defined]
    caja = caja_busqueda(page)
    caja.fill("")
    page.wait_for_timeout(400)
    caja.fill(venta["codigo"])
    page.wait_for_timeout(1800)

    if venta["codigo"] not in page.inner_text("body"):
        return [f"buscando {venta['codigo']} no apareció la venta"]
    return []


@caso("limpiar la búsqueda devuelve la lista al período")
def caso_limpiar(page: Page) -> list[str]:
    venta = page.venta_vieja  # type: ignore[attr-defined]
    page.locator("button[aria-label='Limpiar búsqueda']").click()
    page.wait_for_timeout(900)

    if venta["codigo"] in page.inner_text("body"):
        return ["después de limpiar, la lista sigue mostrando lo de fuera del período"]
    return []


@caso("se puede recorrer la app sin que quede la ventana en blanco")
def caso_recorrido(page: Page) -> list[str]:
    fallas = []
    for pantalla in ("Inicio", "Inventario", "Paquetes", "Ventas", "Encargos",
                     "Cobros y Abonos", "Clientes"):
        try:
            page.get_by_role("button", name=pantalla, exact=False).first.click()
            page.wait_for_timeout(700)
        except Exception as err:
            fallas.append(f"no se pudo abrir '{pantalla}': {str(err)[:120]}")
            continue

        texto = page.inner_text("body").strip()
        if len(texto) < 40:
            fallas.append(f"'{pantalla}' quedó prácticamente vacía")
        if "Algo se rompió" in texto or "Something went wrong" in texto:
            fallas.append(f"'{pantalla}' mostró la pantalla de error")
    return fallas


@caso("no quedan errores de consola")
def caso_consola(page: Page) -> list[str]:
    return []  # lo evalúa el corredor al final


def main() -> int:
    total = 0
    with sync_playwright() as p:
        navegador = p.chromium.launch(headless=True)
        contexto = navegador.new_context(viewport={"width": 1440, "height": 900},
                                         bypass_csp=True)
        page = contexto.new_page()
        errores: list[str] = []
        page.on("pageerror", lambda e: errores.append(str(e)))
        page.on("console", lambda m: errores.append(m.text) if m.type == "error" else None)

        page.goto(URL)
        page.wait_for_selector("button:has-text('Inicio')", timeout=30000)

        for nombre, fn in CASOS:
            try:
                fallas = fn(page)
            except Exception as err:
                fallas = [f"la prueba se rompió: {str(err)[:200]}"]

            if nombre == "no quedan errores de consola":
                fallas = [f"error de consola: {e[:160]}" for e in errores
                          if not any(n in e for n in RUIDO)]

            if fallas:
                total += len(fallas)
                print(f"  x  {nombre}")
                for f in fallas:
                    print(f"       {f}")
            else:
                print(f"  ok {nombre}")

        navegador.close()

    print("\nAPROBADO" if total == 0 else f"\n{total} FALLA(S)")
    return 0 if total == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
