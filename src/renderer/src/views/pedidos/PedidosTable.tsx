import React from 'react';
import type { Pedido } from '../../../../shared/types';
import { DataTable, type Column, Badge, StatusDot, Money, Button } from '../../components/ui';

export interface PedidosTableProps {
  pedidos: Pedido[];
  selectedId?: number;
  onSelect: (pedido: Pedido) => void;
  onCobrar: (pedido: Pedido) => void;
}

export const PedidosTable: React.FC<PedidosTableProps> = ({
  pedidos,
  selectedId,
  onSelect,
  onCobrar,
}) => {
  const columnas: Column<Pedido>[] = [
    {
      key: 'estado',
      header: '',
      width: '2.5rem',
      render: (p) => <StatusDot tone={p.anticipo_verificado ? 'success' : 'danger'} />,
    },
    {
      key: 'codigo',
      header: 'Código',
      render: (p) => <span className="font-medium text-slate-900">{p.codigo}</span>,
    },
    { key: 'fecha', header: 'Fecha', render: (p) => p.fecha },
    {
      key: 'situacion',
      header: 'Situación',
      render: (p) => (
        <Badge tone={p.anticipo_verificado ? 'success' : 'danger'}>
          {p.anticipo_verificado ? 'Listo para comprar' : 'Bloqueado sin anticipo'}
        </Badge>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (p) => <Money cor_cents={p.total_cor_cents} size="md" />,
    },
    {
      key: 'saldo',
      header: 'Saldo',
      align: 'right',
      render: (p) => <Money cor_cents={p.saldo_pendiente_cor_cents} size="md" />,
    },
    {
      key: 'accion',
      header: '',
      align: 'right',
      render: (p) => (
        <Button
          size="sm"
          variant="secondary"
          onClick={(e) => {
            e.stopPropagation();
            onCobrar(p);
          }}
        >
          Cobrar
        </Button>
      ),
    },
  ];

  return (
    <DataTable
      columns={columnas}
      rows={pedidos}
      rowKey={(p) => p.id}
      selectedKey={selectedId}
      onRowClick={onSelect}
      emptyMessage="No hay pedidos en esta vista. Se generan al convertir una cotización."
    />
  );
};
