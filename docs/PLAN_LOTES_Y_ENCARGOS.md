# Plan: lotes, el flujo del paquete y los encargos

> **Para quién es esto**: Joswill, y la sesión que lo implemente o lo revise.
> **Estado del árbol cuando se escribió**: `v2.13.0`, publicado.
> **Fecha**: 24 de septiembre de 2026.
> **Decidido con Joswill**:
> - el costo pasa de promedio ponderado a **lotes**: lo primero que entra es lo
>   primero que sale;
> - el precio por margen se calcula sobre **el lote más caro que queda**;
> - la relación entre encargos y paquetes va en las dos direcciones, **pieza
>   por pieza**;
> - si la clienta se arrepiente después de que llegó, la pantalla pregunta qué
>   pasa con el anticipo;
> - se pueden comprar encargos todavía cotizados, marcados "sin confirmar".

---

## 1. El negocio, en una línea

Glow Heaven no es una agencia de envíos: **compra** en Estados Unidos y
**recibe** esa mercadería en Nicaragua dentro de un paquete. Lo que trae un
paquete tiene dos destinos:

- **Bodega**: productos del catálogo que se venden después.
- **Encargo**: algo que una clienta ya pidió. Es una venta hecha antes de
  comprar, y su costo real recién se sabe cuando llega el paquete.

---

## 2. El flujo de un paquete

El paquete es la única puerta de entrada de mercadería, y se arma mientras se
compra:

1. **Comprás en línea** → "Registrar paquete". Por cada cosa: el producto, las
   unidades y el **precio de compra por unidad**.
   - Producto que ya tenés: lo buscás.
   - Producto nuevo: "Crear 'X' como producto nuevo" abre la ficha y vuelve
     con la línea lista para unidades y precio.
   - Pieza de un encargo: "Agregar encargo" muestra las piezas que todavía no
     están en ningún paquete; primero las confirmadas, aparte las "sin
     confirmar".
   - "Guardar y seguir después" lo deja **Cargando**. No mueve la bodega.
2. **Llega la factura del courier** → peso de la caja (el flete sale a la
   tarifa por libra) o el flete pagado; otros gastos o un impuesto distinto
   al 7% están bajo "Más costos".
3. **Llega la caja** → "Pasar al inventario":
   - cada línea de bodega crea un **lote** con su costo real;
   - cada pieza de encargo toma su costo real y queda **llegó, por entregar**;
   - los precios por margen se recalculan con la regla de la sección 4.5.
4. **Si algo quedó mal** → "Corregir". Cambia el costo del lote de esa línea,
   sólo en lo que queda de él.

### 2.1 Para qué es "Producto nuevo"

Es **sólo la ficha**: nombre, foto, categoría, cómo se calcula el precio,
tallas, pack y aviso de stock. Sirve para tener un producto en el catálogo
antes de comprarlo o para editarlo. Las unidades y el precio de compra los
trae cada paquete, porque pueden ser distintos cada vez.

- La ficha lo dice en una línea.
- Al crear un producto desde Inventario, se ofrece **"Agregarlo a un
  paquete"**: abre el paquete que esté Cargando (el más reciente, si hay
  varios) o uno nuevo, con la línea ya puesta.
- La columna del paquete dice **"Precio de compra"**.

### 2.2 Compras fuera de un paquete

Una compra en Nicaragua se registra como un paquete sin peso ni flete.

---

## 3. Arreglos de pantalla (`2.13.1`)

1. **El buscador del paquete**: la lista de resultados quedaba recortada por
   el recuadro "Qué vino adentro" (`overflow-hidden`). Con el paquete vacío no
   se veía ningún resultado. El recuadro deja de recortar. Prueba nueva: el
   primer resultado tiene que ser el elemento que está **visible en ese punto
   de la pantalla** (`document.elementFromPoint`).
2. La línea de aviso en la ficha, "Precio de compra" en el paquete y
   "Agregarlo a un paquete" (sección 2.1).

---

## 4. Lotes

### 4.1 El modelo

Cada producto guarda sus lotes en su propio documento, así no se agregan
lecturas: el producto ya se lee en cada venta y en cada entrada.

```ts
interface Lote {
  id: string;                 // "pq12-l3" (paquete 12, línea 3), "saldo-1", "aj-…"
  variante_id: number;        // cada talla o tono tiene sus lotes
  cantidad: number;           // lo que queda
  valor_usd_cents: number;    // lo que vale lo que queda, al costo
  cantidad_inicial: number;
  costo_unitario_usd_cents: number;   // el de la línea del paquete, para mostrar
  fecha: string;              // orden: primero lo más viejo
  orden: number;              // desempate estable
  origen: 'PAQUETE' | 'SALDO' | 'AJUSTE' | 'DEVOLUCION' | 'ENCARGO';
  compra_id?: number; compra_codigo?: string; compra_linea_id?: number;
  // Lo que ya salió de este lote por ventas, para "cuánto te dejó el paquete".
  vendidas: number; ingreso_usd_cents: number; costo_vendido_usd_cents: number;
  bajas: number;              // dañados, perdidos, regalos
}
```

Invariantes, comprobadas por las pruebas en cada paso:

- las unidades de cada variante son la suma de las de sus lotes;
- `valor_inventario_usd_cents` es la suma de los valores de los lotes;
- los lotes agotados **no se borran**: guardan lo que dejaron y reciben las
  devoluciones.

Todo el cálculo vive en `src/core/lotes.ts`, puro y probado aparte.

### 4.2 Las reglas

| Qué pasa | Qué hace |
|---|---|
| Entra un paquete | Cada línea de bodega crea un lote con su costo de línea. |
| Venta | Saca del lote más viejo de esa variante. La línea de la venta guarda `lotes_consumidos`: de qué lote, cuántas, a qué costo y con qué ingreso. |
| Anular una venta | Cada unidad vuelve **a su lote**, con su costo, y se descuenta lo que el lote había registrado como vendido. Una venta anterior a los lotes devuelve a un lote "devolución" con la fecha de la venta. |
| Dañado, perdido, regalo | Sale del lote más viejo y cuenta como baja. |
| Conteo que da de más | Lote "ajuste" al costo del lote más nuevo de esa variante. |
| Corregir un paquete | Cambia el valor del lote de esa línea: `diferencia × lo que queda del lote ÷ unidades de la línea`. Lo vendido conserva su costo. |

Centavos: sacar `k` de un lote con `n` unidades y valor `V` cuesta
`V − round(V × (n − k) / n)`, y vaciarlo se lleva `V` entero. La suma nunca se
descuadra.

El ingreso de una venta se reparte entre sus líneas descontando el descuento
de la venta en proporción (mayor residuo), y el de cada línea entre los lotes
de los que salió. Así "cuánto te dejó el paquete" coincide con la ganancia
real de las ventas.

### 4.3 Migración sin script, y la versión vieja

No hay un paso de migración aparte. `normalizarLotes` arma los lotes cuando
faltan o no cuadran, **dentro de la misma transacción** que mueve el producto:

- **Producto sin lotes** (todos los de hoy): un lote "saldo" por variante con
  existencias, con el valor de la bodega repartido por unidades. Si el
  producto dice de qué paquete vino (`paquete_id`), el lote lo lleva.
- **Lotes que no cuadran**: pasa si la app vieja (2.13.0) vendió mientras Ross
  no actualizaba. Sobran unidades → se sacan del lote más viejo. Faltan → lote
  "saldo". El valor que no cuadre se ajusta en el lote más viejo.

La pantalla muestra siempre los lotes normalizados, aunque todavía no se hayan
escrito. La bodega vale lo mismo antes y después; se comprueba sobre una copia
de producción con `scripts/comparar-respaldos.mjs`.

### 4.4 Qué se ve

- **Inventario**: "Te cuesta" es el costo del lote más caro que queda (el que
  manda el precio). Si hay lotes a costos distintos, el detalle los lista.
- **Detalle del producto**: sus lotes con paquete, fecha, unidades, costo y
  lo que dejó cada uno.
- **Detalle del paquete**: por línea, cuántas se vendieron y cuántas quedan;
  al pie, **cuánto te dejó el paquete** hasta hoy.
- **Nueva venta**: la ganancia que se anticipa usa el costo de las unidades
  que van a salir (el lote más viejo), no un promedio.

### 4.5 El precio

- Un producto tiene **un solo precio**.
- Por margen: se calcula sobre **el lote más caro que queda**.
- Al entrar un paquete se recalcula (sube si el lote nuevo es más caro).
- Al venderse el lote más caro, el precio **no baja solo**: "Revisar precios"
  propone el nuevo y ella decide. El precio sigue sin cambiar al vender.
- Un precio escrito a mano no se toca; el aviso de "debajo del costo" mira el
  lote más caro.

---

## 5. Encargos

### 5.1 Cómo funcionaban hasta la 2.13.0

- Estados guardados: Cotizado → Pendiente (anticipo cubierto) → Entregado, o
  Anulado.
- "Agregar encargo" sumaba sus líneas al paquete; al pasarlo, le fijaban al
  encargo su costo real sin entrar a la bodega.
- La relación la guardaba **sólo la línea del paquete**; el encargo no sabía
  en qué paquete venía.

### 5.2 Huecos encontrados

1. No se sabía si ya se compró ni si ya llegó: "Encargos por comprar" y el
   aviso de "lleva más de N días" contaban también lo comprado y lo que
   esperaba ser retirado; el mismo encargo se podía meter en dos paquetes y el
   segundo le pisaba el costo al primero.
2. Doble descuento: un encargo que apuntaba a un producto del catálogo y además
   llegaba en un paquete descontaba al entregarse una unidad del estante.
3. Entregado desde la bodega, quedaba con el costo estimado y no con el real.
4. La lista del paquete mezclaba cotizados con confirmados.
5. Anular un encargo que ya llegó dejaba la pieza fuera de la bodega, y su
   costo, pagado en el paquete, desaparecía.
6. Anular siempre devolvía el anticipo (anulaba sus pagos), aunque ella
   quisiera quedárselo.

### 5.3 La relación pieza por pieza

Cada línea del encargo (una **pieza**) sabe de dónde sale:

```ts
// En la línea de la venta (VentaLinea), sólo para encargos:
compra_id?: number;           // el paquete donde viene
compra_codigo?: string;
compra_linea_id?: number;
llego_el?: string;            // la fecha del paquete, cuando pasó al inventario
lotes_consumidos?: Consumo[]; // si salió de la bodega
```

Y el encargo guarda el resumen, para que las listas no tengan que leer
líneas:

```ts
// En la venta (Venta), sólo para encargos:
piezas?: { total: number; compradas: number; llegadas: number; de_bodega: number };
llego_el?: string;            // cuando llegó la última pieza
```

Quién mantiene esos datos:

- **Guardar un paquete Cargando**: marca las piezas que entraron al paquete y
  desmarca las que se quitaron. Rechaza una pieza que ya está en otro paquete
  activo: "La pieza 'X' del encargo E-0005 ya viene en PQ-0003".
- **Eliminar un paquete Cargando**: sus piezas vuelven a "por comprar".
- **Pasar al inventario**: fija el costo real y `llego_el`.

### 5.4 El ciclo, derivado

`core/encargos.ts` calcula la etapa a partir del estado guardado y las piezas.
No se escribe a mano, así no se desincroniza:

| Etapa | Cuándo |
|---|---|
| Cotizado | sin anticipo cubierto |
| Por comprar | confirmado, con piezas que no están en ningún paquete |
| En camino | todas sus piezas están compradas y alguna todavía no llegó ("1 de 2 llegó") |
| Por entregar | todo llegó o sale de la bodega |
| Entregado / Anulado | lo guardado |

Una pieza que apunta a un producto del catálogo y no está en ningún paquete
**sale de la bodega** al entregar.

### 5.5 Entregar

- Si una pieza viene en un paquete que no llegó: no se entrega ("'X' todavía
  no llegó: viene en PQ-0003").
- Las piezas de la bodega salen del lote más viejo y el encargo toma ese
  costo. Si no hay unidades, no se entrega.
- Una pieza sin paquete ni producto (un encargo viejo): se entrega con su
  costo estimado, y la pantalla lo avisa.
- Una pieza que vino en un paquete **nunca** descuenta de la bodega.

### 5.6 Anular

| La pieza está... | Qué pasa |
|---|---|
| Por comprar | Nada. |
| En un paquete Cargando | Ya se compró: la línea del paquete pasa a la bodega, con el producto de la pieza o uno nuevo con su nombre al recibir. |
| Llegó, sin entregar | Ella elige: **a la bodega** (entra como lote con su costo real) o **perdida**. |
| Entregada | Si salió de la bodega, vuelve a su lote. Si vino en un paquete, lo mismo que "llegó". |

Y el anticipo: **devolverlo** (se anulan los pagos, como hasta ahora) o
**quedártelo** (los pagos quedan; la venta se anula igual y no cuenta como
deuda ni como ganancia).

Sin elegir (el celular, una llamada vieja): si alguna pieza llegó y no se
entregó, se rechaza con "Anulalo desde la computadora para decidir qué pasa
con la pieza". En los demás casos se comporta como antes.

### 5.7 Avisos y contadores

- "Encargos por comprar" y el número del menú: los confirmados con piezas
  por comprar, más los que llegaron y esperan entrega.
- Avisos: "confirmado hace más de N días y sin comprar" (desde la fecha del
  encargo) y "llegó hace más de N días y no se entregó" (desde `llego_el`).
  Desaparece el aviso de hoy, que mezclaba los dos.

### 5.8 Cotizar con números

En un encargo, cada pieza puede llevar **precio en la tienda** y **peso
aproximado**. La app estima el costo (tienda + 7% + peso × tarifa por libra),
lo pone en "Costo estimado" y propone un precio con el margen por defecto. Al
llegar, el costo real reemplaza al estimado.

---

## 6. Orden de trabajo

1. `2.13.1`: los arreglos de pantalla de la sección 3.
2. `core/lotes.ts` y `core/encargos.ts` con sus pruebas, escritas antes y
   viéndolas fallar.
3. Repositorios: productos (entrada, salida, ajuste, lista), paquetes
   (guardar, recibir, corregir, eliminar), ventas (crear, entregar, anular),
   panel (avisos y contadores).
4. Pruebas contra el Firestore falso y la invariante nueva en
   `tests/motor-real/invariantes.ts`.
5. Pantallas: lotes en el detalle, "cuánto te dejó", etapas y piezas del
   encargo, entrega, anulación con opciones, cotizar con números.
6. Verificación completa: typecheck, pruebas, emulador, suites de pantalla,
   auditorías, y la base real con datos "Prueba" borrados después.

Los pasos 2 a 6 salen juntos como `2.14.0`.

### Estado al 25 de septiembre

Hechos los pasos 1 a 5 y la parte local del 6: typecheck de las dos apps, 355
pruebas contra el Firestore falso, 91 contra el emulador (con la invariante de
lotes en el simulador de producción), las dos suites de pantalla (la de
escritorio suma el caso del encargo que viene en camino y se anula) y las
tres auditorías. El simulador del navegador imita lotes y piezas para que las
pantallas se puedan revisar con datos.

Publicada como 2.14.0 y 2.14.1 el 26 de septiembre, con los datos de
producción migrados (`scripts/migrar-a-lotes.ts`) y probada en la app
instalada contra la base real (ver `CONTEXTO_SESION.md`, sección 3).

Cambios respecto de lo escrito arriba, al verlo en pantalla:

- Un encargo cotizado con piezas compradas dice "Cotizado · en camino" o
  "Cotizado · llegó": con sólo "Cotizado" no se veía que ya venía.
- El detalle del encargo muestra la etapa (la misma de la lista), no el
  estado guardado.
- El contador de arriba cuenta lo que muestra el filtro de etapa.
- Ella no sabe en qué paquete viene lo que compra, sólo que lo más probable
  es que en el próximo. Se agregó el estado "comprada, espera paquete"
  ("Ya lo compré"), y el paquete nuevo ofrece esas piezas primero.
- Una venta anulada no muestra deuda ni ganancia en la lista.
