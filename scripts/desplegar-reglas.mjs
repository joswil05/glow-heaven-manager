/**
 * Las reglas de Firestore sin la CLI de Firebase.
 *
 * La sesión de la CLI vence y renovarla pide el navegador. Esto usa la sesión
 * de `gcloud`, como `desplegar-movil.mjs`, y la API REST de Firebase Rules.
 *
 *   node scripts/desplegar-reglas.mjs              # sólo compara producción con el repo
 *   node scripts/desplegar-reglas.mjs --desplegar  # publica `firestore.rules`
 *
 * Primero compara siempre: muestra las líneas que están sólo en el repo y las
 * que están sólo en producción. Si producción tiene algo que el repo no, no
 * despliega: alguien cambió las reglas desde la consola y pisarlas lo
 * borraría.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const rc = JSON.parse(readFileSync(join(raiz, '.firebaserc'), 'utf8'));
const PROYECTO = rc.projects.default;
const desplegar = process.argv.includes('--desplegar');
const API = 'https://firebaserules.googleapis.com/v1';

let token;
try {
  token = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  console.error('No hay sesión de gcloud. Corré `gcloud auth login` y probá de nuevo.');
  process.exit(1);
}
const cabeceras = { Authorization: `Bearer ${token}`, 'x-goog-user-project': PROYECTO, 'Content-Type': 'application/json' };

async function pedir(url, opciones = {}) {
  const r = await fetch(url, { headers: cabeceras, ...opciones });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${url}\n${texto}`);
  return texto ? JSON.parse(texto) : {};
}

const normal = (s) => s.replace(/\r\n/g, '\n').trimEnd();
const enElRepo = readFileSync(join(raiz, 'firestore.rules'), 'utf8');

async function enProduccion() {
  const release = await pedir(`${API}/projects/${PROYECTO}/releases/cloud.firestore`);
  const ruleset = await pedir(`${API}/${release.rulesetName}`);
  const archivo = ruleset.source.files.find((f) => f.name === 'firestore.rules') ?? ruleset.source.files[0];
  return { release, contenido: normal(archivo.content) };
}

function lineasSolo(en, contra) {
  const otras = new Set(contra.split('\n'));
  return en.split('\n').filter((l) => !otras.has(l));
}

const antes = await enProduccion();
const repo = normal(enElRepo);
const soloRepo = lineasSolo(repo, antes.contenido);
const soloProduccion = lineasSolo(antes.contenido, repo);
console.log(`Producción: ${antes.release.rulesetName} (del ${antes.release.updateTime})`);
if (antes.contenido === repo) {
  console.log('Producción ya tiene las reglas del repo.');
  process.exit(0);
}
console.log(`Sólo en el repo (${soloRepo.length}):`);
for (const l of soloRepo) console.log(`  + ${l}`);
console.log(`Sólo en producción (${soloProduccion.length}):`);
for (const l of soloProduccion) console.log(`  - ${l}`);

if (!desplegar) {
  console.log('\nNo se desplegó nada. Para publicar: node scripts/desplegar-reglas.mjs --desplegar');
  process.exit(0);
}
if (soloProduccion.length > 0) {
  console.error('\nProducción tiene líneas que el repo no tiene: no se despliega. Traelas al repo primero.');
  process.exit(1);
}

const nuevo = await pedir(`${API}/projects/${PROYECTO}/rulesets`, {
  method: 'POST',
  body: JSON.stringify({ source: { files: [{ name: 'firestore.rules', content: enElRepo }] } }),
});
await pedir(`${API}/projects/${PROYECTO}/releases/cloud.firestore`, {
  method: 'PATCH',
  body: JSON.stringify({ release: { name: `projects/${PROYECTO}/releases/cloud.firestore`, rulesetName: nuevo.name } }),
});
const despues = await enProduccion();
console.log(`\nDesplegadas: ${despues.release.rulesetName}`);
console.log(despues.contenido === repo ? 'Producción = repo.' : 'ATENCIÓN: producción no quedó igual al repo.');
process.exit(despues.contenido === repo ? 0 : 1);
