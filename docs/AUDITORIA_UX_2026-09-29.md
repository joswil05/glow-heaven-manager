# Auditoría de interfaz y experiencia (UX/UI) · Glow Heaven Manager

> **Fecha**: 2026-09-29 · **Versión auditada**: `2.16.2` (commit `53f15ce`), escritorio y celular.
> **Alcance**: todas las pantallas, ventanas, hojas, menús y avisos de las dos apps; cada texto de interfaz (los 1.124); la factura, la proforma y los mensajes de WhatsApp.
> **Criterio**: coherencia entre pantallas y entre las dos apps; formularios que no hagan perder trabajo ni plata; legibilidad (contraste medido con la fórmula de WCAG sobre los tokens de `temas.css`, en los dos temas); textos; y las reglas de movimiento de Emil Kowalski: qué se anima, cuánto dura, con qué curva, y qué no se anima nunca (lo que se hace decenas de veces al día y lo que se hace con el teclado).
> **Método**: lectura completa del código de las 75 pantallas y componentes (`src/renderer/src`, `mobile/src`, `src/core/documentos`). Lo que se podía comprobar sin tocar código se comprobó en un navegador: el paquete de escritorio construido contra el simulador, y la PWA contra el emulador local. **Nada contra producción. No se modificó ningún archivo de código.**
> **Cada hallazgo dice dónde está, cómo es hoy, cómo debería ser y por qué.** Los verificados en la app lo dicen.

---

## Resumen

Las dos apps funcionan, y hay mucho bien resuelto (el editor de paquetes con su cuenta a la vista, la corrección de ventas que muestra qué cambia, la hoja del celular que se arrastra con el dedo, el historial por día con quién hizo cada cosa). Lo que falta para darlas por terminadas no es una pantalla nueva: es **que todo se comporte igual en todos lados**. Hoy la misma tarea tiene varias versiones que se portan distinto:

- **Cuatro formularios para registrar un abono**, y el peor es el que está más a mano: en Cobros, "Abonar" en la fila de una venta **manda la plata a otra venta** (la más vieja de esa clienta), y "Registrar abono" arranca con **la primera clienta de la lista ya elegida**.
- **Dos marcos de ventana**: 8 ventanas preguntan "¿Descartar lo que escribiste?" y 9 se cierran con Escape o con un clic afuera **sin preguntar**, entre ellas Nueva venta y Registrar paquete (30 líneas se pierden con una tecla).
- **Ocho mensajes de WhatsApp** distintos para las mismas cosas, casi ninguno con las plantillas de Configuración.
- **La tasa de hoy donde tendría que ir la tasa de la venta**: la factura reimpresa, los recordatorios de cobro y "Pagar todo" del celular calculan los córdobas con la tasa del día, y los abonos se registran con la de la venta.

Y hay cuatro errores que **cambian datos sin que nadie lo decida**, dos de ellos verificados en la app:

1. **Ajustes del celular abre con el nombre y el teléfono del negocio vacíos**, y el botón "Guardar cambios" ya visible. Si se toca, el negocio queda sin nombre en las dos apps y en las facturas. *(Verificado en el emulador.)*
2. **Guardar Configuración en Windows recalcula en silencio todos los precios** del catálogo (los que no son "precio fijo"), aunque sólo se haya cambiado un mensaje. Sin aviso, sin Deshacer y sin registro.
3. **Ctrl+Z dentro de un campo deshace la última operación guardada** (un abono, una venta) mientras su aviso de "Deshacer" siga en pantalla.
4. En Cobros, **"Abonar" en una fila aplica el abono a otra venta** (ver arriba).

| Nivel | Qué significa | Cantidad |
|---|---|---|
| **A** (alto) | Puede hacer perder trabajo o plata, registrar algo a la persona o venta equivocada, o esconder información importante (texto ilegible). | 20 |
| **M** (medio) | Incoherencia que confunde, fricción de todos los días, o una regla de diseño rota que se nota. | 119 |
| **B** (bajo) | Pulido: textos, espaciado, animaciones, detalles de consistencia. | 260 |
| | **Total** | **399** |

**¿Está todo listo?** Para el trabajo de todos los días, casi. Para darlo por hecho, no: los cuatro errores de arriba y los problemas de formulario de nivel A tienen que resolverse antes, porque tocan plata. El plan de abajo los pone primero, en una fase corta y separada del resto.

### Cómo leer las tablas

Cada fila: **ID** (para referirse a él en el plan), **nivel**, **dónde** (archivo:línea), **antes** (cómo es hoy), **después** (la propuesta) y **por qué**. Los prefijos son por pantalla: `TRA` transversales, `BAS` componentes base, `MAR` marco y acceso, `INI` Inicio, `VEN`/`VED` Ventas y su editor, `ENC` Encargos, `PAG` registrar y corregir abono, `COB` Cobros, `CLI` Clientes, `INV` Inventario, `PAQ` Paquetes, `CFG` Configuración, `DOC` documentos, `COL` sistema de color, `TXT` textos, y en el celular `CEL` base, `CIN` Inicio, `CVE` Vender, `CCO` Cobros, `CHI` Historial y correcciones, `CCA` Catálogo, `CAJ` Ajustes y entrada.

---

## 1. Lo más grave (nivel A)

| ID | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|
| CAJ-01 | celular `AjustesView.tsx:53-55` | Las pantallas se montan al abrir la app, antes de que lleguen los parámetros; Ajustes copia nombre y teléfono una sola vez, vacíos, y muestra "Guardar cambios" sin que se toque nada. **Verificado**: con "Glow Heaven Prueba" y "8888-0000" guardados, los campos aparecen en blanco. | Los campos se llenan cuando llegan los parámetros (y se actualizan si cambian); la barra "Guardar" sólo aparece con un cambio real. | Un toque borra el nombre y el teléfono del negocio en las dos apps y en todas las facturas. |
| CFG-01 | `ConfigView.tsx:437-464` + `parametros.repo.ts:191-197` | "Guardar configuración" manda siempre el margen y el redondeo, y el repositorio, si vienen, llama a `recalcularPrecios()`: cada guardado reescribe los precios que no coinciden con la fórmula, sin aviso, sin Deshacer y sin evento de auditoría. | Mandar sólo lo que cambió. Si cambia el margen o el redondeo, abrir "Revisar precios" (la lista con antes → después) en vez de aplicarlo. | "Revisar precios" existe para que Ross decida precio por precio; guardar un mensaje de WhatsApp no puede cambiar lo que cobra. |
| BAS-01 | `ToastContext.tsx:121-135` | Ctrl+Z en cualquier lado, incluso escribiendo en un campo, ejecuta el "Deshacer" del aviso visible, y del aviso **más viejo** (`find`). | Ignorar Ctrl+Z si el foco está en un campo de texto; si no, deshacer el aviso **más reciente**. | Ctrl+Z en un campo es "borrar lo que escribí"; hoy anula un abono o una venta ya guardada. |
| COB-01 | `CobranzaView.tsx:641-652` + `pagos.repo.ts:500-590` | "Abonar" en la fila de una venta (María · V-0015) abre el abono **por clienta**, que no manda la venta y reparte por antigüedad: el dinero va a V-0009. Si V-0015 es un encargo esperando anticipo, no pasa a "por comprar". | "Abonar" en una fila abre el registro de abono **de esa venta** (el mismo de Ventas). El reparto por antigüedad queda como una opción aparte que dice a qué ventas va. | El botón está al lado de una venta y registra el pago en otra. La API ya acepta `venta_id`. |
| COB-02 | `CobranzaView.tsx:438-441,696-706` | "Registrar abono" arranca con la **primera clienta de la lista** elegida, deba o no, en un `<select>` sin búsqueda con todas las clientas. | Sin clienta elegida; un buscador que muestra primero las que deben, con su saldo. | Escribir el monto rápido y guardar le registra el abono a otra persona. |
| COB-03 | `CobranzaView.tsx:676-796` | Tercera versión del formulario de abono: marco propio (Escape y la X cierran sin preguntar), selects nativos, "Monto (USD)", sin equivalencia en la otra moneda, sin "cómo queda", errores en avisos flotantes en "tú", sin Deshacer. | Reemplazarla por la ventana de abono de Ventas (ver Fase 2). | Es la puerta más directa para cobrar y la que menos protege. |
| CLI-01 | `ClientesView.tsx:507-603` | Cuarta versión del abono, desplegable dentro de la ficha: Enter en cualquier campo guarda, sin notas, sin equivalencia, y un clic fuera de la ficha la cierra y se pierde lo escrito. | Un botón "Registrar abono" que abre la misma ventana de abono. | Mismo dato, cuatro formularios que se portan distinto. |
| TRA-01 | 9 ventanas (lista en §2) | Escape y clic en el fondo cierran **sin preguntar**: Nueva venta, Registrar paquete, Producto, Clienta, abono de Cobros, Ajustar existencias, Revisar precios, Completar paquete, Factura. | Todas sobre `Dialogo` (el marco que pregunta "¿Descartar lo que escribiste?", con salida animada y Ctrl+Enter). | Una tecla borra un paquete de 30 líneas o una venta armada. |
| PAQ-01 | `PaqueteEditor.tsx:335` | En "Registrar paquete", Escape para cerrar la lista de sugerencias (producto, encargo) cierra el editor entero. En "Nueva venta" el primer Escape sí cierra sólo la lista (`VentaEditor.tsx:238-240`); el que se lleva la venta es el segundo, que es VED-01. | Escape cierra primero lo que está desplegado; recién el segundo Escape pregunta si descartar. | Es el gesto natural para cerrar una lista, y hoy destruye el formulario. |
| VED-03 | `VentaEditor.tsx:1441-1461,1824-1831` | Vendiendo al contado en córdobas no aparece en ningún lado cuántos córdobas cobrar ("Pagada ahora, en efectivo (córdobas)" y el pie dice "Total $25.00"). El único C$ a la vista es el del subtotal **antes** del descuento. | Con contado en córdobas: "Cobrá C$915.50" grande en el paso 3 y en el pie. (El celular ya lo hace.) | Se cobra en córdobas con un número que no está en pantalla o con el equivocado. |
| VED-04 | `VentaEditor.tsx:1647` | En tema oscuro, "Con este descuento perdés $X" es granate oscuro sobre casi negro: **1,12:1**. | Sacar los `dark:` (los tokens ya cambian con el tema) y usar `text-peligro-fuerte`. | Es el aviso de plata más importante del formulario, y no se ve. |
| CVE-01 | celular `QuickSaleView.tsx:689-692` | "COBRAR" de la píldora del carrito: texto claro sobre verde claro, **1,68:1** en oscuro y 3,61:1 en claro. **Verificado en captura.** | `text-acento-texto` (4,95 y 9,64). | Es el botón principal de la venta. |
| COL-01 | `tailwind.config.js:68-91` | `danger/warning/success-700` y `-800` apuntan al color base, no al `-fuerte`. Todos los recuadros de error, aviso y éxito (35 usos) quedan en la combinación que `temas.css` prohíbe: peligro sobre su tinte **3,93:1** en claro. | Mapear 700/800/900 a `-fuerte` (5,7 a 6,2:1). Un cambio de configuración que repara los 35. Sumar la regla a `auditar-colores.mjs`. | Los mensajes de error son justo lo que hay que poder leer. |
| COL-02 | `Badge.tsx:7-14` y afines | Badges, pastillas y contadores con `text-x` sobre `bg-x-suave` (peligro 3,93:1). | `text-x-fuerte` sobre `bg-x-suave`, como dice la regla. | "Agotado", "Vencida", "Debe" son las señales más importantes y las menos legibles. |
| DOC-01 | `plantillas.ts:41,452` + `mensajes.ts:62-63` | Factura, proforma y su mensaje calculan los córdobas con la tasa **de hoy** (la de la venta sólo si no hay tasa configurada). Reimprimir una factura vieja da otro "Total C$". | `venta.tasa_cambio_cents` siempre primero. | La tasa se congela por documento: dos copias de la misma factura no pueden decir montos distintos. |
| CEL-01 | celular, toda la app | El gesto "atrás" de Android con una hoja abierta no la cierra: la app vuelve atrás o se cierra, y se pierde lo cargado. No hay manejo del historial. | Abrir una hoja agrega una entrada al historial; "atrás" la cierra (preguntando si hay cambios). | Es el gesto más usado en Android para "salir de esto". |
| BAS-02 | `ToastContext.tsx:153` | El texto de los avisos se corta en una línea con "…" (`truncate`): los errores largos no se pueden leer. | Hasta 3 líneas; los errores duran más o hasta cerrarlos. | Los errores explican qué hacer ("Corregí el abono primero") y se cortan justo ahí. |
| CFG-02 | `ConfigView.tsx` | Cuatro formas de guardar en la misma página (botón de abajo, fila por fila al instante, al tocar, "agregada a la lista, guardá para confirmar") y ningún aviso de cambios sin guardar: salir de la página pierde todo. | Guardar cada sección al salir del campo con un "Guardado", o, si queda el botón único, marcar lo pendiente y preguntar al salir. | Una cuenta bancaria o un PIN que "se agregó" y nunca se guardó. |
| VED-01 | `VentaEditor.tsx:235-245,772` | Escape y clic en el fondo cierran "Nueva venta" sin preguntar. | Ver TRA-01. | Es la ventana que más se usa. |

---

## 2. Problemas transversales (aparecen en muchas pantallas)

Estos no se arreglan pantalla por pantalla: se arreglan una vez, en el componente o en la regla, y se repara todo lo que depende de eso.

| ID | Nivel | Qué pasa | Dónde aparece | Después | Por qué |
|---|---|---|---|---|---|
| TRA-01 | A | Dos marcos de ventana. `Dialogo` pregunta antes de descartar, anima la salida, entiende Ctrl+Enter. Los marcos propios cierran con Escape y con clic afuera sin preguntar, desaparecen de golpe y no tienen Ctrl+Enter. | Con `Dialogo`: registrar y corregir abono, nuevo encargo, cotizar, aceptó, mandar cotización, anular encargo. Con marco propio: VentaEditor, PaqueteEditor, ProductoModal, ClienteModal, abono de Cobros, AjustarStock, RevisarPrecios, Reconstrucción, DocumentoModal. | Un solo marco (`Dialogo`, con anchos `xl` y pantalla completa para los editores grandes). | Lo que hace una ventana no puede depender de cuál se abrió. |
| TRA-02 | A | Cuatro formularios de abono en Windows (Ventas/Encargos, Cobros por clienta, ficha de Clientes, Aceptó) y uno en el celular, con controles, textos, validaciones y protecciones distintas. | PagoModal, CobranzaView, ClientesView, AceptarEncargoModal, AbonoModalSheet. | Uno solo por app, con dos modos: "a esta venta" y "a la cuenta de la clienta" (diciendo antes a qué ventas va). | Mismo dato, misma forma de pedirlo; hoy el más peligroso es el más a mano. |
| TRA-03 | M | Ocho mensajes de WhatsApp armados a mano, con textos, montos y números distintos; sólo dos usan las plantillas de Configuración; uno pega +505 fijo; unos en "tú" y otros en "vos". | Inicio, Ventas, Cobros/Clientes (`lib/whatsapp`), menú de Clientes, documento, recibo de venta del celular, recibo de abono, estado de cuenta, ficha de cobro, compartir producto. | Una función por tipo de mensaje en `@core` (cobro, recibo de abono, recibo de venta, estado de cuenta, documento, compartir producto), con plantilla editable y código de país. | Lo que recibe la clienta no puede depender de desde dónde se tocó el botón. |
| TRA-04 | M | La tasa de hoy donde va la tasa de la venta: el "≈ C$" de las deudas, los recordatorios, la factura reimpresa, "Pagar todo" del celular, el total del documento en el celular. Los abonos se registran con la tasa de la venta. | `Money`, `MoneyDual`, `lib/whatsapp`, `plantillas.ts`, `mensajes.ts`, `AbonoModalSheet`, `DocumentoSheet`, `CobranzaView`, `VentasView`. | Todo lo que describe una venta existente usa su tasa. La tasa de hoy sólo para lo nuevo. | Si la clienta paga lo que dice el mensaje, no le cierra la cuenta. |
| TRA-05 | M | "Lo pagado" en dólares aunque haya pagado en córdobas, contra la regla de la 2.16.1. | Encargos (línea de plata, "¿Lo compraste igual?"), Aceptó, Anular encargo, Registrar abono ("Ya pagó $16.38 de $50"), confirmación de anular abono en Cobros y Clientes, anular venta, factura y proforma ("Abonado"), exportación de abonos, recibos del celular. | `textoLoPagado` / `textoPagado` en todos. | "Pagó C$600" y "Pagó $16.38" en la misma pantalla parecen dos cosas distintas. |
| TRA-06 | M | Cada recarga cambia la lista por "Cargando..." y la vuelve a dibujar: parpadea y se pierde el scroll. En Clientes e Inventario, con cada letra del buscador. | Ventas, Cobros, Clientes, Inventario, Paquetes, Inicio. (Encargos, Historial y Cobros del celular ya lo hacen bien.) | Dejar los datos a la vista y mostrar un indicador chico mientras se actualiza. | La pantalla que parpadea parece que se rompió; y buscar no debería borrar la lista. |
| TRA-07 | M | Los menús prometen atajos que no existen ("Espacio", "Enter", "Supr", "A", "D": 12 etiquetas). El menú sólo entiende Escape. Y los menús que abre un botón aparecen donde está el mouse: con el teclado, en la esquina de arriba a la izquierda. | `ContextMenu` en Inicio, Ventas, Encargos, Clientes, Inventario, Paquetes. | Implementarlos o sacar las etiquetas; anclar el menú al botón que lo abre. | Un atajo que no funciona enseña que los atajos no funcionan. |
| TRA-08 | M | Movimiento que Emil no haría: gráficas de 0,6 a 1,5 s cada vez que se abre Inicio, bucles infinitos (brillo del logo, puntos que laten), animaciones al navegar con el teclado, entradas triples al cambiar de pantalla, escalas de presión de 0,90 a 0,98 según el botón, avisos que entran animados y se van de golpe. | index.css, PanelView, Graficas, App, Sidebar, Header, PinLock, ContextMenu, Toast, BottomNav, Dashboard (celular), Snackbar. | Ver Fase 4. | Lo frecuente no se anima; lo que se anima dura menos de 300 ms, usa curva de salida fuerte y sale más rápido de lo que entra. |
| TRA-09 | M | Formularios con tres modelos de teclado: Enter pasa al campo siguiente y en el último guarda (Clienta, Producto, Configuración); Enter guarda desde cualquier campo (abono de la ficha de Clientes); Enter no hace nada y Ctrl+Enter guarda (las ventanas con `Dialogo`). | ClienteModal, ProductoModal, ConfigView, ClientesView, Dialogo. | Un solo modelo: Ctrl+Enter guarda en todas; Enter sólo avanza en formularios de una columna. | Lo aprendido en una ventana tiene que servir en la otra. |
| TRA-10 | M | Errores de validación en tres lugares: en el campo (Nuevo encargo, Registrar abono, Cotizar), en un recuadro arriba (Nueva venta, Producto, Paquete, Clienta) o en un aviso flotante que se corta (Configuración, abono de Cobros y de Clientes, celular). | Varios. | En el campo, con el foco ahí y scroll hasta él. | Arriba de un formulario largo, el error queda fuera de la vista y el botón "no hace nada". |
| TRA-11 | M | Moneda y método del abono arrancan fijos en córdobas y efectivo, ignorando la preferencia de Configuración (Registrar abono de Ventas ya la usa desde la 2.15). | Cobros, Clientes (Windows); Vender, Registrar abono (celular). | Todos con la preferencia. | Ross configuró "dólares" y la mitad de las pantallas no le hace caso. |
| TRA-12 | M | Cinco estilos de buscador, cinco de selector segmentado y cinco anchos de panel de detalle (390, 400, 410, 410, 420 px). | Ventas, Encargos, Cobros, Clientes, Inventario, Paquetes. | Un componente de buscador, uno de segmentado y un ancho de panel. | Son la misma pieza con cinco versiones. |
| TRA-13 | M | En Windows no se puede seleccionar ni copiar texto (`select-none` en toda la app); en el celular tampoco (`user-select: none`). | `App.tsx:304`, `mobile/index.css:191`. | Sin selección sólo en controles (botones, barras); el contenido se puede copiar. | Un teléfono, una dirección o el texto de un error se necesitan copiar. |

---

## 3. Windows, pantalla por pantalla

### 3.1 Estilos base (`index.css`) y componentes compartidos

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| BAS-01 | A | `ToastContext.tsx:121-135` | Ctrl+Z global deshace el aviso más viejo aunque el foco esté en un campo. | Ignorar si el foco está en `input`/`textarea`/`select`/editable; deshacer el más reciente. | Ver §1. |
| BAS-02 | A | `ToastContext.tsx:153` | `truncate`: el aviso se corta en una línea. | `line-clamp-3` y el texto completo en `title`; errores de 8 s o hasta cerrarlos. | Ver §1. |
| BAS-03 | M | `ToastContext.tsx:39-56,98-116` | Los tiempos corren aunque el mouse esté encima o la ventana esté oculta: "Deshacer (10s)" se consume mientras Ross mira otra cosa. | Pausar al pasar el mouse y con `visibilitychange`. | Sonner lo hace así: el tiempo es para leer, no para correr. |
| BAS-04 | M | `ToastContext.tsx:147` | Entra con un keyframe (no se puede interrumpir) y sale sin animación. | Transición de entrada y de salida por el mismo lado, la salida más corta (≈150 ms). | Consistencia espacial: por donde entra, se va. |
| BAS-05 | B | `ToastContext.tsx:160` | "Deshacer (9s)" cambia de ancho cada segundo. | Cifras tabulares y ancho mínimo. | El botón tiembla mientras se lo quiere tocar. |
| BAS-06 | B | `ToastContext.tsx:143,163` | Sin `role="status"`/aria-live; la X sin nombre. | Agregarlos. | Lectores de pantalla. |
| BAS-07 | M | `Confirmar.tsx:117-123` | Confirma y cierra al instante; si la acción tarda (anular una venta) no hay nada hasta que llega el aviso. | Botón "Anulando…" mientras corre, cerrar al terminar. | Sin respuesta, se aprieta dos veces. |
| BAS-08 | B | `Confirmar.tsx:53` | Entra animado y desaparece de golpe (`Dialogo` sí anima la salida). | Misma salida que `Dialogo`. | Dos marcos, dos comportamientos. |
| BAS-09 | B | `Confirmar.tsx:61,81` | `id="titulo-confirmar"` fijo. | `useId`. | Dos confirmaciones abiertas comparten id. |
| BAS-10 | M | `Confirmar.tsx:34` y usos | "No, dejar como está", "No, dejarla como está", "No, dejarlo como está", "Cancelar", "No", "Todavía no", "Seguir editando", "Ahora no", "Después". | Una regla: "Cancelar" para salir sin hacer nada; frases propias sólo cuando aclaran ("Seguir revisando"). | La misma decisión con nueve nombres. |
| BAS-11 | B | `Dialogo.tsx:132` | El velo usa `animate-fade-in`, que además sube 6 px. | Sólo opacidad. | Se mueve todo el fondo oscuro. |
| BAS-12 | M | `Dialogo.tsx:126-173` | No retiene el foco (Tab sale a la pantalla de atrás) ni lo devuelve al botón que la abrió. | Foco atrapado y devuelto al cerrar. | Con teclado se termina escribiendo en la pantalla de atrás. |
| BAS-13 | B | `Button.tsx:11` | El hover de `danger` usa `danger-700`, que es el mismo color base. | `bg-peligro-fuerte` en hover. | El botón rojo no reacciona. |
| BAS-14 | B | `StatusDot.tsx:15-22` | El lector de pantalla dice "Bloqueado", "Verificado", "Pendiente" según el color, aunque el punto signifique "Debe" o "Vencida". | Etiqueta por significado. | Accesibilidad. |
| BAS-15 | M | `DataTable.tsx:85-105` | Las filas se abren con clic pero no con teclado. | `tabIndex`, Enter y flechas. | Media app queda fuera del teclado. |
| BAS-16 | B | `DataTable.tsx:38-44` vs `EmptyState` | Dos estilos de "vacío": caja punteada con texto suelto, o ícono con título y descripción. | Siempre `EmptyState`. | Consistencia. |
| BAS-17 | B | `DataTable.tsx:57` | Encabezados de columna en MAYÚSCULAS de 11 px. | Oración normal, como los encabezados de grupo. | El resto de la app no grita. |
| BAS-18 | B | `Money.tsx:62-66,91-95` | "≈ C$…" en unos formatos y "C$…" sin ≈ en otros; en el celular, `MoneyDual` lo muestra sin ≈ y las hojas de abono con ≈. | Siempre "≈" cuando es una conversión. | La misma cifra con dos lecturas. |
| BAS-19 | B | `Card.tsx:9`, `Header.tsx:40` | Sombras escritas a mano (`rgba(0,0,0,0.03)`). | Tokens de sombra. | En oscuro no se ven. |
| BAS-20 | B | `ContextMenu.tsx:134` | Origen fijo arriba a la izquierda aunque el menú se abra hacia arriba o a la izquierda; `animate-in zoom-in-95` depende de un plugin que no está instalado (`plugins: []`): no anima nada. | Origen según hacia dónde se abre, y una animación real de 150 ms (o ninguna). | Los menús crecen desde el disparador. |
| BAS-21 | B | `ContextMenu.tsx:172` | El ícono de cada opción crece 10 % al pasar el mouse. | Sólo el fondo de la fila. | Adorno en algo que se usa decenas de veces. |
| BAS-22 | B | `ContextMenu.tsx:118-190` | Sin flechas del teclado ni foco inicial. | Navegación con flechas. | Accesibilidad. |
| BAS-23 | B | `main.window.ts:22` | `backgroundColor: '#ffffff'` fijo. | El fondo del tema guardado. | En oscuro la ventana destella en blanco al abrir. |
| BAS-24 | M | `index.css:196-276,326-333` | Las gráficas de Inicio se dibujan en cada visita: línea 1,2 s; área 0,7 s + 0,25; relleno 0,8 s + 0,4; anillo 0,8 s; barras 0,6 s. | Sin animación al volver a Inicio; como mucho la primera vez de la sesión, ≤ 250 ms, sólo opacidad. | Inicio se abre decenas de veces al día y ninguna animación de interfaz debería pasar de 300 ms. |
| BAS-25 | M | `index.css:326-333` | `barGrow` anima `width`. | `scaleX` con origen a la izquierda. | Sólo `transform` y `opacity` van por la placa de video; `width` recalcula todo. |
| BAS-26 | M | `index.css:278-291,312-323,458-471` | Animaciones infinitas: `dotPulse` 2 s, `logoGlow` 3 s (anima `box-shadow`, repinta), `urgentPulse` 1,8 s. | Señales quietas. | Movimiento perpetuo en una herramienta de trabajo distrae. |
| BAS-27 | B | `index.css:502-504` | `.pill-active { transition: all }`. | Propiedades explícitas. | `all` anima lo que no se quiere animar. |
| BAS-28 | B | `index.css:505-510` | `.pill-interactive:active` escala 0,94. | 0,97, igual que `.btn-press`. | Rango de Emil: 0,95 a 0,98. |
| BAS-29 | B | `index.css:87-101,433-445` | Tarjetas que se levantan al pasar el mouse sin `@media (hover: hover) and (pointer: fine)`. | Condicionarlo. | En pantallas táctiles el hover queda pegado. |
| BAS-30 | B | `index.css:118-120,143-145` | `animate-fade-in` con `ease-out` nativo; `animate-slide-up` de 350 ms. | `var(--ease-out)` y ≤ 250 ms. | Las curvas nativas son débiles. |
| BAS-31 | B | `index.css:77-80` | `.scroll-reveal` con `will-change` permanente en cada elemento. | Sólo durante la animación. | Una capa por fila en listas largas. |
| BAS-32 | B | `index.css:497-499` | `animate-spin-once` gira 0,55 s fijos. | Girar mientras dura la carga. | La señal no refleja el estado. |
| BAS-33 | B | `index.css:29-165` | La curva `cubic-bezier(0.16,1,0.3,1)` escrita a mano en 8 lugares. | `var(--ease-out)`. | Un lugar para ajustarla. |
| BAS-34 | M | `index.css:26` vs `mobile/src/index.css:186` | Windows usa la fuente del sistema (Segoe UI); el celular, Plus Jakarta Sans. | Decidir una (va con la revisión de tipografía de la 2.20). | Las dos apps son el mismo negocio. |
| BAS-35 | B | `index.css:540-551` | El movimiento reducido cubre CSS, pero las gráficas de Recharts se animan por JavaScript y no se enteran. | `isAnimationActive={false}` con movimiento reducido (y en general, BAS-24). | Quien lo pide suele marearse. |

### 3.2 Marco (barra lateral, encabezado, atajos) y acceso (entrada, PIN, tema)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| MAR-01 | M | `App.tsx:304` | `select-none` en toda la app. | Sólo en controles. | Ver TRA-13. |
| MAR-02 | M | `App.tsx:226-229`, `Header.tsx:132` | Ctrl+L y el botón de salir cierran la sesión de Google al instante, sin confirmar (después hay que entrar con Google y el PIN). | Pedir confirmación (el celular ya lo hace) o sacar el atajo. | Se aprieta sin querer y cuesta volver. |
| MAR-03 | M | `App.tsx:182-206` | Ctrl+1…6 no siguen el orden de la barra (Ctrl+4 es Paquetes, que no está en la barra; Ctrl+5 es Clientes, sexto en la barra); Encargos y Cobros no tienen atajo; ninguno se muestra. | Ctrl+1…7 en el orden de la barra y mostrados en su tooltip. | Un atajo que no se ve ni sigue un orden no se aprende. |
| MAR-04 | B | `App.tsx:352` | `view-fade-slide` (180 ms, 4 px) también al cambiar de pantalla con el teclado. | Sin animación si el cambio vino del teclado. | Emil: lo del teclado no se anima. |
| MAR-05 | M | `App.tsx:267-276` | "Iniciando…" usa `bg-inverso`: en oscuro sale casi blanca. | `bg-fondo`. | Destello blanco en tema oscuro. |
| MAR-06 | B | `App.tsx:308` | El punto del aviso de actualización es verde sobre verde. | Punto de otro color o sin punto. | Invisible. |
| MAR-07 | B | `App.tsx:321-325` | El riel de la barra de descarga es del mismo color que su fondo. | Riel visible. | No se ve cuánto falta. |
| MAR-08 | B | `Header.tsx` / `App.tsx:329` | El título de Inicio es "Tu negocio hoy" arriba e "Inicio" en la barra (y en el celular). | Un nombre. | Consistencia. |
| MAR-09 | M | `Header.tsx:77-79` | "Ctrl+N" dentro del botón verde en gris: casi ilegible en los dos temas. **Visto en las capturas.** | Etiqueta clara sobre el verde o en el tooltip. | Un atajo que no se lee no enseña nada. |
| MAR-10 | B | `Header.tsx:53,91` | `active:scale-90` en recargar y tema. | 0,97. | Presión exagerada. |
| MAR-11 | B | `Header.tsx:57-61,94-98` | El ícono de recargar gira 180° y el sol gira 45° al pasar el mouse; `group-hover` sin `group` (código muerto). | Sin giro decorativo. | Adorno en botones que se usan todo el día. |
| MAR-12 | B | `Header.tsx:46-63` | El botón de recargar mide unos 20 px. | 32 px mínimo. | Blanco chico. |
| MAR-13 | B | `Header.tsx:104` | El bloque del usuario se ilumina al pasar el mouse y no hace nada. | Sin hover, o que abra algo. | "Una tarjeta que reacciona promete una acción" (regla escrita en StatTile). |
| MAR-14 | B | `Sidebar.tsx:175-183` | Cada ícono y texto de la barra se corre 2 px al pasar el mouse (10 % más grande plegada). | Sólo cambio de color. | Contradice la regla del propio Button ("cambia el color, no la posición"). |
| MAR-15 | B | `Sidebar.tsx:101,108,114` | Plegar la barra anima `width` y `padding` durante 200 ms: se recalcula toda la pantalla, tablas incluidas. | Cambio inmediato o `transform`. | Rendimiento. |
| MAR-16 | B | `Sidebar.tsx:132` | Subtítulo "Gestión Boutique". | El nombre del negocio o nada. | No es una boutique: es importación y encargos. |
| MAR-17 | M | `ContextMenu` en 6 pantallas | Etiquetas de atajos que no existen ("Espacio", "Enter", "Supr", "A", "D"). | Implementar o sacar. | Ver TRA-07. |
| MAR-18 | M | `EncargosView.tsx:861`, `ClientesView.tsx:279-281`, `InventarioView.tsx:606-608` | "Más" y "⋮" abren el menú en la posición del mouse; con Enter o Espacio aparece en (0,0). | Anclarlo al botón. | Ver TRA-07. |
| ACC-01 | M | `LoginView.tsx:33` | La pantalla de entrada usa `bg-inverso`: en oscuro sale clara. | `bg-fondo`. | Destello en tema oscuro. |
| ACC-02 | B | `LoginView.tsx:115-124` | Con error hay dos botones que hacen lo mismo ("Continuar con Google" y "Volver a intentar"). | Uno. | Duda innecesaria. |
| ACC-03 | B | `LoginView.tsx:119` | "Volver a intentar" en gris sobre el fondo inverso: 3,2:1. | Contraste de 4,5:1. | Legibilidad. |
| ACC-04 | B | `LoginView.tsx:48,72` | Subtítulo de folleto ("Gestión comercial, inventario en tiempo real…"); "Iniciando sesión en tu navegador..." | Una línea útil; "…". | Nadie lee folletos en su propia herramienta. |
| ACC-05 | M | `PinLockView.tsx:33-35` | Al acertar el PIN espera 400 ms "para mostrar la animación de éxito", en cada arranque. | Entrar ya (≤ 150 ms). | Se paga todos los días. |
| ACC-06 | M | `PinLockView.tsx:83` | El logo brilla en bucle infinito (anima `box-shadow`). | Quieto. | Movimiento perpetuo en la pantalla de cada arranque. |
| ACC-07 | B | `PinLockView.tsx:138-149` | Cada dígito anima su punto (keyframe + escala 1,25 + transición). | Sólo el cambio de relleno. | Emil: lo del teclado no se anima. |
| ACC-08 | B | `PinLockView.tsx:104-111,168-171` | "Pure · Magic · Divine" en inglés; "Ingresá tu PIN de 4 dígitos para acceder" y "Usá el teclado para escribir tu PIN" dicen lo mismo. | Confirmar si el lema es de la marca; una sola instrucción. | Ruido. |
| ACC-09 | M | `ThemeContext.tsx:77-86` + Header | El botón de tema recorre claro → oscuro → automático; en automático con Windows oscuro el clic no cambia nada visible. | Menú con las tres opciones, o dejar "automático" sólo en Configuración. | Parece roto. |
| ACC-10 | B | `LimiteDeError.tsx:52-57` | "Copiar el detalle" no confirma que copió. | "Copiado". | Feedback. |

### 3.3 Inicio (`PanelView`) y gráficas

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| INI-01 | M | `PanelView.tsx:124-185` | **Verificado**: F5 y "Actualizar" no rompen Inicio, pero cada recarga cambia todo el panel por "Cargando tu resumen..." y lo vuelve a dibujar con sus animaciones. Los hooks están después de los `return`: el primero que alguien agregue arriba rompe la pantalla. | Hooks arriba; mientras recarga, dejar los datos y un indicador chico. | Parpadeo diario y una trampa para el próximo cambio. |
| INI-02 | M | `PanelView.tsx:193-197` | "Cobrar por WhatsApp" arma su propio mensaje, no abre el chat de la clienta (wa.me sin número) y escribe "$1234.50" sin separador. | El mensaje de cobro único (TRA-03). | En Ventas y Cobros el mismo botón manda otra cosa. |
| INI-03 | B | `PanelView.tsx:644-654` | El WhatsApp de cada deudora sólo aparece al pasar el mouse. | Siempre visible. | Acción escondida. |
| INI-04 | M | `PanelView.tsx:840-846` | El menú dice "Registrar abono / Cobrar" y sólo abre la venta. | Que abra el abono, o "Ver la venta". | El texto promete otra cosa. |
| INI-05 | B | `PanelView.tsx:936-938` | "Ir a Ventas y Cobros" lleva a Ventas. | "Ir a Ventas". | Texto falso. |
| INI-06 | M | `PanelView.tsx:330-350` | "Te deben en la calle" lleva a Ventas; "Quién te debe › Ver todo" lleva a Cobros. | Las dos a Cobros. | Lo que se toca para ver deudas tiene que llevar a las deudas. |
| INI-07 | M | `PanelView.tsx:56-82` + Graficas | Títulos en Mayúscula Inicial y jerga contable: "Evolución de Rentabilidad", "Margen Neto de Ganancia (%)", "utilidad operativa", "facturación bruta", "Retorno ROI", "Ticket Promedio", "Salud Financiera Óptima". | Lenguaje de la app: "Cuánto ganaste por mes", "De cada venta te queda", etc. | El resto habla simple ("Te deben en la calle", "Dónde está tu plata"). |
| INI-08 | B | `PanelView.tsx:810` | "Avisos Operativos del Sistema". | "Para revisar". | Jerga. |
| INI-09 | B | `PanelView.tsx:681` | Badge "Óptimo" cuando no hay stock bajo. | "Todo bien" o nada. | Jerga. |
| INI-10 | B | `PanelView.tsx:306-308` | "1 venta entregada" y "N ventas este mes": singular y plural dicen cosas distintas. | La misma frase. | Consistencia. |
| INI-11 | B | `PanelView.tsx:614-621,765-773` | Deudoras (`div`) y más vendidos (`li`) se abren con clic y no con teclado; las de stock son botones. | Todas botones. | Accesibilidad. |
| INI-12 | B | `PanelView.tsx:374` | El bloque de urgentes entra con `animate-slide-up` (350 ms) en cada visita. | Sin animación. | Frecuente. |
| INI-13 | B | `PanelView.tsx:152` | "Cargando tu resumen..." | "…". | TXT-09. |
| INI-14 | B | Inicio (captura) | "Dónde está tu plata" deja un hueco vacío grande entre la barra y los botones. | Ajustar el alto o sumar el desglose. | Se lee como error de maquetación. |
| INI-15 | M | `Graficas.tsx:512,527-528` | La barra bajo 35 % es violeta (`#8b5cf6`), la leyenda dice "Morado" y pinta el punto fucsia (`serie-3`). | Un color, el mismo en barra y leyenda. | La leyenda no explica la gráfica. |
| INI-16 | M | `Graficas.tsx:769,777` | Barras de pedidos azules (`#3b82f6`) y leyenda con punto naranja. | Igual que INI-15. | Igual. |
| INI-17 | B | `Graficas.tsx:350-353` | La línea de ganancia es `#059669` fijo: en oscuro queda más apagada que su leyenda (**visto en captura**). | `--serie-1`. | Tokens por tema. |
| INI-18 | M | `Graficas.tsx:461-473,428-434` | "Meta 35%" y "Salud Financiera Óptima" fijos, aunque el margen de Ross está en Configuración. | La meta sale de Configuración, o no hay meta. | Una meta que ella no puso. |
| INI-19 | B | `Graficas.tsx:576,614` | "Retorno ROI: +X%" y "+$X ganancia" ponen "+" aunque sea negativo ("+-5%"). | Signo real. | Errata visible. |
| INI-20 | B | `Graficas.tsx:405-406` | El margen promedio es promedio simple de porcentajes mensuales. | Ganancia total ÷ ventas totales. | Un mes chico pesa igual que uno grande. |
| INI-21 | M | `Graficas.tsx:334-356` | Recharts anima 1,5 s cada vez que se abre Inicio o se cambia de gráfica; el anillo 0,8 s; las barras animan `width`. | `isAnimationActive={false}` al volver (BAS-24). | Frecuente y largo. |
| INI-22 | B | `Graficas.tsx:853-873,897-907` | Segmentos del anillo y filas con cursor de mano que no hacen nada. | Sin cursor de mano. | Promete una acción. |
| INI-23 | B | `Graficas.tsx:195,422,702` | Meses en MAYÚSCULAS en los resúmenes ("SEP") y en minúscula en los ejes. | Minúscula. | Consistencia. |
| INI-24 | B | `Graficas.tsx:485-500,613-633` | Cifras en `font-mono` en los globos y tabulares en el resto. | Tabulares siempre. | Dos tipografías numéricas. |
| INI-25 | B | `Graficas.tsx:211-248` | El selector Ambas/Ganancias/Ingresos no marca cuál está activo (`aria-pressed`). | Marcarlo. | Accesibilidad. |

### 3.4 Ventas (`VentasView`)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| VEN-01 | M | `VentasView.tsx:671-672` | Cada recarga (después de cobrar, corregir o anular) cambia la tabla por "Cargando..." y la vuelve a dibujar; se pierde el scroll. | TRA-06. | Parpadeo en la pantalla más usada. |
| VEN-02 | M | `VentasView.tsx:340-370` | El recordatorio de WhatsApp calcula los córdobas con la tasa de hoy; es una de tres implementaciones distintas y asume +505 siempre. | Mensaje de cobro único con la tasa de la venta y el código de país de Configuración (TRA-03, TRA-04). | Si paga exactamente lo del mensaje, no le cierra el saldo. |
| VEN-03 | M | `VentasView.tsx:1031-1034` | Al anular: "Los $16.38 ya abonados quedan sin efecto", aunque haya pagado C$600. | `textoLoPagado`. | TRA-05. |
| VEN-04 | B | `VentasView.tsx:802,806,814` | En el detalle, el Total muestra córdobas debajo y Pagado/Debe no. | El mismo criterio en las tres cifras. | Tres cifras de la misma tarjeta con reglas distintas. |
| VEN-05 | B | `VentasView.tsx:928-973` | "Ver factura" (secundario) va primero y a todo el ancho; "Registrar abono" (lo principal) segundo. | Lo principal primero y más fuerte. | Jerarquía. |
| VEN-06 | B | `VentasView.tsx:541-549` + Header | "Nueva venta" dos veces en la misma pantalla (encabezado global y la vista). | Uno. | Ruido. |
| VEN-07 | B | `VentasView.tsx:555-560` | "Total facturado" se puede apretar pero sólo pone el filtro "Todas" (si ya estaba, no pasa nada). | Que no parezca botón, o que filtre algo útil. | Una tarjeta que reacciona promete una acción. |
| VEN-08 | B | `VentasView.tsx:574` | "Filtrando: tocá para ver todo" en Windows. | "hacé clic". | Se hace clic. |
| VEN-09 | B | `VentasView.tsx:589,642` | `pill-interactive` (0,94) y `active:scale-95` en el mismo botón. | Una sola escala de 0,97. | Dos reglas peleándose. |
| VEN-10 | B | `VentasView.tsx:606-613` | Buscador con estilo propio (uno de cinco). | TRA-12. | Consistencia. |
| VEN-11 | B | `VentasView.tsx:680` | Vacío: "Las existencias se descuentan solas al vender." | Qué hacer: "Registrá la primera venta" con el botón. | El vacío tiene que llevar a la acción. |
| VEN-12 | B | `VentasView.tsx:1144,1153` | "Corregir venta...", "Anular venta..." (tres puntos); en Encargos "Anular…". | "…" en todos. | TXT-09. |

### 3.5 Nueva venta y Corregir venta (`VentaEditor`)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| VED-01 | A | `VentaEditor.tsx:235-245,772` | Escape y clic en el fondo cierran sin preguntar. | `Dialogo` (TRA-01). | Ver §1. |
| VED-02 | M | `VentaEditor.tsx:889-942` | La lista de productos no se maneja con flechas ni Enter: en cada línea hay que ir al mouse. *(Corregido el 30/9: este hallazgo decía además que Escape en la lista cerraba la venta entera, y no es así. El primer Escape cierra sólo la lista; el segundo cierra la venta sin preguntar, y eso es VED-01.)* | Flechas y Enter para elegir. | El teclado es el camino rápido en la ventana que más se usa. |
| VED-03 | A | `VentaEditor.tsx:1441-1461,1706-1712,1824-1831` | Al contado en córdobas no se muestra cuántos córdobas cobrar; el C$ visible es el del subtotal antes del descuento. | "Cobrá C$915.50" en el paso 3 y en el pie. | Ver §1. |
| VED-04 | A | `VentaEditor.tsx:1647` | En oscuro el aviso de pérdida por descuento es invisible (1,12:1). | Sin `dark:` y con `text-peligro-fuerte`. | Ver §1. |
| VED-05 | M | `VentaEditor.tsx` (paso 1 y 2) | Los errores van en una caja roja arriba del paso, no en el campo. | En el campo, con foco (TRA-10). | En Nuevo encargo, Registrar abono y Cotizar ya es así. |
| VED-06 | M | `VentaEditor.tsx:1639` vs `1728` | "Ganancia" muestra dos porcentajes distintos en el mismo formulario: en el descuento es sobre el precio (ganancia ÷ total) y en el paso 3 sobre el costo (ganancia ÷ costo). | Uno, el mismo que Inventario ("sobre el costo"), con la base escrita. | Mismo rótulo, dos cuentas. |
| VED-07 | M | `VentaEditor.tsx:1198-1251` | Tercer formulario de "clienta nueva" (nombre, teléfono, dirección); en la ventana de Clientas hay además alias, ciudad y notas; en Nuevo encargo sólo el nombre. Ninguno avisa si ya existe. | Un formulario de clienta rápida, el mismo en todos lados, con aviso de posible duplicado. | Duplicados y datos a medias. |
| VED-08 | B | `VentaEditor.tsx:760` | Descuentos rápidos $3/$5/$10; en el celular $2/$5/$10. | Los mismos. | Consistencia. |
| VED-09 | B | `VentaEditor.tsx:528` vs `InventarioView.tsx:1125` | "Elegí la talla o color de…" y "Elegí la talla o el tono…"; la ficha dice "tallas o tonos". | "talla o tono" en todos lados. | Consistencia. |
| VED-10 | B | `VentaEditor.tsx:778` | Entra con `animate-modal-pop` y desaparece de golpe; sin Ctrl+Enter. | `Dialogo`. | TRA-01. |
| VED-11 | B | `VentaEditor.tsx:1248,1941` | "Guardando..."; plurales "(s)". | "…"; plural real. | TXT-09, TXT-10. |
| VED-12 | B | `VentaEditor.tsx:1170-1172,1313-1315` | La deuda de la clienta en rojo; en el resto de la app es ámbar. | Ámbar. | El color de "debe" tiene que ser uno. |
| VED-13 | B | `VentaEditor.tsx:873,921,1008,1866,982` | "en bodega", "en stock", "disp."; "producto", "prenda", "artículos"; 'Prenda' como nombre por defecto. | "en bodega" y "producto". | Tres nombres por cosa en el mismo formulario. |
| VED-14 | B | `VentaEditor.tsx:1017` | "Hay menos en bodega" no dice cuántas hay. | "Hay 2 en bodega". | El número es lo que se necesita. |
| VED-15 | B | `VentaEditor.tsx:1683,1762` | Fechas en formato de base de datos ("2026-09-29", "Fecha: 2026-09-20 → 2026-09-29"). | `formatearFecha`. | Legibilidad. |
| VED-16 | B | `VentaEditor.tsx:798-817` | Indicador de pasos: los futuros son botones con `cursor-not-allowed`, sin `aria-current`; el visto es el carácter "✓"; el número activo usa `text-superficie` en vez de `text-acento-texto`. | Pasos futuros deshabilitados de verdad, ícono de visto, token correcto. | Pulido y accesibilidad. |
| VED-17 | B | `VentaEditor.tsx:1110-1127` | "Vender todo lo que hay (N unidades)" es una casilla. | Un botón que pone la cantidad. | No es una opción, es una acción. |
| VED-18 | B | `VentaEditor.tsx:1458-1459` | En el contado la moneda lista córdobas primero; en Registrar abono, dólares primero. | El mismo orden. | Consistencia. |
| VED-19 | B | `VentaEditor.tsx:111` + `1036-1107,1379-1399,1698-1705` | El editor sólo se abre como venta de inventario (`VentasView.tsx:994`): todo lo de encargo y pedido (cotizar, anticipo, "Registrar encargo") no se ve nunca. | Sacar ese código. | Un segundo formulario de encargo escondido que confunde al mantener. |

### 3.6 Encargos (`EncargosView`) y sus ventanas

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| ENC-01 | M | `EncargosView.tsx:90-99` + Badge | 8 etapas con 4 colores que chocan: "Por buscar" (naranja), "Por mandar" y "Por comprar" (ámbar) casi iguales; "Esperando" y "En camino" grises; "Por entregar" y "Entregado" verdes. | Una escala por avance (gris → ámbar → azul → verde) o sólo el texto. | El color no ayuda a distinguir la etapa. |
| ENC-02 | M | `EncargosView.tsx:803-824` | La línea de plata dice "Pagó $50.00" y la lista de pagos, justo abajo, "C$1,831.00". | `textoLoPagado`. | TRA-05. |
| ENC-03 | M | `EncargosView.tsx:946-958` | "¿Lo compraste igual?" dice "pagó $X de un anticipo de $Y" en dólares. | En la moneda en que pagó. | TRA-05. |
| ENC-04 | M | `EncargosView.tsx:777-788` | Las acciones de cada pieza ("Ya lo compré", "Desmarcar", "No se consiguió", "Volver a buscar") son enlaces de 12 px con subrayado punteado, pegados con "·": blancos de ~16 px. | Botones chicos de al menos 28 px. | "No se consiguió" cambia el total del encargo. |
| ENC-05 | B | `EncargosView.tsx:722-748` | La etapa se dice tres veces: 6 barritas, "Fase 3 de 6" y el badge. | Barritas + badge. | Redundancia. |
| ENC-06 | B | `EncargosView.tsx:850-857` | "Pagos (2)" despliega la lista pero parece un rótulo. | Con chevron y aspecto de botón. | No se descubre. |
| ENC-07 | B | `EncargosView.tsx:660` | "Probá con otra búsqueda." también cuando lo que filtra es una fase vacía. | "No hay encargos en esa fase." + "Ver todos". | Texto falso. |
| ENC-08 | B | `EncargosView.tsx:592-601` | Quinto estilo de buscador. | TRA-12. | Consistencia. |
| ENC-09 | B | `EncargosView.tsx:704` | Panel de detalle de 400 px (Ventas 410, Inventario 390, Paquetes 420). | Un ancho. | TRA-12. |
| ENC-10 | B | `EncargosView.tsx:409` | "Anular…" y en Ventas "Anular venta...". | "Anular…" en los dos. | TXT-09. |
| ENC-11 | B | `EncargosView.tsx:272,283` | Avisos en telegrama: "Comprado: espera paquete", "Otra vez por comprar", "E-0009: aceptó". | Sujeto y qué pasó: "E-0009 comprado, espera paquete". | Un estilo de aviso. |
| ENC-12 | M | `NuevoEncargoModal.tsx:241-265` | La lista de clientas sugeridas no se maneja con flechas ni Enter; Escape cierra la ventana entera (preguntando). | Flechas, Enter y Escape que cierra la lista. | Hay que ir al mouse en medio de tipear. |
| ENC-13 | M | `NuevoEncargoModal.tsx:106-122,255-263` | "Agregar “X” como clienta nueva" aparece aunque ya exista esa clienta, y la guarda al instante: si después se cancela el encargo, la clienta queda creada. | Ocultarla si hay coincidencia exacta y crear la clienta recién al guardar el encargo. | Duplicados y clientas fantasma. |
| ENC-14 | B | `NuevoEncargoModal.tsx:177` | "Pedido guardado" sin precio y "Encargo guardado" con precio. | "E-0012 guardado" (+ "falta cotizar"). | Dos nombres para lo mismo. |
| ENC-15 | B | `NuevoEncargoModal.tsx:280,329,355` | Rojo de error con dos tonos (`danger-700` en el campo, `danger-600` abajo). | Uno. | Consistencia. |
| ENC-16 | B | `NuevoEncargoModal.tsx:318-325` | La X para quitar una pieza mide 24 px y quita sin deshacer. | 32 px y deshacer. | Blanco chico. |
| ENC-17 | M | `CotizarEncargoModal.tsx:111-122` | Cambiar "En la tienda" o el peso recalcula "Costo" y pisa el costo escrito a mano, sin aviso. | Recalcular sólo si el costo no se tocó, o mostrar "Estimado $X · Usar" como el precio sugerido. | Se pierde un dato que ella escribió. |
| ENC-18 | B | `CotizarEncargoModal.tsx:261` | "Se le avisa a la clienta que no se consiguió": sólo es cierto si se le vuelve a mandar la cotización. | "Sale de la cotización. Si se la mandás de nuevo, se le dice que no se consiguió." | Texto que promete algo automático que no pasa. |
| ENC-19 | M | `AceptarEncargoModal.tsx:142` + `AnularEncargoModal.tsx:181` | "ya pagó $X" / "Pagó $X" en dólares. | En la moneda en que pagó. | TRA-05. |
| ENC-20 | B | `AceptarEncargoModal.tsx:113` | `hayCambios` sólo mira el monto: la referencia o el método escritos se pierden con Escape sin preguntar. | Mirar todos los campos. | Protección incompleta. |
| ENC-21 | B | `AceptarEncargoModal.tsx:163` | Un error del servidor (sin conexión) aparece debajo de "Cuánto pagó". | Arriba, separado del campo. | Parece que el monto está mal. |
| ENC-22 | M | `MandarCotizacionModal.tsx:120,138` | Si la clienta no tiene teléfono, "Abrir WhatsApp" queda gris y el texto dice "Agregalo", pero no hay dónde. | Campo de teléfono ahí mismo, que se guarda en su ficha. | Callejón sin salida. |
| ENC-23 | M | `AnularEncargoModal.tsx:94-99` | Confirma y cierra al instante, sin "Anulando…". | BAS-07. | Doble clic. |
| ENC-24 | B | `AnularEncargoModal.tsx:183-188` | "Devolvérselo / Quedármelo" en primera persona; el resto le habla a Ross de vos. | "Se lo devolvés / Queda como pago". | Voz. |

### 3.7 Registrar y corregir abono (`PagoModal`, `CorregirPagoModal`)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| PAG-01 | M | `PagoModal.tsx:243-247`, `CorregirPagoModal.tsx:159-181`, `AceptarEncargoModal.tsx:175-180` | La moneda en que pagó se pide con tres controles: desplegable con dólares primero (Registrar, Aceptó) y tarjetas grandes con córdobas primero, antes del monto (Corregir). | Las tarjetas de Corregir en los tres: moneda a la vista, antes del monto, y "Cuánto pagó (C$)". | Es el dato que se equivoca (el caso que motivó la 2.16.1). |
| PAG-02 | M | `PagoModal.tsx:243-247`, `AceptarEncargoModal.tsx:176-179` | El monto se precarga con lo sugerido en la moneda por defecto ("47.50" dólares); si se cambia la moneda, el número no se convierte y queda C$47.50. En Registrar lo avisa la línea de conversión; en Aceptó no hay línea. | Si el monto sigue siendo el sugerido, convertirlo al cambiar la moneda; y la línea de equivalencia en los dos. | Un abono de C$47.50 que era de $47.50. |
| PAG-03 | M | `PagoModal.tsx:207-210` | "Ya pagó $16.38 de $50.00" y la lista de abonos de abajo en la moneda en que pagó. | `textoLoPagado`. | TRA-05. |
| PAG-04 | B | `PagoModal.tsx:193-199` | "Total de la venta" con córdobas y "Debe" sin. | El mismo criterio. | VEN-04. |
| PAG-05 | B | `PagoModal.tsx:179` | "Registrar abono" gris con el monto vacío: el error "Escribí cuánto pagó la clienta." sólo aparece con Ctrl+Enter. | Botón activo y error en el campo (como Corregir). | Un botón gris no dice por qué. |
| PAG-06 | B | `PagoModal.tsx:300-305` | "Después de este abono va a deber $X" lleva un ícono de visto. | Ícono neutro; el visto sólo cuando queda saldada. | El visto dice "terminado". |
| PAG-07 | B | `PagoModal.tsx:177` | El botón de salida dice "Cerrar"; en las demás, "Cancelar". | BAS-10. | Consistencia. |
| PAG-08 | B | `PagoModal.tsx:377` | El método en minúscula y solo ("· otro"). | "Otro método". | Legibilidad. |
| PAG-09 | B | `PagoModal.tsx:232-241` | El monto no se selecciona al entrar (en Corregir y Aceptó sí). | Seleccionarlo. | Hay que borrar el sugerido a mano. |

### 3.8 Cobros (`CobranzaView`)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| COB-01 | A | `CobranzaView.tsx:641-652` + `pagos.repo.ts:500-590` | "Abonar" en la fila de una venta abre el abono por clienta, que reparte por antigüedad: la plata va a otra venta. | Abonar a esa venta. | Ver §1. |
| COB-02 | A | `CobranzaView.tsx:438-441,696-706` | "Registrar abono" arranca con la primera clienta elegida, en un `<select>` sin búsqueda. | Sin elegida; buscador con las que deben primero. | Ver §1. |
| COB-03 | A | `CobranzaView.tsx:676-796` | Ventana de abono propia: Escape y la X cierran sin preguntar, sin `role="dialog"`, selects nativos con otro estilo, "Monto (USD)" vs "(C$)", notas en una línea, sin equivalencia, sin "cómo queda", sin decir a qué ventas se reparte, errores en avisos flotantes en "tú" ("Selecciona a qué clienta abonar", "Ingresa un monto válido…"), sin Deshacer (el IPC ya devuelve el `evento_grupo_id`). | La ventana de abono única, en su modo "a la cuenta de la clienta" (TRA-02). | Ver §1. |
| COB-04 | M | `CobranzaView.tsx:85-86` | Moneda y método fijos en córdobas y efectivo. | Preferencia de Configuración. | TRA-11. |
| COB-05 | B | `CobranzaView.tsx:209` | "Abono de C$1831.00 registrado con éxito": número armado a mano sin separador de miles. | `formatearMoneda`, sin "con éxito". | TXT-07. |
| COB-06 | M | `CobranzaView.tsx:804` | "¿Anular este abono? $16.38 de María." aunque haya pagado C$600. | `textoPagado`. | TRA-05. |
| COB-07 | B | `CobranzaView.tsx:799-811` vs `PagoModal.tsx:406-417` | La misma confirmación ("¿Anular este abono?") con botones y consecuencias distintas en cada lado. | Una. | Consistencia. |
| COB-08 | M | `CobranzaView.tsx:451-457` | "Recibido en abonos" suma los últimos 150 abonos: no es de hoy ni del mes; cambia cuando entra el 151. | "Cobrado este mes" (o hoy), con el período escrito. | Un número sin período no dice nada. |
| COB-09 | M | `CobranzaView.tsx:614-619` + `lib/whatsapp` | "≈ C$" de cada deuda y el mensaje de WhatsApp con la tasa de hoy. | Tasa de la venta. | TRA-04. |
| COB-10 | M | `CobranzaView.tsx:545-548` | Cada recarga cambia la tabla por "Cargando abonos y cuentas por cobrar..." | TRA-06. | Parpadeo. |
| COB-11 | B | `CobranzaView.tsx:660-666` | Con el filtro "Vencidas" sin resultados dice "Nadie te debe". | "Ninguna cuenta vencida". | Falso: deben, pero al día. |
| COB-12 | B | `CobranzaView.tsx:562-563` | Con el filtro "Transferencia" sin resultados dice "Todavía no hay abonos". | "Ningún abono por transferencia". | Falso. |
| COB-13 | B | `CobranzaView.tsx:502` | El filtro de método no tiene "Otro". | Agregarlo. | Esos abonos sólo se ven en "Todos". |
| COB-14 | B | `CobranzaView.tsx:250-258` | La primera columna del historial es "Registró" (quién y hora). | Clienta y monto primero; quién al final. | Lo que se busca primero. |
| COB-15 | B | `CobranzaView.tsx:275-278,311-313` | "Ver ficha de clienta" y "Ver comprobante" en 11 px bajo cada fila; "Ver comprobante" abre la venta y antes hace una consulta sin indicar que carga. | Fila que se abre con clic; "Ver venta". | Blancos chicos y un nombre que no es. |
| COB-16 | B | `CobranzaView.tsx:327-331` | "Efectivo" en verde y "Transferencia" en gris. | El mismo color. | El color no significa nada. |
| COB-17 | B | `CobranzaView.tsx:577-580` | Las filas de "Por cobrar" se iluminan al pasar el mouse y no hacen nada. | Que abran la venta, o sin hover. | Promete una acción. |
| COB-18 | B | `CobranzaView.tsx:595,605,607` | "cuota(s) vencida(s)", "Tel: 8888", "de $50.00" suelto. | Plural real; sin "Tel:"; "Debe $20 de $50". | Lectura. |
| COB-19 | B | `CobranzaView.tsx:500-541` | Tercer estilo de segmentado (11 px, verde translúcido) con "Método:" y "Estado:". | TRA-12. | Consistencia. |
| COB-20 | B | `CobranzaView.tsx:392-393,450` | `animate-fade-in` + `stagger-children` dos veces, encima del `view-fade-slide` de App: tres entradas para una pantalla. | Una o ninguna. | Movimiento de más. |
| COB-21 | B | `CobranzaView.tsx:488-494,400-429` | La X de limpiar sin nombre; las pestañas sin `role="tab"`. | Agregarlos. | Accesibilidad. |
| COB-22 | B | `CobranzaView.tsx:128` | "Error al sincronizar historial de abonos". | "No se pudo cargar el historial de abonos." | Jerga. |
| COB-23 | B | `CobranzaView.tsx:813-816` | Corregir un abono desde Cobros no muestra "cómo queda" (no recibe la venta). | Pasarle la venta. | En Ventas sí se ve. |

### 3.9 Clientes (`ClientesView` y la ventana de clienta)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| CLI-01 | A | `ClientesView.tsx:507-603,53` | Cuarta versión del abono, dentro de la ficha; Enter en cualquier campo guarda; un clic fuera de la ficha la cierra y se pierde lo escrito; moneda y método fijos. | Botón que abre la ventana de abono única. | Ver §1. |
| CLI-02 | M | `ClientesView.tsx:130-140` | Anular un abono desde la ficha no tiene Deshacer ("Abono anulado con éxito"); desde Cobros y desde Registrar abono sí. | Deshacer. | Consistencia en lo que toca plata. |
| CLI-03 | M | `ClientesView.tsx:728` | "¿Anular este abono? $16.38." en dólares y sin decir de qué venta. | Moneda en que pagó y la venta. | TRA-05. |
| CLI-04 | B | `ClientesView.tsx:682-690` | Anular es un tacho de basura de 22 px; en Cobros y Registrar abono es un botón "Anular". | El botón "Anular". | El tacho dice "borrar" y anular no borra. |
| CLI-05 | M | `ClientesView.tsx:786-801` | "Enviar WhatsApp" del menú pega +505 fijo y abre el chat sin mensaje; los otros dos botones de WhatsApp de la ficha abren lo mismo entre sí. | Un WhatsApp con el código de Configuración. | TRA-03. |
| CLI-06 | M | `ClientesView.tsx:76-89,352-353` | Cada letra del buscador cambia la tabla por "Cargando clientes...". | Filtrar sin vaciar la lista. | TRA-06. |
| CLI-07 | M | `ClientesView.tsx:884-891,955-963` | "Agregar clienta" se cierra con Escape y con clic en el fondo sin preguntar; el velo tiene `cursor-pointer`. | `Dialogo`. | TRA-01. |
| CLI-08 | M | `ClientesView.tsx:926-951` | Enter pasa al campo siguiente y en el último guarda. | TRA-09. | Tres modelos de teclado. |
| CLI-09 | M | `ClientesView.tsx:895-899` | No avisa si ya hay una clienta con ese nombre o ese teléfono. | "Ya existe María López (8888-0000). ¿Es ella?" | Duplicados reparten mal los abonos. |
| CLI-10 | B | `ClientesView.tsx:994` | Sólo "Cómo le decís" dice "Opcional"; también lo son teléfono, ciudad, dirección y notas. | Marcar el único obligatorio (nombre). | Se lee que los otros son obligatorios. |
| CLI-11 | B | `ClientesView.tsx:149` | "María eliminado". | "María eliminada". | Género. |
| CLI-12 | B | `ClientesView.tsx:608-609,651` | "Pedidos" con "N venta(s)"; "Abonos" con "N pago(s)". | "Ventas (N)", "Abonos (N)". | Dos nombres y plurales perezosos. |
| CLI-13 | B | `ClientesView.tsx:702` | "abonos o amortizaciones". | "abonos". | Jerga. |
| CLI-14 | B | `ClientesView.tsx:338,353` | "Buscar clientes", "Cargando clientes...". | "clientas", "…". | Consistencia. |
| CLI-15 | B | `ClientesView.tsx:424` | Pastilla de WhatsApp `text-acento` sobre `bg-acento-suave`; su hover no cambia nada. | `text-acento-fuerte`. | COL-02. |
| CLI-16 | B | `ClientesView.tsx:210-221,398,463` | Avatares de iniciales en cada fila y en la ficha, y un degradado decorativo en el resumen. | Sacarlos o hacerlos útiles. | Adorno que no informa. |
| CLI-17 | B | `ClientesView.tsx:656` | Las filas de abonos se iluminan sin hacer nada. | Sin hover. | Promete una acción. |
| CLI-18 | B | `ClientesView.tsx:316-328` | "Han comprado en total" (suma de toda la vida) en la cabecera. | Algo accionable ("Compraron este mes"). | Dato de poco uso en el lugar más visible. |

### 3.10 Inventario (`InventarioView`) y sus ventanas

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| INV-01 | M | `InventarioView.tsx:1203-1214` + `productos.repo.ts:1088-1108` | "Eliminar definitivamente" borra el producto aunque tenga ventas, lotes o líneas de paquete que lo nombran; la ventana sólo aconseja descatalogarlo. | Que no deje, diciendo por qué ("Tiene 4 ventas: descatalogalo"), como el guardia de clientas de la 2.16.2. | Deja ventas y paquetes apuntando a un producto que no existe. |
| INV-02 | M | `InventarioView.tsx:195-226,823-824` | Cada letra del buscador y cada filtro cambia la tabla por "Cargando inventario...". | TRA-06. | Parpadeo. |
| INV-03 | M | `InventarioView.tsx:825-842` | Con sólo el filtro de categoría o de paquete sin resultados dice "Tu inventario está vacío" y ofrece "Registrar un paquete". | Mirar todos los filtros; "Nada en esta categoría" + "Quitar filtros". | Texto falso que lleva a la acción equivocada. |
| INV-04 | B | `InventarioView.tsx:1112-1131` | "Ajustar stock" del pie, en un producto con tallas, sólo muestra el aviso "Elegí la talla o el tono arriba.". | No mostrarlo con tallas (cada una tiene "Ajustar"). | Un botón que responde con un error. |
| INV-05 | B | `InventarioView.tsx:1130,1234,1162,1295,585` | "Ajustar stock" y "Ajustar existencias"; "Eliminar", "Eliminar por completo..." y "Eliminar definitivamente de la base de datos". | "Ajustar existencias" y "Eliminar para siempre". | Varios nombres por acción; jerga. |
| INV-06 | B | `InventarioView.tsx:901-913,1145-1154` | Un producto descatalogado muestra dos "Reactivar" en el mismo panel. | Uno. | Redundancia. |
| INV-07 | B | `InventarioView.tsx:568-595` | Cada fila descatalogada lleva un tacho rojo permanente y un "Reactivar" con estilo propio. | Acciones en el menú o en el detalle. | Alarma roja en cada fila. |
| INV-08 | B | `InventarioView.tsx:679-704` | "Invertido" y "Ganancia potencial" se pueden apretar pero sólo limpian filtros (la primera no limpia el de paquete; la segunda sólo el de existencias). | Que no parezcan botones. | Acción invisible. |
| INV-09 | B | `InventarioView.tsx:705-719` | "Stock por agotarse" cuenta sobre la lista filtrada sin decir "(en filtro)"; "Filtrando: tocá para ver todo". | Decir el alcance; "hacé clic". | Consistencia. |
| INV-10 | B | `InventarioView.tsx:744-820` | Tres filtros distintos en una barra (dos `<select>` y un segmentado de 5 con doble escala); "Ver los N anteriores…" es una acción dentro de un `<select>`. | Un solo patrón de filtro. | TRA-12. |
| INV-11 | B | `InventarioView.tsx:631-643` | La aclaración de "Producto nuevo" ("Sólo la ficha: las unidades entran con un paquete") está en un `title`. | Texto visible o en la ventana (ya lo dice). | Los tooltips no se leen. |
| INV-12 | B | `InventarioView.tsx:656-664` | Aviso de precios `text-alerta` sobre `bg-alerta-suave`. | `-fuerte`. | COL-02. |
| INV-13 | B | `InventarioView.tsx:977,1022` | Origen de lote "Anterior"; "· cargándose" para un paquete sin cerrar. | "Carga inicial"; "· sin cerrar". | Se lee como que está cargando. |
| INV-14 | B | `InventarioView.tsx:486,514,728` | "variante(s)", "3 unid.", "Buscar por nombre o código...". | Plural real, "3 en bodega", "…". | TXT. |
| INV-15 | B | `InventarioView.tsx:1103,1115,1138` | `text-xs` de Tailwind en vez del token `text-caption`. | Token. | Escala tipográfica. |
| INV-16 | B | `InventarioView.tsx:1187` vs `NuevoEncargoModal.tsx:261` | Comillas rectas "X" acá y tipográficas “X” allá. | Tipográficas. | Consistencia. |
| INV-17 | B | `InventarioView.tsx:860` | Panel de 390 px. | TRA-12. | Consistencia. |
| INV-18 | B | `InventarioView.tsx:623-624,678` | `animate-fade-in` + `stagger-children` anidado. | COB-20. | Movimiento de más. |
| INV-19 | M | `ProductoModal.tsx:219-245,352-360` | Un solo mensaje de error arriba, sin marcar el campo ni llevar el foco; con tallas la ventana tiene scroll y el error queda fuera de la vista. | TRA-10. | Parece que "Crear producto" no hace nada. |
| INV-20 | M | `ProductoModal.tsx:143` | Un producto nuevo arranca con la primera categoría elegida, no "Sin categoría". | "Sin categoría", o la última usada. | El margen sale de una categoría que nadie eligió. |
| INV-21 | B | `ProductoModal.tsx:592-600` | Quitar una talla de un producto con existencias en esa talla no avisa qué pasa con esas unidades. (Por verificar en la app.) | Avisar o impedirlo si tiene unidades. | Unidades que desaparecen de la vista. |
| INV-22 | B | `ProductoModal.tsx:474` | El modo "Multiplicar costo" pide "Costo por" (pista "2 = el doble"). | "Multiplicar el costo por". | Rótulo críptico. |
| INV-23 | B | `ProductoModal.tsx:625-648` | `type="number"` en pack y aviso (con las flechitas del navegador) mientras el resto de los números son texto. | Texto con `inputMode`. | Consistencia. |
| INV-24 | B | `ProductoModal.tsx:669` | "Guardando...". | "…". | TXT-09. |
| INV-25 | M | `AjustarStockModal.tsx:24-25` | "Devolución de clienta" como motivo para sumar unidades: la devolución de verdad se hace corrigiendo o anulando la venta. | Sacar ese motivo o explicar dónde se hace. | Deja la venta cobrada y el stock duplicado. |
| INV-26 | B | `AjustarStockModal.tsx:193-195` | El botón dice "Guardar conteo" aunque el motivo sea "Producto dañado". | "Guardar". | Texto que no corresponde. |
| INV-27 | B | `AjustarStockModal.tsx:24-25` | "Conteo físico" y "Corrección de conteo" no se distinguen. | Uno. | Ambigüedad. |
| INV-28 | B | `AjustarStockModal.tsx:73` | "3.5" se guarda como 3 sin avisar. | Pedir un entero. | Error silencioso. |
| INV-29 | B | `AjustarStockModal.tsx:166-186` | `text-alerta` sobre `bg-alerta-suave`. | `-fuerte`. | COL-02. |
| INV-30 | B | `AjustarStockModal.tsx:133-150` | Chips redondos: quinto estilo de selector. | TRA-12. | Consistencia. |
| INV-31 | B | `RevisarPreciosModal.tsx:72` | Escape cierra aunque se esté aplicando. | No cerrar mientras aplica. | La acción sigue sin nadie mirando. |
| INV-32 | B | `RevisarPreciosModal.tsx:218` | "Aplicando...". | "…". | TXT-09. |

### 3.11 Paquetes (`PaquetesView`, editor, resumen y "Completar")

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| PAQ-01 | A | `PaqueteEditor.tsx:335,1111-1207,748-749` | Escape cierra el editor entero sin preguntar, también cuando se quería cerrar la lista de sugerencias o "Agregar encargo" (que no se cierran con Escape ni con un clic afuera). Igual el clic en el fondo, la X y "Cancelar". | `Dialogo` + Escape por capas. | Un paquete de 30 líneas se pierde con una tecla. |
| PAQ-02 | M | `PaqueteEditor.tsx:559-602,776-781` | Un solo error arriba ("Escribí cuántas unidades de 'X' vinieron"), sin marcar la línea; el editor mide 92 % de la pantalla con scroll. | Fila en rojo, foco en el campo, mensaje junto a la fila. | Con 30 líneas no se encuentra cuál. |
| PAQ-03 | M | `PaqueteEditor.tsx:654-656` | "Paquete guardado. Nada entró al inventario todavía: seguí cargándolo cuando quieras." se corta en una línea. | BAS-02. | Se pierde justo la parte importante. |
| PAQ-04 | B | `PaqueteEditor.tsx:1015-1029,894` | La casilla del impuesto por línea mide 14 px, su significado está en un `title` y la columna se titula sólo "7%". | Casilla de 16 px con rótulo "Pagó impuesto". | Se entiende sólo si ya se sabe. |
| PAQ-05 | B | `PaqueteEditor.tsx:938-945` | "· Vino en pack" / "Por unidad" es un enlace de 12 px que cambia cómo se cargan cantidad y precio. | Un interruptor visible. | Cambio importante escondido. |
| PAQ-06 | B | `PaqueteEditor.tsx:1037-1041` | El peso estimado se muestra como placeholder (desaparece al entrar al campo). | "Estimado 0.40 lb" debajo del campo. | El dato se va cuando se lo necesita. |
| PAQ-07 | B | `PaqueteEditor.tsx:1092-1099` | Quitar una línea no tiene Deshacer. | Deshacer. | Se pierden los números de esa línea. |
| PAQ-08 | B | `PaqueteEditor.tsx:1272` | "Pasar al inventario" gris sin líneas; el mensaje que lo explica nunca se ve. | Activo, con el error. | PAG-05. |
| PAQ-09 | B | `PaqueteEditor.tsx:1122-1127` | Enter agrega la primera sugerencia (bien) pero no hay flechas para elegir otra. | Flechas. | Teclado. |
| PAQ-10 | M | `PaqueteEditor.tsx:733-739`, `PaquetesView.tsx:84-88`, `InventarioView.tsx:1022` | El estado "Cargando" ("PQ-0007 · Cargando", badge "Cargando", "3 cargándose", "Seguir cargando") se lee como "la app está cargando". | "Sin cerrar" y "Seguir anotando". | Un estado con nombre de pantalla de espera. |
| PAQ-11 | B | `PaqueteEditor.tsx:784`, `PaquetesView.tsx:500`, `ReconstruccionModal.tsx:122` | `text-alerta` sobre `bg-alerta-suave`. | `-fuerte`. | COL-02. |
| PAQ-12 | B | `PaqueteEditor.tsx:591,1163` | Comillas rectas 'X' y "X". | Tipográficas. | INV-16. |
| PAQ-13 | B | `PaqueteEditor.tsx:1262,1275`, `ReconstruccionModal.tsx:118,205` | "Corrigiendo...", "Guardando...", "Armando el contenido...". | "…". | TXT-09. |
| PAQ-14 | M | `PaquetesView.tsx:432-433` | Cada recarga cambia la tabla por "Cargando paquetes...". | TRA-06. | Parpadeo. |
| PAQ-15 | B | `PaquetesView.tsx:305-359` | Tres variantes de botón en la misma columna según el estado. | Una. | Consistencia. |
| PAQ-16 | B | `PaquetesView.tsx:453-460` | Al abrir el detalle la tabla pierde tres columnas y todo salta. | Panel encima, sin reacomodar. | Salto de diseño. |
| PAQ-17 | B | `PaquetesView.tsx:526` | "Impuesto (7%)" usa el porcentaje de hoy, no el del paquete. | El del paquete. | Dato histórico. |
| PAQ-18 | B | `PaquetesView.tsx:525-533` | "Total pagado" con córdobas debajo y las filas sólo en dólares. | El mismo criterio. | VEN-04. |
| PAQ-19 | B | `PaquetesView.tsx:588,627` | "línea $X" y el título "Al entrar" no se entienden solos. | "Costo de la línea $X", "Qué cambió al entrar". | Lectura. |
| PAQ-20 | B | `PaquetesView.tsx:474` | Panel de 420 px. | TRA-12. | Consistencia. |
| PAQ-21 | B | `PaquetesView.tsx:243-251` | El badge de estado lleva además un punto del mismo color. | Uno de los dos. | Doble señal. |
| PAQ-22 | B | `ReconstruccionModal.tsx:57` | Escape cierra aunque esté guardando. | No cerrar mientras guarda. | INV-31. |
| PAQ-23 | B | `ReconstruccionModal.tsx:70` | "producto(s)". | Plural real. | TXT-10. |

### 3.12 Configuración (`ConfigView`, categorías, nube)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| CFG-01 | A | `ConfigView.tsx:437-464` + `parametros.repo.ts:191-197,348-392` | Cada "Guardar configuración" recalcula en silencio los precios del catálogo (sin aviso, sin Deshacer, sin auditoría). | Mandar sólo lo que cambió; margen o redondeo nuevos abren "Revisar precios". | Ver §1. |
| CFG-02 | A | `ConfigView.tsx:1490-1512,358-376,1529-1582,1201-1253` | Cuatro formas de guardar y ningún aviso de cambios sin guardar. | Ver §1. | Ver §1. |
| CFG-03 | M | `ConfigView.tsx:480-489,696-704` | "Recalcular precios del inventario" cambia todos los precios al instante, sin confirmar, sin Deshacer, con el margen guardado (no el escrito en pantalla), y si falla no dice nada. | Que abra "Revisar precios" de Inventario (lista, elegir, Deshacer). | La misma acción tiene una versión segura y otra no. |
| CFG-04 | M | `ConfigView.tsx:388-435,1535` | Errores de validación en avisos flotantes que se cortan ("La tasa de cambio (C$ por USD) debe ser un número válido mayor a cero."), en registro formal y con jerga ("El impuesto tax de USA (%)"). | En el campo, con foco y scroll; en vos. | TRA-10, TXT-12. |
| CFG-05 | M | `ConfigView.tsx:338-349,1360,318-336` | La exportación de Abonos sale sólo en dólares: un abono de C$600 aparece como 16.38, sin columna de moneda, monto en córdobas, tasa ni quién lo registró. Ventas exporta el estado crudo ("PENDIENTE", "CANCELADA") y Abonos el método crudo ("EFECTIVO"). | Moneda, monto en su moneda, tasa, quién; estados y métodos en palabras. | Es lo que se le da a la contadora. |
| CFG-06 | B | `ConfigView.tsx:607-629` | La tasa de cambio está en la tercera tarjeta, dentro de "Lo que te cobran", sin fecha de la última actualización ni aviso de que sólo afecta lo nuevo. | Arriba, con "actualizada el …" y la aclaración. | Es lo que más se toca. |
| CFG-07 | B | `ConfigView.tsx:522` | La primera sección es "Nube" (técnica). | Al final. | Lo de todos los días primero. |
| CFG-08 | B | `ConfigView.tsx:1575-1582` | Archivar una categoría es inmediato, sin confirmar ni Deshacer, y no dice qué pasa con sus productos. | Confirmar diciendo cuántos productos tiene. | Cuarto verbo para sacar algo (TXT-02). |
| CFG-09 | B | `ConfigView.tsx:491-516,1229-1231,1635-1637` | Enter en la página pasa al campo siguiente (y en el último guarda todo); en "Invitar" y "Categoría nueva" además ejecuta su acción: hace las dos cosas. | TRA-09. | Doble acción. |
| CFG-10 | B | `ConfigView.tsx:378-386,807,830` | "Tocá una etiqueta para agregarla" (se hace clic); la etiqueta se pega al final del mensaje, no donde está el cursor; "Insertar variable:" con letra de código. | Insertar en el cursor; "Agregar al mensaje:". | Se escribe y hay que mover el texto a mano. |
| CFG-11 | B | `ConfigView.tsx:759-806` | Pestañas y rótulos en Mayúscula Inicial y con barras ("Recordatorio de Saldo", "Plantilla de Cobro / Saldo Pendiente", "Plantilla de Envío de Factura Comercial"). | "Recordatorio de saldo", "Mensaje de cobro". | TXT. |
| CFG-12 | B | `ConfigView.tsx:92-98,1027-1043` | El formulario de cuenta nueva arranca con "BAC Credomatic" escrito (el ejemplo nunca se ve) y el tipo queda siempre "Ahorros" (no hay campo); la moneda aparece como "NIO". | Vacío, con campo de tipo y "Córdobas". | Datos que nadie eligió. |
| CFG-13 | B | `ConfigView.tsx:1005-1013` | Quitar una cuenta bancaria: tacho sin confirmar (vuelve si no se guarda, pero no lo dice). | Confirmar o Deshacer. | Ambiguo. |
| CFG-14 | B | `ConfigView.tsx:1255,1262,1277-1279` | "Invitada — …" (femenino fijo y raya), un "—" suelto para el acceso permanente, la misma explicación dos veces. | "Invitación pendiente"; "Permanente". | Pulido. |
| CFG-15 | B | `ConfigView.tsx:1480-1484` | "Quitar / Desactivar PIN" y "(Guardá la configuración para aplicar el cambio)". | "Quitar el PIN" y guardado al instante. | Pulido. |
| CFG-16 | B | `ConfigView.tsx:471-473,1497-1508` | Al guardar: aviso "Configuración guardada con éxito", botón "¡Guardado con éxito!" y un ícono animado; mientras guarda, el disquete gira. | Un "Guardado" en el botón. | Tres confirmaciones para una acción. |
| CFG-17 | B | `ConfigView.tsx:548-598` | "Activo" en 10 px; `text-sm` de Tailwind; "Sigue a Windows (Noche/Día)" mientras las opciones dicen Claro/Oscuro. | 12 px, tokens, "(ahora oscuro)". | Consistencia. |
| CFG-18 | B | `ConfigView.tsx:1297,1306` | "Desde"/"Hasta" son `<label>` sin `htmlFor`. | `Field`. | Accesibilidad. |
| CFG-19 | B | `ConfigView.tsx:1019` | "No has agregado cuentas bancarias todavía." | "Todavía no agregaste cuentas." | Voz. |
| CFG-20 | B | `ConfigView.tsx:1413-1431` | La versión de la app aparece dentro de "Tu negocio". | Al pie de la página. | No es un dato del negocio. |
| CFG-21 | B | `ConfigView.tsx:611,716,1415` | El mismo ícono para secciones distintas (Tag, Database). | Uno por sección. | Pulido. |
| CFG-22 | B | `ConfigView.tsx:673` | "Fórmula da" en el ejemplo de precio. | "Antes de redondear". | Rótulo críptico. |
| CFG-23 | B | `ConfigView.tsx:1554,1589` | "Margen de X actualizado" en "Ganancia por categoría". | "Ganancia de X actualizada". | Dos nombres. |
| CFG-24 | B | `ConfigView.tsx:352` | "No se pudo exportar: Error: …". | Sin el "Error:" del objeto. | Pulido. |
| CFG-25 | B | `ConfigView.tsx:1241,1404,1430,1508` | "Invitando...", "Generando...", "Cargando...", "Guardando...". | "…". | TXT-09. |
| CFG-26 | B | `NubeSection.tsx:51` | "✓ Sincronización en la nube verificada y activa". | "Conectado: todo se guarda en la nube." | Símbolo en el texto, jerga. |
| CFG-27 | B | `NubeSection.tsx:46-55` | Si la comprobación falla por otra causa, no se dice nada. | Mostrar el error. | Silencio. |
| CFG-28 | B | `NubeSection.tsx:96` | "Comprobando...". | "…". | TXT-09. |

### 3.13 Documentos (factura, proforma, mensajes) y su ventana

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| DOC-01 | A | `plantillas.ts:41,452` + `mensajes.ts:62-63` | Córdobas con la tasa de hoy. | Tasa de la venta. | Ver §1. |
| DOC-02 | M | `plantillas.ts` ("Abonado", "Anticipo Abonado") + `mensajes.ts:110-113` | Lo pagado en dólares aunque haya pagado en córdobas. | Lista de abonos en su moneda o `textoLoPagado`. | TRA-05. |
| DOC-03 | M | `plantillas.ts` (proforma "Políticas…", factura "Condiciones de cambio") | Compromisos escritos en el código: "12 a 18 días hábiles", "no se permiten cancelaciones ni cambios de talla o color", "se reembolsará el 100% de tu anticipo", "Cambios válidos dentro de los primeros 5 días", "Managua, Nicaragua". | Editables en Configuración. | Son promesas por escrito que Ross no puede cambiar. |
| DOC-04 | M | proforma "A cancelar al recibir tus prendas" vs celular "Cancelar esta venta" | En Nicaragua "cancelar" una deuda es pagarla: el documento lo usa así y el celular usa "Cancelar" para anular. | "Anular" en la app (CHI-01); "A pagar al recibir" en el documento. | La misma palabra con significados opuestos. |
| DOC-05 | B | `plantillas.ts` | La factura dice "Cliente" y "Cliente Mostrador", la proforma "Clienta"; "Ciudad" y "Ciudad de Entrega"; Mayúscula Inicial en rótulos ("Saldo Pendiente", "Total Cotizado", "Precio Unit."); "prendas" y "etiquetas" para cualquier producto; "¡Esperamos que disfrutes muchísimo tus prendas!". | Clienta, oración normal, "productos". | Un perfume no es una prenda. |
| DOC-06 | B | `plantillas.ts:58,139,379-380,470,551,650,819-820` | Montos de las tablas en `monospace` dentro de un documento en Plus Jakarta Sans; la fuente se baja de Google Fonts al generar el PDF (sin internet sale con otra). | Cifras tabulares de la misma fuente; fuente incluida. | Va con la tipografía de la 2.20. |
| DOC-07 | M | `DocumentoModal.tsx:101-105` vs `MandarCotizacionModal.tsx:66-81` | Dos caminos para mandar un documento por WhatsApp: "Mandar la cotización" guarda el PDF, abre su carpeta y el chat; "WhatsApp" en la ventana de Factura/Proforma abre el chat sólo con el texto. | El mismo camino en los dos. | Mismo gesto, dos resultados. |
| DOC-08 | M | `DocumentoModal.tsx:109-118` | Marco propio: Escape y clic en el fondo cierran, sin `aria-labelledby`, entra subiendo y sale de golpe. | `Dialogo`. | TRA-01. |
| DOC-09 | B | `DocumentoModal.tsx:181-182` | La X con escala 0,94 y "Cerrar modal". | 0,97 y "Cerrar". | Jerga. |

### 3.14 Sistema de color (`tailwind.config.js`, `temas.css`)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| COL-01 | A | `tailwind.config.js:68-91` | `-700`/`-800` = color base: 35 recuadros en la combinación prohibida (peligro 3,93:1). | 700/800/900 → `-fuerte`. | Ver §1. |
| COL-02 | A | `Badge.tsx:7-14`, `StatTile.tsx:77`, pastillas y contadores de las dos apps | `text-x` sobre `bg-x-suave`. Medido en claro: peligro 3,93, éxito 4,53, alerta 4,53, acento 4,62. En oscuro pasan. | `text-x-fuerte` (5,7 a 6,2:1). Regla nueva en `auditar-colores.mjs`. | Ver §1. |
| COL-03 | B | `Badge.tsx:12-13` | El tono `info` se ve igual que `neutral` y `purple` pinta naranja. | Nombres que digan lo que pintan. | Confunde al elegir. |
| COL-04 | B | 7 usos | Clases que no existen en la escala y Tailwind ignora: `border-warning-200` (3), `border-success-200` (1), `text-warning-900` (1), `text-danger-400` (2), `text-danger-300` (1). | Tokens que existan. | Bordes y textos que no se pintan. |
| COL-05 | B | 11 usos de `dark:` | 10 de 11 repiten el mismo token que la clase normal (no hacen nada); el otro es el que borra el aviso de VED-04. | Sacarlos: los tokens ya cambian con el tema. | Ruido y una trampa. |

### 3.15 Textos (las dos apps)

| ID | Nivel | Qué | Antes | Después | Por qué |
|---|---|---|---|---|---|
| TXT-01 | M | Voz | A Ross la app le habla de vos, salvo "Selecciona a qué clienta abonar", "Ingresa un monto válido…", "ábrelo en Safari", "Ingresa con tu cuenta". A las clientas los mensajes les hablan de tú, salvo "¿Cuándo podés completar el pago?". | Vos en toda la interfaz. Para las clientas, decidir con Ross (tú o vos) y usar una sola. | La mezcla se nota. |
| TXT-02 | M | Verbos para sacar algo | Windows "Anular venta"; celular "Cancelar esta venta", "Venta cancelada" y el badge "Anulada"; clientas "Eliminar"; productos "Descatalogar" y "Eliminar definitivamente"; categorías "Archivar"; paquetes "Eliminar". | Anular (ventas, abonos, encargos: queda registro), Eliminar (lo que se borra), Descatalogar (productos). | "Cancelar" además quiere decir "pagar" (DOC-04). |
| TXT-03 | M | Nombres de secciones | "Cobros" en las barras y "Cobranza" en Inicio ("Ver cobranza"), en Configuración y en el título del celular ("Cobranza y Abonos"); "Catálogo" en el celular e "Inventario" en su Inicio y en Configuración; "Clientes" en la barra y "clienta" en todo lo demás; "Historial" no está en "Al abrir en el celular". | Cobros, Inventario (o Catálogo en los dos), Clientas, y Historial en la lista. | Una sección, un nombre. |
| TXT-04 | M | Stock bajo | "Stock crítico" (Inicio), "Stock por agotarse" (Inventario), "Por acabarse" (filtro), "productos agotados o bajos" (pista). | "Por acabarse" en todos lados. | Cuatro nombres para lo mismo. |
| TXT-05 | B | Métodos y monedas | "Otro" / "Otro método"; "Córdobas", "Córdobas (C$)", "C$ Córdobas", "Córdobas (C$ NIO)", "Dólares ($)", "Dólares (US$)", "US$ Dólares", "Dólares ($ USD)". | "Córdobas (C$)", "Dólares ($)", "Otro". | Consistencia. |
| TXT-06 | B | Validación del monto | "Escribí cuánto pagó la clienta.", "Escribí el monto del abono.", "El monto tiene que ser mayor a 0.", "Ingresá un monto válido mayor a cero.", "Ingresa un monto válido para el abono (mayor a cero)", "Escribí cuánto pagó de verdad.". | Una por caso: vacío ("Escribí cuánto pagó.") y cero o negativo ("Tiene que ser más que cero."). | Seis frases para el mismo error. |
| TXT-07 | B | Éxito | "¡Abono de X registrado con éxito!", "¡Guardado con éxito!", "Configuración guardada con éxito", "Abono anulado con éxito" junto a "Abono registrado. Queda $X.". | Qué pasó, sin "¡…con éxito!". | El aviso informa, no festeja. |
| TXT-08 | B | Tilde | "Solo hay…" (Vender) y "Sólo hay…" (corregir venta). | Uno. | Consistencia. |
| TXT-09 | B | Puntos suspensivos | "..." en unos 30 textos, todos de Windows ("Cargando...", "Guardando...", "Buscar por nombre o código...", "Anular venta..."); el celular ya usa "…". | "…". | Consistencia. |
| TXT-10 | B | Plurales | "producto(s)", "venta(s)", "pago(s)", "cuota(s) vencida(s)", "variante(s)". | Plural real. | Se lee como formulario de oficina. |
| TXT-11 | B | Excel | Encabezados sin tilde: "Codigo", "Categoria", "Telefono", "Ultima compra", "Envio", "Metodo" (el archivo ya lleva BOM: las tildes funcionan). | Con tilde. | Lo lee la contadora. |
| TXT-12 | B | Registro formal | "El impuesto tax de USA (%)", "debe ser un número válido mayor a cero", "El PIN debe contener entre 4 y 6 dígitos numéricos (ej. 1234)". | Como el resto: "Tiene que ser un número mayor que cero." | Voz. |
| TXT-13 | B | Jerga técnica | "base de datos", "sincronizar", "amortizaciones", "Óptimo", "ROI", "Ticket Promedio", "modal". | Palabras de negocio. | La app es para Ross, no para el programador. |
| TXT-14 | B | Restos | "cancelala desde Actividad" (Actividad ya no existe); "Registrar paquete / envío"; "Ir a Ventas y Cobros". | Actualizar. | Textos que mandan a lugares que no existen. |

---

## 4. Celular, pantalla por pantalla

### 4.1 Base (estilos, barra de abajo, hojas, avisos)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| CEL-01 | A | toda la app (no hay `popstate`) | "Atrás" de Android con una hoja abierta: la app vuelve atrás o se cierra y se pierde lo cargado. | Cada hoja abierta es una entrada del historial; "atrás" la cierra (preguntando si hay cambios). | Ver §1. |
| CEL-02 | M | `BottomSheet.tsx:209,113-123` | Tocar el velo o deslizar hacia abajo cierra la hoja sin preguntar, aunque tenga un abono o una corrección a medio escribir. | Prop `hayCambios` → "¿Descartar lo que escribiste?". | El equivalente celular de TRA-01. |
| CEL-03 | M | `Snackbar.tsx` + todo el celular | No hay Deshacer: después de un abono o una venta sólo queda corregir o anular. En Windows todo trae "Deshacer (10s)" con el mismo `evento_grupo_id`. | Aviso con acción "Deshacer". | Perdonar el error es más rápido que corregirlo. |
| CEL-04 | M | `Snackbar.tsx:28-44` (19 llamadas) | Los errores duran lo mismo que los éxitos (3,2 s); ninguno pasa una duración mayor. | Error hasta cerrarlo (o 8 s), pausa al tocarlo. | "Pagó C$1,831.00 y el nuevo total es…" se va antes de leerlo. |
| CEL-05 | B | `Snackbar.tsx:59-83` | Entra deslizando desde arriba y se va de golpe; sin `role="status"`; la X de 23 px está dentro de un recuadro que ya cierra al tocarlo; texto de 12 px. | Salida animada por donde entró; rol; sin X redundante; 13-14 px. | Pulido y accesibilidad. |
| CEL-06 | B | `BottomSheet.tsx:179` | Sólo tiene salida animada si se la arrastra; con la X, el velo o al guardar desaparece de golpe. | Salida de ~200 ms siempre. | Lo que entra deslizando, se va deslizando. |
| CEL-07 | B | `BottomSheet.tsx:246-253` | La X mide 32 px (la app define `.tocable` de 48 px). | 44-48 px. | Blanco táctil. |
| CEL-08 | B | `BottomSheet.tsx:215-222` | `role="dialog"` sin `aria-labelledby`; el foco no queda adentro. | Agregarlos. | Accesibilidad. |
| CEL-09 | M | `BottomNav.tsx:89` | Etiquetas del dock de 10,5 px. | 12 px. | Es la navegación principal. |
| CEL-10 | B | `BottomNav.tsx:52-105` | "Activo" se dice cinco veces: pastilla, ícono 8 % más grande, trazo más grueso, color y un punto. | Pastilla y color. | Ruido. |
| CEL-11 | B | `BottomNav.tsx:48` | `active:scale-[0.92]`. | `.m3-press` (0,96). | Rango de Emil. |
| CEL-12 | B | `BottomNav.tsx:9-10,72-84` + `App.tsx:222` | Los contadores del carrito y de cobros existen pero App nunca los pasa; y `animate-in`/`zoom-in` necesitan un plugin que no está instalado. | Pasarlos o sacarlos. | Código que no hace nada. |
| CEL-13 | M | `index.css:183-197` | `user-select: none` en todo el body. | TRA-13. | No se puede copiar un teléfono. |
| CEL-14 | B | `index.css:402-421` | Movimiento reducido cubre las entradas pero no `.scroll-reveal` (sigue subiendo 10 px) ni `.touch-card`. | Cubrirlos. | Quien lo pide suele marearse. |
| CEL-15 | M | `MoneyDual.tsx:24-26` | Córdobas con la tasa de hoy y sin "≈". | TRA-04 y BAS-18. | Una deuda vieja no se paga con ese número. |
| CEL-16 | B | `PullToRefresh.tsx:109` | El indicador tiene `transition-transform duration-200` mientras se arrastra: va detrás del dedo. | Sin transición durante el arrastre. | Emil: lo que sigue al dedo va pegado al dedo. |
| CEL-17 | B | 78 llamadas a `haptics` | Vibra en cada chip, pestaña y filtro; en Ajustes se puede probar pero no apagar. | Vibrar en lo importante (guardar, error) y un interruptor para apagarla. | La vibración pierde significado. |
| CEL-18 | B | `App.tsx:138-140` | "Acceso no autorizado", "no tiene permisos de acceso al sistema de Glow Heaven". | "Esta cuenta no tiene acceso." | Registro. |

### 4.2 Inicio (`DashboardView`)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| CIN-01 | M | `DashboardView.tsx:397-475,275,302,165` | La tarjeta de stock bajo y su "botón" (que no es botón) en `text-peligro` sobre `bg-peligro-suave` (3,93:1); contadores "N ven." y "N bajo" de 10 px con la misma combinación; el aviso de error, igual. | `-fuerte`, 12 px, un botón de verdad. | COL-02. |
| CIN-02 | B | `DashboardView.tsx:397-475` (captura) | La tarjeta de stock ocupa media pantalla con un hueco vacío en el medio. | Alto según contenido, o la lista de lo que falta. | Se lee como error. |
| CIN-03 | B | `DashboardView.tsx:437,535` | Puntos rojos que laten sin parar (`animate-pulse`). | Quietos. | BAS-26. |
| CIN-04 | B | `DashboardView.tsx:222-224` | "Ganancia +$X" pone "+" aunque sea negativa. | Signo real. | INI-19. |
| CIN-05 | B | `DashboardView.tsx:139,151,201,238,250` | `m3-press` (0,96) mezclado con `active:scale-90`/`active:scale-95` en el mismo botón. | Una escala. | Dos reglas peleándose. |
| CIN-06 | B | `DashboardView.tsx:261-293,349-356,521-531` | "Por cobrar", "Inventario", las barras del gráfico y los productos de la hoja son `div` con `onClick`. | Botones. | Accesibilidad. |
| CIN-07 | B | `DashboardView.tsx:521-531` | Tocar un producto de "Stock crítico" lleva al catálogo en general. | A ese producto. | Hay que volver a buscarlo. |
| CIN-08 | B | `DashboardView.tsx:333-336` | "mié 09-27: $120.00 (3 vtas.)". | "mié 27 sep: $120.00 (3 ventas)". | Formato. |
| CIN-09 | B | `DashboardView.tsx:434,449,464,470,509` | "Stock crítico", "Revisar inventario", "Ver inventario", "Ver catálogo" para el mismo destino; "Existencias óptimas en todos los artículos"; "Venta rápida" (botón) y "Vender" (pestaña). | TXT-03, TXT-04. | Varios nombres. |
| CIN-10 | B | `DashboardView.tsx:580-581` | Comentario sobre una confirmación de cerrar sesión que ya no está en esta pantalla. | Sacarlo. | Código muerto. |

### 4.3 Vender (`QuickSaleView`)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| CVE-01 | A | `QuickSaleView.tsx:689-692` | "COBRAR" ilegible en oscuro (1,68:1). **Verificado.** | `text-acento-texto`. | Ver §1. |
| CVE-02 | M | `QuickSaleView.tsx:297` + `ventas.repo.ts:405` | La pantalla de venta registrada arma el código a mano: "V-24"; el real es "V-0024". El recibo por WhatsApp lleva un código que no existe. | Usar el código que devuelve el repositorio. | El comprobante no coincide con el sistema. |
| CVE-03 | M | `QuickSaleView.tsx:1146-1160` | El recibo por WhatsApp es otro mensaje armado a mano: no usa la plantilla de factura, dice "Pagado $16.38" aunque haya pagado en córdobas, "Total cobrado:" aunque sea fiado, y no pasa el código de país. | El mensaje de documento (TRA-03). | Consistencia con Windows. |
| CVE-04 | M | `QuickSaleView.tsx:1160,1226-1234` | Sin teléfono (o Mostrador), "Enviar recibo a WhatsApp" es un enlace sin destino: no pasa nada. | Abrir WhatsApp para elegir el chat, o esconderlo y decir por qué. | Un botón muerto. |
| CVE-05 | M | `QuickSaleView.tsx:973,253-254` | "Crédito / Apartado" promete un apartado, pero la venta del celular siempre se marca entregada: el producto sale del inventario igual. | "Crédito" y, si se quiere apartar, la opción "Se la lleva ahora" como en Windows. | El texto promete algo que no pasa. |
| CVE-06 | M | `QuickSaleView.tsx:563,578,701,722` | Todo producto con variantes dice "Tonos" / "Elegí el tono", también la ropa con tallas. | "Talla o tono" o según el producto. | Una talla M no es un tono. |
| CVE-07 | M | `QuickSaleView.tsx:220-223` | Moneda y método fijos en córdobas y efectivo. | TRA-11. | Preferencia ignorada. |
| CVE-08 | M | `QuickSaleView.tsx:110,1065` | Cada "+" muestra un aviso arriba ("Agregado: X") con vibración; elegir clienta, otro ("Clienta seleccionada: X"). | Sin aviso: la píldora del carrito ya cambia. | Emil: lo que se hace decenas de veces no lleva aviso. |
| CVE-09 | M | `QuickSaleView.tsx:588-624,807-834` | Los − / + de la tarjeta miden 28 px y los del carrito 32 px. | 44 px. | La pantalla más usada con los blancos más chicos. |
| CVE-10 | B | `QuickSaleView.tsx:594-598` vs `113-124` | "−" en 1: en la tarjeta quita el producto; en el carrito no hace nada. | El mismo comportamiento. | Consistencia. |
| CVE-11 | B | `QuickSaleView.tsx:851-857` | "Cambiar" (en rojo) no abre el buscador: deja la venta en Mostrador. | "Cambiar" abre el buscador; "Quitar" aparte. | El nombre no es lo que hace. |
| CVE-12 | B | `QuickSaleView.tsx:698-734` | Elegir un tono cierra la hoja: para dos tonos hay que abrirla dos veces. | La hoja queda abierta con los contadores. | Menos toques. |
| CVE-13 | B | `QuickSaleView.tsx:252` | La venta del celular siempre es de hoy. | Fecha editable (como Windows). | Cargar la venta de ayer. |
| CVE-14 | B | `QuickSaleView.tsx:772` | "Por debajo del costo" en 11 px, sin decir cuánto se pierde. | "Perdés $X" como Windows. | El número es lo que decide. |
| CVE-15 | B | `QuickSaleView.tsx:176-189` | El buscador de clientas consulta la base en cada letra. | Esperar 200 ms. | Lecturas de más. |
| CVE-16 | B | `QuickSaleView.tsx:434,928,944,1043,1087,1098` | Campos con letra de 12 px: en iPhone la pantalla se acerca al tocarlos. | 16 px en campos. | iOS. |
| CVE-17 | B | `QuickSaleView.tsx:503-523` | Cada tarjeta del catálogo aparece con `scroll-reveal` al desplazarse. | Sin animación en listas. | La lista que más se recorre. |
| CVE-18 | B | `QuickSaleView.tsx:1050-1054` | "+ Crear nueva clienta ahora" con ícono de "+" y además "+" escrito, `text-acento` sobre `bg-acento-suave`. | "Clienta nueva" con un ícono; `-fuerte`. | Pulido y COL-02. |
| CVE-19 | B | `QuickSaleView.tsx:1002,1081,1092` | `<label>` sin `htmlFor`. | Asociarlos. | Accesibilidad. |

### 4.4 Cobros (lista, selector, abono, ficha y abonos de la clienta)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| CCO-01 | M | `AbonoModalSheet.tsx:45-54,176` | "Pagar todo" en córdobas llena el saldo con la tasa de hoy y el abono se registra con la de la venta: puede dejar centavos o pagar de más. | Tasa de la venta (pasarla en `VentaCobroItem`) y mostrarla. | "Pagar todo" tiene que cerrar la cuenta. |
| CCO-02 | M | `AbonoModalSheet.tsx:31-32` | Moneda y método fijos. | TRA-11. | Preferencia ignorada. |
| CCO-03 | M | `AbonoModalSheet.tsx` | Sin línea de equivalencia, sin "cómo queda", sin fecha; cambiar la moneda después de "Pagar todo" no convierte el número. | Como la ventana de abono de Windows (TRA-02). | Mismo dato, mismas protecciones. |
| CCO-04 | B | `AbonoModalSheet.tsx:59,66,92` | Errores en avisos flotantes; al registrar, aviso "¡Abono de C$600.00 registrado con éxito!" y además la pantalla de éxito de la hoja. | Error en el campo; una confirmación. | TRA-10, TXT-07. |
| CCO-05 | M | `AbonoModalSheet.tsx:142-145`, `DetalleCobroSheet.tsx:44-48`, `KardexClienteSheet.tsx:177-180` | Tres mensajes más armados a mano (recibo de abono, recordatorio, estado de cuenta), sin plantillas y mezclando tú y vos. | TRA-03. | Consistencia. |
| CCO-06 | M | `KardexClienteSheet.tsx:112-138,194-224` | La tarjeta de arriba mezcla alcances: "Saldo pendiente" es el de esa venta y "Total abonado · N pagos" suma todas sus ventas. | Los dos de la venta, o los dos de la clienta, dicho. | Dos números que no se pueden comparar. |
| CCO-07 | M | `KardexClienteSheet.tsx:114-130` | Después de anular un abono se abre sola la hoja de "Registrar abono". | Preguntar "¿Cargar el abono correcto?". | Navegación que nadie pidió. |
| CCO-08 | B | `DetalleCobroSheet.tsx:139-140` | El botón "Historial" de la ficha abre "Abonos" de la clienta; la pestaña del dock también se llama "Historial" y es otra cosa. | "Abonos". | Nombre repetido. |
| CCO-09 | B | `KardexClienteSheet.tsx:199-206,247` | El saldo en rojo (en el resto, ámbar) y un ícono rojo dentro del botón verde. | Ámbar; ícono del color del texto. | VED-12. |
| CCO-10 | B | `KardexClienteSheet.tsx:256,276-279` | "Historial de Pagos (N)" en una hoja titulada "Abonos"; "abonos o amortizaciones", "aparecerán aquí". | "Abonos (N)"; "acá". | TXT. |
| CCO-11 | B | `CobranzaView.tsx:118` (celular) | "Cobranza y Abonos" en la pestaña "Cobros". | "Cobros". | TXT-03. |
| CCO-12 | B | `CobranzaView.tsx:196-207,244`, `AbonoSelectorSheet.tsx:136-151`, `KardexClienteSheet.tsx:266` | Filas y avisos `text-peligro` sobre `bg-peligro-suave`; la etiqueta "Vencida" con el mismo fondo que su fila; el chip "Vencidas" elegido con el contador en verde. | `-fuerte`, contraste entre etiqueta y fila, contador del mismo tono. | COL-02. |
| CCO-13 | B | `CobranzaView.tsx:414-418` (celular) | Después de un abono parcial la fila desaparece un momento y vuelve al recargar. | Actualizar el saldo en vez de sacar la fila. | Parpadeo. |
| CCO-14 | B | `AbonoSelectorSheet.tsx:49-50,155`, `DetalleCobroSheet.tsx:55` | "Elegí la clienta" pero la lista es por venta (una clienta con 3 ventas aparece 3 veces); fechas "2026-09-20". | "Elegí la venta" o agrupar por clienta; `formatearFecha`. | Lectura. |
| CCO-15 | B | `AbonoSelectorSheet.tsx:98`, `DetalleCobroSheet.tsx:82,99`, `KardexClienteSheet.tsx:196,214` | Rótulos en MAYÚSCULAS de 10 px ("TOTAL POR COBRAR EN EL NEGOCIO"). | Oración normal, 12 px. | Legibilidad. |
| CCO-16 | B | `CobranzaView.tsx:176` (celular) | `py-0.2` no existe en Tailwind. | `py-0.5`. | Clase muerta. |
| CCO-17 | B | `DetalleCobroSheet.tsx:121-125` | Sin teléfono, WhatsApp queda apagado sin decir por qué. | "Sin teléfono en su ficha". | Callejón sin explicación. |
| CCO-18 | B | `CobranzaView.tsx:150-156`, `AbonoSelectorSheet.tsx:80-90` | La X de limpiar búsqueda sin nombre. | aria-label. | Accesibilidad. |

### 4.5 Historial, correcciones y documento

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| CHI-01 | M | `HistorialView.tsx:154,350,376,420` vs `298` | "Cancelar esta venta", "Sí, cancelar la venta", "Venta cancelada", "Esta venta ya está cancelada" y el badge "Anulada" en la misma pantalla. | "Anular" en todo (TXT-02). | "Cancelar" también es el botón de no hacer nada, y en Nicaragua es pagar. |
| CHI-02 | B | `HistorialView.tsx:423-441` | Las consecuencias de anular van en 11 px. | 13-14 px. | Es lo que hay que leer antes de confirmar. |
| CHI-03 | B | `HistorialView.tsx:180` | Un encargo no se puede corregir desde el celular y el botón no aparece, sin decir por qué. | "Los encargos se corrigen en la computadora." | Explicar la ausencia. |
| CHI-04 | B | `CorregirVentaSheet.tsx:316` | "cancelala desde Actividad" (ya no existe). | "anulala desde Historial". | Error de la 2.16.1. |
| CHI-05 | B | `CorregirVentaSheet.tsx:35-40` | El precio de una línea y el descuento no se pueden cambiar desde el celular, y la hoja no lo dice. | Decirlo. | Se busca y no está. |
| CHI-06 | B | `CorregirVentaSheet.tsx:241-252` | Sin resumen de qué cambia (sólo el total tachado); en Windows se listan lo que sale, lo que entra y cómo queda. | El mismo resumen. | Consistencia. |
| CHI-07 | B | `CorregirAbonoSheet.tsx:167-183` | El método y la fecha no tienen rótulo visible (sólo aria-label). | Rótulos. | Se ve un valor sin saber qué es. |
| CHI-08 | M | `DocumentoSheet.tsx:164-169` | El total en córdobas con la tasa de hoy; el PDF con otra (DOC-01). | Tasa de la venta. | La hoja y el PDF pueden decir montos distintos. |
| CHI-09 | B | `DocumentoSheet.tsx:153-190` | No muestra el documento (sólo una lista de líneas). | Vista previa del documento. | En Windows se ve tal cual sale. |

### 4.6 Catálogo (`InventoryQuickView`, ficha de producto)

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| CCA-01 | B | `FichaProductoSheet.tsx:36-40` | El mensaje para compartir usa tú ("Contáctanos"), raya "—", "Tonos disponibles" también para tallas, y dice cuántas unidades quedan de cada una. | Voz decidida (TXT-01), "Tallas o tonos", y confirmar con Ross si mostrar cantidades. | Es lo que ve la clienta. |
| CCA-02 | B | `InventoryQuickView.tsx:118` + `BottomNav.tsx:20` | El ícono del Catálogo es una lupa. | Un ícono de catálogo. | La lupa dice "buscar". |
| CCA-03 | B | `InventoryQuickView.tsx:186-265` | Dos filas de chips: "Todo" (paquetes) y "Todos" (categorías). | Un filtro por fila con nombre, o uno combinado. | Confunde. |
| CCA-04 | B | `InventoryQuickView.tsx:365-376` | Filtrando sólo por paquete, el vacío dice `No hay coincidencias para "" en la categoría "Todos".`; "Restablecer filtros" no quita el de paquete. | Texto según el filtro; quitar todos. | Texto roto. |
| CCA-05 | B | `InventoryQuickView.tsx:314,349` | "#P-0012" y "3 disp.". | "P-0012", "3 en bodega". | TXT. |

### 4.7 Ajustes y entrada

| ID | Nivel | Dónde | Antes | Después | Por qué |
|---|---|---|---|---|---|
| CAJ-01 | A | `AjustesView.tsx:53-55,95-98` | Campos vacíos y "Guardar cambios" visible; guardar borra nombre y teléfono del negocio. **Verificado en el emulador.** | Ver §1. | Ver §1. |
| CAJ-02 | M | `AjustesView.tsx:283-286` | "Se cambia desde la computadora. Tocarla recalcula los precios de todo el catálogo." Cambiar la tasa no recalcula precios. | "Se cambia desde la computadora: afecta las ventas nuevas." | Texto falso. |
| CAJ-03 | B | `LoginView.tsx:74-80,86-116,174` (celular) | "Punto de Venta Móvil" con un punto que late; subtítulo de folleto ("catálogo de maquillaje sincronizado en tiempo real"); "ábrelo en Safari" junto a "Tocá"; avisos `text-alerta` sobre `bg-alerta-suave`. | Sin punto animado, una línea útil, vos, `-fuerte`. | Pulido. |

---

## 5. Plan de corrección por fases

Reglas para todas las fases:

- **Nada se ejecuta sin tu autorización**, fase por fase.
- Cada fase termina con las pruebas de siempre (`npm test`, el emulador, las dos suites de interfaz) más **casos nuevos que reproducen cada hallazgo de nivel A y M antes de arreglarlo**, y se publica en las dos apps sólo con tu visto bueno.
- Primero lo que toca plata o datos; después lo que se arregla una vez en un componente y repara muchas pantallas; al final el pulido.
- Las fases 3, 4 y 5 no dependen entre sí y se pueden reordenar. La 0 va primero siempre.

### Fase 0 · Datos y plata (urgente, cambios chicos) · sugerida como 2.16.3

**Objetivo**: que ninguna pantalla cambie o registre datos que nadie decidió, y que ningún aviso de plata quede ilegible.

> **Estado al 30/9**: hecha, probada y **publicada como 2.16.3** en las dos apps. Cada uno de los 18 hallazgos de la tabla tiene una prueba que se vio fallar antes del arreglo: `tests/fase0-auditoria.test.ts` (12, motor en memoria), 8 casos nuevos en `tests/interfaz-escritorio/pruebas.py` y 6 en `tests/interfaz/pruebas.py`. `tests/motor-real/fase0-auditoria.test.ts` repite cinco de las reglas contra el emulador. Tres cosas salieron distintas de lo planeado:
>
> - **"Recalcular precios del inventario" ya no existe como botón**: ahora es "Revisar precios del inventario" y abre la misma ventana que el aviso de Inventario, donde se elige qué precios cambiar. Guardar un margen o un redondeo nuevos la abre sola.
> - **"Registrar abono" de Cobros arranca sin clienta y lista primero a las que deben, con su saldo**; el buscador de clientas queda para la Fase 2, con el formulario único de abono.
> - **El contraste se mide además en la pantalla**, no sólo en el código: un caso en cada suite recorre las pantallas en claro y en oscuro y falla si algún texto queda con el color base sobre su tinte. `auditar-colores.mjs` mira cada `className` por separado y no ve un texto cuyo fondo lo pone el contenedor. Buscando esos casos aparecieron 16 más (Inicio del celular, avisos de entrada, "Anticipos por entregar", aviso de precios), que se corrigieron en esta fase aunque el plan los tenía en la 3.

| Qué | IDs | Cómo se comprueba |
|---|---|---|
| Ajustes del celular: los campos se llenan cuando llegan los parámetros; "Guardar" sólo con un cambio real; texto de la tasa corregido. | CAJ-01, CAJ-02 | Prueba de interfaz del celular: abrir Ajustes y leer los campos (hoy falla, igual que la verificación de esta auditoría). |
| Guardar Configuración manda sólo lo que cambió; margen o redondeo nuevos abren "Revisar precios"; "Recalcular precios" también. | CFG-01, CFG-03 | Prueba contra el emulador: guardar un mensaje no cambia ningún precio. |
| Ctrl+Z no actúa dentro de un campo y deshace el aviso más reciente. | BAS-01 | Prueba de interfaz de escritorio. |
| Cobros: "Abonar" en una fila registra en esa venta; "Registrar abono" arranca sin clienta. | COB-01, COB-02 | Prueba contra el emulador: abono desde la fila de la venta más nueva cae en esa venta. |
| La tasa de la venta en la factura, la proforma, su mensaje, la hoja de documento y "Pagar todo" del celular. | DOC-01, CHI-08, CCO-01 | Prueba unitaria de `plantillas` y `mensajes` con una tasa distinta a la de hoy. |
| Contraste: escala de Tailwind 700/800/900 → `-fuerte`; badges y pastillas con `-fuerte`; aviso de pérdida en oscuro; "COBRAR" del celular. | COL-01, COL-02, VED-04, CVE-01 | `auditar-colores.mjs` con la regla nueva "nunca --x sobre --x-suave"; capturas en los dos temas. |
| Contado en córdobas: "Cobrá C$…" con el total después del descuento. | VED-03 | Prueba de interfaz de escritorio. |
| Recibo del celular con el código real. | CVE-02 | Prueba de interfaz del celular. |
| Eliminar un producto con ventas o paquetes no se permite (se ofrece descatalogar). | INV-01 | Prueba contra el emulador. |
| Los avisos no se cortan: hasta 3 líneas; los errores duran más. | BAS-02 | Prueba de interfaz de escritorio. |

### Fase 1 · Un solo marco de ventana y formularios que no pierden lo escrito · sugerida como 2.17.0

**Objetivo**: toda ventana y toda hoja se cierra igual, pregunta antes de descartar, y dice los errores donde están.

> **Estado al 1/10**: hecha, probada y **publicada como 2.16.4** en las dos apps. Los 37 hallazgos de la tabla quedaron resueltos. Cada A y cada M se vio fallar contra la 2.16.3 antes del arreglo: 8 casos nuevos en `tests/interfaz-escritorio/pruebas.py` y 2 en `tests/interfaz/pruebas.py`. Cómo quedó:
>
> - **Un solo marco, en tres pisos**: `MarcoModal` (capa, foco, teclado, salida), `Ventana` (más "¿Descartar lo que escribiste?") y `Dialogo` (más título, cuerpo y pie). Las nueve ventanas con marco propio usan `Ventana` o `Dialogo`. `useCerrarConEscape` se borró.
> - **"Cancelar" también pregunta** si hay algo escrito, no sólo Escape y el clic afuera. Un clic que empieza en un campo y termina en el velo (seleccionar texto) ya no cierra.
> - **En Configuración quedó un solo botón de guardar**, con "Hay cambios sin guardar", "Descartar" y la pregunta al irse a otra sección. No se pasó a guardar por sección. Las categorías siguen guardándose fila por fila, como antes. Quitar una cuenta bancaria queda pendiente a la vista, con "Descartar" para volverla (CFG-13).
> - **Enter ya no guarda** en Clienta, Producto ni Configuración, ni pasa de campo en esas ventanas de varias columnas. Ctrl+Enter guarda en todas. Nueva venta conserva Enter para pasar de campo.
> - **Escape por capas** también en la lista de clientas de Nuevo encargo y en "Agregar encargo" del paquete. Esas listas se cierran además con un clic afuera.
> - **Las sugerencias son listas de verdad** (`role="listbox"`, `role="option"`): con lector de pantalla se oyen como opciones, no como botones sueltos.
> - **Versión**: 2.16.4. La 2.17.0 queda para los encargos en el celular, como ya la tenía reservada `PLAN_ENCARGOS_Y_SIN_CONEXION.md`.

| Qué | IDs | Cómo se comprueba |
|---|---|---|
| Las 9 ventanas con marco propio pasan a `Dialogo` (con ancho de pantalla para los editores grandes): salida animada, "¿Descartar lo que escribiste?", Ctrl+Enter. | TRA-01, VED-01, VED-10, PAQ-01, CLI-07, INV-31, PAQ-22, DOC-08 | Prueba de interfaz: Escape con cambios pregunta; sin cambios cierra. |
| Escape por capas: primero cierra la lista o el menú desplegado, después la ventana. Listas de sugerencias con flechas y Enter. | VED-02, PAQ-01, PAQ-09, ENC-12 | Prueba de interfaz: Escape en la lista de sugerencias no cierra el paquete (en Nueva venta ya cierra sólo la lista), y en las dos se elige con flechas y Enter. |
| `Dialogo` retiene y devuelve el foco; `Confirmar` con "Anulando…", salida animada e id propio; el velo sólo cambia opacidad. | BAS-07, BAS-08, BAS-09, BAS-11, BAS-12, ENC-23 | Prueba de interfaz con Tab. |
| Errores en su campo, con foco y scroll hasta él; botones principales siempre activos. | TRA-10, VED-05, INV-19, PAQ-02, PAQ-08, PAG-05, CFG-04 | Prueba de interfaz: guardar vacío lleva al campo. |
| Un modelo de teclado: Ctrl+Enter guarda en todas; Enter sólo avanza donde tiene sentido. | TRA-09, CLI-08, CFG-09 | Prueba de interfaz. |
| Configuración: un modelo de guardado y aviso de cambios sin guardar. | CFG-02, CFG-13, CFG-15, CFG-16 | Prueba de interfaz: salir con cambios pregunta. |
| Aceptó: protege todos los campos, no sólo el monto; el error del servidor no se pega al monto. | ENC-20, ENC-21 | Prueba de interfaz. |
| Celular: "atrás" de Android cierra la hoja; las hojas con formulario preguntan antes de descartar; salida animada siempre; rótulo y foco. | CEL-01, CEL-02, CEL-06, CEL-08 | Prueba de interfaz del celular con `page.goBack()`. |

### Fase 2 · Un solo abono, la moneda en que pagó y un solo WhatsApp · sugerida como 2.18.0

**Objetivo**: una forma de cobrar por app, que siempre hable en la moneda en que se pagó, con la tasa de la venta, y mensajes que digan lo mismo desde cualquier botón.

| Qué | IDs | Cómo se comprueba |
|---|---|---|
| Ventana de abono única en Windows, con dos modos: "a esta venta" y "a la cuenta de la clienta" (muestra antes a qué ventas va el reparto). Reemplaza la de Cobros y la de la ficha de Clientes. Moneda con las tarjetas de Corregir; el monto sugerido se convierte al cambiar de moneda; línea de equivalencia; preferencia de Configuración; Deshacer en todo. | TRA-02, TRA-11, COB-03, COB-04, COB-05, COB-06, COB-07, COB-23, CLI-01, CLI-02, CLI-03, CLI-04, PAG-01, PAG-02, PAG-03, PAG-04, PAG-06, PAG-07, PAG-08, PAG-09, ENC-19 | Pruebas contra el emulador del reparto por antigüedad (vista previa = lo que se registra) y de la conversión. |
| El mismo criterio en la hoja de abono del celular: preferencia, tasa de la venta, equivalencia, "cómo queda", fecha, una sola confirmación. | CCO-02, CCO-03, CCO-04, CVE-07 | Prueba de interfaz del celular. |
| "Lo pagado" en la moneda en que se pagó en todas las pantallas, documentos y exportaciones. | TRA-05, ENC-02, ENC-03, VEN-03, DOC-02, CFG-05 | Prueba unitaria de los textos con un abono en córdobas. |
| La tasa de la venta en todo lo que describe una venta existente (deudas, recordatorios, `Money`, `MoneyDual`); "≈" siempre que es conversión. | TRA-04, VEN-02, COB-09, CEL-15, BAS-18 | Prueba unitaria. |
| Un módulo de mensajes en `@core` (cobro, recibo de abono, recibo de venta, estado de cuenta, documento, compartir producto) con plantilla y código de país; el mismo camino para mandar un documento; teléfono que se puede agregar donde falta. | TRA-03, INI-02, CLI-05, CVE-03, CVE-04, CCO-05, CCO-17, DOC-07, CCA-01, ENC-22 | Prueba unitaria: cada botón produce el mensaje de su plantilla. |
| Celular: Deshacer en el aviso; los errores esperan a que se lean; los avisos de Windows se pausan al pasar el mouse. | CEL-03, CEL-04, BAS-03 | Prueba de interfaz. |
| Abonos de la clienta en el celular: alcances que se puedan comparar; después de anular se pregunta antes de abrir otra hoja. | CCO-06, CCO-07 | Prueba de interfaz del celular. |

### Fase 3 · Color, contraste y tipografía · puede ir con la revisión de tipografía de la 2.20

**Objetivo**: un solo sistema de color que la auditoría automática pueda vigilar, y la misma tipografía en las dos apps y en los documentos.

| Qué | IDs | Cómo se comprueba |
|---|---|---|
| Reglas nuevas en `auditar-colores.mjs`: "--x sobre --x-suave", clases que no existen, colores escritos a mano, `dark:` redundantes. Y corregir lo que encuentre. | COL-03, COL-04, COL-05, CIN-01, CCO-12, CCO-16, CLI-15, INV-12, INV-29, PAQ-11, CVE-18, CAJ-03, BAS-13 | La auditoría automática en `npm test`. |
| Colores de significado: etapas de encargo, deuda siempre ámbar, leyendas que coinciden con sus gráficas, tokens por tema en las gráficas. | ENC-01, VED-12, CCO-09, INI-15, INI-16, INI-17, COB-16 | Capturas en los dos temas. |
| Destellos y cosas invisibles: fondo de "Iniciando…" y de la entrada en oscuro, ventana que arranca blanca, punto de actualización, riel de descarga, "Ctrl+N", "Volver a intentar". | MAR-05, ACC-01, BAS-23, MAR-06, MAR-07, MAR-09, ACC-03 | Capturas en oscuro. |
| Tamaños y mayúsculas: dock de 12 px, rótulos de 10 px, encabezados de tabla y meses sin MAYÚSCULAS, cifras tabulares de una sola fuente, sombras de token, `text-sm`/`text-xs` → tokens. | CEL-09, CCO-15, BAS-17, INI-23, INI-24, BAS-19, INV-15, CFG-17 | Revisión visual. |
| Una tipografía para las dos apps y los documentos (fuente incluida, sin depender de Google Fonts al generar el PDF). | BAS-34, DOC-06 | PDF generado sin internet. |

### Fase 4 · Movimiento (las reglas de Emil Kowalski)

**Objetivo**: nada se anima si se hace decenas de veces al día o con el teclado; lo que se anima dura menos de 300 ms, usa la curva de salida de la casa y sale más rápido de lo que entra; nada late para siempre.

| Qué | IDs | Cómo se comprueba |
|---|---|---|
| Gráficas de Inicio sin animación al volver (o una vez por sesión, ≤ 250 ms); barras con `scaleX`; Recharts respeta el movimiento reducido. | BAS-24, BAS-25, BAS-35, INI-21, INI-12 | Grabación de pantalla al entrar a Inicio. |
| Sin bucles infinitos (brillo del logo, puntos que laten, urgentes) ni esperas decorativas (400 ms del PIN). | BAS-26, ACC-05, ACC-06, CIN-03, CAJ-03 | Revisión visual. |
| Nada animado por el teclado: cambio de pantalla con Ctrl+número, dígitos del PIN. | MAR-04, ACC-07 | Prueba manual. |
| Presión de botones en 0,97 en todos lados; sin corrimientos ni giros decorativos al pasar el mouse; hover sólo con mouse. | BAS-28, BAS-29, MAR-10, MAR-11, MAR-14, VEN-09, CIN-05, CEL-11, BAS-21 | Revisión del CSS. |
| Curvas y duraciones: `var(--ease-out)`, ≤ 250 ms, `transition` con propiedades explícitas, `will-change` sólo al animar, sin entradas triples al abrir una pantalla, barra lateral sin animar `width`. | BAS-27, BAS-30, BAS-31, BAS-32, BAS-33, COB-20, INV-18, MAR-15 | Revisión del CSS. |
| Avisos (Windows y celular) que entran y salen por el mismo lado, con el contador de "Deshacer" que no cambia de ancho; menús que crecen desde donde se abren y se animan de verdad (hoy dependen de un plugin que no está). | TRA-08, BAS-04, BAS-05, BAS-20, CEL-05, CEL-12 | Grabación de pantalla. |
| Celular: sin aviso por cada "+" ni por elegir clienta, sin `scroll-reveal` en listas, indicador de recarga pegado al dedo, vibración sólo en lo importante (y se puede apagar), movimiento reducido completo, dock con una sola señal de "activo". | CVE-08, CVE-17, CEL-16, CEL-17, CEL-14, CEL-10 | Prueba en el teléfono. |

### Fase 5 · Textos y nombres (un glosario)

**Objetivo**: una palabra por cosa en las dos apps y en los documentos, en vos, sin jerga, sin festejos.

| Qué | IDs | Cómo se comprueba |
|---|---|---|
| Glosario (anexo A) aplicado en las dos apps: secciones, verbos, stock bajo, monedas y métodos. | TXT-01, TXT-02, TXT-03, TXT-04, TXT-05, CHI-01, DOC-04, MAR-08, MAR-16, CIN-09, CCO-08, CCO-11, INV-05, INV-13, PAQ-10, CVE-06, VED-13 | Volver a correr el extractor de textos de esta auditoría y buscar las formas viejas. |
| Mensajes: una frase por error, avisos que dicen qué pasó, "…", plurales reales, tildes en Excel, registro de vos, sin jerga. | TXT-06, TXT-07, TXT-08, TXT-09, TXT-10, TXT-11, TXT-12, TXT-13, TXT-14, BAS-10 | Búsqueda automática de `...`, `(s)`, "con éxito", formas en tú. |
| Textos falsos o que prometen otra cosa. | INI-04, INI-05, ENC-07, ENC-18, COB-11, COB-12, INV-03, CVE-05, CVE-11, CHI-04, CCA-04 | Revisión con los casos de prueba. |
| Textos por pantalla. | INI-07, INI-08, INI-09, INI-10, INI-13, VEN-08, VEN-11, VEN-12, VED-08, VED-09, VED-11, VED-14, VED-15, ENC-10, ENC-11, ENC-14, ENC-24, COB-18, COB-22, CLI-10, CLI-11, CLI-12, CLI-13, CLI-14, INV-09, INV-14, INV-16, INV-22, INV-24, INV-26, INV-27, INV-32, PAQ-12, PAQ-13, PAQ-19, PAQ-23, CFG-10, CFG-11, CFG-14, CFG-19, CFG-22, CFG-23, CFG-24, CFG-25, CFG-26, CFG-28, DOC-05, DOC-09, ACC-02, ACC-04, ACC-08, CEL-18, CIN-08, CCO-10, CCO-14, CHI-03, CHI-05, CCA-05, CCA-03 | Revisión de las capturas. |
| Los compromisos de los documentos (plazos, cambios, reembolsos, ciudad) pasan a Configuración. | DOC-03 | Configuración y PDF. |

### Fase 6 · Coherencia de pantallas y fricción diaria

**Objetivo**: las piezas repetidas se vuelven una, las listas no parpadean, los atajos y menús cumplen lo que prometen, y se cierran los detalles de cada pantalla.

| Qué | IDs | Cómo se comprueba |
|---|---|---|
| Recargar sin vaciar la lista (datos a la vista + indicador chico). | TRA-06, INI-01, VEN-01, COB-10, CLI-06, INV-02, PAQ-14, CCO-13 | Prueba de interfaz: después de un abono la tabla no desaparece. |
| Menús: atajos reales o sin etiqueta; anclados al botón; flechas. Atajos Ctrl+1…7 en el orden de la barra; confirmar antes de cerrar sesión. | TRA-07, MAR-17, MAR-18, BAS-22, MAR-03, MAR-02 | Prueba de interfaz con teclado. |
| Un buscador, un segmentado, un ancho de panel, un "vacío". | TRA-12, VEN-10, ENC-08, ENC-09, COB-19, INV-10, INV-17, INV-30, PAQ-20, BAS-16 | Revisión visual. |
| Texto seleccionable; tablas y tarjetas que se abren con teclado; roles y nombres accesibles. | TRA-13, MAR-01, CEL-13, BAS-15, BAS-14, BAS-06, COB-21, INI-11, INI-25, CIN-06, CCO-18, CVE-19, CFG-18, CHI-07, CEL-07 | Prueba con teclado y lector de pantalla. |
| Inicio: cobrar desde la lista de deudoras, destinos correctos, meta desde Configuración, signos, hueco de "Dónde está tu plata", tema con menú. | INI-03, INI-06, INI-14, INI-18, INI-19, INI-20, INI-22, ACC-09, ACC-10, MAR-12, MAR-13 | Revisión visual. |
| Ventas y su editor: jerarquía del detalle, un "Nueva venta", tarjetas que no son botones, un porcentaje de ganancia, clienta rápida con aviso de duplicado, pasos, "Vender todo", orden de monedas, código muerto. | VEN-04, VEN-05, VEN-06, VEN-07, VED-06, VED-07, VED-16, VED-17, VED-18, VED-19 | Prueba de interfaz. |
| Encargos: acciones de pieza con blanco táctil, etapa sin repetir, "Pagos" descubrible, clienta nueva sin fantasmas, rojo único, X más grande, costo manual respetado. | ENC-04, ENC-05, ENC-06, ENC-13, ENC-15, ENC-16, ENC-17 | Prueba de interfaz. |
| Cobros y Clientes: métricas con período, filtro "Otro", columnas en orden, enlaces de fila, hovers que prometen, duplicados de clienta, adornos. | COB-08, COB-13, COB-14, COB-15, COB-17, CLI-09, CLI-16, CLI-17, CLI-18 | Prueba de interfaz. |
| Inventario y Paquetes: botones que responden con error, duplicados, tachos permanentes, tarjetas-botón, aclaraciones visibles, categoría por defecto, tallas con unidades, números enteros, motivos de ajuste, casilla del impuesto, pack, peso estimado, quitar línea, tabla que no salta, impuesto histórico, criterio de moneda, doble señal. | INV-04, INV-06, INV-07, INV-08, INV-11, INV-20, INV-21, INV-23, INV-25, INV-28, PAQ-03, PAQ-04, PAQ-05, PAQ-06, PAQ-07, PAQ-15, PAQ-16, PAQ-17, PAQ-18, PAQ-21 | Prueba de interfaz y contra el emulador (INV-21, INV-25). |
| Configuración: la tasa arriba y con fecha, la nube al final, archivar categoría con confirmación, cuenta bancaria sin datos inventados, versión al pie, íconos, error de la nube. | CFG-06, CFG-07, CFG-08, CFG-12, CFG-20, CFG-21, CFG-27 | Revisión visual. |
| Celular: blancos de 44 px, "−" consistente, tonos sin cerrar la hoja, fecha de la venta, pérdida con monto, búsqueda con espera, campos de 16 px, stock sin hueco, producto que lleva a su ficha, fecha legible, correcciones con resumen, documento con vista previa, consecuencias legibles, ícono del catálogo. | CVE-09, CVE-10, CVE-12, CVE-13, CVE-14, CVE-15, CVE-16, CIN-02, CIN-04, CIN-07, CIN-10, CHI-02, CHI-06, CHI-09, CCA-02 | Prueba en el teléfono. |

### Decisiones que necesito antes de empezar (o durante)

| Decisión | Afecta | Opciones |
|---|---|---|
| ¿Cómo les habla el negocio a las clientas en los mensajes? | TXT-01, Fase 2 y 5 | Tú (como hoy casi todos) o vos (como la app). |
| ¿"Inventario" o "Catálogo" para la sección de productos? | TXT-03 | Uno para las dos apps. |
| ¿Se les dice a las clientas cuántas unidades quedan? | CCA-01 | Sí / no. |
| Textos de compromiso de la proforma y la factura (plazos, cambios, reembolsos). | DOC-03 | Dejar los actuales como punto de partida editable, o cambiarlos. |
| "Pure · Magic · Divine" en la pantalla del PIN: ¿es el lema de la marca? | ACC-08 | Conservar o sacar. |
| ¿La meta de margen de la gráfica de Inicio existe? | INI-18 | Sacarla, o tomarla de Configuración. |
| Tipografía común para las dos apps y los documentos. | BAS-34, DOC-06 | Plus Jakarta Sans en las dos (incluida en la app), o la del sistema. |
| Orden de las fases 3, 4 y 5. | Plan | Como está, o por lo que Ross más note. |

---

## 6. Lo que ya está bien (y hay que conservar al corregir)

- **Paquetes**: la cuenta a la vista ("Mercadería + Impuesto + Flete = Pagado"), el precio antes → después por producto, la confirmación con números ("Entran 24 unidades de 6 productos por $370. 2 cambian de precio"), el resumen al terminar y "Te dejó hasta hoy".
- **Corregir una venta** (Windows): "Qué cambia" con lo que sale, lo que entra, el total antes → después y cómo queda el abono; la explicación del contado que sigue al total.
- **Corregir un abono**: la moneda primero, "como se registró" marcado, el aviso si se cambia de moneda, la tasa del abono, quién lo registró.
- **Registrar abono** (Windows): la equivalencia a la tasa de la venta, "cómo queda" antes de guardar, Deshacer, confirmación al anular.
- **Encargos**: la lista no se borra mientras recarga; todas las acciones de pieza tienen Deshacer; Nuevo encargo con errores en su campo y foco; Anular encargo con destino de cada pieza y del anticipo.
- **Inventario**: "¿Agregás X a un paquete?" después de crear, el costo lote por lote, "Revisar precios" (lista, elegir, "Se puede deshacer"), Ajustar con lo registrado y la diferencia antes de guardar.
- **Configuración**: las consecuencias antes de quitar un acceso, la vista previa del mensaje con datos de ejemplo, el ejemplo de precio en vivo, el período de exportación con "Este mes / Este año / Todo", el CSV con BOM.
- **Celular**: la hoja que se arrastra con el dedo (resistencia hacia arriba, cierre por velocidad, captura del puntero, un solo dedo, montada en `<body>`, se acomoda al teclado); el cambio de pestaña de 160 ms que conserva el scroll; la lista de Cobros compacta (8 clientas por pantalla en vez de 3); la ficha antes de abonar; Historial por día con quién y a qué hora; el total del carrito en la moneda elegida; la pantalla sin conexión que no culpa a la persona; cerrar sesión con confirmación; movimiento reducido (casi completo).
- **Sistema de color**: los tokens y la regla escrita en `temas.css` son correctos; el problema es que la escala de Tailwind no los respeta (COL-01), no la regla.

---

## Anexo A · Glosario propuesto (Fase 5)

| Concepto | Usar | No usar |
|---|---|---|
| Sección de deudas y abonos | Cobros | Cobranza, Cobranza y Abonos |
| Sección de productos | Inventario *(o Catálogo en las dos apps: decisión pendiente)* | mezclar los dos |
| Persona que compra | clienta, Clientas | cliente, Clientes |
| Dejar sin efecto una venta, un abono o un encargo (queda registro) | Anular, anulada | Cancelar, cancelada |
| Borrar algo que no tiene historia (un borrador, una clienta sin ventas) | Eliminar | Archivar, Quitar |
| Sacar un producto de la venta | Descatalogar | Archivar, Eliminar |
| Pocas unidades | Por acabarse | Stock crítico, Stock por agotarse, productos agotados o bajos |
| Unidades disponibles | en bodega | en stock, disp., en tienda, en existencia |
| Artículo vendido | producto | prenda, artículo |
| Variante | talla o tono | tono (para todo), color, variante |
| Pago parcial | abono | pago, amortización |
| Moneda | Córdobas (C$), Dólares ($) | NIO, USD, US$, C$ Córdobas |
| Método | Efectivo, Transferencia, Otro | Otro método |
| Paquete sin cerrar | sin cerrar, Seguir anotando | Cargando, cargándose, Seguir cargando |
| Salir sin hacer nada | Cancelar | No, dejar como está (y variantes) |
| Aviso de que algo se hizo | "Abono registrado. Queda $X." | "¡… registrado con éxito!" |
| Algo que está en proceso | Guardando… (un carácter "…") | Guardando... (tres puntos) |

---

## Anexo B · Cómo se verificó

- **Escritorio**: `npx vite build` y el paquete servido en local contra el simulador (`window.api` del navegador), con Playwright: Inicio con F5 y con "Actualizar" (0 errores), y capturas de las siete pantallas en claro y oscuro.
- **Celular**: emulador local de Firebase + servidor de desarrollo apuntado a él, decorado de `tests/interfaz/sembrar.test.ts`, con Playwright en tamaño de teléfono: Ajustes con parámetros conocidos (campos vacíos y "Guardar cambios" visible, sin tocarlo), y capturas de cada pestaña en los dos temas.
- **Contraste**: fórmula de luminancia relativa de WCAG sobre los valores RGB de `temas.css`.
- Al terminar se apagaron el emulador y los servidores; `git status` quedó limpio (este documento es el único archivo nuevo).
