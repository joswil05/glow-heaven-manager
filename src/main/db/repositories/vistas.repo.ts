import { getDb } from '../database';
import type {
  AlertaRow,
  CapitalLibreData,
  ItemListaCompraRow,
} from '../../../shared/types';
import type { HoyViewData } from '../../../shared/ipc-contracts';
import { ParametrosRepo } from './parametros.repo';

export class VistasRepo {
  static getHoyData(): HoyViewData {
    const db = getDb();

    // 1. Alertas que requieren decisión
    const alertas = VistasRepo.getAlertas();

    // 2. Datos de capital
    const capital = VistasRepo.getCapitalLibre();

    // 3. Entregas de hoy (en Fase 1 = 0)
    let entregas_hoy_count = 0;
    try {
      const rutaRow = db
        .prepare('SELECT COUNT(parada_id) AS count FROM v_ruta_hoy')
        .get() as any;
      entregas_hoy_count = rutaRow?.count || 0;
    } catch {
      entregas_hoy_count = 0;
    }

    // 4. Esperando a otros (en Fase 1 = 0)
    let esperando_otros_count = 0;
    try {
      const espRow = db
        .prepare(`
          SELECT COUNT(id) AS count FROM pedido_items 
          WHERE activo = 1 AND estado IN ('EN_TRANSITO', 'EN_NICARAGUA')
        `)
        .get() as any;
      esperando_otros_count = espRow?.count || 0;
    } catch {
      esperando_otros_count = 0;
    }

    return {
      alertas_decision: alertas,
      total_anticipos_recibidos_cor_cents: capital.total_anticipos_recibidos_cor_cents,
      total_saldos_por_cobrar_cor_cents: capital.total_por_cobrar_cor_cents,
      entregas_hoy_count,
      esperando_otros_count,
    };
  }

  static getAlertas(): AlertaRow[] {
    const db = getDb();
    try {
      const rows = db.prepare('SELECT * FROM v_alertas LIMIT 20').all() as any[];
      return rows.map((r) => ({
        tipo_alerta: r.tipo_alerta,
        severidad: r.severidad,
        entidad_id: r.entidad_id,
        entidad_tipo: r.entidad_tipo,
        pedido_id: r.pedido_id,
        cliente_nombre: r.cliente_nombre,
        cliente_telefono: r.cliente_telefono,
        mensaje: r.mensaje,
        detalle_estado: r.detalle_estado,
      }));
    } catch {
      return [];
    }
  }

  static getCapitalLibre(): CapitalLibreData {
    const db = getDb();
    const params = ParametrosRepo.getParametros();

    try {
      const row = db.prepare('SELECT * FROM v_capital_libre').get() as any;
      return {
        total_anticipos_recibidos_cor_cents: row?.total_anticipos_recibidos_cor_cents || 0,
        total_saldos_cobrados_cor_cents: row?.total_saldos_cobrados_cor_cents || 0,
        total_por_cobrar_cor_cents: row?.total_por_cobrar_cor_cents || 0,
        saldo_inicial_bancos_cor_cents: params.saldo_inicial_bancos_cor_cents,
      };
    } catch {
      return {
        total_anticipos_recibidos_cor_cents: 0,
        total_saldos_cobrados_cor_cents: 0,
        total_por_cobrar_cor_cents: 0,
        saldo_inicial_bancos_cor_cents: params.saldo_inicial_bancos_cor_cents,
      };
    }
  }

  static getSemaforoCompras(): any[] {
    const db = getDb();
    try {
      return db.prepare('SELECT * FROM v_semaforo_compras').all();
    } catch {
      return [];
    }
  }

  static getListaComprasUsa(): ItemListaCompraRow[] {
    const db = getDb();
    return db.prepare('SELECT * FROM v_lista_compras_usa').all() as ItemListaCompraRow[];
  }

  static getPendientesDeLista(): ItemListaCompraRow[] {
    const db = getDb();
    return db
      .prepare(`
        SELECT
          pi.id AS item_id, ped.id AS pedido_id, ped.codigo AS pedido_codigo,
          c.nombre AS cliente_nombre, t.nombre AS tienda_nombre,
          cat.nombre AS categoria_nombre, pi.descripcion, pi.url,
          pi.precio_usa_usd_cents, pi.tax_usa_usd_cents, pi.peso_mlb,
          pi.prioridad, pi.notas_tolerancia, pi.estado AS item_estado
        FROM pedido_items pi
        JOIN pedidos ped ON pi.pedido_id = ped.id
        JOIN clientes c ON ped.cliente_id = c.id
        LEFT JOIN tiendas t ON pi.tienda_id = t.id
        LEFT JOIN categorias cat ON pi.categoria_id = cat.id
        WHERE pi.activo = 1
          AND ped.activo = 1
          AND ped.anticipo_verificado = 1
          AND pi.estado = 'ANTICIPO_OK'
        ORDER BY ped.fecha ASC, pi.id ASC
      `)
      .all() as ItemListaCompraRow[];
  }
}
