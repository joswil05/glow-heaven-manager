/**
 * Costeo de un paquete recibido desde USA.
 *
 * El envío no se cobra por producto: se paga un monto único por el paquete
 * completo y hay que repartirlo entre todo lo que venía adentro, pese o no
 * para un encargo. El reparto es por PESO, que es como cobra el courier.
 *
 * Ejemplo real que originó este módulo: $77.00 de envío por 11 lb, con dos
 * productos de encargo y el resto para inventario. Los dos de encargo cargan
 * su parte igual que los demás.
 */

import { repartirMayorResiduo } from './prorrateo';

export interface CompraLineaInput {
  id: number;
  /** Unidades que entran al inventario. Un paquete de 6 boxers son 6. */
  cantidad: number;
  /** Lo que costó la línea completa en la tienda, sin tax. */
  precio_linea_usd_cents: number;
  /** Peso de la línea completa en milésimas de libra. */
  peso_linea_mlb: number;
  /** Tax real de esta línea. Si se omite, se calcula con `tax_bp`. */
  tax_linea_usd_cents?: number;
}

export interface CostearPaqueteParams {
  /** Tax de la tienda en basis points. 700 = 7%. */
  tax_bp: number;
  /** Lo que pagaste de envío por el paquete completo. */
  envio_total_usd_cents: number;
  /** Cualquier otro gasto del paquete (aduana, empaque). Normalmente 0. */
  otros_costos_usd_cents?: number;
  /**
   * Total de tax que aparece en el recibo. Si viene, manda sobre el cálculo
   * por porcentaje y se reparte por valor: los recibos reales rara vez dan
   * exactamente el 7% por redondeo de la tienda.
   */
  tax_total_override_usd_cents?: number;
}

export interface CompraLineaCosteada {
  id: number;
  cantidad: number;
  precio_linea_usd_cents: number;
  tax_linea_usd_cents: number;
  envio_asignado_usd_cents: number;
  otros_asignados_usd_cents: number;
  /** Costo real de la línea completa, ya con su parte del envío. */
  costo_linea_usd_cents: number;
  /** Costo por unidad, redondeado. Referencia para mostrar. */
  costo_unitario_usd_cents: number;
  peso_linea_mlb: number;
}

export interface PaqueteCosteado {
  lineas: CompraLineaCosteada[];
  subtotal_productos_usd_cents: number;
  tax_total_usd_cents: number;
  envio_total_usd_cents: number;
  otros_costos_usd_cents: number;
  /** Lo que te salió el paquete completo. */
  total_pagado_usd_cents: number;
  peso_total_mlb: number;
  unidades_totales: number;
}

const vacio = (): PaqueteCosteado => ({
  lineas: [],
  subtotal_productos_usd_cents: 0,
  tax_total_usd_cents: 0,
  envio_total_usd_cents: 0,
  otros_costos_usd_cents: 0,
  total_pagado_usd_cents: 0,
  peso_total_mlb: 0,
  unidades_totales: 0,
});

function entero(valor: unknown, porDefecto = 0): number {
  const n = Math.round(Number(valor));
  return Number.isFinite(n) ? n : porDefecto;
}

/**
 * Reparte envío y otros costos del paquete entre sus líneas y devuelve el
 * costo real de cada una. La suma de las partes cuadra exacto con el total
 * pagado: no se pierde ni se inventa un centavo.
 */
export function costearPaquete(
  lineas: CompraLineaInput[],
  params: CostearPaqueteParams
): PaqueteCosteado {
  if (lineas.length === 0) return vacio();

  const taxBp = Math.max(0, entero(params.tax_bp));
  const envioTotal = Math.max(0, entero(params.envio_total_usd_cents));
  const otrosTotal = Math.max(0, entero(params.otros_costos_usd_cents));

  // El reparto se indexa por POSICIÓN, no por el id que venga en la línea.
  // Indexar por id es frágil: dos líneas con el mismo id colapsan en una sola
  // entrada del mapa y el envío se les asigna dos veces, con lo que la suma de
  // las líneas deja de cuadrar con el total del paquete.
  const normalizadas = lineas.map((l, idx) => {
    const cantidad = Math.max(1, entero(l.cantidad, 1));
    const precio = Math.max(0, entero(l.precio_linea_usd_cents));
    const peso = Math.max(0, entero(l.peso_linea_mlb));
    return {
      clave: idx,
      id: l.id ?? idx + 1,
      cantidad,
      precio_linea_usd_cents: precio,
      peso_linea_mlb: peso,
      tax_declarado:
        l.tax_linea_usd_cents === undefined || l.tax_linea_usd_cents === null
          ? null
          : Math.max(0, entero(l.tax_linea_usd_cents)),
    };
  });

  const subtotalProductos = normalizadas.reduce(
    (acc, l) => acc + l.precio_linea_usd_cents,
    0
  );
  const pesoTotal = normalizadas.reduce((acc, l) => acc + l.peso_linea_mlb, 0);
  const unidadesTotales = normalizadas.reduce((acc, l) => acc + l.cantidad, 0);

  // Tax: si el usuario dio el total del recibo, ese manda y se reparte por
  // valor. Si no, cada línea paga su porcentaje.
  const basesValor = normalizadas.map((l) => ({
    id: l.clave,
    base_valor: l.precio_linea_usd_cents,
  }));

  let taxPorLinea = new Map<number, number>();
  if (
    params.tax_total_override_usd_cents !== undefined &&
    params.tax_total_override_usd_cents !== null
  ) {
    const taxTotal = Math.max(0, entero(params.tax_total_override_usd_cents));
    taxPorLinea = repartirMayorResiduo(taxTotal, basesValor);
  } else {
    for (const l of normalizadas) {
      const calculado =
        l.tax_declarado !== null
          ? l.tax_declarado
          : Math.round((l.precio_linea_usd_cents * taxBp) / 10000);
      taxPorLinea.set(l.clave, calculado);
    }
  }

  const taxTotalFinal = normalizadas.reduce(
    (acc, l) => acc + (taxPorLinea.get(l.clave) ?? 0),
    0
  );

  // Envío y otros costos por PESO. Si nadie declaró peso, se reparte parejo
  // por unidad, que es lo menos malo cuando falta el dato.
  const basesPeso =
    pesoTotal > 0
      ? normalizadas.map((l) => ({ id: l.clave, base_valor: l.peso_linea_mlb }))
      : normalizadas.map((l) => ({ id: l.clave, base_valor: l.cantidad }));

  const envioPorLinea = repartirMayorResiduo(envioTotal, basesPeso);
  const otrosPorLinea = repartirMayorResiduo(otrosTotal, basesPeso);

  const lineasCosteadas: CompraLineaCosteada[] = normalizadas.map((l) => {
    const tax = taxPorLinea.get(l.clave) ?? 0;
    const envio = envioPorLinea.get(l.clave) ?? 0;
    const otros = otrosPorLinea.get(l.clave) ?? 0;
    const costoLinea = l.precio_linea_usd_cents + tax + envio + otros;

    return {
      id: l.id,
      cantidad: l.cantidad,
      precio_linea_usd_cents: l.precio_linea_usd_cents,
      tax_linea_usd_cents: tax,
      envio_asignado_usd_cents: envio,
      otros_asignados_usd_cents: otros,
      costo_linea_usd_cents: costoLinea,
      costo_unitario_usd_cents: Math.round(costoLinea / l.cantidad),
      peso_linea_mlb: l.peso_linea_mlb,
    };
  });

  return {
    lineas: lineasCosteadas,
    subtotal_productos_usd_cents: subtotalProductos,
    tax_total_usd_cents: taxTotalFinal,
    envio_total_usd_cents: envioTotal,
    otros_costos_usd_cents: otrosTotal,
    total_pagado_usd_cents:
      subtotalProductos + taxTotalFinal + envioTotal + otrosTotal,
    peso_total_mlb: pesoTotal,
    unidades_totales: unidadesTotales,
  };
}

/**
 * Reparte el peso del paquete entre las líneas que no lo traen escrito.
 *
 * El peso del paquete completo es un dato real: es lo que cobra el courier acá,
 * a tarifa por libra. El peso de cada producto por separado no lo tiene nadie.
 * Se reparte el sobrante con el peso unitario que ya está en el inventario
 * cuando se conoce, y por unidades cuando no.
 */
export interface LineaParaReparto {
  clave: string;
  /** Peso escrito a mano, o null para que se lo reparta el total. */
  manual_mlb: number | null;
  unidades: number;
  /** Peso unitario conocido por unidades. 0 si el producto es nuevo. */
  pista_mlb: number;
}

export function repartirPeso(
  lineas: LineaParaReparto[],
  peso_total_mlb: number
): Map<string, number> {
  const salida = new Map<string, number>();
  const libres = lineas.filter((l) => l.manual_mlb === null);

  let restante = peso_total_mlb;
  for (const l of lineas) {
    if (l.manual_mlb !== null) {
      salida.set(l.clave, l.manual_mlb);
      restante -= l.manual_mlb;
    }
  }

  if (libres.length === 0) return salida;
  if (restante <= 0) {
    for (const l of libres) salida.set(l.clave, 0);
    return salida;
  }

  const conPista = libres.filter((l) => l.pista_mlb > 0);
  const pesoUnitarioPromedio =
    conPista.length > 0
      ? conPista.reduce((acc, l) => acc + l.pista_mlb, 0) / conPista.length
      : 0;

  const bases = libres.map((l) => {
    const unitario =
      l.pista_mlb > 0
        ? l.pista_mlb
        : pesoUnitarioPromedio > 0
          ? pesoUnitarioPromedio
          : 1000;
    return unitario * Math.max(1, l.unidades);
  });
  const suma = bases.reduce((a, b) => a + b, 0);

  // Sin base con la que repartir, parejo por línea.
  const efectivas = suma > 0 ? bases : libres.map(() => 1);
  const denominador = suma > 0 ? suma : libres.length;

  // La última línea se queda con lo que falte para que la suma cuadre exacto.
  let asignado = 0;
  libres.forEach((l, i) => {
    const parte =
      i === libres.length - 1
        ? restante - asignado
        : Math.round((restante * efectivas[i]) / denominador);
    salida.set(l.clave, parte);
    asignado += parte;
  });

  return salida;
}
