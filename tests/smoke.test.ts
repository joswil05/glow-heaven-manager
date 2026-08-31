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
import { SCHEMA_SQL } from '../src/main/db/schema-raw';
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

  it('la migración 2 apaga solo lo que sigue en su semilla original y preserva la configuración del operador', () => {
    // Base de datos independiente: reconstruye a mano el estado v1 tal como lo
    // dejaba la semilla ORIGINAL (previa a esta tarea), para probar el guard de
    // la migración 2 en un salto real v1 -> v2, no en una base ya sembrada en cero.
    const rawDb = new Database(':memory:');
    rawDb.pragma('journal_mode = WAL');
    rawDb.pragma('foreign_keys = ON');
    rawDb.exec(SCHEMA_SQL);

    const insertCat = rawDb.prepare(`
      INSERT INTO categorias (nombre, comision_defecto_bp, arancel_estimado_bp, redondeo_cor_cents, activa)
      VALUES (?, ?, ?, ?, 1)
    `);
    insertCat.run('Perfumería', 3500, 3500, 5000);
    insertCat.run('Maquillaje', 3500, 3000, 5000);
    insertCat.run('Skincare', 3000, 3000, 5000);
    insertCat.run('Calzado', 2500, 3000, 10000);
    insertCat.run('Accesorios', 3000, 3000, 5000);

    const insertParam = rawDb.prepare(`
      INSERT INTO parametros (clave, valor, tipo, descripcion)
      VALUES (?, ?, ?, ?)
    `);
    insertParam.run('flete_minimo_usd_cents', '1500', 'integer', 'Flete mínimo por paquete');
    insertParam.run(
      'otros_costos_fijos_usd_cents',
      '1000',
      'integer',
      'Casillero y handling fijo por envío USD'
    );
    insertParam.run('arancel_default_bp', '3000', 'integer', 'Arancel por defecto 30%');

    rawDb.pragma('user_version = 1');

    // El operador ya había ajustado dos valores a mano ANTES de actualizar la app.
    // El arancel de Perfumería se fija en 3000: es un valor redondo plausible que el
    // operador pudo elegir, y coincide con el sembrado de OTRAS categorías (no el
    // propio de Perfumería, que era 3500). Un guard por conjunto de valores lo
    // apagaría igual; el guard por fila no debe hacerlo.
    rawDb
      .prepare(`UPDATE parametros SET valor = '2000' WHERE clave = 'flete_minimo_usd_cents'`)
      .run();
    rawDb
      .prepare(`UPDATE categorias SET arancel_estimado_bp = 3000 WHERE nombre = 'Perfumería'`)
      .run();

    runMigrations(rawDb);

    expect(rawDb.pragma('user_version', { simple: true })).toBe(2);

    const parametros = new Map(
      (
        rawDb.prepare('SELECT clave, valor FROM parametros').all() as {
          clave: string;
          valor: string;
        }[]
      ).map((r) => [r.clave, r.valor])
    );
    // No tocados por el operador: siguen en su semilla -> se apagan.
    expect(parametros.get('otros_costos_fijos_usd_cents')).toBe('0');
    expect(parametros.get('arancel_default_bp')).toBe('0');
    // Configuración del operador: sobrevive intacta.
    expect(parametros.get('flete_minimo_usd_cents')).toBe('2000');

    const categorias = new Map(
      (
        rawDb.prepare('SELECT nombre, arancel_estimado_bp FROM categorias').all() as {
          nombre: string;
          arancel_estimado_bp: number;
        }[]
      ).map((c) => [c.nombre, c.arancel_estimado_bp])
    );
    // No tocadas por el operador: siguen en su semilla -> se apagan.
    expect(categorias.get('Maquillaje')).toBe(0);
    expect(categorias.get('Skincare')).toBe(0);
    expect(categorias.get('Calzado')).toBe(0);
    expect(categorias.get('Accesorios')).toBe(0);
    // Configuración del operador: sobrevive intacta, aunque coincide con el valor
    // sembrado de otras categorías.
    expect(categorias.get('Perfumería')).toBe(3000);

    // Reejecutar la migración sobre el resultado ya migrado no debe cambiar nada.
    const snapshotParams = new Map(parametros);
    const snapshotCats = new Map(categorias);
    runMigrations(rawDb);

    expect(rawDb.pragma('user_version', { simple: true })).toBe(2);
    const parametrosDespues = new Map(
      (
        rawDb.prepare('SELECT clave, valor FROM parametros').all() as {
          clave: string;
          valor: string;
        }[]
      ).map((r) => [r.clave, r.valor])
    );
    for (const [clave, valor] of snapshotParams) {
      expect(parametrosDespues.get(clave)).toBe(valor);
    }
    const categoriasDespues = new Map(
      (
        rawDb.prepare('SELECT nombre, arancel_estimado_bp FROM categorias').all() as {
          nombre: string;
          arancel_estimado_bp: number;
        }[]
      ).map((c) => [c.nombre, c.arancel_estimado_bp])
    );
    for (const [nombre, valor] of snapshotCats) {
      expect(categoriasDespues.get(nombre)).toBe(valor);
    }

    rawDb.close();
  });

  it('permite actualizar las tasas de una categoría y registra el evento', () => {
    const categorias = ParametrosRepo.getCategorias();
    const perfumeria = categorias.find((c) => c.nombre === 'Perfumería');
    expect(perfumeria).toBeDefined();

    const anterior = {
      comision_defecto_bp: perfumeria!.comision_defecto_bp,
      arancel_estimado_bp: perfumeria!.arancel_estimado_bp,
      redondeo_cor_cents: perfumeria!.redondeo_cor_cents,
    };

    const grupoId = crypto.randomUUID();
    ParametrosRepo.actualizarCategorias(
      [
        {
          id: perfumeria!.id,
          comision_defecto_bp: 2000,
          arancel_estimado_bp: 0,
          redondeo_cor_cents: 5000,
        },
      ],
      grupoId
    );

    const despues = ParametrosRepo.getCategorias().find((c) => c.id === perfumeria!.id);
    expect(despues!.comision_defecto_bp).toBe(2000);
    expect(despues!.arancel_estimado_bp).toBe(0);
    expect(despues!.redondeo_cor_cents).toBe(5000);

    // El evento de auditoría debe quedar escrito con el snapshot exacto que
    // la Tarea 10 (deshacer) consumirá: entidad_id = id de la categoría, y
    // valor_anterior/valor_nuevo con exactamente estos tres campos.
    const evento = db
      .prepare('SELECT * FROM eventos WHERE evento_grupo_id = ?')
      .get(grupoId) as {
      evento_grupo_id: string;
      entidad_tipo: string;
      entidad_id: number;
      tipo_evento: string;
      valor_anterior: string;
      valor_nuevo: string;
    };

    expect(evento).toBeDefined();
    expect(evento.entidad_tipo).toBe('CATEGORIA');
    expect(evento.entidad_id).toBe(perfumeria!.id);
    expect(evento.tipo_evento).toBe('ACTUALIZACION');
    expect(JSON.parse(evento.valor_anterior)).toEqual(anterior);
    expect(JSON.parse(evento.valor_nuevo)).toEqual({
      comision_defecto_bp: 2000,
      arancel_estimado_bp: 0,
      redondeo_cor_cents: 5000,
    });
  });

  it('un id desconocido en el lote revierte los cambios válidos ya aplicados en ese mismo lote', () => {
    const categorias = ParametrosRepo.getCategorias();
    const maquillaje = categorias.find((c) => c.nombre === 'Maquillaje');
    expect(maquillaje).toBeDefined();

    const antes = {
      comision_defecto_bp: maquillaje!.comision_defecto_bp,
      arancel_estimado_bp: maquillaje!.arancel_estimado_bp,
      redondeo_cor_cents: maquillaje!.redondeo_cor_cents,
    };

    const idInexistente = 999999;
    const grupoId = crypto.randomUUID();

    expect(() =>
      ParametrosRepo.actualizarCategorias(
        [
          {
            id: maquillaje!.id,
            comision_defecto_bp: 1000,
            arancel_estimado_bp: 500,
            redondeo_cor_cents: 2500,
          },
          {
            id: idInexistente,
            comision_defecto_bp: 1000,
            arancel_estimado_bp: 500,
            redondeo_cor_cents: 2500,
          },
        ],
        grupoId
      )
    ).toThrow(`Categoría #${idInexistente} no encontrada`);

    // La categoría válida procesada ANTES del id inexistente no debe quedar
    // parcialmente actualizada: la transacción revierte todo el lote.
    const despues = ParametrosRepo.getCategorias().find((c) => c.id === maquillaje!.id);
    expect(despues!.comision_defecto_bp).toBe(antes.comision_defecto_bp);
    expect(despues!.arancel_estimado_bp).toBe(antes.arancel_estimado_bp);
    expect(despues!.redondeo_cor_cents).toBe(antes.redondeo_cor_cents);
  });

  it('un lote revertido por un id desconocido no deja eventos de auditoría a medias', () => {
    const categorias = ParametrosRepo.getCategorias();
    const skincare = categorias.find((c) => c.nombre === 'Skincare');
    expect(skincare).toBeDefined();

    const idInexistente = 999999;
    const grupoId = crypto.randomUUID();

    expect(() =>
      ParametrosRepo.actualizarCategorias(
        [
          {
            id: skincare!.id,
            comision_defecto_bp: 1500,
            arancel_estimado_bp: 750,
            redondeo_cor_cents: 3000,
          },
          {
            id: idInexistente,
            comision_defecto_bp: 1500,
            arancel_estimado_bp: 750,
            redondeo_cor_cents: 3000,
          },
        ],
        grupoId
      )
    ).toThrow(`Categoría #${idInexistente} no encontrada`);

    // Un lote que nunca se aplicó no debe dejar rastro de auditoría: ni
    // siquiera el evento de la categoría válida procesada antes del error.
    const eventos = db
      .prepare('SELECT * FROM eventos WHERE evento_grupo_id = ?')
      .all(grupoId);
    expect(eventos.length).toBe(0);
  });

  it('un pago menor al anticipo esperado NO desbloquea la compra en USA', () => {
    const cliente = ClientesRepo.create(
      { nombre: 'Cliente Anticipo Insuficiente', telefono: '8888-1111', ciudad: 'León' },
      crypto.randomUUID()
    );
    const cotizacion = CotizacionesRepo.create(
      {
        cliente_id: cliente.id,
        anticipo_bp: 5000,
        items: [{ descripcion: 'Perfume Caro', precio_usa_usd_cents: 10000, peso_mlb: 1000 }],
      },
      crypto.randomUUID()
    );
    const pedido = CotizacionesRepo.convertirAPedido(cotizacion.id, crypto.randomUUID());
    expect(pedido.anticipo_esperado_cor_cents).toBeGreaterThan(10000);

    PagosRepo.create(
      {
        pedido_id: pedido.id,
        monto_cents: 10000, // C$100.00, menor al anticipo esperado
        moneda_pago: 'COR',
        metodo_pago: 'TRANSFERENCIA_BAC',
        verificado: true,
        tipo_pago: 'ANTICIPO',
      },
      crypto.randomUUID()
    );

    const pedidoActualizado = PedidosRepo.getById(pedido.id)!;
    expect(pedidoActualizado.anticipo_verificado).toBe(false);
  });

  it('un pago que alcanza el anticipo esperado SÍ desbloquea la compra', () => {
    const cliente = ClientesRepo.create(
      { nombre: 'Cliente Anticipo Suficiente', telefono: '8888-2222', ciudad: 'León' },
      crypto.randomUUID()
    );
    const cotizacion = CotizacionesRepo.create(
      {
        cliente_id: cliente.id,
        anticipo_bp: 5000,
        items: [{ descripcion: 'Perfume Caro', precio_usa_usd_cents: 10000, peso_mlb: 1000 }],
      },
      crypto.randomUUID()
    );
    const pedido = CotizacionesRepo.convertirAPedido(cotizacion.id, crypto.randomUUID());

    PagosRepo.create(
      {
        pedido_id: pedido.id,
        monto_cents: pedido.anticipo_esperado_cor_cents,
        moneda_pago: 'COR',
        metodo_pago: 'TRANSFERENCIA_BAC',
        verificado: true,
        tipo_pago: 'ANTICIPO',
      },
      crypto.randomUUID()
    );

    const pedidoActualizado = PedidosRepo.getById(pedido.id)!;
    expect(pedidoActualizado.anticipo_verificado).toBe(true);
  });

  it('verificar dos veces el mismo pago no descuenta el saldo dos veces', () => {
    const cliente = ClientesRepo.create(
      { nombre: 'Cliente Doble Verificacion', telefono: '8888-3333', ciudad: 'León' },
      crypto.randomUUID()
    );
    const cotizacion = CotizacionesRepo.create(
      {
        cliente_id: cliente.id,
        anticipo_bp: 5000,
        items: [{ descripcion: 'Perfume Caro', precio_usa_usd_cents: 10000, peso_mlb: 1000 }],
      },
      crypto.randomUUID()
    );
    const pedido = CotizacionesRepo.convertirAPedido(cotizacion.id, crypto.randomUUID());
    const saldoInicial = PedidosRepo.getById(pedido.id)!.saldo_pendiente_cor_cents;

    const pago = PagosRepo.create(
      {
        pedido_id: pedido.id,
        monto_cents: 100000,
        moneda_pago: 'COR',
        metodo_pago: 'TRANSFERENCIA_BAC',
        verificado: false,
        tipo_pago: 'SALDO',
      },
      crypto.randomUUID()
    );

    PagosRepo.verificar(pago.id, true, crypto.randomUUID());
    const saldoDespues = PedidosRepo.getById(pedido.id)!.saldo_pendiente_cor_cents;

    PagosRepo.verificar(pago.id, true, crypto.randomUUID());
    const saldoFinal = PedidosRepo.getById(pedido.id)!.saldo_pendiente_cor_cents;

    expect(saldoDespues).toBe(saldoInicial - 100000);
    expect(saldoFinal).toBe(saldoDespues); // la segunda no cambia nada
  });

  it('registra el excedente cuando el cliente paga de más', () => {
    const cliente = ClientesRepo.create(
      { nombre: 'Cliente Sobrepago', telefono: '8888-4444', ciudad: 'León' },
      crypto.randomUUID()
    );
    const cotizacion = CotizacionesRepo.create(
      {
        cliente_id: cliente.id,
        anticipo_bp: 5000,
        items: [{ descripcion: 'Producto C$1,000', precio_usa_usd_cents: 2000, peso_mlb: 500 }],
      },
      crypto.randomUUID()
    );
    const pedido = CotizacionesRepo.convertirAPedido(cotizacion.id, crypto.randomUUID());
    const saldo = pedido.saldo_pendiente_cor_cents;

    const pago = PagosRepo.create(
      {
        pedido_id: pedido.id,
        monto_cents: saldo + 50000, // C$500 de más
        moneda_pago: 'COR',
        metodo_pago: 'EFECTIVO',
        verificado: true,
        tipo_pago: 'SALDO',
      },
      crypto.randomUUID()
    );

    const pedidoActualizado = PedidosRepo.getById(pedido.id)!;
    expect(pedidoActualizado.saldo_pendiente_cor_cents).toBe(0);

    // El excedente debe quedar registrado en el evento, no evaporarse
    const evento = db
      .prepare("SELECT * FROM eventos WHERE entidad_tipo = 'PAGO' AND entidad_id = ? ORDER BY id DESC LIMIT 1")
      .get(pago.id) as { detalle: string };
    expect(evento.detalle).toContain('excedente');
  });

  it('deshacer un tipo de entidad desconocido NO reporta exito ni borra la auditoria', () => {
    const grupoId = crypto.randomUUID();
    EventosRepo.registrarEvento({
      evento_grupo_id: grupoId,
      entidad_tipo: 'CATEGORIA',
      entidad_id: 1,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: { comision_defecto_bp: 3500 },
      valor_nuevo: { comision_defecto_bp: 2000 },
      detalle: 'prueba',
    });

    const res = EventosRepo.deshacerUltimoGrupo();
    expect(res.revertido).toBe(false);

    // La auditoria debe seguir ahi: no se borra lo que no se revirtio
    const quedan = db
      .prepare('SELECT COUNT(*) AS n FROM eventos WHERE evento_grupo_id = ?')
      .get(grupoId) as { n: number };
    expect(quedan.n).toBe(1);
  });

  it('deshacer la verificacion de un pago devuelve el saldo al pedido', () => {
    const cliente = ClientesRepo.create(
      { nombre: 'Cliente Deshacer Pago', telefono: '8888-5555', ciudad: 'León' },
      crypto.randomUUID()
    );
    const cotizacion = CotizacionesRepo.create(
      {
        cliente_id: cliente.id,
        anticipo_bp: 5000,
        items: [{ descripcion: 'Perfume Caro', precio_usa_usd_cents: 10000, peso_mlb: 1000 }],
      },
      crypto.randomUUID()
    );
    const pedido = CotizacionesRepo.convertirAPedido(cotizacion.id, crypto.randomUUID());
    const saldoInicial = PedidosRepo.getById(pedido.id)!.saldo_pendiente_cor_cents;

    const pago = PagosRepo.create(
      {
        pedido_id: pedido.id,
        monto_cents: 100000,
        moneda_pago: 'COR',
        metodo_pago: 'EFECTIVO',
        verificado: false,
        tipo_pago: 'SALDO',
      },
      crypto.randomUUID()
    );

    const grupoVerificacion = crypto.randomUUID();
    PagosRepo.verificar(pago.id, true, grupoVerificacion);
    expect(PedidosRepo.getById(pedido.id)!.saldo_pendiente_cor_cents).toBe(saldoInicial - 100000);

    EventosRepo.deshacerUltimoGrupo();
    expect(PedidosRepo.getById(pedido.id)!.saldo_pendiente_cor_cents).toBe(saldoInicial);
  });

  it('deshacer con grupo especifico revierte ESE grupo y no el mas reciente', () => {
    const cliente = ClientesRepo.create(
      { nombre: 'Cliente Dos Grupos', telefono: '8888-6666', ciudad: 'León' },
      crypto.randomUUID()
    );
    const cotizacion = CotizacionesRepo.create(
      {
        cliente_id: cliente.id,
        anticipo_bp: 5000,
        items: [{ descripcion: 'Producto A', precio_usa_usd_cents: 1000, peso_mlb: 500 }],
      },
      crypto.randomUUID()
    );
    const pedido = CotizacionesRepo.convertirAPedido(cotizacion.id, crypto.randomUUID());

    const grupoViejo = crypto.randomUUID();
    const pagoViejo = PagosRepo.create(
      {
        pedido_id: pedido.id,
        monto_cents: 10000,
        moneda_pago: 'COR',
        metodo_pago: 'EFECTIVO',
        verificado: true,
        tipo_pago: 'SALDO',
      },
      grupoViejo
    );

    const grupoNuevo = crypto.randomUUID();
    const pagoNuevo = PagosRepo.create(
      {
        pedido_id: pedido.id,
        monto_cents: 20000,
        moneda_pago: 'COR',
        metodo_pago: 'EFECTIVO',
        verificado: true,
        tipo_pago: 'SALDO',
      },
      grupoNuevo
    );

    // Revertir explicitamente el grupo viejo
    const res = EventosRepo.deshacerUltimoGrupo(grupoViejo);
    expect(res.revertido).toBe(true);

    // El pago viejo debe estar inactivo, el nuevo sigue activo
    const pV = db.prepare('SELECT activo FROM pagos WHERE id = ?').get(pagoViejo.id) as { activo: number };
    const pN = db.prepare('SELECT activo FROM pagos WHERE id = ?').get(pagoNuevo.id) as { activo: number };
    expect(pV.activo).toBe(0);
    expect(pN.activo).toBe(1);
  });

  it('deshacer la conversion de cotizacion a pedido reactiva la cotizacion como convertible', () => {
    const cliente = ClientesRepo.create(
      { nombre: 'Cliente Deshacer Conversion', telefono: '8888-7777', ciudad: 'León' },
      crypto.randomUUID()
    );
    const cotizacion = CotizacionesRepo.create(
      {
        cliente_id: cliente.id,
        anticipo_bp: 5000,
        items: [{ descripcion: 'Perfume Convertible', precio_usa_usd_cents: 5000, peso_mlb: 500 }],
      },
      crypto.randomUUID()
    );

    const grupoConversion = crypto.randomUUID();
    const pedido = CotizacionesRepo.convertirAPedido(cotizacion.id, grupoConversion);

    // Deshacer la conversion
    EventosRepo.deshacerUltimoGrupo(grupoConversion);

    // La cotizacion debe estar en BORRADOR o ACEPTADA, no en un estado huerfano
    const cotActualizada = CotizacionesRepo.getById(cotizacion.id)!;
    expect(['BORRADOR', 'ACEPTADA', 'ENVIADA']).toContain(cotActualizada.estado);

    // Y se debe poder volver a convertir sin tirar error
    const nuevoPedido = CotizacionesRepo.convertirAPedido(cotizacion.id, crypto.randomUUID());
    expect(nuevoPedido.id).toBeGreaterThan(pedido.id);
  });
});
