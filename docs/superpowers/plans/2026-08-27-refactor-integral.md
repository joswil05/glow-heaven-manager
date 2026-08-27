# Refactorización integral: precios, bugs e interfaz — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir la fórmula de precios que sobrecotiza al cliente en más del 100%, reparar 14 bugs (cuatro de ellos bloqueantes) y sustituir la interfaz rosa saturada por un panel de control corporativo en azul.

**Architecture:** Tres pistas secuenciales sobre el mismo repositorio. La Pista A cambia la base de la comisión y el redondeo en `src/core/precios.ts`, apaga por defecto los costos que el negocio no paga, y abre la edición de tasas por categoría. La Pista B corrige defectos sobre esa base ya correcta. La Pista C introduce una capa de tokens y una capa de primitivos, y luego migra vista por vista. El truco de secuenciación de la Pista C es que el token `glow` sobrevive como alias apuntando a la escala azul nueva, de modo que la aplicación cambia de color antes de tocar un solo `.tsx`, y el alias se elimina al final.

**Tech Stack:** Electron 34, React 18, TypeScript 5.7 (`strict`), Tailwind 3.4, better-sqlite3 11, Vitest 3, Vite 6.

**Spec:** `docs/superpowers/specs/2026-08-27-refactor-integral-design.md`

## Global Constraints

- Dinero SIEMPRE en INTEGER de centavos (`usd_cents`, `cor_cents`). Jamás float.
- Pesos en milésimas de libra (`peso_mlb`). Porcentajes en basis points (`bp`).
- El tipo de cambio se congela por documento. Nunca leer el global en históricos.
- Prorrateo: flete y casillero por PESO; aranceles y comisión por VALOR. Repartir residuos por método del mayor residuo. La suma DEBE cuadrar exacto.
- Nada se borra físicamente: `activo = 0` o estado `CANCELADO`.
- Toda mutación de datos se envuelve en `db.transaction()` y escribe en la tabla `eventos` con `evento_grupo_id` (UUID).
- La UI NUNCA muestra basis points ni centavos crudos. Montos siempre en C$ y USD juntos.
- Lenguaje sin tecnicismos en UI: español nicaragüense claro y amigable.
- SQLite solo en el proceso main. El renderer nunca toca la base de datos.
- `tsconfig.json` tiene `strict: true`, `noUnusedLocals: true` y `noUnusedParameters: true`. Todo import huérfano rompe la compilación.
- Compuertas de cada tarea: `npm test` en verde y `npm run build` sin errores.
- Las pruebas se ejecutan con `node ./scripts/run-test.js run`, no con `npx vitest` (el runner arranca vitest bajo Electron para que cargue `better-sqlite3`).

---

## Mapa de archivos

**Pista A — precios**

| Archivo | Responsabilidad |
|---|---|
| `src/core/precios.ts` (modificar) | Base de comisión sobre producto; redondeo al más cercano |
| `tests/precios.test.ts` (modificar) | Pruebas de la fórmula nueva |
| `tests/precios-escenarios.test.ts` (crear) | Los tres escenarios de referencia del spec |
| `src/main/db/migrations.ts` (modificar) | Semillas corregidas y migración `user_version = 2` |
| `src/shared/ipc-channels.ts` (modificar) | Canal `CATEGORIAS_UPDATE` |
| `src/shared/ipc-contracts.ts` (modificar) | `ActualizarCategoriasInput` |
| `src/main/db/repositories/parametros.repo.ts` (modificar) | `actualizarCategorias` transaccional con evento |
| `src/main/ipc/parametros.handler.ts` (modificar) | Handler del canal nuevo |
| `src/preload/api.ts` (modificar) | `categorias.update` |

**Pista B — bugs**

| Archivo | Responsabilidad |
|---|---|
| `src/core/estados.ts` (modificar) | `transicionesPermitidas()` y `ETIQUETAS_ESTADO_ITEM` |
| `src/core/numeros.ts` (crear) | Parseo decimal tolerante a coma, con rango |
| `tests/estados.test.ts` (modificar) | Camino completo hasta `ENTREGADO` |
| `tests/numeros.test.ts` (crear) | Pruebas del parseo |
| `src/renderer/src/views/PedidosView.tsx` (modificar) | B1, B2, B7 |
| `src/renderer/src/components/PagoModal.tsx` (modificar) | B3, B11, B12 |
| `src/renderer/src/views/ConfigView.tsx` (modificar) | B4, B6 |
| `src/renderer/src/context/ToastContext.tsx` (modificar) | B5, B9, B10 |
| `src/renderer/src/views/CotizadorView.tsx` (modificar) | B8, B14 |
| `src/renderer/src/App.tsx` (modificar) | B13 |
| `src/main/db/repositories/eventos.repo.ts` (modificar) | `deshacerGrupo(grupoId?)` |

**Pista C — interfaz**

| Archivo | Responsabilidad |
|---|---|
| `tailwind.config.js` (modificar) | Tokens de color, tipografía y radios |
| `src/renderer/src/index.css` (modificar) | Cifras tabulares y scrollbar |
| `src/renderer/src/lib/cn.ts` (crear) | Fusión de clases con clsx y tailwind-merge |
| `src/renderer/src/components/ui/*.tsx` (crear) | Nueve primitivos |
| `src/renderer/src/views/pedidos/*.tsx` (crear) | Descomposición de PedidosView |
| `src/renderer/src/views/cotizador/*.tsx` (crear) | Descomposición de CotizadorView |

---

# PISTA A — Corrección del cálculo de precios

## Task 1: La comisión se calcula sobre el precio del producto

**Files:**
- Modify: `src/core/precios.ts:160-200`
- Test: `tests/precios.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `calcularCotizacion()` conserva su firma. `CotizarItemResult.comision_calculada_cor_cents` pasa a significar comisión sobre el producto.

- [ ] **Step 1: Write the failing test**

Añadir al final de `describe` en `tests/precios.test.ts`:

```ts
  it('calcula la comisión sobre el precio del producto, no sobre el costo aterrizado', () => {
    // Producto $100.00 a tasa C$36.62 = C$3662.00. Comisión 35% = C$1281.70.
    // El flete de $6.50 y el tax NO deben entrar en la base de la comisión.
    const items: CotizarItemInput[] = [
      {
        id: 1,
        descripcion: 'Producto de referencia',
        precio_usa_usd_cents: 10000,
        peso_mlb: 1000,
        tax_rate_tienda_bp: 700,
        arancel_categoria_bp: 0,
        comision_categoria_bp: 3500,
        redondeo_categoria_cor_cents: 0,
      },
    ];

    const resultado = calcularCotizacion(items, {
      ...defaultParams,
      umbral_arancel_excedente_usd_cents: 5000,
      arancel_default_bp: 0,
    });

    expect(resultado.items[0].comision_calculada_cor_cents).toBe(128170);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ./scripts/run-test.js run tests/precios.test.ts`
Expected: FAIL. El valor recibido será mayor (la comisión hoy incluye tax y flete en la base).

- [ ] **Step 3: Write minimal implementation**

En `src/core/precios.ts`, dentro de `itemsConCostos`, sustituir el cálculo de `comision_propia_cor`:

```ts
  // 4. Costo aterrizado y Comisión
  const itemsConCostos = itemsConTax.map((item) => {
    const flete_item = fleteReparto.get(item.id) || 0;
    const otros_costos_item = otrosCostosReparto.get(item.id) || 0;
    const arancel_item = arancelReparto.get(item.id) || 0;
    const costo_aterrizado =
      item.compras_usd_cents + flete_item + otros_costos_item + arancel_item;

    const costo_cor_cents = Math.round(
      (costo_aterrizado * params.tasa_cambio_cents) / 100
    );

    // La comisión gana sobre el precio del producto en tienda.
    // Tax, flete, casillero y arancel se trasladan al cliente a costo, sin marcar.
    const producto_cor_cents = Math.round(
      (item.precio_usa_usd_cents * params.tasa_cambio_cents) / 100
    );
    const comision_propia_cor = Math.round(
      (producto_cor_cents * item.comision_categoria_bp) / 10000
    );

    return {
      ...item,
      flete_item,
      otros_costos_item,
      arancel_item,
      costo_aterrizado,
      costo_cor_cents,
      comision_propia_cor,
    };
  });
```

- [ ] **Step 4: Separar las dos bases de valor**

`basesValor` se usa hoy para dos repartos distintos que ahora divergen: el arancel se reparte por valor aduanero (producto más tax) y el complemento de comisión mínima por valor de producto. En `src/core/precios.ts`, sustituir la única declaración de `basesValor` por dos, y actualizar sus usos.

Reemplazar la línea que declara `basesValor` (justo antes de `arancelReparto`) por:

```ts
  // Base para el arancel: valor aduanero, producto más tax
  const basesValorAduanero = itemsConTax.map((i) => ({
    id: i.id,
    base_valor: i.compras_usd_cents,
  }));

  // Base para el complemento de comisión mínima: solo el precio del producto
  const basesValorProducto = itemsConTax.map((i) => ({
    id: i.id,
    base_valor: i.precio_usa_usd_cents,
  }));
```

Cambiar `const arancelReparto = repartirMayorResiduo(arancelTotal, basesValor);` por:

```ts
  const arancelReparto = repartirMayorResiduo(arancelTotal, basesValorAduanero);
```

Cambiar `const repartoDiferencia = repartirMayorResiduo(diferenciaComision, basesValor);` por:

```ts
    const repartoDiferencia = repartirMayorResiduo(diferenciaComision, basesValorProducto);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node ./scripts/run-test.js run`
Expected: PASS en las 33 pruebas. Si `cotizador-liquidacion.test.ts` falla por desviación, no lo toques todavía: la Task 3 lo recalibra.

- [ ] **Step 6: Commit**

```bash
git add src/core/precios.ts tests/precios.test.ts
git commit -m "fix(precios): calcular la comision sobre el producto y no sobre el costo aterrizado"
```

---

## Task 2: El redondeo va al múltiplo más cercano

**Files:**
- Modify: `src/core/precios.ts:210-220`
- Test: `tests/precios.test.ts`

**Interfaces:**
- Consumes: `calcularCotizacion()` de la Task 1.
- Produces: `precio_final_cor_cents` redondeado con `Math.round`, nunca por debajo de un múltiplo cuando el bruto es positivo.

- [ ] **Step 1: Write the failing test**

Sustituir la prueba existente `'redondea el precio final en córdobas al múltiplo configurado hacia arriba'` en `tests/precios.test.ts` por estas dos:

```ts
  it('redondea el precio final al múltiplo más cercano, hacia abajo cuando corresponde', () => {
    // Producto $50.00 = C$1831.00, comisión 35% = C$640.85, sin tax, flete ni arancel.
    // Bruto = C$2471.85. Al múltiplo de C$50 más cercano: C$2450.00 (no C$2500.00).
    const items: CotizarItemInput[] = [
      {
        id: 1,
        descripcion: 'Perfume',
        precio_usa_usd_cents: 5000,
        peso_mlb: 1000,
        tax_rate_tienda_bp: 0,
        arancel_categoria_bp: 0,
        comision_categoria_bp: 3500,
        redondeo_categoria_cor_cents: 5000,
      },
    ];

    const resultado = calcularCotizacion(items, {
      ...defaultParams,
      tarifa_flete_cents_lb: 0,
      arancel_default_bp: 0,
      comision_minima_cotizacion_cor_cents: 0,
    });

    expect(resultado.items[0].precio_final_cor_cents).toBe(245000);
  });

  it('nunca redondea a cero un precio positivo', () => {
    const items: CotizarItemInput[] = [
      {
        id: 1,
        descripcion: 'Muestra diminuta',
        precio_usa_usd_cents: 1,
        peso_mlb: 1,
        tax_rate_tienda_bp: 0,
        arancel_categoria_bp: 0,
        comision_categoria_bp: 0,
        redondeo_categoria_cor_cents: 5000,
      },
    ];

    const resultado = calcularCotizacion(items, {
      ...defaultParams,
      tarifa_flete_cents_lb: 0,
      arancel_default_bp: 0,
      comision_minima_cotizacion_cor_cents: 0,
    });

    expect(resultado.items[0].precio_final_cor_cents).toBe(5000);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node ./scripts/run-test.js run tests/precios.test.ts`
Expected: FAIL. La primera recibe 250000 en lugar de 245000 porque `Math.ceil` siempre sube.

- [ ] **Step 3: Write minimal implementation**

En `src/core/precios.ts`, dentro de `itemsResultado`, sustituir el bloque del redondeo:

```ts
    const precio_sin_redondeo_cor = item.costo_cor_cents + comision_cor;
    const redondeo = item.redondeo_categoria_cor_cents || 0;

    // Al múltiplo más cercano. Un precio positivo nunca se redondea a cero.
    let precio_final_cor = precio_sin_redondeo_cor;
    if (redondeo > 0) {
      precio_final_cor = Math.round(precio_sin_redondeo_cor / redondeo) * redondeo;
      if (precio_final_cor === 0 && precio_sin_redondeo_cor > 0) {
        precio_final_cor = redondeo;
      }
    }
```

Nota: el valor por defecto de `redondeo` pasa de `5000` a `0`. Un ítem sin redondeo configurado deja de recibir un múltiplo de C$50 sorpresa; la categoría siempre trae el suyo desde la base de datos.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node ./scripts/run-test.js run tests/precios.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/precios.ts tests/precios.test.ts
git commit -m "fix(precios): redondear al multiplo mas cercano en vez de siempre hacia arriba"
```

---

## Task 3: Fijar los tres escenarios de referencia como prueba

**Files:**
- Create: `tests/precios-escenarios.test.ts`
- Modify: `tests/cotizador-liquidacion.test.ts`

**Interfaces:**
- Consumes: `calcularCotizacion()` con los cambios de las Tasks 1 y 2.
- Produces: prueba de regresión que fija los precios acordados en el spec, sección 2.4.

- [ ] **Step 1: Write the test**

Crear `tests/precios-escenarios.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  calcularCotizacion,
  CotizarItemInput,
  ParametrosEntidadesCotizacion,
} from '@core/precios';

/**
 * Escenarios de referencia acordados en
 * docs/superpowers/specs/2026-08-27-refactor-integral-design.md seccion 2.4.
 *
 * Costos reales del negocio: producto + 7% tax de tienda + flete por libra.
 * Sin casillero fijo y sin arancel de aduana.
 */
const PARAMS_REALES: ParametrosEntidadesCotizacion = {
  tasa_cambio_cents: 3662,
  tarifa_flete_cents_lb: 650,
  flete_minimo_usd_cents: 0,
  otros_costos_fijos_usd_cents: 0,
  umbral_arancel_excedente_usd_cents: 5000,
  arancel_default_bp: 0,
  tax_usa_default_bp: 700,
  comision_minima_cotizacion_cor_cents: 30000,
  anticipo_default_bp: 5000,
};

const PERFUME: CotizarItemInput = {
  id: 1,
  descripcion: 'Perfume',
  precio_usa_usd_cents: 12800,
  peso_mlb: 1500,
  tax_rate_tienda_bp: 700,
  arancel_categoria_bp: 0,
  comision_categoria_bp: 3500,
  redondeo_categoria_cor_cents: 5000,
};

describe('Escenarios de referencia de precios', () => {
  it('A. Un perfume de $128 y 1.5 lb se cotiza en C$7,000', () => {
    const r = calcularCotizacion([PERFUME], PARAMS_REALES);

    expect(r.totales.tax_usa_total_usd_cents).toBe(896);
    expect(r.totales.flete_estimado_total_usd_cents).toBe(975);
    expect(r.totales.otros_costos_estimados_total_usd_cents).toBe(0);
    expect(r.totales.arancel_estimado_total_usd_cents).toBe(0);
    expect(r.totales.total_final_cor_cents).toBe(700000);
  });

  it('B. Un labial de $20 y 0.3 lb se cotiza en C$1,150 y respeta la comisión mínima', () => {
    const labial: CotizarItemInput = {
      id: 1,
      descripcion: 'Labial',
      precio_usa_usd_cents: 2000,
      peso_mlb: 300,
      tax_rate_tienda_bp: 700,
      arancel_categoria_bp: 0,
      comision_categoria_bp: 3500,
      redondeo_categoria_cor_cents: 5000,
    };

    const r = calcularCotizacion([labial], PARAMS_REALES);

    expect(r.totales.comision_total_cor_cents).toBe(30000);
    expect(r.totales.total_final_cor_cents).toBe(115000);
  });

  it('C. Tres ítems mezclados se cotizan en C$14,350', () => {
    const items: CotizarItemInput[] = [
      PERFUME,
      {
        id: 2,
        descripcion: 'Tenis',
        precio_usa_usd_cents: 9000,
        peso_mlb: 2500,
        tax_rate_tienda_bp: 700,
        arancel_categoria_bp: 0,
        comision_categoria_bp: 2500,
        redondeo_categoria_cor_cents: 10000,
      },
      {
        id: 3,
        descripcion: 'Base de maquillaje',
        precio_usa_usd_cents: 4500,
        peso_mlb: 500,
        tax_rate_tienda_bp: 700,
        arancel_categoria_bp: 0,
        comision_categoria_bp: 3500,
        redondeo_categoria_cor_cents: 5000,
      },
    ];

    const r = calcularCotizacion(items, PARAMS_REALES);

    expect(r.totales.total_final_cor_cents).toBe(1435000);
    // El reparto del flete debe sumar exacto al total
    const sumaFlete = r.items.reduce((a, i) => a + i.flete_estimado_usd_cents, 0);
    expect(sumaFlete).toBe(r.totales.flete_estimado_total_usd_cents);
  });

  it('el arancel sigue funcionando cuando se enciende', () => {
    const r = calcularCotizacion([{ ...PERFUME, arancel_categoria_bp: 3500 }], {
      ...PARAMS_REALES,
      arancel_default_bp: 3500,
    });

    // Excedente sobre $50 del valor aduanero ($128 + $8.96 = $136.96) por 35%
    expect(r.totales.arancel_estimado_total_usd_cents).toBe(3044);
  });
});
```

- [ ] **Step 2: Run the test**

Run: `node ./scripts/run-test.js run tests/precios-escenarios.test.ts`
Expected: PASS. Si algún total difiere, no ajustes el número esperado: revisa la implementación de las Tasks 1 y 2, porque estos valores salen de la fórmula acordada en el spec.

- [ ] **Step 3: Recalibrar la prueba de consistencia cotizador contra liquidación**

`tests/cotizador-liquidacion.test.ts` compara el estimado del cotizador con la liquidación real de un lote. Al quitar casillero y arancel del estimado por defecto, la desviación cambia. Abrir el archivo y ajustar **solo el bloque de parámetros** para que el estimado siga modelando el mismo lote que la liquidación: mantener `otros_costos_fijos_usd_cents` y los `arancel_categoria_bp` en los valores que el lote real cobra, porque esa prueba compara contra costos realmente incurridos.

No cambiar el umbral de tolerancia para hacerla pasar. Si falla, el problema está en la fórmula.

- [ ] **Step 4: Run the full suite**

Run: `node ./scripts/run-test.js run`
Expected: PASS en todas.

- [ ] **Step 5: Commit**

```bash
git add tests/precios-escenarios.test.ts tests/cotizador-liquidacion.test.ts
git commit -m "test(precios): fijar los escenarios de referencia del spec"
```

---

## Task 4: Semillas corregidas y migración a user_version 2

**Files:**
- Modify: `src/main/db/migrations.ts`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: base de datos nueva con casillero, flete mínimo y aranceles en cero. Base de datos existente actualizada solo donde el operador no haya cambiado el valor.

- [ ] **Step 1: Write the failing test**

Añadir a `tests/smoke.test.ts`, dentro del `describe` existente:

```ts
  it('siembra los costos que el negocio no paga en cero', () => {
    const params = ParametrosRepo.getParametros();

    expect(params.otros_costos_fijos_usd_cents).toBe(0);
    expect(params.flete_minimo_usd_cents).toBe(0);
    expect(params.arancel_default_bp).toBe(0);

    const categorias = ParametrosRepo.getCategorias();
    expect(categorias.length).toBeGreaterThan(0);
    for (const cat of categorias) {
      expect(cat.arancel_estimado_bp).toBe(0);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ./scripts/run-test.js run tests/smoke.test.ts`
Expected: FAIL con `expected 1000 to be 0`.

- [ ] **Step 3: Corregir las semillas de la migración 1**

En `src/main/db/migrations.ts`, cambiar `if (currentVersion === 0) {` por `if (currentVersion < 1) {`, y dentro de ese bloque cambiar estas seis líneas:

```ts
      insertCat.run('Perfumería', 3500, 0, 5000);
      insertCat.run('Maquillaje', 3500, 0, 5000);
      insertCat.run('Skincare', 3000, 0, 5000);
      insertCat.run('Calzado', 2500, 0, 10000);
      insertCat.run('Accesorios', 3000, 0, 5000);
```

y estas tres:

```ts
      insertParam.run('flete_minimo_usd_cents', '0', 'integer', 'Flete mínimo por paquete (0 = solo cobra por libra)');
      insertParam.run('otros_costos_fijos_usd_cents', '0', 'integer', 'Casillero y handling fijo por envío USD');
      insertParam.run('arancel_default_bp', '0', 'integer', 'Arancel de aduana por defecto (0 = no se cobra)');
```

- [ ] **Step 4: Añadir la migración 2**

Al final de `runMigrations`, después del bloque de la versión 1:

```ts
  if (currentVersion < 2) {
    // Migración 2: apagar los costos que el negocio no incurre.
    // Solo se toca lo que siga en el valor sembrado originalmente: una
    // configuración que el operador ya ajustó a mano no se sobrescribe.
    db.transaction(() => {
      const apagarSiEsSemilla = db.prepare(`
        UPDATE parametros
        SET valor = '0', actualizado_en = CURRENT_TIMESTAMP
        WHERE clave = ? AND valor = ?
      `);
      apagarSiEsSemilla.run('otros_costos_fijos_usd_cents', '1000');
      apagarSiEsSemilla.run('flete_minimo_usd_cents', '1500');
      apagarSiEsSemilla.run('arancel_default_bp', '3000');

      db.prepare(`
        UPDATE categorias
        SET arancel_estimado_bp = 0
        WHERE arancel_estimado_bp IN (3000, 3500)
      `).run();

      db.pragma('user_version = 2');
    })();
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node ./scripts/run-test.js run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/db/migrations.ts tests/smoke.test.ts
git commit -m "fix(db): apagar casillero, flete minimo y arancel que el negocio no paga"
```

---

## Task 5: Canal IPC para editar categorías

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/ipc-contracts.ts`
- Modify: `src/main/db/repositories/parametros.repo.ts`
- Modify: `src/main/ipc/parametros.handler.ts`
- Modify: `src/preload/api.ts`

**Interfaces:**
- Consumes: `ParametrosRepo`, `EventosRepo.registrarEvento`.
- Produces: `window.api.categorias.update(cambios: CategoriaCambio[]): Promise<IpcResult<void>>` donde `CategoriaCambio = { id: number; comision_defecto_bp: number; arancel_estimado_bp: number; redondeo_cor_cents: number }`. Lo consume la Task 20.

- [ ] **Step 1: Añadir el canal**

En `src/shared/ipc-channels.ts`, bajo el comentario `// Categorías y Tiendas`:

```ts
  CATEGORIAS_LIST: 'categorias:list',
  CATEGORIAS_UPDATE: 'categorias:update',
  TIENDAS_LIST: 'tiendas:list',
```

- [ ] **Step 2: Añadir el contrato**

En `src/shared/ipc-contracts.ts`, junto a los demás inputs:

```ts
export interface CategoriaCambio {
  id: number;
  comision_defecto_bp: number;
  arancel_estimado_bp: number;
  redondeo_cor_cents: number;
}

export interface ActualizarCategoriasInput {
  cambios: CategoriaCambio[];
}
```

- [ ] **Step 3: Añadir el método del repositorio**

En `src/main/db/repositories/parametros.repo.ts`, importar `EventosRepo` arriba:

```ts
import { EventosRepo } from './eventos.repo';
```

y añadir el método dentro de la clase:

```ts
  static actualizarCategorias(
    cambios: CategoriaCambio[],
    evento_grupo_id: string
  ): void {
    const db = getDb();
    db.transaction(() => {
      const leer = db.prepare('SELECT * FROM categorias WHERE id = ?');
      const escribir = db.prepare(`
        UPDATE categorias
        SET comision_defecto_bp = ?, arancel_estimado_bp = ?, redondeo_cor_cents = ?
        WHERE id = ?
      `);

      for (const c of cambios) {
        const anterior = leer.get(c.id) as
          | {
              nombre: string;
              comision_defecto_bp: number;
              arancel_estimado_bp: number;
              redondeo_cor_cents: number;
            }
          | undefined;
        if (!anterior) throw new Error(`Categoría #${c.id} no encontrada`);

        escribir.run(
          c.comision_defecto_bp,
          c.arancel_estimado_bp,
          c.redondeo_cor_cents,
          c.id
        );

        EventosRepo.registrarEvento({
          evento_grupo_id,
          entidad_tipo: 'CATEGORIA',
          entidad_id: c.id,
          tipo_evento: 'ACTUALIZACION',
          valor_anterior: {
            comision_defecto_bp: anterior.comision_defecto_bp,
            arancel_estimado_bp: anterior.arancel_estimado_bp,
            redondeo_cor_cents: anterior.redondeo_cor_cents,
          },
          valor_nuevo: {
            comision_defecto_bp: c.comision_defecto_bp,
            arancel_estimado_bp: c.arancel_estimado_bp,
            redondeo_cor_cents: c.redondeo_cor_cents,
          },
          detalle: `Tasas de la categoría '${anterior.nombre}' actualizadas`,
        });
      }
    })();
  }
```

Añadir `CategoriaCambio` al import de tipos desde `../../../shared/ipc-contracts`.

- [ ] **Step 4: Añadir el handler**

En `src/main/ipc/parametros.handler.ts`, importar `crypto` y el tipo, y registrar el canal junto a `CATEGORIAS_LIST`:

```ts
  ipcMain.handle(
    IPC_CHANNELS.CATEGORIAS_UPDATE,
    async (_, input: ActualizarCategoriasInput): Promise<IpcResult<void>> => {
      try {
        const grupoId = crypto.randomUUID();
        ParametrosRepo.actualizarCategorias(input.cambios, grupoId);
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );
```

- [ ] **Step 5: Exponer en el preload**

En `src/preload/api.ts`, ampliar el bloque `categorias`:

```ts
  categorias: {
    list: (): Promise<IpcResult<Categoria[]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORIAS_LIST),
    update: (cambios: CategoriaCambio[]): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.CATEGORIAS_UPDATE, { cambios }),
  },
```

Añadir `CategoriaCambio` al import de tipos del archivo.

- [ ] **Step 6: Write the test**

Añadir a `tests/smoke.test.ts`:

```ts
  it('permite actualizar las tasas de una categoría y registra el evento', () => {
    const categorias = ParametrosRepo.getCategorias();
    const perfumeria = categorias.find((c) => c.nombre === 'Perfumería');
    expect(perfumeria).toBeDefined();

    ParametrosRepo.actualizarCategorias(
      [
        {
          id: perfumeria!.id,
          comision_defecto_bp: 2000,
          arancel_estimado_bp: 0,
          redondeo_cor_cents: 5000,
        },
      ],
      crypto.randomUUID()
    );

    const despues = ParametrosRepo.getCategorias().find((c) => c.id === perfumeria!.id);
    expect(despues!.comision_defecto_bp).toBe(2000);
  });
```

- [ ] **Step 7: Run tests and build**

Run: `node ./scripts/run-test.js run` y luego `npm run build`
Expected: PASS y compilación sin errores.

- [ ] **Step 8: Commit**

```bash
git add src/shared src/main src/preload tests/smoke.test.ts
git commit -m "feat(categorias): canal IPC para editar comision, arancel y redondeo por categoria"
```

---

# PISTA B — Corrección de bugs

## Task 6: Los estados del menú salen de la máquina de estados (B1, B2)

**Files:**
- Modify: `src/core/estados.ts`
- Modify: `src/renderer/src/views/PedidosView.tsx:283-300`
- Test: `tests/estados.test.ts`

**Interfaces:**
- Consumes: `TRANSICIONES_VALIDAS_ITEM` (ya existe, privado).
- Produces: `transicionesPermitidas(actual: EstadoItem): EstadoItem[]` y `ETIQUETAS_ESTADO_ITEM: Record<EstadoItem, string>`. Los consume la Task 17.

- [ ] **Step 1: Write the failing test**

Añadir a `tests/estados.test.ts`:

```ts
import { transicionesPermitidas, ETIQUETAS_ESTADO_ITEM } from '../src/core/estados';
import type { EstadoItem } from '../src/shared/types';

describe('exposición de la máquina de estados a la interfaz', () => {
  it('existe un camino completo de PENDIENTE_ANTICIPO a ENTREGADO', () => {
    const camino: EstadoItem[] = [
      'PENDIENTE_ANTICIPO',
      'ANTICIPO_OK',
      'EN_LISTA_USA',
      'COMPRADO',
      'EN_TRANSITO',
      'EN_NICARAGUA',
      'LISTO_ENTREGA',
      'ENTREGADO',
    ];

    for (let i = 0; i < camino.length - 1; i++) {
      expect(transicionesPermitidas(camino[i])).toContain(camino[i + 1]);
    }
  });

  it('todo estado alcanzable tiene etiqueta en español', () => {
    const estados = Object.keys(ETIQUETAS_ESTADO_ITEM) as EstadoItem[];
    for (const estado of estados) {
      expect(ETIQUETAS_ESTADO_ITEM[estado].length).toBeGreaterThan(0);
      for (const destino of transicionesPermitidas(estado)) {
        expect(ETIQUETAS_ESTADO_ITEM[destino]).toBeDefined();
      }
    }
  });

  it('devuelve lista vacía para un estado terminal', () => {
    expect(transicionesPermitidas('CERRADO')).toEqual([]);
    expect(transicionesPermitidas('CANCELADO')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node ./scripts/run-test.js run tests/estados.test.ts`
Expected: FAIL con error de importación, `transicionesPermitidas` no existe.

- [ ] **Step 3: Exportar desde el core**

Al final de `src/core/estados.ts`:

```ts
/**
 * Etiquetas en español para cada estado del ítem.
 * Única fuente del texto que ve el usuario: la interfaz nunca escribe estos
 * nombres a mano, para que un estado nuevo no pueda quedar sin traducir.
 */
export const ETIQUETAS_ESTADO_ITEM: Record<EstadoItem, string> = {
  COTIZADO: 'Cotizado',
  PENDIENTE_ANTICIPO: 'Anticipo pendiente',
  ANTICIPO_OK: 'Anticipo recibido',
  EN_LISTA_USA: 'En lista de compras USA',
  COMPRADO: 'Comprado en USA',
  EN_TRANSITO: 'En tránsito a Nicaragua',
  EN_NICARAGUA: 'En Nicaragua',
  LISTO_ENTREGA: 'Listo para entregar',
  ENTREGADO: 'Entregado al cliente',
  CERRADO: 'Cerrado',
  NO_DISPONIBLE: 'No disponible (agotado)',
  CAMBIO_PRECIO: 'Cambió de precio en USA',
  SUSTITUTO_PROPUESTO: 'Sustituto propuesto',
  ABANDONADO: 'Abandonado por el cliente',
  DEVUELTO: 'Devuelto',
  CANCELADO: 'Cancelado',
};

/**
 * Transiciones legales desde un estado. La interfaz construye su menú con
 * esto, de modo que no pueda ofrecer un cambio que el validador rechazará.
 */
export function transicionesPermitidas(actual: EstadoItem): EstadoItem[] {
  return TRANSICIONES_VALIDAS_ITEM[actual] ?? [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node ./scripts/run-test.js run tests/estados.test.ts`
Expected: PASS

- [ ] **Step 5: Reemplazar el menú de PedidosView**

En `src/renderer/src/views/PedidosView.tsx`, añadir al bloque de imports:

```tsx
import { transicionesPermitidas, ETIQUETAS_ESTADO_ITEM } from '@core/estados';
```

Sustituir el `<select>` de estado del ítem y sus once `<option>` codificados a mano por:

```tsx
                            <div className="flex items-center gap-2">
                              <span className="text-label text-slate-500">Estado:</span>
                              <select
                                value=""
                                onChange={(e) => {
                                  if (!e.target.value) return;
                                  handleCambiarEstadoItem(
                                    item.id,
                                    e.target.value as EstadoItem
                                  );
                                }}
                                className="text-label bg-white px-2.5 py-1 rounded-md border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                              >
                                <option value="">
                                  {ETIQUETAS_ESTADO_ITEM[item.estado]}
                                </option>
                                {transicionesPermitidas(item.estado).map((destino) => (
                                  <option key={destino} value={destino}>
                                    Pasar a: {ETIQUETAS_ESTADO_ITEM[destino]}
                                  </option>
                                ))}
                              </select>
                            </div>
```

El `value=""` con una primera opción que muestra el estado actual convierte el control en un selector de acción, no de valor. Así el usuario ve dónde está y solo puede elegir a dónde puede ir.

El cast `as EstadoItem` sigue presente pero ahora es seguro: el valor solo puede venir de `transicionesPermitidas`, que devuelve `EstadoItem[]`.

- [ ] **Step 6: Verify the build**

Run: `npm run build`
Expected: compilación sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/core/estados.ts src/renderer/src/views/PedidosView.tsx tests/estados.test.ts
git commit -m "fix(pedidos): derivar el menu de estados de la maquina de estados"
```

---

## Task 7: El pago no se marca como verificado por defecto (B3)

**Files:**
- Modify: `src/renderer/src/components/PagoModal.tsx:36`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Cambiar el valor inicial**

En `src/renderer/src/components/PagoModal.tsx`, sustituir:

```tsx
  const [verificado, setVerificado] = useState(true);
```

por:

```tsx
  // Arranca en falso a propósito. Marcar un pago como verificado desbloquea
  // la compra en USA; tiene que ser un acto deliberado, no el valor por defecto.
  const [verificado, setVerificado] = useState(false);
```

- [ ] **Step 2: Reforzar el texto de la casilla**

Localizar el bloque de la casilla de verificación y cambiar su etiqueta para que el efecto quede explícito:

```tsx
              <span className="font-semibold text-slate-800">
                Ya confirmé este pago en mi cuenta bancaria
              </span>
              <p className="text-caption text-slate-500">
                Solo marcá esto si viste el dinero en el banco. Un anticipo
                verificado desbloquea la compra del producto en USA.
              </p>
```

- [ ] **Step 3: Verify manually**

Run: `npm run dev`
Abrir un pedido, pulsar Cobrar. Confirmar que la casilla arranca desmarcada y que el pedido sigue bloqueado hasta marcarla.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/PagoModal.tsx
git commit -m "fix(pagos): no marcar el pago como verificado por defecto"
```

---

## Task 8: Parseo numérico tolerante a coma decimal (B4)

**Files:**
- Create: `src/core/numeros.ts`
- Create: `tests/numeros.test.ts`
- Modify: `src/renderer/src/views/ConfigView.tsx:66-80`

**Interfaces:**
- Consumes: nada.
- Produces: `parsearDecimal(texto: string): number | null` y `parsearACentavos(texto: string, opciones?: { min?: number; max?: number }): number | null`. Los consume la Task 20.

- [ ] **Step 1: Write the failing test**

Crear `tests/numeros.test.ts`:

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

- [ ] **Step 2: Run test to verify it fails**

Run: `node ./scripts/run-test.js run tests/numeros.test.ts`
Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Write the implementation**

Crear `src/core/numeros.ts`:

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
  // Number('') es 0 y Number('Infinity') es Infinity: ambos hay que rechazarlos
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

- [ ] **Step 4: Run test to verify it passes**

Run: `node ./scripts/run-test.js run tests/numeros.test.ts`
Expected: PASS

- [ ] **Step 5: Usarlo en ConfigView**

En `src/renderer/src/views/ConfigView.tsx`, importar:

```tsx
import { parsearACentavos } from '@core/numeros';
```

Sustituir el bloque de ocho `parseFloat` dentro de `handleSave` por un parseo validado que aborte antes de escribir:

```tsx
      const campos: { clave: string; texto: string; min: number; max?: number }[] = [
        { clave: 'tasa_cambio_oficial_cents', texto: tasaCambio, min: 1, max: 1000 },
        { clave: 'tarifa_flete_cents_lb', texto: tarifaFlete, min: 0, max: 1000 },
        { clave: 'flete_minimo_usd_cents', texto: fleteMinimo, min: 0, max: 1000 },
        { clave: 'otros_costos_fijos_usd_cents', texto: otrosCostosFijos, min: 0, max: 1000 },
        { clave: 'umbral_arancel_excedente_usd_cents', texto: umbralArancel, min: 0, max: 100000 },
        { clave: 'comision_minima_cotizacion_cor_cents', texto: comisionMinima, min: 0, max: 1000000 },
      ];

      const valores: Record<string, string> = {};
      for (const campo of campos) {
        const centavos = parsearACentavos(campo.texto, { min: campo.min, max: campo.max });
        if (centavos === null) {
          showToast({
            message: `Revisá el campo "${campo.clave}": escribí solo números, por ejemplo 36.62`,
            type: 'error',
          });
          setGuardando(false);
          return;
        }
        valores[campo.clave] = centavos.toString();
      }

      // Los porcentajes se guardan en basis points: 32.5 por ciento son 3250 bp,
      // que es exactamente el resultado de parsearACentavos.
      const arancelBp = parsearACentavos(arancelDefault, { min: 0, max: 100 });
      const anticipoBp = parsearACentavos(anticipoDefault, { min: 0, max: 100 });
      if (arancelBp === null || anticipoBp === null) {
        showToast({
          message: 'El arancel y el anticipo deben ser porcentajes entre 0 y 100.',
          type: 'error',
        });
        setGuardando(false);
        return;
      }
      valores['arancel_default_bp'] = arancelBp.toString();
      valores['anticipo_default_bp'] = anticipoBp.toString();
      valores['cuentas_bancarias'] = JSON.stringify(cuentas);
```

El `Promise.all` de nueve llamadas se sustituye en la Task 9. Por ahora, dejarlo leyendo de `valores`.

- [ ] **Step 6: Run tests and build**

Run: `node ./scripts/run-test.js run` y `npm run build`
Expected: PASS y compilación limpia.

- [ ] **Step 7: Commit**

```bash
git add src/core/numeros.ts tests/numeros.test.ts src/renderer/src/views/ConfigView.tsx
git commit -m "fix(config): aceptar coma decimal y rechazar NaN al guardar parametros"
```

---

## Task 9: Guardado de configuración en una sola transacción (B6)

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/ipc-contracts.ts`
- Modify: `src/main/db/repositories/parametros.repo.ts`
- Modify: `src/main/ipc/parametros.handler.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/views/ConfigView.tsx`

**Interfaces:**
- Consumes: `valores: Record<string, string>` construido en la Task 8.
- Produces: `window.api.parametros.updateMany(valores: Record<string, string>): Promise<IpcResult<void>>`.

- [ ] **Step 1: Añadir canal y contrato**

En `src/shared/ipc-channels.ts`:

```ts
  PARAMETROS_UPDATE_MANY: 'parametros:update-many',
```

En `src/shared/ipc-contracts.ts`:

```ts
export interface ActualizarParametrosInput {
  valores: Record<string, string>;
}
```

- [ ] **Step 2: Añadir el método del repositorio**

En `src/main/db/repositories/parametros.repo.ts`:

```ts
  static updateParametros(
    valores: Record<string, string>,
    evento_grupo_id: string
  ): void {
    const db = getDb();
    db.transaction(() => {
      const anteriores = ParametrosRepo.getParametros();

      for (const [clave, valor] of Object.entries(valores)) {
        ParametrosRepo.updateParametro(clave, valor);
      }

      // Un solo evento para todo el lote: deshacer revierte la pantalla entera,
      // no un parámetro suelto.
      EventosRepo.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'PARAMETRO',
        entidad_id: 0,
        tipo_evento: 'ACTUALIZACION',
        valor_anterior: anteriores as unknown as Record<string, unknown>,
        valor_nuevo: valores,
        detalle: `Configuración actualizada (${Object.keys(valores).length} parámetros)`,
      });
    })();
  }
```

- [ ] **Step 3: Añadir el handler**

En `src/main/ipc/parametros.handler.ts`:

```ts
  ipcMain.handle(
    IPC_CHANNELS.PARAMETROS_UPDATE_MANY,
    async (_, input: ActualizarParametrosInput): Promise<IpcResult<void>> => {
      try {
        const grupoId = crypto.randomUUID();
        ParametrosRepo.updateParametros(input.valores, grupoId);
        return { success: true, data: undefined };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );
```

- [ ] **Step 4: Exponer en el preload**

En `src/preload/api.ts`, dentro del bloque `parametros`:

```ts
    updateMany: (valores: Record<string, string>): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PARAMETROS_UPDATE_MANY, { valores }),
```

- [ ] **Step 5: Usarlo en ConfigView**

Sustituir el `await Promise.all([...])` de nueve llamadas por:

```tsx
      const res = await window.api.parametros.updateMany(valores);
      if (!res.success) {
        showToast({ message: res.error.message, type: 'error' });
        return;
      }
```

- [ ] **Step 6: Write the test**

Añadir a `tests/smoke.test.ts`:

```ts
  it('guarda varios parámetros en una sola transacción', () => {
    ParametrosRepo.updateParametros(
      { tasa_cambio_oficial_cents: '3700', tarifa_flete_cents_lb: '700' },
      crypto.randomUUID()
    );

    const params = ParametrosRepo.getParametros();
    expect(params.tasa_cambio_oficial_cents).toBe(3700);
    expect(params.tarifa_flete_cents_lb).toBe(700);
  });
```

- [ ] **Step 7: Run tests and build**

Run: `node ./scripts/run-test.js run` y `npm run build`
Expected: PASS y compilación limpia.

- [ ] **Step 8: Commit**

```bash
git add src/shared src/main src/preload src/renderer/src/views/ConfigView.tsx tests/smoke.test.ts
git commit -m "fix(config): guardar todos los parametros en una sola transaccion"
```

---

## Task 10: Deshacer revierte el grupo correcto (B5)

**Files:**
- Modify: `src/main/db/repositories/eventos.repo.ts:35`
- Modify: `src/main/ipc/sistema.handler.ts`
- Modify: `src/main/ipc/pedidos.handler.ts`
- Modify: `src/main/ipc/pagos.handler.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/renderer/src/context/ToastContext.tsx`

**Interfaces:**
- Consumes: `EventosRepo.deshacerUltimoGrupo()` con su firma actual sin parámetros.
- Produces: `EventosRepo.deshacerUltimoGrupo(grupoId?: string)` (mismo nombre, parámetro opcional nuevo). `showUndoToast(message: string, onUndoSuccess?: () => void, grupoId?: string)`. Los handlers de mutación devuelven `{ ..., evento_grupo_id: string }`.

- [ ] **Step 1: Aceptar un grupo concreto en el repositorio**

En `src/main/db/repositories/eventos.repo.ts`, cambiar la firma y la selección del grupo:

```ts
  static deshacerUltimoGrupo(
    grupoIdSolicitado?: string
  ): { revertido: boolean; descripcion: string } {
    const db = getDb();

    let grupoId = grupoIdSolicitado;

    if (!grupoId) {
      const ultimoGrupo = db
        .prepare(
          'SELECT evento_grupo_id FROM eventos ORDER BY id DESC LIMIT 1'
        )
        .get() as { evento_grupo_id: string } | undefined;

      if (!ultimoGrupo || !ultimoGrupo.evento_grupo_id) {
        return { revertido: false, descripcion: 'No hay acciones recientes para deshacer.' };
      }
      grupoId = ultimoGrupo.evento_grupo_id;
    }

    const eventos = db
      .prepare('SELECT * FROM eventos WHERE evento_grupo_id = ? ORDER BY id DESC')
      .all(grupoId) as EventoAuditoria[];

    if (eventos.length === 0) {
      return { revertido: false, descripcion: 'Esa acción ya no se puede deshacer.' };
    }
```

El resto del cuerpo del método no cambia.

- [ ] **Step 2: Propagar el grupo por IPC**

En `src/main/ipc/sistema.handler.ts`, hacer que el handler de deshacer acepte el grupo:

```ts
  ipcMain.handle(
    IPC_CHANNELS.SISTEMA_DESHACER_ULTIMO_GRUPO,
    async (_, grupoId?: string) => {
      try {
        const data = EventosRepo.deshacerUltimoGrupo(grupoId);
        return { success: true, data };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
  );
```

En `src/main/ipc/pedidos.handler.ts`, devolver el grupo que ya se genera:

```ts
    async (_, input: CambiarEstadoItemInput): Promise<IpcResult<{ evento_grupo_id: string }>> => {
      try {
        const grupoId = crypto.randomUUID();
        PedidosRepo.cambiarEstadoItem(
          input.item_id,
          input.nuevo_estado,
          grupoId,
          input.motivo
        );
        return { success: true, data: { evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
```

Aplicar el mismo patrón en `src/main/ipc/pagos.handler.ts` para `PAGOS_CREATE` y `PAGOS_VERIFICAR`: añadir `evento_grupo_id` al objeto de datos que ya devuelven.

Actualizar los tipos de retorno correspondientes en `src/shared/ipc-contracts.ts` y las firmas en `src/preload/api.ts`, incluyendo:

```ts
    deshacerUltimoGrupo: (
      grupoId?: string
    ): Promise<IpcResult<{ revertido: boolean; descripcion: string }>> =>
      ipcRenderer.invoke(IPC_CHANNELS.SISTEMA_DESHACER_ULTIMO_GRUPO, grupoId),
```

- [ ] **Step 3: Atar el toast a su grupo**

En `src/renderer/src/context/ToastContext.tsx`, cambiar la firma del contexto:

```tsx
interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  showUndoToast: (
    message: string,
    onUndoSuccess?: () => void,
    grupoId?: string
  ) => void;
}
```

y dentro de `showUndoToast`, pasar el grupo a la llamada:

```tsx
        const res = await window.api.sistema.deshacerUltimoGrupo(grupoId);
```

- [ ] **Step 4: Corregir la selección de Ctrl+Z**

En el `useEffect` del atajo, tomar el toast más reciente en vez del más viejo:

```tsx
      const undoableToast = [...toasts].reverse().find((t) => t.undoable && t.onUndo);
```

- [ ] **Step 5: Pasar el grupo desde quien muta**

En `PedidosView.tsx`, dentro de `handleCambiarEstadoItem`:

```tsx
      const res = await window.api.pedidos.cambiarEstadoItem(itemId, nuevoEstado, motivo);
      if (res.success) {
        showUndoToast(
          `Producto cambiado a ${ETIQUETAS_ESTADO_ITEM[nuevoEstado]}`,
          () => { onRefresh(); recargarDetalle(); },
          res.data.evento_grupo_id
        );
```

Aplicar lo mismo en `PagoModal.tsx` (tras `pagos.create`) y en `ConfigView.tsx` (tras `parametros.updateMany`, que debe devolver también su `evento_grupo_id`; añadirlo al tipo de retorno del handler de la Task 9).

- [ ] **Step 6: Write the test**

Añadir a `tests/smoke.test.ts`:

```ts
  it('deshace el grupo indicado y no el más reciente', () => {
    const grupoA = crypto.randomUUID();
    ParametrosRepo.updateParametros({ tasa_cambio_oficial_cents: '3700' }, grupoA);
    ParametrosRepo.updateParametros({ tasa_cambio_oficial_cents: '3800' }, crypto.randomUUID());

    const resultado = EventosRepo.deshacerUltimoGrupo(grupoA);
    expect(resultado.revertido).toBe(true);
  });
```

- [ ] **Step 7: Run tests and build**

Run: `node ./scripts/run-test.js run` y `npm run build`
Expected: PASS y compilación limpia.

- [ ] **Step 8: Commit**

```bash
git add src/main src/preload src/shared src/renderer tests/smoke.test.ts
git commit -m "fix(deshacer): revertir el grupo del toast pulsado y no el mas reciente"
```

---

## Task 11: Comprobante pegado y borrador del cotizador (B7, B8)

**Files:**
- Modify: `src/renderer/src/views/PedidosView.tsx:55-85`
- Modify: `src/renderer/src/views/CotizadorView.tsx:63-72`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: No adivinar el pedido al pegar**

En `src/renderer/src/views/PedidosView.tsx`, dentro de `handlePaste`, sustituir la rama que cae a `pedidos[0]`:

```tsx
            // Solo se adjunta a un pedido elegido explícitamente.
            // Antes caía a pedidos[0], que adjuntaba el comprobante a un
            // pedido arbitrario sin que el usuario lo notara.
            if (expandedPedidoId && pedidoDetalle) {
              setPastedBuffer(uint8);
              setPagoModalPedido(pedidoDetalle);
              showToast({
                message: 'Comprobante detectado. Abriendo registro de pago...',
                type: 'info',
              });
            } else {
              showToast({
                message: 'Abrí primero el pedido al que corresponde el comprobante.',
                type: 'info',
              });
            }
```

Eliminar `pedidos` del arreglo de dependencias del `useEffect` si deja de usarse, para no romper `noUnusedLocals`.

- [ ] **Step 2: Borrador vacío en el cotizador**

En `src/renderer/src/views/CotizadorView.tsx`, sustituir el estado inicial con el producto de demostración por una fila vacía:

```tsx
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    {
      id: 'item_1',
      descripcion: '',
      precio_usa_usd: '',
      peso_lb: '',
    },
  ]);
```

- [ ] **Step 3: Resolver los valores por defecto cuando lleguen los catálogos**

Añadir un efecto que rellene tienda y categoría de las filas que aún no las tienen, en cuanto las listas estén cargadas. El inicializador de `useState` corre una sola vez, cuando `tiendas` y `categorias` todavía están vacías, por eso hoy quedan siempre `undefined`:

```tsx
  useEffect(() => {
    if (tiendas.length === 0 && categorias.length === 0) return;

    setDraftItems((prev) =>
      prev.map((item) =>
        item.tienda_id === undefined && item.categoria_id === undefined
          ? {
              ...item,
              tienda_id: tiendas[0]?.id,
              categoria_id: categorias[0]?.id,
            }
          : item
      )
    );
  }, [tiendas, categorias]);
```

Aplicar los mismos valores por defecto en `handleAddItem`.

- [ ] **Step 4: Verify manually**

Run: `npm run dev`
Abrir el Cotizador: la primera fila debe estar vacía, con tienda y categoría preseleccionadas. Ir a Pedidos sin expandir ninguno y pulsar Ctrl+V con una imagen: debe aparecer el aviso, no el modal.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/views/PedidosView.tsx src/renderer/src/views/CotizadorView.tsx
git commit -m "fix(ui): no adivinar el pedido al pegar ni arrancar con producto de demo"
```

---

## Task 12: Fugas, re-renderizados y contadores muertos (B9 a B14)

**Files:**
- Modify: `src/renderer/src/context/ToastContext.tsx`
- Modify: `src/renderer/src/components/PagoModal.tsx`
- Modify: `src/renderer/src/App.tsx:105-120`
- Modify: `src/renderer/src/views/CotizadorView.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: nada.

- [ ] **Step 1: Memorizar el valor del contexto (B9)**

En `src/renderer/src/context/ToastContext.tsx`, importar `useMemo` y envolver el valor:

```tsx
  const value = useMemo(
    () => ({ showToast, showUndoToast }),
    [showToast, showUndoToast]
  );

  return (
    <ToastContext.Provider value={value}>
```

- [ ] **Step 2: Limpiar el intervalo del toast (B10)**

Guardar los intervalos por id y limpiarlos en `removeToast`:

```tsx
  const intervalos = useRef(new Map<string, ReturnType<typeof setInterval>>());

  const removeToast = useCallback((id: string) => {
    const intervalo = intervalos.current.get(id);
    if (intervalo) {
      clearInterval(intervalo);
      intervalos.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
```

Y en `showUndoToast`, registrar el intervalo tras crearlo:

```tsx
      intervalos.current.set(id, interval);
```

Importar `useRef`.

- [ ] **Step 3: Revocar los object URL (B11)**

En `src/renderer/src/components/PagoModal.tsx`, revocar el anterior al crear uno nuevo y al desmontar:

```tsx
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
```

- [ ] **Step 4: Reconvertir el monto al cambiar de moneda (B12)**

En `PagoModal.tsx`, sustituir el manejador del selector de moneda para que convierta lo escrito:

```tsx
  const handleCambioMoneda = (nueva: 'COR' | 'USD') => {
    if (nueva === moneda) return;

    const actual = parsearDecimal(monto);
    if (actual !== null) {
      const tasa = pedido.tasa_cambio_cents / 100;
      const convertido = nueva === 'USD' ? actual / tasa : actual * tasa;
      setMonto(convertido.toFixed(2));
    }
    setMoneda(nueva);
  };
```

Importar `parsearDecimal` desde `@core/numeros` y conectar `handleCambioMoneda` a los botones de moneda.

- [ ] **Step 5: Alimentar el contador ámbar (B13)**

En `src/renderer/src/App.tsx`, el semáforo nunca incrementa `amarillo`, así que esa rama del encabezado es código muerto. Un pedido está en ámbar cuando tiene dinero registrado pero el anticipo aún no está verificado en el banco.

`Pedido` no expone un campo de total pagado, pero se deduce de dos que sí tiene: `total_cor_cents` menos `saldo_pendiente_cor_cents`.

```tsx
  const semaforoCounts = React.useMemo(() => {
    let verde = 0;
    let amarillo = 0;
    let rojo = 0;

    for (const p of pedidos) {
      const pagadoCorCents = p.total_cor_cents - p.saldo_pendiente_cor_cents;

      if (p.anticipo_verificado) {
        verde++;
      } else if (pagadoCorCents > 0) {
        // Hay dinero registrado pero todavía sin confirmar en el banco
        amarillo++;
      } else {
        rojo++;
      }
    }

    return { verde, amarillo, rojo };
  }, [pedidos]);
```

- [ ] **Step 6: Reportar el margen efectivo (B14)**

En `src/core/precios.ts`, `comision_total_cor_cents` ignora el excedente de redondeo, así que la línea "Ganancia" del cotizador no cuadra con el precio final. Añadir un campo al total en lugar de cambiar el existente:

En `TotalesCotizacion`, añadir:

```ts
  margen_efectivo_cor_cents: number;
```

y calcularlo al construir `totales`:

```ts
    margen_efectivo_cor_cents:
      itemsResultado.reduce((acc, i) => acc + i.precio_final_cor_cents, 0) -
      itemsConCostos.reduce((acc, i) => acc + i.costo_cor_cents, 0),
```

En `CotizadorView.tsx`, cambiar la etiqueta del resumen para que lea `margen_efectivo_cor_cents` y renombrar el texto a "Tu ganancia".

- [ ] **Step 7: Run tests and build**

Run: `node ./scripts/run-test.js run` y `npm run build`
Expected: PASS y compilación limpia.

- [ ] **Step 8: Commit**

```bash
git add src/renderer src/core/precios.ts
git commit -m "fix(ui): fugas de intervalos y object URLs, semaforo ambar y margen efectivo"
```

---

# PISTA C — Interfaz corporativa

## Task 13: Capa de tokens y helper de clases (C-0)

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/renderer/src/index.css`
- Create: `src/renderer/src/lib/cn.ts`

**Interfaces:**
- Consumes: `clsx` y `tailwind-merge`, ya presentes en `package.json` y sin usar en todo el repositorio.
- Produces: `cn(...inputs: ClassValue[]): string`. Tokens `navy-*`, `brand-*`, `success-*`, `warning-*`, `danger-*`. Escala tipográfica `display`, `title`, `body`, `label`, `caption`, `metric`, `metric-sm`. Los consume la Task 14.

- [ ] **Step 1: Crear el helper de clases**

Crear `src/renderer/src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Une clases de Tailwind resolviendo conflictos: la última gana.
 * Sin esto, `cn('p-2', 'p-4')` dejaría ambas y el resultado dependería
 * del orden en la hoja de estilos, no del orden de la llamada.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Reescribir los tokens**

Sustituir el contenido de `tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Superficies oscuras: barra lateral, cabeceras de modal, franjas de datos.
        // Más azul que slate a propósito, para que se lea como cromo y no como gris.
        navy: {
          50: '#f2f6fc',
          100: '#e3ebf7',
          200: '#c6d8ee',
          300: '#96b6dd',
          400: '#5e8ec6',
          500: '#3a6cae',
          600: '#2a5292',
          700: '#234176',
          800: '#1f3762',
          900: '#1d2f52',
          950: '#131e36',
        },
        // Acción primaria, foco, selección, enlaces.
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        // Roles de estado. Nombrados por lo que significan, no por su color,
        // para que cambiarlos no obligue a tocar cada vista.
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
        },
        danger: {
          50: '#fff1f2',
          100: '#ffe4e6',
          500: '#f43f5e',
          600: '#e11d48',
          700: '#be123c',
          800: '#9f1239',
        },
        // Alias temporal: hace que toda la aplicación pase a azul sin tocar
        // un solo .tsx. Se elimina en la Task 22, cuando ya no quede
        // ningún consumidor.
        glow: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      fontSize: {
        caption: ['0.6875rem', { lineHeight: '1rem', fontWeight: '400' }],
        label: ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        body: ['0.875rem', { lineHeight: '1.375rem', fontWeight: '400' }],
        title: ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        display: ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
        'metric-sm': ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        metric: ['1.75rem', { lineHeight: '2.25rem', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
};
```

Los radios se recortan en la Task 22, no ahora: quitarlos aquí dejaría sin estilo las vistas todavía sin migrar.

- [ ] **Step 3: Añadir cifras tabulares y recolorear el scrollbar**

En `src/renderer/src/index.css`, dentro de `@layer base`, añadir:

```css
  /* Los montos se comparan en columna: sin cifras de ancho fijo, los
     millares bailan y la tabla deja de poder leerse de un vistazo. */
  .tabular {
    font-variant-numeric: tabular-nums;
    font-feature-settings: 'tnum';
  }
```

Y cambiar los colores del scrollbar de `#f1f5f9` / `#cbd5e1` / `#94a3b8` a `#f8fafc` / `#cbd5e1` / `#94a3b8` (se mantienen: son neutros de slate, ya coherentes).

- [ ] **Step 4: Verify visually**

Run: `npm run dev`
Expected: toda la aplicación pasa de rosa a azul sin ningún cambio en los `.tsx`. Este es el punto de control temprano: si algo sigue rosa, es un uso crudo de `pink`, `rose` o `fuchsia`, y se anota para la Task 22.

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: compilación limpia.

- [ ] **Step 6: Commit**

```bash
git add tailwind.config.js src/renderer/src/index.css src/renderer/src/lib/cn.ts
git commit -m "feat(ui): capa de tokens azul corporativa y helper cn"
```

---

## Task 14: Capa de primitivos (C-1)

**Files:**
- Create: `src/renderer/src/components/ui/Card.tsx`
- Create: `src/renderer/src/components/ui/Button.tsx`
- Create: `src/renderer/src/components/ui/Badge.tsx`
- Create: `src/renderer/src/components/ui/StatusDot.tsx`
- Create: `src/renderer/src/components/ui/Money.tsx`
- Create: `src/renderer/src/components/ui/StatTile.tsx`
- Create: `src/renderer/src/components/ui/Field.tsx`
- Create: `src/renderer/src/components/ui/DataTable.tsx`
- Create: `src/renderer/src/components/ui/SectionHeader.tsx`
- Create: `src/renderer/src/components/ui/index.ts`

**Interfaces:**
- Consumes: `cn` de la Task 13.
- Produces: los nueve componentes, reexportados desde `ui/index.ts`. Los consumen las Tasks 15 a 21. Firmas exactas abajo.

- [ ] **Step 1: Card**

```tsx
import React from 'react';
import { cn } from '../../lib/cn';

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...rest
}) => (
  <div
    className={cn('bg-white rounded-lg border border-slate-200', className)}
    {...rest}
  />
);

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...rest
}) => (
  <div
    className={cn(
      'px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3',
      className
    )}
    {...rest}
  />
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...rest
}) => <div className={cn('p-4', className)} {...rest} />;
```

- [ ] **Step 2: Button**

```tsx
import React from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANTES: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white border-transparent hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
  ghost: 'bg-transparent text-slate-600 border-transparent hover:bg-slate-100',
  danger: 'bg-danger-600 text-white border-transparent hover:bg-danger-700',
};

const TAMANOS: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-label gap-1.5',
  md: 'h-9 px-4 text-body font-medium gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}) => (
  <button
    className={cn(
      'inline-flex items-center justify-center rounded-md border transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1',
      'disabled:opacity-50 disabled:pointer-events-none',
      VARIANTES[variant],
      TAMANOS[size],
      className
    )}
    {...rest}
  />
);
```

- [ ] **Step 3: Badge y StatusDot**

`Badge.tsx`:

```tsx
import React from 'react';
import { cn } from '../../lib/cn';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONOS: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-danger-50 text-danger-700',
  info: 'bg-brand-50 text-brand-700',
};

export interface BadgeProps {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', children, className }) => (
  <span
    className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-caption font-medium',
      TONOS[tone],
      className
    )}
  >
    {children}
  </span>
);
```

`StatusDot.tsx` sustituye los emojis de estado, que además no son accesibles:

```tsx
import React from 'react';
import { cn } from '../../lib/cn';
import type { Tone } from './Badge';

const PUNTOS: Record<Tone, string> = {
  neutral: 'bg-slate-400',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
  info: 'bg-brand-500',
};

export interface StatusDotProps {
  tone: Tone;
  label?: string;
  className?: string;
}

export const StatusDot: React.FC<StatusDotProps> = ({ tone, label, className }) => (
  <span className={cn('inline-flex items-center gap-2', className)}>
    <span className={cn('w-2 h-2 rounded-full shrink-0', PUNTOS[tone])} aria-hidden />
    {label && <span className="text-label text-slate-700">{label}</span>}
  </span>
);
```

- [ ] **Step 4: Money**

Absorbe `DualMoneyDisplay`, añadiendo cifras tabulares:

```tsx
import React from 'react';
import { cn } from '../../lib/cn';
import { formatearMoneda } from '@core/moneda';

export type MoneySize = 'sm' | 'md' | 'lg' | 'xl';

const PRIMARIO: Record<MoneySize, string> = {
  sm: 'text-label',
  md: 'text-body font-semibold',
  lg: 'text-metric-sm',
  xl: 'text-metric',
};

const SECUNDARIO: Record<MoneySize, string> = {
  sm: 'text-caption',
  md: 'text-caption',
  lg: 'text-label',
  xl: 'text-body',
};

export interface MoneyProps {
  cor_cents: number;
  usd_cents?: number;
  size?: MoneySize;
  primary?: 'COR' | 'USD';
  className?: string;
}

export const Money: React.FC<MoneyProps> = ({
  cor_cents,
  usd_cents,
  size = 'md',
  primary = 'COR',
  className,
}) => {
  const principal =
    primary === 'COR'
      ? formatearMoneda(cor_cents, 'COR')
      : formatearMoneda(usd_cents ?? 0, 'USD');

  const secundario =
    usd_cents === undefined
      ? null
      : primary === 'COR'
        ? formatearMoneda(usd_cents, 'USD')
        : formatearMoneda(cor_cents, 'COR');

  return (
    <span className={cn('inline-flex items-baseline gap-1.5 tabular', className)}>
      <span className={cn(PRIMARIO[size], 'text-slate-900')}>{principal}</span>
      {secundario && (
        <span className={cn(SECUNDARIO[size], 'text-slate-500')}>{secundario}</span>
      )}
    </span>
  );
};
```

- [ ] **Step 5: StatTile**

```tsx
import React from 'react';
import { cn } from '../../lib/cn';
import { Money } from './Money';
import type { Tone } from './Badge';

const ACENTOS: Record<Tone, string> = {
  neutral: 'border-l-slate-300',
  success: 'border-l-success-500',
  warning: 'border-l-warning-500',
  danger: 'border-l-danger-500',
  info: 'border-l-brand-500',
};

export interface StatTileProps {
  label: string;
  cor_cents?: number;
  usd_cents?: number;
  value?: React.ReactNode;
  hint?: string;
  tone?: Tone;
  className?: string;
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  cor_cents,
  usd_cents,
  value,
  hint,
  tone = 'neutral',
  className,
}) => (
  <div
    className={cn(
      'bg-white rounded-lg border border-slate-200 border-l-4 p-4',
      ACENTOS[tone],
      className
    )}
  >
    <div className="text-label text-slate-500">{label}</div>
    <div className="mt-1">
      {cor_cents !== undefined ? (
        <Money cor_cents={cor_cents} usd_cents={usd_cents} size="xl" />
      ) : (
        <span className="text-metric text-slate-900 tabular">{value}</span>
      )}
    </div>
    {hint && <p className="mt-1 text-caption text-slate-500">{hint}</p>}
  </div>
);
```

- [ ] **Step 6: Field**

```tsx
import React from 'react';
import { cn } from '../../lib/cn';

const CONTROL =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-body text-slate-900 ' +
  'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 ' +
  'disabled:bg-slate-50 disabled:text-slate-500';

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export const Field: React.FC<FieldProps> = ({ label, hint, error, children, className }) => (
  <label className={cn('block', className)}>
    <span className="block text-label text-slate-700 mb-1">{label}</span>
    {children}
    {hint && !error && <span className="mt-1 block text-caption text-slate-500">{hint}</span>}
    {error && <span className="mt-1 block text-caption text-danger-700">{error}</span>}
  </label>
);

export const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...rest
}) => <input className={cn(CONTROL, className)} {...rest} />;

export const Select: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = ({
  className,
  ...rest
}) => <select className={cn(CONTROL, className)} {...rest} />;

export const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...rest
}) => <textarea className={cn(CONTROL, className)} {...rest} />;
```

- [ ] **Step 7: DataTable**

```tsx
import React from 'react';
import { cn } from '../../lib/cn';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  width?: string;
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  selectedKey?: string | number;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectedKey,
  onRowClick,
  emptyMessage = 'No hay nada que mostrar.',
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-body text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            {columns.map((col) => (
              <th
                key={col.key}
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  'px-4 py-2.5 text-caption font-semibold uppercase tracking-wide text-slate-500',
                  col.align === 'right' ? 'text-right' : 'text-left'
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            return (
              <tr
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-slate-100 last:border-0',
                  onRowClick && 'cursor-pointer hover:bg-slate-50',
                  selectedKey === key && 'bg-brand-50 hover:bg-brand-50'
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-4 py-2.5 text-body text-slate-700',
                      col.align === 'right' && 'text-right tabular'
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 8: SectionHeader e index**

`SectionHeader.tsx`:

```tsx
import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface SectionHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  icon: Icon,
  title,
  description,
  action,
}) => (
  <div className="flex items-start justify-between gap-3">
    <div className="flex items-start gap-2.5">
      {Icon && <Icon className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />}
      <div>
        <h3 className="text-title text-slate-900">{title}</h3>
        {description && <p className="text-label text-slate-500 mt-0.5">{description}</p>}
      </div>
    </div>
    {action}
  </div>
);
```

`index.ts`:

```ts
export { Card, CardHeader, CardContent } from './Card';
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { Badge } from './Badge';
export type { Tone } from './Badge';
export { StatusDot } from './StatusDot';
export { Money } from './Money';
export { StatTile } from './StatTile';
export { Field, Input, Select, Textarea } from './Field';
export { DataTable } from './DataTable';
export type { Column, DataTableProps } from './DataTable';
export { SectionHeader } from './SectionHeader';
```

- [ ] **Step 9: Verify the build**

Run: `npm run build`
Expected: compilación limpia. Los primitivos todavía no se consumen; `noUnusedLocals` no se queja de exports sin usar, solo de locales.

- [ ] **Step 10: Commit**

```bash
git add src/renderer/src/components/ui
git commit -m "feat(ui): capa de primitivos reutilizables"
```

---

## Task 15: Migrar el cromo (C-2)

**Files:**
- Modify: `src/renderer/src/components/layout/Header.tsx`
- Modify: `src/renderer/src/components/layout/Sidebar.tsx`
- Modify: `src/renderer/src/context/ToastContext.tsx`
- Modify: `src/renderer/src/components/CommandPalette.tsx`

**Interfaces:**
- Consumes: `Button`, `Badge`, `StatusDot` de la Task 14.
- Produces: nada.

- [ ] **Step 1: Header sin degradado rosa**

En `Header.tsx`, sustituir el bloque de marca:

```tsx
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-navy-900 flex items-center justify-center text-white font-semibold text-label">
            GH
          </div>
          <div>
            <h1 className="text-title text-slate-900 leading-none">Glow Heaven</h1>
            <span className="text-caption text-slate-500 uppercase tracking-wide">
              Manager
            </span>
          </div>
        </div>
```

Sustituir las tres ramas del semáforo por `StatusDot` con `tone` `success`, `warning` y `danger`, cada una con su conteo. Quitar `animate-pulse`: en un panel financiero un punto parpadeante es ruido.

Sustituir los tres botones de la derecha por `Button` con `variant="secondary"` los dos primeros y `variant="primary"` el de nueva cotización.

- [ ] **Step 2: Sidebar con barra de acento**

En `Sidebar.tsx`, cambiar la superficie a `bg-navy-900 text-slate-300`, y el estado activo de bloque sólido a barra lateral:

```tsx
              className={cn(
                'w-full flex items-center justify-between px-3 py-2 rounded-md text-body transition-colors text-left border-l-2',
                isActive
                  ? 'bg-navy-800 text-white border-l-brand-500 font-medium'
                  : 'border-l-transparent text-slate-400 hover:bg-navy-800/60 hover:text-white'
              )}
```

Sustituir `badgeColor: 'bg-rose-500 text-white'` por el uso de `Badge` con `tone="danger"`.

- [ ] **Step 3: Toast y CommandPalette**

En `ToastContext.tsx`, cambiar la superficie del toast a `bg-navy-900 border-navy-700`, el botón de deshacer a `Button` con `variant="primary"` y `size="sm"`, y los iconos de tipo a `text-success-500`, `text-danger-500` y `text-brand-400`.

En `CommandPalette.tsx`, sustituir los dos usos de `glow-*` por `brand-*` y normalizar radios a `rounded-md` y `rounded-lg`.

- [ ] **Step 4: Verify visually**

Run: `npm run dev`
Recorrer las cinco pestañas. La barra superior y lateral deben leerse sobrias, sin rosa ni degradados.

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: compilación limpia.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/layout src/renderer/src/context/ToastContext.tsx src/renderer/src/components/CommandPalette.tsx
git commit -m "refactor(ui): migrar cabecera, barra lateral, toasts y paleta a los primitivos"
```

---

## Task 16: HoyView como panel de control

**Files:**
- Modify: `src/renderer/src/views/HoyView.tsx`

**Interfaces:**
- Consumes: `StatTile`, `Card`, `CardHeader`, `CardContent`, `Button`, `Badge`, `SectionHeader` de la Task 14.
- Produces: nada.

- [ ] **Step 1: Fila de indicadores arriba**

Hoy las cifras de dinero están al fondo, dentro de una tarjeta con degradado oscuro. Se invierte el orden: lo primero que ve el usuario es su dinero.

Sustituir el contenido del `return` para que empiece así, justo después del título de la vista:

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

Añadir `pedidosBloqueados` y `pedidosListos` a `HoyViewProps` y pasarlos desde `App.tsx` reutilizando el `semaforoCounts` que ya calcula.

- [ ] **Step 2: Dos columnas debajo**

Envolver las secciones de decisiones y entregas:

```tsx
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Necesitan tu decisión */}
        </div>
        <div className="space-y-4">
          {/* Entregas de hoy y Esperando a otros */}
        </div>
      </div>
```

- [ ] **Step 3: Eliminar la tarjeta con degradado**

Borrar por completo el bloque `bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900`: su contenido ya vive en los `StatTile` del paso 1. Con él se van los usos de `glow-500/20`, `glow-400` y `glow-400/30`.

Migrar las secciones restantes a `Card`, `CardHeader` con `SectionHeader`, y `CardContent`. Sustituir los círculos de icono de 32px por el icono suelto de `SectionHeader`.

- [ ] **Step 4: Normalizar tipografía**

Reemplazar `text-2xl font-black` del título por `text-display`, los `text-sm font-bold` de títulos de sección por `text-title`, los `text-xs` de cuerpo por `text-body`, y los `text-[11px]` por `text-caption`. Quitar todo `font-bold` que no esté en un título o una cifra.

- [ ] **Step 5: Verify visually**

Run: `npm run dev`
Expected: la vista Hoy abre mostrando cuatro indicadores de dinero arriba, y ninguna superficie con degradado.

- [ ] **Step 6: Run build and commit**

```bash
npm run build
git add src/renderer/src/views/HoyView.tsx src/renderer/src/App.tsx
git commit -m "refactor(hoy): reordenar como panel de control financiero"
```

---

## Task 17: Descomponer PedidosView en tabla y panel

**Files:**
- Create: `src/renderer/src/views/pedidos/PedidosTable.tsx`
- Create: `src/renderer/src/views/pedidos/PedidoDetailPanel.tsx`
- Modify: `src/renderer/src/views/PedidosView.tsx`

**Interfaces:**
- Consumes: `DataTable`, `Column`, `Badge`, `StatusDot`, `Money`, `Button` de la Task 14. `transicionesPermitidas` y `ETIQUETAS_ESTADO_ITEM` de la Task 6.
- Produces: `PedidosTable` con props `{ pedidos: Pedido[]; selectedId?: number; onSelect: (p: Pedido) => void; onCobrar: (p: Pedido) => void }`. `PedidoDetailPanel` con props `{ detalle: PedidoCompleto | null; onCambiarEstado: (itemId: number, nuevo: EstadoItem) => void; onVerificarPago: (pagoId: number) => void }`.

- [ ] **Step 1: Crear PedidosTable**

`src/renderer/src/views/pedidos/PedidosTable.tsx`:

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

- [ ] **Step 2: Crear PedidoDetailPanel**

Mover a `src/renderer/src/views/pedidos/PedidoDetailPanel.tsx` todo el bloque hoy anidado bajo `{isExpanded && ...}`: la lista de ítems con su selector de estado (ya corregido en la Task 6) y el historial de pagos. Envolverlo en `Card` y sustituir los `rounded-2xl` por `rounded-lg`, los `text-xs` por `text-body` y los `text-[11px]` por `text-caption`. El botón "Verificar ahora" pasa a `Button` con `variant="secondary"` y `size="sm"`.

- [ ] **Step 3: Reescribir PedidosView como orquestador**

`PedidosView.tsx` conserva el estado (`filter`, `pedidoDetalle`, `pagoModalPedido`, `pastedBuffer`), los efectos y los manejadores.

Un detalle de nombres: hoy conviven la prop `selectedPedidoId` y el estado `expandedPedidoId`, porque el patrón era un acordeón. Sin acordeón queda un solo concepto. Renombrar el estado a `selectedPedidoId` y la prop entrante a `initialPedidoId`, y ajustar el efecto que las sincroniza y las tres referencias a `expandedPedidoId` en los efectos de carga y de pegado.

El botón "Verificar ahora" vive hoy como un `onClick` anónimo dentro del JSX del historial de pagos. Al mover ese JSX al panel hay que extraerlo como manejador con nombre, porque el panel lo recibe por props:

```tsx
  const handleVerificarPago = async (pagoId: number) => {
    const res = await window.api.pagos.verificar(pagoId, true);
    if (!res.success) {
      showToast({ message: res.error.message, type: 'error' });
      return;
    }
    showUndoToast('Pago marcado como verificado', () => onRefresh(), res.data.evento_grupo_id);
    onRefresh();
    recargarDetalle();
  };
```

Extraer también `recargarDetalle`, que hoy está duplicado tres veces como `window.api.pedidos.getById(expandedPedidoId).then(...)`:

```tsx
  const recargarDetalle = useCallback(() => {
    if (!selectedPedidoId) return;
    window.api.pedidos.getById(selectedPedidoId).then((r) => {
      if (r.success) setPedidoDetalle(r.data);
    });
  }, [selectedPedidoId]);
```

Con eso, el `return` queda:

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

      {pagoModalPedido && ( /* ...modal sin cambios... */ )}
    </div>
  );
```

Definir `FILTROS` como constante con los cuatro filtros y sus etiquetas sin emoji: `Todos`, `Listos para comprar`, `Bloqueados`, `Requieren atención`.

- [ ] **Step 4: Verify visually**

Run: `npm run dev`
Expected: tabla densa a la izquierda con montos alineados a la derecha, panel de detalle a la derecha, filtros sin emoji. Confirmar que un pedido puede recorrerse hasta `ENTREGADO`.

- [ ] **Step 5: Run build and commit**

```bash
npm run build
git add src/renderer/src/views/pedidos src/renderer/src/views/PedidosView.tsx
git commit -m "refactor(pedidos): tabla densa con panel de detalle"
```

---

## Task 18: Descomponer CotizadorView

**Files:**
- Create: `src/renderer/src/views/cotizador/useCotizacionDraft.ts`
- Create: `src/renderer/src/views/cotizador/ItemsEditor.tsx`
- Create: `src/renderer/src/views/cotizador/ResumenPanel.tsx`
- Create: `src/renderer/src/views/cotizador/HistorialCotizaciones.tsx`
- Modify: `src/renderer/src/views/CotizadorView.tsx`
- Modify: `src/renderer/src/components/QuickCapture.tsx`

**Interfaces:**
- Consumes: primitivos de la Task 14; `calcularCotizacion` del core.
- Produces: `useCotizacionDraft(params)` devolviendo `{ draftItems, calculo, addItem, updateItem, removeItem, handleParsedItem, anticipoPorcentaje, setAnticipoPorcentaje }`.

- [ ] **Step 1: Extraer el hook**

Mover a `useCotizacionDraft.ts` el estado `draftItems` y `anticipoPorcentaje`, los manejadores `handleAddItem`, `handleUpdateItem`, `handleRemoveItem`, `handleParsedItem`, el efecto de valores por defecto de la Task 11, y el `useMemo` completo de `calculoCotizacion`. El hook recibe `{ categorias, tiendas, parametros }` y devuelve el objeto descrito arriba.

Tipar `updateItem` sin `any`:

```ts
  const updateItem = <K extends keyof DraftItem>(
    id: string,
    field: K,
    value: DraftItem[K]
  ) => {
    setDraftItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };
```

- [ ] **Step 2: Extraer ItemsEditor**

Mover la tarjeta de "Productos a Cotizar" y su bucle de filas. Cada fila pasa a usar `Field`, `Input` y `Select`, con los cuatro campos en una rejilla. El botón de borrar pasa a `Button` con `variant="ghost"`.

- [ ] **Step 3: Extraer ResumenPanel**

Mover la columna derecha completa. El desglose pasa a `Card`. El bloque de total deja de ser `bg-slate-900` con cifra en `text-glow-300` y pasa a:

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

La línea de ganancia lee `margen_efectivo_cor_cents` (Task 12, paso 6) con la etiqueta "Tu ganancia".

- [ ] **Step 4: Extraer HistorialCotizaciones**

Mover la pestaña de cotizaciones guardadas y convertirla a `DataTable` con columnas Código, Estado, Fecha, Total y acción.

- [ ] **Step 5: QuickCapture sobrio**

En `QuickCapture.tsx`, sustituir `bg-gradient-to-r from-glow-50 to-pink-50 ... border-glow-100` por `bg-slate-50 rounded-lg border border-slate-200`, el icono `text-glow-600` por `text-slate-400`, y el botón por `Button`. Es el último uso de `pink` del archivo.

- [ ] **Step 6: Verify visually and build**

Run: `npm run dev` y luego `npm run build`
Expected: el cotizador calcula igual que antes de la descomposición. Comparar un total contra el escenario A de `tests/precios-escenarios.test.ts`: un perfume de $128 y 1.5 lb debe dar C$7,000.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/views/cotizador src/renderer/src/views/CotizadorView.tsx src/renderer/src/components/QuickCapture.tsx
git commit -m "refactor(cotizador): separar hook de calculo, editor, resumen e historial"
```

---

## Task 19: ClientesView a tabla

**Files:**
- Modify: `src/renderer/src/views/ClientesView.tsx`

**Interfaces:**
- Consumes: `DataTable`, `Badge`, `Button`, `Field`, `Input`, `Select`, `Textarea`, `Card` de la Task 14.
- Produces: nada.

- [ ] **Step 1: Sustituir la rejilla de tarjetas**

Cambiar el bloque `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3` por un `DataTable` con columnas Nombre (con `Badge` de `tone="danger"` y texto "70% anticipo" cuando `incumplio_anteriormente`), Ciudad, Teléfono, y una columna de acciones con WhatsApp y Editar como `Button` de `variant="ghost"` y `size="sm"`.

- [ ] **Step 2: Migrar el modal**

Sustituir la cabecera `bg-slate-900` por `bg-navy-900`, `rounded-3xl` por `rounded-lg`, y cada par etiqueta más control por `Field` con `Input`, `Select` o `Textarea`. El aviso de incumplimiento pasa de `bg-rose-50 border-rose-100` a `bg-danger-50 border-danger-100`, que es el mismo color con nombre honesto.

- [ ] **Step 3: Verify visually, build and commit**

```bash
npm run dev
npm run build
git add src/renderer/src/views/ClientesView.tsx
git commit -m "refactor(clientes): tabla y modal sobre los primitivos"
```

---

## Task 20: ConfigView con secciones y edición de categorías

**Files:**
- Modify: `src/renderer/src/views/ConfigView.tsx`
- Create: `src/renderer/src/views/config/CategoriasSection.tsx`

**Interfaces:**
- Consumes: `window.api.categorias.update` de la Task 5; `parsearACentavos` de la Task 8; primitivos de la Task 14.
- Produces: nada.

- [ ] **Step 1: Crear la sección de categorías**

`src/renderer/src/views/config/CategoriasSection.tsx` presenta una tabla editable con una fila por categoría y tres campos: comisión en porcentaje, arancel en porcentaje y redondeo en córdobas. Al guardar llama `window.api.categorias.update(cambios)` con los valores convertidos a basis points mediante `parsearACentavos(texto, { min: 0, max: 100 })`.

Incluir una nota explicativa encima de la tabla:

```tsx
      <p className="text-body text-slate-600">
        La comisión es tu ganancia y se calcula sobre el precio del producto en
        la tienda. El arancel es lo que cobra la aduana: dejalo en 0 si tus
        envíos no pagan aduana. El redondeo deja los precios en cifras limpias.
      </p>
```

- [ ] **Step 2: Exponer el flete mínimo con su advertencia**

En la sección de courier de `ConfigView.tsx`, el campo de flete mínimo lleva un `hint` explícito, porque es el parámetro que más castiga los productos livianos:

```tsx
        <Field
          label="Flete mínimo por envío (USD)"
          hint="Dejalo en 0 si tu courier solo cobra por libra. Un mínimo alto encarece mucho los productos livianos."
        >
          <Input value={fleteMinimo} onChange={(e) => setFleteMinimo(e.target.value)} />
        </Field>
```

- [ ] **Step 3: Navegación por secciones**

Sustituir los cuatro bloques apilados por una lista de secciones a la izquierda y el contenido a la derecha:

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

- [ ] **Step 4: Migrar todos los campos a Field**

Sustituir cada par de etiqueta y control por `Field` con `Input` o `Select`. Eliminar los dieciséis usos de `glow-*` del archivo.

- [ ] **Step 5: Verify manually**

Run: `npm run dev`
Ir a Configuración, sección Categorías, bajar la comisión de Perfumería a 20% y guardar. Volver al Cotizador y confirmar que el precio del perfume baja.

- [ ] **Step 6: Run build and commit**

```bash
npm run build
git add src/renderer/src/views/ConfigView.tsx src/renderer/src/views/config
git commit -m "feat(config): secciones ancladas y edicion de tasas por categoria"
```

---

## Task 21: Modales

**Files:**
- Modify: `src/renderer/src/components/PagoModal.tsx`
- Modify: `src/renderer/src/components/OnboardingModal.tsx`

**Interfaces:**
- Consumes: primitivos de la Task 14.
- Produces: nada.

- [ ] **Step 1: PagoModal**

Sustituir `rounded-3xl` por `rounded-lg`, la cabecera `bg-slate-900` por `bg-navy-900`, cada campo por `Field`, y los botones por `Button`. Eliminar los cinco usos de `glow-*` y los dos de `pink`.

- [ ] **Step 2: OnboardingModal**

Es el archivo con más deuda: doce usos de `glow-*` y cinco de `pink`. Migrar los cinco pasos a `Field` y `Button`, sustituir el indicador de progreso por una barra `bg-brand-600`, y quitar los emojis decorativos de los encabezados de paso.

Añadir al paso 2 el campo de flete mínimo con la misma advertencia de la Task 20, y al paso 3 dejar el arancel por defecto en 0 con la nota "Dejalo en 0 si tus envíos no pagan aduana".

- [ ] **Step 3: Verify manually**

Run: `npm run dev`
Borrar `cuentas_bancarias` de la base de datos local para forzar el asistente, y recorrer los cinco pasos.

- [ ] **Step 4: Run build and commit**

```bash
npm run build
git add src/renderer/src/components/PagoModal.tsx src/renderer/src/components/OnboardingModal.tsx
git commit -m "refactor(modales): migrar pago y onboarding a los primitivos"
```

---

## Task 22: Cierre y compuertas de guardia (C-4)

**Files:**
- Modify: `tailwind.config.js`
- Modify: `src/renderer/src/components/shared/DualMoneyDisplay.tsx` (eliminar)
- Modify: `src/renderer/src/components/shared/EmptyState.tsx`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: repositorio sin `glow`, sin radios fuera de escala y sin color rosa.

- [ ] **Step 1: Eliminar el alias glow y recortar los radios**

En `tailwind.config.js`, borrar por completo el bloque `glow` de `colors`, y añadir dentro de `theme` (no de `extend`) la sustitución de radios:

```js
    borderRadius: {
      none: '0',
      md: '0.375rem',
      lg: '0.5rem',
      full: '9999px',
    },
```

Esto elimina `rounded-sm`, `rounded-xl`, `rounded-2xl` y `rounded-3xl` del sistema. Cualquier uso que sobreviva deja de producir estilo, lo que lo vuelve visible de inmediato.

- [ ] **Step 2: Ejecutar los greps de guardia**

```bash
grep -rn "glow-" src/renderer --include=*.tsx | grep -v "Glow Heaven"
grep -rn -E "rounded-(sm|xl|2xl|3xl)" src/renderer --include=*.tsx
grep -rn -E "\b(bg|text|border|ring|from|to|via)-(pink|fuchsia|rose)-[0-9]+" src/renderer --include=*.tsx
grep -rn -E "text-\[(10|11)px\]" src/renderer --include=*.tsx
```

Cada uno debe devolver cero resultados. Los `rose` que quedaran son los que deben pasar a `danger`.

- [ ] **Step 3: Eliminar DualMoneyDisplay**

`Money` lo reemplaza. Confirmar que no queda ningún import:

```bash
grep -rn "DualMoneyDisplay" src/
```

Si está limpio, borrar el archivo. `noUnusedLocals` no detecta un archivo entero sin usar, por eso el grep es necesario.

- [ ] **Step 4: Migrar EmptyState**

Es el último archivo con `glow-*`. Sustituir por `Button` con `variant="primary"`, y `rounded-2xl` por `rounded-lg`.

- [ ] **Step 5: Barrido final de tipografía**

```bash
grep -rc "text-xs" src/renderer --include=*.tsx
```

Sustituir los residuos por `text-label` o `text-body` según sean etiquetas de campo o texto corriente.

- [ ] **Step 6: Verificación completa**

```bash
node ./scripts/run-test.js run
npm run build
npm run dev
```

Recorrer en pantalla los ocho pasos del punto 5 de `REVISION_FASE1.md`:

1. Primer arranque, aparece el asistente, configurar todo
2. `HoyView` carga con sus indicadores, sin errores en consola
3. `Ctrl+N`, cotizar 3 ítems con captura rápida, totales duales correctos
4. `Ctrl+Shift+C` copia el mensaje con las cuentas bancarias
5. Convertir a pedido, aparece el toast de deshacer, probarlo y confirmar la reversión
6. Intentar mandar a lista USA sin anticipo, debe quedar bloqueado
7. `Ctrl+V` con un comprobante, pago prellenado, verificar, semáforo verde
8. `Ctrl+B` respalda, cerrar la app, confirmar el respaldo en disco

Además, confirmar el camino completo de un pedido hasta `ENTREGADO`, que antes era inalcanzable.

- [ ] **Step 7: Commit**

```bash
git add tailwind.config.js src/renderer
git rm src/renderer/src/components/shared/DualMoneyDisplay.tsx
git commit -m "refactor(ui): eliminar el alias glow, recortar radios y cerrar la migracion"
```

---

## Resumen de verificación por pista

| Pista | Compuerta automática | Verificación manual |
|---|---|---|
| A | `tests/precios.test.ts`, `tests/precios-escenarios.test.ts`, `tests/smoke.test.ts` | Cotizar un perfume de $128 y confirmar C$7,000 |
| B | `tests/estados.test.ts`, `tests/numeros.test.ts`, `tests/smoke.test.ts` | Recorrer un pedido hasta `ENTREGADO`; escribir `36,62` en Configuración |
| C | `npm run build` y los cuatro greps de guardia | Los ocho pasos de `REVISION_FASE1.md` |
