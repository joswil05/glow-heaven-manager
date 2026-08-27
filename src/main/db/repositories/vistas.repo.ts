import { getDb } from '../database';
import type {
  AlertaRow,
  CapitalLibreData,
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
}
