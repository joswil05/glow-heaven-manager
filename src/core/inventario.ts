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
 * Si el estado previo tenía 0 existencias, permite usar un costo unitario
 * de respaldo para no perder la valuación del inventario al agregar unidades.
 */
export function ajustarExistencias(
  estado: EstadoInventario,
  nuevas_existencias: number,
  costo_unitario_fallback?: number
): EstadoInventario {
  const objetivo = Math.max(0, entero(nuevas_existencias));
  let unitario = costoUnitario(estado);

  if (unitario <= 0 && costo_unitario_fallback && costo_unitario_fallback > 0) {
    unitario = Math.max(0, entero(costo_unitario_fallback));
  }

  if (objetivo === 0) {
    return { existencias: 0, valor_total_usd_cents: 0 };
  }

  const actuales = Math.max(0, entero(estado.existencias));
  if (actuales === 0) {
    return { existencias: objetivo, valor_total_usd_cents: unitario * objetivo };
  }

  // Se suma o se resta el costo de las unidades que cambian, igual que una
  // venta. Recalcular el total como costo redondeado × unidades nuevas
  // inventaba o perdía centavos: 7 unidades por $93.28, al sacar una dañada,
  // quedaban en $79.98 en vez de $93.28 − $13.33 = $79.95.
  return {
    existencias: objetivo,
    valor_total_usd_cents: Math.max(
      0,
      Math.max(0, entero(estado.valor_total_usd_cents)) + unitario * (objetivo - actuales)
    ),
  };
}


export interface ResultadoCorreccion {
  valor_total_usd_cents: number;
  /** Lo que de verdad se sumó (o restó) al valor, después de redondear. */
  aplicado_usd_cents: number;
  /** Cuántas de las unidades de la línea seguían en bodega. */
  unidades_afectadas: number;
}

/**
 * Corrige el costo de una línea de paquete que ya entró al inventario.
 *
 * La diferencia se aplica sólo a las unidades de esa línea que siguen en la
 * bodega. Las que ya se vendieron se llevaron su costo congelado, y cambiarlo
 * ahora reescribiría la ganancia de esas ventas.
 *
 * Con promedio ponderado no se sabe de qué paquete es cada unidad. Se supone
 * que lo que queda es lo más nuevo: de una línea de 10 unidades, si el
 * producto tiene 8, se corrigen 8. Es exacto cuando se corrige el último
 * paquete, que es el caso normal: los errores se notan al cargarlo.
 */
export function corregirCostoDeLinea(
  estado: EstadoInventario,
  diferencia_usd_cents: number,
  unidades_de_la_linea: number
): ResultadoCorreccion {
  const existencias = Math.max(0, entero(estado.existencias));
  const valor = Math.max(0, entero(estado.valor_total_usd_cents));
  const unidades = Math.max(1, entero(unidades_de_la_linea, 1));
  const afectadas = Math.min(existencias, unidades);
  const diferencia = entero(diferencia_usd_cents);

  if (afectadas === 0 || diferencia === 0) {
    return { valor_total_usd_cents: valor, aplicado_usd_cents: 0, unidades_afectadas: afectadas };
  }

  const nuevo = Math.max(0, valor + Math.round((diferencia * afectadas) / unidades));
  return {
    valor_total_usd_cents: nuevo,
    aplicado_usd_cents: nuevo - valor,
    unidades_afectadas: afectadas,
  };
}
