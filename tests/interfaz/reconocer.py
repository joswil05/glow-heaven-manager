"""
Reconocimiento: entra a la app y describe lo que hay en pantalla.

No afirma nada, solo mira. Sirve para descubrir los selectores reales antes
de escribir pruebas contra ellos, en vez de inventarlos.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from playwright.sync_api import sync_playwright  # noqa: E402

import arnes  # noqa: E402


def describir(page, titulo: str) -> None:
    print(f"\n{'=' * 70}\n{titulo}\n{'=' * 70}")

    botones = page.locator("button").all()
    print(f"\n  botones ({len(botones)}):")
    for b in botones[:30]:
        try:
            texto = (b.inner_text() or "").strip().replace("\n", " / ")
            etiqueta = b.get_attribute("aria-label") or ""
            visible = b.is_visible()
            if texto or etiqueta:
                print(f"    [{'v' if visible else ' '}] {texto[:55]!r} aria={etiqueta[:30]!r}")
        except Exception:
            pass

    entradas = page.locator("input, textarea, select").all()
    print(f"\n  campos ({len(entradas)}):")
    for e in entradas[:25]:
        try:
            print(
                f"    tipo={e.get_attribute('type')!r} "
                f"placeholder={e.get_attribute('placeholder')!r} "
                f"inputmode={e.get_attribute('inputmode')!r} "
                f"visible={e.is_visible()}"
            )
        except Exception:
            pass

    encabezados = page.locator("h1, h2, h3").all()
    print(f"\n  titulos ({len(encabezados)}):")
    for h in encabezados[:15]:
        try:
            t = (h.inner_text() or "").strip()
            if t:
                print(f"    {t[:60]!r}")
        except Exception:
            pass


def main() -> int:
    if not arnes.emulador_vivo():
        print("El emulador no responde. Corré `npm run emulador`.")
        return 1

    arnes.limpiar_base()
    uid = arnes.crear_usuario_autorizado()
    print(f"cuenta de prueba lista, uid={uid}")

    with sync_playwright() as p:
        navegador = p.chromium.launch(headless=True)
        contexto = navegador.new_context(
            viewport={"width": 390, "height": 844},  # tamaño de teléfono
            is_mobile=True,
            has_touch=True,
            # La app declara una CSP que sólo deja salir por https. Está bien
            # que sea así: el emulador local es http y queda afuera. En vez de
            # aflojar la política del producto, se la saltea el navegador de
            # prueba, que es para lo que existe esta opción.
            bypass_csp=True,
        )
        page = contexto.new_page()

        errores: list[str] = []
        arnes.registrar_consola(page, errores)

        arnes.abrir_app(page)
        print("\nentró a la app")
        describir(page, "INICIO")

        # Recorre las pestañas de la barra inferior.
        nav = page.locator("nav button, nav a")
        print(f"\n  pestañas en la barra: {nav.count()}")
        for i in range(nav.count()):
            try:
                etiqueta = (nav.nth(i).inner_text() or "").strip().replace("\n", " ")
                print(f"    {i}: {etiqueta!r}")
            except Exception:
                pass

        for i in range(nav.count()):
            try:
                etiqueta = (nav.nth(i).inner_text() or "").strip().replace("\n", " ")
                nav.nth(i).click()
                page.wait_for_timeout(1200)
                describir(page, f"PESTAÑA {i}: {etiqueta}")
                page.screenshot(path=f"/tmp/pantalla-{i}.png")
            except Exception as err:
                print(f"    no pude abrir la pestaña {i}: {err}")

        print(f"\n{'=' * 70}\nerrores de consola: {len(errores)}")
        for e in errores[:15]:
            print(f"   {e[:160]}")

        navegador.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
