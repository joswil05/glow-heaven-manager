# Glow Heaven Móvil (PWA)

Versión para celular de Glow Heaven Manager. Vive en `mobile/` pero **no es
un proyecto npm aparte**: comparte `package.json`, `node_modules`, `firebase`
y la lógica de negocio de la app de escritorio (`src/core/`,
`src/main/firebase/repositories/`). Es un segundo build de Vite dentro del
mismo repo, apuntando a otra carpeta de salida (`dist-mobile/`).

Contexto y reglas de negocio completas: [`../docs/PLAN_VERSION_MOVIL_PWA.md`](../docs/PLAN_VERSION_MOVIL_PWA.md).

## Por qué comparte código con el escritorio

- `src/core/*` (precios, inventario, moneda, prorrateo) es lógica pura, sin
  Node ni Electron: se importa tal cual.
- `src/main/firebase/repositories/*` (`productos`, `ventas`, `clientes`,
  `pagos`, `parametros`, `panel`, `eventos`) solo usan el SDK modular de
  `firebase/firestore`, que corre igual en Node que en el navegador. Son los
  mismos que ya descuentan stock en una transacción (`ProductosRepoFirestore.salida`)
  y arman la venta en un solo lote — no había que reinventar esa parte.
- Lo único que **no** se reutiliza es `src/main/firebase/auth.ts` y
  `google-auth.service.ts`: dependen de `electron` (`safeStorage`, ventanas,
  un servidor HTTP local para el rebote de OAuth). El navegador no necesita
  ese rodeo: `mobile/src/lib/firebase-mobile.ts` inicia sesión con
  `signInWithPopup`/`signInWithRedirect` directo contra Firebase Auth.

`mobile/vite.config.ts` resuelve `@core`, `@shared` y `@repos` apuntando a
`../src/core`, `../src/shared` y `../src/main/firebase/repositories`. El
`define` de `process.env.*_EMULATOR_HOST` ahí mismo neutraliza la única
referencia a Node (`process.env`) que tiene `src/main/firebase/client.ts`.

## Requisitos previos en Firebase (una sola vez)

1. **Authentication → Sign-in method → Google**: tiene que estar habilitado.
   Es el mismo proveedor que ya usa el botón "Continuar con Google" del
   escritorio, así que si esa migración (ver `../docs/CONTINUAR.md`) ya lo
   habilitó, no hay nada que hacer acá.
2. **Authorized domains** (misma pantalla): agregar el dominio donde quede
   publicada la PWA (el de Firebase Hosting se agrega solo al hacer el primer
   deploy; si se sirve desde otro dominio, agregarlo a mano).
3. Un **segundo sitio de Hosting** dentro del mismo proyecto
   (`glow-heaven-db-app`), porque `firebase.json` ya podría estar sirviendo la
   landing page desde el sitio por defecto:

   ```bash
   firebase login
   firebase hosting:sites:create glow-heaven-movil
   firebase target:apply hosting movil glow-heaven-movil
   ```

   Esto escribe el mapeo en `.firebaserc` (`targets.glow-heaven-db-app.hosting.movil`).
   Sin este paso, `npm run deploy:mobile` falla porque el target `movil` de
   `firebase.json` no apunta a ningún sitio.

## Desarrollo

```bash
npm run dev:mobile       # http://localhost:5174, con recarga en caliente
```

El Service Worker está desactivado en desarrollo (`devOptions.enabled: false`
en `mobile/vite.config.ts`) para no cachear nada mientras se itera.

## Build y despliegue

```bash
npm run build:mobile     # tsc --noEmit + vite build → dist-mobile/
npm run deploy:mobile    # build + firebase deploy --only hosting:movil
```

`build:mobile` tipa solo `mobile/src` (y lo que ese código importa de
`src/core`/`src/shared`/`src/main/firebase`), no el resto de la app de
escritorio — así una migración a medias en el renderer de Electron no bloquea
el build de la PWA, y viceversa.

## Qué hace cada módulo

| Módulo | Vista | Reutiliza |
|---|---|---|
| Acceso | `views/LoginView.tsx` | Firebase Auth (Google) directo en el navegador |
| Panel | `views/DashboardView.tsx` | `PanelRepoFirestore.cargar()` + `lib/panel-movil.ts` (tendencia de 7 días y encargos pendientes, que el panel de escritorio no necesita) |
| Venta rápida | `views/QuickSaleView.tsx` | `ProductosRepoFirestore`, `ClientesRepoFirestore`, `VentasRepoFirestore.crear()` (descuento de stock transaccional incluido) |
| Consulta de inventario | `views/InventoryQuickView.tsx` | `ProductosRepoFirestore.listar()` |

El comprobante de WhatsApp (`lib/util.ts#linkWhatsapp`) abre
`https://wa.me/<numero>?text=<mensaje>` con el número de la clienta
normalizado a Nicaragua (505 + 8 dígitos) y el texto ya armado; el sistema
operativo decide si lo abre en la app de WhatsApp o en `web.whatsapp.com`.

## Pendiente conocido

- **Tamaño del bundle**: el chunk principal pesa ~240 KB gzip (Firebase Auth
  + Firestore + React). Cumple el criterio de "carga en menos de 2 segundos"
  en 4G normal, pero si hace falta apretarlo más, el siguiente paso es
  code-splitting por vista con `React.lazy` en `App.tsx`.
- **PIN de seguridad** (`parametros.pin_seguridad`): el escritorio lo usa como
  segundo factor local (`PinLockView.tsx`); esta primera versión de la PWA no
  lo pide todavía porque depende de qué tan sensible sea el celular donde
  quede instalada. Se puede agregar como una pantalla extra antes de
  `<App>` si se decide que hace falta.
