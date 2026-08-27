import { describe, it, expect } from 'vitest';
import {
  calcularCotizacion,
  CotizarItemInput,
  ParametrosEntidadesCotizacion,
} from '@core/precios';

/**
 * Escenarios de referencia acordados en
 * docs/superpowers/specs/2026-08-27-refactor-integral-design.md seccion 2.4.
 *
 * Costos reales del negocio: producto + 7% tax de tienda + flete por libra.
 * Sin casillero fijo y sin arancel de aduana.
 */
const PARAMS_REALES: ParametrosEntidadesCotizacion = {
  tasa_cambio_cents: 3662,
  tarifa_flete_cents_lb: 650,
  flete_minimo_usd_cents: 0,
  otros_costos_fijos_usd_cents: 0,
  umbral_arancel_excedente_usd_cents: 5000,
  arancel_default_bp: 0,
  tax_usa_default_bp: 700,
  comision_minima_cotizacion_cor_cents: 30000,
  anticipo_default_bp: 5000,
};

const PERFUME: CotizarItemInput = {
  id: 1,
  descripcion: 'Perfume',
  precio_usa_usd_cents: 12800,
  peso_mlb: 1500,
  tax_rate_tienda_bp: 700,
  arancel_categoria_bp: 0,
  comision_categoria_bp: 3500,
  redondeo_categoria_cor_cents: 5000,
};

describe('Escenarios de referencia de precios', () => {
  it('A. Un perfume de $128 y 1.5 lb se cotiza en C$7,000', () => {
    const r = calcularCotizacion([PERFUME], PARAMS_REALES);

    expect(r.totales.tax_usa_total_usd_cents).toBe(896);
    expect(r.totales.flete_estimado_total_usd_cents).toBe(975);
    expect(r.totales.otros_costos_estimados_total_usd_cents).toBe(0);
    expect(r.totales.arancel_estimado_total_usd_cents).toBe(0);
    expect(r.totales.total_final_cor_cents).toBe(700000);
  });

  it('B. Un labial de $20 y 0.3 lb se cotiza en C$1,150 y respeta la comisión mínima', () => {
    const labial: CotizarItemInput = {
      id: 1,
      descripcion: 'Labial',
      precio_usa_usd_cents: 2000,
      peso_mlb: 300,
      tax_rate_tienda_bp: 700,
      arancel_categoria_bp: 0,
      comision_categoria_bp: 3500,
      redondeo_categoria_cor_cents: 5000,
    };

    const r = calcularCotizacion([labial], PARAMS_REALES);

    expect(r.totales.comision_total_cor_cents).toBe(30000);
    expect(r.totales.total_final_cor_cents).toBe(115000);
  });

  it('C. Tres ítems mezclados se cotizan en C$14,350', () => {
    const items: CotizarItemInput[] = [
      PERFUME,
      {
        id: 2,
        descripcion: 'Tenis',
        precio_usa_usd_cents: 9000,
        peso_mlb: 2500,
        tax_rate_tienda_bp: 700,
        arancel_categoria_bp: 0,
        comision_categoria_bp: 2500,
        redondeo_categoria_cor_cents: 10000,
      },
      {
        id: 3,
        descripcion: 'Base de maquillaje',
        precio_usa_usd_cents: 4500,
        peso_mlb: 500,
        tax_rate_tienda_bp: 700,
        arancel_categoria_bp: 0,
        comision_categoria_bp: 3500,
        redondeo_categoria_cor_cents: 5000,
      },
    ];

    const r = calcularCotizacion(items, PARAMS_REALES);

    expect(r.totales.total_final_cor_cents).toBe(1435000);
    // El reparto del flete debe sumar exacto al total
    const sumaFlete = r.items.reduce((a, i) => a + i.flete_estimado_usd_cents, 0);
    expect(sumaFlete).toBe(r.totales.flete_estimado_total_usd_cents);
  });

  it('el arancel sigue funcionando cuando se enciende', () => {
    const r = calcularCotizacion([{ ...PERFUME, arancel_categoria_bp: 3500 }], {
      ...PARAMS_REALES,
      arancel_default_bp: 3500,
    });

    // Excedente sobre $50 del valor aduanero ($128 + $8.96 = $136.96) por 35%
    expect(r.totales.arancel_estimado_total_usd_cents).toBe(3044);
  });
});
