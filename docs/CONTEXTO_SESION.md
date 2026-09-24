# Contexto para empezar una sesión nueva

> **Para quién es esto**: el modelo o la persona que abre este proyecto sin
> haber estado en la sesión anterior.
> **Estado del árbol**: `v2.12.0` en la rama `paquetes-como-entrada`, todo verde
> y **sin publicar**. Producción corre `v2.11.2`.
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

### P1: publicar `v2.12.0`, y dos pasos que hace ella en la app

1. Publicar PWA y Windows (sección 5). No hace falta migrar nada antes: el
   código nuevo lee los documentos viejos tal como están.
2. **Completar el contenido de PQ-0001.** Inventario → Paquetes → PQ-0001 →
   "Completar contenido". Lo arma con los movimientos de entrada y los campos
   heredados de cada producto, lo muestra entero y sólo con su OK escribe **el
   paquete** (no toca la bodega). Hasta entonces "Pagado en paquetes" muestra
   sólo los $77 de flete, y lo dice.
3. **Revisar precios.** Inventario muestra un aviso con los productos cuyo
   precio no corresponde a su costo (los que se calcularon sin el flete, o que
   saltaron al vender). Ella elige cuáles aplicar; se puede deshacer.

No se pudo leer producción desde la sesión del 24 de septiembre (los permisos
de la sesión lo bloquearon), así que no se sabe cuántos productos va a listar
el paso 3 ni si alguno quedó con el 7% dos veces por la etiqueta vieja del
formulario. El paso 2 lo va a mostrar: la base de cada línea sale de lo que
entró a la bodega.

### P2: encargos viejos con el anticipo completo que quedaron cotizados

Hasta `v2.12` un encargo creado con el anticipo completo nacía `COTIZADA`
(se miraba "saldo en cero"). Los nuevos nacen `PENDIENTE`. Los viejos siguen
cotizados hasta que se les registre otro abono, y mientras tanto no cuentan en
"Te deben" ni en "Encargos por comprar". Si ella tiene alguno, conviene
revisarlo a mano; no se tocó producción.

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

**Una prueba en verde a la primera no demuestra nada.** Las de
`tests/paquete-como-entrada.test.ts` se validaron sembrando diez errores de
vuelta, uno por uno: cada uno hizo fallar al menos una. Una de las pruebas no
detectaba lo que decía cuidar hasta que se le cambió el caso.

---

## 5. Cómo se verifica

Las dos suites hacen falta. La de unidad prueba las fórmulas; la del emulador
prueba que Firestore de verdad acepte lo que el código le manda.

```bash
npm run typecheck              # 0 errores, sin excepción
npm test                       # 295 pruebas, 27 archivos
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

## 6. Cómo trabajar con Joswill

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

## 7. Errores que este proyecto ya cometió, para no repetirlos

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
