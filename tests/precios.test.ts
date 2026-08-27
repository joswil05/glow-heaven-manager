import { describe, it, expect } from 'vitest';
import {
  calcularCotizacion,
  CotizarItemInput,
  ParametrosEntidadesCotizacion,
} from '../src/core/precios';

describe('src/core/precios.ts - Cotizador Multítem', () => {
  const defaultParams: ParametrosEntidadesCotizacion = {
    tasa_cambio_cents: 3662, // C$36.62
    tarifa_flete_cents_lb: 650, // $6.50 / lb
    flete_minimo_usd_cents: 0,
    umbral_arancel_excedente_usd_cents: 5000, // $50.00
    arancel_default_bp: 3000, // 30%
    tax_usa_default_bp: 700, // 7%
    comision_minima_cotizacion_cor_cents: 30000, // C$300.00
    anticipo_default_bp: 5000, // 50%
  };

  it('calcula arancel sobre el total de la cotización y no por ítem (Bloqueador 1)', () => {
    // 5 labiales de $40 c/u = $200.00 total. Excedente sobre $50 = $150.00.
    // Con arancel 32.5% (3250 bp) -> arancel total = $150 * 0.325 = $48.75 (4875 centavos).
    // Si fuera por ítem individual ($40 < $50), daría $0.00 de arancel (error grave).
    const items: CotizarItemInput[] = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      descripcion: `Labial ${i + 1}`,
      precio_usa_usd_cents: 4000,
      peso_mlb: 200, // 0.2 lb
      comision_categoria_bp: 3500, // 35%
      tax_rate_tienda_bp: 0, // Sin tax para coincidir con la tabla de ejemplo ($200 total)
      arancel_categoria_bp: 3250,
      redondeo_categoria_cor_cents: 5000,
    }));

    const resultado = calcularCotizacion(items, defaultParams);

    expect(resultado.totales.arancel_estimado_total_usd_cents).toBe(4875);
    // Cada labial de los 5 recibe 4875 / 5 = 975 centavos de arancel
    for (const item of resultado.items) {
      expect(item.arancel_estimado_usd_cents).toBe(975);
    }
  });

  it('respeta tax_rate_bp por tienda (0% en Amazon, 7% en Sephora)', () => {
    const items: CotizarItemInput[] = [
      {
        id: 1,
        descripcion: 'Kindle en Amazon',
        precio_usa_usd_cents: 10000,
        peso_mlb: 1000,
        tax_rate_tienda_bp: 0, // Amazon sin tax
        comision_categoria_bp: 3000,
      },
      {
        id: 2,
        descripcion: 'Perfume en Sephora',
        precio_usa_usd_cents: 10000,
        peso_mlb: 1000,
        tax_rate_tienda_bp: 700, // Sephora 7%
        comision_categoria_bp: 3500,
      },
    ];

    const resultado = calcularCotizacion(items, defaultParams);

    expect(resultado.items[0].tax_usa_usd_cents).toBe(0);
    expect(resultado.items[1].tax_usa_usd_cents).toBe(700);
  });

  it('redondea el precio final al múltiplo más cercano, hacia abajo cuando corresponde', () => {
    // Producto $50.00 = C$1831.00, comisión 35% = C$640.85, sin tax, flete ni arancel.
    // Bruto = C$2471.85. Al múltiplo de C$50 más cercano: C$2450.00 (no C$2500.00).
    const items: CotizarItemInput[] = [
      {
        id: 1,
        descripcion: 'Perfume',
        precio_usa_usd_cents: 5000,
        peso_mlb: 1000,
        tax_rate_tienda_bp: 0,
        arancel_categoria_bp: 0,
        comision_categoria_bp: 3500,
        redondeo_categoria_cor_cents: 5000,
      },
    ];

    const resultado = calcularCotizacion(items, {
      ...defaultParams,
      tarifa_flete_cents_lb: 0,
      arancel_default_bp: 0,
      comision_minima_cotizacion_cor_cents: 0,
    });

    expect(resultado.items[0].precio_final_cor_cents).toBe(245000);
  });

  it('nunca redondea a cero un precio positivo', () => {
    const items: CotizarItemInput[] = [
      {
        id: 1,
        descripcion: 'Muestra diminuta',
        precio_usa_usd_cents: 1,
        peso_mlb: 1,
        tax_rate_tienda_bp: 0,
        arancel_categoria_bp: 0,
        comision_categoria_bp: 0,
        redondeo_categoria_cor_cents: 5000,
      },
    ];

    const resultado = calcularCotizacion(items, {
      ...defaultParams,
      tarifa_flete_cents_lb: 0,
      arancel_default_bp: 0,
      comision_minima_cotizacion_cor_cents: 0,
    });

    expect(resultado.items[0].precio_final_cor_cents).toBe(5000);
  });

  it('aplica comisión mínima por cotización si la suma no alcanza el mínimo', () => {
    // 1 ítem muy barato donde 35% de $5 es ~$1.75 (~C$64). La cotización exige mínimo C$300 (30000 cents).
    const items: CotizarItemInput[] = [
      {
        id: 1,
        descripcion: 'Bálsamo Labial',
        precio_usa_usd_cents: 500, // $5.00
        peso_mlb: 100, // 0.1 lb
        comision_categoria_bp: 3500,
      },
    ];

    const resultado = calcularCotizacion(items, defaultParams);
    expect(resultado.totales.comision_total_cor_cents).toBeGreaterThanOrEqual(30000);
  });

  it('calcula la comisión sobre el precio del producto, no sobre el costo aterrizado', () => {
    // Producto $100.00 a tasa C$36.62 = C$3662.00. Comisión 35% = C$1281.70.
    // El flete de $6.50 y el tax NO deben entrar en la base de la comisión.
    const items: CotizarItemInput[] = [
      {
        id: 1,
        descripcion: 'Producto de referencia',
        precio_usa_usd_cents: 10000,
        peso_mlb: 1000,
        tax_rate_tienda_bp: 700,
        arancel_categoria_bp: 0,
        comision_categoria_bp: 3500,
        redondeo_categoria_cor_cents: 0,
      },
    ];

    const resultado = calcularCotizacion(items, {
      ...defaultParams,
      umbral_arancel_excedente_usd_cents: 5000,
      arancel_default_bp: 0,
    });

    expect(resultado.items[0].comision_calculada_cor_cents).toBe(128170);
  });
});
