/**
 * Respaldo completo de producción, de SÓLO LECTURA.
 *
 *   node scripts/respaldar-produccion.mjs respaldos/<nombre>.json
 *
 * Guarda cada documento tal como lo devuelve la API REST, con sus tipos y su
 * updateTime, para poder restaurarlo exacto y para usar las condiciones
 * previas de un commit. Se autentica con la sesión de gcloud de la máquina.
 * `respaldos/` está en .gitignore: lleva datos reales.
 */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PROYECTO = 'glow-heaven-db-app';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents`;
const TOKEN = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

async function listar(col) {
  const docs = [];
  let token = '';
  do {
    const url = `${BASE}/${col}?pageSize=300${token ? `&pageToken=${token}` : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (!r.ok) throw new Error(`${col}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    docs.push(...(j.documents || []));
    token = j.nextPageToken || '';
  } while (token);
  return docs;
}

const r = await fetch(`${BASE}:listCollectionIds`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ pageSize: 100 }),
});
const colecciones = (await r.json()).collectionIds || [];
const salida = { tomado_en: new Date().toISOString(), colecciones: {} };
let total = 0;
for (const c of colecciones) {
  salida.colecciones[c] = await listar(c);
  total += salida.colecciones[c].length;
}
writeFileSync(process.argv[2], JSON.stringify(salida));
console.log('colecciones:', colecciones.map((c) => `${c}=${salida.colecciones[c].length}`).join(' '));
console.log('documentos:', total);
