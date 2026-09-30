import type { TipoVenta } from '../shared/types';

/**
 * El código con que se muestra una venta o un encargo: "V-0024", "E-0024".
 *
 * Lo arma el repositorio al crearla, y el celular lo necesitaba antes de
 * volver a leerla (la pantalla de venta registrada). Lo armaba a mano como
 * "V-24", y el recibo que salía por WhatsApp llevaba un código que no existía
 * en el sistema. Un solo lugar para las dos apps.
 */
export function codigoDeVenta(id: number, tipo: TipoVenta = 'INVENTARIO'): string {
  return `${tipo === 'ENCARGO' ? 'E' : 'V'}-${String(id).padStart(4, '0')}`;
}
