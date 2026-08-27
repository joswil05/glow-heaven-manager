import { getDb } from '../database';
import type {
  ParametrosSistema,
  Categoria,
  Tienda,
  CuentaBancariaJSON,
} from '../../../shared/types';
import type { GuardarParametrosInicialesInput } from '../../../shared/ipc-contracts';

export class ParametrosRepo {
  static getParametros(): ParametrosSistema {
    const db = getDb();
    const rows = db.prepare('SELECT clave, valor, tipo FROM parametros').all() as {
      clave: string;
      valor: string;
      tipo: string;
    }[];

    const map = new Map<string, string>();
    for (const r of rows) {
      map.set(r.clave, r.valor);
    }

    let cuentas: CuentaBancariaJSON[] = [];
    try {
      cuentas = JSON.parse(map.get('cuentas_bancarias') || '[]');
    } catch {
      cuentas = [];
    }

    return {
      tasa_cambio_oficial_cents: parseInt(map.get('tasa_cambio_oficial_cents') || '3662', 10),
      tarifa_flete_cents_lb: parseInt(map.get('tarifa_flete_cents_lb') || '650', 10),
      flete_minimo_usd_cents: parseInt(map.get('flete_minimo_usd_cents') || '0', 10),
      otros_costos_fijos_usd_cents: parseInt(
        map.get('otros_costos_fijos_usd_cents') || '0',
        10
      ),
      umbral_arancel_excedente_usd_cents: parseInt(
        map.get('umbral_arancel_excedente_usd_cents') || '5000',
        10
      ),
      arancel_default_bp: parseInt(map.get('arancel_default_bp') || '0', 10),
      tax_usa_default_bp: parseInt(map.get('tax_usa_default_bp') || '700', 10),
      comision_minima_cotizacion_cor_cents: parseInt(
        map.get('comision_minima_cotizacion_cor_cents') || '30000',
        10
      ),
      anticipo_default_bp: parseInt(map.get('anticipo_default_bp') || '5000', 10),
      saldo_inicial_bancos_cor_cents: parseInt(
        map.get('saldo_inicial_bancos_cor_cents') || '0',
        10
      ),
      saldo_inicial_fecha: map.get('saldo_inicial_fecha'),
      ruta_backup_configurada: map.get('ruta_backup_configurada') || '',
      cuentas_bancarias: cuentas,
      telefono_usuario: map.get('telefono_usuario') || '',
    };
  }

  static updateParametro(clave: string, valor: string): void {
    const db = getDb();
    db.prepare(`
      INSERT INTO parametros (clave, valor, actualizado_en)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, actualizado_en = CURRENT_TIMESTAMP
    `).run(clave, valor);
  }

  static guardarParametrosIniciales(input: GuardarParametrosInicialesInput): void {
    const db = getDb();
    db.transaction(() => {
      // 1. Cuentas bancarias
      if (input.cuentas_bancarias) {
        ParametrosRepo.updateParametro(
          'cuentas_bancarias',
          JSON.stringify(input.cuentas_bancarias)
        );
      }

      // 2. Fletes y aranceles
      ParametrosRepo.updateParametro(
        'tarifa_flete_cents_lb',
        Math.round(input.tarifa_flete_usd * 100).toString()
      );
      if (input.flete_minimo_usd !== undefined) {
        ParametrosRepo.updateParametro(
          'flete_minimo_usd_cents',
          Math.round(input.flete_minimo_usd * 100).toString()
        );
      }
      if (input.otros_costos_fijos_usd !== undefined) {
        ParametrosRepo.updateParametro(
          'otros_costos_fijos_usd_cents',
          Math.round(input.otros_costos_fijos_usd * 100).toString()
        );
      }
      ParametrosRepo.updateParametro(
        'arancel_default_bp',
        Math.round(input.arancel_default_porcentaje * 100).toString()
      );

      // 3. Saldo inicial
      ParametrosRepo.updateParametro(
        'saldo_inicial_bancos_cor_cents',
        Math.round(input.saldo_inicial_bancos_cor * 100).toString()
      );
      ParametrosRepo.updateParametro(
        'saldo_inicial_fecha',
        new Date().toISOString()
      );

      // 4. Ruta backup
      if (input.ruta_backup) {
        ParametrosRepo.updateParametro('ruta_backup_configurada', input.ruta_backup);
      }

      // 5. Teléfono
      if (input.telefono_usuario) {
        ParametrosRepo.updateParametro('telefono_usuario', input.telefono_usuario);
      }

      // 6. Comisiones por categoría
      if (input.comisiones_categoria && input.comisiones_categoria.length > 0) {
        const stmt = db.prepare(
          'UPDATE categorias SET comision_defecto_bp = ? WHERE id = ?'
        );
        for (const cat of input.comisiones_categoria) {
          stmt.run(Math.round(cat.porcentaje * 100), cat.categoria_id);
        }
      }

      ParametrosRepo.updateParametro('onboarding_completado', '1');
    })();
  }

  static getCategorias(): Categoria[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM categorias WHERE activa = 1 ORDER BY nombre ASC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      comision_defecto_bp: r.comision_defecto_bp,
      arancel_estimado_bp: r.arancel_estimado_bp,
      redondeo_cor_cents: r.redondeo_cor_cents,
      activa: Boolean(r.activa),
    }));
  }

  static getTiendas(): Tienda[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM tiendas WHERE activa = 1 ORDER BY nombre ASC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      url_base: r.url_base,
      tax_rate_bp: r.tax_rate_bp,
      activa: Boolean(r.activa),
    }));
  }
}
