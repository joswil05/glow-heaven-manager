# El celular como centro: plan unificado de interfaz (reemplaza las fases 3 a 6)

> **Para quién es esto**: Joswill, y las sesiones de Claude y Codex que lo
> implementen, en relevo según [RELEVO.md](../../RELEVO.md).
> **Fecha**: 11 de octubre de 2026. **Estado**: propuesta para aprobar; las
> decisiones abiertas están en la sección 10.
> **Leer antes**: [CONTEXTO_SESION.md](../../CONTEXTO_SESION.md),
> [AGENTS.md](../../../AGENTS.md) y el diseño de las fases del celular
> ([2026-10-02-fases-del-celular-design.md](2026-10-02-fases-del-celular-design.md)).

## 1. Qué pidió Joswill y qué cambia

El 11/10, con C1 a C3 hechas, Joswill pidió:

> "vamos a enfocarnos primeramente en la mejora de la interfaz de la app de
> android, el objetivo será que Ross pueda hacer lo mismo tanto en el
> teléfono y en la laptop sin limitaciones, que el teléfono no solo sea un
> accesorio sino también el centro, igualando la funcionalidad de la app de
> escritorio […] siento que en la app de mobile estamos descuidando el
> diseño UX UI y solo estamos agregando funciones […] no importa que cambies
> los colores o maquetado […] olvídate de las fases 3, 4, 5 y 6 como las
> teníamos planeadas, ahora vamos a unificar todo eso, y en cuanto a la C4,
> esa sí debes concluirla."

Consecuencias, para no equivocarse:

1. **Las fases 3 a 6 de la auditoría dejan de existir como tales.** Sus
   hallazgos no se pierden: se absorben en este plan (sección 11). El orden
   es: **C4** (se termina), después las fases **U1 a U9** de este plan, y
   al final **W1**, que lleva a Windows el mismo sistema visual y glosario.
2. **Paridad total.** Todo lo que se hace en Windows se tiene que poder
   hacer en el celular. Quedan **sin efecto** las decisiones del 2/10 que lo
   limitaban: "en el celular no se editan fichas ni se ajustan existencias"
   y "comprar, recibir, entregar y anular encargos quedan en Windows".
3. **El diseño se puede rehacer**: colores, tipografía y maquetado. Lo que
   no cambia: la cuenta de la plata (centavos, tasa de la venta), las reglas
   del negocio, el español en vos, el glosario y los criterios de Emil
   Kowalski.
4. **"Android" es la PWA**: la misma app corre en el Android de Joswill y en
   el iPhone de Ross. Todo se diseña y se prueba para los dos.

## 2. Cómo se revisó

- **Cada pantalla y cada hoja del celular**, recorridas con los datos de
  prueba a 390 × 844, en claro y en oscuro (90 capturas). Las de
  referencia ("antes") quedan en
  [capturas-celular-2026-10-11/](capturas-celular-2026-10-11/).
- **Todo lo que hace Windows**, desde su contrato de datos (`window.api`,
  `src/preload/api.ts`) y cada vista de `src/renderer/src/views/`, cruzado
  con los métodos de los repositorios que llama el celular.
- **Referencias de diseño**:
  - *Figma Community* (público): "Point of Sales POS Mobile App UI" (Kilmar
    García, en español), "Postkita – Point of Sales Mobile App UI Kit",
    "Mobile UI for Inventory App", "Mobile Invoice", y los kits de finanzas
    "Coinpay" e "iBank – Bank & Wallet".
  - *Mobbin*: la biblioteca pide cuenta, así que no se pudieron ver sus
    pantallas desde acá. Se usan los patrones conocidos de las apps que
    están en ella y se parecen a lo nuestro: **Square POS** y **Shopify**
    (vender y cobrar en el teléfono), **Stripe** (pagos y clientas),
    **Revolut** y **Wise** (montos en dos monedas), **Monzo** (movimientos
    por día), **Cash App** (un monto grande y una acción), **Linear**
    (buscador de todo). Si Joswill tiene cuenta, conviene que guarde ahí
    una colección y la usemos en U1.
- **Criterios**: los de Emil Kowalski (sección 5) y la auditoría del 29/9.

## 3. Inventario de funciones: Windows, el celular hoy y el plan

"Cómo se llega" es el camino de toques o clics de hoy. **Falta** quiere
decir que en el celular no existe. La última columna dice dónde queda en
la navegación nueva (sección 6).

### 3.1 Vender

| Función | Windows hoy | Celular hoy | En el plan |
|---|---|---|---|
| Venta de inventario | Ventas › Nueva venta (Ctrl+N), editor en pasos: productos, clienta, cobro | Vender › "+" en cada producto › barra "Cobrar" › hoja › Registrar venta | Vender (U3) |
| Precio distinto en una línea | Editor › campo "Precio ($)" de la línea | **Falta** | Vender › línea (U3) |
| Fecha de la venta | Editor › "Fecha" | **Falta**: siempre hoy (CVE-13) | Cobro › Fecha (U3) |
| Descuento (% o monto) | Editor › Descuento | Hoja de cobro › chips y campo | Cobro › "Agregar descuento", plegado (U3) |
| Contado, crédito, plan de cuotas | Editor › cobro › cuotas | Contado o "Crédito / Apartado", **sin cuotas** | Cobro (U3) |
| Apartado ("Se la lleva ahora" apagado) | Editor › "Se la lleva ahora" | **Falta** (CVE-05: promete apartado y entrega igual) | Cobro (U3) |
| Pago en córdobas o dólares, método | Editor › cobro | Hoja de cobro › selects | Cobro › segmentados (U3) |
| Elegir o crear clienta al vender | Editor › Clienta | Hoja de cobro › "Mostrador · tocá para elegir clienta" › hoja | Cobro › clienta (U3) |
| Recibo por WhatsApp o PDF | Detalle › Factura | Pantalla "Venta registrada" | Igual, rediseñada (U3) |
| Deshacer la venta | Aviso con Deshacer | Pantalla de venta › Deshacer | Igual (U3) |
| Vender sin señal | — | **Falta** | C4 |

### 3.2 Ventas (historial) y documentos

| Función | Windows hoy | Celular hoy | En el plan |
|---|---|---|---|
| Lista de ventas, búsqueda, período | Ventas › lista, buscador, "Período" | Historial (pestaña), por día, buscador; **sin período** | Más › Ventas (U6) |
| Detalle completo (artículos, abonos, ganancia, saldo) | Ventas › fila › panel de detalle | Historial › fila › hoja con **sólo el total** | Ventas › detalle (U6) |
| Corregir una venta (productos, precio, descuento, fecha, clienta) | Detalle › Corregir venta… | Historial › Corregir venta: **sólo cantidades y clienta** (CHI-05) | Detalle › Corregir (U6) |
| Marcar como entregada (apartado) | Detalle › Marcar como entregada | **Falta** | Detalle (U6) |
| Anular o "Fue un error" | Detalle › Anular venta… | Historial › Cancelar esta venta | Detalle › Anular (U6) |
| Factura, proforma, recibo de abono | Detalle › Ver factura | Historial › Ver factura › WhatsApp / Guardar PDF | Igual (U6) |
| Recordatorio de cobro por WhatsApp | Detalle › WhatsApp | Cobros › deuda › WhatsApp | Clientas (U4) |
| Exportar a Excel | Configuración › Exportar a Excel (desde/hasta) | **Falta** | Más › Reportes › Exportar (U7) |

### 3.3 Cobros y clientas

| Función | Windows hoy | Celular hoy | En el plan |
|---|---|---|---|
| Quién debe y cuánto | Cobros › "Clientas que deben" | Cobros (pestaña), **una fila por venta** | Clientas › "Te deben" (U4) |
| Abono a una venta | Cobros/Ventas › Registrar abono | Cobros › fila › Registrar abono | Clientas › ficha (U4) |
| Abono a la cuenta de la clienta (se reparte entre sus ventas) | Cobros/Clientes › Registrar abono › "a la cuenta" | **Falta** | Clientas › ficha › Registrar abono (U4) |
| Abonos recibidos, con filtros por estado y método | Cobros › "Abonos recibidos" | Historial › Abonos (sin filtros) | Ventas › Abonos (U6) |
| Corregir, anular o borrar un abono | Cobros › abono › Corregir / Anular | Historial › abono › Corregir / Anular | Ventas y ficha (U4, U6) |
| Lista de clientas, búsqueda | Clientes | **Falta** (sólo el buscador al elegir clienta) | Clientas › "Todas" (U4) |
| Ficha de la clienta (contacto, compras, pedidos, abonos, deuda) | Clientes › fila › ficha | Cobros › fila › Historial: **una hoja de abonos de una sola venta** | Clientas › ficha (U4) |
| Agregar, editar, eliminar clienta (nombre, cómo le decís, teléfono, ciudad, dirección, notas) | Clientes › Agregar / Opciones | Sólo crear desde Vender o Anotar pedido | Clientas (U4) |
| Estado de cuenta | Documento | Cobros › ficha | Ficha › Estado de cuenta (U4) |
| Abonar sin señal | — | **Falta** | C4 |

### 3.4 Encargos

| Función | Windows hoy | Celular hoy | En el plan |
|---|---|---|---|
| Lista por fases, búsqueda, cerrados | Encargos › fases, buscador, "Qué cerrados ver" | Inicio › tarjeta Encargos (o Vender › Anotar un pedido) › fases; **sin buscador ni cerrados** | Más › Encargos (U6) |
| Anotar un pedido | Encargos › Nuevo encargo | Vender › Anotar un pedido, o Encargos › Anotar un pedido | Encargos y acción rápida de Inicio (U6) |
| Cotizar, cambiar precios, "No se consiguió" | Encargo › Cotizar | Encargos › detalle › Cotizar | Igual (U6) |
| Mandar la cotización | Encargo › Mandar cotización | Encargos › detalle › Mandar cotización | Igual (U6) |
| Aceptó, con o sin abono | Encargo › Aceptó | Encargos › detalle › Aceptó | Igual (U6) |
| Marcar pieza comprada / desmarcar | Encargo › pieza › Comprado | **Falta** | Detalle › pieza (U6) |
| Registrar abono de un encargo | Encargo › Registrar abono | Sólo al aceptar | Detalle (U6) |
| Entregar | Encargo › Entregar | **Falta** | Detalle (U6) |
| Anular el encargo, "Fue un error" | Encargo › Anular… / Fue un error… | **Falta** | Detalle (U6) |
| Proforma y WhatsApp | Encargo › Proforma / WhatsApp | Dentro de Mandar cotización | Detalle (U6) |
| Anotar sin señal | — | **Falta** | C4 |

### 3.5 Inventario, productos y paquetes

| Función | Windows hoy | Celular hoy | En el plan |
|---|---|---|---|
| Lista, búsqueda, filtros (categoría, paquete, a la venta / a mano / descatalogados) | Inventario › buscador y filtros | Inventario › buscador y un select | Inventario (U5) |
| Ficha: costo, ganancia, lotes, existencias por talla o tono | Inventario › fila › detalle | Inventario › ficha: **precio y existencias** | Inventario › ficha (U5) |
| Movimientos del producto (kardex) e historial de paquetes | Detalle › movimientos | **Falta** | Ficha › Movimientos (U5) |
| Producto nuevo (sólo la ficha) | Inventario › Producto nuevo | Sólo dentro de un paquete | Inventario › + (U5) |
| Editar la ficha (nombre, categoría, tallas/tonos, precio, pack, foto, notas) | Detalle › Editar | **Falta** (sólo Cambiar precio) | Ficha › Editar (U5) |
| Cambiar precio | Detalle › Editar | Ficha › Cambiar precio | Igual (U5) |
| Ajustar existencias | Detalle › Ajustar stock | **Falta** | Ficha › Ajustar (U5) |
| Descatalogar, reactivar, eliminar definitivamente | Detalle › Opciones | **Falta** | Ficha › … (U5) |
| Compartir por WhatsApp | — | Ficha › Compartir por WhatsApp | Igual (U5) |
| Revisar precios desactualizados | Configuración › Revisar precios del inventario | **Falta** | Inventario › aviso y hoja (U5) |
| Registrar un paquete | Inventario › Registrar paquete; Paquetes | Inventario › Llegó un paquete (igual al de Windows desde el 11/10) | Inventario › + y Más › Paquetes (U5) |
| Lista de paquetes con totales | Paquetes › lista | **Falta** (sólo avance en Inicio) | Más › Paquetes (U5) |
| Corregir un paquete recibido | Paquetes › Corregir | Inventario filtrado › Corregir PQ-… | Paquetes › detalle (U5) |
| Completar un paquete viejo (reconstrucción) | Paquetes › Completar | **Falta** | Paquetes › detalle (U5) |
| Resumen de un paquete que se cerró | Inicio y Paquetes | Inicio | Igual (U7) |

### 3.6 Inicio, reportes y configuración

| Función | Windows hoy | Celular hoy | En el plan |
|---|---|---|---|
| Ventas de hoy y ganancia | Inicio | Inicio › tarjeta grande | Inicio (U7) |
| Ganancia del mes, invertido en bodega, más vendidos | Inicio | **Falta** | Más › Reportes (U7) |
| Quién te debe, con WhatsApp | Inicio › "Quién te debe" | Sólo el total "Por cobrar" | Inicio › Te deben (U7) |
| Anticipos por entregar, cotizado sin confirmar | Inicio | **Falta** | Inicio y Reportes (U7) |
| Gráficas con perspectiva | Inicio › gráficas | Inicio › 7 días, sin perspectiva | Reportes (U7) |
| Avance y resumen de paquetes | Inicio | Inicio | Inicio (U7) |
| Tasa de cambio | Configuración › Córdobas por dólar | Ajustes, **sólo verla** | Ajustes › Cobros (U8) |
| Ganancia por defecto y por categoría, redondeo, impuesto, flete por libra | Configuración › Precios | **Falta** | Ajustes › Precios (U8) |
| Moneda y método por defecto, mostrar córdobas, cuotas | Configuración › Cobros | **Falta** | Ajustes › Cobros (U8) |
| Anticipo de encargos, avisos de estancado y saldo urgente | Configuración › Ventas y encargos | **Falta** | Ajustes › Ventas y encargos (U8) |
| Plantillas de WhatsApp | Configuración › Mensajes de WhatsApp | **Falta** | Ajustes › Mensajes (U8) |
| Cuentas bancarias | Configuración › Cuentas bancarias | **Falta** | Ajustes › Cuentas (U8) |
| PIN | Configuración › PIN; candado al abrir | Sólo se pide en "Fue un error" | Ajustes › Seguridad (U8) |
| Quién puede entrar (invitar, quitar) | Configuración › Quién puede entrar | **Falta** | Ajustes › Seguridad (U8) |
| Pantalla al abrir, apariencia, negocio | Configuración | Ajustes (apariencia, nombre, teléfono) | Ajustes (U8) |
| Buscar actualización, vibración | Actualizador | Ajustes | Ajustes › Este teléfono (U8) |

## 4. Lo que se vio en cada pantalla del celular

Lo que funciona bien y se conserva: la hoja que se arrastra y pregunta
antes de descartar, Deshacer en ventas y abonos, el formulario de abono
(moneda primero, "Pagar todo", fecha), cambiar precio con la ganancia a la
vista, el paquete en tres pasos y el modo oscuro bien contrastado.

| Pantalla | Lo que falla |
|---|---|
| Entrada (`00`) | Texto de folleto ("Gestión en vivo… sincronizado en tiempo real") y una píldora de adorno. |
| Inicio (`01`) | Seis tarjetas con el mismo peso; "Venta rápida" y "Cobros" repiten la barra; la gráfica de 7 días ocupa media pantalla para una barra; un botón de recargar en vez del gesto; mayúsculas en rótulos; no dice quién debe. |
| Vender (`02`, `03`) | "Anotar un pedido" ocupa el primer lugar siendo lo menos usado; productos con iniciales aunque tienen foto; "en stock" (el glosario dice "en bodega"); cada producto es una tarjeta con borde; un aviso por cada "+" que tapa el encabezado (CVE-08); dos barras flotantes apiladas (carrito y navegación). |
| Cobro (`04`, `05`) | Descuento siempre abierto; selects nativos; "Crédito / Apartado" promete un apartado que no existe; la clienta es un botón punteado; en la lista de clientas cada fila repite "Elegir". |
| Cobros (`06`–`09`, `60`) | Se titula "Cobranza y Abonos"; una fila por venta, no por clienta; fechas crudas ("2026-10-11"); la "ficha" es una hoja de abonos de una venta, con jerga ("amortizaciones"); no hay abono a la cuenta. |
| Historial (`10`–`14`) | Abonos que dicen "Cliente" en vez del nombre; "Sin dato de quién" en todas las filas; una cotización sin precio aparece como "$0.00"; el detalle sólo muestra el total; corregir habla de "Actividad" y no deja tocar precio ni descuento; "¿Qué pasó?" no marca cuál opción está elegida; "cancelar" donde va "anular". |
| Inventario (`15`–`17`) | "Llegó un paquete" en primer lugar; filtro en un select con rótulo; la ficha gasta media pantalla en un recuadro con iniciales y no muestra costo, lotes ni movimientos; no se puede editar ni ajustar. |
| Paquete (`18`–`20`) | Bien resuelto; el paso 2 vacío es mucho blanco; la hoja de pieza empieza sin decir qué se puede buscar. |
| Encargos (`21`–`25`) | Sin buscador ni cerrados; detalle sin las piezas por estado; "Mandar cotización" explica de más; faltan comprar, entregar, anular. |
| Ajustes (`61`) | Ofrece "avisar cuando queden 2 unidades" (C1 sacó esas alertas); la tasa se ve pero no se cambia; falta casi toda la configuración. |

## 5. Principios

Los criterios de Emil Kowalski, llevados a una app de cobros e inventario
que se usa decenas de veces por día:

1. **Lo frecuente, en un toque desde donde se está**: vender, registrar un
   abono, buscar un producto o una clienta. Lo raro, plegado o en "Más".
2. **Una pantalla, una tarea principal**, con una sola acción primaria.
3. **El estado se ve de un vistazo**: deuda vencida en ámbar, la etapa de
   un encargo, "Pendiente de subir", "Sin conexión".
4. **Nada se anima en lo que se repite** (agregar al carrito, cambiar de
   pestaña, filtrar). Lo que se anima (abrir una hoja, el éxito de una
   venta) dura menos de 300 ms, con curva de salida fuerte
   (`cubic-bezier(0.23, 1, 0.32, 1)`), sale más rápido de lo que entra y
   respeta "reducir movimiento". Nada late ni se mueve solo.
5. **Botones que responden**: `scale(0.97)` al presionar en todos, igual.
6. **Perdonar antes que confirmar**: Deshacer cuando se puede; confirmar
   sólo lo que no se deshace. Las hojas preguntan antes de descartar lo
   escrito.
7. **Datos, no adornos**: sin gráficas vacías, sin textos de folleto, sin
   avisos que dicen lo que ya se ve.
8. **La plata, legible**: dólares grande y córdobas al lado con "≈",
   cifras tabulares, la tasa de la venta para lo que ya existe.
9. **Los errores en su campo**, con el foco ahí.
10. **Funciona sin señal** (C3 y C4) y lo dice sin asustar.

## 6. La navegación nueva

Hoy: Inicio · Vender · Cobros · Historial · Inventario, con Ajustes y
Encargos escondidos (el engranaje y una tarjeta de Inicio) y sin lugar para
Clientas, Paquetes ni Reportes.

**Propuesta** (barra de abajo de cinco destinos, sin animación al cambiar):

| Pestaña | Qué tiene |
|---|---|
| **Inicio** | Hoy, acciones rápidas (Vender, Abono, Pedido, Paquete), te deben, encargos que esperan algo, paquetes en venta y lo último que pasó |
| **Vender** | El punto de venta: buscar o escanear, carrito, cobrar |
| **Clientas** | Cobros y Clientes juntos: "Te deben" primero, "Todas" al lado; la ficha de cada una |
| **Inventario** | Productos y su ficha completa; "+" para producto nuevo o paquete |
| **Más** | Ventas (historial), Encargos, Paquetes, Reportes, Ajustes |

Además:

- **Buscador de todo** (como Linear o Spotlight) desde Inicio: clientas,
  productos, ventas y encargos por nombre, código o teléfono.
- **Atrás de Android y gestos**: cada pantalla de "Más" es una página con
  "Volver"; las hojas siguen cerrándose con "atrás" (CEL-01).
- **Badges** sólo con algo para hacer (encargos por mandar o entregar,
  pendientes de subir), nunca como adorno.

Por qué así: Cobros y Clientes son la misma persona vista de dos lados; en
el teléfono, una lista de clientas con la deuda primero cubre las dos.
Historial pasa a "Más", pero lo de hoy queda en Inicio, que es donde se
mira.

## 7. Sistema visual

### 7.1 Color

La marca es una boutique (el logo: un hongo-casita en tonos crema, rojo
suave y verde). La app hoy parece de banco: verde intenso sobre gris frío.
Propuesta: **neutros cálidos**, el **verde de la marca** como color de
acción y un **acento cálido** sólo para la marca (entrada, documentos),
nunca para acciones.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `fondo` | `#F7F5F2` | `#121110` | Fondo de la app |
| `superficie` | `#FFFFFF` | `#1C1B19` | Listas y hojas |
| `superficie-2` | `#F0EDE8` | `#262420` | Campos, segmentos |
| `texto` | `#1B1A18` | `#F3F1ED` | Texto principal |
| `texto-2` | `#5F5B54` | `#B5B0A7` | Secundario |
| `acento` | `#1E6B52` | `#5FCB9F` | Acción principal, selección |
| `acento-suave` | `#E3F1EA` | `#183A2E` | Fondos de selección |
| `deuda` (ámbar) | `#B45309` sobre `#FEF3E2` | `#F5B256` sobre `#3A2A12` | Te deben, vencido |
| `peligro` | `#C22F3B` | `#F2767F` | Anular, borrar, errores |
| `marca` | `#C9614F` | `#E28B7B` | Sólo marca (entrada, documentos) |

Los valores exactos se ajustan en U1 midiendo el contraste (AA) en los dos
temas; la auditoría de colores (`auditar-colores.mjs`) se amplía con las
reglas de la Fase 3 (COL-03 a COL-05).

### 7.2 Tipografía

**Recomendación: la letra del sistema** (SF Pro en iPhone, Roboto en
Android) para toda la app: se ve nativa, no se baja nada, funciona sin
señal y resuelve BAS-34 y el aviso de "fuente muy usada". Cifras
tabulares en todos los montos. Una letra de marca sólo en el logo y los
encabezados de los documentos.

| Estilo | Tamaño / peso | Uso |
|---|---|---|
| Título grande | 30 / bold | Título de pestaña |
| Monto héroe | 36 / bold, tabular | Total de hoy, total a cobrar |
| Título | 20 / semibold | Títulos de hoja |
| Cuerpo | 17 / regular | Filas, campos (nunca menos de 16 en campos) |
| Secundario | 15 / regular | Subtítulos de fila |
| Rótulo | 13 / medium | Encabezados de sección (sin MAYÚSCULAS) |

### 7.3 Componentes base (U1)

- **Fila de lista** agrupada (como Ajustes de iOS): imagen o inicial,
  título, subtítulo, valor a la derecha, chevrón. Reemplaza a las tarjetas
  con borde en todas las listas.
- **Sección** con rótulo y separadores finos.
- **Segmentado** (reemplaza selects y chips de filtro de dos a cuatro
  opciones).
- **Buscador** fijo arriba de cada lista.
- **Píldora de estado** (deuda, etapa, pendiente de subir).
- **Monto** (dólares + "≈ C$" con la tasa que corresponda).
- **Encabezado grande** que se compacta al bajar (sin animación de
  escala: cambia de tamaño con el scroll, sin rebote).
- **Hoja** con dos alturas (media y completa), la de hoy mejorada.
- **Vacío con acción** ("Todavía no hay clientas · Agregar clienta").
- **Avisos** sólo para Deshacer, errores y sin conexión.
- **Foto de producto** con respaldo neutro por categoría (no iniciales).

### 7.4 Movimiento y vibración

| Qué | Cómo |
|---|---|
| Abrir una hoja | 240 ms, curva de salida; cerrar 180 ms |
| Presionar | `scale(0.97)`, 120 ms |
| Cambiar de pestaña, filtrar, agregar al carrito | Sin animación |
| Éxito de una venta o un abono | Un solo cambio de estado, vibración de éxito; sin confeti |
| Montos | Cambian de una vez, sin contar |
| Deslizar para recargar | Sigue al dedo; sin indicador que late |
| Vibración | Selección en toggles, éxito al registrar, aviso sin red, error al validar; se puede apagar |

## 8. Pantalla por pantalla (lo nuevo)

Cada fase escribe su plan detallado al empezar, como C1 a C4. Acá va la
intención de cada pantalla.

1. **Entrada.** Logo, una línea útil ("Entrá con tu cuenta de Glow
   Heaven"), Google. Sin red: lo dice (ya hecho en C3).
2. **Inicio.** Arriba, "Hoy": vendido (dólares grande, ≈ córdobas),
   ganancia y número de ventas; tocar abre las ventas de hoy. Una fila de
   **acciones rápidas** (Vender, Abono, Pedido, Paquete), como el "Quick
   actions" de las apps de inventario. "**Te deben**": las tres clientas
   que más deben, con WhatsApp, y "Ver todas". "**Encargos**": sólo lo que
   espera algo de Ross (por mandar, esperando respuesta, por entregar).
   **Paquetes en venta** con su avance y el resumen del que se cerró.
   "**Lo último**": los cinco movimientos más recientes. La gráfica se va a
   Reportes. Recargar es deslizar hacia abajo.
3. **Vender.** El buscador primero (nombre, código, tono). Productos con
   foto, precio y "en bodega"; categorías como segmentado deslizable.
   Agregar no muestra aviso: el producto muestra su cantidad y la barra de
   cobro aparece **en lugar de** la barra de navegación ("Cobrar $12.00 ·
   1"), como Shopify POS. "Anotar un pedido" pasa a las acciones de Inicio
   y a Encargos.
4. **Cobro** (pantalla completa, de a pasos cortos en una sola página):
   clienta (buscador en línea, "Mostrador" por defecto); artículos con
   cantidad y **precio editable**; "Agregar descuento" plegado; **forma de
   pago** en un segmentado (Contado · Crédito · Apartado), con plan de
   cuotas opcional en crédito; moneda y método como segmentados; fecha
   (hoy, se puede cambiar); "Se la lleva ahora". Al pie, el total en la
   moneda elegida y "Registrar venta". Éxito: recibo con WhatsApp y PDF,
   "Nueva venta" y Deshacer.
5. **Clientas.** Segmentado "Te deben (n) · Todas"; total por cobrar
   arriba; filas por clienta (no por venta) con la deuda en ámbar si está
   vencida y la última compra; "+" para agregar. **Ficha** a pantalla
   completa: nombre, teléfono (llamar y WhatsApp), deuda total y lo que ya
   pagó; acciones "Registrar abono" (a la cuenta, repartido como en
   Windows, o a una venta) y "Recordar por WhatsApp"; segmentado
   "Compras · Abonos · Pedidos"; "Estado de cuenta"; editar y eliminar.
   Referencia: la tarjeta de cobro de "Mobile Invoice" (monto pendiente,
   estado, línea de tiempo).
6. **Inventario.** Buscador; segmentado "A la venta · Vendidos ·
   Descatalogados"; filtros (categoría, paquete) en una hoja; filas con
   foto, precio y existencias; "+" con "Producto nuevo" y "Llegó un
   paquete". **Ficha**: foto, precio y ganancia, costo, existencias por
   talla o tono, lotes por paquete, movimientos; acciones Cambiar precio,
   Editar, Ajustar existencias, Compartir, Descatalogar. Un aviso arriba
   cuando hay precios para revisar.
7. **Más.** Una lista agrupada con Ventas, Encargos, Paquetes, Reportes y
   Ajustes, cada una con su número si hay algo pendiente.
8. **Ventas.** Segmentado "Ventas · Abonos"; período (Hoy, Semana, Mes,
   elegir); totales del período; lista por día. **Detalle** completo:
   artículos, clienta, abonos, saldo, si se entregó; acciones Factura,
   WhatsApp, Registrar abono, Corregir (con precio, descuento y fecha),
   Marcar entregada, Anular.
9. **Encargos.** Buscador, fases como segmentado con número, cerrados al
   final. **Detalle** como línea de tiempo (Por buscar → Por mandar →
   Esperando → Por comprar → En camino → Por entregar → Entregado), las
   piezas con su estado y la acción que toca en cada fase: Cotizar,
   Mandar, Aceptó, Marcar comprada, No se consiguió, Registrar abono,
   Entregar, Anular, Proforma. Referencia: la línea de tiempo de pedidos de
   Postkita.
10. **Paquetes.** Lista con lo invertido, lo vendido y el avance; detalle
    con contenido, costos y encargos; Registrar, Corregir, Completar
    (reconstrucción) y Eliminar borrador.
11. **Reportes.** Período (Hoy, 7 días, Mes, Año) y una sola gráfica de
    ventas y ganancia; más vendidos; invertido en bodega; cobros por
    moneda y método; anticipos por entregar; cotizado sin confirmar;
    Exportar a Excel (se comparte el archivo).
12. **Ajustes.** Lista agrupada: Tu negocio · Cobros y monedas (tasa
    editable) · Precios y ganancia (por defecto, por categoría, redondeo,
    impuesto, flete por libra, revisar precios) · Ventas y encargos ·
    Mensajes de WhatsApp · Cuentas bancarias · Seguridad (PIN, quién puede
    entrar) · Apariencia · Este teléfono (vibración, versión, datos sin
    conexión) · Cuenta.

## 9. Fases

| Fase | Qué trae | Cómo se comprueba |
|---|---|---|
| **C4** | Vender, abonar y anotar sin señal ([plan](../plans/2026-10-11-c4-sin-internet-operar.md)) | Su plan |
| **U1 · Fundaciones** | Tokens de color y tipografía nuevos, componentes base, reglas de movimiento; auditoría de colores ampliada | Capturas antes/después de todas las pantallas en los dos temas; auditoría en `npm test` |
| **U2 · Navegación** | Las cinco pestañas, "Más", buscador de todo, estado conservado al cambiar | Suite móvil: cada función de la sección 3 se alcanza desde la navegación nueva |
| **U3 · Vender y cobrar** | Punto de venta rediseñado y paridad de la venta (precio por línea, fecha, cuotas, apartado) | Casos de interfaz por forma de pago; emulador |
| **U4 · Clientas** | Cobros y Clientes juntos, ficha completa, abono a la cuenta, CRUD | Casos de interfaz; reparto igual al de Windows |
| **U5 · Inventario y paquetes** | Ficha completa, crear, editar, ajustar, descatalogar, revisar precios; Paquetes como sección, completar | Casos de interfaz; invariante de la bodega |
| **U6 · Ventas y encargos** | Detalle completo y corrección total; encargos con todas sus acciones | Casos de interfaz por fase de encargo |
| **U7 · Inicio y reportes** | Inicio nuevo, Reportes, exportar | Capturas; los números iguales a Windows |
| **U8 · Ajustes** | Toda la configuración de Windows | Un cambio en el celular se ve en Windows |
| **U9 · Barrido final** | Glosario en todo, accesibilidad (lector de pantalla, roles), movimiento, textos | Extractor de textos de la auditoría; prueba con VoiceOver y TalkBack |
| **W1 · Windows** | El mismo sistema visual y glosario en Windows, y lo que quede de las fases 3 a 6 que sea sólo de Windows | Suite de Windows y capturas |

Cada fase se publica por separado con su "publicalo". Cada una escribe su
plan detallado al empezar, con pasos de un commit, primero la prueba que
falla, y la bitácora en RELEVO.

## 10. Decisiones para Joswill

| Decisión | Recomendación |
|---|---|
| ¿Cobros y Clientes juntos en una pestaña "Clientas"? | Sí, con "Te deben" primero |
| ¿Historial pasa a "Más" (y lo de hoy queda en Inicio)? | Sí |
| ¿Letra del sistema o Plus Jakarta Sans? (BAS-34) | La del sistema |
| ¿Neutros cálidos y el verde de la marca? | Sí (sección 7.1); se ajusta viendo capturas en U1 |
| ¿PIN al abrir el celular, como en Windows? | Opcional, apagado de entrada |
| "Pure · Magic · Divine" en la entrada (ACC-08) | Conservarlo sólo dentro del logo |
| Textos de compromiso de la proforma (DOC-03) | Editables en Ajustes, empezando por los de hoy |
| Escanear códigos con la cámara | Más adelante: Android sí lo permite, el iPhone desde el navegador no |

## 11. Lo que se absorbe de las fases 3 a 6

| Fase vieja | Va a |
|---|---|
| Fase 3 (color, contraste, tipografía): COL-03 a 05, CCO-12, CCO-16, BAS-13, ENC-01, CCO-09, CEL-09, CCO-15, BAS-17, BAS-19, BAS-34, DOC-06 y el resto | U1 (lo del celular) y W1 (lo de Windows) |
| Fase 4 (movimiento): BAS-24 a 33, CVE-08, CVE-17, CEL-10 a 17, TRA-08 | U1 (reglas) y cada fase en sus pantallas; W1 |
| Fase 5 (textos y glosario): TXT-01 a 14, CHI-01, DOC-04, CCO-11, CVE-05 y los textos por pantalla | Cada fase en sus pantallas; U9 barre lo que falte; W1 |
| Fase 6 (coherencia y fricción): TRA-06, TRA-12, TRA-13, BAS-14 a 16, CEL-07, CEL-13 y los de cada pantalla | U2 a U8 en el celular; W1 en Windows |

Los IDs siguen en [AUDITORIA_UX_2026-09-29.md](../../AUDITORIA_UX_2026-09-29.md);
cada plan de fase lista los que cierra.

## 12. Riesgos

- **Rehacer tanto rompe cosas**: una fase a la vez, con la suite móvil y el
  corredor sin red en verde, y capturas antes y después.
- **Ross tiene que reaprender**: los nombres que ya usa se conservan
  (Vender, Inventario, Encargos); cada versión dice qué cambió.
- **Teléfonos viejos**: listas largas virtualizadas; sin sombras pesadas ni
  desenfoques grandes.
- **Paridad sin duplicar reglas**: toda acción nueva usa el repositorio que
  ya usa Windows; ninguna cuenta se reimplementa en una pantalla.
