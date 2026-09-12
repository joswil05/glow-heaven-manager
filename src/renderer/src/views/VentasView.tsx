import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShoppingBag,
  Plus,
  DollarSign,
  PackageCheck,
  XCircle,
  ClipboardList,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type {
  Venta,
  VentaCompleta,
  ProductoConStock,
  ClienteDetalle,
  ParametrosSistema,
  TipoVenta,
  EstadoVenta,
} from '../../../shared/types';
import {
  Button,
  Badge,
  Money,
  StatTile,
  DataTable,
  BarraProgreso,
  Confirmar,
  type Column,
  type Tone,
} from '../components/ui';
import { EmptyState } from '../components/shared/EmptyState';
import { VentaEditor } from './ventas/VentaEditor';
import { PagoModal } from '../components/PagoModal';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { formatearMoneda, formatearFecha } from '@core/moneda';

interface VentasViewProps {
  tipo: TipoVenta;
  productos: ProductoConStock[];
  clientes: ClienteDetalle[];
  parametros: ParametrosSistema | null;
  ventaInicialId?: number;
  abrirEditorAlEntrar?: boolean;
  onCambio: () => void;
}

const ESTADO_TONO: Record<EstadoVenta, Tone> = {
  COTIZADA: 'neutral',
  PENDIENTE: 'warning',
  ENTREGADA: 'success',
  CANCELADA: 'danger',
};

const ESTADO_TEXTO: Record<EstadoVenta, string> = {
  COTIZADA: 'Cotizado',
  PENDIENTE: 'Pendiente',
  ENTREGADA: 'Entregada',
  CANCELADA: 'Cancelada',
};

type Filtro = 'TODAS' | 'CON_SALDO' | 'PENDIENTES' | 'ENTREGADAS';

export const VentasView: React.FC<VentasViewProps> = ({
  tipo,
  productos,
  clientes,
  parametros,
  ventaInicialId,
  abrirEditorAlEntrar = false,
  onCambio,
}) => {
  const { showToast, showUndoToast } = useToast();
  const esEncargo = tipo === 'ENCARGO';

  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [editorAbierto, setEditorAbierto] = useState(abrirEditorAlEntrar);
  const [ventaDetalle, setVentaDetalle] = useState<VentaCompleta | null>(null);
  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [anulando, setAnulando] = useState<VentaCompleta | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await window.api.ventas.list({
        tipo,
        soloConSaldo: filtro === 'CON_SALDO',
        estado:
          filtro === 'PENDIENTES'
            ? esEncargo
              ? 'PENDIENTE'
              : 'PENDIENTE'
            : filtro === 'ENTREGADAS'
              ? 'ENTREGADA'
              : undefined,
      });
      if (r.success) setVentas(r.data);
      else showToast({ message: r.error, type: 'error' });
    } finally {
      setCargando(false);
    }
  }, [tipo, filtro, esEncargo, showToast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (abrirEditorAlEntrar) setEditorAbierto(true);
  }, [abrirEditorAlEntrar]);

  const abrirDetalle = useCallback(async (id: number) => {
    const r = await window.api.ventas.get(id);
    if (r.success && r.data) setVentaDetalle(r.data);
  }, []);

  useEffect(() => {
    if (ventaInicialId) abrirDetalle(ventaInicialId);
  }, [ventaInicialId, abrirDetalle]);

  const totales = useMemo(() => {
    const activas = ventas.filter((v) => v.estado !== 'CANCELADA');
    return {
      vendido: activas.reduce((a, v) => a + v.total_usd_cents, 0),
      ganancia: activas
        .filter((v) => v.estado === 'ENTREGADA')
        .reduce((a, v) => a + v.ganancia_usd_cents, 0),
      porCobrar: activas.reduce((a, v) => a + Math.max(0, v.saldo_usd_cents), 0),
    };
  }, [ventas]);

  const cambiarEstado = async (v: Venta, estado: EstadoVenta) => {
    const r = await window.api.ventas.cambiarEstado(v.id, estado);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(
      `${v.codigo}: ${ESTADO_TEXTO[estado].toLowerCase()}`,
      async () => {
        await cargar();
        onCambio();
      },
      r.data.evento_grupo_id
    );
    await cargar();
    if (ventaDetalle?.id === v.id) await abrirDetalle(v.id);
    onCambio();
  };

  const columnas: Column<Venta>[] = [
    {
      key: 'codigo',
      header: esEncargo ? 'Encargo' : 'Venta',
      render: (v) => (
        <div>
          <div className="text-body text-texto">{v.cliente_nombre ?? 'Mostrador'}</div>
          <div className="text-caption text-texto-3">
            {v.codigo} · {formatearFecha(v.fecha)}
          </div>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '120px',
      render: (v) => <Badge tone={ESTADO_TONO[v.estado]}>{ESTADO_TEXTO[v.estado]}</Badge>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      width: '160px',
      render: (v) => <Money usd_cents={v.total_usd_cents} size="sm" />,
    },
    {
      key: 'pagado',
      header: 'Pagado',
      align: 'right',
      width: '160px',
      render: (v) => (
        <div>
          <Money usd_cents={v.pagado_usd_cents} size="sm" soloUsd />
          <BarraProgreso
            className="mt-1"
            actual={v.pagado_usd_cents}
            total={v.total_usd_cents}
            tono={v.saldo_usd_cents <= 0 ? 'success' : 'brand'}
            etiqueta={`Pagado de ${v.codigo}`}
          />
        </div>
      ),
    },
    {
      key: 'saldo',
      header: 'Debe',
      align: 'right',
      width: '130px',
      render: (v) =>
        v.saldo_usd_cents > 0 ? (
          <Money usd_cents={v.saldo_usd_cents} size="sm" soloUsd />
        ) : (
          <Badge tone="success">Saldada</Badge>
        ),
    },
    {
      key: 'ganancia',
      header: 'Ganancia',
      align: 'right',
      width: '130px',
      render: (v) => <Money usd_cents={v.ganancia_usd_cents} size="sm" soloUsd colorearSigno />,
    },
  ];

  const filtros: { id: Filtro; etiqueta: string }[] = [
    { id: 'TODAS', etiqueta: 'Todas' },
    { id: 'CON_SALDO', etiqueta: 'Con saldo' },
    { id: 'PENDIENTES', etiqueta: esEncargo ? 'Por comprar' : 'Por entregar' },
    { id: 'ENTREGADAS', etiqueta: 'Entregadas' },
  ];

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-5 animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-label text-texto-2">
              {esEncargo
                ? 'Pedidos especiales de clientes, con anticipo y saldo al entregar.'
                : 'Lo que vendés de tu inventario, de contado o en cuotas.'}
            </p>
          </div>
          <Button variant="primary" onClick={() => setEditorAbierto(true)}>
            <Plus className="w-4 h-4" />
            <span>{esEncargo ? 'Nuevo encargo' : 'Nueva venta'}</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4.5">
          <StatTile
            label={esEncargo ? 'Total cotizado' : 'Total facturado'}
            usd_cents={totales.vendido}
            tone="info"
            icon={ShoppingBag}
            hint={`${ventas.filter((v) => v.estado !== 'CANCELADA').length} registro(s) activos`}
          />
          <StatTile
            label="Ganancia de entregados"
            usd_cents={totales.ganancia}
            tone={totales.ganancia > 0 ? 'success' : 'neutral'}
            icon={TrendingUp}
            hint="Margen neto sobre ventas completadas"
          />
          <StatTile
            label="Saldo por cobrar"
            usd_cents={totales.porCobrar}
            tone={totales.porCobrar > 0 ? 'warning' : 'success'}
            icon={Wallet}
            hint={totales.porCobrar > 0 ? 'Saldos pendientes de clientes' : 'Sin saldos pendientes'}
          />
        </div>

        <div className="flex rounded-md border border-borde-fuerte overflow-hidden w-fit">
          {filtros.map((f, i) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              className={cn(
                'px-3 py-2 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acento',
                i > 0 && 'border-l border-borde-fuerte',
                filtro === f.id
                  ? 'bg-acento-suave text-acento-fuerte font-medium'
                  : 'bg-superficie text-texto-2 hover:bg-superficie-2'
              )}
            >
              {f.etiqueta}
            </button>
          ))}
        </div>

        {cargando ? (
          <div className="p-12 text-center text-body text-texto-3">Cargando...</div>
        ) : ventas.length === 0 ? (
          <EmptyState
            icon={esEncargo ? ClipboardList : ShoppingBag}
            title={
              filtro !== 'TODAS'
                ? 'Nada con ese filtro'
                : esEncargo
                  ? 'Todavía no hay encargos'
                  : 'Todavía no hay ventas'
            }
            description={
              filtro !== 'TODAS'
                ? 'Probá con otro filtro.'
                : esEncargo
                  ? 'Un encargo es un pedido especial: cotizás, cobrás anticipo, comprás y entregás.'
                  : 'Registrá tu primera venta del inventario. Las existencias se descuentan solas.'
            }
            action={
              filtro === 'TODAS' ? (
                <Button variant="primary" onClick={() => setEditorAbierto(true)}>
                  <Plus className="w-4 h-4" />
                  <span>{esEncargo ? 'Registrar encargo' : 'Registrar venta'}</span>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            columns={columnas}
            rows={ventas}
            rowKey={(v) => v.id}
            selectedKey={ventaDetalle?.id}
            onRowClick={(v) =>
              ventaDetalle?.id === v.id ? setVentaDetalle(null) : abrirDetalle(v.id)
            }
          />
        )}
      </div>

      {ventaDetalle && (
        <aside className="w-[400px] border-l border-borde bg-superficie overflow-y-auto shrink-0">
          <div className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-title text-texto truncate">
                  {ventaDetalle.cliente_nombre ?? 'Mostrador'}
                </h3>
                <p className="text-caption text-texto-3">
                  {ventaDetalle.codigo} · {formatearFecha(ventaDetalle.fecha)}
                </p>
              </div>
              <Badge tone={ESTADO_TONO[ventaDetalle.estado]}>
                {ESTADO_TEXTO[ventaDetalle.estado]}
              </Badge>
            </div>

            <div className="rounded-lg border border-borde bg-superficie-2 p-4 space-y-2">
              <div className="flex justify-between gap-2">
                <span className="text-label text-texto-2">Total</span>
                <Money usd_cents={ventaDetalle.total_usd_cents} size="sm" />
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-label text-texto-2">Pagado</span>
                <Money usd_cents={ventaDetalle.pagado_usd_cents} size="sm" soloUsd />
              </div>
              <div className="flex justify-between gap-2 pt-2 border-t border-borde">
                <span className="text-body font-medium text-texto">Debe</span>
                <Money usd_cents={ventaDetalle.saldo_usd_cents} size="md" soloUsd />
              </div>
              <div className="flex justify-between gap-2 pt-2 border-t border-borde">
                <span className="text-label text-texto-2">Ganancia</span>
                <Money
                  usd_cents={ventaDetalle.ganancia_usd_cents}
                  size="sm"
                  soloUsd
                  colorearSigno
                />
              </div>
            </div>

            <div className="rounded-lg border border-borde">
              <div className="px-4 py-2.5 border-b border-borde text-label font-medium text-texto-2">
                Productos
              </div>
              <ul className="divide-y divide-borde">
                {ventaDetalle.lineas.map((l) => (
                  <li key={l.id} className="px-4 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-body text-texto truncate">
                          {l.descripcion}
                          {(l.talla || l.color) && (
                            <span className="text-texto-3">
                              {' '}
                              ({[l.talla, l.color].filter(Boolean).join(' · ')})
                            </span>
                          )}
                        </div>
                        <div className="text-caption text-texto-3">
                          {l.cantidad} x {formatearMoneda(l.precio_unitario_usd_cents, 'USD')}
                          {l.es_paquete && ' · paquete completo'}
                        </div>
                      </div>
                      <span className="text-body text-texto tabular shrink-0">
                        {formatearMoneda(l.subtotal_usd_cents, 'USD')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {ventaDetalle.notas && (
              <div className="rounded-md border border-borde p-3">
                <div className="text-caption text-texto-3 mb-0.5">Notas</div>
                <p className="text-label text-texto-2">{ventaDetalle.notas}</p>
              </div>
            )}

            <div className="space-y-2">
              {ventaDetalle.estado !== 'CANCELADA' && ventaDetalle.saldo_usd_cents > 0 && (
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => setPagoAbierto(true)}
                >
                  <DollarSign className="w-4 h-4" />
                  <span>Registrar abono</span>
                </Button>
              )}

              {ventaDetalle.estado === 'PENDIENTE' && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => cambiarEstado(ventaDetalle, 'ENTREGADA')}
                >
                  <PackageCheck className="w-4 h-4" />
                  <span>Marcar como entregada</span>
                </Button>
              )}

              {ventaDetalle.estado === 'COTIZADA' && (
                <p className="text-caption text-texto-3 text-center">
                  Este encargo se desbloquea cuando el anticipo de{' '}
                  {formatearMoneda(ventaDetalle.anticipo_esperado_usd_cents, 'USD')} esté
                  cubierto.
                </p>
              )}

              <Button
                variant="secondary"
                className="w-full"
                onClick={() => setVentaDetalle(null)}
              >
                Cerrar detalle
              </Button>
            </div>

            {ventaDetalle.estado !== 'CANCELADA' && (
              <div className="pt-3 border-t border-borde">
                <button
                  type="button"
                  onClick={() => setAnulando(ventaDetalle)}
                  className="inline-flex items-center gap-1.5 text-label text-texto-3 hover:text-danger-700 focus-visible:outline-none focus-visible:text-danger-700"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Anular {esEncargo ? 'este encargo' : 'esta venta'}</span>
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      <VentaEditor
        abierto={editorAbierto}
        tipo={tipo}
        productos={productos}
        clientes={clientes}
        parametros={parametros}
        onCerrar={() => setEditorAbierto(false)}
        onGuardado={async () => {
          await cargar();
          onCambio();
        }}
      />

      <Confirmar
        abierto={anulando !== null}
        peligroso
        titulo={`¿Anular ${anulando?.codigo ?? ''}?`}
        consecuencias={[
          ...(anulando && anulando.tipo === 'INVENTARIO'
            ? ['Las unidades vuelven a tu inventario.']
            : []),
          ...(anulando && anulando.pagado_usd_cents > 0
            ? [
                `Los ${formatearMoneda(anulando.pagado_usd_cents, 'USD')} ya abonados quedan sin efecto.`,
              ]
            : []),
          'Deja de contar en tus ganancias.',
        ]}
        textoConfirmar={esEncargo ? 'Sí, anular el encargo' : 'Sí, anular la venta'}
        textoCancelar="No, dejarla como está"
        onConfirmar={() => anulando && cambiarEstado(anulando, 'CANCELADA')}
        onCerrar={() => setAnulando(null)}
      />

      <PagoModal
        abierto={pagoAbierto}
        venta={ventaDetalle}
        onCerrar={() => setPagoAbierto(false)}
        onRegistrado={async () => {
          await cargar();
          if (ventaDetalle) await abrirDetalle(ventaDetalle.id);
          onCambio();
        }}
      />
    </div>
  );
};
