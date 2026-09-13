# Informe Técnico de Traspaso — Sesión Completa 2026-09-12
## Proyecto: Glow Heaven Manager (Desktop Electron + PWA Móvil)

> **Audiencia**: Próximo modelo de IA / Agente de desarrollo que retome este proyecto.
> **Ruta del repositorio**: `c:\Users\espin\Downloads\Proyectos_Codigo\landing_page_ross\herramienta_de_gestion_interna\`
> **Rama de trabajo activa**: `refactor/precios-bugs-ui` *(todas las entregas y releases se cortan y publican directamente desde esta rama)*.
> **Versión de cierre en producción**: **`v2.2.18`** *(en `package.json`, Firebase Hosting y GitHub Releases)*.
> **Último commit**: `1c4802c` (`feat: portal modal pantalla completa, uniformidad catalogo, filtros cobranza y animaciones v2.2.18`).
> **Estado de la suite de pruebas**: **140/140 pruebas pasando** (12 suites ejecutadas al 100%).
> **Estado de TypeScript**: **0 errores** tanto en escritorio (`npm run typecheck`) como en móvil (`npx tsc -p mobile/tsconfig.json --noEmit`).

---

## 1. Resumen Ejecutivo del Estado del Sistema

Durante esta sesión de trabajo continuo se abordaron tres frentes críticos:
1. **Auditoría e Implementación de Seguridad Integral**: Se mitigó la vulnerabilidad crítica **C-1** (acceso público sin restricción en Firestore) implementando lista blanca estricta de cuentas Google autorizadas tanto en reglas de backend como en el arranque de la PWA móvil, junto con 8 correcciones de seguridad adicionales (cifrado local de sesión, rollback compensatorio en ventas, verificación de stock en variantes, token CSRF, sanitización HTML de facturas y Content Security Policy).
2. **Evolución y Rediseño de UI/UX (Desktop & PWA Móvil)**: Se transformó la experiencia visual aplicando estándares modernos de diseño:
   - En **PWA Móvil**: Se rediseñó el dock inferior como una cápsula flotante con glassmorphism (*Floating Glass Capsule Dock*), se expandió el widget de stock crítico aprovechando la pantalla sin forzar scroll, se rediseñaron los filtros de cobranza como píldoras compactas y se unificó la altura y ritmo visual de las tarjetas del catálogo.
   - En **Windows Desktop**: Se reemplazaron gráficos planos por Recharts con transiciones fluidas, se depuraron emojis en el panel de métricas, se ajustó la barra de distribución de capital, se amplió la vista de Configuración y se implementó un sistema de **Portales (`createPortal`)** para que cualquier formulario o modal atenúe la totalidad de la ventana (TopBar, Sidebar y contenido).
3. **Pipeline de Despliegue y Distribución Automatizada**: Se mantuvieron en producción sincronizados los dos canales de distribución:
   - **PWA Móvil**: Hospedada en Firebase Hosting en `https://glow-heaven-movil.web.app` y `https://glow-heaven-db-app.web.app`.
   - **Windows Desktop**: Empaquetada con `electron-builder` en instaladores NSIS de 64 bits con auto-actualización vía `electron-updater` ligada a GitHub Releases (`owner: joswil05, repo: glow-heaven-manager`).

---

## 2. Cronología Detallada de Versiones Implementadas

A continuación se resume el progreso y las soluciones implementadas desde `v2.2.11` hasta `v2.2.18`:

### 2.1 — Versiones v2.2.11 a v2.2.13: Refactorización y Pulido de Interfaces
- **v2.2.11**: Rediseño del Inicio de escritorio para monitores estándar (1366x768 / 1920x1080), optimizando padding y alturas para evitar scrollbar vertical forzado. Ajuste de altura responsiva en gráficas móviles.
- **v2.2.12**:
  - Incorporación de **Recharts** (`AreaChart`, `BarChart`, `PieChart`) con tooltips interactivos elegantes y soporte de modo claro/oscuro.
  - Widget de métricas móvil ajustado a 64px para equilibrio de densidad de información.
  - Barra lateral colapsable (`Sidebar.tsx`) con memoria de estado y formato unificado para valores monetarios (`$0.00` y `C$0.00`).
- **v2.2.13**:
  - Rediseño ejecutivo de cabecera y barra lateral en escritorio: eliminación sistemática de emojis informales, sustituidos por íconos SVG nítidos de `lucide-react`.
  - Jerarquía visual calibrada en tarjetas de métricas (`StatTile.tsx`).

### 2.2 — Versión v2.2.14: Auditoría Técnica y Robustecimiento
A partir de la auditoría documentada en `docs/AUDITORIA_2026-09-12.md`, se aplicaron las siguientes soluciones:
- **C-1 (Crítico - Autorización Firestore)**:
  - En [firestore.rules](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/firestore.rules): Se restringió el acceso de lectura/escritura exclusivamente a los UIDs autorizados de Google o a aquellos registrados en la colección `usuarios_autorizados`.
  - En [mobile/src/App.tsx](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/mobile/src/App.tsx): Se implementó pantalla de bloqueo inmediato si una cuenta ajena intenta acceder a la PWA.
- **A-1 (Alto - Cifrado de Sesión)**: En [google-auth.service.ts](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/src/main/firebase/google-auth.service.ts), se cifró `auth_session.json` en disco mediante `safeStorage` nativo de Electron.
- **A-2 (Alto - Integridad de Ventas)**: En [ventas.repo.ts](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/src/main/firebase/repositories/ventas.repo.ts), se implementó un patrón saga de compensación (rollback) que revierte automáticamente el descuento de stock si la venta falla en guardarse.
- **A-3 (Alto - Stock de Variantes)**: En [productos.repo.ts](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/src/main/firebase/repositories/productos.repo.ts), se incorporó validación previa de stock suficiente en la variante específica antes de realizar el débito.
- **M-1 / M-2 (Medio - CSRF & OAuth)**: Verificación criptográfica con token `state` en el listener HTTP local y captura robusta de errores en `signInWithCredential`.
- **M-3 (Medio - XSS en Documentos)**: En [plantillas.ts](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/src/core/documentos/plantillas.ts), sanitización con `escaparHtml()` en todos los campos dinámicos inyectados en HTML imprimible.
- **M-4 (Medio - CSP)**: Adición de directivas restrictivas `Content-Security-Policy` en `index.html` de ambas aplicaciones.
- **M-6 (Medio - Rendimiento Local)**: En [client.ts](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/src/main/firebase/client.ts), persistencia en caché local vía IndexedDB con `persistentLocalCache`.

### 2.3 — Versión v2.2.15: Menú Contextual Robusto y Depuración de Cuentas
- **Menú contextual (`ContextMenu.tsx`)**:
  - Montado mediante `createPortal` en `document.body` con capa `z-[9999]`, eliminando recortes por contenedores con `overflow: hidden`.
  - Cálculo dinámico de bordes: si el clic ocurre cerca del borde inferior o derecho, el menú se invierte automáticamente hacia arriba o a la izquierda. Si excede la pantalla, activa scroll vertical interno.
- **Lista blanca definitiva**: Restricción estricta a dos cuentas maestras:
  1. `angierlinartej2020@gmail.com` (UID: `ZdM86RTlEEQLYWHSBZPvsKq2YgJ3`)
  2. `espinozajoswill@gmail.com` (UID: `PLCUbpheiAhjelGqcZznVypc3O72`)
  *(Se purgó cualquier rastro de `joswillespinoza08@gmail.com`).*

### 2.4 — Versión v2.2.16: Floating Dock, Stock Crítico Expandido y Transiciones
- **PWA Móvil**:
  - **Floating Glass Capsule Dock**: Barra de navegación inferior rediseñada como isla flotante con bordes curvados (`rounded-[26px]`), sombra profunda, píldora indicadora suave en tono esmeralda (`#dcfce7`) y badges integrados para cuotas y carrito.
  - **Stock Crítico Dinámico**: Se eliminó la altura fija restrictiva (`h-16`) pasando a `min-h-[90px] flex-1`, mostrando el desglose real de artículos críticos sin chocar con la barra ni forzar scrollbar.
- **Windows Desktop**:
  - Transición suave con `ease-out` en el selector de gráficas del dashboard, reemplazando la escala elástica abrupta.
  - Corrección de permisos de Firestore para admitir peticiones locales del proceso Electron en Node.js.

### 2.5 — Versión v2.2.17: Pulido Visual de Barra de Capital y Holguras
- **Windows Desktop**:
  - Barra de distribución de capital ("Dónde está tu plata" en [PanelView.tsx](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/src/renderer/src/views/PanelView.tsx)): Se eliminó el borde externo y el padding interior que daban apariencia de campo de texto enfocado, convirtiéndolo en un track nativo continuo y plano.
  - Separación óptica de la métrica "Total Activo" con línea divisoria sutil (`border-l border-borde/60 pl-3.5`).
- **PWA Móvil**:
  - Ajuste de padding inferior `pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]` para garantizar holgura de ~18px entre la tarjeta de stock crítico y la barra flotante.
  - Subtítulo de stock crítico simplificado a *"Agotados o bajo el mínimo"* con truncado controlado para evitar saltos de línea contra el botón *"Gestionar >"*.

### 2.6 — Versión v2.2.18: Modales Pantalla Completa, Uniformidad Catálogo y Filtros Cobranza (Actual)
- **PWA Móvil (Catálogo)**: En [InventoryQuickView.tsx](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/mobile/src/views/InventoryQuickView.tsx), se removió la fila inferior de chips de tallas (`[S (0)]`) que aumentaba artificialmente la altura de prendas como *"Calzones Calvin Klein"*. Todas las tarjetas de producto ahora comparten una fila flex estándar `p-3.5 flex gap-3 items-center` con altura idéntica (~86px).
- **PWA Móvil (Cobranza)**: En [CobranzaView.tsx](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/mobile/src/views/CobranzaView.tsx), se reemplazó el contenedor segmentado alto por píldoras compactas horizontales (`px-3 py-1 rounded-full text-xs font-bold`) coherentes con el diseño de Catálogo e Inventario.
- **Windows Desktop (Modales con Portal)**:
  - Se detectó que `.view-fade-slide` con CSS `transform` aislaba los modales con `position: fixed` dentro del área de trabajo, dejando `TopBar` y `Sidebar` claros.
  - Se creó [Portal.tsx](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/src/renderer/src/components/ui/Portal.tsx) montando en `document.body`.
  - Se migraron todos los modales (`VentaEditor`, `PaqueteEditor`, `ProductoModal`, `AjustarStockModal`, `CobranzaView` modal abono, `ClientesView` modal cliente, `DocumentoModal`, `PagoModal`, `Confirmar`) al portal con `fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs`. Ahora la ventana entera se atenúa con desenfoque suave.
- **Windows Desktop (Configuración)**: En [ConfigView.tsx](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/src/renderer/src/views/ConfigView.tsx), se amplió el contenedor de `max-w-4xl` a `max-w-[1500px] w-full mx-auto space-y-5`, aprovechando el ancho de pantalla de manera consistente con el resto de módulos.
- **Windows Desktop (Animaciones)**: Se extendió `.stagger-children` en [index.css](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/src/renderer/src/index.css) hasta 12 elementos en cascada (50ms) y se integró `animate-fade-in` en todas las vistas del sistema.

---

## 3. Arquitectura del Repositorio y Ubicación de Archivos Clave

```
herramienta_de_gestion_interna/
├── mobile/                                # Aplicación PWA Móvil
│   ├── src/
│   │   ├── components/
│   │   │   ├── BottomNav.tsx             # Floating Glass Capsule Dock
│   │   │   └── ...
│   │   ├── views/
│   │   │   ├── DashboardView.tsx         # Inicio móvil, widget stock crítico
│   │   │   ├── InventoryQuickView.tsx    # Catálogo móvil (tarjetas uniformes)
│   │   │   ├── CobranzaView.tsx          # Cobros con filtros en píldoras compactas
│   │   │   └── QuickSaleView.tsx         # Venta rápida móvil
│   │   └── App.tsx                       # Arranque móvil y verificación de whitelist
│   ├── vite.config.ts                    # Configuración Vite PWA + Workbox
│   └── tsconfig.json
├── src/
│   ├── core/                             # Lógica de dominio agnóstica de UI
│   │   ├── costeo/                       # Algoritmo de costeo aterrizado
│   │   ├── documentos/plantillas.ts      # Generador y sanitizador de facturas HTML
│   │   └── tipos.ts                      # Tipos de datos centrales
│   ├── main/                             # Proceso principal de Electron (Node.js)
│   │   ├── firebase/                     # Repositorios Firestore y OAuth seguro
│   │   └── index.ts
│   ├── preload/                          # Preload scripts y puente IPC
│   └── renderer/                         # Proceso de renderizado (React Desktop)
│       ├── src/
│       │   ├── components/
│       │   │   ├── ui/Portal.tsx         # Componente Portal hacia document.body
│       │   │   ├── ui/ContextMenu.tsx    # Menú contextual flotante con autobounding
│       │   │   ├── ui/Confirmar.tsx      # Diálogos modales z-[110]
│       │   │   └── ...
│       │   ├── views/
│       │   │   ├── PanelView.tsx         # Dashboard desktop con Recharts y barra capital
│       │   │   ├── InventarioView.tsx    # Gestión de productos
│       │   │   ├── VentasView.tsx        # Historial de ventas
│       │   │   ├── PaquetesView.tsx      # Gestión de importaciones
│       │   │   ├── CobranzaView.tsx      # Control de cuentas por cobrar
│       │   │   ├── ClientesView.tsx      # Gestión de clientas
│       │   │   └── ConfigView.tsx        # Configuración del sistema (max-w-[1500px])
│       │   └── index.css                 # Design system Tailwind + animaciones stagger
├── firestore.rules                       # Reglas de seguridad Cloud Firestore
├── electron-builder.yml                  # Configuración de compilación NSIS y GitHub Releases
└── package.json                          # Versión actual: 2.2.18
```

---

## 4. Procedimientos de Verificación y Comandos Operativos

### 4.1 — Verificación de Integridad de Código
```powershell
# 1. Chequeo de tipos en Desktop
npm run typecheck

# 2. Chequeo de tipos en PWA Móvil
npx tsc -p mobile/tsconfig.json --noEmit

# 3. Suite completa de pruebas unitarias e integración (140 tests)
npm test
```

### 4.2 — Despliegue de PWA Móvil a Firebase Hosting
```powershell
# Compilar bundle móvil
npm run build:mobile

# Desplegar a los dos targets (glow-heaven-db-app y glow-heaven-movil)
npx firebase deploy --only hosting
```

### 4.3 — Compilación y Publicación de Windows Desktop
```powershell
# 1. Compilar instalador NSIS (.exe)
npm run build:exe

# 2. Duplicar instalador con nombre guionado para compatibilidad con latest.yml
Copy-Item "release\Glow Heaven Manager Setup 2.2.X.exe" "release\Glow-Heaven-Manager-Setup-2.2.X.exe" -Force
Copy-Item "release\Glow Heaven Manager Setup 2.2.X.exe.blockmap" "release\Glow-Heaven-Manager-Setup-2.2.X.exe.blockmap" -Force

# 3. Publicar release en GitHub (habilita descarga y auto-actualizador)
gh release create v2.2.X "release\Glow-Heaven-Manager-Setup-2.2.X.exe" "release\Glow-Heaven-Manager-Setup-2.2.X.exe.blockmap" "release\latest.yml" --title "v2.2.X - Título descriptivo" --notes "Notas de la versión"
```

---

## 5. Reglas de Oro y Convenciones para el Próximo Modelo de IA

1. **Rama de Trabajo Obligatoria**: Trabaja siempre sobre `refactor/precios-bugs-ui`. No intentes hacer checkout a `main` o `master` para los releases; la infraestructura del repositorio y el workflow del usuario están anclados a esta rama.
2. **Coherencia de Nombres en Releases**: Electron-builder genera por defecto el binario con espacios (`Glow Heaven Manager Setup X.Y.Z.exe`), pero `latest.yml` lo busca con guiones (`Glow-Heaven-Manager-Setup-X.Y.Z.exe`). **Siempre copia el archivo con guiones** antes de ejecutar `gh release create`.
3. **Disciplina de Verificación Pre-Lanzamiento**: Nunca des por completado un cambio o despliegue sin antes correr `npm run typecheck`, el typecheck de mobile y `npm test`.
4. **Instrucciones del Usuario sobre Despliegues**: Presta extrema atención a si el usuario pide o no desplegar en el turno correspondiente (ej. *"no despliegues luego de esto, seguiremos haciendo pequeños cambios"* vs *"lanza ambas actualizaciones"*). Si el usuario pide no desplegar, limita el trabajo a pruebas y verificaciones locales.
5. **Enfoque de Diseño UI/UX**: Preserva la paleta ejecutiva actual (neutros de alta legibilidad, esmeraldas suaves `#10b981`/`#059669` para éxito/activo, y ámbar `#f59e0b` para cobros/alertas). Evita emojis en interfaces operativas y mantén el uso de micro-animaciones fluidas (`stagger-children`, `animate-fade-in`).
6. **Manejo de Modales**: Cualquier nuevo formulario, diálogo de confirmación o vista de edición en la app de escritorio **debe** montarse dentro de `<Portal>` (`src/renderer/src/components/ui/Portal.tsx`) para asegurar que el backdrop atenuado cubra el 100% de la ventana sin verse restringido por los estilos CSS de las vistas padre.
