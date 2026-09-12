# Rediseño y ordenamiento de la interfaz — Plan de implementación

> **Para quien ejecuta esto:** este documento asume que no conocés el proyecto. Todo lo que necesitás está acá. Los pasos usan casillas (`- [ ]`) para que marques avance. Ejecutá las tareas en orden: cada una deja el repositorio compilando y con las pruebas en verde.

**Objetivo:** eliminar todo rastro de la paleta rosa, reemplazarla por un sistema azul corporativo coherente, y reordenar la jerarquía visual de las seis vistas para que la aplicación se lea como un panel de control financiero y no como una app de consumo.

**Arquitectura:** el sistema de tokens y una capa de nueve primitivos reutilizables **ya existen y están commiteados**. Lo que falta es (a) corregir el color de peligro, que sigue siendo rosado, (b) migrar cada vista a los primitivos quitando énfasis, y (c) cerrar con barridos de verificación que impidan que la deuda vuelva.

**Stack:** Electron 34, React 18, TypeScript 5.7 (`strict`), Tailwind 3.4, better-sqlite3 11, Vitest 3, Vite 6. Todo el código y la interfaz están en español.

**Rama de trabajo:** `refactor/precios-bugs-ui`. No crear ramas nuevas. No hacer merge a `master` sin autorización explícita del dueño.

---

## Restricciones globales

Estas rigen todas las tareas. Violar una es un defecto, aunque el paso no la repita.

- **Dinero siempre en enteros de centavos** (`usd_cents`, `cor_cents`). Jamás float.
- **La interfaz nunca muestra basis points ni centavos crudos.** Siempre en lenguaje humano: "35%", "C$36.62", "$12.50".
- **Los montos se muestran en C$ y USD juntos.**
- **Español nicaragüense claro y sin tecnicismos.** El dueño escribió los textos existentes: no los reformules salvo que un paso lo pida.
- `tsconfig.json` tiene `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true`. **Todo import huérfano rompe el build.** Si dejás de usar un icono, borrá su import.
- **Las pruebas se corren con `node ./scripts/run-test.js run`**, nunca con `npx vitest`. El runner arranca vitest bajo Electron para que cargue `better-sqlite3`.
- **Compuertas de cada tarea:** `node ./scripts/run-test.js run` en verde y `npm run build` sin errores. La línea de base son **46 pruebas**; suben a **52** en la Task 7, que agrega un módulo con las suyas. Ninguna otra tarea cambia ese número.
- **No toques `src/main/`, `src/preload/` ni `src/shared/`.** Este plan es solo de interfaz. La lógica financiera ya fue corregida en un ciclo anterior y está cubierta por pruebas.
- **De `src/core/` solo creás `numeros.ts`** en la Task 7, con su prueba. Es la única excepción y está justificada ahí. No modifiques ningún otro archivo de `src/core/`.
- **No modifiques archivos existentes bajo `tests/`.** Solo agregás `tests/numeros.test.ts` en la Task 7. Si una prueba existente falla, el problema está en tu cambio.

---

## Estado actual verificado

Medido sobre el repositorio, no de memoria. Estos números son tu línea de base: al final del plan todos deben ser cero.

### Lo que ya está hecho y commiteado

**Capa de tokens** (`tailwind.config.js`, commit `31aa14a`). Definidas las escalas `navy-50..950` (superficies oscuras), `brand-50..950` (acción primaria, azul), `success`, `warning` y `danger` en pasos 50/100/500/600/700/800. Los neutros siguen en `slate`, que ya dominaba. La escala tipográfica nombrada existe:

```
caption    11px / 400    metadatos
label      12px / 500    etiquetas de campo
body       14px / 400    texto corriente
title      16px / 600    títulos de sección
display    24px / 700    títulos de vista
metric-sm  18px / 600    cifras secundarias
metric     28px / 600    cifras financieras
```

El token `glow` **sobrevive como alias apuntando a la escala azul**. Ese fue un recurso deliberado: hizo que toda la aplicación cambiara de rosa a azul sin tocar un solo `.tsx`. Se elimina en la Task 11, cuando ya no quede ningún consumidor. **No lo borres antes** o dejás sin estilo todas las vistas sin migrar.

`src/renderer/src/lib/cn.ts` fusiona clases de Tailwind resolviendo conflictos (la última gana). Usalo en todo `className` condicional.

**Capa de primitivos** (`src/renderer/src/components/ui/`, commit `661b21b`). Nueve componentes creados y **todavía sin consumir**. Sus firmas reales, verificadas en el código:

```ts
// Card.tsx
Card, CardHeader, CardContent   // todos React.FC<React.HTMLAttributes<HTMLDivElement>>

// Button.tsx
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;   // default 'primary'
  size?: ButtonSize;         // default 'md'
}

// Badge.tsx
type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
interface BadgeProps { tone?: Tone; children: React.ReactNode; className?: string }

// StatusDot.tsx
interface StatusDotProps { tone: Tone; label?: string; className?: string }

// Money.tsx
type MoneySize = 'sm' | 'md' | 'lg' | 'xl';
interface MoneyProps {
  cor_cents: number;
  usd_cents?: number;
  size?: MoneySize;          // default 'md'
  primary?: 'COR' | 'USD';   // default 'COR'
  className?: string;
}

// StatTile.tsx
interface StatTileProps {
  label: string;
  cor_cents?: number;        // si lo pasás, renderiza un <Money>
  usd_cents?: number;
  value?: React.ReactNode;   // alternativa a cor_cents, para conteos
  hint?: string;
  tone?: Tone;               // default 'neutral'
  className?: string;
}

// Field.tsx
interface FieldProps { label: string; hint?: string; error?: string; children: React.ReactNode; className?: string }
Input, Select, Textarea      // envuelven el control nativo con estilo unificado

// DataTable.tsx
interface Column<T> { key: string; header: string; align?: 'left' | 'right'; width?: string; render: (row: T) => React.ReactNode }
interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  selectedKey?: string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}
function DataTable<T>(props: DataTableProps<T>)

// SectionHeader.tsx
interface SectionHeaderProps { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }
```

Todos se importan desde `../../components/ui` (o la ruta relativa que corresponda), que reexporta desde su `index.ts`.

**Leé el código fuente de un primitivo antes de usarlo por primera vez.** No adivines props.

### Trabajo sin commitear que vas a encontrar

Cuatro archivos tienen cambios en el árbol de trabajo, sin commitear:

```
M src/renderer/src/components/CommandPalette.tsx
M src/renderer/src/components/layout/Header.tsx
M src/renderer/src/components/layout/Sidebar.tsx
M src/renderer/src/context/ToastContext.tsx
```

Es la migración del cromo a los tokens, quedó terminada pero el proceso murió antes de commitear. **Verifiqué que compila (`tsc --noEmit` sale limpio) y que las 46 pruebas pasan.** La Task 1 lo commitea. No lo descartes.

### Deuda que queda, con conteos exactos

| Señal | Cantidad | Dónde duele |
|---|---:|---|
| `text-xs` | 142 | Casi todo el texto vive a 12px. La escala `body` de 14px existe y no se usa. |
| `text-[10px]` / `text-[11px]` | 34 | Tamaños arbitrarios fuera de escala. |
| `font-bold` | 112 | Si todo está en negrita, nada destaca. **Esta es la causa real de la saturación**, más que el color. |
| `font-black` | 9 | Peso extremo en títulos y cifras. |
| `rounded-xl` | 64 | Fuera de la escala de tres radios. |
| `rounded-2xl` | 19 | Idem. |
| `rounded-3xl` | 15 | 24px de radio en tarjetas de datos: es lo que hace que se lea como app de consumo. |
| `glow-*` | 71 | Alias temporal, hay que migrar a `brand-*` / `navy-*`. |
| `rose` / `pink` crudos | 26 | Ver desglose abajo. |

Distribución de `glow-*` por archivo:

```
ConfigView.tsx        16      CotizadorView.tsx     12
OnboardingModal.tsx   12      ClientesView.tsx       9
QuickCapture.tsx       8      PagoModal.tsx          5
EmptyState.tsx         3      HoyView.tsx            3
PedidosView.tsx        3
```

---

## Decisión de color: por qué todavía se ve rosa

Esto es lo primero que hay que entender, porque explica la queja del dueño.

De los 26 usos crudos que quedan, **solo 4 son rosa decorativo**:

```
text-pink-100  ×2    (PagoModal, OnboardingModal)
to-pink-500    ×1    (degradado)
to-pink-50     ×1    (degradado de QuickCapture)
```

Los otros **22 son `rose-*` usados como color semántico de peligro**: alertas, pedidos bloqueados, clientes con historial de incumplimiento, botones destructivos.

El problema es que `rose` **es un rojo rosado**. `rose-500` es `#f43f5e`: leído en cantidad, y sobre todo en fondos claros como `bg-rose-100`, se percibe rosa. Y el token `danger` que quedó definido en `tailwind.config.js` usa exactamente esos valores de `rose`. O sea: renombrar `rose-*` a `danger-*` **no cambiaría nada visualmente**. La aplicación seguiría viéndose rosa en cada alerta.

**Decisión: el token `danger` pasa de la familia `rose` a un rojo verdadero.** Un rojo inequívoco (`#dc2626`) lee como advertencia y no como decoración, que es lo que un panel financiero necesita. Con eso, y con los 4 decorativos eliminados, no queda un solo pixel rosado en la aplicación.

Esa es la Task 2, y es la que responde directo a la queja. Si tenés que priorizar, esa va primero después de commitear lo pendiente.

**Paleta final, completa:**

| Rol | Familia | Uso |
|---|---|---|
| `slate-*` | gris azulado | Texto, bordes, fondos neutros. Es la base y ya domina. |
| `navy-*` | azul profundo frío | Barra lateral, cabeceras de modal, franjas de datos oscuras. |
| `brand-*` | azul | Acción primaria, foco, selección, enlaces, fila seleccionada. |
| `success-*` | verde esmeralda | Verificado, listo para comprar, pago confirmado. |
| `warning-*` | ámbar | Por verificar, pendiente de confirmación bancaria. |
| `danger-*` | **rojo** (cambia) | Bloqueado, sin anticipo, incumplimiento, acción destructiva. |

Prohibidos en todo el renderer: `pink`, `fuchsia`, `rose`, `purple`, `violet`.

---

## Mapa de archivos

| Archivo | Tarea | Qué le pasa |
|---|---|---|
| `tailwind.config.js` | 2, 11 | `danger` a rojo; al final se recorta `borderRadius` y se borra el alias `glow` |
| `src/renderer/index.html` | 2 | Se quita la carga de fuente por red |
| `src/renderer/src/index.css` | 2 | Se ajusta la pila tipográfica |
| `views/HoyView.tsx` | 3 | Se reordena a panel de indicadores |
| `views/pedidos/PedidosTable.tsx` | 4 | **Crear** |
| `views/pedidos/PedidoDetailPanel.tsx` | 4 | **Crear** |
| `views/PedidosView.tsx` | 4 | Se reduce a orquestador |
| `views/cotizador/useCotizacionDraft.ts` | 5 | **Crear** — saca el cálculo del JSX |
| `views/cotizador/ItemsEditor.tsx` | 5 | **Crear** |
| `views/cotizador/ResumenPanel.tsx` | 5 | **Crear** |
| `views/cotizador/HistorialCotizaciones.tsx` | 5 | **Crear** |
| `views/CotizadorView.tsx` | 5 | 774 líneas se reducen a orquestador |
| `views/ClientesView.tsx` | 6 | Rejilla de tarjetas a tabla |
| `views/config/CategoriasSection.tsx` | 7 | **Crear** |
| `views/ConfigView.tsx` | 7 | Bloques apilados a secciones ancladas |
| `components/PagoModal.tsx` | 8 | A primitivos |
| `components/OnboardingModal.tsx` | 9 | A primitivos |
| `components/QuickCapture.tsx` | 10 | Quitar degradado rosa |
| `components/shared/EmptyState.tsx` | 10 | A primitivos |
| `components/shared/DualMoneyDisplay.tsx` | 10 | **Borrar** — lo reemplaza `Money` |

---

# TAREAS

## Task 1: Commitear el cromo pendiente y fijar la línea de base

**Archivos:** los cuatro modificados sin commitear.

- [ ] **Paso 1: Confirmá que el árbol está como se describe**

```bash
git branch --show-current    # debe decir: refactor/precios-bugs-ui
git status --porcelain
```

Esperado: cuatro archivos con `M` (CommandPalette, Header, Sidebar, ToastContext) y posiblemente directorios sin rastrear como `.impeccable/` o `.superpowers/`, que se ignoran.

Si el árbol está limpio, alguien ya commiteó ese trabajo: saltá a la Task 2.

- [ ] **Paso 2: Verificá que ese trabajo está sano antes de adoptarlo**

```bash
npx tsc --noEmit
node ./scripts/run-test.js run
```

Esperado: `tsc` sin salida, 46 pruebas en verde. Si algo falla, **no lo arregles a ciegas**: leé el diff con `git diff` y reportá qué encontraste.

- [ ] **Paso 3: Commiteá solo los cuatro archivos de código**

```bash
git add src/renderer/src/components/CommandPalette.tsx \
        src/renderer/src/components/layout/Header.tsx \
        src/renderer/src/components/layout/Sidebar.tsx \
        src/renderer/src/context/ToastContext.tsx
git commit -m "refactor(ui): migrar cabecera, barra lateral, toasts y paleta a los primitivos"
```

No agregues `.impeccable/` ni `.superpowers/` al commit.

- [ ] **Paso 4: Dejá registrada la línea de base**

```bash
npm run build
```

Esperado: compilación limpia. A partir de acá, cada tarea termina con build limpio y 46 pruebas.

---

## Task 2: Erradicar el rosa del sistema de color

Esta es la tarea que responde a la queja del dueño. Hacela completa antes de tocar ninguna vista.

**Archivos:** `tailwind.config.js`, `src/renderer/index.html`, `src/renderer/src/index.css`, y los tres archivos con rosa decorativo.

- [ ] **Paso 1: Cambiá el token `danger` de rosado a rojo**

En `tailwind.config.js`, dentro de `theme.extend.colors`, reemplazá el bloque `danger` completo por:

```js
        // Rojo verdadero, no rosado. `rose` (#f43f5e) se percibe rosa en
        // fondos claros, que es justo lo que este rediseño elimina.
        danger: {
          50: '#fef2f2',
          100: '#fee2e2',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
        },
```

- [ ] **Paso 2: Verificá que ningún hex rosado sobreviva en el config**

```bash
grep -nE '#(f43f5e|e11d48|be123c|9f1239|fff1f2|ffe4e6|ec4899|db2777|f472b6)' tailwind.config.js
```

Esperado: sin resultados.

- [ ] **Paso 3: Eliminá los cuatro usos de rosa decorativo**

```bash
grep -rn -E '(pink|fuchsia)-[0-9]+' src/renderer --include=*.tsx
```

Vas a encontrar cuatro. Tratalos así:

- En `QuickCapture.tsx`, el degradado `bg-gradient-to-r from-glow-50 to-pink-50` se reemplaza por una superficie plana: `bg-slate-50`. Un degradado no aporta nada en un campo de captura.
- En `PagoModal.tsx` y `OnboardingModal.tsx`, `text-pink-100` sobre fondo oscuro se reemplaza por `text-slate-300`.
- Cualquier `to-pink-500` en un degradado: eliminá el degradado entero y dejá el color sólido de base.

Volvé a correr el grep. Debe salir vacío.

- [ ] **Paso 4: Migrá los 22 `rose-*` semánticos a `danger-*`**

```bash
grep -rn -E 'rose-[0-9]+' src/renderer --include=*.tsx
```

Reemplazá cada uno por su equivalente en `danger`, respetando el paso:

```
rose-50  → danger-50      rose-500 → danger-500
rose-100 → danger-100     rose-600 → danger-600
rose-700 → danger-700     rose-800 → danger-800
rose-900 → danger-800     (no existe paso 900; usá 800)
```

**Cuidado:** `danger` solo define los pasos 50, 100, 500, 600, 700 y 800. Si encontrás un `rose-200`, `rose-300`, `rose-400` o `rose-900`, mapealo al paso definido más cercano. Una clase que apunta a un paso inexistente **no da error: Tailwind la descarta en silencio** y el elemento queda sin estilo.

Volvé a correr el grep. Debe salir vacío.

- [ ] **Paso 5: Quitá la carga de fuente por red**

`src/renderer/index.html` carga Inter desde Google Fonts. Es una aplicación de escritorio local, que se anuncia a sí misma como "Modo Local Seguro": sin internet, la tipografía cambia sola y toda la interfaz se recorre. Borrá estas seis líneas del `<head>`:

```html
    <!-- Google Fonts Inter -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
      rel="stylesheet"
    />
```

Y en `src/renderer/src/index.css`, cambiá la pila tipográfica a la del sistema, que en Windows resuelve a Segoe UI:

```css
  body {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  }
```

Segoe UI es una tipografía de interfaz sobria y neutra, apropiada para una herramienta administrativa, y está garantizada en Windows. Si el dueño prefiere Inter, se puede empaquetar el archivo de fuente localmente en vez de traerlo por red: es un cambio de una línea en este mismo bloque más el `@font-face`.

- [ ] **Paso 6: Verificá y commiteá**

```bash
node ./scripts/run-test.js run
npm run build
git add tailwind.config.js src/renderer/index.html src/renderer/src/index.css src/renderer/src
git commit -m "fix(ui): rojo verdadero para peligro, sin rosa decorativo y sin fuente por red"
```

- [ ] **Paso 7: Miralo**

```bash
npm run dev
```

Recorré las cinco pestañas. **No debe quedar nada rosado.** Las alertas y los pedidos bloqueados ahora son rojos. Si ves rosa en algún lado, encontraste un uso que los greps no atrapan: buscá degradados y colores en línea con `style=`.

---

## Task 3: HoyView como panel de control

**Archivo:** `src/renderer/src/views/HoyView.tsx`

**Problema actual:** las cifras de dinero están al fondo de la vista, dentro de una tarjeta con degradado oscuro. Lo primero que el dueño necesita ver al abrir la aplicación es su plata, no una lista de pendientes.

**Estructura destino:**

```
┌──────────────────────────────────────────────────────────────┐
│  Hoy en Glow Heaven                                          │
│  Resumen operativo y tareas que requieren tu atención.       │
├──────────────┬──────────────┬──────────────┬─────────────────┤
│ Anticipos    │ Por cobrar   │ Bloqueados   │ Listos          │
│ C$ 12,450    │ C$ 8,900     │ 3            │ 7               │
│ no es tuyo   │ contraentrega│ sin anticipo │ podés comprar   │
├──────────────┴──────────────┴──┬───────────┴─────────────────┤
│ Necesitan tu decisión           │ Entregas de hoy            │
│ (2/3 del ancho)                 │ (1/3)                      │
│                                 │ Esperando a otros          │
└─────────────────────────────────┴────────────────────────────┘
```

- [ ] **Paso 1: Fila de indicadores arriba**

Justo después del título de la vista, antes de todo lo demás:

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile
          label="Anticipos recibidos"
          cor_cents={anticiposRecibidos}
          tone="warning"
          hint="Esto no es ganancia: lo debés en producto."
        />
        <StatTile
          label="Por cobrar contraentrega"
          cor_cents={saldosPorCobrar}
          tone="info"
          hint="Saldos pendientes al entregar."
        />
        <StatTile
          label="Pedidos bloqueados"
          value={pedidosBloqueados}
          tone="danger"
          hint="Sin anticipo verificado en banco."
        />
        <StatTile
          label="Listos para comprar"
          value={pedidosListos}
          tone="success"
          hint="Anticipo confirmado."
        />
      </div>
```

`pedidosBloqueados` y `pedidosListos` son props nuevas. Agregalas a `HoyViewProps` como `number` y pasalas desde `App.tsx`, que ya calcula `semaforoCounts` con `verde` y `rojo`:

```tsx
            <HoyView
              data={hoyData}
              loading={loading}
              pedidosBloqueados={semaforoCounts.rojo}
              pedidosListos={semaforoCounts.verde}
              onNewCotizacion={() => setActiveTab('cotizador')}
              onNavigateToPedidos={(pedidoId) => { ... }}
            />
```

- [ ] **Paso 2: Borrá la tarjeta con degradado**

Eliminá por completo el bloque que empieza con `bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900`. Su contenido ya vive en los `StatTile`. Con él se van tres usos de `glow-*`.

- [ ] **Paso 3: Dos columnas debajo**

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Necesitan tu decisión */}
        </div>
        <div className="space-y-4">
          {/* Entregas de hoy, y Esperando a otros */}
        </div>
      </div>
```

- [ ] **Paso 4: Migrá las secciones restantes a primitivos**

Cada sección pasa a `Card` + `CardHeader` con un `SectionHeader` adentro + `CardContent`. Los círculos de icono de 32px (`w-8 h-8 rounded-xl bg-...-100`) se eliminan: `SectionHeader` ya recibe el icono suelto por prop `icon`.

- [ ] **Paso 5: Quitá énfasis**

Esta es la mitad del trabajo, no un detalle de acabado:

- `text-2xl font-black` del título → `text-display`
- `text-sm font-bold` de títulos de sección → `text-title`
- `text-xs` de texto corriente → `text-body`
- `text-[11px]` → `text-caption`
- `rounded-3xl` y `rounded-2xl` → `rounded-lg`
- **Todo `font-bold` que no esté en un título o una cifra: borralo.**

- [ ] **Paso 6: Verificá y commiteá**

```bash
grep -n -E 'glow-|rounded-(2xl|3xl)|font-black' src/renderer/src/views/HoyView.tsx
node ./scripts/run-test.js run && npm run build
git add src/renderer/src/views/HoyView.tsx src/renderer/src/App.tsx
git commit -m "refactor(hoy): reordenar como panel de control financiero"
```

El grep debe salir vacío.

---

## Task 4: PedidosView como tabla con panel de detalle

**Archivos:** crear `views/pedidos/PedidosTable.tsx` y `views/pedidos/PedidoDetailPanel.tsx`; reducir `views/PedidosView.tsx`.

**Problema actual:** tarjetas apiladas con acordeón. Los montos no se pueden comparar entre pedidos porque cada uno está en su propia tarjeta, alineado distinto.

**Estructura destino:**

```
┌────────────────────────────────────────────────┬───────────────┐
│ ● COD      CLIENTE     TOTAL      SALDO    EST │ PED-0012      │
│ ─────────────────────────────────────────────  │ ───────────── │
│ ● PED-0012 M. Morales  C$12,450   C$6,225   ▲  │ Productos  3  │
│ ● PED-0011 J. Ruiz      C$8,900   C$0          │ Pagos      1  │
│ ● PED-0010 A. Selva     C$3,200   C$1,600      │ [Cobrar]      │
└────────────────────────────────────────────────┴───────────────┘
```

- [ ] **Paso 1: Creá `PedidosTable.tsx`**

```tsx
import React from 'react';
import type { Pedido } from '../../../../shared/types';
import { DataTable, type Column, Badge, StatusDot, Money, Button } from '../../components/ui';

export interface PedidosTableProps {
  pedidos: Pedido[];
  selectedId?: number;
  onSelect: (pedido: Pedido) => void;
  onCobrar: (pedido: Pedido) => void;
}

export const PedidosTable: React.FC<PedidosTableProps> = ({
  pedidos,
  selectedId,
  onSelect,
  onCobrar,
}) => {
  const columnas: Column<Pedido>[] = [
    {
      key: 'estado',
      header: '',
      width: '2.5rem',
      render: (p) => <StatusDot tone={p.anticipo_verificado ? 'success' : 'danger'} />,
    },
    {
      key: 'codigo',
      header: 'Código',
      render: (p) => <span className="font-medium text-slate-900">{p.codigo}</span>,
    },
    { key: 'fecha', header: 'Fecha', render: (p) => p.fecha },
    {
      key: 'situacion',
      header: 'Situación',
      render: (p) => (
        <Badge tone={p.anticipo_verificado ? 'success' : 'danger'}>
          {p.anticipo_verificado ? 'Listo para comprar' : 'Bloqueado sin anticipo'}
        </Badge>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (p) => <Money cor_cents={p.total_cor_cents} size="md" />,
    },
    {
      key: 'saldo',
      header: 'Saldo',
      align: 'right',
      render: (p) => <Money cor_cents={p.saldo_pendiente_cor_cents} size="md" />,
    },
    {
      key: 'accion',
      header: '',
      align: 'right',
      render: (p) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            onCobrar(p);
          }}
        >
          Cobrar
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columnas}
      rows={pedidos}
      rowKey={(p) => p.id}
      selectedKey={selectedId}
      onRowClick={onSelect}
      emptyMessage="No hay pedidos en esta vista. Se generan al convertir una cotización."
    />
  );
};
```

El `e.stopPropagation()` no es opcional: sin él, tocar "Cobrar" también dispara `onRowClick`.

- [ ] **Paso 2: Creá `PedidoDetailPanel.tsx`**

Mové acá todo el bloque que hoy vive dentro de `{isExpanded && ( ... )}`: la lista de ítems con su selector de estado y el historial de pagos.

Props:

```tsx
export interface PedidoDetailPanelProps {
  detalle: PedidoCompleto | null;
  onCambiarEstado: (itemId: number, nuevo: EstadoItem) => void;
  onVerificarPago: (pagoId: number) => void;
}
```

**No toques la lógica del `<select>` de estado.** Ya fue corregida en un ciclo anterior: deriva sus opciones de `transicionesPermitidas(item.estado)` y las etiqueta con `ETIQUETAS_ESTADO_ITEM`, ambas exportadas por `@core/estados`. Antes ofrecía estados inexistentes y hacía imposible entregar un pedido. Solo cambiá clases.

Cuando `detalle` es `null`, mostrá un estado vacío sobrio dentro de un `Card`: "Elegí un pedido de la lista para ver su detalle."

- [ ] **Paso 3: Reducí `PedidosView.tsx` a orquestador**

Conserva el estado, los efectos y los manejadores. Tres detalles:

Primero, hoy conviven la prop `selectedPedidoId` y el estado `expandedPedidoId`, porque el patrón era acordeón. Sin acordeón queda un solo concepto: renombrá el estado a `selectedPedidoId` y la prop entrante a `initialPedidoId`.

Segundo, extraé como manejadores con nombre dos cosas que hoy son `onClick` anónimos dentro del JSX, porque el panel los recibe por props:

```tsx
  const recargarDetalle = useCallback(() => {
    if (!selectedPedidoId) return;
    window.api.pedidos.getById(selectedPedidoId).then((r) => {
      if (r.success) setPedidoDetalle(r.data);
    });
  }, [selectedPedidoId]);

  const handleVerificarPago = async (pagoId: number) => {
    const res = await window.api.pagos.verificar(pagoId, true);
    if (!res.success) {
      showToast({ message: res.error.message, type: 'error' });
      return;
    }
    showUndoToast('Pago marcado como verificado', () => onRefresh());
    onRefresh();
    recargarDetalle();
  };
```

Tercero, los filtros pasan a control segmentado con conteos y **sin emojis**. Los emojis actuales (🟢🔴⚠️) no son accesibles y son informales para una herramienta administrativa. Definí las etiquetas como constante:

```tsx
const FILTROS = [
  { id: 'TODOS' as const, label: 'Todos' },
  { id: 'LISTOS' as const, label: 'Listos para comprar' },
  { id: 'BLOQUEADOS' as const, label: 'Bloqueados' },
  { id: 'ATENCION' as const, label: 'Requieren atención' },
];
```

El `return` queda:

```tsx
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-1">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'px-3 py-1.5 rounded-md text-label transition-colors',
              filter === f.id
                ? 'bg-navy-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            {f.label} ({contarPara(f.id)})
          </button>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-3 gap-4 p-6 overflow-y-auto">
        <div className="xl:col-span-2">
          <PedidosTable
            pedidos={filteredPedidos}
            selectedId={selectedPedidoId}
            onSelect={(p) => setSelectedPedidoId(p.id)}
            onCobrar={(p) => setPagoModalPedido(p)}
          />
        </div>
        <div>
          <PedidoDetailPanel
            detalle={pedidoDetalle}
            onCambiarEstado={handleCambiarEstadoItem}
            onVerificarPago={handleVerificarPago}
          />
        </div>
      </div>

      {pagoModalPedido && ( /* el modal se queda igual */ )}
    </div>
  );
```

`contarPara` es un helper local que aplica el mismo predicado que el filtro y devuelve la longitud.

- [ ] **Paso 4: Verificá y commiteá**

```bash
grep -n -E 'glow-|rounded-(2xl|3xl)|🟢|🔴|⚠' src/renderer/src/views/PedidosView.tsx src/renderer/src/views/pedidos/*.tsx
node ./scripts/run-test.js run && npm run build
git add src/renderer/src/views/pedidos src/renderer/src/views/PedidosView.tsx
git commit -m "refactor(pedidos): tabla densa con panel de detalle"
```

- [ ] **Paso 5: Probá el flujo completo en pantalla**

Con `npm run dev`, tomá un pedido y recorrelo estado por estado hasta `ENTREGADO`. Ese camino estuvo roto y es la regresión más cara posible acá.

---

## Task 5: Descomponer CotizadorView

**Archivos:** crear cuatro bajo `views/cotizador/`; reducir `views/CotizadorView.tsx`.

**Problema actual:** 774 líneas mezclando estado, cálculo financiero y JSX. Es el archivo más difícil de editar del proyecto.

- [ ] **Paso 1: Extraé el hook `useCotizacionDraft.ts`**

Mové ahí el estado `draftItems` y `anticipoPorcentaje`, los manejadores `handleAddItem`, `handleUpdateItem`, `handleRemoveItem`, `handleParsedItem`, y el `useMemo` completo de `calculoCotizacion`.

Firma:

```ts
export function useCotizacionDraft(params: {
  categorias: Categoria[];
  tiendas: Tienda[];
  parametros: ParametrosSistema | null;
}): {
  draftItems: DraftItem[];
  calculo: ResultadoCotizacionCompleta | null;
  anticipoPorcentaje: number;
  setAnticipoPorcentaje: (n: number) => void;
  addItem: () => void;
  updateItem: <K extends keyof DraftItem>(id: string, field: K, value: DraftItem[K]) => void;
  removeItem: (id: string) => void;
  handleParsedItem: (parsed: ItemCapturaRapida) => void;
}
```

Fijate en `updateItem`: hoy su tercer parámetro es `any`. El genérico `<K extends keyof DraftItem>` elimina ese `any` sin costo.

**Dos bugs que arreglás de paso, porque están en el código que estás moviendo:**

El estado inicial trae un producto de demostración hardcodeado ("Perfume Dior Sauvage 100ml" a $128). Arrancá con una fila vacía:

```tsx
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    { id: 'item_1', descripcion: '', precio_usa_usd: '', peso_lb: '' },
  ]);
```

Y el inicializador de `useState` busca tienda y categoría en listas que todavía están vacías en el primer render, así que siempre quedan `undefined` y la cotización cae en silencio a las tasas por defecto. Resolvelo en un efecto:

```tsx
  useEffect(() => {
    if (tiendas.length === 0 && categorias.length === 0) return;
    setDraftItems((prev) =>
      prev.map((item) =>
        item.tienda_id === undefined && item.categoria_id === undefined
          ? { ...item, tienda_id: tiendas[0]?.id, categoria_id: categorias[0]?.id }
          : item
      )
    );
  }, [tiendas, categorias]);
```

Aplicá los mismos valores por defecto en `addItem`.

- [ ] **Paso 2: Extraé `ItemsEditor.tsx`**

La tarjeta de "Productos a Cotizar" con su bucle de filas. Cada campo pasa a `Field` con `Input` o `Select`. El botón de borrar pasa a `Button variant="ghost"`.

- [ ] **Paso 3: Extraé `ResumenPanel.tsx`**

La columna derecha completa. El bloque de total deja de ser `bg-slate-900` con cifra en `text-glow-300`:

```tsx
        <div className="rounded-lg bg-navy-900 p-4">
          <div className="text-caption uppercase tracking-wide text-slate-400">
            Total a cobrar al cliente
          </div>
          <div className="mt-1 text-metric text-white tabular">
            {formatearMoneda(totales.total_final_cor_cents, 'COR')}
          </div>
          <div className="text-label text-slate-400 tabular">
            Equivalente: {formatearMoneda(totales.total_final_usd_cents, 'USD')}
          </div>
        </div>
```

- [ ] **Paso 4: Extraé `HistorialCotizaciones.tsx`**

La pestaña de cotizaciones guardadas, convertida a `DataTable` con columnas Código, Estado, Fecha, Total y acción.

- [ ] **Paso 5: Verificá que el cálculo no cambió**

Esto es lo más importante de la tarea. Antes y después de la descomposición, cotizá un perfume de **$128.00 con peso 1.5 lb**, categoría Perfumería, tienda con 7% de tax. El total debe dar **C$7,000.00**. Ese valor está fijado como prueba de regresión en `tests/precios-escenarios.test.ts`; si te da otra cosa, movíste lógica sin querer.

- [ ] **Paso 6: Commiteá**

```bash
node ./scripts/run-test.js run && npm run build
git add src/renderer/src/views/cotizador src/renderer/src/views/CotizadorView.tsx
git commit -m "refactor(cotizador): separar hook de calculo, editor, resumen e historial"
```

---

## Task 6: ClientesView a tabla

**Archivo:** `src/renderer/src/views/ClientesView.tsx`

- [ ] **Paso 1: Rejilla de tarjetas a `DataTable`**

Reemplazá el `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3` por un `DataTable` con columnas:

| Columna | Contenido |
|---|---|
| Nombre | El nombre, más un `<Badge tone="danger">70% anticipo</Badge>` cuando `incumplio_anteriormente` |
| Ciudad | Texto |
| Teléfono | Texto |
| Acciones | `Button variant="ghost" size="sm"` para WhatsApp y para Editar |

Coherente con Pedidos: las dos listas principales de la aplicación se ven y se operan igual.

- [ ] **Paso 2: Migrá el modal**

Cabecera `bg-slate-900` → `bg-navy-900`. `rounded-3xl` → `rounded-lg`. Cada par de etiqueta y control → `Field` con `Input`, `Select` o `Textarea`. El aviso de incumplimiento ya quedó en `danger-*` por la Task 2.

- [ ] **Paso 3: Verificá y commiteá**

```bash
grep -n -E 'glow-|rounded-(2xl|3xl)' src/renderer/src/views/ClientesView.tsx
node ./scripts/run-test.js run && npm run build
git add src/renderer/src/views/ClientesView.tsx
git commit -m "refactor(clientes): tabla y modal sobre los primitivos"
```

---

## Task 7: ConfigView con secciones y edición de categorías

**Archivos:** `views/ConfigView.tsx`, crear `views/config/CategoriasSection.tsx`

Es el archivo con más deuda: 16 usos de `glow-*` y cuatro bloques apilados que obligan a scrollear.

- [ ] **Paso 1: Navegación por secciones**

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <nav className="space-y-1">
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSeccion(s.id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-body transition-colors',
                seccion === s.id
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="lg:col-span-3 space-y-4">{/* sección activa */}</div>
      </div>
```

`SECCIONES` cubre: Tasa y courier, Aduana, Categorías y ganancia, Cuentas bancarias.

- [ ] **Paso 2: Creá `src/core/numeros.ts` (no existe todavía)**

Lo necesitás en los pasos siguientes, y además arregla un bug real que vive justo en el código que esta tarea reescribe.

Hoy `ConfigView.handleSave` parsea sus ocho campos con `parseFloat` sin guarda. En Nicaragua el separador decimal natural es la coma: escribir `36,62` produce `NaN`, que se guarda como la cadena literal `"NaN"` en la tabla `parametros`. A partir de ahí **toda cotización da NaN**. Vas a reescribir esos campos igual, así que dejar el `parseFloat` sería negligente.

Creá `src/core/numeros.ts`:

```ts
/**
 * Parseo de números escritos por una persona.
 * En Nicaragua el separador decimal natural es la coma, así que `parseFloat`
 * a secas convierte "36,62" en 36 y descarta los centavos en silencio.
 */

/**
 * Convierte texto escrito por el usuario a número.
 * Acepta coma o punto como separador decimal. Devuelve null si no es un
 * número finito, en vez de NaN, para que quien llame tenga que decidir.
 */
export function parsearDecimal(texto: string): number | null {
  const limpio = texto.trim().replace(/\s+/g, '').replace(',', '.');
  if (limpio === '') return null;
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) return null;

  const valor = Number(limpio);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * Convierte texto a centavos enteros, validando rango en unidades enteras
 * (no en centavos). Devuelve null si el texto no es válido o queda fuera.
 */
export function parsearACentavos(
  texto: string,
  opciones?: { min?: number; max?: number }
): number | null {
  const valor = parsearDecimal(texto);
  if (valor === null) return null;

  if (opciones?.min !== undefined && valor < opciones.min) return null;
  if (opciones?.max !== undefined && valor > opciones.max) return null;

  return Math.round(valor * 100);
}
```

Y su prueba en `tests/numeros.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parsearDecimal, parsearACentavos } from '@core/numeros';

describe('src/core/numeros.ts', () => {
  it('acepta punto decimal', () => {
    expect(parsearDecimal('36.62')).toBe(36.62);
  });

  it('acepta coma decimal, que es lo natural al escribir en español', () => {
    expect(parsearDecimal('36,62')).toBe(36.62);
  });

  it('ignora espacios alrededor', () => {
    expect(parsearDecimal('  6.50  ')).toBe(6.5);
  });

  it('rechaza vacío, texto y valores no finitos', () => {
    expect(parsearDecimal('')).toBeNull();
    expect(parsearDecimal('   ')).toBeNull();
    expect(parsearDecimal('abc')).toBeNull();
    expect(parsearDecimal('36.6.2')).toBeNull();
    expect(parsearDecimal('Infinity')).toBeNull();
  });

  it('convierte a centavos redondeando', () => {
    expect(parsearACentavos('36,62')).toBe(3662);
    expect(parsearACentavos('0.005')).toBe(1);
  });

  it('rechaza valores fuera del rango pedido', () => {
    expect(parsearACentavos('-5', { min: 0 })).toBeNull();
    expect(parsearACentavos('150', { min: 0, max: 100 })).toBeNull();
    expect(parsearACentavos('50', { min: 0, max: 100 })).toBe(5000);
  });
});
```

Corré `node ./scripts/run-test.js run`: deben pasar 52 pruebas (46 + 6 nuevas).

Este es el único archivo fuera de `src/renderer/` que este plan te autoriza a crear, y es puro TypeScript sin dependencia de Electron, como el resto de `src/core/`.

- [ ] **Paso 3: Reemplazá los ocho `parseFloat` de `handleSave`**

Cada campo pasa por `parsearACentavos` con su rango, y si alguno es inválido **abortás el guardado señalando el campo**, en vez de escribir basura:

```tsx
import { parsearACentavos } from '@core/numeros';

// dentro de handleSave, reemplazando las ocho líneas de parseFloat:
const campos: { clave: string; etiqueta: string; texto: string; min: number; max: number }[] = [
  { clave: 'tasa_cambio_oficial_cents', etiqueta: 'Tasa de cambio', texto: tasaCambio, min: 1, max: 1000 },
  { clave: 'tarifa_flete_cents_lb', etiqueta: 'Tarifa de flete', texto: tarifaFlete, min: 0, max: 1000 },
  { clave: 'flete_minimo_usd_cents', etiqueta: 'Flete mínimo', texto: fleteMinimo, min: 0, max: 1000 },
  { clave: 'otros_costos_fijos_usd_cents', etiqueta: 'Casillero', texto: otrosCostosFijos, min: 0, max: 1000 },
  { clave: 'umbral_arancel_excedente_usd_cents', etiqueta: 'Exoneración de aduana', texto: umbralArancel, min: 0, max: 100000 },
  { clave: 'comision_minima_cotizacion_cor_cents', etiqueta: 'Comisión mínima', texto: comisionMinima, min: 0, max: 1000000 },
  { clave: 'arancel_default_bp', etiqueta: 'Arancel por defecto', texto: arancelDefault, min: 0, max: 100 },
  { clave: 'anticipo_default_bp', etiqueta: 'Anticipo por defecto', texto: anticipoDefault, min: 0, max: 100 },
];

const valores: Record<string, string> = {};
for (const campo of campos) {
  const n = parsearACentavos(campo.texto, { min: campo.min, max: campo.max });
  if (n === null) {
    showToast({
      message: `Revisá "${campo.etiqueta}": escribí solo números, por ejemplo 36.62`,
      type: 'error',
    });
    setGuardando(false);
    return;
  }
  valores[campo.clave] = n.toString();
}
valores['cuentas_bancarias'] = JSON.stringify(cuentas);
```

Los porcentajes salen bien con la misma función: `parsearACentavos('32,5')` devuelve `3250`, que es exactamente el valor en basis points.

Después escribí los valores con el `Promise.all` existente, leyendo de `valores` en vez de las variables sueltas. **Ese `Promise.all` de nueve llamadas separadas no es transaccional y es un bug conocido** (ver la sección de bugs fuera de alcance al final): no lo arregles acá, solo no lo empeores.

- [ ] **Paso 4: Creá `CategoriasSection.tsx`**

Tabla editable, una fila por categoría, tres campos: comisión en porcentaje, arancel en porcentaje, redondeo en córdobas.

El canal IPC ya existe. Su firma real:

```ts
window.api.categorias.update(cambios: CategoriaCambio[]): Promise<IpcResult<void>>

interface CategoriaCambio {
  id: number;
  comision_defecto_bp: number;
  arancel_estimado_bp: number;
  redondeo_cor_cents: number;
}
```

Usá `parsearACentavos(texto, { min: 0, max: 100 })` para convertir cada porcentaje a basis points, con la misma guarda de error del paso anterior.

**Manejá el resultado de error.** El canal devuelve `{ success: false, error }` si un id no existe, y aborta el lote entero. No asumas éxito.

Nota encima de la tabla:

```tsx
      <p className="text-body text-slate-600">
        La comisión es tu ganancia y se calcula sobre el precio del producto en
        la tienda. El arancel es lo que cobra la aduana: dejalo en 0 si tus
        envíos no pagan aduana. El redondeo deja los precios en cifras limpias.
      </p>
```

- [ ] **Paso 5: El flete mínimo lleva advertencia**

Es el parámetro que más castiga los productos livianos: con un mínimo de $15, un labial de $20 pasa de 57% a 125% de sobreprecio.

```tsx
        <Field
          label="Flete mínimo por envío (USD)"
          hint="Dejalo en 0 si tu courier solo cobra por libra. Un mínimo alto encarece mucho los productos livianos."
        >
          <Input value={fleteMinimo} onChange={(e) => setFleteMinimo(e.target.value)} />
        </Field>
```

- [ ] **Paso 6: Migrá todos los campos a `Field` y verificá**

```bash
grep -n -E 'glow-|rounded-(2xl|3xl)' src/renderer/src/views/ConfigView.tsx
node ./scripts/run-test.js run && npm run build
git add src/renderer/src/views/ConfigView.tsx src/renderer/src/views/config
git commit -m "feat(config): secciones ancladas y edicion de tasas por categoria"
```

- [ ] **Paso 7: Probalo de punta a punta**

Con `npm run dev`: bajá la comisión de Perfumería a 20%, guardá, andá al Cotizador y confirmá que el precio del perfume bajó. Ese circuito es la razón de ser de esta sección.

---

## Task 8: PagoModal

**Archivo:** `src/renderer/src/components/PagoModal.tsx`

- [ ] **Paso 1: Migrá a primitivos**

`rounded-3xl` → `rounded-lg`. Cabecera `bg-slate-900` → `bg-navy-900`. Cada campo → `Field`. Botones → `Button`. Elimina los cinco usos de `glow-*`.

- [ ] **Paso 2: No toques el valor por defecto de `verificado`**

Arranca en `false` a propósito, corregido en un ciclo anterior. Marcar un pago como verificado desbloquea la compra en USA; tiene que ser un acto deliberado. Conservá también el texto de la casilla, que explica esa consecuencia.

- [ ] **Paso 3: Verificá y commiteá**

```bash
grep -n -E 'glow-|rounded-(2xl|3xl)' src/renderer/src/components/PagoModal.tsx
node ./scripts/run-test.js run && npm run build
git add src/renderer/src/components/PagoModal.tsx
git commit -m "refactor(pagos): migrar el modal de pago a los primitivos"
```

---

## Task 9: OnboardingModal

**Archivo:** `src/renderer/src/components/OnboardingModal.tsx`

Doce usos de `glow-*`, cinco pasos de asistente.

- [ ] **Paso 1: Migrá los cinco pasos**

Cada campo → `Field`. Botones de navegación → `Button`. El indicador de progreso pasa a una barra simple `bg-brand-600`. Quitá los emojis decorativos de los encabezados de paso.

- [ ] **Paso 2: Alineá los valores por defecto con la realidad del negocio**

El dueño confirmó que sus únicos costos son el producto, el 7% de tax de tienda y el flete por libra. En el paso 2 agregá el campo de flete mínimo con la misma advertencia de la Task 7. En el paso 3, el arancel por defecto arranca en **0**, con la nota "Dejalo en 0 si tus envíos no pagan aduana."

- [ ] **Paso 3: Verificá y commiteá**

Para probarlo hay que forzar el asistente: borrá `cuentas_bancarias` de la base local, o cambiá el parámetro `onboarding_completado` a `0`.

```bash
grep -n -E 'glow-|rounded-(2xl|3xl)' src/renderer/src/components/OnboardingModal.tsx
node ./scripts/run-test.js run && npm run build
git add src/renderer/src/components/OnboardingModal.tsx
git commit -m "refactor(onboarding): migrar el asistente a los primitivos"
```

---

## Task 10: Compartidos y eliminación de `DualMoneyDisplay`

**Archivos:** `components/QuickCapture.tsx`, `components/shared/EmptyState.tsx`, borrar `components/shared/DualMoneyDisplay.tsx`

- [ ] **Paso 1: QuickCapture sobrio**

Ya perdió el rosa en la Task 2. Ahora migrá el botón a `Button`, el icono a `text-slate-400`, y el contenedor a `bg-slate-50 rounded-lg border border-slate-200`. Ocho usos de `glow-*` se van.

- [ ] **Paso 2: EmptyState**

Botón → `Button variant="primary"`. `rounded-2xl` → `rounded-lg`. Tres usos de `glow-*` se van.

- [ ] **Paso 3: Eliminá `DualMoneyDisplay`**

`Money` lo reemplaza. Primero confirmá que nadie lo importa:

```bash
grep -rn "DualMoneyDisplay" src/
```

Si aparece algún import (probablemente en `CotizadorView` o en `ItemsEditor`), migralo a `Money` primero. La equivalencia es directa:

```tsx
// antes
<DualMoneyDisplay cor_cents={x} usd_cents={y} size="base" />
// después
<Money cor_cents={x} usd_cents={y} size="md" />
```

Con el grep limpio, borrá el archivo. **`noUnusedLocals` no detecta un archivo entero sin usar**, por eso el grep es obligatorio.

- [ ] **Paso 4: Verificá y commiteá**

```bash
node ./scripts/run-test.js run && npm run build
git add src/renderer/src/components
git rm src/renderer/src/components/shared/DualMoneyDisplay.tsx
git commit -m "refactor(ui): migrar compartidos y eliminar DualMoneyDisplay"
```

---

## Task 11: Cierre y compuertas de guardia

Esta tarea impide que la deuda vuelva. Hacela solo cuando las Tasks 1 a 10 estén completas.

- [ ] **Paso 1: Borrá el alias `glow`**

Antes de borrarlo, confirmá que no queda ningún consumidor:

```bash
grep -rn "glow-" src/renderer --include=*.tsx | grep -v "Glow Heaven"
```

Debe salir vacío. El `grep -v` excluye el nombre del negocio, que es texto legítimo.

Con eso limpio, eliminá el bloque `glow` completo de `theme.extend.colors` en `tailwind.config.js`.

- [ ] **Paso 2: Recortá la escala de radios**

En `tailwind.config.js`, dentro de `theme` (**no** de `extend`), agregá:

```js
    borderRadius: {
      none: '0',
      md: '0.375rem',
      lg: '0.5rem',
      full: '9999px',
    },
```

Esto elimina `rounded-sm`, `rounded-xl`, `rounded-2xl` y `rounded-3xl` del sistema. Cualquier uso que sobreviva deja de producir estilo, lo que lo vuelve visible de inmediato al recorrer la aplicación.

**Hacelo solo ahora.** Si lo hacés antes, dejás sin estilo cada vista sin migrar.

- [ ] **Paso 3: Corré las compuertas**

Cada uno debe devolver cero resultados:

```bash
grep -rn "glow-" src/renderer --include=*.tsx | grep -v "Glow Heaven"
grep -rn -E "rounded-(sm|xl|2xl|3xl)" src/renderer --include=*.tsx
grep -rn -E "\b(bg|text|border|ring|from|to|via)-(pink|fuchsia|rose|purple|violet)-[0-9]+" src/renderer --include=*.tsx
grep -rn -E "text-\[(10|11)px\]" src/renderer --include=*.tsx
grep -rn "font-black" src/renderer --include=*.tsx
grep -rn "DualMoneyDisplay" src/
```

- [ ] **Paso 4: Barrido de tipografía**

```bash
grep -rc "text-xs" src/renderer --include=*.tsx
grep -rc "font-bold" src/renderer --include=*.tsx
```

`text-xs` debe quedar cerca de cero: sustituí los residuos por `text-label` (etiquetas de campo) o `text-body` (texto corriente).

`font-bold` empezó en 112. **No tiene que llegar a cero**, pero cada uno que sobreviva debe estar en un título o en una cifra. Si está en texto corriente, borralo. Como referencia razonable: menos de 25 en toda la aplicación.

- [ ] **Paso 5: Verificación completa en pantalla**

```bash
node ./scripts/run-test.js run
npm run build
npm run dev
```

Recorré estos ocho pasos, que son el circuito real de trabajo del dueño:

1. Primer arranque: aparece el asistente, configurar todo
2. `HoyView` carga con sus cuatro indicadores arriba, sin errores en consola
3. `Ctrl+N`: cotizar 3 ítems con captura rápida, totales duales correctos
4. `Ctrl+Shift+C`: copia el mensaje con las cuentas bancarias
5. Convertir a pedido: aparece el toast de deshacer, probarlo y confirmar la reversión
6. Intentar mandar a lista USA sin anticipo: debe quedar bloqueado
7. `Ctrl+V` con un comprobante: pago prellenado, verificar, semáforo verde
8. `Ctrl+B` respalda, cerrar la app, confirmar el respaldo en disco

Y además: **recorré un pedido hasta `ENTREGADO`**, y confirmá que **no queda un solo elemento rosado** en ninguna pantalla.

- [ ] **Paso 6: Commiteá**

```bash
git add tailwind.config.js src/renderer
git commit -m "refactor(ui): eliminar el alias glow, recortar radios y cerrar la migracion"
```

---

## Cómo saber que terminaste

| Señal | Antes | Meta |
|---|---:|---:|
| `glow-*` | 71 | 0 |
| `pink` / `fuchsia` / `rose` | 26 | 0 |
| `rounded-xl` / `2xl` / `3xl` | 98 | 0 |
| `text-[10px]` / `text-[11px]` | 34 | 0 |
| `font-black` | 9 | 0 |
| `text-xs` | 142 | ~0 |
| `font-bold` | 112 | < 25 |
| Pruebas | 46 | 46 |
| `npm run build` | limpio | limpio |

---

## Bugs conocidos que este plan NO arregla

Estos están confirmados en el código y **quedan vivos** después de ejecutar el plan. No los arregles: cambian comportamiento, no apariencia, y merecen su propio ciclo con sus propias pruebas. Están acá para que no los tomes por trabajo tuyo ni los rompas más al pasar.

Vas a tocar los archivos donde viven, así que la regla es: **no los empeores y no los toques.**

| # | Bug | Dónde | Por qué importa |
|---|---|---|---|
| 1 | El motor de deshacer solo entiende `PEDIDO_ITEM`, `COTIZACION`, `PEDIDO` y `PAGO`. Cualquier otro tipo de entidad cae por todas las ramas sin revertir nada, pero igual **borra el grupo de eventos y devuelve `revertido: true`**. | `src/main/db/repositories/eventos.repo.ts` | Deshacer reporta éxito sin haber revertido, y destruye el rastro de auditoría. Ya se dispara con los eventos `CATEGORIA` que escribe el canal de categorías. |
| 2 | `deshacerUltimoGrupo()` revierte el grupo **más reciente**, no el del toast en que hiciste clic. Y `Ctrl+Z` toma el toast **más viejo** de la lista. | `eventos.repo.ts`, `context/ToastContext.tsx` | Con dos acciones seguidas, deshace la equivocada. |
| 3 | Los nueve `parametros.update` de `ConfigView` van en un `Promise.all`, no en una transacción. | `views/ConfigView.tsx` | Un fallo parcial deja la configuración a medias. Viola la regla de `AGENTS.md` de envolver toda mutación en `db.transaction()`. |
| 4 | `Ctrl+V` sin un pedido seleccionado adjunta el comprobante a `pedidos[0]`, un pedido arbitrario. | `views/PedidosView.tsx` | Un comprobante de pago termina en el pedido equivocado sin aviso. |
| 5 | El `value` de `ToastContext.Provider` es un objeto literal sin `useMemo`; el `setInterval` de la cuenta regresiva nunca se limpia al cerrar el toast a mano. | `context/ToastContext.tsx` | Cada toast vuelve a renderizar todo el árbol, y quedan intervalos corriendo. |
| 6 | `URL.createObjectURL` nunca se revoca en `PagoModal`. | `components/PagoModal.tsx` | Fuga de memoria por cada comprobante pegado. |
| 7 | Cambiar la moneda en `PagoModal` no reconvierte el monto prellenado. | `components/PagoModal.tsx` | Se puede registrar $6,225 donde correspondía C$6,225. |
| 8 | `semaforoCounts.amarillo` nunca se incrementa. | `App.tsx` | La rama ámbar de la cabecera es código muerto. Se deduce de `total_cor_cents - saldo_pendiente_cor_cents > 0` con anticipo sin verificar. |
| 9 | `comision_total_cor_cents` ignora el excedente del redondeo, así que la línea "Ganancia" del cotizador no cuadra con el precio final. | `src/core/precios.ts` | El margen reportado está subestimado. |

Los bugs 1 y 2 son los más graves: los dos hacen que la aplicación **diga que hizo algo que no hizo**.

---

## Cosas que NO hay que hacer

- **No toques `src/main/`, `src/preload/` ni `src/shared/`.** La lógica financiera fue corregida en un ciclo anterior y está cubierta por pruebas. Si creés que hay un bug ahí, reportalo en vez de arreglarlo.
- **No arregles los nueve bugs de la sección anterior.** Son de comportamiento, no de apariencia.
- **De `src/core/` solo creás `numeros.ts`.** Nada más.
- **No modifiques archivos existentes bajo `tests/`.** Si una prueba falla, el problema está en tu cambio.
- **No borres el alias `glow` antes de la Task 11.**
- **No recortes `borderRadius` antes de la Task 11.**
- **No reformules el español existente** salvo donde un paso lo pida. El dueño escribió esos textos.
- **No agregues dependencias.** `clsx` y `tailwind-merge` ya están y ya se usan.
- **No hagas merge a `master`** sin autorización explícita.
- **No agregues modo oscuro.** `darkMode: 'class'` está configurado y sin usar a propósito. Los tokens quedaron nombrados de forma que se pueda añadir después sin rehacer nada.

---

## Contexto adicional útil

- El diseño original y su razonamiento están en `docs/superpowers/specs/2026-08-27-refactor-integral-design.md`.
- `AGENTS.md` en la raíz tiene las reglas absolutas del dominio financiero.
- `REVISION_FASE1.md` documenta deuda de verificación pendiente que **no** es parte de este plan: el instalador NSIS nunca se generó ni se probó.
- La aplicación se llama "Glow Heaven Manager" y la usa una sola persona, que hace personal shopping desde Estados Unidos hacia Nicaragua. Es una herramienta interna, no de cara al cliente: por eso la paleta sobria es apropiada aunque la marca de cara al público sea de belleza.
