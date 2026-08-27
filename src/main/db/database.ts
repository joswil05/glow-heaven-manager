import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { app } from 'electron';

let dbInstance: Database.Database | null = null;

export function setDbInstance(db: Database.Database | null): void {
  dbInstance = db;
}

export function getDatabasePath(): string {
  // En testing o si app no está disponible, usar carpeta local
  try {
    if (app && app.getPath) {
      const userDataPath = app.getPath('userData');
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      return path.join(userDataPath, 'glow_heaven.db');
    }
  } catch {
    // Fallback para entornos CLI o scripts
  }

  const localDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  return path.join(localDir, 'glow_heaven.db');
}

export function getDb(customPath?: string): Database.Database {
  if (!dbInstance) {
    const dbPath = customPath || getDatabasePath();
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    dbInstance = new Database(dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
    });

    // Pragma obligatorios para integridad y alto rendimiento
    dbInstance.pragma('foreign_keys = ON');
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('synchronous = NORMAL');
  }

  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance && dbInstance.open) {
    dbInstance.close();
    dbInstance = null;
  }
}
