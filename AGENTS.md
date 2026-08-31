# AGENTS.md — Glow Heaven Manager

## Reglas absolutas
- Dinero SIEMPRE en INTEGER de centavos (`usd_cents`, `cor_cents`). Jamás float.
- Pesos en milésimas de libra (`peso_mlb`). Porcentajes en basis points (`bp`).
- El tipo de cambio se congela por documento. Nunca leer el global en históricos.
- El estado vive en `pedido_items`, no en `pedidos`. `estado_derivado` se calcula y persiste en cada mutación de items.
- Prorrateo: flete/casillero por PESO, aranceles/comisión % por VALOR.
  Repartir residuos por método del mayor residuo. La suma DEBE cuadrar exacto.
- Mapeo de costos prorrateados: por `tipo` (`FLETE`, `ARANCEL/IVA_ADUANA`, `OTRO`), nunca por `base`.
- Nada se borra físicamente: `activo = 0` o estado `CANCELADO`.
- Toda mutación de datos se envuelve en `db.transaction()` y escribe en la tabla `eventos` con `evento_grupo_id` (UUID).
- `Ctrl+Z` revierte el último grupo de eventos mientras el toast de 10s esté activo.
- La UI NUNCA muestra basis points ni centavos crudos: siempre en lenguaje humano ("35%", "C$36.62", "$12.50").
- Montos mostrados siempre en C$ y USD juntos.
- Lenguaje sin tecnicismos en UI: español nicaragüense claro y amigable.

## Arquitectura
- SQLite (better-sqlite3) solo en el proceso main. Renderer nunca toca la BD directamente.
- IPC tipado con contextBridge. `contextIsolation: true`, `nodeIntegration: false`.
- Lógica de negocio en `src/core/`: TypeScript puro, sin Electron, 100% testeable con Vitest.

## Comandos de verificación
- `npm test` — debe pasar todas las pruebas unitarias y de aceptación (suma exacta $288.30, residuos, cotizador)
- `npm run build` — cero errores de TypeScript (`strict: true`) y empaquetado de Electron
- `npm run build:exe` — siempre eliminar previamente el `.exe` o la carpeta `release/` anterior para garantizar que el nuevo instalador sea fresco y limpio.
