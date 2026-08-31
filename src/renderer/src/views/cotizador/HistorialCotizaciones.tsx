import React from 'react';
import { FileText, Send, CheckCircle, XCircle } from 'lucide-react';
import type { Cotizacion, EstadoCotizacion } from '../../../../shared/types';
import { DataTable, type Column, Badge, Money, Button, type Tone } from '../../components/ui';
import { EmptyState } from '../../components/shared/EmptyState';

export interface HistorialCotizacionesProps {
  cotizaciones: Cotizacion[];
  loading: boolean;
  onConvertirAPedido: (cotizacionId: number) => void;
  onMarcarEnviada: (cotizacionId: number) => void;
  onMarcarRechazada: (cotizacionId: number) => void;
  onCrearNueva: () => void;
}

export const HistorialCotizaciones: React.FC<HistorialCotizacionesProps> = ({
  cotizaciones,
  loading,
  onConvertirAPedido,
  onMarcarEnviada,
  onMarcarRechazada,
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

  const getTone = (estado: EstadoCotizacion): Tone => {
    switch (estado) {
      case 'ACEPTADA':
        return 'success';
      case 'ENVIADA':
        return 'info';
      case 'RECHAZADA':
        return 'danger';
      case 'VENCIDA':
        return 'warning';
      case 'BORRADOR':
      default:
        return 'neutral';
    }
  };

  const esFechaVencida = (fechaStr: string | null | undefined): boolean => {
    if (!fechaStr) return false;
    const fecha = new Date(fechaStr);
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return fecha < hoy;
  };

  const columnas: Column<Cotizacion>[] = [
    {
      key: 'codigo',
      header: 'Código',
      render: (cot) => <span className="font-semibold text-slate-900 font-mono">{cot.codigo}</span>,
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (cot) => <Badge tone={getTone(cot.estado)}>{cot.estado}</Badge>,
    },
    {
      key: 'fecha',
      header: 'Fecha',
      render: (cot) => <span className="text-slate-600 tabular-nums">{cot.fecha}</span>,
    },
    {
      key: 'valida_hasta',
      header: 'Válida hasta',
      render: (cot) => {
        const vencida = esFechaVencida(cot.valida_hasta) && (cot.estado === 'BORRADOR' || cot.estado === 'ENVIADA');
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-slate-600 tabular-nums">{cot.valida_hasta || '—'}</span>
            {vencida && <Badge tone="warning">Vencida</Badge>}
          </div>
        );
      },
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
      header: 'Acciones',
      align: 'right',
      render: (cot) => {
        if (cot.estado === 'BORRADOR') {
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarcarEnviada(cot.id);
                }}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Marcar enviada</span>
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onConvertirAPedido(cot.id);
                }}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Convertir a pedido</span>
              </Button>
            </div>
          );
        }

        if (cot.estado === 'ENVIADA') {
          return (
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarcarRechazada(cot.id);
                }}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Marcar rechazada</span>
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onConvertirAPedido(cot.id);
                }}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Convertir a pedido</span>
              </Button>
            </div>
          );
        }

        return null;
      },
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
