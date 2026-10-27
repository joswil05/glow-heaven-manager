/**
 * Clientas en el celular (U4): lo puro. "Te deben" por clienta con su última
 * compra, lo que ya pagó y la historia de su ficha.
 */
import { describe, it, expect } from 'vitest';
import type { ClienteDetalle, FilaPorCobrar, PagoCompleto, Venta } from '../src/shared/types';
import { filasTeDeben, historiaDeClienta, pagadoPorClienta } from '../mobile/src/lib/clientas';

function fila(p: Partial<FilaPorCobrar> & Pick<FilaPorCobrar, 'venta_id' | 'saldo_usd_cents'>): FilaPorCobrar {
  return {
    codigo: `V-${p.venta_id}`,
    fecha: '2026-10-01',
    tipo: 'INVENTARIO' as FilaPorCobrar['tipo'],
    estado: 'ENTREGADA' as FilaPorCobrar['estado'],
    cliente_nombre: 'Ana',
    total_usd_cents: p.saldo_usd_cents,
    pagado_usd_cents: 0,
    cuotas_vencidas: 0,
    ...p,
  };
}

describe('filasTeDeben', () => {
  it('una fila por clienta, con la última compra de su ficha y si está vencida', () => {
    const filas = filasTeDeben(
      [
        fila({ venta_id: 1, cliente_id: 7, saldo_usd_cents: 3000, fecha: '2026-10-02', cuotas_vencidas: 1 }),
        fila({ venta_id: 2, cliente_id: 7, saldo_usd_cents: 1000, fecha: '2026-10-05' }),
        fila({ venta_id: 3, cliente_id: 9, cliente_nombre: 'Berta', saldo_usd_cents: 5000, fecha: '2026-09-20' }),
      ],
      [{ id: 7, nombre: 'Ana', ultima_compra: '2026-10-09' } as ClienteDetalle]
    );
    expect(filas.map((f) => [f.nombre, f.saldo_usd_cents, f.ultima_compra, f.vencida])).toEqual([
      ['Berta', 5000, '2026-09-20', false],
      ['Ana', 4000, '2026-10-09', true],
    ]);
  });
});

describe('pagadoPorClienta', () => {
  it('lo comprado menos lo que debe, nunca negativo', () => {
    expect(pagadoPorClienta({ total_comprado_usd_cents: 10000, saldo_pendiente_usd_cents: 2500 })).toBe(7500);
    expect(pagadoPorClienta({ total_comprado_usd_cents: 0, saldo_pendiente_usd_cents: 500 })).toBe(0);
  });
});

describe('historiaDeClienta', () => {
  it('separa compras y pedidos, y pone lo más nuevo primero', () => {
    const v = (id: number, fecha: string, tipo: string) => ({ id, fecha, tipo }) as unknown as Venta;
    const p = (id: number, fecha: string) => ({ id, fecha }) as unknown as PagoCompleto;
    const h = historiaDeClienta(
      [v(1, '2026-10-01', 'INVENTARIO'), v(2, '2026-10-03', 'ENCARGO'), v(3, '2026-10-05', 'INVENTARIO')],
      [p(10, '2026-10-02'), p(11, '2026-10-06')]
    );
    expect(h.compras.map((x) => x.id)).toEqual([3, 1]);
    expect(h.pedidos.map((x) => x.id)).toEqual([2]);
    expect(h.abonos.map((x) => x.id)).toEqual([11, 10]);
  });
});
