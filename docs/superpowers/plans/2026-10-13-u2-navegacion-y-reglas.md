# Navegación y reglas de toda la app del celular (NAV-1, NAV-3, CAM-1, MOV-1)

> **Para quién es esto**: la sesión de Claude o Codex que lo implemente o lo
> retome, en relevo según [RELEVO.md](../../RELEVO.md).
> **Fecha**: 13 de octubre de 2026. **Rama**: `mejoras-inicio`. Las demás
> fases (U3 a U8) vienen después, de a una, cada una con su plan.
> **Origen**: propuestas aprobadas por Joswill el 13/10 en la página
> "Mejoras del celular" (https://claude.ai/artifact/L3oHYGfWZqyacpYjYpCQ2w).
> Se queda el diseño de hoy: la barra flotante se ve igual.

## Lo aprobado

- **NAV-1 · Navegación: dos pestañas cambian**: La barra de abajo se ve igual
  que hoy y sigue con cinco pestañas: Inicio · Vender · Clientas · Inventario
  · Más. Cobros pasa a ser Clientas (CLI-1) y el Historial entra en "Más", una
  lista con Ventas, Encargos, Paquetes, Reportes y Ajustes. Encargos y Ajustes
  dejan de estar escondidos detrás de una tarjeta y un engranaje.
- **NAV-3 · Insignias sólo con algo para hacer**: los números sobre las
  pestañas sólo aparecen cuando hay algo que hacer: encargos por mandar o por
  entregar, cobros vencidos, pendientes de subir. Nunca de adorno.
- **INI-3**, la parte que quedó: el engranaje de Inicio se va a "Más".
- **CAM-1 · Campos de 16 px**: todo campo donde se escribe pasa a letra de
  16 px, sin cambiar nada más (el iPhone agranda la pantalla con menos).
- **MOV-1 · Movimiento**: agregar al carrito, cambiar de pestaña y filtrar no
  se animan. Lo que sí (abrir una hoja, el éxito de una venta) dura menos de
  300 ms con una curva de salida fuerte; las hojas entran en 240 ms y salen en
  180. Presionar cualquier botón lo achica a 0,97. Respeta "reducir
  movimiento".
- **TXT-1 y TXT-2** en lo que no es de ningún agente (barra, franjas, avisos,
  pendientes, entrada).

## Pasos

- [ ] **T1 · Más**: `mobile/src/views/MasView.tsx` con Ventas, Encargos,
  Paquetes, Reportes y Ajustes, cada una con su "Volver" a Más. `App.tsx` y
  `BottomNav.tsx` con las cinco pestañas nuevas; el engranaje sale de Inicio.
  Las pantallas que todavía no llegaron de los agentes (Paquetes, Reportes)
  no aparecen hasta que lleguen.
- [ ] **T2 · Insignias**: Clientas con los cobros vencidos; Más con los
  encargos que esperan a Ross y lo que hay que revisar de la cola. Sin
  insignia cuando no hay nada.
- [ ] **T3 · Campos y movimiento**: la regla global de 16 px; sin animación
  al cambiar de pestaña; hojas a 240 ms de entrada y 180 de salida; presión a
  0,97; "reducir movimiento" en todo lo nuevo.
- [ ] **T4 · Pruebas y capturas**: `npm test`, tipos, `test:interfaz`,
  `test:sin-conexion`, `test:interfaz-escritorio` si se tocó algo compartido,
  `build:mobile`; capturas antes y después, en claro y oscuro, en la página
  para Joswill.
