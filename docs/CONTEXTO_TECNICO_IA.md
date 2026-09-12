# Guía Maestra de Contexto Técnico, Nomenclatura y Arquitectura
## Glow Heaven Manager — Sistema de Gestión Interna (Desktop & PWA Móvil)
> **Audiencia**: Modelos de Inteligencia Artificial (LLMs), Agentes Autónomos y Desarrolladores de Software.  
> **Versión del Código**: `v2.2.8` | **Fecha de Referencia**: Septiembre 2026.  
> **Estado del Árbol**: TypeScript estricto con **0 errores** (`tsc --noEmit`), suite de pruebas **133/133 aprobadas**.

---

## 1. Visión General del Negocio y Dominio

**Glow Heaven** es un negocio de personal shopping y comercio minorista ubicado en Nicaragua que importa mercadería de marcas reconocidas desde Estados Unidos (tiendas como Victoria's Secret, Ross, TJ Maxx, Amazon, etc.) para su comercialización local.

El negocio opera a través de dos flujos comerciales complementarios:

1. **Reposición de Inventario (Flujo Principal)**:
   - La dueña adquiere paquetes de productos en USA a través de familiares/compradores o tiendas online.
   - Los productos se envían en una caja única a través de una agencia de envíos marítimo/aéreo (courier puerta a puerta).
   - El courier cobra el flete en Nicaragua por **libra física total del bulto**.
   - Al llegar el paquete, se pesan los artículos, se costea el flete y el tax de USA, y los artículos ingresan directamente al inventario con un **costo promedio ponderado aterrizado**.
   - Los productos se venden al contado o al crédito a clientas locales.

2. **Encargos Personalizados (On-Demand)**:
   - Una clienta solicita un artículo específico que no está en stock.
   - La dueña cotiza el producto en USA, calcula el costo estimado con flete y solicita un **anticipo mínimo obligatorio** (generalmente 50%).
   - El artículo viaja dentro de un paquete consolidado con otros productos.
   - Al llegar, se entrega a la clienta y se cancela el saldo restante o se traslada a un plan de cuotas quincenales/mensuales.

### Dinámica Real del Paquete Courier
El sistema **no modela el tránsito internacional** (no hay tracking de aduanas ni estados en camino prolongados). El paquete se registra en el sistema **cuando ya está físicamente en manos de la dueña en Nicaragua**. En ese instante se conoce el peso exacto de la factura del courier y se cargan las líneas al inventario en una única operación atómica.

---

## 2. Nomenclatura y Reglas Inquebrantables del Sistema

Cualquier IA que modifique este código **debe obedecer estrictamente las siguientes directrices de dominio**:

### A. Regla Monetaria: INTEGER de Centavos USD (Cero Flotantes)
- **Toda variable de dinero interna del sistema se almacena y calcula en números ENTEROS de centavos de dólar (`usd_cents`)**:
  - `$1.00 = 100`
  - `$12.50 = 1250`
  - `$0.00 = 0`
- **Está terminantemente prohibido usar tipos `float` o `double` para cálculos contables**. Las sumas, restas y repartos operan sobre centavos enteros para evitar errores de coma flotante de JavaScript (`0.1 + 0.2 !== 0.3`).
- **Moneda Base**: El Dólar Estadounidense (USD) es la moneda contable y de cotización del sistema.
- **Moneda Secundaria (Córdobas - NIO)**: Se utiliza únicamente como capa de conversión para visualización o cobro local, calculada a partir de `tasa_cambio_cents` (ej. `3675` representa C$36.75 por dólar).

### B. Unidades de Medida Estándar
| Concepto | Sufijo / Variable | Unidad | Ejemplo |
| :--- | :--- | :--- | :--- |
| **Dinero en Dólares** | `*_usd_cents` | Centavos enteros USD | `$25.00` → `2500` |
| **Dinero en Córdobas** | `*_cor_cents` | Centavos enteros NIO | `C$918.75` → `91875` |
| **Tasa de Cambio** | `tasa_cambio_cents` | Centavos de córdoba / USD | `C$36.62` → `3662` |
| **Peso** | `*_mlb` | Milésimas de libra (milli-pounds) | `1.5 lb` → `1500` |
| **Porcentajes / Tasas** | `*_bp` | Puntos base (Basis Points, $1\% = 100\text{ bp}$) | `35%` → `3500`, `7%` → `700` |
| **Fechas** | `fecha`, `creado_en` | Cadena ISO 8601 UTC | `"2026-09-12T20:30:00.000Z"` |

### C. Costeo Aterrizado y Margen de Ganancia Real
- **Costo Aterrizado**: Es el costo real por unidad puesta en bodega:  
  $$\text{Costo Aterrizado} = \text{Precio de Compra USA} + \text{Tax USA (7\%)} + \text{Flete Courier asignado por peso}$$
- **La ganancia se mide siempre contra el costo aterrizado**, nunca contra el precio de compra de la tienda gringa. Medir sobre el precio USA genera una falsa percepción de rentabilidad.
- **Redondeo hacia arriba obligatorio (`Math.ceil`)**: El cálculo de precios de venta sugiere múltiplos limpios (ej. paso de redondeo de $1.00 = 100 centavos). El redondeo es siempre hacia arriba (`redondearHaciaArriba`) para proteger el margen comercial. Redondear al entero más cercano reduce el precio en el 50% de los casos y erosiona la ganancia.

### D. Inmutabilidad Contable
1. **El costo unitario se congela en la venta**: Al venderse una unidad, `venta_lineas.costo_unitario_usd_cents` almacena el costo con el que salió de bodega en ese instante. Si en el futuro ingresa un paquete más caro o más barato, las ventas pasadas **no se recalculan**.
2. **La tasa de cambio se congela por documento**: Cada venta, compra o pago almacena su propia `tasa_cambio_cents` histórica. Nunca se lee la tasa global para convertir un pago de meses anteriores.
3. **El saldo de una venta se calcula desde sus pagos**:  
   $$\text{Saldo Pendiente} = \text{Total Venta} - \sum \text{Pagos Activos}$$  
   Nunca se mantiene mediante sumas y restas acumulativas en memoria, ya que anular un abono generaría desfases.

### E. Directrices de Experiencia de Usuario (UI/UX)
- **Cero cuadros de diálogo nativos del navegador**: Prohibido usar `window.alert`, `window.confirm` o `window.prompt`. Usar el modal `Confirmar.tsx` (con foco inicial en la opción de cancelar para evitar accidentes) o formularios modales dedicados.
- **Nombres Semánticos de Color**: En CSS y Tailwind, la paleta de colores utiliza nombres semánticos definidos en `src/renderer/src/temas.css`:
  - Fondos: `bg-fondo`, `bg-superficie`, `bg-superficie-2`, `bg-inverso`
  - Bordes: `border-borde`, `border-borde-fuerte`
  - Textos: `text-texto`, `text-texto-2`, `text-texto-3`, `text-inverso-texto`
  - Acentos y estados: `bg-acento`, `text-acento`, `text-success`, `text-warning`, `text-danger`
  - *Prohibido reintroducir clases genéricas como `bg-slate-900`, `bg-navy` o `bg-brand`.*
- **Formateo de Moneda**: Usar siempre las funciones helper `formatearMoneda` o `formatearCentavosUSD`. Prohibido usar `.toFixed(2)` directamente sobre montos en los textos de las vistas.

---

## 3. Arquitectura del Monorepo

El proyecto consta de dos aplicaciones que comparten el núcleo de reglas de negocio (`src/core/`) y la base de datos Cloud Firestore:

```
herramienta_de_gestion_interna/
├── src/                               # CÓDIGO FUENTE DE ESCRITORIO (ELECTRON)
│   ├── core/                          # Núcleo de lógica pura (TypeScript agnóstico)
│   │   ├── costeo.ts                  # Algoritmos de reparto de envío y tax de paquetes
│   │   ├── precios.ts                 # Formulación de márgenes y redondeo hacia arriba
│   │   ├── inventario.ts              # Promedio ponderado y valuación de stock
│   │   ├── prorrateo.ts               # Algoritmo de Mayor Residuo (Largest Remainder)
│   │   ├── moneda.ts                  # Conversión y formateo USD/NIO
│   │   └── documentos/plantillas.ts   # Generación de HTML para Facturas, Proformas y Recibos
│   ├── main/                          # Proceso Principal de Electron (Node.js)
│   │   ├── firebase/                  # SDK de Firebase Admin / Web y Repositorios
│   │   │   ├── client.ts              # Ayudantes Firestore (leerDoc, leerVarios, aplicarLote)
│   │   │   └── repositories/          # Repositorios de datos (productos, ventas, etc.)
│   │   ├── ipc/                       # Handlers de comunicación IPC tipada
│   │   ├── windows/                   # Gestión de ventanas de Electron
│   │   └── updater.ts                 # Auto-actualizador con electron-updater y GitHub Releases
│   ├── preload/                       # Script Preload seguro (contextBridge)
│   │   └── api.ts                     # Implementación de window.api con ipcRenderer
│   ├── renderer/                      # Proceso Renderer (React 18 + Vite + Tailwind)
│   │   └── src/
│   │       ├── views/                 # Vistas principales de escritorio
│   │       ├── components/            # Componentes UI (Bento, Modales, Tablas, Gráficas)
│   │       └── temas.css              # Variables CSS semánticas (claro y oscuro)
│   └── shared/                        # Tipos y contratos compartidos Main <-> Renderer
│       ├── types.ts                   # Entidades de dominio (Producto, Venta, etc.)
│       ├── ipc-channels.ts            # Nombres constantes de canales IPC
│       └── ipc-contracts.ts           # Interfaz ApiPuente y DTOs de entrada/salida
│
├── mobile/                            # APLICACIÓN MÓVIL PWA (REACT + VITE)
│   └── src/
│       ├── lib/firebase-mobile.ts     # Conexión directa a Firestore con persistencia offline
│       ├── views/                     # Vistas táctiles móviles (Dashboard, Cobranza, Ventas)
│       └── components/                # BottomSheets, Haptics, PullToRefresh, Badges
│
├── tests/                             # SUITE DE PRUEBAS AUTOMATIZADAS (VITEST)
│   ├── firestore-fake.ts              # Emulador en memoria que audita lecturas/escrituras
│   ├── integracion.test.ts            # Pruebas integrales de dominio y repositorios
│   └── costeo.test.ts, etc.           # Pruebas unitarias de algoritmos core
│
├── scripts/                           # Scripts de compilación, iconos y emulador
├── docs/                              # Documentación técnica y bitácora
└── package.json                       # Scripts de build, test, types y release
```

---

## 4. Mapeo de Funciones Técnicas Core (`src/core/`)

Los archivos en `src/core/` no tienen dependencias de Electron, React ni Firebase. Son funciones puras, deterministas y probadas exhaustivamente.

### 1. `src/core/costeo.ts` (Costeo de Paquetes de USA)
- `costearPaquete(lineas: CompraLineaInput[], params: CostearPaqueteParams): PaqueteCosteado`:
  - Toma el flete total cobrado por el courier (`envio_total_usd_cents`) y el peso total en milésimas de libra (`peso_total_mlb`).
  - Reparte el flete **por peso** entre todas las líneas del paquete usando `repartirMayorResiduo` para que la suma cuadre al centavo exacto sin pérdidas de redondeo.
  - Reparte el tax de USA (7% o `tax_total_override_usd_cents`) **por valor** (precio de compra en tienda).
  - Devuelve cada línea con su `costo_linea_usd_cents` y `costo_unitario_usd_cents` aterrizado.
- `repartirPeso(lineas, pesoTotalMlb)`: Deducir el peso por línea si no fue pesado individualmente, respetando el peso unitario histórico de inventario o prorrateando por unidades.

### 2. `src/core/precios.ts` (Formulación Comercial)
- `calcularPrecio(input: CalcularPrecioInput): PrecioCalculado`:
  - Modos admitidos (`ModoPrecio`):
    - `'MARGEN'`: $\text{Precio} = \text{Costo} \times \left(1 + \frac{\text{margen\_bp}}{10000}\right)$
    - `'MULTIPLICADOR'`: $\text{Precio} = \text{Costo} \times \left(\frac{\text{multiplicador\_bp}}{10000}\right)$
    - `'MANUAL'`: Toma el precio directo ingresado por el usuario.
  - Aplica `redondearHaciaArriba(precioCrudo, pasoRedondeo)` (ej. a múltiplos de $1.00).
  - Retorna `ganancia_usd_cents`, `margen_sobre_costo_bp`, `margen_sobre_venta_bp` y flag `bajo_costo` (si el precio no cubre el costo).

### 3. `src/core/inventario.ts` (Promedio Ponderado de Stock)
- `costoUnitario(estado: EstadoInventario): number`:  
  Calcula $\text{valor\_total\_usd\_cents} / \text{existencias}$. Si existencias $\le 0$, retorna 0.
- `registrarEntrada(estado, unidades, costo_total_usd_cents): ResultadoEntrada`:  
  Suma existencias y valor acumulado. Calcula el nuevo costo promedio ponderado.
- `registrarSalida(estado, unidades): ResultadoSalida`:  
  Calcula el costo con el que salen las unidades vendidas para congelarlo en la venta. Si se agota el inventario a 0, el valor remanente se limpia completamente sin dejar residuos de centavos.

### 4. `src/core/prorrateo.ts` (Algoritmo de Hamilton / Mayor Residuo)
- `repartirMayorResiduo(totalCentavos: number, pesos: number[]): number[]`:  
  Algoritmo estándar de distribución proporcional exacta. Reparte la parte entera y asigna los centavos sobrantes uno a uno a las fracciones con mayores residuos decimales. **Garantiza matemáticamente que $\sum \text{partes} \equiv \text{total}$**.

### 5. `src/core/documentos/plantillas.ts` (Facturación y Documentos)
- `generarDocumentoHTML(datos: DatosDocumento): string`:  
  Genera un documento HTML completo, responsivo y diseñado para impresión/PDF en formato A4. Soporta:
  - Factura de Contado / Factura de Crédito con tabla de cuotas.
  - Proforma / Cotización para clientas.
  - Recibo oficial de abono o liquidación con desglose de saldo anterior y saldo actual.

---

## 5. Contrato IPC y Superficie de la API (`ApiPuente`)

El proceso de renderizado (React) se comunica con el proceso principal a través de `window.api`, expuesto de forma segura en `src/preload/api.ts` e implementado mediante `src/main/ipc/index.ts`.

Todas las llamadas devuelven el tipo discriminado:
```ts
export type Resultado<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

### Módulos Principales de `ApiPuente`:
```ts
export interface ApiPuente {
  // Autenticación con Google Workspace / Firebase Auth
  auth: {
    iniciarGoogle(): Promise<Resultado<UsuarioGoogle>>;
    obtenerUsuario(): Promise<Resultado<UsuarioGoogle | null>>;
    cerrarSesion(): Promise<Resultado<{ ok: true }>>;
  };

  // Parámetros y Configuración
  parametros: {
    get(): Promise<Resultado<ParametrosSistema>>;
    update(valores: Record<string, unknown>): Promise<Resultado<ConGrupo>>;
    recalcularPrecios(): Promise<Resultado<{ productos: number }>>;
  };

  // Inventario y Catálogo
  productos: {
    list(filtros?: FiltrosProducto): Promise<Resultado<ProductoConStock[]>>;
    get(id: number): Promise<Resultado<ProductoConStock | null>>;
    crear(input: CrearProductoInput): Promise<Resultado<ConGrupo & { id: number }>>;
    actualizar(input: ActualizarProductoInput): Promise<Resultado<ConGrupo>>;
    ajustarStock(variante_id: number, existencias: number, motivo?: string, producto_id?: number): Promise<Resultado<ConGrupo>>;
    archivar(id: number): Promise<Resultado<ConGrupo>>;          // Descatalogar
    reactivar(id: number): Promise<Resultado<ConGrupo>>;         // Reactivar producto
    eliminarDefinitivo(id: number): Promise<Resultado<ConGrupo>>;// Hard-delete permanente
    movimientos(producto_id: number): Promise<Resultado<MovimientoInventario[]>>;
    simularPrecio(input: SimularPrecioInput): Promise<Resultado<SimularPrecioOutput>>;
  };

  // Compras y Paquetes de USA
  compras: {
    list(): Promise<Resultado<Compra[]>>;
    get(id: number): Promise<Resultado<CompraCompleta | null>>;
    guardar(input: GuardarCompraInput): Promise<Resultado<ConGrupo & { id: number }>>;
    previsualizar(input: GuardarCompraInput): Promise<Resultado<PreviewCompra>>;
    recibir(id: number): Promise<Resultado<ConGrupo & { productos_afectados: number }>>;
    archivar(id: number): Promise<Resultado<ConGrupo>>;
  };

  // Ventas y Encargos
  ventas: {
    list(filtros?: FiltrosVenta): Promise<Resultado<Venta[]>>;
    get(id: number): Promise<Resultado<VentaCompleta | null>>;
    crear(input: CrearVentaInput): Promise<Resultado<ConGrupo & { id: number }>>;
    cambiarEstado(id: number, estado: EstadoVenta): Promise<Resultado<ConGrupo>>;
  };

  // Cobranza y Abonos
  pagos: {
    registrar(input: RegistrarPagoInput): Promise<Resultado<ResultadoPago>>;
    registrarAbonoCliente(input: AbonoClienteInput): Promise<Resultado<ResultadoPago>>;
    listarPorCliente(cliente_id: number): Promise<Resultado<PagoCompleto[]>>;
    listarPorVenta(venta_id: number): Promise<Resultado<PagoCompleto[]>>;
    anular(pago_id: number): Promise<Resultado<ConGrupo>>;
    recientes(limite?: number): Promise<Resultado<PagoCompleto[]>>;
  };

  // Clientes
  clientes: {
    list(busqueda?: string): Promise<Resultado<ClienteDetalle[]>>;
    get(id: number): Promise<Resultado<ClienteDetalle | null>>;
    guardar(input: GuardarClienteInput): Promise<Resultado<ConGrupo & { id: number }>>;
    archivar(id: number): Promise<Resultado<ConGrupo>>;
  };

  // Tablero Ejecutivo
  panel: {
    cargar(): Promise<Resultado<PanelData>>;
  };

  // Impresión y Exportación PDF Nativa
  documentos?: {
    imprimir(html: string): Promise<Resultado<{ ok: boolean }>>;
    guardarPdf(input: { html: string; nombreSugerido: string }): Promise<Resultado<{ guardado: boolean; ruta?: string }>>;
  };

  // Sistema de Actualización Automática (GitHub Releases)
  actualizador?: {
    onUpdateChecking(cb: () => void): () => void;
    onUpdateAvailable(cb: (info: { version: string }) => void): () => void;
    onUpdateProgress(cb: (progress: { percent: number }) => void): () => void;
    onUpdateDownloaded(cb: (info: { version: string }) => void): () => void;
    reiniciarYAplicar(): Promise<void>;
    verificarManual(): Promise<{ success: boolean; updateInfo?: any; error?: string }>;
  };

  // Deshacer Acciones Globales
  sistema: {
    deshacer(grupo_id?: string): Promise<Resultado<{ revertido: boolean; descripcion: string }>>;
    info(): Promise<Resultado<InfoSistema>>;
  };
}
```

---

## 6. Reglas Críticas de Cloud Firestore y Rendimiento

Firestore factura por **documento leído y escrito**. Por ello, el código sigue patrones estrictos de arquitectura:

1. **Una sola pasada por colección (`panel.repo.ts`)**:  
   El método `PanelRepo.cargar()` obtiene una instantánea de datos y computa en memoria el resumen de capital, rotación de productos, alertas y cuentas por cobrar. No realiza múltiples consultas separadas por cada widget.
2. **Caché en Memoria con TTL**:  
   - `panel.repo.ts` tiene una caché en memoria de **20 segundos** para no saturar Firestore si el usuario cambia rápidamente de vista.
   - `parametros.repo.ts` tiene una caché de **30 segundos**. Cualquier actualización invoca `ParametrosRepo.invalidarCache()`.
3. **Cero Problemas N+1**:  
   Para obtener varios documentos por ID, se usa `leerVarios(coleccion, ids)`, que consulta en paralelo mediante lotes y evita consultas individuales repetitivas.
4. **Subdocumentos Embebidos**:  
   Las líneas de una venta (`lineas`) y su cronograma de pagos (`cuotas`) se almacenan **dentro del mismo documento de la venta** en Firestore como arreglos. Lo mismo ocurre con las líneas de un paquete de compra y las variantes de un producto. Cuestan 1 sola lectura.
5. **Transacciones y Concurrencia**:  
   La modificación de existencias de inventario en bodega se realiza estrictamente dentro de transacciones de Firestore (`runTransaction`) para evitar condiciones de carrera si dos ventas ocurren al mismo tiempo.
6. **Deshacer Atómico (`evento_grupo_id`)**:  
   Toda mutación de datos escribe un registro en la colección `eventos` asociado a un UUID (`evento_grupo_id`). Cuando el usuario presiona `Ctrl + Z`, `EventosRepo.deshacer(grupo_id)` revierte los documentos al estado previo exacto.

---

## 7. Mapeo de Vistas y Componentes Principales

### En Escritorio (Windows / React)
- **`PanelView.tsx`**:
  - Encabezado con métricas Bento Pulse.
  - Tarjeta de capital *"Dónde está tu plata"* (Bodega vs. Cuentas por Cobrar).
  - **Selector de Gráfica (Pills Switcher)** que persiste en `localStorage` (`glow_panel_grafica_tipo`) con 5 opciones analíticas implementadas en `src/renderer/src/components/ui/Graficas.tsx`:
    1. `LineaCreciente`: Rentabilidad (Ganancia Neta vs. Ingresos Brutos).
    2. `GraficaVolumen`: Volumen mensual de órdenes y ticket promedio ($/pedido).
    3. `GraficaMargen`: Margen neto porcentual mensual con línea umbral del 35%.
    4. `GraficaTopProductos`: Ranking horizontal de los 5 artículos más vendidos con existencias.
    5. `GraficaCostosIngresos`: Comparativa de facturación bruta vs. costo de compra y flete.
  - 3 Módulos inferiores limpios: Quién te debe, Stock por agotarse y Artículos más vendidos.
- **`CobranzaView.tsx`**:
  - Vista dedicada en la barra lateral (`HandCoins`).
  - Pestaña 1: **Historial de Abonos** con filtros por método de pago (Efectivo/Transferencia) y anulación de pagos.
  - Pestaña 2: **Cuentas por Cobrar** con cobro vía WhatsApp (datos bancarios pre-cargados) y botón para registrar abono al instante.
- **`InventarioView.tsx`**:
  - Listado con filtros, soporte para fotos, variantes y multipacks (ej. paquetes de boxers).
  - Botones claros para **Descatalogar** y **Reactivar**.
  - Panel lateral de detalle con pie de acciones fijo (*sticky footer*).
- **`DocumentoModal.tsx`**:
  - Vista previa de Factura, Proforma o Cotización.
  - Botón de **Guardar PDF** nativo (cuadro de diálogo de Windows) y botón de **Imprimir** nativo.
- **`VentasView.tsx`**:
  - Registro de ventas y encargos, planes de cuotas, cobro por WhatsApp e historial de abonos por venta en el drawer lateral.

### En Móvil (PWA - `mobile/src/views/`)
- **`DashboardView.tsx`**: Vista ejecutiva móvil con métricas rápidas y tarjetas de capital.
- **`QuickSaleView.tsx`**: Registro táctil ultra rápido de ventas directas en mostrador o entregas.
- **`CobranzaView.tsx`**: Cobranza móvil con apertura directa de chats de WhatsApp con enlaces de pago y registro táctil de abonos en `AbonoModalSheet.tsx`.
- **`InventoryQuickView.tsx`**: Consulta rápida de existencias y precios con búsqueda instantánea.

---

## 8. Flujo de Trabajo, Pruebas y Despliegue (Playbook)

### Comandos de Verificación Local
```bash
# 1. Comprobación estricta de tipos de TypeScript (DEBE DAR 0 ERRORES)
npm run typecheck

# 2. Ejecución de la suite de pruebas unitarias e integrales (Vitest)
npm test

# 3. Ejecutar entorno de desarrollo de escritorio (Electron + Vite)
npm run dev

# 4. Ejecutar entorno de desarrollo móvil (PWA)
npm run dev:mobile
```

### Compilación y Despliegue de Producción

#### Para la App Móvil (PWA en Firebase Hosting)
```bash
# Compila la PWA móvil y la despliega a los dos sitios de Firebase Hosting:
# https://glow-heaven-movil.web.app y https://glow-heaven-db-app.web.app
npm run deploy:mobile
```

#### Para la App de Escritorio (Windows Installer + GitHub Releases)
```bash
# 1. Compilar los archivos binarios de Electron y empaquetar el instalador NSIS
npm run build:exe

# El ejecutable compilado queda en release/Glow-Heaven-Manager-Setup-<VERSION>.exe
# con su respectivo release/latest.yml y release/Glow-Heaven-Manager-Setup-<VERSION>.exe.blockmap

# 2. Publicar la versión en GitHub Releases (usando GitHub CLI)
gh release create v<VERSION> release/Glow-Heaven-Manager-Setup-<VERSION>.exe release/latest.yml release/Glow-Heaven-Manager-Setup-<VERSION>.exe.blockmap --title "<VERSION>" --notes "Notas de la versión..."
```

---

## 9. Lista de Verificación para Cualquier Cambio Futuro

Antes de dar por completada cualquier tarea o refactorización:

1. [ ] ¿Todos los importes monetarios viajan como números enteros de centavos (`usd_cents`)?
2. [ ] ¿Las operaciones que modifican inventario usan transacciones o calculan el promedio ponderado respetando `productos.valor_inventario_usd_cents`?
3. [ ] ¿Se pasó `npm run typecheck` y la salida tiene **0 errores**?
4. [ ] ¿Se ejecutó `npm test` y pasan las **133 pruebas** unitarias e integrales?
5. [ ] ¿Se usaron nombres semánticos de color (`temas.css`) y componentes de diálogo propios (`Confirmar.tsx`) sin invocar `window.alert` o `window.confirm`?
6. [ ] ¿Si se modificaron contratos IPC, se actualizaron tanto `src/shared/ipc-contracts.ts`, `src/preload/api.ts`, `src/main/ipc/index.ts` como `src/renderer/src/mock-api.ts`?
