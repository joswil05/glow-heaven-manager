# Traspaso — Glow Heaven Manager (Histórico)

> [!NOTE]
> **ESTE DOCUMENTO ES UN REGISTRO HISTÓRICO (2026-09-11).**  
> Para el estado técnico vigente, arquitectura, reglas y nomenclatura actual, consultá:  
> 👉 **[docs/CONTEXTO_TECNICO_IA.md](file:///c:/Users/espin/Downloads/Proyectos_Codigo/landing_page_ross/herramienta_de_gestion_interna/docs/CONTEXTO_TECNICO_IA.md)** (Versión `v2.2.8`).  
> 
> **Actualizaciones sobre este documento histórico:**
> 1. **`npm run typecheck`**: Cero errores (la migración a Google Auth concluyó exitosamente).
> 2. **`npm test`**: 133/133 pruebas pasando en verde.
> 3. **El ítem P0 (Paquetes)**: **RESUELTO mediante rediseño arquitectónico**. `PaqueteEditor.guardar()` ya no llama a `compras.recibir`. Ahora guarda el paquete atómicamente con peso y costos, y la vinculación de productos se realiza desde Inventario (`ProductoModal.tsx` / `productos.repo.ts`) mediante `paquete_id`, con sus propios movimientos y `evento_grupo_id`.

---

## ⚠ Estado del árbol al momento de escribir esto (HISTÓRICO - RESUELTO)

**`npm run typecheck` falla con 7 errores.** No son de los cambios descritos
abajo: son de una migración a **login con Google** que otra persona empezó en
paralelo y todavía no terminó (`src/main/firebase/google-auth.service.ts`,
`LoginView.tsx`, `Header.tsx`, `ipc-contracts.ts`, tocados 13:36–13:40).

Antes de tocar cualquier otra cosa, cerrá esa migración. Lo que falta:

| Archivo | Qué le falta |
|---|---|
| `src/renderer/src/mock-api.ts` | No tiene la sección `auth`; `ApiPuente` ahora la exige |
| `src/renderer/src/views/LoginView.tsx:22` | Lee `res.error` sobre un `Resultado` sin estrechar por `success` |
| `src/renderer/src/views/LoginView.tsx:2` | `ExternalLink` importado y sin usar |
| `src/renderer/src/components/layout/Header.tsx:5` | Ruta rota a `shared/ipc-contracts` (le sobra un `../`) |
| `src/renderer/src/App.tsx:11,14,37` | Quedaron `NubeSection`, `Button` y `nube` sin usar tras quitar la pantalla de configuración de Firebase |

**Decisión pendiente y no menor:** conviven dos formas de autenticar. La de
correo y contraseña (`nube.configurar`, `NubeSection`, `acceso.service.ts` con
el PIN) y la nueva de Google. Hay que elegir una y borrar la otra entera,
incluida su superficie IPC. Mientras convivan, la pantalla de arranque tiene
dos dueños y ninguno manda.

---

## Qué se hizo en esta sesión

### 1. El flujo del paquete ahora describe el negocio real

Era el error de modelo más grande. La dueña **no** sigue el viaje del paquete:
alguien le compra en USA y se lo manda, el envío lo cobra el courier **acá**,
por libra, y el tax del 7% ya viene en el recibo de la tienda gringa.

- El campo principal de `PaqueteEditor` pasó a ser **el peso total del
  paquete**, que es el dato que existe de verdad (está en la factura del
  courier). El peso por producto no lo tiene nadie.
- El envío se calcula solo: `peso × tarifa_envio_cents_lb`. Editable, y el
  campo recuerda si lo escribieron a mano (`envioManual`).
- Los pesos por línea se reparten con **`repartirPeso`** (`src/core/costeo.ts`,
  5 pruebas): usa el `peso_unitario_mlb` que ya esté en el inventario y, si no
  lo conoce, reparte por unidades. Se puede corregir a mano detrás de
  "Ajustar pesos"; la última línea absorbe el redondeo para que la suma cuadre
  exacto.
- **Un solo botón de guardar**, que además mete la mercadería al inventario.
  Se fueron "Guardar borrador" y "En camino".

### 2. Respaldos: eliminados

Eran de cuando la base era SQLite. Con Firestore el volcado diario costaba una
lectura por documento todos los días sin proteger de nada. Se borró
`backup.service.ts`, los canales IPC, el botón del encabezado, el atajo Ctrl+B,
la sección de Configuración y el campo `ruta_backup_configurada`.

### 3. Nada de diálogos del sistema

No queda ni un `window.confirm`, `window.prompt` ni `window.alert`.

- `components/ui/Confirmar.tsx` — enumera consecuencias y arranca el foco en
  la salida, no en la acción destructiva. Cableado en 6 lugares.
- `views/inventario/AjustarStockModal.tsx` — conteo físico: muestra cuántas
  había y cuántas suma o resta antes de aplicar.

### 4. Paleta propia, sin nombres prestados

`slate`, `navy` y `brand` **ya no existen**. Eran Tailwind renombrado (`navy`
era exactamente `slate`, `brand` exactamente `indigo`). Ahora todo sale de
variables CSS en `temas.css` con nombres semánticos. Los 19 pares de contraste
que se usan pasan 4.5:1 (verificado calculando luminancia, no a ojo).

`lib/cn.ts` extiende `tailwind-merge` con los tamaños de fuente propios. Sin
eso los clasificaba como colores de texto y borraba uno de los dos en
silencio: era la causa mecánica de que la interfaz se viera plana.

### 5. Fotos de producto

`lib/foto.ts` reduce a 320px y JPEG 0.7 (~25 KB) antes de guardar. Va dentro
del documento del producto, así que hay un límite real: el inventario se lee
entero de una vez. Miniatura en la lista y en el detalle.

### 6. Otros

- "Cancelar" → **"Anular esta venta"**, fuera del grupo de botones diarios.
- Teléfono del cliente → WhatsApp con el saldo ya escrito.
- `VentaEditor` arranca buscando en el inventario; escribir a mano quedó de
  salida secundaria. En encargos es al revés, que es lo correcto.
- Se fueron los `toFixed(2)` de presentación (convivían `C$2,416.92` y
  `C$1812.69`). Regla: el formato sale de `formatearMoneda`; `toFixed` solo
  vale para rellenar el `value` de un input.
- Panel con estado de primer uso en vez de cuatro ceros.
- Código muerto borrado: `operacionRefrescarTotales`, `operacionesMovimiento`,
  `registrarMovimiento`, `listarDeVenta`, `getValor`/`setValor`, `quitarPin`,
  `compras.sugerirEnvio`, `compras.cambiarEstado`, `sugerirEnvioPorPeso`.
- `npm run emulador` ahora encuentra el JDK de `~/.jdks` solo
  (`scripts/emulador.mjs`). Antes había que exportar `JAVA_HOME` a mano.

**Verificación:** la suite del Firestore falso pasa entera (113 al momento de
escribir esto: 110 del dominio más 3 que trajo la migración a Google), y las 8
del emulador oficial también, incluida una nueva que comprueba que la foto
entra y sale intacta. `npm run build` empaqueta bien.

Ojo: **`npm test` pasa pero `npm run typecheck` no.** Vitest compila solo los
módulos que importa cada prueba, y los errores de arriba están en archivos que
ninguna prueba toca (`mock-api.ts`, `LoginView.tsx`, `Header.tsx`, `App.tsx`).
Verde en las pruebas no quiere decir que el árbol compile.

---

## Lo que queda, por orden

### P0 — Un paquete guardado no se puede corregir (RESUELTO POR REDISEÑO)

> [!NOTE]
> **ESTADO ACTUAL:** Este problema ya fue resuelto. El flujo fue rediseñado de raíz:
> - `PaqueteEditor.guardar()` ya **no** llama a `compras.recibir`. Ahora guarda el paquete atómicamente con su peso y costos bajo un único `evento_grupo_id`.
> - La asignación de productos al paquete se realiza desde Inventario (`ProductoModal.tsx`), asociando `paquete_id` y generando su propio movimiento de inventario atómico en `productos.repo.ts`.
> - Además, `PaquetesView.tsx` ahora sí permite editar y gestionar paquetes en estado `RECIBIDA`.

*(Texto original histórico guardado abajo como referencia):*

**Esto es una regresión introducida en esta sesión.** Al unificar el guardado
con la recepción, el paquete queda en `RECIBIDA` de inmediato, y
`PaquetesView` no ofrece ninguna acción para ese estado: ni editar, ni
archivar. Un cero de más en un precio queda grabado para siempre.

Peor: `PaqueteEditor.guardar()` hace **dos** llamadas
(`compras.guardar` y `compras.recibir`), cada una con su propio
`evento_grupo_id`. Deshacer revierte la mitad. Y `recibir()` llama a
`Productos.entrada()` sin pasar grupo, así que las entradas de inventario no
quedan asociadas a nada reversible.

Arreglo propuesto, en dos partes:

1. **Una acción, un grupo.** Un método `ComprasRepo.registrar(input, grupo)`
   que haga guardar + recibir bajo el mismo `evento_grupo_id`, expuesto como
   un solo canal IPC. Que `Productos.entrada()` acepte el grupo y registre su
   evento, para que el deshacer revierta también las existencias. Hoy no lo
   hace, y sin eso el deshacer deja el stock sumado y el paquete sin recibir:
   corrupción silenciosa.
2. **Corregir un paquete cerrado.** Una acción "Deshacer este paquete" que
   revierta las entradas y lo borre, permitida solo si no se vendió ninguna
   unidad que haya entrado con él. La dueña lo vuelve a registrar bien. Es más
   honesto que editar en caliente un documento del que ya salió mercadería.

Mientras tanto la fila dice "Cerrado: ya movió el inventario", que al menos
explica por qué no hay botones.

### P1 — "En camino" quedó siendo interfaz muerta

Con el flujo nuevo ningún paquete se queda en `EN_CAMINO`, así que
`inversion_en_camino_usd_cents` siempre va a valer 0. Pero sigue sumándose al
total invertido, tiene un segmento propio en el anillo del panel que nunca se
pinta, y un texto de ayuda que nunca aparece.

Sitios: `panel.repo.ts:72,107`, `PanelView.tsx:82,164,257`,
`mock-api.ts:150,185`, `compras.repo.ts:190,215` (todavía `estado ??
'BORRADOR'`, ya inalcanzable).

Dos caminos. El barato es borrar el concepto. El bueno es **reutilizar ese
hueco para los anticipos de encargos ya cobrados y todavía no comprados**, que
sí es capital comprometido que hoy no se ve en ninguna parte, y que la dueña
mencionó desde el primer día.

### P2 — Pegar el recibo de USA

Cargar quince líneas a mano son unas cuarenta tabulaciones, y el recibo ya
está en el celular como texto. Un campo "pegá acá el recibo" en
`PaqueteEditor` que separe nombre y precio por línea. Ahora que el peso no se
tipea, esto es lo único que queda de trabajo manual pesado.

Cuidado: el parseo es heurístico y se equivoca. Que rellene la tabla y deje
corregir, nunca que guarde directo.

### P3 — Suelto

- Fotos en el buscador de `VentaEditor` y en el detalle de la venta. Ya están
  guardadas; solo falta mostrarlas.
- `tailwind.config.js` declara `darkMode: 'class'` y `temas.css` no tiene
  tokens oscuros. O se agregan o se quita la declaración.
- Revisar si `firestore.indexes.json` tiene índices huérfanos tras haber
  quitado consultas.

### Lo que solo puede hacer la dueña

En la consola de Firebase: habilitar Authentication, crear la cuenta, y
después `firebase deploy --only firestore:rules,firestore:indexes`. Sin eso
las reglas no están publicadas y la base sigue abierta. **Si la migración a
Google prospera, el método a habilitar es Google, no correo y contraseña.**

---

## Cómo verificar

```bash
npm run typecheck     # HOY FALLA: 7 errores de la migración a Google
npm test              # ~113 pruebas, 2 s, sin red
npm run build         # compila y empaqueta

npm run emulador      # en otra terminal
npm run test:emulador # 8 pruebas contra el motor real de Google
```

La suite del emulador no es opcional si tocás la forma de un documento, las
reglas o una consulta con `orderBy`. Ya encontró tres cosas que el Firestore
falso no puede ver: `undefined` dentro de arrays, reglas que rompían los
borrados, y que `sinUndefined` tenía que ser recursivo.
