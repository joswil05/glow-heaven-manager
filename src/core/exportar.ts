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
