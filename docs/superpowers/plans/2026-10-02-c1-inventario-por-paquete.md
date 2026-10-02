# Fase C1 · Inventario por paquete: plan de implementación

> **Para agentes:** este plan se ejecuta tarea por tarea. Codex coordina:
> asigna cada tarea, revisa la entrega y le propone a Joswill integrarla.
> Quien ejecuta (Claude u otro agente) sigue los pasos en orden, marca cada
> casilla (`- [ ]` → `- [x]`) y entrega el commit con la salida de las pruebas.
> Si un paso no coincide con el código, se detiene y lo dice: no improvisa.

**Objetivo:** que el inventario deje de llenarse de alertas de agotados, que
cada paquete muestre cómo va y se cierre solo con un resumen, y que Ross pueda
registrar un paquete desde el celular cuando llega.

**Arquitectura:** el avance de cada paquete se **calcula** con una función pura
del núcleo (`src/core/avance-paquete.ts`) a partir de los lotes de los productos
(cada lote sabe de qué paquete vino, cuántas unidades entraron, cuántas quedan,
cuántas se vendieron y por cuánto) y de las ventas con deuda. El panel de Inicio
(el mismo para las dos apps) la llama y devuelve `paquetes`. Lo único que se
guarda es cuándo Ross cerró el resumen (`resumen_visto_el` en el paquete).

**Stack:** TypeScript, React, Firebase Firestore (SDK web), Electron (Windows),
PWA con Vite (celular), Vitest, Playwright (Python) para las suites de interfaz.

**Diseño:** [docs/superpowers/specs/2026-10-02-fases-del-celular-design.md](../specs/2026-10-02-fases-del-celular-design.md)

**Validado el 2/10**: el código de los pasos 2, 3, 5, 7 y 10 de T1 se aplicó
tal cual en un worktree descartable sobre `b47d21f`: las 6 pruebas nuevas
pasan, `tsc` de las dos apps queda limpio y `npm test` pasa entero salvo la
prueba vieja del paso 12, que este plan ya cambia.
(sección "C1"). Leelo antes de empezar: este plan lo implementa.

## Restricciones para todas las tareas

- **Leer antes**: `AGENTS.md` (reglas que no se negocian) y
  `docs/CONTEXTO_SESION.md`, sección 3.
- **Dinero siempre en centavos enteros de dólar** (`*_usd_cents`). Nada de
  decimales en cálculos.
- **No confundir dos "cerrados"**: `Compra.cerrado_en` ya existe y significa
  "cuándo entró al inventario". El paquete que vendió todo se llama
  `VENDIDO` en el código y "Se vendió todo" en pantalla. No usar "cerrado"
  para eso.
- **La sección de productos se llama "Inventario"** (decisión de Joswill). En
  C1 no se renombra la pestaña del celular (eso es C2), pero ningún texto
  nuevo dice "Catálogo".
- **Textos**: vos para hablarle a Ross; "en bodega", "producto", "talla o
  tono", "anular" (anexo A de `docs/AUDITORIA_UX_2026-09-29.md`).
- **Criterios de Emil Kowalski** (sección "Criterios de diseño" del diseño):
  nada se anima en lo que se repite; lo que se anima dura menos de 300 ms con
  `var(--ease-out)`; nada late; errores en su campo; hojas con `hayCambios`;
  `inputMode="decimal"` en montos y pesos; colores sólo por token.
- **Celular**: `haptics.*` va **antes** de cualquier `await` dentro de un toque
  (en iPhone sólo vibra dentro del gesto).
- **No borrar `bajo_stock`, `total_bajo_stock` ni `stock_minimo`** de los datos:
  las pantallas dejan de usarlos y quedan sin uso. Borrarlos es una migración
  que no compra nada.
- **Git**: un worktree por tarea; `git add -- <rutas>` (nunca `-A`); nunca
  `git stash` sin rutas; nada de push, `build:exe`, `deploy:mobile` ni
  `firebase deploy`. Los commits terminan con la línea de coautor del agente.
- **El emulador se usa de a uno**: `npm run emulador` en otra terminal; las
  suites `test:emulador` y `test:interfaz` borran su base. Avisar a Codex
  antes de tomarlo y al soltarlo.
- **Comandos de verificación**:
  - `npx tsc --noEmit` y `npx tsc -p mobile/tsconfig.json --noEmit`
  - `npm test` (Vitest con Firestore falso)
  - `npm run test:emulador` (con el emulador prendido)
  - `npm run test:interfaz-escritorio` (Windows, con el simulador; no usa emulador)
  - `npm run test:interfaz` (celular, con el emulador)
  - `npm run build:mobile` (incluye las auditorías de colores, índices y hooks)
  - `SOLO="texto"` delante de las suites de interfaz corre sólo los casos cuyo
    nombre lo contiene.

## Orden y dependencias

```
T1 · Núcleo ──┬── T2 · Windows: Inicio, Inventario y Paquetes
              ├── T3 · Celular: Inicio e Inventario
              └── T4 · Celular: "Llegó un paquete"
```

T1 va primero y se integra antes de empezar las demás. T2, T3 y T4 no tocan
los mismos archivos y pueden ir en paralelo.

## Mapa de archivos

| Archivo | Tarea | Qué |
|---|---|---|
| `src/shared/types.ts` | T1 | Tipos `AvancePaquete` y compañía; `PanelData.paquetes`; `Compra.resumen_visto_el`. |
| `src/core/avance-paquete.ts` (nuevo) | T1 | `avanceDePaquetes()`: la cuenta pura. |
| `tests/c1-avance-paquete.test.ts` (nuevo) | T1 | Pruebas unitarias de la cuenta. |
| `src/main/firebase/repositories/panel.repo.ts` | T1 | Paquetes en la instantánea; `paquetes` en `cargar()`; sin alertas de existencias. |
| `src/main/firebase/repositories/compras.repo.ts` | T1 | `marcarResumenVisto()`. |
| `src/shared/ipc-channels.ts`, `src/shared/ipc-contracts.ts`, `src/preload/api.ts`, `src/main/ipc/index.ts` | T1 | Canal `compras:marcarResumenVisto`. |
| `src/renderer/src/mock-api.ts` | T1 | El simulador arma `paquetes` igual y sin las alertas. |
| `tests/motor-real/c1-avance-paquete.test.ts` (nuevo) | T1 | Contra el emulador. |
| `src/renderer/src/components/AvancePaquete.tsx` (nuevo) | T2 | Tarjeta de avance y resumen, Windows. |
| `src/renderer/src/views/PanelView.tsx` | T2 | Inicio sin "agotados o bajos"; tarjetas de paquetes. |
| `src/renderer/src/views/InventarioView.tsx` | T2 | Abre en "A la venta"; filtros (INV-08, INV-10). |
| `src/renderer/src/views/PaquetesView.tsx` | T2 | Avance y resumen en el detalle (PAQ-15 a 18, 21). |
| `tests/interfaz-escritorio/pruebas.py` | T2 | Casos de Windows. |
| `mobile/src/components/AvancePaqueteCard.tsx` (nuevo) | T3 | Tarjeta de avance y hoja de resumen, celular. |
| `mobile/src/views/DashboardView.tsx` | T3 | Sin "Stock crítico" (CIN-01, 02, 03, 07, 09). |
| `mobile/src/views/InventoryQuickView.tsx` | T3 | Abre con lo que hay a la venta; lo vendido, dentro de su paquete. |
| `tests/interfaz/sembrar.test.ts`, `tests/interfaz/pruebas.py` | T3 | Dos paquetes sembrados; casos del celular. |
| `mobile/src/views/RegistrarPaqueteView.tsx` (nuevo) | T4 | "Llegó un paquete", en tres pasos. |
| `mobile/src/components/PiezaPaqueteSheet.tsx` (nuevo) | T4 | Hoja para agregar una pieza. |
| `mobile/src/App.tsx`, `mobile/src/views/InventoryQuickView.tsx` (sólo el botón) | T4 | Entrada a "Llegó un paquete". |
| `tests/interfaz/pruebas.py` | T4 | Caso del celular. |

T3 y T4 tocan los dos `InventoryQuickView.tsx` y `pruebas.py` del celular:
**T4 empieza cuando T3 está integrada**, o Codex les reparte las líneas antes.

---

### Tarea T1 · Núcleo: el avance de cada paquete

**Archivos:**
- Modificar: `src/shared/types.ts`
- Crear: `src/core/avance-paquete.ts`
- Crear: `tests/c1-avance-paquete.test.ts`
- Modificar: `src/main/firebase/repositories/panel.repo.ts`
- Modificar: `src/main/firebase/repositories/compras.repo.ts`
- Modificar: `src/shared/ipc-channels.ts`, `src/shared/ipc-contracts.ts`, `src/preload/api.ts`, `src/main/ipc/index.ts`
- Modificar: `src/renderer/src/mock-api.ts`
- Crear: `tests/motor-real/c1-avance-paquete.test.ts`
- Modificar: `tests/integracion.test.ts` (una prueba vieja que esperaba la alerta)

**Interfaces:**
- Consume: `Lote`, `Consumo`, `Compra`, `ProductoConStock`, `Venta`, `VentaLinea`
  (`src/shared/types.ts`); `diasEntre` (`src/core/fechas.ts`).
- Produce (lo usan T2, T3 y T4):
  - `avanceDePaquetes(compras, productos, ventas): AvancePaquete[]` en `src/core/avance-paquete.ts`.
  - `PanelData.paquetes: AvancePaquete[]` (paquetes recibidos, el más nuevo primero).
  - `ComprasRepoFirestore.marcarResumenVisto(compra_id: number): Promise<void>`.
  - `window.api.compras.marcarResumenVisto(id: number): Promise<Resultado<null>>` (Windows).

- [ ] **Paso 1: comprobar el dato del que depende todo**

Abrí `src/shared/types.ts` y confirmá que `Lote` tiene `compra_id`,
`cantidad_inicial`, `cantidad`, `vendidas`, `bajas`, `valor_usd_cents`,
`costo_vendido_usd_cents`, `ingreso_usd_cents` y `costo_unitario_usd_cents`, y
que `VentaLinea.lotes_consumidos` es `Consumo[]` con `compra_id` e
`ingreso_usd_cents`. Comprobado el 2/10 sobre producción: los 23 lotes de
PQ-0001 traen `compra_id: 1`, entraron 45 unidades, quedan 7, se vendieron 38,
y `valor + costo_vendido` suma los $370.16 del paquete. Si algo de esto no está,
parar y avisar.

- [ ] **Paso 2: los tipos**

En `src/shared/types.ts`, agregar `resumen_visto_el` a `Compra` (después de
`corregido_en`):

```ts
  /**
   * Cuándo Ross cerró el resumen de "Se vendió todo" (ISO). Mientras no lo
   * cierre, Inicio lo muestra. Lo único del avance que se guarda: el resto se
   * calcula de los lotes (`core/avance-paquete.ts`).
   */
  resumen_visto_el?: string;
```

Y antes de `export interface PanelData`:

```ts
/** Un paquete recibido: si todavía tiene unidades o ya se vendió todo. */
export type EstadoVentaPaquete = 'EN_VENTA' | 'VENDIDO';

/** Lo que queda en bodega de un paquete, por producto y talla o tono. */
export interface PiezaQueQueda {
  producto_id: number;
  nombre: string;
  variante_id: number;
  /** "M", "Rojo", "M Rojo"; nada si el producto no tiene tallas ni tonos. */
  detalle?: string;
  cantidad: number;
}

/** Una venta que todavía debe algo de lo que salió de este paquete. */
export interface DeudaDelPaquete {
  venta_id: number;
  codigo: string;
  cliente_nombre: string;
  /** La parte del saldo de la venta que corresponde a piezas de este paquete. */
  pendiente_usd_cents: number;
}

/** Un producto del paquete que se terminó, y cuántos días tardó. */
export interface VendidoRapido {
  producto_id: number;
  nombre: string;
  dias: number;
}

/** Cómo va un paquete: lo calcula `avanceDePaquetes`, no se guarda. */
export interface AvancePaquete {
  compra_id: number;
  codigo: string;
  fecha: string;
  estado: EstadoVentaPaquete;
  unidades_recibidas: number;
  unidades_vendidas: number;
  unidades_bajas: number;
  unidades_quedan: number;
  /** Lo que costaron las unidades de inventario, con flete y 7%. */
  invertido_usd_cents: number;
  /** Lo que se cobró (o se debe) por las unidades vendidas. */
  vendido_usd_cents: number;
  costo_vendido_usd_cents: number;
  ganancia_usd_cents: number;
  por_cobrar_usd_cents: number;
  cobrado_usd_cents: number;
  quedan: PiezaQueQueda[];
  deudas: DeudaDelPaquete[];
  /** Hasta tres, el más rápido primero. Sólo productos que se terminaron. */
  mas_rapidos: VendidoRapido[];
  /** Días desde que entró hasta su última venta. Sólo si está VENDIDO y se sabe. */
  dias_en_venderse?: number;
  resumen_visto_el?: string;
}
```

Y en `PanelData`, después de `total_bajo_stock`:

```ts
  /** Los paquetes recibidos, el más nuevo primero (desde la Fase C1). */
  paquetes: AvancePaquete[];
```

- [ ] **Paso 3: escribir la prueba que falla**

Crear `tests/c1-avance-paquete.test.ts`:

```ts
/**
 * Fase C1: cómo va cada paquete, calculado de los lotes.
 *
 * Hasta la 2.17 el inventario avisaba "N productos agotados" para siempre: un
 * producto que se trajo una vez y se vendió quedaba de alerta. Ahora cada
 * paquete dice cuánto vendió y cuánto queda, y cuando no le queda nada pasa a
 * VENDIDO con su resumen.
 */
import { describe, it, expect } from 'vitest';
import type { Lote, Consumo } from '../src/shared/types';
import { avanceDePaquetes, type CompraParaAvance, type ProductoParaAvance, type VentaParaAvance } from '../src/core/avance-paquete';

function lote(extra: Partial<Lote> & Pick<Lote, 'id' | 'compra_id' | 'cantidad_inicial' | 'cantidad'>): Lote {
  const vendidas = extra.vendidas ?? extra.cantidad_inicial - extra.cantidad;
  return {
    variante_id: 1,
    costo_unitario_usd_cents: 500,
    fecha: '2026-09-16',
    orden: 1,
    origen: 'PAQUETE',
    valor_usd_cents: extra.cantidad * 500,
    vendidas,
    ingreso_usd_cents: vendidas * 1000,
    costo_vendido_usd_cents: vendidas * 500,
    bajas: 0,
    ...extra,
  };
}

const pq1: CompraParaAvance = { id: 1, codigo: 'PQ-0001', fecha: '2026-09-16', estado: 'RECIBIDA', activo: true, cerrado_en: '2026-09-17T00:38:22.812Z' };
const pq2: CompraParaAvance = { id: 2, codigo: 'PQ-0002', fecha: '2026-10-05', estado: 'RECIBIDA', activo: true };

function producto(id: number, nombre: string, lotes: Lote[]): ProductoParaAvance {
  return { id, nombre, variantes: [{ id: 1, producto_id: id, existencias: 0, activo: true }], lotes };
}

function consumo(compra_id: number, cantidad: number, ingreso: number): Consumo {
  return { lote_id: `pq${compra_id}-l1`, variante_id: 1, cantidad, costo_usd_cents: cantidad * 500, ingreso_usd_cents: ingreso, fecha: '2026-09-16', orden: 1, origen: 'PAQUETE', compra_id, costo_unitario_usd_cents: 500 };
}

function venta(extra: Partial<VentaParaAvance> & Pick<VentaParaAvance, 'id' | 'fecha'>): VentaParaAvance {
  return { codigo: `V-${String(extra.id).padStart(4, '0')}`, estado: 'ENTREGADA', activo: true, total_usd_cents: 1000, saldo_usd_cents: 0, cliente_nombre: 'Ana', lineas: [], ...extra };
}

describe('el avance de un paquete', () => {
  it('cuenta lo que entró, lo vendido, lo que queda y la plata, de sus lotes', () => {
    const [a] = avanceDePaquetes(
      [pq1],
      [
        producto(10, 'Gloss', [lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 3, cantidad: 1 })]),
        producto(11, 'Termo', [lote({ id: 'pq1-l2', compra_id: 1, cantidad_inicial: 2, cantidad: 0 })]),
      ],
      []
    );
    expect(a.estado).toBe('EN_VENTA');
    expect([a.unidades_recibidas, a.unidades_vendidas, a.unidades_quedan]).toEqual([5, 4, 1]);
    // Invertido: lo que vale lo que queda más lo que costó lo vendido.
    expect(a.invertido_usd_cents).toBe(2500);
    expect(a.vendido_usd_cents).toBe(4000);
    expect(a.ganancia_usd_cents).toBe(2000);
    expect(a.quedan).toEqual([{ producto_id: 10, nombre: 'Gloss', variante_id: 1, detalle: undefined, cantidad: 1 }]);
  });

  it('sin unidades en bodega está VENDIDO, con cuánto tardó y lo que se terminó primero', () => {
    const [a] = avanceDePaquetes(
      [pq1],
      [
        producto(10, 'Gloss', [lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 3, cantidad: 0 })]),
        producto(11, 'Termo', [lote({ id: 'pq1-l2', compra_id: 1, cantidad_inicial: 1, cantidad: 0 })]),
      ],
      [
        venta({ id: 1, fecha: '2026-09-20', lineas: [{ producto_id: 11, lotes_consumidos: [consumo(1, 1, 1000)] }] }),
        venta({ id: 2, fecha: '2026-09-30', lineas: [{ producto_id: 10, lotes_consumidos: [consumo(1, 3, 3000)] }] }),
      ]
    );
    expect(a.estado).toBe('VENDIDO');
    // Entró al inventario el 17/9 (cerrado_en) y la última venta fue el 30/9.
    expect(a.dias_en_venderse).toBe(13);
    expect(a.mas_rapidos.map((r) => [r.nombre, r.dias])).toEqual([['Termo', 3], ['Gloss', 13]]);
  });

  it('un producto que vino en dos paquetes cuenta en cada uno sólo lo suyo', () => {
    const avance = avanceDePaquetes(
      [pq1, pq2],
      [producto(10, 'Gloss', [
        lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 2, cantidad: 0 }),
        lote({ id: 'pq2-l1', compra_id: 2, cantidad_inicial: 4, cantidad: 4 }),
      ])],
      []
    );
    expect(avance.map((a) => [a.codigo, a.estado, a.unidades_quedan])).toEqual([
      ['PQ-0002', 'EN_VENTA', 4],
      ['PQ-0001', 'VENDIDO', 0],
    ]);
  });

  it('la deuda de una venta se reparte según lo que salió de cada paquete', () => {
    // Venta de $30: $10 de PQ-0001 y $20 de PQ-0002; debe $15.
    const v = venta({
      id: 5, fecha: '2026-10-06', total_usd_cents: 3000, saldo_usd_cents: 1500, cliente_nombre: 'Rayza',
      lineas: [{ producto_id: 10, lotes_consumidos: [consumo(1, 1, 1000), consumo(2, 1, 2000)] }],
    });
    const avance = avanceDePaquetes(
      [pq1, pq2],
      [producto(10, 'Gloss', [
        lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 1, cantidad: 0 }),
        lote({ id: 'pq2-l1', compra_id: 2, cantidad_inicial: 2, cantidad: 1 }),
      ])],
      [v]
    );
    const de = (codigo: string) => avance.find((a) => a.codigo === codigo)!;
    expect(de('PQ-0001').deudas).toEqual([{ venta_id: 5, codigo: 'V-0005', cliente_nombre: 'Rayza', pendiente_usd_cents: 500 }]);
    expect(de('PQ-0002').por_cobrar_usd_cents).toBe(1000);
    expect(de('PQ-0001').cobrado_usd_cents).toBe(de('PQ-0001').vendido_usd_cents - 500);
  });

  it('una venta anulada no deja deuda; un borrador y un paquete sólo de encargos no aparecen', () => {
    const anulada = venta({ id: 6, fecha: '2026-09-20', estado: 'CANCELADA', saldo_usd_cents: 1000, lineas: [{ producto_id: 10, lotes_consumidos: [consumo(1, 1, 1000)] }] });
    const borrador: CompraParaAvance = { id: 3, codigo: 'PQ-0003', fecha: '2026-10-01', estado: 'BORRADOR', activo: true };
    const soloEncargos: CompraParaAvance = { id: 4, codigo: 'PQ-0004', fecha: '2026-10-02', estado: 'RECIBIDA', activo: true };
    const avance = avanceDePaquetes(
      [pq1, borrador, soloEncargos],
      [producto(10, 'Gloss', [lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 2, cantidad: 1 })])],
      [anulada]
    );
    expect(avance.map((a) => a.codigo)).toEqual(['PQ-0001']);
    expect(avance[0].deudas).toEqual([]);
  });

  it('las bajas cuentan en lo invertido y no como vendidas', () => {
    const [a] = avanceDePaquetes(
      [pq1],
      [producto(10, 'Gloss', [lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 3, cantidad: 0, vendidas: 2, bajas: 1, valor_usd_cents: 0 })])],
      []
    );
    expect([a.unidades_vendidas, a.unidades_bajas, a.estado]).toEqual([2, 1, 'VENDIDO']);
    expect(a.invertido_usd_cents).toBe(1500);
    // Un producto que se terminó sin ventas de las que se sepa la fecha no
    // entra en "lo más rápido".
    expect(a.mas_rapidos).toEqual([]);
  });
});
```

- [ ] **Paso 4: ver que falla**

Run: `npx vitest run tests/c1-avance-paquete.test.ts`
Esperado: FAIL, "Failed to resolve import ../src/core/avance-paquete".

- [ ] **Paso 5: implementar la cuenta**

Crear `src/core/avance-paquete.ts`:

```ts
/**
 * Cómo va cada paquete, calculado de los lotes (Fase C1).
 *
 * Cada lote sabe de qué paquete vino (`compra_id`), cuántas unidades
 * entraron y cuántas quedan, cuántas se vendieron y por cuánto. Con eso se
 * sabe si un paquete todavía tiene algo en bodega o si se vendió todo, sin
 * guardar ningún estado: si se anula una venta y vuelven unidades al lote, el
 * paquete vuelve a estar en venta solo.
 *
 * Reemplaza las alertas de "agotados": un producto que se trajo una vez y se
 * vendió no es un problema, es una venta. Lo que se ve es el paquete.
 *
 * `Compra.cerrado_en` es cuándo el paquete entró al inventario; acá "se vendió
 * todo" se llama VENDIDO, para no confundirlos.
 */
import type {
  AvancePaquete,
  Compra,
  DeudaDelPaquete,
  PiezaQueQueda,
  ProductoConStock,
  VendidoRapido,
  Venta,
  VentaLinea,
} from '../shared/types';
import { diasEntre } from './fechas';

export type CompraParaAvance = Pick<Compra, 'id' | 'codigo' | 'fecha' | 'estado' | 'activo'> &
  Partial<Pick<Compra, 'cerrado_en' | 'resumen_visto_el'>>;
export type ProductoParaAvance = Pick<ProductoConStock, 'id' | 'nombre' | 'variantes' | 'lotes'>;
export type VentaParaAvance = Pick<
  Venta,
  'id' | 'codigo' | 'fecha' | 'estado' | 'activo' | 'total_usd_cents' | 'saldo_usd_cents' | 'cliente_nombre'
> & { lineas?: Pick<VentaLinea, 'producto_id' | 'lotes_consumidos'>[] };

/** Desde cuándo se cuenta: el día que entró al inventario, o su fecha. */
function inicio(c: CompraParaAvance): string {
  return (c.cerrado_en ?? '').slice(0, 10) || c.fecha;
}

function detalleDe(p: ProductoParaAvance, variante_id: number): string | undefined {
  const v = p.variantes?.find((x) => x.id === variante_id);
  const texto = [v?.talla, v?.color].filter(Boolean).join(' ');
  return texto || undefined;
}

/** Lo que una venta cobró por unidades de este paquete. */
function ingresoDelPaquete(v: VentaParaAvance, compra_id: number): number {
  let total = 0;
  for (const l of v.lineas ?? []) {
    for (const c of l.lotes_consumidos ?? []) {
      if (c.compra_id === compra_id) total += c.ingreso_usd_cents ?? 0;
    }
  }
  return total;
}

/**
 * El avance de cada paquete recibido, el más nuevo primero. Los borradores, los
 * anulados y los que sólo traían encargos (sin lotes de inventario) no salen.
 *
 * `ventas` alcanza con las que tiene el panel (las de 90 días y las que deben):
 * la deuda sale de las que deben, y las fechas de "cuánto tardó" de las
 * recientes. Si la última venta de un producto es más vieja, no se inventa:
 * ese producto no entra en "lo más rápido".
 */
export function avanceDePaquetes(
  compras: readonly CompraParaAvance[],
  productos: readonly ProductoParaAvance[],
  ventas: readonly VentaParaAvance[]
): AvancePaquete[] {
  const vivas = ventas.filter((v) => v.activo !== false && v.estado !== 'CANCELADA');
  const salida: AvancePaquete[] = [];

  for (const c of compras) {
    if (c.activo === false || c.estado !== 'RECIBIDA') continue;

    let recibidas = 0;
    let quedan = 0;
    let vendidas = 0;
    let bajas = 0;
    let invertido = 0;
    let vendido = 0;
    let costoVendido = 0;
    const piezas: PiezaQueQueda[] = [];
    /** Por producto: si todos sus lotes de este paquete quedaron en cero, y cuántas vendió. */
    const porProducto = new Map<number, { agotado: boolean; vendidas: number }>();

    for (const p of productos) {
      for (const l of p.lotes ?? []) {
        if (l.compra_id !== c.id) continue;
        recibidas += l.cantidad_inicial ?? 0;
        quedan += l.cantidad ?? 0;
        vendidas += l.vendidas ?? 0;
        bajas += l.bajas ?? 0;
        invertido +=
          (l.valor_usd_cents ?? 0) + (l.costo_vendido_usd_cents ?? 0) + (l.bajas ?? 0) * (l.costo_unitario_usd_cents ?? 0);
        vendido += l.ingreso_usd_cents ?? 0;
        costoVendido += l.costo_vendido_usd_cents ?? 0;

        const previo = porProducto.get(p.id) ?? { agotado: true, vendidas: 0 };
        porProducto.set(p.id, {
          agotado: previo.agotado && (l.cantidad ?? 0) === 0,
          vendidas: previo.vendidas + (l.vendidas ?? 0),
        });

        if ((l.cantidad ?? 0) > 0) {
          const ya = piezas.find((x) => x.producto_id === p.id && x.variante_id === l.variante_id);
          if (ya) ya.cantidad += l.cantidad;
          else
            piezas.push({
              producto_id: p.id,
              nombre: p.nombre,
              variante_id: l.variante_id,
              detalle: detalleDe(p, l.variante_id),
              cantidad: l.cantidad,
            });
        }
      }
    }
    // Sin lotes de inventario: el paquete sólo traía encargos.
    if (recibidas === 0) continue;

    const deudas: DeudaDelPaquete[] = [];
    const ultimaPorProducto = new Map<number, string>();
    let ultima: string | undefined;
    for (const v of vivas) {
      for (const l of v.lineas ?? []) {
        if (!l.producto_id) continue;
        if (!(l.lotes_consumidos ?? []).some((x) => x.compra_id === c.id)) continue;
        const previa = ultimaPorProducto.get(l.producto_id);
        if (!previa || v.fecha > previa) ultimaPorProducto.set(l.producto_id, v.fecha);
        if (!ultima || v.fecha > ultima) ultima = v.fecha;
      }
      if (v.saldo_usd_cents <= 0 || v.total_usd_cents <= 0) continue;
      const ingreso = ingresoDelPaquete(v, c.id);
      if (ingreso <= 0) continue;
      const pendiente = Math.min(ingreso, Math.round((v.saldo_usd_cents * ingreso) / v.total_usd_cents));
      if (pendiente > 0) {
        deudas.push({
          venta_id: v.id,
          codigo: v.codigo,
          cliente_nombre: v.cliente_nombre || 'Mostrador',
          pendiente_usd_cents: pendiente,
        });
      }
    }
    deudas.sort((a, b) => b.pendiente_usd_cents - a.pendiente_usd_cents);
    const porCobrar = deudas.reduce((s, d) => s + d.pendiente_usd_cents, 0);

    const desde = inicio(c);
    const masRapidos: VendidoRapido[] = [];
    for (const [producto_id, info] of porProducto) {
      const fecha = ultimaPorProducto.get(producto_id);
      if (!info.agotado || info.vendidas === 0 || !fecha) continue;
      const nombre = productos.find((p) => p.id === producto_id)?.nombre ?? '';
      masRapidos.push({ producto_id, nombre, dias: Math.max(0, diasEntre(desde, fecha)) });
    }
    masRapidos.sort((a, b) => a.dias - b.dias || a.nombre.localeCompare(b.nombre));

    const estado = quedan === 0 ? 'VENDIDO' : 'EN_VENTA';
    salida.push({
      compra_id: c.id,
      codigo: c.codigo,
      fecha: c.fecha,
      estado,
      unidades_recibidas: recibidas,
      unidades_vendidas: vendidas,
      unidades_bajas: bajas,
      unidades_quedan: quedan,
      invertido_usd_cents: invertido,
      vendido_usd_cents: vendido,
      costo_vendido_usd_cents: costoVendido,
      ganancia_usd_cents: vendido - costoVendido,
      por_cobrar_usd_cents: porCobrar,
      cobrado_usd_cents: Math.max(0, vendido - porCobrar),
      quedan: piezas,
      deudas,
      mas_rapidos: masRapidos.slice(0, 3),
      dias_en_venderse: estado === 'VENDIDO' && ultima ? Math.max(0, diasEntre(desde, ultima)) : undefined,
      resumen_visto_el: c.resumen_visto_el,
    });
  }

  return salida.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.compra_id - a.compra_id);
}
```

- [ ] **Paso 6: ver que pasa**

Run: `npx vitest run tests/c1-avance-paquete.test.ts`
Esperado: PASS, 6 pruebas.

- [ ] **Paso 7: el panel devuelve `paquetes` y deja las alertas de existencias**

En `src/main/firebase/repositories/panel.repo.ts`:

1. Importar `ComprasRepoFirestore` de `./compras.repo`, `avanceDePaquetes` de
   `../../../core/avance-paquete` y el tipo `Compra`.
2. En `interface Instantanea`, agregar:

   ```ts
   /** Los paquetes, para el avance de cada uno (Fase C1). */
   compras: Compra[];
   /** Todos los productos, también los descatalogados: sus lotes cuentan en su paquete. */
   todosLosProductos: ProductoConStock[];
   ```

3. En `tomarInstantanea`, cambiar `ProductosRepoFirestore.listar()` por
   `ProductosRepoFirestore.listar({ incluirInactivos: true })`, sumar
   `ComprasRepoFirestore.listar()` al `Promise.all` (es una consulta chica: los
   paquetes son pocos y ya tiene su índice), y armar `datos` así:

   ```ts
   const datos: Instantanea = {
     productos: productos.filter((p) => p.activo !== false),
     todosLosProductos: productos,
     ventas: [...porId.values()],
     ventasRecientes: recientes,
     clientes: clientes.filter((c) => c.activo !== false),
     compras,
   };
   ```

4. En `calcularAlertas`, borrar los bloques "3. Productos agotados" y "4.
   Productos por acabarse" enteros, y renumerar el comentario siguiente. En su
   lugar, un comentario:

   ```ts
   // Desde la Fase C1 no hay alertas de existencias: un producto que se trajo
   // una vez y se vendió no es un problema. Cómo va cada paquete lo dice
   // `paquetes` (core/avance-paquete.ts).
   ```

5. En `cargar()`, agregar a lo que devuelve:

   ```ts
   paquetes: avanceDePaquetes(s.compras, s.todosLosProductos, s.ventas),
   ```

Run: `npx tsc --noEmit`. Esperado: sin errores salvo en `mock-api.ts`
(`paquetes` falta en `armarPanel`), que se arregla en el paso 10.

- [ ] **Paso 8: guardar que Ross cerró el resumen**

En `src/main/firebase/repositories/compras.repo.ts`, dentro de
`ComprasRepoFirestore`, después de `listar`:

```ts
  /**
   * Ross cerró el resumen de un paquete que se vendió todo. Sólo esa fecha:
   * no es una operación que se deshaga, y no deja evento.
   */
  static async marcarResumenVisto(compra_id: number): Promise<void> {
    const previa = await leerDoc<CompraDoc>('compras', compra_id);
    if (!previa || !previa.activo) throw new Error(`El paquete #${compra_id} no existe.`);
    await aplicarLote([
      {
        coleccion: 'compras',
        id: compra_id,
        datos: { resumen_visto_el: new Date().toISOString() },
        merge: true,
      },
    ]);
  }
```

(Si `aplicarLote` no está importado en el archivo, importarlo de `../client`
como en `productos.repo.ts`.) Las reglas de `compras` ya permiten esta
escritura: no hace falta tocar `firestore.rules`.

- [ ] **Paso 9: el canal de Windows**

- `src/shared/ipc-channels.ts`, junto a los demás de compras:
  `COMPRAS_MARCAR_RESUMEN_VISTO: 'compras:marcarResumenVisto',`
- `src/shared/ipc-contracts.ts`, dentro de `compras: { … }`:

  ```ts
      /** Ross cerró el resumen de "Se vendió todo" de un paquete. */
      marcarResumenVisto(id: number): Promise<Resultado<null>>;
  ```

- `src/preload/api.ts`, dentro de `compras: { … }`:
  `marcarResumenVisto: (id) => ipcRenderer.invoke(IPC.COMPRAS_MARCAR_RESUMEN_VISTO, id),`
- `src/main/ipc/index.ts`, junto a `COMPRAS_ARCHIVAR`:

  ```ts
  manejar(IPC.COMPRAS_MARCAR_RESUMEN_VISTO, async (id: number) => {
    await ComprasRepo.marcarResumenVisto(id);
    return null;
  });
  ```

- [ ] **Paso 10: el simulador de Windows**

En `src/renderer/src/mock-api.ts`:

1. Importar `avanceDePaquetes` de `@core/avance-paquete`.
2. En `armarPanel()`, las únicas alertas que arma son `id: 'agotados'` e
   `id: 'bajo-stock'`: dejar `alertas: [],` y agregar al objeto que devuelve
   (`conLotes` está definida más abajo en el archivo; se puede usar porque
   `armarPanel` corre después):

   ```ts
   paquetes: avanceDePaquetes(db.compras, db.productos.map(conLotes), db.ventas),
   ```

3. En `compras: { … }`, agregar:

   ```ts
   marcarResumenVisto: (id) => {
     db.compras = db.compras.map((c) => (c.id === id ? { ...c, resumen_visto_el: ahora() } : c));
     return ok(null);
   },
   ```

Run: `npx tsc --noEmit` y `npx tsc -p mobile/tsconfig.json --noEmit`. Esperado: sin errores.

- [ ] **Paso 11: la prueba contra el emulador (que falla primero)**

Crear `tests/motor-real/c1-avance-paquete.test.ts`:

```ts
/**
 * Fase C1 contra el Firestore de verdad: el panel dice cómo va cada paquete,
 * vender la última unidad lo deja VENDIDO, anular esa venta lo vuelve a poner
 * en venta, y no quedan alertas de agotados.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

describe('Fase C1: el avance de cada paquete, contra el emulador', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  async function paqueteConUnTermo() {
    const { Compras, Productos } = await repos();
    const compra = await Compras.guardar(
      {
        fecha: HOY,
        envio_total_usd_cents: 500,
        lineas: [{ descripcion: 'Termo', cantidad: 1, precio_linea_usd_cents: 2000, peso_linea_mlb: 100, destino: 'INVENTARIO' }],
      },
      g()
    );
    await Compras.recibir(compra, g());
    const termo = (await Productos.listar({})).find((p) => p.nombre === 'Termo')!;
    return { compra, termo: termo.id };
  }

  it.skipIf(!disponible)(
    'vender la última unidad deja el paquete VENDIDO y sin alerta de agotados; anularla lo reabre',
    async () => {
      const { Panel, Ventas } = await repos();
      const { compra, termo } = await paqueteConUnTermo();

      let panel = await Panel.cargar(true);
      expect(panel.paquetes.find((p) => p.compra_id === compra)?.estado).toBe('EN_VENTA');

      const venta = await Ventas.crear(
        { fecha: HOY, tipo: 'INVENTARIO', lineas: [{ producto_id: termo, cantidad: 1, precio_unitario_usd_cents: 4000 }] },
        g()
      );
      panel = await Panel.cargar(true);
      const vendido = panel.paquetes.find((p) => p.compra_id === compra)!;
      expect(vendido.estado).toBe('VENDIDO');
      expect(vendido.vendido_usd_cents).toBe(4000);
      expect(panel.alertas.map((a) => a.id)).not.toContain('agotados');

      await Ventas.cambiarEstado(venta, 'CANCELADA', g());
      panel = await Panel.cargar(true);
      expect(panel.paquetes.find((p) => p.compra_id === compra)?.estado).toBe('EN_VENTA');
    },
    60_000
  );

  it.skipIf(!disponible)('cerrar el resumen queda guardado en el paquete', async () => {
    const { Compras, Panel } = await repos();
    const { compra } = await paqueteConUnTermo();
    await Compras.marcarResumenVisto(compra);
    const panel = await Panel.cargar(true);
    expect(panel.paquetes.find((p) => p.compra_id === compra)?.resumen_visto_el).toBeTruthy();
  }, 60_000);
});
```

Run (con el emulador prendido y avisando a Codex):
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npx vitest run --config vitest.emulador.config.ts tests/motor-real/c1-avance-paquete.test.ts`
Esperado: PASS. Para verlo fallar antes, correrlo con `git stash push -- src/main/firebase/repositories/panel.repo.ts` y devolverlo con `git stash pop` (falla en `panel.paquetes` indefinido).

- [ ] **Paso 12: todo lo demás sigue pasando**

En `tests/integracion.test.ts`, la prueba `'avisa de productos por acabarse'`
esperaba la alerta que este cambio quita (comprobado al validar este plan: es
la única que falla). Cambiarla por:

```ts
  it('ya no avisa de existencias: cómo va cada paquete lo dice el panel (Fase C1)', async () => {
    await ProductosRepo.crear(
      {
        nombre: 'Crema',
        stock_minimo: 3,
        stock_inicial: { cantidad: 2, costo_unitario_usd_cents: 500 },
      },
      g()
    );

    const alertas = await PanelRepo.alertas();
    expect(alertas.some((a) => a.id === 'bajo-stock' || a.id === 'agotados')).toBe(false);
  });
```

Run: `npm test`, `npm run test:emulador`, `npm run test:interfaz-escritorio`.
Esperado: todo pasa. Si un caso de interfaz de Windows contaba con la alerta
"N productos agotados" o con "productos agotados o bajos" en Inicio, **no lo
cambies acá**: anotalo para T2, que cambia esa pantalla.

- [ ] **Paso 13: commit**

```bash
git add -- src/shared/types.ts src/core/avance-paquete.ts tests/c1-avance-paquete.test.ts src/main/firebase/repositories/panel.repo.ts src/main/firebase/repositories/compras.repo.ts src/shared/ipc-channels.ts src/shared/ipc-contracts.ts src/preload/api.ts src/main/ipc/index.ts src/renderer/src/mock-api.ts tests/motor-real/c1-avance-paquete.test.ts tests/integracion.test.ts
git commit -m "C1 · T1: el avance de cada paquete, calculado de sus lotes, y sin alertas de agotados"
```

---

### Tarea T2 · Windows: Inicio, Inventario y Paquetes

**Archivos:**
- Crear: `src/renderer/src/components/AvancePaquete.tsx`
- Modificar: `src/renderer/src/views/PanelView.tsx`
- Modificar: `src/renderer/src/views/InventarioView.tsx`
- Modificar: `src/renderer/src/views/PaquetesView.tsx`
- Modificar: `tests/interfaz-escritorio/pruebas.py`

**Interfaces:**
- Consume (de T1): `PanelData.paquetes: AvancePaquete[]`,
  `window.api.compras.marcarResumenVisto(id)`, `window.api.panel.cargar()`.
- Produce: `AvancePaqueteTarjeta` y `ResumenPaqueteVendido` (Windows).

- [ ] **Paso 1: escribir los casos que fallan**

En `tests/interfaz-escritorio/pruebas.py`, antes de `@caso("no quedan errores de consola")`:

```python
def sembrar_paquete_vendido(page: Page) -> dict:
    """Un paquete de dos productos recibido; se vende todo uno y la mitad del otro."""
    return page.evaluate("""async () => {
      const sufijo = String(Date.now() % 100000);
      const hoy = new Date().toISOString().slice(0, 10);
      const r = await window.api.compras.guardar({
        fecha: hoy, envio_total_usd_cents: 500,
        lineas: [
          { descripcion: 'Termo C1 ' + sufijo, cantidad: 1, precio_linea_usd_cents: 2000, peso_linea_mlb: 100, destino: 'INVENTARIO' },
          { descripcion: 'Gloss C1 ' + sufijo, cantidad: 2, precio_linea_usd_cents: 1000, peso_linea_mlb: 100, destino: 'INVENTARIO' },
        ],
      });
      await window.api.compras.recibir(r.data.id);
      const compra = (await window.api.compras.get(r.data.id)).data;
      const prods = (await window.api.productos.list({})).data;
      const termo = prods.find((p) => p.nombre.startsWith('Termo C1 ' + sufijo));
      await window.api.ventas.crear({ fecha: hoy, tipo: 'INVENTARIO',
        lineas: [{ producto_id: termo.id, cantidad: 1, precio_unitario_usd_cents: 4000 }] });
      return { codigo: compra.codigo, id: compra.id, termo: termo.nombre };
    }""")


@caso("C1 · Inicio no avisa de agotados: dice cómo va cada paquete")
def caso_c1_inicio(page: Page) -> list[str]:
    fallas: list[str] = []
    cerrar_ventanas(page)
    s = sembrar_paquete_vendido(page)
    recargar_datos(page)
    ir_a(page, "Inicio")
    texto = page.locator("main").inner_text()
    if re.search(r"agotad", texto, re.I):
        fallas.append("Inicio sigue hablando de productos agotados")
    if s["codigo"] not in texto:
        fallas.append(f"Inicio no muestra el avance de {s['codigo']}")
    if not re.search(r"1 de 3 vendid|1 de 3", texto):
        fallas.append("la tarjeta del paquete no dice cuántas unidades se vendieron de cuántas")
    return fallas


@caso("C1 · el Inventario abre con lo que hay a la venta")
def caso_c1_inventario(page: Page) -> list[str]:
    fallas: list[str] = []
    cerrar_ventanas(page)
    s = sembrar_paquete_vendido(page)
    recargar_datos(page)
    ir_a(page, "Inventario")
    if page.get_by_text(s["termo"]).count() > 0:
        fallas.append("el Inventario abre mostrando un producto sin unidades")
    activo = page.get_by_role("radio", name="A la venta")
    if activo.count() == 0 or activo.first.get_attribute("aria-checked") != "true":
        fallas.append("el filtro no arranca en 'A la venta'")
    return fallas
```

Run: `SOLO="C1 ·" PYTHONIOENCODING=utf-8 npm run test:interfaz-escritorio`
Esperado: los dos casos fallan (Inicio todavía dice "agotados o bajos";
el filtro arranca en "Todos").

- [ ] **Paso 2: el componente del paquete**

Crear `src/renderer/src/components/AvancePaquete.tsx` con dos componentes:

```tsx
import React from 'react';
import { Package, CheckCircle2 } from 'lucide-react';
import type { AvancePaquete } from '../../../shared/types';
import { Button, BarraProgreso } from './ui';
import { formatearMoneda } from '@core/moneda';

const $ = (c: number) => formatearMoneda(c, 'USD');

/** Una línea por paquete en venta: cuánto se vendió y cuánto se recuperó. */
export const AvancePaqueteTarjeta: React.FC<{ avance: AvancePaquete; onAbrir: () => void }> = ({ avance, onAbrir }) => (
  <button
    type="button"
    onClick={onAbrir}
    className="w-full text-left rounded-lg border border-borde bg-superficie p-3 hover:bg-superficie-2 transition-colors duration-150"
  >
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-label font-medium text-texto">
        <Package className="w-4 h-4 text-texto-3" />
        {avance.codigo}
      </span>
      <span className="text-caption text-texto-3 tabular">
        {avance.unidades_vendidas} de {avance.unidades_recibidas} vendidas · quedan {avance.unidades_quedan}
      </span>
    </div>
    <BarraProgreso
      actual={avance.unidades_vendidas}
      total={avance.unidades_recibidas}
      tono="brand"
      etiqueta={`Vendido de ${avance.codigo}`}
    />
    <p className="mt-1 text-caption text-texto-3 tabular">
      Recuperaste {$(avance.cobrado_usd_cents)} de {$(avance.invertido_usd_cents)}
    </p>
  </button>
);

/** El resumen de un paquete que se vendió todo, hasta que Ross lo cierre. */
export const ResumenPaqueteVendido: React.FC<{ avance: AvancePaquete; onListo: () => void }> = ({ avance, onListo }) => (
  <section aria-label={`${avance.codigo}: se vendió todo`} className="rounded-xl border border-success-200 bg-success-50 p-4 space-y-2">
    <div className="flex items-center gap-2 text-body font-semibold text-success-800">
      <CheckCircle2 className="w-5 h-5" />
      {avance.codigo}: se vendió todo
      {avance.dias_en_venderse !== undefined && <span className="font-normal"> en {avance.dias_en_venderse} días</span>}
    </div>
    <p className="text-label text-texto-2 tabular">
      Invertiste {$(avance.invertido_usd_cents)}, vendiste {$(avance.vendido_usd_cents)} y ganaste {$(avance.ganancia_usd_cents)}.
      {avance.por_cobrar_usd_cents > 0 && ` Falta cobrar ${$(avance.por_cobrar_usd_cents)}.`}
    </p>
    {avance.mas_rapidos.length > 0 && (
      <p className="text-label text-texto-2">
        Lo que más rápido se vendió: {avance.mas_rapidos.map((r) => `${r.nombre} (${r.dias} días)`).join(', ')}.
      </p>
    )}
    {avance.deudas.length > 0 && (
      <p className="text-label text-texto-2">
        Deben: {avance.deudas.map((d) => `${d.cliente_nombre} ${$(d.pendiente_usd_cents)} (${d.codigo})`).join(', ')}.
      </p>
    )}
    <div className="flex justify-end">
      <Button variant="secondary" size="sm" onClick={onListo}>Listo</Button>
    </div>
  </section>
);
```

Si `auditar-colores.mjs` rechaza algún par (`text-success-800` sobre
`bg-success-50`), usar el par que use `PagoModal.tsx` para "queda saldada",
que ya pasa la auditoría.

- [ ] **Paso 3: Inicio**

En `src/renderer/src/views/PanelView.tsx`:

1. Quitar la tarjeta de métricas que muestra `data.total_bajo_stock`
   (líneas ~372-385, el `StatTile` de "productos agotados o bajos") y la
   sección que lista `data.bajo_stock` (líneas ~690-745). En su lugar, una
   sección "Paquetes" que muestre, arriba, un `ResumenPaqueteVendido` por cada
   `data.paquetes` con `estado === 'VENDIDO' && !resumen_visto_el`, y debajo
   un `AvancePaqueteTarjeta` por cada `estado === 'EN_VENTA'`. "Listo" llama
   `window.api.compras.marcarResumenVisto(id)` y vuelve a cargar el panel;
   `onAbrir` lleva a Paquetes con ese paquete abierto (`onIr('paquetes', id)` o
   la navegación que use la vista; mirá cómo navega hoy el "Ver" de las
   alertas, con `destino`).
2. En el filtro de la línea ~260 (`a.id !== 'agotados' && a.id !== 'bajo-stock'`),
   esas alertas ya no existen: dejar sólo `a.severidad !== 'urgente'`.

- [ ] **Paso 4: Inventario (INV-08, INV-10)**

En `src/renderer/src/views/InventarioView.tsx`:

1. `type Filtro = 'A_LA_VENTA' | 'VENDIDOS' | 'DESCATALOGADOS' | 'TODOS';`
   (se van `BAJO_STOCK` y `AGOTADOS`; "Vendidos" es lo que antes era
   "Agotados": productos activos sin unidades).
2. El estado arranca en `'A_LA_VENTA'`. `soloConStock: filtro === 'A_LA_VENTA'`;
   `'VENDIDOS'` filtra `existencias === 0` como hacía `'AGOTADOS'`.
3. Un solo segmentado con `role="radiogroup"` y botones `role="radio"`:
   "A la venta", "Vendidos", "Descatalogados", "Todos" (INV-10 pide una sola
   forma de filtro; el selector de paquete y el de categoría quedan como
   `Select`, sin la acción "Ver los N anteriores…" adentro: si hace falta, va
   como botón al lado).
4. INV-08: las tarjetas "Invertido" y "Ganancia potencial" dejan de ser
   botones (eran botones que sólo limpiaban filtros): `div` sin `onClick`.

- [ ] **Paso 5: Paquetes (PAQ-15 a 18, 21)**

En `src/renderer/src/views/PaquetesView.tsx`:

1. Cargar `window.api.panel.cargar()` junto con la lista y guardar
   `paquetes: AvancePaquete[]`. En el detalle de un paquete recibido, arriba,
   un `AvancePaqueteTarjeta` (o el `ResumenPaqueteVendido` si está VENDIDO),
   y la lista "Queda en bodega" con `avance.quedan`.
2. PAQ-15: una sola variante de botón en la columna de acciones.
3. PAQ-16: el detalle se abre encima (panel lateral superpuesto), sin que la
   tabla pierda columnas.
4. PAQ-17: "Impuesto" con el porcentaje del paquete:
   `Math.round(tax_total_usd_cents * 1000 / subtotal_productos_usd_cents) / 10`
   ("Impuesto (7.0%)"), no el de Configuración.
5. PAQ-18: "Total pagado" en dólares, como las filas (sin córdobas debajo).
6. PAQ-21: el estado con el badge solo, sin el punto del mismo color.

- [ ] **Paso 6: ver que pasan**

Run: `SOLO="C1 ·" PYTHONIOENCODING=utf-8 npm run test:interfaz-escritorio`
Esperado: PASS. Después la suite entera: `PYTHONIOENCODING=utf-8 npm run test:interfaz-escritorio`.
Si un caso viejo buscaba "Agotados" o "productos agotados o bajos", cambiarlo a
lo nuevo ("Vendidos", la sección "Paquetes") y anotarlo en el commit.

- [ ] **Paso 7: commit**

```bash
git add -- src/renderer/src/components/AvancePaquete.tsx src/renderer/src/views/PanelView.tsx src/renderer/src/views/InventarioView.tsx src/renderer/src/views/PaquetesView.tsx tests/interfaz-escritorio/pruebas.py
git commit -m "C1 · T2: Windows dice cómo va cada paquete, sin alertas de agotados"
```

---

### Tarea T3 · Celular: Inicio e Inventario

**Archivos:**
- Crear: `mobile/src/components/AvancePaqueteCard.tsx`
- Modificar: `mobile/src/views/DashboardView.tsx`
- Modificar: `mobile/src/views/InventoryQuickView.tsx`
- Modificar: `tests/interfaz/sembrar.test.ts`, `tests/interfaz/pruebas.py`

**Interfaces:**
- Consume (de T1): `PanelData.paquetes`, `ComprasRepoFirestore.marcarResumenVisto(id)`.
- Produce: `AvancePaqueteCard`, `ResumenPaqueteSheet` (celular).

- [ ] **Paso 1: sembrar dos paquetes**

En `tests/interfaz/sembrar.test.ts`, después de crear a Ana y antes de la
venta de $100, agregar dos paquetes recibidos: **PQ con "Bolso Prueba" (1) y
"Gloss Prueba" (2)**, y **PQ con "Termo Prueba" (1)**, con `Compras.guardar` +
`Compras.recibir` como en `tests/motor-real/inventario-por-paquete.test.ts`
(`paqueteRecibido`). Vender el Termo entero (venta al contado de $40) y el
Bolso (venta al contado de $50). Cambiar `expect((await Productos.listar()).length).toBe(3)`
por `toBe(6)`. Así queda un paquete EN_VENTA (1 de 3 vendidas) y uno VENDIDO.

Correr la suite del celular entera (`PYTHONIOENCODING=utf-8 npm run test:interfaz`)
y arreglar los casos que contaban productos del catálogo: el caso "el catálogo
muestra los productos sembrados con su stock" sigue valiendo para los tres de
siempre.

- [ ] **Paso 2: escribir los casos que fallan**

En `tests/interfaz/pruebas.py`, antes de `@caso("no quedan errores de consola al recorrer la app")`:

```python
@caso("C1 · Inicio del celular dice cómo va cada paquete, sin 'Stock crítico'")
def caso_c1_inicio_celular(page: Page) -> list[str]:
    fallas = []
    ir_a(page, "Inicio")
    texto = page.locator("main").inner_text()
    if re.search(r"stock cr[ií]tico|agotad", texto, re.I):
        fallas.append("Inicio sigue mostrando stock crítico o agotados")
    if not re.search(r"1 de 3 vendid", texto):
        fallas.append("no dice cuántas se vendieron del paquete en venta")
    if "se vendió todo" not in texto.lower():
        fallas.append("no muestra el resumen del paquete que se vendió todo")
    listo = visible(page, "button", "Listo")
    if listo is None:
        fallas.append("el resumen no se puede cerrar")
    else:
        listo.click()
        page.wait_for_timeout(1200)
        if "se vendió todo" in page.locator("main").inner_text().lower():
            fallas.append("'Listo' no cierra el resumen")
    return fallas


@caso("C1 · el Inventario del celular abre con lo que hay a la venta")
def caso_c1_inventario_celular(page: Page) -> list[str]:
    fallas = []
    ir_a(page, "Catálogo")
    texto = page.locator("main").inner_text()
    if "Termo Prueba" in texto:
        fallas.append("abre mostrando un producto sin unidades")
    if "Gloss Prueba" not in texto:
        fallas.append("no muestra lo que sí hay")
    return fallas
```

(La pestaña todavía se llama "Catálogo": se renombra en C2.)

Run: `SOLO="C1 ·" PYTHONIOENCODING=utf-8 npm run test:interfaz` (con el emulador).
Esperado: los dos fallan.

- [ ] **Paso 3: la tarjeta y el resumen**

Crear `mobile/src/components/AvancePaqueteCard.tsx`:

- `AvancePaqueteCard({ avance, onAbrir })`: un `button` (no un `div` con
  `onClick`, CIN-06) con el código, "1 de 3 vendidas · quedan 2", una barra de
  progreso hecha con un `div` de ancho porcentual (sin animación al volver a
  la pantalla) y "Recuperaste $X de $Y". Tocarla abre la lista de lo que queda
  (`avance.quedan`) en una `BottomSheet`; tocar una pieza abre su ficha
  (`FichaProductoSheet`, como hace el catálogo): resuelve CIN-07.
- `ResumenPaqueteSheet` o un bloque en Inicio con el mismo contenido que
  `ResumenPaqueteVendido` de T2 (se vendió todo en N días, invertido, vendido,
  ganancia, falta cobrar, lo más rápido, quién debe) y un botón "Listo" que
  llama `ComprasRepoFirestore.marcarResumenVisto(id)` (con `haptics.impact('light')`
  antes del `await`), después `invalidarCacheDashboard()` y recarga.
- Clases sólo con tokens del celular (`bg-superficie`, `text-texto-2`,
  `border-borde`, `bg-acento-suave` con `text-acento-fuerte`); nada de
  `animate-pulse` (CIN-03); textos de 12 px o más (CIN-01).

- [ ] **Paso 4: Inicio del celular**

En `mobile/src/views/DashboardView.tsx`: borrar la tarjeta "Stock crítico"
(líneas ~397-575, con su hueco vacío, CIN-02) y el contador "N bajo" (líneas
~301-304). En su lugar, una sección "Paquetes" con los resúmenes sin cerrar
arriba y las tarjetas de los paquetes en venta debajo, desde
`panel.paquetes`. Textos según el glosario (CIN-09): "Paquetes", "quedan N en
bodega".

- [ ] **Paso 5: Inventario del celular**

En `mobile/src/views/InventoryQuickView.tsx`: la lista muestra por defecto
sólo productos con `existencias > 0`. Al elegir un paquete en los chips, se ven
también sus productos vendidos, en una sección "Vendidos" debajo, en gris y sin
"Agotado" en rojo.

- [ ] **Paso 6: ver que pasan y que la build aguanta**

Run: `SOLO="C1 ·" PYTHONIOENCODING=utf-8 npm run test:interfaz`, después la
suite entera, y `npm run build:mobile` (auditorías de colores y hooks).
Esperado: todo pasa.

- [ ] **Paso 7: commit**

```bash
git add -- mobile/src/components/AvancePaqueteCard.tsx mobile/src/views/DashboardView.tsx mobile/src/views/InventoryQuickView.tsx tests/interfaz/sembrar.test.ts tests/interfaz/pruebas.py
git commit -m "C1 · T3: el celular dice cómo va cada paquete, sin stock crítico"
```

---

### Tarea T4 · Celular: "Llegó un paquete"

**Archivos:**
- Crear: `mobile/src/views/RegistrarPaqueteView.tsx`
- Crear: `mobile/src/components/PiezaPaqueteSheet.tsx`
- Modificar: `mobile/src/App.tsx` (la vista nueva), `mobile/src/views/InventoryQuickView.tsx` (sólo el botón de entrada)
- Modificar: `tests/interfaz/pruebas.py`

**Interfaces:**
- Consume: `ComprasRepoFirestore.guardar(input: GuardarCompraInput, grupo): Promise<number>`,
  `ComprasRepoFirestore.previsualizar(input): Promise<PreviewCompra>`,
  `ComprasRepoFirestore.recibir(id, grupo): Promise<ResultadoIngreso>`,
  `ProductosRepoFirestore.listar({ incluirInactivos: true })`,
  `ProductosRepoFirestore.crear(input: CrearProductoInput, grupo): Promise<number>`
  (todo de `@repos/…`, los mismos métodos que usa la PC), `nuevoGrupoEvento()`.
- Produce: nada que usen otras tareas.

**Decisión de este plan**: en el paso "Revisar" el precio sugerido se muestra
y **no** se edita. Cambiar un precio desde el celular es de C2 ("Cambiar un
precio", desde la ficha); hacerlo dos veces sería tener dos pantallas para lo
mismo. Si Joswill lo quiere en el paquete, se suma en C2.

- [ ] **Paso 1: el caso que falla**

En `tests/interfaz/pruebas.py`, antes de `@caso("no quedan errores de consola al recorrer la app")`:

```python
@caso("C1 · 'Llegó un paquete' registra la mercadería desde el celular")
def caso_c1_llego_un_paquete(page: Page) -> list[str]:
    fallas = []
    antes = len([c for c in listar_coleccion("compras") if c.get("estado") == "RECIBIDA"])
    ir_a(page, "Catálogo")
    boton = visible(page, "button", "Llegó un paquete")
    if boton is None:
        return ["el Inventario no ofrece 'Llegó un paquete'"]
    boton.click()
    page.wait_for_timeout(800)
    # Paso 1: el paquete.
    campo_de(page, "Flete pagado").fill("10")
    visible(page, "button", "Seguir").click()
    # Paso 2: una pieza nueva.
    visible(page, "button", "Agregar pieza").click()
    page.wait_for_timeout(500)
    en_hoja(page, "input[aria-label='Producto']").fill("Cartera Llegada")
    en_hoja(page, "button", "Nuevo: Cartera Llegada").click()
    en_hoja(page, "input[aria-label='Cantidad']").fill("2")
    en_hoja(page, "input[aria-label='Pagó por unidad ($)']").fill("15")
    en_hoja(page, "button", "Agregar").click()
    cerrar_hojas(page)
    visible(page, "button", "Seguir").click()
    page.wait_for_timeout(1500)
    # Paso 3: revisar y recibir.
    texto = page.locator("main").inner_text()
    if "Cartera Llegada" not in texto:
        fallas.append("el paso de revisar no lista la pieza")
    visible(page, "button", "Recibir").click()
    page.wait_for_timeout(3000)
    recibidas = [c for c in listar_coleccion("compras") if c.get("estado") == "RECIBIDA"]
    if len(recibidas) != antes + 1:
        fallas.append("el paquete no quedó recibido")
    if not any(p.get("nombre") == "Cartera Llegada" for p in listar_coleccion("productos")):
        fallas.append("el producto nuevo no se creó")
    return fallas
```

Run: `SOLO="Llegó un paquete" PYTHONIOENCODING=utf-8 npm run test:interfaz`.
Esperado: FAIL, "el Inventario no ofrece 'Llegó un paquete'".

- [ ] **Paso 2: la hoja de una pieza**

Crear `mobile/src/components/PiezaPaqueteSheet.tsx`, sobre `BottomSheet`
(con `hayCambios`):

- Un campo "Producto" (`aria-label="Producto"`) que busca entre
  `ProductosRepoFirestore.listar({ incluirInactivos: true })` con
  `algunoContiene` (`@core/texto`), mostrando también los vendidos y los
  descatalogados ("· vendido", "· descatalogado"). Si lo escrito no coincide
  con ninguno, ofrece "Nuevo: <lo escrito>".
- Si el producto elegido tiene tallas o tonos, un selector de talla o tono
  (chips con `role="radio"`).
- "Cantidad" (`aria-label="Cantidad"`, `inputMode="numeric"`), "Pagó por
  unidad ($)" (`aria-label="Pagó por unidad ($)"`, `inputMode="decimal"`) y
  "Peso (lb)" opcional (`inputMode="decimal"`; vacío, se estima como en la PC).
- "Agregar" devuelve la línea a la vista y **deja la hoja abierta y vacía**
  para la siguiente pieza (lo frecuente en pocos toques). El error de un campo
  va en ese campo.
- La línea que devuelve es un `LineaCompraInput`:
  `{ producto_id?, variante_id?, descripcion, cantidad, precio_linea_usd_cents: unidad * cantidad, peso_linea_mlb: peso ? Math.round(peso * 1000) : null, destino: 'INVENTARIO' }`.
  Un producto nuevo va **sin** `producto_id` y con su nombre en `descripcion`:
  `recibir` lo crea, como en la PC. (Un producto nuevo con tallas o tonos
  queda para la PC en C1: el celular crea productos de una sola talla.)

- [ ] **Paso 3: la vista en tres pasos**

Crear `mobile/src/views/RegistrarPaqueteView.tsx`, pantalla completa, con un
indicador "1 de 3" arriba y "Seguir" / "Atrás" abajo (sin animar el cambio de
paso):

1. **El paquete**: fecha (hoy por defecto), "Flete pagado" ($), "Impuesto
   del recibo ($)" opcional (vacío = no hay dato, `null`), notas.
2. **Las piezas**: la lista de líneas (nombre, cantidad, lo que pagó), "Agregar
   pieza" (abre `PiezaPaqueteSheet`) y quitar una pieza con Deshacer en el
   aviso (`mostrarDeshacer` no aplica: es local; usar un "Deshacer" en la
   misma fila durante unos segundos o confirmar antes).
3. **Revisar**: `ComprasRepoFirestore.previsualizar(input)` da el costo final
   por línea; se muestra junto al precio sugerido (`precioParaCosto` de
   `@core/paquete` con los parámetros de `useDatosNegocio()`), el total y
   "Recibir".

Se guarda como borrador con `ComprasRepoFirestore.guardar({ id, ... }, nuevoGrupoEvento())`
al pasar de paso y al agregar o quitar una pieza (no por tecla); el `id` que
devuelve la primera vez se guarda en el estado. "Recibir" llama
`ComprasRepoFirestore.recibir(id, nuevoGrupoEvento())` con `haptics.impact('heavy')`
antes del `await`, después `recargarProductos(true)` y `marcarCambio()`, y
muestra una pantalla de éxito con "Listo".

En `mobile/src/App.tsx`, una vista nueva `'registrar-paquete'` como la de
`'ajustes'`; en `InventoryQuickView.tsx`, el botón "Llegó un paquete" arriba
de la lista que la abre.

- [ ] **Paso 4: ver que pasa**

Run: `SOLO="Llegó un paquete" PYTHONIOENCODING=utf-8 npm run test:interfaz`,
después la suite entera y `npm run build:mobile`. Esperado: todo pasa.

- [ ] **Paso 5: commit**

```bash
git add -- mobile/src/views/RegistrarPaqueteView.tsx mobile/src/components/PiezaPaqueteSheet.tsx mobile/src/App.tsx mobile/src/views/InventoryQuickView.tsx tests/interfaz/pruebas.py
git commit -m "C1 · T4: 'Llegó un paquete' registra la mercadería desde el celular"
```

---

## Al terminar C1 (lo hace Codex con Joswill)

1. Integrar T1 a T4 en `master`, en orden, y correr todas las suites.
2. Actualizar `docs/CONTEXTO_SESION.md` (qué cambió de comportamiento) y la
   nota de estado de C1 en `docs/AUDITORIA_UX_2026-09-29.md`.
3. Publicar sólo con el "publicalo" de Joswill, desde un worktree limpio
   (`docs/CONTEXTO_SESION.md`, sección 5, "Publicar").
