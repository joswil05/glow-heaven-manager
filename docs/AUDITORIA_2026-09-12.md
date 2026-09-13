# Auditoría técnica — Glow Heaven Manager (escritorio + móvil)

> **Fecha**: 2026-09-12 · **Versión auditada**: `2.2.10` (+ commit `c349ab8`)
> **Alcance**: app de escritorio (Electron), PWA móvil, capa compartida (`src/core`, `src/main/firebase`), reglas de Firestore, configuración de build y despliegue.
> **Método**: lectura de código, ejecución de `tsc --noEmit` y de la suite de pruebas, inspección del CSS y del bundle compilados. **No se modificó ningún archivo de código.** No se ejecutó ninguna prueba de intrusión contra la base de datos en producción.
> **Cada hallazgo indica si fue verificado empíricamente o inferido por lectura.**

---

## Resumen ejecutivo

El estado de salud del código es **bueno**: `tsc --noEmit` da **0 errores**, la suite pasa **133/133**, el dominio contable está bien modelado (centavos enteros, costo congelado, tasa por documento) y bien probado. Las decisiones de arquitectura de Electron son mayormente correctas.

El problema no está en el código: está en **quién puede entrar**.

> **Hay una falla crítica de autorización. Hoy, cualquier persona del mundo con una cuenta de Gmail puede abrir la URL pública del móvil, iniciar sesión, y ver y modificar toda la base de datos del negocio**: nombres, teléfonos y direcciones de las clientas, costos, ganancias, deudas y ventas. No hace falta ninguna habilidad técnica ni ninguna herramienta: alcanza con abrir el enlace y tocar "Entrar con Google".

Esto no es una hipótesis: se verificó leyendo las reglas de Firestore (`firestore.rules`), el arranque del móvil (`mobile/src/App.tsx`) y la ausencia total de cualquier lista de cuentas permitidas en todo el repositorio.

Debajo de eso hay 3 problemas altos (un token guardado sin cifrar, ventas que pueden quedar a medias, y stock que se puede desincronizar), y una serie de hallazgos medios y bajos.

| Severidad | Cantidad |
|---|---|
| 🔴 Crítica | 1 |
| 🟠 Alta | 3 |
| 🟡 Media | 6 |
| ⚪ Baja | 6 |

---

## 🔴 CRÍTICO

### C-1. Cualquier cuenta de Google del mundo tiene acceso total de lectura y escritura a toda la base

**Verificado por lectura de código. No explotado.**

Tres piezas que, juntas, dejan la puerta abierta:

1. **`firestore.rules`** — la única condición de acceso es estar autenticado con *cualquier* identidad del proyecto:
   ```
   function autenticado() {
     return request.auth != null && request.auth.uid != null;
   }
   ```
   Esa función gobierna `productos`, `ventas`, `compras`, `pagos`, `clientes`, `categorias`, `parametros`, `movimientos_inventario`, `eventos` y `_secuencias`. No hay ninguna comprobación de *qué* usuario es.

2. **El login de Google no está restringido a ninguna cuenta.** `mobile/src/lib/firebase-mobile.ts` usa `new GoogleAuthProvider()` sin `hd` (dominio hospedado) ni ninguna validación posterior. `mobile/src/App.tsx:33` es literalmente:
   ```tsx
   if (!usuario) { return <LoginView />; }
   // cualquier `usuario` no nulo pasa directo al panel completo
   ```

3. **La configuración del proyecto Firebase es pública y así debe ser.** `src/shared/firebase-config.ts` viaja dentro del bundle JS servido en `https://glow-heaven-movil.web.app`. Eso es normal y correcto en Firebase: el `apiKey` no es un secreto. La seguridad **depende enteramente de las reglas** — y las reglas no filtran nada.

**Búsqueda realizada**: se buscó en todo el repositorio (`src/`, `mobile/`, `firestore.rules`) cualquier lista de UID permitidos, restricción por correo o por dominio. **No existe ninguna.** El propio archivo de reglas lo admite en un comentario, en `firestore.rules:24`:

> `// por persona y una lista de UID permitidos acá.`

Es decir: la necesidad estaba identificada y quedó sin implementar.

**Qué se expone**: `clientes` contiene nombre, teléfono, ciudad y dirección de las clientas (datos personales de terceros). `ventas`, `pagos` y `productos` contienen costos, ganancias, precios y saldos deudores. Todo es legible **y escribible y borrable**.

**Impacto**: el más alto posible para este sistema. Fuga de datos personales de clientas, robo de información comercial, y posibilidad de que un tercero altere o borre el inventario, las ventas o las deudas. Como `movimientos_inventario` y `eventos` son de solo-agregar, algo del rastro sobreviviría, pero los documentos de negocio no.

**Recomendación** (en orden de urgencia):
1. **Inmediato**: agregar a las reglas la lista de UID autorizados. Es un cambio de pocas líneas y se despliega con `firebase deploy --only firestore:rules`:
   ```
   function autorizado() {
     return request.auth != null
         && request.auth.uid in ['UID_DE_LA_DUENA', 'UID_EMPLEADA_1'];
   }
   ```
   Los UID se sacan de la consola de Firebase > Authentication > Users.
2. Considerar además una colección `usuarios_autorizados/{uid}` para no tener que redesplegar reglas al alta/baja de una empleada, con `exists(/databases/$(database)/documents/usuarios_autorizados/$(request.auth.uid))`.
3. Revisar en la consola de Firebase si hay cuentas registradas que no deberían estar (Authentication > Users) — eso indicaría si alguien ya entró.
4. Cuando existan roles distintos (dueña vs. empleada), diferenciar permisos: una empleada no necesita borrar ventas ni ver costos.

---

## 🟠 ALTO

### A-1. El token de sesión de Google se guarda en texto plano en el disco

**Verificado por lectura de código.** `src/main/firebase/google-auth.service.ts:136`

```js
fs.writeFileSync(getSessionPath(), JSON.stringify({ ...usuario, idToken: data.idToken }, null, 2), 'utf-8');
```

El archivo es `auth_session.json` dentro de `app.getPath('userData')`, sin cifrar. `safeStorage` no se usa en ese archivo (0 apariciones, verificado con grep).

Lo llamativo es la inconsistencia: **el PIN local, que protege mucho menos, sí está bien protegido** — `acceso.service.ts` usa `scrypt` con sal aleatoria, comparación en tiempo constante y cifrado con `safeStorage`. El token de acceso a la base, que vale mucho más, queda en claro al lado.

**Impacto**: cualquier cosa con permiso de lectura sobre esa carpeta (malware de usuario, otra cuenta de Windows, una copia de seguridad sincronizada a la nube, un equipo prestado) obtiene un token de Firebase. Encadenado con **C-1**, ese token da acceso completo a la base. El `idToken` de Firebase vence en ~1 hora, lo que acota la ventana, pero no la elimina.

**Recomendación**: cifrar ese archivo con `safeStorage.encryptString`, igual que ya se hace con `pin.bin`. Es el mismo patrón, ya implementado y funcionando en el repo.

---

### A-2. Una venta no es atómica: puede quedar el stock descontado sin venta registrada

**Verificado por lectura de código.** `src/main/firebase/repositories/ventas.repo.ts:192-340`

El flujo de `VentasRepo.crear()` es:

1. Lee productos y reserva el ID de la venta.
2. Valida el stock disponible (agregando por producto).
3. **Bucle**: por cada línea, llama a `ProductosRepo.salida()` — **cada una es su propia transacción independiente**.
4. Recién después arma y escribe el documento de la venta.

No hay transacción que abarque los pasos 3 y 4, ni compensación (rollback) si algo falla a mitad. Búsqueda de `runTransaction`/`writeBatch` en `ventas.repo.ts`: **cero apariciones**.

**Escenarios reales de falla**:
- Venta de 3 productos. Se descuenta el stock de los 2 primeros, se corta el internet, el tercero falla. **Resultado: 2 productos salieron del inventario y no existe ninguna venta que lo explique.** Pérdida de inventario invisible.
- Dos dispositivos vendiendo a la vez (el caso normal de esta app: la dueña en Windows y una empleada en el celular). La validación del paso 2 lee una foto del stock; el descuento ocurre después. La transacción interna de `salida()` sí protege el decremento individual y lanza error si no alcanza — así que **no se produce sobreventa**, pero sí queda la venta a medio aplicar del escenario anterior.

**Impacto**: descuadre entre inventario físico y contable, sin rastro que lo explique. Es el tipo de error que se descubre meses después en un conteo físico y ya no se puede reconstruir.

**Recomendación**: envolver el descuento de todas las líneas + la escritura de la venta + el pago inicial en una sola `runTransaction`, o, si el volumen de documentos lo impide, registrar una compensación explícita (revertir las salidas ya aplicadas) en el `catch`. Ya existe la infraestructura de `evento_grupo_id` para agrupar y deshacer: sería el lugar natural.

---

### A-3. Vender más unidades de una variante de las que esa variante tiene desincroniza el stock

**Verificado por lectura de código.** `src/main/firebase/repositories/productos.repo.ts:697-800` junto a `src/core/inventario.ts:75-110`

Dentro de `salida()`:

```js
const total = existenciasDe({ variantes });          // suma de TODAS las variantes
const resultado = registrarSalida({ existencias: total, ... }, params.cantidad);
// `insuficiente` solo se activa si lo pedido supera el TOTAL del producto
...
const retiradas = Math.min(variantes[idx].existencias || 0, resultado.unidades_retiradas);
variantes[idx].existencias -= retiradas;             // pero descuenta de UNA sola variante
```

La validación mira el total del producto; el descuento aplica a una sola variante y se recorta con `Math.min`.

**Ejemplo concreto**: un labial con tono Rojo (1 unidad) y tono Rosa (9 unidades), total 10. Se venden 3 del tono Rojo.
- `total` = 10, pedidas = 3 → `insuficiente = false`, `unidades_retiradas = 3`.
- `retiradas = min(1, 3) = 1` → Rojo queda en 0, Rosa sigue en 9.
- Pero `valor_inventario_usd_cents` se actualiza restando el costo de **3** unidades.
- Y la línea de la venta queda registrada con **cantidad 3**.

**Resultado**: se facturaron 3 unidades, salió 1 del stock, y el valor del inventario bajó como si hubieran salido 3. Además el movimiento de auditoría queda internamente contradictorio: registra `cantidad: 3` mientras que `existencias_despues` solo bajó en 1.

**Atenuante**: la interfaz limita la cantidad al stock de la variante (`QuickSaleView.agregarAlCarrito` respeta `variante.existencias`). O sea, hoy probablemente no se dispara desde el uso normal. Pero la protección vive **solo en la interfaz**, no en el dominio: cualquier otra ruta de entrada (el móvil escribiendo directo a Firestore, un futuro cambio de UI, o un tercero por **C-1**) lo dispara sin resistencia.

**Recomendación**: validar contra las existencias **de la variante concreta**, no contra el total del producto, y hacer que el desajuste sea un error explícito en vez de un `Math.min` silencioso.

---

## 🟡 MEDIO

### M-1. Un fallo de autenticación se traga en silencio y la sesión se guarda igual

`src/main/firebase/google-auth.service.ts:118-136`

```js
if (data.idToken) {
  try { await signInWithCredential(auth, cred); }
  catch (authErr) { console.warn('Advertencia al sincronizar credencial...'); }  // se traga
}
// ...y sigue de largo:
GoogleAuthService.usuarioActivo = usuario;
fs.writeFileSync(getSessionPath(), ...);
```

Si la credencial es inválida o rechazada, el error solo se advierte por consola y **la sesión se persiste igual y el usuario queda marcado como autenticado**. La interfaz mostrará "conectado" mientras toda llamada a Firestore falla con permiso denegado. Es un estado de "conectado pero sin acceso" muy difícil de diagnosticar para la dueña.

**Recomendación**: si `signInWithCredential` falla, fallar el login entero y mostrar el error real.

### M-2. El callback OAuth local no valida `state` ni origen

`src/main/firebase/google-auth.service.ts:87-136`. El servidor HTTP local (`127.0.0.1`, puerto aleatorio, ventana de 5 minutos) expone `POST /callback` y acepta cualquier JSON que traiga `email` y `uid`. No hay parámetro `state`, ni nonce, ni verificación de `Origin`/`Referer`.

**Atenuantes reales**: el puerto es aleatorio (`listen(0)`), está atado a loopback, y la ventana es corta. **Riesgo residual**: un proceso local malicioso puede enumerar puertos y fijar la identidad que muestra la app. Combinado con **M-1**, el rechazo del token no lo detendría.

**Recomendación**: generar un `state` aleatorio al abrir el navegador y exigirlo en el callback; validar `Origin`.

### M-3. Inyección de HTML en facturas y proformas

`src/core/documentos/plantillas.ts` interpola datos del usuario en plantillas HTML **sin ningún escapado** (búsqueda de `escape`/`sanitize`/`textContent` en ese archivo: **cero resultados**). Campos afectados: `venta.cliente.nombre`, `.telefono`, `.ciudad`, `.direccion`, `l.descripcion` de cada línea, `parametros.nombre_negocio`, y los datos de cuentas bancarias (líneas 290-323, 708-741, 800-808).

Ese HTML termina en `BrowserWindow.loadURL('data:text/html,...')` (`src/main/ipc/index.ts:287`).

**Severidad acotada, y hay que ser preciso**: esa ventana se crea con `contextIsolation: true`, `nodeIntegration: false` y **sin preload**, así que el script inyectado **no** alcanza `window.api` ni Node. Pero la ventana sí tiene red y no hay CSP, así que un script inyectado puede exfiltrar el contenido del documento a un servidor externo. Para inyectar el dato hace falta poder escribir en la base — que es exactamente lo que **C-1** regala.

**Nota sobre la otra ruta**: `imprimirHtml()` (`plantillas.ts:818`) sí escribe con `document.write` en el mismo origen de la app, lo que sería bastante peor. Pero se verificó que en la app empaquetada **esa ruta no se ejecuta**: solo se llama cuando `window.api.documentos` no existe (`DocumentoModal.tsx:65,83`), y en Electron siempre existe. Además `setWindowOpenHandler` devuelve `{action:'deny'}` para todo, así que ese `window.open` devolvería `null` igual. Queda como código efectivamente muerto en producción (ver B-5).

**Recomendación**: una función `escaparHtml()` aplicada a todo valor interpolado. Es un cambio pequeño y cierra la categoría entera.

### M-4. Ninguna de las dos apps define una Content-Security-Policy

Verificado: `src/renderer/index.html` y `mobile/index.html` no contienen ninguna etiqueta CSP, y no se define por cabecera (`firebase.json` solo fija `Cache-Control`). Una CSP es la segunda línea de defensa que convierte M-3 en inofensivo.

### M-5. El panel lee colecciones completas en cada carga

`src/main/firebase/repositories/panel.repo.ts:76-80` y `mobile/src/lib/panel-movil.ts` hacen `getDocs` de **todas** las ventas activas, **todos** los productos y **todos** los clientes en cada apertura del panel.

**Medido por la propia suite del proyecto** (`tests/medicion.test.ts`, salida real de esta corrida):
```
12 productos + 12 ventas   ->  25 lecturas
50 productos + 50 ventas   -> 101 lecturas
200 productos + 200 ventas -> 401 lecturas
```
Crece de forma lineal y **las ventas nunca dejan de acumularse**. Hoy es barato; con dos años de operación cada apertura del panel costará miles de lecturas, en ambas apps, y en el móvil también en cada "pull to refresh". El caché en memoria del móvil (`cacheDashboardGlobal`) lo alivia dentro de una sesión, no entre sesiones.

**Recomendación**: mantener documentos de agregados precalculados (totales por día/mes) y consultar la colección completa solo para rangos acotados con `where` sobre fecha.

### M-6. Sin persistencia offline de Firestore

No se encontró `enableIndexedDbPersistence`, `persistentLocalCache` ni `initializeFirestore` con caché en `src/main/firebase/client.ts` ni en `mobile/src`. Ambas apps requieren red viva para toda operación.

Para una PWA de punto de venta usada en un local con señal intermitente, esto significa que **una venta no se puede registrar si se cae el internet**, y no hay cola de escritura diferida. Firestore trae esto casi gratis.

---

## ⚪ BAJO

### B-1. `py-0.2` no existe en Tailwind: 6 lugares quedan sin padding vertical

**Verificado empíricamente contra el CSS compilado**, con control positivo:
- `.py-0\.5` **sí** aparece en `dist-mobile/assets/*.css` (control).
- `py-0.2` **no aparece** en ningún lado del CSS generado.

La escala de espaciado de Tailwind no tiene `0.2`, y ninguna de las dos configs la agrega (`mobile/tailwind.config.js:65` solo extiende `safe-t`/`safe-b`). La clase se descarta en silencio y esos badges quedan con padding vertical 0.

Es exactamente el mismo bug que `w-15` que ya se corrigió en `BottomNav.tsx`. Sitios afectados:
- `mobile/src/components/AbonoSelectorSheet.tsx:151`
- `mobile/src/components/KardexClienteSheet.tsx:251`
- `mobile/src/views/CobranzaView.tsx:181, 203, 228`
- `src/renderer/src/views/PanelView.tsx:640`

**Recomendación**: reemplazar por `py-0.5`. Y considerar activar un linter de clases Tailwind, porque esta familia de error es invisible: no falla el build, no falla el typecheck, solo se ve raro.

### B-2. `sandbox: false` en la ventana principal

`src/main/windows/main.window.ts:29`. `contextIsolation: true` y `nodeIntegration: false` están correctos, que es lo que más pesa. `sandbox: false` es habitual cuando el preload necesita Node, pero debilita el aislamiento del renderer. Vale evaluar si el preload actual realmente lo necesita.

### B-3. El instalador no está firmado y las actualizaciones se descargan solas

`electron-builder.yml` no define certificado de firma. `src/main/updater.ts:11` fija `autoDownload = true`. `electron-updater` valida el SHA512 publicado en `latest.yml` sobre HTTPS, así que la integridad del canal está cubierta; lo que falta es la firma del publicante, y de paso genera avisos de SmartScreen en cada instalación. Riesgo real bajo, pero significa que quien controle la cuenta de GitHub controla lo que se instala en la máquina de la dueña.

### B-4. `zod` es dependencia declarada y no se importa en ningún lado; los handlers IPC no validan entradas

Verificado: 0 resultados de `from 'zod'` en todo `src/` y `mobile/`. Todos los handlers de `src/main/ipc/index.ts` pasan los argumentos del renderer directo a los repositorios, confiando en los tipos de TypeScript (que no existen en tiempo de ejecución). Hoy el renderer es de confianza, así que el riesgo práctico es bajo; el costo es que un bug del renderer llega sin filtro hasta Firestore. La dependencia debería usarse o quitarse.

### B-5. Código muerto en la ruta de impresión

Como se detalla en M-3, `imprimirHtml()` no se ejecuta en producción. Además su fallback de iframe invisible se auto-destruye con `setTimeout(..., 2000)`, lo que cortaría trabajos de impresión lentos si alguna vez llegara a usarse.

### B-6. Imports sin usar

`mobile/src/views/QuickSaleView.tsx` (`DollarSign`, `ImageOff`) y `mobile/src/views/CobranzaView.tsx` (`UserCheck`, `ChevronRight`). Inofensivo; `noUnusedLocals` no está activo, por eso no lo marca el build.

---

## Lo que está bien hecho (y conviene no romper)

Para que el informe sea honesto, y porque el próximo que toque esto necesita saber qué **no** hay que "arreglar":

- **Salud del árbol**: `tsc --noEmit` → 0 errores. `npm test` → **133/133 en verde**, 11 archivos de prueba, 1.1 s. Verificado en esta auditoría.
- **El PIN local está bien implementado**: `scrypt` con sal de 16 bytes, `timingSafeEqual` para evitar fuga por tiempo, cifrado en reposo con `safeStorage`. Es el estándar correcto.
- **`siguienteId()` es transaccional** (`client.ts:40-51`), así que dos dispositivos creando ventas a la vez **no** generan IDs duplicados. Este era un riesgo obvio en una app multi-dispositivo y está bien resuelto.
- **La ruta de impresión por IPC está bien diseñada**: ventana aislada, sin preload, sin Node. Y el guardado de PDF usa `dialog.showSaveDialog`, o sea que el renderer nunca elige la ruta del archivo: no hay escritura arbitraria.
- **Las reglas de Firestore, dentro de su límite, están pensadas**: `movimientos_inventario` es solo-agregar, `eventos` no se puede editar, y hay un `match /{document=**} { allow read, write: if false; }` que cierra toda colección no declarada. El problema es la función `autenticado()`, no la estructura.
- **El dominio contable está bien modelado y probado**: centavos enteros, costo congelado en la venta, tasa de cambio congelada por documento, prorrateo por mayor residuo. Las 133 pruebas cubren esto.
- **Electron**: `contextIsolation: true`, `nodeIntegration: false`, enlaces externos al navegador del sistema vía `shell.openExternal` con `setWindowOpenHandler` denegando todo lo demás.

---

## Orden de trabajo sugerido

| # | Acción | Severidad | Esfuerzo |
|---|---|---|---|
| 1 | Lista de UID autorizados en `firestore.rules` + revisar usuarios registrados en la consola | 🔴 Crítica | Muy bajo |
| 2 | Cifrar `auth_session.json` con `safeStorage` (patrón ya existente en `acceso.service.ts`) | 🟠 Alta | Bajo |
| 3 | Validar stock **por variante** en `salida()` | 🟠 Alta | Bajo |
| 4 | Atomicidad o compensación en `VentasRepo.crear()` | 🟠 Alta | Medio |
| 5 | `escaparHtml()` en `plantillas.ts` + CSP en ambas apps | 🟡 Media | Bajo |
| 6 | No tragar el fallo de `signInWithCredential` | 🟡 Media | Muy bajo |
| 7 | `py-0.2` → `py-0.5` en los 6 sitios | ⚪ Baja | Muy bajo |
| 8 | Persistencia offline de Firestore en el móvil | 🟡 Media | Bajo |
| 9 | Agregados precalculados para el panel | 🟡 Media | Medio |

Los puntos 1, 2, 3, 6 y 7 son todos cambios de pocas líneas y resuelven, entre ellos, la falla crítica y dos de las tres altas.

---

## Notas de método

- No se ejecutó ninguna prueba de intrusión contra el proyecto Firebase en producción. **C-1 se sustenta en lectura de las reglas y del código de arranque, no en un acceso real.** Confirmarlo en la práctica es tan simple como pedirle a alguien de confianza, con otra cuenta de Gmail, que abra la URL del móvil.
- Las mediciones de lecturas de M-5 salen de la suite del propio proyecto (`tests/medicion.test.ts`), ejecutada durante esta auditoría.
- B-1 se comprobó buscando la clase en el CSS realmente compilado, con un control positivo (`py-0.5`) para descartar un error de búsqueda.
- No se auditó: la landing page estática del directorio padre, las reglas de Firebase Hosting más allá de `firebase.json`, ni la configuración de la consola de Firebase (métodos de login habilitados, dominios autorizados), que no es visible desde el repositorio y **debería revisarse aparte**.
