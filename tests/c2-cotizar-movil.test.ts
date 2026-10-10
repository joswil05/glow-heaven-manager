/**
 * Fase C2 · T5: la cuenta de "Cotizar" en el celular.
 *
 * Marcar "No se consiguió" saca la pieza del total pero conserva lo que Ross
 * escribió, como en Windows (`CotizarEncargoModal`): si después vuelve a
 * desmarcarla, o si la clienta la vuelve a pedir, el precio que cotizó está
 * ahí. Lo encontró la revisión del 10/10: el celular volvía al precio
 * original y descartaba lo editado.
 */
import { describe, it, expect } from 'vitest';
import type { VentaCompleta, VentaLinea } from '../src/shared/types';
import { analizar, armarPiezas } from '../mobile/src/lib/cotizacion-movil';

function linea(extra: Partial<VentaLinea> & Pick<VentaLinea, 'id' | 'descripcion'>): VentaLinea {
  return {
    venta_id: 7,
    cantidad: 1,
    precio_unitario_usd_cents: 1250,
    costo_unitario_usd_cents: 900,
    subtotal_usd_cents: 1250,
    costo_total_usd_cents: 900,
    es_paquete: false,
    orden: 1,
    precio_tienda_usd_cents: 500,
    peso_mlb: 1000,
    ...extra,
  } as VentaLinea;
}

function encargo(lineas: VentaLinea[]): VentaCompleta {
  return {
    id: 7,
    codigo: 'V-0007',
    fecha: '2026-10-01',
    tipo: 'ENCARGO',
    estado: 'COTIZADA',
    tasa_cambio_cents: 3662,
    total_usd_cents: lineas.reduce((s, l) => s + l.subtotal_usd_cents, 0),
    costo_total_usd_cents: 0,
    ganancia_usd_cents: 0,
    pagado_usd_cents: 0,
    saldo_usd_cents: 0,
    anticipo_esperado_usd_cents: 0,
    activo: true,
    lineas,
    pagos: [],
    cuotas: [],
  } as unknown as VentaCompleta;
}

describe('Cotizar en el celular: "No se consiguió" conserva lo escrito', () => {
  it('edita el precio y los datos, la descarta: se manda lo editado, con subtotal y costo en cero', () => {
    const [pieza] = armarPiezas(encargo([linea({ id: 1, descripcion: 'Bolso' })]));
    const editada = { ...pieza, precio: '15', tienda: '6', peso: '2', costo: '11.20', descartada: true };
    const r = analizar([editada]);

    expect(r.valido).toBe(true);
    expect(r.cambios).toEqual([
      {
        id: 1,
        precio_unitario_usd_cents: 1500,
        precio_tienda_usd_cents: 600,
        peso_mlb: 2000,
        costo_estimado_unitario_usd_cents: 1120,
        descartada: true,
      },
    ]);
    expect(r.lineas[0]).toMatchObject({ precio_unitario_usd_cents: 1500, subtotal_usd_cents: 0, costo_total_usd_cents: 0 });
  });

  it('un valor que no se entiende en una pieza descartada no bloquea guardar: queda el de antes', () => {
    const [pieza] = armarPiezas(encargo([linea({ id: 1, descripcion: 'Bolso' })]));
    const r = analizar([{ ...pieza, precio: 'abc', descartada: true }]);
    expect(r.valido).toBe(true);
    expect(r.cambios[0]).toMatchObject({ precio_unitario_usd_cents: 1250, descartada: true });
  });

  it('sin tocar nada más que "No se consiguió", sólo cambia eso', () => {
    const [pieza] = armarPiezas(encargo([linea({ id: 1, descripcion: 'Bolso' })]));
    const r = analizar([{ ...pieza, descartada: true }]);
    expect(r.cambios).toEqual([{ id: 1, precio_unitario_usd_cents: 1250, descartada: true }]);
  });

  it('una pieza que ya llegó no manda costo estimado, aunque se descarte', () => {
    // Una pieza que llegó no se puede descartar (`descartable`); el costo real
    // se conserva y no viaja un costo estimado.
    const [pieza] = armarPiezas(
      encargo([linea({ id: 1, descripcion: 'Bolso', compra_id: 3, llego_el: '2026-10-05' } as Partial<VentaLinea> & { id: number; descripcion: string })])
    );
    expect(pieza.costoReal).toBe(true);
    expect(pieza.puedeDescartar).toBe(false);
    const r = analizar([{ ...pieza, precio: '20', costo: '99' }]);
    expect(r.cambios[0]).not.toHaveProperty('costo_estimado_unitario_usd_cents');
    expect(r.cambios[0].precio_unitario_usd_cents).toBe(2000);
  });
});
