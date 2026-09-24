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
 * El estado con el que nace un encargo.
 *
 * `PENDIENTE` quiere decir "confirmado, hay que comprarlo". Pasa cuando lo
 * pagado cubre el anticipo pedido, o cuando no se pidió anticipo: con 0% la
 * dueña decidió que no hace falta adelanto.
 */
export function estadoInicialEncargo(params: {
  total_usd_cents: number;
  pagado_usd_cents: number;
  anticipo_esperado_usd_cents: number;
}): 'COTIZADA' | 'PENDIENTE' {
  const { total_usd_cents, pagado_usd_cents, anticipo_esperado_usd_cents } = params;
  if (pagado_usd_cents >= total_usd_cents) return 'PENDIENTE';
  if (anticipo_esperado_usd_cents <= 0) return 'PENDIENTE';
  return pagado_usd_cents >= anticipo_esperado_usd_cents ? 'PENDIENTE' : 'COTIZADA';
}
