import { repartirMayorResiduo } from './prorrateo';
import { corCentavosAUsdCentavos } from './moneda';

export interface ParametrosEntidadesCotizacion {
  tasa_cambio_cents: number; // Centavos de C$ por 1 USD (ej: 3662 para C$36.62)
  tarifa_flete_cents_lb: number; // Centavos USD por lb (ej: 650 para $6.50)
  flete_minimo_usd_cents?: number; // Centavos USD (ej: 1500 para $15.00)
  otros_costos_fijos_usd_cents?: number; // Centavos USD de casillero/handling fijo (ej: 1000 para $10.00)
  umbral_arancel_excedente_usd_cents: number; // Centavos USD (ej: 5000 para $50.00)
  arancel_default_bp: number; // Basis points (ej: 3000 = 30%)
  tax_usa_default_bp: number; // Basis points (ej: 700 = 7%)
  comision_minima_cotizacion_cor_cents: number; // Centavos C$ (ej: 30000 para C$300)
  anticipo_default_bp: number; // 5000 = 50%, 7000 = 70%
}

export interface CotizarItemInput {
  id?: number;
  descripcion: string;
  tienda_id?: number;
  categoria_id?: number;
  precio_usa_usd_cents: number;
  peso_mlb: number;
  tax_rate_tienda_bp?: number;
  arancel_categoria_bp?: number;
  comision_categoria_bp: number;
  redondeo_categoria_cor_cents?: number;
}

export interface CotizarItemResult {
  id?: number;
  descripcion: string;
  precio_usa_usd_cents: number;
  tax_usa_usd_cents: number;
  flete_estimado_usd_cents: number;
  otros_costos_estimados_usd_cents: number;
  arancel_estimado_usd_cents: number;
  costo_aterrizado_estimado_usd_cents: number;
  comision_calculada_usd_cents: number;
  comision_calculada_cor_cents: number;
  precio_final_usd_cents: number;
  precio_final_cor_cents: number;
  anticipo_usd_cents: number;
  anticipo_cor_cents: number;
  saldo_usd_cents: number;
  saldo_cor_cents: number;
  anticipo_bp: number;
}

export interface TotalesCotizacion {
  subtotal_usa_usd_cents: number;
  tax_usa_total_usd_cents: number;
  flete_estimado_total_usd_cents: number;
  otros_costos_estimados_total_usd_cents: number;
  arancel_estimado_total_usd_cents: number;
  costo_aterrizado_total_usd_cents: number;
  comision_total_cor_cents: number;
  total_final_usd_cents: number;
  total_final_cor_cents: number;
  anticipo_total_usd_cents: number;
  anticipo_total_cor_cents: number;
  saldo_total_usd_cents: number;
  saldo_total_cor_cents: number;
  anticipo_bp: number;
}

export interface ResultadoCotizacionCompleta {
  items: CotizarItemResult[];
  totales: TotalesCotizacion;
}

/**
 * Calcula la cotización completa de uno o más ítems.
 * Calcula el arancel sobre el total de la cotización y reparte flete, arancel y comisión mínima con Mayor Residuo.
 */
export function calcularCotizacion(
  items: CotizarItemInput[],
  params: ParametrosEntidadesCotizacion,
  anticipo_bp_override?: number
): ResultadoCotizacionCompleta {
  if (items.length === 0) {
    return {
      items: [],
      totales: {
        subtotal_usa_usd_cents: 0,
        tax_usa_total_usd_cents: 0,
        flete_estimado_total_usd_cents: 0,
        otros_costos_estimados_total_usd_cents: 0,
        arancel_estimado_total_usd_cents: 0,
        costo_aterrizado_total_usd_cents: 0,
        comision_total_cor_cents: 0,
        total_final_usd_cents: 0,
        total_final_cor_cents: 0,
        anticipo_total_usd_cents: 0,
        anticipo_total_cor_cents: 0,
        saldo_total_usd_cents: 0,
        saldo_total_cor_cents: 0,
        anticipo_bp: anticipo_bp_override ?? params.anticipo_default_bp,
      },
    };
  }

  const effectiveAnticipoBp = anticipo_bp_override ?? params.anticipo_default_bp;

  // 1. Calcular Tax y Compras por ítem
  const itemsConTax = items.map((item, idx) => {
    const taxRate = item.tax_rate_tienda_bp ?? params.tax_usa_default_bp;
    const tax_usa_usd_cents = Math.round((item.precio_usa_usd_cents * taxRate) / 10000);
    const compras_usd_cents = item.precio_usa_usd_cents + tax_usa_usd_cents;
    return {
      ...item,
      id: item.id ?? idx + 1,
      tax_usa_usd_cents,
      compras_usd_cents,
    };
  });

  const totalSubtotalUsa = items.reduce((acc, i) => acc + i.precio_usa_usd_cents, 0);
  const totalTaxUsa = itemsConTax.reduce((acc, i) => acc + i.tax_usa_usd_cents, 0);
  const totalComprasUsa = totalSubtotalUsa + totalTaxUsa;

  // 2. Flete global por peso
  const totalPesoMlb = itemsConTax.reduce((acc, i) => acc + i.peso_mlb, 0);
  const fleteCalculado = Math.round((totalPesoMlb * params.tarifa_flete_cents_lb) / 1000);
  const fleteTotal = Math.max(fleteCalculado, params.flete_minimo_usd_cents || 0);

  const basesPeso = itemsConTax.map((i) => ({ id: i.id, base_valor: i.peso_mlb }));
  const fleteReparto = repartirMayorResiduo(fleteTotal, basesPeso);

  // 2.1 Otros costos fijos del envío (casillero/handling) prorrateados por PESO (Punto 1)
  const otrosCostosTotal = params.otros_costos_fijos_usd_cents || 0;
  const otrosCostosReparto = repartirMayorResiduo(otrosCostosTotal, basesPeso);

  // 3. Arancel global sobre excedente de $50 USD (Bloqueador 1)
  const excedente = Math.max(0, totalComprasUsa - params.umbral_arancel_excedente_usd_cents);
  let arancelTotal = 0;

  if (excedente > 0) {
    // Tasa ponderada según el valor de cada ítem y su arancel de categoría
    const weightedArancelBpSum = itemsConTax.reduce((acc, item) => {
      const arancelBp = item.arancel_categoria_bp ?? params.arancel_default_bp;
      return acc + item.compras_usd_cents * arancelBp;
    }, 0);
    const arancelBpPonderado =
      totalComprasUsa > 0 ? weightedArancelBpSum / totalComprasUsa : params.arancel_default_bp;

    arancelTotal = Math.round((excedente * arancelBpPonderado) / 10000);
  }

  const basesValor = itemsConTax.map((i) => ({ id: i.id, base_valor: i.compras_usd_cents }));
  const arancelReparto = repartirMayorResiduo(arancelTotal, basesValor);

  // 4. Costo aterrizado y Comisión
  const itemsConCostos = itemsConTax.map((item) => {
    const flete_item = fleteReparto.get(item.id) || 0;
    const otros_costos_item = otrosCostosReparto.get(item.id) || 0;
    const arancel_item = arancelReparto.get(item.id) || 0;
    const costo_aterrizado =
      item.compras_usd_cents + flete_item + otros_costos_item + arancel_item;

    const costo_cor_cents = Math.round(
      (costo_aterrizado * params.tasa_cambio_cents) / 100
    );

    const comision_propia_cor = Math.round(
      (costo_cor_cents * item.comision_categoria_bp) / 10000
    );

    return {
      ...item,
      flete_item,
      otros_costos_item,
      arancel_item,
      costo_aterrizado,
      costo_cor_cents,
      comision_propia_cor,
    };
  });

  // Comisión mínima por cotización
  const totalComisionPropia = itemsConCostos.reduce(
    (acc, i) => acc + i.comision_propia_cor,
    0
  );
  let comisionTotal = totalComisionPropia;
  const comisionRepartoMap = new Map<number, number>();

  if (totalComisionPropia < params.comision_minima_cotizacion_cor_cents) {
    comisionTotal = params.comision_minima_cotizacion_cor_cents;
    const diferenciaComision = comisionTotal - totalComisionPropia;
    const repartoDiferencia = repartirMayorResiduo(diferenciaComision, basesValor);

    for (const item of itemsConCostos) {
      const extra = repartoDiferencia.get(item.id) || 0;
      comisionRepartoMap.set(item.id, item.comision_propia_cor + extra);
    }
  } else {
    for (const item of itemsConCostos) {
      comisionRepartoMap.set(item.id, item.comision_propia_cor);
    }
  }

  // 5. Precios finales redondeados, Anticipo y Saldo
  const itemsResultado: CotizarItemResult[] = itemsConCostos.map((item) => {
    const comision_cor = comisionRepartoMap.get(item.id) || 0;
    const comision_usd = corCentavosAUsdCentavos(comision_cor, params.tasa_cambio_cents);

    const precio_sin_redondeo_cor = item.costo_cor_cents + comision_cor;
    const redondeo = item.redondeo_categoria_cor_cents || 5000; // Por defecto C$50

    const precio_final_cor =
      redondeo > 0
        ? Math.ceil(precio_sin_redondeo_cor / redondeo) * redondeo
        : precio_sin_redondeo_cor;

    const precio_final_usd = corCentavosAUsdCentavos(
      precio_final_cor,
      params.tasa_cambio_cents
    );

    const anticipo_cor = Math.round((precio_final_cor * effectiveAnticipoBp) / 10000);
    const saldo_cor = precio_final_cor - anticipo_cor;

    const anticipo_usd = Math.round((precio_final_usd * effectiveAnticipoBp) / 10000);
    const saldo_usd = precio_final_usd - anticipo_usd;

    return {
      id: item.id,
      descripcion: item.descripcion,
      precio_usa_usd_cents: item.precio_usa_usd_cents,
      tax_usa_usd_cents: item.tax_usa_usd_cents,
      flete_estimado_usd_cents: item.flete_item,
      otros_costos_estimados_usd_cents: item.otros_costos_item,
      arancel_estimado_usd_cents: item.arancel_item,
      costo_aterrizado_estimado_usd_cents: item.costo_aterrizado,
      comision_calculada_usd_cents: comision_usd,
      comision_calculada_cor_cents: comision_cor,
      precio_final_usd_cents: precio_final_usd,
      precio_final_cor_cents: precio_final_cor,
      anticipo_usd_cents: anticipo_usd,
      anticipo_cor_cents: anticipo_cor,
      saldo_usd_cents: saldo_usd,
      saldo_cor_cents: saldo_cor,
      anticipo_bp: effectiveAnticipoBp,
    };
  });

  const totales: TotalesCotizacion = {
    subtotal_usa_usd_cents: totalSubtotalUsa,
    tax_usa_total_usd_cents: totalTaxUsa,
    flete_estimado_total_usd_cents: fleteTotal,
    otros_costos_estimados_total_usd_cents: otrosCostosTotal,
    arancel_estimado_total_usd_cents: arancelTotal,
    costo_aterrizado_total_usd_cents: itemsResultado.reduce(
      (acc, i) => acc + i.costo_aterrizado_estimado_usd_cents,
      0
    ),
    comision_total_cor_cents: comisionTotal,
    total_final_usd_cents: itemsResultado.reduce(
      (acc, i) => acc + i.precio_final_usd_cents,
      0
    ),
    total_final_cor_cents: itemsResultado.reduce(
      (acc, i) => acc + i.precio_final_cor_cents,
      0
    ),
    anticipo_total_usd_cents: itemsResultado.reduce(
      (acc, i) => acc + i.anticipo_usd_cents,
      0
    ),
    anticipo_total_cor_cents: itemsResultado.reduce(
      (acc, i) => acc + i.anticipo_cor_cents,
      0
    ),
    saldo_total_usd_cents: itemsResultado.reduce((acc, i) => acc + i.saldo_usd_cents, 0),
    saldo_total_cor_cents: itemsResultado.reduce((acc, i) => acc + i.saldo_cor_cents, 0),
    anticipo_bp: effectiveAnticipoBp,
  };

  return {
    items: itemsResultado,
    totales,
  };
}
