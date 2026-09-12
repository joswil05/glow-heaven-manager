/**
 * Precio de venta.
 *
 * La regla anterior calculaba la ganancia sobre el precio del producto en la
 * tienda de USA, ignorando tax y envío. Con eso, un "35%" en pantalla podía
 * ser un 20% real, y peor mientras más pesado el producto. Acá la ganancia
 * siempre se mide contra el costo real ya aterrizado.
 *
 * El redondeo es SIEMPRE hacia arriba. Redondear al más cercano baja el
 * precio la mitad de las veces y se come margen sin avisar.
 */

/** Cómo se decide el precio de un producto. */
export type ModoPrecio = 'MARGEN' | 'MULTIPLICADOR' | 'MANUAL';

export interface CalcularPrecioInput {
  /** Costo real por unidad: producto + tax + su parte del envío. */
  costo_unitario_usd_cents: number;
  modo: ModoPrecio;
  /** Ganancia deseada sobre el costo, en basis points. 4000 = 40%. */
  margen_bp?: number;
  /** Multiplicador sobre el costo, en basis points. 20000 = x2. */
  multiplicador_bp?: number;
  /** Precio escrito a mano. Manda sobre todo lo demás cuando modo es MANUAL. */
  precio_manual_usd_cents?: number;
  /** Escalón de redondeo en centavos USD. 100 = $1, 500 = $5. */
  paso_redondeo_usd_cents: number;
}

export interface PrecioCalculado {
  /** Lo que daría la fórmula antes de redondear. */
  precio_crudo_usd_cents: number;
  /** El precio que se cobra, ya redondeado hacia arriba. */
  precio_usd_cents: number;
  costo_unitario_usd_cents: number;
  ganancia_usd_cents: number;
  /** Ganancia dividida entre el costo. Es el número que el usuario pide. */
  margen_sobre_costo_bp: number;
  /** Ganancia dividida entre el precio. El que usa la contabilidad. */
  margen_sobre_venta_bp: number;
  /** El precio no cubre el costo. */
  bajo_costo: boolean;
  /** Cuánto sumó el redondeo hacia arriba. Nunca es negativo. */
  ajuste_redondeo_usd_cents: number;
}

const PASOS_REDONDEO_VALIDOS = [1, 25, 50, 100, 500, 1000] as const;

/** Paso por defecto: el dólar entero. */
export const PASO_REDONDEO_DEFECTO = 100;

function entero(valor: unknown, porDefecto = 0): number {
  const n = Math.round(Number(valor));
  return Number.isFinite(n) ? n : porDefecto;
}

/**
 * Sube un monto al siguiente múltiplo del paso. Un monto que ya cae justo
 * sobre el escalón se queda donde está.
 */
export function redondearHaciaArriba(
  monto_usd_cents: number,
  paso_usd_cents: number
): number {
  const monto = entero(monto_usd_cents);
  const paso = entero(paso_usd_cents);
  if (paso <= 1) return monto;
  if (monto <= 0) return 0;
  return Math.ceil(monto / paso) * paso;
}

export function esPasoRedondeoValido(paso: number): boolean {
  return (PASOS_REDONDEO_VALIDOS as readonly number[]).includes(entero(paso));
}

/**
 * Calcula el precio de venta de una unidad y desglosa la ganancia real.
 */
export function calcularPrecio(input: CalcularPrecioInput): PrecioCalculado {
  const costo = Math.max(0, entero(input.costo_unitario_usd_cents));
  const paso = entero(input.paso_redondeo_usd_cents, PASO_REDONDEO_DEFECTO) || PASO_REDONDEO_DEFECTO;

  let precioCrudo: number;

  switch (input.modo) {
    case 'MANUAL': {
      precioCrudo = Math.max(0, entero(input.precio_manual_usd_cents));
      break;
    }
    case 'MULTIPLICADOR': {
      const mult = Math.max(0, entero(input.multiplicador_bp, 20000));
      precioCrudo = Math.round((costo * mult) / 10000);
      break;
    }
    case 'MARGEN':
    default: {
      const margen = Math.max(0, entero(input.margen_bp, 4000));
      precioCrudo = Math.round((costo * (10000 + margen)) / 10000);
      break;
    }
  }

  // Un precio escrito a mano se respeta tal cual: si el usuario decidió
  // cobrar $23, no se le suben a $25 por debajo de la mesa.
  const precioFinal =
    input.modo === 'MANUAL' ? precioCrudo : redondearHaciaArriba(precioCrudo, paso);

  const ganancia = precioFinal - costo;

  return {
    precio_crudo_usd_cents: precioCrudo,
    precio_usd_cents: precioFinal,
    costo_unitario_usd_cents: costo,
    ganancia_usd_cents: ganancia,
    margen_sobre_costo_bp: costo > 0 ? Math.round((ganancia * 10000) / costo) : 0,
    margen_sobre_venta_bp:
      precioFinal > 0 ? Math.round((ganancia * 10000) / precioFinal) : 0,
    bajo_costo: precioFinal < costo,
    ajuste_redondeo_usd_cents: Math.max(0, precioFinal - precioCrudo),
  };
}

/**
 * Precio de un paquete vendido completo: el unitario por la cantidad.
 * Sin descuento, que fue la decisión del negocio.
 */
export function calcularPrecioPaquete(
  precio_unitario_usd_cents: number,
  cantidad: number
): number {
  return Math.max(0, entero(precio_unitario_usd_cents)) * Math.max(1, entero(cantidad, 1));
}

/**
 * Margen real de una venta ya ocurrida. Se calcula con los números que quedaron
 * congelados en la venta, nunca con el costo actual del producto: el costo
 * promedio se mueve con cada paquete nuevo y reescribiría la historia.
 */
export function margenDeVenta(
  precio_cobrado_usd_cents: number,
  costo_usd_cents: number
): { ganancia_usd_cents: number; margen_sobre_costo_bp: number; margen_sobre_venta_bp: number } {
  const precio = entero(precio_cobrado_usd_cents);
  const costo = entero(costo_usd_cents);
  const ganancia = precio - costo;
  return {
    ganancia_usd_cents: ganancia,
    margen_sobre_costo_bp: costo > 0 ? Math.round((ganancia * 10000) / costo) : 0,
    margen_sobre_venta_bp: precio > 0 ? Math.round((ganancia * 10000) / precio) : 0,
  };
}
