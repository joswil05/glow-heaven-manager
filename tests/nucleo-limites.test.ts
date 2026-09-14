/**
 * Fase 2 de la campaña de pruebas profundas: el núcleo puro, en sus bordes.
 *
 * Las pruebas que ya existían comprueban que la lógica funciona con los datos
 * que uno espera. Estas comprueban qué pasa con los que NO se esperan: texto
 * mal escrito, montos en cero, ids repetidos, totales negativos, y las
 * invariantes que tienen que cumplirse siempre, no sólo en el caso de ejemplo.
 *
 * Cuando una de estas falla no significa "la función está mal escrita";
 * significa "hay un camino por el que el negocio pierde o inventa dinero".
 */
import { describe, it, expect } from 'vitest';
import { parsearDecimal, parsearACentavos } from '@core/numeros';
import {
  usdCentavosACorCentavos,
  corCentavosAUsdCentavos,
  formatearMoneda,
  formatearPorcentaje,
} from '@core/moneda';
import { repartirMayorResiduo } from '@core/prorrateo';
import { costearPaquete } from '@core/costeo';
import { calcularPrecio, redondearHaciaArriba } from '@core/precios';

/** Generador reproducible: una falla encontrada acá se puede volver a ver. */
function aleatorio(semilla: number) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// A. Lo que escribe una persona
// ---------------------------------------------------------------------------

describe('parseo de lo que escribe una persona', () => {
  it('acepta las formas legítimas de escribir un monto', () => {
    expect(parsearACentavos('10')).toBe(1000);
    expect(parsearACentavos('10.50')).toBe(1050);
    expect(parsearACentavos('10,50')).toBe(1050);
    expect(parsearACentavos('  10,50  ')).toBe(1050);
    expect(parsearACentavos('0,05')).toBe(5);
    expect(parsearACentavos('00010.50')).toBe(1050);
  });

  it('rechaza lo que no es un monto', () => {
    for (const malo of ['', '   ', 'abc', '10.5.5', '10,5,5', '1e3', '$10', 'C$10', '10 USD', '--5', '.', ',', '1/2', 'NaN', 'Infinity']) {
      expect(parsearDecimal(malo), `"${malo}" debería rechazarse`).toBeNull();
    }
  });

  it('lee el separador de miles como miles, no como decimales', () => {
    // La app muestra "C$1,500.00". Si la usuaria escribe lo mismo que ve y
    // esto devolviera 1.5, el abono se registraría por un dólar y medio.
    expect(parsearDecimal('1,500')).toBe(1500);
    expect(parsearDecimal('1,500.50')).toBe(1500.5);
    expect(parsearDecimal('12,345,678')).toBe(12345678);
    expect(parsearACentavos('1,500')).toBe(150000);
  });

  it('lee el formato europeo cuando es inequívoco', () => {
    // Con las dos marcas presentes no hay duda de cuál es cuál.
    expect(parsearDecimal('1.500,50')).toBe(1500.5);
    expect(parsearDecimal('1.500.000')).toBe(1500000);
  });

  it('un punto solo con tres cifras detrás se lee como decimal, no como miles', () => {
    // "1.500" es ambiguo en abstracto. Se resuelve con la convención que la
    // app MUESTRA: en "C$1,500.00" la coma son miles y el punto decimales.
    // Además el punto con tres cifras es legítimo en la tasa de cambio
    // ("36.624"), que no tiene lectura de miles posible.
    expect(parsearDecimal('1.500')).toBe(1.5);
    expect(parsearDecimal('36.624')).toBe(36.624);
  });

  it('un separador con una o dos cifras detrás sigue siendo decimal', () => {
    expect(parsearDecimal('10,50')).toBe(10.5);
    expect(parsearDecimal('10.5')).toBe(10.5);
    expect(parsearDecimal('0,05')).toBe(0.05);
    // "0,500" no es quinientos: nadie escribe los miles con un cero delante.
    expect(parsearDecimal('0,500')).toBe(0.5);
  });

  it('sin mínimo declarado, un monto negativo pasa el filtro', () => {
    // Documenta el contrato real: parsearACentavos NO prohíbe negativos por sí
    // solo. Cada formulario tiene que declarar `min`.
    expect(parsearACentavos('-5')).toBe(-500);
    expect(parsearACentavos('-5', { min: 0 })).toBeNull();
  });

  it('el redondeo a centavos no arrastra el error del punto flotante', () => {
    const casos: [string, number][] = [
      ['10.07', 1007],
      ['0.29', 29],
      ['1.10', 110],
      ['8.11', 811],
      ['36.62', 3662],
      ['1234.56', 123456],
    ];
    for (const [texto, esperado] of casos) {
      expect(parsearACentavos(texto), texto).toBe(esperado);
    }
  });
});

// ---------------------------------------------------------------------------
// B. Dólares y córdobas: la ida y la vuelta
// ---------------------------------------------------------------------------

describe('conversión entre dólares y córdobas', () => {
  it('convertir a córdobas y volver no puede cambiar el monto', () => {
    // Caso real: la clienta paga el saldo exacto en córdobas. La pantalla le
    // muestra el equivalente en C$, ella paga eso, y la app lo vuelve a pasar
    // a dólares para descontarlo. Si la vuelta no da lo mismo, la venta queda
    // con un saldo de centavos que nadie puede terminar de pagar.
    const tasas = [3662, 3700, 3550, 3699, 4012];
    const fallos: string[] = [];

    for (const tasa of tasas) {
      for (let usd = 1; usd <= 20000; usd++) {
        const cor = usdCentavosACorCentavos(usd, tasa);
        const vuelta = corCentavosAUsdCentavos(cor, tasa);
        if (vuelta !== usd) {
          fallos.push(`tasa ${tasa}: $${(usd / 100).toFixed(2)} -> C$${cor} -> $${(vuelta / 100).toFixed(2)}`);
          if (fallos.length >= 5) break;
        }
      }
      if (fallos.length >= 5) break;
    }

    expect(fallos, `la ida y vuelta pierde el monto:\n  ${fallos.join('\n  ')}`).toEqual([]);
  });

  it('una tasa en cero no revienta ni inventa dinero', () => {
    expect(corCentavosAUsdCentavos(10000, 0)).toBe(0);
    expect(usdCentavosACorCentavos(10000, 0)).toBe(0);
  });

  it('formatea montos negativos y menores a un dólar sin perder el signo', () => {
    expect(formatearMoneda(-50, 'USD')).toBe('-$0.50');
    expect(formatearMoneda(-1, 'COR')).toBe('-C$0.01');
    expect(formatearMoneda(0, 'USD')).toBe('$0.00');
    expect(formatearMoneda(5, 'USD')).toBe('$0.05');
    expect(formatearMoneda(123456789, 'USD')).toBe('$1,234,567.89');
  });

  it('no muestra un porcentaje con decimales falsos', () => {
    expect(formatearPorcentaje(3500)).toBe('35%');
    expect(formatearPorcentaje(3250)).toBe('32.5%');
    expect(formatearPorcentaje(0)).toBe('0%');
  });
});

// ---------------------------------------------------------------------------
// C. Reparto: la suma de las partes es el total. Siempre.
// ---------------------------------------------------------------------------

describe('reparto de un monto entre varias líneas', () => {
  it('la suma de las partes es exactamente el total, con cualquier combinación', () => {
    const rnd = aleatorio(20260914);
    const fallos: string[] = [];

    for (let caso = 0; caso < 3000; caso++) {
      const n = 1 + Math.floor(rnd() * 12);
      const total = Math.floor(rnd() * 500000);
      const bases = Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        base_valor: Math.floor(rnd() * 10000),
      }));

      const reparto = repartirMayorResiduo(total, bases);
      const suma = [...reparto.values()].reduce((a, b) => a + b, 0);
      if (suma !== total) {
        fallos.push(`total ${total} con ${n} bases -> suma ${suma}`);
        if (fallos.length >= 3) break;
      }
    }

    expect(fallos, fallos.join('; ')).toEqual([]);
  });

  it('reparte aunque todas las bases sean cero', () => {
    const reparto = repartirMayorResiduo(1000, [
      { id: 1, base_valor: 0 },
      { id: 2, base_valor: 0 },
      { id: 3, base_valor: 0 },
    ]);
    expect([...reparto.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('nunca asigna una parte negativa cuando el total es positivo', () => {
    const rnd = aleatorio(7);
    for (let caso = 0; caso < 500; caso++) {
      const bases = Array.from({ length: 1 + Math.floor(rnd() * 8) }, (_, i) => ({
        id: i + 1,
        base_valor: Math.floor(rnd() * 100),
      }));
      const reparto = repartirMayorResiduo(Math.floor(rnd() * 100000), bases);
      for (const parte of reparto.values()) expect(parte).toBeGreaterThanOrEqual(0);
    }
  });

  it('con ids repetidos el reparto NO cuadra: las partes se pisan', () => {
    // Documenta un contrato frágil: la función indexa por id. Dos líneas con
    // el mismo id colapsan en una sola entrada y el total se pierde.
    const reparto = repartirMayorResiduo(1000, [
      { id: 1, base_valor: 50 },
      { id: 1, base_valor: 50 },
    ]);
    const suma = [...reparto.values()].reduce((a, b) => a + b, 0);
    expect(suma).not.toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// D. Costeo de un paquete
// ---------------------------------------------------------------------------

describe('costeo de un paquete', () => {
  it('la suma de los costos de las líneas es lo que se pagó por el paquete', () => {
    const rnd = aleatorio(31415);
    const fallos: string[] = [];

    for (let caso = 0; caso < 1500; caso++) {
      const n = 1 + Math.floor(rnd() * 8);
      const lineas = Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        cantidad: 1 + Math.floor(rnd() * 12),
        precio_linea_usd_cents: Math.floor(rnd() * 20000),
        peso_linea_mlb: Math.floor(rnd() * 5000),
      }));
      const params = {
        tax_bp: Math.floor(rnd() * 1500),
        envio_total_usd_cents: Math.floor(rnd() * 30000),
        otros_costos_usd_cents: Math.floor(rnd() * 5000),
      };

      const r = costearPaquete(lineas, params);
      const suma = r.lineas.reduce((a, l) => a + l.costo_linea_usd_cents, 0);
      if (suma !== r.total_pagado_usd_cents) {
        fallos.push(`caso ${caso}: suma ${suma} != total ${r.total_pagado_usd_cents}`);
        if (fallos.length >= 3) break;
      }
    }

    expect(fallos, fallos.join('; ')).toEqual([]);
  });

  it('un paquete sin peso declarado reparte el envío igual por unidad', () => {
    const r = costearPaquete(
      [
        { id: 1, cantidad: 1, precio_linea_usd_cents: 1000, peso_linea_mlb: 0 },
        { id: 2, cantidad: 1, precio_linea_usd_cents: 1000, peso_linea_mlb: 0 },
      ],
      { tax_bp: 0, envio_total_usd_cents: 1000, otros_costos_usd_cents: 0 }
    );
    expect(r.lineas.map((l) => l.envio_asignado_usd_cents)).toEqual([500, 500]);
    expect(r.lineas.reduce((a, l) => a + l.costo_linea_usd_cents, 0)).toBe(
      r.total_pagado_usd_cents
    );
  });

  it('dos líneas con el mismo id no se reparten el envío dos veces', () => {
    // El reparto se indexa por posición: aunque el llamador mande ids
    // repetidos, cada línea recibe su parte y la suma sigue cuadrando.
    const r = costearPaquete(
      [
        { id: 2, cantidad: 1, precio_linea_usd_cents: 1000, peso_linea_mlb: 3000 },
        { id: 2, cantidad: 1, precio_linea_usd_cents: 1000, peso_linea_mlb: 1000 },
      ],
      { tax_bp: 0, envio_total_usd_cents: 1000, otros_costos_usd_cents: 0 }
    );
    const suma = r.lineas.reduce((a, l) => a + l.costo_linea_usd_cents, 0);
    expect(suma).toBe(r.total_pagado_usd_cents);
    // Y reparte por peso: 3 a 1.
    expect(r.lineas.map((l) => l.envio_asignado_usd_cents)).toEqual([750, 250]);
  });

  it('el costo unitario por la cantidad no se aleja del costo de la línea', () => {
    // El inventario entra por unidades: si el unitario redondeado por la
    // cantidad no da la línea, la valuación de bodega se desvía del paquete.
    const rnd = aleatorio(2718);
    let desvioMaximo = 0;

    for (let caso = 0; caso < 1000; caso++) {
      const lineas = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, i) => ({
        id: i + 1,
        cantidad: 1 + Math.floor(rnd() * 20),
        precio_linea_usd_cents: Math.floor(rnd() * 30000),
        peso_linea_mlb: Math.floor(rnd() * 4000),
      }));
      const r = costearPaquete(lineas, {
        tax_bp: 700,
        envio_total_usd_cents: Math.floor(rnd() * 20000),
        otros_costos_usd_cents: 0,
      });
      for (const l of r.lineas) {
        const reconstruido = l.costo_unitario_usd_cents * l.cantidad;
        desvioMaximo = Math.max(desvioMaximo, Math.abs(reconstruido - l.costo_linea_usd_cents));
      }
    }

    // Menos de un centavo por unidad es inevitable al redondear; más que eso
    // significa que la bodega vale distinto de lo que costó el paquete.
    expect(desvioMaximo).toBeLessThanOrEqual(10);
  });
});

// ---------------------------------------------------------------------------
// E. Precio de venta
// ---------------------------------------------------------------------------

describe('cálculo del precio de venta', () => {
  it('con margen positivo el precio nunca queda por debajo del costo', () => {
    const rnd = aleatorio(161803);
    for (let caso = 0; caso < 2000; caso++) {
      const costo = Math.floor(rnd() * 50000);
      const margen = Math.floor(rnd() * 20000);
      const paso = [1, 25, 50, 100, 500, 1000][Math.floor(rnd() * 6)];
      const r = calcularPrecio({
        modo: 'MARGEN',
        costo_unitario_usd_cents: costo,
        margen_bp: margen,
        paso_redondeo_usd_cents: paso,
      });
      expect(r.precio_usd_cents, `costo ${costo} margen ${margen} paso ${paso}`).toBeGreaterThanOrEqual(costo);
      expect(r.bajo_costo).toBe(false);
      expect(r.ajuste_redondeo_usd_cents).toBeGreaterThanOrEqual(0);
    }
  });

  it('el redondeo hacia arriba respeta el escalón y nunca baja el precio', () => {
    const rnd = aleatorio(5);
    for (let caso = 0; caso < 2000; caso++) {
      const monto = Math.floor(rnd() * 100000);
      const paso = [25, 50, 100, 500, 1000][Math.floor(rnd() * 5)];
      const r = redondearHaciaArriba(monto, paso);
      expect(r).toBeGreaterThanOrEqual(monto);
      expect(r % paso).toBe(0);
      expect(r - monto).toBeLessThan(paso);
    }
  });

  it('un precio manual se respeta aunque quede por debajo del costo, y lo avisa', () => {
    const r = calcularPrecio({
      modo: 'MANUAL',
      costo_unitario_usd_cents: 5000,
      precio_manual_usd_cents: 4000,
      paso_redondeo_usd_cents: 100,
    });
    expect(r.precio_usd_cents).toBe(4000);
    expect(r.bajo_costo).toBe(true);
    expect(r.ganancia_usd_cents).toBe(-1000);
  });

  it('con costo cero no divide por cero ni inventa un margen', () => {
    const r = calcularPrecio({
      modo: 'MARGEN',
      costo_unitario_usd_cents: 0,
      margen_bp: 4000,
      paso_redondeo_usd_cents: 100,
    });
    expect(Number.isFinite(r.margen_sobre_costo_bp)).toBe(true);
    expect(r.precio_usd_cents).toBe(0);
  });
});
