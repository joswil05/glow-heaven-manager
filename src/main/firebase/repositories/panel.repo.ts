import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { getFirestoreDb } from '../client';
import { ProductosRepoFirestore } from './productos.repo';
import { type VentaDoc } from './ventas.repo';
import { ClientesRepoFirestore } from './clientes.repo';
import { formatearMoneda } from '../../../core/moneda';
import { hoyISO, mesISO, haceDias } from '../../../core/fechas';
import { ResumenesRepoFirestore } from './resumenes.repo';
import type {
  PanelData,
  ResumenFinanciero,
  GananciaMes,
  FilaPorCobrar,
  FilaBajoStock,
  FilaRotacion,
  Alerta,
  Compra,
  ProductoConStock,
  ClienteDetalle,
} from '../../../shared/types';

/**
 * Datos del panel.
 *
 * Todo se calcula sobre UNA lectura de cada colección. La versión anterior
 * pedía los productos cinco veces y las ventas seis para armar la misma
 * pantalla, y Firestore cobra por documento leído: con doce productos y doce
 * ventas eran 179 lecturas por cada vez que se abría el panel, y el panel se
 * recarga después de cada guardado.
 */
interface Instantanea {
  productos: ProductoConStock[];
  /** Union de los tres conjuntos, sin repetidos. Para los calculos generales. */
  ventas: VentaDoc[];
  /** Solo los ultimos 90 dias, en orden. Para rotacion y tendencia. */
  ventasRecientes: VentaDoc[];
  clientes: ClienteDetalle[];
  comprasEnCamino: Compra[];
}

function mesActual(): string {
  return mesISO();
}

/** El mes anterior al del calendario del negocio, sin pasar por `Date`. */
function mesAnterior(mesBase = mesISO()): string {
  const [anio, mes] = mesBase.split('-').map(Number);
  return mes === 1
    ? `${anio - 1}-12`
    : `${anio}-${String(mes - 1).padStart(2, '0')}`;
}

function mesVacio(mes: string): GananciaMes {
  return {
    mes,
    ventas_count: 0,
    ingresos_usd_cents: 0,
    costos_usd_cents: 0,
    ganancia_usd_cents: 0,
  };
}

function dinero(cents: number): string {
  return formatearMoneda(cents, 'USD');
}

let instantaneaCache: { data: Instantanea; timestamp: number } | null = null;
const PANEL_CACHE_TTL_MS = 20_000; // 20 segundos de caché en memoria

export function invalidarPanelCache(): void {
  instantaneaCache = null;
}

async function tomarInstantanea(forzarRefresco = false): Promise<Instantanea> {
  const ahora = Date.now();
  if (!forzarRefresco && instantaneaCache && ahora - instantaneaCache.timestamp < PANEL_CACHE_TTL_MS) {
    return instantaneaCache.data;
  }

  const db = getFirestoreDb();

  // Tres consultas acotadas en lugar de "traeme todas las ventas".
  //
  // Antes esto leía la colección entera para calcular el panel, y el costo
  // crecía con la antigüedad del negocio: medido, 200 ventas eran 401
  // lecturas por apertura, y sube para siempre. La mayor parte de eso son
  // ventas cerradas hace meses que ningún número del panel necesita.
  //
  // Lo que el panel SÍ necesita son tres conjuntos, y los tres están acotados
  // por su propia naturaleza, no por la edad del negocio:
  //
  //   · recientes  — los últimos 90 días. De acá salen la ganancia del mes,
  //                  la rotación y lo más vendido.
  //   · conSaldo   — lo que se debe HOY. Crece con la morosidad, no con el
  //                  tiempo: una venta cobrada sale del conjunto.
  //   · encargos   — los que están vivos. Se vacía a medida que se entregan.
  //
  // El histórico de meses anteriores ya no sale de acá: lo arma
  // `ResumenesRepoFirestore` con resúmenes por mes.
  const desde90d = haceDias(90);

  const [productos, recientesSnap, conSaldoSnap, encargosSnap, clientes, comprasSnap] =
    await Promise.all([
      ProductosRepoFirestore.listar(),
      getDocs(
        query(
          collection(db, 'ventas'),
          where('activo', '==', true),
          where('fecha', '>=', desde90d),
          orderBy('fecha', 'desc')
        )
      ),
      getDocs(
        query(
          collection(db, 'ventas'),
          where('activo', '==', true),
          where('saldo_usd_cents', '>', 0)
        )
      ),
      getDocs(
        query(collection(db, 'ventas'), where('activo', '==', true), where('tipo', '==', 'ENCARGO'))
      ),
      ClientesRepoFirestore.listar(),
      getDocs(
        query(
          collection(db, 'compras'),
          where('activo', '==', true),
          where('estado', '==', 'EN_CAMINO')
        )
      ),
    ]);

  const leer = (snap: { docs: { data: () => unknown }[] }) =>
    snap.docs.map((d) => d.data() as VentaDoc).filter((v) => v.activo !== false);

  const recientes = leer(recientesSnap);

  // Los tres conjuntos se solapan (una venta reciente puede tener saldo y ser
  // encargo). Se unen por id para que ningún cálculo la cuente dos veces.
  const porId = new Map<number, VentaDoc>();
  for (const v of [...recientes, ...leer(conSaldoSnap), ...leer(encargosSnap)]) {
    porId.set(v.id, v);
  }

  const datos: Instantanea = {
    productos: productos.filter((p) => p.activo !== false),
    ventas: [...porId.values()],
    ventasRecientes: recientes,
    clientes: clientes.filter((c) => c.activo !== false),
    comprasEnCamino: comprasSnap.docs
      .map((d) => d.data() as Compra)
      .filter((c) => c.activo !== false),
  };

  instantaneaCache = { data: datos, timestamp: ahora };
  return datos;
}

// ---------------------------------------------------------------------------
// Cálculos puros sobre la instantánea
// ---------------------------------------------------------------------------

function calcularResumen(s: Instantanea): ResumenFinanciero {
  let por_cobrar_usd_cents = 0;
  let anticipos_por_entregar_usd_cents = 0;

  for (const v of s.ventas) {
    if (v.estado !== 'CANCELADA' && (v.saldo_usd_cents || 0) > 0) {
      por_cobrar_usd_cents += v.saldo_usd_cents || 0;
    }
    if (v.tipo === 'ENCARGO' && (v.estado === 'COTIZADA' || v.estado === 'PENDIENTE')) {
      anticipos_por_entregar_usd_cents += v.pagado_usd_cents || 0;
    }
  }

  return {
    inversion_inventario_usd_cents: s.productos.reduce((sum, p) => {
      const val =
        p.valor_inventario_usd_cents && p.valor_inventario_usd_cents > 0
          ? p.valor_inventario_usd_cents
          : (p.existencias || 0) * (p.costo_unitario_usd_cents || 0);
      return sum + (val || 0);
    }, 0),
    inversion_en_camino_usd_cents: s.comprasEnCamino.reduce(
      (sum, c) => sum + (c.total_usd_cents || 0),
      0
    ),
    por_cobrar_usd_cents,
    anticipos_por_entregar_usd_cents,
    unidades_en_inventario: s.productos.reduce((sum, p) => sum + (p.existencias || 0), 0),
    productos_activos: s.productos.length,
  };
}

/**
 * La serie mensual sale de `ResumenesRepoFirestore`: los meses que caen dentro
 * de los últimos noventa días se calculan con lo que la instantánea ya trajo,
 * y los anteriores vienen de su resumen guardado. Ninguno cuesta releer la
 * historia del negocio.
 */
async function calcularHistorico(s: Instantanea, meses: number): Promise<GananciaMes[]> {
  return ResumenesRepoFirestore.historico(meses, s.ventasRecientes);
}

function calcularPorCobrar(s: Instantanea, limite: number): FilaPorCobrar[] {
  const cliMap = new Map(s.clientes.map((c) => [c.id, c]));
  const hoy = hoyISO();
  const lista: FilaPorCobrar[] = [];

  for (const v of s.ventas) {
    if (v.estado === 'CANCELADA' || (v.saldo_usd_cents || 0) <= 0) continue;

    const c = v.cliente_id ? cliMap.get(v.cliente_id) : undefined;
    const pendientes = (v.cuotas || [])
      .filter((q) => (q.pagado_usd_cents || 0) < q.monto_usd_cents)
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento));

    lista.push({
      venta_id: v.id,
      codigo: v.codigo,
      fecha: v.fecha,
      tipo: v.tipo,
      estado: v.estado,
      cliente_id: v.cliente_id,
      cliente_nombre: c?.nombre ?? 'Mostrador',
      cliente_telefono: c?.telefono,
      total_usd_cents: v.total_usd_cents,
      pagado_usd_cents: v.pagado_usd_cents,
      saldo_usd_cents: v.saldo_usd_cents,
      proxima_cuota: pendientes[0]?.fecha_vencimiento,
      cuotas_vencidas: pendientes.filter((q) => q.fecha_vencimiento < hoy).length,
    });
  }

  return lista
    .sort((a, b) => {
      const diff = b.cuotas_vencidas - a.cuotas_vencidas;
      return diff !== 0 ? diff : (a.fecha || '').localeCompare(b.fecha || '');
    })
    .slice(0, limite);
}

function calcularBajoStock(s: Instantanea, limite: number): FilaBajoStock[] {
  return s.productos
    .filter((p) => p.stock_minimo > 0 && p.existencias <= p.stock_minimo)
    .map((p) => ({
      producto_id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      stock_minimo: p.stock_minimo,
      costo_unitario_usd_cents: p.costo_unitario_usd_cents,
      precio_venta_usd_cents: p.precio_venta_usd_cents,
      existencias: p.existencias,
    }))
    .sort((a, b) => a.existencias - b.existencias)
    .slice(0, limite);
}

function calcularRotacion(s: Instantanea): FilaRotacion[] {
  const desde = haceDias(90);

  const stats = new Map<number, { unidades: number; ganancia: number }>();

  for (const v of s.ventas) {
    if (v.estado !== 'ENTREGADA' || v.fecha < desde) continue;
    for (const l of v.lineas || []) {
      if (!l.producto_id) continue;
      const act = stats.get(l.producto_id) ?? { unidades: 0, ganancia: 0 };
      act.unidades += l.cantidad || 0;
      act.ganancia += (l.subtotal_usd_cents || 0) - (l.costo_total_usd_cents || 0);
      stats.set(l.producto_id, act);
    }
  }

  return s.productos.map((p) => {
    const st = stats.get(p.id) ?? { unidades: 0, ganancia: 0 };
    return {
      producto_id: p.id,
      nombre: p.nombre,
      unidades_vendidas_90d: st.unidades,
      ganancia_90d_usd_cents: st.ganancia,
      existencias: p.existencias,
    };
  });
}

function calcularAlertas(s: Instantanea): Alerta[] {
  const alertas: Alerta[] = [];
  const hoy = hoyISO();
  const cliMap = new Map(s.clientes.map((c) => [c.id, c.nombre]));

  // 1. Cuotas vencidas
  for (const v of s.ventas) {
    if (v.estado === 'CANCELADA') continue;
    const vencidas = (v.cuotas || []).filter(
      (q) => (q.pagado_usd_cents || 0) < q.monto_usd_cents && q.fecha_vencimiento < hoy
    );
    if (vencidas.length === 0) continue;

    const monto = vencidas.reduce(
      (sum, q) => sum + (q.monto_usd_cents - (q.pagado_usd_cents || 0)),
      0
    );
    const nombre = v.cliente_id ? (cliMap.get(v.cliente_id) ?? 'Mostrador') : 'Mostrador';

    alertas.push({
      id: `cuota-${v.id}`,
      severidad: 'urgente',
      titulo: `${nombre} tiene ${vencidas.length} cuota${vencidas.length > 1 ? 's' : ''} vencida${vencidas.length > 1 ? 's' : ''}`,
      detalle: `${dinero(monto)} atrasados en ${v.codigo}`,
      destino: { vista: 'ventas', id: v.id },
    });
  }

  // 2. Encargos con anticipo cobrado que llevan más de una semana
  const limite7d = haceDias(7);

  for (const v of s.ventas) {
    if (v.tipo !== 'ENCARGO' || v.estado !== 'PENDIENTE' || v.fecha > limite7d) continue;
    const nombre = v.cliente_id ? (cliMap.get(v.cliente_id) ?? 'Cliente') : 'Cliente';
    alertas.push({
      id: `encargo-${v.id}`,
      severidad: 'atencion',
      titulo: `El encargo de ${nombre} lleva más de una semana`,
      detalle: `${v.codigo}, anticipo cobrado desde el ${v.fecha}`,
      destino: { vista: 'ventas', id: v.id },
    });
  }

  // 3. Productos agotados
  const agotados = s.productos.filter((p) => p.stock_minimo > 0 && p.existencias === 0);
  if (agotados.length > 0) {
    alertas.push({
      id: 'agotados',
      severidad: 'atencion',
      titulo: `${agotados.length} producto${agotados.length > 1 ? 's' : ''} agotado${agotados.length > 1 ? 's' : ''}`,
      detalle:
        agotados.slice(0, 3).map((a) => a.nombre).join(', ') +
        (agotados.length > 3 ? ` y ${agotados.length - 3} más` : ''),
      destino: { vista: 'inventario' },
    });
  }

  // 4. Productos por acabarse
  const porAcabarse = s.productos.filter(
    (p) => p.stock_minimo > 0 && p.existencias > 0 && p.existencias <= p.stock_minimo
  );
  if (porAcabarse.length > 0) {
    alertas.push({
      id: 'bajo-stock',
      severidad: 'info',
      titulo: `${porAcabarse.length} producto${porAcabarse.length > 1 ? 's están' : ' está'} por acabarse`,
      detalle: 'Llegaron al mínimo que configuraste.',
      destino: { vista: 'inventario' },
    });
  }

  // 5. Paquetes en camino
  if (s.comprasEnCamino.length > 0) {
    const total = s.comprasEnCamino.reduce((sum, c) => sum + (c.total_usd_cents || 0), 0);
    alertas.push({
      id: 'en-camino',
      severidad: 'info',
      titulo: `${s.comprasEnCamino.length} paquete${s.comprasEnCamino.length > 1 ? 's' : ''} en camino`,
      detalle: `${dinero(total)} invertidos esperando llegar.`,
      destino: { vista: 'paquetes' },
    });
  }

  // 6. Productos vendiéndose bajo costo
  const bajoCosto = s.productos.filter(
    (p) =>
      (p.costo_unitario_usd_cents || 0) > 0 &&
      p.precio_venta_usd_cents < (p.costo_unitario_usd_cents || 0)
  );
  if (bajoCosto.length > 0) {
    alertas.push({
      id: 'bajo-costo',
      severidad: 'urgente',
      titulo: `${bajoCosto.length} producto${bajoCosto.length > 1 ? 's se venden' : ' se vende'} por debajo del costo`,
      detalle: 'El precio quedó abajo de lo que te costó. Revisalo antes de vender.',
      destino: { vista: 'inventario' },
    });
  }

  const orden = { urgente: 0, atencion: 1, info: 2 };
  return alertas.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}

// ---------------------------------------------------------------------------

export class PanelRepoFirestore {
  static invalidarCache(): void {
    invalidarPanelCache();
  }

  /** Carga completa del panel con una sola pasada por cada colección. */
  static async cargar(forzarRefresco = false): Promise<PanelData> {
    const s = await tomarInstantanea(forzarRefresco);
    const historico = await calcularHistorico(s, 6);
    const rotacion = calcularRotacion(s);

    const buscarMes = (mes: string): GananciaMes =>
      historico.find((h) => h.mes === mes) ?? mesVacio(mes);

    return {
      resumen: calcularResumen(s),
      ganancia_mes_actual: buscarMes(mesActual()),
      ganancia_mes_anterior: buscarMes(mesAnterior()),
      historico,
      por_cobrar: calcularPorCobrar(s, 10),
      bajo_stock: calcularBajoStock(s, 10),
      mas_vendidos: rotacion
        .filter((r) => r.unidades_vendidas_90d > 0)
        .sort((a, b) => b.unidades_vendidas_90d - a.unidades_vendidas_90d)
        .slice(0, 5),
      sin_rotacion: rotacion
        .filter((r) => r.unidades_vendidas_90d === 0 && r.existencias > 0)
        .sort((a, b) => b.existencias - a.existencias)
        .slice(0, 5),
      alertas: calcularAlertas(s),
    };
  }

  // Los métodos sueltos existen para consultas puntuales. Quien necesite
  // varios a la vez debe usar `cargar()`, que comparte la instantánea.

  /**
   * Las ventas activas de la instantánea, sin volver a leerlas.
   *
   * El panel ya trae la colección entera para calcular sus tarjetas. Quien
   * necesite las mismas ventas para otra cosa (la tendencia diaria del panel
   * móvil, por ejemplo) tiene que pedirlas por acá: consultarlas de nuevo
   * cuesta una lectura por venta, y esa cuenta crece con el negocio.
   */
  static async ventasActivas(): Promise<VentaDoc[]> {
    return (await tomarInstantanea()).ventas;
  }

  static async resumen(): Promise<ResumenFinanciero> {
    return calcularResumen(await tomarInstantanea());
  }

  static async historico(meses = 6): Promise<GananciaMes[]> {
    return calcularHistorico(await tomarInstantanea(), meses);
  }

  static async porCobrar(limite = 50): Promise<FilaPorCobrar[]> {
    return calcularPorCobrar(await tomarInstantanea(), limite);
  }

  static async bajoStock(limite = 20): Promise<FilaBajoStock[]> {
    return calcularBajoStock(await tomarInstantanea(), limite);
  }

  static async masVendidos(limite = 5): Promise<FilaRotacion[]> {
    return calcularRotacion(await tomarInstantanea())
      .filter((r) => r.unidades_vendidas_90d > 0)
      .sort((a, b) => b.unidades_vendidas_90d - a.unidades_vendidas_90d)
      .slice(0, limite);
  }

  static async sinRotacion(limite = 5): Promise<FilaRotacion[]> {
    return calcularRotacion(await tomarInstantanea())
      .filter((r) => r.unidades_vendidas_90d === 0 && r.existencias > 0)
      .sort((a, b) => b.existencias - a.existencias)
      .slice(0, limite);
  }

  static async alertas(): Promise<Alerta[]> {
    return calcularAlertas(await tomarInstantanea());
  }
}
