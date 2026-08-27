import { getDb } from '../database';
import type {
  Cotizacion,
  CotizacionCompleta,
  CotizacionItem,
  EstadoCotizacion,
  PedidoCompleto,
} from '../../../shared/types';
import type { CrearCotizacionInput } from '../../../shared/ipc-contracts';
import { ParametrosRepo } from './parametros.repo';
import { ClientesRepo } from './clientes.repo';
import { EventosRepo } from './eventos.repo';
import { PedidosRepo } from './pedidos.repo';
import {
  calcularCotizacion,
  CotizarItemInput,
  ParametrosEntidadesCotizacion,
} from '../../../core/precios';
import { validarTransicionCotizacion } from '../../../core/estados';

export class CotizacionesRepo {
  static list(estado?: EstadoCotizacion, cliente_id?: number): Cotizacion[] {
    const db = getDb();
    let sql = 'SELECT * FROM cotizaciones WHERE activo = 1';
    const params: any[] = [];

    if (estado) {
      sql += ' AND estado = ?';
      params.push(estado);
    }
    if (cliente_id) {
      sql += ' AND cliente_id = ?';
      params.push(cliente_id);
    }

    sql += ' ORDER BY id DESC';
    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map(CotizacionesRepo.mapRowToCotizacion);
  }

  static getById(id: number): CotizacionCompleta | null {
    const db = getDb();
    const row = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(id) as any;
    if (!row) return null;

    const cliente = ClientesRepo.getById(row.cliente_id);
    if (!cliente) return null;

    const itemsRows = db
      .prepare('SELECT * FROM cotizacion_items WHERE cotizacion_id = ? ORDER BY orden ASC, id ASC')
      .all(id) as any[];

    const items: CotizacionItem[] = itemsRows.map((r) => ({
      id: r.id,
      cotizacion_id: r.cotizacion_id,
      tienda_id: r.tienda_id,
      categoria_id: r.categoria_id,
      descripcion: r.descripcion,
      url: r.url,
      precio_usa_usd_cents: r.precio_usa_usd_cents,
      tax_usa_usd_cents: r.tax_usa_usd_cents,
      peso_mlb: r.peso_mlb,
      comision_bp: r.comision_bp,
      comision_cor_cents: r.comision_cor_cents,
      arancel_estimado_usd_cents: r.arancel_estimado_usd_cents,
      flete_estimado_usd_cents: r.flete_estimado_usd_cents,
      costo_aterrizado_estimado_usd_cents: r.costo_aterrizado_estimado_usd_cents,
      precio_final_usd_cents: r.precio_final_usd_cents,
      precio_final_cor_cents: r.precio_final_cor_cents,
      anticipo_usd_cents: r.anticipo_usd_cents,
      anticipo_cor_cents: r.anticipo_cor_cents,
      saldo_usd_cents: r.saldo_usd_cents,
      saldo_cor_cents: r.saldo_cor_cents,
      orden: r.orden,
    }));

    return {
      ...CotizacionesRepo.mapRowToCotizacion(row),
      cliente,
      items,
    };
  }

  static create(data: CrearCotizacionInput, evento_grupo_id: string): CotizacionCompleta {
    const db = getDb();
    const paramsGlobales = ParametrosRepo.getParametros();
    const categorias = ParametrosRepo.getCategorias();
    const tiendas = ParametrosRepo.getTiendas();

    const catMap = new Map(categorias.map((c) => [c.id, c]));
    const tiendaMap = new Map(tiendas.map((t) => [t.id, t]));

    // Resolver inputs para el cotizador puro
    const cotizarItems: CotizarItemInput[] = data.items.map((item: any, idx: number) => {
      const cat = item.categoria_id ? catMap.get(item.categoria_id) : undefined;
      const tienda = item.tienda_id ? tiendaMap.get(item.tienda_id) : undefined;

      return {
        id: idx + 1,
        descripcion: item.descripcion,
        tienda_id: item.tienda_id,
        categoria_id: item.categoria_id,
        precio_usa_usd_cents: item.precio_usa_usd_cents,
        peso_mlb: item.peso_mlb,
        tax_rate_tienda_bp: tienda?.tax_rate_bp ?? paramsGlobales.tax_usa_default_bp,
        arancel_categoria_bp: cat?.arancel_estimado_bp ?? paramsGlobales.arancel_default_bp,
        comision_categoria_bp: cat?.comision_defecto_bp ?? 3500,
        redondeo_categoria_cor_cents: cat?.redondeo_cor_cents ?? 5000,
      };
    });

    const paramsCalculo: ParametrosEntidadesCotizacion = {
      tasa_cambio_cents: paramsGlobales.tasa_cambio_oficial_cents,
      tarifa_flete_cents_lb: paramsGlobales.tarifa_flete_cents_lb,
      flete_minimo_usd_cents: paramsGlobales.flete_minimo_usd_cents,
      otros_costos_fijos_usd_cents: paramsGlobales.otros_costos_fijos_usd_cents,
      umbral_arancel_excedente_usd_cents: paramsGlobales.umbral_arancel_excedente_usd_cents,
      arancel_default_bp: paramsGlobales.arancel_default_bp,
      tax_usa_default_bp: paramsGlobales.tax_usa_default_bp,
      comision_minima_cotizacion_cor_cents: paramsGlobales.comision_minima_cotizacion_cor_cents,
      anticipo_default_bp: paramsGlobales.anticipo_default_bp,
    };

    const calculo = calcularCotizacion(cotizarItems, paramsCalculo, data.anticipo_bp);

    let cotizacionCreadaId = 0;

    db.transaction(() => {
      const now = new Date();
      const fechaStr = now.toISOString().slice(0, 10);
      const validaHasta = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      // Generar código correlativo COT-YYMM-XXXX
      const yymm = `${now.getFullYear().toString().slice(2)}${(now.getMonth() + 1)
        .toString()
        .padStart(2, '0')}`;
      const countRow = db
        .prepare("SELECT COUNT(id) AS count FROM cotizaciones WHERE codigo LIKE ?")
        .get(`COT-${yymm}-%`) as any;
      const correlativo = ((countRow?.count || 0) + 1).toString().padStart(4, '0');
      const codigo = `COT-${yymm}-${correlativo}`;

      const stmtCot = db.prepare(`
        INSERT INTO cotizaciones (
          codigo, cliente_id, fecha, valida_hasta, tasa_cambio_cents, tarifa_flete_cents_lb,
          estado, subtotal_usa_usd_cents, tax_usa_total_usd_cents, flete_estimado_total_usd_cents,
          arancel_estimado_total_usd_cents, costo_aterrizado_total_usd_cents, comision_total_cor_cents,
          total_usd_cents, total_cor_cents, anticipo_bp, anticipo_total_usd_cents,
          anticipo_total_cor_cents, saldo_total_usd_cents, saldo_total_cor_cents, notas, activo
        ) VALUES (
          ?, ?, ?, ?, ?, ?, 'BORRADOR', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1
        )
      `);

      const info = stmtCot.run(
        codigo,
        data.cliente_id,
        fechaStr,
        validaHasta,
        paramsGlobales.tasa_cambio_oficial_cents,
        paramsGlobales.tarifa_flete_cents_lb,
        calculo.totales.subtotal_usa_usd_cents,
        calculo.totales.tax_usa_total_usd_cents,
        calculo.totales.flete_estimado_total_usd_cents,
        calculo.totales.arancel_estimado_total_usd_cents,
        calculo.totales.costo_aterrizado_total_usd_cents,
        calculo.totales.comision_total_cor_cents,
        calculo.totales.total_final_usd_cents,
        calculo.totales.total_final_cor_cents,
        calculo.totales.anticipo_bp,
        calculo.totales.anticipo_total_usd_cents,
        calculo.totales.anticipo_total_cor_cents,
        calculo.totales.saldo_total_usd_cents,
        calculo.totales.saldo_total_cor_cents,
        data.notas || null
      );

      cotizacionCreadaId = Number(info.lastInsertRowid);

      const stmtItem = db.prepare(`
        INSERT INTO cotizacion_items (
          cotizacion_id, tienda_id, categoria_id, descripcion, url,
          precio_usa_usd_cents, tax_usa_usd_cents, peso_mlb, comision_bp,
          comision_cor_cents, arancel_estimado_usd_cents, flete_estimado_usd_cents,
          costo_aterrizado_estimado_usd_cents, precio_final_usd_cents,
          precio_final_cor_cents, anticipo_usd_cents, anticipo_cor_cents,
          saldo_usd_cents, saldo_cor_cents, orden
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < calculo.items.length; i++) {
        const itemCalc = calculo.items[i];
        const draft = data.items[i];
        const cat = draft.categoria_id ? catMap.get(draft.categoria_id) : undefined;

        stmtItem.run(
          cotizacionCreadaId,
          draft.tienda_id || null,
          draft.categoria_id || null,
          itemCalc.descripcion,
          draft.url || null,
          itemCalc.precio_usa_usd_cents,
          itemCalc.tax_usa_usd_cents,
          draft.peso_mlb,
          cat?.comision_defecto_bp ?? 3500,
          itemCalc.comision_calculada_cor_cents,
          itemCalc.arancel_estimado_usd_cents,
          itemCalc.flete_estimado_usd_cents,
          itemCalc.costo_aterrizado_estimado_usd_cents,
          itemCalc.precio_final_usd_cents,
          itemCalc.precio_final_cor_cents,
          itemCalc.anticipo_usd_cents,
          itemCalc.anticipo_cor_cents,
          itemCalc.saldo_usd_cents,
          itemCalc.saldo_cor_cents,
          i + 1
        );
      }

      EventosRepo.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'COTIZACION',
        entidad_id: cotizacionCreadaId,
        tipo_evento: 'CREACION',
        valor_nuevo: { id: cotizacionCreadaId, codigo, total_cor_cents: calculo.totales.total_final_cor_cents },
        detalle: `Cotización ${codigo} creada`,
      });
    })();

    return CotizacionesRepo.getById(cotizacionCreadaId)!;
  }

  static cambiarEstado(
    id: number,
    nuevoEstado: EstadoCotizacion,
    evento_grupo_id: string
  ): void {
    const db = getDb();
    db.transaction(() => {
      const actual = db.prepare('SELECT * FROM cotizaciones WHERE id = ?').get(id) as any;
      if (!actual) throw new Error(`Cotización con ID ${id} no encontrada`);

      const validacion = validarTransicionCotizacion(actual.estado, nuevoEstado);
      if (!validacion.permitido) {
        throw new Error(validacion.motivo_rechazo || 'Transición de cotización no permitida');
      }

      db.prepare('UPDATE cotizaciones SET estado = ? WHERE id = ?').run(nuevoEstado, id);

      EventosRepo.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'COTIZACION',
        entidad_id: id,
        tipo_evento: 'CAMBIO_ESTADO',
        estado_anterior: actual.estado,
        estado_nuevo: nuevoEstado,
        valor_anterior: { estado: actual.estado },
        valor_nuevo: { estado: nuevoEstado },
        detalle: `Cotización ${actual.codigo} pasó a estado ${nuevoEstado}`,
      });
    })();
  }

  static convertirAPedido(
    cotizacion_id: number,
    evento_grupo_id: string,
    notas?: string
  ): PedidoCompleto {
    const db = getDb();
    let pedidoIdCreado = 0;

    db.transaction(() => {
      const cotizacion = CotizacionesRepo.getById(cotizacion_id);
      if (!cotizacion) throw new Error(`Cotización #${cotizacion_id} no encontrada`);

      if (cotizacion.estado === 'ACEPTADA') {
        const pedExistente = db
          .prepare('SELECT id FROM pedidos WHERE cotizacion_id = ? AND activo = 1')
          .get(cotizacion_id) as any;
        if (pedExistente) {
          throw new Error(`Esta cotización ya fue convertida al pedido #${pedExistente.id}`);
        }
      }

      const now = new Date();
      const fechaStr = now.toISOString().slice(0, 10);
      const yymm = `${now.getFullYear().toString().slice(2)}${(now.getMonth() + 1)
        .toString()
        .padStart(2, '0')}`;
      const countRow = db
        .prepare("SELECT COUNT(id) AS count FROM pedidos WHERE codigo LIKE ?")
        .get(`PED-${yymm}-%`) as any;
      const correlativo = ((countRow?.count || 0) + 1).toString().padStart(4, '0');
      const codigoPedido = `PED-${yymm}-${correlativo}`;

      // 1. Crear Pedido
      const stmtPed = db.prepare(`
        INSERT INTO pedidos (
          codigo, cotizacion_id, cliente_id, fecha, tasa_cambio_cents, estado_derivado,
          requiere_atencion, anticipo_verificado, total_usd_cents, total_cor_cents,
          anticipo_esperado_cor_cents, saldo_pendiente_cor_cents, saldo_pendiente_usd_cents, notas, activo
        ) VALUES (
          ?, ?, ?, ?, ?, 'PENDIENTE_ANTICIPO', 0, 0, ?, ?, ?, ?, ?, ?, 1
        )
      `);

      const info = stmtPed.run(
        codigoPedido,
        cotizacion.id,
        cotizacion.cliente_id,
        fechaStr,
        cotizacion.tasa_cambio_cents,
        cotizacion.total_usd_cents,
        cotizacion.total_cor_cents,
        cotizacion.anticipo_total_cor_cents,
        cotizacion.total_cor_cents,
        cotizacion.total_usd_cents,
        notas || cotizacion.notas || null
      );

      pedidoIdCreado = Number(info.lastInsertRowid);

      // 2. Crear Pedido Items
      const stmtItem = db.prepare(`
        INSERT INTO pedido_items (
          pedido_id, cotizacion_item_id, tienda_id, categoria_id, descripcion, url,
          precio_usa_usd_cents, tax_usa_usd_cents, peso_mlb, estado,
          costo_aterrizado_estimado_cents, costo_aterrizado_real_cents, margen_real_cents,
          prioridad, activo
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE_ANTICIPO', ?, 0, 0, 1, 1
        )
      `);

      for (const item of cotizacion.items) {
        stmtItem.run(
          pedidoIdCreado,
          item.id,
          item.tienda_id || null,
          item.categoria_id || null,
          item.descripcion,
          item.url || null,
          item.precio_usa_usd_cents,
          item.tax_usa_usd_cents,
          item.peso_mlb,
          item.costo_aterrizado_estimado_usd_cents
        );
      }

      // 3. Marcar cotización como ACEPTADA
      db.prepare("UPDATE cotizaciones SET estado = 'ACEPTADA' WHERE id = ?").run(cotizacion.id);

      // 4. Registrar evento
      EventosRepo.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'PEDIDO',
        entidad_id: pedidoIdCreado,
        tipo_evento: 'CREACION',
        valor_anterior: { cotizacion_estado: cotizacion.estado },
        valor_nuevo: { pedido_id: pedidoIdCreado, codigo: codigoPedido, cotizacion_id: cotizacion.id },
        detalle: `Cotización ${cotizacion.codigo} convertida en Pedido ${codigoPedido}`,
      });
    })();

    return PedidosRepo.getById(pedidoIdCreado)!;
  }

  private static mapRowToCotizacion(r: any): Cotizacion {
    return {
      id: r.id,
      codigo: r.codigo,
      cliente_id: r.cliente_id,
      fecha: r.fecha,
      valida_hasta: r.valida_hasta,
      tasa_cambio_cents: r.tasa_cambio_cents,
      tarifa_flete_cents_lb: r.tarifa_flete_cents_lb,
      estado: r.estado,
      subtotal_usa_usd_cents: r.subtotal_usa_usd_cents,
      tax_usa_total_usd_cents: r.tax_usa_total_usd_cents,
      flete_estimado_total_usd_cents: r.flete_estimado_total_usd_cents,
      arancel_estimado_total_usd_cents: r.arancel_estimado_total_usd_cents,
      costo_aterrizado_total_usd_cents: r.costo_aterrizado_total_usd_cents,
      comision_total_cor_cents: r.comision_total_cor_cents,
      total_usd_cents: r.total_usd_cents,
      total_cor_cents: r.total_cor_cents,
      anticipo_bp: r.anticipo_bp,
      anticipo_total_usd_cents: r.anticipo_total_usd_cents,
      anticipo_total_cor_cents: r.anticipo_total_cor_cents,
      saldo_total_usd_cents: r.saldo_total_usd_cents,
      saldo_total_cor_cents: r.saldo_total_cor_cents,
      notas: r.notas,
      activo: Boolean(r.activo),
      creado_en: r.creado_en,
    };
  }
}
