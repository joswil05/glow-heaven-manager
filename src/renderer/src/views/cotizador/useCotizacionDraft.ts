import { useState, useEffect, useMemo } from 'react';
import type { Categoria, Tienda, ParametrosSistema } from '../../../../shared/types';
import type { ItemCapturaRapida } from '@core/parser-rapido';
import {
  calcularCotizacion,
  CotizarItemInput,
  ParametrosEntidadesCotizacion,
  ResultadoCotizacionCompleta,
} from '@core/precios';

export interface DraftItem {
  id: string;
  descripcion: string;
  tienda_id?: number;
  categoria_id?: number;
  precio_usa_usd: string;
  peso_lb: string;
  url?: string;
}

export function useCotizacionDraft(params: {
  categorias: Categoria[];
  tiendas: Tienda[];
  parametros: ParametrosSistema | null;
}): {
  draftItems: DraftItem[];
  calculo: ResultadoCotizacionCompleta | null;
  anticipoPorcentaje: number;
  setAnticipoPorcentaje: (n: number) => void;
  addItem: () => void;
  updateItem: <K extends keyof DraftItem>(id: string, field: K, value: DraftItem[K]) => void;
  removeItem: (id: string) => void;
  handleParsedItem: (parsed: ItemCapturaRapida) => void;
} {
  const { categorias, tiendas, parametros } = params;

  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    { id: 'item_1', descripcion: '', precio_usa_usd: '', peso_lb: '' },
  ]);
  const [anticipoPorcentaje, setAnticipoPorcentaje] = useState<number>(50);

  useEffect(() => {
    if (tiendas.length === 0 && categorias.length === 0) return;
    setDraftItems((prev) =>
      prev.map((item) =>
        item.tienda_id === undefined && item.categoria_id === undefined
          ? { ...item, tienda_id: tiendas[0]?.id, categoria_id: categorias[0]?.id }
          : item
      )
    );
  }, [tiendas, categorias]);

  const addItem = () => {
    setDraftItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}`,
        descripcion: '',
        tienda_id: tiendas[0]?.id,
        categoria_id: categorias[0]?.id,
        precio_usa_usd: '',
        peso_lb: '',
      },
    ]);
  };

  const updateItem = <K extends keyof DraftItem>(id: string, field: K, value: DraftItem[K]) => {
    setDraftItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const removeItem = (id: string) => {
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleParsedItem = (parsed: ItemCapturaRapida) => {
    const tiendaEncontrada = parsed.tienda
      ? tiendas.find((t) => t.nombre.toLowerCase().includes(parsed.tienda!.toLowerCase()))
      : undefined;

    const catEncontrada = parsed.categoria_sugerida
      ? categorias.find((c) =>
          c.nombre.toLowerCase().includes(parsed.categoria_sugerida!.toLowerCase())
        )
      : undefined;

    const newItem: DraftItem = {
      id: `item_${Date.now()}`,
      descripcion: parsed.descripcion,
      tienda_id: tiendaEncontrada?.id ?? tiendas[0]?.id,
      categoria_id: catEncontrada?.id ?? categorias[0]?.id,
      precio_usa_usd: parsed.precio_usa_usd_cents
        ? (parsed.precio_usa_usd_cents / 100).toFixed(2)
        : '',
      peso_lb: parsed.peso_mlb ? (parsed.peso_mlb / 1000).toFixed(2) : '',
      url: parsed.url,
    };

    setDraftItems((prev) => [...prev, newItem]);
  };

  const calculo = useMemo(() => {
    if (!parametros) return null;

    const catMap = new Map(categorias.map((c) => [c.id, c]));
    const tiendaMap = new Map(tiendas.map((t) => [t.id, t]));

    const itemsInput: CotizarItemInput[] = draftItems.map((item, idx) => {
      const cat = item.categoria_id ? catMap.get(item.categoria_id) : undefined;
      const tienda = item.tienda_id ? tiendaMap.get(item.tienda_id) : undefined;

      const precioUsa = Math.round((parseFloat(item.precio_usa_usd) || 0) * 100);
      const pesoMlb = Math.round((parseFloat(item.peso_lb) || 0) * 1000);

      return {
        id: idx + 1,
        descripcion: item.descripcion || 'Producto sin descripción',
        tienda_id: item.tienda_id,
        categoria_id: item.categoria_id,
        precio_usa_usd_cents: precioUsa,
        peso_mlb: pesoMlb,
        tax_rate_tienda_bp: tienda?.tax_rate_bp ?? parametros.tax_usa_default_bp,
        arancel_categoria_bp: cat?.arancel_estimado_bp ?? parametros.arancel_default_bp,
        comision_categoria_bp: cat?.comision_defecto_bp ?? 3500,
        redondeo_categoria_cor_cents: cat?.redondeo_cor_cents ?? 5000,
      };
    });

    const paramsCalculo: ParametrosEntidadesCotizacion = {
      tasa_cambio_cents: parametros.tasa_cambio_oficial_cents,
      tarifa_flete_cents_lb: parametros.tarifa_flete_cents_lb,
      flete_minimo_usd_cents: parametros.flete_minimo_usd_cents,
      otros_costos_fijos_usd_cents: parametros.otros_costos_fijos_usd_cents ?? 1000,
      umbral_arancel_excedente_usd_cents: parametros.umbral_arancel_excedente_usd_cents,
      arancel_default_bp: parametros.arancel_default_bp,
      tax_usa_default_bp: parametros.tax_usa_default_bp,
      comision_minima_cotizacion_cor_cents: parametros.comision_minima_cotizacion_cor_cents,
      anticipo_default_bp: anticipoPorcentaje * 100,
    };

    return calcularCotizacion(itemsInput, paramsCalculo, anticipoPorcentaje * 100);
  }, [draftItems, categorias, tiendas, parametros, anticipoPorcentaje]);

  return {
    draftItems,
    calculo,
    anticipoPorcentaje,
    setAnticipoPorcentaje,
    addItem,
    updateItem,
    removeItem,
    handleParsedItem,
  };
}
