import { usdCentavosACorCentavos, formatearMoneda } from '@core/moneda';
import { useDatosNegocio } from '../context/DataContext';

/**
 * Todo el dinero de la app nace en centavos USD (la regla de oro de
 * Firestore). Este componente es el único lugar que decide cómo se ve: USD
 * grande y córdobas chico debajo, o solo USD si el negocio apagó
 * `mostrar_cordobas` o si la pantalla que lo usa es de análisis y no de
 * cobro (`soloUsd`). Los córdobas importan donde se cobra (Cobros y Abonos,
 * precios del catálogo); en el panel del día son ruido repetido.
 */
export function MoneyDual({
  usdCents,
  size = 'md',
  className = '',
  soloUsd = false,
}: {
  usdCents: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  soloUsd?: boolean;
}) {
  const { parametros } = useDatosNegocio();
  const tasa = parametros?.tasa_cambio_cents ?? 3662;
  const mostrarCor = (parametros?.mostrar_cordobas ?? true) && !soloUsd;
  const corCents = usdCentavosACorCentavos(usdCents, tasa);

  const tamUsd = size === 'lg' ? 'text-metric' : size === 'sm' ? 'text-body font-semibold' : 'text-title';

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className={`${tamUsd} text-texto tabular-nums leading-tight`}>
        {formatearMoneda(usdCents, 'USD')}
      </span>
      {mostrarCor && (
        <span className="text-caption text-texto-3 tabular-nums">
          {formatearMoneda(corCents, 'COR')}
        </span>
      )}
    </span>
  );
}
