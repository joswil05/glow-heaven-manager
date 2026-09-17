/**
 * Corre contra la base REAL las mismas consultas que hace la app.
 *
 * Existe por una razón concreta: **el emulador de Firestore no exige
 * índices**. Las pruebas de `tests/motor-real/` pueden estar todas en verde
 * con un índice que en producción no existe, y cuando falta un índice
 * Firestore no devuelve datos parciales: rechaza la consulta entera y la
 * pantalla queda en blanco. Eso ya pasó una vez, con ventas, encargos y
 * cobros al mismo tiempo.
 *
 * Esto es lo único que lo demuestra. Correrlo DESPUÉS de desplegar índices y
 * ANTES de dar por buena una versión.
 *
 *   npm run probar:produccion
 *
 * Sólo lee, con topes de 3 documentos: unas 25 lecturas en total, contra un
 * límite diario de 50.000. No escribe ni borra nada.
 *
 * Se autentica con la sesión de `gcloud` de la máquina. Si no hay sesión,
 * avisa y no hace nada.
 */
import { execSync } from 'node:child_process';

const PROYECTO = 'glow-heaven-db-app';
const URL = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents:runQuery`;

let TOKEN;
try {
  TOKEN = execSync('gcloud auth print-access-token', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {
  console.error(
    '\n  No hay sesión de gcloud en esta máquina.\n' +
      '  Corré:  gcloud auth login\n'
  );
  process.exit(1);
}

let leidos = 0;

const igual = (c, v) => ({ fieldFilter: { field: { fieldPath: c }, op: 'EQUAL', value: v } });
const mayorIgual = (c, v) => ({
  fieldFilter: { field: { fieldPath: c }, op: 'GREATER_THAN_OR_EQUAL', value: v },
});
const mayor = (c, v) => ({ fieldFilter: { field: { fieldPath: c }, op: 'GREATER_THAN', value: v } });
const y = (...f) => ({ compositeFilter: { op: 'AND', filters: f } });
const bool = (b) => ({ booleanValue: b });
const txt = (s) => ({ stringValue: s });
const num = (n) => ({ integerValue: String(n) });

const ORDEN_FECHA_ID = [
  { field: { fieldPath: 'fecha' }, direction: 'DESCENDING' },
  { field: { fieldPath: 'id' }, direction: 'DESCENDING' },
];

async function pedir(structuredQuery) {
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  const cuerpo = await r.text();
  if (!r.ok) {
    let detalle = cuerpo.slice(0, 400);
    try {
      detalle = JSON.parse(cuerpo).error?.message ?? detalle;
    } catch {
      /* se queda con el crudo */
    }
    return { ok: false, detalle };
  }
  let docs = [];
  try {
    docs = JSON.parse(cuerpo).filter((d) => d.document);
  } catch {
    /* respuesta vacía */
  }
  leidos += docs.length;
  return { ok: true, docs };
}

const mesActual = new Date().toISOString().slice(0, 7);

/**
 * Una por cada pantalla que abre la app. Si alguna se rechaza, esa pantalla
 * va a aparecer vacía.
 */
const CONSULTAS = [
  [
    'Ventas: la lista (tipo + orden + tope)',
    {
      from: [{ collectionId: 'ventas' }],
      where: y(igual('activo', bool(true)), igual('tipo', txt('INVENTARIO'))),
      orderBy: ORDEN_FECHA_ID,
      limit: 3,
    },
  ],
  [
    'Ventas: la lista del mes (tipo + ventana de fecha)',
    {
      from: [{ collectionId: 'ventas' }],
      where: y(
        igual('activo', bool(true)),
        igual('tipo', txt('INVENTARIO')),
        mayorIgual('fecha', txt(`${mesActual}-01`))
      ),
      orderBy: ORDEN_FECHA_ID,
      limit: 3,
    },
  ],
  [
    'Encargos: la lista',
    {
      from: [{ collectionId: 'ventas' }],
      where: y(igual('activo', bool(true)), igual('tipo', txt('ENCARGO'))),
      orderBy: ORDEN_FECHA_ID,
      limit: 3,
    },
  ],
  [
    'Ventas: la ventana sin tipo',
    {
      from: [{ collectionId: 'ventas' }],
      where: y(igual('activo', bool(true)), mayorIgual('fecha', txt(`${mesActual}-01`))),
      orderBy: ORDEN_FECHA_ID,
      limit: 3,
    },
  ],
  [
    'Buscar por clienta',
    {
      from: [{ collectionId: 'ventas' }],
      where: y(igual('activo', bool(true)), igual('cliente_id', num(1))),
      limit: 3,
    },
  ],
  [
    'Panel: lo que se debe',
    {
      from: [{ collectionId: 'ventas' }],
      where: y(igual('activo', bool(true)), mayor('saldo_usd_cents', num(0))),
      limit: 3,
    },
  ],
  [
    'Cobros: los abonos recientes',
    {
      from: [{ collectionId: 'pagos' }],
      where: y(igual('activo', bool(true))),
      orderBy: ORDEN_FECHA_ID,
      limit: 3,
    },
  ],
  [
    'Abonos de una venta',
    {
      from: [{ collectionId: 'pagos' }],
      where: y(igual('venta_id', num(1)), igual('activo', bool(true))),
      limit: 3,
    },
  ],
  [
    'Paquetes por estado',
    {
      from: [{ collectionId: 'compras' }],
      where: y(igual('activo', bool(true)), igual('estado', txt('PENDIENTE'))),
      limit: 3,
    },
  ],
  [
    'Inventario por categoría',
    {
      from: [{ collectionId: 'productos' }],
      where: y(igual('activo', bool(true)), igual('categoria_id', num(1))),
      limit: 3,
    },
  ],
  [
    'Productos de un paquete (reparto del flete)',
    {
      from: [{ collectionId: 'productos' }],
      where: y(igual('activo', bool(true)), igual('paquete_id', num(1))),
      limit: 3,
    },
  ],
  [
    'Movimientos de un producto',
    {
      from: [{ collectionId: 'movimientos_inventario' }],
      where: y(igual('producto_id', num(1))),
      orderBy: [{ field: { fieldPath: 'id' }, direction: 'DESCENDING' }],
      limit: 3,
    },
  ],
];

console.log(`\n  Consultas reales contra ${PROYECTO} (sólo lectura):\n`);

let fallas = 0;
for (const [nombre, q] of CONSULTAS) {
  const r = await pedir(q);
  if (r.ok) {
    console.log(`  ok    ${nombre}  (${r.docs.length} doc)`);
  } else {
    fallas++;
    console.log(`  FALLA ${nombre}`);
    console.log(`          ${r.detalle.replace(/\s+/g, ' ').slice(0, 300)}`);
  }
}

// La segunda página. El cursor es lo que más fácil se rompe en silencio:
// no falla, simplemente se saltea o repite una venta.
const primera = await pedir({
  from: [{ collectionId: 'ventas' }],
  where: y(igual('activo', bool(true)), igual('tipo', txt('INVENTARIO'))),
  orderBy: ORDEN_FECHA_ID,
  limit: 2,
});

const NOMBRE_CURSOR = 'Ver ventas más antiguas (cursor de la 2ª página)';
if (primera.ok && primera.docs.length === 2) {
  const ultima = primera.docs[1].document.fields;
  const r = await pedir({
    from: [{ collectionId: 'ventas' }],
    where: y(igual('activo', bool(true)), igual('tipo', txt('INVENTARIO'))),
    orderBy: ORDEN_FECHA_ID,
    startAt: { before: false, values: [ultima.fecha, ultima.id] },
    limit: 2,
  });
  if (!r.ok) {
    fallas++;
    console.log(`  FALLA ${NOMBRE_CURSOR}`);
    console.log(`          ${r.detalle.replace(/\s+/g, ' ').slice(0, 300)}`);
  } else {
    const nombresPrimera = new Set(primera.docs.map((d) => d.document.name));
    const repite = r.docs.some((d) => nombresPrimera.has(d.document.name));
    if (repite) {
      fallas++;
      console.log(`  FALLA ${NOMBRE_CURSOR}: repitió una venta de la primera página`);
    } else {
      console.log(`  ok    ${NOMBRE_CURSOR}  (${r.docs.length} doc, sin repetir)`);
    }
  }
} else {
  console.log(`  (hay muy pocas ventas para probar la 2ª página)`);
}

// Que este script sepa fallar. Una consulta que a propósito no tiene índice:
// si esto NO se rechaza, el script no está comprobando nada y los "ok" de
// arriba no valen.
const control = await pedir({
  from: [{ collectionId: 'ventas' }],
  where: y(igual('activo', bool(true)), igual('estado', txt('ENTREGADA'))),
  orderBy: [
    { field: { fieldPath: 'saldo_usd_cents' }, direction: 'DESCENDING' },
    { field: { fieldPath: 'total_usd_cents' }, direction: 'ASCENDING' },
  ],
  limit: 2,
});

if (control.ok) {
  console.log('\n  ATENCIÓN: la consulta de control, que NO debería tener índice, pasó.');
  console.log('  Este script no está detectando índices faltantes: los "ok" de arriba no valen.');
  fallas++;
} else {
  console.log('\n  (control: una consulta sin índice sí se rechaza, así que la prueba sirve)');
}

console.log(`\n  documentos leídos: ${leidos}`);
console.log(fallas === 0 ? '\n  ✓ TODAS LAS PANTALLAS RESPONDEN\n' : `\n  ✗ ${fallas} problema(s)\n`);
process.exit(fallas === 0 ? 0 : 1);
