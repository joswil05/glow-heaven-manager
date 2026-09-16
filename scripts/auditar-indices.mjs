/**
 * Auditoría de índices de Firestore.
 *
 * Por qué existe
 * --------------
 * Cuando a una consulta le falta el índice compuesto, Firestore NO devuelve
 * datos incompletos ni un error visible en pantalla: rechaza la consulta con
 * `FAILED_PRECONDITION` y, como casi todas las llamadas de la app viven dentro
 * de un `try/catch` que sólo hace `console.error`, la pantalla se queda vacía
 * como si el negocio no tuviera datos. Ya pasó dos veces en este proyecto.
 *
 * Y no se puede confiar en el emulador para detectarlo: se comprobó plantando
 * consultas sin índice que el emulador oficial las ejecuta sin quejarse. Por
 * eso la verificación es estática: se leen todas las consultas del código
 * fuente de las DOS apps y se contrastan contra `firestore.indexes.json`.
 *
 * Qué comprueba
 * -------------
 *   1. Toda consulta que necesita índice compuesto lo tiene declarado.
 *   2. Toda consulta que se resuelve sola (un solo campo, o sólo igualdades)
 *      queda anotada como tal, para que se vea por qué no hace falta índice.
 *   3. Índices declarados que ninguna consulta aprovecha: no rompen nada, pero
 *      se pagan en cada escritura de esa colección.
 *
 * Reglas de Firestore que se aplican
 * ----------------------------------
 *   - Los índices de un solo campo son automáticos, en los dos sentidos.
 *   - Sólo igualdades (`==`), sin `orderBy`: Firestore combina los índices de
 *     un campo. No hace falta índice compuesto.
 *   - Igualdad(es) + `orderBy` sobre OTRO campo, o más de un `orderBy`, o una
 *     desigualdad con `orderBy` de otro campo: hace falta índice compuesto.
 *   - Un índice compuesto sirve a la consulta si sus primeros campos son
 *     exactamente los de igualdad (en cualquier orden entre ellos) y los
 *     siguientes son los del `orderBy`, en el mismo orden y con la misma
 *     dirección (o con TODAS invertidas: el índice se recorre al revés).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Carpetas donde viven las consultas de las dos apps. */
const CARPETAS = [
  path.join(RAIZ, 'src', 'main', 'firebase'),
  path.join(RAIZ, 'mobile', 'src'),
];

const EXTENSIONES = new Set(['.ts', '.tsx']);

/**
 * Consultas que se arman en tiempo de ejecución y el análisis estático no
 * puede resolver solo. Se declaran a mano, con la lista completa de
 * combinaciones que la interfaz puede llegar a pedir.
 *
 * Si alguien agrega un filtro nuevo a uno de estos repositorios y no lo anota
 * acá, la auditoría no lo va a ver: por eso cada entrada apunta al archivo y
 * la función exactas.
 */
const EXCLUIDAS = {
  // Helper genérico: la colección y el campo llegan por parámetro, pero
  // siempre es UNA sola igualdad (`activo == true`), que resuelve el índice
  // automático de un campo.
  'src/main/firebase/client.ts': 'leerActivos(): una sola igualdad, índice automático',
  // El sitio literal de `listar()` arma las cláusulas con un spread; sus
  // combinaciones reales están declaradas abajo en DINAMICAS.
  'src/main/firebase/repositories/ventas.repo.ts': 'listar(): declarada en DINAMICAS',
  'src/main/firebase/repositories/productos.repo.ts': 'listar(): declarada en DINAMICAS',
};

const DINAMICAS = [
  {
    origen: 'src/main/firebase/repositories/ventas.repo.ts :: listar()',
    coleccion: 'ventas',
    // `activo` siempre va; tipo / estado / cliente_id son opcionales y se
    // combinan entre sí desde los filtros de la pantalla de ventas.
    combinaciones: [
      [['activo', '==']],
      // La ventana por fecha: `activo ==` + `fecha >=` + orden descendente.
      // Es la forma que usan las pantallas de listado para no traer la
      // historia entera.
      [['activo', '=='], ['fecha', '>=']],
      [['activo', '=='], ['tipo', '==']],
      [['activo', '=='], ['estado', '==']],
      [['activo', '=='], ['cliente_id', '==']],
      [['activo', '=='], ['tipo', '=='], ['estado', '==']],
      [['activo', '=='], ['tipo', '=='], ['cliente_id', '==']],
      [['activo', '=='], ['estado', '=='], ['cliente_id', '==']],
      [['activo', '=='], ['tipo', '=='], ['estado', '=='], ['cliente_id', '==']],
    ],
  },
  {
    // El camino ordenado de `listar()`: ventana, tope y cursor. `tipo` va al
    // servidor; `estado` se afina en memoria y por eso no aparece acá.
    origen: 'src/main/firebase/repositories/ventas.repo.ts :: listar() ordenada',
    coleccion: 'ventas',
    combinaciones: [
      [['activo', '==']],
      [['activo', '=='], ['fecha', '>=']],
      [['activo', '=='], ['tipo', '==']],
      [['activo', '=='], ['tipo', '=='], ['fecha', '>=']],
    ],
    ordenes: [
      ['fecha', 'desc'],
      ['id', 'desc'],
    ],
  },
  {
    origen: 'src/main/firebase/repositories/productos.repo.ts :: listar()',
    coleccion: 'productos',
    combinaciones: [[], [['activo', '==']]],
  },
];

// ---------------------------------------------------------------------------
// Lectura del código fuente
// ---------------------------------------------------------------------------

function listarArchivos(carpeta) {
  const salida = [];
  if (!fs.existsSync(carpeta)) return salida;
  for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
    const completo = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      if (entrada.name === 'node_modules') continue;
      salida.push(...listarArchivos(completo));
    } else if (EXTENSIONES.has(path.extname(entrada.name))) {
      salida.push(completo);
    }
  }
  return salida;
}

/** Devuelve el texto entre el paréntesis que abre en `desde` y el que cierra. */
function extraerParentesis(texto, desde) {
  let nivel = 0;
  let dentroDeCadena = null;
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (dentroDeCadena) {
      if (c === '\\') i++;
      else if (c === dentroDeCadena) dentroDeCadena = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      dentroDeCadena = c;
      continue;
    }
    if (c === '(') nivel++;
    else if (c === ')') {
      nivel--;
      if (nivel === 0) return { cuerpo: texto.slice(desde + 1, i), fin: i };
    }
  }
  return null;
}

const RE_COLECCION_LITERAL = /collection\(\s*[A-Za-z_$][\w$]*\s*,\s*['"]([^'"]+)['"]/;
const RE_COLECCION_VARIABLE = /^\s*([A-Za-z_$][\w$]*)\s*[,)]/;
const RE_WHERE = /where\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
const RE_ORDERBY = /orderBy\(\s*['"]([^'"]+)['"](?:\s*,\s*['"](asc|desc)['"])?/g;
const RE_SPREAD = /\.\.\.[A-Za-z_$][\w$]*/;

/** Resuelve `const colRef = collection(db, 'x')` dentro del mismo archivo. */
function resolverVariableColeccion(contenido, nombre) {
  const re = new RegExp(
    `(?:const|let|var)\\s+${nombre}\\s*=\\s*collection\\(\\s*[A-Za-z_$][\\w$]*\\s*,\\s*['"]([^'"]+)['"]`
  );
  const m = contenido.match(re);
  return m ? m[1] : null;
}

function numeroDeLinea(contenido, indice) {
  return contenido.slice(0, indice).split('\n').length;
}

/** Saca todas las consultas literales de un archivo. */
function consultasDeArchivo(rutaAbsoluta) {
  const contenido = fs.readFileSync(rutaAbsoluta, 'utf8');
  const relativa = path.relative(RAIZ, rutaAbsoluta).replace(/\\/g, '/');
  const encontradas = [];

  let desde = 0;
  while (true) {
    const idx = contenido.indexOf('query(', desde);
    if (idx === -1) break;
    // Evita capturar `subquery(` o similares.
    const anterior = contenido[idx - 1] ?? '';
    if (/[\w$.]/.test(anterior)) {
      desde = idx + 6;
      continue;
    }

    const bloque = extraerParentesis(contenido, idx + 5);
    if (!bloque) {
      desde = idx + 6;
      continue;
    }
    desde = bloque.fin;

    const cuerpo = bloque.cuerpo;
    let coleccion = null;
    const mLiteral = cuerpo.match(RE_COLECCION_LITERAL);
    if (mLiteral) {
      coleccion = mLiteral[1];
    } else {
      const mVar = cuerpo.match(RE_COLECCION_VARIABLE);
      if (mVar) coleccion = resolverVariableColeccion(contenido, mVar[1]);
    }

    const filtros = [];
    for (const m of cuerpo.matchAll(RE_WHERE)) filtros.push([m[1], m[2]]);
    const ordenes = [];
    for (const m of cuerpo.matchAll(RE_ORDERBY)) ordenes.push([m[1], m[2] ?? 'asc']);

    encontradas.push({
      origen: `${relativa}:${numeroDeLinea(contenido, idx)}`,
      coleccion,
      filtros,
      ordenes,
      dinamica: RE_SPREAD.test(cuerpo),
    });
  }

  return encontradas;
}

// ---------------------------------------------------------------------------
// Reglas de Firestore
// ---------------------------------------------------------------------------

const OPS_IGUALDAD = new Set(['==', 'in', 'array-contains', 'array-contains-any']);

/**
 * ¿Esta consulta necesita un índice compuesto declarado?
 * Devuelve `null` si se resuelve con índices automáticos, o la forma del
 * índice que hace falta.
 */
function indiceNecesario(filtros, ordenes) {
  const igualdades = filtros.filter(([, op]) => OPS_IGUALDAD.has(op)).map(([campo]) => campo);
  const desigualdades = filtros
    .filter(([, op]) => !OPS_IGUALDAD.has(op))
    .map(([campo]) => campo);

  // Sin orden y sin desigualdades: Firestore combina índices de un campo.
  if (ordenes.length === 0 && desigualdades.length === 0) return null;

  // Un solo campo en juego, contando filtro y orden.
  const campos = new Set([...igualdades, ...desigualdades, ...ordenes.map(([c]) => c)]);
  if (campos.size <= 1) return null;

  return {
    igualdades: [...new Set(igualdades)],
    desigualdades: [...new Set(desigualdades)],
    ordenes,
  };
}

/**
 * ¿El índice declarado sirve para la forma pedida, SIN depender de reglas
 * finas de Firestore?
 *
 * Esta comprobación se volvió estricta después de que una consulta con índice
 * "aprobado" por esta auditoría fuera rechazada en producción. El problema no
 * fue el índice: fue esta función, que daba por bueno un encaje que dependía
 * de que Firestore recorriera el índice al revés o ignorara campos de más.
 *
 * Una auditoría que aprueba de más es peor que no tenerla: da permiso para
 * desplegar. Así que ahora sólo aprueba el encaje EXACTO —las igualdades como
 * prefijo y después los campos del orden, en el mismo orden y la misma
 * dirección— y todo lo demás se reporta como "encaje dudoso", que no es un
 * error pero tampoco un visto bueno.
 */
function indiceSirveExacto(declarado, forma) {
  const campos = declarado.fields.map((f) => ({
    campo: f.fieldPath,
    dir: (f.order ?? 'ASCENDING').toLowerCase().startsWith('desc') ? 'desc' : 'asc',
  }));

  const nIgual = forma.igualdades.length;
  if (campos.length < nIgual + forma.ordenes.length) return false;

  const prefijo = campos.slice(0, nIgual).map((c) => c.campo).sort();
  if (prefijo.join('|') !== [...forma.igualdades].sort().join('|')) return false;

  const resto = campos.slice(nIgual);

  // Exacto: mismo campo, misma dirección. Sin recorrer al revés.
  const exacto = forma.ordenes.every(
    (o, i) => resto[i] && resto[i].campo === o[0] && resto[i].dir === o[1]
  );
  if (!exacto) return false;

  // Una desigualdad tiene que ser el primer campo ordenado.
  if (forma.desigualdades.length > 0) {
    const primero = forma.ordenes[0]?.[0] ?? resto[0]?.campo;
    if (!forma.desigualdades.includes(primero)) return false;

    // Sin `orderBy` explícito, Firestore ordena por el campo de la
    // desigualdad de forma ascendente. El índice tiene que estar en esa
    // dirección: un índice descendente NO sirve, aunque tenga el campo.
    if (forma.ordenes.length === 0 && resto[0]?.dir !== 'asc') return false;
  }

  return true;
}

/** ¿El índice declarado sirve para la forma pedida? */
function indiceSirve(declarado, forma) {
  const campos = declarado.fields.map((f) => ({
    campo: f.fieldPath,
    dir: (f.order ?? 'ASCENDING').toLowerCase().startsWith('desc') ? 'desc' : 'asc',
  }));

  const nIgual = forma.igualdades.length;
  if (campos.length < nIgual + forma.ordenes.length) return false;

  const prefijo = campos.slice(0, nIgual).map((c) => c.campo).sort();
  const esperado = [...forma.igualdades].sort();
  if (prefijo.join('|') !== esperado.join('|')) return false;

  const resto = campos.slice(nIgual);
  // Firestore recorre un índice al revés, así que también sirve con TODAS las
  // direcciones invertidas.
  const igual = forma.ordenes.every((o, i) => resto[i] && resto[i].campo === o[0] && resto[i].dir === o[1]);
  const invertido = forma.ordenes.every(
    (o, i) => resto[i] && resto[i].campo === o[0] && resto[i].dir !== o[1]
  );
  if (!igual && !invertido) return false;

  // Una desigualdad debe ir sobre el primer campo ordenado.
  if (forma.desigualdades.length > 0) {
    const primerOrden = forma.ordenes[0]?.[0] ?? resto[0]?.campo;
    if (!forma.desigualdades.includes(primerOrden)) return false;
  }

  return true;
}

function describir(coleccion, forma) {
  const partes = [
    ...forma.igualdades.map((c) => `${c} ==`),
    ...forma.desigualdades.map((c) => `${c} <>`),
    ...forma.ordenes.map(([c, d]) => `orden ${c} ${d}`),
  ];
  return `${coleccion}: ${partes.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Ejecución
// ---------------------------------------------------------------------------

const indices = JSON.parse(
  fs.readFileSync(path.join(RAIZ, 'firestore.indexes.json'), 'utf8')
).indexes;

const consultas = [];
/** El texto de cada archivo, para revisar después que DINAMICAS siga al día. */
const FUENTES = new Map();
for (const carpeta of CARPETAS) {
  for (const archivo of listarArchivos(carpeta)) {
    consultas.push(...consultasDeArchivo(archivo));
    FUENTES.set(
      path.relative(RAIZ, archivo).split(path.sep).join('/'),
      fs.readFileSync(archivo, 'utf8')
    );
  }
}

for (const dinamica of DINAMICAS) {
  for (const combinacion of dinamica.combinaciones) {
    consultas.push({
      origen: dinamica.origen,
      coleccion: dinamica.coleccion,
      filtros: combinacion,
      ordenes: dinamica.ordenes ?? [],
      dinamica: false,
      declarada: true,
    });
  }
}

const nombrar = (i) =>
  `${i.collectionGroup}: ` +
  i.fields.map((f) => `${f.fieldPath} ${f.order === 'DESCENDING' ? 'desc' : 'asc'}`).join(', ');

const faltantes = [];
const dudosos = [];
const sinResolver = [];
const usados = new Set();
let automaticas = 0;

for (const consulta of consultas) {
  const archivo = String(consulta.origen).split(':')[0];
  if (!consulta.declarada && EXCLUIDAS[archivo] && (consulta.dinamica || !consulta.coleccion)) {
    automaticas++;
    continue;
  }
  if (consulta.dinamica && !consulta.declarada) {
    sinResolver.push(consulta);
    continue;
  }
  if (!consulta.coleccion) {
    sinResolver.push(consulta);
    continue;
  }

  const forma = indiceNecesario(consulta.filtros, consulta.ordenes);
  if (!forma) {
    automaticas++;
    continue;
  }

  const candidatos = indices.filter((i) => i.collectionGroup === consulta.coleccion);
  const exacto = candidatos.find((i) => indiceSirveExacto(i, forma));

  if (exacto) {
    usados.add(JSON.stringify(exacto));
  } else {
    const dudoso = candidatos.find((i) => indiceSirve(i, forma));
    if (dudoso) {
      usados.add(JSON.stringify(dudoso));
      dudosos.push({ consulta, forma, indice: dudoso });
    } else {
      faltantes.push({ consulta, forma });
    }
  }
}

/**
 * Un índice que ninguna consulta *necesita* puede seguir siendo útil.
 *
 * Firestore resuelve una consulta con un índice cuyos PRIMEROS campos son los
 * de igualdad: un índice (activo, fecha) sirve para `where activo == true`
 * aunque nadie ordene por fecha, y lo hace de una pasada en vez de combinar
 * índices sueltos. Eso es optimización, no obligación.
 *
 * (Una versión anterior de esta comprobación exigía coincidencia exacta y
 * marcaba como muerto un índice que sí se usaba. Comparar por prefijo es lo
 * que hace el planificador de verdad.)
 */
const opcionales = [];
const muertos = [];
for (const i of indices) {
  if (usados.has(JSON.stringify(i))) continue;
  const acelera = consultas.some((c) => {
    if (c.coleccion !== i.collectionGroup) return false;
    if (c.ordenes.length > 0) return false;
    const igualdades = [
      ...new Set(c.filtros.filter(([, op]) => OPS_IGUALDAD.has(op)).map(([campo]) => campo)),
    ];
    if (igualdades.length === 0) return false;
    // Prefijo: los primeros N campos del índice son justo las igualdades.
    const prefijo = i.fields.slice(0, igualdades.length).map((f) => f.fieldPath).sort();
    return prefijo.join('|') === [...igualdades].sort().join('|');
  });
  (acelera ? opcionales : muertos).push(i);
}

console.log('\n=== Auditoría de índices de Firestore ===\n');
console.log(`Consultas encontradas en el código: ${consultas.length}`);
console.log(`  · resueltas por índices automáticos: ${automaticas}`);
console.log(`  · que exigen índice compuesto:       ${consultas.length - automaticas - sinResolver.length}`);
console.log(`Índices declarados: ${indices.length}`);

if (sinResolver.length > 0) {
  console.log('\n⚠ Consultas que el análisis no pudo resolver (declararlas en DINAMICAS):');
  for (const c of sinResolver) console.log(`    ${c.origen}`);
}

if (faltantes.length > 0) {
  console.log('\n✗ FALTAN ÍNDICES — estas consultas fallan en producción y la pantalla queda vacía:\n');
  for (const { consulta, forma } of faltantes) {
    console.log(`    ${describir(consulta.coleccion, forma)}`);
    console.log(`      origen: ${consulta.origen}`);
    // Las igualdades van primero, despues el campo de la desigualdad (si no
    // aparece ya en el orden) y al final los campos del orden.
    const yaListados = new Set(forma.igualdades);
    const sugerido = [...forma.igualdades.map((c) => ({ fieldPath: c, order: 'ASCENDING' }))];

    for (const campo of forma.desigualdades) {
      if (yaListados.has(campo)) continue;
      if (forma.ordenes.some(([c]) => c === campo)) continue;
      sugerido.push({ fieldPath: campo, order: 'ASCENDING' });
      yaListados.add(campo);
    }

    for (const [campo, direccion] of forma.ordenes) {
      if (yaListados.has(campo)) continue;
      sugerido.push({
        fieldPath: campo,
        order: direccion === 'desc' ? 'DESCENDING' : 'ASCENDING',
      });
    }
    console.log(`      agregar: ${JSON.stringify({ collectionGroup: consulta.coleccion, queryScope: 'COLLECTION', fields: sugerido })}`);
    console.log('');
  }
}

if (opcionales.length > 0) {
  console.log(
    '\n· Índices opcionales (aceleran una consulta de sólo igualdades, no son obligatorios):'
  );
  for (const i of opcionales) console.log(`    ${nombrar(i)}`);
}

if (muertos.length > 0) {
  console.log('\n· Índices que ninguna consulta usa — peso muerto en cada escritura:');
  for (const i of muertos) console.log(`    ${nombrar(i)}`);
}

if (dudosos.length > 0) {
  console.log('');
  console.log('⚠ Encajes dudosos: hay un indice que PODRIA servir, pero solo si Firestore');
  console.log('  recorre el índice al revés o ignora campos de más. Eso no está garantizado,');
  console.log('  y cuando no se cumple la consulta se rechaza entera y la pantalla queda vacía.');
  console.log('  Lo seguro es que la consulta ordene exactamente como el indice.');
  console.log('');
  for (const { consulta, forma, indice } of dudosos) {
    console.log(`    ${describir(consulta.coleccion, forma)}`);
    console.log(`      origen: ${consulta.origen}`);
    console.log(`      encajaría con: ${nombrar(indice)}`);
    console.log('');
  }
}


// ---------------------------------------------------------------------------
// Que la tabla de arriba no se quede vieja
// ---------------------------------------------------------------------------

/**
 * Los archivos de EXCLUIDAS arman sus cláusulas con un spread, así que el
 * auditor no puede leerlas: confía en lo que dice DINAMICAS. Eso vale
 * mientras la tabla siga describiendo el código, y una tabla escrita a mano
 * envejece sin avisar. Ya pasó: el código empezó a ordenar también por `id` y
 * la tabla siguió diciendo que ordenaba sólo por fecha.
 *
 * Esto no adivina las combinaciones —para eso habría que ejecutar el código—
 * pero sí comprueba lo mínimo: que todo campo que el archivo nombra en un
 * `where` o un `orderBy` aparezca en alguna forma declarada. Un campo nuevo
 * que nadie declaró es una consulta que nadie auditó.
 */
/**
 * Los tramos de código que arman un arreglo de cláusulas para pasarlo con
 * spread a `query(...)`. Va desde la declaración del arreglo hasta la
 * consulta que lo usa: es exactamente lo que el auditor no puede leer solo.
 */
function tramosDeClausulas(contenido) {
  const tramos = [];
  const RE_DECL = /const\s+(\w+)\s*:\s*QueryConstraint\[\]\s*=/g;
  for (const m of contenido.matchAll(RE_DECL)) {
    const variable = m[1];
    const inicio = m.index;
    const uso = contenido.indexOf(`...${variable}`, inicio);
    tramos.push(contenido.slice(inicio, uso === -1 ? contenido.length : uso));
  }
  return tramos;
}

function revisarTablaAlDia(archivos) {
  const problemas = [];

  for (const archivo of Object.keys(EXCLUIDAS)) {
    const contenido = archivos.get(archivo);
    if (!contenido) continue;

    const declarados = new Set();
    for (const d of DINAMICAS) {
      if (!d.origen.startsWith(archivo)) continue;
      for (const combo of d.combinaciones ?? []) {
        for (const [campo] of combo) declarados.add(campo);
      }
      for (const [campo] of d.ordenes ?? []) declarados.add(campo);
    }
    if (declarados.size === 0) continue;

    // Sólo el tramo que arma el arreglo de cláusulas. El resto del archivo
    // tiene consultas normales, que el auditor sí sabe leer solo.
    const usados = new Set();
    for (const tramo of tramosDeClausulas(contenido)) {
      for (const m of tramo.matchAll(RE_WHERE)) usados.add(m[1]);
      for (const m of tramo.matchAll(RE_ORDERBY)) usados.add(m[1]);
    }

    for (const campo of usados) {
      if (!declarados.has(campo)) {
        problemas.push({ archivo, campo });
      }
    }
  }

  return problemas;
}

const desactualizada = revisarTablaAlDia(FUENTES);

if (desactualizada.length > 0) {
  console.log('');
  console.log('⚠ La tabla DINAMICAS de este auditor quedó vieja.');
  console.log('  El código consulta por campos que ninguna forma declarada menciona, así que');
  console.log('  esas consultas NO se auditaron. Un índice faltante no falla de a poco: la');
  console.log('  consulta se rechaza entera y la pantalla queda en blanco.');
  console.log('');
  for (const { archivo, campo } of desactualizada) {
    console.log(`    ${archivo} consulta por '${campo}', que no está en DINAMICAS`);
  }
  console.log('');
}

if (faltantes.length === 0 && sinResolver.length === 0 && desactualizada.length === 0) {
  console.log('\n✓ Todas las consultas tienen el índice que necesitan.\n');
  process.exit(0);
}

console.log('');
process.exit(
  faltantes.length > 0 || sinResolver.length > 0 || desactualizada.length > 0 ? 1 : 0
);
