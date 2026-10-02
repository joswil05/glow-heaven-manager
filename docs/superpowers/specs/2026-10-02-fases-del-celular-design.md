# Fases del celular (C1 a C4): diseño

> **Para quién es esto**: Joswill, y las sesiones de Claude y de Codex que
> implementen cada fase.
> **Fecha**: 2 de octubre de 2026. **Estado**: diseño acordado con Joswill;
> no hay código todavía.
> **Leer antes**: [CONTEXTO_SESION.md](../../CONTEXTO_SESION.md),
> [AGENTS.md](../../../AGENTS.md), y la sección 5 de
> [AUDITORIA_UX_2026-09-29.md](../../AUDITORIA_UX_2026-09-29.md), donde estas
> fases quedaron entre la Fase 2 y la Fase 3.

## Por qué

Ross usa sobre todo el celular, y el celular hace mucho menos que la
computadora: no tiene encargos, no trabaja sin señal, su inventario es sólo
consulta y no se puede registrar mercadería. Además, con el primer paquete
casi vendido, Inicio vive lleno de alertas de productos agotados que no
avisan nada útil, y van a seguir ahí cuando llegue el próximo paquete.

## Lo que se decidió el 2 de octubre

1. **Qué entra**: encargos, trabajar sin internet, y en el inventario
   cambiar un precio y registrar un paquete. La pantalla de clientas no
   entra por ahora; editar la ficha de un producto y ajustar existencias
   desde el celular tampoco.
2. **Encargos en el celular**, como se decidió el 28/9: anotar, cotizar,
   mandar la cotización y "Aceptó". Comprar, recibir, entregar y anular
   siguen en la PC.
3. **Encargos no va en la barra de abajo**: es lo que Ross menos usa. Se
   abre desde una tarjeta de Inicio y desde "Anotar un pedido" en Vender. La
   barra queda como está (Inicio, Vender, Cobros, Historial, Inventario).
4. **Los agotados: "el paquete se cierra"**, con un resumen al cerrarse. Se
   quitan las alertas de agotados y de "por acabarse".
5. **El paquete se registra desde el celular cuando llega**, de una vez.
6. **Sin internet**: consultar y operar, **sólo en el celular**.
7. **Orden**: estas cuatro fases van antes de las fases 3 a 6 de la
   auditoría, que quedan como estaban.
8. **La sección de productos se llama "Inventario"** en las dos apps.
9. **Todo lo nuevo sigue los criterios de Emil Kowalski** (sección
   "Criterios de diseño", abajo) y no puede ser tedioso de usar.
10. **Se trabaja junto con Codex** (sección "Cómo se reparte el trabajo").

## El orden

| Orden | Fase | Qué trae |
|---|---|---|
| 1 | Fase 2 (hecha, `481d24a`) | Publicarla con el "publicalo" de Joswill, junto con "Fue un error" (reglas de Firestore primero). |
| 2 | **C1 · Inventario por paquete** | Sin alertas de agotados; avance, cierre y resumen de cada paquete; registrar un paquete desde el celular. |
| 3 | **C2 · Inventario y encargos en el celular** | Inventario con lo que hay, cambiar un precio; encargos: anotar, cotizar, mandar con PDF, "Aceptó". |
| 4 | **C3 · Sin internet: consultar** | Abrir y ver todo sin señal. |
| 5 | **C4 · Sin internet: operar** | Vender, cobrar y anotar pedidos sin señal, que se suben solos. |
| 6 | Fases 3 a 6 de la auditoría | El pulido de lo que ya existe. |

Cada fase se publica por separado, con su versión, y sólo con el
"publicalo" de Joswill. La versión se decide al publicar.

---

## C1 · Inventario por paquete

### Las reglas

- **"A la venta" es lo que tiene existencias.** Un producto en 0 no se
  borra ni se descataloga: sigue existiendo, con su historia, su último
  costo y su precio, y se ve dentro de su paquete.
- **Un paquete recibido está abierto mientras le quede alguna unidad** en
  sus lotes de inventario, y **cerrado** cuando no le queda ninguna. Ese
  estado se **calcula**, no se guarda: si se anula una venta y vuelven
  unidades a un lote, el paquete se reabre solo. Las líneas que vinieron
  para un encargo no cuentan: no son inventario.
- **Un producto que vuelve a llegar** se busca al registrar el paquete
  nuevo (el buscador ya incluye los descatalogados) y se suma a la misma
  ficha, con un lote nuevo. Si es parecido pero distinto, se crea otro.
- **No hay alertas de existencias.** Se quitan "N productos agotados" y "N
  productos por acabarse" (`panel.repo.ts`), y la lista `bajo_stock` deja de
  mostrarse en Inicio. `stock_minimo` queda guardado pero nada lo usa:
  borrarlo sería una migración que no compra nada.

### El resumen de un paquete

Una función del núcleo, `resumenDelPaquete`, en un archivo nuevo de
`src/core/` con sus pruebas unitarias, que usan las dos apps. Dice:

- unidades vendidas de las recibidas, y qué queda (producto, talla o tono);
- cuánto se invirtió (costo aterrizado, con flete y 7%), cuánto se vendió y
  cuánto se cobró;
- la ganancia;
- cuánto tardó en venderse, si está cerrado;
- los productos que se vendieron más rápido;
- quién debe todavía algo de ventas de ese paquete.

Para saber de qué paquete salió cada unidad vendida se usan los lotes que
ya guarda cada línea de venta ("cada unidad vuelve a su lote exacto"). La
primera tarea de C1 lo comprueba en el código antes de escribir nada.

Cuando un paquete se cierra, su resumen aparece en Inicio en las dos apps
hasta que Ross lo cierra. Eso sí se guarda: `resumen_visto_el` en el
documento del paquete, para que cerrarlo en una app lo cierre en la otra.

### Las pantallas

**Inicio (las dos apps)**: en lugar de la tarjeta "Stock crítico", una
tarjeta por paquete abierto: "PQ-0001 · 18 de 22 vendidos · quedan 4
piezas · recuperaste $X de $Y". Tocarla abre el paquete. Si hay un paquete
recién cerrado, su resumen va arriba, con "Listo" para cerrarlo.

**Inventario (las dos apps)**: abre mostrando lo que hay a la venta.
"Agotados" deja de ser una alerta: es lo que se ve dentro de cada paquete.
"Paquetes anteriores" lista los cerrados, con su resumen.

**Paquetes (Windows)**: cada paquete recibido muestra su avance y, cerrado,
su resumen.

**"Llegó un paquete" (celular, nuevo)**: un botón en Inventario que abre una
pantalla completa en tres pasos. Pide los mismos datos que la PC y usa
`ComprasRepo`, sin una regla aparte:

1. **El paquete**: fecha, flete pagado, si lleva el 7%.
2. **Las piezas**: una lista. "Agregar pieza" abre una hoja corta: buscar
   un producto existente (también de paquetes anteriores) o crear uno
   nuevo (nombre, categoría, tallas o tonos), cantidad, lo que pagó por
   unidad y el peso. La hoja queda abierta para la siguiente pieza.
3. **Revisar**: el costo final de cada pieza y el precio sugerido
   (editable), el total, y "Recibir", que lo deja en el inventario.

Se guarda solo como borrador (`BORRADOR`) mientras se carga: si se
interrumpe, se sigue en el celular o en la PC.

### Hallazgos de la auditoría que se resuelven acá

Estas pantallas cambian en C1, así que sus hallazgos salen de las fases 3 a
6 y se resuelven acá, para no tocarlas dos veces: CIN-01, CIN-02, CIN-03,
CIN-07 y CIN-09 (la tarjeta de stock del Inicio del celular, que se
reemplaza); INV-08 e INV-10 (los filtros del Inventario de Windows);
PAQ-15, PAQ-16, PAQ-17, PAQ-18 y PAQ-21 (la pantalla de Paquetes; PAQ-17,
el 7% del paquete y no el de hoy, importa además para el resumen).

### Cómo se comprueba

- Pruebas unitarias de `resumenDelPaquete` y del estado abierto o cerrado:
  un paquete con líneas de encargo, un producto con lotes de dos paquetes,
  una venta anulada que lo reabre.
- Contra el emulador: vender la última unidad cierra el paquete; anular esa
  venta lo reabre; `resumen_visto_el` se guarda.
- Interfaz de Windows: Inicio ya no muestra la alerta de agotados; el
  Inventario abre con lo que hay; Paquetes muestra el avance.
- Interfaz del celular: registrar un paquete completo desde "Llegó un
  paquete" y verlo a la venta; interrumpirlo y seguirlo.

---

## C2 · Inventario y encargos en el celular

### Inventario

- Abre con lo que hay a la venta, con un solo filtro (categoría o paquete).
  La pestaña pasa de "Catálogo" a "Inventario", con un ícono de inventario y
  no una lupa. Resuelve CCA-02, CCA-03, CCA-04 y CCA-05, que salen de las
  fases 5 y 6.
- **Cambiar un precio**, desde la ficha del producto: muestra lo que costó
  (con flete y 7%), el precio de ahora y la ganancia; al escribir el
  precio nuevo, la ganancia se recalcula mientras escribe. Guarda con
  Deshacer, por el mismo camino que la PC (`precio_manual_usd_cents`).

### Encargos

- **Entrada**: una tarjeta en Inicio que dice qué espera algo de ella ("2
  por cotizar · 1 esperando respuesta"), que abre la lista por fases; y
  "Anotar un pedido" en Vender.
- **La lista por fases**: la misma barra de fases de la PC, en fila con
  desplazamiento lateral, y la lista agrupada debajo. Lo que queda en la PC
  (comprar, recibir, entregar, anular) se ve como estado, sin botones.
- **Hojas**: *anotar pedido* (clienta, con "clienta nueva" como en Vender,
  qué quiere, cantidad, notas, precio opcional); *cotizar* (tienda, peso,
  costo y precio por pieza, "No se consiguió"); *mandar* (vista previa del
  mensaje y "Compartir"); *aceptó* (con pago opcional, por la hoja de abono
  que ya existe).
- **Mandar la cotización**: el PDF se genera en el celular con la **misma**
  plantilla de la proforma y se comparte con la hoja de compartir del
  sistema (`navigator.share` con el archivo), que abre WhatsApp. El mensaje
  queda además en el portapapeles, porque WhatsApp a veces lo descarta
  cuando va con un archivo, y la hoja lo dice. Si el teléfono no puede
  compartir archivos, se usa lo de hoy.
- **Primera tarea de C2, una prueba corta**: generar ese PDF en un celular
  real. Se mide cuánto suma la dependencia al build y se compara con el PDF
  de la PC (logo y letra incluidos). Si no queda igual, se decide con
  Joswill antes de seguir.

### Cómo se comprueba

Interfaz del celular: anotar, cotizar, mandar y aceptar un encargo; cambiar
un precio y deshacerlo. Pruebas unitarias de lo que se agregue al núcleo.

---

## C3 · Sin internet: consultar (sólo celular)

- La app guarda en el teléfono lo último que cargó (la caché persistente de
  Firestore y la sesión de Auth en IndexedDB) y, sin señal, abre y muestra
  todo con una franja arriba: "Sin conexión · datos de las 10:42".
- El control de acceso (`mobile/src/App.tsx`) hoy frena la app sin red: pasa
  a recordar que esta cuenta ya tenía acceso.
- Vender, cobrar y anotar sin red todavía no se puede: los botones lo dicen
  en vez de fallar.
- **Riesgo a probar en un iPhone**: Safari puede borrar los datos de un sitio
  que no se abre en días; la app instalada en la pantalla de inicio no
  tiene ese límite. La primera tarea lo comprueba.
- **Cómo se comprueba**: interfaz del celular con la red cortada
  (Playwright `context.set_offline(True)`): abre, muestra los datos y la
  franja, y los botones de escribir explican por qué no.

## C4 · Sin internet: operar (sólo celular)

- **Qué entra en la cola**: una venta de inventario, un abono y un pedido de
  encargo, cada uno con su clienta nueva si la trae (se crea primero). Se
  ven como "Pendiente de subir".
- **Al volver la red** se suben en orden por los mismos `VentasRepo.crear`,
  `PagosRepo.registrar` y el alta de encargo de hoy, con su transacción y
  sus validaciones.
- **Que no se duplique**: cada operación lleva un `operacion_id`. Dentro de
  su transacción, el método lee `operaciones/<operacion_id>`: si existe,
  devuelve lo que quedó guardado y no hace nada más; si no, lo escribe
  junto con la venta. Se lee antes de `siguienteId`, para no gastar un
  número. El detalle está en
  [PLAN_ENCARGOS_Y_SIN_CONEXION.md](../../PLAN_ENCARGOS_Y_SIN_CONEXION.md),
  sección 4.3.
- **Lo que no se puede subir** (el producto se vendió en la PC mientras
  tanto, una validación) queda en "No se pudo subir", con qué pasó y qué
  hacer. Nunca se pierde en silencio.
- **Cómo se comprueba**: contra el emulador, la misma operación subida dos
  veces escribe una vez; interfaz del celular con la red cortada: vender,
  cobrar y anotar, volver la red y verlo subido.

---

## Criterios de diseño para todo lo nuevo

Las reglas de Emil Kowalski, llevadas a estas pantallas:

- **Lo frecuente en pocos toques.** Agregar una pieza deja la hoja abierta
  para la siguiente; cambiar un precio es tocar, escribir y guardar.
- **Nada se anima en lo que se repite** (agregar piezas, pasar de paso,
  filtrar). Lo que se anima (abrir una hoja, el resumen que aparece) dura
  menos de 300 ms, con la curva de salida de la casa, y respeta a quien
  pidió menos movimiento. Nada late ni se mueve solo.
- **Las hojas y pantallas nuevas preguntan antes de descartar**
  (`BottomSheet` con `hayCambios`), dicen los errores en su campo y confirman
  una sola vez, con Deshacer cuando se puede.
- **Teclado numérico** en cada monto y peso (`inputMode="decimal"`), campos
  de 16 px y blancos de 44 px.
- **Colores por token**, nunca escritos a mano; el par fondo y texto pasa la
  auditoría de colores y el caso de contraste de las suites.
- **Los textos siguen el glosario** (anexo A de la auditoría): Inventario,
  clienta, anular, en bodega, abono.

## Cómo se reparte el trabajo (Claude y Codex)

- **Cada fase se parte en tareas.** Cada tarea tiene un dueño, sus archivos
  (dos tareas a la vez no tocan el mismo archivo) y sus pruebas, y se
  escribe primero la prueba que falla.
- **Un worktree por tarea**, commits sólo con rutas explícitas
  (`git add -- <rutas>`). Nadie publica ni hace push: integra quien Joswill
  diga, después de correr las suites completas.
- **El emulador se usa de a uno**, avisando antes y después: las suites
  borran su base.
- **Cada tarea la revisa el otro**: lo de Claude lo revisa Codex y al revés.
- **C1, por ejemplo**:
  - **T1 · Núcleo** (primero, las demás dependen de él): `resumenDelPaquete`,
    el estado abierto o cerrado, quitar las alertas de existencias en
    `panel.repo.ts`, `resumen_visto_el`, y sus pruebas unitarias y contra el
    emulador.
  - **T2 · Windows**: Inicio, Inventario y Paquetes.
  - **T3 · Celular**: Inicio e Inventario.
  - **T4 · Celular**: "Llegó un paquete".
  - T2, T3 y T4 van en paralelo una vez que T1 está integrada.

## Lo que queda abierto

- C2: la prueba del PDF en el celular decide cómo se genera.
- C3: cuánto aguanta la caché en un iPhone, a probar con la app instalada.
- C4: qué hacer con una venta sin red de un producto que ya no hay: se
  muestra en "No se pudo subir"; si conviene ofrecer algo más se decide al
  verlo funcionar.
