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
import re
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


def se_ve_de_verdad(loc) -> bool:
    """
    Si el elemento es lo que de verdad está en pantalla en su centro.

    Playwright considera visible un elemento recortado por un `overflow` del
    padre, y lo toca igual. Una persona no lo ve. `elementFromPoint` devuelve
    lo que está encima en ese punto, que es lo que ella tocaría.

    Sin `scroll_into_view_if_needed`: un contenedor con `overflow-hidden` se
    deja desplazar por código, y eso "arreglaba" el recorte justo antes de
    mirarlo. Con la lista recortada, la prueba pasaba en verde.
    """
    caja = loc.bounding_box()
    if not caja:
        return False
    centro = {"x": caja["x"] + caja["width"] / 2, "y": caja["y"] + caja["height"] / 2}
    return loc.evaluate(
        "(el, p) => { const t = document.elementFromPoint(p.x, p.y); return !!t && (el === t || el.contains(t)); }",
        centro,
    )


def fila_de(page: Page, texto: str):
    return page.locator("tr", has_text=texto).first


def abrir_detalle(page: Page, texto: str) -> None:
    """
    Abre el detalle del encargo, si no está abierto ya.

    Guardar un encargo nuevo deja abierto su detalle (lo que sigue es
    cotizarlo), y tocar la fila de un detalle abierto lo cierra.
    """
    detalle = page.locator('aside[aria-label^="Encargo"]')
    if detalle.count() > 0 and texto in detalle.first.inner_text():
        return
    fila_de(page, texto).click()
    page.wait_for_timeout(700)


def fase_de(page: Page, texto: str) -> str:
    """El texto de la fila del encargo, para ver en qué fase va."""
    return fila_de(page, texto).inner_text()


def ir_a_ventas(page: Page) -> None:
    page.get_by_role("button", name="Ventas", exact=True).click()
    page.wait_for_timeout(1200)


def caja_busqueda(page: Page):
    # Por su nombre accesible, no por el texto de ayuda: ese texto se acorta
    # cuando se limpia la interfaz y la prueba no tiene por qué romperse.
    return page.get_by_label("Buscar ventas")


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
                     "Cobros", "Clientes"):
        try:
            # Paquetes es una pestaña de Inventario, no una entrada del menú.
            rol = "tab" if pantalla == "Paquetes" else "button"
            page.get_by_role(rol, name=pantalla, exact=False).first.click()
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


@caso("un paquete registrado desde la pantalla entra con su 7% y su flete")
def caso_registrar_paquete(page: Page) -> list[str]:
    fallas = []
    pid = page.evaluate("""async () => {
      const r = await window.api.productos.crear({ nombre: 'Crema Nivea de prueba', modo_precio: 'MARGEN' });
      return r.data.id;
    }""")

    page.get_by_role("button", name="Inventario", exact=False).first.click()
    page.wait_for_timeout(800)
    page.get_by_role("button", name="Registrar paquete").first.click()
    page.wait_for_selector("text=Qué vino adentro", timeout=8000)

    page.get_by_label("Buscar producto para agregar").fill("Crema Nivea")
    resultado = page.get_by_role("button", name="Crema Nivea de prueba", exact=False).first
    # Existir no alcanza: en la 2.13.0 el resultado estaba en la página pero
    # recortado por el recuadro, y la prueba lo tocaba igual.
    if not se_ve_de_verdad(resultado):
        fallas.append("el resultado del buscador existe pero no se ve: algo lo tapa o lo recorta")
    resultado.click()
    page.get_by_label("Unidades de Crema Nivea de prueba").fill("10")
    page.get_by_label("Precio por unidad en la tienda").fill("5.00")
    page.get_by_label("Flete pagado").fill("10.00")
    page.wait_for_timeout(400)

    # La cuenta completa a la vista: $50 de tienda + $3.50 + $10 de flete.
    pie = page.inner_text("footer")
    for esperado in ("Mercadería $50.00", "Impuesto $3.50", "Flete $10.00", "Pagado $63.50"):
        if esperado not in pie:
            fallas.append(f"el pie del paquete no dice '{esperado}' (dice: {pie[:160]!r})")

    page.get_by_role("button", name="Pasar al inventario").click()
    page.get_by_role("button", name="Sí, pasarlo al inventario").click()
    page.wait_for_selector("text=está en el inventario", timeout=8000)
    page.get_by_role("button", name="Listo").click()
    page.wait_for_timeout(800)

    p = page.evaluate("async (id) => (await window.api.productos.get(id)).data", pid)
    if p["existencias"] != 10:
        fallas.append(f"entraron {p['existencias']} unidades, no 10")
    if p["valor_inventario_usd_cents"] != 6350:
        fallas.append(f"la bodega del producto vale {p['valor_inventario_usd_cents']} centavos, no 6350")
    if p["precio_venta_usd_cents"] <= 635:
        fallas.append("el precio no se calculó con el costo que trajo el paquete")
    return fallas


@caso("una ficha nueva ofrece ir al paquete, y entra ahí como línea")
def caso_ficha_al_paquete(page: Page) -> list[str]:
    fallas = []
    page.get_by_role("button", name="Inventario", exact=False).first.click()
    page.wait_for_timeout(800)
    page.get_by_role("tab", name="Productos").click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name="Producto nuevo").first.click()
    page.wait_for_selector("text=Las unidades y el precio de compra se anotan en el paquete", timeout=5000)
    page.get_by_label("Nombre").fill("Rimel flujo")
    page.get_by_role("button", name="Crear producto").click()

    ofrecer = page.get_by_role("button", name="Agregar a un paquete")
    try:
        ofrecer.wait_for(timeout=5000)
    except Exception:
        return ["al crear la ficha no se ofrece agregarla a un paquete"]
    ofrecer.click()
    page.wait_for_selector("text=Qué vino adentro", timeout=8000)
    page.wait_for_timeout(1500)

    lineas = page.locator("input[aria-label^='Unidades de']")
    nombres = [lineas.nth(i).get_attribute("aria-label") or "" for i in range(lineas.count())]
    if not any("flujo" in n.lower() for n in nombres):
        fallas.append(f"el paquete abrió sin la línea del producto nuevo (líneas: {nombres})")
    page.get_by_role("button", name="Cancelar").click()
    page.wait_for_timeout(600)

    # Abrir otro paquete después no la vuelve a agregar.
    page.get_by_role("button", name="Registrar paquete").first.click()
    page.wait_for_selector("text=Qué vino adentro", timeout=8000)
    page.wait_for_timeout(1200)
    if page.locator("input[aria-label^='Unidades de']").count() > 0:
        fallas.append("el producto nuevo se volvió a agregar a otro paquete")
    page.get_by_role("button", name="Cancelar").click()
    page.wait_for_timeout(400)
    return fallas


def sembrar_encargo_en_camino(page: Page) -> dict:
    """Un encargo de dos piezas: una llegó en un paquete y la otra viene en otro."""
    return page.evaluate("""async () => {
      const d = new Date();
      const hoy = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const cliente = (await window.api.clientes.list('')).data[0];
      const r = await window.api.ventas.crear({
        cliente_id: cliente.id, fecha: hoy, tipo: 'ENCARGO',
        lineas: [
          { descripcion: 'Vestido flujo', cantidad: 1, precio_unitario_usd_cents: 4500, costo_estimado_unitario_usd_cents: 2800 },
          { descripcion: 'Bolso flujo', cantidad: 1, precio_unitario_usd_cents: 9000, costo_estimado_unitario_usd_cents: 6200 },
        ],
        pago_inicial: { monto_cents: 9000, moneda: 'USD', metodo: 'EFECTIVO' },
      });
      const v = (await window.api.ventas.get(r.data.id)).data;
      const pieza = (l) => ({
        descripcion: l.descripcion, cantidad: 1, precio_linea_usd_cents: 2600,
        destino: 'ENCARGO', venta_id: v.id, venta_linea_id: l.id,
      });
      const llego = await window.api.compras.guardar({ fecha: hoy, envio_total_usd_cents: 1000, lineas: [pieza(v.lineas[0])] });
      await window.api.compras.recibir(llego.data.id);
      await window.api.compras.guardar({ fecha: hoy, envio_total_usd_cents: 1000, lineas: [pieza(v.lineas[1])] });
      return { id: v.id, codigo: v.codigo };
    }""")


@caso("un encargo dice en qué va, y al anularlo se decide qué pasa con lo que llegó")
def caso_encargo_en_camino(page: Page) -> list[str]:
    fallas = []
    e = sembrar_encargo_en_camino(page)
    page.get_by_role("button", name="Encargos", exact=False).first.click()
    page.wait_for_timeout(1000)

    fila = page.locator("tr", has_text=e["codigo"])
    if fila.count() == 0:
        return [f"{e['codigo']} no aparece en la lista de encargos"]
    if "En camino · 1 de 2 llegó" not in fila.first.inner_text():
        fallas.append(f"la fila no dice en qué va: {fila.first.inner_text()[:120]!r}")

    # Cada filtro trae sólo lo de su etapa. Tocar el mismo otra vez lo quita.
    filtro = lambda nombre: page.get_by_role("button", name=re.compile(f"^{nombre}")).first
    filtro("En camino").click()
    page.wait_for_timeout(500)
    if page.locator("tr", has_text=e["codigo"]).count() == 0:
        fallas.append("el filtro 'En camino' no trae el encargo que viene en camino")
    filtro("Por comprar").click()
    page.wait_for_timeout(500)
    if page.locator("tr", has_text=e["codigo"]).count() > 0:
        fallas.append("el filtro 'Por comprar' trae un encargo que ya se compró entero")
    filtro("Por comprar").click()
    page.wait_for_timeout(500)

    # Con una pieza en camino no se ofrece entregarlo.
    page.get_by_text(e["codigo"]).first.click()
    page.wait_for_timeout(800)
    if page.get_by_text("Se entrega cuando llegue todo.").count() == 0:
        fallas.append("el detalle no avisa que se entrega cuando llegue todo")
    if page.get_by_role("button", name="Entregar", exact=True).count() > 0:
        fallas.append("se ofrece entregar un encargo con una pieza en camino")

    # "Anular" está en "Más": no es lo que toca ahora, es una salida.
    page.get_by_role("button", name="Más").click()
    page.get_by_role("menuitem", name="Anular…").click()
    modal = page.get_by_role("alertdialog")
    try:
        modal.wait_for(timeout=5000)
        modal.get_by_role("radiogroup", name="Qué pasa con Vestido flujo").wait_for(timeout=5000)
    except Exception:
        return fallas + ["al anular no se pregunta qué pasa con la pieza que llegó"]
    if modal.get_by_text("“Bolso flujo” ya se compró").count() == 0:
        fallas.append("no se avisa que la pieza en camino entra a la bodega con su paquete")
    modal.get_by_role("radiogroup", name="Qué pasa con Vestido flujo").get_by_role("radio", name="Se perdió").click()
    modal.get_by_role("radiogroup", name="Qué pasa con lo que pagó").get_by_role("radio", name="Quedármelo").click()
    modal.get_by_role("button", name="Anular el encargo").click()
    page.wait_for_timeout(900)

    v = page.evaluate("async (id) => (await window.api.ventas.get(id)).data", e["id"])
    if v["estado"] != "CANCELADA":
        fallas.append(f"el encargo quedó {v['estado']}, no anulado")
    if v["pagado_usd_cents"] != 9000:
        fallas.append(f"eligió quedarse con el anticipo y quedó pagado {v['pagado_usd_cents']}")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    return fallas


@caso("un encargo comprado espera paquete, y el paquete nuevo lo ofrece")
def caso_comprado_espera_paquete(page: Page) -> list[str]:
    # Ella no sabe en qué paquete viene lo que compró: sólo que lo más
    # probable es que en el próximo.
    fallas = []
    e = page.evaluate("""async () => {
      const d = new Date();
      const hoy = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const cliente = (await window.api.clientes.list('')).data[0];
      const r = await window.api.ventas.crear({
        cliente_id: cliente.id, fecha: hoy, tipo: 'ENCARGO',
        lineas: [{ descripcion: 'Perfume espera', cantidad: 1, precio_unitario_usd_cents: 5000, costo_estimado_unitario_usd_cents: 3000 }],
        pago_inicial: { monto_cents: 3000, moneda: 'USD', metodo: 'EFECTIVO' },
      });
      return (await window.api.ventas.get(r.data.id)).data;
    }""")
    # Salir y volver: la lista se trae al entrar.
    page.get_by_role("button", name="Inicio", exact=False).first.click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name="Encargos", exact=False).first.click()
    page.wait_for_timeout(1000)
    page.get_by_text(e["codigo"]).first.click()
    page.wait_for_timeout(800)
    try:
        page.get_by_role("button", name="Ya lo compré").click(timeout=5000)
    except Exception:
        return ["la pieza por comprar no ofrece 'Ya lo compré'"]
    page.wait_for_timeout(800)
    if page.get_by_text("espera paquete").count() == 0:
        fallas.append("después de comprarla no dice que espera paquete")
    fila = page.locator("tr", has_text=e["codigo"])
    if fila.count() == 0 or "En camino" not in fila.first.inner_text():
        fallas.append("comprada, la fila no pasa a 'En camino'")
    page.keyboard.press("Escape")
    page.wait_for_timeout(400)

    page.get_by_role("button", name="Inventario", exact=False).first.click()
    page.wait_for_timeout(800)
    page.get_by_role("button", name="Registrar paquete").first.click()
    page.wait_for_selector("text=Qué vino adentro", timeout=8000)
    page.wait_for_timeout(1200)
    ofrecer = page.get_by_role("button", name="Agregarla")
    if ofrecer.count() == 0:
        fallas.append("el paquete nuevo no ofrece la pieza comprada que espera paquete")
    else:
        ofrecer.first.click()
        page.wait_for_timeout(800)
        lineas = page.locator("input[aria-label^='Unidades de']")
        nombres = [lineas.nth(i).get_attribute("aria-label") or "" for i in range(lineas.count())]
        if not any("Perfume espera" in n for n in nombres):
            fallas.append(f"'Agregarla' no puso la pieza en el paquete (líneas: {nombres})")
    page.get_by_role("button", name="Cancelar").click()
    page.wait_for_timeout(500)
    return fallas


@caso("un pedido se anota sin precio y se cotiza después")
def caso_pedido_sin_precio(page: Page) -> list[str]:
    # Una clienta pide algo que ella nunca compró: no sabe cuánto vale. Se
    # anota para acordarse y se le pone precio cuando lo encuentra.
    fallas = []
    page.get_by_role("button", name="Inicio", exact=False).first.click()
    page.wait_for_timeout(500)
    page.get_by_role("button", name="Encargos", exact=False).first.click()
    page.wait_for_timeout(900)
    page.get_by_role("button", name="Nuevo encargo").first.click()
    page.wait_for_timeout(700)
    nuevo = page.get_by_role("dialog")
    nuevo.get_by_label("Clienta").fill("Mar")
    page.wait_for_timeout(500)
    nuevo.get_by_role("button", name=re.compile("^María López")).first.click()
    page.wait_for_timeout(300)
    nuevo.get_by_label("Qué quiere 1").fill("Pedido sin precio")
    if nuevo.get_by_text("Sin precio: se cotiza después").count() == 0:
        fallas.append("sin precio, el formulario no avisa que se cotiza después")
    nuevo.get_by_role("button", name="Guardar", exact=True).click()
    page.wait_for_timeout(1200)
    if page.get_by_role("dialog").count() > 0:
        return fallas + ["el encargo sigue pidiendo algo para anotarse sin precio"]

    fila = page.locator("tr", has_text="María López").filter(has_text="Por buscar")
    if fila.count() == 0:
        return fallas + ["el pedido no aparece 'Por buscar' en la lista"]
    abrir_detalle(page, "Pedido sin precio")
    try:
        page.get_by_role("button", name="Cotizar", exact=True).click(timeout=4000)
    except Exception:
        return fallas + ["el detalle del pedido no ofrece 'Cotizar'"]
    page.wait_for_timeout(600)
    modal = page.get_by_role("dialog")
    modal.get_by_label("En la tienda ($)").fill("30")
    modal.get_by_label("Peso aprox. (lb)").fill("1")
    page.wait_for_timeout(300)
    usar = modal.get_by_role("button", name="Usar")
    if usar.count() == 0:
        fallas.append("con tienda y peso no sugiere un precio")
    else:
        usar.first.click()
    modal.get_by_role("button", name="Guardar precios").click()
    page.wait_for_timeout(1000)
    badge = page.locator("tr", has_text="María López").filter(has_text="Por mandar")
    if badge.count() == 0:
        fallas.append("cotizado, el encargo no pasa a 'Por mandar'")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    return fallas


@caso("un encargo recorre sus fases: buscar, mandar, esperar, comprar, recibir, entregar")
def caso_encargo_por_fases(page: Page) -> list[str]:
    fallas: list[str] = []
    page.get_by_role("button", name="Inicio", exact=False).first.click()
    page.wait_for_timeout(400)
    page.get_by_role("button", name="Encargos", exact=False).first.click()
    page.wait_for_timeout(800)

    # 1. Anotar: dos piezas, sin precio.
    page.get_by_role("button", name="Nuevo encargo").first.click()
    nuevo = page.get_by_role("dialog")
    nuevo.get_by_label("Clienta").fill("Mar")
    page.wait_for_timeout(400)
    nuevo.get_by_role("button", name=re.compile("^María López")).first.click()
    nuevo.get_by_label("Qué quiere 1").fill("Bolso fases")
    nuevo.get_by_role("button", name="Otra pieza").click()
    nuevo.get_by_label("Qué quiere 2").fill("Perfume fases")
    nuevo.get_by_role("button", name="Guardar", exact=True).click()
    page.wait_for_timeout(1000)
    if "Por buscar" not in fase_de(page, "Bolso fases"):
        return [f"anotado sin precio no queda 'Por buscar': {fase_de(page, 'Bolso fases')[:100]!r}"]

    # 2. Cotizar una pieza; la otra no se consiguió.
    abrir_detalle(page, "Bolso fases")
    page.get_by_role("button", name="Cotizar", exact=True).click()
    cotizar = page.get_by_role("dialog")
    cotizar.get_by_role("button", name="No se consiguió").nth(1).click()
    cotizar.get_by_label("En la tienda ($)").fill("30")
    cotizar.get_by_label("Peso aprox. (lb)").fill("1")
    page.wait_for_timeout(200)
    cotizar.get_by_role("button", name="Usar").first.click()
    cotizar.get_by_role("button", name="Guardar precios").click()
    page.wait_for_timeout(1000)
    if "Por mandar" not in fase_de(page, "Bolso fases"):
        fallas.append(f"cotizado no queda 'Por mandar': {fase_de(page, 'Bolso fases')[:100]!r}")

    # 3. Mandar: el mensaje nombra lo que no se consiguió.
    page.get_by_role("button", name="Mandar cotización").click()
    mandar = page.get_by_role("dialog")
    mensaje = mandar.get_by_label("Mensaje para la clienta").input_value()
    if "No logramos conseguir: Perfume fases" not in mensaje:
        fallas.append("el mensaje no dice que el perfume no se consiguió")
    mandar.get_by_role("button", name="Ya la mandé por otro lado").click()
    page.wait_for_timeout(1000)
    if "Esperando respuesta" not in fase_de(page, "Bolso fases"):
        fallas.append(f"mandada no queda 'Esperando respuesta': {fase_de(page, 'Bolso fases')[:100]!r}")

    # 4. Aceptó, sin pagar nada todavía.
    page.get_by_role("button", name="Aceptó", exact=True).click()
    aceptar = page.get_by_role("dialog")
    aceptar.get_by_role("button", name="Aceptó", exact=True).click()
    page.wait_for_timeout(1000)
    if "Por comprar · sin anticipo" not in fase_de(page, "Bolso fases"):
        fallas.append(f"aceptado sin anticipo no lo dice: {fase_de(page, 'Bolso fases')[:100]!r}")

    # 5. Comprarlo sin anticipo pregunta antes.
    page.get_by_role("button", name="Ya lo compré", exact=True).first.click()
    aviso = page.get_by_role("alertdialog")
    try:
        aviso.get_by_text("¿Lo compraste igual?").wait_for(timeout=4000)
    except Exception:
        return fallas + ["comprar sin anticipo no avisa"]
    aviso.get_by_role("button", name="Sí, ya lo compré").click()
    page.wait_for_timeout(1000)
    if "En camino" not in fase_de(page, "Bolso fases"):
        fallas.append(f"comprado no queda 'En camino': {fase_de(page, 'Bolso fases')[:100]!r}")

    # 6. Llega en un paquete y se entrega.
    e = page.evaluate("""async () => {
      const lista = (await window.api.ventas.list({ tipo: 'ENCARGO', estado: 'PENDIENTE' })).data;
      const v = lista.find((x) => (x.que_pidio || (x.lineas || []).map((l) => l.descripcion).join(', ')).includes('Bolso fases'));
      const c = (await window.api.ventas.get(v.id)).data;
      const pieza = c.lineas.find((l) => l.descripcion === 'Bolso fases');
      const d = new Date();
      const hoy = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      const pq = await window.api.compras.guardar({ fecha: hoy, envio_total_usd_cents: 0, lineas: [
        { descripcion: 'Bolso fases', cantidad: 1, precio_linea_usd_cents: 3000, destino: 'ENCARGO', venta_id: v.id, venta_linea_id: pieza.id },
      ] });
      await window.api.compras.recibir(pq.data.id);
      return { id: v.id, codigo: v.codigo };
    }""")
    page.keyboard.press("Escape")
    page.get_by_role("button", name="Inicio", exact=False).first.click()
    page.wait_for_timeout(400)
    page.get_by_role("button", name="Encargos", exact=False).first.click()
    page.wait_for_timeout(800)
    if "Por entregar" not in fase_de(page, e["codigo"]):
        fallas.append(f"llegado no queda 'Por entregar': {fase_de(page, e['codigo'])[:100]!r}")
    abrir_detalle(page, e["codigo"])
    page.get_by_role("button", name="Entregar", exact=True).click()
    page.wait_for_timeout(1000)
    v = page.evaluate("async (id) => (await window.api.ventas.get(id)).data", e["id"])
    if v["estado"] != "ENTREGADA":
        fallas.append(f"no se entregó: quedó {v['estado']}")
    if v["total_usd_cents"] <= 0 or any(l.get("descartada_el") is None for l in v["lineas"] if l["descripcion"] == "Perfume fases"):
        fallas.append("el perfume no quedó como no conseguido, o el total quedó en cero")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    return fallas


@caso("un formulario con algo escrito no se pierde por un Escape")
def caso_no_pierde_lo_escrito(page: Page) -> list[str]:
    fallas: list[str] = []
    page.get_by_role("button", name="Inicio", exact=False).first.click()
    page.wait_for_timeout(400)
    page.get_by_role("button", name="Encargos", exact=False).first.click()
    page.wait_for_timeout(700)
    page.get_by_role("button", name="Nuevo encargo").first.click()
    nuevo = page.get_by_role("dialog")
    nuevo.get_by_label("Qué quiere 1").fill("Algo que no se pierde")

    # Escape pregunta, con el foco en la salida que no destruye.
    page.keyboard.press("Escape")
    pregunta = page.get_by_role("alertdialog")
    try:
        pregunta.get_by_text("¿Descartar lo que escribiste?").wait_for(timeout=3000)
    except Exception:
        return ["Escape cerró el formulario sin preguntar"]
    foco = page.evaluate("document.activeElement ? document.activeElement.textContent : ''")
    if "Seguir editando" not in (foco or ""):
        fallas.append(f"el foco no quedó en 'Seguir editando' sino en {foco!r}")
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    if page.get_by_role("dialog").get_by_label("Qué quiere 1").input_value() != "Algo que no se pierde":
        fallas.append("después de 'Seguir editando' se perdió lo escrito")

    # "Otra pieza" deja el foco en la pieza nueva.
    page.get_by_role("dialog").get_by_role("button", name="Otra pieza").click()
    page.wait_for_timeout(200)
    foco = page.evaluate("document.activeElement ? document.activeElement.getAttribute('aria-label') : ''")
    if foco != "Qué quiere 2":
        fallas.append(f"'Otra pieza' no dejó el foco en la pieza nueva sino en {foco!r}")

    # Ctrl+Enter guarda; sin clienta, el error está en su campo y el foco ahí.
    page.keyboard.press("Control+Enter")
    page.wait_for_timeout(300)
    if page.get_by_role("dialog").get_by_text("Elegí quién lo pide.").count() == 0:
        fallas.append("sin clienta, Ctrl+Enter no dijo que falta elegirla")
    foco = page.evaluate("document.activeElement ? document.activeElement.getAttribute('aria-label') : ''")
    if foco != "Clienta":
        fallas.append(f"el foco no fue al campo de la clienta sino a {foco!r}")

    # Descartar sí cierra.
    page.keyboard.press("Escape")
    page.get_by_role("alertdialog").get_by_role("button", name="Descartar").click()
    page.wait_for_timeout(400)
    if page.get_by_role("dialog").count() > 0:
        fallas.append("'Descartar' no cerró el formulario")
    return fallas


@caso("una venta mal cargada se corrige con su número, y su abono también")
def caso_corregir_venta_y_abono(page: Page) -> list[str]:
    """
    El caso de V-0007: un producto por otro. Antes la única salida era borrar
    la venta desde la consola de Firebase, y los productos quedaban vendidos.
    """
    fallas: list[str] = []
    datos = page.evaluate("""async () => {
      const ps = (await window.api.productos.list()).data
        .filter((p) => p.activo !== false && p.existencias >= 2 && p.variantes.length <= 1);
      const [a, b] = ps;
      const r = await window.api.ventas.crear({
        fecha: new Date().toISOString().slice(0, 10),
        tipo: 'INVENTARIO',
        lineas: [{ producto_id: a.id, variante_id: a.variantes[0]?.id, cantidad: 1, precio_unitario_usd_cents: 1500 }],
        pago_inicial: { moneda: 'USD', metodo: 'EFECTIVO', monto_cents: 500 },
      });
      const v = (await window.api.ventas.get(r.data.id)).data;
      return { id: v.id, codigo: v.codigo, a: { id: a.id, nombre: a.nombre, stock: a.existencias - 1 },
               b: { id: b.id, nombre: b.nombre, stock: b.existencias } };
    }""")
    page.get_by_role("button", name="Inicio", exact=False).first.click()
    page.wait_for_timeout(400)
    ir_a_ventas(page)
    fila_de(page, datos["codigo"]).click()
    page.wait_for_timeout(700)
    page.get_by_role("button", name="Corregir venta").click()

    editor = page.get_by_role("dialog", name=f"Corregir {datos['codigo']}")
    try:
        editor.wait_for(timeout=3000)
    except Exception:
        return ["'Corregir venta' no abrió el editor con la venta"]
    editor.get_by_role("button", name="Cambiar").first.click()
    editor.get_by_role("button", name="Buscar en inventario").click()
    editor.get_by_placeholder("Buscar por nombre o código").fill(datos["b"]["nombre"])
    page.wait_for_timeout(300)
    editor.locator("ul button", has_text=datos["b"]["nombre"]).first.click()
    editor.get_by_role("button", name="Siguiente").click()
    if editor.get_by_text("Contado").count() > 0:
        fallas.append("al corregir se sigue ofreciendo la forma de cobro")
    editor.get_by_role("button", name="Siguiente").click()
    cambios = editor.locator('[data-testid="cambios-correccion"]').inner_text()
    if datos["a"]["nombre"] not in cambios or datos["b"]["nombre"] not in cambios:
        fallas.append(f"el último paso no dice qué cambia: {cambios!r}")
    editor.get_by_role("button", name="Guardar corrección").click()
    page.wait_for_timeout(900)

    despues = page.evaluate("""async (d) => {
      const v = (await window.api.ventas.get(d.id)).data;
      const ps = (await window.api.productos.list()).data;
      const stock = (id) => ps.find((p) => p.id === id).existencias;
      return { codigo: v.codigo, producto: v.lineas[0].producto_id, a: stock(d.a.id), b: stock(d.b.id) };
    }""", datos)
    if despues["codigo"] != datos["codigo"] or despues["producto"] != datos["b"]["id"]:
        fallas.append(f"la venta no quedó corregida con su número: {despues}")
    if despues["a"] != datos["a"]["stock"] + 1 or despues["b"] != datos["b"]["stock"] - 1:
        fallas.append(f"el equivocado no volvió a la bodega o el correcto no salió: {despues}")

    # El abono: se cargó $5 y eran $3.
    page.get_by_role("button", name=re.compile("^Corregir el abono")).first.click()
    abono = page.get_by_role("dialog", name=re.compile("Corregir abono"))
    try:
        abono.wait_for(timeout=3000)
    except Exception:
        return fallas + ["el lápiz del abono no abrió la corrección"]
    abono.get_by_label("Cuánto pagó").fill("3.00")
    abono.get_by_role("button", name="Guardar corrección").click()
    page.wait_for_timeout(700)
    pagado = page.evaluate("async (id) => (await window.api.ventas.get(id)).data.pagado_usd_cents", datos["id"])
    if pagado != 300:
        fallas.append(f"el abono corregido no cambió lo pagado: {pagado}")
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
