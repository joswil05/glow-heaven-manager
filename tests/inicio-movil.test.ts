/**
 * Inicio del celular (INI-1, INI-2): la parte pura. Quién debe cuánto, qué
 * encargos esperan a Ross, los dos totales de 7 días y lo último.
 */
import { describe, it, expect } from 'vitest';
import type { FilaPorCobrar, PagoCompleto, Venta } from '../src/shared/types';
import type { EtapaEncargo } from '../src/core/encargos';
import { deudasPorClienta, dosSemanas, textoEncargosDeInicio, ultimosMovimientos } from '../mobile/src/lib/inicio';

function fila(p: Partial<FilaPorCobrar> & Pick<FilaPorCobrar, 'venta_id' | 'saldo_usd_cents'>): FilaPorCobrar {
  return {
    codigo: `V-${p.venta_id}`,
    fecha: '2026-10-01',
    tipo: 'CONTADO' as FilaPorCobrar['tipo'],
    estado: 'ENTREGADA' as FilaPorCobrar['estado'],
    cliente_nombre: 'Ana',
    total_usd_cents: p.saldo_usd_cents,
    pagado_usd_cents: 0,
    cuotas_vencidas: 0,
    ...p,
  };
}

function fases(p: Partial<Record<EtapaEncargo, number>> = {}): Record<EtapaEncargo, number> {
  return {
    POR_BUSCAR: 0, POR_MANDAR: 0, ESPERANDO: 0, POR_COMPRAR: 0,
    EN_CAMINO: 0, POR_ENTREGAR: 0, ENTREGADO: 0, ANULADO: 0,
    ...p,
  };
}

describe('deudasPorClienta', () => {
  it('suma las ventas de una misma clienta y pone primero a la que más debe', () => {
    const deudas = deudasPorClienta([
      fila({ venta_id: 1, cliente_id: 7, cliente_nombre: 'Ana', saldo_usd_cents: 3000, fecha: '2026-10-05' }),
      fila({ venta_id: 2, cliente_id: 9, cliente_nombre: 'Berta', saldo_usd_cents: 4000 }),
      fila({ venta_id: 3, cliente_id: 7, cliente_nombre: 'Ana', saldo_usd_cents: 2500, fecha: '2026-10-01', cuotas_vencidas: 1 }),
    ]);
    expect(deudas.map((d) => [d.nombre, d.saldo_usd_cents])).toEqual([['Ana', 5500], ['Berta', 4000]]);
    expect(deudas[0].ventas.map((v) => v.venta_id)).toEqual([3, 1]);
    expect(deudas[0].cuotas_vencidas).toBe(1);
  });

  it('toma el teléfono de cualquiera de sus ventas y no cuenta lo ya pagado', () => {
    const deudas = deudasPorClienta([
      fila({ venta_id: 1, cliente_id: 7, saldo_usd_cents: 1000 }),
      fila({ venta_id: 2, cliente_id: 7, saldo_usd_cents: 500, cliente_telefono: '88887777' }),
      fila({ venta_id: 3, cliente_id: 8, cliente_nombre: 'Carla', saldo_usd_cents: 0 }),
    ]);
    expect(deudas).toHaveLength(1);
    expect(deudas[0].telefono).toBe('88887777');
  });

  it('sin número de clienta agrupa por nombre', () => {
    const deudas = deudasPorClienta([
      fila({ venta_id: 1, cliente_nombre: 'Dora ', saldo_usd_cents: 100 }),
      fila({ venta_id: 2, cliente_nombre: 'dora', saldo_usd_cents: 200 }),
    ]);
    expect(deudas).toHaveLength(1);
    expect(deudas[0].saldo_usd_cents).toBe(300);
  });
});

describe('textoEncargosDeInicio', () => {
  it('dice sólo lo que espera a Ross, en el orden en que pasa', () => {
    expect(textoEncargosDeInicio(fases({ POR_ENTREGAR: 1, ESPERANDO: 3, POR_BUSCAR: 2 }))).toBe(
      '2 por cotizar · 1 por entregar'
    );
  });

  it('si todo espera a otros, lo dice sin pedirle nada', () => {
    expect(textoEncargosDeInicio(fases({ ESPERANDO: 2, EN_CAMINO: 1 }))).toBe('Nada espera por vos · 3 en curso');
    expect(textoEncargosDeInicio(fases())).toBe('No hay encargos en curso');
  });
});

describe('dosSemanas', () => {
  it('suma los últimos 7 días y los 7 de antes', () => {
    const serie = Array.from({ length: 14 }, (_, i) => ({ total_usd_cents: i < 7 ? 100 : 1000 }));
    expect(dosSemanas(serie)).toEqual({ ultimos7: 7000, anteriores7: 700 });
  });

  it('con menos de 14 días no inventa la semana de antes', () => {
    expect(dosSemanas([{ total_usd_cents: 500 }])).toEqual({ ultimos7: 500, anteriores7: 0 });
  });
});

describe('ultimosMovimientos', () => {
  it('mezcla ventas y abonos con el orden del Historial y corta en cinco', () => {
    const ventas = [1, 2, 3, 4].map(
      (id) => ({ id, codigo: `V-${id}`, fecha: `2026-10-0${id}`, estado: 'ENTREGADA', cliente_nombre: 'Ana' }) as unknown as Venta
    );
    const pagos = [5, 6].map(
      (id) => ({ id, venta_codigo: 'V-1', fecha: `2026-10-0${id}`, cliente_nombre: '' }) as unknown as PagoCompleto
    );
    const ultimos = ultimosMovimientos(ventas, pagos);
    expect(ultimos.map((m) => m.clave)).toEqual(['p-6', 'p-5', 'v-4', 'v-3', 'v-2']);
    expect(ultimos[0].titulo).toBe('Mostrador');
  });

  it('marca la venta anulada', () => {
    const [m] = ultimosMovimientos(
      [{ id: 1, codigo: 'V-1', fecha: '2026-10-01', estado: 'CANCELADA' } as unknown as Venta],
      []
    );
    expect(m.cancelada).toBe(true);
  });
});
