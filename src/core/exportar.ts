/**
 * Sacar los datos del negocio a una planilla.
 *
 * Son datos de ella, y hasta ahora sólo podía bajar el catálogo. Ni sus
 * ventas, ni sus abonos, ni sus clientas. Si la contadora le pedía el año, o
 * quería un respaldo propio, no tenía cómo.
 *
 * El formato es CSV y no .xlsx a propósito: Excel lo abre igual, no hace falta
 * meter una librería de mil kilobytes en la app, y cualquier otro programa
 * también lo lee. Dos detalles que no se ven pero deciden si el archivo se
 * abre bien o sale hecho un desastre:
 *
 *   · El BOM del principio. Sin eso Excel no reconoce el UTF-8 y "María López"
 *     se abre como "MarÃ­a LÃ³pez".
 *   · El punto y coma como separador, que es lo que ya usaba la exportación
 *     del catálogo. No lo cambio: es lo que funciona en su computadora.
 */

import type { EstadoVenta, MetodoPago, PagoCompleto, Venta } from '../shared/types';
import { nombreCorto } from './abonos';

/** Una columna de la planilla: su título y cómo sacar el valor de cada fila. */
export interface Columna<T> {
  titulo: string;
  valor: (fila: T) => string | number | null | undefined;
}

const SEPARADOR = ';';
const BOM = '﻿';

/**
 * Deja un valor listo para meterlo en una celda.
 *
 * Todo va entre comillas salvo los números. Si no, un nombre con punto y coma
 * —"Ana; la del mercado"— parte la fila en dos columnas y de ahí en adelante
 * toda la planilla queda corrida, que es peor que no exportar nada.
 */
export function celda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined) return '""';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '""';
  return `"${valor.replace(/"/g, '""')}"`;
}

/** Centavos a la forma que entiende una planilla: 1234 -> "12.34". */
export function dinero(centavos: number | null | undefined): string {
  return ((centavos ?? 0) / 100).toFixed(2);
}

/** Genera el contenido del archivo. */
export function generarCSV<T>(columnas: Columna<T>[], filas: T[]): string {
  const encabezado = columnas.map((c) => celda(c.titulo)).join(SEPARADOR);
  const cuerpo = filas.map((f) => columnas.map((c) => celda(c.valor(f))).join(SEPARADOR));
  return BOM + [encabezado, ...cuerpo].join('\r\n');
}

/**
 * El nombre del archivo.
 *
 * Lleva el período adentro porque estos archivos terminan todos juntos en la
 * carpeta de Descargas, y "ventas.csv" tres veces no le dice nada a nadie.
 */
export function nombreArchivo(que: string, desde?: string, hasta?: string): string {
  const periodo = desde && hasta ? `_${desde}_a_${hasta}` : desde ? `_desde_${desde}` : '';
  return `Glow_Heaven_${que}${periodo}.csv`;
}

// ---------------------------------------------------------------------------
// Las planillas de ventas y de abonos
//
// Son las que se le dan a la contadora (CFG-05 de la auditoría de interfaz).
// Antes un abono de C$600 salía como 16.38, sin decir en qué moneda entró, a
// qué tasa ni quién lo registró; y los estados y métodos salían como los
// guarda la base ("CANCELADA", "EFECTIVO").
// ---------------------------------------------------------------------------

/** Los estados como se leen en la pantalla de Ventas. */
export const ESTADO_VENTA_TEXTO: Record<EstadoVenta, string> = {
  COTIZADA: 'Cotizado',
  PENDIENTE: 'Pendiente',
  ENTREGADA: 'Entregada',
  CANCELADA: 'Anulada',
};

export const METODO_TEXTO: Record<MetodoPago, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  OTRO: 'Otro',
};

export const columnasVentas: Columna<Venta>[] = [
  { titulo: 'Venta', valor: (v) => v.codigo },
  { titulo: 'Fecha', valor: (v) => v.fecha },
  { titulo: 'Tipo', valor: (v) => (v.tipo === 'ENCARGO' ? 'Encargo' : 'De inventario') },
  { titulo: 'Clienta', valor: (v) => v.cliente_nombre ?? 'Mostrador' },
  { titulo: 'Estado', valor: (v) => ESTADO_VENTA_TEXTO[v.estado] ?? v.estado },
  { titulo: 'Total (USD)', valor: (v) => dinero(v.total_usd_cents) },
  { titulo: 'Pagado (USD)', valor: (v) => dinero(v.pagado_usd_cents) },
  { titulo: 'Debe (USD)', valor: (v) => dinero(v.saldo_usd_cents) },
  { titulo: 'Tasa', valor: (v) => dinero(v.tasa_cambio_cents) },
  { titulo: 'Costo (USD)', valor: (v) => dinero(v.costo_total_usd_cents) },
  { titulo: 'Ganancia (USD)', valor: (v) => dinero(v.ganancia_usd_cents) },
];

/**
 * Un abono por fila: lo que entró en la moneda en que entró, y su equivalente
 * en dólares con la tasa de ese día, que es como se suma en las ventas.
 */
export const columnasAbonos: Columna<PagoCompleto>[] = [
  { titulo: 'Fecha', valor: (p) => p.fecha },
  { titulo: 'Venta', valor: (p) => p.venta_codigo ?? '' },
  { titulo: 'Clienta', valor: (p) => p.cliente_nombre ?? '' },
  { titulo: 'Método', valor: (p) => METODO_TEXTO[p.metodo] ?? p.metodo },
  { titulo: 'Moneda', valor: (p) => (p.moneda === 'COR' ? 'Córdobas' : 'Dólares') },
  { titulo: 'Monto pagado', valor: (p) => dinero(p.moneda === 'COR' ? p.monto_cor_cents : p.monto_usd_cents) },
  { titulo: 'Equivale (USD)', valor: (p) => dinero(p.monto_usd_cents) },
  { titulo: 'Tasa', valor: (p) => dinero(p.tasa_cambio_cents) },
  { titulo: 'Registró', valor: (p) => nombreCorto(p.registrado_por) ?? '' },
  { titulo: 'Referencia', valor: (p) => p.referencia ?? '' },
  { titulo: 'Notas', valor: (p) => p.notas ?? '' },
];
