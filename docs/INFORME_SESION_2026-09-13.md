# Informe de traspaso — Sesión 2026-09-13

> **Audiencia**: el próximo modelo de IA / agente que continúe este trabajo.
> **Repo**: `herramienta_de_gestion_interna/` (Electron escritorio + PWA móvil + Firestore).
> **Rama**: `refactor/precios-bugs-ui`. Los releases se cortan desde acá, no desde `master`.
> **Estado al cerrar**: árbol limpio, todo pusheado. Último commit `a9430de`.
> **Versión publicada de escritorio**: `v2.2.21`. **PWA móvil**: desplegada en v2.2.21.
> **Verificación**: 142/142 unitarias · 13/13 contra el emulador · typecheck 0 errores en escritorio y móvil.

> **Antes que nada**: esta sesión encontró que **un arreglo de seguridad anterior había abierto un agujero peor que el original**, y que **producción no tenía ningún índice de Firestore desplegado**. Ambas cosas están corregidas y verificadas contra producción. Leé las secciones 1 y 2 antes de tocar nada.

---

## 0. Contexto: de dónde viene esta sesión

La sesión anterior (`docs/INFORME_SESION_2026-09-12.md`) dejó la app en `v2.2.18` y afirmaba haber mitigado la vulnerabilidad crítica **C-1** de `docs/AUDITORIA_2026-09-12.md`. **Esa afirmación era incorrecta**: la corrección introdujo un agujero mayor. El resto de las correcciones de esa sesión (A-1, A-2, A-3, M-1 a M-6) **sí** se verificaron reales, una por una, contra el código.

Lección para el próximo agente: **verificá las afirmaciones de los informes contra el código, no las asumas.** Las de seguridad, siempre.

---

## 1. 🔴 El agujero de seguridad (corregido y verificado en producción)

### Qué estaba mal

`firestore.rules` tenía:

```js
function autenticado() {
  return request.auth == null || ( ...lista blanca... );
}
```

En las reglas de Firestore `request.auth` es `null` **justamente cuando nadie inició sesión**. Al ser un `OR`, esa primera condición daba `true` sola: **cualquiera podía leer y escribir la base entera sin siquiera tener cuenta**. Peor que la C-1 original, que al menos exigía una cuenta de Google.

### Por qué se había puesto ese bypass (la causa raíz, que era el verdadero problema)

El escritorio hacía `signInWithCredential` **una sola vez**, durante el login, y esa sesión vive solo en memoria del proceso Node. Al reiniciar la app nada la rehidrataba:

- `AccesoFirebase.conectar()` solo sabía reconectar con el flujo viejo de correo/contraseña, cuya UI se había eliminado antes.
- `estaConectado()` devolvía `true` con solo encontrar el archivo de sesión en disco.

Resultado: tras cada reinicio la app **se mostraba conectada mientras le pegaba a Firestore sin credenciales**. En vez de arreglar eso, se abrió la base.

**Dato comprobado empíricamente** (no asumido): en Node el SDK de Firebase **no persiste nada**. `setPersistence(auth, browserLocalPersistence)` se acepta sin error pero **cae en silencio a memoria**: no escribe nada y `currentUser` queda `null` al reiniciar. Por eso la sesión se rehidrata a mano.

### Qué se hizo

| Archivo | Cambio |
|---|---|
| `firestore.rules` | Se quitó `request.auth == null`. Exige sesión **y** UID en la lista o en `usuarios_autorizados`. |
| `src/main/firebase/auth-instance.ts` | **Nuevo.** Instancia única de Auth compartida por `auth.ts` y `google-auth.service.ts` (evita el ciclo de imports y la doble llamada a `connectAuthEmulator`), más `haySesionViva()`. |
| `google-auth.service.ts` | `restaurarSesion()`: reabre la sesión al arrancar con el token guardado. Si venció (el de Google dura 1h), limpia y la app pide ingresar. `obtenerUsuarioActual()` ahora responde según el SDK, no según el archivo en disco. |
| `src/main/index.ts` | Llama a `restaurarSesion()` al arrancar. |
| `tests/emulador.test.ts` | 3 pruebas nuevas de reglas. |

### Verificación

- **Contra producción**, sin sesión: `clientes`, `ventas`, `productos` y `parametros` → todos `permission-denied`.
- Las pruebas nuevas **fallan** si se reintroduce la regla rota (se comprobó a propósito reintroduciéndola). Son un guardia real.

### Consecuencia operativa

La v2.2.18 instalada **dejó de funcionar** al cerrar las reglas, porque dependía del hueco. Por eso se publicó v2.2.19 **antes** de desplegar las reglas. Si alguien reporta "la app de escritorio no carga datos", lo primero es confirmar que tenga **v2.2.19 o superior**.

---

## 2. 🔴 Producción no tenía ningún índice de Firestore

`npx firebase firestore:indexes` devolvía:

```json
{ "indexes": [], "fieldOverrides": [] }
```

Cero índices, aunque `firestore.indexes.json` declara ocho. **Toda consulta que necesitara un índice compuesto fallaba siempre.**

Ese era el bug real detrás de *"en cobros y abonos no se registra nada en el historial"*: la consulta del historial (`where activo` + `orderBy fecha` + `orderBy id`) necesita índice. **Los abonos sí se guardaban**; lo que no funcionaba era leerlos.

Y fallaba **en silencio**: la vista hacía `if (resPagos.success)` **sin `else`**, así que ante el error no pasaba nada y la lista quedaba vacía para siempre.

**Hecho**: los 8 índices desplegados y verificados. Los dos `if` ahora tienen `else` y muestran el error real.

> **Para el próximo agente**: si aparece una lista vacía sin explicación, sospechá de un índice faltante antes que de la lógica. Y nunca dejes un `if (res.success)` sin `else`.

---

## 3. Bugs funcionales corregidos

### 3.1 Facturas y proformas no abrían

`DocumentoModal.tsx` llamaba `useMemo` **debajo** de `if (!abierto || !venta) return null`. Con el modal cerrado React contaba 4 hooks y al abrirlo 5 → *"Rendered more hooks than during the previous render"* → la pantalla se caía al pedir el documento. Como el modal se monta cerrado y después se abre, **fallaba siempre**. Venía de la v2.2.6.

Se movieron los hooks arriba del return. Se barrió el resto del código por el mismo patrón: los otros 4 candidatos eran falsos positivos (returns dentro de callbacks de `useMemo`, y el `useContext` inicial de `useTheme`).

### 3.2 "Ajustar existencias" tocaba el producto equivocado

Los ids de variante se asignan como `i + 1` **dentro de cada producto**, o sea que **no son únicos entre productos**: casi todos tienen una variante 1. El handler IPC recibía `producto_id` del renderer y **lo descartaba** (solo declaraba tres parámetros), así que el repositorio caía al camino de adivinar: recorría la colección y se quedaba con el **primer** producto que tuviera una variante con ese id.

El ajuste se aplicaba en silencio a otro producto. Por eso "no dejaba incrementar" el elegido.

- El handler ahora reenvía `producto_id`.
- El repositorio **ya no adivina**: si más de un producto comparte el id de variante, falla con mensaje claro.
- Dos pruebas nuevas contra el emulador; la segunda fallaba antes del arreglo.

### 3.3 Se pedían dos veces la cantidad y el costo en multipack

Con multipack activo, la sección de arriba ya mostraba "Stock físico que ingresará" y "Costo unitario calculado", y abajo el formulario volvía a pedir esos mismos dos números como campos editables — que además se sobrescribían solos al tocar cualquier campo del pack. Se reemplazó por una línea que dice de dónde salen los números.

### 3.4 Cobros abría en la pestaña equivocada

Abría en "Historial de abonos". Lo accionable es la deuda viva: ahora abre en **"Por cobrar"**, y esa pestaña va primera en el selector.

### 3.5 Los bottom sheets quedaban debajo del dock flotante

**Regresión introducida en esta misma sesión** por la animación de cambio de pestaña. `animate-vista` usaba `forwards`, que deja aplicado `transform: translateY(0)` de forma permanente. Un `transform` distinto de `none` **crea un contexto de apilamiento**, y eso encerró el `z-[100]` de los sheets dentro del contenedor de la vista, por debajo del dock (`z-40`).

Dos arreglos:
- Se quitó `forwards` (el estado final ya era el natural, no hacía falta).
- **`BottomSheet` ahora se monta en `<body>` con `createPortal`**. Es la misma solución que el escritorio ya tenía en `Portal.tsx` desde la v2.2.18.

> **Regla que vale la pena recordar**: un ancestro con `transform`, `filter` u `opacity < 1` encierra el `z-index` de sus hijos **y** cambia el marco de referencia de cualquier `position: fixed` interno. Si un overlay tiene que flotar sobre todo, va en un portal.

---

## 4. Rendimiento y costo

- **El inicio del celular** llamaba a `cargarEncargosPendientes()` en cada carga y cada pull-to-refresh: **dos consultas de colección completa** (ventas tipo ENCARGO + **todas** las clientas activas) para alimentar un estado que ninguna pantalla mostraba. Quitado; la función queda exportada y documentada por si se construye el widget.
- **El instalador cargaba 42 MB de compilaciones viejas.** `vite-plugin-electron` no limpia `dist-electron/`: había 45 bundles y el programa usa 1. Nuevo `scripts/limpiar-build.mjs` enganchado a `build`, `build:exe` y `release:windows`. `dist-electron` pasó de 44.6 MB a 2.3 MB. **Ojo con la expectativa**: el instalador solo bajó de ~107 MB a 102 MB, porque el paquete comprime muy bien ese duplicado. La app desempaquetada sí pesa 42 MB menos.

---

## 5. Interfaz y animaciones (skill `emil-design-eng`)

La dueña pidió explícitamente apoyarse en el skill de Emil Kowalski para el trabajo de interfaz. **Cargalo antes de tocar animaciones o layout de esta app.**

### Barrido del checklist

| | Antes | Ahora |
|---|---|---|
| `scale(0)` de entrada | 2 | **0** |
| `ease-in` en UI | 0 | 0 |
| Duración > 300ms | 12 | 8 (barras de progreso, correcto) |
| `transition-all` | 101 | 92 |

- Los puntos de la gráfica nacían en `scale(0)` → ahora 0.5. Los dots del PIN → 0.7 (se ven en cada tecla, deben pasar desapercibidos).
- **La cascada del panel llegaba a 550ms**: la última tarjeta aparecía medio segundo tarde. Congelada en 300ms desde el séptimo elemento.
- `transition-all` corregido donde más costaba: los 3 de la barra lateral (animaban *layout* en cada fotograma) y las 6 barras de progreso.

> **Quedan 92 `transition-all` sin tocar, a propósito.** Son hovers de bajo riesgo y cambiarlos en masa mecánicamente es más peligroso que el defecto. Es deuda conocida, no un olvido.

### Cambios de interfaz en el celular

- **Transición al cambiar de pestaña**: no había ninguna (`display:none/block`, corte seco). Ahora 160ms / 6px / ease-out. Deliberadamente casi imperceptible: es un gesto de decenas de veces al día, y a esa frecuencia un slide lateral cansa y hace sentir *lenta* la app. No desmonta las vistas, conservan scroll y datos.
- **`prefers-reduced-motion`**: faltaba por completo en el celular. Se agregó conservando opacidad y color, quitando el desplazamiento.
- **Widget de stock crítico**: era `shrink-0` mientras las otras tres secciones tienen alto propio, así que el sobrante quedaba como hueco muerto contra el dock. Ahora es `flex-1` y **reparte su contenido con `justify-between`** (información arriba, acción abajo de ancho completo) en vez de centrarlo. Centrar dejaba franjas vacías que se leían como error de maquetación.
  - **Iteración con la dueña**: primero se le metió una lista de productos críticos adentro. **Lo rechazó**: no quiere lista ni scroll ahí. El detalle vive en el cajón que se abre al tocar. No lo vuelvas a agregar.

### Deslizar para cerrar (último cambio de la sesión)

`BottomSheet` ahora se cierra empujándolo hacia abajo, no solo con la X. Criterios, todos del skill de Emil:

- Cierra por **velocidad** (0.11 px/ms), no solo por distancia: un tirón corto alcanza. Sin impulso, el umbral es 110px.
- Hacia arriba hay **resistencia** (movimiento ÷ 4), no un muro.
- El velo se aclara junto con el gesto, misma dirección y proporción.
- Salida rápida (200ms), regreso más lento (260ms).

Detalles que importan y que conviene no romper:

- El movimiento se escribe **directo en el `transform`** del elemento, con la posición en un `useRef`, no en estado. Un re-render por frame perdería fotogramas con el dedo en la pantalla.
- Desde el contenido solo se arrastra si la lista **ya está arriba del todo**; si no, el gesto es del scroll.
- **Si el gesto empieza sobre un `button`, `input`, `a` o `[role=button]`, no se arrastra.** Sin esa guarda, `setPointerCapture` se queda el evento y la X y los botones de las listas dejan de responder.
- Se ignora un segundo dedo durante el arrastre.
- `touch-none` en el tirador y la cabecera: sin eso el navegador se queda el gesto vertical y los eventos de puntero nunca llegan.
- Se quitó `forwards` de `.animate-m3-slide-up`: con él, el transform final de la animación de entrada le gana al transform en línea del arrastre y la hoja no sigue al dedo.

---

## 6. Lo que se revisó y está BIEN (no lo "arregles")

Para que no gastes tiempo ni rompas decisiones deliberadas:

- **Editar existencias desde el formulario de producto está bloqueado a propósito.** `productos.repo.ts:338` lo dice: *"Las existencias no se editan acá: cambian con ventas, paquetes y el ajuste manual, que sí dejan movimiento."* Es correcto contablemente. El camino es "Ajustar existencias".
- **`PaqueteEditor`**: los **dos** accesos a "Editar" están condicionados a `estado !== 'RECIBIDA'`, y el repositorio rechaza editar paquetes recibidos. No hay bug; la edición está bloqueada como manda el diseño contable.
- **`VentaEditor`**: validación sólida (carrito vacío, línea sin producto ni descripción, precio faltante, variante sin elegir, encargo sin clienta).
- **Campos que se piden y se descartan**: se barrió toda la app. Los 6 candidatos resultaron **falsos positivos** (verificado a mano en `ClientesView`: sí guarda alias, dirección y notas). El patrón quedó contenido a los dos casos ya corregidos.
- **Botones sin función**: barrido completo, **0 problemas reales**. El único candidato (la X de las notificaciones del celular) es falso positivo: el `<div>` padre maneja el clic y tiene `pointer-events-auto`.
- **El guardado de abonos siempre estuvo bien**: llama a `registrarAbonoCliente`, muestra el error si falla y hace `await cargar()` al terminar.
- **`siguienteId()` es transaccional**: dos dispositivos creando ventas a la vez no generan ids duplicados.

---

## 7. Pendientes, por orden

### 7.1 Parseo de dinero incoherente entre las apps — [RESUELTO ✅]

Se unificó todo el parseo numérico y monetario contra `@core/numeros` (`parsearDecimal` y `parsearACentavos`) tanto en escritorio como en móvil:

- **`src/core/numeros.ts`**: se extendió `parsearDecimal` para soportar opciones de límite `{ min, max }` al igual que `parsearACentavos`, aceptando tanto coma como punto decimal y rechazando texto no numérico.
- **`PaqueteEditor.tsx`**: eliminadas las funciones locales `aCentavos` y `aMlb`. Se validan estrictamente `pesoTotalTexto`, `envioTexto` y `otrosTexto`, rechazando entradas no numéricas o negativas con mensajes claros antes de guardar.
- **`ProductoModal.tsx`**: eliminada la función local `aCentavos`. Se valida estrictamente el costo inicial, el precio manual y el costo del pack de USA en el paso 3 y en `manejarGuardar`, evitando guardar productos con costos o precios en `$0.00` por error de tipeo.
- **`VentaEditor.tsx`**: `aCentavos` usa ahora `parsearACentavos`. Se agregó validación estricta en el paso 1 (cada línea debe tener cantidad entera >= 1, precio > $0.00, y costo estimado >= $0.00 si es encargo), en el paso 2 (anticipo 0-100%, cuotas >= 2 y días >= 1, descuento porcentual 0-100% o monto fijo válido) y en `guardar()`.
- **`ConfigView.tsx`**: se validan estrictamente tasa de cambio (> 0), tax USA (0-100%), tarifa de flete/lb (>= 0), margen por defecto y por categoría (>= 0), anticipo (0-100%) y stock mínimo antes de persistir parámetros.
- **`CobranzaView.tsx` y `ClientesView.tsx`**: los abonos de clientes ahora usan `parsearACentavos`, rechazando montos vacíos o no numéricos y manejando comas decimales limpiamente.
- **`ventas.repo.ts` y `QuickSaleView.tsx` (Bug crítico corregido)**: se corrigió el cálculo de descuento `MONTO_FIJO` en `ventas.repo.ts` (`input.descuento_valor * 100`), pues anteriormente `Math.round(input.descuento_valor)` interpretaba dólares como centavos ($5 de descuento se guardaba como $0.05). Ahora se sincroniza y calcula en centavos idénticamente en móvil y escritorio.

### 7.2 "En camino" es interfaz muerta, pero cuesta una consulta

`PaqueteEditor` siempre manda `estado: 'RECIBIDA'` y **nadie escribe nunca `EN_CAMINO`**. Pero `panel.repo.ts:80-86` hace una consulta filtrando por ese estado **en cada carga del panel**, que solo puede devolver vacío. Alimenta `inversion_en_camino_usd_cents`, que por lo tanto siempre vale 0 y se muestra igual en el desglose de capital.

**No se tocó a propósito**: borrar la consulta parece gratis, pero si en la base quedan paquetes viejos con ese estado, dejarían de contarse en el capital invertido. **Necesita decisión de la dueña**: eliminar el concepto, o reutilizar ese hueco para los **anticipos de encargos ya cobrados y no comprados**, que sí es capital comprometido y hoy no se ve en ningún lado.

### 7.3 Menores

- `PaqueteEditor` recibe la prop `encargosPendientes` y nunca la usa.
- 92 `transition-all` sin migrar (ver sección 5).
- Imports sin usar en el celular (`tsc --noUnusedLocals` los lista; en escritorio da 0).
- La cabecera de `docs/CONTEXTO_TECNICO_IA.md` sigue diciendo `v2.2.8`.

---

## 8. Cómo verificar y publicar

```powershell
# Verificación
npm run typecheck                              # escritorio
npx tsc -p mobile/tsconfig.json --noEmit       # celular
npm test                                       # 142 unitarias

# Pruebas de reglas (necesitan el emulador en otra terminal: npm run emulador)
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"
npx vitest run --config vitest.emulador.config.ts   # 13 pruebas

# PWA móvil
npm run build:mobile
npx firebase deploy --only hosting

# Reglas e índices de Firestore
npx firebase deploy --only firestore:rules
npx firebase deploy --only firestore:indexes
npx firebase firestore:indexes                 # confirmar que NO devuelva []

# Instalador de Windows
npm run build:exe
Copy-Item "release\Glow Heaven Manager Setup 2.2.X.exe" "release\Glow-Heaven-Manager-Setup-2.2.X.exe" -Force
Copy-Item "release\Glow Heaven Manager Setup 2.2.X.exe.blockmap" "release\Glow-Heaven-Manager-Setup-2.2.X.exe.blockmap" -Force
gh release create v2.2.X "release\Glow-Heaven-Manager-Setup-2.2.X.exe" "release\Glow-Heaven-Manager-Setup-2.2.X.exe.blockmap" "release\latest.yml" --title "..." --notes "..."
gh release view v2.2.X --json assets,isDraft,tagName
```

### Disciplina de verificación (no es opcional)

Esta disciplina existe porque en una sesión anterior se publicó una versión con el código viejo y se reportó como exitosa. **Que un comando diga "Deploy complete" no prueba nada sobre el contenido.**

1. Commiteá **antes** de compilar para el release.
2. Después de compilar, `grep` sobre el bundle generado buscando strings de los cambios.
3. Después de desplegar el celular, `curl` a la URL pública, extraé el nombre del bundle que sirve y **comparalo con el local**.
4. Después de un release, `gh release view` y confirmá `isDraft:false` y los 3 assets en `uploaded`.
5. Para cambios de seguridad, **probá el comportamiento contra producción**, no el archivo.

---

## 9. Reglas de la casa

1. **Rama `refactor/precios-bugs-ui`.** No hagas checkout a `master` para publicar.
2. **`electron-builder` genera el .exe con espacios; `latest.yml` lo busca con guiones.** Siempre copiá con guiones antes de `gh release create`.
3. **Prestá atención a si la dueña pidió desplegar o no** en ese turno. A veces dice explícitamente que no.
4. **Cargá el skill `emil-design-eng`** antes de tocar animaciones o layout.
5. **Modales de escritorio**: siempre dentro de `<Portal>`. **Sheets del celular**: `BottomSheet` ya va en portal.
6. **Nunca dejes un `if (res.success)` sin `else`.** Un fallo silencioso costó que pareciera que los abonos no se registraban.
7. **Verificá las afirmaciones de los informes contra el código.** Este informe incluido.

---

## 10. Commits de la sesión

```
a9430de feat(movil): cerrar los formularios deslizando hacia abajo
207fcea fix(movil): los bottom sheets quedaban debajo del dock flotante
8322ebd fix(movil): repartir el contenido del widget de stock en vez de centrarlo
9cff9b6 fix(ui): widget de stock sin lista, pulido de animaciones (Emil Kowalski)
ff06d01 fix: indices de Firestore ausentes, pestana inicial de cobros, transicion de vistas y widget de stock
c68ae97 chore: bump version to 2.2.19
f5382f2 perf(movil): dejar de pagar dos consultas por carga para datos que nadie muestra
2d68fa2 fix: facturas/proformas rotas, ajuste de existencias al producto equivocado y peso del instalador
22e01bc fix(seguridad): cerrar acceso sin autenticar a Firestore y restaurar la sesion del escritorio
```

Documentos relacionados: `docs/AUDITORIA_2026-09-12.md` (auditoría que originó los arreglos de seguridad), `docs/INFORME_SESION_2026-09-12.md` (sesión anterior; su afirmación sobre C-1 es incorrecta, ver sección 0).
