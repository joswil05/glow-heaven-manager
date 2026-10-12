# C3 · Sin internet: consultar (sólo celular) · plan de implementación

> **Para el agente de turno:** una tarea a la vez, sobre `master`, en relevo
> según [RELEVO.md](../../RELEVO.md). Leer el diseño y este plan antes de
> tocar código. Primero la prueba que falla, después el código.

**Objetivo:** sin señal, el celular abre y muestra lo último que cargó, con
una franja arriba: "Sin conexión · datos de las 10:42". Lo que escribe
(vender, cobrar, anotar, corregir…) lo dice al tocarlo, en vez de quedarse
en "Guardando…" o fallar. Escribir sin red es C4, no esta fase.

**Arquitectura:** casi todo lo necesario ya existe y no se reemplaza: la
caché persistente de Firestore, la sesión en IndexedDB y el service worker.
Se agregan cuatro piezas chicas y probables solas: el estado de la conexión
(`lib/conexion-movil.ts`), la memoria del acceso (`lib/acceso-movil.ts`), la
franja y un guardián de escrituras (`useExigirConexion`). Ninguna cuenta de
negocio cambia y Windows no se toca.

**Tecnologías:** React 18, Firestore web con `persistentLocalCache` (ya
activo), Firebase Auth con `indexedDBLocalPersistence` (ya activo),
vite-plugin-pwa (`generateSW`), Vitest, Playwright Python.

**Diseño:** [2026-10-02-fases-del-celular-design.md](../specs/2026-10-02-fases-del-celular-design.md),
sección C3, "Criterios de diseño" y "Lo que queda abierto".

**Estado:** plan escrito el 11/10/2026, sin implementar. C1 y C2 están
publicadas en la 2.18.0; la 2.18.1 trajo el flete por libras.

## Reglas para todas las tareas

- Un commit por **paso**, con su casilla marcada en ese mismo commit:
  `C3 · Tn · paso N: descripción`. Rutas explícitas, incluido este plan;
  nunca `git add -A`. Bitácora de RELEVO al terminar cada tarea.
- Primero el caso rojo, después el código, después verde. Si algo del plan
  no coincide con el código, parar y anotarlo en la bitácora.
- **Sólo el celular.** No cambiar Windows ni el comportamiento con red.
- **Nunca un valor inventado sin red**: ni la tasa de cambio por defecto, ni
  parámetros escritos de oficio, ni "no hay ventas" cuando en realidad no se
  pudo leer.
- **Sin red no se escribe en Firestore** desde una acción de la persona:
  se avisa en la entrada (el botón que abre la hoja) y otra vez al guardar,
  por si la señal se cortó con la hoja abierta, conservando lo escrito.
- Haptics antes del primer `await`; `haptics.warning()` al avisar que no
  hay señal. Colores por token (`alerta-suave`/`alerta-fuerte`). La franja no
  se anima: aparece y desaparece. Textos en vos, del glosario.
- Las pruebas sin red corren en su propio corredor (T3), contra el build de
  producción servido con `vite preview`: ver la trampa de abajo.
- Emulador y pruebas de interfaz **en serie**. Apagar el emulador al parar
  (sólo los PID propios en 8080, 9099, 4400 y 9150). Las corridas reescriben
  `tests/interfaz/fixtures-pdf.json`: restaurarlo con `git checkout --`.

## Lo que ya existe y lo que frena (comprobado el 11/10)

| Qué | Dónde | Sin red hoy |
|---|---|---|
| Caché persistente de Firestore | `src/main/firebase/client.ts:31` (`persistentLocalCache`, `persistentMultipleTabManager`) | Sirve: las lecturas caen a la caché. |
| Sesión guardada | `mobile/src/lib/firebase-mobile.ts:117` (`initializeAuth` con IndexedDB y localStorage) | Sirve: `onAuthStateChanged` devuelve la cuenta sin red. |
| La app precacheada | `mobile/vite.config.ts` (`VitePWA`, `globPatterns` js/css/html/svg/png/ico) | Sirve, salvo las fuentes de Google, que no se cachean: sin red cambia la letra. |
| El acceso | `mobile/src/App.tsx:42-74` → `AccesosRepo.verificarOReclamar` (`accesos.repo.ts` ~187) | **Frena**: la dueña (`UID_DUENIA`) pasa directo; cualquier otra cuenta cae en "No pudimos comprobar tu acceso" si su documento no está en caché. |
| Los parámetros | `mobile/src/context/DataContext.tsx:74-91` | **Inventa**: si fallan, `DEFAULT_PARAMS` (tasa 36.62, nombre "Glow Heaven"). |
| Parámetros por defecto | `ParametrosRepo.getParametros` (`parametros.repo.ts:78-90`) | **Peligro**: si no encuentra el documento, escribe los defectos; sin red esa escritura queda en cola y pisa los reales al volver. |
| Escrituras | unas 20, ver T6 | **Cuelgan o fallan**: un lote espera al servidor ("Guardando…" para siempre); una transacción falla con un error técnico. |

## Trampa: el servidor de desarrollo recarga la página

La suite móvil (`npm run test:interfaz`) corre sobre `npx vite` de
desarrollo, sin service worker (`devOptions.enabled: false`). Además, el
cliente de Vite pierde su conexión al cortar la red y, cuando vuelve,
**recarga la página**. Por eso:

- "Abrir sin red" sólo se puede probar con el build real y su service
  worker.
- Volver la red en la suite de desarrollo recarga todo y rompe el caso.

T3 arma un corredor aparte: build de producción apuntado al emulador, en
otra carpeta, servido con `vite preview`. Todas las pruebas de C3 que
cortan la red van ahí.

## Mapa de archivos

| Archivo | Responsabilidad en C3 |
|---|---|
| `mobile/src/lib/conexion-movil.ts` (nuevo) | Estado de la conexión y "datos de las…", sin React; probable solo |
| `mobile/src/context/ConexionContext.tsx` (nuevo) | Provee el estado a toda la app, también al login |
| `mobile/src/lib/acceso-movil.ts` (nuevo) | Recordar, olvidar y decidir el acceso sin red |
| `mobile/src/App.tsx` | Acceso sin red, franja, proveedor |
| `mobile/src/context/AuthContext.tsx` | Olvidar el acceso al cerrar sesión |
| `mobile/src/views/LoginView.tsx` | Decir que la primera entrada necesita internet |
| `mobile/src/context/DataContext.tsx` | Sin defectos inventados; escuchar la sincronización; recargar al volver |
| `src/main/firebase/repositories/parametros.repo.ts` | No escribir defectos sin red |
| `mobile/src/components/FranjaSinConexion.tsx` (nuevo) | La franja |
| `mobile/src/lib/useExigirConexion.ts` (nuevo) | Avisar y frenar una escritura sin red |
| Las vistas y hojas de T6 | Llamar al guardián en la entrada y al guardar |
| `mobile/vite.config.ts` | Cachear las fuentes |
| `scripts/test-sin-conexion.mjs`, `tests/interfaz/sin_conexion.py` (nuevos) | Corredor y casos sin red |
| `tests/c3-conexion.test.ts`, `tests/c3-acceso.test.ts`, `tests/c3-parametros.test.ts` (nuevos) | Unitarias |
| `package.json`, `.gitignore` | Script `test:sin-conexion`; ignorar `dist-mobile-pruebas/` |

## Contratos nuevos

```ts
// mobile/src/lib/conexion-movil.ts
export const CLAVE_DATOS_DE = 'gh:datos-de';
export interface EntornoConexion {
  enLinea(): boolean;                       // navigator.onLine
  escuchar(evento: 'online' | 'offline', fn: () => void): () => void;
  leer(clave: string): string | null;       // localStorage, con try/catch
  guardar(clave: string, valor: string): void;
  ahora(): number;
}
export interface EstadoConexion {
  enLinea: boolean;
  /** Último momento con datos del servidor. null: nunca hubo. */
  datosDe: number | null;
}
export interface Conexion {
  estado(): EstadoConexion;
  suscribir(fn: (e: EstadoConexion) => void): () => void;
  /** Firestore entregó datos del servidor (`metadata.fromCache === false`). */
  sincronizado(): void;
  /** Firestore sirve desde la caché (`metadata.fromCache === true`). */
  desdeCache(): void;
  detener(): void;
}
export function crearConexion(entorno: EntornoConexion): Conexion;
/** Lo que sigue a "datos": "de las 10:42", "de ayer a las 18:05", "del 3 oct a las 18:05". */
export function textoDatosDe(ms: number, ahora: Date): string;

// mobile/src/lib/acceso-movil.ts
export type EstadoAcceso = 'autorizado' | 'sin-permiso' | 'sin-conexion';
export function accesoRecordado(uid: string, almacen?: Storage): boolean;
export function recordarAcceso(uid: string, almacen?: Storage): void;
export function olvidarAcceso(uid: string, almacen?: Storage): void;
/** Qué mostrar con lo que se sabe. Pura: no lee ni escribe. */
export function decidirAcceso(p: {
  enLinea: boolean; recordado: boolean; resultado: EstadoAcceso | null;
}): EstadoAcceso | 'preguntar';

// mobile/src/lib/useExigirConexion.ts
/** Devuelve false y avisa si no hay red; true si se puede seguir. */
export function useExigirConexion(): (mensaje: string) => boolean;
```

"Enlínea" lo decide `navigator.onLine` y sus eventos: es inmediato y es lo
que cambia en modo avión. La señal débil (el teléfono cree que hay red y el
servidor no contesta) queda para C4, con la cola. "Datos de las…" es el
último momento en que Firestore confirmó datos del servidor: un `onSnapshot`
con `includeMetadataChanges` sobre `parametros/sistema` llama a
`sincronizado()` o `desdeCache()`, y al pasar a sin red, si estaba
sincronizado, se guarda la hora de ese instante.

> **Cambio del 11/10, al hacer T5:** `navigator.onLine` miente con un Wi-Fi
> sin internet o con señal débil (y en Playwright, después de recargar sin
> red, dice `true`). Por eso "en línea" también cuenta a Firestore: si sirve
> desde la caché más de `ESPERA_SERVIDOR_MS` (3 s) sin confirmar el
> servidor, es sin conexión; menos que eso es el arranque normal y la franja
> no parpadea. El entorno suma `programar(fn, ms)`. Las guardas de
> `getParametros` y `getCategorias` miran además `metadata.fromCache`, y
> `DataContext` reconoce el error de Firestore "offline" (`esErrorSinRed`).
> La franja ocupa el margen del notch y pone `--safe-t: 0px` a las
> pantallas; `pt-safe-t` lee `var(--safe-t, env(safe-area-inset-top))`.

---

## T1 · Línea base en el iPhone y almacenamiento persistente

**Archivos:** `mobile/src/App.tsx` (o `main.tsx`), este plan.

- [ ] **Paso 1 (Joswill, sin código; no bloquea T2 a T7): cómo se porta hoy**

Con la 2.18.1 instalada en la pantalla de inicio del iPhone de Ross:
abrirla con señal y recorrer Inicio, Cobros e Inventario; poner modo
avión; cerrarla del todo (deslizarla hacia arriba) y abrirla. Anotar en la
bitácora: si abre, si entra, si muestra datos y cuánto tarda. Repetir al
día siguiente y a los tres días sin abrirla, siempre desde el icono, no
desde Safari. Es lo que el diseño deja abierto: cuánto aguanta la caché en
un iPhone. Con la cuenta de la dueña el acceso ya pasa sin red, así que lo
que se mide es la caché y la sesión.

- [x] **Paso 2: pedir que el teléfono no borre los datos**

Después de entrar, una vez por sesión y sin esperar el resultado:
`navigator.storage?.persist?.()`. En un iPhone con la app instalada suele
concederse; en Safari puede que no. No se muestra nada. Prueba unitaria con
un `navigator` falso: se pide una vez, y sin `storage` no rompe.

## T2 · Saber si hay conexión y de cuándo son los datos

**Archivos:** nuevos `lib/conexion-movil.ts`, `context/ConexionContext.tsx`,
`tests/c3-conexion.test.ts`; `App.tsx`, `DataContext.tsx`.
**Produce:** `useConexion(): EstadoConexion` y `conexion.sincronizado/desdeCache`.

- [x] **Paso 1: pruebas rojas del estado**

`tests/c3-conexion.test.ts` con un `EntornoConexion` falso (reloj, almacén
y eventos en memoria):

```ts
it('arranca sin red con la hora que quedó guardada', () => {
  const e = entornoFalso({ enLinea: false, guardado: { [CLAVE_DATOS_DE]: '1760000000000' } });
  expect(crearConexion(e).estado()).toEqual({ enLinea: false, datosDe: 1760000000000 });
});
it('al cortarse la red estando sincronizada, guarda ese instante', () => {
  const e = entornoFalso({ enLinea: true, ahora: 1000 });
  const c = crearConexion(e);
  c.sincronizado();
  e.avanzar(60_000); e.disparar('offline');
  expect(c.estado()).toEqual({ enLinea: false, datosDe: 61_000 });
});
it('si nunca hubo datos del servidor, datosDe es null', () => { /* … */ });
it('desdeCache no adelanta la hora', () => { /* … */ });
it('avisa a los suscriptores al cambiar y deja de avisar al desuscribir', () => { /* … */ });
it('textoDatosDe: "de las 10:42", "de ayer a las 18:05", "del 3 oct a las 18:05"', () => { /* … */ });
```

- [x] **Paso 2: implementar y proveer**

`crearConexion` sin React. `ConexionProvider` crea una sola instancia con el
entorno real (`navigator.onLine`, `window.addEventListener`, `localStorage`
con try/catch) y la expone con `useConexion()`. Va en `App()`, por encima de
`AppContenido`, porque el acceso y el login también la usan. En
`DataProvider`, con sesión: el `onSnapshot` de `parametros/sistema` con
`includeMetadataChanges` llama a `sincronizado()` o `desdeCache()`; el error
del listener no se muestra (sin red es normal). Al pasar de sin red a con
red: `recargar()`, `recargarProductos(true)` y `marcarCambio()`, para que
cada pantalla traiga lo nuevo sola.

## T3 · El corredor sin red y el primer caso rojo

**Archivos:** nuevos `scripts/test-sin-conexion.mjs`,
`tests/interfaz/sin_conexion.py`; `package.json`, `.gitignore`.

- [x] **Paso 1: el corredor**

Copiar el armado de `scripts/test-interfaz.mjs` (comprobar el emulador, el
mismo `entorno` con `FIRESTORE_EMULATOR_HOST` y
`FIREBASE_AUTH_EMULATOR_HOST`, sembrar con `tests/interfaz/sembrar.test.ts`)
y cambiar el servidor: `npx vite build --config mobile/vite.config.ts
--outDir <raíz>/dist-mobile-pruebas` y después `npx vite preview --config
mobile/vite.config.ts --outDir <raíz>/dist-mobile-pruebas --port 5175
--strictPort`. **Otra carpeta a propósito**: ese build lleva el emulador
adentro y nunca se tiene que publicar (`desplegar-movil.mjs` sólo lee
`dist-mobile`). Agregar `dist-mobile-pruebas/` a `.gitignore` y el script
`"test:sin-conexion": "node scripts/test-sin-conexion.mjs"`.

`tests/interfaz/sin_conexion.py` reutiliza `arnes.py` con
`URL_APP = "http://localhost:5175"` (parametrizarlo en `arnes`, sin romper
la suite actual). El contexto de Playwright igual que el de `pruebas.py`
(390 × 844, `is_mobile`), con service workers permitidos.

- [x] **Paso 2: caso rojo "sin señal, la app abre con lo último que cargó"**

```python
arnes.abrir_app(page)                       # con red: entra y carga
ir_a(page, "Cobros"); ir_a(page, "Inventario"); ir_a(page, "Inicio")
page.evaluate("() => navigator.serviceWorker.ready")
page.reload(); arnes.esperar_datos(page)    # ahora la controla el SW
contexto.set_offline(True)
page.reload()                               # abrir sin red
expect(page.get_by_role("status").filter(has_text=re.compile("^Sin conexión"))).to_be_visible()
expect(page.locator("nav")).to_be_visible()
ir_a(page, "Cobros");     expect(page.locator("main:visible").last).to_contain_text("Ana Prueba")
ir_a(page, "Inventario"); expect(page.locator("main:visible").last).to_contain_text("Labial Mate Rojo")
```

Rojo esperado: no hay franja. Si además la app no abre, anotarlo: es lo
que T4 y T5 resuelven. Commit del corredor y del caso rojo.

> **Resultado del 11/10:** rojo sólo por la franja. Sin red, el build real
> ya abre, entra y muestra Inicio con sus datos (caché, sesión y service
> worker andan). La franja se busca con `get_by_role("status")` filtrado
> por texto: `status` no toma su nombre del contenido.

## T4 · Entrar sin señal

**Archivos:** nuevo `lib/acceso-movil.ts`, `tests/c3-acceso.test.ts`;
`App.tsx`, `AuthContext.tsx`, `LoginView.tsx`, `AjustesView.tsx`.

- [x] **Paso 1: pruebas rojas de `decidirAcceso` y la memoria**

| enLinea | recordado | resultado | decide |
|---|---|---|---|
| no | sí | (sin preguntar) | `autorizado` |
| no | no | `null` | `preguntar` (la dueña pasa sola; las demás prueban la caché) |
| sí | cualquiera | `null` | `preguntar` |
| cualquiera | no | `sin-conexion` | `sin-conexion` |
| cualquiera | sí | `sin-conexion` | `autorizado` |
| cualquiera | cualquiera | `autorizado` / `sin-permiso` | ese mismo |

(Corregido al escribir las pruebas: sin red y sin recuerdo decía
`sin-conexion`, y eso le cerraba la puerta a la dueña, que hoy pasa sin red.)

Más: recordar, leer y olvidar por `uid` en un `Storage` falso; con el
almacén roto (lanza), nada revienta y `accesoRecordado` da `false`.

- [x] **Paso 2: usarla en la puerta**

En `AppContenido`: sin red y con el acceso recordado, entrar sin llamar a
`puedeEntrar` (evita esperar a que Firestore se rinda). Con red, preguntar
como hoy: `autorizado` recuerda, `sin-permiso` olvida. Al volver la red
estando adentro por memoria, preguntar de nuevo en segundo plano; si dice
`sin-permiso`, olvidar y mostrar "Acceso no autorizado". Es una comprobación
de interfaz, no de seguridad: las reglas de Firestore siguen decidiendo
arriba, y sin red sólo se ve lo que ya estaba en este teléfono.

`salir()` olvida el acceso de esa cuenta antes de `signOut`. En Ajustes,
"Cerrar sesión" sin red agrega a su confirmación: "Sin señal no vas a poder
volver a entrar hasta tener internet." `LoginView` sin red: "Para entrar
hace falta internet. Después, la app abre aunque no haya señal."

En la suite el acceso no se prueba por pantalla: con el emulador
`puedeEntrar` devuelve `autorizado` siempre (`usandoEmuladorLocal`). Lo
cubren las unitarias; la prueba con una cuenta que no es la dueña queda
para el teléfono (T7).

## T5 · Mostrar lo guardado, nunca valores inventados

**Archivos:** `DataContext.tsx`, `parametros.repo.ts`, nuevo
`components/FranjaSinConexion.tsx`, `App.tsx`, `tests/c3-parametros.test.ts`,
`tests/interfaz/sin_conexion.py`.

- [x] **Paso 1: rojo de los parámetros**

`tests/c3-parametros.test.ts` con el Firestore falso
(`reiniciarFirestoreFalso`) y `navigator.onLine` en `false`: sin el
documento, `getParametros()` rechaza y **no escribe** nada en `parametros`.
Con red sigue creando los defectos como hoy (prueba de que no se rompió).

- [x] **Paso 2: sin defectos sin red**

En `getParametros`, antes de `aplicarLote` de los defectos: si
`typeof navigator !== 'undefined' && navigator.onLine === false`, lanzar
`new Error('sin-conexion')`. En Windows `navigator` no existe en el proceso
principal: no cambia nada allá. En `DataContext`, si falla sin red, no usar
`DEFAULT_PARAMS`: estado `sinDatosGuardados` y una pantalla tranquila:
"Este teléfono todavía no tiene datos guardados. Conectate una vez y
después la app abre aunque no haya señal." Con red, el comportamiento de
hoy no cambia.

- [x] **Paso 3: la franja**

`FranjaSinConexion` arriba de `Navegacion` (y de las vistas a pantalla
completa: Encargos y "Llegó un paquete"), con `pt-safe-t`:
`role="status"`, icono `WifiOff` de 16 px, `bg-alerta-suave
text-alerta-fuerte`, texto `Sin conexión · datos ${textoDatosDe(...)}`
o `Sin conexión · todavía no hay datos guardados`. Sin animación. No tapa
nada: empuja el contenido. Pasar el caso rojo de T3.

- [x] **Paso 4: cada pantalla con lo suyo**

Agregar a `sin_conexion.py` un recorrido sin red por Inicio, Vender,
Cobros (abrir la ficha de Ana Prueba), Historial, Inventario (abrir una
ficha) y Encargos: cada una muestra lo sembrado y ninguna dice "No se pudo
cargar" ni muestra una lista vacía que con red tenía datos. La pantalla que
falle se arregla para leer de la caché (un `getDocs` que no espere al
servidor; nunca reemplazar el error por un vacío). Después, `set_offline(False)`:
la franja desaparece y los datos se actualizan sin recargar.

> **Resultado del 11/10:** ninguna pantalla falló. Sin red, Inicio, Vender,
> Cobros (con la ficha de Ana Prueba), Historial, Inventario (con la ficha
> de un producto) y Encargos muestran lo sembrado, sin "No se pudo"; al
> volver la red la franja se va sola. No hubo que tocar ninguna vista.

## T6 · Lo que escribe lo dice

**Archivos:** nuevo `lib/useExigirConexion.ts` y las vistas de la tabla;
`tests/interfaz/sin_conexion.py`.

- [x] **Paso 1: caso rojo**

Sin red: en Vender, con un producto en el carrito, tocar "Cobrar" muestra
el aviso, vibra, el carrito sigue igual y no aparece ninguna venta nueva en
el emulador (leer con red al final). Lo mismo con "Registrar abono" desde la
ficha de Ana Prueba y con "Anotar un pedido".

- [ ] **Paso 2: el guardián**

```ts
export function useExigirConexion() {
  const { enLinea } = useConexion();
  const { mostrar } = useSnackbar();
  return (mensaje: string) => {
    if (enLinea) return true;
    haptics.warning();
    mostrar(mensaje, 'info');
    return false;
  };
}
```

- [ ] **Paso 3: aplicarlo en la entrada y al guardar**

| Dónde | Entrada | Al guardar | Mensaje |
|---|---|---|---|
| `QuickSaleView` | (la hoja de cobro se puede abrir: dice cuánto cobrar) | "Registrar venta" (`:224`), junto al botón | Sin conexión: la venta se cobra cuando vuelva la señal. El carrito queda como está. |
| Cobros, `DetalleCobroSheet`, `KardexClienteSheet` | Registrar abono | `AbonoModalSheet` (`:132`) | Sin conexión: el abono se registra cuando vuelva la señal. |
| `HistorialView`, `KardexClienteSheet` | Corregir, Anular | `CorregirVentaSheet:207`, `CorregirAbonoSheet:67`, `anular` (`HistorialView:158`, `KardexClienteSheet:145`) | Sin conexión: corregir o anular se puede cuando vuelva la señal. |
| Vender y Encargos | Anotar un pedido, Cotizar, Mandar cotización, Aceptó | `NuevoEncargoSheet:128`, `CotizarEncargoSheet:89`, "Ya la mandé" (`MandarCotizacionSheet:79`), `AceptarEncargoSheet:50` | Sin conexión: los encargos se anotan y se cambian cuando vuelva la señal. |
| `SeleccionarClientaSheet` | — | guardar clienta nueva (`:94`) | Sin conexión: la clienta nueva se guarda cuando vuelva la señal. |
| Inventario | Cambiar precio, Llegó un paquete | `CambiarPrecioSheet:68`, `RegistrarPaqueteView:76,157` | Sin conexión: esto se puede cuando vuelva la señal. |
| `AjustesView` | — | guardar, invitar, quitar acceso (`:140`) | Sin conexión: los cambios se guardan cuando vuelva la señal. |
| `Snackbar` | Deshacer (`:107`) | — | Sin conexión: se puede deshacer cuando vuelva la señal. |

Ver "Mandar cotización" sin red sí se puede (copiar, imprimir); sólo "Ya la
mandé" escribe. El resumen de un paquete (`DashboardView.cerrarResumen`) se
cierra en pantalla igual: Firestore sube la marca al volver y nadie la
espera. Una hoja que pierde la señal con algo escrito conserva lo escrito y
dice el mensaje junto al botón, no en un aviso que se va.

## T7 · Las fuentes, el cierre y la prueba física

**Archivos:** `mobile/vite.config.ts`, este plan, `docs/CONTEXTO_SESION.md`,
`docs/AUDITORIA_UX_2026-09-29.md`, `docs/RELEVO.md`.

- [ ] **Paso 1: cachear las fuentes**

En `workbox.runtimeCaching`: `fonts.googleapis.com` con
`StaleWhileRevalidate` (`gh-fuentes-css`) y `fonts.gstatic.com` con
`CacheFirst` (`gh-fuentes`, un año, `cacheableResponse: { statuses: [0, 200] }`).
Caso en `sin_conexion.py`: sin red, `document.fonts.check('16px "Plus Jakarta Sans"')`
da `true` (con red se cargó al menos una vez).

- [ ] **Paso 2: verificar y cerrar C3**

Correr en serie: `npm test`, `npm run typecheck`,
`npx tsc -p mobile/tsconfig.json --noEmit`, `npm run test:emulador`,
`npm run test:interfaz`, `npm run test:sin-conexion`,
`npm run test:interfaz-escritorio`, `npm run build:mobile` y
`git diff --check`. Ver a 390 px, claro y oscuro: la franja no tapa el
título ni la barra.

Dejar para Joswill, en el teléfono (Playwright no lo cubre): el paso 1 de
T1 otra vez con la versión nueva; entrar sin red con una cuenta que no sea
la dueña (por memoria del acceso); dejarla más de una hora sin abrir y
abrirla sin red (el token de la sesión vence: tiene que leer la caché
igual); cortar la señal con una hoja de abono abierta y ver el aviso.

Actualizar CONTEXTO_SESION, el estado de C3 en la auditoría y RELEVO.
**Siguiente paso: escribir el plan de C4**, sin implementarlo ni publicar.
Commit de cierre.
