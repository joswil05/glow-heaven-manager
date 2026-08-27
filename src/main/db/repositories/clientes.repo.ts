import { getDb } from '../database';
import type { Cliente, ClienteDetalle } from '../../../shared/types';
import type { CrearClienteInput, ActualizarClienteInput } from '../../../shared/ipc-contracts';
import { EventosRepo } from './eventos.repo';

export class ClientesRepo {
  static list(query?: string, activo: boolean = true): Cliente[] {
    const db = getDb();
    let sql = 'SELECT * FROM clientes WHERE activo = ?';
    const params: any[] = [activo ? 1 : 0];

    if (query && query.trim()) {
      const q = `%${query.trim()}%`;
      sql += ' AND (nombre LIKE ? OR alias LIKE ? OR telefono LIKE ? OR cedula LIKE ?)';
      params.push(q, q, q, q);
    }

    sql += ' ORDER BY nombre ASC';
    const rows = db.prepare(sql).all(...params) as any[];

    return rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      alias: r.alias,
      telefono: r.telefono,
      direccion: r.direccion,
      ciudad: r.ciudad,
      cedula: r.cedula,
      notas: r.notas,
      incumplio_anteriormente: Boolean(r.incumplio_anteriormente),
      activo: Boolean(r.activo),
      creado_en: r.creado_en,
    }));
  }

  static getById(id: number): ClienteDetalle | null {
    const db = getDb();
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id) as any;
    if (!cliente) return null;

    const stats = db
      .prepare(`
        SELECT 
          COUNT(id) AS pedidos_activos_count,
          COALESCE(SUM(saldo_pendiente_cor_cents), 0) AS saldo_total_pendiente_cor_cents,
          COALESCE(SUM(total_cor_cents), 0) AS total_compras_cor_cents
        FROM pedidos
        WHERE cliente_id = ? AND activo = 1
      `)
      .get(id) as any;

    return {
      id: cliente.id,
      nombre: cliente.nombre,
      alias: cliente.alias,
      telefono: cliente.telefono,
      direccion: cliente.direccion,
      ciudad: cliente.ciudad,
      cedula: cliente.cedula,
      notas: cliente.notas,
      incumplio_anteriormente: Boolean(cliente.incumplio_anteriormente),
      activo: Boolean(cliente.activo),
      creado_en: cliente.creado_en,
      pedidos_activos_count: stats?.pedidos_activos_count || 0,
      saldo_total_pendiente_cor_cents: stats?.saldo_total_pendiente_cor_cents || 0,
      total_compras_cor_cents: stats?.total_compras_cor_cents || 0,
    };
  }

  static create(data: CrearClienteInput, evento_grupo_id: string): Cliente {
    const db = getDb();
    let clienteCreado: Cliente | null = null;

    db.transaction(() => {
      const stmt = db.prepare(`
        INSERT INTO clientes (
          nombre, alias, telefono, direccion, ciudad, cedula, notas, incumplio_anteriormente, activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      const info = stmt.run(
        data.nombre,
        data.alias || null,
        data.telefono,
        data.direccion || null,
        data.ciudad || 'León',
        data.cedula || null,
        data.notas || null,
        data.incumplio_anteriormente ? 1 : 0
      );

      const id = Number(info.lastInsertRowid);
      clienteCreado = {
        id,
        nombre: data.nombre,
        alias: data.alias,
        telefono: data.telefono,
        direccion: data.direccion,
        ciudad: data.ciudad || 'León',
        cedula: data.cedula,
        notas: data.notas,
        incumplio_anteriormente: Boolean(data.incumplio_anteriormente),
        activo: true,
      };

      EventosRepo.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'CLIENTE',
        entidad_id: id,
        tipo_evento: 'CREACION',
        valor_nuevo: clienteCreado,
        detalle: `Cliente '${data.nombre}' registrado`,
      });
    })();

    return clienteCreado!;
  }

  static update(id: number, data: ActualizarClienteInput, evento_grupo_id: string): Cliente {
    const db = getDb();
    let clienteActualizado: Cliente | null = null;

    db.transaction(() => {
      const actual = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id) as any;
      if (!actual) {
        throw new Error(`Cliente con ID ${id} no encontrado`);
      }

      const stmt = db.prepare(`
        UPDATE clientes SET
          nombre = COALESCE(?, nombre),
          alias = COALESCE(?, alias),
          telefono = COALESCE(?, telefono),
          direccion = COALESCE(?, direccion),
          ciudad = COALESCE(?, ciudad),
          cedula = COALESCE(?, cedula),
          notas = COALESCE(?, notas),
          incumplio_anteriormente = COALESCE(?, incumplio_anteriormente),
          activo = COALESCE(?, activo)
        WHERE id = ?
      `);

      stmt.run(
        data.nombre ?? null,
        data.alias ?? null,
        data.telefono ?? null,
        data.direccion ?? null,
        data.ciudad ?? null,
        data.cedula ?? null,
        data.notas ?? null,
        data.incumplio_anteriormente !== undefined ? (data.incumplio_anteriormente ? 1 : 0) : null,
        data.activo !== undefined ? (data.activo ? 1 : 0) : null,
        id
      );

      clienteActualizado = ClientesRepo.getById(id)!;

      EventosRepo.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'CLIENTE',
        entidad_id: id,
        tipo_evento: 'MODIFICACION',
        valor_anterior: actual,
        valor_nuevo: clienteActualizado,
        detalle: `Cliente '${clienteActualizado.nombre}' actualizado`,
      });
    })();

    return clienteActualizado!;
  }
}
