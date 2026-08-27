# Refactorización integral: precios, bugs e interfaz corporativa

Fecha: 2026-08-27
Estado: aprobado, pendiente de plan de implementación
Alcance: `src/core/precios.ts`, `src/main/`, `src/shared/`, `src/renderer/`

---

## 1. Contexto y motivación

Glow Heaven Manager es una herramienta de escritorio (Electron + React + Tailwind + SQLite)
para gestión de personal shopping e importación desde USA hacia Nicaragua. La Fase 1 está
funcionalmente completa y sus 32 pruebas pasan.

Tres problemas motivan este trabajo:

1. **Los precios salen demasiado altos.** Un producto de $128 se cotiza al cliente en
   C$9,550 ($260.79): 103.7% sobre el precio de tienda.
2. **Hay bugs que bloquean flujos completos.** Entre ellos, no existe forma de marcar un
   pedido como entregado.
3. **La interfaz es densa y estéticamente inadecuada.** Paleta rosa/fucsia sobre una
   jerarquía visual plana que satura al usuario.

Los tres se atacan en este mismo ciclo pero en pistas separadas y verificables por separado.

---

## 2. Pista A: corrección del cálculo de precios

### 2.1 Diagnóstico

Descomposición real de un perfume de $128 / 1.5 lb (Sephora 7% tax, categoría Perfumería),
con los parámetros que siembra `src/main/db/migrations.ts`:

```
Precio de tienda                          $128.00
  + Tax USA 7%                              $8.96
  + Flete (mínimo $15)                      $15.00
  + Casillero/handling fijo                 $10.00
  + Arancel 35% sobre excedente de $50      $30.44
  = Costo aterrizado                       $192.40   ->  C$7,045.69
  + Comisión 35% sobre el costo aterrizado              C$2,465.99
  + Excedente de redondeo (Math.ceil C$50)                 C$38.32
  = PRECIO AL CLIENTE                                   C$9,550.00  ($260.79)
```

Cuatro causas, en orden de impacto:

**A1. Se cobran costos que el negocio no paga.** El operador confirmó que sus únicos costos
son el producto, el 7% de tax de la tienda y el flete aéreo por libra. El casillero fijo
($10) y el arancel de aduana (35% para Perfumería) están activos en la configuración
sembrada pero no corresponden a un desembolso real. Suman $40.44 de costo ficticio.

**A2. La comisión se aplica sobre los impuestos.** En `precios.ts` la comisión se calcula
sobre el costo aterrizado, que ya incluye tax, flete, casillero y arancel. El 35% sobre esos
$64.40 de costos de traslado produce C$825 de margen que no proviene del trabajo del
operador, sino de marcar impuestos que solo se trasladan al cliente.

**A3. El redondeo siempre sube.** `Math.ceil` al siguiente múltiplo de C$50 por ítem. Añade
hasta C$50 por producto, nunca resta. En la cotización de tres ítems suma C$63.84.

**A4. Las tasas que dominan el precio no son editables.** `arancel_estimado_bp` y
`comision_defecto_bp` viven en la tabla `categorias`. El único canal IPC de categorías es
`CATEGORIAS_LIST` (`src/shared/ipc-channels.ts`). No existe `categorias:update` ni pantalla
de edición. Después del onboarding el operador no puede corregir su propio precio.

### 2.2 Decisiones tomadas

| Decisión | Valor acordado |
|---|---|
| Base de la comisión | El precio del producto en tienda, sin tax, flete ni impuestos |
| Redondeo | `Math.round` al múltiplo más cercano, por ítem |
| Casillero/handling | Cero por defecto; el parámetro se conserva y queda editable |
| Arancel de aduana | Cero por defecto; la maquinaria se conserva y queda editable |
| Tasas por categoría | Se añade canal IPC y pantalla de edición |

**Principio rector:** ninguna capacidad se elimina del código. Lo que cambia son los valores
sembrados y la base de la comisión. Si mañana la aduana empieza a cobrar, el operador
enciende el arancel desde la pantalla de categorías sin que nadie toque código.

### 2.3 Fórmula propuesta

Para cada ítem de la cotización:

```
tax_item        = precio_producto * tax_rate_tienda_bp / 10000
flete_total     = max(peso_total_lb * tarifa_lb, flete_minimo)     prorrateado por PESO
otros_total     = otros_costos_fijos                               prorrateado por PESO
arancel_total   = excedente_sobre_umbral * tasa_ponderada          prorrateado por VALOR
costo_aterrizado = precio_producto + tax_item + flete_item + otros_item + arancel_item

comision_cor    = a_cordobas(precio_producto) * comision_bp / 10000     <-- CAMBIO A2
precio_bruto    = a_cordobas(costo_aterrizado) + comision_cor
precio_final    = round(precio_bruto / redondeo) * redondeo             <-- CAMBIO A3
```

La comisión mínima por cotización (`comision_minima_cotizacion_cor_cents`, C$300) se
conserva y se sigue repartiendo por mayor residuo, pero ahora sobre base de valor de
producto en lugar de valor de compras.

Se preserva la garantía existente: el reparto por mayor residuo debe sumar exacto. Las
pruebas de `prorrateo.test.ts` no cambian.

### 2.4 Efecto verificado

Simulado con las tasas reales sembradas, comisión 35% Perfumería y 25% Calzado:

| Escenario | Hoy | Propuesto | Sobreprecio |
|---|---|---|---|
| Perfume $128 / 1.5 lb | C$9,550 | **C$7,000** | 104% a 49% |
| Labial $20 / 0.3 lb | C$2,300 | **C$1,150** | 214% a 57% |
| Tres ítems ($263) | C$19,100 | **C$14,350** | 98% a 49% |

### 2.5 Riesgo abierto: el flete mínimo

`flete_minimo_usd_cents` está sembrado en $15. El operador describió su costo como flete
"por libra", sin mencionar un mínimo. El mínimo castiga desproporcionadamente los productos
livianos: en un labial de $20 el sobreprecio salta de 57% a 125%.

**Supuesto asumido:** se siembra en cero para instalaciones nuevas y se expone de forma
prominente en la pantalla de Configuración, con una nota que explique su efecto. Si el
courier sí cobra un mínimo, el operador lo restablece en un campo. Esta decisión queda
señalada para confirmación durante la implementación.

### 2.6 Migración de datos

Se añade una migración `user_version = 2` que actualiza `otros_costos_fijos_usd_cents`,
`flete_minimo_usd_cents` y el `arancel_estimado_bp` de todas las categorías a los valores
nuevos, **únicamente si su valor actual sigue siendo el sembrado originalmente**. Una
configuración que el operador ya haya modificado a mano no se sobrescribe.

---

## 3. Pista B: corrección de bugs

### 3.1 Críticos

**B1. Ningún pedido puede llegar a entregado.**
`src/renderer/src/views/PedidosView.tsx`. El `<select>` de estado ofrece `ENTREGADO`, pero
la máquina de estados exige `EN_NICARAGUA` a `LISTO_ENTREGA` a `ENTREGADO`, y `LISTO_ENTREGA`
no aparece en el menú. El flujo de entrega es inalcanzable desde la interfaz.
*Corrección:* derivar las opciones del menú desde `TRANSICIONES_VALIDAS_ITEM` en
`src/core/estados.ts`, mostrando solo las transiciones legales desde el estado actual.

**B2. Dos estados del menú no existen en el tipo.**
Mismo archivo. El menú emite `ANTICIPO_PENDIENTE` (el tipo declara `PENDIENTE_ANTICIPO`,
palabras invertidas) y `COMPRADO_USA` (el tipo declara `COMPRADO`). Ambos son rechazados
siempre por el validador. El cast `e.target.value as EstadoItem` es lo que impide que
TypeScript lo detecte.
*Corrección:* eliminar el cast y tipar el menú desde la máquina de estados, de modo que el
compilador garantice la correspondencia. Añadir un mapa de `EstadoItem` a etiqueta en
español como única fuente del texto visible.

**B3. El pago se marca como verificado por defecto.**
`src/renderer/src/components/PagoModal.tsx`. `verificado` inicia en `true`. Un clic registra
un pago no confirmado como verificado en banco, lo que desbloquea la compra en USA y anula
el semáforo de seguridad descrito en AGENTS.md.
*Corrección:* iniciar en `false` y exigir marcado explícito.

**B4. La configuración se corrompe con separador decimal de coma.**
`src/renderer/src/views/ConfigView.tsx`. Los ocho campos numéricos usan `parseFloat` sin
guarda. Escribir `36,62` produce `NaN`, que se guarda como la cadena `"NaN"` en la tabla
`parametros`. A partir de ahí toda cotización produce NaN.
*Corrección:* función de parseo compartida que normalice la coma a punto, rechace `NaN` y
valores fuera de rango, y bloquee el guardado señalando el campo inválido.

### 3.2 Altos

**B5. Deshacer revierte la acción equivocada.**
`src/renderer/src/context/ToastContext.tsx`. El botón llama `deshacerUltimoGrupo()`, que
revierte el grupo de eventos más reciente, no el del toast pulsado. `Ctrl+Z` además
selecciona el toast más viejo de la lista. Con dos mutaciones seguidas se deshace la que no
era.
*Corrección:* propagar `evento_grupo_id` desde la mutación hasta el toast y deshacer ese
grupo concreto. Requiere que los handlers IPC devuelvan el `grupoId` que ya generan.
`Ctrl+Z` pasa a tomar el toast más reciente.

**B6. El guardado de configuración no es transaccional.**
`ConfigView.tsx` emite nueve `parametros.update` en un `Promise.all`. Viola la regla de
AGENTS.md de envolver toda mutación en `db.transaction()`. Un fallo parcial deja
configuración inconsistente, y el botón deshacer solo revierte un parámetro.
*Corrección:* nuevo canal `parametros:updateMany` que reciba el lote completo y lo escriba
en una sola transacción con un único `evento_grupo_id`.

**B7. El comprobante pegado se adjunta a un pedido arbitrario.**
`PedidosView.tsx`. Sin pedido expandido, `Ctrl+V` cae a `pedidos[0]`.
*Corrección:* si no hay pedido seleccionado, no abrir el modal; mostrar un aviso pidiendo
elegir el pedido primero.

**B8. El cotizador arranca con un producto de demostración.**
`CotizadorView.tsx`. El estado inicial contiene "Perfume Dior Sauvage 100ml" a $128
hardcodeado. Además resuelve tienda y categoría dentro del inicializador de `useState`,
cuando ambas listas todavía están vacías, por lo que siempre quedan `undefined` y la
cotización cae silenciosamente a las tasas por defecto.
*Corrección:* arrancar con una fila vacía y resolver los valores por defecto en un efecto
que dependa de `tiendas` y `categorias`.

### 3.3 Medios

- **B9.** El `value` del `ToastContext.Provider` es un objeto literal sin `useMemo`: cada
  toast vuelve a renderizar todo el árbol de la aplicación.
- **B10.** El `setInterval` de la cuenta regresiva del toast no se limpia al cerrarlo a mano
  ni al pulsar deshacer; sigue disparando `setToasts` hasta agotar los 10 segundos.
- **B11.** `URL.createObjectURL` nunca se revoca en `PagoModal`; fuga por cada comprobante
  pegado.
- **B12.** Cambiar la moneda en `PagoModal` no reconvierte el monto prellenado: se puede
  registrar $6,225 donde correspondía C$6,225.
- **B13.** `semaforoCounts.amarillo` nunca se incrementa en `App.tsx`; la rama ámbar del
  encabezado es código muerto. Debe alimentarse de pagos registrados pero no verificados.
- **B14.** `comision_total_cor_cents` subestima el margen real porque ignora el excedente de
  redondeo. La línea "Ganancia / Comisión total" del cotizador muestra un número que no
  cuadra con el precio final. Se corrige reportando el margen efectivo.

---

## 4. Pista C: refactorización de la interfaz

### 4.1 Diagnóstico

Conteos sobre `src/renderer/`:

| Señal | Medición | Consecuencia |
|---|---|---|
| Tamaño de texto | 160 de 259 clases son `text-xs`, más 45 en `[10px]` y `[11px]` | Casi toda la aplicación vive entre 10 y 12 px. No hay escala tipográfica. |
| Peso tipográfico | 190 de 202 declaraciones son `bold`, `semibold` o `black` | Si todo está enfatizado, nada destaca. Esta es la causa de la saturación percibida. |
| Radios | Seis escalas coexistiendo | Los `rounded-3xl` en tarjetas de datos leen como aplicación de consumo. |
| Color de marca | 82 usos del token `glow-*` más 31 usos crudos de `pink`, `rose` y `fuchsia` | Alrededor de 20 de los usos crudos son `rose` semántico (peligro) y deben conservarse. |
| Primitivos | Ninguno. El patrón de tarjeta está copiado a mano más de 17 veces | Cada cambio futuro es una búsqueda y reemplazo. |
| Archivos desbordados | `CotizadorView.tsx`, 774 líneas mezclando cálculo, estado y JSX | Difícil de editar con confianza. |

`clsx` y `tailwind-merge` figuran en `package.json` y no se usan en ninguna parte.

### 4.2 Capa de tokens

Color. Neutros en `slate`, que ya domina y se conserva. Dos escalas azules nuevas y tres
roles de estado:

| Token | Rol |
|---|---|
| `navy-50` a `navy-950` | Superficies oscuras: barra lateral, cabeceras de modal, franjas de datos |
| `brand-50` a `brand-950` | Acción primaria, foco, selección, enlaces |
| `success`, `warning`, `danger` | Verificado, por verificar, bloqueado (emerald, amber y rose renombrados por rol) |

Tipografía. Escala nombrada en `theme.extend.fontSize`. `text-xs` deja de ser el valor por
defecto y el texto corriente sube a 14 px:

```
display    24px / 700    Títulos de vista
title      16px / 600    Títulos de sección
body       14px / 400    Texto corriente
label      12px / 500    Etiquetas de campo
caption    11px / 400    Metadatos
metric     28px / 600    Cifras financieras, tabular-nums
metric-sm  18px / 600    Cifras secundarias, tabular-nums
```

`font-bold` queda reservado para métricas y títulos.

Radios: tres escalas. `rounded-md` para controles, `rounded-lg` para tarjetas e inputs,
`rounded-full` para insignias. Se eliminan `2xl` y `3xl`.

Sombras: solo `shadow-sm`; la elevación se expresa con borde. Los modales conservan
`shadow-2xl`.

Números tabulares (`font-variant-numeric: tabular-nums`) en todo monto. Sin esto una columna
de córdobas no se puede comparar de un vistazo.

### 4.3 Capa de primitivos

Nuevo directorio `src/renderer/src/components/ui/`, más `src/renderer/src/lib/cn.ts` que
activa `clsx` y `tailwind-merge`.

`Card`, `Button` (primary, secondary, ghost, danger), `Badge`, `StatTile`, `Field` (etiqueta
más input, select o textarea con foco unificado), `DataTable` (genérico y tipado),
`SectionHeader`, `Money` (absorbe `DualMoneyDisplay`, con cifras tabulares) y `StatusDot`
(sustituye los emojis de estado).

### 4.4 Reestructuración de vistas

**HoyView.** Hoy las cifras de dinero están al fondo, dentro de una tarjeta con degradado. Se
invierte el orden: fila de cuatro indicadores arriba (anticipos recibidos, por cobrar,
pedidos bloqueados, pedidos listos), y debajo dos columnas, decisiones a la izquierda y
entregas a la derecha. Se elimina el degradado.

**PedidosView.** Se descompone en `PedidosView` (orquestador y filtros), `PedidosTable`
(tabla densa con columnas alineadas) y `PedidoDetailPanel` (panel derecho con ítems, máquina
de estados y pagos). Los filtros pasan a control segmentado con conteos, sin emojis.

**CotizadorView.** Se descompone en `CotizadorView`, `useCotizacionDraft.ts` (estado del
borrador, cálculo y manejadores), `ItemsEditor`, `ResumenPanel` e `HistorialCotizaciones`.

**ClientesView.** De rejilla de tarjetas a `DataTable`, coherente con Pedidos.

**ConfigView.** De cuatro bloques apilados a secciones ancladas, con los primitivos `Field`.
Incorpora la nueva sección de categorías descrita en A4, y expone el flete mínimo con su nota
explicativa.

**Header.** Se elimina el logotipo con degradado rosa. El semáforo pasa a `StatusDot`.

**Sidebar.** Superficie `navy-900`. El elemento activo se marca con una barra lateral
`brand-500` y fondo `navy-800`, en lugar de un bloque sólido de color.

---

## 5. Orden de ejecución

Las pistas se ejecutan en este orden porque A produce cambios verificables por pruebas
automáticas, B corrige defectos sobre una base ya correcta, y C es el cambio de mayor
superficie y menor cobertura de pruebas.

```
Pista A   Precios
  A-1  Añadir base de comisión y redondeo a precios.ts, con pruebas primero
  A-2  Migración user_version = 2 y ajuste de semillas
  A-3  Canal categorias:update, repositorio y contrato IPC
  A-4  Actualizar pruebas de precios y cotizador-liquidación

Pista B   Bugs
  B-1  Críticos B1 a B4
  B-2  Altos B5 a B8
  B-3  Medios B9 a B14

Pista C   Interfaz
  C-0  lib/cn.ts, tokens con glow como alias azul temporal, tipografía, radios
  C-1  components/ui/*, sin consumir todavía
  C-2  Chrome: Header, Sidebar, Toast, CommandPalette
  C-3  Vistas: Hoy, Pedidos, Cotizador, Clientes, Config, modales
  C-4  Cierre: eliminar el alias glow, usos crudos, emojis, text-xs residual
```

La secuencia de C-0 usa `glow` como alias apuntando a la escala azul nueva. Efecto: la
aplicación entera cambia de color sin tocar un solo `.tsx`, hay punto de control visual
temprano, y el alias se elimina en C-4 cuando ya no queda ningún consumidor.

---

## 6. Verificación

Compuertas por paso: `npm test` debe pasar y `npm run build` debe compilar sin errores
(`strict: true` y `noUnusedLocals: true`, por lo que todo import huérfano rompe la
compilación).

Pruebas nuevas en Pista A, escritas antes que la implementación:

- La comisión se calcula sobre el precio de producto y no sobre el costo aterrizado.
- Con casillero y arancel en cero, el costo aterrizado es producto más tax más flete.
- El redondeo va al múltiplo más cercano, verificado en ambos sentidos.
- El reparto por mayor residuo sigue sumando exacto (regresión).
- Los tres escenarios de la tabla 2.4 quedan fijados como prueba de referencia.

Pruebas nuevas en Pista B:

- Las opciones de estado ofrecidas coinciden exactamente con las transiciones legales.
- Existe un camino completo de `PENDIENTE_ANTICIPO` a `ENTREGADO`.
- El parseo de configuración rechaza coma decimal, vacío y valores fuera de rango.

La Pista C no tiene cobertura automatizada. Se verifica ejecutando `npm run dev` y
recorriendo las cinco vistas, lo que además cierra el punto 5 de `REVISION_FASE1.md`, que
nunca se ejecutó.

---

## 7. Fuera de alcance

- Empaquetado del instalador NSIS y verificación del ABI de `better-sqlite3`
  (`REVISION_FASE1.md` punto 3). Es deuda de distribución, no de este ciclo.
- Fase 2: lotes de importación, liquidación real y entregas.
- Modo oscuro. `darkMode: 'class'` permanece configurado y sin usar. Los tokens quedan
  nombrados de forma que añadirlo después no obligue a rehacer nada.
- Cualquier cambio en `prorrateo.ts`. El algoritmo de mayor residuo es correcto y está
  cubierto por pruebas.
