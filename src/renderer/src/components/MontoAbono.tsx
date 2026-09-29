import React from 'react';
import type { Pago } from '../../../shared/types';
import { textoPagado, textoEquivalente } from '@core/abonos';
import { cn } from '../lib/cn';

/**
 * Un abono como se pagó: "C$600.00" arriba y "$16.38" abajo, con la tasa del
 * abono. Mostrarlo primero en dólares cuando entró en córdobas hacía parecer
 * que se había cargado en la moneda equivocada.
 */
export const MontoAbono: React.FC<{
  pago: Pick<Pago, 'moneda' | 'monto_usd_cents' | 'monto_cor_cents' | 'activo'>;
  className?: string;
}> = ({ pago, className }) => (
  <div className={cn('text-right leading-tight', className)}>
    <div className={cn('text-label font-semibold tabular text-texto', pago.activo === false && 'line-through text-texto-3')}>
      {textoPagado(pago)}
    </div>
    <div className="text-caption tabular text-texto-3">{textoEquivalente(pago)}</div>
  </div>
);
