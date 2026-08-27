import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => './data',
  },
  ipcMain: {
    handle: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
}));

import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { runMigrations } from '../src/main/db/migrations';
import { ParametrosRepo } from '../src/main/db/repositories/parametros.repo';
import { ClientesRepo } from '../src/main/db/repositories/clientes.repo';
import { CotizacionesRepo } from '../src/main/db/repositories/cotizaciones.repo';
import { PedidosRepo } from '../src/main/db/repositories/pedidos.repo';
import { PagosRepo } from '../src/main/db/repositories/pagos.repo';
import { EventosRepo } from '../src/main/db/repositories/eventos.repo';
import { VistasRepo } from '../src/main/db/repositories/vistas.repo';
import { setDbInstance } from '../src/main/db/database';

describe('Prueba de Humo Integral - Fase 1 (Cotizar y Cobrar)', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Base de datos SQLite en memoria para pruebas de integración aisladas
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    // Set custom db instance
    setDbInstance(db);
  });

  it('flujo completo: parámetros -> cliente -> cotización multítem -> pedido -> pago in-situ -> semáforo verde -> auditoría y deshacer', () => {
    // 1. Guardar y verificar parámetros iniciales del asistente
    ParametrosRepo.guardarParametrosIniciales({
      cuentas_bancarias: [
        { banco: 'BAC Credomatic', numero: '360-123456-7', titular: 'Rossana Espinoza', moneda: 'COR' },
        { banco: 'Banpro', numero: '100-987654-3', titular: 'Rossana Espinoza', moneda: 'USD' },
      ],
      tarifa_flete_usd: 6.5,
      flete_minimo_usd: 15.0,
      otros_costos_fijos_usd: 10.0,
      arancel_default_porcentaje: 32.5,
      comisiones_categoria: [
        { categoria_id: 1, porcentaje: 35 },
        { categoria_id: 2, porcentaje: 35 },
        { categoria_id: 3, porcentaje: 30 },
        { categoria_id: 4, porcentaje: 25 },
        { categoria_id: 5, porcentaje: 30 },
      ],
      saldo_inicial_bancos_cor: 25000,
    });

    const params = ParametrosRepo.getParametros();
    expect(params.tasa_cambio_oficial_cents).toBe(3662);
    expect(params.comision_minima_cotizacion_cor_cents).toBe(30000);
    expect(params.otros_costos_fijos_usd_cents).toBe(1000);
    expect(params.cuentas_bancarias.length).toBe(2);

    // 2. Crear Cliente
    const grupoCliente = crypto.randomUUID();
    const cliente = ClientesRepo.create(
      {
        nombre: 'Valeria Chamorro',
        telefono: '8888-1234',
        ciudad: 'León',
        direccion: 'De la iglesia La Recolección 1c al norte',
        incumplio_anteriormente: false,
      },
      grupoCliente
    );
    expect(cliente.id).toBeDefined();
    expect(cliente.nombre).toBe('Valeria Chamorro');

    // 3. Crear Cotización Multítem (1 perfume de $128 1.5lb + 1 labial de $32 0.3lb)
    const grupoCot = crypto.randomUUID();
    const cotizacion = CotizacionesRepo.create(
      {
        cliente_id: cliente.id,
        anticipo_bp: 5000, // 50%
        notas: 'Entrega en León centro',
        items: [
          {
            descripcion: 'Dior Sauvage 100ml',
            precio_usa_usd_cents: 12800,
            peso_mlb: 1500,
          },
          {
            descripcion: 'Labial Fenty Beauty',
            precio_usa_usd_cents: 3200,
            peso_mlb: 300,
          },
        ],
      },
      grupoCot
    );

    expect(cotizacion.id).toBeDefined();
    expect(cotizacion.items.length).toBe(2);
    expect(cotizacion.total_cor_cents).toBeGreaterThan(0);
    expect(cotizacion.anticipo_total_cor_cents).toBeGreaterThan(0);

    // 4. Convertir Cotización a Pedido
    const grupoPed = crypto.randomUUID();
    const pedido = CotizacionesRepo.convertirAPedido(cotizacion.id, grupoPed);

    expect(pedido.id).toBeDefined();
    expect(pedido.codigo).toMatch(/^PED-/);
    expect(pedido.anticipo_verificado).toBe(false); // Semáforo Rojo inicial
    expect(pedido.items.length).toBe(2);

    // 5. El semáforo bloquea el paso a EN_LISTA_USA si no hay anticipo verificado
    expect(() => {
      PedidosRepo.cambiarEstadoItem(
        pedido.items[0].id,
        'EN_LISTA_USA',
        crypto.randomUUID(),
        'Intento sin anticipo'
      );
    }).toThrow(/anticipo verificado/i);

    // 6. Registrar y Verificar Pago In-Situ (U2)
    const grupoPago = crypto.randomUUID();
    const pago = PagosRepo.create(
      {
        pedido_id: pedido.id,
        monto_cents: pedido.anticipo_esperado_cor_cents,
        moneda_pago: 'COR',
        metodo_pago: 'TRANSFERENCIA_BAC',
        referencia: 'BAC-982341',
        tipo_pago: 'ANTICIPO',
        verificado: true, // Verificado de inmediato
      },
      grupoPago
    );

    expect(pago.id).toBeDefined();
    expect(pago.verificado).toBe(true);

    // 7. El pedido ahora tiene anticipo_verificado = 1 (Semáforo Verde)
    const pedidoActualizado = PedidosRepo.getById(pedido.id);
    expect(pedidoActualizado?.anticipo_verificado).toBe(true);
    expect(pedidoActualizado?.saldo_pendiente_cor_cents).toBe(
      pedido.total_cor_cents - pedido.anticipo_esperado_cor_cents
    );

    // 8. Ahora sí permite avanzar a EN_LISTA_USA
    const grupoEstado = crypto.randomUUID();
    PedidosRepo.cambiarEstadoItem(
      pedido.items[0].id,
      'EN_LISTA_USA',
      grupoEstado,
      'Anticipo verificado en BAC'
    );

    const itemActualizado = PedidosRepo.getById(pedido.id)?.items.find(
      (i) => i.id === pedido.items[0].id
    );
    expect(itemActualizado?.estado).toBe('EN_LISTA_USA');

    // 9. Verificar datos de HoyView (U1, A2)
    const hoyData = VistasRepo.getHoyData();
    expect(hoyData.total_anticipos_recibidos_cor_cents).toBe(
      pedido.anticipo_esperado_cor_cents
    );
    expect(hoyData.total_saldos_por_cobrar_cor_cents).toBe(
      pedido.total_cor_cents - pedido.anticipo_esperado_cor_cents
    );

    // 10. Deshacer última acción (U4)
    const resultadoDeshacer = EventosRepo.deshacerUltimoGrupo();
    expect(resultadoDeshacer.revertido).toBe(true);

    const itemRevertido = PedidosRepo.getById(pedido.id)?.items.find(
      (i) => i.id === pedido.items[0].id
    );
    expect(itemRevertido?.estado).toBe('ANTICIPO_OK');
  });

  it('siembra los costos que el negocio no paga en cero', () => {
    const params = ParametrosRepo.getParametros();

    expect(params.otros_costos_fijos_usd_cents).toBe(0);
    expect(params.flete_minimo_usd_cents).toBe(0);
    expect(params.arancel_default_bp).toBe(0);

    const categorias = ParametrosRepo.getCategorias();
    expect(categorias.length).toBeGreaterThan(0);
    for (const cat of categorias) {
      expect(cat.arancel_estimado_bp).toBe(0);
    }
  });
});
