# Contexto para empezar una sesión nueva

> **Para quién es esto**: el modelo o la persona que abre este proyecto sin
> haber estado en la sesión anterior.
> **Estado del árbol**: `v2.16.0` publicada en el celular y en Windows el 29
> de septiembre: los encargos por fases y corregir una venta y un abono en las
> dos apps (sección 2 y sección 3), y la `v2.16.1` el mismo día: el
> historial a la vista, quién registró cada cosa y los abonos en su moneda
> (sección 3). Joswill las está probando él mismo. Los datos de producción se
> migraron a lotes con `scripts/migrar-a-lotes.ts` (sección 3).
> **Última actualización**: 29 de septiembre de 2026.

Leé este archivo primero. Después:

- **[AGENTS.md](../AGENTS.md)** — las reglas que no se negocian (dinero en
  centavos enteros, español, colores, seguridad, los comandos de verificación).
  Es corto y hay que respetarlo entero.
- **[docs/CONTEXTO_TECNICO_IA.md](CONTEXTO_TECNICO_IA.md)** — el mapa de la
  arquitectura: monorepo, `src/core/`, contrato IPC, vistas. Escrito en `v2.2.8`,
  así que la estructura sigue valiendo pero los números y el costeo que describe
  ya no. Para el costeo mandá lo que dice acá abajo.

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

Después viene la 2.17 (encargos en el celular). Ojo: la quinta pestaña del
celular ya es Historial; "Encargos" necesita otro lugar (sección 2c del plan).
El orden completo está en la sección 0 del plan.

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
corrige) desde la app. Si ya pasó, `scripts/reparar-venta-borrada.ts`.

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
npm test                       # 299 pruebas, 27 archivos
npm run test:emulador          # 91 pruebas contra el emulador de Firestore
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
