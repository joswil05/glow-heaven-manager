# AGENTS.md — Glow Heaven Manager

> **¿SESIÓN NUEVA? EMPEZÁ ACÁ:** [docs/CONTEXTO_SESION.md](docs/CONTEXTO_SESION.md).  
> Estado vigente, el costeo como funciona de verdad, lo que está pendiente y las
> trampas que ya cobraron su precio. Es el documento que se mantiene al día.
>
> **DOCUMENTO PRINCIPAL DE CONTEXTO TÉCNICO Y NOMENCLATURA:**  
> Leé primero [docs/CONTEXTO_TECNICO_IA.md](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/docs/CONTEXTO_TECNICO_IA.md). Contiene la arquitectura completa (Desktop + Móvil PWA), nomenclatura financiera (centavos enteros), mapeo de funciones core (`src/core/`), superficie IPC (`ApiPuente`), reglas de Firestore y playbook de comandos para la versión `v2.2.8`.
> También podés revisar `docs/CONTINUAR.md` para el historial de transiciones.

## Qué es este negocio

Una tienda en línea que trae producto desde USA. Dos caminos:

1. **Reposición** (lo principal): traés un paquete, la mercadería entra al
   inventario y la vendés desde acá.
2. **Encargos**: un cliente pide algo puntual, cotizás, cobrás anticipo,
   lo traés y se lo entregás.

Un mismo paquete puede traer las dos cosas mezcladas.

**El flujo arranca cuando el paquete ya está en las manos.** Alguien compra en
USA por encargo de la dueña y le manda el bulto; el envío lo cobra el courier
acá, por libra. La app no modela el viaje: registrás lo que venía adentro,
cuánto pesó el paquete y qué pagaste.

**El paquete es la única puerta de entrada de mercadería** (desde `v2.12`, ver
[docs/PLAN_PAQUETES_E_INVENTARIO.md](docs/PLAN_PAQUETES_E_INVENTARIO.md)). Cada
línea dice qué producto, cuántas unidades y lo que costó en la tienda; el 7% y
la parte del flete se calculan ahí (`core/paquete.ts`) y en ningún otro lado.
El paquete se carga con calma (`BORRADOR`, "Cargando") y recién al apretar
"Pasar al inventario" (`recibir`, estado `RECIBIDA`, "En inventario") entra
todo en UNA transacción. Un paquete que ya entró no se edita: se **corrige**,
y la diferencia de costo se aplica sólo a las unidades que siguen en bodega.
El peso de cada producto casi nunca se conoce: se reparte el de la caja
(`repartirPeso`) con el peso unitario conocido y, si no, por unidades.

La ficha del producto es catálogo: no tiene costo, existencias ni paquete.
"Ajustar existencias" es para pérdidas y conteos, no para reponer.

## Reglas absolutas

- **Dinero SIEMPRE en INTEGER de centavos USD** (`usd_cents`). El dólar es la
  moneda del sistema; los córdobas son una conversión para mostrar, derivada
  de `tasa_cambio_cents`. Jamás float.
- Pesos en milésimas de libra (`peso_mlb`). Porcentajes en basis points
  (`bp`): 4500 = 45%.
- **El envío se paga por paquete completo, no por producto.** Se reparte por
  PESO entre todas las líneas, sin importar si van a inventario o a un
  encargo. El tax se reparte por VALOR. La suma DEBE cuadrar exacto: usá
  `repartirMayorResiduo`.
- **La mercadería entra sólo por un paquete.** El costo de una unidad es
  precio de tienda + 7% + su parte del flete, y sale de la línea del paquete
  que la trajo. Nada reparte flete a los productos después: en `v2.11` eso
  suponía que un producto viene de un solo paquete, y con el segundo el
  reparto se inflaba (un flete de $50 llegó a repartir $110).
- **El precio sigue al costo sólo cuando entra un paquete o cambia el
  margen.** Nunca al vender, ajustar o devolver: el precio que ella le dio a
  una clienta no puede cambiar solo. Un precio escrito a mano no se toca.
- **La ganancia se mide contra el costo aterrizado**, ya con tax y envío
  adentro. Medirla contra el precio de USA es lo que hacía la versión
  anterior y mentía: un "35%" en pantalla era un 20% real.
- **El redondeo de precios es SIEMPRE hacia arriba.** Redondear al más
  cercano baja el precio la mitad de las veces y se come margen sin avisar.
- **El costo del inventario es promedio ponderado.** La fuente de verdad es
  `productos.valor_inventario_usd_cents`; el costo unitario se deriva de él y
  las existencias, nunca al revés. Así no se pierden centavos al redondear.
- **El costo se congela en la venta.** `venta_lineas.costo_unitario_usd_cents`
  guarda con qué costo salió la unidad. Recalcularlo después reescribiría la
  ganancia histórica cada vez que llega un paquete nuevo.
- **La tasa de cambio se congela por documento.** Nunca leer la global para
  convertir un pago viejo.
- Nada se borra físicamente: `activo = false` o estado `CANCELADA`.
- Toda mutación escribe en `eventos` con un `evento_grupo_id` (UUID). Un grupo
  es una acción del usuario, aunque toque diez documentos, y es lo que revierte
  Ctrl+Z. Un repositorio que ignora ese parámetro deja el deshacer muerto sin
  que nada falle.
- **Un encargo cotizado no es deuda.** Pasa a deberse cuando la clienta cubre
  el anticipo (`core/cobranza.ts`, la misma regla que usan los abonos). Lo
  cotizado se muestra aparte.
- **El saldo de una venta se recalcula desde sus pagos, nunca por
  incrementos.** Sumar y restar sobre el valor guardado acumula errores en
  cuanto se anula un abono.
- La UI nunca muestra basis points ni centavos crudos: "45%", "$12.00",
  "C$439.44". El formato sale siempre de `formatearMoneda`, nunca de un
  `toFixed(2)` suelto: convivían `C$2,416.92` y `C$1812.69` en la misma
  pantalla. `toFixed` solo se admite para rellenar el valor de un input.
- **Los precios se manejan en dólares**, que es como la dueña cotiza a sus
  clientas. El córdoba es la conversión secundaria, no al revés.
- Lenguaje sin tecnicismos: español nicaragüense claro y directo.
- **Nada de `window.confirm`, `window.prompt` ni `window.alert`.** Un cuadro
  del sistema no enumera consecuencias, no distingue "cerrar sin guardar" de
  "destruir un registro con dinero adentro" y devuelve texto sin validar. Usá
  `components/ui/Confirmar.tsx` (foco inicial en la salida, no en la acción
  destructiva) o un diálogo propio como `AjustarStockModal`.

## Arquitectura

- **Cloud Firestore** (SDK web de Firebase) solo en el proceso main. El
  renderer nunca toca la base.
- IPC tipado con contextBridge. `contextIsolation: true`,
  `nodeIntegration: false`. El contrato es `ApiPuente` en
  `src/shared/ipc-contracts.ts`: si un método no está en el tipo, TypeScript
  lo rechaza en el preload y en la vista al mismo tiempo.
- Lógica de negocio en `src/core/`: TypeScript puro, sin Electron ni Firebase,
  testeable con Vitest.
  - `paquete.ts` — la cuenta del paquete y lo que le hace a cada producto.
    La usan la pantalla (vista previa sin lecturas) y el repositorio.
  - `costeo.ts` — reparto del envío y tax de un paquete
  - `cobranza.ts` — qué es deuda y en qué estado nace un encargo
  - `precios.ts` — margen sobre costo y redondeo hacia arriba
  - `inventario.ts` — promedio ponderado
  - `prorrateo.ts` — reparto exacto por mayor residuo
- `src/main/firebase/client.ts` tiene los ayudantes compartidos: `leerDoc`,
  `leerVarios`, `aplicarLote`, `siguienteId`, `idOrdenable`.
- **No hay sistema de respaldos.** Era de cuando la base era SQLite; con
  Firestore el volcado diario costaba una lectura por documento todos los
  días y no protegía de nada que la nube no cubriera ya.

## Colores y tipografía

Los colores salen de variables CSS en `src/renderer/src/temas.css` y se
exponen en `tailwind.config.js` con **nombres semánticos**: `fondo`,
`superficie`, `superficie-2`, `borde`, `borde-fuerte`, `texto`, `texto-2`,
`texto-3`, `barra*`, `acento*`, `inverso*`, `velo`, más las escalas de estado
`success` / `warning` / `danger`. La paleta es crema y verde claro.

`slate`, `navy` y `brand` **ya no existen**: eran Tailwind renombrado (`navy`
era exactamente `slate`, `brand` exactamente `indigo`), así que ningún color
había sido elegido para este producto. No los reintroduzcas.

`src/renderer/src/lib/cn.ts` extiende `tailwind-merge` para que conozca los
tamaños de fuente propios (`text-body`, `text-metric`…). Sin eso los
clasificaba como colores de texto y borraba uno de los dos en silencio: era
la causa mecánica de que la interfaz se viera plana y genérica.

## Reglas de Firestore (leer antes de tocar un repositorio)

Firestore cobra **por documento leído y escrito**. Eso cambia lo que es un
buen repositorio:

- **Una pasada por colección y por pantalla.** `PanelRepo.cargar()` toma una
  instantánea y la comparte entre resumen, alertas, rotación y por cobrar.
  Antes leía productos cinco veces y ventas seis: 179 lecturas para 12
  productos y 12 ventas, contra ~25 ahora. Si agregás una sección al panel,
  calculala sobre la instantánea, no con otra consulta.
- **Nada de N+1.** Para varios documentos por id usá `leerVarios`, que los
  pide en paralelo y sin repetir.
- **`orderBy` y `limit` van en el servidor.** Traer una colección completa
  para mostrar diez filas crece sin techo. Cada consulta ordenada necesita su
  índice en `firestore.indexes.json`.
- **Escrituras múltiples van en `aplicarLote`.** Un bucle de `setDoc` cuesta
  un viaje por documento.
- **Lectura y escritura del mismo documento van en `runTransaction`.** Sin
  eso se pierden actualizaciones: `entrada` y `salida` de inventario dependen
  de esto para no perder unidades.
- **Validar antes de escribir.** `VentasRepo.crear` comprueba el stock de
  TODAS las líneas antes de tocar la primera. Firestore no tiene rollback
  entre operaciones separadas: descontar y fallar después destruye
  mercadería sin dejar rastro.
- **Los agregados se mantienen a mano.** Firestore no tiene subconsultas, así
  que los totales del cliente viven en su documento y se refrescan con
  `ClientesRepo.refrescarTotales` después de vender, cobrar o cancelar.
- **`eventos` y `movimientos_inventario` usan `idOrdenable()`**, no un
  contador en la base: un consecutivo remoto cuesta una transacción extra en
  cada acción del usuario.
- **`parametros` y `categorias` se cachean 30 s** en el proceso main. Toda
  escritura que las toque llama a `ParametrosRepo.invalidarCache()`.

## Seguridad

`firestore.rules` exige sesión iniciada. Antes de publicarlas hay que crear
la cuenta en Authentication y cargarla en Configuración > Acceso a la base;
las credenciales se guardan cifradas con `safeStorage` de Electron.

El PIN de acceso **no** vive en Firestore: si viviera ahí haría falta una
sesión para leerlo y una sesión requiere haber pasado el PIN. Se guarda en
`pin.bin` cifrado con `safeStorage`, con scrypt y `timingSafeEqual`.

Si al arrancar no hay conexión con Firebase, `App.tsx` muestra la pantalla de
configuración en vez del panel: sin sesión las reglas rechazan todo y la app
quedaba vacía con cinco avisos de error encima.

La configuración anterior era `allow read, write: if true`: cualquiera con el
ID del proyecto podía leer y escribir clientes, teléfonos, costos y deudas. El
ID viaja dentro de la aplicación, así que nunca fue un secreto.

## Comandos de verificación

- `npm test` — 295 pruebas contra el Firestore falso, sin red.
- `npm run typecheck` — cero errores con `strict: true`
- `npm run build` — compila y empaqueta
- `npm run build:exe` — instalador NSIS. Borrá `release/` antes para
  garantizar que el instalador sea fresco.
- `npm run emulador` + `npm run test:emulador` — 91 pruebas contra el emulador
  OFICIAL de Firestore, autenticadas y con las reglas aplicadas.

### Las dos suites, y por qué hacen falta las dos

**`tests/firestore-fake.ts`** es un Firestore en memoria. Corre en
milisegundos, no necesita red ni Java, y **cuenta lecturas y escrituras**:
`tests/integracion.test.ts` afirma sobre esos contadores, así que si una
pantalla empieza a costar más lecturas, una prueba falla con el número exacto.
Es la suite del día a día.

**`tests/emulador.test.ts`** corre los mismos repositorios contra el emulador
de Google. Necesita Java (ya instalado en `~/.jdks`). Atrapa lo que el falso
no puede ver, y ya encontró dos bugs reales:

- Firestore rechaza `undefined` **dentro de los arrays**. Las líneas de una
  venta viven en un array, y en un encargo quedan sin `producto_id`: cada
  encargo fallaba al guardar. `sinUndefined()` ahora es recursivo.
- Las reglas rompían los borrados. `centavosValidos()` lee
  `request.resource.data`, que no existe en un `delete`; llamarla desde un
  `write` (que incluye delete) bloqueaba deshacer. Ahora create/update y
  delete van separados.

El falso se volvió estricto con lo primero y **lanza** ante un `undefined`,
en vez de limpiarlo en silencio. Ojo con un detalle que costó encontrar: la
verificación va **antes** de clonar, porque `JSON.stringify` borra los
`undefined` y el guard quedaba sin nada que revisar.

Regla práctica: si tocás la forma de un documento, las reglas o una consulta
con `orderBy`, corré también la suite del emulador.

## Colecciones

`parametros` (un solo documento, `sistema`), `categorias`, `clientes`,
`productos`, `compras`, `ventas`, `pagos`, `movimientos_inventario`,
`eventos`, `_secuencias`.

Las líneas de una venta y sus cuotas viven **dentro** del documento de la
venta, y lo mismo las líneas de un paquete y las variantes de un producto:
siempre se leen junto con su padre y así cuestan una sola lectura.
