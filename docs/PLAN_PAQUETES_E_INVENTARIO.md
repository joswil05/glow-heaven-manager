# Plan: el paquete como puerta de entrada del inventario

> **Para quién es esto**: Joswill, para decidir el rediseño antes de tocar
> código, y la sesión que lo implemente.
> **Estado del árbol cuando se escribió**: `v2.11.2`, sin cambios.
> **Fecha**: 24 de septiembre de 2026.

> **Estado: implementado en `v2.12.0`** (rama `paquetes-como-entrada`, sin
> publicar). Fases 0, 1 y 3 hechas; las fases 2 y 4 se resolvieron dentro de
> la app en vez de con un script contra producción (ver abajo). La fase 5
> queda como opción. Las cinco decisiones de la sección 7 se tomaron con la
> recomendación de cada una.
>
> **En qué se apartó la implementación de lo escrito:**
>
> - *Leer producción (fase 2)* → la app lo muestra sola. Inventario avisa qué
>   productos tienen un precio que no corresponde a su costo, y ella elige
>   cuáles aplicar. No hizo falta el permiso de lectura.
> - *Migrar PQ-0001 (fase 4)* → "Completar contenido", dentro de la app. Arma
>   las líneas con los movimientos de entrada y los campos heredados, las
>   muestra enteras y sólo con su OK escribe el paquete. No toca la bodega.
> - *Cotización sin anticipo (H13)* → un encargo pasa a ser deuda cuando cubre
>   el anticipo, no "cuando pague algo". Es la regla que ya usaban los abonos
>   para pasarlo a `PENDIENTE`, y con una sola regla no hay dos pantallas que
>   digan cosas distintas. Con anticipo del 0% nace confirmado.
> - *Correcciones*: una línea a la que no se le tocó el precio ni la exención
>   conserva su impuesto. Si no, corregir sólo el flete de PQ-0001 le movía 8
>   centavos de impuesto (su 7% se había redondeado por unidad).
> - *Productos nuevos en un paquete*: se crean dentro de la misma transacción
>   que lo pasa al inventario. Creándolos antes, dos clics a la vez dejaban dos
>   fichas gemelas; la suite del emulador lo detectó.

---

## 1. Lo que está pasando, en una página

La aplicación tiene **dos maneras de costear la mercadería** y las dos están
vivas al mismo tiempo:

- **La original**: el paquete con sus líneas. `costearPaquete` reparte el flete
  por peso y el impuesto por valor, al centavo, y al recibir el paquete cada
  línea entra al inventario con su costo aterrizado y el promedio ponderado se
  mueve solo. Está bien hecha y tiene pruebas, pero **no corre nunca**: el
  editor de paquetes manda `lineas: []`.
- **El parche de `v2.11`**: el paquete se anota sólo con peso y flete, los
  productos se cargan a mano desde Inventario con un `paquete_id`, y después el
  flete del paquete se reparte entre los productos que lo tienen anotado.

La segunda manera da por hecho que **un producto viene de un solo paquete**: el
producto guarda un `paquete_id`, un precio de tienda y un total de flete. En tu
negocio eso deja de ser cierto con el segundo paquete, porque lo normal es que
un producto que quedaba vuelva a llegar. En cuanto pasa, no hay ningún camino en
la aplicación que lo registre bien:

- **"Ajustar existencias"** sube las unidades con el costo viejo. El precio de
  tienda nuevo, su 7% y el flete del paquete nuevo no entran nunca.
- **Cambiar el paquete en la ficha y ajustar** hace algo peor: el reparto del
  flete se infla. En la reproducción, un paquete de $50 terminó repartiendo
  $110.

Y el precio de venta no sigue al costo: se calcula antes de que llegue el
flete y después cambia solo cuando se vende algo.

**La propuesta, en una línea**: que el paquete sea la única puerta por donde
entra mercadería, con sus líneas (qué producto, cuántas unidades, a qué precio
de tienda), que el 7% y el flete se calculen adentro del paquete y en ningún
otro lado, y que el producto guarde el costo promedio de todo lo que le entró.
Tu idea de unificar Inventario y Paquetes va en esa dirección; la sección 5.3
dice cómo.

---

## 2. Cómo se comprobó

Cada hallazgo de la sección 3 que tiene un número entre corchetes se
**reprodujo** con los repositorios reales contra el Firestore en memoria que usa
`npm test`. Cada prueba afirmaba el comportamiento correcto y **las trece
fallaron**, con los números que aparecen abajo. Antes de creerle a cada falla se
comprobó la cuenta a mano (por ejemplo, [4b]: $50 de flete × 22 unidades vivas ÷
10 anotadas = $110, que es lo que dio).

Las pruebas están guardadas fuera del repositorio. La fase 0 las convierte en
pruebas permanentes.

**Lo que no se pudo comprobar**: la lectura de producción quedó bloqueada por
los permisos de esta sesión. Donde un hallazgo depende del estado real de los
datos (por ejemplo, cuántos productos tienen hoy el precio sin flete) lo digo, y
la fase 2 es exactamente esa lectura.

---

## 3. Hallazgos

Ordenados por lo que le hacen a los números que ella lee. **Activo** quiere
decir que pasa hoy con el flujo que ella usa; **latente**, que está en el código
y se dispara si alguien toca el camino equivocado.

### A. El inventario y el costo (lo que describiste)

| # | Qué pasa | Reproducido | Dónde | Estado |
|---|---|---|---|---|
| H1 | Reponer un producto con "Ajustar existencias" le pone a las unidades nuevas el costo del paquete viejo. El flete del paquete nuevo se lo lleva entero lo que sí se cargó a ese paquete. | [4a] La bodega da **$17.21 de más**. El Labial carga $50.00 de flete; le tocaban $25.00. | [`productos.repo.ts:621`](../src/main/firebase/repositories/productos.repo.ts#L621) | Activo |
| H2 | Cambiar el paquete en la ficha no mueve el flete de ninguno de los dos paquetes, y el siguiente reparto se infla: divide las unidades vivas entre las que el paquete "anotó", y un producto repuesto nunca se anotó. | [4b] **$110.00 repartidos de un flete de $50.00**. Bodega $56.57 de más. | [`flete.repo.ts:84`](../src/main/firebase/repositories/flete.repo.ts#L84) | Activo si se hace |
| H3 | Lo mismo desde el otro lado: después de reponer, cargarle un producto olvidado al paquete viejo le infla su flete. | [4c] **$88.71 de flete** del PQ1 en bodega, cuando se pagaron $77.00 y ya se habían vendido 3 unidades. | [`flete.repo.ts:84`](../src/main/firebase/repositories/flete.repo.ts#L84) | Activo si se hace |
| H4 | Abrir la ficha y guardar sin tocar nada recalcula la bodega como unidades × (base + flete *redondeado*). Es el error de los 5 centavos de `v2.11.1`, que volvió por la edición. Las pruebas actuales no lo ven porque usan $10 de flete entre 10 unidades, que divide exacto. | [3] Con $77 entre 45 unidades, **la bodega baja 5 centavos** por abrir y guardar dos fichas. | [`productos.repo.ts:513`](../src/main/firebase/repositories/productos.repo.ts#L513) | Activo |
| H5 | El paquete no sabe qué trajo. Su "total pagado" es sólo el flete, "Qué venía adentro" sale vacío, y la tarjeta "Gastado en paquetes" suma eso. | [7] Paquete con **total pagado $77.00 y 0 líneas**, cuando lo que entró de él vale $356.35. En producción, según CONTEXTO_SESION, PQ-0001 muestra $77.00 donde la bodega registra $370.16. | [`PaquetesView.tsx:140`](../src/renderer/src/views/PaquetesView.tsx#L140), [`:479`](../src/renderer/src/views/PaquetesView.tsx#L479) | Activo |

### B. Precios que no siguen al costo

| # | Qué pasa | Reproducido | Dónde | Estado |
|---|---|---|---|---|
| H6 | El precio de venta se calcula cuando se crea el producto, con precio + 7%. El flete llega después, sube el costo y **no toca el precio**. | [1] Cartera: costo $28.46 (26.75 + 1.71 de flete), **precio $39.00**. Con el 45% pedido le corresponden **$42.00**. Margen real: **37%**. | [`flete.repo.ts:115`](../src/main/firebase/repositories/flete.repo.ts#L115) escribe costo y valor, no precio | Activo |
| H7 | Vender o ajustar recalcula el precio de lo que queda. El precio que ella le dio a una clienta cambia sin que nadie lo toque. | [2] Cartera: **$39.00 antes de vender, $42.00 después de vender una**. | [`productos.repo.ts:702`](../src/main/firebase/repositories/productos.repo.ts#L702), [`:952`](../src/main/firebase/repositories/productos.repo.ts#L952) | Activo |
| H8 | En la ficha, el paso 3 dice "Te cuesta" con el precio de tienda pelado, sin 7% ni flete. El margen que ve al decidir el precio está calculado sobre la base equivocada. | Lectura de código | [`ProductoModal.tsx:293`](../src/renderer/src/views/inventario/ProductoModal.tsx#L293), [`:1065`](../src/renderer/src/views/inventario/ProductoModal.tsx#L1065) | Activo |
| H9 | Al **crear** un producto, el campo de costo dice "Costo final por prenda (producto + tax)"; la aplicación le suma el 7% igual. Si ella siguió la etiqueta, ese producto pagó el impuesto dos veces. Al **editar**, la misma casilla dice lo contrario ("sin impuesto ni flete"). | Lectura de código. Cuántos productos se cargaron así sólo se sabe leyendo producción. | [`ProductoModal.tsx:912`](../src/renderer/src/views/inventario/ProductoModal.tsx#L912) | Activo |
| H10 | Packs: al editar un pack y tocar sus campos, la pantalla le suma un 7% escrito a mano (`base * 0.07`), y después el repositorio suma el 7% configurado otra vez. La casilla que prende y apaga ese impuesto dice "Este producto vino en pack", y el valor que guarda (`aplicar_tax_usa`) el repositorio no lo lee. | Lectura de código | [`ProductoModal.tsx:784`](../src/renderer/src/views/inventario/ProductoModal.tsx#L784), [`:805`](../src/renderer/src/views/inventario/ProductoModal.tsx#L805), [`:830`](../src/renderer/src/views/inventario/ProductoModal.tsx#L830) | Activo si se edita un pack |

### C. Dos errores latentes que se disparan al "arreglar" P1

CONTEXTO_SESION anota como pendiente que el editor de paquetes no manda las
líneas. **Mandarlas tal como está el código activa estos dos:**

| # | Qué pasa | Reproducido | Dónde |
|---|---|---|---|
| H11 | Un producto creado al recibir un paquete guarda **precio de tienda $0.00**. La ficha le devuelve ese cero, y guardarla sin tocar nada deja el producto **con costo $0.00 y valor $0.00**. | [5] Gloss: costo $10.56, bodega $52.80. **Después de abrir y guardar: $0.00 y $0.00.** | [`productos.repo.ts:362`](../src/main/firebase/repositories/productos.repo.ts#L362), [`compras.repo.ts:365`](../src/main/firebase/repositories/compras.repo.ts#L365) |
| H12 | El editor manda `tax_total_override_usd_cents: 0`. El motor lo lee como "el recibo dice $0 de impuesto", no como "no hay dato", y reparte cero. | [6] $40.00 de mercadería, **impuesto $0.00** (le tocaban $2.80). | [`PaqueteEditor.tsx:147`](../src/renderer/src/views/paquetes/PaqueteEditor.tsx#L147) |

Además, `recibir` busca cada producto **por nombre** (un "Gloss " con espacio o
un producto renombrado crea una ficha gemela) y lo hace leyendo la colección
entera de productos **por cada línea**
([`compras.repo.ts:350`](../src/main/firebase/repositories/compras.repo.ts#L350),
[`productos.repo.ts:1083`](../src/main/firebase/repositories/productos.repo.ts#L1083)):
un paquete de 20 líneas con 22 productos son unas 440 lecturas. Si ese camino
pasa a ser el principal, eso se rehace (fase 3).

### D. Las tarjetas del panel y las cifras de arriba

| # | Qué pasa | Reproducido | Dónde |
|---|---|---|---|
| H13 | **"Te deben en la calle"** cuenta un encargo cotizado sin un centavo pagado como deuda completa. | [9] Encargo sin pagar nada: **"Te deben" = $90.00**. | [`panel.repo.ts:172`](../src/main/firebase/repositories/panel.repo.ts#L172) |
| H14 | Un encargo creado **con el anticipo completo pagado** queda como cotizado: al crear, el estado se decide por "saldo en cero"; al abonar, por "anticipo cubierto". No aparece en **"Encargos por comprar"** ni dispara el aviso de encargos atrasados. | [11] Anticipo esperado $45.00, pagado $45.00, **estado COTIZADA, no aparece por comprar**. | [`ventas.repo.ts:517`](../src/main/firebase/repositories/ventas.repo.ts#L517) contra `pagos.repo.ts:145` |
| H15 | **"Stock crítico"** y **"N ventas con saldo"** cuentan filas de una lista cortada en 10. | [10] 13 productos en el mínimo; **la tarjeta dice 10**. | [`panel.repo.ts:429`](../src/main/firebase/repositories/panel.repo.ts#L429) |
| H16 | **"Ganancia potencial"** de Inventario suma ganancia por unidad redondeada × unidades. Además usa la lista filtrada sin decirlo (la tarjeta de al lado sí avisa "(en filtro)") e incluye los descatalogados cuando ese filtro está puesto. | [8] $78.70 en pantalla, **$78.65 exacto**. | [`InventarioView.tsx:220`](../src/renderer/src/views/InventarioView.tsx#L220), [`:623`](../src/renderer/src/views/InventarioView.tsx#L623) |
| H17 | "Inversión en camino" y el aviso "paquetes en camino" no pueden tener datos nunca: ninguna pantalla crea un paquete `EN_CAMINO`. | Búsqueda en el código | [`panel.repo.ts:132`](../src/main/firebase/repositories/panel.repo.ts#L132) |
| H18 | La ganancia de **hoy** en el celular suma ventas no entregadas y cotizaciones; la ganancia **del mes** en la computadora suma sólo entregadas. Los dos números no cuadran entre sí. | Lectura de código | `mobile/src/lib/panel-movil.ts:42` contra `resumenes.repo.ts` |
| H19 | *(criterio, no error)* "Ganancia de este mes" incluye ventas a crédito que todavía no se cobraron. Es correcto contablemente, pero conviene que ella vea al lado cuánto de eso ya entró. | — | — |

---

## 4. Lo que el diseño nuevo tiene que cumplir

Sale de tus palabras y de las reglas de `AGENTS.md`:

1. **Reponer es normal.** Un producto que ya existe puede volver a llegar en
   cualquier paquete, tenga existencias o no, a otro precio de tienda.
2. **El costo de una unidad es precio de tienda + 7% + su parte del flete**, y
   los tres pedazos se ven y se pueden comprobar a mano.
3. **El paquete dice lo que de verdad se pagó**: mercadería, impuesto, flete y
   otros gastos. Tiene que cuadrar con los recibos.
4. **El precio sigue al costo**, pero sólo cuando el costo cambia por una razón
   que ella reconoce (entró un paquete, cambió el margen). Nunca como efecto de
   una venta.
5. **Ningún número se mueve sin que entre o salga mercadería.**

---

## 5. La solución

### 5.1 El modelo: tres piezas, cada una con un solo trabajo

```
 PAQUETE (lo que entró)                 PRODUCTO (lo que tengo)
 ─────────────────────                  ──────────────────────
 fecha, peso, flete, otros              catálogo: foto, nombre, categoría,
 estado: cargando | en inventario       variantes, margen, stock mínimo
 líneas: ──────────────┐                existencias
                       │                valor de bodega (fuente de verdad)
 LÍNEA DE PAQUETE      │                costo promedio = valor ÷ existencias
 ─────────────────     │                precio de venta
 producto (por id)     │                paquetes en los que vino (para filtrar)
 variante              │                         ▲
 cantidad (o packs)    │   al cerrar el paquete, │
 precio de tienda      └── cada línea es una ────┘
 7% (se puede apagar)      ENTRADA: suma unidades
 peso (opcional)           y suma su costo aterrizado
 flete asignado            al valor de bodega
 costo aterrizado
 destino: inventario | encargo
```

- El 7% y el flete **se calculan una sola vez, adentro del paquete**, con
  `costearPaquete` (ya existe, reparte al centavo y tiene pruebas).
- El producto **deja de guardar flete, precio de tienda y paquete propios**.
  Esos datos viven en la línea del paquete, que es donde son ciertos. Un
  producto que vino en tres paquetes tiene tres líneas, una en cada uno.
- Se retiran `recalcularFleteDePaquete`, `sumarUnidadesAlPaquete` y el reparto
  del flete a posteriori. Son la causa de H1 a H4.
- Se mantiene el **promedio ponderado**, que es regla del proyecto y ya está
  implementado en `entrada` y `salida`.

### 5.2 Tu caso, con números

Quedan 2 carteras del PQ-0001, con un valor de bodega de $56.93. Llega el
PQ-0002 con $50.00 de flete, 10 carteras a $25.00 y 10 labiales a $5.00. La
línea de las carteras en el paquete muestra la cuenta:

```
Cartera × 10         $25.00 c/u            $250.00
+ impuesto 7%                               $17.50
+ flete (10 de las 20 unidades del paquete) $25.00
= costo de la línea                        $292.50    ($29.25 c/u)
```

Al cerrar el paquete, la cartera queda así:

```
existencias     2 + 10 = 12
valor de bodega $56.93 + $292.50 = $349.43
costo promedio  $349.43 ÷ 12 = $29.12
precio (45%)    $29.12 × 1.45 = $42.22 → $43.00, redondeado hacia arriba
```

Cada número sale de uno que está a la vista. Hoy ese mismo escenario da
$17.21 de más con "ajustar" y $56.57 de más cambiando el paquete.

### 5.3 Unificar Inventario y Paquetes: sí, por el flujo

Tu intuición es correcta, con un matiz: lo que importa no es juntar las dos
pantallas, sino que **la mercadería entre por un solo lado**. Propuesta:

- **Una sección, "Inventario", con dos pestañas**: *Productos* (lo que tengo) y
  *Paquetes* (lo que entró). "Paquetes" deja de ser una entrada aparte en la
  barra lateral.
- **El botón principal es "Registrar paquete"**. Ahí adentro se agregan las
  líneas: se busca un producto que ya existe, o se crea uno nuevo **con la
  ficha completa** (foto, categoría, tallas, pack, modo de precio). Eso resuelve
  lo que ella dijo del formulario de paquete: *"es más restringido y no permite
  tantos detalles"*. La ficha completa sigue existiendo; sólo cambia desde dónde
  se abre.
- **La ficha del producto pasa a ser catálogo**: sin campos de costo, de
  existencias iniciales ni de paquete. En su lugar, un bloque de sólo lectura
  con el costo desglosado y la lista de paquetes en los que vino, cada uno con
  su precio de tienda, su 7%, su flete y su costo por unidad.
- **"Ajustar existencias" queda para pérdidas, conteos y regalos.** Si ella
  intenta *subir* existencias, le pregunta si eso llegó en un paquete y la lleva
  ahí.
- **Compra local, sin courier**: un paquete sin peso ni flete, con el 7% apagado.
  Es el mismo camino, no uno aparte.

Boceto del editor de paquete:

```
┌ PQ-0002 · Cargando ──────────────────────────────────────────────────────┐
│ Fecha 24/09/2026   Peso 6.5 lb   Flete $50.00   Otros $0.00              │
├──────────────────────────────────────────────────────────────────────────┤
│ Producto          Cant Tienda c/u  7% línea    Flete Costo c/u  Precio   │
│ Cartera [existe]    10     $25.00    $17.50   $25.00    $29.25  $42 → $43│
│ Labial  [nuevo]     10      $5.00     $3.50   $25.00     $7.85  $12      │
│ + Agregar producto   (buscar uno que ya existe o crear uno nuevo)        │
├──────────────────────────────────────────────────────────────────────────┤
│ Mercadería $300.00 + Impuesto $21.00 + Flete $50.00 = Pagado $371.00     │
│                 [Guardar y seguir después]  [Pasar al inventario]        │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.4 El precio

- El precio se recalcula **cuando entra un paquete** o cuando ella cambia el
  margen o la categoría. **Nunca al vender ni al ajustar** (arregla H7).
- Al cerrar un paquete, un resumen muestra cada producto repuesto con su costo
  y su precio antes y después ("Cartera: $42 → $43"). En modo margen se aplica
  solo y se ve en ese resumen; un precio escrito a mano no se toca, y si quedó
  por debajo del costo, avisa.
- La vista previa de la ficha usa el costo real (arregla H8).

### 5.5 El impuesto

- El 7% sale de Configuración (`tax_bp`), por línea, sobre el precio de tienda.
- **Se puede apagar por línea**: hay tiendas o artículos que no lo cobran.
  Reemplaza la casilla de `aplicar_tax_usa`, que hoy no hace nada (H10).
- Si el recibo trae un impuesto que no da exacto el 7%, se escribe el total del
  recibo y se reparte por valor. El motor ya sabe hacerlo; el editor tiene que
  mandar "sin dato" en vez de cero (H12).
- Los encargos pagan su 7% y su flete igual que el resto, y al cerrar el paquete
  congelan su costo real. El código de eso ya existe y hoy no corre.

### 5.6 El peso y el flete

- Del paquete se conoce el peso total y lo que cobró el courier. El flete se
  calcula con la tarifa por libra o se escribe a mano, como hoy.
- El reparto entre líneas es **por peso si la línea lo tiene** y **por unidades
  si no**, y la pantalla dice cuál se usó. `repartirPeso` ya completa los pesos
  que faltan con el peso unitario conocido de cada producto.

### 5.7 Los estados del paquete

Ella dijo que "recibido" no le hace sentido porque el paquete se registra cuando
ya está acá. Tiene razón, y el estado que falta es otro:

| Hoy | Propuesta | Qué significa |
|---|---|---|
| `BORRADOR` | **Cargando** | Se están agregando líneas. Nada entró al inventario. El flete se reparte solo en cada cambio. |
| `RECIBIDA` | **En inventario** | Las líneas entraron. |
| `EN_CAMINO` | *(se quita de la pantalla)* | Nunca se usó (H17). |

Los valores guardados no cambian; sólo cambia lo que se muestra. Así no hace
falta migrar el estado de ningún paquete.

**Corregir un paquete que ya está en inventario** (el otro P1 de
CONTEXTO_SESION): se recalcula el paquete entero con el cambio (un flete mal
escrito, un precio mal copiado, una línea olvidada) y la diferencia de cada
línea se aplica como ajuste de costo **sólo a las unidades de esa línea que
siguen en bodega**. Las que ya se vendieron conservan su costo, porque el costo
se congela en la venta. La pantalla lo explica con números: *"De las 10
carteras de este paquete quedan 8; la corrección de $2.00 se aplica a esas 8
($1.60). Las 2 vendidas no cambian."*

---

## 6. Plan por fases

El orden importa: primero la red que demuestra los errores, después los
arreglos que dejan de mostrarle números malos, después el rediseño.

### Fase 0: la red de seguridad (chica)

- Pasar las trece reproducciones a pruebas permanentes y **verlas fallar**. Las
  de costo van también a la suite del emulador (`tests/motor-real/`).
- Agregar a `tests/motor-real/invariantes.ts` la que falta: **valor de bodega =
  todo lo que entró por paquetes − el costo de todo lo que salió**. Es la que
  habría atrapado H1 a H4 de una vez.
- Cambiar las pruebas del flete para que usen $77 entre 45 unidades, que no
  divide exacto. Con $10 entre 10, H4 pasa en verde.

### Fase 1: arreglos que no esperan al rediseño (media, sale como `2.11.3`)

Paran los números malos que ella ve hoy. Algunos se tiran en la fase 3, pero
cuestan poco y mientras tanto ella cotiza con estos precios.

- H6: el reparto del flete recalcula también el precio.
- H7: vender y ajustar dejan de recalcular el precio.
- H4: editar usa el flete total del producto, no el redondeado × unidades.
- H2 y H3: el reparto nunca asigna más flete del que se pagó. La ficha no deja
  cambiar el paquete de un producto que tiene existencias.
- H8, H9, H10: la vista previa usa el costo real; la etiqueta del campo dice lo
  mismo al crear que al editar; se quita el 7% escrito a mano del pack y la
  casilla mal etiquetada.
- H11 y H12: se desactivan las dos bombas aunque el camino todavía no se use.
- H13 a H18: las tarjetas cuentan lo que dicen contar.

**Mientras tanto, para reponer**: "Ajustar existencias" es lo menos malo. El
costo nuevo no entra, pero tampoco infla nada. No cambiar el paquete en la
ficha.

### Fase 2: mirar producción (chica, necesita tu permiso)

Una lectura de sólo lectura, unas 50 lecturas contra un límite de 50.000:

- Qué productos tienen hoy un precio que no corresponde a su costo (H6, H7) y
  cuánto cambiaría cada uno.
- Qué productos parecen tener el 7% dos veces (H9). No se puede afirmar solo
  desde los datos; sale una lista para que ella confirme.
- El estado real de PQ-0001 y el valor de bodega contra los $370.16 del 17 de
  septiembre menos lo vendido desde entonces.

El resultado es una lista de cambios de precio **para que ella la apruebe**
antes de aplicar nada: son los precios que les da a sus clientas.

### Fase 3: el paquete como puerta de entrada (grande)

1. **Motor.** Cerrar un paquete con líneas: se leen de una vez los productos
   involucrados (`leerVarios`), cada línea hace su entrada, los productos nuevos
   se crean con la ficha completa, se recalcula el precio y los encargos
   congelan su costo. Las líneas llevan el **id** del producto, no el nombre.
   Corrección de un paquete cerrado (sección 5.7).
2. **Editor de paquete** con líneas, columnas calculadas, totales contra el
   recibo, búsqueda de producto o ficha nueva, packs, variantes y destino
   encargo. Resumen de cierre con los cambios de precio.
3. **Ficha del producto** como catálogo, con el bloque de costo desglosado y los
   paquetes en los que vino.
4. **Navegación**: Inventario con las pestañas Productos y Paquetes. En el
   celular no cambia el flujo de venta.
5. **Retirar el parche**: se dejan de leer `flete_total`, `flete_unitario`,
   `costo_base` y el `paquete_id` como fuente de costo.

### Fase 4: migrar producción (media)

- Respaldo completo a `respaldos/` antes de nada.
- Script **idempotente**, primero en ensayo, y se mira la lista completa.
- PQ-0001 recibe sus líneas, reconstruidas de los productos y de sus
  movimientos de entrada. Sus totales pasan a ser mercadería + impuesto + flete.
- **Invariante**: la migración no mueve el valor de la bodega ni un centavo.
  Sólo escribe la historia del paquete. Si lo mueve, hay un error.
- Los precios se aplican con la lista que ella aprobó en la fase 2.
- Si alguna consulta nueva necesita índice, se despliega y queda `READY` antes
  que el código, y se comprueba con `auditar:indices` y `probar:produccion`.

### Fase 5, opcional: ganancia por paquete

Sólo si ella quiere saber *"¿cuánto me dejó este paquete?"*. Requiere llevar el
inventario por lotes (cada paquete es una capa, se vende lo más viejo primero) y
cambia una regla del proyecto, así que no se hace sin que lo pida.

---

## 7. Decisiones que necesito antes de la fase 3

1. **Promedio ponderado o lotes por paquete.** Recomiendo promedio ponderado:
   es la regla del proyecto, ya está implementado, y arregla todo lo que
   describiste. Los lotes sólo agregan la ganancia exacta por paquete (fase 5).
2. **¿El precio cambia solo al entrar un paquete, o se propone y ella lo
   acepta?** Recomiendo que cambie solo en modo margen y se muestre en el
   resumen de cierre. Si ella prefiere aprobar cada uno, es una casilla más.
3. **¿Un encargo cotizado sin anticipo es deuda?** Recomiendo que no: que
   aparezca aparte, como "cotizado", y entre a "Te deben" cuando pague algo.
4. **Una sección con dos pestañas, o dos secciones enlazadas.** Recomiendo una
   sección.
5. **Permiso para leer producción** en la fase 2. En esta sesión quedó
   bloqueado; se habilita con una regla de permisos de Bash, o lo corrés vos.

---

## 8. Lo que no cambia

- Dinero en centavos enteros, pesos en milésimas de libra, porcentajes en
  puntos básicos.
- El costo se congela en la venta. La tasa de cambio se congela por documento.
- Nada se borra físicamente. Toda mutación deja su evento con
  `evento_grupo_id`. Cerrar un paquete mueve mercadería, así que se marca
  `reversible: false`, igual que `recibir` hoy; la vuelta atrás es la
  corrección.
- Las reglas de lecturas de Firestore: una pasada por colección, nada de N+1,
  escrituras en lote.
- El flujo de venta en el celular.
