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
import os
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
    resultado = page.get_by_role("option", name="Crema Nivea de prueba", exact=False).first
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
    # Con una línea cargada, "Cancelar" pregunta antes de descartarla.
    page.get_by_role("button", name="Cancelar").click()
    page.get_by_role("alertdialog").get_by_role("button", name="Descartar").click()
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
    nuevo.get_by_role("option", name=re.compile("^María López")).first.click()
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
    nuevo.get_by_role("option", name=re.compile("^María López")).first.click()
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


@caso("un abono en córdobas se ve y se corrige en córdobas, y la venta al contado lo arrastra")
def caso_abono_en_cordobas(page: Page) -> list[str]:
    """
    Pedido de Joswill: si pagó en córdobas y al corregir se cambia a dólares
    por error, se confunde. El abono se muestra como se pagó, la moneda
    original queda marcada, y cambiarla avisa qué significa.
    """
    fallas: list[str] = []
    datos = page.evaluate("""async () => {
      const ps = (await window.api.productos.list()).data
        .filter((p) => p.activo !== false && p.existencias >= 2 && p.variantes.length <= 1);
      const [a, b] = ps.slice(-2);
      const r = await window.api.ventas.crear({
        fecha: new Date().toISOString().slice(0, 10),
        tipo: 'INVENTARIO',
        lineas: [{ producto_id: a.id, variante_id: a.variantes[0]?.id, cantidad: 1, precio_unitario_usd_cents: 2000 }],
        pago_inicial: { moneda: 'COR', metodo: 'EFECTIVO' },
      });
      const v = (await window.api.ventas.get(r.data.id)).data;
      return { id: v.id, codigo: v.codigo, tasa: v.pagos[0].tasa_cambio_cents,
               cor: v.pagos[0].monto_cor_cents, b: { nombre: b.nombre } };
    }""")
    cor_antes = f"C${datos['cor'] / 100:,.2f}"

    # En Cobros, el abono dice C$ y quién lo registró.
    page.get_by_role("button", name="Inicio", exact=False).first.click()
    page.wait_for_timeout(300)
    page.get_by_role("button", name="Cobros", exact=True).click()
    page.wait_for_timeout(900)
    page.get_by_role("button", name=re.compile("Abonos recibidos")).click()
    page.wait_for_timeout(500)
    fila = fila_de(page, datos["codigo"])
    texto = fila.inner_text()
    if cor_antes not in texto:
        fallas.append(f"en Cobros el abono no se ve en córdobas ({cor_antes}): {texto!r}")
    if "Ross" not in texto:
        fallas.append(f"en Cobros no dice quién registró el abono: {texto!r}")
    if fila.get_by_role("button", name=re.compile("^Corregir")).count() == 0:
        fallas.append("en Cobros el abono no tiene 'Corregir' escrito")

    # Corregir la venta: el producto por uno de $15; el abono la sigue en C$.
    ir_a_ventas(page)
    fila_de(page, datos["codigo"]).click()
    page.wait_for_timeout(700)
    page.get_by_role("button", name="Corregir venta").click()
    editor = page.get_by_role("dialog", name=f"Corregir {datos['codigo']}")
    editor.wait_for(timeout=3000)
    editor.get_by_role("button", name="Cambiar").first.click()
    editor.get_by_role("button", name="Buscar en inventario").click()
    editor.get_by_placeholder("Buscar por nombre o código").fill(datos["b"]["nombre"])
    page.wait_for_timeout(300)
    editor.locator("ul button", has_text=datos["b"]["nombre"]).first.click()
    editor.get_by_label("Precio ($)").fill("15.00")
    editor.get_by_role("button", name="Siguiente").click()
    if editor.get_by_text(re.compile("La pagó al contado: " + re.escape(cor_antes))).count() == 0:
        fallas.append("al corregir no ofrece que el abono al contado siga al total, en córdobas")
    editor.get_by_role("button", name="Siguiente").click()
    cor_despues = round(1500 * datos["tasa"] / 100)
    sigue = editor.locator('[data-testid="abono-sigue"]')
    esperado = f"C${cor_despues / 100:,.2f}"
    if sigue.count() == 0 or esperado not in sigue.inner_text():
        fallas.append(f"el último paso no dice que el abono queda en {esperado}")
    editor.get_by_role("button", name="Guardar corrección").click()
    page.wait_for_timeout(900)
    v = page.evaluate("async (id) => (await window.api.ventas.get(id)).data", datos["id"])
    p = v["pagos"][0]
    if [p["moneda"], p["monto_usd_cents"], p["monto_cor_cents"], v["saldo_usd_cents"]] != ["COR", 1500, cor_despues, 0]:
        fallas.append(f"el abono no siguió a la venta en córdobas: {p['moneda']} {p['monto_usd_cents']} {p['monto_cor_cents']}, saldo {v['saldo_usd_cents']}")

    # Corregir el abono: arranca en córdobas; pasar a dólares avisa.
    page.get_by_role("button", name=re.compile("^Corregir el abono")).first.click()
    abono = page.get_by_role("dialog", name=re.compile("Corregir abono"))
    abono.wait_for(timeout=3000)
    if abono.get_by_role("radio", name=re.compile("Córdobas")).get_attribute("aria-checked") != "true":
        fallas.append("la corrección del abono no arranca en córdobas")
    abono.get_by_role("radio", name=re.compile("Dólares")).click()
    if abono.get_by_text(re.compile("Lo registraste en córdobas")).count() == 0:
        fallas.append("pasar el abono a dólares no avisa que se registró en córdobas")
    page.keyboard.press("Escape")
    descartar = page.get_by_role("alertdialog").get_by_role("button", name="Descartar")
    if descartar.count() > 0:
        descartar.click()
    page.wait_for_timeout(300)
    return fallas


# ---------------------------------------------------------------------------
# Fase 0 de la auditoría de interfaz del 29/9 (docs/AUDITORIA_UX_2026-09-29.md).
# Cada caso lleva el ID del hallazgo que reproduce.
# ---------------------------------------------------------------------------

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


def descatalogar_desde_el_detalle(page: Page, nombre: str) -> None:
    fila_de(page, nombre).click()
    page.wait_for_timeout(500)
    page.locator("aside").get_by_role("button", name="Descatalogar").click()
    page.get_by_role("alertdialog").get_by_role("button", name="Sí, descatalogar").click()
    page.wait_for_timeout(600)


def recargar_datos(page: Page) -> None:
    """F5 dentro de la app: vuelve a leer todo (lo sembrado por la api no avisa)."""
    page.keyboard.press("F5")
    page.wait_for_timeout(1200)


def ir_a(page: Page, seccion: str) -> None:
    # Por la barra lateral, que va primero en la página: "Inventario" lleva un
    # contador al lado y su nombre accesible no es exacto.
    page.get_by_role("button", name=seccion, exact=False).first.click()
    page.wait_for_timeout(900)


def cerrar_ventanas(page: Page) -> None:
    """Cierra lo que haya quedado abierto (ventanas, listas), descartando lo escrito."""
    for _ in range(5):
        abiertas = (
            page.get_by_role("dialog").count()
            + page.get_by_role("alertdialog").count()
            + page.locator("div.fixed.inset-0").count()
        )
        if abiertas == 0:
            return
        descartar = page.get_by_role("alertdialog").get_by_role("button", name="Descartar")
        if descartar.count() > 0:
            descartar.first.click()
        else:
            page.keyboard.press("Escape")
        page.wait_for_timeout(250)


def cerrar_editor_de_venta(page: Page) -> None:
    cerrar_ventanas(page)


@caso("BAS-01 · Ctrl+Z dentro de un campo no deshace lo guardado, y fuera deshace lo último")
def caso_ctrl_z(page: Page) -> list[str]:
    cerrar_ventanas(page)
    fallas: list[str] = []
    datos = page.evaluate("""async () => {
      const ps = (await window.api.productos.list()).data.filter((p) => p.activo !== false);
      const [a, b] = ps.slice(0, 2);
      window.__grupos = [];
      window.__deshechos = [];
      const archivar = window.api.productos.archivar;
      window.api.productos.archivar = async (id) => {
        const r = await archivar(id);
        if (r.success) window.__grupos.push(r.data.evento_grupo_id);
        return r;
      };
      const deshacer = window.api.sistema.deshacer;
      window.api.sistema.deshacer = async (g) => { window.__deshechos.push(g); return deshacer(g); };
      window.__restaurar = () => { window.api.productos.archivar = archivar; window.api.sistema.deshacer = deshacer; };
      return { a: a.nombre, b: b.nombre, ids: [a.id, b.id] };
    }""")
    ir_a(page, "Inicio")
    ir_a(page, "Inventario")
    descatalogar_desde_el_detalle(page, datos["a"])
    descatalogar_desde_el_detalle(page, datos["b"])
    grupos = page.evaluate("window.__grupos")
    if len(grupos) != 2:
        page.evaluate("window.__restaurar()")
        return [f"no se pudieron descatalogar los dos productos: {grupos}"]

    buscar = page.get_by_label("Buscar productos")
    buscar.click()
    buscar.fill("zz")
    page.keyboard.press("Control+z")
    page.wait_for_timeout(400)
    if page.evaluate("window.__deshechos"):
        fallas.append("Ctrl+Z escribiendo en el buscador deshizo una operación guardada")

    page.evaluate("document.activeElement && document.activeElement.blur()")
    page.keyboard.press("Control+z")
    page.wait_for_timeout(400)
    deshechos = page.evaluate("window.__deshechos")
    if deshechos[-1:] != [grupos[1]]:
        fallas.append(f"Ctrl+Z fuera de un campo no deshizo lo último: deshizo {deshechos}, lo último era {grupos[1]}")

    page.evaluate("""async (ids) => {
      window.__restaurar();
      for (const id of ids) await window.api.productos.reactivar(id);
    }""", datos["ids"])
    buscar.fill("")
    recargar_datos(page)
    return fallas


@caso("BAS-02 · un aviso largo se lee entero")
def caso_aviso_largo(page: Page) -> list[str]:
    cerrar_ventanas(page)
    largo = (
        "No se pudo descatalogar: el producto está en un paquete que todavía no pasó al "
        "inventario. Sacalo de ese paquete primero y volvé a intentarlo."
    )
    nombre = page.evaluate("""async (largo) => {
      const p = (await window.api.productos.list()).data.find((x) => x.activo !== false);
      const archivar = window.api.productos.archivar;
      window.api.productos.archivar = async () => { window.api.productos.archivar = archivar; return { success: false, error: largo }; };
      return p.nombre;
    }""", largo)
    # Pasar por Inicio vuelve a montar Inventario: la lista se relee.
    ir_a(page, "Inicio")
    ir_a(page, "Inventario")
    descatalogar_desde_el_detalle(page, nombre)
    texto = page.get_by_text(largo[:40], exact=False).first
    try:
        texto.wait_for(timeout=3000)
    except Exception:
        return ["el error no apareció como aviso"]
    medida = texto.evaluate("""(el) => {
      const cs = getComputedStyle(el);
      return { ws: cs.whiteSpace, cabe: el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1 };
    }""")
    fallas: list[str] = []
    if medida["ws"] == "nowrap" or not medida["cabe"]:
        fallas.append(f"el aviso largo queda cortado: {medida}")
    page.keyboard.press("Escape")
    return fallas


def sembrar_clienta_con_dos_ventas(page: Page) -> dict:
    return page.evaluate("""async () => {
      const hoy = new Date();
      const ayer = new Date(hoy.getTime() - 86400000);
      const iso = (d) => d.toISOString().slice(0, 10);
      const cli = (await window.api.clientes.guardar({ nombre: 'Clienta De Dos Ventas' })).data.id;
      const crear = async (fecha, precio) =>
        (await window.api.ventas.crear({
          cliente_id: cli, fecha, tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Algo', cantidad: 1, precio_unitario_usd_cents: precio }],
        })).data.id;
      const vieja = await crear(iso(ayer), 3000);
      const nueva = await crear(iso(hoy), 2000);
      const codigo = async (id) => (await window.api.ventas.get(id)).data.codigo;
      return { cli, vieja, nueva, codigoVieja: await codigo(vieja), codigoNueva: await codigo(nueva) };
    }""")


@caso("COB-01 · en Cobros, Abonar en una venta registra el abono en esa venta")
def caso_abonar_en_esa_venta(page: Page) -> list[str]:
    cerrar_ventanas(page)
    datos = sembrar_clienta_con_dos_ventas(page)
    ir_a(page, "Inicio")
    ir_a(page, "Cobros")
    fila = page.locator("div.p-4", has=page.get_by_text(datos["codigoNueva"], exact=True)).last
    fila.get_by_role("button", name="Abonar").click()
    ventana = page.get_by_role("dialog", name=re.compile(re.escape(datos["codigoNueva"])))
    try:
        ventana.wait_for(timeout=3000)
    except Exception:
        page.keyboard.press("Escape")
        return [f"'Abonar' en {datos['codigoNueva']} no abrió el abono de esa venta"]
    ventana.get_by_label("Moneda").select_option("USD")
    ventana.get_by_label("Cuánto pagó").fill("5.00")
    ventana.get_by_role("button", name="Registrar abono").click()
    page.wait_for_timeout(900)
    pagado = page.evaluate("""async (d) => ({
      nueva: (await window.api.ventas.get(d.nueva)).data.pagado_usd_cents,
      vieja: (await window.api.ventas.get(d.vieja)).data.pagado_usd_cents,
    })""", datos)
    if pagado != {"nueva": 500, "vieja": 0}:
        return [f"el abono no quedó en la venta de la fila: {pagado}"]
    return []


@caso("COB-02 · Registrar abono de Cobros arranca sin clienta elegida")
def caso_abono_sin_clienta(page: Page) -> list[str]:
    cerrar_ventanas(page)
    ir_a(page, "Inicio")
    ir_a(page, "Cobros")
    page.get_by_role("button", name="Registrar abono").first.click()
    page.wait_for_timeout(400)
    elegida = page.get_by_label("Clienta").input_value()
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    descartar = page.get_by_role("alertdialog").get_by_role("button", name="Descartar")
    if descartar.count() > 0:
        descartar.click()
    if elegida:
        return [f"el abono arrancó con una clienta ya elegida (id {elegida})"]
    return []


def producto_para_vender(page: Page, precio_minimo: int = 1000) -> dict:
    return page.evaluate("""async (minimo) => {
      const p = (await window.api.productos.list()).data.find(
        (x) => x.activo !== false && x.existencias >= 1 && x.variantes.length <= 1 && x.precio_venta_usd_cents >= minimo
      );
      const tasa = (await window.api.parametros.get()).data.tasa_cambio_cents;
      return { nombre: p.nombre, precio: p.precio_venta_usd_cents, costo: p.costo_unitario_usd_cents, tasa };
    }""", precio_minimo)


def armar_venta_hasta_el_cobro(page: Page, nombre: str):
    page.get_by_role("button", name="Nueva venta").first.click()
    editor = page.get_by_role("dialog", name="Nueva venta")
    editor.wait_for(timeout=3000)
    # Una venta nueva abre con el buscador de productos ya desplegado.
    buscar = editor.get_by_placeholder("Buscar por nombre o código")
    if buscar.count() == 0:
        editor.get_by_role("button", name="Buscar en inventario").click()
    buscar.fill(nombre)
    page.wait_for_timeout(300)
    editor.locator("ul button", has_text=nombre).first.click()
    editor.get_by_role("button", name="Siguiente").click()
    page.wait_for_timeout(300)
    return editor


@caso("VED-03 · vender al contado en córdobas dice cuántos córdobas cobrar, con el descuento")
def caso_contado_en_cordobas(page: Page) -> list[str]:
    cerrar_ventanas(page)
    recargar_datos(page)
    p = producto_para_vender(page)
    ir_a(page, "Ventas")
    editor = armar_venta_hasta_el_cobro(page, p["nombre"])
    editor.get_by_label("Moneda").select_option("COR")
    editor.get_by_role("button", name=re.compile("^Descuento")).click()
    editor.get_by_role("button", name="$5", exact=True).click()
    editor.get_by_role("button", name="Siguiente").click()
    page.wait_for_timeout(300)
    esperado = round((p["precio"] - 500) * p["tasa"] / 100)
    texto_esperado = f"C${esperado / 100:,.2f}"
    visto = editor.inner_text()
    cerrar_editor_de_venta(page)
    if f"Cobrá {texto_esperado}" not in visto:
        return [f"el último paso no dice 'Cobrá {texto_esperado}'"]
    return []


@caso("VED-04 · el aviso de pérdida por descuento se lee en tema oscuro")
def caso_perdida_en_oscuro(page: Page) -> list[str]:
    cerrar_ventanas(page)
    recargar_datos(page)
    p = producto_para_vender(page)
    ir_a(page, "Configuración")
    page.get_by_role("button", name=re.compile("^Oscuro")).click()
    page.wait_for_timeout(300)
    ir_a(page, "Ventas")
    editor = armar_venta_hasta_el_cobro(page, p["nombre"])
    editor.get_by_role("button", name=re.compile("^Descuento")).click()
    editor.get_by_label("Tipo").select_option("MONTO_FIJO")
    editor.get_by_label("Monto ($)").fill(f"{(p['precio'] - 1) / 100:.2f}")
    page.wait_for_timeout(300)
    aviso = editor.get_by_text(re.compile("Con este descuento perdés")).first
    fallas: list[str] = []
    if aviso.count() == 0:
        fallas.append("vender por debajo del costo no mostró el aviso")
    else:
        contraste = aviso.locator("xpath=..").evaluate(JS_CONTRASTE)
        if contraste < 4.5:
            fallas.append(f"en oscuro el aviso de pérdida no se lee: contraste {contraste:.2f}:1")
    cerrar_editor_de_venta(page)
    ir_a(page, "Configuración")
    page.get_by_role("button", name=re.compile("^Automático")).click()
    page.wait_for_timeout(300)
    return fallas


@caso("COL-01 y COL-02 · ningún texto queda con el color base sobre su tinte, en claro ni en oscuro")
def caso_tintes(page: Page) -> list[str]:
    """
    "Agotado", "Vencida" y "Debe" son las señales más importantes y eran las
    menos legibles: peligro sobre su tinte da 3,93:1 en claro. La escala de
    Tailwind (`danger-700`, `-800`) caía en la misma combinación.
    """
    cerrar_ventanas(page)
    return textos_ilegibles_sobre_tinte(
        page,
        ["Inicio", "Ventas", "Encargos", "Cobros", "Clientes", "Inventario", "Configuración"],
        ir_a,
    )


@caso("CFG-01 · guardar Configuración manda sólo lo que cambió, y un margen nuevo abre la revisión de precios")
def caso_configuracion_sin_recalculo(page: Page) -> list[str]:
    cerrar_ventanas(page)
    fallas: list[str] = []
    page.evaluate("""() => {
      window.__updates = [];
      window.__recalculos = 0;
      const update = window.api.parametros.update;
      window.api.parametros.update = async (v) => { window.__updates.push(v); return update(v); };
      const recalcular = window.api.parametros.recalcularPrecios;
      window.api.parametros.recalcularPrecios = async () => { window.__recalculos++; return recalcular(); };
    }""")
    ir_a(page, "Inicio")
    ir_a(page, "Configuración")

    mensaje = page.get_by_label(re.compile("Plantilla de Cobro"))
    mensaje.fill("Hola {cliente}, te escribo de Glow Heaven por tu saldo de {saldo_usd}.")
    page.get_by_role("button", name=re.compile("Guardar configuración")).click()
    page.wait_for_timeout(800)
    updates = page.evaluate("window.__updates")
    if not updates:
        return ["guardar la configuración no mandó nada"]
    if sorted(updates[-1].keys()) != ["plantilla_cobro_whatsapp"]:
        fallas.append(f"guardar un mensaje mandó {sorted(updates[-1].keys())}")

    margen = page.get_by_label("Ganancia por defecto (%)")
    anterior = margen.input_value()
    margen.fill("80")
    page.get_by_role("button", name=re.compile("Guardar configuración")).click()
    revision = page.get_by_role("dialog", name="Precios para revisar")
    try:
        revision.wait_for(timeout=3000)
        revision.get_by_role("button", name="Ahora no").click()
    except Exception:
        fallas.append("cambiar el margen no abrió la revisión de precios")

    boton = page.get_by_role("button", name=re.compile("Revisar precios del inventario"))
    if boton.count() == 0:
        fallas.append("no está el botón 'Revisar precios del inventario'")
    else:
        boton.click()
        page.wait_for_timeout(600)
        abierta = page.get_by_role("dialog", name="Precios para revisar")
        if abierta.count() > 0:
            abierta.get_by_role("button", name="Ahora no").click()
    if page.evaluate("window.__recalculos"):
        fallas.append("se recalcularon precios sin pasar por la revisión")

    margen.fill(anterior)
    page.get_by_role("button", name=re.compile("Guardar configuración")).click()
    page.wait_for_timeout(800)
    abierta = page.get_by_role("dialog", name="Precios para revisar")
    if abierta.count() > 0:
        abierta.get_by_role("button", name="Ahora no").click()
    return fallas


# ---------------------------------------------------------------------------
# Fase 1 de la auditoría: un solo marco de ventana
# ---------------------------------------------------------------------------

JS_SALE_ANIMADA = """() => new Promise((listo) => {
  requestAnimationFrame(() => requestAnimationFrame(() =>
    listo(document.querySelector('.animate-modal-salida') !== null)));
})"""

JS_FOCO_ADENTRO = """(el) => el.contains(document.activeElement)"""


def ventana_abierta(page: Page):
    """La ventana de más arriba que no sea una confirmación."""
    return page.locator("[role='dialog'][aria-modal='true']").last


def abrir_nueva_venta(page: Page):
    ir_a(page, "Inicio")
    ir_a(page, "Ventas")
    boton = page.get_by_role("button", name="Nueva venta").first
    boton.click()
    dlg = page.get_by_role("dialog", name="Nueva venta")
    dlg.wait_for(timeout=3000)
    return boton, dlg


def escribir_en_venta(page: Page, dlg) -> None:
    p = producto_para_vender(page)
    buscar = dlg.get_by_placeholder("Buscar por nombre o código")
    if buscar.count() == 0:
        dlg.get_by_role("button", name="Buscar en inventario").click()
    buscar.fill(p["nombre"])
    page.wait_for_timeout(300)
    dlg.locator("ul button", has_text=p["nombre"]).first.click()
    page.wait_for_timeout(200)


def abrir_paquete(page: Page):
    ir_a(page, "Inicio")
    ir_a(page, "Inventario")
    boton = page.get_by_role("button", name="Registrar paquete").first
    boton.click()
    page.wait_for_selector("text=Qué vino adentro", timeout=8000)
    return boton, ventana_abierta(page)


def abrir_producto(page: Page):
    ir_a(page, "Inicio")
    ir_a(page, "Inventario")
    boton = page.get_by_role("button", name="Producto nuevo").first
    boton.click()
    dlg = page.get_by_role("dialog", name="Producto nuevo")
    dlg.wait_for(timeout=3000)
    return boton, dlg


def abrir_clienta(page: Page):
    ir_a(page, "Inicio")
    ir_a(page, "Clientes")
    boton = page.get_by_role("button", name="Agregar clienta").first
    boton.click()
    dlg = page.get_by_role("dialog", name="Agregar clienta")
    dlg.wait_for(timeout=3000)
    return boton, dlg


def abrir_abono_de_cobros(page: Page):
    ir_a(page, "Inicio")
    ir_a(page, "Cobros")
    boton = page.get_by_role("button", name="Registrar abono").first
    boton.click()
    dlg = page.get_by_role("dialog", name="Registrar abono")
    dlg.wait_for(timeout=3000)
    return boton, dlg


def abrir_ajuste(page: Page):
    ir_a(page, "Inicio")
    ir_a(page, "Inventario")
    nombre = producto_para_vender(page)["nombre"]
    fila_de(page, nombre).click()
    page.wait_for_timeout(500)
    boton = page.locator("aside").get_by_role("button", name="Ajustar stock").first
    boton.click()
    dlg = page.get_by_role("dialog", name="Ajustar existencias")
    dlg.wait_for(timeout=3000)
    return boton, dlg


def abrir_encargo(page: Page):
    ir_a(page, "Inicio")
    ir_a(page, "Encargos")
    boton = page.get_by_role("button", name="Nuevo encargo").first
    boton.click()
    dlg = page.get_by_role("dialog", name="Nuevo encargo")
    dlg.wait_for(timeout=3000)
    return boton, dlg


def abrir_factura(page: Page):
    codigo = page.evaluate("""async () => {
      const r = await window.api.ventas.crear({
        fecha: new Date().toISOString().slice(0, 10), tipo: 'INVENTARIO',
        lineas: [{ descripcion: 'Para ver la factura', cantidad: 1, precio_unitario_usd_cents: 1000 }],
      });
      return (await window.api.ventas.get(r.data.id)).data.codigo;
    }""")
    ir_a(page, "Inicio")
    ir_a(page, "Ventas")
    fila_de(page, codigo).click()
    page.wait_for_timeout(600)
    boton = page.get_by_role("button", name="Ver factura").first
    boton.click()
    dlg = page.get_by_role("dialog", name=re.compile("^Factura"))
    dlg.wait_for(timeout=3000)
    return boton, dlg


VENTANAS = [
    # (nombre, abrir, escribir o None si no tiene nada que escribir)
    ("Nueva venta", abrir_nueva_venta, escribir_en_venta),
    ("Registrar paquete", abrir_paquete,
     lambda page, dlg: dlg.get_by_label("Flete pagado").fill("12.00")),
    ("Producto nuevo", abrir_producto,
     lambda page, dlg: dlg.get_by_label("Nombre").first.fill("Algo escrito")),
    ("Agregar clienta", abrir_clienta,
     lambda page, dlg: dlg.get_by_label("Nombre").first.fill("Algo escrito")),
    ("Registrar abono de Cobros", abrir_abono_de_cobros,
     lambda page, dlg: dlg.get_by_label(re.compile("^Monto")).fill("25")),
    ("Ajustar existencias", abrir_ajuste,
     lambda page, dlg: dlg.get_by_label("¿Cuántas hay?").fill("99")),
    ("Nuevo encargo", abrir_encargo,
     lambda page, dlg: dlg.get_by_label("Qué quiere 1").fill("Algo escrito")),
    ("Factura", abrir_factura, None),
]


def probar_ventana(page: Page, nombre: str, abrir, escribir) -> list[str]:
    fallas: list[str] = []
    cerrar_ventanas(page)
    try:
        boton, dlg = abrir(page)
    except Exception as err:
        return [f"{nombre}: no se pudo abrir ({str(err)[:90]})"]
    texto_boton = (boton.inner_text() or "").strip()

    # El foco da la vuelta adentro: Tab nunca sale a la pantalla de atrás.
    for _ in range(40):
        page.keyboard.press("Tab")
        if not dlg.evaluate(JS_FOCO_ADENTRO):
            fallas.append(f"{nombre}: Tab sacó el foco de la ventana")
            break

    if escribir is not None:
        escribir(page, dlg)
        page.keyboard.press("Escape")
        pregunta = page.get_by_role("alertdialog", name="¿Descartar lo que escribiste?")
        try:
            pregunta.wait_for(timeout=1500)
            pregunta.get_by_role("button", name="Seguir editando").click()
            page.wait_for_timeout(250)
        except Exception:
            fallas.append(f"{nombre}: con algo escrito, Escape cerró sin preguntar")
            return fallas
        if not dlg.is_visible():
            return fallas + [f"{nombre}: 'Seguir editando' cerró la ventana"]

        # Un clic en el velo, igual.
        page.mouse.click(6, 6)
        try:
            pregunta.wait_for(timeout=1500)
        except Exception:
            fallas.append(f"{nombre}: con algo escrito, un clic afuera cerró sin preguntar")
            return fallas
        salida = pregunta.get_by_role("button", name="Descartar")
        salida.click()
        if not page.evaluate(JS_SALE_ANIMADA):
            fallas.append(f"{nombre}: al descartar desaparece de golpe, sin salida")
    else:
        page.keyboard.press("Escape")
        if not page.evaluate(JS_SALE_ANIMADA):
            fallas.append(f"{nombre}: al cerrar desaparece de golpe, sin salida")

    page.wait_for_timeout(400)
    if dlg.count() > 0 and dlg.is_visible():
        return fallas + [f"{nombre}: no se cerró"]
    foco = page.evaluate("document.activeElement ? document.activeElement.innerText : ''") or ""
    if texto_boton and texto_boton not in foco:
        fallas.append(f"{nombre}: al cerrar, el foco no volvió a '{texto_boton}' (está en {foco.strip()[:40]!r})")

    # Sin nada escrito, Escape cierra de una.
    if escribir is not None:
        _, dlg = abrir(page)
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        if page.get_by_role("alertdialog").count() > 0:
            fallas.append(f"{nombre}: sin nada escrito, Escape igual preguntó")
        cerrar_ventanas(page)
    return fallas


@caso("TRA-01 · todas las ventanas se cierran igual: preguntan, salen animadas, retienen y devuelven el foco")
def caso_un_solo_marco(page: Page) -> list[str]:
    fallas: list[str] = []
    for nombre, abrir, escribir in VENTANAS:
        fallas += probar_ventana(page, nombre, abrir, escribir)
    cerrar_ventanas(page)
    return fallas


@caso("VED-02 y PAQ-01 · Escape cierra primero la lista de sugerencias, y las flechas eligen")
def caso_escape_por_capas(page: Page) -> list[str]:
    fallas: list[str] = []
    cerrar_ventanas(page)
    p = producto_para_vender(page)

    # Nueva venta: flechas y Enter eligen de la lista.
    _, dlg = abrir_nueva_venta(page)
    buscar = dlg.get_by_placeholder("Buscar por nombre o código")
    buscar.fill(p["nombre"][:4])
    page.wait_for_timeout(300)
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    if dlg.get_by_placeholder("Buscar por nombre o código").count() > 0 and \
            dlg.locator("ul button").count() > 0:
        fallas.append("Nueva venta: flecha abajo y Enter no eligieron un producto de la lista")
    cerrar_ventanas(page)

    # Registrar paquete: Escape en la lista la cierra y el editor sigue.
    abrir_paquete(page)
    dlg = ventana_abierta(page)
    campo = dlg.get_by_label("Buscar producto para agregar")
    campo.fill(p["nombre"][:4])
    page.wait_for_timeout(300)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    if page.get_by_role("alertdialog").count() > 0 or not dlg.is_visible():
        fallas.append("Registrar paquete: Escape en la lista de sugerencias quiso cerrar el editor")
    cerrar_ventanas(page)
    abrir_paquete(page)
    dlg = ventana_abierta(page)
    campo = dlg.get_by_label("Buscar producto para agregar")
    campo.fill(p["nombre"][:4])
    page.wait_for_timeout(300)
    opciones = dlg.locator("[role='option']")
    if opciones.count() < 1:
        fallas.append("Registrar paquete: las sugerencias no son opciones de una lista (role=option)")
    else:
        page.keyboard.press("ArrowDown")
        page.wait_for_timeout(100)
        marcada = dlg.locator("[role='option'][aria-selected='true']")
        if marcada.count() != 1:
            fallas.append("Registrar paquete: la flecha abajo no marca ninguna sugerencia")
    cerrar_ventanas(page)

    # Nuevo encargo: la lista de clientas, con flechas, Enter y Escape.
    _, dlg = abrir_encargo(page)
    clienta = dlg.get_by_label("Clienta")
    clienta.fill("a")
    page.wait_for_timeout(300)
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    # Elegida, el buscador se reemplaza por su nombre.
    if dlg.locator("input[aria-label='Clienta']").count() > 0:
        fallas.append("Nuevo encargo: flecha abajo y Enter no eligieron una clienta")
    # Y Escape en la lista la cierra sin cerrar la ventana.
    dlg.get_by_role("button", name="Cambiar").first.click()
    dlg.locator("input[aria-label='Clienta']").fill("a")
    page.wait_for_timeout(300)
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)
    if page.get_by_role("alertdialog").count() > 0 or not dlg.is_visible():
        fallas.append("Nuevo encargo: Escape en la lista de clientas quiso cerrar la ventana")
    elif dlg.locator("[role='listbox']").count() > 0:
        fallas.append("Nuevo encargo: Escape no cerró la lista de clientas")
    cerrar_ventanas(page)
    return fallas


@caso("BAS-07 · confirmar una anulación dice 'Anulando…' mientras corre y no deja apretar dos veces")
def caso_confirmar_ocupado(page: Page) -> list[str]:
    fallas: list[str] = []
    cerrar_ventanas(page)
    venta = page.evaluate("""async () => {
      const p = (await window.api.productos.list()).data.find((x) => x.activo !== false && x.existencias >= 1 && x.variantes.length <= 1);
      const r = await window.api.ventas.crear({
        fecha: new Date().toISOString().slice(0, 10), tipo: 'INVENTARIO',
        lineas: [{ producto_id: p.id, variante_id: p.variantes[0]?.id, cantidad: 1, precio_unitario_usd_cents: 1500 }],
      });
      const v = (await window.api.ventas.get(r.data.id)).data;
      window.__anulaciones = 0;
      const anular = window.api.ventas.cambiarEstado;
      window.api.ventas.cambiarEstado = async (...a) => {
        window.__anulaciones++;
        await new Promise((r) => setTimeout(r, 1500));
        return anular(...a);
      };
      return { id: v.id, codigo: v.codigo };
    }""")
    ir_a(page, "Inicio")
    ir_a(page, "Ventas")
    fila_de(page, venta["codigo"]).click()
    page.wait_for_timeout(600)
    page.get_by_role("button", name="Anular esta venta").first.click()
    confirmar = page.get_by_role("alertdialog")
    try:
        confirmar.wait_for(timeout=2000)
    except Exception:
        return ["anular la venta no pidió confirmación"]
    boton = confirmar.get_by_role("button", name=re.compile("^Sí"))
    boton.click()
    page.wait_for_timeout(250)
    if confirmar.count() == 0 or not confirmar.is_visible():
        fallas.append("la confirmación se cerró antes de que terminara de anular")
    elif "Anulando" not in confirmar.inner_text():
        fallas.append("mientras anula, el botón no dice 'Anulando…'")
    try:
        boton.click(timeout=500)
    except Exception:
        pass
    page.wait_for_timeout(2200)
    if page.evaluate("window.__anulaciones") != 1:
        fallas.append(f"se anuló {page.evaluate('window.__anulaciones')} veces")
    if page.get_by_role("alertdialog").count() > 0:
        fallas.append("la confirmación no se cerró al terminar")
    cerrar_ventanas(page)
    return fallas


JS_FOCO_INVALIDO = """() => {
  const a = document.activeElement;
  return a ? { invalido: a.getAttribute('aria-invalid') === 'true', etiqueta: a.getAttribute('aria-label') || a.id || a.tagName } : null;
}"""


def foco_en_campo_invalido(page: Page) -> bool:
    page.wait_for_timeout(150)
    r = page.evaluate(JS_FOCO_INVALIDO)
    return bool(r and r["invalido"])


@caso("TRA-10 · guardar con algo mal lleva el foco al campo y dice ahí qué falta; los botones principales no se apagan")
def caso_errores_en_su_campo(page: Page) -> list[str]:
    fallas: list[str] = []
    cerrar_ventanas(page)

    # Producto nuevo sin nombre.
    _, dlg = abrir_producto(page)
    dlg.get_by_role("button", name="Crear producto").click()
    if not foco_en_campo_invalido(page):
        fallas.append("Producto nuevo: sin nombre, el foco no fue al nombre marcado con error")
    cerrar_ventanas(page)

    # Clienta sin nombre.
    _, dlg = abrir_clienta(page)
    dlg.get_by_role("button", name="Guardar", exact=True).click()
    if not foco_en_campo_invalido(page):
        fallas.append("Agregar clienta: sin nombre, el foco no fue al nombre marcado con error")
    cerrar_ventanas(page)

    # Registrar paquete: sin líneas el botón está activo y dice qué falta.
    abrir_paquete(page)
    dlg = ventana_abierta(page)
    pasar = dlg.get_by_role("button", name="Pasar al inventario")
    if not pasar.is_enabled():
        fallas.append("Registrar paquete: 'Pasar al inventario' está apagado sin líneas y no dice por qué")
    # Una línea sin unidades: la fila se marca y el foco va a sus unidades.
    p = producto_para_vender(page)
    dlg.get_by_label("Buscar producto para agregar").fill(p["nombre"])
    page.wait_for_timeout(300)
    page.keyboard.press("Enter")
    page.wait_for_timeout(300)
    unidades = dlg.locator("input[aria-label^='Unidades de']").first
    if unidades.count() == 0:
        fallas.append("Registrar paquete: Enter en el buscador no agregó la línea")
    else:
        unidades.fill("")
        pasar.click()
        page.wait_for_timeout(200)
        r = page.evaluate(JS_FOCO_INVALIDO)
        if not r or not r["invalido"] or not str(r["etiqueta"]).startswith("Unidades de"):
            fallas.append(f"Registrar paquete: sin unidades, el foco no fue a esa línea (está en {r})")
        if dlg.locator("tr [role='alert']").count() == 0:
            fallas.append("Registrar paquete: el mensaje no está junto a la línea")
    cerrar_ventanas(page)

    # Nueva venta: Siguiente sin producto.
    _, dlg = abrir_nueva_venta(page)
    dlg.get_by_role("button", name="Siguiente").click()
    if not foco_en_campo_invalido(page):
        fallas.append("Nueva venta: sin producto, el foco no fue a la línea marcada con error")
    cerrar_ventanas(page)

    # Configuración: una tasa que no es número.
    ir_a(page, "Inicio")
    ir_a(page, "Configuración")
    page.get_by_label("Córdobas por dólar").fill("abc")
    page.get_by_role("button", name=re.compile("^Guardar configuración")).click()
    if not foco_en_campo_invalido(page):
        fallas.append("Configuración: una tasa mal escrita no lleva el foco a la tasa")
    if page.get_by_text("Tiene que ser mayor a cero.").count() == 0:
        fallas.append("Configuración: el error de la tasa no está en su campo")
    descartar = page.get_by_role("button", name="Descartar")
    if descartar.count() > 0:
        descartar.first.click()
    else:
        recargar_datos(page)
    page.wait_for_timeout(300)
    return fallas


@caso("TRA-09 · Ctrl+Enter guarda en todas las ventanas, y Enter no guarda a medias")
def caso_un_modelo_de_teclado(page: Page) -> list[str]:
    fallas: list[str] = []
    cerrar_ventanas(page)
    nombre = "Clienta Teclado " + str(page.evaluate("Date.now() % 100000"))
    _, dlg = abrir_clienta(page)
    campo = dlg.get_by_label("Nombre").first
    campo.fill(nombre)
    page.keyboard.press("Enter")
    page.wait_for_timeout(500)
    if not dlg.is_visible():
        fallas.append("Agregar clienta: Enter en el nombre guardó, con el resto sin llenar")
    else:
        page.keyboard.press("Control+Enter")
        page.wait_for_timeout(700)
        existe = page.evaluate("async (n) => (await window.api.clientes.list(n)).data.some((c) => c.nombre === n)", nombre)
        if not existe:
            fallas.append("Agregar clienta: Ctrl+Enter no guardó")
    cerrar_ventanas(page)

    _, dlg = abrir_producto(page)
    dlg.get_by_label("Nombre").first.fill("Producto Teclado")
    page.keyboard.press("Enter")
    page.wait_for_timeout(500)
    if not dlg.is_visible():
        fallas.append("Producto nuevo: Enter en el nombre guardó, con el resto sin llenar")
    cerrar_ventanas(page)

    ir_a(page, "Inicio")
    ir_a(page, "Configuración")
    page.evaluate("""() => {
      window.__guardados = 0;
      const update = window.api.parametros.update;
      window.api.parametros.update = async (v) => { window.__guardados++; return update(v); };
    }""")
    campo = page.get_by_label("Nombre del negocio")
    original = campo.input_value()
    campo.fill(original + " ")
    page.keyboard.press("Enter")
    page.wait_for_timeout(400)
    if page.evaluate("window.__guardados") != 0:
        fallas.append("Configuración: Enter en un campo guardó toda la página")
    campo.fill(original)
    page.wait_for_timeout(200)
    return fallas


@caso("CFG-02 y CFG-16 · Configuración dice lo que no se guardó, pregunta antes de salir y confirma con un 'Guardado'")
def caso_configuracion_pendiente(page: Page) -> list[str]:
    fallas: list[str] = []
    cerrar_ventanas(page)
    ir_a(page, "Inicio")
    ir_a(page, "Configuración")
    telefono = page.get_by_label("Teléfono").first
    original = telefono.input_value()
    telefono.fill("8888-1111")
    page.wait_for_timeout(200)
    if page.get_by_text("Hay cambios sin guardar").count() == 0:
        fallas.append("con un cambio escrito, la página no dice que hay algo sin guardar")

    page.get_by_role("button", name="Ventas", exact=False).first.click()
    pregunta = page.get_by_role("alertdialog", name="¿Salir sin guardar?")
    try:
        pregunta.wait_for(timeout=1500)
        pregunta.get_by_role("button", name="Seguir editando").click()
        page.wait_for_timeout(300)
        if page.get_by_label("Teléfono").first.input_value() != "8888-1111":
            fallas.append("'Seguir editando' perdió lo escrito")
    except Exception:
        fallas.append("irse de Configuración con algo sin guardar no preguntó")
        ir_a(page, "Configuración")

    # Guardar: una sola confirmación, en el botón.
    page.get_by_label("Teléfono").first.fill(original)
    page.wait_for_timeout(100)
    page.get_by_label("Teléfono").first.fill(original + "9")
    page.get_by_role("button", name=re.compile("^Guardar configuración")).click()
    page.wait_for_timeout(500)
    if page.get_by_role("button", name=re.compile("^Guardado$")).count() == 0:
        fallas.append("después de guardar, el botón no dice 'Guardado'")
    if page.get_by_text("Configuración guardada con éxito").count() > 0:
        fallas.append("guardar sigue mostrando además un aviso flotante")
    # Dejarlo como estaba.
    page.get_by_label("Teléfono").first.fill(original)
    page.get_by_role("button", name=re.compile("^Guardar configuración")).click()
    page.wait_for_timeout(500)
    return fallas


@caso("ENC-20 y ENC-21 · 'Aceptó' protege todo lo escrito, y un error del servidor no se pega al monto")
def caso_acepto(page: Page) -> list[str]:
    fallas: list[str] = []
    cerrar_ventanas(page)
    codigo = page.evaluate("""async () => {
      const cliente = (await window.api.clientes.list('')).data[0];
      const r = await window.api.ventas.crear({
        cliente_id: cliente.id, fecha: new Date().toISOString().slice(0, 10), tipo: 'ENCARGO',
        lineas: [{ descripcion: 'Bolso acepto', cantidad: 1, precio_unitario_usd_cents: 4000 }],
      });
      await window.api.ventas.marcarEnviada(r.data.id);
      return (await window.api.ventas.get(r.data.id)).data.codigo;
    }""")
    ir_a(page, "Inicio")
    ir_a(page, "Encargos")
    abrir_detalle(page, codigo)
    page.get_by_role("button", name="Aceptó", exact=True).click()
    dlg = page.get_by_role("dialog", name=re.compile("aceptó$"))
    dlg.wait_for(timeout=3000)
    dlg.get_by_role("radio", name="Sí, pagó").click()
    dlg.get_by_label("Referencia").fill("Transferencia 123")
    page.keyboard.press("Escape")
    try:
        page.get_by_role("alertdialog", name="¿Descartar lo que escribiste?").wait_for(timeout=1500)
        page.get_by_role("alertdialog").get_by_role("button", name="Seguir editando").click()
    except Exception:
        fallas.append("con la referencia escrita, Escape cerró 'Aceptó' sin preguntar")

    page.evaluate("""() => {
      window.api.ventas.aceptar = async () => ({ success: false, error: 'No hay conexión con la base.' });
    }""")
    dlg.get_by_role("button", name="Aceptó", exact=True).click()
    page.wait_for_timeout(400)
    monto = dlg.get_by_label("Cuánto pagó")
    if monto.get_attribute("aria-invalid") == "true":
        fallas.append("el error del servidor quedó pegado al monto, como si el monto estuviera mal")
    if dlg.get_by_text("No hay conexión con la base.").count() == 0:
        fallas.append("el error del servidor no se ve")
    recargar_datos(page)
    cerrar_ventanas(page)
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

        # `SOLO=texto` corre sólo los casos cuyo nombre lo contiene (más el de
        # la consola, que cierra la corrida). Para iterar sin esperar la suite.
        solo = os.environ.get("SOLO", "")
        for nombre, fn in CASOS:
            if solo and solo not in nombre and nombre != "no quedan errores de consola":
                continue
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
