import { getDb } from '../database';
import type { EventoAuditoria } from '../../../shared/types';
import { PedidosRepo } from './pedidos.repo';

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

  static deshacerUltimoGrupo(
    grupoIdSolicitado?: string
  ): { revertido: boolean; descripcion: string } {
    const db = getDb();
    let grupoId = grupoIdSolicitado;

    if (!grupoId) {
      const ultimo = db
        .prepare('SELECT evento_grupo_id FROM eventos ORDER BY id DESC LIMIT 1')
        .get() as { evento_grupo_id: string } | undefined;
      if (!ultimo?.evento_grupo_id) {
        return { revertido: false, descripcion: 'No hay acciones recientes para deshacer.' };
      }
      grupoId = ultimo.evento_grupo_id;
    }

    const eventos = db
      .prepare('SELECT * FROM eventos WHERE evento_grupo_id = ? ORDER BY id DESC')
      .all(grupoId) as EventoAuditoria[];

    if (eventos.length === 0) {
      return { revertido: false, descripcion: 'Esa acción ya no se puede deshacer.' };
    }

    const ultimoGrupo = db
      .prepare(
        'SELECT evento_grupo_id, tipo_evento, detalle FROM eventos WHERE evento_grupo_id = ? ORDER BY id DESC LIMIT 1'
      )
      .get(grupoId) as { evento_grupo_id: string; tipo_evento: string; detalle: string } | undefined;

    let seRevirtioAlgo = false;

    db.transaction(() => {
      for (const ev of eventos) {
        const anterior = ev.valor_anterior ? JSON.parse(ev.valor_anterior) : null;

        if (ev.entidad_tipo === 'PEDIDO_ITEM') {
          if (anterior?.estado) {
            db.prepare('UPDATE pedido_items SET estado = ? WHERE id = ?').run(
              anterior.estado,
              ev.entidad_id
            );
            seRevirtioAlgo = true;
          }
        } else if (ev.entidad_tipo === 'COTIZACION') {
          if (anterior?.estado) {
            db.prepare('UPDATE cotizaciones SET estado = ? WHERE id = ?').run(
              anterior.estado,
              ev.entidad_id
            );
            seRevirtioAlgo = true;
          }
        } else if (ev.entidad_tipo === 'PEDIDO') {
          if (ev.tipo_evento === 'CREACION') {
            // Si se revierte la conversión de cotización a pedido
            db.prepare('UPDATE pedidos SET activo = 0 WHERE id = ?').run(ev.entidad_id);
            db.prepare('UPDATE pedido_items SET activo = 0 WHERE pedido_id = ?').run(ev.entidad_id);
            seRevirtioAlgo = true;
          } else if (anterior?.anticipo_verificado !== undefined) {
            db.prepare(
              'UPDATE pedidos SET anticipo_verificado = ?, estado_derivado = ? WHERE id = ?'
            ).run(anterior.anticipo_verificado ? 1 : 0, anterior.estado_derivado, ev.entidad_id);
            seRevirtioAlgo = true;
          }
        } else if (ev.entidad_tipo === 'PAGO') {
          const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(ev.entidad_id) as
            | {
                pedido_id: number;
                monto_cor_cents: number;
                monto_usd_cents: number;
                verificado: number;
                tipo_pago: string;
              }
            | undefined;

          if (pago) {
            // Si el pago estaba aplicado, hay que devolverle el saldo al
            // pedido. Antes solo se volteaba la bandera `verificado` y la
            // plata quedaba descontada para siempre.
            const estabaAplicado = Boolean(pago.verificado);

            if (ev.tipo_evento === 'CREACION') {
              db.prepare('UPDATE pagos SET activo = 0 WHERE id = ?').run(ev.entidad_id);
              seRevirtioAlgo = true;
            } else if (anterior?.verificado !== undefined) {
              db.prepare('UPDATE pagos SET verificado = ? WHERE id = ?').run(
                anterior.verificado ? 1 : 0,
                ev.entidad_id
              );
              seRevirtioAlgo = true;
            }

            if (estabaAplicado) {
              db.prepare(`
                UPDATE pedidos SET
                  saldo_pendiente_cor_cents = saldo_pendiente_cor_cents + ?,
                  saldo_pendiente_usd_cents = saldo_pendiente_usd_cents + ?
                WHERE id = ?
              `).run(pago.monto_cor_cents, pago.monto_usd_cents, pago.pedido_id);

              // Recalcular si el anticipo sigue cumpliendose con lo que queda
              const fila = db
                .prepare(`
                  SELECT COALESCE(SUM(monto_cor_cents), 0) AS total
                  FROM pagos
                  WHERE pedido_id = ? AND activo = 1 AND verificado = 1
                    AND tipo_pago IN ('ANTICIPO', 'COMPLETO')
                `)
                .get(pago.pedido_id) as { total: number };

              const ped = db
                .prepare('SELECT anticipo_esperado_cor_cents FROM pedidos WHERE id = ?')
                .get(pago.pedido_id) as { anticipo_esperado_cor_cents: number };

              const sigueCumpliendo = fila.total >= ped.anticipo_esperado_cor_cents;
              db.prepare('UPDATE pedidos SET anticipo_verificado = ? WHERE id = ?').run(
                sigueCumpliendo ? 1 : 0,
                pago.pedido_id
              );

              if (!sigueCumpliendo) {
                db.prepare(`
                  UPDATE pedido_items SET estado = 'PENDIENTE_ANTICIPO'
                  WHERE pedido_id = ? AND estado = 'ANTICIPO_OK' AND activo = 1
                `).run(pago.pedido_id);
              }

              PedidosRepo.recalcularYPersistirEstadoPedido(pago.pedido_id);
            }
          }
        }
      }

      // Solo se borra la auditoria de lo que realmente se revirtio.
      // Antes se borraba siempre, incluso cuando no se habia hecho nada:
      // el rastro desaparecia y la funcion reportaba exito igual.
      if (seRevirtioAlgo) {
        db.prepare('DELETE FROM eventos WHERE evento_grupo_id = ?').run(grupoId);
      }
    })();

    if (!seRevirtioAlgo) {
      return {
        revertido: false,
        descripcion: 'Esta acción no se puede deshacer automáticamente.',
      };
    }

    return {
      revertido: true,
      descripcion: ultimoGrupo?.detalle || `Acción '${ultimoGrupo?.tipo_evento || 'desconocida'}' deshecha con éxito.`,
    };
  }
}
