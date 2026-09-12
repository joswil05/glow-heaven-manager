/**
 * Costo promedio ponderado del inventario.
 *
 * El producto guarda dos números: cuántas unidades hay y cuánto dinero
 * representan en total. El costo unitario nunca se almacena, se deriva. Así
 * no hay centavos que se pierdan al redondear: el valor total siempre es la
 * suma exacta de lo que se pagó menos lo que ya salió.
 */

export interface EstadoInventario {
  /** Unidades disponibles. */
  existencias: number;
  /** Lo que valen esas unidades al costo, en centavos USD. */
  valor_total_usd_cents: number;
}

export interface ResultadoEntrada extends EstadoInventario {
  costo_unitario_usd_cents: number;
}

export interface ResultadoSalida extends EstadoInventario {
  /** Costo con el que salieron las unidades vendidas. Es lo que se congela en la venta. */
  costo_salida_usd_cents: number;
  costo_unitario_usd_cents: number;
  /** No había suficientes unidades. La salida se hizo con lo que había. */
  insuficiente: boolean;
  unidades_retiradas: number;
}

function entero(valor: unknown, porDefecto = 0): number {
  const n = Math.round(Number(valor));
  return Number.isFinite(n) ? n : porDefecto;
}

/**
 * Costo por unidad al día de hoy. Devuelve 0 si no hay existencias, no
 * un promedio de una división por cero.
 */
export function costoUnitario(estado: EstadoInventario): number {
  const ex = entero(estado.existencias);
  if (ex <= 0) return 0;
  return Math.round(entero(estado.valor_total_usd_cents) / ex);
}

/**
 * Entra mercadería. El promedio se mueve solo.
 */
export function registrarEntrada(
  estado: EstadoInventario,
  unidades: number,
  costo_total_usd_cents: number
): ResultadoEntrada {
  const nuevasUnidades = Math.max(0, entero(unidades));
  const nuevoValor = Math.max(0, entero(costo_total_usd_cents));

  const existencias = Math.max(0, entero(estado.existencias)) + nuevasUnidades;
  const valor_total_usd_cents =
    Math.max(0, entero(estado.valor_total_usd_cents)) + nuevoValor;

  return {
    existencias,
    valor_total_usd_cents,
    costo_unitario_usd_cents: costoUnitario({ existencias, valor_total_usd_cents }),
  };
}

/**
 * Sale mercadería por una venta. Devuelve el costo con el que salió para que
 * la venta lo guarde congelado.
 *
 * Si se pide más de lo que hay, retira lo que hay y lo reporta en
 * `insuficiente` en vez de dejar existencias negativas. Quien llama decide
 * si eso es un error o un ajuste.
 */
export function registrarSalida(
  estado: EstadoInventario,
  unidades: number
): ResultadoSalida {
  const disponibles = Math.max(0, entero(estado.existencias));
  const valorActual = Math.max(0, entero(estado.valor_total_usd_cents));
  const pedidas = Math.max(0, entero(unidades));

  const retiradas = Math.min(pedidas, disponibles);
  const insuficiente = pedidas > disponibles;

  // Vaciar el inventario se lleva el valor completo, sin dejar residuos de
  // redondeo colgando en un producto con cero unidades.
  if (retiradas >= disponibles) {
    return {
      existencias: 0,
      valor_total_usd_cents: 0,
      costo_salida_usd_cents: valorActual,
      costo_unitario_usd_cents: 0,
      insuficiente,
      unidades_retiradas: retiradas,
    };
  }

  const unitario = Math.round(valorActual / disponibles);
  const costoSalida = unitario * retiradas;
  const existencias = disponibles - retiradas;
  const valor_total_usd_cents = Math.max(0, valorActual - costoSalida);

  return {
    existencias,
    valor_total_usd_cents,
    costo_salida_usd_cents: costoSalida,
    costo_unitario_usd_cents: costoUnitario({ existencias, valor_total_usd_cents }),
    insuficiente,
    unidades_retiradas: retiradas,
  };
}

/**
 * Ajuste manual de existencias (conteo físico, producto dañado, regalo).
 * Mantiene el costo unitario y mueve el valor para que cuadre.
 */
export function ajustarExistencias(
  estado: EstadoInventario,
  nuevas_existencias: number
): EstadoInventario {
  const objetivo = Math.max(0, entero(nuevas_existencias));
  const unitario = costoUnitario(estado);

  if (objetivo === 0) {
    return { existencias: 0, valor_total_usd_cents: 0 };
  }

  return {
    existencias: objetivo,
    valor_total_usd_cents: unitario * objetivo,
  };
}
