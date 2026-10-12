# U1 · Fundaciones del celular · plan de implementación

> **Para el agente de turno:** una tarea a la vez, sobre `master`, en relevo
> según [RELEVO.md](../../RELEVO.md). Primero la prueba que falla, después
> el código. Un commit por paso, con su casilla marcada.

**Objetivo:** que el celular deje de parecer una app de banco y tenga la
base para rediseñar cada pantalla en U2 a U8: la letra del sistema, una
paleta cálida con el verde de la marca y contraste medido, campos que no
hacen zoom en el iPhone, el movimiento de la casa en todos lados y las
piezas que ya se repiten (la píldora de estado y el monto con córdobas).

**Diseño:** [2026-10-11-celular-como-centro-design.md](../specs/2026-10-11-celular-como-centro-design.md),
secciones 5 (principios), 7 (sistema visual) y 9 (fases). Propuesta visual:
<https://claude.ai/artifact/Leh74th1SdWu3i13f687qQ>.

**Decisiones aplicadas** (sección 10 del diseño; Joswill pidió seguir sin
responderlas, como en C4: se aplican las recomendaciones y se corrigen si
cambia de idea):

1. **La letra del sistema** (SF Pro en iPhone, Roboto en Android) en toda
   la app. Los documentos (factura y proforma, compartidos con Windows)
   conservan la suya hasta W1 (DOC-06).
2. **Neutros cálidos y el verde de la marca** (sección 7.1), ajustados
   midiendo el contraste en los dos temas.

Las demás decisiones (pestaña Clientas, Historial en "Más", PIN, ACC-08,
DOC-03, escáner) son de U2 en adelante.

**Fuera de U1:** las pantallas no cambian de estructura (eso es U2 a U8).
Fila de lista, sección, segmentado, encabezado grande, vacío con acción y
foto de producto se construyen en la fase que los usa primero (U2 y U4),
para no dejar componentes sin uso. Windows es W1.

## Reglas

- Colores sólo por token; ningún valor escrito a mano en las pantallas.
- Nada se anima en lo que se repite; lo que se anima dura menos de 300 ms,
  con la curva de salida de la casa, y respeta "reducir movimiento".
- Haptics antes del primer `await`; textos en vos.
- Suites en serie; el corredor sin red y la suite móvil en verde al cerrar
  cada tarea que toque pantallas.

## Lo que ya existe

| Qué | Dónde |
|---|---|
| Paleta por tokens (variables CSS, claro y oscuro) | `mobile/src/index.css` (`:root` y `.dark`), `mobile/tailwind.config.js` |
| Letra: Plus Jakarta Sans por Google Fonts | `mobile/index.html` (`<link>`), `index.css` (línea 186), `tailwind.config.js` (`fontFamily`) |
| Caché de las fuentes sin señal (C3) | `mobile/vite.config.ts` (workbox); los documentos la siguen usando |
| Auditoría de pares fondo/texto | `scripts/auditar-colores.mjs`, dentro de `build:mobile` |
| Curvas y presión | `index.css`: `--ease-out`, `.m3-press` (0,96 · 140 ms), hojas 280/200 ms |
| Píldoras de estado repetidas | "Pendiente de subir" y "Para revisar" en cinco lugares (C4) |
| Capturas "antes" | `docs/superpowers/specs/capturas-celular-2026-10-11/` |

## T1 · La letra del sistema (BAS-34)

**Archivos:** `mobile/index.html`, `mobile/src/index.css`,
`mobile/tailwind.config.js`, `tests/u1-fundaciones.test.ts`,
`tests/interfaz/sin_conexion.py`.

- [x] **Paso 1: rojo**: la app no pide letras a Google (ni `<link>` en
  `index.html` ni "Plus Jakarta Sans" en sus estilos) y su pila empieza por
  la del sistema. En el corredor sin red, el caso de la letra cambia: al
  abrir la app (con red y sin ella) no sale ningún pedido a
  `fonts.googleapis.com` ni a `fonts.gstatic.com`.
- [x] **Paso 2: la letra del sistema**: `-apple-system, BlinkMacSystemFont,
  "Segoe UI", Roboto, system-ui, sans-serif`. La caché de workbox se queda
  (la usan los documentos).

## T2 · Paleta cálida con contraste medido

**Archivos:** `mobile/src/index.css`, `tests/u1-fundaciones.test.ts`.

- [x] **Paso 1: rojo**: una prueba que lee los tokens de los dos temas y
  mide: los neutros son cálidos (rojo ≥ azul en `fondo`, `superficie-2`,
  `borde`); texto, texto-2 y texto-3 llegan a 4,5:1 sobre `fondo`,
  `superficie` y `superficie-2`; `acento`, `alerta` y `peligro` como texto
  llegan a 4,5:1 sobre `superficie`; `X-texto` sobre `X` y `X-fuerte` sobre
  `X-suave` llegan a 4,5:1. Falla hoy por los neutros fríos.
- [ ] **Paso 2: la paleta nueva** de la sección 7.1, ajustada hasta pasar,
  más `--marca` (sólo logo y documentos). Mismos nombres de token: ninguna
  pantalla cambia de clase.
- [ ] **Paso 3: capturas antes y después** de las pantallas de la revisión
  del 11/10, en claro y oscuro, en `docs/superpowers/specs/capturas-u1/`.

## T3 · Campos de 16 px y la escala tipográfica

**Archivos:** `mobile/src/index.css`, `mobile/tailwind.config.js`,
`tests/interfaz/pruebas.py`.

- [ ] **Paso 1: rojo**: en la suite móvil, los campos del cobro, del abono
  y del alta de clienta miden al menos 16 px (el iPhone hace zoom al tocar
  uno más chico). Hoy el descuento y el monto miden 14.
- [ ] **Paso 2: una regla base** para campos, selects y áreas de texto
  (`max(16px, 1em)`), y la escala de la sección 7.2 como tokens nuevos
  (`titulo-grande`, `monto`, `titulo`, `cuerpo`, `secundario`, `rotulo`)
  para que las pantallas de U2 en adelante los usen. Los tokens de hoy no
  cambian de tamaño.

## T4 · El movimiento de la casa

**Archivos:** `mobile/src/index.css`, `mobile/src/components/BottomSheet.tsx`,
`mobile/src/views/QuickSaleView.tsx`, `tests/interfaz/pruebas.py`,
`tests/u1-fundaciones.test.ts`.

- [ ] **Paso 1: rojo**: agregar al carrito no muestra un aviso (el
  carrito ya lo dice; CVE-08); las hojas entran en 240 ms y salen en 180;
  presionar es `scale(0.97)` en 120 ms; el catálogo de Vender no se anima
  al bajar (sin `scroll-reveal`, CEL-16).
- [ ] **Paso 2: implementar**, con la curva de salida de la casa
  (`cubic-bezier(0.23, 1, 0.32, 1)`) como `--ease-out`.

## T5 · La píldora de estado y el monto

**Archivos:** `mobile/src/components/Pildora.tsx`,
`mobile/src/components/Monto.tsx`, las pantallas que hoy los repiten,
`tests/u1-fundaciones.test.ts`.

- [ ] **Paso 1: rojo**: la píldora toma su tono por significado
  (`pendiente`, `revisar`, `deuda`, `listo`) y siempre `X-fuerte` sobre
  `X-suave`; el monto muestra dólares y "≈ C$" con la tasa que se le pasa,
  con cifras tabulares.
- [ ] **Paso 2: los componentes**, y reemplazar las píldoras de C4 (venta
  registrada, abono, Historial, Encargos, Pendientes).

## T6 · Cierre de U1

- [ ] **Paso 1: verificar**: todas las suites en serie, `build:mobile` con
  sus auditorías, capturas en los dos temas.
- [ ] **Paso 2: documentos**: CONTEXTO_SESION, el diseño (lo que cambió al
  medir el contraste) y RELEVO. Publicar pide "publicalo".
