import { getDb } from '../database';
import type { EventoAuditoria } from '../../../shared/types';

export class EventosRepo {
  static registrarEvento(evento: {
    evento_grupo_id: string;
    entidad_tipo: string;
    entidad_id: number;
    tipo_evento: string;
    estado_anterior?: string;
    estado_nuevo?: string;
    valor_anterior?: any;
    valor_nuevo?: any;
    detalle?: string;
  }): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO eventos (
        evento_grupo_id, entidad_tipo, entidad_id, tipo_evento,
        estado_anterior, estado_nuevo, valor_anterior, valor_nuevo, detalle
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evento.evento_grupo_id,
      evento.entidad_tipo,
      evento.entidad_id,
      evento.tipo_evento,
      evento.estado_anterior || null,
      evento.estado_nuevo || null,
      evento.valor_anterior ? JSON.stringify(evento.valor_anterior) : null,
      evento.valor_nuevo ? JSON.stringify(evento.valor_nuevo) : null,
      evento.detalle || null
    );
  }

  static deshacerUltimoGrupo(): { revertido: boolean; descripcion: string } {
    const db = getDb();

    // Obtener el último evento_grupo_id
    const ultimoGrupo = db
      .prepare('SELECT evento_grupo_id, tipo_evento, detalle FROM eventos ORDER BY id DESC LIMIT 1')
      .get() as { evento_grupo_id: string; tipo_evento: string; detalle: string } | undefined;

    if (!ultimoGrupo || !ultimoGrupo.evento_grupo_id) {
      return { revertido: false, descripcion: 'No hay acciones recientes para deshacer.' };
    }

    const grupoId = ultimoGrupo.evento_grupo_id;
    const eventos = db
      .prepare('SELECT * FROM eventos WHERE evento_grupo_id = ? ORDER BY id DESC')
      .all(grupoId) as EventoAuditoria[];

    let revertido = false;

    db.transaction(() => {
      for (const ev of eventos) {
        if (ev.valor_anterior) {
          const anterior = JSON.parse(ev.valor_anterior);

          if (ev.entidad_tipo === 'PEDIDO_ITEM') {
            if (anterior.estado) {
              db.prepare('UPDATE pedido_items SET estado = ? WHERE id = ?').run(
                anterior.estado,
                ev.entidad_id
              );
            }
          } else if (ev.entidad_tipo === 'COTIZACION') {
            if (anterior.estado) {
              db.prepare('UPDATE cotizaciones SET estado = ? WHERE id = ?').run(
                anterior.estado,
                ev.entidad_id
              );
            }
          } else if (ev.entidad_tipo === 'PEDIDO') {
            if (ev.tipo_evento === 'CREACION') {
              // Si se revierte la conversión de cotización a pedido
              db.prepare('UPDATE pedidos SET activo = 0 WHERE id = ?').run(ev.entidad_id);
              db.prepare('UPDATE pedido_items SET activo = 0 WHERE pedido_id = ?').run(ev.entidad_id);
            } else if (anterior.anticipo_verificado !== undefined) {
              db.prepare(
                'UPDATE pedidos SET anticipo_verificado = ?, estado_derivado = ? WHERE id = ?'
              ).run(anterior.anticipo_verificado ? 1 : 0, anterior.estado_derivado, ev.entidad_id);
            }
          } else if (ev.entidad_tipo === 'PAGO') {
            if (ev.tipo_evento === 'CREACION') {
              db.prepare('UPDATE pagos SET activo = 0 WHERE id = ?').run(ev.entidad_id);
            } else if (anterior.verificado !== undefined) {
              db.prepare('UPDATE pagos SET verificado = ? WHERE id = ?').run(
                anterior.verificado ? 1 : 0,
                ev.entidad_id
              );
            }
          }
        }
      }

      // Eliminar el grupo de eventos revertido para no volverlo a deshacer
      db.prepare('DELETE FROM eventos WHERE evento_grupo_id = ?').run(grupoId);
      revertido = true;
    })();

    return {
      revertido,
      descripcion: ultimoGrupo.detalle || `Acción '${ultimoGrupo.tipo_evento}' deshecha con éxito.`,
    };
  }
}
