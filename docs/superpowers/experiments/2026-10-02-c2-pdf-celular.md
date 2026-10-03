# C2 · T1: experimento de proforma PDF en el celular

Estado: pasos 1 a 4 completos; paso 5 pendiente. Candidata sin aprobar
por diferencias de maquetación. No aprobado
para teléfono ni para continuar T2. Datos exclusivamente ficticios.

## Referencia y reproducción

Base: `e768f67`, master limpio; `npm test` 593 aprobadas. Emulador local.
`tests/interfaz/sembrar-pdf.test.ts` crea mediante repositorios dos encargos
y exporta `tests/interfaz/fixtures-pdf.json` y los HTML a `scratch/c2-pdf/`.
No se escribe en producción ni se usan cuentas/datos reales.

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
npx vitest run --config vitest.emulador.config.ts tests/interfaz/sembrar-pdf.test.ts
npx electron tests/interfaz/pdf-windows.cjs
npx vite --config mobile/vite.config.ts --strictPort
# En otra terminal:
python tests/interfaz/pdf-celular.py
```

El arnés Windows abre ventanas ocultas de Electron 34 con el HTML generado
por `generarHtmlProforma`, usando exactamente las opciones de `htmlAPdf`
en `src/main/ipc/index.ts`: A4, vertical, fondos, márgenes 0.4. No se abrió
la app productiva. Se comparará contra este motor real, no un PDF dibujado
por otra biblioteca.

- Corta: E-0001, dos líneas vivas (3 unidades) y una descartada; $85 total,
  C$720 pagados ($20), $65 saldo; venta a tasa36 y Configuración37.50.
- Larga: E-0002, 35 líneas con acentos y descripciones largas.
- Archivos Windows: `scratch/c2-pdf/corta-windows.pdf` (217616 bytes) y
  `larga-windows.pdf` (218101 bytes). Corta, una página A4; captura revisada.
- La plantilla vigente tiene identidad textual, no imagen de logo. Se
  registra tal cual; no se añadió un logo ni se cambió Windows en este experimento.

El caso rojo se vio fallar por ausencia de `Descargar PDF de prueba` en
`/?c2-pdf=1` (no por acceso ni error de repositorio). La siembra pasó.

## Build antes de la dependencia

`npm run build:mobile`: tipos y auditorías aprobados. Vite 10.69 s;
1906 módulos; precache 15 archivos, 2079.68 KiB. Persisten los avisos de
chunk grande e imports mixtos preexistentes.

Medición por Node zlib sobre todos los `.js` de `dist-mobile/assets`:

| Medida (assets JS) | Base | Normal después | Con candidata (entrada separada) |
|---|---:|---:|---:|
| JS crudo | 1328130 | 1328305 | 2315863 bytes |
| JS gzip | 346481 | 346528 | 634123 bytes |
| Chunk principal crudo | 1320214 | 1320389 | 1290319 bytes |
| Chunk principal gzip | 343082 | 343128 | 336552 bytes |

El normal excluye el adaptador y la hoja DEV. Su diferencia es el marco
ocupado, no el peso de html2pdf. La entrada experimental conserva el adaptador
como export, con los mismos plugins, pero separa plantillas en otro chunk:
estimación del costo al integrarlo, no build de la futura T6 terminada.
Delta contra base: **987733 bytes crudos / 287642 gzip** (~965 / 281 KiB).
Chunk html2pdf: **984775 / 285686 bytes**. Workbox lo incluye en precache.
Precache: 15 entradas / 2079.68 KiB base; normal 15 / 2079.92;
candidata 18 / 3044.42. Vite: 10.69 s base, 11.30 s normal, 17.13 s
candidata (corridas locales, no benchmark de rendimiento del teléfono).

Reproducir la medición adicional: `npx vite build --config tests/interfaz/vite-pdf.config.ts`.
Salida `scratch/c2-pdf/build-candidata`; no habilita la pantalla en la app
ni publica nada.

## Comparación y decisión

Paso 2: candidata `html2pdf.js` **0.14.0**, versión fija y lock. Adaptador
`generarArchivoProforma` espera fuentes y decode de imágenes, conserva la
plantilla en iframe y devuelve File. La biblioteca clona el body en la
página anfitriona: se conservan estilos resueltos para evitar contaminación
de Tailwind/tema. No se cambiaron CSS ni márgenes de la plantilla. Types móvil pasa.

### Inspección local del WIP del paso 3 (2/10, 21:53)

La entrada DEV `/?c2-pdf=1` abre una hoja con fixtures, prepara el archivo
y ofrece descarga, compartir y copiar. No está integrada al flujo de encargos.
La prueba automática corta pasó: descargó `corta-movil.pdf`, 288911 bytes,
una página A4. Ese resultado sólo verifica descarga; no aprueba la hoja.

TypeScript móvil falla con TS2322 en `PruebaProformaSheet.tsx`: el plan pide
`BottomSheet ocupado`, pero la interfaz real no tiene esa propiedad. No se
eliminó el bloqueo ni se amplió el marco común para esconder la discrepancia.
Paso 3 sin marcar; se detuvo la implementación según la regla del plan.

Se inspeccionaron ambas capturas, a la misma escala A4 de 1300 px:

- Windows: identidad textual en una línea y área útil más ancha.
- Candidata: identidad partida en dos líneas, márgenes laterales mayores y
  otros saltos de texto. Importes visibles correctos ($85, C$720, $65, tasa36),
  pero fidelidad visual sin aprobar.
- El PDF candidato es rasterizado: pypdf extrae 0 caracteres, frente a 1214
  de Windows. No implica importes perdidos, pero sí texto no seleccionable.
- La plantilla tiene CSS distinta para pantalla e impresión. El adaptador
  conserva estilos de pantalla; no se modificó la plantilla compartida.
  Investigar ese mecanismo si se autoriza corregir el plan; no rediseñar Windows.

Otra limitación del paso 4: la entrada está restringida a DEV, de modo que
Vite excluye el adaptador del build de producción. Medir ese build no
mostraría el costo futuro de html2pdf. Propuesta pendiente: un build de
medición separado que incluya la candidata y el mismo Workbox; reportar
ambas mediciones, sin habilitar el experimento en producción.

Joswill indicó que Ross usa un **iPhone 14 Plus actualizado a la última
versión disponible**, fuera de su casa y sin compartir Wi-Fi. No se conoce
la versión exacta de iOS ni se probó Safari/PWA. No hay HTTPS confiable
configurado; el acceso remoto de prueba requiere coordinarlo y no autoriza
publicar hosting. T1 paso 5 sigue abierto y bloquea T2.

Pendientes: resolver la discrepancia del marco tras decisión de Joswill;
prueba larga, share/cancelación/portapapeles, generación fallida y delta
válido del build. No afirmar que esas pruebas pasaron.

### Paso 3 cerrado (2/10)

Joswill autorizó incorporar el bloqueo. `BottomSheet ocupado` es opcional,
false por defecto; bloquea X, velo, arrastre, atrás y descarte. La prueba
falló antes por cierre permitido, luego pasó con share pendiente y al
terminar: archivo/MIME/mensaje y activación del toque comprobados. Se
probó preparación al reabrir y confirmación de descarte del mensaje editado.
El share del sistema está sustituido sólo en Playwright; no prueba iOS.

TypeScript móvil sin errores, suite de interfaz móvil completa aprobada,
build móvil con auditorías aprobado. Captura `scratch/c2-pdf/hoja-pdf.png`
inspeccionada. El resto del paso 4 y la prueba física siguen pendientes.

### Paso 4 cerrado (2/10, 22:18)

`python tests/interfaz/pdf-celular.py` aprobado: descarga corta/larga,
nombre/MIME/cabecera del File compartido, mensaje y activación del toque;
ocupado y descarte; canShare=false; AbortError; permiso de compartir
rechazado; portapapeles rechazado sin falsa confirmación y copia posterior;
fuentes bloqueadas con error, cierre y alternativa de reintento. El contexto
experimental no hizo peticiones a Firestore y ventas permaneció igual.
El share y portapapeles se simulan sólo en el arnés; el PDF se genera realmente.

La inspección de cuatro páginas encontró un recorte del pie: al conservar
CSS computada, el adaptador había fijado `height` y `block-size` del body
antes de los saltos. La prueba roja mostró pie en y3873.70, lienzo hasta
y3734.80. Dejar esas alturas naturales corrigió el recorte; prueba verde y
última página revisada con las tres políticas y el pie completos. No se
cambiaron la plantilla de Windows, márgenes ni su CSS.

Tipos y build móvil final con auditorías pasan; build experimental pasa.
La suite móvil completa pasó después del cambio del marco común; la última
corrección sólo afecta al adaptador DEV y se verificó con el arnés PDF.

| Proforma | Windows | Candidata final | Páginas |
|---|---:|---:|---:|
| Corta | 217616 bytes | 289912 bytes | 1 / 1 |
| Larga (35 líneas) | 218101 bytes | 1204844 bytes | 4 / 4 |

Generar y descargar la larga tomó 8694 ms en Chromium local, incluyendo la
interacción del arnés; no es una medición del iPhone. Los archivos finales
son `scratch/c2-pdf/{corta,larga}-{windows,movil}.pdf`.

**Fidelidad pendiente, con fallos locales visibles:** Windows distribuye las
líneas 1–11 / 12–26 / 27–35 y repite cabecera de tabla. Candidata: 1–9 /
10–22 / 23–35, sin repetir cabecera; totales/políticas pasan a página 4.
Nombre del negocio partido y márgenes más grandes. Acentos e importes de
ambas muestras revisados; la candidata permanece rasterizada. Corregir el
recorte no aprueba esas diferencias ni la biblioteca.

### Decisión y prueba física (paso 5, sin marcar)

No comenzar T2. Opciones para Joswill:

1. Continuar el experimento aplicando en el adaptador la CSS de impresión
   y márgenes que ya declara la plantilla, y comprobar encabezados y saltos.
   No modificar la plantilla compartida; evaluar otra candidata si ésta
   no puede reproducirla. El peso sigue necesitando aceptación.
2. Conservar el camino de impresión del teléfono y guardar/adjuntar el PDF
   manualmente. Eso cambia el diseño de compartir automático y requiere
   decisión explícita; no se implementó esa sustitución.

Ninguna opción sustituye la prueba real en Safari/PWA del iPhone 14 Plus.
Ross está fuera de la red local: falta coordinar acceso HTTPS confiable
a una página de fixtures y anotar la versión exacta de iOS. No se publicó
hosting ni se configuró un túnel o certificados en la máquina.

### Paso 5a: impresión original (2/10, 22:46)

Joswill pidió continuar la corrección local y trabajar con varios agentes.
El adaptador extrae `@media print` y `@page` del HTML original: ancho útil
180 mm, márgenes 16 mm verticales y 15 mm laterales. No cambió la plantilla.
El caso de ancho falló antes (566.92 px, nombre partido), luego pasó con
680.315 px y nombre en una línea; matrices PDF verifican los cuatro márgenes
en corta y larga. Tipos y arnés PDF/share pasan.

La corta aún recorta texto al rasterizar, pese a que su caja DOM cabe.
No se declara fidelidad aprobada. `pdf-paginacion.py` fija expectativas
independientes de Windows; rojo válido: PDF de 4 páginas, un solo contenedor
de 3027.84 px, canvas de 8248272 píxeles, cero Auth/Firestore. El motor
instalado corta el canvas en tiras y no repite cabeceras. Siguiente avance:
paginar el mismo DOM y renderizar cada hoja, sin segunda plantilla.
