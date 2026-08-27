import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { getDb } from '../db/database';
import { ParametrosRepo } from '../db/repositories/parametros.repo';

export class BackupService {
  /**
   * Obtiene la carpeta de respaldo recomendada o configurada.
   */
  static getBackupDir(customDestino?: string): string {
    if (customDestino && customDestino.trim()) {
      return customDestino.trim();
    }

    try {
      const params = ParametrosRepo.getParametros();
      if (params.ruta_backup_configurada && params.ruta_backup_configurada.trim()) {
        return params.ruta_backup_configurada.trim();
      }
    } catch {
      // Ignorar si la base de datos aún no está lista
    }

    // Intentar detectar OneDrive
    const userProfile = process.env.USERPROFILE || '';
    const oneDrivePath = path.join(userProfile, 'OneDrive', 'GlowHeaven_Backups');
    if (fs.existsSync(path.join(userProfile, 'OneDrive'))) {
      return oneDrivePath;
    }

    // Fallback: Carpeta en Documentos o userData
    try {
      if (app && app.getPath) {
        return path.join(app.getPath('documents'), 'GlowHeaven_Backups');
      }
    } catch {
      // CLI fallback
    }

    return path.join(process.cwd(), 'backups');
  }

  /**
   * Ejecuta un respaldo inmediato con rotación de las últimas 30 copias.
   */
  static async crearBackup(destinoPath?: string): Promise<{ ruta_backup: string; timestamp: string }> {
    const backupDir = BackupService.getBackupDir(destinoPath);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const now = new Date();
    const timestampStr = now.toISOString().replace(/[:.]/g, '-');
    const fileName = `glow_heaven_backup_${timestampStr}.db`;
    const targetFilePath = path.join(backupDir, fileName);

    const db = getDb();

    // Usar la función nativa segura db.backup() de better-sqlite3
    await db.backup(targetFilePath);

    // Rotación: mantener solo las últimas 30 copias
    BackupService.rotarBackups(backupDir, 30);

    return {
      ruta_backup: targetFilePath,
      timestamp: now.toISOString(),
    };
  }

  /**
   * Elimina copias antiguas si superan el límite de maxCopias (30).
   */
  private static rotarBackups(backupDir: string, maxCopias: number = 30): void {
    try {
      const files = fs.readdirSync(backupDir);
      const backupFiles = files
        .filter((f) => f.startsWith('glow_heaven_backup_') && f.endsWith('.db'))
        .map((f) => {
          const fullPath = path.join(backupDir, f);
          const stat = fs.statSync(fullPath);
          return { name: f, path: fullPath, mtime: stat.mtime.getTime() };
        })
        .sort((a, b) => b.mtime - a.mtime); // Más recientes primero

      if (backupFiles.length > maxCopias) {
        const toDelete = backupFiles.slice(maxCopias);
        for (const file of toDelete) {
          fs.unlinkSync(file.path);
        }
      }
    } catch (err) {
      console.error('Error al rotar copias de seguridad:', err);
    }
  }
}
