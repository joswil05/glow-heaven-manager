import React from 'react';
import type { PedidoCompleto, EstadoItem, PedidoItem, Pago } from '../../../../shared/types';
import { Card, CardHeader, CardContent, Badge, Button, SectionHeader } from '../../components/ui';
import { transicionesPermitidas, ETIQUETAS_ESTADO_ITEM } from '@core/estados';
import { Package } from 'lucide-react';

export interface PedidoDetailPanelProps {
  detalle: PedidoCompleto | null;
  onCambiarEstado: (itemId: number, nuevo: EstadoItem) => void;
  onVerificarPago: (pagoId: number) => void;
}

export const PedidoDetailPanel: React.FC<PedidoDetailPanelProps> = ({
  detalle,
  onCambiarEstado,
  onVerificarPago,
}) => {
  if (!detalle) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-body text-slate-500">
          Elegí un pedido de la lista para ver su detalle.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="space-y-0">
      <CardHeader>
        <SectionHeader
          icon={Package}
          title={`Detalle: ${detalle.codigo}`}
          description={`Estado general: ${detalle.estado_derivado}`}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-caption uppercase tracking-wider text-slate-500 font-medium mb-2">
            Productos ({detalle.items.length})
          </h4>

          <div className="space-y-2">
            {detalle.items.map((item: PedidoItem) => (
              <div
                key={item.id}
                className="p-3 bg-slate-50 rounded-md border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="text-body font-medium text-slate-900">
                    {item.descripcion}
                  </div>
                  <div className="text-caption text-slate-500">
                    Precio USA: ${(item.precio_usa_usd_cents / 100).toFixed(2)} •
                    Peso: {(item.peso_mlb / 1000).toFixed(2)} lb • Costo est:{' '}
                    ${(item.costo_aterrizado_estimado_cents / 100).toFixed(2)}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-label text-slate-500">Estado:</span>
                  <select
                    value=""
                    aria-label={`Cambiar estado de ${item.descripcion}`}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      onCambiarEstado(item.id, e.target.value as EstadoItem);
                    }}
                    className="text-label bg-white px-2.5 py-1 rounded-md border border-slate-200 text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus:border-brand-500"
                  >
                    <option value="">
                      {ETIQUETAS_ESTADO_ITEM[item.estado]}
                    </option>
                    {transicionesPermitidas(item.estado).map((destino) => (
                      <option key={destino} value={destino}>
                        Pasar a: {ETIQUETAS_ESTADO_ITEM[destino]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pagos registrados en el pedido */}
        {detalle.pagos && detalle.pagos.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <h4 className="text-caption uppercase tracking-wider text-slate-500 font-medium mb-2">
              Historial de Pagos Recibidos ({detalle.pagos.length})
            </h4>
            <div className="space-y-2">
              {detalle.pagos.map((p: Pago) => (
                <div
                  key={p.id}
                  className="p-3 bg-slate-50 rounded-md border border-slate-200 flex items-center justify-between text-body"
                >
                  <div>
                    <span className="font-medium text-slate-800 tabular">
                      {p.moneda_pago === 'COR' ? 'C$' : '$'}
                      {(
                        (p.moneda_pago === 'COR'
                          ? p.monto_cor_cents
                          : p.monto_usd_cents) / 100
                      ).toFixed(2)}
                    </span>
                    <span className="text-slate-500 ml-2 text-caption">
                      ({p.tipo_pago} - {p.metodo_pago})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge tone={p.verificado ? 'success' : 'warning'}>
                      {p.verificado ? 'Verificado en Banco' : 'Pendiente de Verificar'}
                    </Badge>
                    {!p.verificado && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onVerificarPago(p.id)}
                      >
                        Verificar ahora
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
