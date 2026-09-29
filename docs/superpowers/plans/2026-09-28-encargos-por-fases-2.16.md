# Encargos por fases (2.16.0): plan paso a paso

> **Para quien lo ejecute**: se sigue tarea por tarea, con las casillas
> (`- [ ]`). Cada tarea termina en un commit que pasa `typecheck` y `npm test`.

**Objetivo**: que un encargo siga el camino real de Ross (buscar, mandar la
cotización, esperar respuesta, comprar, recibir, entregar), con una pantalla
que lo muestre por fases y formularios que no pierdan lo escrito.

**Arquitectura**: la fase se deriva de lo guardado (`core/encargos.ts`), como
hoy la etapa. No hay estado nuevo: `COTIZADA` es "todavía no aceptó" y
`PENDIENTE` es "aceptó". Los campos nuevos son opcionales, así que un encargo
viejo se lee sin migración.

**Diseño**: [PLAN_ENCARGOS_Y_SIN_CONEXION.md](../../PLAN_ENCARGOS_Y_SIN_CONEXION.md),
sección 2. Este documento lo baja a pasos.

## Reglas de todo el trabajo

- Dinero en centavos enteros; fechas de negocio en `YYYY-MM-DD` de Managua
  (`hoyISO()`), igual que `comprado_el`.
- Toda escritura nueva registra su evento con `valor_anterior`, para que
  deshacer funcione.
- Ninguna consulta nueva a Firestore: los avisos salen de la instantánea del
  panel.
- Los `aria-label` de los formularios no cambian: las pruebas los usan.
- No encadenar `grep` después de `vitest` sin `set -o pipefail`.
- Una prueba que pasa a la primera no prueba nada: cada tarea de lógica
  **siembra su error** y comprueba que la prueba falle.

## Dos ajustes al diseño, encontrados al leer el código

1. **La cotización lleva versión, no sólo fecha.** Comparar la fecha de
   cotizar contra la de mandar falla cuando las dos caen en el mismo instante
   (en las pruebas pasa seguido). Se guardan `cotizacion_version` (sube cada
   vez que cambia un precio o se descarta una pieza) y
   `cotizacion_enviada_version` (la que se mandó). "Por mandar" es "nunca se
   mandó, o se mandó otra versión". Las fechas (`cotizado_el`,
   `cotizacion_enviada_el`, `aceptado_el`, `descartada_el`) quedan para
   mostrar y para los avisos, en `YYYY-MM-DD`.
2. **"Aceptó" con pago: primero el pago, después aceptar.** Deshacer rechaza
   un grupo si el documento cambió después del evento que lo restaura
   ([eventos.repo.ts:170-181](../../../src/main/firebase/repositories/eventos.repo.ts#L170-L181)).
   Si se acepta y después se paga, el pago toca la venta y el deshacer del
   grupo queda bloqueado. Con el pago primero, `aceptar` es lo último que toca
   la venta y su instantánea ya incluye el pago.
   Además, un pago que acepta el encargo guarda ahora la instantánea de la
   venta: hoy, deshacer ese pago borra el pago pero deja el encargo confirmado.

---

### Tarea E0: la pantalla sin publicar, adoptada

**Archivos**: `src/renderer/src/views/EncargosView.tsx`,
`src/renderer/src/views/encargos/NuevoEncargoModal.tsx`, `src/renderer/src/App.tsx`,
`src/core/encargos.ts` (`quePidio`), `src/main/firebase/repositories/ventas.repo.ts`
(`que_pidio`), `src/shared/types.ts`, `tests/lotes-y-encargos.test.ts`,
`tests/interfaz-escritorio/pruebas.py`.

- [ ] Correr `npm run test:interfaz-escritorio` con el árbol como está y anotar
      qué casos de encargos fallan (hoy buscan los encargos en `VentasView`).
- [ ] Pasar esos casos a la pantalla nueva sin cambiar lo que comprueban: la
      etapa en la lista, anular con la pieza llegada, "Ya lo compré" y el
      paquete que la ofrece, anotar sin precio y cotizar.
- [ ] `npm run typecheck`, `npm test`, `npm run test:interfaz-escritorio`.
- [ ] Commit: `encargos: pantalla propia, fuera de la de ventas`.

### Tarea E1: el modelo y la fase

**Archivos**: `src/shared/types.ts`, `src/core/fechas.ts`, `src/core/encargos.ts`,
`src/core/cobranza.ts`, `tests/encargos-etapa.test.ts`.

**Produce** (lo usan E2 a E6):

```ts
// types.ts
export type MotivoAnulacion = 'NO_SE_CONSIGUIO' | 'NO_ACEPTO';
// PiezasEncargo: + descartadas?: number
// VentaLinea: + descartada_el?: string
// Venta: + cotizado_el?, cotizacion_version?, cotizacion_enviada_el?,
//          cotizacion_enviada_version?, aceptado_el?

// fechas.ts
export function diasEntre(desdeISO: string, hastaISO: string): number;

// encargos.ts
export type EtapaEncargo = 'POR_BUSCAR' | 'POR_MANDAR' | 'ESPERANDO' | 'POR_COMPRAR'
  | 'EN_CAMINO' | 'POR_ENTREGAR' | 'ENTREGADO' | 'ANULADO';
export const FASES_EN_CURSO: readonly EtapaEncargo[];
export type EstadoPieza = 'DESCARTADA' | 'POR_COMPRAR' | 'COMPRADA' | 'EN_CAMINO' | 'LLEGO' | 'DE_BODEGA';
export function etapaEncargo(v: EncargoParaEtapa): EtapaEncargo;
export function textoEtapa(v: EncargoParaEtapa, hoy: string): string;
export function recalcularEncargo(venta: EncargoParaRecalcular, lineas: LineaParaRecalcular[],
  anticipoDefectoBp: number): EncargoRecalculado;
export function descartable(p: PiezaParaEtapa & { lotes_consumidos?: unknown[] }): boolean;

// cobranza.ts
export function pagoAcepta(p: { pagado_usd_cents: number; anticipo_esperado_usd_cents: number }): boolean;
```

- [ ] **Pruebas primero**, en `tests/encargos-etapa.test.ts`:

```ts
describe('las fases de un encargo', () => {
  const cot = (lineas: Parameters<typeof piezasDe>[0], extra = {}) =>
    ({ estado: 'COTIZADA' as const, piezas: piezasDe(lineas), ...extra });

  it('sin precio: por buscar', () => {
    expect(etapaEncargo(cot([{ precio_unitario_usd_cents: 0 }]))).toBe('POR_BUSCAR');
  });
  it('con precio y nunca mandada: por mandar', () => {
    expect(etapaEncargo(cot([{ precio_unitario_usd_cents: 4500 }]))).toBe('POR_MANDAR');
  });
  it('mandada, con la misma versión: esperando respuesta', () => {
    const v = cot([{ precio_unitario_usd_cents: 4500 }],
      { cotizacion_version: 2, cotizacion_enviada_version: 2, cotizacion_enviada_el: '2026-09-25' });
    expect(etapaEncargo(v)).toBe('ESPERANDO');
    expect(textoEtapa(v, '2026-09-28')).toBe('Esperando respuesta · hace 3 días');
  });
  it('cambió el precio después de mandarla: otra vez por mandar', () => {
    const v = cot([{ precio_unitario_usd_cents: 4500 }],
      { cotizacion_version: 3, cotizacion_enviada_version: 2, cotizacion_enviada_el: '2026-09-25' });
    expect(etapaEncargo(v)).toBe('POR_MANDAR');
    expect(textoEtapa(v, '2026-09-28')).toBe('Por mandar · cambió el precio');
  });
  it('una pieza no conseguida no traba a las demás', () => {
    const v = cot([{ precio_unitario_usd_cents: 4500 }, { precio_unitario_usd_cents: 0, descartada_el: '2026-09-27' }]);
    expect(v.piezas).toMatchObject({ total: 2, descartadas: 1, sin_precio: 0 });
    expect(etapaEncargo(v)).toBe('POR_MANDAR');
  });
  it('todo sin conseguir: por buscar, y lo dice', () => {
    const v = cot([{ precio_unitario_usd_cents: 0, descartada_el: '2026-09-27' }]);
    expect(etapaEncargo(v)).toBe('POR_BUSCAR');
    expect(textoEtapa(v, '2026-09-28')).toBe('No se consiguió nada');
  });
  it('aceptó sin anticipo: por comprar, y lo dice', () => {
    const v = { estado: 'PENDIENTE' as const, piezas: piezasDe([{ precio_unitario_usd_cents: 4500 }]),
      pagado_usd_cents: 0, anticipo_esperado_usd_cents: 2250 };
    expect(etapaEncargo(v)).toBe('POR_COMPRAR');
    expect(textoEtapa(v, '2026-09-28')).toBe('Por comprar · sin anticipo');
  });
  it('comprado antes de que acepte: esperando, ya comprado', () => {
    const v = cot([{ precio_unitario_usd_cents: 4500, comprado_el: '2026-09-26' }],
      { cotizacion_version: 1, cotizacion_enviada_version: 1, cotizacion_enviada_el: '2026-09-25' });
    expect(textoEtapa(v, '2026-09-28')).toBe('Esperando respuesta · ya comprado');
  });
  it('los motivos de un anulado', () => {
    expect(textoEtapa({ estado: 'CANCELADA', motivo_anulacion: 'NO_ACEPTO' }, '2026-09-28')).toBe('No aceptó');
    expect(textoEtapa({ estado: 'CANCELADA', motivo_anulacion: 'NO_SE_CONSIGUIO' }, '2026-09-28')).toBe('No se consiguió');
    expect(textoEtapa({ estado: 'CANCELADA' }, '2026-09-28')).toBe('Anulado');
  });
  it('un encargo viejo: cotizado con precio queda por mandar; confirmado, por comprar', () => {
    expect(etapaEncargo({ estado: 'COTIZADA' })).toBe('POR_MANDAR');
    expect(etapaEncargo({ estado: 'PENDIENTE' })).toBe('POR_COMPRAR');
  });
});

describe('quién confirma un encargo', () => {
  it('con anticipo de 0%, cotizar ya no confirma: falta que acepte', () => {
    expect(estadoInicialEncargo({ total_usd_cents: 5000, pagado_usd_cents: 0, anticipo_esperado_usd_cents: 0 })).toBe('COTIZADA');
  });
  it('quien paga, aceptó', () => {
    expect(pagoAcepta({ pagado_usd_cents: 1, anticipo_esperado_usd_cents: 0 })).toBe(true);
    expect(pagoAcepta({ pagado_usd_cents: 2499, anticipo_esperado_usd_cents: 2500 })).toBe(false);
    expect(pagoAcepta({ pagado_usd_cents: 0, anticipo_esperado_usd_cents: 0 })).toBe(false);
  });
  it('un total en cero no se confirma, aunque no deba nada', () => {
    expect(estadoInicialEncargo({ total_usd_cents: 0, pagado_usd_cents: 0, anticipo_esperado_usd_cents: 0 })).toBe('COTIZADA');
  });
});

describe('recalcular un encargo', () => {
  it('una pieza descartada sale del total, el costo y el anticipo', () => {
    const r = recalcularEncargo(
      { estado: 'COTIZADA', anticipo_bp: 5000, pagado_usd_cents: 0 },
      [
        { id: 1, precio_unitario_usd_cents: 6000, cantidad: 1, subtotal_usd_cents: 6000, costo_total_usd_cents: 3800 },
        { id: 2, precio_unitario_usd_cents: 4000, cantidad: 1, subtotal_usd_cents: 0, costo_total_usd_cents: 0, descartada_el: '2026-09-27' },
      ],
      5000
    );
    expect([r.total_usd_cents, r.costo_total_usd_cents, r.anticipo_esperado_usd_cents, r.estado]).toEqual([6000, 3800, 3000, 'COTIZADA']);
  });
});
```

  Se actualizan las pruebas viejas que cambian a propósito: `'COTIZADO'` →
  `'POR_MANDAR'`, `'POR_COTIZAR'` → `'POR_BUSCAR'`, los `toEqual` de
  `piezasDe` suman `descartadas: 0`, y los `textoEtapa(etapa, piezas)` pasan
  a `textoEtapa(venta, hoy)`.

- [ ] Correr `npx vitest run tests/encargos-etapa.test.ts`: tienen que fallar
      por lo que falta, no por un error de sintaxis.
- [ ] Implementar (el código de la fase es el de la sección 2.3 del diseño,
      con el cambio a versiones):

```ts
export function etapaEncargo(v: EncargoParaEtapa): EtapaEncargo {
  if (v.estado === 'CANCELADA') return 'ANULADO';
  if (v.estado === 'ENTREGADA') return 'ENTREGADO';
  const p = v.piezas;
  if (p && (vivas(p) <= 0 || (p.sin_precio ?? 0) > 0)) return 'POR_BUSCAR';
  if (v.estado === 'COTIZADA') {
    const alDia = Boolean(v.cotizacion_enviada_el) &&
      (v.cotizacion_enviada_version ?? 0) === (v.cotizacion_version ?? 0);
    return alDia ? 'ESPERANDO' : 'POR_MANDAR';
  }
  if (!p || p.total === 0) return 'POR_COMPRAR';
  if (vivas(p) - p.compradas - p.de_bodega > 0) return 'POR_COMPRAR';
  if (p.llegadas + p.de_bodega < vivas(p)) return 'EN_CAMINO';
  return 'POR_ENTREGAR';
}
```

  `estadoPieza` devuelve `'DESCARTADA'` antes que todo lo demás; `sinPrecio`
  da `false` para una descartada; `piezasDe` la cuenta sólo en `total` y
  `descartadas`; `sinPaquete` resta las descartadas. `recalcularEncargo` es
  la cuenta de [ventas.repo.ts:761-788](../../../src/main/firebase/repositories/ventas.repo.ts#L761-L788)
  movida tal cual, más `estadoInicialEncargo` para el estado.
  `estadoInicialEncargo` queda:

```ts
if ((params.sin_precio ?? 0) > 0) return 'COTIZADA';
if (total_usd_cents <= 0) return 'COTIZADA';
if (pagado_usd_cents >= total_usd_cents) return 'PENDIENTE';
return pagoAcepta({ pagado_usd_cents, anticipo_esperado_usd_cents }) ? 'PENDIENTE' : 'COTIZADA';
```

- [ ] `tsc` va a marcar cada uso de `POR_COTIZAR`, `COTIZADO` y del
      `textoEtapa` viejo. Arreglarlos en `EncargosView`, `panel.repo.ts`,
      `AnularEncargoModal`, `CotizarEncargoModal` y `mock-api.ts` con el cambio
      mínimo. `VentasView` y `VentaEditor` pierden su modo encargo en esta
      tarea (sección 1, punto 7 del diseño), así no se arreglan dos veces.
- [ ] Sembrar el error: que `etapaEncargo` ignore la versión (`alDia =
      Boolean(v.cotizacion_enviada_el)`). La prueba "cambió el precio" tiene
      que fallar. Deshacerlo.
- [ ] `npm run typecheck`, `npm test`. Commit: `encargos: las fases, derivadas de lo guardado`.

### Tarea E2: los repositorios

**Archivos**: `src/main/firebase/repositories/ventas.repo.ts`,
`src/main/firebase/repositories/pagos.repo.ts`,
`src/main/firebase/services/encargos.service.ts` (nuevo),
`tests/encargos-fases.test.ts` (nuevo).

**Produce**:

```ts
VentasRepoFirestore.marcarEnviada(venta_id: number, evento_grupo_id: string): Promise<void>
VentasRepoFirestore.aceptar(venta_id: number, evento_grupo_id: string): Promise<void>   // no hace nada si ya aceptó
VentasRepoFirestore.descartarPiezas(venta_id: number, linea_ids: readonly number[], descartar: boolean,
  evento_grupo_id: string): Promise<void>
// LineaCotizacion: + descartada?: boolean
// services/encargos.service.ts
export async function aceptarEncargo(venta_id: number, pago: PagoAlAceptar | undefined,
  evento_grupo_id: string): Promise<void>
// PagoAlAceptar = Omit<RegistrarPagoInput, 'venta_id' | 'es_anticipo' | 'cuota_id'>
```

- [ ] **Pruebas primero**, en `tests/encargos-fases.test.ts`, con el mismo
      arranque que `tests/lotes-y-encargos.test.ts` (Firestore falso,
      parámetros cargados). Casos:
  1. anotar con todo el precio: `POR_MANDAR`, `cotizado_el` de hoy;
  2. `marcarEnviada`: `ESPERANDO`, `cotizacion_enviada_el` de hoy;
  3. cotizar otro precio después de mandarla: `POR_MANDAR` otra vez;
  4. `aceptar` sin anticipo: `PENDIENTE`, `aceptado_el` de hoy, y
     `Panel.cargar(true).resumen.por_cobrar_usd_cents` cuenta el total;
  5. `aceptarEncargo` con un pago menor que el anticipo: queda aceptado y el
     pago existe; `Eventos.deshacerGrupo` lo deja `COTIZADA`, sin pago y con
     el saldo de antes;
  6. un pago que cubre el anticipo acepta y escribe `aceptado_el`; deshacerlo
     lo vuelve a `COTIZADA` (hoy queda confirmado: es el arreglo del segundo
     ajuste);
  7. `descartarPiezas` recalcula total, costo, saldo y anticipo; el
     encargo sigue en su fase con lo que queda;
  8. descartar una pieza comprada se rechaza con `/ya se compró/`;
  9. descartar con lo pagado por encima del total nuevo se rechaza con
     `/Corregí el pago/`;
  10. "volver a buscar" una descartada le devuelve su precio al total;
  11. entregar ignora las piezas descartadas (no pide precio ni stock);
  12. un anticipo del 0% ya no confirma al cotizar;
  13. crear un encargo ya pagado escribe `aceptado_el` con la fecha del
      encargo (así el aviso "aceptó hace N días" cuenta desde ahí);
  14. deshacer `marcarEnviada`, `aceptar` y `descartarPiezas`.
- [ ] Correrlas y verlas fallar.
- [ ] Implementar. Cada método nuevo sigue el patrón de `cotizar`: una
      transacción que lee la venta, valida, escribe con `actualizado_en`, y
      después `EventosRepoFirestore.registrarEvento` con `tipo_evento:
      'ACTUALIZACION'` y `valor_anterior`. `aceptar` y `descartarPiezas`
      llaman a `ClientesRepoFirestore.refrescarTotales` y
      `ResumenesRepoFirestore.invalidarPorFecha`, porque cambian la deuda.
      `aceptarEncargo`:

```ts
export async function aceptarEncargo(venta_id: number, pago: PagoAlAceptar | undefined, grupo: string) {
  // Primero el pago: así `aceptar` es lo último que toca la venta y deshacer
  // el grupo restaura una instantánea que ya incluye el pago.
  if (pago && pago.monto_cents > 0) {
    await PagosRepoFirestore.registrar({ ...pago, venta_id, es_anticipo: true }, grupo);
  }
  await VentasRepoFirestore.aceptar(venta_id, grupo); // si el pago ya lo aceptó, no hace nada
}
```

  En `pagos.repo.ts`, la condición de la línea 146 pasa a
  `pagoAcepta({ pagado_usd_cents: pagado, anticipo_esperado_usd_cents: anticipoEsperado })`,
  escribe `aceptado_el: hoyISO()`, y cuando acepta registra además el evento
  `ACTUALIZACION` de la venta con la instantánea de antes del pago.
  En `validarCambio` (entregar), el control de "no tiene precio" y el de la
  bodega saltan las piezas `DESCARTADA`.
- [ ] Sembrar el error: en `aceptarEncargo`, aceptar antes de pagar. El caso 5
      tiene que fallar en el deshacer. Deshacerlo.
- [ ] Contadores de lecturas en `tests/integracion.test.ts`: `marcarEnviada`,
      `aceptar` y `descartarPiezas` leen la venta y, a lo sumo, los parámetros.
- [ ] `npm run typecheck`, `npm test`, `npm run emulador` + `npm run test:emulador`
      (los campos nuevos pasan las reglas). Commit: `encargos: mandar, aceptar y descartar, con deshacer`.

### Tarea E3: el IPC y el simulador

**Archivos**: `src/shared/ipc-channels.ts`, `src/shared/ipc-contracts.ts`,
`src/preload/api.ts`, `src/main/ipc/index.ts`, `src/renderer/src/mock-api.ts`.

**Produce**, en `ApiPuente`:

```ts
ventas.marcarEnviada(id: number): Promise<Resultado<ConGrupo>>;
ventas.aceptar(id: number, pago?: PagoAlAceptar): Promise<Resultado<ConGrupo>>;
ventas.descartarPiezas(id: number, linea_ids: number[], descartar: boolean): Promise<Resultado<ConGrupo>>;
documentos.prepararCotizacion(input: { codigo: string; html: string }): Promise<Resultado<{ ruta: string }>>;
```

- [ ] Canales y contrato; `tsc` obliga a completar el preload y el simulador.
- [ ] `prepararCotizacion` en el main: `printToPDF` como `guardarPdf`
      ([ipc/index.ts:461-471](../../../src/main/ipc/index.ts#L461-L471)), escrito en
      `app.getPath('documents')/Glow Heaven/Cotizaciones/<codigo>.pdf`, y
      `shell.showItemInFolder(ruta)`.
- [ ] En el simulador, los tres métodos de ventas con la misma lógica de
      `core/encargos.ts` (versiones, fechas, recalcular), **devolviendo
      copias**. `prepararCotizacion` devuelve una ruta inventada.
- [ ] `npm run typecheck`. Commit: `encargos: los canales nuevos, y el simulador los imita`.

### Tarea E4: los avisos del panel

**Archivos**: `src/main/firebase/repositories/panel.repo.ts`,
`tests/motor-real/avisos-configurables.test.ts`.

- [ ] Pruebas primero: con `dias_alerta_encargos` en 10, un encargo mandado
      hace 12 días y sin respuesta avisa (`encargo-respuesta-<id>`, "Le
      mandaste la cotización a X hace más de 10 días"); uno mandado hace 3,
      no. Uno aceptado hace 12 días y sin comprar avisa con
      `encargo-comprar-<id>`, contando desde `aceptado_el` (y desde `fecha` si
      no lo tiene).
- [ ] Implementar sobre `s.ventas`, sin consultas nuevas. El destino del aviso
      pasa de `vista: 'ventas'` a `vista: 'encargos'` en los cuatro avisos de
      encargos, y se comprueba en `App.tsx` que ese destino abre el detalle.
- [ ] Sembrar: que el aviso de respuesta use `fecha` en vez de
      `cotizacion_enviada_el`. Commit: `encargos: avisos de respuesta y de compra`.

### Tarea E5: el mensaje y la proforma

**Archivos**: `src/core/documentos/mensajes.ts`, `src/core/documentos/plantillas.ts`,
`tests/documentos.test.ts`, `tests/whatsapp.test.ts`.

- [ ] Pruebas primero: un encargo con `anticipo_bp: 3000` dice "Anticipo
      requerido (30%)"; uno con una pieza descartada nombra "No conseguimos:
      Perfume raro" en el mensaje y la proforma no la lista entre los
      productos cotizados. Una plantilla propia sin `{no_conseguido}` recibe esa
      línea al final, para que la clienta no crea que se cotizó todo.
- [ ] Implementar: placeholders `{anticipo_pct}` y `{no_conseguido}` en la
      plantilla por defecto; el porcentaje sale de `anticipo_bp` o, si falta,
      de `anticipo_esperado / total`.
- [ ] Commit: `encargos: el mensaje dice el anticipo real y lo que no se consiguió`.

### Tarea E6: la pantalla por fases

**Archivos**: `src/renderer/src/views/EncargosView.tsx`,
`src/renderer/src/views/ventas/CotizarEncargoModal.tsx`,
`src/renderer/src/views/ventas/AnularEncargoModal.tsx`,
`src/renderer/src/views/encargos/MandarCotizacionModal.tsx` (nuevo),
`src/renderer/src/views/encargos/AceptarEncargoModal.tsx` (nuevo),
`tests/interfaz-escritorio/pruebas.py`.

- [ ] **Barra de fases**, un grupo de botones con `aria-pressed`, en el orden de
      `FASES_EN_CURSO` más "Cerrados", cada uno con su conteo. Reemplaza las
      tarjetas y las pestañas. Sin filtro, la lista va agrupada por fase con
      un título por grupo (`<h3>` con el nombre y el conteo).
- [ ] **Fila**: clienta, qué pidió, `textoEtapa(v, hoyISO())`, total, debe y
      el menú "⋮" (`ContextMenu`), con las mismas acciones que el detalle.
- [ ] **Detalle**: el orden de la sección 2.6 del diseño. El progreso son seis
      puntos con `aria-label="Fase N de 6: <nombre>"`. El botón principal sale
      de una función pura `siguientePaso(v)` en la vista.
- [ ] **Cotizar**: por pieza, un interruptor "No se consiguió" que manda
      `descartada: true` en su `LineaCotizacion` y apaga sus campos.
- [ ] **Mandar cotización** (nuevo): mensaje editable (de
      `mensajeWhatsappDocumento`), la proforma en un `iframe` con `srcdoc`,
      "Abrir WhatsApp" (`documentos.prepararCotizacion`, después `window.open`
      del `wa.me`, después `ventas.marcarEnviada`) y "Ya la mandé por otro
      lado" (sólo `marcarEnviada`). Si la clienta no tiene teléfono, "Abrir
      WhatsApp" se apaga y lo dice.
- [ ] **Aceptó** (nuevo): "¿Pagó algo ya?" con dos opciones: "Todavía no", o
      el monto (arranca en el anticipo que falta), la moneda y el método, con
      los mismos campos que `PagoModal`. Llama a `ventas.aceptar`.
- [ ] **Ya lo compré**, con el anticipo sin cubrir: `Confirmar` con "Ana no
      pagó el anticipo de $25.00. ¿Lo compraste igual?" y el foco en "Todavía
      no".
- [ ] **Anular**: el motivo tiene tres opciones (Ya no lo quiere, No aceptó, No
      se consiguió), y arranca en la que corresponde a la fase.
- [ ] Caso nuevo en `pruebas.py`, de punta a punta con el simulador: anotar dos
      piezas sin precio, cotizar una y marcar la otra "No se consiguió",
      mandar ("Ya la mandé por otro lado"), aceptar sin anticipo, "Ya lo
      compré" (aparece el aviso del anticipo y se confirma), meterla en un
      paquete, recibirlo y entregar. En cada paso, la fase de la fila.
- [ ] `npm run test:interfaz-escritorio`. Commit: `encargos: la pantalla por fases`.

### Tarea E7: los formularios de encargos, con la guía de Emil

**Archivos**: `src/renderer/src/components/ui/Dialogo.tsx` (nuevo),
`src/renderer/src/lib/useCambiosSinGuardar.ts` (nuevo),
`src/renderer/src/index.css`, `src/renderer/src/temas.css`, y los formularios
de la 2.16: nuevo pedido, cotizar, mandar, aceptó, anular y `PagoModal`.

- [ ] `Dialogo`: el `Portal`, el velo, Escape, el foco inicial, la salida de
      120 ms (se queda montado hasta que termina, con `data-estado="saliendo"`)
      y, si `hayCambios`, la pregunta antes de cerrar ("¿Descartar lo que
      escribiste?", foco en "Seguir editando"). `Ctrl+Enter` llama a `onEnviar`.
- [ ] Cada formulario de la lista pasa a `Dialogo` y aplica la tabla de la
      sección 5.1 del diseño: errores en su campo con el foco en el primero,
      foco en la pieza nueva, desplegable de clientas con su entrada, el
      precio sugerido que se ilumina al tomarlo, y "Guardar" de ancho fijo.
- [ ] `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` en `temas.css`, y las
      animaciones de `index.css` que usan la curva vieja pasan a la variable.
      Con `prefers-reduced-motion`, la salida y la fila nueva quedan sólo en
      opacidad.
- [ ] Caso en `pruebas.py`: escribir una pieza, apretar Escape, ver la
      pregunta, elegir "Seguir editando" y encontrar lo escrito.
- [ ] En el mensaje del commit, la tabla antes/después de cada formulario.
      Commit: `formularios de encargos: no pierden lo escrito, y el error está en su campo`.

### Tarea E8: verificación y publicación

- [ ] `npm run typecheck`, `tsc -p mobile/tsconfig.json --noEmit`, `npm test`,
      `npm run test:emulador`, `npm run test:interfaz`,
      `npm run test:interfaz-escritorio`, `npm run auditar:colores`,
      `npm run auditar:indices`, `npm run auditar:hooks`.
- [ ] Una lectura de producción: cuántos encargos hay y en qué estado, para
      confirmar que no hace falta migrar nada (`probar:produccion` o
      `respaldar-produccion.mjs`).
- [ ] **Con el visto bueno de Joswill**: prueba en la app instalada contra la
      base real con datos "Prueba" (CONTEXTO_SESION §6), limpieza y
      comparación en cero.
- [ ] **Con el visto bueno de Joswill**: versión 2.16.0, `build:exe`, el
      `latest.yml` verificado, `gh release create` con el SHA completo, y la
      PWA con `build:mobile` y `desplegar-movil.mjs`.
- [ ] `CONTEXTO_SESION.md`, `AGENTS.md` y el "Estado al …" del plan.
