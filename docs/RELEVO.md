# Relevo entre agentes: Claude Code y Codex

> **Para quién es esto**: el agente (Claude Code o Codex) que retoma el trabajo.
> **Leelo antes de tocar nada, y dejalo al día antes de parar.**

Joswill trabaja con **un agente a la vez**. Cuando se le acaban los créditos
de uno, sigue con el otro en el mismo repositorio y la misma máquina, y
cuando se acaban los del segundo vuelve al primero. No hay coordinador ni
revisor: el que está de turno toma el siguiente paso del plan vigente, lo
hace, lo prueba y lo deja escrito acá. El que llega después no sabe nada de
la conversación anterior: sólo sabe lo que quedó en el repositorio.

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

- **Publicado**: `v2.17.0` en Windows y en el celular (`b47d21f`, 2/10).
- **Plan vigente**: Fase C2 · Inventario y encargos en el celular,
  [superpowers/plans/2026-10-02-c2-inventario-y-encargos.md](superpowers/plans/2026-10-02-c2-inventario-y-encargos.md).
- **Siguiente paso**: C2 · T1 · paso 3, hoja experimental de preparación y
  compartir. Adaptador y referencia preparados. T1 requiere comparación en teléfono real
  antes de T2; no se da por cumplida con Playwright.
- **C1**: T1 a T4 completas y verificadas en `master` local, sin publicar;
  cierre documentado en `ddc0fc7`. Emulador apagado.
- **Después de C1**: C2 a C4, en el diseño
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
