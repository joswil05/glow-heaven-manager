/**
 * Lo que la clienta recibe impreso.
 *
 * La factura y la proforma son el único artefacto del sistema que sale del
 * negocio y queda archivado del otro lado. Un número mal ahí no se corrige
 * después: ya está en manos de otra persona.
 *
 * Estas pruebas fijan tres cosas sobre el documento generado: que los montos
 * impresos sean los de la venta, que la fecha sea la de la venta, y que un
 * nombre con caracteres raros no rompa la maqueta ni meta etiquetas.
 */
import { describe, it, expect } from 'vitest';
import type { VentaCompleta, ParametrosSistema } from '../src/shared/types';
import { generarHtmlFactura, generarHtmlProforma, escaparHtml } from '../src/core/documentos/plantillas';

const PARAMETROS = {
  nombre_negocio: 'Glow Heaven',
  telefono_negocio: '88887777',
  tasa_cambio_cents: 3662,
  cuentas_bancarias: [],
} as unknown as ParametrosSistema;

function ventaBase(extra: Partial<VentaCompleta> = {}): VentaCompleta {
  return {
    id: 7,
    codigo: 'V-0007',
    fecha: '2026-09-14',
    tipo: 'INVENTARIO',
    estado: 'ENTREGADA',
    tasa_cambio_cents: 3662,
    subtotal_usd_cents: 12000,
    descuento_usd_cents: 0,
    total_usd_cents: 12000,
    costo_total_usd_cents: 6000,
    ganancia_usd_cents: 6000,
    pagado_usd_cents: 12000,
    saldo_usd_cents: 0,
    anticipo_esperado_usd_cents: 0,
    cliente_nombre: 'Ana Pérez',
    lineas: [
      {
        id: 1,
        venta_id: 7,
        descripcion: 'Perfume Carolina Herrera',
        cantidad: 2,
        precio_unitario_usd_cents: 6000,
        costo_unitario_usd_cents: 3000,
        subtotal_usd_cents: 12000,
        costo_total_usd_cents: 6000,
        es_paquete: false,
        orden: 1,
      },
    ],
    pagos: [],
    cuotas: [],
    ...extra,
  } as unknown as VentaCompleta;
}

describe('los números que salen impresos', () => {
  it('la factura imprime el total de la venta', () => {
    const html = generarHtmlFactura(ventaBase(), PARAMETROS);
    expect(html).toContain('$120.00');
  });

  it('una factura con saldo dice cuánto falta; una pagada no inventa una deuda', () => {
    const conSaldo = generarHtmlFactura(
      ventaBase({ pagado_usd_cents: 5000, saldo_usd_cents: 7000 } as Partial<VentaCompleta>),
      PARAMETROS
    );
    expect(conSaldo).toContain('$70.00');

    const pagada = generarHtmlFactura(ventaBase(), PARAMETROS);
    expect(pagada).not.toMatch(/Saldo pendiente[^<]*\$[1-9]/);
  });

  it('imprime la fecha de la venta, no la de hoy', () => {
    // La venta es del 14 de septiembre de 2026. Si acá saliera otra fecha, el
    // documento que se archiva estaría mal emitido.
    const html = generarHtmlFactura(ventaBase({ fecha: '2026-09-14' }), PARAMETROS);
    expect(html).toContain('14');
    expect(html).toContain('septiembre');
    expect(html).toContain('2026');
  });

  it('la proforma de un encargo muestra el anticipo que hay que pagar', () => {
    const html = generarHtmlProforma(
      ventaBase({
        tipo: 'ENCARGO',
        estado: 'COTIZADA',
        anticipo_esperado_usd_cents: 6000,
        pagado_usd_cents: 0,
        saldo_usd_cents: 12000,
      } as Partial<VentaCompleta>),
      PARAMETROS
    );
    expect(html).toContain('$60.00');
  });

  it('el documento no queda con el total en NaN si falta un dato', () => {
    const html = generarHtmlFactura(
      ventaBase({ subtotal_usd_cents: undefined } as Partial<VentaCompleta>),
      PARAMETROS
    );
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });
});

describe('texto de la clienta dentro del documento', () => {
  it('escapa los caracteres que romperían la maqueta', () => {
    expect(escaparHtml('Ana & Sofía')).toBe('Ana &amp; Sofía');
    expect(escaparHtml('<b>hola</b>')).toBe('&lt;b&gt;hola&lt;/b&gt;');
    expect(escaparHtml('comillas "dobles"')).toContain('&quot;');
  });

  it('un nombre con signos no mete etiquetas en el documento', () => {
    const html = generarHtmlFactura(
      ventaBase({ cliente_nombre: '<script>alert(1)</script> & Cía' }),
      PARAMETROS
    );

    expect(html, 'el nombre se insertó como HTML en vez de como texto').not.toContain(
      '<script>alert(1)</script>'
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp; Cía');
  });

  it('una descripción con signos tampoco', () => {
    const venta = ventaBase();
    venta.lineas[0].descripcion = 'Camisa "slim" <talla M> & corbata';

    const html = generarHtmlFactura(venta, PARAMETROS);
    expect(html).not.toContain('<talla M>');
    expect(html).toContain('&lt;talla M&gt;');
  });
});
