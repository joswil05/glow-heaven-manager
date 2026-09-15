"""
Arnés de las pruebas de interfaz de la PWA móvil.

Por qué existe
--------------
Hasta acá todo lo probado vivía por debajo de la pantalla: el núcleo puro y
los repositorios. Pero la mitad de las decisiones que puede arruinar un dato
—qué se valida, qué pasa al tocar dos veces, si un error se muestra o se
traga— vive en los formularios, y ahí no llegaba ninguna prueba.

El obstáculo era el acceso: la única puerta de la app es Google, y ese flujo
no se automatiza. La solución es que la app, y SOLO cuando está apuntada al
emulador local, exponga una puerta de servicio (`window.__pruebaIngresar`).
En una build de producción esa variable de entorno vale cadena vacía y el
bloque entero desaparece del bundle; está comprobado grepeando el bundle.

Cómo correrlo
-------------
    npm run emulador                  (una terminal)
    npm run test:interfaz             (otra)
"""
from __future__ import annotations

import json
import urllib.request
import urllib.error

PROYECTO = "glow-heaven-db-app"
HOST_FIRESTORE = "127.0.0.1:8080"
HOST_AUTH = "127.0.0.1:9099"
# Vite escucha en `localhost`, que en Windows resuelve a IPv6: con
# 127.0.0.1 la conexión se rechaza.
URL_APP = "http://localhost:5174"

CORREO = "pruebas@glowheaven.local"
CLAVE = "prueba1234"

URL_DOCS = (
    f"http://{HOST_FIRESTORE}/emulator/v1/projects/{PROYECTO}"
    f"/databases/(default)/documents"
)


def _peticion(url: str, metodo: str = "GET", cuerpo: dict | None = None,
              cabeceras: dict | None = None) -> dict:
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    pedido = urllib.request.Request(url, data=datos, method=metodo)
    pedido.add_header("Content-Type", "application/json")
    for clave, valor in (cabeceras or {}).items():
        pedido.add_header(clave, valor)
    try:
        with urllib.request.urlopen(pedido, timeout=15) as respuesta:
            texto = respuesta.read().decode()
            return json.loads(texto) if texto else {}
    except urllib.error.HTTPError as err:
        return {"error": json.loads(err.read().decode() or "{}")}


def emulador_vivo() -> bool:
    try:
        urllib.request.urlopen(f"http://{HOST_FIRESTORE}/", timeout=3)
        return True
    except Exception:
        return False


def limpiar_base() -> None:
    """Deja la base del emulador vacía, como antes de cada prueba."""
    _peticion(URL_DOCS, metodo="DELETE")


def crear_usuario_autorizado() -> str:
    """
    Crea (o recupera) la cuenta de prueba en el emulador de Auth y la mete en
    la lista blanca que exigen las reglas de Firestore. Devuelve el UID.
    """
    base = f"http://{HOST_AUTH}/identitytoolkit.googleapis.com/v1"
    cuerpo = {"email": CORREO, "password": CLAVE, "returnSecureToken": True}

    r = _peticion(f"{base}/accounts:signUp?key=fake-api-key", "POST", cuerpo)
    if "error" in r:
        # Ya existía de una corrida anterior: entrar en vez de crear.
        r = _peticion(f"{base}/accounts:signInWithPassword?key=fake-api-key", "POST", cuerpo)

    uid = r.get("localId")
    if not uid:
        raise RuntimeError(f"No se pudo crear la cuenta de prueba: {r}")

    # `usuarios_autorizados` es de solo lectura desde el cliente, a propósito.
    # El token `owner` del emulador es la única forma de sembrarla.
    _peticion(
        f"http://{HOST_FIRESTORE}/v1/projects/{PROYECTO}/databases/(default)"
        f"/documents/usuarios_autorizados/{uid}",
        "PATCH",
        {"fields": {"activo": {"booleanValue": True}}},
        {"Authorization": "Bearer owner"},
    )
    return uid


def abrir_app(page, ruta: str = "/") -> None:
    """Abre la app y entra con la cuenta de prueba."""
    page.goto(f"{URL_APP}{ruta}")
    page.wait_for_function("() => typeof window.__pruebaIngresar === 'function'", timeout=30000)
    page.evaluate(
        "([c, k]) => window.__pruebaIngresar(c, k)",
        [CORREO, CLAVE],
    )
    # La app entra cuando `onAuthStateChanged` le avisa. La barra inferior es
    # lo primero que aparece del otro lado del login.
    page.wait_for_selector("nav", timeout=30000)

    # Nada de `networkidle`: Firestore deja una conexión de escucha abierta y
    # la red nunca queda quieta. Se espera a que el panel deje de decir que
    # está cargando, que es la señal real de que hay datos en pantalla.
    esperar_datos(page)


def esperar_datos(page, timeout: int = 20000) -> None:
    """Espera a que se apaguen los esqueletos de carga de la pantalla actual."""
    try:
        page.wait_for_function(
            """() => {
                const cargando = document.querySelectorAll('.animate-pulse, [data-cargando="true"]');
                return cargando.length === 0;
            }""",
            timeout=timeout,
        )
    except Exception:
        # Si la pantalla no usa esqueletos, no hay nada que esperar.
        pass
    page.wait_for_timeout(600)


def registrar_consola(page, errores: list[str]) -> None:
    """Junta los errores de consola: una pantalla que falla en silencio igual los deja."""
    def al_mensaje(msg):
        if msg.type == "error":
            errores.append(msg.text)

    page.on("console", al_mensaje)
    page.on("pageerror", lambda e: errores.append(f"pageerror: {e}"))
