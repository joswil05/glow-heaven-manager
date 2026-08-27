import { getDb } from '../database';
import { FilesService } from '../../services/files.service';
import { GuardarBufferInput } from '../../../shared/ipc-contracts';

export class AdjuntosRepo {
  static guardarBuffer(input: GuardarBufferInput): { id: number; ruta_archivo: string } {
    const { ruta_archivo, tamano_bytes } = FilesService.guardarBuffer(
      input.buffer,
      input.nombre_original,
      input.tipo.toLowerCase()
    );

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO adjuntos (
        entidad_tipo, entidad_id, tipo, ruta_archivo, nombre_original, mime_type, tamano_bytes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      input.entidad_tipo,
      input.entidad_id,
      input.tipo,
      ruta_archivo,
      input.nombre_original,
      input.mime_type || 'image/png',
      tamano_bytes
    );

    return {
      id: Number(info.lastInsertRowid),
      ruta_archivo,
    };
  }
}
