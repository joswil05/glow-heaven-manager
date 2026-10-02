/**
 * Fase 2 de la auditoría de interfaz: lo pagado, en la moneda en que se pagó
 * (TRA-05, DOC-02, CFG-05).
 *
 * La regla es de la 2.16.1, pero sólo la cumplían la lista de abonos y la
 * corrección de un abono. La factura decía "Abonado: $16.38" a una clienta
 * que pagó C$600, y la planilla para la contadora traía ese abono como 16.38,
 * sin decir en qué moneda entró ni a qué tasa.
 */
import { describe, it, expect } from 'vitest';
import type { VentaCompleta, ParametrosSistema, Pago, PagoCompleto, Venta } from '../src/shared/types';
import { generarHtmlFactura, generarHtmlProforma } from '../src/core/documentos/plantillas';
import { textoPagadoDeVenta } from '../src/core/abonos';
import { columnasAbonos, columnasVentas, generarCSV } from '../src/core/exportar';

const PARAMETROS = {
  nombre_negocio: 'Glow Heaven',
  telefono_negocio: '88887777',
  tasa_cambio_cents: 3700,
  cuentas_bancarias: [],
} as unknown as ParametrosSistema;

/** C$600 a 36.62: 16.38 dólares. */
function abonoEnCordobas(extra: Partial<Pago> = {}): Pago {
  return {
    id: 1,
    venta_id: 7,
    fecha: '2026-09-20',
    monto_usd_cents: 1638,
    monto_cor_cents: 60000,
    moneda: 'COR',
    tasa_cambio_cents: 3662,
    metodo: 'TRANSFERENCIA',
    es_anticipo: false,
    activo: true,
    ...extra,
  };
}

function venta(extra: Partial<VentaCompleta> = {}): VentaCompleta {
  return {
    id: 7,
    codigo: 'V-0007',
    fecha: '2026-09-14',
    tipo: 'INVENTARIO',
    estado: 'PENDIENTE',
    tasa_cambio_cents: 3662,
    subtotal_usd_cents: 5000,
    descuento_usd_cents: 0,
    total_usd_cents: 5000,
    costo_total_usd_cents: 2500,
    ganancia_usd_cents: 2500,
    pagado_usd_cents: 1638,
    saldo_usd_cents: 3362,
    anticipo_esperado_usd_cents: 0,
    cliente_nombre: 'Ana Pérez',
    lineas: [
      {
        id: 1,
        venta_id: 7,
        descripcion: 'Bolso de cuero',
        cantidad: 1,
        precio_unitario_usd_cents: 5000,
        costo_unitario_usd_cents: 2500,
        subtotal_usd_cents: 5000,
        costo_total_usd_cents: 2500,
        es_paquete: false,
        orden: 1,
      },
    ],
    pagos: [abonoEnCordobas()],
    cuotas: [],
    ...extra,
  } as unknown as VentaCompleta;
}

/** El valor de la fila "etiqueta" de la tabla de totales de un documento. */
function filaDeTotales(html: string, etiqueta: string): string {
  const m = html.match(new RegExp(`${etiqueta}</td>\\s*<td class="value">([^<]*)</td>`));
  return m ? m[1] : '';
}

describe('lo pagado de una venta, dicho en su moneda', () => {
  it('si pagó en córdobas, en córdobas', () => {
    expect(textoPagadoDeVenta(venta())).toBe('C$600.00');
  });

  it('un abono anulado no cuenta', () => {
    const v = venta({
      pagos: [abonoEnCordobas(), abonoEnCordobas({ id: 2, activo: false, monto_cor_cents: 99900 })],
    });
    expect(textoPagadoDeVenta(v)).toBe('C$600.00');
  });

  it('una venta sin sus abonos a mano (vieja, o de una lista) sigue en dólares', () => {
    expect(textoPagadoDeVenta({ pagado_usd_cents: 1638 })).toBe('$16.38');
    expect(textoPagadoDeVenta(venta({ pagos: [] }))).toBe('$16.38');
  });
});

describe('la factura y la proforma (DOC-02)', () => {
  it('la factura dice "Abonado: C$600.00", no $16.38', () => {
    const html = generarHtmlFactura(venta(), PARAMETROS);
    expect(filaDeTotales(html, 'Abonado:')).toBe('C$600.00');
    expect(html).not.toContain('$16.38');
  });

  it('la proforma dice el anticipo en córdobas si lo pagó en córdobas', () => {
    const encargo = venta({
      tipo: 'ENCARGO',
      estado: 'COTIZADA',
      anticipo_esperado_usd_cents: 2500,
      pagos: [abonoEnCordobas({ es_anticipo: true })],
    });
    const html = generarHtmlProforma(encargo, PARAMETROS);
    expect(filaDeTotales(html, 'Anticipo Abonado:')).toBe('C$600.00');
  });

  it('si pagó en dólares, sigue en dólares', () => {
    const v = venta({
      pagos: [abonoEnCordobas({ moneda: 'USD', monto_usd_cents: 1638, monto_cor_cents: 59984 })],
    });
    expect(filaDeTotales(generarHtmlFactura(v, PARAMETROS), 'Abonado:')).toBe('$16.38');
  });
});

describe('la planilla de abonos para la contadora (CFG-05)', () => {
  const abono: PagoCompleto = {
    ...abonoEnCordobas({
      referencia: 'BAC 4411',
      registrado_por: { uid: 'u1', nombre: 'Rosa María' },
    }),
    venta_codigo: 'V-0007',
    cliente_nombre: 'Ana Pérez',
  };
  const csv = generarCSV(columnasAbonos, [abono]);
  const [titulos, fila] = csv.replace(/^﻿/, '').split('\r\n');

  it('dice en qué moneda entró, cuánto en esa moneda, el equivalente y la tasa del día', () => {
    expect(titulos).toContain('"Moneda"');
    expect(titulos).toContain('"Monto pagado"');
    expect(titulos).toContain('"Tasa"');
    expect(fila).toContain('"Córdobas"');
    expect(fila).toContain('600.00');
    expect(fila).toContain('16.38');
    expect(fila).toContain('36.62');
  });

  it('el método va en palabras y dice quién lo registró', () => {
    expect(fila).toContain('"Transferencia"');
    expect(fila).not.toContain('TRANSFERENCIA');
    expect(titulos).toContain('"Registró"');
    expect(fila).toContain('"Rosa"');
  });

  it('la planilla de ventas dice el estado en palabras', () => {
    const v = { ...venta({ estado: 'CANCELADA' }) } as Venta;
    const filaVenta = generarCSV(columnasVentas, [v]).split('\r\n')[1];
    expect(filaVenta).toContain('"Anulada"');
    expect(filaVenta).not.toContain('CANCELADA');
  });
});
