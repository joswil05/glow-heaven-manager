# Contexto para empezar una sesión nueva

> **Para quién es esto**: el modelo o la persona que abre este proyecto sin
> haber estado en la sesión anterior.
> **Estado del árbol**: `v2.16.0` publicada en el celular y en Windows el 29
> de septiembre: los encargos por fases y corregir una venta y un abono en las
> dos apps (sección 2 y sección 3), y la `v2.16.1` el mismo día: el
> historial a la vista, quién registró cada cosa y los abonos en su moneda
> (sección 3). Joswill las está probando él mismo. Los datos de producción se
> migraron a lotes con `scripts/migrar-a-lotes.ts` (sección 3). El 29 se
> auditó toda la interfaz ([AUDITORIA_UX_2026-09-29.md](AUDITORIA_UX_2026-09-29.md))
> y el 30 se hicieron su Fase 0, la `v2.16.3`, y su Fase 1, la `v2.16.4`
> (sección 3). El 1 de octubre salió la `v2.16.5`: la vibración vuelve en
> iPhone (sección 3). El 2 de octubre salió la **`v2.17.0`** en las dos apps:
> la Fase 2 de la auditoría (un solo abono, lo pagado en su moneda y un solo
> WhatsApp) y "Fue un error" (sección 3). **Lo que sigue es la Fase C1**, la
> primera de las fases del celular, con su plan escrito y validado (sección
> "Para seguir: Codex y los agentes", abajo).
> **Última actualización**: 2 de octubre de 2026.

Leé este archivo primero. Después:

- **[AGENTS.md](../AGENTS.md)** — las reglas que no se negocian (dinero en
  centavos enteros, español, colores, seguridad, los comandos de verificación).
  Es corto y hay que respetarlo entero.
- **[docs/CONTEXTO_TECNICO_IA.md](CONTEXTO_TECNICO_IA.md)** — el mapa de la
  arquitectura: monorepo, `src/core/`, contrato IPC, vistas. Escrito en `v2.2.8`,
  así que la estructura sigue valiendo pero los números y el costeo que describe
  ya no. Para el costeo mandá lo que dice acá abajo.

## Para seguir: Codex y los agentes

Desde el 2 de octubre Joswill trabaja con **Codex como coordinador** y
**Claude como ejecutor**; cuando se le acaban los créditos de uno sigue con el
otro. Este apartado es lo mínimo para retomar sin preguntar nada.

**Dónde está todo**:

- `master` local y `origin/master` están en el mismo commit, publicado como
  `v2.17.0` (`b47d21f`), más los commits de documentación que vengan después.
  No hay cambios sin commitear de ninguna sesión.
- **Lo próximo es la Fase C1 · Inventario por paquete.** El plan, tarea por
  tarea y con el código, está en
  [superpowers/plans/2026-10-02-c1-inventario-por-paquete.md](superpowers/plans/2026-10-02-c1-inventario-por-paquete.md). Se validó el 2/10 en un
  worktree descartable: el código de T1 compila y sus pruebas pasan.
- El diseño de las cuatro fases del celular (C1 a C4), con las decisiones de
  Joswill, está en
  [superpowers/specs/2026-10-02-fases-del-celular-design.md](superpowers/specs/2026-10-02-fases-del-celular-design.md).
  El orden completo del trabajo, en la sección 5 de
  [AUDITORIA_UX_2026-09-29.md](AUDITORIA_UX_2026-09-29.md).

**Cómo se trabaja** (detalle en la sección "Cómo se reparte el trabajo" del
diseño):

1. Codex asigna una tarea del plan (T1 primero; después T2, T3 y T4 en
   paralelo) con sus archivos y cómo se da por buena.
2. Quien ejecuta trabaja en un worktree propio, escribe primero la prueba
   que falla, commitea sólo sus rutas (`git add -- <rutas>`) y entrega el
   commit con la salida de las pruebas que corrió.
3. Codex revisa y le propone a Joswill integrar. Joswill aprueba integrar y
   **publicar**: nadie hace push, `build:exe`, `deploy:mobile` ni
   `firebase deploy` sin su "publicalo".
4. El emulador se usa de a uno: `npm run emulador`, y avisar antes y después.

**Las reglas que más se olvidan**: dinero en centavos enteros; la tasa de
cambio de una venta existente es la de esa venta; textos en vos para Ross y
de tú para las clientas; colores sólo por token; en el celular, `haptics.*`
antes de cualquier `await` dentro de un toque; un hallazgo de nivel A o M se
reproduce con una prueba que falla antes de arreglarlo.

---

## 1. Qué es esto y para quién

Glow Heaven Manager es la herramienta de gestión de un negocio real de
importación en Nicaragua. **No es un proyecto de práctica.** La dueña, Ross,
trabaja con esto todos los días y los datos de producción son su contabilidad.

Dos aplicaciones sobre el mismo Firestore:

| | Dónde vive | Para qué |
|---|---|---|
| **Escritorio** | Electron + React, `src/` | El trabajo pesado: inventario, paquetes, ventas, reportes |
| **Móvil (PWA)** | `mobile/`, Firebase Hosting | Consultar y vender desde el celular |

Los dos comparten los repositorios de `src/main/firebase/repositories/`. Un
cambio en un repositorio le llega a las dos aplicaciones.

**El negocio en una línea**: alguien le compra mercadería en Estados Unidos, un
courier se la trae a Nicaragua y le cobra el flete acá por libra, y ella la
vende localmente al contado o al crédito. Vende casi todo antes de que llegue
el siguiente paquete, así que **cada paquete le renueva el inventario**.

---

## 2. El costeo, que es lo que más costó acertar

Esta es la parte donde más veces se equivocó el modelo anterior. Vale la pena
leerla despacio. El análisis completo, con cada error reproducido y sus
números, está en [PLAN_PAQUETES_E_INVENTARIO.md](PLAN_PAQUETES_E_INVENTARIO.md).

### La fórmula

```
costo de una línea de paquete  =  precio de tienda  +  impuesto (7%)  +  su parte del flete
cada línea de paquete          =  un lote, con sus unidades y su valor
una venta                      =  sale del lote más viejo, al costo de ese lote
el precio por margen           =  sobre el lote más caro que queda
```

### Lotes (desde `v2.14`)

Hasta la 2.13 el producto guardaba un solo costo promedio: si el mismo termo
llegaba a $10 y después a $15, las ventas salían a $12.50 y no se sabía qué le
dejó cada paquete. Ahora cada línea de paquete es un lote en
`productos.lotes` ([`src/core/lotes.ts`](../src/core/lotes.ts)):

- Sale primero lo más viejo. La línea de la venta guarda de qué lotes salió
  (`lotes_consumidos`), y anular devuelve cada unidad a su lote.
- `valor_inventario_usd_cents` es siempre la suma exacta de los lotes; el
  simulador de producción lo verifica en cada paso.
- El precio se calcula sobre el lote más caro que queda, y nunca baja solo
  al vender: "Revisar precios" lo propone cuando se acaba el lote caro.
- **No hay script de migración.** Un producto sin lotes recibe un lote
  "Anterior" (`SALDO`) con todo lo que tenía, dentro de la misma transacción
  que lo toca. Si una app 2.13 todavía abierta mueve existencias sin tocar
  lotes, la siguiente transacción lo cuadra contra el lote más viejo.
- El detalle del producto lista sus lotes; el del paquete dice cuántas quedan
  de cada línea y cuánto le dejó lo vendido ("Te dejó hasta hoy").
- Una línea cuyas unidades se repartieron entre tallas tiene un lote por
  talla (`pq1-l12` y `pq1-l12-t2`). El paquete los suma y una corrección los
  reparte (`lotesDeLinea` en `core/paquete.ts`).

### Encargos (desde `v2.14`)

Ross no es una agencia de envíos: compra lo que la clienta pide y le llega en
sus paquetes. Cada línea del encargo es una pieza que apunta a la línea del
paquete que la trae. La etapa se deriva de las piezas
([`src/core/encargos.ts`](../src/core/encargos.ts)): por comprar, en camino
("1 de 2 llegó"), por entregar. Reglas:

- **Por fases, desde la `v2.16`** (lista para publicar, ver la sección 3): por
  buscar, por mandar, esperando respuesta, por comprar, en camino, por
  entregar. Tiene su propia pantalla (`EncargosView`), ya no es la de ventas
  con un interruptor. "Mandar cotización" marca la versión que se mandó;
  "Aceptó" es un paso propio y el anticipo puede venir después; una pieza
  puede quedar "No se consiguió" y la cotización sale con lo demás. El
  mensaje y la proforma dicen el porcentaje real del anticipo (antes, "50%"
  fijo; la plantilla vieja está guardada en producción y se reconoce). El
  diseño completo está en
  [PLAN_ENCARGOS_Y_SIN_CONEXION.md](PLAN_ENCARGOS_Y_SIN_CONEXION.md). Lo que
  sigue de esta lista es de la `v2.15` y sigue valiendo, salvo los nombres:
  "Por cotizar" pasó a "Por buscar", y un cotizado es "Por mandar" o
  "Esperando respuesta".
- **Un encargo puede empezar sin precio** (`v2.15`): una clienta pide algo que
  ella nunca compró y no sabe cuánto vale ni si lo va a conseguir. Se anota
  con la descripción y la clienta ("Guardar pedido"), queda "Por cotizar" y
  no cuenta en ventas, deuda ni ganancia. Por dentro es un encargo `COTIZADA`
  con piezas en `precio_unitario_usd_cents: 0` (`piezas.sin_precio`); no hay
  estado nuevo. "Cotizar" en el detalle (`VentasRepoFirestore.cotizar`) le
  pone precio con tienda y peso, recalcula total, costo y anticipo, y también
  corrige el precio de un cotizado; en uno confirmado sólo cotiza lo que no
  tenía precio. Sin precio no se cobra anticipo ni se entrega. Anular pregunta
  si fue porque "No se consiguió" (`motivo_anulacion`), y el panel avisa de
  los pedidos que llevan días sin cotizar.

- Ella no sabe en qué paquete viene lo que compra; sólo que lo más probable
  es que en el próximo. En el detalle del encargo, "Ya lo compré" deja la
  pieza **comprada, esperando paquete** (`comprado_el`, sin `compra_id`), y
  el encargo pasa a "En camino". Al registrar el paquete siguiente, arriba
  aparece "N piezas compradas esperan paquete · Agregarlas". Si no vinieron,
  se quitan del paquete y vuelven a esperar.

- Una pieza no puede venir en dos paquetes. Guardar el borrador la marca;
  borrarlo la devuelve a como estaba (por comprar, o comprada esperando
  paquete); recibirlo le pone la fecha de llegada y el costo real.
- No se entrega un encargo con una pieza comprada que no llegó. Una pieza que salió de
  la bodega sale del lote más viejo al entregar; una que vino en un paquete
  nunca descuenta de la bodega (antes se contaba dos veces).
- Un encargo cotizado se puede comprar igual; queda "sin confirmar".
- Anular pregunta, pieza por pieza, qué pasa con lo que ya llegó (a la bodega
  con su costo real, o perdida) y si se devuelve o se queda el anticipo. Lo
  que viene en camino pasa a la bodega de su paquete. La PWA no anula un
  encargo con piezas que llegaron: lo manda a la computadora.
- El panel avisa de los encargos confirmados sin comprar y de los que
  llegaron y no se entregan.

El diseño completo, con los casos borde, está en
[PLAN_LOTES_Y_ENCARGOS.md](PLAN_LOTES_Y_ENCARGOS.md).

### El paquete es la única puerta de entrada (desde `v2.12`)

Cada línea del paquete dice qué producto, cuántas unidades y lo que costó en
la tienda. El 7% (por línea, apagable si la tienda no lo cobró) y el flete
(repartido por peso, o por unidades si nadie tiene peso) se calculan en
[`src/core/paquete.ts`](../src/core/paquete.ts), que usan igual la pantalla
(vista previa sin lecturas) y el repositorio. Al pasar el paquete al inventario
cada línea suma sus unidades y su costo al producto, todo en **una**
transacción.

Un producto que vuelve a llegar recibe otra línea en otro paquete, con su
propio precio de tienda y su propio flete. Eso es lo que no se podía hacer
antes: en `v2.11` el producto guardaba un solo paquete, un solo precio de
tienda y un solo flete, y reponer inflaba el reparto.

### Lo que ya no existe

- `flete.repo.ts` y el reparto del flete a los productos después de cargarlos.
- El costo en la ficha del producto: la ficha es catálogo. Un costo mal
  cargado se arregla **corrigiendo el paquete**.
- Los campos `costo_base_unitario_usd_cents`, `flete_total_usd_cents`,
  `flete_unitario_usd_cents` y `precio_tienda_unitario_usd_cents` siguen en
  los documentos de producción, pero nadie los escribe ni calcula con ellos.
  Sólo los lee `ComprasRepo.reconstruir`.

### El precio

Se recalcula cuando entra un paquete o cuando ella cambia el margen o la
categoría. **Nunca al vender, ajustar o devolver.** Un precio escrito a mano no
se toca; si queda debajo del costo, avisa.

### Los números de producción al 17 de septiembre

22 productos activos, 45 unidades, un solo paquete (PQ-0001) con $77.00 de
flete, registrado con la versión anterior (sin contenido):

```
precio de tienda de todo el stock ....  $273.98
impuesto 7% ..........................   $19.18
flete del PQ-0001 ....................   $77.00
                                        --------
valor de la bodega ...................  $370.16
```

El impuesto de ese paquete se sumó por unidad, redondeado cada vez (así lo
hacía `v2.11`). Los paquetes nuevos lo suman por línea, que es como lo cobra la
tienda. La reconstrucción de PQ-0001 respeta el de entonces, y corregir el
flete de un paquete no le recalcula el impuesto a las líneas que no se tocaron.

Si algún cambio mueve la bodega sin que haya entrado o salido mercadería, hay
un error.

---

## 3. Lo que está pendiente, en orden

### P0: la 2.16 publicada; lo que queda (encargos por fases, corregir ventas y abonos)

Hecho commit por commit: los encargos por fases el 28 de septiembre (tareas
E0 a E7 de
[superpowers/plans/2026-09-28-encargos-por-fases-2.16.md](superpowers/plans/2026-09-28-encargos-por-fases-2.16.md))
y corregir una venta y un abono el 29 (tareas C1 a C7, sección 2b del plan).
`tsc` de las dos apps en cero, 457 pruebas, 93 contra el emulador, 17 casos
de interfaz de escritorio, 10 de la PWA, las tres auditorías y el build del
celular.

**Publicada el 29 de septiembre**, por pedido de Joswill, que la prueba él
mismo: commit `3e0184e`, release `v2.16.0` con `latest.yml` verificado
(sha512 y tamaño iguales al exe publicado, y es la "Latest"), y la PWA en los
dos sitios de Hosting sirviendo el build nuevo. La app instalada en esta
máquina ya se actualizó sola a la 2.16.0. No se hizo la lectura de
producción ni la prueba con datos "Prueba" (sección 6): la prueba es la de
Joswill. Queda:

1. Lo que Joswill encuentre al probarla.
2. Contarle a Ross lo que cambia en los números: "Te deben" cuenta un
   encargo desde que acepta, aunque no haya pagado anticipo; con 0% de
   anticipo, tener precio ya no confirma; una pieza que no se consiguió sale
   del total; anular el anticipo ya no desacepta un encargo (vuelve a deber).
   Y lo nuevo: una venta o un abono mal cargado se corrige ("Corregir venta"
   en su detalle, "Corregir" junto a cada abono; en el celular, desde la
   pestaña Historial), nunca borrándolo en Firebase.

### La 2.16.1, publicada el 29 de septiembre

Lo primero que encontró Joswill al probar la 2.16.0 (sección 2c del plan):
el historial del celular escondido, corregir poco visible en Cobros, no se
sabía quién cargó un abono, y un abono en córdobas se mostraba en dólares.
Tareas H1 a H6, commits `d165df1` a `95e8359`:

- **La moneda del abono**: se guardaba bien (moneda, monto en las dos y
  tasa); lo que fallaba era mostrarla. Ahora cada abono se ve como se pagó
  (`core/abonos.ts`), corregirlo marca la moneda original y avisa si se
  cambia, y una venta al contado pagada con un solo abono lleva el abono
  con ella al corregirla, en su moneda y con su tasa (`ajustar_abono`).
- **Quién lo registró**: ventas y abonos nuevos guardan `registrado_por`;
  corregirlos, `corregido_por` y `corregido_en`. Lo anterior dice "Sin dato
  de quién". Cada app le dice a `client.ts` cómo saber la cuenta
  (`registrarAutor`), así los repositorios compartidos no dependen de cómo
  inicia sesión cada una.
- **Celular**: la pestaña Historial reemplaza a Actividad (agrupada por día,
  búsqueda, "Ver más"), y el historial de la clienta en Cobros corrige.
- **Windows**: Cobros agrupa los abonos por día, con "Corregir" y "Anular"
  escritos; Clientes también corrige.

Verificado: `tsc` de las dos apps, 483 pruebas, 93 contra el emulador, 18
casos de interfaz de escritorio, 10 de la PWA, las tres auditorías y el build
del celular. **Publicada** a pedido de Joswill: commit `29c971c`, release
`v2.16.1` con `latest.yml` verificado (sha512, tamaño y versión iguales al
exe; es la "Latest"), y la PWA en los dos sitios sirviendo el build nuevo. La
app instalada en esta máquina se actualizó sola a la 2.16.1.

### Fase de pruebas del 29 de septiembre: editar y eliminar (2.16.2)

Pedido de Joswill: verificar que editar o eliminar cualquier cosa (cobros,
ventas, clientas) haga reaccionar al resto con lógica. Se hizo así:

- `tests/motor-real/simulacion-negocio.test.ts` ahora también corrige
  ventas y abonos, abona a la clienta sin elegir venta, vende en cuotas,
  edita y elimina clientas y recorre las fases de un encargo, con deshacer
  en el medio. `invariantes.ts` suma revisiones: cada unidad vendida de un
  lote la explica una venta viva (lo que rompió V-0007), el abono es de la
  clienta de su venta y cuadra en sus dos monedas, las cuotas reparten lo
  pagado, la venta cuadra con sus líneas, Cobros trae todo, una clienta
  eliminada no debe ni tiene nada en curso. Se comprobó que las revisiones
  detectan una venta borrada a mano.
- Corrida larga: 20 historias de 100 pasos (1.629 operaciones), todas
  cuadrando; cada rechazo tuvo un motivo razonable. Se repite con
  `SIMULACION_SEMILLAS=20 SIMULACION_PASOS=100 SIMULACION_RECHAZOS=1` (el
  último imprime qué se negó a hacer la app y por qué).
- `tests/editar-y-eliminar.test.ts`: 19 escenarios a mano, pantalla por
  pantalla, que terminan pasando por las mismas revisiones.

Encontrado y arreglado (commit `6ff2904`):

1. **Se podía eliminar una clienta con un encargo en curso** (cotizado, que
   no es deuda) o una venta por entregar: el encargo quedaba sin dueña.
2. **Cobros listaba sólo diez ventas con saldo**, en las dos apps: sale del
   panel de Inicio, que cortaba en diez. Con once deudas, la undécima no se
   veía y el total de Cobros salía corto. No se revisó cuántas ventas con
   saldo hay hoy en producción.
3. **Cancelar una venta desde el Historial del celular no refrescaba el
   Catálogo**: las unidades volvían a la bodega pero la pantalla mostraba
   el stock de antes. La prueba de interfaz lo comprueba (sin el arreglo
   falla: 17 contra 20).

**Publicado como `v2.16.2`** el mismo día, a pedido de Joswill: commit
`6fe24a1`, release con `latest.yml` verificado (sha512, tamaño y versión;
es la "Latest") y la PWA en los dos sitios sirviendo el build nuevo. La app
de esta máquina estaba abierta desde antes de publicar: la toma al volver a
abrirla.

Después viene la 2.17 (encargos en el celular). Ojo: la quinta pestaña del
celular ya es Historial; "Encargos" necesita otro lugar (sección 2c del plan).
El orden completo está en la sección 0 del plan.

### La auditoría de interfaz del 29 de septiembre y su Fase 0 (2.16.3)

Pedido de Joswill: revisar cada pantalla, cada texto y cada formulario de las
dos apps antes de darlas por hechas, con las reglas de Emil Kowalski, y
corregir por fases **sin tocar código hasta que él autorice cada una**. El
informe es [AUDITORIA_UX_2026-09-29.md](AUDITORIA_UX_2026-09-29.md): 399
hallazgos con ID por pantalla (`COB-01`, `CAJ-01`…), 20 de nivel A, y un plan
de siete fases (0 a 6). **Antes de tocar la interfaz, leé ese documento**: lo
que encuentres probablemente ya tiene ID, arreglo propuesto y fase.

**Fase 0 (datos y plata), hecha el 30 de septiembre.** Lo que cambió de
comportamiento, que es lo que hay que saber para no deshacerlo:

1. **Guardar Configuración ya no recalcula precios.** Mandaba siempre el
   margen y el redondeo, y el repositorio, al verlos, reescribía los precios
   de todo el catálogo, sin aviso, sin Deshacer y sin evento. Ahora la
   pantalla manda sólo lo que cambió, y `ParametrosRepo.actualizar` y
   `guardarCategoria` no tocan productos: un margen o un redondeo nuevos
   abren "Revisar precios" (`core/revisar-precios.ts` +
   `ProductosRepo.aplicarPrecios`), donde se elige cuáles. El botón
   "Recalcular precios del inventario" pasó a ser "Revisar precios del
   inventario" y abre la misma ventana. `recalcularPrecios()` sigue en el
   repositorio pero ninguna pantalla lo llama.
2. **Ajustes del celular abría con el nombre y el teléfono vacíos** y con
   "Guardar cambios" a la vista: las seis pantallas se montan al abrir la
   app, antes de que lleguen los parámetros, y los campos copiaban su valor
   una sola vez. Guardar borraba el nombre del negocio en las dos apps.
   Ahora guarda sólo lo que la persona escribió (`editado`) y lee el resto
   de los parámetros en cada dibujo. **Cualquier formulario del celular que
   copie parámetros a un `useState` tiene el mismo problema.**
3. **Un producto con ventas o paquetes no se elimina**
   (`porQueNoSePuedeEliminar`): dice por qué y ofrece descatalogarlo.
4. **En Cobros, "Abonar" en una fila registra en esa venta** (abre
   `PagoModal`); antes abría el abono por clienta, que paga primero lo más
   viejo. "Registrar abono" de la cabecera arranca sin clienta elegida.
5. **Ctrl+Z no actúa dentro de un campo** y deshace el aviso más reciente;
   los avisos se leen hasta en tres líneas y los de error duran 8 segundos.
6. **La tasa de la venta en todo lo que sale de una venta**:
   `tasaDelDocumento()` para la factura, la proforma, su mensaje y la hoja
   del celular; `FilaPorCobrar.tasa_cambio_cents` para "Pagar todo" y los
   saldos en córdobas de Cobros.
7. **El código de una venta sale de `codigoDeVenta()`** (`core/codigos.ts`):
   el recibo del celular lo armaba a mano y decía "V-24" por "V-0024".
8. **Contraste**: la escala de Tailwind 700-900 apunta a `-fuerte`, y
   `auditar-colores.mjs` tiene una regla 4 ("nunca `--x` sobre `--x-suave`").
   Como esa auditoría mira cada `className` por separado, las dos suites de
   interfaz tienen además un caso que **mide** el contraste en la pantalla,
   en claro y en oscuro.

Cada hallazgo tiene una prueba que se vio fallar antes del arreglo:
`tests/fase0-auditoria.test.ts`, `tests/motor-real/fase0-auditoria.test.ts`
y los casos con ID de las dos suites de interfaz. `SOLO="CAJ-01"` delante de
`npm run test:interfaz` (o `test:interfaz-escritorio`) corre sólo los casos
cuyo nombre lo contiene.

Verificado: `tsc` de las dos apps, 514 pruebas, 98 contra el emulador, 26
casos de interfaz de escritorio y 16 de la PWA, las tres auditorías y el
build del celular.

**Publicada como `v2.16.3` el 30 de septiembre**, a pedido de Joswill: commit
`0a7feec`, release con `latest.yml` verificado (sha512, tamaño y versión) y
la PWA en los dos sitios sirviendo el build nuevo. La app de esta máquina
quedó en 2.16.3 (se abrió para que descargara y se cerró para que se
instalara). Subir el exe con `gh release create` cortó por tiempo (HTTP 408)
y no dejó nada; se hizo en tres pasos: la release como borrador, `gh release
upload` de los tres archivos y `gh release edit --draft=false --latest`.

Joswill pidió seguir con el plan: la Fase 1 de la auditoría (un solo marco
de ventana y formularios que no pierden lo escrito) es la siguiente.

**Fase 1, hecha el 30 de septiembre: la `v2.16.4`.** Lo que hay que saber
para no deshacerla:

- **Toda ventana nueva va sobre `Dialogo` (formulario común) o `Ventana`
  (interior propio)**, nunca un `fixed inset-0` a mano. Las dos pasan por
  `MarcoModal`, que hace la capa, retiene y devuelve el foco, maneja Escape
  por capas, Ctrl+Enter y la salida animada. Para que pregunte antes de
  descartar, pasale `hayCambios` (`lib/useHayCambios.ts` lo calcula con una
  firma). Con `ocupado` (guardando) nada la cierra. "Cancelar" tiene que
  llamar a `cerrar` (el pie de `Dialogo` y el interior de `Ventana` lo
  reciben), no a `onCerrar`.
- **Una lista desplegable dentro de una ventana** cierra con Escape antes que
  la ventana (`alEscape` del marco) y se maneja con flechas y Enter
  (`lib/useListaConTeclado.ts`).
- **Los errores de un formulario van en su campo** (`Field error`,
  `aria-invalid`) y el foco salta al primero (`lib/enfocarPrimerError.ts`).
  Arriba sólo va lo que responde el servidor. Los botones principales no se
  apagan para decir que falta algo.
- **Configuración** avisa lo que no se guardó y `App.irA` pregunta antes de
  salir (`lib/guardiaDeSalida.ts`).
- **Las hojas del celular** (`BottomSheet`) aceptan `hayCambios`; "atrás" de
  Android las cierra con una sola entrada de guardia en el historial (React
  monta dos veces en desarrollo: una entrada por hoja hacía que "atrás"
  saliera de la app). Un componente que envuelve una hoja no tiene que
  devolver `null` al cerrarse: se guarda lo último que mostró y deja que la
  hoja baje animada.

Verificado: `tsc` de las dos apps, 514 pruebas, 98 contra el emulador, 33
casos de interfaz de escritorio y 18 de la PWA, las tres auditorías y el
build del celular. Encontrado para la Fase 2: ClientesView y VentasView
arman el enlace de WhatsApp anteponiendo "505" a mano, y eso rompe los
números extranjeros (deberían usar `telefonoWhatsapp()` de `@core/telefono`).

**Publicada como `v2.16.4` el 1 de octubre**, a pedido de Joswill, junto con
el formato de datos de abajo (`04d105a`): commit `980cb9a`, release con
`latest.yml` verificado (sha512, tamaño y versión; es la "Latest") y la PWA
en los dos sitios sirviendo el build nuevo. **Se compiló y se probó en un
worktree limpio en ese commit, no en el árbol de trabajo**: había otras dos
sesiones con cambios sin commitear en el mismo árbol (la vibración del
iPhone y "Fue un error"), y un `build:exe` o un `deploy:mobile` desde ahí
los habría publicado sin que nadie los aprobara. El push se hizo por SHA
(`git push origin 980cb9a:master`) por lo mismo: el master local ya tenía
encima el commit de la vibración, que sale aparte como 2.16.5.

### La vibración en iPhone: la `v2.16.5` (1 de octubre)

Joswill la probó en un iPhone 14 y no vibraba nada, ni con "Probar la
vibración". `mobile/src/lib/haptics.ts` alternaba por código un
`<input type="checkbox" switch>` escondido, y desde iOS 26.5 (WebKit bug
309082) un click por código le llega al interruptor como no confiable y no
vibra. Sólo vibra un toque real del dedo sobre el interruptor o su label. Las
pruebas pasaban porque contaban clicks, y no distinguían un dedo de un script.

Ahora, sólo en iPhone (sin `navigator.vibrate`, con `switch` y con pantalla
táctil), `instalarHapticos()` (llamada en `mobile/src/main.tsx`) pone dentro
de cada `<button>` un `<label data-capa-haptica>` transparente, conectado a un
interruptor escondido. El dedo toca el label y el botón recibe una copia del
click. Si durante esa copia se llama a `haptics.*`, el label alterna el
interruptor y el teléfono vibra; si no se llama, se cancela. En iPhone es un
solo toque, siempre igual, y lo que se pida después de un `await` no vibra.
En Android y en Windows no se instala nada. `tests/haptics.test.ts` simula la
regla de iOS 26.5: sólo vibra un click `isTrusted`.

**Publicada como `v2.16.5` el 1 de octubre**, en las dos apps aunque Windows
no cambia: Joswill prefirió que cada versión siga teniendo su release. Commits
`a6ea6c1` y `712d8d5`, desde un worktree limpio en `origin/master` y con push
por SHA (4e tenía "Fue un error" sin commitear en el árbol). Release con
`latest.yml` verificado y la PWA en los dos sitios sirviendo el build nuevo.
**Falta probarla en el iPhone de verdad**: que vibre, que ningún botón se
active dos veces y que se pueda deslizar empezando el dedo sobre un botón.

### Limpieza de datos y formato al guardar (30 de septiembre)

Pedido de Joswill después de revisar los datos de producción: sacar lo que
nunca pasó y que lo que se escribe en un formulario se guarde con un solo
formato. **En producción** (un commit REST con condiciones, 68 escrituras,
respaldos `antes-de-limpiar-2026-09-30b.json` y
`despues-de-limpiar-2026-09-30.json`): se borraron V-0007, V-0021 y la
clienta duplicada #17 (las tres se habían vuelto a cargar bien como V-0018 y
V-0022), los restos de V-0001, el abono anulado de José Linarte, la entrada
huérfana de P-0014, los eventos de "Camisa X" y `conexion_prueba`, cada uno
con sus pagos, movimientos y eventos. Se corrigieron los teléfonos, "Steve
Maddem" → "Madden", la ciudad de Fryda, la línea 15 de PQ-0001 (apuntaba a
una talla borrada), la hora de 7 pagos iniciales, y el contador de productos
vuelve a P-0024. El dinero no se movió: 18 ventas, $157.07 cobrado, $335.93
por cobrar, bodega $37.95, costo vendido + bodega = $370.16. **En el código**
(`04d105a`): `core/formatos.ts`, aplicado por los repositorios: teléfono
`+505 8601 2442` (o `+1 504 463 6250`), y uno que no encaja se rechaza;
nombres de persona con mayúscula inicial; productos arreglados sólo si
vienen todo en minúscula o todo en mayúscula; tallas en mayúscula. Buscar
un número compara sólo dígitos, y el pago inicial guarda `creado_en`. Lo
que falta de WhatsApp con números extranjeros y la convivencia con
`shared/formatoTexto.ts` están en
[PLAN_EQUIVOCACIONES_Y_FORMATOS.md](PLAN_EQUIVOCACIONES_Y_FORMATOS.md).

### "Fue un error": publicado en la `v2.17.0` (2 de octubre)

Pedido de Joswill: *"si fue un dato mal ingresado o erróneo por confusión me
parece desordenado que se quede ahí guardada y de forma visible"*. Commit
`9ed2237`. **Anular** sigue siendo para lo que pasó y se deshizo (devolución,
reembolso, no se consiguió) y queda en el historial. **"Fue un error"** borra
lo que nunca pasó: la venta, sus abonos, sus movimientos y sus eventos, y
cada unidad vuelve a su lote exacto. Una sola puerta: "Anular" pregunta qué
pasó.

- La regla, en `core/borrado.ts`: hasta una semana desde que se cargó, del
  mes en curso, sin abonos de otro día y sin piezas de encargo compradas.
- Cómo, en `repositories/borrado.repo.ts`: anula por el camino de siempre y
  después barre. Pide el PIN del negocio, y el contador vuelve atrás si era
  el último número. No necesita índices nuevos.
- **`firestore.rules` cambió**: un movimiento de inventario se puede borrar
  sólo si su venta ya no existe al terminar el lote (`existsAfter`). **Se
  despliega antes que el código** (sección 5, "Publicar").
- Se decidió no ofrecer "Deshacer" después de borrar: volver a sacar las
  unidades de sus lotes puede chocar con una venta hecha en el medio.

Verificado: `npm test` (38 archivos), emulador 100, las dos suites de
interfaz aprobadas con un caso nuevo cada una, y las tres auditorías. El
detalle, y lo que queda para la Fase 6 ("Unir con…" para clientas
duplicadas, "Ver anuladas"), está en el
[PLAN_EQUIVOCACIONES_Y_FORMATOS.md](PLAN_EQUIVOCACIONES_Y_FORMATOS.md),
sección 3.

### Fase 2 de la auditoría: publicada como `v2.17.0` (2 de octubre)

**Publicada el 2 de octubre**, a pedido de Joswill, junto con "Fue un error":

- Primero las reglas: `npx firebase deploy --only firestore:rules`.
- Versión `2.17.0` en `b47d21f`, compilada y probada (`tsc` de las dos apps
  y `npm test`, 586) en un worktree limpio en ese commit. Las suites de
  interfaz y del emulador habían pasado el día anterior sobre el mismo código.
- Push por SHA (`2890444..b47d21f`).
- Release `v2.17.0`, la "Latest": borrador sin archivos, el exe solo y
  después el blockmap y `latest.yml`, y publicada. Lo que lee el actualizador
  (`releases/latest/download/latest.yml`) dice 2.17.0, con el sha512 del exe
  y 106.170.381 bytes, que es lo que pesa la descarga.
- La PWA en los dos sitios (`glow-heaven-db-app` y `glow-heaven-movil`)
  sirve el build nuevo (`assets/index-LQHtbUTA.js`).

El código es `481d24a` ("Fase 2 de la auditoría: un solo abono, lo pagado en
su moneda y un solo WhatsApp").

**Qué quedó hecho** (todos los IDs de la Fase 2 del informe). Lo que hay que
saber para no deshacerlo:

1. **Un solo abono en Windows** (TRA-02, TRA-11, COB-03 a 07, COB-23, CLI-01
   a 04, PAG-01 a 09, ENC-19). `components/PagoModal.tsx` tiene dos modos:
   `venta` ("a esta venta", desde Ventas, Encargos y "Abonar" de una fila de
   Cobros) y `cuenta` ("a la cuenta de la clienta", desde "Registrar abono"
   de Cobros, con la clienta a elegir, y desde la ficha de Clientes, con la
   clienta dada). Cobros y la ficha ya no tienen formulario propio. El modo
   `cuenta` muestra, antes de registrar, a qué ventas va la plata y cómo
   queda cada una. La moneda se elige con `components/TarjetasMoneda.tsx`
   (también en Corregir abono y en Aceptó); si el monto sigue siendo el
   sugerido, se convierte al cambiar de moneda (`montoSugerido`). Arranca
   con la moneda y el método de Configuración, dice la equivalencia, pide
   "Cancelar", tiene Deshacer, y el visto verde sólo aparece si queda
   saldada. Corregir un abono desde Cobros o desde Clientes recibe la venta
   y dice cómo queda. `Select` (`ui/Field.tsx`) pasa `ref`, como `Input`.
2. **El reparto de un abono a la cuenta** vive en `core/reparto.ts`
   (`repartirAbono`): la más vieja primero, y en la moneda en que pagó (en
   córdobas, contra lo que se debe en córdobas de cada venta, con su tasa).
   Lo usan la ventana, `PagosRepo.registrarAbonoCliente` y el mock: lo que
   se ve es lo que se registra. **Arregla un error de plata**: con dos
   ventas de tasas distintas, un abono de C$2,500 quedaba registrado como
   C$2,519.28. Cada parte lleva en sus notas "Parte de un abono de …".
3. **Lo pagado, en la moneda en que se pagó** (TRA-05, ENC-02, ENC-03,
   VEN-03, DOC-02, CFG-05): `textoPagadoDeVenta` (`core/abonos.ts`) en la
   ventana de abono, anular y borrar una venta (el menú de la fila ahora
   carga la venta entera), el panel de Ventas, Encargos, Aceptó, Anular
   encargo, y la factura y la proforma ("Abonado", "Anticipo Abonado"). Las
   planillas de Configuración salen de `columnasVentas` y `columnasAbonos`
   (`core/exportar.ts`): un abono dice en qué moneda entró, cuánto en esa
   moneda, su equivalente, la tasa y quién lo registró; estados y métodos
   en palabras.
4. **La tasa de la venta** (TRA-04, VEN-02, COB-09, CEL-15, BAS-18): `Money`
   acepta `tasa_cambio_cents` (sin ella usa la de hoy, que es para lo
   nuevo) y escribe "≈" en todos sus formatos; `MoneyDual` también.
   `cordobasQueSeDeben` (`core/mensajes.ts`) suma venta por venta, cada una
   con su tasa: la usan la ficha de Clientes, su "Enviar WhatsApp" (que
   ahora lee las ventas de la clienta) y los totales de Cobros del celular.
5. **Un solo WhatsApp** (TRA-03, INI-02, CLI-05, CVE-03, CVE-04, CCO-05,
   CCO-17, CCA-01, DOC-07, ENC-22): todos los mensajes a las clientas salen
   de `core/mensajes.ts`, de tú (decisión de Joswill), con los córdobas de
   la venta, "≈" y el código de país de Configuración (`enlaceMensaje`). En
   Windows, `lib/whatsapp.ts` (`enlaceCobro`). Compartir un producto dice
   qué tallas o tonos hay, no cuántas unidades (decisión de Joswill). La
   plantilla de cobro vieja, sin "≈", se lee como la nueva si nadie la
   cambió. **Mandar un documento** es un solo camino (`lib/mandarDocumento.ts`):
   guarda el PDF en Documentos/Glow Heaven/Cotizaciones o Facturas, abre la
   carpeta y abre el chat, desde "Mandar la cotización" y desde el botón
   WhatsApp de la Factura o la Proforma. El canal `prepararCotizacion`
   acepta `carpeta`. Si la clienta no tiene teléfono, "Mandar la cotización"
   deja escribirlo y lo guarda en su ficha; sin teléfono, WhatsApp se abre
   para elegir el chat.
6. **Celular** (CCO-02 a 04, CCO-06, CCO-07, CVE-07, CEL-03, CEL-04): la
   hoja de abono arranca con la preferencia de Configuración, tiene fecha,
   equivalencia y "cómo queda", dice los errores en el campo, confirma una
   sola vez (la pantalla de éxito, sin aviso flotante) y ofrece "Deshacer el
   abono". Vender arranca con la preferencia, confirma una vez y ofrece
   "Deshacer la venta", que devuelve el carrito como estaba. `Snackbar`
   tiene `mostrarDeshacer` (corregir un abono o una venta, anular desde el
   Historial o desde Abonos); los errores duran 8 s y el tiempo se para
   mientras se toca el aviso o la app está oculta. La hoja "Abonos" es de la
   venta (sus abonos, "Debe de V-…", "Abonado a V-…") y después de anular
   pregunta "¿Cargar el abono correcto?" en vez de abrir otra hoja.
7. **Avisos de Windows** (BAS-03): el tiempo se para con el mouse encima y
   con la ventana oculta (`ToastContext`, un solo intervalo).

**Pruebas ejecutadas el 2 de octubre**, sobre el árbol que quedó en
`481d24a`:

- `npx tsc --noEmit` y `npx tsc -p mobile/tsconfig.json --noEmit`: sin errores.
- `npm test`: 41 archivos, 586 pruebas. Nuevas: `tests/fase2-mensajes.test.ts`,
  `tests/fase2-pagado.test.ts`, `tests/fase2-reparto.test.ts`, y
  `tests/whatsapp.test.ts` actualizada.
- `npm run test:emulador`: 17 archivos, 102 pruebas. Nueva:
  `tests/motor-real/fase2-auditoria.test.ts` (vista previa = lo registrado,
  y que en córdobas se registra lo pagado).
- `npm run test:interfaz-escritorio`: 41 casos, aprobado. Nuevos: TRA-03,
  TRA-05, TRA-02, CLI-01, PAG-02, BAS-03, y ENC-22 con DOC-07.
- `npm run test:interfaz`: 24 casos, aprobado. Nuevos: TRA-03 del celular,
  CCA-01, CCO-02 a CCO-04, y CCO-06 con CCO-07. Los dos últimos van antes
  de los casos del Historial a propósito: esos cancelan V-0001 y Ana deja
  de deber.
- `npm run build:mobile`, con las auditorías de colores, índices y hooks.
- Cada caso nuevo se vio fallar con el código anterior: en un worktree
  limpio en `89969b0` con sólo las pruebas nuevas, o con un stash del
  archivo cuando no dependía de otros.
- **No se hizo**: `build:exe`, desplegar, ni probar a mano en la app de
  Windows o en un teléfono.

**Lo que falta**:

1. **Probar a mano en la app de verdad** (no lo cubren las pruebas): en
   Windows, que "Enviar WhatsApp" del menú de Clientes y el WhatsApp de la
   Factura abran el chat (los dos llaman a `window.open` después de un
   `await`; en Electron lo recibe `setWindowOpenHandler`); en el teléfono,
   Deshacer después de un abono y de una venta.
2. ~~Publicar~~: hecho, `v2.17.0`.
3. **Lo que sigue es la Fase C1** (abajo y en el apartado "Para seguir"),
   después C2 a C4 y después las fases 3 a 6 del informe.
4. Pendiente de antes: probar la vibración en el iPhone (la 2.16.5).

**Archivos que tocó la fase** (todos en `481d24a`, ninguno a medio hacer):
en el núcleo `core/mensajes.ts`, `core/reparto.ts`, `core/abonos.ts`,
`core/exportar.ts`, `core/documentos/plantillas.ts`; en Windows
`PagoModal`, `TarjetasMoneda`, `CorregirPagoModal`, `AnularOBorrar`,
`DocumentoModal`, `ui/Field`, `ui/Money`, `ToastContext`, `lib/whatsapp`,
`lib/mandarDocumento`, `mock-api`, y las vistas Clientes, Cobranza,
Configuración, Encargos (con Aceptó y Mandar cotización), Panel, Ventas
(con Anular encargo y el editor); en el celular `AbonoModalSheet`,
`AbonoSelectorSheet`, `Corregir*Sheet`, `DetalleCobroSheet`,
`FichaProductoSheet`, `KardexClienteSheet`, `MoneyDual`, `Snackbar`, y las
vistas Cobranza, Historial y Vender; el canal de documentos (`main/ipc`,
`preload/api`, `shared/ipc-contracts`) y `pagos.repo.ts`.

**El emulador quedó apagado** (lo había levantado esta sesión). Se vuelve a
levantar con `npm run emulador` en otra terminal.

### El plan desde el 2 de octubre: el celular primero

Joswill pidió sumar al plan lo que le falta al celular, que es lo que más
usa Ross, y resolver las alertas de agotados que llenan Inicio ahora que el
primer paquete (PQ-0001) está casi vendido. Quedó acordado en
[superpowers/specs/2026-10-02-fases-del-celular-design.md](superpowers/specs/2026-10-02-fases-del-celular-design.md)
y metido en la sección 5 del informe de la auditoría, entre la Fase 2 y la
Fase 3:

1. **C1 · Inventario por paquete**: sin alertas de agotados; cada paquete
   muestra su avance, se cierra solo cuando vende su última unidad y
   muestra un resumen; "Llegó un paquete" en el celular.
2. **C2 · Inventario y encargos en el celular**: la pestaña "Catálogo" pasa a
   "Inventario"; cambiar un precio; encargos (anotar, cotizar, mandar con
   PDF, "Aceptó"), sin pestaña propia.
3. **C3 · Sin internet: consultar**, sólo celular.
4. **C4 · Sin internet: operar**, sólo celular, con la cola y el
   `operacion_id`.

Las decisiones de Joswill están en la cabecera de ese documento. Las que
importan para no equivocarse: la sección de productos se llama
**Inventario** en las dos apps; en el celular **no** se editan fichas ni se
ajustan existencias; el paquete se carga **cuando llega**, de una vez; sin
internet es **sólo el celular**.

**Para empezar C1**: el plan está en
[superpowers/plans/2026-10-02-c1-inventario-por-paquete.md](superpowers/plans/2026-10-02-c1-inventario-por-paquete.md), con T1 (núcleo) primero y T2
(Windows), T3 y T4 (celular) en paralelo después. **Codex coordina y Claude
ejecuta**: Codex asigna cada tarea y revisa la entrega antes de que Joswill
la apruebe, y una sesión de Claude no empieza código de C1 sin una tarea
asignada. El dato del que depende todo (cada lote sabe de qué paquete vino, y
cada línea de venta de qué lotes salió) se comprobó sobre producción el 2/10.
Codex tiene un worktree propio (`.codex/worktrees/coordinacion-agentes`) con
su plan del puente de revisión, sin commitear.

### Hecho el 29 de septiembre, sobre producción: V-0007 borrada a mano

V-0007 (29/9) se borró desde la consola de Firebase para corregir una venta
con productos equivocados. Borrar el documento no deshace la venta: Polvo Rosa
Nine West, Combo Gloss Paris Hilton y Blush de Elf quedaron con una unidad
menos (dos en "agotado"), y su pago de C$600.00 siguió contado como cobrado.
Se reparó con `scripts/reparar-venta-borrada.ts` (ensayo, después `--aplicar`,
en un commit con condiciones): V-0007 existe otra vez, anulada, sus tres
unidades volvieron a sus lotes y el pago quedó anulado (Joswill: no fue real).
Respaldos antes y después en `respaldos/`. V-0001, una venta anulada del 17/9
que también se había borrado, se deja así por decisión de Joswill: ya estaba
compensada.

La salida de fondo es poder **corregir** una venta y un abono desde las dos
apps: hecho en local para la 2.16 (`VentasRepo.corregir`,
`PagosRepo.corregir`; P0 de arriba). De paso apareció un error de antes: la
lista de abonos recientes decía "Cliente" en todos, porque buscaba el nombre
en la venta, que no lo guarda.

### Hecho el 26 de septiembre, sobre producción

- **Los datos quedaron en el flujo de lotes**, con
  `scripts/migrar-a-lotes.ts` (ensayo, después `--aplicar`, en un commit con
  condiciones previas). Cada línea de PQ-0001 es su lote; las tres ventas
  activas guardan de qué lote salieron (V-0001 está anulada). Cambiaron sólo
  `productos.lotes` (22) y `ventas.lineas` (3): la bodega sigue en $278.77, y
  PQ-0001 dice "Te dejó hasta hoy $27.61". El Pack de Calzones Calvin Klein
  vino en una línea de 6 y hoy está en dos tallas: quedó en `pq1-l12` y
  `pq1-l12-t2`, 3 y 3. No había encargos.
- **La 2.14 se probó en la app instalada contra la base real**, con datos
  "Prueba": 15 de 15 bien (lotes, venta del lote viejo y su anulación, "Ya lo
  compré", no entregar con una pieza en camino, anular con la pieza llegada
  a la bodega y quedarse el anticipo). Se limpió como dice la sección 6 y la
  base volvió a quedar idéntica (136 documentos, cero diferencias).
- La migración perezosa de la app sigue ahí para lo que el script no toque:
  un producto sin lotes recibe su lote "Anterior" la primera vez que se lo
  usa.

### Hecho el 24 de septiembre, sobre producción

- **PQ-0001 tiene su contenido**: 22 productos, 45 unidades, $273.98 + $19.18
  + $77.00 = $370.16, el número que se esperaba. La bodega no se movió
  ($278.77 ese día, después de cuatro ventas).
- **No había precios que revisar**: los 22 productos tienen precio escrito a
  mano, y la app no toca un precio que ella decidió. Por eso el precio sin
  flete (H6) y el que saltaba al vender (H7) nunca le llegaron. Ninguno queda
  debajo del costo; el de menor margen es el Pack de Calzones Calvin Klein M
  ($7.41 → $8.00, 8%).
- 17 de sus movimientos de entrada guardaron el precio sin impuesto (se
  cargaron antes del recosteo del 16). La reconstrucción no los usa: toma el
  costo base del producto, que es el correcto.

### Encargos viejos que hayan quedado cotizados: no hay

Hasta `v2.12` un encargo creado con el anticipo completo nacía `COTIZADA`
(se miraba "saldo en cero"); los nuevos nacen `PENDIENTE`. Al 24 de
septiembre producción no tiene ningún encargo (las cuatro ventas son de
inventario), así que no quedó ninguno mal clasificado.

### P2: `productos.listar` no tiene tope

[`productos.repo.ts`](../src/main/firebase/repositories/productos.repo.ts)
se trae todos los productos sin `limit`. Con 22 no se nota.

### P3: archivado en frío (etapa 5)

Explícitamente pospuesto por ella: *"recién cuando pasen años"*. No lo empieces
sin que lo pida.

---

## 4. Las trampas que ya cobraron su precio

Cada una de estas costó una sesión. No hace falta repetirlas.

**En iPhone, la vibración sólo sale de un toque real.** Desde iOS 26.5, nada
que se dispare por código, con un temporizador o después de un `await` vibra,
aunque las pruebas pasen. No se arregla volviendo a alternar el interruptor
por código: la capa de `mobile/src/lib/haptics.ts` es el único camino, y sólo
cubre `<button>`. El WebKit de Playwright en Windows no trae `switch` y dice
`maxTouchPoints` 0, así que para probar la capa ahí hay que definir esas dos
propiedades con `add_init_script`.

**Una app instalada antes de la 2.16.4 guarda el teléfono como se escriba**,
y su buscador no encuentra "86012442" en "+505 8601 2442" (sí "8601 2442").
Mientras quede alguna sin actualizar puede entrar un teléfono sin formato:
después de que se actualicen, conviene una pasada de sólo lectura por las
clientas.

**Con otras sesiones trabajando en el mismo árbol, se publica desde un
worktree limpio** en el commit exacto (`git worktree add --detach <dir>
<sha>` y un enlace a `node_modules`), y el push va por SHA. Compilar o
desplegar desde el árbol de trabajo publica lo que otra sesión tiene a
medias. Antes de borrar el worktree, sacá el enlace a `node_modules`: un
borrado recursivo que lo siga vacía el `node_modules` de verdad.

**Los índices de Firestore no fallan a medias.** Si falta el índice compuesto,
Firestore rechaza la consulta entera y la pantalla queda en blanco. Y **el
emulador no los exige**: una consulta sin índice pasa verde local y revienta en
producción. Los índices se despliegan y quedan `READY` **antes** de que salga el
código que los usa. `npm run auditar:indices` lo revisa.

**Invitar a alguien no le da acceso.** El acceso se reclama al entrar, y hay
**cuatro puertas**: el login móvil, el login de Windows, `AUTH_GET_USER`, y el
arranque de `src/main/index.ts` (que restaura la sesión sin pasar por el canal
IPC). Ya pasó que se arregló en una sola y el usuario quedó bloqueado en
producción. Si tocás el acceso, revisá las cuatro.

**El acceso tiene tres estados, no dos.** `autorizado | sin-permiso |
sin-conexión`. Con un booleano, estar sin internet se veía igual que estar
expulsado.

**Las migraciones tienen que ser idempotentes.** Una que no lo era corrió dos
veces y dejó la bodega en $447.18 sin que entrara nada. Todo script que escriba
en producción se corre primero en ensayo y se mira la lista completa.

**No encadenes `grep` después de `vitest`.** El éxito del `grep` tapa el fallo
de la prueba. Ya se hizo un commit en rojo por eso. Si vas a filtrar la salida,
`set -o pipefail`.

**El `release:windows` falla con `EPERM` sobre `dist`.** No es un permiso de
Windows: es que algún proceso viejo tiene esa carpeta como directorio de
trabajo, casi siempre un `python -m http.server` que quedó de una sesión
anterior. Se reconoce porque el contenido de `dist` se puede renombrar y la
carpeta en sí no. Buscá el proceso y cerralo; no borres a la fuerza. La causa
era `test:interfaz-escritorio`: con `shell: true`, `kill()` mataba la consola
y dejaba vivo al Python. Desde `v2.12` los dos corredores de interfaz cierran
el árbol entero con `taskkill /T`.

**Las fechas son de Managua, no UTC.** `src/core/fechas.ts`. Un arnés de
pruebas que usaba UTC sembraba "mañana" después de las 6 de la tarde, y parecía
error de la aplicación cuando el equivocado era el arnés.

**La búsqueda ignora acentos** (NFD + quitar diacríticos), pero **la ñ se
respeta a propósito**. `src/core/texto.ts`, usado en los 26 lugares donde se
busca.

**Tailwind**: `p-4.5` no existe. La escala va 3, 3.5, 4.

**El simulador del navegador (`mock-api.ts`) tiene que devolver copias.** Su
lista de productos devolvía el mismo arreglo que modificaba en el lugar, y
React no veía un producto recién creado: la pantalla de prueba mostraba un
error que la app real (por IPC, que siempre manda un arreglo nuevo) no tiene.

**Los fuentes están en CRLF** (`core.autocrlf=true`). Un script que compare
texto tiene que sacar los `\r` antes y devolverlos al escribir, o no
encuentra nada.

**Abrir la app instalada desde la terminal de VS Code falla en silencio.**
VS Code le pasa `ELECTRON_RUN_AS_NODE=1` a sus terminales, y el ejecutable
arranca como Node puro: sale con código 0, sin ventana y sin error. Hay que
lanzarlo con la variable vacía (`$env:ELECTRON_RUN_AS_NODE = $null`). Para
manejarla con Playwright: `--remote-debugging-port=9223` y
`connect_over_cdp`.

**El PIN lo escribe una persona.** La sesión de Google queda guardada entre
arranques, pero el PIN se pide cada vez que abre la app. No se busca ni se
saca de ningún lado: se le pide a Joswill que lo escriba en la ventana.

**Nunca se borra una venta, un pago ni un movimiento desde la consola de
Firebase.** El documento se va, pero lo que hizo se queda: las unidades fuera
de sus lotes, el pago contado como cobrado. Se anula (o, desde la 2.16, se
corrige) desde la app; y lo que nunca pasó se borra con "Fue un error", que
barre todo lo suyo (`9ed2237`). Si ya pasó, `scripts/reparar-venta-borrada.ts`.

**El Firestore falso es demasiado rápido para probar el deshacer.** Deshacer
rechaza un grupo si el documento cambió DESPUÉS del evento que lo restaura, y
lo decide comparando instantes. En el falso todo cae en el mismo milisegundo
y ese control nunca salta: aceptar antes de pagar pasaba las pruebas y
rompía el deshacer en la app. `tests/encargos-fases.test.ts` deja pasar 3 ms
después de cada evento; una prueba de deshacer nueva que mezcle dos
escrituras sobre el mismo documento tiene que hacer lo mismo.

**Actividad, en el celular, es una pantalla entera: no tiene la barra de
abajo.** Una prueba de interfaz que ya está ahí no encuentra "Inicio"; si el
filtro ("Ventas", "Abonos") está a la vista, se usa directo
(`abrir_actividad` en `tests/interfaz/pruebas.py`).

**`npm run test:emulador`, no `vitest` a secas.** El script arma el entorno
(las direcciones del emulador de Auth y de Firestore); sin él, todo falla
con "Missing or insufficient permissions" y parece un problema de reglas.

**Para mirar el paquete construido, `python -m http.server --directory dist`
desde la raíz.** Con `cd dist`, el proceso queda con `dist` como directorio de
trabajo y el siguiente build falla con `EPERM` (la trampa de más abajo). Y al
terminar, cerrarlo: en Windows, detener la tarea que lo lanzó no cierra a sus
hijos (pasó también con el emulador: hubo que cerrar el `java` y el `node` a
mano).

**Un foco con `setTimeout` en un formulario le roba el cursor a lo que ya se
está escribiendo.** Pasó en "Nuevo encargo" (50 ms): Escape mostraba "¿Descartar
lo que escribiste?" y el foco saltaba de vuelta al campo de la clienta. El
foco inicial va con `autoFocus`, que actúa cuando el campo aparece.

**Cerrar el panel lateral en el mousedown mueve la tabla bajo el cursor.** Con
el detalle abierto, tocar otra fila lo cerraba en el mousedown; la tabla se
ensanchaba, las filas subían, y el click caía en otra parte: dos clics para
cambiar de encargo. La tabla de encargos tiene `data-ignorar-afuera`. La de
ventas todavía no (se revisa con sus formularios, en la 2.20).

**Una prueba en verde a la primera no demuestra nada.** Las de
`tests/paquete-como-entrada.test.ts` se validaron sembrando diez errores de
vuelta, uno por uno: cada uno hizo fallar al menos una. Una de las pruebas no
detectaba lo que decía cuidar hasta que se le cambió el caso.

---

**La interfaz se limpió de texto el 24 de septiembre (`v2.13.0`).**
No vuelvas a meter lo que se sacó: subtítulos que repiten el título, un
párrafo de ayuda debajo de cada campo, íconos en cajitas de color, tres
botones de texto en cada fila, córdobas al lado de cada precio de una tabla.
Las reglas que quedaron:

- El título de la pantalla está en la barra de arriba. La vista no lo repite:
  arranca con el conteo y la acción principal.
- Una ayuda debajo de un campo sólo si responde una duda que el campo no
  resuelve ("A $7.00 la libra" sí; "Opcional" va como placeholder).
- Cada fila de tabla tiene un solo botón visible, el menú "⋮"; tocar la fila
  abre el detalle, que tiene todas las acciones.
- Lo que se usa de vez en cuando se pliega ("Más costos" en el paquete).
- Movimiento corto y sólo donde informa: lo que se ve decenas de veces al día
  (cambiar de pantalla, pasar el mouse) casi no se anima.
- Las pruebas buscan los campos por su `aria-label`, no por el texto de
  ayuda, para que acortar un texto no rompa una prueba.

## 5. Cómo se verifica

Las dos suites hacen falta. La de unidad prueba las fórmulas; la del emulador
prueba que Firestore de verdad acepte lo que el código le manda.

```bash
npm run typecheck              # 0 errores, sin excepción
npm test                       # 514 pruebas, 36 archivos
npm run test:emulador          # 98 pruebas contra el emulador de Firestore
npm run test:interfaz          # la PWA, con Playwright
npm run test:interfaz-escritorio
npm run auditar:colores        # ningún par fondo/texto ilegible
npm run auditar:indices        # toda consulta tiene su índice
npm run auditar:hooks          # ningún hook detrás de un return temprano
npm run probar:produccion      # las consultas reales contra producción, de sólo lectura
```

`probar:produccion` incluye una consulta de control que **no** tiene índice y
que tiene que ser rechazada. Si esa pasa, el arnés no está probando nada.

### Publicar

```bash
npm run deploy:mobile          # PWA a los dos sitios de Firebase Hosting
npm run release:windows        # instalador NSIS + GitHub Release
```

**Si la versión lleva `9ed2237` ("Fue un error") por primera vez**, antes de
todo: `npx firebase deploy --only firestore:rules --non-interactive`. Sin la
regla nueva, borrar falla al llegar a los movimientos y la venta queda
anulada. Las apps de antes no borran movimientos, así que desplegarla antes
no les cambia nada.

Para forzar la actualización de Windows en una máquina: descargarla
(`window.api.actualizador.verificarManual()` por CDP) y **cerrar la app**, que
la instala en silencio al cerrarse. Hasta la 2.15.0, "reiniciar e instalar"
abría el asistente del instalador y se quedaba esperando.

Si `deploy:mobile` falla con "Your credentials are no longer valid" (la sesión
de la CLI de Firebase vence y renovarla pide el navegador), la PWA se publica
con la sesión de `gcloud`: `npm run build:mobile && node
scripts/desplegar-movil.mjs`. Usa la API REST de Hosting con la misma
configuración de `firebase.json`.

**`release:windows` casi siempre falla al final con `GitHub Personal Access
Token is not set`.** No exportes el token a una variable de entorno; Joswill ya
rechazó eso. Lo que hay que saber:

1. El `.exe` **sí se compila**. Lo que no se llega a escribir es `latest.yml`,
   que queda con la versión anterior. Ese archivo es el que lee el actualizador
   automático de la app instalada, así que publicar el exe sin regenerarlo deja
   a la clienta sin actualización y sin ningún error visible.
2. Se arregla con `npx electron-builder --publish never`, que reempaqueta y
   escribe `latest.yml` bien.
3. Antes de subir, comprobá que el `sha512` y el tamaño de `latest.yml`
   describan **ese** exe. Si no coinciden, el actualizador rechaza la descarga.
4. Se sube con `gh release create`, y los archivos hay que copiarlos con
   **guiones** (`Glow-Heaven-Manager-Setup-X.Y.Z.exe`), porque así los nombra
   `latest.yml`. En `release/` están con espacios.
5. Mirá siempre con `gh release view vX.Y.Z` si ya existe antes de reintentar,
   o vas a terminar con dos.

---

## 6. Probar sobre la base real, sin dejar rastro

Joswill autorizó crear datos de prueba en producción y borrarlos después. Así
se hizo el 24 de septiembre, y la base quedó idéntica documento por documento:

1. `node scripts/respaldar-produccion.mjs respaldos/antes-de-probar.json`.
2. Probar con productos y clientas cuyo nombre empiece con **"Prueba "** (la
   ficha lo escribe "Prueba Gloss"). **Nunca** reponer ni vender productos
   reales: borrar el paquete después no les devuelve el costo ni el precio.
3. Otro respaldo y `node scripts/comparar-respaldos.mjs antes.json
   despues.json plan.json`. Clasifica como de prueba sólo lo que cuelga de
   esos nombres. Si algo sale **sin clasificar**, no se limpia: puede ser
   trabajo real de ella.
4. Borrar en **un** commit de la API REST, con `currentDocument.updateTime`
   en cada escritura (si alguien tocó algo en el medio, se rechaza entero), y
   restaurar `_secuencias` para que la numeración de ella no salte.
5. Un último respaldo y comparar contra el primero: tiene que dar cero
   diferencias.

Lo que encontró esa prueba y ninguna suite había visto: el panel mostraba
números de antes de una venta durante 20 segundos (2.12.1); ajustar
existencias inventaba centavos, pasar un producto de precio a mano a margen lo
dejaba a costo, y un paquete podía quedar sin fecha (2.12.2).

Esos arreglos se volvieron a probar en la 2.12.2 instalada, con datos nuevos:
24 de 24 bien, incluida una corrección de flete con parte del paquete ya
vendida (a la bodega le entra sólo lo que sigue ahí). Después se limpió igual
que antes y la base volvió a quedar idéntica.

---

## 7. Cómo trabajar con Joswill

Él construye esto **para una clienta**, no para sí mismo. Lo que se muestre en
pantalla es lo que ella va a leer para tomar decisiones de plata.

- **Los datos que se muestran son lo más importante.** Sus palabras: *"quiero
  que seas sumamente cuidadoso con los datos que muestras, esos son los que se
  leen y son los más importantes, revisá cada uno"*. Un número mal no es un bug
  cosmético.
- **Las fórmulas tienen que ser visibles y comprobables a mano.** *"esta
  herramienta debe mostrar datos exactos y las fórmulas usadas y los datos
  ingresados en cada fórmula deben ser limpios y claros"*.
- **Nada de cálculos escondidos.** Si un número sale de otro, se calcula solo y
  se explica; no se edita a mano el resultado.
- **Resolvé, no consultes de a poco.** Cuando el camino está claro, el trabajo
  se termina completo y después se informa. Preguntar a cada paso lo que ya se
  explicó lo enoja, con razón.
- **Antes de dar algo por bueno, sembrá el error.** Una verificación que nunca
  se vio fallar no verifica nada. Es la disciplina que encontró casi todos los
  problemas reales de este proyecto.
- **Producción se toca con cuidado**: tiene permiso de escritura, pero *"sin
  exceder el límite de consultas diarias ni ningún límite establecido en
  firebase"*.
- **El token de GitHub no se exporta a una variable de entorno.** Usá `gh`, que
  maneja su propia sesión.

---

## 8. Errores que este proyecto ya cometió, para no repetirlos

No están acá para castigar a nadie. Están porque el patrón se repite.

1. **Se mostró una lista de 14 productos cuando eran 22**, por una salida
   cortada. Si vas a informar un total, contá los renglones.
2. **Se le informó un costo de bodega más bajo que el real**, primero $356.65,
   por olvidar el impuesto en los 17 productos que no eran packs. El número
   correcto era $370.16. Cuando un total no cuadra con el recibo del courier,
   el error está en la aplicación, no en el recibo.
3. **Se modificó directamente el costo unitario** en vez de dejar que se
   calculara. Él lo detectó en una captura de pantalla.
4. **El usuario encontró el bloqueo de acceso en producción, no el modelo.**
   Las cuatro puertas existían y sólo se arregló una.
5. **Se hizo un commit en rojo** porque el `grep` encadenado tapó el fallo.

El hilo común: cada uno se habría evitado mirando el resultado completo en vez
de la parte que confirmaba lo que ya se creía.
