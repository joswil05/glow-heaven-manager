import React from 'react';
import { cn } from '../../lib/cn';
import { formatearMoneda, usdCentavosACorCentavos } from '@core/moneda';
import { useMoneda } from '../../context/MonedaContext';

export type MoneySize = 'sm' | 'md' | 'lg' | 'xl';

const PRIMARIO: Record<MoneySize, string> = {
  sm: 'text-label',
  md: 'text-body font-semibold',
  lg: 'text-metric-sm',
  xl: 'text-metric',
};

const SECUNDARIO: Record<MoneySize, string> = {
  sm: 'text-caption',
  md: 'text-caption',
  lg: 'text-label',
  xl: 'text-body',
};

export interface MoneyProps {
  /** Siempre en centavos de dólar: es la moneda del sistema. */
  usd_cents: number;
  size?: MoneySize;
  /** Oculta el equivalente en córdobas aunque esté activado globalmente. */
  soloUsd?: boolean;
  /** Pinta en rojo un monto negativo y en verde uno positivo. */
  colorearSigno?: boolean;
  /** Disposición del contravalor en córdobas. 'inline' por defecto, 'stacked' apilado vertical, 'badge' en pastilla. */
  layout?: 'inline' | 'stacked' | 'badge';
  className?: string;
}

export const Money: React.FC<MoneyProps> = ({
  usd_cents,
  size = 'md',
  soloUsd = false,
  colorearSigno = false,
  layout = 'inline',
  className,
}) => {
  const { tasa_cambio_cents, mostrar_cordobas } = useMoneda();

  const mostrarCor = mostrar_cordobas && !soloUsd;
  const cor = mostrarCor ? usdCentavosACorCentavos(usd_cents, tasa_cambio_cents) : 0;

  const colorPrincipal = colorearSigno
    ? usd_cents < 0
      ? 'text-danger-600'
      : usd_cents > 0
        ? 'text-success-700'
        : 'text-texto'
    : 'text-texto';

  if (layout === 'stacked') {
    return (
      <div className={cn('flex flex-col items-start tabular', className)}>
        <span className={cn(PRIMARIO[size], colorPrincipal, 'leading-tight')}>
          {formatearMoneda(usd_cents, 'USD')}
        </span>
        {mostrarCor && (
          <span className={cn(SECUNDARIO[size], 'text-texto-3 font-medium mt-0.5')}>
            ≈ {formatearMoneda(cor, 'COR')}
          </span>
        )}
      </div>
    );
  }

  if (layout === 'badge') {
    return (
      <span className={cn('inline-flex items-center gap-2 tabular flex-wrap', className)}>
        <span className={cn(PRIMARIO[size], colorPrincipal, 'leading-tight')}>
          {formatearMoneda(usd_cents, 'USD')}
        </span>
        {mostrarCor && (
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-superficie-2 text-texto-2 border border-borde/70">
            ≈ {formatearMoneda(cor, 'COR')}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className={cn('inline-flex items-baseline gap-1.5 tabular', className)}>
      <span className={cn(PRIMARIO[size], colorPrincipal)}>
        {formatearMoneda(usd_cents, 'USD')}
      </span>
      {mostrarCor && (
        <span className={cn(SECUNDARIO[size], 'text-texto-3')}>
          {formatearMoneda(cor, 'COR')}
        </span>
      )}
    </span>
  );
};

/** Porcentaje a partir de basis points, sin decimales sobrantes. */
export const Porcentaje: React.FC<{
  bp: number;
  className?: string;
  colorearSigno?: boolean;
}> = ({ bp, className, colorearSigno = false }) => {
  const pct = bp / 100;
  // Un "69.0%" no dice mas que "69%": el decimal solo importa cuando el
  // numero es chico y la diferencia se nota.
  const decimales = Math.abs(pct) < 10 && pct % 1 !== 0 ? 1 : 0;
  const texto = `${bp > 0 && colorearSigno ? '+' : ''}${pct.toFixed(decimales)}%`;
  const color = colorearSigno
    ? bp < 0
      ? 'text-danger-600'
      : bp > 0
        ? 'text-success-700'
        : 'text-texto-3'
    : undefined;
  return <span className={cn('tabular', color, className)}>{texto}</span>;
};
