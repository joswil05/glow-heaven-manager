/**
 * Lo que de verdad cuesta una unidad.
 *
 * El precio de la tienda no es el costo. Al precio hay que sumarle el impuesto
 * que cobra la tienda en Estados Unidos y la parte del flete que le toca a esa
 * unidad, porque el courier cobra por el paquete completo y esa plata salió del
 * negocio igual.
 *
 * Sin eso, el margen que muestra la aplicación es una cuenta correcta sobre una
 * base incompleta: da un número que se lee como ganancia y no lo es. Con 45
 * unidades y $77 de flete, la diferencia era del 49%.
 *
 * El reparto del flete se hace por PESO cuando se conoce, que es como cobra el
 * courier, y por UNIDADES cuando no. En la práctica casi nunca se conoce el
 * peso de cada producto por separado —lo que hay es el peso del paquete— así
 * que el reparto por unidades es el camino normal, no la excepción.
 */

/** Una unidad no puede costar menos que cero ni una fracción de centavo. */
const centavos = (n: number): number => Math.max(0, Math.round(n));

export interface DesgloseCosto {
  /** Lo que se pagó en la tienda, por unidad. */
  base_usd_cents: number;
  /** Impuesto de la tienda, por unidad. */
  tax_usd_cents: number;
  /** Parte del flete del paquete que le toca a esta unidad. */
  flete_usd_cents: number;
  /** La suma. Es el costo con el que se calcula precio y ganancia. */
  total_usd_cents: number;
}

/**
 * El desglose del costo de una unidad.
 *
 * `tax_bp` son puntos básicos: 700 = 7%. Se guarda así, y no como `0.07`, para
 * que el impuesto sea un entero y no arrastre error de coma flotante.
 */
export function desglosarCosto(params: {
  base_usd_cents: number;
  tax_bp: number;
  flete_usd_cents?: number;
}): DesgloseCosto {
  const base = centavos(params.base_usd_cents);
  const tax = centavos((base * Math.max(0, params.tax_bp)) / 10000);
  const flete = centavos(params.flete_usd_cents ?? 0);

  return {
    base_usd_cents: base,
    tax_usd_cents: tax,
    flete_usd_cents: flete,
    total_usd_cents: base + tax + flete,
  };
}

export interface UnidadesDeProducto {
  producto_id: number;
  unidades: number;
  /** Peso unitario en milésimas de libra. 0 cuando no se conoce. */
  peso_unitario_mlb?: number;
}

/**
 * Cuánto flete le toca a CADA UNIDAD de cada producto de un paquete.
 *
 * Devuelve centavos por unidad, no por producto, porque es lo que se suma al
 * costo unitario.
 *
 * El reparto es exacto en el total: la suma de lo asignado da el flete del
 * paquete, sin perder ni inventar un centavo. Los centavos que sobran del
 * redondeo van a los productos con más unidades, que es donde menos se notan.
 */
export function repartirFlete(
  flete_total_usd_cents: number,
  productos: UnidadesDeProducto[]
): Map<number, number> {
  const salida = new Map<number, number>();
  const flete = centavos(flete_total_usd_cents);

  const conStock = productos.filter((p) => p.unidades > 0);
  if (flete === 0 || conStock.length === 0) {
    for (const p of productos) salida.set(p.producto_id, 0);
    return salida;
  }

  // Por peso si TODOS lo tienen; si a alguno le falta, por unidades. Mezclar
  // los dos criterios repartiría mal y sin que se note.
  const todosPesan = conStock.every((p) => (p.peso_unitario_mlb ?? 0) > 0);
  const peso = (p: UnidadesDeProducto) =>
    todosPesan ? (p.peso_unitario_mlb ?? 0) * p.unidades : p.unidades;

  const total = conStock.reduce((s, p) => s + peso(p), 0);
  if (total === 0) {
    for (const p of productos) salida.set(p.producto_id, 0);
    return salida;
  }

  // Se reparte el flete ENTERO entre las líneas, y recién después se pasa a
  // "por unidad". Hacerlo al revés —dividir primero y multiplicar después—
  // pierde centavos en cada redondeo y la suma deja de cuadrar.
  let asignado = 0;
  const porLinea = new Map<number, number>();
  const ordenados = [...conStock].sort((a, b) => peso(b) - peso(a));

  ordenados.forEach((p, i) => {
    const parte =
      i === ordenados.length - 1
        ? flete - asignado
        : Math.round((flete * peso(p)) / total);
    porLinea.set(p.producto_id, parte);
    asignado += parte;
  });

  for (const p of productos) {
    const linea = porLinea.get(p.producto_id) ?? 0;
    salida.set(p.producto_id, p.unidades > 0 ? Math.round(linea / p.unidades) : 0);
  }

  return salida;
}
