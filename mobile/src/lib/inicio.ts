import type { FilaPorCobrar, PagoCompleto, Venta } from '@shared/types';
import type { EtapaEncargo } from '@core/encargos';
import { ordenHistorial } from '@core/abonos';

/**
 * La parte pura de Inicio (INI-1 e INI-2): lo que se calcula con los datos
 * que el panel ya cargó, sin leer nada más.
 */

/** Lo que debe una clienta, sumando todas sus ventas con saldo. */
export interface DeudaDeClienta {
  clave: string;
  cliente_id?: number;
  nombre: string;
  telefono?: string;
  saldo_usd_cents: number;
  /** Sus ventas con saldo, la más vieja primero. */
  ventas: FilaPorCobrar[];
  cuotas_vencidas: number;
}

/**
 * "Te deben": una fila por clienta, no por venta. Cobros lista una fila por
 * venta, así que si Ana debe dos ventas, su total no se ve en ningún lado.
 * La que más debe, primero.
 */
export function deudasPorClienta(filas: readonly FilaPorCobrar[]): DeudaDeClienta[] {
  const porClienta = new Map<string, DeudaDeClienta>();
  for (const f of filas) {
    if (!(f.saldo_usd_cents > 0)) continue;
    const nombre = (f.cliente_nombre || 'Mostrador').trim();
    const clave = f.cliente_id != null ? `c${f.cliente_id}` : `n${nombre.toLowerCase()}`;
    const d = porClienta.get(clave) ?? {
      clave,
      cliente_id: f.cliente_id,
      nombre,
      saldo_usd_cents: 0,
      ventas: [],
      cuotas_vencidas: 0,
    };
    d.saldo_usd_cents += f.saldo_usd_cents;
    d.cuotas_vencidas += f.cuotas_vencidas || 0;
    d.telefono ||= f.cliente_telefono || undefined;
    d.ventas.push(f);
    porClienta.set(clave, d);
  }
  const deudas = [...porClienta.values()];
  for (const d of deudas) d.ventas.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.venta_id - b.venta_id);
  return deudas.sort((a, b) => b.saldo_usd_cents - a.saldo_usd_cents || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Las fases de un encargo en las que el que tiene que moverse es Ross. */
export const ESPERAN_A_ROSS: readonly EtapaEncargo[] = ['POR_BUSCAR', 'POR_MANDAR', 'POR_COMPRAR', 'POR_ENTREGAR'];

const QUE_FALTA: Partial<Record<EtapaEncargo, string>> = {
  POR_BUSCAR: 'por cotizar',
  POR_MANDAR: 'por mandar',
  POR_COMPRAR: 'por comprar',
  POR_ENTREGAR: 'por entregar',
};

/**
 * La línea de la tarjeta "Encargos": sólo lo que espera algo de Ross. Lo que
 * espera a la clienta (que conteste) o al paquete (en camino) no es trabajo
 * para hoy.
 */
export function textoEncargosDeInicio(fases: Readonly<Record<EtapaEncargo, number>>): string {
  const pendientes = ESPERAN_A_ROSS.filter((f) => fases[f] > 0).map((f) => `${fases[f]} ${QUE_FALTA[f]}`);
  if (pendientes.length > 0) return pendientes.join(' · ');
  const enCurso = (Object.keys(fases) as EtapaEncargo[])
    .filter((f) => f !== 'ENTREGADO' && f !== 'ANULADO')
    .reduce((s, f) => s + fases[f], 0);
  return enCurso > 0 ? `Nada espera por vos · ${enCurso} en curso` : 'No hay encargos en curso';
}

/**
 * INI-2: en vez de la gráfica, los últimos 7 días y los 7 de antes. La serie
 * viene día por día, del más viejo al de hoy.
 */
export function dosSemanas(serie: readonly { total_usd_cents: number }[]): { ultimos7: number; anteriores7: number } {
  const suma = (dias: readonly { total_usd_cents: number }[]) => dias.reduce((s, d) => s + (d.total_usd_cents || 0), 0);
  return {
    ultimos7: suma(serie.slice(-7)),
    anteriores7: suma(serie.slice(-14, -7)),
  };
}

/** Una fila de "Lo último": lo mismo que muestra el Historial. */
export interface Movimiento {
  clave: string;
  tipo: 'venta' | 'abono';
  id: number;
  fecha: string;
  creado_en?: string;
  titulo: string;
  codigo: string;
  cancelada: boolean;
  venta?: Venta;
  pago?: PagoCompleto;
}

/** Ventas y abonos mezclados, lo último primero, con el orden del Historial. */
export function ultimosMovimientos(
  ventas: readonly Venta[],
  pagos: readonly PagoCompleto[],
  cuantos = 5
): Movimiento[] {
  const todos: Movimiento[] = [
    ...ventas.map((v) => ({
      clave: `v-${v.id}`,
      tipo: 'venta' as const,
      id: v.id,
      fecha: v.fecha,
      creado_en: v.creado_en,
      titulo: v.cliente_nombre || 'Mostrador',
      codigo: v.codigo,
      cancelada: v.estado === 'CANCELADA',
      venta: v,
    })),
    ...pagos.map((p) => ({
      clave: `p-${p.id}`,
      tipo: 'abono' as const,
      id: p.id,
      fecha: p.fecha,
      creado_en: p.creado_en,
      titulo: p.cliente_nombre || 'Mostrador',
      codigo: p.venta_codigo || '',
      cancelada: false,
      pago: p,
    })),
  ];
  return todos.sort(ordenHistorial).slice(0, cuantos);
}
