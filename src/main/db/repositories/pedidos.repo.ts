import { getDb } from '../database';
import type {
  Pedido,
  PedidoCompleto,
  PedidoItem,
  EstadoItem,
  ColorSemaforo,
} from '../../../shared/types';
import { ClientesRepo } from './clientes.repo';
import { PagosRepo } from './pagos.repo';
import { EventosRepo } from './eventos.repo';
import { derivarEstadoPedido, validarTransicionItem } from '../../../core/estados';

export class PedidosRepo {
  static list(estado_derivado?: string, requiere_atencion?: boolean): Pedido[] {
    const db = getDb();
    let sql = 'SELECT * FROM pedidos WHERE activo = 1';
    const params: any[] = [];

    if (estado_derivado) {
      sql += ' AND estado_derivado = ?';
      params.push(estado_derivado);
    }
    if (requiere_atencion !== undefined) {
      sql += ' AND requiere_atencion = ?';
      params.push(requiere_atencion ? 1 : 0);
    }

    sql += ' ORDER BY id DESC';
    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(PedidosRepo.mapRowToPedido);
  }

  static getById(id: number): PedidoCompleto | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id) as any;
    if (!row) return null;

    const cliente = ClientesRepo.getById(row.cliente_id);
    if (!cliente) return null;

    const itemsRows = db
      .prepare(`
        SELECT pi.*, t.nombre AS tienda_nombre, cat.nombre AS categoria_nombre
        FROM pedido_items pi
        LEFT JOIN tiendas t ON pi.tienda_id = t.id
        LEFT JOIN categorias cat ON pi.categoria_id = cat.id
        WHERE pi.pedido_id = ? AND pi.activo = 1
        ORDER BY pi.prioridad DESC, pi.id ASC
      `)
      .all(id) as any[];

    const items: PedidoItem[] = itemsRows.map((r) => ({
      id: r.id,
      pedido_id: r.pedido_id,
      cotizacion_item_id: r.cotizacion_item_id,
      lote_id: r.lote_id,
      tienda_id: r.tienda_id,
      categoria_id: r.categoria_id,
      descripcion: r.descripcion,
      url: r.url,
      precio_usa_usd_cents: r.precio_usa_usd_cents,
      tax_usa_usd_cents: r.tax_usa_usd_cents,
      peso_mlb: r.peso_mlb,
      estado: r.estado,
      costo_aterrizado_estimado_cents: r.costo_aterrizado_estimado_cents,
      costo_aterrizado_real_cents: r.costo_aterrizado_real_cents,
      margen_real_cents: r.margen_real_cents,
      prioridad: r.prioridad,
      notas_tolerancia: r.notas_tolerancia,
      sustituto_de_item_id: r.sustituto_de_item_id,
      activo: Boolean(r.activo),
      creado_en: r.creado_en,
      tienda_nombre: r.tienda_nombre,
      categoria_nombre: r.categoria_nombre,
    }));

    const pagos = PagosRepo.listByPedido(id);

    // Calcular color del semáforo
    let color_semaforo: ColorSemaforo = 'ROJO';
    if (row.anticipo_verificado === 1) {
      color_semaforo = 'VERDE';
    } else if (pagos.some((p) => p.tipo_pago === 'ANTICIPO')) {
      color_semaforo = 'AMARILLO';
    }

    return {
      ...PedidosRepo.mapRowToPedido(row),
      cliente,
      items,
      pagos,
      color_semaforo,
    };
  }

  static recalcularYPersistirEstadoPedido(pedido_id: number): void {
    const db = getDb();
    const items = db
      .prepare('SELECT id, estado, activo FROM pedido_items WHERE pedido_id = ? AND activo = 1')
      .all(pedido_id) as { id: number; estado: EstadoItem; activo: number }[];

    const resultado = derivarEstadoPedido(
      items.map((i) => ({ id: i.id, estado: i.estado, activo: Boolean(i.activo) }))
    );

    db.prepare(`
      UPDATE pedidos SET
        estado_derivado = ?,
        requiere_atencion = ?
      WHERE id = ?
    `).run(resultado.estado_derivado, resultado.requiere_atencion ? 1 : 0, pedido_id);
  }

  static cambiarEstadoItem(
    item_id: number,
    nuevo_estado: EstadoItem,
    evento_grupo_id: string,
    motivo?: string
  ): void {
    const db = getDb();
    db.transaction(() => {
      const item = db.prepare('SELECT * FROM pedido_items WHERE id = ?').get(item_id) as any;
      if (!item) throw new Error(`Ítem #${item_id} no encontrado`);

      const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(item.pedido_id) as any;
      if (!pedido) throw new Error(`Pedido #${item.pedido_id} no encontrado`);

      const validacion = validarTransicionItem({
        estado_actual: item.estado,
        nuevo_estado,
        anticipo_verificado: Boolean(pedido.anticipo_verificado),
        tiene_lote_asignado: Boolean(item.lote_id),
        saldo_pendiente_cor_cents: pedido.saldo_pendiente_cor_cents,
      });

      if (!validacion.permitido) {
        throw new Error(validacion.motivo_rechazo || 'Transición de estado rechazada');
      }

      db.prepare('UPDATE pedido_items SET estado = ? WHERE id = ?').run(nuevo_estado, item_id);

      // Persistir estado derivado del pedido de inmediato
      PedidosRepo.recalcularYPersistirEstadoPedido(pedido.id);

      EventosRepo.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'PEDIDO_ITEM',
        entidad_id: item_id,
        tipo_evento: 'CAMBIO_ESTADO',
        estado_anterior: item.estado,
        estado_nuevo: nuevo_estado,
        valor_anterior: { estado: item.estado },
        valor_nuevo: { estado: nuevo_estado },
        detalle: motivo || `Ítem '${item.descripcion}' pasó a ${nuevo_estado}`,
      });
    })();
  }

  private static mapRowToPedido(r: any): Pedido {
    return {
      id: r.id,
      codigo: r.codigo,
      cotizacion_id: r.cotizacion_id,
      cliente_id: r.cliente_id,
      fecha: r.fecha,
      tasa_cambio_cents: r.tasa_cambio_cents,
      estado_derivado: r.estado_derivado,
      requiere_atencion: Boolean(r.requiere_atencion),
      anticipo_verificado: Boolean(r.anticipo_verificado),
      total_usd_cents: r.total_usd_cents,
      total_cor_cents: r.total_cor_cents,
      anticipo_esperado_cor_cents: r.anticipo_esperado_cor_cents,
      saldo_pendiente_cor_cents: r.saldo_pendiente_cor_cents,
      saldo_pendiente_usd_cents: r.saldo_pendiente_usd_cents,
      notas: r.notas,
      activo: Boolean(r.activo),
      creado_en: r.creado_en,
    };
  }
}
