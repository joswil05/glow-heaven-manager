# Plan: encargos por fases, formularios y trabajo sin conexión

> **Para quién es esto**: Joswill, y la sesión que implemente cada versión.
> **Estado del árbol cuando se escribió**: `v2.15.1`, publicada.
> **Fecha**: 28 de septiembre de 2026.
> **Leer antes**: [CONTEXTO_SESION.md](CONTEXTO_SESION.md),
> [AGENTS.md](../AGENTS.md) y la sección 5 de
> [PLAN_LOTES_Y_ENCARGOS.md](PLAN_LOTES_Y_ENCARGOS.md).
>
> **Decidido con Joswill el 28 de septiembre**:
> - "Aceptó" es un paso propio. El anticipo puede llegar después, y la app
>   avisa si Ross compra sin tenerlo cubierto.
> - Si no se consigue una pieza, se marca "No se consiguió" y la cotización
>   sale con lo que sí se encontró.
> - La cotización se manda por WhatsApp, con el mensaje y la proforma en PDF.
> - La cotización no vence.
> - No hay campo de link por pieza: las notas alcanzan.
> - En el celular se anotan pedidos, se cotizan y se manda la cotización.
>   Comprar, recibir, entregar y anular siguen en la computadora.
> - Ross se queda sin internet en los dos lados (la PC de la casa y el celular
>   afuera). La cola de operaciones va en las dos apps.
> - Se pulen **todos** los formularios de la app con la guía de Emil Kowalski,
>   sin cambiar qué datos pide cada uno.

---

## 0. Cómo está organizado

Son cinco versiones, y cada una se publica sola:

| Versión | Qué trae | Por qué va en ese lugar |
|---|---|---|
| `2.16.0` | Encargos por fases en la computadora, con sus formularios pulidos | Es lo que más se nota y no toca la infraestructura |
| `2.17.0` | Encargos en el celular, con sus formularios pulidos | Usa el modelo de la 2.16 tal cual |
| `2.18.0` | Sin conexión, parte A: abrir y consultar | Mueve Firebase de lugar en la PC; conviene hacerlo con los encargos ya quietos |
| `2.19.0` | Sin conexión, parte B: vender, cobrar y anotar pedidos sin red | Necesita la 2.18 (caché y sesión persistentes) y el pedido nuevo de la 2.16 |
| `2.20.0` | El resto de los formularios con la guía de Emil | La 2.19 cambia los de venta y abono; pulirlos antes sería hacerlo dos veces |

Este documento tiene el diseño, las reglas y, por tarea, los archivos y las
pruebas. **Cada versión empieza escribiendo su plan paso a paso** (prueba que
falla, código, prueba que pasa, commit) a partir de su sección de acá, porque
con cinco versiones el código escrito hoy para la cuarta ya estaría viejo al
llegar.

Todo lo de [CONTEXTO_SESION.md](CONTEXTO_SESION.md) sigue valiendo en cada
versión: dinero en centavos enteros, índices y reglas desplegados y `READY`
**antes** que el código, sembrar el error antes de dar una prueba por buena, y
probar en la app instalada contra la base real con datos "Prueba" que se
borran después (sección 6 de ese documento).

---

## 1. Encargos: lo que hoy se maneja por encima

Cómo trabaja Ross: una clienta le pide algo por WhatsApp. Ella no sabe cuánto
vale; sólo sabe que tiene que buscarlo. Cuando lo encuentra, arma el precio y
le manda la cotización. La clienta dice que sí (o no, o no contesta), paga el
anticipo antes o después, Ross compra, llega en un paquete y lo entrega.

Lo que la app hace hoy con eso:

1. **"Por cotizar" es un encargo cotizado con precio $0**
   (`piezas.sin_precio`). No distingue "todavía no lo busqué" de "ya lo
   encontré y me falta mandarlo".
2. **La app no sabe si la cotización se mandó.** "Cotizado" sólo quiere decir
   que tiene precio. No existe "se la mandé hace 5 días y no contestó".
3. **Aceptar es pagar el anticipo.** El pago que lo cubre pasa el encargo a
   `PENDIENTE` ([pagos.repo.ts:143-148](../src/main/firebase/repositories/pagos.repo.ts#L143-L148)).
   Con anticipo de 0%, `estadoInicialEncargo`
   ([cobranza.ts](../src/core/cobranza.ts)) lo confirma al cotizarlo, sin que
   la clienta haya dicho nada.
4. **Una pieza que no se consigue traba todo el encargo.** Mientras una pieza
   no tenga precio, el encargo sigue "Por cotizar". Para descartarla hay que
   anular el encargo completo.
5. **La pantalla publicada es la de ventas con un interruptor.** En la 2.15.1,
   la pestaña Encargos abre `VentasView` con `tipo="ENCARGO"`: siete filtros
   (`Filtro` en [VentasView.tsx:80](../src/renderer/src/views/VentasView.tsx#L80)),
   un período que arranca en "este mes" y esconde encargos viejos que siguen
   en curso, y el editor de ventas en modo encargo para crearlos.
6. **El mensaje de WhatsApp dice "Anticipo requerido (50%)" fijo**
   ([mensajes.ts](../src/core/documentos/mensajes.ts)), aunque el encargo
   tenga otro porcentaje.
7. **Hay un primer arreglo sin publicar.** Después de la 2.15.1 quedó en el
   árbol, **sin commit**, una pantalla propia: `EncargosView.tsx`,
   `encargos/NuevoEncargoModal.tsx`, el cambio de `App.tsx` que la abre y
   `quePidio` en `core/encargos.ts`. Con eso, `tsc` da cero errores y pasan
   las 383 pruebas. Es un paso en la dirección de este plan (un solo botón
   principal, "qué pidió" en cada fila, en curso sin período), pero todavía
   tiene dos sistemas de filtro: cinco tarjetas
   ([EncargosView.tsx:320-334](../src/renderer/src/views/EncargosView.tsx#L320-L334))
   y tres pestañas (líneas 336-367). La 2.16 parte de ahí (tarea E0). Con ese
   cambio, el modo encargo de `VentasView` y `VentaEditor` queda sin nadie que
   lo abra y se borra.

   (El 28 de septiembre se analizó esa pantalla como si fuera la publicada, y
   se dijo que había dos caminos para crear un encargo. Las dos cosas estaban
   mal: se corrigieron acá.)

---

## 2. El encargo por fases (`2.16.0`)

### 2.1 Las fases

La fase se **deriva** de lo guardado, como hoy la etapa; no se escribe a mano.

| # | Fase | Qué quiere decir | Botón principal | Aviso en el panel |
|---|---|---|---|---|
| 1 | **Por buscar** | Hay piezas sin precio que nadie descartó | "Cotizar" | "El pedido de X lleva N días sin cotizar" (ya existe) |
| 2 | **Por mandar** | Tiene precios y la clienta todavía no los recibió (o cambiaron después de mandarlos) | "Mandar cotización" | — |
| 3 | **Esperando respuesta** | Se mandó y la clienta no aceptó | "Aceptó" | "Le mandaste la cotización a X hace N días" |
| 4 | **Por comprar** | Aceptó y falta comprar alguna pieza | "Ya lo compré" | "X aceptó hace N días y no está comprado" |
| 5 | **En camino** | Todo comprado, falta que llegue algo | — ("Se entrega cuando llegue todo") | — |
| 6 | **Por entregar** | Llegó todo | "Entregar" | "Llegó hace N días y no se entregó" (ya existe) |
| — | **Entregado** | Guardado | "Registrar abono", si debe | — |
| — | **No se concretó** | Anulado, con motivo: *No se consiguió*, *No aceptó* o *Ya no lo quiere* | — | — |

Los N días de los avisos son los de `dias_alerta_encargos`, que ya está en
Configuración ([panel.repo.ts:331](../src/main/firebase/repositories/panel.repo.ts#L331)).

Una línea bajo la fase dice lo que hace falta saber sin abrir el detalle:
"Esperando respuesta · hace 3 días", "Por comprar · sin anticipo",
"Esperando respuesta · ya comprado" (Ross compró antes de que aceptara, que se
sigue permitiendo), "En camino · 1 de 2 llegó".

### 2.2 Lo que se guarda

**No hay estado nuevo.** `COTIZADA` pasa a querer decir "todavía no aceptó" y
`PENDIENTE`, "aceptó". Así, `esDeuda` y todo lo que lee `estado` sigue
funcionando igual.

Campos nuevos, todos opcionales:

```ts
// En Venta (sólo encargos)
cotizado_el?: string;            // ISO: la última vez que cambió un precio o se descartó una pieza
cotizacion_enviada_el?: string;  // ISO: la última vez que se mandó
aceptado_el?: string;            // ISO: cuando aceptó, por el botón o por un pago que cubre el anticipo

// En VentaLinea (una pieza)
descartada_el?: string;          // ISO: "No se consiguió"

// En PiezasEncargo
descartadas?: number;

// MotivoAnulacion
export type MotivoAnulacion = 'NO_SE_CONSIGUIO' | 'NO_ACEPTO';  // sin motivo = "Ya no lo quiere", como hoy
```

Una pieza descartada queda en la lista, tachada, con subtotal y costo en cero:
no cuenta en el total, el costo ni la ganancia. `piezasDe` la cuenta en
`total` y en `descartadas`, y en ningún otro contador (`sin_precio`,
`compradas`, `de_bodega`, `llegadas`): la cuenta de la fase de abajo depende
de eso.

### 2.3 La cuenta de la fase

Reemplaza a `etapaEncargo` en [core/encargos.ts](../src/core/encargos.ts).
`EtapaEncargo` pasa a ser
`'POR_BUSCAR' | 'POR_MANDAR' | 'ESPERANDO' | 'POR_COMPRAR' | 'EN_CAMINO' | 'POR_ENTREGAR' | 'ENTREGADO' | 'ANULADO'`.

```ts
export function etapaEncargo(v: {
  estado: EstadoVenta;
  piezas?: PiezasEncargo;
  cotizado_el?: string;
  cotizacion_enviada_el?: string;
}): EtapaEncargo {
  if (v.estado === 'CANCELADA') return 'ANULADO';
  if (v.estado === 'ENTREGADA') return 'ENTREGADO';

  const p = v.piezas;
  const vivas = (p?.total ?? 0) - (p?.descartadas ?? 0);
  // Todas descartadas: lo que queda es cerrarlo como "no se consiguió".
  if (vivas <= 0 || (p?.sin_precio ?? 0) > 0) return 'POR_BUSCAR';

  if (v.estado === 'COTIZADA') {
    const enviada = v.cotizacion_enviada_el;
    if (!enviada || (v.cotizado_el ?? '') > enviada) return 'POR_MANDAR';
    return 'ESPERANDO';
  }

  // PENDIENTE: aceptó. Igual que hoy, contando sólo las piezas vivas.
  if (vivas - (p!.compradas) - (p!.de_bodega) > 0) return 'POR_COMPRAR';
  if (p!.llegadas + p!.de_bodega < vivas) return 'EN_CAMINO';
  return 'POR_ENTREGAR';
}
```

`textoEtapa` recibe `hoy` (de [fechas.ts](../src/core/fechas.ts), Managua)
para decir "hace N días".

**Encargos viejos**, sin campos nuevos: un `COTIZADA` con precio queda "Por
mandar" (un toque en "Ya la mandé" lo pone al día) y un `PENDIENTE` sin
`aceptado_el` cuenta como aceptado. No hace falta script. Al 26 de septiembre
producción no tenía encargos; antes de empezar se confirma con una lectura.

`POR_COTIZAR` y `COTIZADO` aparecen hoy en `EncargosView`, `VentasView`,
`panel.repo.ts`, `panel-movil.ts`, `AnularEncargoModal` y las pruebas. Todos
se cambian en la misma tarea que el tipo; `tsc` los encuentra.

### 2.4 Quién escribe qué

La cuenta de total, costo, anticipo y estado de
[ventas.repo.ts:761-788](../src/main/firebase/repositories/ventas.repo.ts#L761-L788)
sale a una función pura, `recalcularEncargo(venta, lineas)` en
`core/encargos.ts`, para que la usen cotizar y descartar sin repetirla.

| Acción | Método | Qué escribe |
|---|---|---|
| Anotar pedido | `VentasRepo.crear` (existe) | Nace `COTIZADA`. Si todas las piezas vienen con precio, también `cotizado_el`, y queda "Por mandar". |
| Cotizar | `VentasRepo.cotizar` (existe) | Precios, costo estimado y `cotizado_el` si algo cambió. `LineaCotizacion` suma `descartada?: boolean` y "Volver a buscar". |
| No se consiguió, fuera de Cotizar | `VentasRepo.descartarPiezas(venta_id, ids, descartar, grupo)` (nuevo) | Sólo piezas **sin comprar**. Recalcula con `recalcularEncargo`. Si lo pagado supera el nuevo total, se rechaza: "Pagó $X y el nuevo total es $Y. Corregí el pago antes de descartar". |
| Mandar cotización | `VentasRepo.marcarEnviada(venta_id, grupo)` (nuevo) | `cotizacion_enviada_el`. Se llama después de abrir WhatsApp, o con "Ya la mandé por otro lado". |
| Aceptó | `VentasRepo.aceptar(venta_id, grupo)` (nuevo) | `COTIZADA` → `PENDIENTE` y `aceptado_el`. Si en el mismo formulario registra un pago, va con `PagosRepo.registrar` y **el mismo grupo**, así un deshacer revierte los dos. |
| Pago que cubre el anticipo en un `COTIZADA` | `PagosRepo.registrar` (existe) | Sigue confirmando, como hoy, y además escribe `aceptado_el`: quien paga, aceptó. |
| Anticipo de 0% | `estadoInicialEncargo` | **Ya no confirma solo.** Hace falta "Aceptó" o un pago. |
| Ya lo compré | `VentasRepo.marcarCompradas` (existe) | Sin cambios. Si aceptó y el anticipo no está cubierto, la pantalla lo avisa antes de confirmar, sin impedirlo. |
| No aceptó | `cambiarEstado(CANCELADA, { motivo: 'NO_ACEPTO' })` | El botón de "Esperando respuesta". |
| Entregar | Existe | Sin cambios. |

Cada método nuevo escribe en `eventos` con su `evento_grupo_id` y guarda lo
anterior para deshacer. Un repositorio que ignora el grupo deja el deshacer
muerto sin que nada falle (AGENTS.md), así que cada uno tiene su prueba en
`tests/motor-real/deshacer.test.ts`.

### 2.5 Lo que cambia en los números que ve Ross

Hay que decírselo a Ross al publicar:

- **"Te deben" cuenta un encargo desde que acepta**, aunque no haya pagado
  anticipo. Hoy cuenta desde que el anticipo queda cubierto. El código de
  `esDeuda` no cambia; lo que cambia es que un encargo llega antes a
  `PENDIENTE`.
- Una pieza que no se consiguió sale del total, el costo y la ganancia.
- Con anticipo de 0%, cotizar ya no confirma: falta que la clienta acepte.
- El mensaje de la proforma dice el porcentaje real de ese encargo, y nombra
  lo que no se consiguió ("No conseguimos: …").
- Un pedido por buscar sigue sin contar en ventas, deuda ni ganancia.

### 2.6 La pantalla, en la computadora

**Una sola barra de fases** reemplaza a las cinco tarjetas y las tres
pestañas:

```
Buscar 2 · Mandar 1 · Esperando 3 · Comprar 1 · En camino 4 · Entregar 2 · Cerrados
```

Tocar una fase filtra, y tocarla otra vez vuelve a mostrar todo. Sin filtro,
la lista sale **agrupada por fase, en ese orden**, con el título de cada grupo
y su conteo: se lee de arriba abajo como el camino de un encargo. "Cerrados"
muestra los entregados y los que no se concretaron, con los 200 más recientes
como hoy.

**La fila** muestra la clienta, qué pidió, la línea de la fase, el total, lo
que debe y el menú "⋮". Es la regla de la 2.13: un solo botón visible por
fila.

**El detalle** (el panel lateral de 400 px, en este orden):

1. Clienta, código y fase.
2. El progreso en una línea: seis puntos, los hechos llenos, y la fase actual
   con su detalle ("Esperando respuesta · mandada el 3 oct").
3. **Qué pidió**: cada pieza con su estado y **su** acción chica, cuando la
   tiene ("No se consiguió", "Ya lo compré", "Desmarcar"). Las descartadas,
   tachadas.
4. La plata en una línea: total, pagó y debe (como hoy).
5. **Un** botón, el de la fase.
6. Todo lo demás en un "⋮": Proforma, WhatsApp, Cambiar precios, Registrar
   abono, Anular.
7. Pagos, plegados: "Pagos (2)".

Se borra el modo encargo de `VentasView` y `VentaEditor` (sección 1, punto 7),
después de comprobar con `grep` y con las pruebas que nadie lo abre.

### 2.7 Mandar la cotización, desde la computadora

El formulario nuevo "Mandar cotización" muestra:

- el mensaje, armado con la plantilla de Configuración. Se puede editar para
  este envío; la plantilla no cambia;
- la proforma, como se va a ver.

**"Abrir WhatsApp"**:

1. guarda el PDF en `Documentos/Glow Heaven/Cotizaciones/<código>.pdf`, con el
   `printToPDF` que ya existe ([ipc/index.ts:461-471](../src/main/ipc/index.ts#L461-L471));
2. abre esa carpeta con el archivo seleccionado (`shell.showItemInFolder`),
   para arrastrarlo al chat;
3. abre el chat de la clienta con el mensaje (el mismo `wa.me` de hoy);
4. marca la cotización como mandada.

**"Ya la mandé por otro lado"** sólo la marca como mandada.

Canal IPC nuevo: `documentos.prepararCotizacion({ venta_id, html }) →
{ ruta }`. Se queda en el main, porque usa `shell` y el disco.

### 2.8 Tareas de la 2.16

El paso a paso está en
[superpowers/plans/2026-09-28-encargos-por-fases-2.16.md](superpowers/plans/2026-09-28-encargos-por-fases-2.16.md).

**E0. Adoptar la pantalla sin publicar** (sección 1, punto 7). Se corre
`test:interfaz-escritorio`, que hoy prueba los encargos en `VentasView`, y se
pasan esos casos a la pantalla nueva. Se commitea sola, antes de cambiar el
modelo, para que el historial separe "pantalla propia" de "fases".

**E1. El modelo y la fase.** `src/shared/types.ts`, `src/core/encargos.ts`
(`etapaEncargo`, `textoEtapa`, `piezasDe`, `recalcularEncargo`) y
`src/core/cobranza.ts`.
Pruebas: `tests/encargos-etapa.test.ts` con la tabla completa (cada fase; un
precio cambiado después de mandar vuelve a "Por mandar"; todo descartado;
`PENDIENTE` sin `aceptado_el`; `COTIZADA` vieja con precio) y la regla del 0%
en `estadoInicialEncargo`. Error a sembrar: que la fase ignore `cotizado_el`.

**E2. Los repositorios.** `ventas.repo.ts` (`cotizar` con descartes y
`cotizado_el`, `descartarPiezas`, `marcarEnviada`, `aceptar`) y
`pagos.repo.ts` (`aceptado_el`).
Pruebas nuevas en `tests/encargos-fases.test.ts`, contra el Firestore falso:
aceptar sin anticipo; un pago que cubre el anticipo acepta; descartar
recalcula total, anticipo y costo; descartar una pieza comprada se rechaza;
descartar con lo pagado por encima del total nuevo se rechaza; mandar y
volver a cotizar; deshacer cada una. Más los contadores de lecturas en
`tests/integracion.test.ts`: ninguna acción nueva lee más de un documento
aparte de la venta y los parámetros.

**E3. El IPC y el simulador.** `src/shared/ipc-channels.ts`,
`src/shared/ipc-contracts.ts`, `src/preload/api.ts`, `src/main/ipc/index.ts` y
`src/renderer/src/mock-api.ts`. El simulador **devuelve copias**
(CONTEXTO_SESION §4) e imita los campos nuevos.

**E4. El panel.** `panel.repo.ts` y `mobile/src/lib/panel-movil.ts`, con los
avisos nuevos calculados sobre la instantánea que ya se lee: ninguna consulta
nueva. Pruebas en `tests/motor-real/avisos-configurables.test.ts`.

**E5. El documento y el mensaje.** `core/documentos/mensajes.ts` (porcentaje
real, piezas no conseguidas) y `plantillas.ts` (la proforma sin las
descartadas). Pruebas en `tests/documentos.test.ts` y
`tests/whatsapp.test.ts`, con un encargo al 30% que tiene que decir 30%.

**E6. La pantalla.** `EncargosView.tsx` (barra de fases, lista agrupada,
detalle), `CotizarEncargoModal.tsx` ("No se consiguió" por pieza),
`MandarCotizacionModal.tsx` (nuevo), `AceptarEncargoModal.tsx` (nuevo:
"Aceptó", con un pago opcional que arranca en el anticipo esperado) y
`AnularEncargoModal.tsx` (motivo "No aceptó"). Se borra el modo encargo de
`VentasView` y `VentaEditor`.

**E7. Los formularios de encargos con la guía de Emil**: nuevo pedido,
cotizar, mandar, aceptó, anular, pago y entregar. Ver la sección 5.

**E8. Verificación y publicación.** `typecheck`, `test`, `test:emulador`,
`test:interfaz-escritorio` (un flujo nuevo de punta a punta: anotar sin
precio, cotizar con una pieza no conseguida, mandar, aceptar sin anticipo,
comprar con el aviso, recibir el paquete, entregar) y las tres auditorías.
Después, prueba en la app instalada contra la base real con datos "Prueba",
limpieza y comparación en cero. Publicar con `build:exe` y `gh release`, como
dice la memoria del proyecto.

---

## 2b. Corregir una venta y un abono (`2.16.0`, en las dos apps)

**Por qué.** Pedido de Joswill el 29 de septiembre: Ross se equivoca al
cargar (un producto por otro, un monto) y no hay forma de corregir en ninguna
de las dos apps. Para arreglar V-0007 la borró desde la consola de Firebase, y
eso dejó dos productos en "agotado" y un pago contado como cobrado (reparado
el mismo día, ver `CONTEXTO_SESION.md`, sección 3).

### Corregir una venta (`VentasRepo.corregir`)

- **Sólo ventas de inventario** que no estén anuladas. Un encargo se corrige
  como hasta ahora: "Cotizar", "No se consiguió" y anular.
- **Se corrige lo que se cargó**: la clienta, la fecha, las líneas (producto,
  talla, cantidad, precio; o una línea libre), el descuento y las notas. Los
  abonos no: se corrigen aparte.
- **Mantiene su número.** No se anula y se crea otra: la venta es la misma,
  bien cargada.
- **En una sola transacción**: se leen la venta y todos los productos que
  tocan la versión vieja y la nueva. Las unidades de la vieja vuelven a sus
  lotes (`devolverConsumos`) y la nueva sale del lote más viejo (`sacarFIFO`),
  con el mismo reparto del descuento que al crear. O se corrige entera, o no
  cambia nada. Si una línea sin tocar vuelve y sale, sale del mismo lote: el
  resultado es el de haberla cargado bien desde el principio.
- **El costo se congela de nuevo**, con lo que sale ahora.
- **Si lo pagado queda por encima del total nuevo**, se rechaza: "Pagó $X y el
  nuevo total es $Y. Corregí el abono primero".
- **Si falta stock**, se rechaza contando las unidades que la venta devuelve:
  "Disponibles: 2 (contando las de esta venta), pedidas: 3".
- **Una venta con cuotas** conserva sus fechas; los montos se reparten de nuevo
  sobre lo financiado, y lo pagado se vuelve a aplicar en orden.
- **El rastro**: un evento con la venta de antes, que no se deshace (movió
  mercadería), y un movimiento por producto sólo si cambió la cantidad neta
  ("Corrección de V-0008: vuelven 1", "salen 1").

### Corregir un abono (`PagosRepo.corregir`)

- Monto, moneda, fecha, método, referencia y notas. Con la **tasa congelada**
  del abono: corregir no reescribe la tasa.
- Sólo un abono activo de una venta que no esté anulada.
- El pagado y el saldo de la venta se recalculan en la misma transacción, con
  sus cuotas. Un encargo sin aceptar que ahora cubre el anticipo queda
  aceptado; uno aceptado sigue aceptado aunque el abono baje.
- **Se puede deshacer**: guarda el abono de antes (y la venta, si cambió su
  estado).

### Aceptar queda firme

Anular un abono ya no "desacepta" un encargo. Hasta ahora, si el anticipo
dejaba de estar cubierto, volvía a cotizado; con "Aceptó" como paso propio,
eso borraba una aceptación que no dependía del pago.

### Dónde está el botón

- **PC**: "Corregir venta" en el detalle de una venta abre el editor de ventas
  con la venta cargada, sin la parte del cobro, y el último paso muestra qué
  cambia. "Corregir" junto a cada abono: en el detalle de la venta, en
  "Registrar abono", en el historial de Cobros y en los pagos de un encargo.
- **Celular**: en Actividad, "Corregir venta" (una hoja con sus productos:
  cantidades, quitar, agregar del catálogo y la clienta) y "Corregir abono".

### Tareas

C1 núcleo (cuotas a `core/cuotas.ts`), C2 `VentasRepo.corregir`, C3
`PagosRepo.corregir` y aceptar firme, C4 IPC y simulador, C5 PC, C6 celular,
C7 verificación (unidad, emulador, las dos suites de interfaz).

---

## 2c. El historial a la vista, quién lo registró y la moneda del abono (`2.16.1`)

**Por qué.** Joswill, al probar la 2.16.0 (29 de septiembre): en el celular el
historial está escondido (a Actividad se llega tocando el chip "N ventas" de
Inicio) y desordenado; en Windows, corregir desde Cobros no se ve; no se sabe
quién cargó un abono; y un abono pagado en córdobas aparece en dólares, así que
al corregirlo es fácil equivocarse de moneda.

La moneda **sí se guardaba**: cada abono tiene `moneda`, su monto en las dos y
la tasa de ese día, y corregirlo abre en su moneda. Lo que confundía era la
pantalla: casi todas las listas lo muestran primero en dólares, el celular lo
pasaba a córdobas con la tasa de hoy, y el aviso al corregir una venta salía en
dólares.

### La moneda del abono

- **Un abono se muestra como se pagó**: "C$600.00" grande y "$16.38" chico, con
  su propia tasa. En todas las listas de las dos apps (`core/abonos.ts` →
  `montoPagado`, `montoEquivalente`).
- **Al corregirlo**, la moneda es un par de botones con la original marcada
  ("como se registró"). Si se cambia, aparece la cuenta de lo que eso significa:
  "Lo registraste en córdobas. Si fue en dólares, $600.00 son C$21,972.00".
- **Al corregir una venta**, el aviso de lo pagado sale en la moneda de sus
  abonos.
- **Una venta al contado sigue a su abono**: si se pagó entera con un solo
  abono, corregirla ofrece ajustar ese abono al total nuevo, en su moneda y con
  su tasa ("El abono de C$732.40 queda en C$549.30"). Marcado por defecto. Sin
  esto, bajar el precio de una venta al contado exigía corregir primero el
  abono; subirlo la dejaba debiendo la diferencia.

### Quién lo registró

- Cada venta y cada abono nuevos guardan `registrado_por` (`uid` y nombre de la
  cuenta con la que se entró); corregirlos, `corregido_por` y `corregido_en`.
- Se muestra como "Registrado por Ross · 10:42" y "Corregido por Joswill". Lo
  anterior a la 2.16.1 no lo tiene y dice "sin dato": no hay de dónde sacarlo.
- Los repositorios preguntan por la cuenta a `client.ts` (`autorActual`), y cada
  app le dice cómo averiguarla al arrancar: así el código compartido no depende
  de cómo inicia sesión cada una.

### El celular

- **"Historial" es la quinta pestaña** de la barra. Reemplaza a Actividad.
- Agrupado por día ("Hoy", "Ayer", "lun 28 sep") y, dentro del día, por la hora
  en que se registró. Buscar por clienta o código; filtros Todo, Ventas y
  Abonos. Trae ventas y abonos juntos hasta la misma fecha, para que "Todo" no
  muestre días a medias, y "Ver más" trae lo anterior.
- Tocar una fila abre el detalle: "Corregir" es el botón principal, "Anular" el
  secundario.
- En Cobros, el historial de la clienta tiene "Corregir" en cada abono.

**Choca con la 2.17**, que ponía "Encargos" como quinta pestaña. Seis no
entran bien; se decide al empezar la 2.17.

### Windows

- Cobros: las dos pestañas con su número ("Por cobrar (12)", "Abonos (3
  hoy)"); los abonos agrupados por día, en su moneda, con quién los registró y
  "Corregir" y "Anular" escritos. Tocar la fila abre la corrección.
- Clientes: "Corregir" junto a cada abono.

### Tareas

H1 núcleo y datos (`core/abonos.ts`, `autorActual`, tipos), H2 repositorios
(registrado y corregido por, el abono que sigue a la venta), H3 simulador,
H4 Windows, H5 celular, H6 verificación y documentación.

---

## 3. Encargos en el celular (`2.17.0`)

Los repositorios ya se comparten: el celular llama a los mismos métodos de la
2.16.

- **Pestaña nueva "Encargos"** en la barra de abajo: sería la quinta, junto a
  Inicio, Vender, Cobros y Catálogo.
- **La lista por fases**: la misma barra, en fila con desplazamiento lateral,
  y la lista agrupada debajo.
- **Hojas** (con el `BottomSheet` que ya existe):
  - *Anotar pedido*: clienta (con "clienta nueva", como en Vender), qué
    quiere, cantidad y notas. El precio es opcional.
  - *Cotizar*: tienda, peso, costo y precio por pieza, con "No se consiguió".
  - *Mandar*: la vista previa del mensaje y "Compartir".
  - *Aceptó*: con un pago opcional, reusando la lógica de `AbonoModalSheet`.
- **Lo que queda en la PC**: comprar ("Ya lo compré"), recibir, entregar y
  anular con piezas que llegaron. En el celular se ve el estado, sin esos
  botones.

**Mandar desde el celular.** El PDF se genera en el celular y se comparte con
`navigator.share({ files: [pdf], text })`: en Android y en iOS eso abre
WhatsApp con el archivo. WhatsApp a veces descarta el texto cuando va con un
archivo, así que el mensaje también se copia al portapapeles y la hoja lo
dice ("El mensaje quedó copiado"). Si el navegador no puede compartir
archivos (`navigator.canShare`), se usa lo de hoy: el diálogo de impresión y
el `wa.me` con el texto.

**Primera tarea de la 2.17, una prueba corta**: cómo generar el PDF en el
celular. La opción preferida es rasterizar la **misma** plantilla HTML de la
proforma y meterla en un PDF, así no hay dos plantillas que mantener
iguales. Hace falta una dependencia nueva. Se elige midiendo cuánto suma al
build y comprobando en un celular real que el PDF se vea igual al de la
computadora (logo y fuentes incluidos).

**Formularios**: los del celular pasan por la guía de Emil en esta versión
(sección 5), incluido el teclado numérico (`inputMode="decimal"`) en cada
campo de dinero o peso de las hojas nuevas.

**Verificación**: `test:interfaz` (Playwright, la PWA) con el flujo anotar,
cotizar, mandar y aceptar, y `probar:produccion` si cambia alguna consulta.

---

## 4. Sin conexión

### 4.1 Por qué hoy no funciona

Ver el análisis del 28 de septiembre. En resumen:

1. En la PC, Firestore corre en Node y usa sólo la memoria
   ([client.ts:28-40](../src/main/firebase/client.ts#L28-L40)).
2. La sesión de la PC vence en una hora (`restaurarSesion`, en
   [google-auth.service.ts:103](../src/main/firebase/google-auth.service.ts#L103)).
3. Todas las escrituras importantes son transacciones, y Firestore no guarda
   las transacciones para después.
4. El celular guarda los datos, pero el control de acceso lo frena
   ([mobile/src/App.tsx:104](../mobile/src/App.tsx#L104)).

### 4.2 Parte A: abrir y consultar (`2.18.0`)

**S1. Prueba corta, con decisión de seguir o no.** Una ventana de Electron
oculta con Auth (`indexedDBLocalPersistence`) y Firestore
(`persistentLocalCache` con `persistentSingleTabManager`), servida desde el
mismo origen que la app. Tiene que:

- iniciar sesión con la credencial de Google;
- cerrarse, volver a abrir **sin red** y seguir con sesión;
- leer de la caché;
- funcionar con la restricción que tenga la clave de API.

Si algo de eso falla, se pasa al plan B y se lo consulta antes de seguir.
**Plan B**: guardar el refresh token cifrado con `safeStorage`, a través de
una persistencia propia de Auth (una interfaz que Firebase no documenta), y
que el main mantenga una copia local de lectura en JSON. Es más código propio
y más frágil; por eso es el plan B.

**S2. La ventana de datos.** Carpeta nueva `src/datos/` (`index.html`,
`main.ts`, `handlers.ts`), en una ventana sin interfaz con
`contextIsolation`, sin `nodeIntegration` y con `sandbox`.

- Los handlers **de datos** de [ipc/index.ts](../src/main/ipc/index.ts)
  pasan a `src/datos/handlers.ts`, con el mismo `manejar` y los mismos
  repositorios. Los repositorios no cambian: ya corren en un navegador,
  porque la PWA los usa.
- El main sigue atendiendo **todos** los canales. Los de datos los reenvía a
  la ventana de datos (pedido y respuesta con un id); los de sistema los
  resuelve él: PIN y `safeStorage`, diálogos, `printToPDF`, `shell`, el
  actualizador y la vuelta del login de Google.
- `randomUUID` de `node:crypto` pasa a `crypto.randomUUID()`.
- `ApiPuente` no cambia, así que la ventana visible no se entera.
- Se cambia la regla de AGENTS.md: "La ventana visible nunca toca la base; la
  base vive en la ventana de datos, que no tiene interfaz".

**S3. La sesión.** El login de Google sigue en el main (necesita el servidor
local de la vuelta de Google). La credencial se le pasa **una vez** a la
ventana de datos, que inicia sesión y la guarda con su refresh token. Se
acaba el volver a entrar cada hora, y `auth_session.json` se borra.

- Al actualizar desde la 2.15, **hay que entrar con Google una vez más**.
  Avisarle a Ross.
- Las **cuatro puertas** del reclamo de invitación se revisan en su lugar
  nuevo (la memoria del proyecto las lista): ingreso del celular, ingreso de
  Windows, `AUTH_GET_USER`, y el arranque con sesión guardada, que ahora ocurre
  en la ventana de datos al restaurarse Auth.

**S4. Entrar sin conexión.** Se guarda el último `autorizado` de cada UID con
su fecha: en la PC, en el IndexedDB de la ventana de datos; en el celular, en
el suyo. Si ahora la respuesta es `sin-conexion` y la última vez esa misma
cuenta estaba autorizada, se entra en modo sin conexión. En la PC se sigue
pidiendo el PIN. Las reglas siguen mandando en el servidor, así que quitarle
el acceso a alguien surte efecto cuando se reconecta.

**S5. Qué se ve sin conexión.**

- Una franja arriba: "Sin conexión · datos de las 3:40 p. m.". La hora es la
  de la última lectura que vino del servidor (`metadata.fromCache === false`).
- Lo que necesita red se apaga con el motivo a la vista ("Necesita
  internet"): paquetes, cotizar, mandar, anular y configuración.
- Un documento que no está en la caché da un mensaje que se entiende: "Esto
  no está guardado en este aparato. Se ve cuando vuelva la conexión".

**S6. Precarga.** Al arrancar con red se lee lo que se usa sin red: productos
activos, clientas, ventas con saldo, encargos en curso, parámetros y
categorías. Casi todo ya se lee al abrir, así que la diferencia son las
clientas y los encargos. La cantidad de lecturas queda fijada en una prueba
de `tests/integracion.test.ts`, con el número exacto.

**S7. Fuentes locales en la PWA.** Se reemplaza Google Fonts
([mobile/index.html:47](../mobile/index.html#L47)) por archivos dentro del
build, y se cambia el CSP a `font-src 'self'`.

**Verificación**: las suites de siempre, y además, en la app instalada: abrir
con el wifi apagado, navegar, prenderlo y ver que la franja desaparece. En la
PWA, el modo avión.

### 4.3 Parte B: vender, cobrar y anotar pedidos sin red (`2.19.0`)

**Qué entra en la cola**: una venta de inventario, un abono y un pedido de
encargo nuevo (con o sin precio). Cualquiera de los tres puede traer una
clienta nueva adentro, que se crea primero al subir. El resto necesita
conexión.

**Cómo funciona.** Sin red, "Vender" guarda en el aparato lo que hay que hacer
(qué, a quién, cuánto pagó, la fecha de Managua y un `operacion_id`), y lo
muestra como "Pendiente de subir". Al volver la red, cada operación se
reproduce **en orden** por el mismo `VentasRepo.crear` o `PagosRepo.registrar`
de hoy, con su transacción, su validación de stock y sus lotes.

**Que no se duplique.** Cada método recibe un `operacion_id` opcional. Dentro
de su transacción lee `operaciones/<operacion_id>`: si existe, devuelve el
resultado que quedó guardado ahí y no hace nada más; si no existe, lo escribe
junto con la venta. Además se lee **antes** de `siguienteId`
([ventas.repo.ts:361](../src/main/firebase/repositories/ventas.repo.ts#L361),
[pagos.repo.ts:81](../src/main/firebase/repositories/pagos.repo.ts#L81)), para
no gastar un número en una operación que ya se aplicó. La migración que corrió
dos veces y dejó la bodega en $447.18 es el antecedente.

**Cuándo algo entra en la cola**: si se sabe que no hay red, directamente. Si
la llamada falla por red (`unavailable`, `deadline-exceeded`), también, con el
mismo `operacion_id`: si en realidad llegó a guardarse, la marca de
`operaciones` lo detecta al subirla. Cualquier otro error (stock, validación)
se muestra como hoy y no entra en la cola.

**Si una operación falla al subir** (por ejemplo, la última unidad se vendió
desde el otro aparato), queda "Para revisar", con el motivo, y las demás
siguen subiendo. Ross elige "Intentar de nuevo" o "Descartar" (con
confirmación). Nunca se descarta sola.

**Reglas**:

- No se puede abonar a una venta que todavía está en la cola. El pago al
  vender ya va adentro de la venta
  ([ventas.repo.ts:529](../src/main/firebase/repositories/ventas.repo.ts#L529)),
  que es el caso común.
- Deshacer una operación que no subió la saca de la cola.
- La venta lleva la **fecha** del momento en que se hizo. El **número**
  (V-00xx) y el **costo congelado** se fijan al subirla, porque recién ahí se
  sabe de qué lote sale. Mientras tanto, la lista dice "Sin número todavía".
  Esto hay que contárselo a Ross.
- Cada aparato tiene su propia cola. Los choques entre los dos los resuelven
  las transacciones al subir.

**Archivos**:

- `src/core/cola.ts`: puro, con los tipos de operación, sus estados
  (`PENDIENTE`, `SUBIENDO`, `SUBIDA`, `REVISAR`) y el orden.
- `src/shared/cola-local.ts`: guarda la cola en IndexedDB. Es el mismo código
  en la ventana de datos de la PC y en la PWA.
- `src/shared/subir-cola.ts`: reproduce la cola y decide qué error es de red.
- `ventas.repo.ts` y `pagos.repo.ts`: el `operacion_id` y la marca.
- `firestore.rules`: `match /operaciones/{id}`, donde una persona autorizada
  puede crear si no existe, y nadie puede modificar ni borrar. Se despliega
  **antes** que el código: la regla general del final del archivo rechaza
  cualquier colección que no esté nombrada.
- La interfaz: un indicador "Pendientes (3)" en la barra de arriba (y en la
  PWA), la lista de la cola, y el estado "Pendiente de subir" en las listas de
  ventas y cobros.

**Pruebas**:

- `tests/cola.test.ts` para la parte pura.
- En el Firestore falso: subir dos veces la misma operación deja una venta y
  una marca. Error a sembrar: quitar la lectura de la marca, y la prueba tiene
  que fallar.
- Un corte de red simulado a mitad del commit.
- La invariante de la bodega (`tests/motor-real/invariantes.ts`) con ventas
  que pasan por la cola.
- `test:emulador` para la regla nueva.
- En las dos suites de interfaz, `context.setOffline(true)`: vender sin red,
  volver la red y ver la venta con su número.

---

## 5. Los formularios, con la guía de Emil Kowalski

**La regla**: no cambia qué datos pide cada formulario ni cómo se validan, y
los `aria-label` no se tocan, porque las pruebas buscan los campos por ahí.
Lo que cambia es cómo se sienten: el foco, el teclado, dónde aparece un error,
qué pasa al cerrar, y el movimiento sólo donde informa.

**Frecuencia manda.** Lo que se ve decenas de veces al día (cambiar de
pantalla, escribir un número, el total que se actualiza al tipear) no se
anima. Un modal o una hoja, que se abren de vez en cuando, sí llevan su
entrada. Ya existe `prefers-reduced-motion` en las dos apps; se respeta.

**Un solo juego de curvas**, como variables en `temas.css`:
`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` para entradas y salidas, y la de
hoja que ya usa `BottomSheet` (`cubic-bezier(0.32, 0.72, 0, 1)`). La de hoy
(`0.16, 1, 0.3, 1`) es casi igual y se reemplaza por la variable.

### 5.1 Lo que ya se encontró en los formularios de encargos

| Antes | Después | Por qué |
| --- | --- | --- |
| Un clic afuera o Escape cierra "Nuevo encargo" y "Cotizar" y **borra lo escrito** ([NuevoEncargoModal.tsx:135-137](../src/renderer/src/views/encargos/NuevoEncargoModal.tsx#L135-L137), `useCerrarConEscape`) | Con cambios sin guardar, cerrar pregunta con `Confirmar.tsx`, con el foco en "Seguir editando". Sin cambios, cierra como hoy | Perder cinco piezas escritas por un clic de más es lo peor que puede hacer un formulario |
| El error sale en una línea al pie ("Escribí qué quiere en cada pieza", línea 281), lejos del campo | El error va en el campo (`Field` ya tiene `error`) y el foco salta al primer campo con problema | Se ve dónde está el problema sin buscarlo |
| "Otra pieza" agrega la fila pero el foco se queda en el botón (líneas 262-269) | El foco va a la descripción nueva; la fila entra con opacidad y `translateY(4px)` en 150 ms `ease-out`, y al quitarla desaparece al instante | Agregar y escribir es un solo gesto; salir rápido, entrar suave |
| La lista de clientas aparece de la nada (línea 184) | Opacidad y `scale(0.98)` a 1 en 150 ms, desde arriba (`transform-origin: top`) | Un desplegable nace de su campo, no del centro |
| "Sugerido $X · Usar" cambia el precio sin ninguna señal ([CotizarEncargoModal.tsx:244-254](../src/renderer/src/views/ventas/CotizarEncargoModal.tsx#L244-L254)) | El campo de precio se ilumina 200 ms al tomar el sugerido | Indica qué cambió; es un uso ocasional |
| El modal entra con `animate-modal-pop` y al cerrar desaparece de golpe | Salida de 120 ms (opacidad y `scale(0.98)`), más corta que la entrada; el modal sigue centrado | Sin salida se siente roto; la salida va más rápida que la entrada |
| "Guardar" cambia su texto a "Guardando…" y el botón cambia de ancho | Ancho fijo; el texto cambia con opacidad dentro del botón | El botón no salta bajo el cursor |
| Guardar sólo con el mouse | `Ctrl+Enter` guarda, sin animación | Una acción de teclado nunca se anima |
| El total del pie cambia en cada tecla | Queda igual: cifras tabulares, sin animación | Se ve decenas de veces por formulario |

### 5.2 La lista completa, y cuándo va cada uno

| Versión | Formularios |
|---|---|
| `2.16` | Nuevo pedido, Cotizar, Mandar (nuevo), Aceptó (nuevo), Anular encargo, `PagoModal`, Entregar |
| `2.17` | Las hojas de encargos del celular, `AbonoModalSheet`, `AbonoSelectorSheet`, Vender (`QuickSaleView`) |
| `2.20` | `VentaEditor`, `PaqueteEditor`, `ReconstruccionModal`, `ProductoModal`, `AjustarStockModal`, `RevisarPreciosModal`, la clienta en `ClientesView`, las secciones de `ConfigView`, `LoginView` y `PinLockView` de las dos apps, `AjustesView` del celular |
| `2.20` | La tipografía de la factura y la proforma (`plantillas.ts`): hoy Plus Jakarta Sans, la misma de la PWA, cargada desde Google Fonts. Es una decisión de marca: se le muestra a Ross una muestra con dos o tres opciones antes de cambiar nada. Sea cual sea, el archivo va dentro del build, para que el PDF salga igual sin internet (ver S7) |

Cada formulario se revisa con la lista de la guía y deja su tabla antes y
después en el commit. En los del celular, además: teclado numérico en dinero
y peso, efectos de `hover` sólo con `@media (hover: hover)`, y cerrar la hoja
arrastrando rápido aunque no pase la mitad (por velocidad, no sólo por
distancia). Hay que confirmar si `BottomSheet` ya lo hace: hoy anima con la
curva de hoja, pero no se revisó si mide la velocidad.

---

## 6. Riesgos y lo que hay que avisarle a Ross

- **2.16**: "Te deben" sube antes, porque cuenta un encargo desde que acepta
  (sección 2.5).
- **2.18**: hay que entrar con Google una vez después de actualizar. Los datos
  de la caché quedan en el disco de la PC sin cifrar, igual que hoy en el
  celular.
- **2.19**: una venta sin red recibe su número y su costo al subirse. Un
  choque de stock entre los dos aparatos queda "Para revisar", no se pierde.
- **Numeración**: si una venta falla después de pedir su número, ese número se
  pierde. Ya pasa hoy; con la cola puede pasar un poco más. No afecta la
  plata.
- **2.17**: una dependencia nueva para el PDF en el celular, que se elige
  midiendo su peso en el build.

---

## 7. Qué se actualiza en la documentación, en cada versión

- `CONTEXTO_SESION.md`: el estado, lo que cambió en los números y las
  trampas nuevas.
- `AGENTS.md`: la regla de arquitectura (2.18), la colección `operaciones` y la
  cola (2.19), y las fases del encargo (2.16).
- Este documento: al final de cada versión, un "Estado al …" como el de
  `PLAN_LOTES_Y_ENCARGOS.md`, con lo que cambió al verlo en pantalla.

---

## Estado al 28 de septiembre

**2.16: hecha en local, sin publicar.** Tareas E0 a E7, un commit cada una
(más dos de ajustes). Verificado: `tsc` de las dos apps, 433 pruebas, 92
contra el emulador, 16 casos de interfaz de escritorio, 9 de la PWA, las tres
auditorías y el build del celular. Faltan los pasos de E8 que tocan
producción, con el visto bueno de Joswill (ver `CONTEXTO_SESION.md`, P0).

Cambios respecto de lo escrito arriba, al implementarlo o verlo en pantalla:

- **La cotización lleva versión** (`cotizacion_version`,
  `cotizacion_enviada_version`), no sólo fecha: cotizar y mandar pueden caer
  en el mismo instante. Las fechas quedan en `AAAA-MM-DD`.
- **"Aceptó" con pago: primero el pago, después aceptar**
  (`aceptarEncargo`); al revés, deshacer el grupo quedaba bloqueado. Un pago
  que acepta guarda ahora la instantánea de la venta: antes, deshacerlo
  dejaba el encargo confirmado. `aceptado_el` es la fecha del pago, no la de
  hoy.
- **El "50%" también estaba en la proforma impresa**, no sólo en el mensaje,
  y la plantilla vieja está guardada tal cual en producción. Se reconoce y se
  reemplaza; una propia se respeta.
- **"Debe" en la lista sólo muestra deuda** (`esDeuda`): mostraba el total de
  cotizaciones que la clienta todavía no aceptó.
- **El modo encargo de `VentasView` se borró; el de `VentaEditor` queda** hasta
  la 2.20, cuando se revise ese formulario (hoy nadie lo abre así). La
  búsqueda de Ventas ya no trae encargos.
- **La pantalla estaba sin commit** desde la 2.15.1 (sección 1, punto 7): se
  adoptó como punto de partida (E0).
- Encontrado de paso y corregido: cambiar de encargo pedía dos clics;
  `PagoModal` ignoraba la moneda y el método de Configuración; un foco con
  `setTimeout` robaba el cursor; los avisos de encargos llevaban a Ventas.

## Estado al 29 de septiembre

**2b, corregir una venta y un abono: hecha en local, sin publicar**, dentro
de la 2.16. Tareas C1 a C7 en seis commits. Verificado: `tsc` de las dos
apps, 457 pruebas (20 nuevas en `tests/correcciones.test.ts`), 93 contra el
emulador (una nueva: la transacción de corregir pasa las reglas), 17 casos de
interfaz de escritorio y 10 de la PWA (uno nuevo en cada una), las tres
auditorías y el build del celular.

Cambios respecto de lo escrito arriba, al implementarlo:

- **Cambiar la clienta de una venta cambia también la de sus abonos**: cada
  abono guarda `cliente_id`, y sin esto seguían en la ficha de la clienta
  anterior.
- **Las cuotas cambian lo mismo que el total**: lo financiado es lo de antes
  más la diferencia, porque lo que pagó al contado no cambia. Deshacer un
  abono corregido ahora también reparte las cuotas
  (`operacionRecalcularSaldo`).
- **En el celular el precio de una línea y el descuento no se tocan**: se
  corrigen en la computadora. Lo que se agrega va al precio del catálogo.
- **Un encargo no se corrige así** (se cotiza, se marca "No se consiguió" o
  se anula), y en el celular el botón no aparece para un encargo.
- Encontrado de paso y corregido: la lista de abonos recientes (Actividad y
  el historial de Cobros) decía "Cliente" en todos.

**Publicada como `v2.16.0` el mismo 29** (Windows por GitHub, con
`latest.yml`, y la PWA), a pedido de Joswill, que la prueba él mismo.

**2.16.1, hecha y publicada el mismo 29** (sección 2c, tareas H1 a H6),
a pedido de Joswill. Cambios respecto de lo escrito en 2c, al hacerlo:

- **En Windows, tocar un abono abre la corrección** en vez de un panel al
  costado: la ventana de corregir ya muestra el abono, quién lo registró y
  cómo queda la venta.
- **"Ver más" en el Historial corre un corte común**: se muestran ventas y
  abonos hasta el día más nuevo en que alguna de las dos listas se quedó sin
  traer, sin incluirlo, para que "Todo" no muestre días a medias.
- **Un centavo de diferencia entre lo pagado y el total cuenta como pagada
  entera** al decidir si una venta es al contado: es el redondeo de pagar en
  córdobas.
- **El nombre que se muestra es el primero de la cuenta de Google** ("Rosa"
  de "Rosa María Pérez"), o lo de antes de la arroba si la cuenta no tiene
  nombre.
