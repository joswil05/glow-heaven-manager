/**
 * Reparto exacto de un monto en centavos.
 *
 * Repartir $77 entre cinco productos por peso da decimales, y redondear cada
 * parte por separado deja la suma corta o pasada. El método del mayor residuo
 * (Hamilton) reparte el sobrante centavo por centavo entre quienes quedaron
 * más cerca del siguiente entero, y garantiza que la suma cuadre exacto.
 */

export interface BaseReparto {
  id: number;
  base_valor: number;
}

/**
 * Reparte `monto_total_cents` proporcionalmente a las bases dadas.
 * La suma de las partes es SIEMPRE igual al monto total.
 */
export function repartirMayorResiduo(
  monto_total_cents: number,
  bases: BaseReparto[]
): Map<number, number> {
  const resultado = new Map<number, number>();
  const total = Math.round(Number(monto_total_cents)) || 0;

  if (bases.length === 0) return resultado;

  if (total === 0) {
    for (const b of bases) resultado.set(b.id, 0);
    return resultado;
  }

  if (bases.length === 1) {
    resultado.set(bases[0].id, total);
    return resultado;
  }

  const sumaBases = bases.reduce((acc, b) => acc + (Number(b.base_valor) || 0), 0);

  // Sin bases (todos en cero) el reparto es parejo: es lo menos malo cuando
  // falta el dato con el que había que repartir.
  const efectivas =
    sumaBases === 0
      ? bases.map((b) => ({ id: b.id, base_valor: 1 }))
      : bases.map((b) => ({ id: b.id, base_valor: Number(b.base_valor) || 0 }));
  const denominador = sumaBases === 0 ? bases.length : sumaBases;

  const partes: { id: number; entero: number; residuo: number; orden: number }[] = [];
  let sumaEnteros = 0;

  efectivas.forEach((b, i) => {
    const exacto = (total * b.base_valor) / denominador;
    const entero = Math.floor(exacto);
    partes.push({ id: b.id, entero, residuo: exacto - entero, orden: i });
    sumaEnteros += entero;
  });

  let centavosSobrantes = total - sumaEnteros;

  // Residuo mayor primero; en empate gana el que venía antes, para que el
  // reparto sea reproducible y no dependa del orden de un sort inestable.
  partes.sort((a, b) => (b.residuo !== a.residuo ? b.residuo - a.residuo : a.orden - b.orden));

  for (const parte of partes) {
    let asignado = parte.entero;
    if (centavosSobrantes > 0) {
      asignado += 1;
      centavosSobrantes -= 1;
    }
    resultado.set(parte.id, asignado);
  }

  return resultado;
}
