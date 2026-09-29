import { describe, it, expect } from 'vitest';
import {
  etapaEncargo,
  piezasDe,
  textoEtapa,
  estadoPieza,
  costoEstimadoDePieza,
  sinPaquete,
  recalcularEncargo,
  FASES_EN_CURSO,
} from '@core/encargos';
import { estadoInicialEncargo, pagoAcepta } from '@core/cobranza';
import { diasEntre } from '@core/fechas';

const HOY = '2026-09-28';

describe('de dónde sale cada pieza', () => {
  it('en un paquete que no llegó, está en camino; cuando llega, llegó', () => {
    expect(estadoPieza({ compra_id: 3 })).toBe('EN_CAMINO');
    expect(estadoPieza({ compra_id: 3, llego_el: '2026-10-12' })).toBe('LLEGO');
  });

  it('con un producto del catálogo y sin paquete, sale de la bodega', () => {
    expect(estadoPieza({ producto_id: 7 })).toBe('DE_BODEGA');
  });

  it('comprada y sin paquete todavía: espera paquete; al entrar en uno, está en camino', () => {
    // Ella no sabe en qué paquete viene: sólo que ya lo compró.
    expect(estadoPieza({ comprado_el: '2026-09-25' })).toBe('COMPRADA');
    expect(estadoPieza({ comprado_el: '2026-09-25', compra_id: 3 })).toBe('EN_CAMINO');
    expect(estadoPieza({})).toBe('POR_COMPRAR');
  });

  it('si vino en un paquete, no sale de la bodega aunque apunte a un producto', () => {
    // Era el doble descuento: la pieza llegaba en el paquete y al entregarla se
    // descontaba además una unidad del estante.
    expect(estadoPieza({ producto_id: 7, compra_id: 3, llego_el: '2026-10-12' })).toBe('LLEGO');
  });
});

describe('la etapa del encargo', () => {
  const pendiente = (lineas: Parameters<typeof piezasDe>[0]) => ({
    estado: 'PENDIENTE' as const,
    piezas: piezasDe(lineas),
  });

  it('confirmado y sin comprar', () => {
    expect(etapaEncargo(pendiente([{}, {}]))).toBe('POR_COMPRAR');
  });

  it('con una pieza comprada y otra no, todavía hay algo por comprar', () => {
    expect(etapaEncargo(pendiente([{ compra_id: 3 }, {}]))).toBe('POR_COMPRAR');
  });

  it('todo comprado y una sola pieza llegó: en camino, "1 de 2 llegó"', () => {
    const v = pendiente([{ compra_id: 3, llego_el: '2026-10-12' }, { compra_id: 4 }]);
    expect(etapaEncargo(v)).toBe('EN_CAMINO');
    expect(textoEtapa(v, HOY)).toBe('En camino · 1 de 2 llegó');
    const tres = { estado: 'PENDIENTE' as const, piezas: { total: 3, compradas: 3, llegadas: 2, de_bodega: 0 } };
    expect(textoEtapa(tres, HOY)).toBe('En camino · 2 de 3 llegaron');
  });

  it('comprado y esperando paquete ya no está por comprar: está en camino', () => {
    const v = pendiente([{ comprado_el: '2026-09-25' }, { compra_id: 4 }]);
    expect(etapaEncargo(v)).toBe('EN_CAMINO');
    expect(v.piezas).toEqual({ total: 2, compradas: 2, llegadas: 0, de_bodega: 0, esperan_paquete: 1, sin_precio: 0, descartadas: 0 });
  });

  it('cuántas piezas todavía no vienen en ningún paquete', () => {
    // Las que ofrece el paquete: por comprar o compradas, sin paquete.
    expect(sinPaquete(piezasDe([{}, { comprado_el: '2026-09-25' }, { compra_id: 3 }, { producto_id: 7 }]))).toBe(2);
    // Un resumen guardado antes de este campo no sabe de compradas sin paquete.
    expect(sinPaquete({ total: 3, compradas: 1, llegadas: 0, de_bodega: 1 })).toBe(1);
    expect(sinPaquete(undefined)).toBe(0);
  });

  it('todo llegó o sale de la bodega: por entregar', () => {
    expect(etapaEncargo(pendiente([{ compra_id: 3, llego_el: '2026-10-12' }, { producto_id: 7 }]))).toBe(
      'POR_ENTREGAR'
    );
  });

  it('lo guardado manda: entregado, anulado; un cotizado viejo, sin resumen, queda por mandar', () => {
    expect(etapaEncargo({ estado: 'COTIZADA' })).toBe('POR_MANDAR');
    expect(etapaEncargo({ estado: 'ENTREGADA' })).toBe('ENTREGADO');
    expect(etapaEncargo({ estado: 'CANCELADA' })).toBe('ANULADO');
  });

  it('un encargo anterior a la 2.14, sin resumen de piezas, queda por comprar', () => {
    expect(etapaEncargo({ estado: 'PENDIENTE' })).toBe('POR_COMPRAR');
  });
});

describe('cotizar con números', () => {
  it('tienda + 7% + peso por la tarifa', () => {
    // Un perfume de $45.00 que pesa 1.5 lb, a $7.00 la libra.
    expect(
      costoEstimadoDePieza({ tienda_usd_cents: 4500, peso_mlb: 1500, tax_bp: 700, tarifa_cents_lb: 700 })
    ).toBe(4500 + 315 + 1050);
  });
});

describe('pedidos: un encargo antes del precio', () => {
  // Una clienta pide algo que ella nunca compró: no sabe cuánto vale ni si lo
  // va a conseguir. Lo anota sin precio y lo cotiza cuando lo encuentra.
  it('una pieza con precio cero todavía no tiene precio', () => {
    expect(piezasDe([{ precio_unitario_usd_cents: 0 }, { precio_unitario_usd_cents: 4500 }]).sin_precio).toBe(1);
  });

  it('con alguna pieza sin precio, está por buscar', () => {
    const v = { estado: 'COTIZADA' as const, piezas: piezasDe([{ precio_unitario_usd_cents: 0 }]) };
    expect(etapaEncargo(v)).toBe('POR_BUSCAR');
    expect(textoEtapa(v, HOY)).toBe('Por buscar');
  });

  it('con todo cotizado y sin mandar, está por mandar', () => {
    expect(etapaEncargo({ estado: 'COTIZADA', piezas: piezasDe([{ precio_unitario_usd_cents: 4500 }]) })).toBe('POR_MANDAR');
  });

  it('un pedido nace cotizado: sin precio no hay anticipo que lo confirme', () => {
    expect(
      estadoInicialEncargo({ total_usd_cents: 0, pagado_usd_cents: 0, anticipo_esperado_usd_cents: 0, sin_precio: 1 })
    ).toBe('COTIZADA');
  });

  it('el que no se consiguió lo dice', () => {
    expect(textoEtapa({ estado: 'CANCELADA', motivo_anulacion: 'NO_SE_CONSIGUIO' }, HOY)).toBe('No se consiguió');
    expect(textoEtapa({ estado: 'CANCELADA' }, HOY)).toBe('Anulado');
  });
});

describe('las fases de un encargo', () => {
  // El camino real: buscarlo, mandarle la cotización, esperar que diga que
  // sí, comprarlo, que llegue, entregarlo. Ver docs/PLAN_ENCARGOS_Y_SIN_CONEXION.md.
  const cot = (lineas: Parameters<typeof piezasDe>[0], extra: Record<string, unknown> = {}) => ({
    estado: 'COTIZADA' as const,
    piezas: piezasDe(lineas),
    ...extra,
  });
  const mandada = { cotizacion_version: 2, cotizacion_enviada_version: 2, cotizacion_enviada_el: '2026-09-25' };

  it('van en el orden en que pasan', () => {
    expect(FASES_EN_CURSO).toEqual(['POR_BUSCAR', 'POR_MANDAR', 'ESPERANDO', 'POR_COMPRAR', 'EN_CAMINO', 'POR_ENTREGAR']);
  });

  it('con precio y nunca mandada: por mandar', () => {
    const v = cot([{ precio_unitario_usd_cents: 4500 }]);
    expect(etapaEncargo(v)).toBe('POR_MANDAR');
    expect(textoEtapa(v, HOY)).toBe('Por mandar');
  });

  it('mandada, con la misma versión: esperando respuesta, y desde cuándo', () => {
    const v = cot([{ precio_unitario_usd_cents: 4500 }], mandada);
    expect(etapaEncargo(v)).toBe('ESPERANDO');
    expect(textoEtapa(v, HOY)).toBe('Esperando respuesta · hace 3 días');
    expect(textoEtapa({ ...v, cotizacion_enviada_el: HOY }, HOY)).toBe('Esperando respuesta · hoy');
    expect(textoEtapa({ ...v, cotizacion_enviada_el: '2026-09-27' }, HOY)).toBe('Esperando respuesta · ayer');
  });

  it('cambió el precio después de mandarla: otra vez por mandar, y lo dice', () => {
    const v = cot([{ precio_unitario_usd_cents: 4500 }], { ...mandada, cotizacion_version: 3 });
    expect(etapaEncargo(v)).toBe('POR_MANDAR');
    expect(textoEtapa(v, HOY)).toBe('Por mandar · cambió el precio');
  });

  it('comprado antes de que acepte: sigue esperando, y dice que ya se compró', () => {
    const v = cot([{ precio_unitario_usd_cents: 4500, comprado_el: '2026-09-26' }], mandada);
    expect(etapaEncargo(v)).toBe('ESPERANDO');
    expect(textoEtapa(v, HOY)).toBe('Esperando respuesta · ya comprado');
  });

  it('una pieza no conseguida no traba a las demás', () => {
    const v = cot([
      { precio_unitario_usd_cents: 4500 },
      { precio_unitario_usd_cents: 0, descartada_el: '2026-09-27' },
    ]);
    expect(v.piezas).toEqual({
      total: 2, compradas: 0, llegadas: 0, de_bodega: 0, esperan_paquete: 0, sin_precio: 0, descartadas: 1,
    });
    expect(etapaEncargo(v)).toBe('POR_MANDAR');
  });

  it('una pieza descartada no cuenta como comprada ni como de la bodega', () => {
    // Apunta a un producto del catálogo, pero no se va a entregar.
    expect(estadoPieza({ producto_id: 7, descartada_el: '2026-09-27' })).toBe('DESCARTADA');
    const p = piezasDe([{ producto_id: 7, descartada_el: '2026-09-27' }, { compra_id: 3, llego_el: '2026-09-27' }]);
    expect([p.de_bodega, p.llegadas, p.descartadas]).toEqual([0, 1, 1]);
    expect(etapaEncargo({ estado: 'PENDIENTE', piezas: p })).toBe('POR_ENTREGAR');
  });

  it('todo sin conseguir: por buscar, y lo dice', () => {
    const v = cot([{ precio_unitario_usd_cents: 0, descartada_el: '2026-09-27' }]);
    expect(etapaEncargo(v)).toBe('POR_BUSCAR');
    expect(textoEtapa(v, HOY)).toBe('No se consiguió nada');
  });

  it('las descartadas no las trae un paquete', () => {
    expect(sinPaquete(piezasDe([{}, { descartada_el: '2026-09-27' }]))).toBe(1);
  });

  it('aceptó sin anticipo: por comprar, y lo dice', () => {
    const v = {
      estado: 'PENDIENTE' as const,
      piezas: piezasDe([{ precio_unitario_usd_cents: 4500 }]),
      pagado_usd_cents: 0,
      anticipo_esperado_usd_cents: 2250,
    };
    expect(etapaEncargo(v)).toBe('POR_COMPRAR');
    expect(textoEtapa(v, HOY)).toBe('Por comprar · sin anticipo');
    expect(textoEtapa({ ...v, pagado_usd_cents: 2250 }, HOY)).toBe('Por comprar');
  });

  it('los motivos de un anulado', () => {
    expect(textoEtapa({ estado: 'CANCELADA', motivo_anulacion: 'NO_ACEPTO' }, HOY)).toBe('No aceptó');
  });

  it('un confirmado viejo, sin resumen de piezas, queda por comprar', () => {
    expect(etapaEncargo({ estado: 'PENDIENTE' })).toBe('POR_COMPRAR');
  });
});

describe('quién confirma un encargo', () => {
  it('con anticipo de 0%, tener precio ya no lo confirma: falta que acepte', () => {
    expect(estadoInicialEncargo({ total_usd_cents: 5000, pagado_usd_cents: 0, anticipo_esperado_usd_cents: 0 })).toBe('COTIZADA');
  });

  it('quien paga, aceptó', () => {
    expect(pagoAcepta({ pagado_usd_cents: 1, anticipo_esperado_usd_cents: 0 })).toBe(true);
    expect(pagoAcepta({ pagado_usd_cents: 2500, anticipo_esperado_usd_cents: 2500 })).toBe(true);
    expect(pagoAcepta({ pagado_usd_cents: 2499, anticipo_esperado_usd_cents: 2500 })).toBe(false);
    expect(pagoAcepta({ pagado_usd_cents: 0, anticipo_esperado_usd_cents: 0 })).toBe(false);
    expect(estadoInicialEncargo({ total_usd_cents: 5000, pagado_usd_cents: 100, anticipo_esperado_usd_cents: 0 })).toBe('PENDIENTE');
  });

  it('un total en cero no se confirma, aunque no deba nada', () => {
    // Pasa si todas las piezas quedaron "no se consiguió".
    expect(estadoInicialEncargo({ total_usd_cents: 0, pagado_usd_cents: 0, anticipo_esperado_usd_cents: 0 })).toBe('COTIZADA');
  });
});

describe('recalcular un encargo', () => {
  const linea = (id: number, precio: number, costo: number, extra: Record<string, unknown> = {}) => ({
    id,
    cantidad: 1,
    precio_unitario_usd_cents: precio,
    subtotal_usd_cents: extra.descartada_el ? 0 : precio,
    costo_unitario_usd_cents: costo,
    costo_total_usd_cents: extra.descartada_el ? 0 : costo,
    ...extra,
  });

  it('una pieza descartada sale del total, el costo y el anticipo', () => {
    const r = recalcularEncargo(
      { estado: 'COTIZADA', anticipo_bp: 5000, pagado_usd_cents: 0 },
      [linea(1, 6000, 3800), linea(2, 4000, 2500, { descartada_el: '2026-09-27' })],
      5000
    );
    expect([r.subtotal_usd_cents, r.total_usd_cents, r.costo_total_usd_cents, r.ganancia_usd_cents]).toEqual([6000, 6000, 3800, 2200]);
    expect([r.anticipo_esperado_usd_cents, r.saldo_usd_cents, r.estado]).toEqual([3000, 6000, 'COTIZADA']);
    expect(r.piezas.descartadas).toBe(1);
  });

  it('respeta el descuento del encargo, y lo guardado como aceptado sigue aceptado', () => {
    const r = recalcularEncargo(
      { estado: 'PENDIENTE', anticipo_bp: 5000, pagado_usd_cents: 0, descuento_tipo: 'PORCENTAJE', descuento_valor: 10 },
      [linea(1, 6000, 3800)],
      5000
    );
    expect([r.descuento_usd_cents, r.total_usd_cents, r.estado]).toEqual([600, 5400, 'PENDIENTE']);
  });

  it('sin anticipo_bp guardado, lo saca del anticipo y el total de antes', () => {
    const r = recalcularEncargo(
      { estado: 'COTIZADA', total_usd_cents: 10000, anticipo_esperado_usd_cents: 3000, pagado_usd_cents: 0 },
      [linea(1, 8000, 5000)],
      5000
    );
    expect([r.anticipo_bp, r.anticipo_esperado_usd_cents]).toEqual([3000, 2400]);
  });
});

describe('días entre dos fechas del negocio', () => {
  it('cuenta días de calendario', () => {
    expect(diasEntre('2026-09-25', '2026-09-28')).toBe(3);
    expect(diasEntre('2026-09-28', '2026-09-28')).toBe(0);
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2);
  });
});
