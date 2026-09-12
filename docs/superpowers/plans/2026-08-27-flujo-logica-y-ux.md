# Flujo de trabajo, lógica y experiencia de uso — Análisis y plan

> **Para Gemini 3.7 Flash.** Este documento asume que no conocés el proyecto. Todo lo que necesitás está acá. Leé la sección "Cómo trabajar" antes de tocar nada.

**Objetivo:** cerrar los huecos del flujo de trabajo que hacen que la aplicación pierda plata en silencio, complete solo la mitad del proceso de negocio que dice soportar, y sea inoperable con teclado.

**Estado de partida:** el rediseño visual ya está terminado y no es parte de este plan. La paleta azul, la escala tipográfica y los primitivos están en su lugar; las compuertas visuales están en cero. **No rehagas trabajo visual.**

**Stack:** Electron 34, React 18, TypeScript 5.7 (`strict`), Tailwind 3.4, better-sqlite3 11, Vitest 3. Todo el código y la interfaz están en español.

**Rama:** `refactor/precios-bugs-ui`. No crear ramas. No hacer merge a `master` sin permiso del dueño.

---

## Cómo trabajar

Reglas de proceso. No son sugerencias.

1. **Una tarea a la vez, en orden.** No empieces la Task N+1 hasta que la Task N esté commiteada con las pruebas en verde.
2. **Después de cada tarea corré las dos compuertas:**
   ```bash
   node ./scripts/run-test.js run
   npm run build
   ```
   Las pruebas se corren **solo** con ese comando, nunca con `npx vitest`: el runner arranca vitest bajo Electron para que cargue `better-sqlite3`.
3. **Escribí la prueba primero.** Corréla, vela fallar, después implementá. Una prueba que pasa antes de tu cambio no está probando tu cambio.
4. **No refactorices más allá de la tarea.** Si ves algo feo que la tarea no menciona, anotalo en tu reporte y seguí.
5. **Si algo no te cierra, parate y reportá.** No adivines. Trabajo malo es peor que trabajo no hecho.
6. **No toques archivos que la tarea no lista.**
7. **Cada tarea es un commit** con el mensaje que la tarea indica.
8. **Nunca modifiques una prueba existente para que pase.** Si una prueba existente se pone roja, tu cambio la rompió. Arreglá el código.

### Reglas del dominio (rompen el programa si las violás)

- **El dinero es siempre un entero de centavos** (`usd_cents`, `cor_cents`). Jamás float, ni siquiera como paso intermedio.
- **Pesos en milésimas de libra** (`peso_mlb`). **Porcentajes en basis points** (`bp`): 35% son 3500.
- **El tipo de cambio se congela por documento.** Un pedido usa `pedidos.tasa_cambio_cents`, nunca el parámetro global.
- **Toda mutación va dentro de `db.transaction()`** y escribe una fila en `eventos` con su `evento_grupo_id` (UUID).
- **Nada se borra físicamente.** Se marca `activo = 0` o estado `CANCELADO`.
- **La interfaz nunca muestra basis points ni centavos crudos.** Siempre "35%", "C$36.62", "$12.50".
- **Español nicaragüense claro, sin tecnicismos.** El dueño escribió los textos: no los reformules salvo que la tarea lo pida.
- **SQLite solo en el proceso main.** El renderer nunca toca la base; todo pasa por IPC tipado.
- `tsconfig.json` tiene `strict`, `noUnusedLocals` y `noUnusedParameters`: **un import huérfano rompe el build.**

### Un archivo que se olvida siempre

`src/renderer/src/mock-api.ts` implementa el mismo tipo que `src/preload/api.ts`. **Cada vez que agregues un método al API de IPC, tenés que agregarlo también ahí** o `tsc` falla. Y el mock debe comportarse como el canal real, incluyendo sus errores: un mock que siempre devuelve éxito enseña a no manejar el caso de error.

---

## El negocio, en una frase

Una persona compra productos en tiendas de Estados Unidos por encargo de clientes en Nicaragua, los trae por courier, y los entrega cobrando una comisión. La aplicación es su herramienta interna: una sola usuaria, una sola computadora, base de datos local.

## El flujo real de trabajo

```
  1. COTIZAR          El cliente pide algo. Se calcula el precio.
        │
  2. ENVIAR           Se le manda la cotización por WhatsApp.
        │
  3. ACEPTAR          El cliente dice que sí. Se vuelve pedido.
        │
  4. COBRAR ANTICIPO  50% o 70%. Se verifica en el banco.
        │
  5. COMPRAR EN USA   ◄── el trabajo diario real
        │
  6. TRAER            Courier, aduana, llega a Nicaragua.
        │
  7. ENTREGAR         Se cobra el saldo contraentrega.
        │
  8. CERRAR           Se sabe cuánto se ganó de verdad.
```

## Qué de eso está implementado

| Paso | Backend | Interfaz | Veredicto |
|---|---|---|---|
| 1. Cotizar | completo | completa | **OK** |
| 2. Enviar | canal `marcarEnviada` existe | **nunca se llama** | roto |
| 3. Aceptar | canales `aceptar` / `rechazar` existen | **nunca se llaman** | roto |
| 4. Cobrar anticipo | completo | completa | **con fallas graves** (ver P0) |
| 5. Comprar en USA | vista SQL `v_lista_compras_usa` existe | **no hay pantalla** | ausente |
| 6. Traer | tablas `lotes` / `lote_costos` existen | nada | Fase 2, fuera de alcance |
| 7. Entregar | máquina de estados completa | completa | OK |
| 8. Cerrar | vista SQL `v_margen_real` existe | **no hay pantalla** | ausente |

**El hallazgo estructural:** la aplicación sabe cotizar y cobrar, pero **no acompaña el paso 5, que es el trabajo diario de la usuaria**. Para saber qué comprar hoy tiene que abrir Pedidos, seleccionar uno por uno los que tengan anticipo verificado, y anotar a mano los productos. La consulta SQL que devuelve exactamente esa lista está escrita en el esquema desde el primer día y nada la usa.

Además el ciclo de vida de la cotización (`BORRADOR → ENVIADA → ACEPTADA / RECHAZADA / VENCIDA`) está modelado en la base, tiene sus canales IPC y su validador de transiciones, y **la interfaz solo ofrece "Convertir a Pedido"**. No se puede marcar una cotización como enviada, ni como rechazada, ni ver cuáles vencieron. El campo `valida_hasta` se guarda y no se lee nunca.

---

## Superficie muerta, medida

Diez canales IPC existen, están conectados al backend, y el renderer no los llama nunca:

```
cotizaciones.marcarEnviada     cotizaciones.aceptar      cotizaciones.rechazar
cotizaciones.getById           clientes.getById          pagos.listByPedido
vistas.getAlertas              vistas.getCapitalLibre    vistas.getSemaforo
adjuntos.guardarBuffer
```

Un canal más, `COTIZACIONES_UPDATE`, **está declarado en `ipc-channels.ts` y no tiene handler registrado**: si alguien lo llamara, la promesa nunca resolvería. Consecuencia práctica: una cotización guardada no se puede editar nunca.

Dos vistas SQL existen y nadie las consulta: `v_lista_compras_usa` y `v_margen_real`.

Nueve tablas del esquema no las toca ningún repositorio: `stock`, `rutas_entrega`, `plantillas_mensaje`, `cuentas_bancarias`, `alertas_sistema`, `historico_tasas`, `lotes`, `lote_costos`. Las de lotes son Fase 2 y están fuera de alcance. Pero `cuentas_bancarias` merece atención: existe como tabla **y además** las cuentas se guardan como JSON dentro de `parametros`. Hay dos fuentes de verdad para el mismo dato y solo una se usa.

---

## Hallazgos, por severidad

### P0 — La plata se puede perder o duplicar

**H1. El semáforo se pone verde con cualquier monto.**
`src/main/db/repositories/pagos.repo.ts:157-160`

```ts
let anticipoVerificado = pedido.anticipo_verificado;
if (tipo_pago === 'ANTICIPO' || tipo_pago === 'COMPLETO') {
  anticipoVerificado = 1;
}
```

Un pago de **C$1** marcado como ANTICIPO desbloquea la compra en Estados Unidos. El campo `pedidos.anticipo_esperado_cor_cents` guarda cuánto debería ser el anticipo, se calcula correctamente al convertir la cotización, y **nunca se compara con nada**.

Este es el mecanismo de seguridad sobre el que está construida toda la aplicación —el semáforo rojo/verde que impide comprar sin anticipo— y no verifica el monto.

**H2. Verificar dos veces resta dos veces.**
`pagos.repo.ts:108-142`

`verificar()` no comprueba si el pago ya estaba verificado. Aplica los efectos cada vez que se la llama con `verificado = true`. Hoy la interfaz solo muestra el botón cuando el pago no está verificado, así que no se dispara sola. Pero combinada con H3 sí se dispara.

**H3. Deshacer un pago no devuelve la plata al pedido.**
`src/main/db/repositories/eventos.repo.ts:83-95`

Al deshacer, el motor hace `UPDATE pagos SET verificado = 0`, y nada más. No restaura `pedidos.saldo_pendiente_cor_cents`, ni `saldo_pendiente_usd_cents`, ni `anticipo_verificado`, ni el estado de los ítems que habían avanzado a `ANTICIPO_OK`.

La secuencia completa que rompe la contabilidad:

```
verificar pago  →  saldo baja C$5,000, semáforo verde
deshacer        →  verificado = 0, pero el saldo sigue bajo y el semáforo sigue verde
verificar otra vez →  saldo baja OTROS C$5,000
```

El pedido queda cobrado el doble en los registros.

**H4. El sobrepago desaparece.**
`pagos.repo.ts:154-155`

```ts
const nuevoSaldoCor = Math.max(0, pedido.saldo_pendiente_cor_cents - monto_cor_cents);
```

Si el cliente paga de más, el excedente se descarta sin dejar rastro. No queda saldo a favor ni aviso.

### P0 — El programa dice que hizo algo que no hizo

**H5. Deshacer miente para tipos de entidad que no conoce.**
`eventos.repo.ts:59-98`

El motor maneja `PEDIDO_ITEM`, `COTIZACION`, `PEDIDO` y `PAGO`. Cualquier otro tipo cae por todas las ramas sin revertir nada. Y después, fuera del `if`:

```ts
db.prepare('DELETE FROM eventos WHERE evento_grupo_id = ?').run(grupoId);
revertido = true;
```

Borra el rastro de auditoría y **devuelve éxito**. La usuaria ve "Deshecho: Configuración actualizada", cree que se revirtió, y no se revirtió nada — además de perder el registro de que ocurrió.

Ya se dispara hoy: el canal de categorías escribe eventos de tipo `CATEGORIA`.

**H6. Deshacer revierte la acción equivocada.**
`eventos.repo.ts:35` y `src/renderer/src/context/ToastContext.tsx`

`deshacerUltimoGrupo()` no recibe parámetros: siempre revierte el grupo **más reciente**, no el del toast en que la usuaria hizo clic. Y el atajo `Ctrl+Z` toma el toast **más viejo** de la lista. Con dos acciones seguidas, deshace la que no era.

**H7. Deshacer una conversión deja la cotización sin salida.**
`src/main/db/repositories/cotizaciones.repo.ts:354` y `views/cotizador/HistorialCotizaciones.tsx`

Al convertir, la cotización pasa a `ACEPTADA`. Al deshacer, el pedido se marca `activo = 0` pero **la cotización se queda en `ACEPTADA`**. La interfaz solo ofrece "Convertir a Pedido" para estados `BORRADOR` y `ENVIADA`. Resultado: la cotización queda visible, aceptada, sin pedido, y sin ninguna forma de volver a convertirla.

### P1 — Falta el paso central del negocio

**H8. No existe la lista de compras.** Detallado arriba. Es la Task 8 y es la que más cambia el día de la usuaria.

**H9. El ciclo de vida de la cotización es inalcanzable.** Detallado arriba.

**H10. No se puede ver el historial de un cliente.** `clientes.getById` devuelve un `ClienteDetalle` con sus pedidos y pagos. Nadie lo llama. Para saber si un cliente debe plata hay que recorrer Pedidos a ojo.

**H11. Nunca se sabe cuánto se ganó de verdad.** `v_margen_real` compara el precio cobrado contra el costo real. `costo_aterrizado_real_cents` se inserta en 0 y no se actualiza nunca porque depende de la liquidación de lotes (Fase 2). Fuera de alcance para este plan, pero anotado para que no se pierda.

### P2 — Integridad y fugas

**H12.** El guardado de Configuración emite nueve `parametros.update` en un `Promise.all`, sin transacción (`views/ConfigView.tsx:122`). Un fallo parcial deja la configuración a medias. Viola la regla del dominio.

**H13.** `Ctrl+V` sin un pedido seleccionado adjunta el comprobante a `pedidos[0]`, un pedido arbitrario (`views/PedidosView.tsx:75`).

**H14.** `semaforoCounts.amarillo` nunca se incrementa (`App.tsx:106`): la rama ámbar de la cabecera es código muerto.

**H15.** El `value` de `ToastContext.Provider` es un objeto literal sin `useMemo`, y el `setInterval` de la cuenta regresiva no se limpia al cerrar el toast a mano.

**H16.** `URL.createObjectURL` nunca se revoca en `PagoModal`.

**H17.** Cambiar la moneda en `PagoModal` no reconvierte el monto ya escrito: se puede registrar $6,225 donde correspondía C$6,225.

### P3 — Accesibilidad y uso con teclado

Medido sobre todo el renderer:

| Señal | Cantidad | Consecuencia |
|---|---:|---|
| `aria-*` | **0** | Ningún estado se comunica a lectores de pantalla |
| `role=` | **0** | Los modales no se anuncian como diálogos |
| `htmlFor=` | **2** | Casi ninguna etiqueta está asociada a su campo |
| `focus:outline-none` | 3 | Anillo de foco eliminado en tres controles |
| `title=` | 17 | Se usa el tooltip como único medio de explicar un control: invisible con teclado |
| manejo de `Escape` | 2 | La mayoría de los modales no cierran con Escape |

**H18.** Es una aplicación de escritorio de uso intensivo con teclado (ya tiene `Ctrl+K`, `Ctrl+N`, `Ctrl+B`, `Ctrl+V`, `Ctrl+Z`), y sin embargo no se puede operar con teclado de forma confiable.

**H19. Puntos de corte muertos.** La ventana tiene `minWidth: 1024` (`src/main/windows/main.window.ts:15`). Los prefijos `sm:` (640px), `md:` (768px) y `lg:` (1024px) **siempre están activos**: 31 de 36 usos son ruido. Solo `xl:` (1280px) hace algo real.

---

## TAREAS

Ordenadas por riesgo. Las primeras cinco son de dinero y de honestidad del programa; hacelas antes que cualquier otra cosa.

---

### Task 1: El anticipo debe cubrir el monto esperado

**Archivos:** `src/main/db/repositories/pagos.repo.ts`, `tests/smoke.test.ts`

Resuelve H1.

- [ ] **Paso 1: Escribí la prueba y vela fallar**

En `tests/smoke.test.ts`, dentro del `describe` existente:

```ts
  it('un pago menor al anticipo esperado NO desbloquea la compra en USA', () => {
    // Armá un pedido con anticipo esperado de C$5,000 y pagá solo C$100.
    // Usá los mismos helpers que las pruebas vecinas para crear cliente,
    // cotización y pedido; mirá cómo lo hacen y copiá ese armado.
    const pedidoId = /* ... */;

    PagosRepo.create(
      {
        pedido_id: pedidoId,
        monto_cents: 10000, // C$100.00
        moneda_pago: 'COR',
        metodo_pago: 'TRANSFERENCIA_BAC',
        verificado: true,
        tipo_pago: 'ANTICIPO',
      },
      crypto.randomUUID()
    );

    const pedido = PedidosRepo.getById(pedidoId)!;
    expect(pedido.anticipo_verificado).toBe(false);
  });

  it('un pago que alcanza el anticipo esperado SÍ desbloquea la compra', () => {
    const pedidoId = /* mismo armado, anticipo esperado C$5,000 */;

    PagosRepo.create(
      {
        pedido_id: pedidoId,
        monto_cents: 500000, // C$5,000.00
        moneda_pago: 'COR',
        metodo_pago: 'TRANSFERENCIA_BAC',
        verificado: true,
        tipo_pago: 'ANTICIPO',
      },
      crypto.randomUUID()
    );

    const pedido = PedidosRepo.getById(pedidoId)!;
    expect(pedido.anticipo_verificado).toBe(true);
  });
```

```bash
node ./scripts/run-test.js run tests/smoke.test.ts
```

La primera debe fallar: hoy cualquier monto pone `anticipo_verificado` en `true`.

- [ ] **Paso 2: Compará contra lo acumulado, no contra el pago suelto**

En `aplicarEfectosVerificacion` (línea ~144), reemplazá el bloque de `anticipoVerificado`:

```ts
    // El anticipo se cumple cuando la SUMA de los anticipos verificados
    // alcanza lo esperado. Comparar solo el pago actual dejaría fuera el
    // caso de un cliente que abona en dos partes.
    let anticipoVerificado = pedido.anticipo_verificado;

    if (tipo_pago === 'ANTICIPO' || tipo_pago === 'COMPLETO') {
      const fila = db
        .prepare(`
          SELECT COALESCE(SUM(monto_cor_cents), 0) AS total
          FROM pagos
          WHERE pedido_id = ?
            AND activo = 1
            AND verificado = 1
            AND tipo_pago IN ('ANTICIPO', 'COMPLETO')
        `)
        .get(pedido_id) as { total: number };

      if (fila.total >= pedido.anticipo_esperado_cor_cents) {
        anticipoVerificado = 1;
      }
    }
```

**Importante sobre el orden:** esta consulta corre después de que el pago ya fue insertado con `verificado = 1`, así que el pago actual queda incluido en la suma. Verificá que sea así leyendo `create()` y `verificar()`: en ambos, la llamada a `aplicarEfectosVerificacion` ocurre después del INSERT o del UPDATE. Si no fuera así, la suma quedaría corta y ningún anticipo se cumpliría nunca.

- [ ] **Paso 3: Corré las compuertas y commiteá**

```bash
node ./scripts/run-test.js run
npm run build
git add src/main/db/repositories/pagos.repo.ts tests/smoke.test.ts
git commit -m "fix(pagos): el anticipo solo se cumple si el monto acumulado alcanza lo esperado"
```

---

### Task 2: Verificar un pago dos veces no puede restar dos veces

**Archivos:** `src/main/db/repositories/pagos.repo.ts`, `tests/smoke.test.ts`

Resuelve H2.

- [ ] **Paso 1: Escribí la prueba y vela fallar**

```ts
  it('verificar dos veces el mismo pago no descuenta el saldo dos veces', () => {
    const pedidoId = /* pedido con saldo conocido */;
    const saldoInicial = PedidosRepo.getById(pedidoId)!.saldo_pendiente_cor_cents;

    const pago = PagosRepo.create(
      {
        pedido_id: pedidoId,
        monto_cents: 100000,
        moneda_pago: 'COR',
        metodo_pago: 'TRANSFERENCIA_BAC',
        verificado: false,
        tipo_pago: 'SALDO',
      },
      crypto.randomUUID()
    );

    PagosRepo.verificar(pago.id, true, crypto.randomUUID());
    const saldoDespues = PedidosRepo.getById(pedidoId)!.saldo_pendiente_cor_cents;

    PagosRepo.verificar(pago.id, true, crypto.randomUUID());
    const saldoFinal = PedidosRepo.getById(pedidoId)!.saldo_pendiente_cor_cents;

    expect(saldoDespues).toBe(saldoInicial - 100000);
    expect(saldoFinal).toBe(saldoDespues); // la segunda no cambia nada
  });
```

- [ ] **Paso 2: Salí temprano si el estado no cambia**

En `verificar()` (línea ~108), justo después de leer el pago y antes del UPDATE:

```ts
      const yaEstaba = Boolean(pago.verificado);
      if (yaEstaba === verificado) {
        // Nada que hacer. Sin esta guarda, verificar dos veces aplicaría
        // los efectos dos veces y descontaría el saldo por duplicado.
        return;
      }
```

- [ ] **Paso 3: Compuertas y commit**

```bash
node ./scripts/run-test.js run && npm run build
git add src/main/db/repositories/pagos.repo.ts tests/smoke.test.ts
git commit -m "fix(pagos): verificar es idempotente y no descuenta el saldo dos veces"
```

---

### Task 3: El sobrepago deja de desaparecer

**Archivos:** `src/main/db/repositories/pagos.repo.ts`, `tests/smoke.test.ts`

Resuelve H4.

No cambiamos el modelo de datos para guardar saldo a favor: eso es una función nueva y no la pidió nadie. Lo que hacemos es **dejar de mentir**: el saldo no baja de cero, pero el excedente queda registrado en el evento de auditoría para que se pueda ver qué pasó.

- [ ] **Paso 1: Escribí la prueba**

```ts
  it('registra el excedente cuando el cliente paga de más', () => {
    const pedidoId = /* pedido con saldo de C$1,000 */;

    const pago = PagosRepo.create(
      {
        pedido_id: pedidoId,
        monto_cents: 150000, // C$1,500: C$500 de más
        moneda_pago: 'COR',
        metodo_pago: 'EFECTIVO',
        verificado: true,
        tipo_pago: 'SALDO',
      },
      crypto.randomUUID()
    );

    const pedido = PedidosRepo.getById(pedidoId)!;
    expect(pedido.saldo_pendiente_cor_cents).toBe(0);

    // El excedente debe quedar registrado en el evento, no evaporarse
    const evento = db
      .prepare("SELECT * FROM eventos WHERE entidad_tipo = 'PAGO' AND entidad_id = ? ORDER BY id DESC LIMIT 1")
      .get(pago.id) as { detalle: string };
    expect(evento.detalle).toContain('excedente');
  });
```

- [ ] **Paso 2: Calculá y propagá el excedente**

En `aplicarEfectosVerificacion`, hacé que devuelva el excedente en vez de `void`:

```ts
  private static aplicarEfectosVerificacion(
    pedido_id: number,
    tipo_pago: string,
    monto_cor_cents: number,
    monto_usd_cents: number
  ): { excedente_cor_cents: number } {
    // ...

    const excedenteCor = Math.max(0, monto_cor_cents - pedido.saldo_pendiente_cor_cents);
    const nuevoSaldoCor = Math.max(0, pedido.saldo_pendiente_cor_cents - monto_cor_cents);
    const nuevoSaldoUsd = Math.max(0, pedido.saldo_pendiente_usd_cents - monto_usd_cents);

    // ... el resto igual ...

    return { excedente_cor_cents: excedenteCor };
  }
```

Y en los dos lugares que la llaman (`create` línea ~92 y `verificar` línea ~124), agregá el excedente al `detalle` del evento cuando sea mayor que cero:

```ts
      const { excedente_cor_cents } = PagosRepo.aplicarEfectosVerificacion(/* ... */);

      const notaExcedente =
        excedente_cor_cents > 0
          ? ` (excedente de C$${(excedente_cor_cents / 100).toFixed(2)} a favor del cliente)`
          : '';
```

Concatená `notaExcedente` al final del `detalle` del evento.

**Ojo con TypeScript:** en `create()` la llamada está dentro de `if (data.verificado) { ... }`, así que `excedente_cor_cents` solo existe en esa rama. Declará `let notaExcedente = ''` afuera y asignála adentro.

- [ ] **Paso 3: Compuertas y commit**

```bash
node ./scripts/run-test.js run && npm run build
git add src/main/db/repositories/pagos.repo.ts tests/smoke.test.ts
git commit -m "fix(pagos): registrar el excedente cuando el cliente paga de mas"
```

---

### Task 4: Deshacer deja de mentir

**Archivos:** `src/main/db/repositories/eventos.repo.ts`, `tests/smoke.test.ts`

Resuelve H5 y H3. Es la tarea más delicada del plan: leé el método entero antes de tocar nada.

- [ ] **Paso 1: Escribí las pruebas y velas fallar**

```ts
  it('deshacer un tipo de entidad desconocido NO reporta exito ni borra la auditoria', () => {
    const grupoId = crypto.randomUUID();
    EventosRepo.registrarEvento({
      evento_grupo_id: grupoId,
      entidad_tipo: 'CATEGORIA',
      entidad_id: 1,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: { comision_defecto_bp: 3500 },
      valor_nuevo: { comision_defecto_bp: 2000 },
      detalle: 'prueba',
    });

    const res = EventosRepo.deshacerUltimoGrupo();
    expect(res.revertido).toBe(false);

    // La auditoria debe seguir ahi: no se borra lo que no se revirtio
    const quedan = db
      .prepare('SELECT COUNT(*) AS n FROM eventos WHERE evento_grupo_id = ?')
      .get(grupoId) as { n: number };
    expect(quedan.n).toBe(1);
  });

  it('deshacer la verificacion de un pago devuelve el saldo al pedido', () => {
    const pedidoId = /* pedido con saldo conocido */;
    const saldoInicial = PedidosRepo.getById(pedidoId)!.saldo_pendiente_cor_cents;

    const pago = PagosRepo.create(
      { pedido_id: pedidoId, monto_cents: 100000, moneda_pago: 'COR',
        metodo_pago: 'EFECTIVO', verificado: false, tipo_pago: 'SALDO' },
      crypto.randomUUID()
    );

    const grupoVerificacion = crypto.randomUUID();
    PagosRepo.verificar(pago.id, true, grupoVerificacion);
    expect(PedidosRepo.getById(pedidoId)!.saldo_pendiente_cor_cents).toBe(saldoInicial - 100000);

    EventosRepo.deshacerUltimoGrupo();
    expect(PedidosRepo.getById(pedidoId)!.saldo_pendiente_cor_cents).toBe(saldoInicial);
  });
```

- [ ] **Paso 2: Que `revertido` diga la verdad**

En `deshacerUltimoGrupo`, declarás una bandera y la ponés en `true` **solo dentro de las ramas que efectivamente revirtieron algo**:

```ts
    let seRevirtioAlgo = false;

    db.transaction(() => {
      for (const ev of eventos) {
        if (ev.valor_anterior) {
          const anterior = JSON.parse(ev.valor_anterior);

          if (ev.entidad_tipo === 'PEDIDO_ITEM') {
            if (anterior.estado) {
              db.prepare('UPDATE pedido_items SET estado = ? WHERE id = ?')
                .run(anterior.estado, ev.entidad_id);
              seRevirtioAlgo = true;
            }
          }
          // ... el resto de las ramas, cada una marcando seRevirtioAlgo = true ...
        }
      }

      // Solo se borra la auditoria de lo que realmente se revirtio.
      // Antes se borraba siempre, incluso cuando no se habia hecho nada:
      // el rastro desaparecia y la funcion reportaba exito igual.
      if (seRevirtioAlgo) {
        db.prepare('DELETE FROM eventos WHERE evento_grupo_id = ?').run(grupoId);
      }
    })();

    if (!seRevirtioAlgo) {
      return {
        revertido: false,
        descripcion: 'Esta acción no se puede deshacer automáticamente.',
      };
    }
```

**Poné `seRevirtioAlgo = true` en cada una de las ramas existentes**, justo después de su `UPDATE`. Son cuatro tipos de entidad y varias sub-ramas: revisalas todas.

- [ ] **Paso 3: Que deshacer un pago devuelva la plata**

Reemplazá la rama `PAGO` completa:

```ts
          } else if (ev.entidad_tipo === 'PAGO') {
            const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(ev.entidad_id) as
              | { pedido_id: number; monto_cor_cents: number; monto_usd_cents: number;
                  verificado: number; tipo_pago: string }
              | undefined;

            if (pago) {
              // Si el pago estaba aplicado, hay que devolverle el saldo al
              // pedido. Antes solo se volteaba la bandera `verificado` y la
              // plata quedaba descontada para siempre.
              const estabaAplicado = Boolean(pago.verificado);

              if (ev.tipo_evento === 'CREACION') {
                db.prepare('UPDATE pagos SET activo = 0 WHERE id = ?').run(ev.entidad_id);
                seRevirtioAlgo = true;
              } else if (anterior.verificado !== undefined) {
                db.prepare('UPDATE pagos SET verificado = ? WHERE id = ?')
                  .run(anterior.verificado ? 1 : 0, ev.entidad_id);
                seRevirtioAlgo = true;
              }

              if (estabaAplicado) {
                db.prepare(`
                  UPDATE pedidos SET
                    saldo_pendiente_cor_cents = saldo_pendiente_cor_cents + ?,
                    saldo_pendiente_usd_cents = saldo_pendiente_usd_cents + ?
                  WHERE id = ?
                `).run(pago.monto_cor_cents, pago.monto_usd_cents, pago.pedido_id);

                // Recalcular si el anticipo sigue cumpliendose con lo que queda
                const fila = db
                  .prepare(`
                    SELECT COALESCE(SUM(monto_cor_cents), 0) AS total
                    FROM pagos
                    WHERE pedido_id = ? AND activo = 1 AND verificado = 1
                      AND tipo_pago IN ('ANTICIPO', 'COMPLETO')
                  `)
                  .get(pago.pedido_id) as { total: number };

                const ped = db.prepare('SELECT anticipo_esperado_cor_cents FROM pedidos WHERE id = ?')
                  .get(pago.pedido_id) as { anticipo_esperado_cor_cents: number };

                const sigueCumpliendo = fila.total >= ped.anticipo_esperado_cor_cents;
                db.prepare('UPDATE pedidos SET anticipo_verificado = ? WHERE id = ?')
                  .run(sigueCumpliendo ? 1 : 0, pago.pedido_id);

                if (!sigueCumpliendo) {
                  db.prepare(`
                    UPDATE pedido_items SET estado = 'PENDIENTE_ANTICIPO'
                    WHERE pedido_id = ? AND estado = 'ANTICIPO_OK' AND activo = 1
                  `).run(pago.pedido_id);
                }

                PedidosRepo.recalcularYPersistirEstadoPedido(pago.pedido_id);
              }
            }
          }
```

Vas a necesitar importar `PedidosRepo` en `eventos.repo.ts`. **Cuidado con la importación circular:** `pedidos.repo.ts` ya importa `EventosRepo`. Si el build se rompe por eso, no fuerces la importación: mové la llamada a `recalcularYPersistirEstadoPedido` afuera del `deshacerUltimoGrupo` y hacela desde el handler IPC, y anotá el cambio en tu reporte.

- [ ] **Paso 4: Compuertas y commit**

```bash
node ./scripts/run-test.js run && npm run build
git add src/main/db/repositories/eventos.repo.ts tests/smoke.test.ts
git commit -m "fix(deshacer): reportar la verdad y devolver el saldo al revertir un pago"
```

---

### Task 5: Deshacer revierte la acción correcta

**Archivos:** `eventos.repo.ts`, `sistema.handler.ts`, `pedidos.handler.ts`, `pagos.handler.ts`, `parametros.handler.ts`, `ipc-contracts.ts`, `preload/api.ts`, `mock-api.ts`, `ToastContext.tsx`, y las vistas que muestran toasts de deshacer.

Resuelve H6. Es la tarea que más archivos toca; andá despacio.

- [ ] **Paso 1: Que el repositorio acepte un grupo concreto**

```ts
  static deshacerUltimoGrupo(
    grupoIdSolicitado?: string
  ): { revertido: boolean; descripcion: string } {
    const db = getDb();
    let grupoId = grupoIdSolicitado;

    if (!grupoId) {
      const ultimo = db
        .prepare('SELECT evento_grupo_id FROM eventos ORDER BY id DESC LIMIT 1')
        .get() as { evento_grupo_id: string } | undefined;
      if (!ultimo?.evento_grupo_id) {
        return { revertido: false, descripcion: 'No hay acciones recientes para deshacer.' };
      }
      grupoId = ultimo.evento_grupo_id;
    }

    const eventos = db
      .prepare('SELECT * FROM eventos WHERE evento_grupo_id = ? ORDER BY id DESC')
      .all(grupoId) as EventoAuditoria[];

    if (eventos.length === 0) {
      return { revertido: false, descripcion: 'Esa acción ya no se puede deshacer.' };
    }
    // ... el resto igual ...
```

- [ ] **Paso 2: Que el handler reciba el grupo**

En `sistema.handler.ts`:

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

- [ ] **Paso 3: Que las mutaciones devuelvan su grupo**

Cada handler que muta ya genera un `crypto.randomUUID()`. Devolvelo. Por ejemplo en `pedidos.handler.ts`:

```ts
    async (_, input: CambiarEstadoItemInput): Promise<IpcResult<{ evento_grupo_id: string }>> => {
      try {
        const grupoId = crypto.randomUUID();
        PedidosRepo.cambiarEstadoItem(input.item_id, input.nuevo_estado, grupoId, input.motivo);
        return { success: true, data: { evento_grupo_id: grupoId } };
      } catch (error) {
        return { success: false, error: formatErrorMessage(error) };
      }
    }
```

Hacé lo mismo en `pagos.handler.ts` (`PAGOS_CREATE`, `PAGOS_VERIFICAR`), `parametros.handler.ts` (`CATEGORIAS_UPDATE`) y `cotizaciones.handler.ts` (`COTIZACIONES_CONVERTIR_A_PEDIDO`, agregando el campo al objeto que ya devuelve).

Actualizá los tipos de retorno en `ipc-contracts.ts`, las firmas en `preload/api.ts`, **y el `mock-api.ts`**.

- [ ] **Paso 4: Que el toast lleve su grupo**

En `ToastContext.tsx`:

```ts
interface ToastContextType {
  showToast: (options: ToastOptions) => void;
  showUndoToast: (
    message: string,
    onUndoSuccess?: () => void,
    grupoId?: string
  ) => void;
}
```

Guardá `grupoId` en el `ToastItem` y pasalo en la llamada:

```tsx
        const res = await window.api.sistema.deshacerUltimoGrupo(grupoId);
```

Y corregí la selección de `Ctrl+Z` para que tome el más reciente, no el más viejo:

```tsx
      const undoableToast = [...toasts].reverse().find((t) => t.undoable && t.onUndo);
```

- [ ] **Paso 5: Pasá el grupo desde cada llamador**

Buscá todos los `showUndoToast(` en el renderer y agregá el tercer argumento con el `evento_grupo_id` que ahora devuelve la respuesta:

```bash
grep -rn "showUndoToast(" src/renderer --include=*.tsx
```

- [ ] **Paso 6: Compuertas y commit**

```bash
node ./scripts/run-test.js run && npm run build
git add src/main src/preload src/shared src/renderer tests
git commit -m "fix(deshacer): revertir el grupo del toast pulsado y no el mas reciente"
```

---

### Task 6: Una cotización deshecha vuelve a ser convertible

**Archivos:** `eventos.repo.ts`, `tests/smoke.test.ts`

Resuelve H7.

- [ ] **Paso 1: Escribí la prueba**

```ts
  it('deshacer una conversion devuelve la cotizacion a su estado anterior', () => {
    const cotId = /* cotización en estado BORRADOR */;
    const grupoId = crypto.randomUUID();

    CotizacionesRepo.convertirAPedido(cotId, grupoId);
    expect(CotizacionesRepo.getById(cotId)!.estado).toBe('ACEPTADA');

    EventosRepo.deshacerUltimoGrupo(grupoId);
    expect(CotizacionesRepo.getById(cotId)!.estado).toBe('BORRADOR');
  });
```

- [ ] **Paso 2: Restaurá el estado de la cotización**

El evento de conversión ya guarda lo necesario: `valor_anterior` contiene `{ cotizacion_estado }` y `valor_nuevo` contiene `{ cotizacion_id }`. La rama `PEDIDO` del motor de deshacer los ignora. Agregá la restauración dentro de esa rama, en el caso `CREACION`:

```ts
              if (ev.tipo_evento === 'CREACION') {
                db.prepare('UPDATE pedidos SET activo = 0 WHERE id = ?').run(ev.entidad_id);
                db.prepare('UPDATE pedido_items SET activo = 0 WHERE pedido_id = ?').run(ev.entidad_id);

                // Devolver la cotizacion a su estado previo. Sin esto queda
                // en ACEPTADA sin pedido, y la interfaz solo ofrece convertir
                // desde BORRADOR o ENVIADA: la cotizacion queda sin salida.
                const nuevo = ev.valor_nuevo ? JSON.parse(ev.valor_nuevo) : null;
                if (nuevo?.cotizacion_id && anterior.cotizacion_estado) {
                  db.prepare('UPDATE cotizaciones SET estado = ? WHERE id = ?')
                    .run(anterior.cotizacion_estado, nuevo.cotizacion_id);
                }

                seRevirtioAlgo = true;
              }
```

- [ ] **Paso 3: Compuertas y commit**

```bash
node ./scripts/run-test.js run && npm run build
git add src/main/db/repositories/eventos.repo.ts tests/smoke.test.ts
git commit -m "fix(cotizaciones): deshacer una conversion devuelve la cotizacion a su estado previo"
```

---

### Task 7: Configuración se guarda en una sola transacción

**Archivos:** `ipc-channels.ts`, `ipc-contracts.ts`, `parametros.repo.ts`, `parametros.handler.ts`, `preload/api.ts`, `mock-api.ts`, `ConfigView.tsx`

Resuelve H12.

- [ ] **Paso 1: Canal y contrato**

En `ipc-channels.ts`, junto a los otros de parámetros:

```ts
  PARAMETROS_UPDATE_MANY: 'parametros:update-many',
```

En `ipc-contracts.ts`:

```ts
export interface ActualizarParametrosInput {
  valores: Record<string, string>;
}
```

- [ ] **Paso 2: Método del repositorio**

En `parametros.repo.ts`:

```ts
  static updateParametros(
    valores: Record<string, string>,
    evento_grupo_id: string
  ): void {
    const db = getDb();
    db.transaction(() => {
      const leer = db.prepare('SELECT clave, valor FROM parametros WHERE clave = ?');
      const anteriores: Record<string, string> = {};

      for (const clave of Object.keys(valores)) {
        const fila = leer.get(clave) as { valor: string } | undefined;
        anteriores[clave] = fila?.valor ?? '';
      }

      for (const [clave, valor] of Object.entries(valores)) {
        ParametrosRepo.updateParametro(clave, valor);
      }

      // Un solo evento para todo el lote: deshacer revierte la pantalla
      // entera, no un parametro suelto. Se guardan solo las claves que
      // cambiaron, con su valor crudo anterior, para que revertir sea
      // un bucle de updateParametro.
      EventosRepo.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'PARAMETRO',
        entidad_id: 0,
        tipo_evento: 'ACTUALIZACION',
        valor_anterior: anteriores,
        valor_nuevo: valores,
        detalle: `Configuración actualizada (${Object.keys(valores).length} parámetros)`,
      });
    })();
  }
```

- [ ] **Paso 3: Que deshacer entienda PARAMETRO**

En `eventos.repo.ts`, agregá la rama:

```ts
          } else if (ev.entidad_tipo === 'PARAMETRO') {
            for (const [clave, valor] of Object.entries(anterior as Record<string, string>)) {
              db.prepare(`
                UPDATE parametros SET valor = ?, actualizado_en = CURRENT_TIMESTAMP
                WHERE clave = ?
              `).run(valor, clave);
            }
            seRevirtioAlgo = true;
          }
```

- [ ] **Paso 4: Handler, preload, mock y vista**

Registrá el handler como los otros, exponelo en `preload/api.ts` y en `mock-api.ts`, y en `ConfigView.tsx` reemplazá el `Promise.all` de nueve llamadas por:

```tsx
      const res = await window.api.parametros.updateMany(valores);
      if (!res.success) {
        showToast({ message: res.error.message, type: 'error' });
        return;
      }
      showUndoToast('Configuración actualizada', () => onRefresh(), res.data.evento_grupo_id);
```

- [ ] **Paso 5: Prueba, compuertas y commit**

Agregá una prueba que guarde dos parámetros y confirme que ambos quedaron, más otra que confirme que deshacer los devuelve a su valor anterior.

```bash
node ./scripts/run-test.js run && npm run build
git add src/main src/preload src/shared src/renderer tests
git commit -m "fix(config): guardar todos los parametros en una sola transaccion"
```

---

### Task 8: La lista de compras en Estados Unidos

**Archivos:** `ipc-channels.ts`, `ipc-contracts.ts`, `vistas.repo.ts`, `vistas.handler.ts`, `preload/api.ts`, `mock-api.ts`, `views/ComprasView.tsx` (crear), `Sidebar.tsx`, `App.tsx`

Resuelve H8. **Es la tarea que más cambia el día de la usuaria.** Hasta ahora, para saber qué comprar tenía que abrir Pedidos y revisar uno por uno.

- [ ] **Paso 1: Leé la vista SQL que ya existe**

```bash
awk '/CREATE VIEW IF NOT EXISTS v_lista_compras_usa/,/;/' schema.sql
```

Devuelve, por ítem: `item_id`, `pedido_id`, `pedido_codigo`, `cliente_nombre`, `tienda_nombre`, `categoria_nombre`, `descripcion`, `url`, `precio_usa_usd_cents`, `tax_usa_usd_cents`, `peso_mlb`, `prioridad`, `notas_tolerancia`, `item_estado`.

Su filtro y su orden son:

```sql
WHERE pi.activo = 1
  AND ped.activo = 1
  AND ped.anticipo_verificado = 1
  AND pi.estado = 'EN_LISTA_USA'
ORDER BY t.nombre ASC, pi.prioridad DESC, pi.id ASC;
```

**La vista ya ordena por tienda.** No agregues un `ORDER BY` propio en el repositorio: lo pisarías.

**Leé bien la cuarta condición, porque cambia esta tarea.** No basta con que el anticipo esté verificado: el ítem tiene que estar en `EN_LISTA_USA`. Y cuando el anticipo se verifica, `aplicarEfectosVerificacion` mueve los ítems de `PENDIENTE_ANTICIPO` a **`ANTICIPO_OK`**, no a `EN_LISTA_USA`.

O sea: hay un salto manual entre "el cliente ya pagó" y "esto aparece en mi lista de compras", y hoy solo se puede dar ítem por ítem desde el selector de estado en el panel de Pedidos. Si construís la pantalla sin resolver esto, la lista va a estar vacía casi siempre y va a parecer que no funciona.

- [ ] **Paso 2: Resolvé el salto de `ANTICIPO_OK` a `EN_LISTA_USA`**

No lo automatices dentro de `aplicarEfectosVerificacion`. Parece tentador, pero la transición `ANTICIPO_OK → EN_LISTA_USA` es una decisión de la usuaria: puede querer esperar una oferta, o que el cliente confirme la talla. Automatizarla le quita ese control y además saltearía el validador de la máquina de estados.

En su lugar, agregá a la pantalla de compras una **segunda sección**, arriba de la lista, con los ítems que están en `ANTICIPO_OK` y todavía no pasaron a la lista:

```
┌────────────────────────────────────────────────────────────┐
│ Listos para agregar a tu lista                    3 items  │
│ Estos clientes ya pagaron su anticipo.                     │
│  ☐ Perfume Dior      M. Morales   PED-0012                 │
│  ☐ Tenis Nike        J. Ruiz      PED-0011                 │
│                              [Agregar seleccionados]       │
└────────────────────────────────────────────────────────────┘
```

El botón llama `window.api.pedidos.cambiarEstadoItem(item_id, 'EN_LISTA_USA')` por cada seleccionado. Esa transición es legal desde `ANTICIPO_OK` (confirmalo en `TRANSICIONES_VALIDAS_ITEM` dentro de `src/core/estados.ts`) y el validador exige anticipo verificado, que ya se cumple.

Para alimentar esa sección necesitás una segunda consulta. Agregala en `vistas.repo.ts` como método aparte, sin crear una vista SQL nueva:

```ts
  static getPendientesDeLista(): ItemListaCompraRow[] {
    const db = getDb();
    return db
      .prepare(`
        SELECT
          pi.id AS item_id, ped.id AS pedido_id, ped.codigo AS pedido_codigo,
          c.nombre AS cliente_nombre, t.nombre AS tienda_nombre,
          cat.nombre AS categoria_nombre, pi.descripcion, pi.url,
          pi.precio_usa_usd_cents, pi.tax_usa_usd_cents, pi.peso_mlb,
          pi.prioridad, pi.notas_tolerancia, pi.estado AS item_estado
        FROM pedido_items pi
        JOIN pedidos ped ON pi.pedido_id = ped.id
        JOIN clientes c ON ped.cliente_id = c.id
        LEFT JOIN tiendas t ON pi.tienda_id = t.id
        LEFT JOIN categorias cat ON pi.categoria_id = cat.id
        WHERE pi.activo = 1
          AND ped.activo = 1
          AND ped.anticipo_verificado = 1
          AND pi.estado = 'ANTICIPO_OK'
        ORDER BY ped.fecha ASC, pi.id ASC
      `)
      .all() as ItemListaCompraRow[];
  }
```

Devuelve la misma forma que la vista, así reusás el mismo tipo y el mismo componente de fila.

- [ ] **Paso 3: Tipo, canal, repositorio y handler**

En `ipc-contracts.ts`, definí `ItemListaCompraRow` con exactamente las columnas de arriba y sus tipos.

En `ipc-channels.ts`, dos canales:

```ts
  VISTAS_GET_LISTA_COMPRAS: 'vistas:get-lista-compras',
  VISTAS_GET_PENDIENTES_LISTA: 'vistas:get-pendientes-lista',
```

En `vistas.repo.ts`, seguí el patrón de los métodos vecinos:

```ts
  static getListaComprasUsa(): ItemListaCompraRow[] {
    const db = getDb();
    return db.prepare('SELECT * FROM v_lista_compras_usa').all() as ItemListaCompraRow[];
  }
```

Registrá los dos handlers, exponé ambos métodos en `preload/api.ts` y en `mock-api.ts`.

- [ ] **Paso 4: Creá `views/ComprasView.tsx`**

Agrupada por tienda, porque así se compra. Usá los primitivos existentes: `Card`, `CardHeader`, `CardContent`, `DataTable`, `Money`, `Badge`, `Button`, `SectionHeader`, `EmptyState`. Leé sus firmas en `src/renderer/src/components/ui/` antes de usarlos.

Estructura:

```
┌────────────────────────────────────────────────────────────┐
│ Lista de compras en USA                                    │
│ 12 productos listos para comprar · $1,480.50 · 18.5 lb     │
├────────────────────────────────────────────────────────────┤
│ SEPHORA                              4 productos · $512.00 │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ Perfume Dior Sauvage   M. Morales  PED-0012  $128.00 ▸ │ │
│ │ Base Fenty 240         J. Ruiz     PED-0011   $45.00 ▸ │ │
│ └────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────┤
│ AMAZON                               3 productos · $310.00 │
│ ...                                                        │
└────────────────────────────────────────────────────────────┘
```

Requisitos concretos:

- **Encabezado con totales:** cantidad de productos, suma de `precio_usa_usd_cents + tax_usa_usd_cents`, y suma de peso en libras (`peso_mlb / 1000`). Son los tres números que la usuaria necesita antes de salir a comprar.
- **Un grupo por tienda**, con su propio subtotal y conteo.
- **Cada fila muestra:** descripción, cliente, código de pedido, precio, peso. Si el ítem tiene `url`, un botón que la abra.
- **Marcar como comprado:** un botón por fila que llame `window.api.pedidos.cambiarEstadoItem(item_id, 'COMPRADO')`. Ese es el estado real del tipo `EstadoItem`; **no inventes `COMPRADO_USA`, no existe.**
- **Estado vacío** con `EmptyState`: "Todavía no hay productos listos para comprar. Aparecen acá cuando un pedido tiene su anticipo verificado en el banco."
- Los montos con `Money` y clase `tabular`, alineados a la derecha.

Para abrir la URL usá el canal que ya existe para WhatsApp como referencia de cómo se abre algo externo desde el renderer (`sistema.abrirWhatsApp` usa `shell.openExternal` del lado main). **Si no hay un canal genérico para abrir URLs, no lo inventes en esta tarea:** mostrá la URL como texto seleccionable y anotalo en tu reporte.

- [ ] **Paso 5: Enganchá la vista en la navegación**

En `Sidebar.tsx`, agregá el ítem entre Cotizador y Pedidos, con un icono de `lucide-react` coherente con los demás (`ShoppingCart` sirve). Extendé el tipo `NavTab` con `'compras'`. En `App.tsx`, cargá los datos y renderizá la vista para esa pestaña, siguiendo el patrón de las otras.

- [ ] **Paso 6: Prueba, compuertas y commit**

Agregá una prueba en `tests/smoke.test.ts` que cree un pedido con anticipo verificado, mueva su ítem a `EN_LISTA_USA`, y confirme que su ítem aparece en `VistasRepo.getListaComprasUsa()`, y que un pedido sin anticipo verificado **no** aparece.

```bash
node ./scripts/run-test.js run && npm run build
git add src/main src/preload src/shared src/renderer tests
git commit -m "feat(compras): pantalla de lista de compras en USA agrupada por tienda"
```

---

### Task 9: El ciclo de vida de la cotización

**Archivos:** `views/cotizador/HistorialCotizaciones.tsx`, `ipc-channels.ts`, `cotizaciones.handler.ts`

Resuelve H9 y el canal muerto `COTIZACIONES_UPDATE`.

- [ ] **Paso 1: Borrá el canal sin handler**

`COTIZACIONES_UPDATE` está declarado en `ipc-channels.ts` y **no tiene handler**. Una llamada quedaría colgada para siempre. No lo implementes en esta tarea: **borrá la línea**. Editar cotizaciones guardadas es una función nueva y nadie la pidió. Anotá en tu reporte que la quitaste y por qué.

Confirmá antes de borrar que nadie lo usa:

```bash
grep -rn "COTIZACIONES_UPDATE" src/
```

- [ ] **Paso 2: Exponé enviada, aceptada y rechazada**

Los tres canales existen, tienen handler y funcionan. La interfaz no los llama nunca.

En `HistorialCotizaciones.tsx`, la columna de acciones pasa a depender del estado de la cotización:

| Estado | Acciones |
|---|---|
| `BORRADOR` | "Marcar como enviada", "Convertir a pedido" |
| `ENVIADA` | "Convertir a pedido", "Marcar como rechazada" |
| `ACEPTADA` | ninguna (ya tiene pedido) |
| `RECHAZADA` / `VENCIDA` | ninguna |

Usá `Button` con `variant="secondary"` para las secundarias y `variant="primary"` para convertir.

- [ ] **Paso 3: Mostrá el estado con color y la vigencia**

La columna de estado pasa a `Badge` con el tono correspondiente:

```
BORRADOR   → neutral      ACEPTADA   → success
ENVIADA    → info         RECHAZADA  → danger
VENCIDA    → warning
```

La cotización guarda `valida_hasta` y hoy no se lee nunca. Mostrala en la tabla, y cuando la fecha ya pasó y el estado sigue siendo `BORRADOR` o `ENVIADA`, agregá un `Badge tone="warning"` que diga "Vencida".

**No cambies el estado en la base automáticamente.** Marcar como `VENCIDA` es una decisión de negocio y este plan no la toma: solo mostrás el aviso.

- [ ] **Paso 4: Compuertas y commit**

```bash
node ./scripts/run-test.js run && npm run build
git add src/renderer/src/views/cotizador/HistorialCotizaciones.tsx src/shared/ipc-channels.ts
git commit -m "feat(cotizaciones): ciclo de vida completo y aviso de vigencia"
```

---

### Task 10: Ficha del cliente

**Archivos:** `views/ClientesView.tsx`, y si hace falta un componente nuevo bajo `views/clientes/`

Resuelve H10.

`window.api.clientes.getById(id)` devuelve un `ClienteDetalle` con los pedidos y pagos del cliente. Nadie lo llama. Leé el tipo en `src/shared/types.ts` antes de empezar y usá exactamente los campos que trae.

- [ ] **Paso 1: Panel lateral al seleccionar una fila**

`ClientesView` ya usa `DataTable`, que acepta `onRowClick` y `selectedKey`. Aprovechá eso: al hacer clic en un cliente se carga su detalle en un panel a la derecha, con el mismo patrón de dos columnas que ya usa `PedidosView` (leé `PedidosView.tsx` y copiá esa estructura).

- [ ] **Paso 2: Qué mostrar**

Lo que responde las preguntas que la usuaria realmente se hace sobre un cliente:

- Datos de contacto, y botón de WhatsApp que ya existe
- **Cuánto le debe hoy:** suma de `saldo_pendiente_cor_cents` de sus pedidos activos, en un `StatTile`
- **Cuántos pedidos tiene**, y cuántos están bloqueados por falta de anticipo
- **Historial de pedidos** en una tabla compacta: código, fecha, total, saldo, estado
- Si `incumplio_anteriormente` es verdadero, un `Badge tone="danger"` bien visible con el texto "Pedir 70% de anticipo"

- [ ] **Paso 3: Compuertas y commit**

```bash
node ./scripts/run-test.js run && npm run build
git add src/renderer/src/views
git commit -m "feat(clientes): ficha con historial, deuda y pedidos"
```

---

### Task 11: Arreglos chicos de integridad

**Archivos:** `PedidosView.tsx`, `App.tsx`, `ToastContext.tsx`, `PagoModal.tsx`

Resuelve H13, H14, H15, H16 y H17. Son cinco cambios chicos e independientes; hacelos todos en esta tarea y commiteá una vez.

- [ ] **Paso 1: El comprobante pegado no se adivina (H13)**

En `PedidosView.tsx` línea ~75, la rama que cae a `pedidos[0]` adjunta el comprobante a un pedido arbitrario. Reemplazala:

```tsx
            if (selectedPedidoId && pedidoDetalle) {
              setPastedBuffer(uint8);
              setPagoModalPedido(pedidoDetalle);
              showToast({ message: 'Comprobante detectado. Abriendo registro de pago...', type: 'info' });
            } else {
              showToast({
                message: 'Abrí primero el pedido al que corresponde el comprobante.',
                type: 'info',
              });
            }
```

Si `pedidos` deja de usarse en ese efecto, quitalo del arreglo de dependencias o `noUnusedLocals` rompe el build.

- [ ] **Paso 2: El contador ámbar (H14)**

En `App.tsx` línea ~106, `amarillo` nunca se incrementa. Un pedido está en ámbar cuando tiene dinero registrado pero el anticipo todavía no está verificado. `Pedido` no expone el total pagado, pero se deduce:

```tsx
    for (const p of pedidos) {
      const pagadoCorCents = p.total_cor_cents - p.saldo_pendiente_cor_cents;
      if (p.anticipo_verificado) {
        verde++;
      } else if (pagadoCorCents > 0) {
        amarillo++;
      } else {
        rojo++;
      }
    }
```

- [ ] **Paso 3: Fugas del toast (H15)**

Memorizá el valor del contexto:

```tsx
  const value = useMemo(() => ({ showToast, showUndoToast }), [showToast, showUndoToast]);
```

Y guardá los intervalos por id para limpiarlos al cerrar el toast a mano:

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

Registrá cada intervalo con `intervalos.current.set(id, interval)` al crearlo. Importá `useMemo` y `useRef`.

- [ ] **Paso 4: Object URL sin revocar (H16)**

En `PagoModal.tsx`:

```tsx
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);
```

- [ ] **Paso 5: Reconvertir al cambiar de moneda (H17)**

En `PagoModal.tsx`, el selector de moneda no reconvierte el monto ya escrito: se puede registrar $6,225 donde correspondía C$6,225.

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

Importá `parsearDecimal` de `@core/numeros`, que ya existe. Conectá esta función a los botones de moneda. **Usá `pedido.tasa_cambio_cents`, la congelada del documento, nunca el parámetro global.**

- [ ] **Paso 6: Compuertas y commit**

```bash
node ./scripts/run-test.js run && npm run build
git add src/renderer
git commit -m "fix(ui): comprobante sin adivinar, semaforo ambar, fugas de toast y conversion de moneda"
```

---

### Task 12: Accesibilidad y uso con teclado

**Archivos:** los primitivos bajo `components/ui/`, los tres modales, `CommandPalette.tsx`

Resuelve H18. Hay **cero** atributos `aria-*` y **cero** `role=` en todo el renderer. Es una herramienta de escritorio con cinco atajos de teclado que no se puede operar con teclado.

Arreglalo en la capa de primitivos, que es donde rinde: un cambio ahí alcanza a todas las vistas.

- [ ] **Paso 1: `Field` asocia etiqueta y control**

Hoy `Field` envuelve el control en un `<label>`, lo cual asocia implícitamente. Pero solo hay 2 `htmlFor` en todo el proyecto, así que los controles fuera de `Field` quedan sueltos. Hacé la asociación explícita: generá un id con `React.useId()`, pasalo al control por `htmlFor`/`id`, y conectá `aria-describedby` al texto de ayuda y `aria-invalid` cuando haya error.

- [ ] **Paso 2: Los modales se anuncian y cierran con Escape**

Los tres modales (`PagoModal`, `OnboardingModal`, el de cliente dentro de `ClientesView`) necesitan:

```tsx
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
      className="..."
    >
```

Y cierre con Escape:

```tsx
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
```

**`OnboardingModal` es la excepción:** es el asistente de primera ejecución y no debe cerrarse con Escape, porque la aplicación no funciona sin configurar. Dale `role="dialog"` y `aria-modal`, pero no el cierre con Escape.

- [ ] **Paso 3: Devolvé el anillo de foco**

Hay tres `focus:outline-none` sin un `focus-visible:` que lo reemplace. Buscalos y aseguráte de que cada uno tenga su anillo:

```bash
grep -rn "focus:outline-none" src/renderer --include=*.tsx
```

El patrón correcto, que `Button` ya usa, es `focus-visible:ring-2 focus-visible:ring-brand-500`.

- [ ] **Paso 4: Los tooltips dejan de ser el único medio**

Hay 17 atributos `title=`. Un tooltip no existe para el teclado ni para un lector de pantalla. Para cada botón que solo tiene icono, agregá `aria-label` con el mismo texto. No quites los `title=`: sumá el `aria-label`.

- [ ] **Paso 5: `StatusDot` comunica su significado**

`StatusDot` pinta un círculo de color. El color solo no es información accesible. Cuando se usa sin la prop `label`, necesita un texto alternativo:

```tsx
    <span className={cn('inline-flex items-center gap-2', className)} role="img" aria-label={label ?? descripcionPorTono[tone]}>
```

Definí `descripcionPorTono` como un `Record<Tone, string>` con textos en español: "Verificado", "Pendiente", "Bloqueado", "Informativo", "Sin estado".

- [ ] **Paso 6: `CommandPalette` con navegación por teclado**

Es un buscador que se abre con `Ctrl+K`. Confirmá que las flechas arriba y abajo mueven la selección, que Enter activa, y que Escape cierra. Si algo de eso falta, agregalo. Marcá la lista con `role="listbox"` y cada opción con `role="option"` más `aria-selected`.

- [ ] **Paso 7: Compuertas y commit**

```bash
node ./scripts/run-test.js run && npm run build
git add src/renderer
git commit -m "feat(a11y): roles, etiquetas asociadas, foco visible y cierre con Escape"
```

---

### Task 13: Limpieza final

**Archivos:** `components/ui/StatTile.tsx`, varias vistas

- [ ] **Paso 1: Quitá el borde de acento lateral**

El detector marca `StatTile.tsx` línea ~35: `border-l-4` con color es el patrón más reconocible de interfaz generada por IA. Reemplazá el borde grueso lateral por una señal más sobria: el punto de color de `StatusDot` junto a la etiqueta, o el valor en el color del tono. El borde de la tarjeta vuelve a ser uniforme de 1px.

- [ ] **Paso 2: Sacá los puntos de corte muertos**

La ventana tiene `minWidth: 1024`, así que `sm:`, `md:` y `lg:` **siempre están activos**: 31 de 36 usos no hacen nada. Simplificá las clases dejando solo el valor base y, donde de verdad aporte, `xl:`.

Ejemplo: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` pasa a `grid-cols-2 xl:grid-cols-4`.

Hacelo vista por vista, mirando cada una en pantalla después de cambiarla. **Si dudás de un caso, dejalo como está** y anotalo: un layout roto es peor que una clase redundante.

- [ ] **Paso 3: Corré el detector**

```bash
node "C:\Users\espin\.claude\skills\impeccable\scripts\detect.mjs" --json src/renderer
```

Corre en modo degradado (le faltan módulos de parseo), así que sus hallazgos son un subconteo, no un certificado. Aun así, lo que marque hay que mirarlo.

- [ ] **Paso 4: Compuertas y commit**

```bash
node ./scripts/run-test.js run && npm run build
git add src/renderer
git commit -m "refactor(ui): quitar acento lateral y puntos de corte muertos"
```

---

## Verificación final

Cuando termines las trece tareas, corré el recorrido completo con `npm run dev` y confirmá cada punto:

**Dinero**
1. Registrar un anticipo **menor** al esperado: el semáforo sigue rojo.
2. Completar el anticipo con un segundo pago: el semáforo pasa a verde.
3. Verificar un pago, deshacer, y confirmar que el saldo volvió a su valor original.
4. Verificar el mismo pago dos veces: el saldo baja una sola vez.
5. Pagar de más: el saldo queda en cero y el excedente aparece en el detalle del evento.

**Deshacer**
6. Hacer dos acciones seguidas y deshacer la primera desde su toast: se revierte esa, no la otra.
7. Cambiar una tasa de categoría y deshacer: la tasa vuelve, y el mensaje no miente.
8. Convertir una cotización a pedido y deshacer: la cotización vuelve a `BORRADOR` y se puede convertir de nuevo.

**Flujo**
9. Un pedido con anticipo verificado aparece en la lista de compras, agrupado por su tienda.
10. Marcar un producto como comprado desde esa lista lo saca de ahí.
11. Marcar una cotización como enviada, y después como rechazada.
12. Abrir la ficha de un cliente y ver cuánto debe.
13. Recorrer un pedido entero hasta `ENTREGADO`.

**Teclado**
14. Operar la aplicación entera sin mouse: `Tab` recorre en orden lógico, el foco siempre se ve, `Escape` cierra los modales, `Ctrl+K` abre el buscador y las flechas lo recorren.

---

## Fuera de alcance

No hagas nada de esto. Está acá para que sepas que es deliberado y no un olvido.

- **Fase 2: lotes de importación y liquidación real.** Las tablas `lotes` y `lote_costos` existen y no las usa nadie. Con ellas viene `costo_aterrizado_real_cents`, que hoy siempre vale 0, y la vista `v_margen_real`, que por eso no sirve todavía. Es el paso 6 del flujo y es un proyecto propio.
- **Las tablas huérfanas** `stock`, `rutas_entrega`, `plantillas_mensaje`, `alertas_sistema`, `historico_tasas`. No las borres ni las implementes.
- **La doble fuente de verdad de las cuentas bancarias.** Existe la tabla `cuentas_bancarias` y además se guardan como JSON en `parametros`. Solo se usa el JSON. Unificarlo es una migración de datos y merece su propio ciclo.
- **El instalador NSIS.** `REVISION_FASE1.md` documenta que nunca se generó ni se probó, y que `better-sqlite3` podría estar compilado contra el ABI equivocado. Es deuda de distribución, no de flujo.
- **Modo oscuro.** `darkMode: 'class'` está configurado y sin usar a propósito.
- **Rediseño visual.** Ya está hecho. Las compuertas están en cero: 0 usos de rosa, 0 de `glow-*`, 0 de `text-xs`. No lo rehagas.

---

## Contexto de apoyo

- `AGENTS.md` en la raíz: las reglas absolutas del dominio financiero. Leelo antes de la Task 1.
- `docs/superpowers/specs/2026-08-27-refactor-integral-design.md`: el diseño del ciclo anterior, con el razonamiento de la fórmula de precios.
- `REVISION_FASE1.md`: deuda de verificación pendiente.
- `tests/precios-escenarios.test.ts`: los precios de referencia acordados. Si tocás algo y estos cambian, rompiste la fórmula.
