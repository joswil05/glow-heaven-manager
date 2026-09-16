/**
 * Que la planilla se abra bien, no que se genere.
 *
 * Un archivo exportado se mira una vez, en la computadora de otra persona, y
 * si sale mal casi nadie vuelve a avisar: se asume que "la app exporta feo" y
 * se copia a mano. Por eso lo que se prueba acá no es que salga un archivo,
 * sino las tres cosas que deciden si es usable:
 *
 *   · que un nombre con punto y coma no parta la fila en dos;
 *   · que los acentos se lean;
 *   · que la plata salga como número y no como texto.
 */
import { describe, it, expect } from 'vitest';
import { celda, dinero, generarCSV, nombreArchivo, type Columna } from '../src/core/exportar';

interface Venta {
  codigo: string;
  cliente: string | null;
  total_cents: number;
}

const COLUMNAS: Columna<Venta>[] = [
  { titulo: 'Código', valor: (v) => v.codigo },
  { titulo: 'Clienta', valor: (v) => v.cliente },
  { titulo: 'Total (USD)', valor: (v) => dinero(v.total_cents) },
];

describe('la planilla que se lleva', () => {
  it('un nombre con punto y coma no parte la fila', () => {
    // El separador es el punto y coma. Sin comillas, "Ana; la del mercado"
    // crea una columna de más y de ahí en adelante toda la planilla queda
    // corrida.
    const csv = generarCSV(COLUMNAS, [
      { codigo: 'V-0001', cliente: 'Ana; la del mercado', total_cents: 5000 },
    ]);
    const fila = csv.split('\r\n')[1];

    expect(fila).toBe('"V-0001";"Ana; la del mercado";"50.00"');
    // Tres columnas, no cuatro.
    expect(fila.split('";"')).toHaveLength(3);
  });

  it('una comilla dentro del texto no rompe la celda', () => {
    expect(celda('Bolso 15"')).toBe('"Bolso 15"""');
  });

  it('el archivo empieza con la marca que hace que Excel lea los acentos', () => {
    const csv = generarCSV(COLUMNAS, []);
    expect(
      csv.startsWith('﻿'),
      'sin esa marca, "María López" se abre como "MarÃ­a LÃ³pez"'
    ).toBe(true);
  });

  it('los acentos sobreviven', () => {
    const csv = generarCSV(COLUMNAS, [
      { codigo: 'V-0002', cliente: 'María Núñez', total_cents: 100 },
    ]);
    expect(csv).toContain('María Núñez');
  });

  it('la plata sale con dos decimales, siempre', () => {
    expect(dinero(5000)).toBe('50.00');
    expect(dinero(5)).toBe('0.05');
    expect(dinero(0)).toBe('0.00');
    expect(dinero(123456)).toBe('1234.56');
    // Un centavo suelto no se pierde ni se inventa.
    expect(dinero(1)).toBe('0.01');
  });

  it('una celda vacía no rompe la fila', () => {
    const csv = generarCSV(COLUMNAS, [{ codigo: 'V-0003', cliente: null, total_cents: 0 }]);
    const fila = csv.split('\r\n')[1];
    expect(fila).toBe('"V-0003";"";"0.00"');
  });

  it('los números van sin comillas, para que Excel los sume', () => {
    const cols: Columna<{ n: number }>[] = [{ titulo: 'Cantidad', valor: (f) => f.n }];
    const csv = generarCSV(cols, [{ n: 7 }]);
    expect(csv.split('\r\n')[1]).toBe('7');
  });

  it('las filas se separan como espera Excel en Windows', () => {
    const csv = generarCSV(COLUMNAS, [
      { codigo: 'V-0001', cliente: 'Ana', total_cents: 100 },
      { codigo: 'V-0002', cliente: 'Bea', total_cents: 200 },
    ]);
    expect(csv.split('\r\n')).toHaveLength(3); // encabezado + dos
  });

  it('sin datos igual sale el encabezado, no un archivo vacío', () => {
    // Un archivo de cero bytes parece un error de la app. Uno con los títulos
    // y nada debajo dice lo que pasó: en ese período no hubo nada.
    const csv = generarCSV(COLUMNAS, []);
    expect(csv).toBe('﻿"Código";"Clienta";"Total (USD)"');
  });

  it('el nombre del archivo dice de qué período es', () => {
    expect(nombreArchivo('Ventas', '2026-01-01', '2026-03-31')).toBe(
      'Glow_Heaven_Ventas_2026-01-01_a_2026-03-31.csv'
    );
    expect(nombreArchivo('Clientas')).toBe('Glow_Heaven_Clientas.csv');
  });
});
