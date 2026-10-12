# Relevo entre agentes: Claude Code y Codex

> **Para quién es esto**: el agente (Claude Code o Codex) que retoma el trabajo.
> **Leelo antes de tocar nada, y dejalo al día antes de parar.**

Joswill trabaja con **un agente a la vez**. Cuando se le acaban los créditos
de uno, sigue con el otro en el mismo repositorio y la misma máquina, y
cuando se acaban los del segundo vuelve al primero. No hay coordinador ni
revisor: el que está de turno toma el siguiente paso del plan vigente, lo
hace, lo prueba y lo deja escrito acá. El que llega después no sabe nada de
la conversación anterior: sólo sabe lo que quedó en el repositorio.

**Excepción autorizada el 2/10:** Joswill pidió trabajar con varios agentes
en paralelo. El agente principal integra, commitea y controla los procesos;
los subagentes reciben rutas exclusivas (pruebas de paginación y página de
fixtures) o revisan en sólo lectura. «Revisar y coordinar plan Glow Heaven»
investiga encabezados/paginación en sólo lectura. Nadie comparte escrituras
ni corre suites que limpien el emulador en paralelo. La prueba física, el
peso y la publicación siguen requiriendo su decisión/evidencia.

**Los créditos se cortan sin aviso**, a veces a mitad de un paso. Por eso lo
importante no es la entrada de despedida, sino commitear y anotar **mientras
se trabaja**.

## Al llegar

1. `git status`, `git log --oneline -15` y `git worktree list`. Comparar con
   la última entrada de la bitácora: los commits nuevos que no estén ahí los
   hizo el anterior después de anotar, o se cortó antes de hacerlo. Si hay
   otro worktree (Codex suele abrir uno propio en `.codex/worktrees/`),
   mirar también ahí `git status` y `git log --oneline master..HEAD`: lo que
   tenga encima de `master` es trabajo del anterior que no llegó a `master`.
2. Abrir el plan vigente (en "Estado ahora", abajo) y ver qué casillas
   (`- [x]`) están marcadas. El primer paso sin marcar es por donde se sigue.
3. **Si hay cambios sin commitear**, el anterior se cortó a mitad de un paso.
   Leer el diff (`git diff`) y ubicar a qué paso del plan corresponde. Si es
   el siguiente paso sin marcar, terminarlo y probarlo. Si no se entiende o
   parece roto, no borrarlo: anotarlo en la bitácora y preguntarle a Joswill.
   Nunca `git checkout -- .`, `git reset --hard` ni `git stash` sin rutas.
4. Correr `npm test` para saber desde qué punto se parte. Si algo falla, eso
   va antes que el plan.
5. Si el emulador está prendido (`netstat -ano | grep -E ":(8080|9099) "`),
   puede ser del anterior: se puede usar, y apagarlo al irse.

## Mientras se trabaja

- **Un commit por paso del plan**, con el paso en el mensaje
  (`C1 · T1 · paso 6: …`), y **la casilla del plan marcada en ese mismo
  commit**. Así el plan siempre dice hasta dónde se llegó.
- Una línea en la bitácora cada vez que se termina una tarea (T1, T2…) o se
  decide algo que el plan no dice.
- Se trabaja en el árbol principal, sobre `master`: hay un solo agente a la
  vez. Commits con rutas explícitas (`git add -- <rutas>`), nunca `-A`. Si la
  herramienta trabaja en su propio worktree, cada commit se lleva a `master`
  enseguida, desde el árbol principal: `git merge --ff-only <commit>`.
- Primero la prueba que falla, después el código.
- **Sin el "publicalo" de Joswill no se hace**: push, `build:exe`,
  `deploy:mobile`, `firebase deploy`, ni nada que escriba en producción.

## Antes de parar (si da tiempo)

1. Commitear lo propio. Lo que quede a medias, en un commit
   `WIP: C1 · T2 · paso 4: <qué falta>`, que el siguiente sabe completar.
2. Apagar el emulador si lo prendió este turno (sólo los PID que escuchan
   en 8080, 9099, 4400 y 9150).
3. Escribir la entrada de la bitácora, con el formato de abajo, y
   commitearla.

## Estado ahora

- **Publicado**: **`v2.18.1`** en Windows y celular (11/10): el flete del
  paquete sale de las libras y el impuesto es siempre el de Configuración.
  Etiqueta en `59b525c`. Antes, la `v2.18.0` (C1 y C2, etiqueta `74f42ea`).
- **Plan vigente**: **Fase C3 · Sin internet: consultar**,
  [superpowers/plans/2026-10-11-c3-sin-internet-consultar.md](superpowers/plans/2026-10-11-c3-sin-internet-consultar.md), escrito el 11/10, sin empezar.
- **C2 cerrada el 10/10** y publicada en la 2.18.0: T1 a T7, menos
  el PDF automático (T1 paso 5), aplazado por Joswill; se conserva la
  impresión actual y el mensaje original sin edición.
- **Flete por libras (11/10, publicado en la 2.18.1)**: en los paquetes de
  las dos apps se escriben las libras de la caja y el flete sale de la tarifa
  por libra de Configuración; el impuesto es siempre el porcentaje de
  Configuración, sin campo para el del recibo (`fleteDePeso` y
  `fleteDelPaquete` en `src/core/paquete.ts`).
- **C3 cerrada el 11/10, sin publicar** ([plan](superpowers/plans/2026-10-11-c3-sin-internet-consultar.md)):
  falta sólo la prueba física en el iPhone (T1 paso 1 y la de T7 paso 2).
- **"Llegó un paquete" igual al editor de Windows** (pedido de Joswill del
  11/10), integrado en `master` (merge `4ca3acd`), sin publicar.
- **Rumbo nuevo (11/10, Joswill)**: el celular pasa a ser el centro, con la
  misma funcionalidad que Windows y un diseño nuevo. Las fases 3 a 6 de la
  auditoría se reemplazan por el plan unificado
  [superpowers/specs/2026-10-11-celular-como-centro-design.md](superpowers/specs/2026-10-11-celular-como-centro-design.md)
  (fases U1 a U9 y W1). Quedan sin efecto las decisiones del 2/10 que
  limitaban el celular (no editar fichas, no ajustar existencias, encargos
  sólo hasta "Aceptó"). Ese plan tiene decisiones abiertas para Joswill
  (sección 10).
- **Siguiente paso**: **C4 · T1** ([plan](superpowers/plans/2026-10-11-c4-sin-internet-operar.md)).
  Joswill pidió concluir C4 sin responder sus dos preguntas: se aplican las
  recomendaciones (la venta sin red guarda la tasa del momento; "Sin número
  todavía" hasta subir). Después, U1. Publicar C3 y el paquete nuevo pide su
  "publicalo".
- **C1**: T1 a T4 completas, publicadas en la 2.18.0; cierre documentado
  en `ddc0fc7`. Emulador apagado.
- **Trampa conocida**: `npm run test:emulador` y `npm run test:interfaz`
  reescriben `tests/interfaz/fixtures-pdf.json` con la fecha del día.
  Restaurarlo con `git checkout -- tests/interfaz/fixtures-pdf.json`
  después de cada corrida; no commitearlo.
- **Después de C2**: C3 y C4, en el diseño
  [superpowers/specs/2026-10-02-fases-del-celular-design.md](superpowers/specs/2026-10-02-fases-del-celular-design.md)
  (al empezar cada una se escribe su plan, como el de C1); después las fases
  3 a 6 de [AUDITORIA_UX_2026-09-29.md](AUDITORIA_UX_2026-09-29.md).
- **Contexto completo**: [CONTEXTO_SESION.md](CONTEXTO_SESION.md) y
  [../AGENTS.md](../AGENTS.md).

Quien avanza actualiza este apartado: siguiente paso, y lo publicado si cambia.

## Bitácora (la más nueva arriba)

Formato de cada entrada:

```
### AAAA-MM-DD HH:MM · Claude Code | Codex
- Hizo: …
- Commits: …
- Pruebas: qué corrió y con qué resultado.
- Quedó a medias: … (o "nada")
- Sigue: el paso exacto del plan.
- Para Joswill: lo que necesita decidir o probar (o "nada").
```

### 2026-10-11 19:50 · Claude Code
- Hizo: **C3 · sin internet: consultar**, entera, y la integración de
  **"Llegó un paquete" igual al editor de Windows**, que hizo un agente en
  su worktree por pedido de Joswill.
  - C3: almacenamiento persistente (T1 p2); estado de la conexión con la
    hora de los datos (`lib/conexion-movil.ts`, `ConexionContext`; T2);
    corredor `npm run test:sin-conexion` con el build real y `vite preview`
    en el 5175 (T3); entrar sin señal con el acceso recordado por cuenta
    (`lib/acceso-movil.ts`; T4); sin valores inventados (`getParametros` y
    `getCategorias` no escriben defectos sin red ni desde la caché;
    `DataContext` no usa `DEFAULT_PARAMS` sin red), la franja "Sin
    conexión · datos de las 10:42" y cada pantalla con lo suyo (T5); el
    guardián `useExigirConexion` en cada escritura (T6); las fuentes en la
    caché del service worker (T7 p1).
  - Cambio de diseño: "en línea" también cuenta a Firestore (más de 3 s
    sirviendo desde la caché es sin conexión), porque `navigator.onLine`
    miente con un Wi-Fi sin internet. Está en el plan.
  - El paquete del agente (rama `worktree-agent-a882854084b446241`, 5
    commits): packs, impuesto por línea, tallas en una hoja, producto nuevo
    con ficha, editar una pieza, piezas de encargo, otros gastos, cuenta en
    vivo, confirmar antes de recibir, resumen, corregir un paquete ya
    recibido y eliminar un borrador con Deshacer. Las cuentas salen del
    núcleo. Le puse el guardián sin red por dentro.
- Commits: de `d4620ab` a este, en `master`, sin push.
- Pruebas: 694 unitarias, 108 emulador, 50 casos móvil (con los 4 nuevos del paquete), 4 sin red y sin errores de consola, 43 Windows; tipos de las dos apps, build:mobile y git diff --check. Capturas a 390 px en claro y oscuro: la franja no tapa título ni barra.
- Trampas nuevas: (1) en la suite móvil de desarrollo no se puede tocar
  `mobile/src` ni `vite.config.ts` mientras corre: Vite recarga la página y
  rompe casos. (2) `cerrar_hojas` ahora tolera una hoja que se cierra sola
  (pasó en tres casos). (3) En el corredor sin red, la franja se busca por
  "Sin conexión ·": los avisos también son `status`. (4) Al recargar,
  Chromium no pasa por el service worker para la hoja de fuentes: se usan
  pestañas nuevas.
- Quedó a medias: nada. C3 cerrada salvo la prueba física en el iPhone.
  Emulador apagado. Plan de C4 escrito (`a668e6d`).
- Sigue: **C4 · T1**, cuando Joswill responda las dos decisiones del [plan de C4](superpowers/plans/2026-10-11-c4-sin-internet-operar.md) (la tasa de una venta sin red y el número al subir). Publicar C3 y el paquete nuevo pide su "publicalo".
- Para Joswill: decisiones que dejó el agente sobre el paquete (está
  también en el commit de integración): (a) un producto nuevo con ficha
  (categoría, tallas, precio, pack, foto o notas) se crea al agregarlo, como
  en Windows; con sólo el nombre, al recibir. (b) "Corregir PQ-…" está en el
  Inventario filtrado por ese paquete; podría ir en la tarjeta de Inicio.
  (c) Recibir ahora pregunta antes, como Windows: un toque más. (d) Hallazgo
  en Windows sin tocar: "Agregar encargo" mete también las piezas que salen
  de la bodega y las de "No se consiguió"; el celular las filtra
  (`piezasQuePuedenVenir`), y se podría pasar al núcleo. (e) `ProductoModal`
  de Windows toma una ganancia mal escrita como 0%. Probar C3 en el iPhone:
  modo avión, abrir, mirar, cerrar sesión no.

### 2026-10-11 18:16 · Claude Code
- Hizo: **flete por libras e impuesto fijo en los paquetes**, pedido por
  Joswill ("solo debo ingresar las libras"; "el impuesto es siempre 7%").
  Núcleo: `fleteDePeso(peso_mlb, tarifa)` y `fleteDelPaquete(peso, tarifa,
  guardado?)`: un paquete ya guardado conserva su flete mientras no cambie
  el peso (pudo escribirse a mano antes, o cambiar la tarifa), y uno de
  antes sin peso lo conserva hasta que le escriban las libras. Celular
  ("Llegó un paquete"): "Peso de la caja (lb)" en lugar de "Flete pagado",
  la cuenta debajo ("Flete: $14.00, a $7.00 la libra.") y sin "Impuesto del
  recibo"; el resumen dice "Impuesto (7%)". Windows (`PaqueteEditor`): el
  flete se muestra calculado (un `output`, no un campo), "Impuesto del
  recibo" salió de "Más costos" (ahora "Otros gastos") y pasar al
  inventario sin peso lo pide en su campo; el borrador puede esperarlo.
  Un paquete con impuesto de recibo guardado lo conserva al corregirse.
- Commits: `69775bc`. No pusheado.
- Pruebas: `tests/flete-por-peso.test.ts` (7, vistas en rojo antes de
  existir las funciones); casos de interfaz de paquete actualizados en las
  dos suites (pedían campos que no existían). Todo verde: unitarias, tipos
  de las dos apps, `build:mobile`, emulador, 46 casos móvil y 43
  Windows, `git diff --check`.
  **Para vigilar**: en una de cuatro corridas completas del celular, "un
  abono vacío, en cero o con letras no se registra" se cortó porque la
  página se recargó sola en medio ("waiting for navigation to
  localhost:5174/"). No se repitió. Sospecha, sin comprobar: la guardia de
  historial de `BottomSheet` (un `back()` diferido que se cruza con otra
  hoja que se abre) sale de la app. Si vuelve a pasar, reproducirlo antes
  de tocar nada.
- Quedó a medias: el plan de C3, que se pausó por este pedido. Lo
  investigado, para no repetirlo:
  - Ya existen la caché persistente de Firestore (`client.ts`
    `persistentLocalCache`), la sesión en IndexedDB (`firebase-mobile.ts`
    `initializeAuth`) y el service worker con la app precacheada. Las
    fuentes de Google no se cachean: sin red cambia la letra.
  - Frenan sin red: el acceso (`App.tsx` `puedeEntrar`; la dueña pasa
    directo, el resto cae en "No pudimos comprobar tu acceso"); los
    parámetros (`DataContext` pone `DEFAULT_PARAMS` si fallan: una tasa
    inventada); y `ParametrosRepo.getParametros` escribe los defectos si no
    encuentra el documento, que sin red quedaría en cola y pisaría los
    reales al volver.
  - Unas 20 escrituras del celular cuelgan o fallan sin red (Vender,
    abono, corregir, anular, encargos, precio, paquete, Ajustes, Deshacer,
    resumen visto): tienen que avisar en la entrada y conservar lo escrito.
  - La suite móvil corre sobre `vite` de desarrollo, sin service worker:
    probar "abrir sin red" pide un corredor nuevo con el build real y
    `vite preview` apuntado al emulador.
- Sigue: escribir el plan de C3 con esas notas, sin implementarlo.
- Para Joswill: probar el paquete nuevo (las libras y el 7%) y decir si se
  publica.

### 2026-10-11 18:27 · Claude Code
- Hizo: **publicó la 2.18.1** con el "publica" de Joswill (flete por libras
  e impuesto fijo). Celular por `scripts/desplegar-movil.mjs`: los dos
  sitios sirven `index-CEFkSR0H.js`. Windows: `build:exe` (106.173.038
  bytes, sha512 igual al de `latest.yml`), release en borrador, exe solo,
  después blockmap y `latest.yml`, y publicada como latest; la descarga
  pública da el mismo tamaño. Reglas e índices sin cambios desde la 2.18.0.
  Después **escribió el plan de C3** ([superpowers/plans/2026-10-11-c3-sin-internet-consultar.md](superpowers/plans/2026-10-11-c3-sin-internet-consultar.md)): siete tareas,
  con un corredor nuevo (`test:sin-conexion`, build real con `vite preview`)
  porque el servidor de desarrollo recarga la página al volver la red.
- Commits: `59b525c` (versión 2.18.1), pusheado; el plan y esta entrada en
  un commit de docs.
- Pruebas: las del cambio del flete (635, 108, 46, 43, tipos y build).
- Quedó a medias: nada.
- Sigue: C3 · T2 · paso 1, con la orden de Joswill.
- Para Joswill: reabrir la app de Windows para que tome la 2.18.1; la
  prueba de T1 paso 1 en el iPhone (modo avión) cuando pueda.

### 2026-10-11 17:07 · Claude Code
- Hizo: **publicó la 2.18.0** (C1 y C2) con el "publicalo" de Joswill.
  Antes comprobó por la API, con la sesión de gcloud, que reglas e índices
  de producción coinciden con los del repo (12 índices READY): no hubo que
  desplegar nada de Firestore. Celular: `build:mobile` y
  `scripts/desplegar-movil.mjs` (la CLI de Firebase tiene la sesión
  vencida); los dos sitios sirven `index-yDYgGTbG.js`. Windows: el primer
  exe pesaba 113 MB porque `html2pdf.js` estaba en `dependencies` y
  electron-builder la empaquetaba; pasó a `devDependencies` (`74f42ea`) y
  el exe volvió a 106 MB, sin html2pdf en el asar. Release en borrador,
  exe solo, después blockmap y `latest.yml`, y publicada como latest.
- Commits: `ec518a4` (versión 2.18.0), `74f42ea` (html2pdf a desarrollo),
  los dos pusheados. Esta entrada va en un commit de docs aparte.
- Pruebas: las del cierre de C2 (628, 108, 46, 43, tipos y build). Después
  del cambio de dependencia, el `build:exe` volvió a pasar tipos y
  auditorías; `latest.yml` coincide con el exe (sha512 y 106.173.061
  bytes) y la descarga pública también.
- Quedó a medias: nada.
- Sigue: **escribir el plan de C3** (sin internet: consultar), sin
  implementarlo ni publicar sin orden.
- Para Joswill: la app de Windows abierta se actualiza al reabrirla. Probar
  en el iPhone de Ross "Guardar PDF", WhatsApp, adjuntar el PDF y Deshacer
  de un abono; y la vibración (2.16.5). Si se quiere usar `firebase deploy`
  otra vez, hace falta `firebase login --reauth` en el navegador.

### 2026-10-10 11:32 · Claude Code
- Hizo: **C2 cerrada.** T5 paso 3 (Cotizar desde el detalle de un encargo),
  T5 paso 4, T6 paso 3 (Mandar cotización desde Encargos; `DocumentoSheet`
  usa el mismo `imprimir-documento.ts`, con su guardia de doble toque), T6
  paso 4 y T7 paso 4. Caso nuevo de interfaz "C2 · el ciclo entero en el
  celular": anotar sin precio → Cotizar → Mandar → "Ya la mandé" → Aceptó
  sin pago, termina en "Por comprar" sin abonos ni bodega. El pago pequeño
  con Deshacer y recotizar lo mandado ya tenían sus casos.
- Commits: `7fe06b9` (T5 p3), `aad58c6` (T5 p4), `7aaf506` (T6 p3),
  `3842f53` (T6 p4) y el de cierre (T7 p4, con esta entrada). No pusheados.
- Pruebas: 628 unitarias, 108 emulador, 46 casos móvil, 43 Windows; tipos
  de las dos apps, `build:mobile` con auditorías y `git diff --check`, todo
  verde. `dist-mobile/` sin html2pdf, jsPDF ni html2canvas.
- Quedó a medias: nada. Emulador apagado (el de este turno).
- Sigue: **escribir el plan de C3** (sin internet: consultar), desde la
  sección C3 del diseño `superpowers/specs/2026-10-02-fases-del-celular-design.md`
  y con el formato del de C2. No implementarlo ni publicar sin orden.
- Para Joswill: probar en el iPhone de Ross "Guardar PDF" (impresión del
  sistema → guardar PDF), "WhatsApp" con el mensaje, adjuntar el PDF a mano
  y Deshacer de un abono; sigue pendiente también la vibración (2.16.5).
  Decidir cuándo publicar C1 y C2: no hay "publicalo" para ellas.

### 2026-10-10 10:57 · Claude Code
- Hizo: **C2 · T4 cerrada** (suite móvil completa: 39 casos verdes; fallan
  sólo los 6 de T5/T6, sin pantalla todavía, como se esperaba). Revisó y
  **corrigió los dos hallazgos** que dejó Codex, los dos reales:
  1. Cotizar: con "No se consiguió" se perdía lo editado y volvía el precio
     original. Ahora conserva lo escrito y sólo pone subtotal y costo en
     cero, como Windows. La cuenta pasó a `mobile/src/lib/cotizacion-movil.ts`
     (probable sola: `tests/c2-cotizar-movil.test.ts`).
  2. Mandar: "Guardar PDF" ya no se dispara dos veces; el ayudante se rinde
     a los 15 s si el documento no carga, quita el iframe y avisa (una carga
     tardía ya no imprime); el error tardío sólo se muestra en la misma
     cotización. `tests/c2-imprimir-movil.test.ts`, con un document mínimo.
- Commits: `9f0d77e` (T4 paso 4), `528a1e7` (T5 paso 2), `86e8bfe` y
  `729332b` (T6 paso 2). No pusheados.
- Pruebas: base al llegar 620 y tipos limpios; emulador 108; suite móvil 39
  verdes + 6 rojos esperados; npm test 628 (las 8 nuevas fallaron antes del
  arreglo); tsc de las dos apps limpio.
- Quedó a medias: nada. El emulador sigue prendido para el paso 3.
- Sigue: C2 · T5 · paso 3.
- Para Joswill: nada.

### 2026-10-10 10:38 · Codex
- Hizo: pausa solicitada por Joswill para seguir con Claude. Guardadas las
  dos hojas nuevas y el helper de impresión, sin integrarlas a EncargosView
  ni cambiar DocumentoSheet. No se marcaron sus pasos como terminados.
  T5 incluye editor/estimación del núcleo/guardar; T6 mensaje original,
  HTML real, copiar/WhatsApp/impresión y confirmación explícita con versión.
- Commits: `335c724` adapta el regreso del caso T3 al alta real de T4;
  `b1ba354` T5 paso 1 (tres casos rojos); `79df1aa` dos casos de versión
  contra Firestore real; `82a2413` T6 paso 1 (tres casos rojos).
  WIP T5 paso 2 `6937ad6`; WIP T6 paso 2 `b326672`; esta entrada se
  commitea después. Todo en master local, sin push ni publicación.
- Pruebas: al entregar, npm test **620/620**, tipos móvil, colores y hooks
  (92 componentes), todos aprobados. En la ejecución del 7/10: emulador
  **108/108**, incluido marcarEnviada con versión esperada; cuatro casos T4
  y los once casos C2 existentes aprobados juntos. La suite móvil completa
  de 38 casos falló en el viejo caso T3: no cerraba el alta antes de Volver,
  y provocaba una segunda falla T7. Se corrigió el caso en `335c724` y los
  once C2 quedaron verdes; **no** se repitió la suite completa después.
  Las seis pruebas nuevas T5/T6 fallan por ausencia de sus botones en
  EncargosView, lo esperado antes de conectar. Ahora hay 44 casos móviles.
- Quedó a medias: T4 paso 4; T5/T6 pasos 2–4; T7 paso 4 (cierre conjunto).
  **Revisión pendiente para Claude, antes de integrar:**
  1. CotizarEncargoSheet, analizar(): editar un precio (12.50 → 15) y luego
     marcar No se consiguió toma el precio original al guardar y omite los
     opcionales editados. Windows conserva el borrador y sólo pone subtotal
     y costo_total en cero. Revisar esa semántica, agregar la regresión roja
     y corregir; la observación NO está corregida en el WIP. No mandar costo
     estimado en piezas con costo real ni tocar precios aceptados/fijos.
  2. MandarCotizacionSheet, imprimir(): no activa accionEnCurso/ocupado,
     por lo que doble toque puede crear dos iframe/diálogos. El helper sólo
     agenda quitar después de print; si no llega load queda iframe, y el
     error tardío no comprueba sigueVisible(id). Añadir prueba roja y guardia
     mínima/limpieza, conservando el mismo motor de impresión. No retomar
     html2pdf ni rediseñar el formato del documento.
  Los hallazgos surgieron en revisión independiente de otros agentes, en
  sólo lectura; requieren comprobación. Los agentes quedaron interrumpidos.
- Sigue: leer esta entrada y revisar los WIP, correr base y suite móvil
  completa para T4 paso 4. Luego T5 paso 2 y conexión en paso 3; después T6
  paso 2 y compartir helper con DocumentoSheet en paso 3. No editar
  EncargosView desde dos agentes a la vez. Root controla en serie UI y
  emulador porque ambos limpian la base. Contratos:
  CotizarEncargoSheet { venta: VentaCompleta|null, onCerrar, onGuardado };
  MandarCotizacionSheet { venta: VentaCompleta|null, onCerrar, onMandada }.
  Ambas llaman marcarCambio internamente. Cierre C2 exige todas las suites,
  ciclo alta→cotizar→mandar→aceptar, CONTEXTO_SESION y estado C2 de AUDITORIA
  (todavía desactualizados); próximo paso escribir plan C3, no implementarlo.
- Para Joswill: nada para este relevo. C1 terminada local; C2 funcional
  16/24 pasos verificados (~67%), excluyendo PDF automático aplazado.
  Impresión/WhatsApp y demás recorridos no se probaron físicamente en el
  iPhone de Ross. No publicar C1/C2 sin nueva orden; el publicalo anterior
  fue sólo para hotfixes 2.17.1, ya publicados. Puertos 8080/9099/4400/9150
  y 5174 sin escuchas al entregar; no queda emulador/Vite activo.
### 2026-10-07 08:42 · Codex
- Hizo: T4 paso 3 completo. Anotar desde Vender o Encargos, clienta nueva
  o existente, piezas con precio opcional, validación por campo y doble toque
  bloqueado. Quitar usa el mismo marco móvil con rol alertdialog, conserva
  guardia Atrás y el pedido. El helper de pruebas ignora hojas ya saliendo.
- Commits: WIP integrado `6f43bf6`; paso 3 verificado `bc17773`.
- Pruebas: al retomar 620 unitarias, tipos y auditorías aprobadas. Los cuatro
  recorridos T4 verdes, incluido Atrás al quitar, no deuda/bodega, descarte
  y carrito conservado. La pérdida de guardia se vio roja antes del fix.
- Quedó a medias: T4 paso 4 (suite móvil completa corriendo, emulador después).
  Casos T5/T6 preparados en scratch; todavía no integrados ni verificados rojos.
- Sigue: cerrar T4, luego T5 paso 1. T7 paso 4 es cierre conjunto de C2.
- Para Joswill: nada para seguir; no se publicó. El corte anterior impidió
  la última verificación por límite de créditos de aprobación automática.
  Se retomó sin borrar cambios y se reutiliza el emulador local que quedó activo.

### 2026-10-06 23:13 · Codex
- Hizo: retomó los cambios del corte anterior. T4 paso 2 completo: selector
  compartido, foco por capas y descarte sin permitir guardar detrás.
  T7 paso 3 completo: Aceptó, abono opcional y Deshacer del grupo completo.
  Listo/X/Atrás bloqueados mientras Deshacer está pendiente.
- Commits: regresiones `8e48223`; T4 paso 2 `5d95d51`; T7 paso 3 `83cf523`.
- Pruebas: 620 unitarias, tipos móvil y auditorías colores/hooks aprobados;
  selector y CVE-01/02 verdes; recorrido T7 verde con pago C$37 a tasa37,
  aceptación sin pago, Deshacer y bloqueo con operación pausada. Foco de
  nueva clienta y Listo durante Deshacer se vieron rojos antes de corregir.
- Quedó a medias: T4 paso 3 implementado en hoja nueva, pendiente integrar,
  verificar y corregir confirmación de quitar para conservar guardia Atrás.
  T5 pendiente; T6 sólo tiene protección transaccional de versión, falta UI.
- Sigue: C2 · T4 · paso 3 y luego paso 4. T7 paso 4 es cierre conjunto C2.
- Para Joswill: nada para seguir. PDF automático sigue aplazado; impresión
  actual y mensaje original sin edición. Sin push, instalador ni deploy.
  Emulador local activo durante el trabajo; apagar antes de parar.

### 2026-10-03 12:39 · Codex
- Hizo: T4 paso 1 guardado en `1b28ba4`: cuatro casos rojos por alta ausente,
  sin implementar antes las hojas. Selector compartido en implementación.
- Decisiones fuera del plan: T6 detenido al detectar que el enlace original
  no admite mensaje editado. Joswill eligió **conservar el original sin
  edición**; plan corregido, se mantienen los helpers compartidos existentes.
  La comparación transaccional de versión esperada ya estaba prevista en T6.
- Commits: `1b28ba4`; este commit registra la decisión de T6.
- Pruebas: 616 unitarias aprobadas después de integrar 2.17.1. T4 rojo
  confirmado; cuarto caso aislado evita heredar la navegación de otro rojo.
- Quedó a medias: T4 paso 2; T7 casos móviles en preparación independiente.
- Sigue: T4 paso 2, verificar ventas previas y después alta del pedido.
- Para Joswill: nada. Ambas correcciones urgentes ya están publicadas.

### 2026-10-03 12:32 · Codex
- Hizo: publicó **v2.17.1** en Windows y ambos sitios móviles, con los dos
  hotfixes solicitados. El bloqueo de «Fue un error» era el cambio de mes;
  conserva siete días para carga/fecha y las demás restricciones. PQ-0001
  real confirma impuesto histórico $19.18, mercadería $273.98, flete $77,
  total $370.16, pero override heredado 0: corregir ya conserva ese impuesto.
  La consulta de producción sólo leyó importes, sin escribir datos.
- Decisiones fuera del plan: publicación aislada sobre `44cdcdc` en copia
  Git independiente `scratch/release-2.17.1`, sin C1/C2/PDF experimental.
  Push por SHA exacto, instalador/manual de GitHub sin exportar tokens.
  Sesiones Firebase/gcloud vencidas; Joswill ejecutó login. Aunque ADC dio
  acceso denegado, gcloud sí renovó su token y Hosting se desplegó por el
  script REST existente. No se cambiaron permisos, reglas ni índices.
- Commits: publicación `97d5f90`, `0abf42a`, `5ec3541` pusheados; master
  local integra en `0ce7fd7` y conserva C1/C2. T2 cierre `50a06c3`, T3
  cierre `3e7cfb7`, locales. No pushear master local mientras tenga C2.
- Pruebas: copia publicada 593 unitarias, 103 emulador, ambas suites UI
  (41 Windows y 24 móvil), tipos y builds auditados aprobados. SHA512/tamaño
  del exe coinciden con latest.yml; manifiesto remoto idéntico. Ambos
  Hosting index.html y sw.js idénticos a la build publicada (HTTP 200).
  Master local: suite móvil completa 32 casos, incluido contraste/pérdida
  a 390 px, altura reducida y paquete nuevo en selector sin reload; 616
  unitarias y 106 emulador, ambos tipos aprobados antes de integrar versión.
- Quedó a medias: T4 casos nuevos rojos; implementación aún no comenzada.
  Emulador prendido para continuar; apagarlo antes de parar.
- Sigue: C2 · T4 · paso 1 y después extraer selección compartida de clienta.
- Para Joswill: probar «Fue un error» y Corregir PQ-0001 tras actualizar
  a 2.17.1. PDF automático sigue aplazado por su decisión.

### 2026-10-03 12:08 · Codex
- Hizo: retomó tras el corte de créditos. T3 paso 2 (`e7fe575`) y T7
  paso 2 (`61de90b`) verificados y commiteados con sus casillas. Guarda
  el cambio de precio de T2 paso 3 como WIP, pendiente de prueba de interfaz.
  Joswill pidió priorizar dos errores y autorizó **publicarlos**: «Fue un
  error» al cambiar de mes e impuesto cero de paquetes reconstruidos.
- Decisiones fuera del plan: la ventana de siete días se conserva para
  carga y fecha del documento, aunque cambie el mes; el resumen del período
  afectado se recalcula. PIN y demás restricciones siguen vigentes.
  La publicación se prepara sobre `44cdcdc` con sólo los dos hotfixes:
  C1/C2 locales y el PDF experimental no se incluyen. Una copia Git
  independiente en `scratch` permite publicar sin mover ni limpiar master.
- Commits: T3 `e7fe575`, T7 `61de90b`; este commit guarda T2 WIP.
- Avances posteriores: T2 WIP `73b5bea`, verificado y marcado en `3c7ff12`
  (tres casos UI verdes); T3 vista/rutas `8b5cebd` (caso UI y tipos verdes).
  Hotfix ventas `cea39b9`; hotfix impuesto `2d01ea9`.
- Pruebas: `npm test` 616 aprobadas con los hotfixes; ambas apps pasan tipos.
  Las regresiones fallaron antes de corregir. Emulador: 106 aprobadas,
  incluida la cancelada del 29/9 borrada el 3/10 sin doble devolución.
  Publicación aislada en preparación, no publicada todavía.
- Quedó a medias: T2 paso 3 sin marcar hasta verificar interfaz; T3 paso 3
  asignado al agente de ventas tras terminar el hotfix, con rutas exclusivas.
- Sigue: verificar y publicar los dos hotfixes; después T2 paso 3 y T3 paso 3.
- Para Joswill: probar los dos errores cuando esté publicada la corrección.
  PDF automático sigue aplazado; no se retoma su investigación.

### 2026-10-02 23:08 · Codex
- Hizo: T2 paso 2 verificado/commiteado; agente implementa precio. T3
  paso 1 completo; paso 2 detenido al comprobar diferencia del plan.
  T7 pruebas unitarias del adaptador en rojo, independientes de UI.
- Commits: T2 `db5bbc9`/`43a0d06`; T3 `0319216`; este paso guarda T7 rojo.
- Pruebas: filtro Inventario aprobado; tipos móvil/colores/hooks pasan.
  T3 unitarias: 11 previas pasan, faltan fases/módulo; UI falta tarjeta.
  T7 rojo por adaptador ausente. Sin datos ni escrituras de producción.
- Quedó a medias: T3 espera decisión: Panel.cargar() relee 5 históricos;
  calentar Panel no hace dashboard(true) gratis como supone el plan.
  Se propuso comparar costo de dashboard contra Panel calentado y exigir
  cero lecturas adicionales de encargos, sin tocar repositorios.
- Sigue: T2 precio; T7 adaptador; T3 sólo tras decisión de Joswill.
  Casos UI T7 antes de integrar formulario, para evitar dos dueños de pruebas.py.
- Para Joswill: pregunta sobre corregir supuesto de lecturas de T3 enviada.
  Joswill respondió «Sí, corregí la prueba y seguí»; se autoriza baseline
  de Panel calentado, cero costo adicional de fases sin tocar repositorios.
  T7 adaptador verificado: 36 pruebas (11 nuevas + 25 fases) y ambos tipos
  pasan; UI todavía no conectada. Commit de paso 2 con su casilla.
  PDF sigue aplazado; no dedicar más tiempo ni integrar candidata.

### 2026-10-02 22:52 · Codex
- Hizo: Joswill cuestionó el tiempo dedicado al PDF; se cerró la
  investigación y autorizó seguir C2 dejando PDF automático pendiente,
  conservando impresión actual. Se repartieron T2 y T3 con rutas exclusivas,
  principal encargado de integrar/commitear y tercer agente en revisión.
- Commits: 5a en `5070bcd`; este WIP guarda 5b sin marcarlo terminado.
  5b en `907b61f`; página independiente guardada en WIP 5c, sin comprobar
  Safari ni acceso remoto. Archivos de página en tests/interfaz/pdf-preview*.
- Pruebas: tipos móvil pasan con paginador; ancho/márgenes pasan. La prueba
  completa nueva no concluyó: timeout networkidle en control, no verde.
  Inspección corta: pie visible, aún recorta «No se consiguió» y saldo.
- Quedó a medias: paginación 5b experimental, sin aprobación ni integración.
  Prueba ampliada de DOM de html2canvas/control también WIP. No seguir
  gastando tiempo en PDF hasta nueva instrucción de Joswill.
- Sigue: T2 pasos 1–4 y T3 pasos 1–4; pruebas que siembran en serie.
  Ajustar T6 para impresión actual antes de implementar compartir.
- Para Joswill: nada para avanzar Inventario/encargos. PDF automático,
  aceptación de su peso y prueba física quedan pendientes. Sin publicación.
  T2 paso 1 guardado en `db5bbc9`: tres casos rojos por Inventario ausente.
  T3 paso 1 fija fases/lecturas/lista y UI roja por tarjeta Encargos ausente.
  T6 ajustado a impresión actual, mensaje y «Ya la mandé» explícito;
  T7 requiere validar importe positivo antes del servicio existente.

### 2026-10-02 22:46 · Codex
- Hizo: C2 · T1 · paso 5a. Aplicar CSS print y márgenes @page del HTML
  original; snapshot completo antes de copiar estilos computados. Joswill
  autorizó agentes en paralelo con rutas exclusivas y commits del principal.
- Commits: este paso 5a; base `6dd1955`. Sin publicación.
- Pruebas: 593 unitarias al retomar; tipos móvil pasan. Ancho útil visto
  rojo (566.92 px), luego verde (680.315 px); márgenes A4 PDF corto/largo
  pasan. Arnés PDF/share del paso 4 aprobado con el cambio de impresión.
- Quedó a medias: 5b. Inspección visual todavía encuentra texto recortado
  en la corta. Caso nuevo de paginación en rojo válido: 4 páginas PDF pero
  un solo lienzo de 8248272 píxeles y sin cabeceras repetidas.
- Sigue: conservar alturas naturales y paginar el mismo DOM antes de
  rasterizar; comprobar rangos de texto, 35 filas únicas y cabeceras.
  Página aislada preparada por otro agente, pendiente de integrar/verificar.
- Para Joswill: no empezar T2; faltan acceso HTTPS para el iPhone remoto,
  comparación física y aceptación del peso. Emulador/Vite activos mientras
  continúa la implementación. Google Fonts requiere red fuera del sandbox.

### 2026-10-02 22:18 · Codex
- Hizo: C2 · T1 · paso 4. Arnés de descarga corta/larga, permisos y
  cancelación, fallo de fuentes y cero peticiones/escrituras a Firestore.
  Build experimental separado para medir el adaptador con Workbox.
- Commits: paso 3 `b7e8660`; este paso incluye corrección del recorte,
  pruebas, medición, casilla y documentación. Sin push/publicación.
- Pruebas: arnés PDF aprobado; recorte del pie visto rojo/verde; tipos y
  build móvil final con auditorías pasan, build experimental pasa. Suite
  móvil completa aprobada en paso 3 y 593 unitarias al retomar.
- Detalle para no perder: CSS computada fijaba dos alturas del body
  (height y block-size); omitir ambas evita cortar lo añadido por saltos.
  No se cambió la plantilla. Adaptador sigue DEV, sin integrar encargos.
- Quedó a medias: T1 paso 5. PDF local conserva importes, pero cambia
  márgenes/saltos y no repite cabeceras; candidata sin aprobar. Suma ~965
  KiB crudos/~281 gzip al JS; Workbox la precachea. Larga: 1204844 bytes.
- Sigue: decisión documentada en el informe: continuar conversión con CSS
  de impresión/cabeceras (sin cambiar Windows), o decidir impresión manual.
  Después prueba física; no T2. Referencias/artefactos en scratch/c2-pdf.
- Para Joswill: elegir cómo continuar con PDF y aceptar su peso cuando
  corresponda. iPhone 14 Plus de Ross fuera de la red: acceso HTTPS y
  versión exacta/Safari/PWA pendientes; publicar sigue sin autorizarse.
- Procesos: emulador y Vite apagados; sin escuchas verificadas en
  8080, 9099, 4400, 9150 ni 5174. Paso 4 en `535cbde`.
  Se presentó a Joswill la elección de conversor o impresión manual;
  no se asume aceptación del peso ni aprobación física.

### 2026-10-02 22:08 · Codex
- Hizo: C2 · T1 · paso 3 terminado; Joswill autorizó corregir el plan y
  añadir `BottomSheet ocupado`. La hoja prepara el File antes del toque;
  compartir y copiar arrancan sin await intermedio. Sigue sólo en DEV.
- Commits: este paso completa el WIP `fe6a9df`; pasos 1/2 `1fef684`/`4025387`.
- Pruebas: 593 unitarias de base; tipos móvil y build con auditorías pasan;
  suite móvil completa aprobada. Caso ocupado visto rojo/verde: X, velo,
  arrastre, Atrás, cierre después, bloqueo durante preparación y descarte.
  PDF real descargado; share simulado conserva nombre/MIME/mensaje y gesto.
- Quedó a medias: nada del paso 3. Falta paso 4 y comparación física.
  Emulador/Vite encendidos para continuar; no hubo publicación.
- Sigue: C2 · T1 · paso 4; el build normal elimina la librería DEV y no
  mide su costo. Plan actualizado para medir con entrada experimental.
- Para Joswill: iPhone 14 Plus de Ross fuera de la red; acceso HTTPS y
  prueba física pendientes. Fidelidad visual todavía no aprobada.

### 2026-10-02 21:53 · Codex
- Hizo: WIP C2 · T1 · paso 3. Hoja DEV de fixtures con preparación,
  descarga y acciones de compartir/copiar. Se detuvo al encontrar que
  BottomSheet no admite `ocupado`, aunque el plan lo exige.
- Commits: pasos 1 y 2 en `1fef684` y `4025387`; este WIP con informe y
  bitácora. No publicados.
- Pruebas: descarga corta aprobada (288911 bytes, una página); tipos móvil
  FALLAN TS2322 por la propiedad ausente. 593 unitarias y build móvil de
  base aprobados antes del prototipo; no equivalen a verificar este WIP.
  Inspección visual: importes correctos, márgenes/saltos diferentes de
  Windows. PDF candidato rasterizado, sin texto seleccionable.
- Quedó a medias: paso 3 sin marcar. No se probaron share, cancelación,
  fallo de portapapeles, PDF largo ni generación fallida. Paso 4 necesita
  medir con un build experimental: el normal elimina la entrada DEV.
- Sigue: decisión de Joswill para corregir plan, probar `ocupado` en el
  marco común, medir candidata sin incorporarla a producción e investigar
  fidelidad conservando la plantilla. T2 no empieza.
- Para Joswill: se pidió esa decisión. Ross usa iPhone 14 Plus actualizado,
  fuera de su casa, sin Wi-Fi compartido; versión exacta/Safari/PWA y
  acceso HTTPS remoto pendientes. No hay permiso de publicación.
- Procesos: emulador y Vite apagados; se verificó sin escuchas en
  8080, 9099, 4400, 9150 ni 5174. WIP guardado en `fe6a9df`.

### 2026-10-02 21:47 · Codex
- Hizo: C2 · T1 · paso 2, adaptador con html2pdf.js 0.14.0 y File.
- Commits: este paso; paso 1 en `1fef684`.
- Pruebas: TypeScript móvil sin errores; el caso de descarga sigue en rojo
  hasta conectar la hoja del paso 3. No se evaluó fidelidad todavía.
- Detalle técnico: la biblioteca clona fuera del iframe. Se conservan
  estilos computados de la plantilla, sin rediseñarla, para evitar heredar
  estilos de la app. Recursos y overlay se quitan en finally.
- Quedó a medias: nada del paso 2; emulador/Vite encendidos para continuar.
- Sigue: C2 · T1 · paso 3.
- Para Joswill: nada; candidata todavía sin aprobar.

### 2026-10-02 21:44 · Codex
- Hizo: C2 · T1 · paso 1. Fixtures desde repositorios/emulador, referencias
  con Electron y las opciones actuales de Windows, prueba de descarga roja
  y medición del build sin la dependencia. Informe en superpowers/experiments.
- Commits: este paso con su casilla y entrada; base `e768f67` limpia.
- Pruebas: base 593 unitarias; siembra PDF 1 aprobada; build móvil aprobado;
  descarga falla por ausencia del botón experimental, como debía.
- Detalle del experimento: la plantilla de Windows no tiene imagen de logo;
  se conserva su identidad textual. El arnés imprime el mismo HTML y opciones
  en Electron, sin entrar a producción. Las fixtures están en tests; artefactos
  PDF/HTML y métricas en scratch (ignorados).
- Quedó a medias: nada del paso 1. Emulador y Vite local encendidos mientras
  se implementan los pasos siguientes.
- Sigue: C2 · T1 · paso 2, después 3 y 4; paso 5 requiere teléfono real.
- Para Joswill: nada todavía; sin publicación.

### 2026-10-02 17:00 · Codex
- Hizo: plan C2 escrito y revisado contra el diseño y las firmas actuales.
  Siete tareas: prueba PDF, Inventario/precio, lista de encargos, anotar,
  cotizar, compartir y aceptar. Sin código de C2 ni dependencia instalada.
- Commits: cierre de C1 `ddc0fc7`; este commit guarda el plan y el relevo.
- Pruebas: C1 verificada con 593 unitarias, 104 emulador, 43 interfaz Windows,
  28 móvil, ambos tipos y build móvil. Después sólo cambió documentación;
  se revisaron contratos y referencias del plan, sin ejecutar sus pasos.
- Decisiones para no perder: html2pdf.js es candidata del experimento, no
  motor aprobado; compartir requiere archivo preparado antes del toque.
  Deshacer el grupo de Aceptó con pago vuelve a cotizada; anular/corregir
  un abono como acción posterior conserva aceptación (pruebas existentes).
- Quedó a medias: nada del alcance de este relevo. Emulador apagado y
  comprobado sin escuchas en 8080, 9099, 4400 ni 9150. Sin push/deploy.
- Sigue: C2 · T1 · paso 1. Leer el plan antes de instalar o implementar.
- Para Joswill: cuando el prototipo esté listo hará falta el teléfono para
  comparar PDF y compartir; esa prueba aún no se hizo. Sigue pendiente
  probar a mano el flujo de paquetes, WhatsApp Windows, Deshacer y haptics
  en el teléfono indicados en entradas previas.

### 2026-10-02 16:55 · Codex
- Hizo: cierre conjunto de C1 y actualización de CONTEXTO_SESION y AUDITORIA.
- Commits: T4 en `1208854`, `e079985`, `b0e6468`, `0626f3d`, `d87541a`;
  este commit registra el cierre de C1.
- Pruebas: 593 unitarias, 104 emulador (incluida simulación), 43 interfaz
  Windows, 28 móvil; tipos de ambas apps y build móvil con auditorías pasan.
- Quedó a medias: nada de C1. Se está redactando el plan de C2, aún sin
  commitear; el emulador sigue encendido hasta cerrar la sesión.
- Sigue: terminar y revisar el plan de C2; su primera tarea es la prueba
  del PDF en teléfono real exigida por el diseño.
- Para Joswill: sin publicación. Falta prueba física del flujo nuevo.

### 2026-10-02 16:44 · Codex
- Hizo: C1 · T4 · paso 5; tarea completa y sus cinco casillas marcadas.
- Commits: `1208854`, `e079985`, `b0e6468`, `0626f3d` y este cierre.
  Incluyen vista, hoja de pieza, entrada desde Inventario, ruta en App y pruebas.
- Pruebas: las del paso 4; sin cambios de código posteriores.
- Quedó a medias: nada de T4; pendiente la verificación conjunta de C1.
- Sigue: "Al terminar C1", luego escribir el plan de C2.
- Para Joswill: nada; sin push ni publicación.

### 2026-10-02 16:43 · Codex
- Hizo: C1 · T4 · paso 4. Revisión visual en claro y oscuro y regresión de
  errores por campo, descarte de la hoja y quitar una pieza del borrador.
  La prueba encontró que el error seguía al corregir el valor; ahora se
  limpia al editar ese campo. Se dejó espacio bajo el botón sin safe area.
- Commits: el del paso 4 con esta entrada; paso 3 en `b0e6468`.
- Pruebas: caso de registro aprobado, regresión de validación vista en rojo
  y luego en verde, suite móvil completa 28 casos aprobados; build móvil y
  auditorías aprobados. Persisten avisos de Vite por tamaño de chunk e
  importaciones estáticas/dinámicas, sin errores de compilación.
- Quedó a medias: nada del paso 4. Emulador encendido para cerrar C1.
- Sigue: paso 5, cierre de C1 y plan de C2.
- Para Joswill: no se probó en un teléfono físico; sin publicación.

### 2026-10-02 16:32 · Codex
- Hizo: C1 · T4 · paso 3. Vista de tres pasos y entrada desde Inventario,
  borrador al avanzar y al agregar/quitar piezas, continuar un borrador
  persistente, vista previa, recibir y refrescar el inventario. El precio
  sugerido se consulta, no se edita (decisión del plan).
- Commits: el del paso 3 con esta entrada; anteriores `1208854` y `e079985`.
- Pruebas: TypeScript móvil sin errores; caso "Llegó un paquete" aprobado
  con recarga de la app y comprobación de existencias; auditorías de colores
  y hooks aprobadas. El fallo de `Agregar pieza` era una carrera en la
  prueba: ahora Playwright espera el botón después del guardado asíncrono.
- Detalles añadidos para cumplir el diseño: entrada a borradores guardados
  desde la pantalla inicial, conservar campos de la PC al retomarlos,
  quitar con confirmación y guardar la cabecera al volver al Inventario.
  La prueba usa `pantalla(page)` como decidió T3 y comprueba que guardar
  un borrador no crea mercadería antes de Recibir.
- Quedó a medias: paso 4, revisión visual y suites completas pendientes.
  El emulador está encendido para estas pruebas.
- Sigue: C1 · T4 · paso 4, después 5 y "Al terminar C1". Luego plan de C2.
- Para Joswill: nada. Sin push ni publicación.

### 2026-10-02 14:08 · Codex
- Hizo: paso 2 completo, `PiezaPaqueteSheet`: búsqueda con vendidos y
  descatalogados, tallas/tonos, cantidades y montos validados en su campo,
  `hayCambios`, haptics antes de guardar y hoja abierta/vacía al agregar.
  Paso 3 **WIP**: `RegistrarPaqueteView` de tres pasos, entrada desde
  Inventario, guardado de borradores, vista previa y recibir por el
  repositorio compartido. Joswill pidió parar para conservar créditos.
- Commits: `1208854` (paso 1), `e079985` (paso 2). El WIP del paso 3 no
  llegó a commitearse al parar: se agotó el límite de la revisión automática
  de permisos. Joswill pidió continuar, y Codex retomó esos mismos cambios.
- Pruebas: `npm test` inicial 593 aprobadas; el caso nuevo se vio fallar
  por falta del botón antes de implementar. `npx tsc -p mobile/tsconfig.json
  --noEmit` pasa con la hoja y luego con la vista conectada. El caso de
  interfaz **todavía falla** en `tests/interfaz/pruebas.py`, línea 1313:
  `visible(page, "button", "Agregar pieza").click()` devuelve `None`,
  inmediatamente después de tocar Seguir. No hay errores de consola.
  **Hipótesis por comprobar**: se busca el botón antes de terminar el
  guardado asíncrono del paso 1; revisar también si se muestra un error al
  guardar. Se agregó `traceback.print_exc()` para que el corredor dé la
  línea exacta. No se corrieron aún las suites completas ni build móvil.
- Detalles para continuar: la prueba de T4 también recarga la app después
  de agregar una pieza y busca `Continuar PQ-…`, para verificar el borrador
  persistente exigido por el diseño. Comprueba que antes de Recibir no se
  creó el producto y después entraron dos unidades. La vista permite
  continuar borradores y conserva los campos de PC que no edita; revisar
  ese recorrido antes de darlo por bueno. El precio se consulta con
  `precioParaCosto`, respetando precio manual, margen y lotes existentes.
- Quedó a medias: paso 3; no se marcaron 3, 4 ni 5. Falta terminar la
  comprobación funcional, revisar visualmente los tres pasos y pasar las
  suites del paso 4 y del cierre de C1. Todavía no hay plan de C2.
- Sigue: C1 · T4 · paso 3. Resolver el fallo con evidencia; si aparece una
  discrepancia real entre plan y código, anotarla y parar como pidió Joswill.
- Para Joswill: nada. Se confirmó al retomar que el emulador se había
  apagado; se vuelve a iniciar para seguir las pruebas. Sin publicación.

### 2026-10-02 13:53 · Codex
- Hizo: C1 · T4 · paso 1, el caso de "Llegó un paquete". Usa
  `pantalla(page)` según la decisión de T3, y comprueba también las dos
  unidades en bodega. Se trabaja en `master`; el puente viejo sigue intacto
  y sin usarse en el otro worktree.
- Commits: el de esta entrada (paso 1).
- Pruebas: base limpia en `88fc80a`, `npm test` 593 aprobadas. El caso
  nuevo falla por lo esperado: no existe "Llegó un paquete".
- Entorno: esbuild necesita ejecutar fuera del aislamiento de Codex. El
  lanzador del emulador copia `Path` pero consulta `PATH`, y arma una ruta
  con `undefined`; se inició normalizando a `PATH` sólo el entorno del
  proceso hijo, sin editar scripts ni configuración global.
- Quedó a medias: implementación de T4 todavía no empezada; emulador local
  encendido para las pruebas de este turno.
- Sigue: C1 · T4 · paso 2.
- Para Joswill: nada.

### 2026-10-02 13:42 · Claude Code
- Hizo: **C1 · T3 completa** (celular). Inicio: sale "Stock crítico", su
  hoja y el contador "N bajo"; el resumen de un paquete vendido con "Listo"
  y la tarjeta de cada paquete en venta, que muestra lo que queda en bodega
  y abre la ficha de cada producto. Inventario: abre con lo que hay; lo
  vendido aparece en "Vendidos" al elegir un paquete o al buscar.
- Decisiones fuera del plan:
  - La siembra de los paquetes va **después** de la venta de Ana, para que
    ella siga siendo V-0001 (muchos casos la buscan así).
  - Los casos del celular leen la pantalla visible con `pantalla(page)`:
    `locator("main")` encuentra seis (las vistas están montadas a la vez).
  - Los textos que comparten las dos apps pasaron al núcleo
    (`textoAvance`, `textoRecuperado`, `textoDias`, `textoVendidoTodo` en
    `core/avance-paquete.ts`): "se vendió todo el mismo día", no "en 0 días".
  - El Inventario del celular también muestra "Vendidos" al buscar, y arriba
    cuenta lo que hay a la venta.
- Commits: `1a787b0` (paso 1), `6d6c7db` (2), `8c95011` (3 y 4), `b15e61f`
  (5 a 7). No pusheados.
- Pruebas: `test:interfaz` 26 casos, aprobada (los 2 de C1 fallaban
  antes); `npm test` 593; `build:mobile` con sus auditorías; `tsc` de las dos
  apps limpio. Se miraron capturas de Inicio, la hoja del paquete y el
  Inventario del celular.
- Quedó a medias: nada. El emulador quedó apagado.
- Ahora las dos apps ya no muestran alertas de agotados: C1 sin T4 se podría
  publicar si Joswill quiere (T4 es una función nueva, independiente).
- Sigue: C1 · T4 · paso 1 ("Llegó un paquete" en el celular).
- Para Joswill: decidir si publica T1 a T3 ya o espera a T4.

### 2026-10-02 13:20 · Claude Code
- Hizo: **C1 · T2 completa** (Windows). Inicio: la cuarta cifra es
  "Recuperado de PQ-…" y la tarjeta "Stock crítico" pasó a "Paquetes en
  venta"; el resumen de un paquete vendido aparece arriba hasta "Listo".
  Inventario abre en "A la venta" (filtros A la venta, Vendidos,
  Descatalogados, Todos). Paquetes: avance o resumen en el detalle, el
  detalle encima de la tabla, impuesto del paquete.
- Decisiones fuera del plan (para que no se deshagan):
  - La barra del avance es quieta (`AvancePaquete.tsx`), no la `BarraProgreso`
    de `ui`, que crece animada cada vez que aparece (criterios de Emil).
  - Salió el contador de la barra lateral en Inventario: era la alerta de
    agotados con otra forma (`App.tsx`, `Sidebar.tsx`).
  - Tocar un paquete en Inicio abre su detalle: `paqueteInicialId` de
    `App` a `InventarioView` a `PaquetesView`.
  - El detalle del paquete ya no tiene "Te dejó hasta hoy": lo reemplaza el
    avance.
  - Con lo cobrado por encima de lo invertido, dice "Ya recuperaste lo que
    costó ($X) y $Y más".
  - Los totales y el selector de paquetes del Inventario salen siempre de
    todos los productos; si no, al abrir en "A la venta" un paquete vendido
    entero desaparecía del selector.
- Commits: `ced3816` (paso 1), `f394698` (2), `190ab1a` (3), `c188728` (4),
  `6e7c3d7` (5 a 7). No pusheados.
- Pruebas: `test:interfaz-escritorio` 43 casos, aprobada (los 2 de C1
  fallaban antes); `npm test` 592; `tsc` de las dos apps limpio; auditoría
  de colores. Se miraron capturas de Inicio, Inventario y el detalle de un
  paquete.
- Quedó a medias: nada. No se usó el emulador.
- Sigue: C1 · T3 · paso 1 (celular: Inicio e Inventario). Hasta que T3 esté,
  el celular sigue mostrando "Stock crítico": no publicar C1 todavía.
- Para Joswill: nada.

### 2026-10-02 12:49 · Claude Code
- Hizo: **C1 · T1 completa** (el núcleo). `avanceDePaquetes()` en
  `src/core/avance-paquete.ts` calcula de los lotes cómo va cada paquete
  (vendidas, quedan, invertido, vendido, ganancia, cobrado, quién debe, lo
  más rápido) y si está EN_VENTA o VENDIDO. El panel lo devuelve en
  `paquetes` (las dos apps), ya no arma las alertas "agotados" ni "por
  acabarse", y `marcarResumenVisto()` guarda cuándo Ross cerró el resumen
  (también por el canal de Windows y en el simulador).
- Commits: `f2132a1` (pasos 1 a 6), `817c579` (7), `5d63908` (8), `f3fd73a`
  (9), `34f53c9` (10), `3393982` (11), `f6129d0` (12 y 13). No pusheados.
- Pruebas: `npm test` 592; `npm run test:emulador` 104 (las 2 nuevas fallaron
  con el panel de antes del paso 7); `test:interfaz-escritorio` 41 casos y
  `test:interfaz` 24, aprobadas; `build:mobile` con sus auditorías; `tsc` de
  las dos apps limpio.
- Quedó a medias: nada. El emulador quedó apagado.
- Ojo: las pantallas todavía muestran lo viejo. Inicio de Windows sigue con
  la tarjeta "productos agotados o bajos" y el celular con "Stock crítico",
  porque leen `bajo_stock` y `total_bajo_stock`, que se siguen calculando.
  Eso lo cambian T2 y T3. No publicar C1 hasta tener T2 y T3.
- Sigue: C1 · T2 · paso 1 (Windows: Inicio, Inventario y Paquetes).
- Para Joswill: nada.

### 2026-10-02 12:30 · Claude Code
- Hizo: pasó el trabajo a relevo (este archivo); el aviso está al principio
  de `AGENTS.md`, que Codex lee solo.
- Commits: el de este archivo.
- Pruebas: ninguna (sólo documentación).
- Quedó a medias: nada. El repositorio no tenía cambios de Codex al
  empezar: `master` y `origin/master` en `44cdcdc`, árbol limpio.
- Sigue: C1 · T1 · paso 1.
- Para Joswill: nada.

### 2026-10-02 12:10 · Claude Code
- Hizo: publicó la `v2.17.0` (Fase 2 de la auditoría y "Fue un error") en
  las dos apps, con las reglas de Firestore primero; escribió el plan de C1
  y lo validó en un worktree descartable.
- Commits: `481d24a` (Fase 2), `b47d21f` (versión), `44cdcdc` (plan y
  documentos). Pusheados.
- Pruebas: sobre `481d24a`, `npm test` 586, emulador 102, interfaz de
  Windows 41 casos y del celular 24; sobre `b47d21f`, en worktree limpio,
  `tsc` de las dos apps y `npm test` 586. El código de T1 del plan, aplicado
  en un worktree descartable: sus 6 pruebas pasan y `tsc` queda limpio.
- Quedó a medias: nada.
- Sigue: C1 · T1 · paso 1.
- Para Joswill: probar a mano en Windows que "Enviar WhatsApp" del menú de
  Clientes y el WhatsApp de la Factura abran el chat, y en el teléfono
  Deshacer después de un abono y de una venta; y la vibración de la 2.16.5
  en un iPhone. Codex tiene en
  `.codex/worktrees/coordinacion-agentes` un puente de revisión sin
  commitear, de cuando iba a coordinar: con el relevo no se usa.
