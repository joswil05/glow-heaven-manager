/**
 * Fase 2 de la auditoría de interfaz: a qué ventas va un abono a la cuenta de
 * la clienta (TRA-02). La ventana lo muestra antes con esta función y el
 * repositorio registra con la misma; `tests/motor-real/fase2-auditoria.test.ts`
 * prueba que lo registrado es lo mostrado.
 */
import { describe, it, expect } from 'vitest';
import { repartirAbono, ventasPorAntiguedad } from '../src/core/reparto';

const vieja = { id: 1, codigo: 'V-0001', fecha: '2026-09-01', saldo_usd_cents: 5000, tasa_cambio_cents: 3600 };
const nueva = { id: 2, codigo: 'V-0002', fecha: '2026-09-20', saldo_usd_cents: 5000, tasa_cambio_cents: 3700 };

describe('el reparto de un abono a la cuenta', () => {
  it('paga primero la más vieja, aunque llegue en otro orden', () => {
    const partes = repartirAbono([nueva, vieja], 6000, 'USD');
    expect(partes.map((p) => [p.codigo, p.monto_cents, p.saldo_despues_usd_cents])).toEqual([
      ['V-0001', 5000, 0],
      ['V-0002', 1000, 4000],
    ]);
  });

  it('si alcanza para la primera, va toda a la primera', () => {
    expect(repartirAbono([vieja, nueva], 2000, 'USD').map((p) => p.codigo)).toEqual(['V-0001']);
  });

  it('en córdobas, contra lo que se debe en córdobas de cada venta, y suma lo pagado', () => {
    // $50 a 36.00 son C$1,800; lo que sobra de C$2,500 va a la de 37.00.
    const partes = repartirAbono([vieja, nueva], 250000, 'COR');
    expect(partes.map((p) => p.monto_cents)).toEqual([180000, 70000]);
    expect(partes.reduce((s, p) => s + p.monto_cents, 0)).toBe(250000);
    expect(partes[0].saldo_despues_usd_cents).toBe(0);
    // C$700 a 37.00 son $18.92.
    expect(partes[1].monto_usd_cents).toBe(1892);
    expect(partes[1].saldo_despues_usd_cents).toBe(3108);
  });

  it('lo que sobra queda en la última, como pago de más', () => {
    const partes = repartirAbono([vieja, nueva], 12000, 'USD');
    expect(partes[1].monto_cents).toBe(7000);
    expect(partes[1].saldo_despues_usd_cents).toBe(-2000);
  });

  it('las anuladas, las saldadas y las borradas no reciben nada', () => {
    const ventas = [
      { ...vieja, estado: 'CANCELADA' as const },
      { ...vieja, id: 3, codigo: 'V-0003', saldo_usd_cents: 0 },
      { ...vieja, id: 4, codigo: 'V-0004', activo: false },
      nueva,
    ];
    expect(ventasPorAntiguedad(ventas).map((v) => v.codigo)).toEqual(['V-0002']);
    expect(repartirAbono(ventas, 1000, 'USD').map((p) => p.codigo)).toEqual(['V-0002']);
  });

  it('sin ventas con saldo, no hay reparto', () => {
    expect(repartirAbono([], 1000, 'USD')).toEqual([]);
  });
});
