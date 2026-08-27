import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema-raw';

export function runMigrations(db: Database.Database): void {
  const currentVersionRow = db.pragma('user_version', { simple: true }) as number;
  const currentVersion = typeof currentVersionRow === 'number' ? currentVersionRow : 0;

  if (currentVersion === 0) {
    // Migración 1: Esquema Inicial y Semilla
    db.transaction(() => {
      db.exec(SCHEMA_SQL);

      // 1. Semilla de Categorías
      const insertCat = db.prepare(`
        INSERT OR IGNORE INTO categorias (nombre, comision_defecto_bp, arancel_estimado_bp, redondeo_cor_cents, activa)
        VALUES (?, ?, ?, ?, 1)
      `);
      insertCat.run('Perfumería', 3500, 3500, 5000);
      insertCat.run('Maquillaje', 3500, 3000, 5000);
      insertCat.run('Skincare', 3000, 3000, 5000);
      insertCat.run('Calzado', 2500, 3000, 10000);
      insertCat.run('Accesorios', 3000, 3000, 5000);

      // 2. Semilla de Tiendas
      const insertTienda = db.prepare(`
        INSERT OR IGNORE INTO tiendas (nombre, tax_rate_bp, activa)
        VALUES (?, ?, 1)
      `);
      insertTienda.run('Amazon', 0);
      insertTienda.run('Sephora', 700);
      insertTienda.run('Ulta', 700);
      insertTienda.run('Ross', 700);
      insertTienda.run('Marshalls', 700);
      insertTienda.run('TJ Maxx', 700);
      insertTienda.run('Coach', 700);
      insertTienda.run("Macy's", 700);
      insertTienda.run('Bath & Body Works', 700);
      insertTienda.run('Nike', 700);

      // 3. Semilla de Parámetros
      const insertParam = db.prepare(`
        INSERT OR IGNORE INTO parametros (clave, valor, tipo, descripcion)
        VALUES (?, ?, ?, ?)
      `);
      insertParam.run('tasa_cambio_oficial_cents', '3662', 'integer', 'Tasa oficial BCN C$ por USD');
      insertParam.run('tarifa_flete_cents_lb', '650', 'integer', 'Tarifa flete aéreo USD/lb');
      insertParam.run('flete_minimo_usd_cents', '1500', 'integer', 'Flete mínimo por paquete');
      insertParam.run('otros_costos_fijos_usd_cents', '1000', 'integer', 'Casillero y handling fijo por envío USD');
      insertParam.run('umbral_arancel_excedente_usd_cents', '5000', 'integer', 'Exoneración aduana USD 50');
      insertParam.run('arancel_default_bp', '3000', 'integer', 'Arancel por defecto 30%');
      insertParam.run('tax_usa_default_bp', '700', 'integer', 'Tax USA por defecto 7%');
      insertParam.run('comision_minima_cotizacion_cor_cents', '30000', 'integer', 'Comisión mínima por cotización C$300');
      insertParam.run('anticipo_default_bp', '5000', 'integer', 'Anticipo por defecto 50%');
      insertParam.run('saldo_inicial_bancos_cor_cents', '0', 'integer', 'Saldo inicial en bancos');
      insertParam.run('cuentas_bancarias', '[]', 'json', 'Cuentas bancarias para cotizaciones');
      insertParam.run('onboarding_completado', '0', 'boolean', 'Estado de configuración inicial');
      insertParam.run('ruta_backup_configurada', '', 'text', 'Ruta de respaldos SQLite');

      db.pragma('user_version = 1');
    })();
  }
}
