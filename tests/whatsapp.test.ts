/**
 * Los enlaces de WhatsApp: el único canal por el que sale el trabajo.
 *
 * Una factura que no se puede mandar es una factura que no existe. Y el
 * enlace falla de la peor manera: `wa.me` abre igual, sólo que sin encontrar
 * a la clienta, así que parece un problema del teléfono y no de la app.
 *
 * Hay cuatro lugares en el proyecto que arman un número de WhatsApp. Estas
 * pruebas exigen que los cuatro produzcan lo mismo para el mismo teléfono.
 */
import { describe, it, expect } from 'vitest';
import type { VentaCompleta, ParametrosSistema } from '../src/shared/types';
import { enlaceWhatsappDocumento, mensajeWhatsappDocumento } from '../src/core/documentos/mensajes';
import { telefonoWhatsapp, linkWhatsapp } from '../mobile/src/lib/util';
import { enlaceWhatsApp } from '../src/renderer/src/lib/whatsapp';

const PARAMETROS = {
  tasa_cambio_cents: 3662,
  cuentas_bancarias: [],
} as unknown as ParametrosSistema;

function ventaDe(telefono: string | undefined, saldoCents = 0): VentaCompleta {
  return {
    id: 1,
    codigo: 'V-0001',
    fecha: '2026-09-14',
    tipo: 'INVENTARIO',
    estado: 'ENTREGADA',
    tasa_cambio_cents: 3662,
    total_usd_cents: 10000,
    costo_total_usd_cents: 5000,
    ganancia_usd_cents: 5000,
    pagado_usd_cents: 10000 - saldoCents,
    saldo_usd_cents: saldoCents,
    anticipo_esperado_usd_cents: 0,
    cliente_nombre: 'Ana Pérez',
    cliente: telefono ? ({ id: 1, nombre: 'Ana Pérez', telefono } as never) : undefined,
    lineas: [],
    pagos: [],
    cuotas: [],
  } as unknown as VentaCompleta;
}

/** El número que va dentro de `wa.me/…`. */
function numeroDe(enlace: string): string {
  return enlace.replace('https://wa.me/', '').split('?')[0];
}

describe('el número al que se manda el mensaje', () => {
  it('a un teléfono nicaragüense de 8 dígitos se le antepone el 505', () => {
    expect(telefonoWhatsapp('88887777')).toBe('50588887777');
    expect(telefonoWhatsapp('8888-7777')).toBe('50588887777');
    expect(telefonoWhatsapp('8888 7777')).toBe('50588887777');
  });

  it('un número que ya trae el código de país no lo duplica', () => {
    expect(telefonoWhatsapp('50588887777')).toBe('50588887777');
    expect(telefonoWhatsapp('+505 8888 7777')).toBe('50588887777');
  });

  it('sin teléfono devuelve null, no una cadena vacía', () => {
    expect(telefonoWhatsapp('')).toBeNull();
    expect(telefonoWhatsapp(null)).toBeNull();
    expect(telefonoWhatsapp('sin número')).toBeNull();
  });

  it('los cuatro caminos de la app arman el MISMO número', () => {
    // Si no coinciden, mandar una factura y mandar un recordatorio de cobro a
    // la misma clienta abren chats distintos, y uno de los dos no existe.
    const telefono = '8888-7777';
    const esperado = '50588887777';

    expect(numeroDe(linkWhatsapp(telefono, 'hola')!), 'móvil: linkWhatsapp').toBe(esperado);
    expect(
      numeroDe(enlaceWhatsApp(telefono, 'Ana', 5000, PARAMETROS)),
      'escritorio: cobro'
    ).toBe(esperado);
    expect(
      numeroDe(enlaceWhatsappDocumento(ventaDe(telefono), PARAMETROS)),
      'documento: factura y proforma, en las dos apps'
    ).toBe(esperado);
  });

  it('sin teléfono, el enlace abre WhatsApp para elegir contacto', () => {
    const enlace = enlaceWhatsappDocumento(ventaDe(undefined), PARAMETROS);
    expect(enlace.startsWith('https://wa.me/?text=')).toBe(true);
  });
});

describe('el texto del mensaje', () => {
  it('la factura pagada no le pide plata a la clienta', () => {
    const texto = mensajeWhatsappDocumento(ventaDe('88887777', 0), PARAMETROS);
    expect(texto).toContain('Pagado en su totalidad');
    expect(texto).not.toContain('Saldo pendiente');
  });

  it('la factura con saldo dice cuánto falta, en dólares', () => {
    const texto = mensajeWhatsappDocumento(ventaDe('88887777', 2500), PARAMETROS);
    expect(texto).toContain('Saldo pendiente: $25.00');
  });

  it('reemplaza todos los marcadores: no queda ninguno a la vista', () => {
    const texto = mensajeWhatsappDocumento(ventaDe('88887777', 2500), PARAMETROS);
    expect(texto, `quedó un marcador sin reemplazar:\n${texto}`).not.toMatch(/\{[a-z_]+\}/);
  });

  it('respeta la plantilla que se escribió en la configuración', () => {
    const conPlantilla = {
      ...PARAMETROS,
      plantilla_factura_whatsapp: 'Hola {cliente}, tu factura {codigo} es de {total_usd}.',
    } as unknown as ParametrosSistema;

    const texto = mensajeWhatsappDocumento(ventaDe('88887777'), conPlantilla);
    expect(texto).toBe('Hola Ana Pérez, tu factura V-0001 es de $100.00.');
  });

  it('el total en córdobas usa la tasa configurada', () => {
    const texto = mensajeWhatsappDocumento(ventaDe('88887777'), PARAMETROS);
    // $100.00 a C$36.62 = C$3,662.00
    expect(texto).toContain('C$3,662.00');
  });
});

describe('la cotización de un encargo', () => {
  /** Un encargo de $100 con anticipo del 30%: una pieza cotizada y, si se pide, otra que no se consiguió. */
  function encargo(conDescartada = false): VentaCompleta {
    const linea = (id: number, descripcion: string, precio: number, extra = {}) => ({
      id, venta_id: 12, descripcion, cantidad: 1, precio_unitario_usd_cents: precio,
      subtotal_usd_cents: precio, costo_unitario_usd_cents: 0, costo_total_usd_cents: 0, es_paquete: false, orden: id,
      ...extra,
    });
    return {
      ...ventaDe('88887777', 10000),
      codigo: 'E-0012',
      tipo: 'ENCARGO',
      estado: 'COTIZADA',
      pagado_usd_cents: 0,
      anticipo_bp: 3000,
      anticipo_esperado_usd_cents: 3000,
      lineas: [
        linea(1, 'Bolso Coach', 10000),
        ...(conDescartada ? [linea(2, 'Perfume raro', 4000, { subtotal_usd_cents: 0, descartada_el: '2026-09-27' })] : []),
      ],
    } as unknown as VentaCompleta;
  }

  // La que Configuración guardaba tal cual al tocar cualquier ajuste, con el
  // 50% escrito a mano. Está así en la base de producción (respaldo del 26/9).
  const PLANTILLA_VIEJA =
    '¡Hola {cliente}! ✨ Te compartimos la cotización de tu encargo en Glow Heaven 📦✈️\n\n📋 Cotización: {codigo}\n💰 Total estimado: {total_usd} (≈ {total_cs})\n🔒 Anticipo requerido (50%): {anticipo}\n🤝 Saldo contra entrega: {saldo}\n\n{cuentas_bancarias}\n¡Quedamos atentas a tu comprobante! 💕';

  it('dice el porcentaje del anticipo de ese encargo, no un 50% fijo', () => {
    const texto = mensajeWhatsappDocumento(encargo(), PARAMETROS);
    expect(texto).toContain('Anticipo requerido (30%): $30.00');
    expect(texto).not.toContain('50%');
  });

  it('la plantilla vieja guardada en la base se reconoce y se reemplaza por la nueva', () => {
    const conVieja = { ...PARAMETROS, plantilla_proforma_whatsapp: PLANTILLA_VIEJA } as unknown as ParametrosSistema;
    expect(mensajeWhatsappDocumento(encargo(), conVieja)).toContain('Anticipo requerido (30%)');
  });

  it('nombra lo que no se consiguió, y no deja marcadores a la vista', () => {
    const texto = mensajeWhatsappDocumento(encargo(true), PARAMETROS);
    expect(texto).toContain('No logramos conseguir: Perfume raro');
    expect(texto, texto).not.toMatch(/\{[a-z_]+\}/);
    // Sin descartadas, la línea no aparece.
    expect(mensajeWhatsappDocumento(encargo(), PARAMETROS)).not.toContain('No logramos conseguir');
  });

  it('una plantilla propia sin el marcador igual avisa lo que no se consiguió', () => {
    // Que la clienta no crea que se cotizó todo lo que pidió.
    const propia = {
      ...PARAMETROS,
      plantilla_proforma_whatsapp: 'Hola {cliente}, tu cotización {codigo} es de {total_usd}.',
    } as unknown as ParametrosSistema;
    expect(mensajeWhatsappDocumento(encargo(true), propia)).toBe(
      'Hola Ana Pérez, tu cotización E-0012 es de $100.00.\n\nNo logramos conseguir: Perfume raro'
    );
    expect(mensajeWhatsappDocumento(encargo(), propia)).toBe('Hola Ana Pérez, tu cotización E-0012 es de $100.00.');
  });
});
