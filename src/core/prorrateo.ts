import { BaseProrrateo, TipoCostoLote } from '../shared/types';

export interface ItemProrrateoInput {
  id: number;
  precio_usa_usd_cents: number;
  tax_usa_usd_cents: number;
  peso_mlb: number;
  cantidad?: number;
}

export interface CostoLoteInput {
  tipo: TipoCostoLote;
  concepto: string;
  monto_usd_cents: number;
  base: BaseProrrateo;
}

export interface ResultadoProrrateoItem {
  id: number;
  costo_compras_usd_cents: number;
  flete_asignado_usd_cents: number;
  arancel_asignado_usd_cents: number;
  otros_costos_asignados_usd_cents: number;
  costo_aterrizado_total_usd_cents: number;
}

export interface ResultadoLiquidacionLote {
  items: ResultadoProrrateoItem[];
  gran_total_usd_cents: number;
  costos_lote_total_usd_cents: number;
  compras_total_usd_cents: number;
}

/**
 * Reparte un monto en centavos sobre un conjunto de bases enteras usando el método del mayor residuo (Hamilton-Hare).
 * Garantiza que la suma de las partes asignadas sea EXACTAMENTE igual a monto_total_cents.
 */
export function repartirMayorResiduo(
  monto_total_cents: number,
  bases: { id: number; base_valor: number }[]
): Map<number, number> {
  const result = new Map<number, number>();

  if (bases.length === 0) {
    return result;
  }

  if (monto_total_cents === 0) {
    for (const b of bases) {
      result.set(b.id, 0);
    }
    return result;
  }

  if (bases.length === 1) {
    result.set(bases[0].id, monto_total_cents);
    return result;
  }

  let totalBase = bases.reduce((acc, b) => acc + b.base_valor, 0);
  const effectiveBases =
    totalBase === 0
      ? bases.map((b) => ({ id: b.id, base_valor: 1 }))
      : bases;

  if (totalBase === 0) {
    totalBase = bases.length;
  }

  const parts: { id: number; integerPart: number; remainder: number; originalIndex: number }[] = [];
  let sumIntegerParts = 0;

  for (let i = 0; i < effectiveBases.length; i++) {
    const b = effectiveBases[i];
    const exactShare = (monto_total_cents * b.base_valor) / totalBase;
    const integerPart = Math.floor(exactShare);
    const remainder = exactShare - integerPart;

    parts.push({
      id: b.id,
      integerPart,
      remainder,
      originalIndex: i,
    });
    sumIntegerParts += integerPart;
  }

  let centsRemaining = monto_total_cents - sumIntegerParts;

  // Ordenar por residuo descendente; en empate, preservar orden original
  parts.sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }
    return a.originalIndex - b.originalIndex;
  });

  for (let i = 0; i < parts.length; i++) {
    let finalShare = parts[i].integerPart;
    if (centsRemaining > 0) {
      finalShare += 1;
      centsRemaining -= 1;
    }
    result.set(parts[i].id, finalShare);
  }

  return result;
}

/**
 * Liquida los costos de un lote y los asigna a cada ítem.
 * Mapeo por tipo de costo (FLETE -> flete_asignado, ARANCEL/IVA_ADUANA -> arancel_asignado, otros -> otros_costos).
 */
export function calcularLiquidacionLote(
  items: ItemProrrateoInput[],
  costos: CostoLoteInput[]
): ResultadoLiquidacionLote {
  const itemMap = new Map<
    number,
    {
      compras: number;
      flete: number;
      arancel: number;
      otros: number;
    }
  >();

  let totalCompras = 0;
  for (const item of items) {
    const comprasItem = item.precio_usa_usd_cents + item.tax_usa_usd_cents;
    totalCompras += comprasItem;
    itemMap.set(item.id, {
      compras: comprasItem,
      flete: 0,
      arancel: 0,
      otros: 0,
    });
  }

  let totalCostosLote = 0;

  for (const costo of costos) {
    totalCostosLote += costo.monto_usd_cents;

    let bases: { id: number; base_valor: number }[] = [];

    if (costo.base === 'PESO') {
      bases = items.map((i) => ({ id: i.id, base_valor: i.peso_mlb }));
    } else if (costo.base === 'VALOR') {
      bases = items.map((i) => ({
        id: i.id,
        base_valor: i.precio_usa_usd_cents + i.tax_usa_usd_cents,
      }));
    } else {
      // UNIDAD
      bases = items.map((i) => ({ id: i.id, base_valor: i.cantidad || 1 }));
    }

    const reparto = repartirMayorResiduo(costo.monto_usd_cents, bases);

    for (const [itemId, montoAsignado] of reparto.entries()) {
      const registro = itemMap.get(itemId)!;
      if (costo.tipo === 'FLETE') {
        registro.flete += montoAsignado;
      } else if (costo.tipo === 'ARANCEL' || costo.tipo === 'IVA_ADUANA') {
        registro.arancel += montoAsignado;
      } else {
        registro.otros += montoAsignado;
      }
    }
  }

  const itemsResultado: ResultadoProrrateoItem[] = items.map((item) => {
    const reg = itemMap.get(item.id)!;
    const totalItem = reg.compras + reg.flete + reg.arancel + reg.otros;
    return {
      id: item.id,
      costo_compras_usd_cents: reg.compras,
      flete_asignado_usd_cents: reg.flete,
      arancel_asignado_usd_cents: reg.arancel,
      otros_costos_asignados_usd_cents: reg.otros,
      costo_aterrizado_total_usd_cents: totalItem,
    };
  });

  return {
    items: itemsResultado,
    gran_total_usd_cents: totalCompras + totalCostosLote,
    costos_lote_total_usd_cents: totalCostosLote,
    compras_total_usd_cents: totalCompras,
  };
}
