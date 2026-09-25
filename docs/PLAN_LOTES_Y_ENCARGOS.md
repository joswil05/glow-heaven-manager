# Plan: lotes, el flujo del paquete y los encargos

> **Para quién es esto**: Joswill, para decidir antes de tocar código, y la
> sesión que lo implemente.
> **Estado del árbol cuando se escribió**: `v2.13.0`, publicado.
> **Fecha**: 24 de septiembre de 2026.
> **Decidido**: el costo pasa de promedio ponderado a lotes (lo primero que
> entra es lo primero que sale), y el precio por margen se calcula sobre el
> lote más caro que queda.

---

## 1. El negocio, en una línea

Glow Heaven no es una agencia de envíos: **compra** en Estados Unidos y
**recibe** esa mercadería en Nicaragua dentro de un paquete. Lo que trae un
paquete tiene dos destinos:

- **Bodega**: productos del catálogo que se venden después.
- **Encargo**: algo que una clienta ya pidió. Es una venta hecha antes de
  comprar, y su costo real recién se sabe cuando llega el paquete.

Todo lo demás de este plan sale de esa diferencia.

---

## 2. El flujo de un paquete

El paquete es la única puerta de entrada de mercadería. Se arma mientras se
compra, no cuando llega:

1. **Comprás en línea** → abrís "Registrar paquete" y anotás cada cosa que
   compraste: el producto, las unidades y el **precio de compra por unidad**.
   - Producto que ya tenés: lo buscás.
   - Producto nuevo: "Crear 'X' como producto nuevo" abre la ficha (nombre,
     categoría, cómo se calcula el precio) y vuelve al paquete con la línea
     lista para las unidades y el precio.
   - Algo que te encargó una clienta: "Agregar encargo" muestra sólo los
     confirmados que todavía no están en ningún paquete.
   - "Guardar y seguir después": el paquete queda **Cargando**. No mueve nada.
2. **Llega la factura del courier** → escribís el peso de la caja (el flete
   se calcula a la tarifa por libra) o el flete pagado, y si hubo, otros
   gastos o un impuesto distinto al 7%.
3. **Llega la caja** → revisás y "Pasar al inventario". En ese momento:
   - cada línea de bodega se vuelve un **lote** con su costo real (compra +
     7% + su parte del flete);
   - cada línea de encargo le fija su costo real a ese encargo, que pasa a
     **Llegó, por entregar**;
   - los precios por margen se recalculan (regla de la sección 4.4).
4. **Si algo quedó mal** → "Corregir" en el paquete. Cambia el costo del lote
   de esa línea, sólo en lo que queda de él.

### 2.1 Para qué es "Producto nuevo" en Inventario

Es **sólo la ficha**: nombre, foto, categoría, cómo se calcula el precio,
tallas, pack y aviso de stock. No lleva unidades ni precio de compra, porque
eso lo trae cada paquete y puede ser distinto cada vez.

Cuándo usarlo:

- para dejar un producto en el catálogo antes de comprarlo (por ejemplo, para
  cotizarlo);
- para editar la ficha de uno que ya existe.

Para meter mercadería se usa el paquete. La 2.13.0 sacó el aviso que lo
explicaba y el formulario quedó pareciendo incompleto. Se corrige así:

- la ficha vuelve a decir, en una línea, que las unidades y el precio de
  compra entran con el paquete;
- al crear un producto desde Inventario, se ofrece "Agregarlo a un paquete":
  abre el paquete que esté Cargando (o uno nuevo) con la línea ya puesta;
- la columna del paquete deja de decir "Tienda" y dice **"Precio de compra"**.

### 2.2 Compras que no vienen en un paquete

Si algo se compra en Nicaragua, se registra igual como paquete, sin peso ni
flete. Si pasa seguido, se puede nombrar "Compra local" en la lista; no hace
falta otra pantalla.

---

## 3. Arreglo inmediato: el buscador del paquete

Al buscar un producto en "Registrar paquete", la lista de resultados queda
**recortada** por el recuadro "Qué vino adentro" (`overflow-hidden` en la
`section` de `PaqueteEditor.tsx`). Con el paquete vacío no se ve ningún
resultado. Viene desde la 2.12.0.

- La lista se dibuja fuera del recuadro, o el recuadro deja de recortar.
- Prueba nueva: el primer resultado tiene que ser el elemento que está
  **visible en ese punto de la pantalla** (`elementFromPoint`), no sólo
  existir. Las pruebas de hoy lo tocaban aunque estuviera tapado.

---

## 4. Lotes (primero que entra, primero que sale)

### 4.1 Qué cambia, con un ejemplo

| Boxers en bodega | Unidades | Costo c/u |
|---|---|---|
| Lote PQ-0001 (agosto) | 4 | $8.49 |
| Lote PQ-0002 (septiembre) | 10 | $6.35 |

- Las primeras 4 ventas se miden contra $8.49; las siguientes, contra $6.35.
  Hoy todas se medirían contra el promedio, $6.96, y la ganancia de esas
  cuatro se vería más alta de lo que fue.
- El valor de la bodega sigue siendo la suma exacta: $97.46.

### 4.2 Las reglas

| Qué pasa | Qué hace con los lotes |
|---|---|
| Entra un paquete | Cada línea de bodega crea un lote (por talla o tono, si tiene). |
| Venta | Saca del lote más viejo. La línea de la venta guarda de qué lotes salió y a qué costo. |
| Anular una venta | Devuelve cada unidad **al lote del que salió**, con su costo. |
| Dañado, perdido, regalo | Sale del lote más viejo. |
| Conteo que da de más | Entra como lote "ajuste" al costo del lote más nuevo. |
| Devolución de clienta | Vuelve al lote de la venta. |
| Corregir un paquete | Cambia el costo de ese lote y sólo de las unidades que le quedan. Hoy la corrección se reparte en proporción; con lotes es exacta. |

Centavos: un lote guarda unidades y valor total en centavos enteros. Sacar
`k` de `n` unidades cuesta `valor − round(valor × (n − k) / n)`, así la última
unidad se lleva el residuo y la suma nunca se descuadra.

### 4.3 Dónde se guardan

Dentro del documento del producto, como un arreglo por variante. El producto
ya se lee en cada venta y en cada entrada, así que **no agrega lecturas** a
Firestore. `valor_inventario_usd_cents` pasa a ser la suma de sus lotes.

El PWA usa los mismos repositorios (`@repos/...`), así que una venta desde el
celular consume lotes igual que una del escritorio.

### 4.4 El precio

- Un producto sigue teniendo **un solo precio**.
- Por margen: se calcula sobre **el lote más caro que queda**. Ninguna unidad
  se vende por debajo del margen pedido.
- Cuando ese lote se acaba, el precio **no baja solo**: "Revisar precios"
  propone el nuevo y ella decide. Se mantiene la regla de siempre: el precio
  no cambia al vender.
- Un precio escrito a mano no se toca; sólo avisa si queda debajo del costo de
  algún lote.

### 4.5 Lo que se gana en pantalla

- Detalle del producto: los lotes que quedan (paquete, fecha, unidades,
  costo).
- Detalle del paquete: de cada línea, cuánto se vendió, cuánto queda y
  **cuánto te dejó el paquete**. Estaba pendiente y con lotes sale exacto.

### 4.6 Migración

Producción tiene 22 productos que entraron con PQ-0001. Cada variante con
existencias pasa a tener un lote "PQ-0001" con las unidades y el valor que
tiene hoy. La bodega no cambia ni un centavo; se comprueba antes y después con
`scripts/comparar-respaldos.mjs`.

---

## 5. Encargos

### 5.1 Cómo funcionan hoy

- Se crean en la pestaña Encargos con el mismo formulario de venta: clienta
  obligatoria, líneas con descripción (o un producto del catálogo), precio,
  costo estimado y anticipo.
- Estados: **Cotizado** (sin anticipo) → **Pendiente** (anticipo cubierto) →
  **Entregado**, o **Anulado**.
- En el paquete, "Agregar encargo" suma sus líneas con destino encargo: no
  entran a la bodega, y al pasar el paquete le fijan al encargo su costo real.
- "Marcar como entregada" cierra el encargo. Si sus líneas apuntan a un
  producto del catálogo, además saca unidades de la bodega.

### 5.2 Huecos encontrados

1. **No se sabe si ya se compró ni si ya llegó.** Un encargo en un paquete
   sigue diciendo "Pendiente" hasta entregarse. Por eso:
   - "Encargos por comprar" (Paquetes) y el número del menú cuentan también
     los que ya se compraron y los que ya llegaron;
   - el aviso "lleva más de 10 días" mira sólo la fecha del encargo: salta
     aunque ya esté comprado o esperando que lo retiren;
   - el mismo encargo se puede agregar **a dos paquetes**, y el segundo le
     pisa el costo al primero.
2. **Doble descuento.** Si un encargo apunta a un producto del catálogo y
   además llega en un paquete como encargo, al entregarlo se descuenta una
   unidad de la bodega que nunca salió del estante.
3. **Entregado desde la bodega, con el costo equivocado.** Cuando un encargo
   se cubre con algo que ya había en bodega, la unidad sale al costo de la
   bodega, pero el encargo se queda con el costo estimado. Su ganancia no es
   la real.
4. **Se ofrecen para comprar encargos sin confirmar.** La lista del paquete
   muestra también los cotizados, sin distinguirlos.
5. **Si la clienta se arrepiente después de que llegó**, anular el encargo
   deja la pieza fuera de todo: no está en la bodega y su costo no aparece
   en ninguna parte, aunque se pagó en el paquete.

### 5.3 Cómo debería funcionar

El encargo es **una venta cuya mercadería todavía no se compró**. Su ciclo,
visible en la lista y en el detalle:

```
Cotizado → Confirmado → Comprado → Llegó → Entregado
 (sin       (anticipo    (está en    (el paquete   (se cobra el
 anticipo)   cubierto)    un paquete  pasó al       saldo y se
                          Cargando)   inventario)   entrega)
```

"Comprado" y "Llegó" no se escriben a mano: salen de en qué paquete está cada
línea y del estado de ese paquete. Así no se desincronizan.

Con eso:

- **Paquete**: "Agregar encargo" ofrece los confirmados que no están en
  ningún paquete; los cotizados aparecen aparte, marcados "sin confirmar".
  Un encargo que ya está en un paquete no se puede agregar a otro.
- **Llegada**: al pasar el paquete, cada encargo toma su costo real y queda
  "Llegó, por entregar", con el saldo que falta cobrar.
- **Entrega**: "Entregar" ofrece cobrar el saldo en el mismo paso. Un
  encargo que no llegó no se entrega, salvo que se elija **sacarlo de la
  bodega**: ahí sale de un lote y toma ese costo.
- **Nunca las dos cosas**: una línea de encargo o viene en un paquete o sale
  de la bodega. Eso cierra el doble descuento.
- **Arrepentimiento**: anular un encargo que ya llegó pregunta qué pasa con
  la pieza: **pasarla a la bodega** (entra como lote con su costo real, en un
  producto existente o nuevo) o darla por perdida. El anticipo se devuelve o
  se retiene, según decida ella (sección 7).
- **Avisos**: "confirmado hace N días y todavía sin comprar" y "llegó hace N
  días y no lo retiraron". El de hoy desaparece.
- **Panel**: "Anticipos por entregar" sigue igual; se suma "Por entregar"
  con lo que ya llegó.

### 5.4 Cotizar con números reales

Hoy el costo estimado de un encargo se escribe a ojo. Al cotizar se puede
pedir lo mismo que pide el paquete: **precio en la tienda y peso aproximado**.
La app suma el 7% y el flete a la tarifa por libra, y propone el precio con el
margen de la categoría. Cuando llega, el costo real reemplaza al estimado y se
ve la diferencia.

---

## 6. Orden de trabajo

Cada paso sale con sus pruebas y no rompe el anterior.

1. **Arreglos de la pantalla del paquete** (sección 3 y 2.1): buscador visible,
   aviso en la ficha, "Precio de compra", "Agregarlo a un paquete". Chico;
   puede salir solo como `2.13.1`.
2. **Lotes en el motor** (`src/core/`): entrada, salida, devolución, ajuste,
   corrección y precio, con pruebas unitarias que fallen primero.
3. **Lotes en los repositorios** (paquete, ventas, anulación, ajustes) y la
   invariante nueva en `tests/motor-real/invariantes.ts`: el valor de la
   bodega es la suma de los lotes, y cada venta guarda de qué lote salió.
4. **Migración** de producción con respaldo antes y después, y cero
   diferencias en la bodega.
5. **Encargos**: ciclo derivado, reglas del paquete, entrega, arrepentimiento
   y avisos.
6. **Pantallas**: lotes en el detalle del producto, "cuánto te dejó" en el
   paquete, ciclo del encargo.
7. **Verificación completa**: typecheck, pruebas, suite del emulador, suites
   de pantalla, y una pasada sobre la base real con datos "Prueba" que se
   borran después (sección 6 de `CONTEXTO_SESION.md`).

Pasos 2 a 7 salen juntos como `2.14.0`.

---

## 7. Decisiones que faltan

| Decisión | Recomendación |
|---|---|
| Si la clienta se arrepiente después de que llegó, ¿el anticipo se devuelve? | Que la pantalla pregunte en cada caso: devolverlo o quedárselo como pago de la pieza. |
| ¿Se pueden comprar encargos todavía cotizados? | Sí, pero marcados "sin confirmar" y separados de los confirmados. |
| Conteo que da más unidades de las registradas: ¿a qué costo entran? | Al del lote más nuevo. |
| ¿"Compra local" como tipo de paquete? | Sólo si compra en Nicaragua seguido; si no, un paquete sin flete alcanza. |
