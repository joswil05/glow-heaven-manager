# Contexto para empezar una sesión nueva

> **Para quién es esto**: el modelo o la persona que abre este proyecto sin
> haber estado en la sesión anterior.
> **Estado del árbol**: `v2.13.0`, publicado en PWA y Windows, todo verde.
> La 2.13.0 es la limpieza de la interfaz (sección 4); la lógica es la de la
> 2.12.2, probada sobre la app instalada contra la base real (sección 6).
> **Última actualización**: 24 de septiembre de 2026.

Leé este archivo primero. Después:

- **[AGENTS.md](../AGENTS.md)** — las reglas que no se negocian (dinero en
  centavos enteros, español, colores, seguridad, los comandos de verificación).
  Es corto y hay que respetarlo entero.
- **[docs/CONTEXTO_TECNICO_IA.md](CONTEXTO_TECNICO_IA.md)** — el mapa de la
  arquitectura: monorepo, `src/core/`, contrato IPC, vistas. Escrito en `v2.2.8`,
  así que la estructura sigue valiendo pero los números y el costeo que describe
  ya no. Para el costeo mandá lo que dice acá abajo.

---

## 1. Qué es esto y para quién

Glow Heaven Manager es la herramienta de gestión de un negocio real de
importación en Nicaragua. **No es un proyecto de práctica.** La dueña, Ross,
trabaja con esto todos los días y los datos de producción son su contabilidad.

Dos aplicaciones sobre el mismo Firestore:

| | Dónde vive | Para qué |
|---|---|---|
| **Escritorio** | Electron + React, `src/` | El trabajo pesado: inventario, paquetes, ventas, reportes |
| **Móvil (PWA)** | `mobile/`, Firebase Hosting | Consultar y vender desde el celular |

Los dos comparten los repositorios de `src/main/firebase/repositories/`. Un
cambio en un repositorio le llega a las dos aplicaciones.

**El negocio en una línea**: alguien le compra mercadería en Estados Unidos, un
courier se la trae a Nicaragua y le cobra el flete acá por libra, y ella la
vende localmente al contado o al crédito. Vende casi todo antes de que llegue
el siguiente paquete, así que **cada paquete le renueva el inventario**.

---

## 2. El costeo, que es lo que más costó acertar

Esta es la parte donde más veces se equivocó el modelo anterior. Vale la pena
leerla despacio. El análisis completo, con cada error reproducido y sus
números, está en [PLAN_PAQUETES_E_INVENTARIO.md](PLAN_PAQUETES_E_INVENTARIO.md).

### La fórmula

```
costo de una línea de paquete  =  precio de tienda  +  impuesto (7%)  +  su parte del flete
costo unitario del producto    =  valor de bodega ÷ existencias      (promedio ponderado)
```

### El paquete es la única puerta de entrada (desde `v2.12`)

Cada línea del paquete dice qué producto, cuántas unidades y lo que costó en
la tienda. El 7% (por línea, apagable si la tienda no lo cobró) y el flete
(repartido por peso, o por unidades si nadie tiene peso) se calculan en
[`src/core/paquete.ts`](../src/core/paquete.ts), que usan igual la pantalla
(vista previa sin lecturas) y el repositorio. Al pasar el paquete al inventario
cada línea suma sus unidades y su costo al producto, todo en **una**
transacción.

Un producto que vuelve a llegar recibe otra línea en otro paquete, con su
propio precio de tienda y su propio flete. Eso es lo que no se podía hacer
antes: en `v2.11` el producto guardaba un solo paquete, un solo precio de
tienda y un solo flete, y reponer inflaba el reparto.

### Lo que ya no existe

- `flete.repo.ts` y el reparto del flete a los productos después de cargarlos.
- El costo en la ficha del producto: la ficha es catálogo. Un costo mal
  cargado se arregla **corrigiendo el paquete**.
- Los campos `costo_base_unitario_usd_cents`, `flete_total_usd_cents`,
  `flete_unitario_usd_cents` y `precio_tienda_unitario_usd_cents` siguen en
  los documentos de producción, pero nadie los escribe ni calcula con ellos.
  Sólo los lee `ComprasRepo.reconstruir`.

### El precio

Se recalcula cuando entra un paquete o cuando ella cambia el margen o la
categoría. **Nunca al vender, ajustar o devolver.** Un precio escrito a mano no
se toca; si queda debajo del costo, avisa.

### Los números de producción al 17 de septiembre

22 productos activos, 45 unidades, un solo paquete (PQ-0001) con $77.00 de
flete, registrado con la versión anterior (sin contenido):

```
precio de tienda de todo el stock ....  $273.98
impuesto 7% ..........................   $19.18
flete del PQ-0001 ....................   $77.00
                                        --------
valor de la bodega ...................  $370.16
```

El impuesto de ese paquete se sumó por unidad, redondeado cada vez (así lo
hacía `v2.11`). Los paquetes nuevos lo suman por línea, que es como lo cobra la
tienda. La reconstrucción de PQ-0001 respeta el de entonces, y corregir el
flete de un paquete no le recalcula el impuesto a las líneas que no se tocaron.

Si algún cambio mueve la bodega sin que haya entrado o salido mercadería, hay
un error.

---

## 3. Lo que está pendiente, en orden

### Hecho el 24 de septiembre, sobre producción

- **PQ-0001 tiene su contenido**: 22 productos, 45 unidades, $273.98 + $19.18
  + $77.00 = $370.16, el número que se esperaba. La bodega no se movió
  ($278.77 ese día, después de cuatro ventas).
- **No había precios que revisar**: los 22 productos tienen precio escrito a
  mano, y la app no toca un precio que ella decidió. Por eso el precio sin
  flete (H6) y el que saltaba al vender (H7) nunca le llegaron. Ninguno queda
  debajo del costo; el de menor margen es el Pack de Calzones Calvin Klein M
  ($7.41 → $8.00, 8%).
- 17 de sus movimientos de entrada guardaron el precio sin impuesto (se
  cargaron antes del recosteo del 16). La reconstrucción no los usa: toma el
  costo base del producto, que es el correcto.

### Encargos viejos que hayan quedado cotizados: no hay

Hasta `v2.12` un encargo creado con el anticipo completo nacía `COTIZADA`
(se miraba "saldo en cero"); los nuevos nacen `PENDIENTE`. Al 24 de
septiembre producción no tiene ningún encargo (las cuatro ventas son de
inventario), así que no quedó ninguno mal clasificado.

### P2: `productos.listar` no tiene tope

[`productos.repo.ts`](../src/main/firebase/repositories/productos.repo.ts)
se trae todos los productos sin `limit`. Con 22 no se nota.

### P3: archivado en frío (etapa 5)

Explícitamente pospuesto por ella: *"recién cuando pasen años"*. No lo empieces
sin que lo pida.

### P3: ganancia por paquete

Sólo si ella quiere saber *"¿cuánto me dejó este paquete?"*. Requiere llevar el
inventario por lotes y cambia la regla del promedio ponderado. Ver la fase 5
del plan.

---

## 4. Las trampas que ya cobraron su precio

Cada una de estas costó una sesión. No hace falta repetirlas.

**Los índices de Firestore no fallan a medias.** Si falta el índice compuesto,
Firestore rechaza la consulta entera y la pantalla queda en blanco. Y **el
emulador no los exige**: una consulta sin índice pasa verde local y revienta en
producción. Los índices se despliegan y quedan `READY` **antes** de que salga el
código que los usa. `npm run auditar:indices` lo revisa.

**Invitar a alguien no le da acceso.** El acceso se reclama al entrar, y hay
**cuatro puertas**: el login móvil, el login de Windows, `AUTH_GET_USER`, y el
arranque de `src/main/index.ts` (que restaura la sesión sin pasar por el canal
IPC). Ya pasó que se arregló en una sola y el usuario quedó bloqueado en
producción. Si tocás el acceso, revisá las cuatro.

**El acceso tiene tres estados, no dos.** `autorizado | sin-permiso |
sin-conexión`. Con un booleano, estar sin internet se veía igual que estar
expulsado.

**Las migraciones tienen que ser idempotentes.** Una que no lo era corrió dos
veces y dejó la bodega en $447.18 sin que entrara nada. Todo script que escriba
en producción se corre primero en ensayo y se mira la lista completa.

**No encadenes `grep` después de `vitest`.** El éxito del `grep` tapa el fallo
de la prueba. Ya se hizo un commit en rojo por eso. Si vas a filtrar la salida,
`set -o pipefail`.

**El `release:windows` falla con `EPERM` sobre `dist`.** No es un permiso de
Windows: es que algún proceso viejo tiene esa carpeta como directorio de
trabajo, casi siempre un `python -m http.server` que quedó de una sesión
anterior. Se reconoce porque el contenido de `dist` se puede renombrar y la
carpeta en sí no. Buscá el proceso y cerralo; no borres a la fuerza. La causa
era `test:interfaz-escritorio`: con `shell: true`, `kill()` mataba la consola
y dejaba vivo al Python. Desde `v2.12` los dos corredores de interfaz cierran
el árbol entero con `taskkill /T`.

**Las fechas son de Managua, no UTC.** `src/core/fechas.ts`. Un arnés de
pruebas que usaba UTC sembraba "mañana" después de las 6 de la tarde, y parecía
error de la aplicación cuando el equivocado era el arnés.

**La búsqueda ignora acentos** (NFD + quitar diacríticos), pero **la ñ se
respeta a propósito**. `src/core/texto.ts`, usado en los 26 lugares donde se
busca.

**Tailwind**: `p-4.5` no existe. La escala va 3, 3.5, 4.

**El simulador del navegador (`mock-api.ts`) tiene que devolver copias.** Su
lista de productos devolvía el mismo arreglo que modificaba en el lugar, y
React no veía un producto recién creado: la pantalla de prueba mostraba un
error que la app real (por IPC, que siempre manda un arreglo nuevo) no tiene.

**Los fuentes están en CRLF** (`core.autocrlf=true`). Un script que compare
texto tiene que sacar los `\r` antes y devolverlos al escribir, o no
encuentra nada.

**Abrir la app instalada desde la terminal de VS Code falla en silencio.**
VS Code le pasa `ELECTRON_RUN_AS_NODE=1` a sus terminales, y el ejecutable
arranca como Node puro: sale con código 0, sin ventana y sin error. Hay que
lanzarlo con la variable vacía (`$env:ELECTRON_RUN_AS_NODE = $null`). Para
manejarla con Playwright: `--remote-debugging-port=9223` y
`connect_over_cdp`.

**El PIN lo escribe una persona.** La sesión de Google queda guardada entre
arranques, pero el PIN se pide cada vez que abre la app. No se busca ni se
saca de ningún lado: se le pide a Joswill que lo escriba en la ventana.

**Una prueba en verde a la primera no demuestra nada.** Las de
`tests/paquete-como-entrada.test.ts` se validaron sembrando diez errores de
vuelta, uno por uno: cada uno hizo fallar al menos una. Una de las pruebas no
detectaba lo que decía cuidar hasta que se le cambió el caso.

---

**La interfaz se limpió de texto el 24 de septiembre (`v2.13.0`).**
No vuelvas a meter lo que se sacó: subtítulos que repiten el título, un
párrafo de ayuda debajo de cada campo, íconos en cajitas de color, tres
botones de texto en cada fila, córdobas al lado de cada precio de una tabla.
Las reglas que quedaron:

- El título de la pantalla está en la barra de arriba. La vista no lo repite:
  arranca con el conteo y la acción principal.
- Una ayuda debajo de un campo sólo si responde una duda que el campo no
  resuelve ("A $7.00 la libra" sí; "Opcional" va como placeholder).
- Cada fila de tabla tiene un solo botón visible, el menú "⋮"; tocar la fila
  abre el detalle, que tiene todas las acciones.
- Lo que se usa de vez en cuando se pliega ("Más costos" en el paquete).
- Movimiento corto y sólo donde informa: lo que se ve decenas de veces al día
  (cambiar de pantalla, pasar el mouse) casi no se anima.
- Las pruebas buscan los campos por su `aria-label`, no por el texto de
  ayuda, para que acortar un texto no rompa una prueba.

## 5. Cómo se verifica

Las dos suites hacen falta. La de unidad prueba las fórmulas; la del emulador
prueba que Firestore de verdad acepte lo que el código le manda.

```bash
npm run typecheck              # 0 errores, sin excepción
npm test                       # 299 pruebas, 27 archivos
npm run test:emulador          # 91 pruebas contra el emulador de Firestore
npm run test:interfaz          # la PWA, con Playwright
npm run test:interfaz-escritorio
npm run auditar:colores        # ningún par fondo/texto ilegible
npm run auditar:indices        # toda consulta tiene su índice
npm run auditar:hooks          # ningún hook detrás de un return temprano
npm run probar:produccion      # las consultas reales contra producción, de sólo lectura
```

`probar:produccion` incluye una consulta de control que **no** tiene índice y
que tiene que ser rechazada. Si esa pasa, el arnés no está probando nada.

### Publicar

```bash
npm run deploy:mobile          # PWA a los dos sitios de Firebase Hosting
npm run release:windows        # instalador NSIS + GitHub Release
```

**`release:windows` casi siempre falla al final con `GitHub Personal Access
Token is not set`.** No exportes el token a una variable de entorno; Joswill ya
rechazó eso. Lo que hay que saber:

1. El `.exe` **sí se compila**. Lo que no se llega a escribir es `latest.yml`,
   que queda con la versión anterior. Ese archivo es el que lee el actualizador
   automático de la app instalada, así que publicar el exe sin regenerarlo deja
   a la clienta sin actualización y sin ningún error visible.
2. Se arregla con `npx electron-builder --publish never`, que reempaqueta y
   escribe `latest.yml` bien.
3. Antes de subir, comprobá que el `sha512` y el tamaño de `latest.yml`
   describan **ese** exe. Si no coinciden, el actualizador rechaza la descarga.
4. Se sube con `gh release create`, y los archivos hay que copiarlos con
   **guiones** (`Glow-Heaven-Manager-Setup-X.Y.Z.exe`), porque así los nombra
   `latest.yml`. En `release/` están con espacios.
5. Mirá siempre con `gh release view vX.Y.Z` si ya existe antes de reintentar,
   o vas a terminar con dos.

---

## 6. Probar sobre la base real, sin dejar rastro

Joswill autorizó crear datos de prueba en producción y borrarlos después. Así
se hizo el 24 de septiembre, y la base quedó idéntica documento por documento:

1. `node scripts/respaldar-produccion.mjs respaldos/antes-de-probar.json`.
2. Probar con productos y clientas cuyo nombre empiece con **"Prueba "** (la
   ficha lo escribe "Prueba Gloss"). **Nunca** reponer ni vender productos
   reales: borrar el paquete después no les devuelve el costo ni el precio.
3. Otro respaldo y `node scripts/comparar-respaldos.mjs antes.json
   despues.json plan.json`. Clasifica como de prueba sólo lo que cuelga de
   esos nombres. Si algo sale **sin clasificar**, no se limpia: puede ser
   trabajo real de ella.
4. Borrar en **un** commit de la API REST, con `currentDocument.updateTime`
   en cada escritura (si alguien tocó algo en el medio, se rechaza entero), y
   restaurar `_secuencias` para que la numeración de ella no salte.
5. Un último respaldo y comparar contra el primero: tiene que dar cero
   diferencias.

Lo que encontró esa prueba y ninguna suite había visto: el panel mostraba
números de antes de una venta durante 20 segundos (2.12.1); ajustar
existencias inventaba centavos, pasar un producto de precio a mano a margen lo
dejaba a costo, y un paquete podía quedar sin fecha (2.12.2).

Esos arreglos se volvieron a probar en la 2.12.2 instalada, con datos nuevos:
24 de 24 bien, incluida una corrección de flete con parte del paquete ya
vendida (a la bodega le entra sólo lo que sigue ahí). Después se limpió igual
que antes y la base volvió a quedar idéntica.

---

## 7. Cómo trabajar con Joswill

Él construye esto **para una clienta**, no para sí mismo. Lo que se muestre en
pantalla es lo que ella va a leer para tomar decisiones de plata.

- **Los datos que se muestran son lo más importante.** Sus palabras: *"quiero
  que seas sumamente cuidadoso con los datos que muestras, esos son los que se
  leen y son los más importantes, revisá cada uno"*. Un número mal no es un bug
  cosmético.
- **Las fórmulas tienen que ser visibles y comprobables a mano.** *"esta
  herramienta debe mostrar datos exactos y las fórmulas usadas y los datos
  ingresados en cada fórmula deben ser limpios y claros"*.
- **Nada de cálculos escondidos.** Si un número sale de otro, se calcula solo y
  se explica; no se edita a mano el resultado.
- **Resolvé, no consultes de a poco.** Cuando el camino está claro, el trabajo
  se termina completo y después se informa. Preguntar a cada paso lo que ya se
  explicó lo enoja, con razón.
- **Antes de dar algo por bueno, sembrá el error.** Una verificación que nunca
  se vio fallar no verifica nada. Es la disciplina que encontró casi todos los
  problemas reales de este proyecto.
- **Producción se toca con cuidado**: tiene permiso de escritura, pero *"sin
  exceder el límite de consultas diarias ni ningún límite establecido en
  firebase"*.
- **El token de GitHub no se exporta a una variable de entorno.** Usá `gh`, que
  maneja su propia sesión.

---

## 8. Errores que este proyecto ya cometió, para no repetirlos

No están acá para castigar a nadie. Están porque el patrón se repite.

1. **Se mostró una lista de 14 productos cuando eran 22**, por una salida
   cortada. Si vas a informar un total, contá los renglones.
2. **Se le informó un costo de bodega más bajo que el real**, primero $356.65,
   por olvidar el impuesto en los 17 productos que no eran packs. El número
   correcto era $370.16. Cuando un total no cuadra con el recibo del courier,
   el error está en la aplicación, no en el recibo.
3. **Se modificó directamente el costo unitario** en vez de dejar que se
   calculara. Él lo detectó en una captura de pantalla.
4. **El usuario encontró el bloqueo de acceso en producción, no el modelo.**
   Las cuatro puertas existían y sólo se arregló una.
5. **Se hizo un commit en rojo** porque el `grep` encadenado tapó el fallo.

El hilo común: cada uno se habría evitado mirando el resultado completo en vez
de la parte que confirmaba lo que ya se creía.
