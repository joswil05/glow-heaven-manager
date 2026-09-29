/**
 * Repara una venta que se borró a mano en la consola de Firebase.
 *
 * Borrar el documento de una venta no deshace lo que la venta hizo: sus
 * unidades siguen fuera de sus lotes (el producto queda "agotado"), sus pagos
 * siguen contados como cobrados y sus movimientos apuntan a una venta que ya
 * no existe. Pasó el 29 de septiembre con V-0007.
 *
 * Este script hace lo que habría hecho anularla desde la app, en UN commit:
 *
 *   - reconstruye la venta, ya anulada, con lo que dejó en los lotes (de qué
 *     lote salió cada unidad, a qué costo y por cuánto se vendió), y lo
 *     comprueba contra sus movimientos de salida;
 *   - devuelve cada unidad a su lote con `devolverConsumos`, la misma función
 *     que usa anular, y registra la entrada;
 *   - anula sus pagos activos (Joswill: el pago no fue real);
 *   - deja un evento que no se puede deshacer, con lo que se hizo.
 *
 * Uso, siempre sobre un respaldo recién tomado (trae la hora de cada
 * documento, para escribir con condición):
 *
 *   node scripts/respaldar-produccion.mjs respaldos/antes-de-reparar.json
 *   npx vite-node --config vitest.config.ts scripts/reparar-venta-borrada.ts respaldos/antes-de-reparar.json 7            (ensayo)
 *   npx vite-node --config vitest.config.ts scripts/reparar-venta-borrada.ts respaldos/antes-de-reparar.json 7 --aplicar
 *
 * `--config vitest.config.ts`: la configuración de Vite de la app simula los
 * módulos de Node para Electron, y con ella `child_process` no carga.
 *
 * Si alguien tocó un documento después del respaldo, el commit se rechaza
 * entero y no queda nada a medias. Si un número no cuadra, no se escribe.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  normalizarLotes,
  devolverConsumos,
  camposDesdeLotes,
  unidadesDeLotes,
  valorDeLotes,
  type Lote,
  type Consumo,
} from '../src/core/lotes';
import { hoyISO } from '../src/core/fechas';

const PROYECTO = 'glow-heaven-db-app';
const BASE = `projects/${PROYECTO}/databases/(default)/documents`;

// ---------------------------------------------------------------------------
// El formato de la API REST (el mismo de migrar-a-lotes.ts)
// ---------------------------------------------------------------------------

type ValorRest = Record<string, unknown>;
type Crudo = { name: string; updateTime: string; fields: Record<string, ValorRest> };

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
const escribirCampos = (o: Record<string, unknown>) => (escribir(o) as { mapValue: { fields: Record<string, ValorRest> } }).mapValue.fields;

/** Id ordenable por tiempo, con el formato de `idOrdenable()` de la app. */
let contador = 0;
function idOrdenable(): string {
  contador = (contador + 1) % 1_000_000;
  return `${Date.now().toString(36).padStart(9, '0')}-${contador.toString(36).padStart(4, '0')}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------

interface Variante { id: number; existencias: number; activo?: boolean; nombre?: string }
interface Producto {
  id: number;
  nombre: string;
  variantes: Variante[];
  valor_inventario_usd_cents: number;
  costo_unitario_usd_cents: number;
  paquete_id?: number;
  lotes?: Lote[];
}
interface Movimiento {
  id: string;
  tipo: 'ENTRADA' | 'SALIDA';
  producto_id: number;
  variante_id?: number;
  cantidad: number;
  costo_total_usd_cents: number;
  referencia_tipo?: string;
  referencia_id?: number;
  detalle?: string;
  fecha: string;
}
interface Venta {
  id: number;
  codigo: string;
  tipo: string;
  estado: string;
  lineas?: { lotes_consumidos?: Consumo[] }[];
}

const archivo = process.argv.find((a) => a.endsWith('.json'));
const ventaId = Number(process.argv.find((a) => /^\d+$/.test(a)));
const aplicar = process.argv.includes('--aplicar');
if (!archivo || !ventaId) {
  console.error('Uso: npx vite-node --config vitest.config.ts scripts/reparar-venta-borrada.ts respaldos/antes.json <id de la venta> [--aplicar]');
  process.exit(1);
}

const respaldo = JSON.parse(readFileSync(archivo, 'utf8')) as { tomado_en: string; colecciones: Record<string, Crudo[]> };
const idDe = (c: Crudo) => c.name.split('/').pop()!;
const coleccion = <T,>(nombre: string) =>
  new Map((respaldo.colecciones[nombre] ?? []).map((c) => [idDe(c), { crudo: c, datos: leerCampos(c.fields || {}) as T }]));

const ventas = coleccion<Venta>('ventas');
const productos = coleccion<Producto>('productos');
const pagos = coleccion<{ id: number; venta_id: number; activo: boolean; monto_usd_cents: number; moneda: string; monto_cor_cents: number }>('pagos');
const movimientos = [...coleccion<Movimiento>('movimientos_inventario').values()].map((x) => x.datos);
const eventos = [...coleccion<{ entidad_tipo: string; entidad_id: number; tipo_evento: string; timestamp: string }>('eventos').values()].map((x) => x.datos);

const codigo = `V-${String(ventaId).padStart(4, '0')}`;
const problemas: string[] = [];
console.log(`respaldo del ${respaldo.tomado_en}; reparando ${codigo}\n`);

// 1. Las condiciones: la venta no existe, y lo que dejó sigue ahí sin devolver.
if (ventas.has(String(ventaId))) problemas.push(`${codigo} existe: no hay nada que reconstruir.`);
const salidas = movimientos
  .filter((m) => m.referencia_tipo === 'VENTA' && Number(m.referencia_id) === ventaId && m.tipo === 'SALIDA')
  .sort((a, b) => a.fecha.localeCompare(b.fecha));
const yaDevuelto = movimientos.some((m) => m.referencia_tipo === 'VENTA' && Number(m.referencia_id) === ventaId && m.tipo === 'ENTRADA');
if (salidas.length === 0) problemas.push(`${codigo} no dejó salidas de inventario.`);
if (yaDevuelto) problemas.push(`${codigo} ya tiene una entrada de devolución: no se devuelve dos veces.`);
const creacion = eventos.find((e) => e.entidad_tipo === 'ventas' && Number(e.entidad_id) === ventaId && e.tipo_evento === 'CREACION');

/**
 * Lo que las ventas que siguen vivas sacaron de un lote. Lo que el lote dice
 * que se vendió y ellas no explican es lo que se llevó la venta borrada.
 */
function explicadoPorVentas(loteId: string): { cantidad: number; costo: number; ingreso: number } {
  const r = { cantidad: 0, costo: 0, ingreso: 0 };
  for (const { datos: v } of ventas.values()) {
    if (v.estado === 'CANCELADA') continue;
    for (const l of v.lineas ?? []) {
      for (const c of l.lotes_consumidos ?? []) {
        if (c.lote_id !== loteId) continue;
        r.cantidad += c.cantidad;
        r.costo += c.costo_usd_cents;
        r.ingreso += c.ingreso_usd_cents ?? 0;
      }
    }
  }
  return r;
}

// 2. Cada salida: de qué lote, a qué costo y por cuánto. Y la devolución.
const escrituras: Record<string, unknown>[] = [];
const lineas: Record<string, unknown>[] = [];
const ahora = new Date().toISOString();

salidas.forEach((mov, i) => {
  const entrada = productos.get(String(mov.producto_id));
  if (!entrada) {
    problemas.push(`El producto #${mov.producto_id} no existe.`);
    return;
  }
  const p = entrada.datos;
  const { lotes, cambiado } = normalizarLotes(
    { variantes: p.variantes, valor_inventario_usd_cents: p.valor_inventario_usd_cents, costo_unitario_usd_cents: p.costo_unitario_usd_cents, lotes: p.lotes, paquete_id: p.paquete_id },
    undefined
  );
  if (cambiado) problemas.push(`Los lotes de '${p.nombre}' no cuadran con sus existencias: no se toca.`);

  // El lote del que salió: el que tiene vendido algo que las ventas vivas no explican.
  const candidatos = lotes
    .filter((l) => l.variante_id === (mov.variante_id ?? l.variante_id))
    .map((l) => {
      const ex = explicadoPorVentas(l.id);
      return { l, cantidad: l.vendidas - ex.cantidad, costo: l.costo_vendido_usd_cents - ex.costo, ingreso: l.ingreso_usd_cents - ex.ingreso };
    })
    .filter((x) => x.cantidad > 0);
  if (candidatos.length !== 1) {
    problemas.push(`'${p.nombre}': ${candidatos.length} lotes con ventas sin explicar; se esperaba uno.`);
    return;
  }
  const { l: lote, cantidad, costo, ingreso } = candidatos[0];
  if (cantidad !== mov.cantidad || costo !== mov.costo_total_usd_cents) {
    problemas.push(
      `'${p.nombre}': el lote ${lote.id} dice ${cantidad} u. a ${costo} ¢ y el movimiento ${mov.cantidad} u. a ${mov.costo_total_usd_cents} ¢.`
    );
    return;
  }

  const consumo: Consumo = {
    lote_id: lote.id,
    variante_id: lote.variante_id,
    cantidad,
    costo_usd_cents: costo,
    costo_unitario_usd_cents: lote.costo_unitario_usd_cents,
    ingreso_usd_cents: ingreso,
    fecha: lote.fecha,
    orden: lote.orden,
    origen: lote.origen,
    compra_id: lote.compra_id,
    compra_codigo: lote.compra_codigo,
    compra_linea_id: lote.compra_linea_id,
  };

  const nuevos = devolverConsumos(lotes, [consumo], 'VENTA');
  const campos = camposDesdeLotes(p.variantes, nuevos, p.costo_unitario_usd_cents);
  const antes = valorDeLotes(lotes);
  if (campos.valor_inventario_usd_cents !== antes + costo) {
    problemas.push(`'${p.nombre}': la bodega se movería ${campos.valor_inventario_usd_cents - antes} ¢ y se esperaban ${costo}.`);
  }
  const existencias = unidadesDeLotes(nuevos);
  console.log(
    `> ${p.nombre}: vuelve ${cantidad} u. al lote ${lote.id} (costo ${costo} ¢, se había vendido por ${ingreso} ¢); existencias ${unidadesDeLotes(lotes)} → ${existencias}, bodega ${antes} → ${campos.valor_inventario_usd_cents} ¢`
  );

  escrituras.push({
    update: {
      name: entrada.crudo.name,
      fields: escribirCampos({
        variantes: campos.variantes,
        lotes: nuevos,
        valor_inventario_usd_cents: campos.valor_inventario_usd_cents,
        costo_unitario_usd_cents: campos.costo_unitario_usd_cents,
        actualizado_en: ahora,
      }),
    },
    updateMask: { fieldPaths: ['variantes', 'lotes', 'valor_inventario_usd_cents', 'costo_unitario_usd_cents', 'actualizado_en'] },
    currentDocument: { updateTime: entrada.crudo.updateTime },
  });

  const idMov = idOrdenable();
  escrituras.push({
    update: {
      name: `${BASE}/movimientos_inventario/${idMov}`,
      fields: escribirCampos({
        id: idMov,
        producto_id: mov.producto_id,
        variante_id: lote.variante_id,
        tipo: 'ENTRADA',
        cantidad,
        costo_total_usd_cents: costo,
        existencias_despues: existencias,
        referencia_tipo: 'VENTA',
        referencia_id: ventaId,
        detalle: `Devolución por cancelación de ${codigo} (se había borrado a mano)`,
        fecha: ahora,
      }),
    },
    currentDocument: { exists: false },
  });

  lineas.push({
    id: i + 1,
    venta_id: ventaId,
    producto_id: mov.producto_id,
    variante_id: lote.variante_id,
    descripcion: p.nombre,
    cantidad,
    // Sin descuento a la vista: lo que se cobró por la unidad es su precio.
    precio_unitario_usd_cents: Math.round(ingreso / cantidad),
    costo_unitario_usd_cents: Math.round(costo / cantidad),
    subtotal_usd_cents: ingreso,
    costo_total_usd_cents: costo,
    es_paquete: false,
    orden: i,
    lotes_consumidos: [consumo],
  });
});

// 3. Sus pagos: se anulan.
const pagosDeLaVenta = [...pagos.values()].filter((x) => Number(x.datos.venta_id) === ventaId && x.datos.activo);
for (const { crudo, datos } of pagosDeLaVenta) {
  console.log(`> pago #${datos.id}: ${datos.monto_usd_cents} ¢ (${datos.moneda} ${datos.monto_cor_cents}) se anula`);
  escrituras.push({
    update: { name: crudo.name, fields: escribirCampos({ activo: false, actualizado_en: ahora }) },
    updateMask: { fieldPaths: ['activo', 'actualizado_en'] },
    currentDocument: { updateTime: crudo.updateTime },
  });
}

// 4. La venta, reconstruida y anulada.
const total = lineas.reduce((s, l) => s + (l.subtotal_usd_cents as number), 0);
const costoTotal = lineas.reduce((s, l) => s + (l.costo_total_usd_cents as number), 0);
// La fecha del negocio (Managua), no la de UTC.
const fecha = hoyISO(new Date(salidas[0]?.fecha ?? ahora));
const venta = {
  id: ventaId,
  codigo,
  fecha,
  tipo: 'INVENTARIO',
  estado: 'CANCELADA',
  tasa_cambio_cents: 3662,
  subtotal_usd_cents: total,
  descuento_usd_cents: 0,
  total_usd_cents: total,
  costo_total_usd_cents: costoTotal,
  ganancia_usd_cents: total - costoTotal,
  pagado_usd_cents: 0,
  saldo_usd_cents: total,
  anticipo_esperado_usd_cents: 0,
  notas: `Reconstruida el ${hoyISO()}: se había borrado a mano en Firebase. Se anuló para devolver sus unidades a la bodega.`,
  lineas,
  cuotas: [],
  activo: true,
  creado_en: creacion?.timestamp ?? salidas[0]?.fecha ?? ahora,
  actualizado_en: ahora,
};
console.log(`> ${codigo}: se reconstruye anulada, ${lineas.length} líneas, total ${total} ¢, costo ${costoTotal} ¢`);
escrituras.push({
  update: { name: `${BASE}/ventas/${ventaId}`, fields: escribirCampos(venta) },
  currentDocument: { exists: false },
});

// 5. El rastro, que no se puede deshacer: movió mercadería.
const idEvento = idOrdenable();
escrituras.push({
  update: {
    name: `${BASE}/eventos/${idEvento}`,
    fields: escribirCampos({
      id: idEvento,
      evento_grupo_id: randomUUID(),
      entidad_tipo: 'ventas',
      entidad_id: ventaId,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: null,
      valor_nuevo: null,
      detalle: `${codigo}: se había borrado a mano en Firebase; se reconstruyó anulada y sus unidades volvieron a la bodega`,
      reversible: false,
      timestamp: ahora,
    }),
  },
  currentDocument: { exists: false },
});

// ---------------------------------------------------------------------------

console.log(`\nescrituras: ${escrituras.length}`);
if (problemas.length > 0) {
  console.log('\nNo se escribe:');
  for (const x of problemas) console.log(`  - ${x}`);
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
