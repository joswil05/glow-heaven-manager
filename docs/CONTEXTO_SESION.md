# Contexto para empezar una sesión nueva

> **Para quién es esto**: el modelo o la persona que abre este proyecto sin
> haber estado en la sesión anterior.
> **Estado del árbol**: `v2.11.2`, publicado en PWA y Windows, todo verde.
> **Última actualización**: 17 de septiembre de 2026.

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
leerla despacio.

### La fórmula

```
costo unitario  =  precio de tienda  +  impuesto (7%)  +  su parte del flete
```

Los tres pedazos se guardan por separado en cada producto, y la ficha los
muestra desglosados porque ella necesita poder comprobar la cuenta a mano:

| Campo en Firestore | Qué es |
|---|---|
| `precio_tienda_unitario_usd_cents` | **Lo que ella escribió.** Sin impuesto, sin flete |
| `costo_base_unitario_usd_cents` | Precio de tienda + 7% |
| `flete_total_usd_cents` | Su parte del flete del paquete, **como total del producto** |
| `flete_unitario_usd_cents` | El mismo flete dividido entre las unidades. **Sólo para mostrar** |
| `costo_unitario_usd_cents` | Base + flete unitario. Es el que se usa para todo |
| `valor_inventario_usd_cents` | `unidades × base + flete_total` |

### Por qué el flete se guarda como total y no por unidad

$77.00 entre 45 unidades da $1.7111…, y en centavos enteros se perdían 5
centavos del courier. Guardando el total por producto y repartiendo con mayor
residuo (`repartirFlete` en [`src/core/costo-producto.ts`](../src/core/costo-producto.ts)),
la suma da los $77.00 exactos. La última línea absorbe el sobrante.

### El divisor es lo que el paquete TRAJO, no lo que queda

`unidades_ingresadas` del paquete, no las existencias de hoy. Si se usaran las
existencias, vender la mitad le duplicaría el flete a lo que sobra.

### La trampa que ya mordió dos veces

La ficha del producto tiene que **devolverle el precio de tienda**, no el costo
armado. Cuando devolvía el costo, abrir un producto y guardarlo sin tocar nada
le sumaba el 7% y el flete otra vez; dos guardados y el número se iba al doble
sin que nadie escribiera nada. Eso es lo que arregla `v2.11.2`, y hay dos
pruebas en el emulador que lo vigilan (`tests/motor-real/flete-repartido.test.ts`:
*"abrir la ficha y guardar sin tocar nada no cambia el costo"* y *"guardar tres
veces seguidas tampoco lo mueve"*).

**Antes de tocar cualquier cosa del costeo, sembrá el error de vuelta y mirá
que esas dos pruebas fallen.** Si no fallan, la prueba no está probando nada.

### Los números de producción a hoy

22 productos activos, 45 unidades, un solo paquete (PQ-0001) con $77.00 de
flete:

```
precio de tienda de todo el stock ....  $273.98
impuesto 7% ..........................   $19.18
flete del PQ-0001 ....................   $77.00
                                        --------
valor de la bodega ...................  $370.16
```

El impuesto se suma producto por producto, no se saca dividiendo el total entre
1.07: cada producto redondeó su 7% por su cuenta y por ese camino la cuenta se
va 3 centavos.

La ganancia esperada es $182.87. Si algún cambio mueve estos números sin que
haya entrado o salido mercadería, hay un error.

---

## 3. Lo que está pendiente, en orden

### P1 — El editor de paquetes no manda las líneas

[`PaqueteEditor.tsx:147-150`](../src/renderer/src/views/paquetes/PaqueteEditor.tsx#L147-L150)
manda `lineas: []`, `tax_total_override_usd_cents: 0` y `estado: 'RECIBIDA'`
fijos. Como las líneas van vacías, **`costearPaquete` nunca corre**, aunque el
motor esté bien y tenga pruebas. Por eso cada producto entra a mano desde
Inventario y por eso hizo falta todo el trabajo de flete que describe la sección
anterior.

No es urgente: hoy funciona porque los productos se cargan desde Inventario,
que es como ella trabaja igual (*"el formulario de ingreso de productos es más
restringido y no permite tantos detalles"*). Pero mientras esté así, hay un
motor de costeo entero que no se ejecuta nunca, y eso confunde a cualquiera que
lea el código.

### P1 — Un paquete `RECIBIDA` no se puede editar

Bloqueado a propósito en `compras.repo.ts` por consistencia contable. Ella ya
dijo que el estado "recibido" no le hace sentido, porque empieza a sumar al
inventario cuando el paquete **ya está acá**. Vale la pena repensar el estado
entero, no parchar el bloqueo.

### P2 — `productos.listar` no tiene tope

[`productos.repo.ts:201`](../src/main/firebase/repositories/productos.repo.ts#L201)
se trae todos los productos sin `limit`. Con 22 no se nota. Con varios paquetes
encima sí, y es una lectura de Firestore por producto cada vez que se abre
Inventario.

### P3 — Archivado en frío (etapa 5)

Explícitamente pospuesto por ella: *"recién cuando pasen años"*. No lo empieces
sin que lo pida.

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
carpeta en sí no. Buscá el proceso y cerralo; no borres a la fuerza.

**Las fechas son de Managua, no UTC.** `src/core/fechas.ts`. Un arnés de
pruebas que usaba UTC sembraba "mañana" después de las 6 de la tarde, y parecía
error de la aplicación cuando el equivocado era el arnés.

**La búsqueda ignora acentos** (NFD + quitar diacríticos), pero **la ñ se
respeta a propósito**. `src/core/texto.ts`, usado en los 26 lugares donde se
busca.

**Tailwind**: `p-4.5` no existe. La escala va 3, 3.5, 4.

---

## 5. Cómo se verifica

Las dos suites hacen falta. La de unidad prueba las fórmulas; la del emulador
prueba que Firestore de verdad acepte lo que el código le manda.

```bash
npm run typecheck              # 0 errores, sin excepción
npm test                       # 274 pruebas, 26 archivos
npm run test:emulador          # 93 pruebas contra el emulador de Firestore
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

El release de Windows falla a veces con un error de token de GitHub **después de
haber subido**. Antes de reintentar, mirá con `gh release view` si la versión ya
está publicada, o vas a terminar con dos.

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
