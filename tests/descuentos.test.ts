import { describe, it, expect } from 'vitest';
import type { VentaCompleta, ParametrosSistema, TipoDescuento } from '../src/shared/types';
import { generarHtmlFactura, generarHtmlProforma } from '../src/core/documentos/plantillas';

function calcularDescuento(
  subtotalCents: number,
  tipo: TipoDescuento,
  valor: number
): { descuentoCents: number; totalCents: number } {
  if (valor <= 0) return { descuentoCents: 0, totalCents: subtotalCents };
  const descuentoCents =
    tipo === 'PORCENTAJE'
      ? Math.round((subtotalCents * valor) / 100)
      : Math.min(subtotalCents, Math.round(valor * 100));
  const totalCents = Math.max(0, subtotalCents - descuentoCents);
  return { descuentoCents, totalCents };
}

describe('Sistema de Descuentos en Ventas', () => {
  it('calcula correctamente el descuento porcentual', () => {
    const subtotal = 10000; // $100.00
    const { descuentoCents, totalCents } = calcularDescuento(subtotal, 'PORCENTAJE', 10);
    expect(descuentoCents).toBe(1000); // $10.00
    expect(totalCents).toBe(9000); // $90.00
  });

  it('calcula correctamente el descuento por monto fijo en USD', () => {
    const subtotal = 5500; // $55.00
    const { descuentoCents, totalCents } = calcularDescuento(subtotal, 'MONTO_FIJO', 15);
    expect(descuentoCents).toBe(1500); // $15.00
    expect(totalCents).toBe(4000); // $40.00
  });

  it('no permite que el descuento supere el subtotal (evita totales negativos)', () => {
    const subtotal = 2000; // $20.00
    const { descuentoCents, totalCents } = calcularDescuento(subtotal, 'MONTO_FIJO', 50);
    expect(descuentoCents).toBe(2000);
    expect(totalCents).toBe(0);
  });

  it('detecta correctamente la advertencia de venta por debajo del costo (bajo_costo)', () => {
    const costoTotal = 3000; // $30.00 costo
    const subtotal = 3500; // $35.00 precio normal

    // 10% de descuento -> total $31.50 -> por encima del costo
    const res1 = calcularDescuento(subtotal, 'PORCENTAJE', 10);
    expect(res1.totalCents > costoTotal).toBe(true);

    // 25% de descuento -> $8.75 desc -> total $26.25 -> bajo costo!
    const res2 = calcularDescuento(subtotal, 'PORCENTAJE', 25);
    expect(res2.totalCents < costoTotal).toBe(true);
    const perdida = costoTotal - res2.totalCents;
    expect(perdida).toBe(375); // -$3.75 de pérdida
  });
});

describe('Generador de Documentos Comerciales (Factura y Proforma)', () => {
  const parametros: ParametrosSistema = {
    tasa_cambio_cents: 3662,
    tax_bp: 700,
    tarifa_envio_cents_lb: 700,
    margen_defecto_bp: 4500,
    paso_redondeo_usd_cents: 100,
    anticipo_defecto_bp: 5000,
    mostrar_cordobas: true,
    stock_minimo_defecto: 2,
    nombre_negocio: 'Glow Heaven',
    telefono_negocio: '8888-8888',
    onboarding_completado: true,
    cuentas_bancarias: [
      { banco: 'BAC Credomatic', moneda: 'USD', numero: '360-123456-7', titular: 'Glow Heaven' },
    ],
  };

  const ventaFactura: VentaCompleta = {
    id: 1,
    codigo: 'FAC-V-0001',
    fecha: '2026-09-12',
    tipo: 'INVENTARIO',
    estado: 'ENTREGADA',
    tasa_cambio_cents: 3662,
    subtotal_usd_cents: 5000,
    descuento_usd_cents: 500,
    descuento_tipo: 'PORCENTAJE',
    descuento_valor: 10,
    descuento_motivo: 'Cliente VIP',
    total_usd_cents: 4500,
    costo_total_usd_cents: 2500,
    ganancia_usd_cents: 2000,
    pagado_usd_cents: 4500,
    saldo_usd_cents: 0,
    anticipo_esperado_usd_cents: 0,
    activo: true,
    cliente_nombre: 'Sofia Castillo',
    cliente: {
      id: 10,
      nombre: 'Sofia Castillo',
      telefono: '88776655',
      ciudad: 'Managua',
      activo: true,
    },
    lineas: [
      {
        id: 1,
        venta_id: 1,
        descripcion: 'Vestido Floral Elegante',
        talla: 'M',
        color: 'Rojo',
        cantidad: 1,
        precio_unitario_usd_cents: 5000,
        costo_unitario_usd_cents: 2500,
        subtotal_usd_cents: 5000,
        costo_total_usd_cents: 2500,
        es_paquete: false,
        orden: 1,
      },
    ],
    pagos: [],
    cuotas: [],
  };

  it('genera correctamente el HTML de una Factura con descuento y sello pagado', () => {
    const html = generarHtmlFactura(ventaFactura, parametros);
    expect(html).toContain('Factura Comercial');
    expect(html).toContain('FAC-V-0001');
    expect(html).toContain('Sofia Castillo');
    expect(html).toContain('Vestido Floral Elegante');
    expect(html).toContain('Cliente VIP');
    expect(html).toContain('-$5.00');
    expect(html).toContain('$45.00');
    expect(html).toContain('BAC Credomatic');
    expect(html).toContain('Pagado en su totalidad');
  });

  it('genera correctamente el HTML de una Proforma de Encargo con anticipo y políticas', () => {
    const ventaEncargo: VentaCompleta = {
      ...ventaFactura,
      id: 2,
      codigo: 'COT-E-0015',
      tipo: 'ENCARGO',
      estado: 'COTIZADA',
      total_usd_cents: 8000,
      saldo_usd_cents: 8000,
      pagado_usd_cents: 0,
      anticipo_esperado_usd_cents: 4000,
    };

    const html = generarHtmlProforma(ventaEncargo, parametros);
    expect(html).toContain('Cotización de Encargo');
    expect(html).toContain('COT-E-0015');
    expect(html).toContain('Anticipo Requerido para Ordenar');
    expect(html).toContain('$40.00');
    expect(html).toContain('$80.00');
    expect(html).toContain('Políticas y Tiempos de Entrega');
  });
});
