import { describe, it, expect } from 'vitest';
import { calcularCotizacion, CotizarItemInput, ParametrosEntidadesCotizacion } from '../src/core/precios';
import { calcularLiquidacionLote, ItemProrrateoInput, CostoLoteInput } from '../src/core/prorrateo';

describe('Consistencia Cotización Estimada vs Liquidación Real (Prueba con Datos Reales de Semilla)', () => {
  it('cotizar y liquidar los 3 ítems con las tasas reales del schema produce costos consistentes (< 5% diferencia)', () => {
    // 3 ítems con tasas REALES de schema.sql:
    // Perfumería: arancel 35%, comisión 35%, tax 7%
    // Calzado: arancel 30%, comisión 25%, tax 7%
    // Maquillaje: arancel 30%, comisión 35%, tax 7%
    //
    // Perfume: $80, tax $5.60, 1.5 lb (1500 mlb) -> compras $85.60
    // Tenis: $60, tax $4.20, 3.5 lb (3500 mlb) -> compras $64.20
    // Paleta: $40, tax $2.80, 0.8 lb (800 mlb) -> compras $42.80
    // Total compras = $192.60. Total peso = 5.8 lb.
    // Costos reales del lote: Flete $37.70 ($6.50/lb), Arancel real $48.00, Casillero fijo $10.00 -> Total lote $288.30

    const cotizacionItems: CotizarItemInput[] = [
      {
        id: 1,
        descripcion: 'Perfume Sauvage',
        precio_usa_usd_cents: 8000,
        peso_mlb: 1500,
        tax_rate_tienda_bp: 700,
        comision_categoria_bp: 3500,
        arancel_categoria_bp: 3500, // Tasa real Perfumería
      },
      {
        id: 2,
        descripcion: 'Tenis Nike',
        precio_usa_usd_cents: 6000,
        peso_mlb: 3500,
        tax_rate_tienda_bp: 700,
        comision_categoria_bp: 2500,
        arancel_categoria_bp: 3000, // Tasa real Calzado
      },
      {
        id: 3,
        descripcion: 'Paleta Sombras',
        precio_usa_usd_cents: 4000,
        peso_mlb: 800,
        tax_rate_tienda_bp: 700,
        comision_categoria_bp: 3500,
        arancel_categoria_bp: 3000, // Tasa real Maquillaje
      },
    ];

    const params: ParametrosEntidadesCotizacion = {
      tasa_cambio_cents: 3662,
      tarifa_flete_cents_lb: 650, // $6.50 / lb
      otros_costos_fijos_usd_cents: 1000, // $10.00 casillero fijo
      umbral_arancel_excedente_usd_cents: 5000, // $50.00
      arancel_default_bp: 3250,
      tax_usa_default_bp: 700,
      comision_minima_cotizacion_cor_cents: 30000,
      anticipo_default_bp: 5000,
    };

    const cotizacion = calcularCotizacion(cotizacionItems, params);

    // Liquidación real con costos reales del lote
    const itemsLiquidacion: ItemProrrateoInput[] = [
      { id: 1, precio_usa_usd_cents: 8000, tax_usa_usd_cents: 560, peso_mlb: 1500 },
      { id: 2, precio_usa_usd_cents: 6000, tax_usa_usd_cents: 420, peso_mlb: 3500 },
      { id: 3, precio_usa_usd_cents: 4000, tax_usa_usd_cents: 280, peso_mlb: 800 },
    ];

    const costosLote: CostoLoteInput[] = [
      { tipo: 'FLETE', concepto: 'Flete aéreo', monto_usd_cents: 3770, base: 'PESO' },
      { tipo: 'ARANCEL', concepto: 'Arancel e IVA', monto_usd_cents: 4800, base: 'VALOR' },
      { tipo: 'CASILLERO', concepto: 'Casillero', monto_usd_cents: 1000, base: 'PESO' },
    ];

    const liquidacion = calcularLiquidacionLote(itemsLiquidacion, costosLote);

    // Comparamos ítem por ítem
    for (let i = 0; i < cotizacion.items.length; i++) {
      const itemCot = cotizacion.items[i];
      const itemLiq = liquidacion.items[i];

      const estimado = itemCot.costo_aterrizado_estimado_usd_cents;
      const real = itemLiq.costo_aterrizado_total_usd_cents;

      const diferenciaAbs = Math.abs(estimado - real);
      const porcentajeDif = (diferenciaAbs / real) * 100;

      // La diferencia debe ser menor al 5% (con datos reales da < 1%)
      expect(porcentajeDif).toBeLessThan(5);
    }

    // El costo aterrizado total estimado ($286.25) vs real ($288.30) difiere en menos de 1%
    const difTotal = Math.abs(
      cotizacion.totales.costo_aterrizado_total_usd_cents -
        liquidacion.gran_total_usd_cents
    );
    const porcentajeTotalDif =
      (difTotal / liquidacion.gran_total_usd_cents) * 100;
    expect(porcentajeTotalDif).toBeLessThan(1);
  });
});
