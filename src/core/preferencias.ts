import type { ParametrosSistema, MonedaPago, MetodoPago } from '../shared/types';

/**
 * Con que moneda y que metodo arrancan los cobros.
 *
 * Antes cada pantalla decidia por su cuenta: el editor de venta abria en
 * cordobas y el modal de abono en dolares, en la misma app. Y habia una
 * configuracion de "moneda por defecto" que se guardaba y no la leia nadie.
 *
 * El vocabulario no coincide y hay que traducir: los parametros guardan `NIO`
 * y el resto de la app dice `COR` para lo mismo. No se cambia lo guardado
 * porque ya hay bases con `NIO` adentro.
 */
export function monedaPorDefecto(parametros?: ParametrosSistema | null): MonedaPago {
  return parametros?.moneda_defecto_venta === 'NIO' ? 'COR' : 'USD';
}

export function metodoPorDefecto(parametros?: ParametrosSistema | null): MetodoPago {
  return parametros?.metodo_pago_defecto ?? 'EFECTIVO';
}
