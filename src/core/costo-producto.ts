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
 * Cuánto flete le toca a cada PRODUCTO de un paquete, en total.
 *
 * Devuelve el total por producto y no el costo por unidad a propósito, y esa
 * decisión es la que hace que la cuenta cierre.
 *
 * Con $77.00 entre 45 unidades, el costo por unidad es $1.7111… Guardado en
 * centavos enteros queda $1.71, y 45 × $1.71 = $76.95: cinco centavos que
 * desaparecen del valor de la bodega sin que nadie los vea irse. Guardando el
 * total de cada producto, los $77.00 caen enteros y el costo por unidad pasa a
 * ser lo que es —una división para mostrar— en vez de la fuente de la verdad.
 *
 * Los centavos que sobran del reparto van a los productos con más peso, que es
 * donde menos mueven la aguja.
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
    salida.set(p.producto_id, porLinea.get(p.producto_id) ?? 0);
  }

  return salida;
}

/**
 * El flete por unidad, para mostrar. Es una división, no un dato guardado.
 *
 * Lo que se guarda es el total del producto, porque es lo único que puede
 * sumar exacto. Este número redondeado sirve para escribirlo en pantalla.
 */
export function fletePorUnidad(flete_total_usd_cents: number, unidades: number): number {
  return unidades > 0 ? Math.round(flete_total_usd_cents / unidades) : 0;
}
