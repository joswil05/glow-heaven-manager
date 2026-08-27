import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export class FilesService {
  static getAdjuntosDir(): string {
    try {
      if (app && app.getPath) {
        const p = path.join(app.getPath('userData'), 'adjuntos');
        if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        return p;
      }
    } catch {
      // CLI fallback
    }

    const p = path.join(process.cwd(), 'data', 'adjuntos');
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
  }

  static guardarBuffer(
    buffer: Uint8Array,
    nombreOriginal: string,
    prefix: string = 'adjunto'
  ): { ruta_archivo: string; tamano_bytes: number } {
    const adjuntosDir = FilesService.getAdjuntosDir();
    const ext = path.extname(nombreOriginal) || '.png';
    const timestamp = Date.now();
    const safeName = `${prefix}_${timestamp}${ext}`;
    const targetPath = path.join(adjuntosDir, safeName);

    fs.writeFileSync(targetPath, Buffer.from(buffer));

    return {
      ruta_archivo: targetPath,
      tamano_bytes: buffer.byteLength,
    };
  }
}
