/**
 * Compara dos respaldos de producción y clasifica cada diferencia, sin
 * escribir nada. Sirve para probar sobre la base real y demostrar después
 * que quedó igual:
 *
 *   node scripts/comparar-respaldos.mjs antes.json despues.json plan.json
 *
 * Reconoce como "de prueba" sólo lo que toca productos o clientas cuyo
 * nombre empieza con "Prueba ", y lo que cuelga de ellos. Todo lo demás
 * sale como SIN CLASIFICAR y no debe tocarse. Compara en forma canónica: la
 * API devuelve los campos en distinto orden cada vez.
 */
import { readFileSync, writeFileSync } from 'node:fs';
const [antesF, ahoraF, salidaF] = process.argv.slice(2);
const antes = JSON.parse(readFileSync(antesF, 'utf8')).colecciones;
const ahora = JSON.parse(readFileSync(ahoraF, 'utf8')).colecciones;
const v = (f) => f == null ? undefined : 'integerValue' in f ? Number(f.integerValue) : 'doubleValue' in f ? f.doubleValue : 'stringValue' in f ? f.stringValue : 'booleanValue' in f ? f.booleanValue : 'nullValue' in f ? null : 'arrayValue' in f ? (f.arrayValue.values || []).map(v) : 'mapValue' in f ? Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, x]) => [k, v(x)])) : undefined;
const canon = (x) => Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;
const plano = (d) => Object.fromEntries(Object.entries(d.fields || {}).map(([k, x]) => [k, v(x)]));
const idDe = (d) => d.name.split('/').pop();
const mapa = (cols) => Object.fromEntries(Object.entries(cols).map(([c, docs]) => [c, new Map(docs.map((d) => [idDe(d), d]))]));
const A = mapa(antes), B = mapa(ahora);

// Entidades de prueba, reconocidas por su contenido.
const prodPrueba = new Set([...B.productos.values()].filter((d) => /^Prueba /.test(plano(d).nombre || '')).map((d) => Number(idDe(d))));
const cliPrueba = new Set([...(B.clientes?.values() || [])].filter((d) => /^Prueba /.test(plano(d).nombre || '')).map((d) => Number(idDe(d))));
const ventasPrueba = new Set([...B.ventas.values()].filter((d) => {
  const x = plano(d);
  return cliPrueba.has(x.cliente_id) || (x.lineas || []).some((l) => prodPrueba.has(l.producto_id));
}).map((d) => Number(idDe(d))));
const comprasPrueba = new Set([...B.compras.values()].filter((d) => {
  if (A.compras.has(idDe(d))) return false;
  const ls = plano(d).lineas || [];
  return ls.length > 0 && ls.every((l) => (l.producto_id && prodPrueba.has(l.producto_id)) || (l.venta_id && ventasPrueba.has(l.venta_id)));
}).map((d) => Number(idDe(d))));
const esPrueba = (col, d) => {
  const x = plano(d), id = Number(idDe(d));
  if (col === 'productos') return prodPrueba.has(id);
  if (col === 'clientes') return cliPrueba.has(id);
  if (col === 'ventas') return ventasPrueba.has(id);
  if (col === 'compras') return comprasPrueba.has(id);
  if (col === 'pagos') return ventasPrueba.has(x.venta_id);
  if (col === 'movimientos_inventario') return prodPrueba.has(x.producto_id);
  if (col === 'eventos') {
    const t = x.entidad_tipo, e = x.entidad_id;
    return (t === 'productos' && prodPrueba.has(e)) || (t === 'clientes' && cliPrueba.has(e)) ||
      (t === 'ventas' && ventasPrueba.has(e)) || (t === 'compras' && comprasPrueba.has(e)) ||
      (t === 'pagos' && [...B.pagos.values()].some((p) => Number(idDe(p)) === e && ventasPrueba.has(plano(p).venta_id)));
  }
  return false;
};

const plan = { borrar: [], restaurar: [], desconocido: [] };
for (const col of new Set([...Object.keys(A), ...Object.keys(B)])) {
  const a = A[col] || new Map(), b = B[col] || new Map();
  for (const [id, d] of b) {
    if (!a.has(id)) (esPrueba(col, d) ? plan.borrar : plan.desconocido).push({ col, id, tipo: 'nuevo', resumen: JSON.stringify(plano(d)).slice(0, 140) });
    else if (JSON.stringify(canon(a.get(id).fields)) !== JSON.stringify(canon(d.fields))) {
      if (col === '_secuencias' || col === 'resumenes_mensuales') plan.restaurar.push({ col, id, tipo: 'cambiado' });
      else plan.desconocido.push({ col, id, tipo: 'cambiado', antes: JSON.stringify(plano(a.get(id))).slice(0, 200), ahora: JSON.stringify(plano(d)).slice(0, 200) });
    }
  }
  for (const [id] of a) if (!b.has(id)) plan.restaurar.push({ col, id, tipo: 'borrado' });
}
writeFileSync(salidaF, JSON.stringify({ prodPrueba: [...prodPrueba], cliPrueba: [...cliPrueba], ventasPrueba: [...ventasPrueba], comprasPrueba: [...comprasPrueba], ...plan }, null, 1));
const cuenta = (xs) => Object.entries(xs.reduce((m, x) => ((m[x.col] = (m[x.col] || 0) + 1), m), {})).map(([c, n]) => `${c}=${n}`).join(' ');
console.log('de prueba: productos', [...prodPrueba], 'clientas', [...cliPrueba], 'ventas', [...ventasPrueba], 'paquetes', [...comprasPrueba]);
console.log('a borrar:', plan.borrar.length, '|', cuenta(plan.borrar));
console.log('a restaurar:', plan.restaurar.length, '|', plan.restaurar.map((x) => `${x.col}/${x.id} (${x.tipo})`).join(', '));
console.log('SIN CLASIFICAR (no se tocan):', plan.desconocido.length);
for (const x of plan.desconocido) console.log('  ', x.col, x.id, x.tipo, x.resumen || '', x.antes ? `\n     antes: ${x.antes}\n     ahora: ${x.ahora}` : '');
