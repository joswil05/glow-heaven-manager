import { getDb } from '../database';
import type { Pago, MetodoPago, TipoPago } from '../../../shared/types';
import type { CrearPagoInput } from '../../../shared/ipc-contracts';
import { EventosRepo } from './eventos.repo';
import { PedidosRepo } from './pedidos.repo';
import {
  usdCentavosACorCentavos,
  corCentavosAUsdCentavos,
} from '../../../core/moneda';

export class PagosRepo {
  static listByPedido(pedido_id: number): Pago[] {
    const db = getDb();
    const rows = db
      .prepare('SELECT * FROM pagos WHERE pedido_id = ? AND activo = 1 ORDER BY id DESC')
      .all(pedido_id) as any[];

    return rows.map(PagosRepo.mapRowToPago);
  }

  static create(data: CrearPagoInput, evento_grupo_id: string): Pago {
    const db = getDb();
    let pagoCreado: Pago | null = null;

    db.transaction(() => {
      const pedido = db
        .prepare('SELECT * FROM pedidos WHERE id = ?')
        .get(data.pedido_id) as any;
      if (!pedido) throw new Error(`Pedido #${data.pedido_id} no encontrado`);

      const now = new Date().toISOString().slice(0, 10);
      let monto_cor_cents = 0;
      let monto_usd_cents = 0;

      if (data.moneda_pago === 'COR') {
        monto_cor_cents = data.monto_cents;
        monto_usd_cents = corCentavosAUsdCentavos(
          monto_cor_cents,
          pedido.tasa_cambio_cents
        );
      } else {
        monto_usd_cents = data.monto_cents;
        monto_cor_cents = usdCentavosACorCentavos(
          monto_usd_cents,
          pedido.tasa_cambio_cents
        );
      }

      const stmt = db.prepare(`
        INSERT INTO pagos (
          pedido_id, cliente_id, fecha, monto_usd_cents, monto_cor_cents,
          moneda_pago, tasa_cambio_cents, metodo_pago, referencia,
          verificado, tipo_pago, activo
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
        )
      `);

      const info = stmt.run(
        pedido.id,
        pedido.cliente_id,
        now,
        monto_usd_cents,
        monto_cor_cents,
        data.moneda_pago,
        pedido.tasa_cambio_cents,
        data.metodo_pago,
        data.referencia || null,
        data.verificado ? 1 : 0,
        data.tipo_pago
      );

      const pagoId = Number(info.lastInsertRowid);

      pagoCreado = {
        id: pagoId,
        pedido_id: pedido.id,
        cliente_id: pedido.cliente_id,
        fecha: now,
        monto_usd_cents,
        monto_cor_cents,
        moneda_pago: data.moneda_pago,
        tasa_cambio_cents: pedido.tasa_cambio_cents,
        metodo_pago: data.metodo_pago as MetodoPago,
        referencia: data.referencia,
        verificado: data.verificado,
        tipo_pago: data.tipo_pago as TipoPago,
        activo: true,
      };

      if (data.verificado) {
        PagosRepo.aplicarEfectosVerificacion(pedido.id, data.tipo_pago, monto_cor_cents, monto_usd_cents);
      }

      EventosRepo.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'PAGO',
        entidad_id: pagoId,
        tipo_evento: 'CREACION',
        valor_nuevo: pagoCreado,
        detalle: `Pago de ${data.moneda_pago} ${data.monto_cents / 100} registrado (${data.tipo_pago})`,
      });
    })();

    return pagoCreado!;
  }

  static verificar(
    pago_id: number,
    verificado: boolean,
    evento_grupo_id: string
  ): void {
    const db = getDb();
    db.transaction(() => {
      const pago = db.prepare('SELECT * FROM pagos WHERE id = ?').get(pago_id) as any;
      if (!pago) throw new Error(`Pago #${pago_id} no encontrado`);

      const yaEstaba = Boolean(pago.verificado);
      if (yaEstaba === verificado) {
        // Nada que hacer. Sin esta guarda, verificar dos veces aplicaría
        // los efectos dos veces y descontaría el saldo por duplicado.
        return;
      }

      db.prepare('UPDATE pagos SET verificado = ? WHERE id = ?').run(
        verificado ? 1 : 0,
        pago_id
      );

      if (verificado) {
        PagosRepo.aplicarEfectosVerificacion(
          pago.pedido_id,
          pago.tipo_pago,
          pago.monto_cor_cents,
          pago.monto_usd_cents
        );
      }

      EventosRepo.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'PAGO',
        entidad_id: pago_id,
        tipo_evento: 'PAGO_VERIFICADO',
        valor_anterior: { verificado: pago.verificado },
        valor_nuevo: { verificado },
        detalle: `Pago #${pago_id} marcado como ${verificado ? 'VERIFICADO' : 'NO VERIFICADO'}`,
      });
    })();
  }

  private static aplicarEfectosVerificacion(
    pedido_id: number,
    tipo_pago: string,
    monto_cor_cents: number,
    monto_usd_cents: number
  ): void {
    const db = getDb();
    const pedido = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(pedido_id) as any;
    if (!pedido) return;

    const nuevoSaldoCor = Math.max(0, pedido.saldo_pendiente_cor_cents - monto_cor_cents);
    const nuevoSaldoUsd = Math.max(0, pedido.saldo_pendiente_usd_cents - monto_usd_cents);

    // El anticipo se cumple cuando la SUMA de los anticipos verificados
    // alcanza lo esperado. Comparar solo el pago actual dejaría fuera el
    // caso de un cliente que abona en dos partes.
    let anticipoVerificado = pedido.anticipo_verificado;

    if (tipo_pago === 'ANTICIPO' || tipo_pago === 'COMPLETO') {
      const fila = db
        .prepare(`
          SELECT COALESCE(SUM(monto_cor_cents), 0) AS total
          FROM pagos
          WHERE pedido_id = ?
            AND activo = 1
            AND verificado = 1
            AND tipo_pago IN ('ANTICIPO', 'COMPLETO')
        `)
        .get(pedido_id) as { total: number };

      if (fila.total >= pedido.anticipo_esperado_cor_cents) {
        anticipoVerificado = 1;
      }
    }

    db.prepare(`
      UPDATE pedidos SET
        saldo_pendiente_cor_cents = ?,
        saldo_pendiente_usd_cents = ?,
        anticipo_verificado = ?
      WHERE id = ?
    `).run(nuevoSaldoCor, nuevoSaldoUsd, anticipoVerificado, pedido_id);

    // Si el anticipo está verificado, avanzar ítems en PENDIENTE_ANTICIPO a ANTICIPO_OK
    if (anticipoVerificado === 1) {
      db.prepare(`
        UPDATE pedido_items SET estado = 'ANTICIPO_OK'
        WHERE pedido_id = ? AND estado = 'PENDIENTE_ANTICIPO' AND activo = 1
      `).run(pedido_id);
    }

    PedidosRepo.recalcularYPersistirEstadoPedido(pedido_id);
  }

  private static mapRowToPago(r: any): Pago {
    return {
      id: r.id,
      pedido_id: r.pedido_id,
      cliente_id: r.cliente_id,
      fecha: r.fecha,
      monto_usd_cents: r.monto_usd_cents,
      monto_cor_cents: r.monto_cor_cents,
      moneda_pago: r.moneda_pago,
      tasa_cambio_cents: r.tasa_cambio_cents,
      metodo_pago: r.metodo_pago,
      referencia: r.referencia,
      verificado: Boolean(r.verificado),
      tipo_pago: r.tipo_pago,
      comprobante_adjunto_id: r.comprobante_adjunto_id,
      activo: Boolean(r.activo),
      creado_en: r.creado_en,
    };
  }
}
