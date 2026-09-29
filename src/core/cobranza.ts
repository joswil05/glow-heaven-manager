/**
 * Qué es una deuda, y en qué estado nace un encargo.
 *
 * Viven juntas porque dependen de lo mismo: cuándo un encargo deja de ser una
 * cotización y pasa a ser un compromiso. La regla es la que ya usaban los
 * abonos: cuando se cubre el anticipo.
 *
 * Antes cada pantalla lo decidía por su cuenta. "Te deben en la calle" sumaba
 * cualquier venta con saldo, así que un encargo cotizado sin un centavo
 * pagado entraba entero como deuda. Y al crear un encargo el estado se decidía
 * por "saldo en cero", no por "anticipo cubierto": uno creado con el anticipo
 * completo quedaba como cotizado y no aparecía en "Encargos por comprar".
 */

export interface VentaParaCobranza {
  estado: string;
  tipo: string;
  saldo_usd_cents?: number;
}

/**
 * La venta tiene un saldo que alguien le debe al negocio.
 *
 * Un encargo cotizado no: la clienta todavía no confirmó, y si no confirma no
 * debe nada. Lo que ya adelantó está en "anticipos por entregar".
 */
export function esDeuda(v: VentaParaCobranza): boolean {
  if (v.estado === 'CANCELADA') return false;
  if ((v.saldo_usd_cents || 0) <= 0) return false;
  if (v.tipo === 'ENCARGO' && v.estado === 'COTIZADA') return false;
  return true;
}

/** Un encargo que todavía es sólo una cotización. */
export function esCotizacion(v: VentaParaCobranza): boolean {
  return v.tipo === 'ENCARGO' && v.estado === 'COTIZADA' && (v.saldo_usd_cents || 0) > 0;
}

/**
 * Quien paga, aceptó. Un pago confirma el encargo cuando cubre el anticipo
 * pedido; si no se pidió anticipo, cualquier pago lo confirma.
 */
export function pagoAcepta(p: { pagado_usd_cents: number; anticipo_esperado_usd_cents: number }): boolean {
  if (p.pagado_usd_cents <= 0) return false;
  return p.pagado_usd_cents >= Math.max(0, p.anticipo_esperado_usd_cents);
}

/**
 * El estado de un encargo según lo que pagó: al nacer, y cada vez que se
 * cotiza de nuevo.
 *
 * `COTIZADA` quiere decir "la clienta todavía no aceptó" y `PENDIENTE`,
 * "aceptó, hay que comprarlo". Aceptar es un paso propio ("Aceptó", en la
 * pantalla) y el anticipo puede llegar después. Lo único que acepta sin ese
 * paso es un pago (`pagoAcepta`).
 *
 * Hasta la 2.15, con anticipo de 0% tener precio ya lo confirmaba, sin que la
 * clienta hubiera dicho nada.
 */
export function estadoInicialEncargo(params: {
  total_usd_cents: number;
  pagado_usd_cents: number;
  anticipo_esperado_usd_cents: number;
  /** Piezas sin precio. Un pedido queda cotizado: $0 pagados de $0 no confirman nada. */
  sin_precio?: number;
}): 'COTIZADA' | 'PENDIENTE' {
  const { total_usd_cents, pagado_usd_cents, anticipo_esperado_usd_cents } = params;
  if ((params.sin_precio ?? 0) > 0) return 'COTIZADA';
  // Todo "no se consiguió": no hay nada que confirmar.
  if (total_usd_cents <= 0) return 'COTIZADA';
  if (pagado_usd_cents >= total_usd_cents) return 'PENDIENTE';
  return pagoAcepta({ pagado_usd_cents, anticipo_esperado_usd_cents }) ? 'PENDIENTE' : 'COTIZADA';
}
