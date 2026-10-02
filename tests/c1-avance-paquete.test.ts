/**
 * Fase C1: cómo va cada paquete, calculado de los lotes.
 *
 * Hasta la 2.17 el inventario avisaba "N productos agotados" para siempre: un
 * producto que se trajo una vez y se vendió quedaba de alerta. Ahora cada
 * paquete dice cuánto vendió y cuánto queda, y cuando no le queda nada pasa a
 * VENDIDO con su resumen.
 */
import { describe, it, expect } from 'vitest';
import type { Lote, Consumo } from '../src/shared/types';
import { avanceDePaquetes, type CompraParaAvance, type ProductoParaAvance, type VentaParaAvance } from '../src/core/avance-paquete';

function lote(extra: Partial<Lote> & Pick<Lote, 'id' | 'compra_id' | 'cantidad_inicial' | 'cantidad'>): Lote {
  const vendidas = extra.vendidas ?? extra.cantidad_inicial - extra.cantidad;
  return {
    variante_id: 1,
    costo_unitario_usd_cents: 500,
    fecha: '2026-09-16',
    orden: 1,
    origen: 'PAQUETE',
    valor_usd_cents: extra.cantidad * 500,
    vendidas,
    ingreso_usd_cents: vendidas * 1000,
    costo_vendido_usd_cents: vendidas * 500,
    bajas: 0,
    ...extra,
  };
}

const pq1: CompraParaAvance = { id: 1, codigo: 'PQ-0001', fecha: '2026-09-16', estado: 'RECIBIDA', activo: true, cerrado_en: '2026-09-17T00:38:22.812Z' };
const pq2: CompraParaAvance = { id: 2, codigo: 'PQ-0002', fecha: '2026-10-05', estado: 'RECIBIDA', activo: true };

function producto(id: number, nombre: string, lotes: Lote[]): ProductoParaAvance {
  return { id, nombre, variantes: [{ id: 1, producto_id: id, existencias: 0, activo: true }], lotes };
}

function consumo(compra_id: number, cantidad: number, ingreso: number): Consumo {
  return { lote_id: `pq${compra_id}-l1`, variante_id: 1, cantidad, costo_usd_cents: cantidad * 500, ingreso_usd_cents: ingreso, fecha: '2026-09-16', orden: 1, origen: 'PAQUETE', compra_id, costo_unitario_usd_cents: 500 };
}

function venta(extra: Partial<VentaParaAvance> & Pick<VentaParaAvance, 'id' | 'fecha'>): VentaParaAvance {
  return { codigo: `V-${String(extra.id).padStart(4, '0')}`, estado: 'ENTREGADA', activo: true, total_usd_cents: 1000, saldo_usd_cents: 0, cliente_nombre: 'Ana', lineas: [], ...extra };
}

describe('el avance de un paquete', () => {
  it('cuenta lo que entró, lo vendido, lo que queda y la plata, de sus lotes', () => {
    const [a] = avanceDePaquetes(
      [pq1],
      [
        producto(10, 'Gloss', [lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 3, cantidad: 1 })]),
        producto(11, 'Termo', [lote({ id: 'pq1-l2', compra_id: 1, cantidad_inicial: 2, cantidad: 0 })]),
      ],
      []
    );
    expect(a.estado).toBe('EN_VENTA');
    expect([a.unidades_recibidas, a.unidades_vendidas, a.unidades_quedan]).toEqual([5, 4, 1]);
    // Invertido: lo que vale lo que queda más lo que costó lo vendido.
    expect(a.invertido_usd_cents).toBe(2500);
    expect(a.vendido_usd_cents).toBe(4000);
    expect(a.ganancia_usd_cents).toBe(2000);
    expect(a.quedan).toEqual([{ producto_id: 10, nombre: 'Gloss', variante_id: 1, detalle: undefined, cantidad: 1 }]);
  });

  it('sin unidades en bodega está VENDIDO, con cuánto tardó y lo que se terminó primero', () => {
    const [a] = avanceDePaquetes(
      [pq1],
      [
        producto(10, 'Gloss', [lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 3, cantidad: 0 })]),
        producto(11, 'Termo', [lote({ id: 'pq1-l2', compra_id: 1, cantidad_inicial: 1, cantidad: 0 })]),
      ],
      [
        venta({ id: 1, fecha: '2026-09-20', lineas: [{ producto_id: 11, lotes_consumidos: [consumo(1, 1, 1000)] }] }),
        venta({ id: 2, fecha: '2026-09-30', lineas: [{ producto_id: 10, lotes_consumidos: [consumo(1, 3, 3000)] }] }),
      ]
    );
    expect(a.estado).toBe('VENDIDO');
    // Entró al inventario el 17/9 (cerrado_en) y la última venta fue el 30/9.
    expect(a.dias_en_venderse).toBe(13);
    expect(a.mas_rapidos.map((r) => [r.nombre, r.dias])).toEqual([['Termo', 3], ['Gloss', 13]]);
  });

  it('un producto que vino en dos paquetes cuenta en cada uno sólo lo suyo', () => {
    const avance = avanceDePaquetes(
      [pq1, pq2],
      [producto(10, 'Gloss', [
        lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 2, cantidad: 0 }),
        lote({ id: 'pq2-l1', compra_id: 2, cantidad_inicial: 4, cantidad: 4 }),
      ])],
      []
    );
    expect(avance.map((a) => [a.codigo, a.estado, a.unidades_quedan])).toEqual([
      ['PQ-0002', 'EN_VENTA', 4],
      ['PQ-0001', 'VENDIDO', 0],
    ]);
  });

  it('la deuda de una venta se reparte según lo que salió de cada paquete', () => {
    // Venta de $30: $10 de PQ-0001 y $20 de PQ-0002; debe $15.
    const v = venta({
      id: 5, fecha: '2026-10-06', total_usd_cents: 3000, saldo_usd_cents: 1500, cliente_nombre: 'Rayza',
      lineas: [{ producto_id: 10, lotes_consumidos: [consumo(1, 1, 1000), consumo(2, 1, 2000)] }],
    });
    const avance = avanceDePaquetes(
      [pq1, pq2],
      [producto(10, 'Gloss', [
        lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 1, cantidad: 0 }),
        lote({ id: 'pq2-l1', compra_id: 2, cantidad_inicial: 2, cantidad: 1 }),
      ])],
      [v]
    );
    const de = (codigo: string) => avance.find((a) => a.codigo === codigo)!;
    expect(de('PQ-0001').deudas).toEqual([{ venta_id: 5, codigo: 'V-0005', cliente_nombre: 'Rayza', pendiente_usd_cents: 500 }]);
    expect(de('PQ-0002').por_cobrar_usd_cents).toBe(1000);
    expect(de('PQ-0001').cobrado_usd_cents).toBe(de('PQ-0001').vendido_usd_cents - 500);
  });

  it('una venta anulada no deja deuda; un borrador y un paquete sólo de encargos no aparecen', () => {
    const anulada = venta({ id: 6, fecha: '2026-09-20', estado: 'CANCELADA', saldo_usd_cents: 1000, lineas: [{ producto_id: 10, lotes_consumidos: [consumo(1, 1, 1000)] }] });
    const borrador: CompraParaAvance = { id: 3, codigo: 'PQ-0003', fecha: '2026-10-01', estado: 'BORRADOR', activo: true };
    const soloEncargos: CompraParaAvance = { id: 4, codigo: 'PQ-0004', fecha: '2026-10-02', estado: 'RECIBIDA', activo: true };
    const avance = avanceDePaquetes(
      [pq1, borrador, soloEncargos],
      [producto(10, 'Gloss', [lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 2, cantidad: 1 })])],
      [anulada]
    );
    expect(avance.map((a) => a.codigo)).toEqual(['PQ-0001']);
    expect(avance[0].deudas).toEqual([]);
  });

  it('las bajas cuentan en lo invertido y no como vendidas', () => {
    const [a] = avanceDePaquetes(
      [pq1],
      [producto(10, 'Gloss', [lote({ id: 'pq1-l1', compra_id: 1, cantidad_inicial: 3, cantidad: 0, vendidas: 2, bajas: 1, valor_usd_cents: 0 })])],
      []
    );
    expect([a.unidades_vendidas, a.unidades_bajas, a.estado]).toEqual([2, 1, 'VENDIDO']);
    expect(a.invertido_usd_cents).toBe(1500);
    // Un producto que se terminó sin ventas de las que se sepa la fecha no
    // entra en "lo más rápido".
    expect(a.mas_rapidos).toEqual([]);
  });
});
