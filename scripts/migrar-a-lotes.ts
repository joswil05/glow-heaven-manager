/**
 * Pasa los datos de antes de la 2.14 al flujo de lotes, de una vez.
 *
 * La app ya migra sola, producto por producto, la primera vez que lo toca:
 * le arma un lote "Anterior" con todo lo que tiene (`normalizarLotes`). Eso
 * cuadra la bodega, pero pierde de qué paquete vino cada unidad. Este script
 * hace la migración completa, como si los datos hubieran entrado con la 2.14:
 *
 *   - cada línea de un paquete recibido pasa a ser su lote;
 *   - las ventas que ya se hicieron salen de esos lotes, del más viejo, y cada
 *     línea de venta guarda de qué lote salió (`lotes_consumidos`), para que
 *     anularla devuelva la unidad a su lote;
 *   - los encargos que venían en un paquete quedan con la pieza apuntando a
 *     su línea, y con su resumen de piezas.
 *
 * No mueve la bodega ni un centavo: el valor guardado de cada producto manda,
 * y si la cuenta de los lotes no da exacta, no se escribe nada.
 *
 * Uso (siempre sobre un respaldo recién tomado, que trae la hora de cada
 * documento para escribir con condición):
 *
 *   node scripts/respaldar-produccion.mjs respaldos/antes-de-migrar.json
 *   npx vite-node scripts/migrar-a-lotes.ts respaldos/antes-de-migrar.json            (ensayo)
 *   npx vite-node scripts/migrar-a-lotes.ts respaldos/antes-de-migrar.json --aplicar
 *
 * Escribe todo en UN commit de la API REST, con `currentDocument.updateTime`
 * en cada documento: si alguien tocó algo después del respaldo, se rechaza
 * entero y no queda nada a medias.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  crearLote,
  sacarFIFO,
  costoDeSacar,
  normalizarLotes,
  camposDesdeLotes,
  valorDeLotes,
  unidadesDeLotes,
  ordenFIFO,
  type Lote,
  type Consumo,
} from '../src/core/lotes';
import { idLoteDeLinea } from '../src/core/paquete';
import { piezasDe } from '../src/core/encargos';
import { repartirMayorResiduo } from '../src/core/prorrateo';

const PROYECTO = 'glow-heaven-db-app';
const BASE = `projects/${PROYECTO}/databases/(default)/documents`;

// ---------------------------------------------------------------------------
// El formato de la API REST
// ---------------------------------------------------------------------------

type Crudo = { name: string; updateTime: string; fields: Record<string, ValorRest> };
type ValorRest = Record<string, unknown>;

function leer(v: ValorRest | undefined): unknown {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue as { values?: ValorRest[] }).values || []).map(leer);
  if ('mapValue' in v) return leerCampos((v.mapValue as { fields?: Record<string, ValorRest> }).fields || {});
  return undefined;
}
const leerCampos = (f: Record<string, ValorRest>) =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, leer(v)]));

function escribir(v: unknown): ValorRest {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(escribir) } };
  const campos: Record<string, ValorRest> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (x !== undefined) campos[k] = escribir(x);
  return { mapValue: { fields: campos } };
}

// ---------------------------------------------------------------------------
// Los datos
// ---------------------------------------------------------------------------

interface Variante { id: number; existencias: number; activo?: boolean }
interface Producto {
  id: number;
  nombre: string;
  variantes: Variante[];
  valor_inventario_usd_cents: number;
  costo_unitario_usd_cents: number;
  paquete_id?: number;
  lotes?: Lote[];
}
interface LineaCompra {
  id: number;
  producto_id?: number;
  variante_id?: number;
  destino: 'INVENTARIO' | 'ENCARGO';
  cantidad: number;
  costo_linea_usd_cents: number;
  costo_unitario_usd_cents: number;
  venta_id?: number;
  venta_linea_id?: number;
  descripcion: string;
}
interface Compra { id: number; codigo: string; fecha: string; estado: string; lineas?: LineaCompra[] }
interface LineaVenta {
  id: number;
  producto_id?: number;
  variante_id?: number;
  cantidad: number;
  subtotal_usd_cents: number;
  lotes_consumidos?: Consumo[];
  compra_id?: number;
}
interface Venta {
  id: number;
  codigo: string;
  fecha: string;
  tipo: 'INVENTARIO' | 'ENCARGO';
  estado: string;
  descuento_usd_cents?: number;
  lineas?: LineaVenta[];
  piezas?: unknown;
}

const archivo = process.argv.find((a) => a.endsWith('.json'));
const aplicar = process.argv.includes('--aplicar');
if (!archivo) {
  console.error('Falta el respaldo: npx vite-node scripts/migrar-a-lotes.ts respaldos/antes.json [--aplicar]');
  process.exit(1);
}
const respaldo = JSON.parse(readFileSync(archivo, 'utf8')) as { tomado_en: string; colecciones: Record<string, Crudo[]> };
const crudos = respaldo.colecciones;
const de = <T>(col: string) => (crudos[col] || []).map((d) => ({ crudo: d, dato: leerCampos(d.fields) as T }));

const productos = de<Producto>('productos');
const compras = de<Compra>('compras').map((c) => c.dato).filter((c) => c.estado === 'RECIBIDA');
const ventas = de<Venta>('ventas');
const movimientos = de<{ producto_id: number; tipo: string }>('movimientos_inventario').map((m) => m.dato);

console.log(`respaldo del ${respaldo.tomado_en}: ${productos.length} productos, ${compras.length} paquetes recibidos, ${ventas.length} ventas\n`);

const escrituras: Record<string, unknown>[] = [];
const problemas: string[] = [];
const consumosPorLinea = new Map<string, Consumo[]>(); // "venta:linea"

// ---------------------------------------------------------------------------
// Productos: un lote por línea de paquete, y las ventas que salieron de ellos
// ---------------------------------------------------------------------------

// Las ventas que sacaron de la bodega, en orden: primero la más vieja.
const ventasDeBodega = ventas
  .map((v) => v.dato)
  .filter((v) => v.tipo === 'INVENTARIO' && v.estado !== 'CANCELADA' && v.estado !== 'COTIZADA')
  .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);

// Un encargo de antes con una pieza del catálogo no se sabe si salió de la
// bodega: se revisa a mano.
for (const { dato: v } of ventas) {
  if (v.tipo === 'ENCARGO' && (v.lineas || []).some((l) => l.producto_id && !l.compra_id)) {
    problemas.push(`${v.codigo}: encargo con una pieza del catálogo; revisar a mano si salió de la bodega.`);
  }
}

let bodegaAntes = 0;
let bodegaDespues = 0;

for (const { crudo, dato: p } of productos) {
  bodegaAntes += p.valor_inventario_usd_cents || 0;
  if (p.lotes && p.lotes.length > 0) {
    console.log(`= ${p.nombre}: ya tiene lotes, no se toca`);
    bodegaDespues += p.valor_inventario_usd_cents || 0;
    continue;
  }
  const raros = movimientos.filter((m) => m.producto_id === p.id && m.tipo !== 'ENTRADA' && m.tipo !== 'SALIDA');
  if (raros.length > 0) {
    problemas.push(`${p.nombre}: tiene ${raros.length} movimiento(s) ${[...new Set(raros.map((m) => m.tipo))].join(', ')}; revisar a mano.`);
  }

  const variantes = (p.variantes || []).map((v) => ({ ...v }));
  const vivas = variantes.filter((v) => v.activo !== false).sort((a, b) => a.id - b.id);
  const tallaValida = (id?: number) => (id !== undefined && vivas.some((v) => v.id === id) ? id : undefined);
  const primera = vivas[0]?.id ?? variantes[0]?.id ?? 1;

  // 1. Un lote por línea, en el orden en que llegaron. Mientras se simulan las
  //    ventas, todos van en una talla sola (0): la talla se asigna al final.
  let lotes: Lote[] = [];
  const tallaDeLinea = new Map<string, number>();
  for (const c of [...compras].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)) {
    for (const l of c.lineas || []) {
      if (l.destino !== 'INVENTARIO' || l.producto_id !== p.id) continue;
      const id = idLoteDeLinea(c.id, l.id);
      tallaDeLinea.set(id, tallaValida(l.variante_id) ?? primera);
      lotes.push(
        crearLote({
          id,
          variante_id: 0,
          cantidad: l.cantidad,
          valor_usd_cents: l.costo_linea_usd_cents,
          fecha: c.fecha,
          orden: c.id * 10000 + l.id,
          origen: 'PAQUETE',
          compra_id: c.id,
          compra_codigo: c.codigo,
          compra_linea_id: l.id,
          costo_unitario_usd_cents: l.costo_unitario_usd_cents,
        })
      );
    }
  }
  lotes.sort(ordenFIFO);

  // 2. Las ventas, del lote más viejo, con lo que se cobró por cada unidad.
  for (const v of ventasDeBodega) {
    const lineasV = v.lineas || [];
    const descuento = repartirMayorResiduo(
      v.descuento_usd_cents || 0,
      lineasV.map((l, i) => ({ id: i, base_valor: l.subtotal_usd_cents }))
    );
    lineasV.forEach((l, i) => {
      if (l.producto_id !== p.id || l.lotes_consumidos) return;
      const r = sacarFIFO(lotes, 0, l.cantidad, 'VENTA', l.subtotal_usd_cents - (descuento.get(i) ?? 0));
      lotes = r.lotes;
      if (r.faltantes > 0) problemas.push(`${p.nombre}: ${v.codigo} vendió ${r.faltantes} unidad(es) que ningún paquete trajo.`);
      consumosPorLinea.set(`${v.id}:${l.id}`, r.consumos.map((x) => ({ ...x, variante_id: tallaValida(l.variante_id) ?? -1 })));
    });
  }

  // 3. Las tallas. Lo que queda se reparte entre las tallas con existencias,
  //    del lote más viejo a la talla de id más bajo. Un lote que cae en dos
  //    tallas se parte en dos, y la segunda parte se llama "-t<talla>".
  const falta = new Map(vivas.map((v) => [v.id, Math.max(0, v.existencias || 0)]));
  const conTallas: Lote[] = [];
  for (const l of lotes.sort(ordenFIFO)) {
    if (l.cantidad === 0) {
      conTallas.push({ ...l, variante_id: tallaDeLinea.get(l.id) ?? primera });
      continue;
    }
    let resto = l.cantidad;
    let valorResto = l.valor_usd_cents;
    let pedazo = 0;
    while (resto > 0) {
      const talla = [...falta.entries()].find(([, n]) => n > 0)?.[0];
      // Más unidades que existencias: van a la talla de la línea y las quita
      // la conciliación de abajo, del lote más viejo.
      const k = talla === undefined ? resto : Math.min(resto, falta.get(talla)!);
      const destino = talla ?? tallaDeLinea.get(l.id) ?? primera;
      const valor = costoDeSacar(resto, valorResto, k);
      if (talla !== undefined) falta.set(talla, falta.get(talla)! - k);
      conTallas.push(
        pedazo === 0
          ? { ...l, variante_id: destino, cantidad: k, valor_usd_cents: valor, cantidad_inicial: l.cantidad_inicial - (l.cantidad - k) }
          : {
              ...crearLote({ ...l, id: `${l.id}-t${destino}`, variante_id: destino, cantidad: k, valor_usd_cents: valor }),
              costo_unitario_usd_cents: l.costo_unitario_usd_cents,
            }
      );
      resto -= k;
      valorResto -= valor;
      pedazo++;
    }
  }

  // Cada consumo lleva la talla de su lote, si la venta no decía una válida.
  const tallaFinal = new Map(conTallas.map((l) => [l.id, l.variante_id]));
  for (const [clave, cs] of consumosPorLinea) {
    consumosPorLinea.set(clave, cs.map((c) => (c.variante_id === -1 ? { ...c, variante_id: tallaFinal.get(c.lote_id) ?? primera } : c)));
  }

  // 4. Conciliar con lo guardado, que manda. Si hay diferencia se avisa: puede
  //    ser un redondeo o una salida que no pasó por una venta.
  const n = normalizarLotes(
    {
      variantes,
      valor_inventario_usd_cents: p.valor_inventario_usd_cents,
      costo_unitario_usd_cents: p.costo_unitario_usd_cents,
      lotes: conTallas,
      paquete_id: p.paquete_id,
    },
    compras.find((c) => c.id === p.paquete_id)?.codigo
  );
  const ajuste = valorDeLotes(n.lotes) - valorDeLotes(conTallas);
  const unidadesAjuste = unidadesDeLotes(n.lotes) - unidadesDeLotes(conTallas);
  if (ajuste !== 0 || unidadesAjuste !== 0 || n.lotes.some((l) => l.origen === 'SALDO')) {
    problemas.push(
      `${p.nombre}: los paquetes y las ventas no explican lo guardado (${unidadesAjuste} u., ${ajuste} ¢); se concilió contra el lote más viejo.`
    );
  }

  // 5. Comprobar: lo que la app va a leer tiene que ser exactamente esto.
  const final = n.lotes;
  const campos = camposDesdeLotes(variantes, final, p.costo_unitario_usd_cents || 0);
  const vuelta = normalizarLotes({ variantes, valor_inventario_usd_cents: p.valor_inventario_usd_cents, lotes: final });
  if (campos.valor_inventario_usd_cents !== (p.valor_inventario_usd_cents || 0)) {
    problemas.push(`${p.nombre}: el valor cambiaría de ${p.valor_inventario_usd_cents} a ${campos.valor_inventario_usd_cents}.`);
  }
  for (const v of variantes) {
    const nueva = campos.variantes.find((x) => x.id === v.id);
    if ((nueva?.existencias ?? 0) !== (v.activo === false ? v.existencias : v.existencias || 0)) {
      problemas.push(`${p.nombre}: la talla ${v.id} cambiaría de ${v.existencias} a ${nueva?.existencias}.`);
    }
  }
  if (vuelta.cambiado && JSON.stringify(vuelta.lotes) !== JSON.stringify([...final].sort(ordenFIFO))) {
    problemas.push(`${p.nombre}: los lotes no quedan estables.`);
  }
  bodegaDespues += campos.valor_inventario_usd_cents;

  const costoAntes = p.costo_unitario_usd_cents || 0;
  console.log(
    `+ ${p.nombre}  (valor ${p.valor_inventario_usd_cents}, costo ${costoAntes}${campos.costo_unitario_usd_cents !== costoAntes ? ` -> ${campos.costo_unitario_usd_cents}` : ''})`
  );
  for (const l of final) {
    console.log(
      `     ${l.id.padEnd(14)} talla ${l.variante_id}  quedan ${l.cantidad}/${l.cantidad_inicial}  valor ${l.valor_usd_cents}` +
        (l.vendidas ? `  vendidas ${l.vendidas} (cobró ${l.ingreso_usd_cents}, costó ${l.costo_vendido_usd_cents})` : '')
    );
  }

  const campo: Record<string, ValorRest> = { lotes: escribir(final.map((l) => JSON.parse(JSON.stringify(l)))) };
  const mascara = ['lotes'];
  if (campos.costo_unitario_usd_cents !== costoAntes) {
    campo.costo_unitario_usd_cents = escribir(campos.costo_unitario_usd_cents);
    mascara.push('costo_unitario_usd_cents');
  }
  escrituras.push({
    update: { name: crudo.name, fields: campo },
    updateMask: { fieldPaths: mascara },
    currentDocument: { updateTime: crudo.updateTime },
  });
}

// ---------------------------------------------------------------------------
// Ventas: de qué lote salió cada línea. Encargos: sus piezas.
// ---------------------------------------------------------------------------

for (const { crudo, dato: v } of ventas) {
  const lineasRest = ((crudo.fields.lineas?.arrayValue as { values?: ValorRest[] } | undefined)?.values || []).map(
    (x) => JSON.parse(JSON.stringify(x)) as { mapValue: { fields: Record<string, ValorRest> } }
  );
  let cambio = false;
  const campos: Record<string, ValorRest> = {};
  const mascara: string[] = [];

  (v.lineas || []).forEach((l, i) => {
    const cs = consumosPorLinea.get(`${v.id}:${l.id}`);
    if (!cs || cs.length === 0) return;
    lineasRest[i].mapValue.fields.lotes_consumidos = escribir(cs.map((c) => JSON.parse(JSON.stringify(c))));
    cambio = true;
    console.log(`> ${v.codigo} línea ${l.id}: ${cs.map((c) => `${c.cantidad} de ${c.lote_id} (${c.costo_usd_cents} ¢)`).join(', ')}`);
  });

  if (v.tipo === 'ENCARGO') {
    // Las piezas que un paquete trae: hasta la 2.13 sólo lo sabía el paquete.
    const piezas = (v.lineas || []).map((l) => ({ ...l })) as (LineaVenta & {
      compra_codigo?: string;
      compra_linea_id?: number;
      llego_el?: string;
    })[];
    (v.lineas || []).forEach((l, i) => {
      for (const c of de<Compra>('compras').map((x) => x.dato)) {
        const lc = (c.lineas || []).find((x) => x.destino === 'ENCARGO' && x.venta_id === v.id && x.venta_linea_id === l.id);
        if (!lc || l.compra_id) continue;
        const f = lineasRest[i].mapValue.fields;
        f.compra_id = escribir(c.id);
        f.compra_codigo = escribir(c.codigo);
        f.compra_linea_id = escribir(lc.id);
        piezas[i].compra_id = c.id;
        if (c.estado === 'RECIBIDA') {
          f.llego_el = escribir(c.fecha);
          piezas[i].llego_el = c.fecha;
        }
        cambio = true;
        console.log(`> ${v.codigo} pieza ${l.id}: viene en ${c.codigo}${c.estado === 'RECIBIDA' ? ', llegó' : ''}`);
      }
    });
    if (!v.piezas) {
      campos.piezas = escribir(piezasDe(piezas));
      mascara.push('piezas');
      cambio = true;
    }
  }

  if (!cambio) continue;
  if (lineasRest.length > 0) {
    campos.lineas = { arrayValue: { values: lineasRest } };
    mascara.push('lineas');
  }
  escrituras.push({
    update: { name: crudo.name, fields: campos },
    updateMask: { fieldPaths: mascara },
    currentDocument: { updateTime: crudo.updateTime },
  });
}

// ---------------------------------------------------------------------------

console.log(`\nbodega: ${bodegaAntes} ¢ antes, ${bodegaDespues} ¢ después`);
if (bodegaAntes !== bodegaDespues) problemas.push(`La bodega se movería ${bodegaDespues - bodegaAntes} ¢.`);
console.log(`escrituras: ${escrituras.length}`);

if (problemas.length > 0) {
  console.log('\nPara revisar:');
  for (const x of problemas) console.log(`  - ${x}`);
}
const bloquean = problemas.filter((x) => /cambiaría|no quedan estables|se movería|ningún paquete/.test(x));
if (bloquean.length > 0) {
  console.log('\nNo se escribe: hay diferencias que cambiarían la bodega.');
  process.exit(1);
}
if (!aplicar) {
  console.log('\nENSAYO: no se escribió nada. Con --aplicar se escribe todo junto.');
  process.exit(0);
}

const token = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const r = await fetch(`https://firestore.googleapis.com/v1/${BASE}:commit`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ writes: escrituras }),
});
const texto = await r.text();
if (!r.ok) {
  console.log(`RECHAZADO, no se escribió nada: ${r.status} ${texto.slice(0, 400)}`);
  process.exit(1);
}
console.log(`APLICADO: ${(JSON.parse(texto) as { writeResults: unknown[] }).writeResults.length} escrituras confirmadas juntas.`);
