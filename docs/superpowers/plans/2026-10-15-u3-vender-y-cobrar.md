# Vender y cobrar en el celular (U3)

> **Para quién es esto**: la sesión de Claude o Codex que lo implemente o lo
> retome, en relevo según [RELEVO.md](../../RELEVO.md).
> **Fecha**: 15 de octubre de 2026. **Rama**: `mejoras-inicio`, de a una
> tarea. **Origen**: propuestas aprobadas por Joswill el 13/10 en la página
> "Mejoras del celular" (https://claude.ai/artifact/L3oHYGfWZqyacpYjYpCQ2w).
> Se queda el diseño de hoy: las mismas tarjetas, botones y hojas.

## Lo aprobado

- **VEN-1 · En Vender, el buscador primero**: arriba el buscador (por nombre,
  código o tono), debajo las categorías como hoy. "Anotar un pedido" sale de
  Vender: va a las acciones rápidas de Inicio (ya está, "Pedido") y a
  Encargos.
- **VEN-2 · Agregar al carrito sin aviso**: tocar "+" no muestra más el aviso
  "Agregado: …". El producto muestra su cantidad, la barra de cobro cambia
  ("Cobrar $24.00 · 2") y el teléfono vibra suave (hecho en U1).
- **VEN-3 · La foto del producto en vez de las iniciales**: cada producto
  conserva su tarjeta de hoy, pero muestra su foto (o el ícono de su
  categoría si no tiene) en lugar de las iniciales, y dice "en bodega" (hecho
  en U1). Los córdobas de cada fila se van; quedan en el total.
- **VEN-4 · La barra de cobro en lugar de la navegación**: mientras hay algo
  en el carrito, la barra "Cobrar" ocupa el lugar de la barra de abajo, en
  vez de apilarse encima. Al vaciar el carrito vuelve la navegación.
- **COB-1 · El cobro en una pantalla completa y ordenada**: una pantalla
  completa en lugar de la hoja, con los componentes de hoy, de arriba hacia
  abajo: clienta (buscador en línea, "Mostrador" por defecto); los artículos
  con cantidad y un precio que se puede cambiar; "Agregar descuento" plegado;
  forma de pago **Contado · Crédito** con cuotas opcionales en crédito; moneda
  y método con botones; la fecha (hoy, se puede cambiar). Al pie, el total en
  la moneda elegida y "Registrar venta". La pantalla de "Venta registrada"
  (recibo, WhatsApp, Deshacer) se conserva.
- **COB-2 rechazada**: "no tengo sistema de apartado en mi modelo de
  negocio". Sale la palabra "Apartado"; no se construye nada.
- **COB-3 · Elegir clienta tocando la fila**: en "Elegí la clienta" se toca
  la fila entera, sin el "Elegir" repetido, y cada clienta muestra lo que
  debe.

## Cómo, sin duplicar reglas

La venta se arma con el mismo `CrearVentaInput` que usa Windows
(`src/renderer/src/views/ventas/VentaEditor.tsx`): `fecha`, el precio de cada
línea en `precio_unitario_usd_cents`, `plan_cuotas` (`cantidad` y
`cada_dias`, con los valores por defecto de Configuración
`cuotas_defecto_cantidad` y `cuotas_defecto_dias`) y el descuento. La cola sin
señal (C4) guarda ese mismo input, así que los datos nuevos viajan solos; las
pruebas `tests/c4-*.test.ts` tienen que seguir en verde.

## Pasos

- [x] **T1 · Vender ordenado** (VEN-1, VEN-2, VEN-3): el buscador arriba;
  sin "Anotar un pedido"; sin el aviso al agregar; la foto o el ícono de la
  categoría; sin córdobas por fila.
- [x] **T2 · La barra de cobro abajo** (VEN-4): `QuickSaleView` avisa cuántas
  unidades hay en el carrito; `App` esconde la barra de navegación mientras
  haya algo y la barra de cobro baja a su lugar.
- [x] **T3 · El cobro en pantalla completa** (COB-1, COB-2): la pantalla
  nueva con clienta, artículos con precio editable, descuento plegado,
  Contado · Crédito con cuotas, moneda y método con botones, fecha y el pie.
- [x] **T4 · Elegir clienta** (COB-3): fila entera, sin "Elegir", con lo que
  debe.
- [ ] **T5 · Pruebas y capturas**: unitarias de lo puro, casos de pantalla,
  `test:interfaz`, `test:sin-conexion`, `build:mobile`; capturas para Joswill.
