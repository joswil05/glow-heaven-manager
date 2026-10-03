# C2 · Inventario y encargos en el celular — plan de implementación

> **Para el agente de turno:** usar `executing-plans`, una tarea a la vez,
> sobre `master`, en relevo según [RELEVO.md](../../RELEVO.md). Sin agentes
> paralelos. Leer el diseño y este plan completos antes de implementar.

**Objetivo:** cambiar precios desde Inventario y llevar un encargo desde
anotarlo hasta que la clienta acepta, compartiendo su proforma desde el celular.

**Arquitectura:** React móvil reutiliza los repositorios, el servicio
`aceptarEncargo`, las fases y las plantillas del núcleo. El PDF vive en un
adaptador de navegador; ninguna cuenta de dinero ni transición de negocio
se reimplementa en una hoja. Inicio cuenta sobre la instantánea del panel.

**Tecnologías:** React 18, TypeScript, Firestore web, Vitest, Playwright Python,
BottomSheet y haptics existentes. La dependencia de PDF se evalúa en T1;
la candidata inicial es html2pdf.js, no una elección ya aprobada.

**Diseño:** [2026-10-02-fases-del-celular-design.md](../specs/2026-10-02-fases-del-celular-design.md), sección C2 y criterios de diseño.

**Estado:** T1 pasos 1 y 2 completos; paso 3 en WIP, detenido: el plan
asume `BottomSheet ocupado`, propiedad ausente en el código. Decisión de
Joswill pendiente antes de corregir el plan y continuar. Ver el informe
del experimento y RELEVO. C1 T1–T4 completa. No se publica esta fase sin
el «publicalo» de Joswill.

## Reglas para todas las tareas

- Un commit por **paso**, con su casilla marcada en ese mismo commit:
  `C2 · Tn · paso N: descripción`. Agregar rutas explícitas, incluido este
  plan; nunca `git add -A`. Bitácora al terminar cada tarea o decidir algo.
- Primero caso rojo, después implementación, después verde. Si una firma
  o una decisión del plan no coincide con el código, parar y anotarlo.
- Dinero en centavos enteros USD; pesos en milésimas de libra. Parsear con
  `parsearACentavos`/`parsearDecimal`; formatear con `formatearMoneda`.
- Tasa de la venta para documentos y cobros; no reemplazarla por la actual.
- «Lo frecuente en pocos toques.» «Nada se anima en lo que se repite».
  Cambiar filtro, agregar pieza y recalcular precio no llevan animación.
- «Las hojas y pantallas nuevas preguntan antes de descartar»:
  `BottomSheet hayCambios`, `ocupado`, error en su campo y foco al primero.
- «Teclado numérico» en montos y pesos: `inputMode="decimal"`, cantidad
  `numeric`, campos de 16 px y blancos de al menos 44 px.
- «Colores por token», contrastes en ambos temas; haptics antes del primer
  `await` de cada acción del usuario. Reutilizar la animación de BottomSheet.
- Un grupo de eventos por acción; conservar Deshacer y refrescar productos
  cuando cambie su precio. `marcarCambio` por sí solo no refresca productos.
- Inventario, clienta, anular, en bodega, abono. No editar fichas ni ajustar
  existencias. Comprar, recibir, entregar y anular encargos quedan en Windows.
- Los encargos en curso se consultan sin corte de fecha. No N+1 por fila.
- Pruebas de emulador y de interfaz móvil **en serie**: ambas limpian datos.
  Apagar el emulador al parar. No usar credenciales ni datos de producción.

## Mapa de archivos y contratos comprobados

| Archivo | Responsabilidad en C2 |
|---|---|
| `mobile/src/lib/proforma-pdf.ts` (nuevo) | HTML compartido a archivo PDF; sin Firestore |
| `mobile/src/components/MandarCotizacionSheet.tsx` (nuevo) | Previsualizar, preparar archivo, compartir, alternativa actual |
| `mobile/src/components/DocumentoSheet.tsx` | Reutilizar el adaptador aprobado; conservar impresión como alternativa |
| `mobile/src/components/BottomNav.tsx`, `views/InventoryQuickView.tsx` | Nombre, icono, filtro único, vacíos y textos |
| `mobile/src/components/CambiarPrecioSheet.tsx` (nuevo), `FichaProductoSheet.tsx` | Precio manual, ganancia y Deshacer |
| `mobile/src/lib/encargos-movil.ts` (nuevo) | Consulta de lista en curso y nombres de fases de la UI móvil |
| `mobile/src/lib/panel-movil.ts`, `views/DashboardView.tsx` | Contadores sin releer colecciones |
| `mobile/src/views/EncargosView.tsx` (nuevo), `App.tsx` | Lista y entrada sin sexta pestaña |
| `mobile/src/components/SeleccionarClientaSheet.tsx` (nuevo), `views/QuickSaleView.tsx` | Selección/alta de clienta compartida con Vender |
| `mobile/src/components/NuevoEncargoSheet.tsx` (nuevo) | Anotar piezas, cantidades, notas y precio opcional |
| `mobile/src/components/CotizarEncargoSheet.tsx` (nuevo) | Costeo y cotización por pieza; no se consiguió |
| `mobile/src/components/AceptarEncargoSheet.tsx` (nuevo), `AbonoModalSheet.tsx` | Aceptar y reutilizar el formulario de abono |
| `tests/interfaz/pruebas.py`, `sembrar.test.ts` | Recorridos móviles con datos locales |
| `tests/panel-movil.test.ts`, nuevos `tests/c2-*.test.ts` | Consultas, lecturas y adaptadores sin UI |

Contratos existentes; importar repositorios con `@repos/…` y tipos del archivo
que ya los exporta. No usar `window.api` en el celular:

```ts
// src/main/firebase/repositories/productos.repo.ts
ProductosRepoFirestore.actualizar(input: ActualizarProductoInput, grupo: string): Promise<void>
// El input del precio es sólo { id, modo_precio: 'MANUAL', precio_manual_usd_cents }.

// src/main/firebase/repositories/ventas.repo.ts
VentasRepoFirestore.listar(filtros: FiltrosVenta): Promise<Venta[]>
VentasRepoFirestore.getById(id: number): Promise<VentaCompleta | null>
VentasRepoFirestore.crear(input: CrearVentaInput, grupo: string): Promise<number>
VentasRepoFirestore.cotizar(id: number, cambios: readonly LineaCotizacion[], grupo: string): Promise<void>
VentasRepoFirestore.marcarEnviada(id: number, grupo: string): Promise<void>

// src/main/firebase/services/encargos.service.ts
aceptarEncargo(id: number, pago: PagoAlAceptar | undefined, grupo: string): Promise<void>
// Paga ANTES de aceptar. No cambiar ese orden ni duplicar este servicio.

// src/core/documentos/plantillas.ts y mensajes.ts
generarHtmlProforma(venta: VentaCompleta, parametros: ParametrosSistema): string
mensajeWhatsappDocumento(venta: VentaCompleta, parametros: ParametrosSistema | null): string
```

`etapaEncargo`, `FASES_EN_CURSO`, `textoEtapa`, `descartable`, `sinPrecio`,
`estadoPieza` y `costoEstimadoDePieza` ya están en `src/core/encargos.ts`.
`calcularPrecio` está en `src/core/precios.ts`. No crear otra máquina de estados.

En los ejemplos de interfaz, `ir_a`, `visible`, `en_hoja`, `campo_de`,
`cerrar_hojas`, `pantalla` y `listar_coleccion` son los ayudantes existentes
de `tests/interfaz/pruebas.py`/`arnes.py`; importar `expect` de Playwright.
Buscar siempre el `main` visible con `pantalla(page)`.

## T1 · Prueba del PDF en un teléfono real (primero, puerta de avance)

**Archivos:** crear `mobile/src/lib/proforma-pdf.ts`,
`mobile/src/components/PruebaProformaSheet.tsx`,
`docs/superpowers/experiments/2026-10-02-c2-pdf-celular.md` y
`tests/interfaz/pdf-celular.py`; modificar `DocumentoSheet.tsx`,
`package.json` y `package-lock.json` sólo para la dependencia candidata.
Arnés de fixtures del paso 1: `tests/interfaz/sembrar-pdf.test.ts`,
`fixtures-pdf.json` y `pdf-windows.cjs` (motor Electron con las opciones de
Windows); entrada DEV de prueba en `mobile/src/main.tsx` al conectar el prototipo.

**Consume:** las dos funciones de proforma del mapa.
**Produce:** contrato `generarArchivoProforma(venta, parametros): Promise<File>`
y evidencia de comparación. El motor interno se acepta o se rechaza en paso 5;
las demás tareas sólo dependen del contrato, no del motor.

- [x] **Paso 1: fijar la referencia y el caso rojo**

Usar la proforma de un encargo del emulador, con nombre largo, acentos,
2 piezas, una descartada, abono en córdobas y tasa distinta de Configuración;
agregar otro con 35 piezas para probar saltos. Generar los PDF de referencia
desde la app Windows de prueba, con la misma venta y parámetros. Guardar los
artefactos en `scratch/c2-pdf/`, sin commitear datos personales.

En `pdf-celular.py`, usar el ingreso de `arnes.py` y el mismo contexto con
`bypass_csp=True` del corredor móvil **sólo para la prueba automática local**.
El teléfono debe probar con CSP normal. La hoja experimental tendrá el botón
`Descargar PDF de prueba` y sólo estará disponible con `import.meta.env.DEV`.

```python
with page.expect_download() as descarga:
    page.get_by_role("button", name="Descargar PDF de prueba", exact=True).click()
archivo = descarga.value
archivo.save_as("scratch/c2-pdf/proforma-movil.pdf")
with open("scratch/c2-pdf/proforma-movil.pdf", "rb") as f:
    assert f.read(5) == b"%PDF-"
```

Correr antes del código: debe fallar porque no existe el botón. No basta la
cabecera PDF para aprobar fidelidad; eso se verifica visualmente en paso 5.
Hacer `npm run build:mobile` y anotar bytes crudos/gzip, precache y tiempo
como base en el informe. El build de C1 es referencia histórica, medir de nuevo.

- [x] **Paso 2: implementar el adaptador experimental con la misma plantilla**

Instalar la candidata con versión fija resuelta por npm (`npm install --save-exact html2pdf.js`),
guardar el lock y registrar la versión. No cargar librerías desde un CDN.
Importación dinámica dentro del adaptador. Montar el HTML completo en un
iframe aislado de la CSS de la app, ancho A4, fuera de pantalla pero medible;
esperar `load`, `document.fonts.ready` y las imágenes (`decode`) antes de
renderizar. Fallar con mensaje concreto si falta una fuente o imagen; no
declarar éxito con un PDF vacío. Quitar el iframe en `finally`.

Núcleo del adaptador, una vez listo el documento del iframe:

```ts
const { default: html2pdf } = await import('html2pdf.js');
const blob: Blob = await html2pdf().set({
  margin: 0,
  jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  html2canvas: { scale: 2, useCORS: true },
  pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] },
}).from(doc.body).outputPdf('blob');
if (blob.size === 0) throw new Error('El PDF quedó vacío.');
return new File([blob], `${venta.codigo}.pdf`, { type: 'application/pdf' });
```

El HTML viene únicamente de `generarHtmlProforma`. No dibujar una proforma
alternativa con jsPDF. La plantilla actual importa Plus Jakarta Sans desde
Google Fonts: comprobar carga real y la fuente resuelta. Comparar también
la identidad visual/logo **que realmente tenga el PDF de Windows**; si el
diseño exige un logo ausente, anotarlo y decidir con Joswill, no inventarlo.
No cambiar márgenes ni estilos de la plantilla compartida para tapar un fallo
del conversor: sería cambiar también Windows fuera del alcance de la prueba.

- [ ] **Paso 3: preparar y compartir conservando el gesto del usuario**

La hoja de prueba prepara el archivo al abrirse, muestra `Preparando PDF…`
y después habilita Compartir. El botón inicia `navigator.share` directamente
desde el toque; no genera primero el PDF dentro de ese toque.

```ts
function compartir(file: File, mensaje: string) {
  haptics.impact('medium');
  if (!navigator.canShare?.({ files: [file] })) return;
  const copia = navigator.clipboard?.writeText(mensaje)
    .then(() => true, () => false) ?? Promise.resolve(false);
  const envio = navigator.share({ files: [file], text: mensaje });
  // Ambas promesas se observan; un AbortError significa cancelar, no enviar.
  return Promise.all([envio, copia]);
}
```

Mostrar si el mensaje se copió; si el permiso falla ofrecer `Copiar mensaje`
y texto seleccionable. No decir «copiado» sin evidencia. Descargar por URL
de objeto y revocarla después de iniciar la descarga. No marcar una venta
como enviada desde esta hoja experimental.

- [ ] **Paso 4: automatizar archivo, cancelación y alternativa; medir build**

`pdf-celular.py` prueba descarga no vacía, nombre y MIME; intercepta share
en contexto de prueba y verifica archivo+mensaje. Probar `canShare=false`,
permiso de portapapeles rechazado, `AbortError` y generación fallida sin
escrituras en ventas. Ejecutar `npx tsc -p mobile/tsconfig.json --noEmit`
y `npm run build:mobile`; comparar suma de JS crudo/gzip, precache y tiempo
contra paso 1, con detalle del chunk PDF. No confundir lazy import con que
Workbox no lo precachea. Correr el caso rojo del paso 1 y verlo verde.

- [ ] **Paso 5: probar en el teléfono y documentar la decisión**

Preparar una página de prueba local que sólo use las fixtures, accesible por
HTTPS confiable en la red local. No abrir Firestore de producción, no publicar
hosting ni enviar datos a un servicio de PDF. Si no hay HTTPS de desarrollo
confiable, registrar esa limitación y coordinar con Joswill el acceso antes
de afirmar que se probó Web Share (HTTP de LAN no sirve como evidencia).

Joswill abre la prueba en el teléfono que usa Ross: navegador y PWA, anotar
modelo/SO/navegador. Descargar, abrir y comparar ambas proformas con Windows
a la misma escala: logo/identidad, fuente, acentos, filas, bordes, totales,
pagos y saltos. Compartir el archivo mediante la hoja del sistema a un
destino de prueba que elija Joswill; el agente no envía mensajes por su cuenta.
Probar cancelar y volver a compartir. Registrar duración, tamaño, capturas
y resultados en el informe, con diferencias explícitas.

**No marcar este paso ni empezar T2 sin esa evidencia.** Si no se logra la
fidelidad, o Joswill no acepta el peso medido de la dependencia, parar y
anotar opciones para decidir con él; no sustituir silenciosamente la
plantilla ni pasar a un servicio remoto. Si falta el teléfono, dejar T1
commiteada como WIP con el paso físico pendiente y apagar el emulador.

Fuentes para verificar la candidata: [html2pdf.js](https://github.com/eKoopmans/html2pdf.js)
documenta rasterización y límites de canvas; por eso la comparación es
obligatoria. [Web Share](https://www.w3.org/TR/web-share/) requiere contexto
seguro y activación transitoria; `canShare` permite comprobar archivos.
Estas fuentes orientan la prueba, no prueban compatibilidad con el teléfono.

## T2 · Inventario: nombre, filtro único y precio con Deshacer

**Archivos:** `BottomNav.tsx`, `InventoryQuickView.tsx`, `FichaProductoSheet.tsx`,
nuevo `CambiarPrecioSheet.tsx`, `tests/interfaz/pruebas.py`.
**Consume:** productos/categorías de `useDatosNegocio`, `ProductosRepo.actualizar`,
`useSnackbar().mostrarDeshacer(mensaje, grupo, callback)`.
**Produce:** hoja `{ producto: ProductoConStock | null; onCerrar: () => void }`.

- [ ] **Paso 1: casos rojos de filtro y precio**

Cambiar sólo las expectativas/navegación de pruebas `Catálogo` → `Inventario`
y agregar `C2 · Inventario filtra y cambia un precio con Deshacer`.
El caso usa Labial Mate Rojo sembrado, conserva su precio/modo originales,
abre ficha y espera la acción nueva. Núcleo de las aserciones:

```python
ir_a(page, "Inventario")
page.get_by_role("button", name="Cambiar precio", exact=True).click()
campo_de(page, "Precio nuevo ($)").fill("0")
page.get_by_role("button", name="Guardar precio", exact=True).click()
expect(campo_de(page, "Precio nuevo ($)")).to_have_attribute("aria-invalid", "true")
campo_de(page, "Precio nuevo ($)").fill("25.50")
page.get_by_role("button", name="Guardar precio", exact=True).click()
page.get_by_role("button", name="Deshacer", exact=True).click()
```

Completar la apertura de ficha con el selector existente por nombre; usar
`expect` para esperar resultados antes de leer Firestore. Verificar 2550 y
MANUAL antes de deshacer; después precio **y modo** originales, stock/lotes
intactos. Probar vacío negativo/letras, error con foco, descarte y doble toque.
Otro caso elige paquete y luego categoría: sólo uno queda activo; restablecer
limpia todo; vacío sin `""` ni «categoría Todos». Verificar `P-…`, sin `#`,
y «en bodega». Correr `$env:SOLO='C2 · Inventario'; npm run test:interfaz`
con `$env:PYTHONIOENCODING='utf-8'`; rojo por acción/nombre ausentes.

- [ ] **Paso 2: un filtro y textos de inventario**

Usar icono `Package` en navegación y cabecera, etiqueta Inventario. Un
selector etiquetado `Filtrar inventario`, opciones agrupadas Categorías y
Paquetes; estado discriminado para impedir dos filtros simultáneos:

```ts
type Filtro = { tipo: 'todos' } | { tipo: 'categoria'; id: number }
  | { tipo: 'paquete'; id: number };
const [filtro, setFiltro] = useState<Filtro>({ tipo: 'todos' });
function restablecer() { setFiltro({ tipo: 'todos' }); setBusqueda(''); }
```

Mantener «A la venta» y «Vendidos» de C1, búsqueda y paquetes anteriores.
Actualizar los paquetes al volver de recibir uno nuevo mediante `version`
de DataContext; no dejar la lista congelada por `paquetes.length > 0`.
Conservar el criterio existente de pertenencia al paquete; no cambiar lotes
ni su cálculo aquí. Quitar scroll-reveal en filas que se refiltran.

- [ ] **Paso 3: hoja de precio, ganancia y guardado**

En ficha, `Cambiar precio` abre la hoja; mantener el producto por ID y
resolverlo en `productos` para no mostrar una referencia vieja tras guardar
o deshacer. Mostrar costo aterrizado que expone `ProductoConStock`, precio
actual y ganancia (nuevo precio menos ese costo). Calcular indicadores con
`calcularPrecio({ modo:'MANUAL', precio_manual_usd_cents: nuevo, costo_unitario_usd_cents: producto.costo_unitario_usd_cents, paso_redondeo_usd_cents: 1 })`;
no redondear un precio manual ni dividir por cero. Si pierde, decirlo en
token de peligro, conservando el comportamiento de la PC.

```ts
haptics.impact('medium');
const grupo = nuevoGrupoEvento();
await ProductosRepoFirestore.actualizar({
  id: producto.id, modo_precio: 'MANUAL', precio_manual_usd_cents: nuevo,
}, grupo);
await recargarProductos(true);
marcarCambio();
mostrarDeshacer('Precio guardado', grupo, () => {
  void recargarProductos(true); marcarCambio();
});
onCerrar();
```

Validar entero seguro >0 antes del bloque; ref ocupado evita doble toque,
try/catch/finally conserva hoja y valor si falla. Mandar sólo estos campos.
Guardar sin cambio no crea evento. `hayCambios` compara con el precio inicial.

- [ ] **Paso 4: verificar y cerrar T2**

Caso nuevo verde, suite móvil entera, `npm run test:emulador` y tipos móviles.
Ver a 390 px en claro/oscuro y con teclado: precio, pérdida y botón visibles.
Agregar una aserción al caso C1 de recepción: el paquete nuevo aparece en
el selector sin recargar la app. Si falla primero, corregir la invalidación
prevista en paso 2. Actualizar bitácora, commit con rutas del encabezado.

## T3 · Lista de encargos y entrada desde Inicio/Vender

**Archivos:** nuevos `lib/encargos-movil.ts`, `views/EncargosView.tsx`;
`lib/panel-movil.ts`, `DashboardView.tsx`, `QuickSaleView.tsx`, `App.tsx`,
`tests/panel-movil.test.ts`, `tests/interfaz/pruebas.py`, `sembrar.test.ts`.
**Produce:** `cargarEncargosEnCurso(): Promise<Venta[]>` y vista
`{ onVolver: () => void; abrirNuevoAlEntrar?: boolean }`.

- [ ] **Paso 1: pruebas rojas de contadores y navegación**

En el bloque de `tests/panel-movil.test.ts` que ya inicializa Firestore y
congela fecha, crear un encargo sin precio y otro cotizado/marcado. Después
de `PanelRepoFirestore.cargar()`, reiniciar contadores y cargar dashboard:

```ts
reiniciarContadores();
const resultado = await obtenerDatosDashboard(true);
expect(resultado.fasesEncargo.POR_BUSCAR).toBe(1);
expect(resultado.fasesEncargo.ESPERANDO).toBe(1);
expect(contadores().lecturas).toBe(0);
```

Importar `reiniciarContadores, contadores` del falso (ya disponibles).
La llamada previa a `PanelRepoFirestore.cargar()` calienta también parámetros
y categorías: así la aserción mide únicamente las lecturas adicionales. Añadir lectura de
encargo viejo fuera del mes y exclusión de cancelado/entregado. Sembrar los
encargos **después** de V-0001, para no romper casos previos. Caso móvil:
Inicio → tarjeta Encargos → Por buscar, Esperando respuesta, Por entregar;
conteos y textos; sólo cinco botones del dock; cerrar vuelve a Inicio.
Correr `npx vitest run tests/panel-movil.test.ts` y caso SOLO `C2 · Encargos`.

- [ ] **Paso 2: contadores desde la instantánea, consulta sólo al abrir lista**

Agregar `fasesEncargo: Record<EtapaEncargo, number>` a CacheDashboardData
y su inicialización. Después de cargar panel/tendencia, recorrer
`await PanelRepoFirestore.ventasActivas()` (instantánea ya cargada), filtrar
ENCARGO COTIZADA/PENDIENTE, contar `etapaEncargo(v)`. No activar el viejo
`cargarEncargosPendientes`, que relee clientas innecesariamente.

La lista usa los repositorios como Windows, sin corte de fecha:

```ts
export async function cargarEncargosEnCurso(): Promise<Venta[]> {
  const grupos = await Promise.all([
    VentasRepoFirestore.listar({ tipo: 'ENCARGO', estado: 'COTIZADA' }),
    VentasRepoFirestore.listar({ tipo: 'ENCARGO', estado: 'PENDIENTE' }),
  ]);
  return grupos.flat().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
}
```

Centralizar nombres: POR_BUSCAR «Por buscar», POR_MANDAR «Por mandar»,
ESPERANDO «Esperando respuesta», POR_COMPRAR «Por comprar», EN_CAMINO
«En camino», POR_ENTREGAR «Por entregar», ENTREGADO «Entregado», ANULADO
«Anulado». `FASES_EN_CURSO` da orden. Encabezado resumen «2 por cotizar · 1
esperando respuesta» cuenta POR_BUSCAR/ESPERANDO sin redefinir las fases.

- [ ] **Paso 3: vista y rutas**

Extender `Vista` con `encargos`; renderizar como registrar-paquete, sin dock
propio, recordando retorno Inicio/Vender. Tarjeta visible incluso en cero,
para poder abrir Encargos; `Anotar un pedido` en Vender navega con
`abrirNuevoAlEntrar`. Barra horizontal con Todos y fases, `aria-pressed`,
lista agrupada con código, clienta, `que_pidio`, `textoEtapa(v,hoyISO())`.
No mostrar $0 como deuda de pedido sin precio. Al tocar cargar getById una
vez, mostrar detalle en BottomSheet; no lecturas por cada fila. Las fases
operadas en PC muestran «Seguí este paso en la computadora», sin acciones
de compra, recepción, entrega ni anulación.

```tsx
<EncargosView onVolver={() => setVista(origenEncargos)}
  abrirNuevoAlEntrar={nuevoEncargoAlEntrar} />
```

En esta tarea la intención `abrirNuevoAlEntrar` queda en la ruta para que T4
conecte el alta; no mostrar un formulario falso ni marcar completado el
recorrido de alta hasta T4. Cargar/error/reintentar/vacío explícitos.
`version` recarga después de mutar.

- [ ] **Paso 4: verificar lista y lecturas**

Unitarias del panel y caso móvil verdes; comprobar encargo viejo, cambio de
fase, retorno y ausencia de acciones de PC. Ejecutar auditoría de índices
(las consultas ya existen en Windows), tipos y suite móvil; anotar y commitear.

## T4 · Anotar un pedido, con clienta existente o nueva

**Archivos:** nuevo `SeleccionarClientaSheet.tsx`, `NuevoEncargoSheet.tsx`;
`QuickSaleView.tsx`, `EncargosView.tsx`, `tests/interfaz/pruebas.py`.
**Produce:** selector `{ abierto; onCerrar; onSeleccionar: (c: ClienteDetalle) => void }`
y alta `{ abierto; onCerrar; onGuardado: (id: number) => void }`.

- [ ] **Paso 1: caso rojo de alta y descarte**

`C2 · anotar un pedido no crea deuda ni descuenta bodega`: Vender → Anotar un
pedido → Ana Prueba → descripción «Bolso C2», cantidad 2, precio vacío.
Registrar, comprobar ENCARGO/COTIZADA, total0, piezas sin_precio y stock
intacto; aparece Por buscar. Repetir con clienta nueva y una pieza con precio.
Caso de doble toque cuenta una sola venta. Caso vacío no escribe y enfoca.

```python
page.get_by_role("button", name="Anotar un pedido", exact=True).click()
campo_de(page, "Qué quiere").fill("Bolso C2")
campo_de(page, "Cantidad").fill("2")
page.get_by_role("button", name="Guardar pedido", exact=True).click()
expect(page.get_by_text("Pedido anotado", exact=True)).to_be_visible()
```

Incluir selección de clienta antes de guardar y comprobaciones leyendo el
documento por la descripción única. La UI aún no tiene esa alta: rojo.

- [ ] **Paso 2: compartir la selección de clienta con Vender**

Extraer el bloque de búsqueda/alta de `QuickSaleView` sin cambiar sus reglas.
Usar `ClientesRepoFirestore.listar(query)`, `guardar(input,grupo)`, `getById`;
cancelar resultado tardío al cerrar/cambiar query. Nombre obligatorio,
teléfono opcional, errores junto a campos, hayCambios al crear. La clienta
se guarda al confirmar su propia alta y se selecciona; si luego cancela el
pedido no borrarla. Conservar carrito y clienta seleccionada de Vender.

```tsx
<SeleccionarClientaSheet abierto={elegirClienta}
  onCerrar={() => setElegirClienta(false)}
  onSeleccionar={(c) => { setCliente(c); setElegirClienta(false); }} />
```

Correr casos existentes de ventas antes de seguir; no crear un segundo
formulario de clienta copiado dentro de NuevoEncargo.

- [ ] **Paso 3: hoja de pedido y guardado compartido**

Lista de piezas con claves estables, descripción obligatoria, cantidad
entera >0, precio opcional vacío→0 y no negativo. Agregar otra enfoca su
descripción; quitar una pieza escrita pide confirmar. Notas opcionales.
Sin lookup de catálogo ni movimiento de mercadería en esta alta.

```ts
haptics.impact('medium');
const id = await VentasRepoFirestore.crear({
  tipo: 'ENCARGO', cliente_id: cliente.id, fecha: hoyISO(),
  lineas: piezasValidadas.map(p => ({
    descripcion: p.descripcion, cantidad: p.cantidad,
    precio_unitario_usd_cents: p.precioUsdCents,
  })),
  notas: notas.trim() || undefined,
}, nuevoGrupoEvento());
marcarCambio(); onGuardado(id);
```

`piezasValidadas` es el resultado local de parsear campos, sin fórmulas de
negocio. `crear` deriva estado, código y anticipo; no imponer PENDIENTE
cuando hay precio o anticipo configurado0. Una sola confirmación. Bloqueo
con ref y try/finally; conservar valores ante error.

- [ ] **Paso 4: pruebas y cierre**

Casos verdes, suite móvil y emulador (crear escribe ventas/eventos). Verificar
se conserva el carrito previo al entrar/salir del pedido, alta de clienta
no duplicada ante error de venta y descarte por atrás Android. Bitácora y commit.

## T5 · Cotizar piezas y «No se consiguió»

**Archivos:** nuevo `CotizarEncargoSheet.tsx`, `EncargosView.tsx`,
`tests/interfaz/pruebas.py`; reutilizar `tests/encargos-fases.test.ts`.
**Produce:** hoja `{ venta: VentaCompleta | null; onCerrar; onGuardado: () => void }`.

- [ ] **Paso 1: caso rojo con dinero comprobable**

Sobre pedido de 2 piezas, abrir Cotizar; tienda10, peso1lb, tax700,
tarifa700 → costo1770 por unidad. Precio30 → total6000 si cantidad2.
Segunda línea se marca «No se consiguió» y conserva descripción/precio,
pero subtotal/costo0. Volver a editar una cotización enviada la deja Por
mandar usando versiones. Probar sobrepago rechazado sin cambios parciales.

```python
campo_de(page, "Precio en tienda ($)").fill("10")
campo_de(page, "Peso por pieza (lb)").fill("1")
expect(campo_de(page, "Costo por pieza ($)")).to_have_value("17.70")
campo_de(page, "Precio por pieza ($)").fill("30")
page.get_by_role("button", name="Guardar cotización", exact=True).click()
```

Con varias piezas, limitar cada selector a su fieldset con el nombre de la
pieza. Verificar enteros guardados y fase; correr caso SOLO `C2 · cotizar`, rojo.

- [ ] **Paso 2: editor y estimación del núcleo**

Tomar las condiciones de `src/renderer/src/views/ventas/CotizarEncargoModal.tsx`:
`costoReal` si LLEGO o lotes consumidos; `fijo` si PENDIENTE, ya tiene precio
y no descartada; sólo descartar con `descartable`. Mostrar piezas fijas
sin campos editables. Peso por pieza, no peso total de las unidades.

```ts
const costo = costoEstimadoDePieza({
  tienda_usd_cents: tienda, peso_mlb: peso,
  tax_bp: parametros.tax_bp, tarifa_cents_lb: parametros.tarifa_envio_cents_lb,
});
const sugerido = calcularPrecio({
  modo: 'MARGEN', costo_unitario_usd_cents: costo,
  margen_bp: parametros.margen_defecto_bp,
  paso_redondeo_usd_cents: parametros.paso_redondeo_usd_cents,
}).precio_usd_cents;
```

El costo se estima al cambiar tienda/peso, nunca reemplaza costo real;
`Usar sugerido` es explícito. Precio vacío permite cotización parcial; si
se escribe, debe ser >0. Validar dinero/pesos/cantidades seguros. Mostrar
ganancia sin animaciones por tecla. No se consiguió queda en la lista.

- [ ] **Paso 3: guardar por cotizar y actualizar vistas**

Construir `LineaCotizacion[]` sólo de piezas editables, con id original;
precio vacío0, campos opcionales ausentes si no se editaron, peso mlb y
`descartada` únicamente cuando se permite. Seguir la semántica de costoReal
de Windows, sin mandar el costo estimado para piezas ya recibidas.

```ts
haptics.impact('medium');
const grupo = nuevoGrupoEvento();
await VentasRepoFirestore.cotizar(venta.id, cambios, grupo);
marcarCambio(); onGuardado(); onCerrar();
```

Errores del servidor dentro de la hoja; no cerrar ni borrar borrador si
se rechaza por pagos superiores al total. No escribir fases/versiones desde UI.

- [ ] **Paso 4: verificar y cerrar**

Casos nuevos verdes; `npx vitest run tests/encargos-fases.test.ts`, suite
móvil y emulador; contraste/teclado en claro/oscuro y hoja con varias piezas.
Anotar pruebas exactas y commitear.

## T6 · Mandar cotización con el PDF aprobado

**Archivos:** `MandarCotizacionSheet.tsx`, `DocumentoSheet.tsx`, `EncargosView.tsx`,
`lib/proforma-pdf.ts`, `tests/interfaz/pruebas.py`; retirar hoja experimental
`PruebaProformaSheet.tsx` y su entrada una vez reutilizada la prueba.
**Consume:** adaptador de T1 aprobado; proforma/mensaje compartidos.

- [ ] **Paso 1: pruebas rojas de compartir, cancelar y volver a cotizar**

Caso `C2 · mandar cotización comparte PDF y conserva la fase al cancelar`.
Stub de navegador sólo en el contexto de prueba:

```python
page.evaluate("""() => {
  window.__compartidos = [];
  Object.defineProperty(navigator, 'canShare', { configurable:true, value: () => true });
  Object.defineProperty(navigator, 'share', { configurable:true, value: async d => {
    window.__compartidos.push({nombre:d.files[0].name, tipo:d.files[0].type, texto:d.text});
  }});
}""")
```

Primero probar share que lanza `DOMException('Cancelado','AbortError')`:
version enviada no cambia. Luego éxito: nombre venta.pdf, application/pdf,
mensaje generado por la plantilla y fase Esperando. Tasa vieja y abono en
su moneda coinciden con PDF. Repetir con `canShare=false`, portapapeles
rechazado y fallo al marcarEnviada; no fingir enviado ni copiar en silencio.

- [ ] **Paso 2: hoja de mensaje y archivo preparado**

Mensaje editable parte de `mensajeWhatsappDocumento`, vista previa HTML de
`generarHtmlProforma`. Generar File al abrir, cachearlo por venta/version,
invalidarlo al recotizar; cancelar resultados tardíos al cerrar. Mostrar
preparando/error/reintentar. `hayCambios` por mensaje editado. Compartir usa
el gesto/portapapeles de T1 y dice «El mensaje queda copiado para pegarlo en
WhatsApp» sólo después de copiar; si no, botón Copiar y explicación.

```ts
haptics.impact('medium');
const promesa = navigator.share({ files: [archivo], text: mensaje });
await promesa;
await VentasRepoFirestore.marcarEnviada(venta.id, nuevoGrupoEvento());
marcarCambio(); onMandada();
```

La copia se inicia sin esperar antes de share, como T1. Observar ambas
promesas, bloqueo por ref y catch: AbortError conserva la fase sin error
alarmante; otra falla permite reintentar. Share no acredita lectura de la
clienta; la UI dice «Compartida», no «Recibida». Si falla guardar la marca,
ofrecer `Ya la mandé` para reintentar sólo esa escritura, sin reenviar PDF.

- [ ] **Paso 3: alternativa y reutilización en DocumentoSheet**

Si no puede compartir archivos, mantener impresión/Guardar PDF y enlace
de WhatsApp construido por el módulo común. Explicar cómo adjuntar y ofrecer
`Ya la mandé` explícito; abrir un enlace no garantiza envío. No crear otro
generador de mensajes. Para proformas, DocumentoSheet abre esta misma hoja
o usa el mismo adaptador de compartición; facturas conservan su recorrido.
Mensaje sin teléfono permite elegir destinatario, como ahora. No incorporar
captura de credenciales ni envío automático.

- [ ] **Paso 4: verificar y cerrar**

Casos verdes; suite móvil completa y build; comparar que la dependencia y
los tamaños siguen lo aprobado en T1. Repetir compartir/cancelar en el
teléfono tras conectar la UI definitiva. Mantener sólo el arnés de prueba
necesario, no controles DEV huérfanos. Bitácora y commit.

## T7 · Aceptó, con abono opcional y el mismo formulario

**Archivos:** nuevo `AceptarEncargoSheet.tsx`, `AbonoModalSheet.tsx`,
`EncargosView.tsx`, nuevo `mobile/src/lib/registrar-abono-movil.ts`,
`tests/c2-aceptar-movil.test.ts`, `tests/interfaz/pruebas.py`.
**Consume:** `aceptarEncargo` y la hoja de abono existente.
**Produce:** extensión opcional `aceptarEncargo?: boolean` en props de
AbonoModalSheet y adaptador probado para su única acción de guardar.

- [ ] **Paso 1: rojo para aceptación con pago menor al anticipo**

Agregar el caso al arnés de `tests/encargos-fases.test.ts` o extraer su
preparación al nuevo archivo: venta cotizada de $100, anticipo50%, pago$1.
La aceptación explícita debe dejar PENDIENTE aunque ese pago solo no la
aceptaría. Probar también sin pago, pago inválido, error de aceptación y
Deshacer del grupo: vuelve a COTIZADA y sin el pago, como la prueba existente
«con un pago menor que el anticipo: acepta, y deshacer vuelve todo atrás».
Eso es distinto de anular/corregir un abono como acción posterior, que
conserva la aceptación firme. No confundir ambos recorridos.

```ts
await registrarAbonoMovil({ venta_id: id, fecha: hoyISO(), monto_cents: 100,
  moneda: 'USD', metodo: 'EFECTIVO' }, grupo, true);
const despues = (await VentasRepoFirestore.getById(id))!;
expect(despues.estado).toBe('PENDIENTE');
expect(despues.pagado_usd_cents).toBe(100);
```

Importar la función nueva (todavía inexistente) y ver rojo. Test móvil:
Aceptó → Todavía no → confirmar: pasa Por comprar sin pago. Otro con pago
pequeño en córdobas usa la hoja existente y su pantalla de éxito/Deshacer.

- [ ] **Paso 2: adaptar la acción de la hoja de abono, sin copiar campos**

Nuevo adaptador, tipos desde repositorio de pagos:

```ts
export async function registrarAbonoMovil(
  input: RegistrarPagoInput, grupo: string, aceptar = false,
): Promise<{ saldo_usd_cents: number }> {
  if (!aceptar) return PagosRepoFirestore.registrar(input, grupo);
  const { venta_id, es_anticipo: _anticipo, cuota_id: _cuota, ...pago } = input;
  await aceptarEncargo(venta_id, pago, grupo);
  const venta = await VentasRepoFirestore.getById(venta_id);
  if (!venta) throw new Error('No se pudo volver a leer el encargo.');
  return { saldo_usd_cents: venta.saldo_usd_cents };
}
```

`RegistrarPagoInput` ya se exporta desde `@repos/pagos.repo`; importar ahí
el tipo y PagosRepoFirestore. No envolver dos mutaciones en otro orden; el servicio
existente tiene pruebas del deshacer. AbonoModalSheet llama este adaptador
y preserva todos sus campos, tasa, éxito y Deshacer actuales. El grupo lo
crea una vez la hoja antes de guardar. Si la operación parcial del servicio
falla tras registrar pago, recargar detalle y mostrar lo realmente ocurrido;
no reintentar automáticamente el mismo importe.

- [ ] **Paso 3: elección de pago y refresco de fases**

AceptarEncargoSheet muestra total y «¿Pagó algo?» con `Todavía no` y
`Registrar abono`. Sin pago llama `aceptarEncargo(id, undefined, grupo)`;
con pago abre AbonoModalSheet `aceptarEncargo={true}`, con el saldo y tasa
del documento. No marcar aceptado antes de abrir el formulario ni al
cancelarlo. Tras éxito recargar detalle/lista, marcarCambio y cerrar sólo
la hoja pertinente. No ofrecer aceptar cuando faltan precios o no quedan
piezas: usar las condiciones del repositorio y las de la PC.

```tsx
<AbonoModalSheet venta={ventaParaAbono} aceptarEncargo
  onCerrar={() => setVentaParaAbono(null)}
  onAbonoRegistrado={() => { marcarCambio(); void recargarDetalle(); }} />
```

Mantener compra/recepción/entrega/anulación como estados informativos.

- [ ] **Paso 4: cerrar el ciclo y C2**

Ejecutar anotar → cotizar → compartir → aceptar sin pago y con pago pequeño;
recotizar después de mandar; validar devolución por Deshacer según reglas
existentes. Correr todas las suites de abajo, documentar prueba física y
actualizar CONTEXTO_SESION, AUDITORIA C2, RELEVO. Próximo paso: escribir
plan C3, no implementarlo ni publicar por inercia. Commit de cierre.

## Verificación conjunta y puntos de relevo

Antes de empezar, `git status`, `git log --oneline -15`, `git worktree list`,
leer RELEVO y `npm test`. C1 dejó 593 unitarias, 104 emulador, 43 Windows y
28 móvil; los casos nuevos de C2 aumentarán esas cuentas.

En PowerShell, terminar cualquier ejecución con SOLO antes de suite completa:

```powershell
Remove-Item Env:SOLO -ErrorAction SilentlyContinue
$env:PYTHONIOENCODING='utf-8'
npm test
npm run typecheck
npx tsc -p mobile/tsconfig.json --noEmit
npm run test:emulador
npm run test:interfaz
npm run test:interfaz-escritorio
npm run build:mobile
git diff --check
```

No ejecutar la línea siguiente si la anterior falló. Emulador iniciado en
otra terminal, apagado antes de parar. El entorno Windows Path/PATH puede
necesitar la normalización documentada en RELEVO; no modificar el sistema.
No `build:exe`, push ni deploy. El build de interfaz Windows del corredor
no publica ni crea instalador.

Cada paso agrega **sólo** sus archivos del encabezado más este plan y la
bitácora si cambió. Ejemplo concreto T2 paso 3:

```powershell
git add -- mobile/src/components/CambiarPrecioSheet.tsx mobile/src/components/FichaProductoSheet.tsx docs/superpowers/plans/2026-10-02-c2-inventario-y-encargos.md
git commit -m 'C2 · T2 · paso 3: cambiar un precio y deshacerlo'
```

Si cortan créditos: commit WIP con paso y qué falta; no marcar paso incompleto.
RELEVO debe decir el último rojo/verde, si hay proceso del emulador y el
siguiente paso preciso. Evidencia física pendiente no se reemplaza por un mock.
