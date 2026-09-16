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

# La consola de Windows no habla UTF-8 por omisión, y un acento en el mensaje
# de una falla tumbaba la corrida entera: la prueba encontraba el problema y
# después se moría al contarlo.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

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


@caso("la lista se trae de a pedazos y el botón trae más, sin repetir")
def caso_paginacion(page: Page) -> list[str]:
    fallas = []

    # Sesenta ventas de este mes: más de una página.
    page.evaluate("""async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      for (let i = 0; i < 60; i++) {
        await window.api.ventas.crear({
          fecha: hoy,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'lote ' + i, cantidad: 1, precio_unitario_usd_cents: 500 + i }],
        });
      }
    }""")

    # Volver a entrar a la pantalla para que recargue.
    page.get_by_role("button", name="Inicio", exact=True).click()
    page.wait_for_timeout(600)
    ir_a_ventas(page)

    def codigos_en_pantalla() -> list[str]:
        import re
        return re.findall("V-" + chr(92) + "d{4}", page.inner_text("body"))

    primera = codigos_en_pantalla()
    if not primera:
        return ["la pantalla de ventas no muestra ninguna venta"]
    if len(primera) > 55:
        fallas.append(f"la primera carga trajo {len(primera)} ventas: no se está acotando")

    boton = page.get_by_role("button", name="Ver ventas más antiguas")
    if boton.count() == 0:
        fallas.append("con más de una página, no apareció el botón para traer más")
        return fallas

    boton.click()
    page.wait_for_timeout(1500)

    segunda = codigos_en_pantalla()
    if len(segunda) <= len(primera):
        fallas.append(f"tras pedir más quedaron {len(segunda)} y antes había {len(primera)}")
    if len(segunda) != len(set(segunda)):
        repetidos = len(segunda) - len(set(segunda))
        fallas.append(f"la segunda página repitió {repetidos} venta(s) de la primera")

    return fallas


@caso("el inventario se puede mirar paquete por paquete")
def caso_paquetes(page: Page) -> list[str]:
    fallas = []

    # Dos paquetes con productos distintos, los dos recibidos.
    datos = page.evaluate("""async () => {
      const hoy = new Date().toISOString().slice(0, 10);
      const armar = async (nombres) => {
        const r = await window.api.compras.guardar({
          fecha: hoy,
          envio_total_usd_cents: 1000,
          lineas: nombres.map((n) => ({
            descripcion: n, cantidad: 3, precio_linea_usd_cents: 4000,
            peso_linea_mlb: 100, destino: 'INVENTARIO',
          })),
        });
        const id = r.data.id;
        await window.api.compras.recibir(id);
        const c = await window.api.compras.get(id);
        return { id, codigo: c.data.codigo };
      };
      const uno = await armar(['Gloss del uno', 'Labial del uno']);
      const dos = await armar(['Bolso del dos']);
      return { uno, dos };
    }""")

    page.get_by_role("button", name="Inventario", exact=False).first.click()
    page.wait_for_timeout(1500)

    selector = page.locator("select[aria-label='Filtrar por paquete']")
    if selector.count() == 0:
        return ["no hay selector de paquete en el inventario"]

    # Sin filtrar se ven los tres.
    cuerpo = page.inner_text("body")
    for nombre in ("Gloss del uno", "Labial del uno", "Bolso del dos"):
        if nombre not in cuerpo:
            fallas.append(f"sin filtrar no aparece '{nombre}'")

    # El código del paquete se ve en la fila, sin tener que filtrar.
    if datos["uno"]["codigo"] not in cuerpo:
        fallas.append(f"la fila no muestra de qué paquete vino ({datos['uno']['codigo']})")

    # Filtrando por el primero: sólo lo suyo.
    selector.select_option(str(datos["uno"]["id"]))
    page.wait_for_timeout(1500)
    cuerpo = page.inner_text("body")
    if "Bolso del dos" in cuerpo:
        fallas.append("filtrando por el primer paquete se cuela un producto del segundo")
    for nombre in ("Gloss del uno", "Labial del uno"):
        if nombre not in cuerpo:
            fallas.append(f"filtrando por su paquete no aparece '{nombre}'")

    # Filtrando por el segundo: sólo lo suyo.
    selector.select_option(str(datos["dos"]["id"]))
    page.wait_for_timeout(1500)
    cuerpo = page.inner_text("body")
    if "Gloss del uno" in cuerpo:
        fallas.append("filtrando por el segundo paquete se cuela un producto del primero")
    if "Bolso del dos" not in cuerpo:
        fallas.append("filtrando por su paquete no aparece 'Bolso del dos'")

    # Volver a todos.
    selector.select_option("")
    page.wait_for_timeout(1200)
    if "Gloss del uno" not in page.inner_text("body"):
        fallas.append("al quitar el filtro no vuelven a verse todos los productos")

    return fallas


@caso("se puede bajar cada planilla, y trae lo que dice traer")
def caso_exportar(page: Page) -> list[str]:
    import io as _io
    fallas = []

    page.get_by_role("button", name="Configuración", exact=False).first.click()
    page.wait_for_timeout(1500)

    esperados = ["Ventas", "Abonos", "Paquetes", "Clientas", "Inventario"]
    cuerpo = page.inner_text("body")
    for nombre in esperados:
        if nombre not in cuerpo:
            fallas.append(f"no aparece la opcion de exportar {nombre}")

    botones = page.get_by_role("button", name="Bajar")
    if botones.count() != len(esperados):
        fallas.append(f"hay {botones.count()} botones de bajar y se esperaban {len(esperados)}")
        return fallas

    # El rango: todo, para que las ventas del decorado entren.
    page.get_by_role("button", name="Todo", exact=True).first.click()
    page.wait_for_timeout(400)

    for i, nombre in enumerate(esperados):
        with page.expect_download(timeout=15000) as dl:
            botones.nth(i).click()
        archivo = dl.value
        ruta = archivo.path()
        contenido = _io.open(ruta, encoding="utf-8-sig").read()

        if not contenido.strip():
            fallas.append(f"el archivo de {nombre} salio vacio")
            continue
        # Encabezado con al menos tres columnas entre comillas.
        primera = contenido.split(chr(13) + chr(10))[0]
        if primera.count('"') < 6:
            fallas.append(f"el archivo de {nombre} no tiene encabezado: {primera[:60]!r}")
        if "Glow_Heaven" not in archivo.suggested_filename:
            fallas.append(f"el archivo de {nombre} se llama {archivo.suggested_filename!r}")

    return fallas


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
                                         bypass_csp=True, accept_downloads=True)
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
