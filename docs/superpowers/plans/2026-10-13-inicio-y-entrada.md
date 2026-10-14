# Inicio y entrada del celular (ENT-1, INI-1, INI-2, INI-3)

> **Para quién es esto**: la sesión de Claude o Codex que lo implemente o lo
> retome, en relevo según [RELEVO.md](../../RELEVO.md).
> **Fecha**: 13 de octubre de 2026. **Rama**: `mejoras-inicio` (no entra a
> `master` hasta que Joswill vea las capturas y diga que sí).
> **Origen**: las cuatro propuestas que Joswill aprobó en la página "Mejoras
> del celular" (https://claude.ai/artifact/L3oHYGfWZqyacpYjYpCQ2w). **Se queda
> el diseño de hoy**: las mismas tarjetas, colores, letra y componentes; sólo
> cambia el orden y lo que hay en Inicio, y el texto de la entrada.

## Lo aprobado

- **ENT-1 · Entrada sin folleto**: el logo, una línea útil ("Entrá con tu
  cuenta de Glow Heaven") y el botón de Google. Se van la píldora "Punto de
  Venta Móvil" y el texto de "gestión en vivo". "Pure · Magic · Divine" ya
  está sólo dentro del logo.
- **INI-1 · Un Inicio ordenado por lo que hace Ross**, con las tarjetas de
  hoy: arriba "Ventas de hoy" (dólares y córdobas al lado, la ganancia y
  cuántas ventas; tocarla abre el Historial); las acciones rápidas (Vender,
  Abono, Pedido, Paquete); "Te deben" (las tres clientas que más deben, con
  su WhatsApp, y "Ver todas"); "Encargos" con sólo lo que espera algo de
  Ross; los paquetes con su avance; "Lo último" (los cinco movimientos más
  recientes). En el título, el nombre del negocio en vez de "Mi Negocio"
  cuando la cuenta no tiene nombre.
- **INI-2 · La gráfica de 7 días sale de Inicio**: queda una línea con los
  últimos 7 días y los 7 anteriores. (Reportes, REP-1, no está aprobado: la
  gráfica no se muda a ningún lado todavía.)
- **INI-3 · Recargar deslizando, sin botón**: se va el botón de recargar. El
  engranaje se queda en Inicio mientras NAV-1 no esté aprobado.

Salen de Inicio las tarjetas "Por cobrar" (la reemplaza "Te deben", que dice
el total) e "Inventario" (está en su pestaña).

## Pasos

- [x] **T1 · Entrada** (`mobile/src/views/LoginView.tsx`): sin la píldora ni
  el texto de folleto; la línea "Entrá con tu cuenta de Glow Heaven" como
  título; se va la línea repetida de abajo ("Ingresa con tu cuenta
  autorizada", que además le hablaba de tú). Los avisos (iPhone en WhatsApp,
  otra dirección, sin internet, error) quedan igual.
- [x] **T2 · La parte pura de Inicio** (`mobile/src/lib/inicio.ts`, con
  pruebas en `tests/inicio-movil.test.ts`): deudas agrupadas por clienta y
  ordenadas; lo que espera a Ross en Encargos; los dos totales de 7 días; los
  últimos movimientos mezclando ventas y abonos.
- [x] **T3 · Inicio arriba**: encabezado sin el botón de recargar, tarjeta
  "Ventas de hoy" tocable con córdobas y la línea de 7 días, acciones
  rápidas. Sin gráfica ni tarjetas de "Por cobrar" e "Inventario". `App.tsx`
  pasa "Pedido" (Encargos con la hoja de pedido nuevo) y "Paquete" ("Llegó un
  paquete", que vuelve a donde se abrió).
- [x] **T4 · Inicio abajo**: "Te deben" (tocar una clienta abre Cobros
  buscándola; WhatsApp con la plantilla de cobro), "Encargos", paquetes y "Lo
  último".
- [ ] **T5 · Pruebas y capturas**: casos nuevos en `tests/interfaz/pruebas.py`;
  `npm test`, tipos, `test:interfaz`, `test:sin-conexion`, `build:mobile`;
  capturas antes y después, en claro y oscuro, en la página para Joswill.
