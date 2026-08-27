import { describe, it, expect } from 'vitest';
import {
  generarMensajeCotizacionWhatsApp,
  generarMensajeRutaDiaWhatsApp,
  DatosMensajeCotizacion,
  ParadaRutaDia,
} from '../src/core/plantillas';

describe('src/core/plantillas.ts - Mensajes WhatsApp', () => {
  it('genera mensaje de cotización completo con cuentas bancarias y formato dual', () => {
    const datos: DatosMensajeCotizacion = {
      cliente_nombre: 'María López',
      codigo_cotizacion: 'COT-101',
      items: [
        { descripcion: 'Dior Sauvage 100ml', precio_cor_cents: 485000, precio_usd_cents: 13244 },
      ],
      total_cor_cents: 485000,
      total_usd_cents: 13244,
      anticipo_cor_cents: 242500,
      anticipo_usd_cents: 6622,
      anticipo_porcentaje: 50,
      cuentas_bancarias: [
        { banco: 'BAC', numero: '360-123456-7', titular: 'Glow Heaven', moneda: 'COR' },
        { banco: 'Banpro', numero: '100-987654-3', titular: 'Glow Heaven', moneda: 'USD' },
      ],
    };

    const mensaje = generarMensajeCotizacionWhatsApp(datos);

    expect(mensaje).toContain('María López');
    expect(mensaje).toContain('COT-101');
    expect(mensaje).toContain('Dior Sauvage 100ml');
    expect(mensaje).toContain('C$4,850.00');
    expect(mensaje).toContain('$132.44');
    expect(mensaje).toContain('Anticipo 50%');
    expect(mensaje).toContain('BAC');
    expect(mensaje).toContain('360-123456-7');
  });

  it('genera mensaje de ruta del día para el teléfono del usuario (U7)', () => {
    const paradas: ParadaRutaDia[] = [
      {
        orden: 1,
        cliente_nombre: 'Carlos Mendoza',
        telefono: '8888-1234',
        ciudad: 'León',
        direccion: 'De la iglesia La Merced 2c al norte',
        saldo_cobrar_cor_cents: 150000,
        saldo_cobrar_usd_cents: 4096,
        items_descripcion: ['Tenis Nike Air Max'],
      },
    ];

    const mensaje = generarMensajeRutaDiaWhatsApp('2026-08-27', paradas);

    expect(mensaje).toContain('Ruta de Entregas');
    expect(mensaje).toContain('Carlos Mendoza');
    expect(mensaje).toContain('8888-1234');
    expect(mensaje).toContain('C$1,500.00');
    expect(mensaje).toContain('De la iglesia La Merced');
  });
});
