/**
 * Cómo va cada paquete, calculado de los lotes (Fase C1).
 *
 * Cada lote sabe de qué paquete vino (`compra_id`), cuántas unidades
 * entraron y cuántas quedan, cuántas se vendieron y por cuánto. Con eso se
 * sabe si un paquete todavía tiene algo en bodega o si se vendió todo, sin
 * guardar ningún estado: si se anula una venta y vuelven unidades al lote, el
 * paquete vuelve a estar en venta solo.
 *
 * Reemplaza las alertas de "agotados": un producto que se trajo una vez y se
 * vendió no es un problema, es una venta. Lo que se ve es el paquete.
 *
 * `Compra.cerrado_en` es cuándo el paquete entró al inventario; acá "se vendió
 * todo" se llama VENDIDO, para no confundirlos.
 */
import type {
  AvancePaquete,
  Compra,
  DeudaDelPaquete,
  PiezaQueQueda,
  ProductoConStock,
  VendidoRapido,
  Venta,
  VentaLinea,
} from '../shared/types';
import { diasEntre } from './fechas';
import { formatearMoneda } from './moneda';

/** "18 de 22 vendidas · quedan 4": lo dicen igual las dos apps. */
export const textoAvance = (a: Pick<AvancePaquete, 'unidades_vendidas' | 'unidades_recibidas' | 'unidades_quedan'>): string =>
  `${a.unidades_vendidas} de ${a.unidades_recibidas} vendidas · quedan ${a.unidades_quedan}`;

/** "el mismo día", "1 día", "13 días": no "0 días". */
export const textoDias = (dias: number): string =>
  dias === 0 ? 'el mismo día' : `${dias} ${dias === 1 ? 'día' : 'días'}`;

/** "PQ-0001: se vendió todo en 13 días", o "…el mismo día". */
export function textoVendidoTodo(a: Pick<AvancePaquete, 'codigo' | 'dias_en_venderse'>): string {
  const d = a.dias_en_venderse;
  const cuando = d === undefined ? '' : d === 0 ? ' el mismo día' : ` en ${textoDias(d)}`;
  return `${a.codigo}: se vendió todo${cuando}`;
}

/** "Recuperaste $12.00 de $37.10", o, si ya se cobró más de lo que costó, eso. */
export function textoRecuperado(a: Pick<AvancePaquete, 'cobrado_usd_cents' | 'invertido_usd_cents'>): string {
  const $ = (c: number) => formatearMoneda(c, 'USD');
  return a.cobrado_usd_cents >= a.invertido_usd_cents
    ? `Ya recuperaste lo que costó (${$(a.invertido_usd_cents)}) y ${$(a.cobrado_usd_cents - a.invertido_usd_cents)} más`
    : `Recuperaste ${$(a.cobrado_usd_cents)} de ${$(a.invertido_usd_cents)}`;
}

export type CompraParaAvance = Pick<Compra, 'id' | 'codigo' | 'fecha' | 'estado' | 'activo'> &
  Partial<Pick<Compra, 'cerrado_en' | 'resumen_visto_el'>>;
export type ProductoParaAvance = Pick<ProductoConStock, 'id' | 'nombre' | 'variantes' | 'lotes'>;
export type VentaParaAvance = Pick<
  Venta,
  'id' | 'codigo' | 'fecha' | 'estado' | 'activo' | 'total_usd_cents' | 'saldo_usd_cents' | 'cliente_nombre'
> & { lineas?: Pick<VentaLinea, 'producto_id' | 'lotes_consumidos'>[] };

/** Desde cuándo se cuenta: el día que entró al inventario, o su fecha. */
function inicio(c: CompraParaAvance): string {
  return (c.cerrado_en ?? '').slice(0, 10) || c.fecha;
}

function detalleDe(p: ProductoParaAvance, variante_id: number): string | undefined {
  const v = p.variantes?.find((x) => x.id === variante_id);
  const texto = [v?.talla, v?.color].filter(Boolean).join(' ');
  return texto || undefined;
}

/** Lo que una venta cobró por unidades de este paquete. */
function ingresoDelPaquete(v: VentaParaAvance, compra_id: number): number {
  let total = 0;
  for (const l of v.lineas ?? []) {
    for (const c of l.lotes_consumidos ?? []) {
      if (c.compra_id === compra_id) total += c.ingreso_usd_cents ?? 0;
    }
  }
  return total;
}

/**
 * El avance de cada paquete recibido, el más nuevo primero. Los borradores, los
 * anulados y los que sólo traían encargos (sin lotes de inventario) no salen.
 *
 * `ventas` alcanza con las que tiene el panel (las de 90 días y las que deben):
 * la deuda sale de las que deben, y las fechas de "cuánto tardó" de las
 * recientes. Si la última venta de un producto es más vieja, no se inventa:
 * ese producto no entra en "lo más rápido".
 */
export function avanceDePaquetes(
  compras: readonly CompraParaAvance[],
  productos: readonly ProductoParaAvance[],
  ventas: readonly VentaParaAvance[]
): AvancePaquete[] {
  const vivas = ventas.filter((v) => v.activo !== false && v.estado !== 'CANCELADA');
  const salida: AvancePaquete[] = [];

  for (const c of compras) {
    if (c.activo === false || c.estado !== 'RECIBIDA') continue;

    let recibidas = 0;
    let quedan = 0;
    let vendidas = 0;
    let bajas = 0;
    let invertido = 0;
    let vendido = 0;
    let costoVendido = 0;
    const piezas: PiezaQueQueda[] = [];
    /** Por producto: si todos sus lotes de este paquete quedaron en cero, y cuántas vendió. */
    const porProducto = new Map<number, { agotado: boolean; vendidas: number }>();

    for (const p of productos) {
      for (const l of p.lotes ?? []) {
        if (l.compra_id !== c.id) continue;
        recibidas += l.cantidad_inicial ?? 0;
        quedan += l.cantidad ?? 0;
        vendidas += l.vendidas ?? 0;
        bajas += l.bajas ?? 0;
        invertido +=
          (l.valor_usd_cents ?? 0) + (l.costo_vendido_usd_cents ?? 0) + (l.bajas ?? 0) * (l.costo_unitario_usd_cents ?? 0);
        vendido += l.ingreso_usd_cents ?? 0;
        costoVendido += l.costo_vendido_usd_cents ?? 0;

        const previo = porProducto.get(p.id) ?? { agotado: true, vendidas: 0 };
        porProducto.set(p.id, {
          agotado: previo.agotado && (l.cantidad ?? 0) === 0,
          vendidas: previo.vendidas + (l.vendidas ?? 0),
        });

        if ((l.cantidad ?? 0) > 0) {
          const ya = piezas.find((x) => x.producto_id === p.id && x.variante_id === l.variante_id);
          if (ya) ya.cantidad += l.cantidad;
          else
            piezas.push({
              producto_id: p.id,
              nombre: p.nombre,
              variante_id: l.variante_id,
              detalle: detalleDe(p, l.variante_id),
              cantidad: l.cantidad,
            });
        }
      }
    }
    // Sin lotes de inventario: el paquete sólo traía encargos.
    if (recibidas === 0) continue;

    const deudas: DeudaDelPaquete[] = [];
    const ultimaPorProducto = new Map<number, string>();
    let ultima: string | undefined;
    for (const v of vivas) {
      for (const l of v.lineas ?? []) {
        if (!l.producto_id) continue;
        if (!(l.lotes_consumidos ?? []).some((x) => x.compra_id === c.id)) continue;
        const previa = ultimaPorProducto.get(l.producto_id);
        if (!previa || v.fecha > previa) ultimaPorProducto.set(l.producto_id, v.fecha);
        if (!ultima || v.fecha > ultima) ultima = v.fecha;
      }
      if (v.saldo_usd_cents <= 0 || v.total_usd_cents <= 0) continue;
      const ingreso = ingresoDelPaquete(v, c.id);
      if (ingreso <= 0) continue;
      const pendiente = Math.min(ingreso, Math.round((v.saldo_usd_cents * ingreso) / v.total_usd_cents));
      if (pendiente > 0) {
        deudas.push({
          venta_id: v.id,
          codigo: v.codigo,
          cliente_nombre: v.cliente_nombre || 'Mostrador',
          pendiente_usd_cents: pendiente,
        });
      }
    }
    deudas.sort((a, b) => b.pendiente_usd_cents - a.pendiente_usd_cents);
    const porCobrar = deudas.reduce((s, d) => s + d.pendiente_usd_cents, 0);

    const desde = inicio(c);
    const masRapidos: VendidoRapido[] = [];
    for (const [producto_id, info] of porProducto) {
      const fecha = ultimaPorProducto.get(producto_id);
      if (!info.agotado || info.vendidas === 0 || !fecha) continue;
      const nombre = productos.find((p) => p.id === producto_id)?.nombre ?? '';
      masRapidos.push({ producto_id, nombre, dias: Math.max(0, diasEntre(desde, fecha)) });
    }
    masRapidos.sort((a, b) => a.dias - b.dias || a.nombre.localeCompare(b.nombre));

    const estado = quedan === 0 ? 'VENDIDO' : 'EN_VENTA';
    salida.push({
      compra_id: c.id,
      codigo: c.codigo,
      fecha: c.fecha,
      estado,
      unidades_recibidas: recibidas,
      unidades_vendidas: vendidas,
      unidades_bajas: bajas,
      unidades_quedan: quedan,
      invertido_usd_cents: invertido,
      vendido_usd_cents: vendido,
      costo_vendido_usd_cents: costoVendido,
      ganancia_usd_cents: vendido - costoVendido,
      por_cobrar_usd_cents: porCobrar,
      cobrado_usd_cents: Math.max(0, vendido - porCobrar),
      quedan: piezas,
      deudas,
      mas_rapidos: masRapidos.slice(0, 3),
      dias_en_venderse: estado === 'VENDIDO' && ultima ? Math.max(0, diasEntre(desde, ultima)) : undefined,
      resumen_visto_el: c.resumen_visto_el,
    });
  }

  return salida.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.compra_id - a.compra_id);
}
