import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirestoreDb } from '../client';
import { ProductosRepoFirestore } from './productos.repo';
import { type VentaDoc } from './ventas.repo';
import { ClientesRepoFirestore } from './clientes.repo';
import { formatearMoneda } from '../../../core/moneda';
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
  ventas: VentaDoc[];
  clientes: ClienteDetalle[];
  comprasEnCamino: Compra[];
}

function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

function mesAnterior(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
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

async function tomarInstantanea(): Promise<Instantanea> {
  const db = getFirestoreDb();

  const [productos, ventasSnap, clientes, comprasSnap] = await Promise.all([
    ProductosRepoFirestore.listar(),
    getDocs(query(collection(db, 'ventas'), where('activo', '==', true))),
    ClientesRepoFirestore.listar(),
    getDocs(
      query(
        collection(db, 'compras'),
        where('activo', '==', true),
        where('estado', '==', 'EN_CAMINO')
      )
    ),
  ]);

  return {
    productos: productos.filter((p) => p.activo !== false),
    ventas: ventasSnap.docs.map((d) => d.data() as VentaDoc).filter((v) => v.activo !== false),
    clientes: clientes.filter((c) => c.activo !== false),
    comprasEnCamino: comprasSnap.docs
      .map((d) => d.data() as Compra)
      .filter((c) => c.activo !== false),
  };
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
    inversion_inventario_usd_cents: s.productos.reduce(
      (sum, p) => sum + (p.valor_inventario_usd_cents || 0),
      0
    ),
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

function calcularHistorico(s: Instantanea, meses: number): GananciaMes[] {
  const porMes = new Map<string, GananciaMes>();

  for (const v of s.ventas) {
    if (v.estado !== 'ENTREGADA') continue;
    const mes = (v.fecha || '').slice(0, 7);
    if (!mes) continue;

    const act = porMes.get(mes) ?? mesVacio(mes);
    act.ventas_count += 1;
    act.ingresos_usd_cents += v.total_usd_cents || 0;
    act.costos_usd_cents += v.costo_total_usd_cents || 0;
    act.ganancia_usd_cents += v.ganancia_usd_cents || 0;
    porMes.set(mes, act);
  }

  const serie: GananciaMes[] = [];
  const cursor = new Date();
  cursor.setDate(1);

  for (let i = 0; i < meses; i++) {
    const clave = cursor.toISOString().slice(0, 7);
    serie.unshift(porMes.get(clave) ?? mesVacio(clave));
    cursor.setMonth(cursor.getMonth() - 1);
  }

  return serie;
}

function calcularPorCobrar(s: Instantanea, limite: number): FilaPorCobrar[] {
  const cliMap = new Map(s.clientes.map((c) => [c.id, c]));
  const hoy = new Date().toISOString().slice(0, 10);
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
  const hace90d = new Date();
  hace90d.setDate(hace90d.getDate() - 90);
  const desde = hace90d.toISOString().slice(0, 10);

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
  const hoy = new Date().toISOString().slice(0, 10);
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
  const hace7d = new Date();
  hace7d.setDate(hace7d.getDate() - 7);
  const limite7d = hace7d.toISOString().slice(0, 10);

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
  /** Carga completa del panel con una sola pasada por cada colección. */
  static async cargar(): Promise<PanelData> {
    const s = await tomarInstantanea();
    const historico = calcularHistorico(s, 6);
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
