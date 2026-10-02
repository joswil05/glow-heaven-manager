/**
 * Fase 2 de la auditoría de interfaz (`docs/AUDITORIA_UX_2026-09-29.md`):
 * un solo módulo de mensajes de WhatsApp.
 *
 * Había ocho mensajes armados a mano en las pantallas, con textos, montos y
 * números distintos: unos con la tasa de hoy, uno con +505 pegado a mano,
 * unos en "tú" y otros en "vos" (TRA-03). Acá se prueba que cada mensaje sale
 * de su plantilla, con la tasa de la venta y el código de país.
 */
import { describe, it, expect } from 'vitest';
import type { ParametrosSistema } from '../src/shared/types';
import {
  PLANTILLA_COBRO_DEFECTO,
  plantillaCobro,
  mensajeCobro,
  mensajeSaludo,
  mensajeReciboAbono,
  mensajeEstadoCuenta,
  mensajeCompartirProducto,
  enlaceMensaje,
  cordobasQueSeDeben,
} from '../src/core/mensajes';

const hoy = {
  tasa_cambio_cents: 3700,
  codigo_pais_whatsapp: '505',
  cuentas_bancarias: [{ banco: 'BAC', moneda: 'USD', numero: '123', titular: 'Glow Heaven', tipo: 'Ahorros' }],
} as unknown as ParametrosSistema;

describe('TRA-03 · el recordatorio de cobro sale de la plantilla de Configuración', () => {
  it('con la tasa de la venta, no la de hoy (TRA-04, VEN-02, COB-09)', () => {
    // $100 vendidos a 36.00: se cierran con C$3,600, no con C$3,700.
    const m = mensajeCobro(
      { cliente: 'Ana López', saldo_usd_cents: 10000, saldo_cor_cents: 360000, codigo: 'V-0012' },
      hoy
    );
    expect(m).toContain('$100.00');
    expect(m).toContain('C$3,600.00');
    expect(m).not.toContain('C$3,700.00');
    expect(m).toContain('Ana López');
  });

  it('lo que debe una clienta en córdobas es la suma de cada venta con su tasa (TRA-04)', () => {
    // $100 a 36.00 y $50 a 36.50; hoy está a 37.00. Una venta vieja sin tasa
    // guardada usa la de hoy; una anulada o saldada no suma.
    const ventas = [
      { saldo_usd_cents: 10000, tasa_cambio_cents: 3600 },
      { saldo_usd_cents: 5000, tasa_cambio_cents: 3650 },
      { saldo_usd_cents: 1000, tasa_cambio_cents: 0 },
      { saldo_usd_cents: 9900, tasa_cambio_cents: 3600, estado: 'CANCELADA' },
      { saldo_usd_cents: 0, tasa_cambio_cents: 3600 },
    ];
    expect(cordobasQueSeDeben(ventas, 3700)).toBe(360000 + 182500 + 37000);
  });

  it('una plantilla propia se respeta, con {codigo} y las cuentas', () => {
    const p = { ...hoy, plantilla_cobro_whatsapp: 'Hola {cliente}: debés {saldo_usd} de {codigo}.{cuentas_bancarias}' };
    const m = mensajeCobro({ cliente: 'Ana', saldo_usd_cents: 500, saldo_cor_cents: 18000, codigo: 'V-0003' }, p);
    expect(m).toContain('Hola Ana: debés $5.00 de V-0003.');
    expect(m).toContain('BAC (USD): 123');
  });

  it('la conversión se dice como conversión: "≈" (BAS-18)', () => {
    expect(PLANTILLA_COBRO_DEFECTO).toContain('(≈ {saldo_cs})');
    // La de antes de la 2.16.6 sin "≈", guardada tal cual, es la de siempre.
    const vieja = {
      ...hoy,
      plantilla_cobro_whatsapp:
        'Hola {cliente}, te saludamos de Glow Heaven ✨ Te recordamos que tienes un saldo pendiente de {saldo_usd} ({saldo_cs}). Si ya realizaste tu abono, por favor compártenos el comprobante. ¡Muchas gracias!',
    };
    expect(plantillaCobro(vieja)).toBe(PLANTILLA_COBRO_DEFECTO);
  });

  it('sin saldo, un saludo con el primer nombre', () => {
    expect(mensajeSaludo('Ana María López')).toBe('¡Hola Ana!');
  });

  it('a las clientas se les habla de tú, en todos los mensajes (TXT-01)', () => {
    const todos = [
      mensajeCobro({ cliente: 'Ana', saldo_usd_cents: 500, saldo_cor_cents: 18000 }, hoy),
      mensajeReciboAbono(
        { cliente: 'Ana', pagado: 'C$600.00', codigo: 'V-0003', saldo_usd_cents: 500, saldo_cor_cents: 18000 }
      ),
      mensajeEstadoCuenta({
        cliente: 'Ana',
        saldo_usd_cents: 500,
        saldo_cor_cents: 18000,
        abonos: [{ fecha: '2026-09-12', pagado: 'C$600.00' }],
      }),
      mensajeCompartirProducto({ nombre: 'Labial', precio_usd_cents: 1200, tasa_cambio_cents: 3700, disponibles: ['Rojo'] }),
    ];
    for (const t of todos) {
      expect(t).not.toMatch(/\b(podés|tenés|querés|escribinos|pasá|avisanos)\b/i);
    }
  });
});

describe('TRA-03 · el enlace lleva el código de país de Configuración', () => {
  it('un número de Nicaragua, con o sin formato, abre el chat de la clienta', () => {
    expect(enlaceMensaje('+505 8601 2442', 'Hola', hoy)).toBe('https://wa.me/50586012442?text=Hola');
    expect(enlaceMensaje('8601-2442', 'Hola', hoy)).toBe('https://wa.me/50586012442?text=Hola');
  });

  it('uno de otro país no recibe el 505 pegado a mano (CLI-05, VEN-02)', () => {
    expect(enlaceMensaje('+1 504 463 6250', 'Hola', hoy)).toBe('https://wa.me/15044636250?text=Hola');
  });

  it('sin teléfono, abre WhatsApp para elegir el chat (CVE-04)', () => {
    expect(enlaceMensaje(undefined, 'Hola', hoy)).toBe('https://wa.me/?text=Hola');
  });
});

describe('CCO-05 · recibo de abono y estado de cuenta', () => {
  it('el recibo dice lo pagado en la moneda en que se pagó, y el saldo con su conversión', () => {
    const m = mensajeReciboAbono({
      cliente: 'Ana',
      pagado: 'C$600.00',
      codigo: 'V-0003',
      saldo_usd_cents: 500,
      saldo_cor_cents: 18000,
    });
    expect(m).toContain('C$600.00');
    expect(m).toContain('V-0003');
    expect(m).toContain('$5.00 (≈ C$180.00)');
  });

  it('si queda saldada, lo dice en vez de "saldo $0.00"', () => {
    const m = mensajeReciboAbono({ cliente: 'Ana', pagado: '$5.00', codigo: 'V-0003', saldo_usd_cents: 0, saldo_cor_cents: 0 });
    expect(m).toMatch(/saldada/);
    expect(m).not.toContain('$0.00');
  });

  it('el estado de cuenta lista los abonos en su moneda y dice el saldo de la cuenta', () => {
    const m = mensajeEstadoCuenta({
      cliente: 'Ana',
      saldo_usd_cents: 500,
      saldo_cor_cents: 18000,
      abonos: [
        { fecha: '2026-09-12', pagado: 'C$600.00' },
        { fecha: '2026-09-20', pagado: '$10.00' },
      ],
    });
    expect(m).toContain('C$600.00');
    expect(m).toContain('$10.00');
    expect(m).toContain('$5.00 (≈ C$180.00)');
  });
});

describe('CCA-01 · compartir un producto', () => {
  it('dice qué tallas o tonos hay, sin cuántas unidades quedan', () => {
    const m = mensajeCompartirProducto({
      nombre: 'Base Matte',
      precio_usd_cents: 1500,
      tasa_cambio_cents: 3700,
      disponibles: ['120', '130'],
    });
    expect(m).toContain('Tallas o tonos: 120, 130');
    expect(m).not.toMatch(/disp\.|unidades/);
    expect(m).not.toContain('—');
    expect(m).toContain('C$555.00');
  });
});
