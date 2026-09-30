import type { Categoria, ParametrosSistema, ProductoConStock } from '../shared/types';
import { precioParaCosto } from './paquete';
import { margenEfectivo } from './precios';

/**
 * Los precios que no corresponden a su costo, para que ella decida.
 *
 * Un precio no se corrige por detrás: son los precios que ella les da a sus
 * clientas. Cambiar el margen o el redondeo en Configuración deja esta lista
 * armada, y "Revisar precios" aplica sólo los que ella elige, con Deshacer.
 * Hasta la 2.16.2 guardar Configuración los reescribía todos en silencio.
 *
 * Un precio escrito a mano no aparece: ese lo decidió ella.
 *
 * Vivía en la ventana de Inventario; está acá para que Configuración pueda
 * armar la misma lista después de un cambio de margen.
 */
export interface PrecioParaRevisar {
  producto: ProductoConStock;
  calculado: number;
}

/** Los productos cuyo precio guardado no es el que da su costo y su margen. */
export function preciosParaRevisar(
  productos: ProductoConStock[],
  categorias: Categoria[],
  parametros: ParametrosSistema | null
): PrecioParaRevisar[] {
  if (!parametros) return [];
  const salida: PrecioParaRevisar[] = [];
  for (const p of productos) {
    if (!p.activo || p.modo_precio === 'MANUAL' || p.costo_unitario_usd_cents <= 0) continue;
    const calculado = precioParaCosto(
      {
        modo_precio: p.modo_precio,
        margen_bp: margenEfectivo(p, categorias, parametros.margen_defecto_bp),
        multiplicador_bp: p.multiplicador_bp,
        precio_manual_usd_cents: p.precio_manual_usd_cents,
        precio_venta_usd_cents: p.precio_venta_usd_cents,
      },
      p.costo_unitario_usd_cents,
      parametros.paso_redondeo_usd_cents
    );
    if (calculado !== p.precio_venta_usd_cents) salida.push({ producto: p, calculado });
  }
  return salida.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));
}
