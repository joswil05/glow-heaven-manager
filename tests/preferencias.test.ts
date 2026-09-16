/**
 * Que las configuraciones hagan algo.
 *
 * Tres de ellas se podían cambiar, se guardaban, y no las leía nadie: la
 * moneda por defecto, los días de aviso de mora y los de encargos. Eso es
 * peor que no tenerlas, porque enseña a desconfiar de toda la pantalla de
 * ajustes: si ese interruptor no hace nada, ¿cuáles sí?
 *
 * Estas pruebas existen para que no vuelva a pasar en silencio. No comprueban
 * que la opción se pueda elegir —eso se ve— sino que cambiarla cambie algo.
 */
import { describe, it, expect } from 'vitest';
import { monedaPorDefecto, metodoPorDefecto } from '../src/core/preferencias';
import { telefonoWhatsapp, enlaceWhatsapp } from '../src/core/telefono';
import type { ParametrosSistema } from '../src/shared/types';

const base = (extra: Partial<ParametrosSistema> = {}): ParametrosSistema =>
  ({
    tasa_cambio_cents: 3662,
    tax_bp: 700,
    tarifa_envio_cents_lb: 700,
    margen_defecto_bp: 6000,
    paso_redondeo_usd_cents: 100,
    anticipo_defecto_bp: 5000,
    mostrar_cordobas: true,
    stock_minimo_defecto: 2,
    nombre_negocio: 'Glow Heaven',
    telefono_negocio: '',
    onboarding_completado: true,
    ...extra,
  }) as ParametrosSistema;

describe('la moneda con la que arrancan los cobros', () => {
  it('elegir córdobas hace que arranquen en córdobas', () => {
    expect(monedaPorDefecto(base({ moneda_defecto_venta: 'NIO' }))).toBe('COR');
  });

  it('elegir dólares hace que arranquen en dólares', () => {
    expect(monedaPorDefecto(base({ moneda_defecto_venta: 'USD' }))).toBe('USD');
  });

  it('traduce entre los dos vocabularios', () => {
    // Los parámetros guardan 'NIO' y el resto de la app dice 'COR' para lo
    // mismo. Si alguien "arregla" uno de los dos lados, esto falla.
    expect(monedaPorDefecto(base({ moneda_defecto_venta: 'NIO' }))).not.toBe('NIO');
  });

  it('sin parámetros no rompe: arranca en dólares', () => {
    expect(monedaPorDefecto(null)).toBe('USD');
    expect(monedaPorDefecto(undefined)).toBe('USD');
  });
});

describe('el método con el que arrancan los cobros', () => {
  it('elegir transferencia hace que arranque en transferencia', () => {
    expect(metodoPorDefecto(base({ metodo_pago_defecto: 'TRANSFERENCIA' }))).toBe('TRANSFERENCIA');
  });

  it('sin elegir nada, efectivo', () => {
    expect(metodoPorDefecto(base())).toBe('EFECTIVO');
    expect(metodoPorDefecto(null)).toBe('EFECTIVO');
  });
});

describe('el código de país de WhatsApp', () => {
  it('a un número local le antepone el código configurado', () => {
    expect(telefonoWhatsapp('88887777', '505')).toBe('50588887777');
    expect(telefonoWhatsapp('8888 7777', '506')).toBe('50688887777');
  });

  it('sin configurar, Nicaragua', () => {
    expect(telefonoWhatsapp('88887777')).toBe('50588887777');
  });

  it('no duplica el código si el número ya lo trae', () => {
    expect(telefonoWhatsapp('50588887777', '505')).toBe('50588887777');
  });

  it('un código escrito con + o espacios igual funciona', () => {
    // El campo acepta lo que se escriba; limpiarlo acá evita que un "+505"
    // arme un enlace roto que no avisa.
    expect(telefonoWhatsapp('88887777', '+505')).toBe('50588887777');
    expect(telefonoWhatsapp('88887777', ' 5 0 5 ')).toBe('50588887777');
  });

  it('un código vacío cae en Nicaragua en vez de armar un número sin país', () => {
    expect(telefonoWhatsapp('88887777', '')).toBe('50588887777');
  });

  it('el enlace lleva el código configurado', () => {
    expect(enlaceWhatsapp('88887777', 'hola', '1')).toContain('wa.me/188887777');
  });

  it('un número de otro largo se manda tal cual, sin inventarle prefijo', () => {
    expect(telefonoWhatsapp('13055551234', '505')).toBe('13055551234');
  });
});
