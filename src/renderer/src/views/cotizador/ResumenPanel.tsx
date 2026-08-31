import React from 'react';
import { ShoppingBag } from 'lucide-react';
import type { ResultadoCotizacionCompleta } from '@core/precios';
import { formatearMoneda } from '@core/moneda';
import { Card, CardHeader, CardContent, SectionHeader, Button } from '../../components/ui';
import { cn } from '../../lib/cn';

export interface ResumenPanelProps {
  calculo: ResultadoCotizacionCompleta | null;
  anticipoPorcentaje: number;
  onSelectAnticipo: (pct: number) => void;
  onConvertirAPedido: () => void;
  guardando: boolean;
  canConvert: boolean;
}

export const ResumenPanel: React.FC<ResumenPanelProps> = ({
  calculo,
  anticipoPorcentaje,
  onSelectAnticipo,
  onConvertirAPedido,
  guardando,
  canConvert,
}) => {
  if (!calculo) return null;

  const { totales } = calculo;

  return (
    <Card className="sticky top-6">
      <CardHeader>
        <SectionHeader title="Resumen de Cotización" />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Desglose de costos estimados */}
        <div className="space-y-2 text-body">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal compras USA:</span>
            <span className="tabular font-medium">
              {formatearMoneda(totales.subtotal_usa_usd_cents, 'USD')}
            </span>
          </div>

          <div className="flex justify-between text-slate-600">
            <span>Tax USA estimado:</span>
            <span className="tabular font-medium">
              {formatearMoneda(totales.tax_usa_total_usd_cents, 'USD')}
            </span>
          </div>

          <div className="flex justify-between text-slate-600">
            <span>Flete estimado (por peso):</span>
            <span className="tabular font-medium">
              {formatearMoneda(totales.flete_estimado_total_usd_cents, 'USD')}
            </span>
          </div>

          <div className="flex justify-between text-slate-600">
            <span>Arancel estimado (excedente $50):</span>
            <span className="tabular font-medium">
              {formatearMoneda(totales.arancel_estimado_total_usd_cents, 'USD')}
            </span>
          </div>

          <div className="flex justify-between text-slate-800 font-medium pt-2 border-t border-slate-200">
            <span>Costo aterrizado total:</span>
            <span className="tabular font-medium">
              {formatearMoneda(totales.costo_aterrizado_total_usd_cents, 'USD')}
            </span>
          </div>

          <div className="flex justify-between text-brand-700 font-medium">
            <span>Ganancia / Comisión total:</span>
            <span className="tabular font-medium">
              {formatearMoneda(totales.comision_total_cor_cents, 'COR')}
            </span>
          </div>
        </div>

        {/* Total Final en tarjeta navy */}
        <div className="rounded-lg bg-navy-900 p-4">
          <div className="text-caption uppercase tracking-wide text-slate-400">
            Total a cobrar al cliente
          </div>
          <div className="mt-1 text-metric text-white tabular">
            {formatearMoneda(totales.total_final_cor_cents, 'COR')}
          </div>
          <div className="text-label text-slate-400 tabular">
            Equivalente: {formatearMoneda(totales.total_final_usd_cents, 'USD')}
          </div>
        </div>

        {/* Configuración de Anticipo */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between text-body">
            <span className="text-label text-slate-600 font-medium">Porcentaje de Anticipo:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelectAnticipo(50)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-label font-medium transition-colors',
                  anticipoPorcentaje === 50
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                50%
              </button>
              <button
                type="button"
                onClick={() => onSelectAnticipo(70)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-label font-medium transition-colors',
                  anticipoPorcentaje === 70
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                )}
              >
                70%
              </button>
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-body space-y-1.5">
            <div className="flex justify-between font-medium text-slate-800">
              <span>Anticipo ({anticipoPorcentaje}%):</span>
              <span className="tabular font-medium text-brand-700">
                {formatearMoneda(totales.anticipo_total_cor_cents, 'COR')}{' '}
                <span className="text-caption text-slate-500 font-normal">
                  ({formatearMoneda(totales.anticipo_total_usd_cents, 'USD')})
                </span>
              </span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Saldo contraentrega:</span>
              <span className="tabular font-medium">
                {formatearMoneda(totales.saldo_total_cor_cents, 'COR')}
              </span>
            </div>
          </div>
        </div>

        {/* Botón Principal */}
        <Button
          variant="primary"
          onClick={onConvertirAPedido}
          disabled={guardando || !canConvert}
          className="w-full justify-center py-2.5"
        >
          <ShoppingBag className="w-4 h-4 mr-1.5" />
          <span>{guardando ? 'Convirtiendo...' : 'Aceptar y Convertir a Pedido'}</span>
        </Button>
      </CardContent>
    </Card>
  );
};
