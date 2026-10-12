# C4 · Sin internet: operar (sólo celular) · plan de implementación

> **Para el agente de turno:** una tarea a la vez, sobre `master`, en relevo
> según [RELEVO.md](../../RELEVO.md). C3 tiene que estar cerrada: C4 usa su
> estado de conexión, su guardián y su corredor sin red. Primero la prueba
> que falla, después el código.

**Objetivo:** sin señal, en el celular se puede **vender**, **registrar un
abono** y **anotar un pedido de encargo** (cada uno con una clienta nueva si
la trae). Quedan "Pendiente de subir" y, al volver la red, se suben solos,
en orden y **sin duplicarse**. Lo que no se puede subir queda "Para
revisar", con el motivo, y nunca se pierde en silencio.

**Arquitectura:** una cola en el teléfono (IndexedDB) con operaciones que
guardan el **mismo input** que hoy reciben `VentasRepo.crear`,
`PagosRepo.registrar` y `ClientesRepo.guardar`. Al subir, cada operación se
reproduce por esos métodos, con su validación y sus lotes. Lo que impide el
duplicado es un `operacion_id` que el repositorio marca en
`operaciones/<id>` junto con lo que escribe: si la marca ya existe, devuelve
lo que quedó guardado y no escribe nada. La cuenta de la plata no cambia.

**Tecnologías:** React 18, Firestore web, IndexedDB sin dependencias nuevas,
Vitest con el Firestore falso, `test:emulador` para la regla nueva,
Playwright con el corredor `test:sin-conexion` de C3.

**Diseño:** [2026-10-02-fases-del-celular-design.md](../specs/2026-10-02-fases-del-celular-design.md),
sección C4. Antecedente: [PLAN_ENCARGOS_Y_SIN_CONEXION.md](../../PLAN_ENCARGOS_Y_SIN_CONEXION.md),
sección 4.3 (escrita para las dos apps; desde el 2/10 es sólo el celular).

**Estado:** plan escrito el 11/10/2026. Joswill pidió concluir C4 sin
responder las dos preguntas de abajo: se aplican las dos recomendaciones
(la venta sin red guarda la tasa del momento; "Sin número todavía" hasta
subir). Si las cambia, se corrige.

## Decisiones para Joswill (antes de empezar)

1. **La tasa de cambio de una venta hecha sin red.** Hoy la venta toma la
   tasa de Configuración al guardarse. Si se sube horas después y en el
   medio cambió la tasa, tomaría la nueva. **Recomiendo** guardar la tasa
   del momento en que se vendió (un `tasa_cambio_cents` opcional en
   `CrearVentaInput`, que sólo manda la cola): es la que se le dijo a la
   clienta.
2. **El número de la venta.** El número (V-00xx) y el costo congelado se
   fijan al subirse, porque recién ahí se sabe de qué lote sale. Mientras
   tanto se ve "Sin número todavía", y el recibo por WhatsApp sale sin
   número. **Recomiendo** aceptarlo así: reservar números sin red los
   chocaría entre la PC y el celular.

## Reglas para todas las tareas

- Un commit por **paso**, con su casilla marcada: `C4 · Tn · paso N: …`.
  Rutas explícitas; nunca `git add -A`. Bitácora de RELEVO al terminar
  cada tarea.
- **No reimplementar** validaciones ni cuentas en la cola: reproduce el
  input por el método de siempre. Si algo no se puede subir, el motivo es
  el error de ese método.
- **Nunca se descarta sola** una operación. "Descartar" pide confirmación.
- **Error de red ≠ error de negocio** (`esErrorSinRed` de C3): el de red
  deja la operación pendiente y frena la subida; cualquier otro la deja
  "Para revisar" y la subida sigue con la próxima.
- Fecha de Managua del momento en que se hizo (`hoyISO()` al encolar).
- Haptics antes del primer `await`; colores por token; textos en vos; nada
  se anima en lo que se repite; "Pendiente de subir" se ve de un vistazo.
- La regla de `operaciones` se despliega **antes** que el código (ver
  T1 paso 4). La sesión de la CLI de Firebase está vencida desde el 10/10:
  hace falta `firebase login --reauth` de Joswill o un despliegue de reglas
  por la API REST con `gcloud`, como `scripts/desplegar-movil.mjs`.
- Suites con emulador en serie; apagarlo al parar; restaurar
  `tests/interfaz/fixtures-pdf.json` después de cada corrida.

## Lo que ya existe (comprobado el 11/10)

| Qué | Dónde | Para C4 |
|---|---|---|
| Venta | `VentasRepo.crear` (`ventas.repo.ts:391`): `siguienteId('ventas')` en su propia transacción, lecturas y validación, y después **un lote** (`aplicarLote`) con la venta, sus líneas, lotes y el pago inicial | La marca se lee **antes** de `siguienteId` (no gastar un número) y se escribe **en el mismo lote**, en el primer trozo |
| Abono | `PagosRepo.registrar` (`pagos.repo.ts:63`): `siguienteId('pagos')` y después `runTransaction` | Se lee la marca antes del número y se vuelve a leer y se escribe **dentro** de la transacción |
| Clienta nueva | `ClientesRepo.guardar` (`clientes.repo.ts:94`) | Con su propia marca (`<operacion_id>-clienta`), para no crearla dos veces |
| Pedido de encargo | `VentasRepo.crear` con `tipo: 'ENCARGO'` (`NuevoEncargoSheet`) | Mismo camino que la venta |
| Reglas | `firestore.rules`: cada colección nombrada; al final `match /{document=**}` niega todo | Falta `match /operaciones/{id}` |
| Estado de red | C3: `useConexion`, `esErrorSinRed`, `useExigirConexion` | La cola reemplaza al guardián **sólo** en vender, abonar y anotar |
| Deshacer | `EventosRepo.deshacerGrupo(grupo)` | Sin subir: Deshacer saca la operación de la cola. Subida: como hoy |

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/main/firebase/repositories/ventas.repo.ts`, `pagos.repo.ts`, `clientes.repo.ts` | `operacion_id` opcional y la marca |
| `src/main/firebase/operaciones.ts` (nuevo) | Leer y armar la marca; compartido por los tres |
| `firestore.rules` | `match /operaciones/{id}` |
| `mobile/src/lib/cola.ts` (nuevo) | Pura: tipos, estados, transiciones, orden |
| `mobile/src/lib/cola-local.ts` (nuevo) | Guardar la cola en IndexedDB, con respaldo en memoria |
| `mobile/src/lib/subir-cola.ts` (nuevo) | Reproducir la cola, clasificar errores; repos inyectados |
| `mobile/src/context/ColaContext.tsx` (nuevo) | La cola para las pantallas; sube al volver la red |
| `QuickSaleView.tsx`, `AbonoModalSheet.tsx`, `NuevoEncargoSheet.tsx`, `SeleccionarClientaSheet.tsx` | Encolar sin red |
| `components/PendientesSheet.tsx` (nuevo), `App.tsx`, `HistorialView.tsx`, `CobranzaView.tsx`, `EncargosView.tsx` | Ver lo pendiente y "Para revisar" |
| `tests/c4-*.test.ts`, `tests/motor-real/c4-operaciones.test.ts`, `tests/interfaz/sin_conexion.py` | Pruebas |

## Contratos nuevos

```ts
// src/main/firebase/operaciones.ts
export interface MarcaOperacion { tipo: 'VENTA' | 'ABONO' | 'CLIENTA'; resultado_id: number; creada_en: string }
export async function leerMarca(operacion_id: string): Promise<MarcaOperacion | null>;
export function marcaParaLote(operacion_id: string, marca: MarcaOperacion): OperacionLote;

// Repositorios: un parámetro opcional al final, sin romper llamadas de hoy.
VentasRepoFirestore.crear(input, grupo, operacion_id?: string): Promise<number>
PagosRepoFirestore.registrar(input, grupo, operacion_id?: string): Promise<ResultadoPago>
ClientesRepoFirestore.guardar(input, grupo, operacion_id?: string): Promise<number>

// mobile/src/lib/cola.ts
export type EstadoOperacion = 'PENDIENTE' | 'SUBIENDO' | 'SUBIDA' | 'REVISAR';
export type Operacion =
  | { tipo: 'VENTA'; input: CrearVentaInput; clienta_nueva?: GuardarClienteInput }
  | { tipo: 'ENCARGO'; input: CrearVentaInput; clienta_nueva?: GuardarClienteInput }
  | { tipo: 'ABONO'; input: RegistrarPagoInput };
export interface EnCola {
  operacion_id: string;          // crypto.randomUUID()
  grupo: string;                 // el mismo Deshacer antes y después de subir
  creada_en: string;             // ISO
  operacion: Operacion;
  estado: EstadoOperacion;
  intentos: number;
  motivo?: string;               // el error de negocio, para "Para revisar"
  resultado?: { venta_id?: number; codigo?: string; pago_id?: number; cliente_id?: number };
  resumen: { titulo: string; detalle: string; monto_usd_cents: number }; // para las listas
}
export function encolar(cola: EnCola[], nueva: EnCola): EnCola[];
export function siguiente(cola: EnCola[]): EnCola | null;  // la PENDIENTE más vieja
export function marcar(cola: EnCola[], id: string, cambio: Partial<EnCola>): EnCola[];
export function quitar(cola: EnCola[], id: string): EnCola[]; // Deshacer o Descartar
```

---

## T1 · Que la misma operación no se escriba dos veces

**Archivos:** `src/main/firebase/operaciones.ts` (nuevo), los tres
repositorios, `firestore.rules`, `tests/c4-operaciones.test.ts`,
`tests/motor-real/c4-operaciones.test.ts`.

- [x] **Paso 1: rojo en el Firestore falso**

Subir dos veces la misma venta con el mismo `operacion_id` deja **una**
venta, **un** consumo de lotes, **una** marca y el mismo número; lo mismo
con un abono y con una clienta. Además: una venta que falla por stock no
deja marca (se puede reintentar). **Error a sembrar** para comprobar la
prueba: quitar la lectura de la marca tiene que hacerla fallar.

> **Hallazgo del paso 1 (11/10):** la venta no era atómica. Sacaba la
> mercadería con una transacción por línea y escribía la venta después, en
> otro lote; si la red caía en el medio, la devolución automática tampoco
> llegaba y quedaban unidades descontadas sin venta (la prueba con
> `cortarRed` lo muestra: `[2, 3]` en vez de `[3, 3]`). Con la cola, el
> reintento las descontaba otra vez. `tests/firestore-fake.ts` suma
> `cortarRed(n)` y `restaurarRed()`.

- [ ] **Paso 2: la venta en una sola transacción, y la marca en los tres**

Venta: **una sola transacción** con todo: el número (`_secuencias`), las
existencias de cada producto (la cuenta FIFO de `ProductosRepo.salida`,
extraída a una función pura que usan los dos), la venta, el pago inicial,
los movimientos de inventario, los eventos de Deshacer (sus ids son
`idOrdenable()`) y la marca. Después, fuera de la transacción, sólo
`refrescarTotales`, que se puede recalcular. Leer la marca antes de todo
(sin gastar número) y otra vez dentro. `tasa_cambio_cents` opcional en
`CrearVentaInput` (decisión 1). Abono: dentro de su `runTransaction`,
`tx.get` de la marca y `tx.set` si no estaba; se lee antes de `siguienteId`.
Clienta: la marca en el mismo lote. Sin `operacion_id`, todo igual que
antes, pero la venta ya es atómica para todos.

- [ ] **Paso 3: la regla**

```
match /operaciones/{id} {
  allow read: if autenticado();
  allow create: if autenticado() && !exists(/databases/$(database)/documents/operaciones/$(id));
  allow update, delete: if false;
}
```

Caso en `tests/motor-real/c4-operaciones.test.ts` contra el emulador:
crear dos veces la misma marca falla la segunda; nadie la borra.

- [ ] **Paso 4: desplegar la regla (con el "publicalo" de Joswill)**

La regla tiene que estar arriba **antes** de publicar cualquier versión que
la use: la regla general del final rechaza la colección. Comparar las
reglas de producción con las del repo (como se hizo para la 2.18.0, por la
API con `gcloud`) antes y después.

## T2 · La cola en el teléfono

**Archivos:** `mobile/src/lib/cola.ts`, `mobile/src/lib/cola-local.ts`,
`tests/c4-cola.test.ts`.

- [ ] **Paso 1: rojo de la parte pura**: encolar conserva el orden de
  llegada; `siguiente` da la PENDIENTE más vieja e ignora REVISAR y
  SUBIDA; `quitar` saca sólo esa; una operación SUBIENDO al abrir la app
  (se cerró a mitad) vuelve a PENDIENTE.
- [ ] **Paso 2: implementar `cola.ts`**, sin React ni IndexedDB.
- [ ] **Paso 3: `cola-local.ts`**: una base `gh-cola` con un almacén; leer
  todo, guardar todo. Si IndexedDB falla (Safari privado), la cola vive en
  memoria y la interfaz lo dice ("Lo pendiente no queda guardado si cerrás
  la app"). Prueba con un `indexedDB` falso en memoria.

## T3 · Subir la cola

**Archivos:** `mobile/src/lib/subir-cola.ts`, `tests/c4-subir.test.ts`.

- [ ] **Paso 1: rojo**, con repositorios falsos inyectados:
  - en orden, de a una;
  - error de red: queda PENDIENTE y la subida se frena;
  - error de negocio (sin stock): REVISAR con el motivo, y la siguiente sube;
  - clienta nueva: se crea primero y su id entra en la venta;
  - reintentar una que en realidad ya había subido devuelve lo mismo (la
    marca de T1).
- [ ] **Paso 2: implementar** `subirCola(cola, repos, guardar)`: marca
  SUBIENDO, llama al repositorio con `operacion_id` y `grupo`, guarda el
  resultado (código de la venta) y SUBIDA, o PENDIENTE/REVISAR según el
  error. Una sola subida a la vez (candado).
- [ ] **Paso 3: `ColaContext`**: carga la cola al entrar, sube al pasar a
  "en línea" (`useConexion`) y al abrir con red, y después de cada subida
  `marcarCambio()` y `recargarProductos(true)`.

## T4 · Vender sin red

**Archivos:** `QuickSaleView.tsx`, `tests/interfaz/sin_conexion.py`.

- [ ] **Paso 1: rojo en el corredor sin red**: sin señal, cobrar una venta
  la deja "Pendiente de subir" (sin número), el carrito se vacía y el stock
  local baja; al volver la red se sube sola, toma número y en el emulador
  hay **una** venta. Cortar la red a mitad del guardado (`set_offline` justo
  después del toque) tampoco duplica.
- [ ] **Paso 2: encolar**: sin red, o si `VentasRepo.crear` falla con un
  error de red, la venta va a la cola con el mismo input (y la tasa del
  momento, según la decisión 1). La pantalla "Venta registrada" dice
  "Pendiente de subir · sin número todavía"; Deshacer la saca de la cola y
  devuelve el carrito. El guardián de C3 deja de frenar "Registrar venta".

## T5 · Abonar sin red

- [ ] **Paso 1: rojo**: sin señal, un abono desde la ficha de la clienta
  queda pendiente; la ficha dice "1 abono pendiente de subir" sin cambiar el
  saldo; al volver la red, sube una vez y el saldo baja.
- [ ] **Paso 2: encolar** en `AbonoModalSheet` (sólo "Registrar abono";
  "Aceptó" con pago sigue pidiendo red). No se puede abonar a una venta que
  todavía está en la cola: esa venta no aparece en Cobros hasta subir; el
  pago al vender ya va dentro de la venta.

## T6 · Anotar un pedido sin red

- [ ] **Paso 1: rojo**: sin señal, anotar un pedido con una clienta nueva
  deja el pedido y la clienta pendientes; al subir se crea **una** clienta y
  **un** encargo con ella.
- [ ] **Paso 2: encolar** en `NuevoEncargoSheet`. `SeleccionarClientaSheet`
  sin red no guarda la clienta: devuelve sus datos para que viajen con la
  operación (`clienta_nueva`). Cotizar, mandar y "Aceptó" siguen pidiendo
  red.

## T7 · Ver lo pendiente y lo que hay que revisar

**Archivos:** `PendientesSheet.tsx`, `App.tsx`, `HistorialView.tsx`,
`CobranzaView.tsx`, `EncargosView.tsx`.

- [ ] **Paso 1: rojo**: con una operación pendiente se ve "Pendientes (1)"
  junto a la franja (y con red mientras sube); una en REVISAR muestra su
  motivo con "Intentar de nuevo" y "Descartar" (que pide confirmar).
- [ ] **Paso 2: la hoja de pendientes** y el estado "Pendiente de subir"
  en Historial (arriba del día, sin número) y en la ficha de la clienta.
  Nada parpadea al subir: la fila cambia a su número.

## T8 · Cierre de C4

- [ ] **Paso 1: verificar**: todas las suites en serie, más
  `test:sin-conexion` con los casos nuevos; invariante de la bodega
  (`tests/motor-real/invariantes.ts`) con ventas que pasan por la cola.
- [ ] **Paso 2: prueba física y documentos**: en el iPhone, vender, abonar
  y anotar en modo avión, cerrar la app, abrirla con señal y ver que suben
  una vez; vender lo último de un producto en la PC mientras el celular lo
  vende sin red y ver "Para revisar". Contarle a Ross lo de "Sin número
  todavía". Actualizar CONTEXTO_SESION, la auditoría y RELEVO. Siguen las
  fases 3 a 6 de la auditoría.
