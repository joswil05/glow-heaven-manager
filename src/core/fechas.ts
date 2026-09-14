/**
 * Qué día es hoy para el negocio.
 *
 * Todo el proyecto calculaba la fecha así:
 *
 *     new Date().toISOString().slice(0, 10)
 *
 * `toISOString()` devuelve UTC. Nicaragua es UTC-6 sin horario de verano, así
 * que a partir de las 6 de la tarde —el horario en que más se cobra— esa
 * expresión devuelve el día siguiente. Las consecuencias no eran cosméticas:
 * la factura que se le entrega a la clienta salía fechada mañana, "ventas de
 * hoy" se corría, y el cierre de mes se adelantaba seis horas.
 *
 * Acá la fecha se calcula siempre sobre el calendario de Nicaragua, no sobre
 * el reloj de la máquina. Es a propósito: los libros del negocio cierran con
 * el calendario de acá aunque la laptop esté de viaje.
 */

/** La zona en la que opera el negocio. Un solo lugar por si algún día cambia. */
export const ZONA_NEGOCIO = 'America/Managua';

// `en-CA` formatea como `AAAA-MM-DD`, que es justo el formato que guarda la
// base y el que entiende un <input type="date">.
const FORMATO_ISO = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** La fecha del calendario del negocio: `2026-09-14`. */
export function hoyISO(instante: Date = new Date()): string {
  return FORMATO_ISO.format(instante);
}

/** El mes del calendario del negocio: `2026-09`. */
export function mesISO(instante: Date = new Date()): string {
  return hoyISO(instante).slice(0, 7);
}

/**
 * La fecha de hace `dias` días, en el calendario del negocio.
 *
 * Restar días con `setDate()` sobre un `Date` y después formatear en UTC
 * arrastra el mismo error de seis horas, así que el corrimiento se hace en
 * milisegundos y el formateo pasa por la zona del negocio.
 */
export function haceDias(dias: number, instante: Date = new Date()): string {
  return hoyISO(new Date(instante.getTime() - dias * 86_400_000));
}

/** La fecha dentro de `dias` días, en el calendario del negocio. */
export function enDias(dias: number, instante: Date = new Date()): string {
  return haceDias(-dias, instante);
}

/**
 * Suma días a una fecha ya escrita en `AAAA-MM-DD`, sin pasar por zonas
 * horarias: se opera sobre el mediodía UTC de ese día, que nunca cae en otro
 * día al formatear. Sirve para vencimientos de cuotas.
 */
export function sumarDiasAFecha(fechaISO: string, dias: number): string {
  const base = new Date(`${fechaISO.slice(0, 10)}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}
