export interface ItemCapturaRapida {
  tienda?: string;
  descripcion: string;
  precio_usa_usd_cents?: number;
  peso_mlb?: number;
  categoria_sugerida?: string;
  url?: string;
}

const TIENDAS_CONOCIDAS = [
  'Sephora',
  'Ulta',
  'Ross',
  'Marshalls',
  'TJ Maxx',
  'Coach',
  "Macy's",
  'Amazon',
  'Bath & Body Works',
  'Nike',
  'Adidas',
  'Target',
  'Walmart',
];

const CATEGORIAS_KEYWORDS: Record<string, string[]> = {
  Perfumería: ['perfume', 'sauvage', 'eau de parfum', 'eau de toilette', 'edt', 'edp', 'colonia', 'fragancia', 'cologne'],
  Maquillaje: ['labial', 'sombra', 'paleta', 'base', 'corrector', 'rimel', 'mascara', 'rubor', 'polvo', 'lipstick', 'gloss', 'eyeliner', 'makeup'],
  Skincare: ['crema', 'serum', 'protector', 'bloqueador', 'tonico', 'limpiador', 'moisturizer', 'cleanser', 'lotion', 'cerave', 'ordinary', 'skincare'],
  Calzado: ['tenis', 'zapato', 'zapatos', 'sandalias', 'botas', 'sneakers', 'shoes', 'boots', 'nike', 'adidas', 'jordan'],
  Accesorios: ['bolso', 'cartera', 'faja', 'reloj', 'lentes', 'gafas', 'backpack', 'belt', 'bag', 'tote', 'wallet', 'crossbody'],
};

/**
 * Analiza texto libre o URL pegada y extrae tienda, descripción, precio, peso y categoría sugerida.
 */
export function parsearTextoRapido(texto: string): ItemCapturaRapida {
  const trimmed = texto.trim();

  // Caso 1: URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    let tiendaDetectada = 'Tienda Online';
    for (const t of TIENDAS_CONOCIDAS) {
      const slug = t.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (trimmed.toLowerCase().includes(slug)) {
        tiendaDetectada = t;
        break;
      }
    }
    return {
      tienda: tiendaDetectada,
      descripcion: `Producto de ${tiendaDetectada}`,
      url: trimmed,
    };
  }

  let textoRestante = trimmed;
  let tienda: string | undefined;
  let precio_usa_usd_cents: number | undefined;
  let peso_mlb: number | undefined;
  let categoria_sugerida: string | undefined;

  // 1. Detectar Tienda
  for (const t of TIENDAS_CONOCIDAS) {
    const regex = new RegExp(`\\b${t}\\b`, 'i');
    if (regex.test(textoRestante)) {
      tienda = t;
      textoRestante = textoRestante.replace(regex, ' ').trim();
      break;
    }
  }

  // 2. Detectar Peso (ej: 1.5lb, 2 lbs, 0.8 lb)
  const pesoRegex = /(\d+(?:\.\d{1,2})?)\s*(?:lb|lbs|libra|libras)\b/i;
  const pesoMatch = textoRestante.match(pesoRegex);
  if (pesoMatch) {
    const lbs = parseFloat(pesoMatch[1]);
    if (!isNaN(lbs)) {
      peso_mlb = Math.round(lbs * 1000);
      textoRestante = textoRestante.replace(pesoRegex, ' ').trim();
    }
  }

  // 3. Detectar Precio (ej: $128, $8.50, 45.00)
  const precioRegex = /\$\s*(\d+(?:\.\d{1,2})?)|(?:\b(\d+(?:\.\d{1,2})?)\s*(?:usd|\$))/i;
  const precioMatch = textoRestante.match(precioRegex);
  if (precioMatch) {
    const val = parseFloat(precioMatch[1] || precioMatch[2]);
    if (!isNaN(val)) {
      precio_usa_usd_cents = Math.round(val * 100);
      textoRestante = textoRestante.replace(precioRegex, ' ').trim();
    }
  }

  // 4. Limpiar descripción
  let descripcion = textoRestante.replace(/\s+/g, ' ').trim();
  if (!descripcion) {
    descripcion = tienda ? `Producto de ${tienda}` : 'Producto';
  }

  // 5. Sugerir Categoría
  const lowerDesc = (trimmed + ' ' + descripcion).toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIAS_KEYWORDS)) {
    if (keywords.some((k) => lowerDesc.includes(k))) {
      categoria_sugerida = cat;
      break;
    }
  }

  return {
    tienda,
    descripcion,
    precio_usa_usd_cents,
    peso_mlb,
    categoria_sugerida,
  };
}
