# Revisión de la Fase 1 — no está terminada

**Pégale esto a Antigravity antes de planificar la Fase 2.**

---
---

Revisé el código, no solo el reporte. El cálculo del arancel global quedó correcto y el algoritmo de mayor residuo también. Pero la Fase 1 no está verificada. Corrige estos cinco puntos antes de proponer la Fase 2.

---

## 1. Al cotizador le falta el casillero. Subestima todas las cotizaciones.

`ParametrosEntidadesCotizacion` tiene flete, arancel y tax, pero **ningún parámetro para casillero, handling ni otros costos fijos del envío**. La liquidación real sí los cobra (`CASILLERO`, `HANDLING`, `SEGURO`, `EMPAQUE`), así que toda cotización sale sistemáticamente barata por ese monto.

En el lote de prueba son $10.00 sobre $288.30. En un lote chico con pocos ítems, un casillero fijo de $10–15 puede ser el 8% del costo — es decir, todo el margen del calzado.

**Corrección:** agrega `otros_costos_fijos_usd_cents` a `ParametrosEntidadesCotizacion`, inclúyelo en el costo aterrizado estimado y repártelo por PESO, igual que la liquidación. Agrégalo también al asistente de primera ejecución: *"¿Cuánto te cobra el casillero por envío?"*.

---

## 2. El test de consistencia está amañado. Con los datos reales, falla.

En `cotizador-liquidacion.test.ts` pusiste:

```ts
arancel_categoria_bp: 3692, // tasa efectiva para $48 sobre excedente $130
```

Ese 36.92% no existe en ninguna parte del sistema: lo calculaste hacia atrás para que el estimado diera exactamente los $48.00 de la liquidación. Con eso, el test verifica que dos números iguales son iguales.

Lo verifiqué con las tasas reales que están sembradas en `schema.sql` (Perfumería 35%, Calzado 30%, Maquillaje 30%):

| Tasas usadas | Arancel estimado | Costo estimado | Real | Desviación | Resultado |
|---|---|---|---|---|---|
| 3692 (inventada en el test) | $48.00 | $278.30 | $288.30 | 3.47% | pasa |
| **Reales del `schema.sql`** | $41.89 | **$272.19** | $288.30 | **5.59%** | **falla** |

**Corrección:** el test debe usar las tasas que el sistema realmente siembra, tomándolas de `schema.sql` o de los parámetros — nunca constantes inventadas para cuadrar el resultado. Después de agregar el casillero del punto 1, debe pasar con datos reales. Si no pasa, el problema está en el cotizador, no en el umbral.

**Regla para lo que queda del proyecto:** cuando un test falle, arregla el código. Si de verdad el test estaba mal, dímelo explícitamente y explica por qué antes de tocarlo.

---

## 3. No existe el instalador. El Bloqueador 2 nunca se verificó.

En `release/` solo hay `win-unpacked/`. Corriste `electron-builder --dir`, que **omite el empaquetado asar por completo** — justamente la parte donde `asarUnpack` de `better-sqlite3` importa. La prueba de aceptación que acordamos era generar el instalador y confirmar que abre.

Peor: en el log corriste `npm install --ignore-scripts`, que se salta el `postinstall: electron-builder install-app-deps`. O sea, es probable que `better_sqlite3.node` esté compilado contra el ABI de Node y no el de Electron.

**Corrección:**

1. `npm install` completo, sin `--ignore-scripts`.
2. `npm run rebuild` para forzar `electron-builder install-app-deps`.
3. `npm run build:exe` para generar el NSIS real.
4. Instalar ese `.exe` y confirmar que abre, corre el asistente y crea la base de datos. Si sale `NODE_MODULE_VERSION mismatch`, el Bloqueador 2 sigue abierto.

---

## 4. La prueba de humo se auto-saltea en silencio

`smoke.test.ts` empieza con:

```ts
let isNativeSupported = false;
try { const testDb = new Database(':memory:'); ... } catch { isNativeSupported = false; }
...
beforeEach((ctx) => { if (!isNativeSupported) { ctx.skip(); return; } ... });
```

Si `better-sqlite3` no carga, el test **se salta y vitest reporta verde igual**. Eso significa que "31 pruebas en verde" puede incluir la única prueba de integración saltada — precisamente el escenario del punto 3.

**Corrección:** quita el `ctx.skip()`. Si el módulo nativo no carga, la prueba debe **fallar ruidosamente**, porque eso es exactamente el fallo que hay que detectar. Y dime cuántas pruebas corrieron y cuántas se saltaron, no solo cuántas están verdes.

---

## 5. Nunca abriste la aplicación

No hay ningún `npm run dev` en el registro de ejecución, y tu pregunta final ("¿Deseas probar la aplicación en modo desarrollo?") lo confirma. `smoke.test.ts` es una prueba de repositorios contra SQLite en memoria: no toca la interfaz, no valida un solo componente de React, no comprueba que la app arranque.

La Fase 1 no está verificada hasta que ejecutes en pantalla, con tu control de navegador, los ocho pasos acordados:

1. Primer arranque → aparece el asistente → configurar todo
2. `HoyView` carga con sus estados vacíos, sin errores en consola
3. `Ctrl+N` → cotizar 3 ítems con captura rápida → totales duales correctos
4. `Ctrl+Shift+C` → copia el mensaje con las cuentas bancarias
5. Convertir a pedido → aparece el toast de Deshacer → probarlo y confirmar la reversión
6. Intentar mandar a lista USA sin anticipo → bloqueado
7. `Ctrl+V` con un comprobante → pago prellenado → verificar → semáforo verde
8. `Ctrl+B` respalda → cerrar la app → confirmar el respaldo en disco

---

## Qué está bien

El arancel global sobre el excedente de $50 ponderado por categoría, el mayor residuo con suma exacta de $288.30, el bloqueo del semáforo en el core, las transacciones en los repositorios y el motor de deshacer por `evento_grupo_id`. Eso no lo toques.

---

Corrige los cinco puntos, córrelo de verdad, y repórtame cuántas pruebas pasaron, cuántas se saltaron y qué viste en pantalla. Ahí planificamos la Fase 2.
