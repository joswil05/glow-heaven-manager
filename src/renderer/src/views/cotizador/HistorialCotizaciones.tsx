import React from 'react';
import { FileText } from 'lucide-react';
import type { Cotizacion } from '../../../../shared/types';
import { DataTable, type Column, Badge, Money, Button } from '../../components/ui';
import { EmptyState } from '../../components/shared/EmptyState';

export interface HistorialCotizacionesProps {
  cotizaciones: Cotizacion[];
  loading: boolean;
  onConvertirAPedido: (cotizacionId: number) => void;
  onCrearNueva: () => void;
}

export const HistorialCotizaciones: React.FC<HistorialCotizacionesProps> = ({
  cotizaciones,
  loading,
  onConvertirAPedido,
  onCrearNueva,
}) => {
  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400 text-body">
        Cargando cotizaciones...
      </div>
    );
  }

  if (cotizaciones.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No hay cotizaciones guardadas"
        description="Las cotizaciones que crees aparecerán acá para darles seguimiento o convertirlas a pedidos."
        actionText="Crear Cotización"
        onAction={onCrearNueva}
      />
    );
  }

  const columnas: Column<Cotizacion>[] = [
    {
      key: 'codigo',
      header: 'Código',
      render: (cot) => <span className="font-medium text-slate-900">{cot.codigo}</span>,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (cot) => {
        const tone =
          cot.estado === 'ACEPTADA'
            ? 'success'
            : cot.estado === 'RECHAZADA' || cot.estado === 'VENCIDA'
            ? 'danger'
            : 'neutral';
        return <Badge tone={tone}>{cot.estado}</Badge>;
      },
    },
    {
      key: 'fecha',
      header: 'Fecha',
      render: (cot) => cot.fecha,
    },
    {
      key: 'valida_hasta',
      header: 'Válida hasta',
      render: (cot) => cot.valida_hasta,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (cot) => (
        <Money
          cor_cents={cot.total_cor_cents}
          usd_cents={cot.total_usd_cents}
          size="md"
        />
      ),
    },
    {
      key: 'accion',
      header: '',
      align: 'right',
      render: (cot) =>
        cot.estado === 'BORRADOR' || cot.estado === 'ENVIADA' ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              onConvertirAPedido(cot.id);
            }}
          >
            Convertir a Pedido
          </Button>
        ) : null,
    },
  ];

  return (
    <DataTable
      columns={columnas}
      rows={cotizaciones}
      rowKey={(cot) => cot.id}
      emptyMessage="No hay cotizaciones registradas."
    />
  );
};
