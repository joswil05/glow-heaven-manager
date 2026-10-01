# Equivocaciones que no dejan rastro, y datos con formato

> **Para quién es esto**: Joswill y la sesión que lo implemente.
> **Origen**: la revisión de los datos de producción del 30 de septiembre de
> 2026. Joswill: *"si fue un dato mal ingresado o erróneo por confusión me
> parece desordenado que se quede ahí guardada y de forma visible"*, y *"los
> formularios y números de teléfono deben tener un formato específico y
> reparar errores de mayúsculas automáticamente"*.
> **Estado**: la parte 1 (limpieza) está aplicada en producción; la parte 2
> (formato al guardar) está hecha en los repositorios; la parte 3 ("Fue un
> error") es diseño aprobado, para después de la Fase 1 de la auditoría.

---

## 1. La limpieza del 30 de septiembre (hecha)

Un solo commit REST con condiciones (`currentDocument.updateTime` en cada
escritura), 68 escrituras. Respaldos en `respaldos/antes-de-limpiar-2026-09-30b.json`
y `respaldos/despues-de-limpiar-2026-09-30.json`; la comparación de los dos
muestra sólo lo planeado.

**Se borró lo que nunca pasó**, con sus pagos, movimientos y eventos:

| Qué | Por qué |
|---|---|
| V-0007 y su pago de C$600 | La venta de Marlon cargada con productos equivocados; se volvió a cargar como V-0018. |
| V-0021, su pago y la clienta #17 | Venta cargada a una Rayza Paniagua duplicada; se volvió a cargar como V-0022 a la #18. |
| Restos de V-0001 (pago anulado, dos movimientos, eventos) | Venta de prueba del 16/9 que se había borrado a mano. |
| El pago 8 (C$549.30 de José Linarte, anulado) | No pagó: V-0015 sigue debiendo $15. |
| La entrada de P-0014 y los eventos de P-0024 "Camisa X" | Un producto duplicado por doble clic y uno de prueba. |
| `conexion_prueba/ping` y las dos invitaciones de prueba | Restos de la puesta en marcha. |

**Se corrigió**: los teléfonos de 14 clientas y el del negocio al formato de
la parte 2; "Steve Maddem" → "Steve Madden" (producto, PQ-0001 y V-0017); la
ciudad de Fryda (León, estaba en la dirección); la línea 15 de PQ-0001
apuntaba a una talla que ya no existe (ahora a la M, donde está su lote); la
hora (`creado_en`) de 7 pagos iniciales; y el contador de productos vuelve a
P-0024.

**No se tocó**: los encargos E-0005 y E-0006 de Katherine (pueden ser "no se
consiguió" reales), el saldo de María Alejandra (debe C$97.90, confirmado),
las fechas de las ventas del 29/9, y dos cosas del historial que rehacer sería
inventar: el costo de los movimientos de entrada de PQ-0001 (precio de tienda,
sin flete) y el historial por talla de P-0006 y P-0007. Ninguna pantalla
muestra esos dos.

El dinero no se movió: 18 ventas, $157.07 cobrado, $335.93 por cobrar, bodega
$37.95, y costo vendido + bodega = $370.16 = PQ-0001.

---

## 2. Formato al guardar (hecho, en los repositorios)

`src/core/formatos.ts`, aplicado por los repositorios. Va ahí y no en cada
formulario para que lo cumplan las dos apps y todas las puertas (Clientes,
la clienta rápida de Nueva venta, el celular, los paquetes que crean
productos), y para no chocar con la Fase 1, que reescribe los formularios.

| Dato | Regla | Ejemplo |
|---|---|---|
| Teléfono de Nicaragua | `+505 XXXX XXXX`; acepta lo que se escriba o se pegue de WhatsApp | `86012442`, `8601-2442`, `‪+505 8601 2442‬` → `+505 8601 2442` |
| Teléfono de otro país | Con `+` y su código | `+1 (504) 463-6250` → `+1 504 463 6250` |
| Teléfono que no encaja | Se rechaza: *"Revisá el teléfono: uno de Nicaragua lleva 8 dígitos; si es de otro país, empezalo con + y el código."* | `8601244`, `ochenta` |
| Nombre de clienta, ciudad, titular de cuenta | Mayúscula inicial, partículas en minúscula, sin inventar tildes | `maría josé DE LA cruz` → `María José de la Cruz` |
| Producto, color, pieza de encargo | Se arregla sólo si viene todo en minúscula o todo en mayúscula; si mezcla, se respeta | `termo stanley` → `Termo Stanley`; `Thank u` queda |
| Categoría | Igual, pero como frase | `ROPA DEPORTIVA` → `Ropa deportiva` |
| Talla | Mayúscula | ` xl ` → `XL` |
| Todo texto | Sin invisibles, sin espacios de sobra; las notas conservan sus renglones | |

Además: **buscar un número compara sólo los dígitos** (`core/texto.ts`), así
que `86012442` encuentra a `+505 8601 2442` en todos los buscadores, y **el
pago inicial de una venta guarda su hora** como cualquier abono.

Pruebas: `tests/formatos.test.ts` (22). Cada conexión con un repositorio se
verificó sembrando el error: las nueve hicieron fallar su prueba.

### Lo que queda para las fases de la auditoría

- **WhatsApp con números extranjeros** (Fase 2, TRA-03): `ClientesView`
  ("Enviar WhatsApp") y `VentasView` (`enviarCobroWhatsApp`) anteponen `505`
  a mano y rompen `+1 504…`. Tienen que usar `telefonoWhatsapp`.
- **Dos módulos de formato**: `src/shared/formatoTexto.ts` (v2.2.12) da
  formato en los formularios de Windows mientras se escribe, y siempre fuerza
  mayúsculas ("Thank u" → "Thank U", "e.l.f." → "E.l.f."). Al tocar esos
  formularios (Fase 1 o 5), que usen las funciones de `core/formatos.ts` al
  salir del campo, así la persona ve el formato antes de guardar, y
  `formatoTexto.ts` se retira.
- **Clienta duplicada** (Fase 6, CLI/VED "duplicados"): al crear una clienta
  con un teléfono que ya tiene otra, avisar "Ya existe Rayza Paniagua con ese
  teléfono" y ofrecer usarla. No bloquear: dos personas pueden compartir un
  número.

---

## 3. "Fue un error": borrar sin dejar rastro (diseño aprobado)

### Tres salidas, una sola puerta

Al tocar **Anular**, la app pregunta qué pasó:

| Salida | Cuándo | Qué queda |
|---|---|---|
| **Corregir** (ya existe) | Pasó, pero un dato está mal | El mismo registro, corregido |
| **Anular** (ya existe) | Pasó y se deshizo en la vida real: devolución, reembolso, no se consiguió | Queda anulada; las listas la esconden salvo "Ver anuladas" |
| **Borrar: fue un error** (nuevo) | Nunca pasó: dedazo, duplicado, clienta equivocada, prueba | Nada |

### Qué hace "Borrar" (una sola transacción)

1. Borra la venta, sus abonos, sus movimientos y sus eventos.
2. Devuelve cada unidad a su lote exacto (`devolverConsumos`, como anular,
   pero sin movimiento de entrada).
3. Recalcula la clienta (`refrescarTotales`) e invalida el resumen del mes.
4. Si era el último número de la secuencia, el contador retrocede y no queda
   hueco. Si no, queda el hueco: los números ya se mandaron por WhatsApp.

### Límites, porque sin rastro no hay cómo auditarlo después

- **Pide el PIN de seguridad.** Sin eso, cualquiera con acceso puede hacer
  desaparecer una venta cobrada en efectivo.
- **Hasta 7 días y dentro del mes.** Un mes cerrado no cambia.
- **No si toca algo fuera de sí misma**: abonos de otro día (plata real) o
  piezas de encargo que ya entraron a un paquete. En esos casos, Anular.
- **"Deshacer" unos segundos**, con la copia sólo en la memoria de la app,
  nunca en la base.

### Lo mismo para

- **Un abono suelto**: "Fue un error" lo borra; "Anular" queda para lo que se
  revirtió de verdad (una transferencia devuelta).
- **Una clienta**: se borra si no le queda nada; si es duplicada, "Unir
  con…" pasa sus ventas y abonos a la buena y borra la otra.
- **Un producto**: ya está (Fase 0): se elimina si no tiene ventas ni
  paquetes; si no, se descataloga.

### Antes de escribir código

- **Índices**: borrar busca movimientos por venta (`referencia_tipo`,
  `referencia_id`) y eventos por entidad (`entidad_tipo`, `entidad_id`).
  Declararlos, desplegarlos y esperar `READY` antes que el código
  (`npm run auditar:indices`).
- **Pruebas**: la simulación del negocio suma "borrar" a sus pasos, y las
  invariantes tienen que seguir cuadrando (ninguna unidad vendida sin su
  venta, ningún abono sin su venta, la clienta con sus totales).
- **Dónde**: `VentaEditor`, el detalle de venta, Cobros y las hojas del
  celular. Va después de que se cierre la Fase 1, que está reescribiendo esos
  mismos archivos.
