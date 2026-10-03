# C2 · T1: experimento de proforma PDF en el celular

Estado: paso 1 completo; PDF móvil todavía sin implementar. No aprobado
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

| Medida | Antes | Después |
|---|---:|---:|
| JS crudo | 1328130 bytes | A medir en paso 4 |
| JS gzip | 346481 bytes | A medir en paso 4 |
| Chunk principal crudo | 1320214 bytes | A medir en paso 4 |
| Chunk principal gzip | 343082 bytes | A medir en paso 4 |

## Comparación y decisión

Pendientes: PDF móvil, contraste visual entre motores, fallo de fuentes,
prueba de 35 líneas, share/cancelación/portapapeles, dependencia y delta de
build. Teléfono: aún no probado; modelo/SO/navegador sin registrar. No hay
HTTPS confiable configurado para la prueba física. T1 paso 5 sigue abierto.
