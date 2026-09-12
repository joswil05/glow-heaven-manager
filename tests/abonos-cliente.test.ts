import { describe, it, expect } from 'vitest';
import type { Cuota } from '../src/shared/types';

/**
 * Lógica pura de amortización FIFO de cuotas y saldos de clientes.
 */
function amortizarCuotas(cuotas: Cuota[], totalPagado: number): Cuota[] {
  let restante = totalPagado;
  return cuotas.map((c) => {
    const aplicado = Math.min(Math.max(0, restante), c.monto_usd_cents);
    restante -= aplicado;
    return { ...c, pagado_usd_cents: aplicado, vencida: aplicado < c.monto_usd_cents };
  });
}

function distribuirAbonoEnVentas(
  ventas: { id: number; codigo: string; saldo_usd_cents: number }[],
  montoAbonoUsd: number
): { ventaId: number; aplicado: number; nuevoSaldo: number }[] {
  let remanente = montoAbonoUsd;
  const resultados: { ventaId: number; aplicado: number; nuevoSaldo: number }[] = [];

  for (const v of ventas) {
    if (remanente <= 0) break;
    const aplicar = Math.min(remanente, v.saldo_usd_cents);
    resultados.push({
      ventaId: v.id,
      aplicado: aplicar,
      nuevoSaldo: v.saldo_usd_cents - aplicar,
    });
    remanente -= aplicar;
  }

  return resultados;
}

describe('Abonos y Cobros por Cliente (Kardex)', () => {
  it('amortiza cuotas en orden secuencial FIFO', () => {
    const cuotas: Cuota[] = [
      { id: 1, venta_id: 1, numero: 1, fecha_vencimiento: '2026-09-01', monto_usd_cents: 2000, pagado_usd_cents: 0 },
      { id: 2, venta_id: 1, numero: 2, fecha_vencimiento: '2026-09-15', monto_usd_cents: 2000, pagado_usd_cents: 0 },
      { id: 3, venta_id: 1, numero: 3, fecha_vencimiento: '2026-09-30', monto_usd_cents: 2000, pagado_usd_cents: 0 },
    ];

    // Abono parcial de $30.00 (3000 centavos)
    const amortizadas = amortizarCuotas(cuotas, 3000);

    // Cuota 1: $20.00 pagada completa
    expect(amortizadas[0].pagado_usd_cents).toBe(2000);
    expect(amortizadas[0].vencida).toBe(false);

    // Cuota 2: $10.00 pagados de $20.00
    expect(amortizadas[1].pagado_usd_cents).toBe(1000);
    expect(amortizadas[1].vencida).toBe(true);

    // Cuota 3: $0.00 pagados
    expect(amortizadas[2].pagado_usd_cents).toBe(0);
    expect(amortizadas[2].vencida).toBe(true);
  });

  it('distribuye abono global entre múltiples ventas pendientes del cliente (FIFO)', () => {
    const ventasPendientes = [
      { id: 101, codigo: 'V-0010', saldo_usd_cents: 3000 }, // debe $30
      { id: 102, codigo: 'V-0014', saldo_usd_cents: 4000 }, // debe $40
      { id: 103, codigo: 'V-0020', saldo_usd_cents: 2500 }, // debe $25
    ];

    // Cliente abona $50.00 (5000 centavos) a su cuenta general
    const aplicaciones = distribuirAbonoEnVentas(ventasPendientes, 5000);

    expect(aplicaciones).toHaveLength(2);
    // Venta 1 queda saldada al 100% ($30 aplicados, nuevo saldo $0)
    expect(aplicaciones[0].ventaId).toBe(101);
    expect(aplicaciones[0].aplicado).toBe(3000);
    expect(aplicaciones[0].nuevoSaldo).toBe(0);

    // Venta 2 recibe el remanente de $20 ($20 aplicados, nuevo saldo $20)
    expect(aplicaciones[1].ventaId).toBe(102);
    expect(aplicaciones[1].aplicado).toBe(2000);
    expect(aplicaciones[1].nuevoSaldo).toBe(2000);
  });
});
