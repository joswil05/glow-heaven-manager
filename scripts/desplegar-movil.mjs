/**
 * Publica la app del celular (`dist-mobile`) en los sitios de Hosting, por la
 * API REST y con la sesión de `gcloud`.
 *
 * Es para cuando la sesión de la CLI de Firebase venció: `firebase deploy`
 * falla con "Your credentials are no longer valid" y `firebase login
 * --reauth` necesita a alguien en el navegador. Hace lo mismo que
 * `firebase deploy --only hosting`, con la configuración de `firebase.json`
 * (reescrituras y cabeceras) y los sitios de `.firebaserc`:
 *
 *   npm run build:mobile
 *   node scripts/desplegar-movil.mjs
 *
 * Por cada sitio: crea una versión, sube sólo los archivos que Hosting no
 * tiene (comprimidos, por su hash), la cierra y la publica.
 */
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
const rc = JSON.parse(readFileSync('.firebaserc', 'utf8'));
const PROYECTO = rc.projects.default;
const API = 'https://firebasehosting.googleapis.com/v1beta1';

let token;
try {
  token = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  console.error('No hay sesión de gcloud: `gcloud auth login`.');
  process.exit(1);
}
const cabeceras = (tipo = 'application/json') => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': tipo,
  // Con credenciales de usuario, la API pide a qué proyecto cobrar la cuota.
  'x-goog-user-project': PROYECTO,
});

async function llamar(metodo, url, cuerpo) {
  const r = await fetch(url, { method: metodo, headers: cabeceras(), body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${metodo} ${url}: ${r.status} ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : {};
}

/** Los archivos a publicar, sin los que `ignore` deja afuera. */
function archivos(dir) {
  const salida = [];
  const recorrer = (d) => {
    for (const nombre of readdirSync(d)) {
      if (nombre.startsWith('.') || nombre === 'node_modules' || nombre === 'firebase.json') continue;
      const ruta = join(d, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else salida.push(ruta);
    }
  };
  recorrer(dir);
  return salida;
}

for (const hc of config.hosting) {
  const sitio = hc.site ?? rc.targets[PROYECTO].hosting[hc.target][0];
  const dir = hc.public;

  const version = await llamar('POST', `${API}/sites/${sitio}/versions`, {
    config: {
      rewrites: (hc.rewrites || []).map((r) => ({ glob: r.source, path: r.destination })),
      headers: (hc.headers || []).map((x) => ({
        glob: x.source,
        headers: Object.fromEntries(x.headers.map((k) => [k.key, k.value])),
      })),
    },
  });

  const mapa = {};
  const porHash = new Map();
  for (const ruta of archivos(dir)) {
    const gz = gzipSync(readFileSync(ruta), { level: 9 });
    const hash = createHash('sha256').update(gz).digest('hex');
    mapa[`/${relative(dir, ruta).split('\\').join('/')}`] = hash;
    porHash.set(hash, gz);
  }

  const llenado = await llamar('POST', `${API}/${version.name}:populateFiles`, { files: mapa });
  const faltan = llenado.uploadRequiredHashes || [];
  for (const hash of faltan) {
    const r = await fetch(`${llenado.uploadUrl}/${hash}`, {
      method: 'POST',
      headers: cabeceras('application/octet-stream'),
      body: porHash.get(hash),
    });
    if (!r.ok) throw new Error(`subida ${hash}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }

  await llamar('PATCH', `${API}/${version.name}?update_mask=status`, { status: 'FINALIZED' });
  const publicacion = await llamar('POST', `${API}/sites/${sitio}/releases?versionName=${encodeURIComponent(version.name)}`, {});
  console.log(`${sitio}: ${Object.keys(mapa).length} archivos, ${faltan.length} subidos, publicado (${publicacion.name.split('/').pop()})`);
}
