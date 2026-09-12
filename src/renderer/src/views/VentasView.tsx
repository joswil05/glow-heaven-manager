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
  X,
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
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-superficie-2 border border-borde/80 flex items-center justify-center shrink-0 shadow-xs text-texto-2">
            {esEncargo ? (
              <ClipboardList className="w-4 h-4 text-texto-3" />
            ) : (
              <ShoppingBag className="w-4 h-4 text-texto-3" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-body font-semibold text-texto tracking-tight truncate">
              {v.cliente_nombre ?? 'Mostrador'}
            </div>
            <div className="text-caption text-texto-3 flex items-center gap-1.5 font-mono">
              <span className="bg-superficie-2 px-1.5 py-0.5 rounded border border-borde/60 text-[11px] text-texto-2">
                {v.codigo}
              </span>
              <span>· {formatearFecha(v.fecha)}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '130px',
      render: (v) => (
        <Badge tone={ESTADO_TONO[v.estado]} className="gap-1.5 font-medium">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              v.estado === 'ENTREGADA'
                ? 'bg-emerald-500'
                : v.estado === 'PENDIENTE'
                  ? 'bg-amber-500 animate-pulse'
                  : v.estado === 'CANCELADA'
                    ? 'bg-rose-500'
                    : 'bg-slate-400'
            )}
          />
          {ESTADO_TEXTO[v.estado]}
        </Badge>
      ),
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
          <span className="font-semibold text-amber-700">
            <Money usd_cents={v.saldo_usd_cents} size="sm" soloUsd />
          </span>
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <StatTile
            label={esEncargo ? 'Total cotizado' : 'Total facturado'}
            usd_cents={totales.vendido}
            tone="info"
            icon={ShoppingBag}
            hint={`${ventas.filter((v) => v.estado !== 'CANCELADA').length} registro(s) activos`}
            onClick={() => setFiltro('TODAS')}
          />
          <StatTile
            label="Ganancia de entregados"
            usd_cents={totales.ganancia}
            tone={totales.ganancia > 0 ? 'success' : 'neutral'}
            icon={TrendingUp}
            hint="Margen neto sobre ventas completadas"
            onClick={() => setFiltro('ENTREGADAS')}
          />
          <StatTile
            label="Saldo por cobrar"
            usd_cents={totales.porCobrar}
            tone={totales.porCobrar > 0 ? 'warning' : 'success'}
            icon={Wallet}
            hint={
              filtro === 'CON_SALDO'
                ? 'Mostrando solo ventas con saldo pendiente'
                : totales.porCobrar > 0
                  ? 'Clic para filtrar ventas con deuda'
                  : 'Sin saldos pendientes'
            }
            onClick={() => setFiltro(filtro === 'CON_SALDO' ? 'TODAS' : 'CON_SALDO')}
            className={filtro === 'CON_SALDO' ? 'ring-2 ring-amber-500/50' : undefined}
          />
        </div>

        <div className="inline-flex items-center p-1 bg-superficie-2/80 rounded-xl border border-borde/70 text-caption font-medium w-fit">
          {filtros.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              aria-pressed={filtro === f.id}
              className={cn(
                'px-3.5 py-1.5 rounded-lg transition-all text-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
                filtro === f.id
                  ? 'bg-superficie text-texto font-semibold shadow-xs border border-borde/50'
                  : 'text-texto-3 hover:text-texto hover:bg-superficie/50'
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
        <aside className="w-[410px] border-l border-borde bg-superficie flex flex-col shrink-0 animate-fade-in shadow-xl z-10">
          {/* Cabecera pegajosa con botón de cerrar */}
          <div className="p-5 border-b border-borde bg-superficie-2/40 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-acento/10 text-acento-fuerte border border-acento/20 flex items-center justify-center shrink-0 shadow-xs">
                {esEncargo ? <ClipboardList className="w-6 h-6" /> : <ShoppingBag className="w-6 h-6" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-title font-bold text-texto tracking-tight truncate">
                    {ventaDetalle.cliente_nombre ?? 'Mostrador'}
                  </h3>
                  <Badge tone={ESTADO_TONO[ventaDetalle.estado]} className="gap-1.5 text-[11px] shrink-0">
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        ventaDetalle.estado === 'ENTREGADA'
                          ? 'bg-emerald-500'
                          : ventaDetalle.estado === 'PENDIENTE'
                            ? 'bg-amber-500 animate-pulse'
                            : ventaDetalle.estado === 'CANCELADA'
                              ? 'bg-rose-500'
                              : 'bg-slate-400'
                      )}
                    />
                    {ESTADO_TEXTO[ventaDetalle.estado]}
                  </Badge>
                </div>
                <p className="text-caption text-texto-3 font-mono mt-0.5">
                  {ventaDetalle.codigo} · {formatearFecha(ventaDetalle.fecha)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVentaDetalle(null)}
              aria-label="Cerrar detalle"
              className="text-texto-3 hover:text-texto rounded-lg -mr-1 -mt-1 shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Tarjeta de estado de la cuenta */}
            <div className="rounded-xl border border-borde/80 bg-gradient-to-b from-superficie via-superficie to-superficie-2/30 p-4 space-y-2.5 shadow-xs">
              <div className="flex justify-between items-center gap-2">
                <span className="text-label text-texto-2 font-medium">Total facturado</span>
                <Money usd_cents={ventaDetalle.total_usd_cents} size="sm" />
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-label text-texto-2 font-medium">Pagado</span>
                <Money usd_cents={ventaDetalle.pagado_usd_cents} size="sm" soloUsd />
              </div>
              <div className="flex justify-between items-center gap-2 pt-2 border-t border-borde/70">
                <span className="text-body font-bold text-texto">Debe</span>
                {ventaDetalle.saldo_usd_cents > 0 ? (
                  <span className="font-bold text-amber-700">
                    <Money usd_cents={ventaDetalle.saldo_usd_cents} size="md" soloUsd />
                  </span>
                ) : (
                  <Badge tone="success">Saldada completamente</Badge>
                )}
              </div>
              <div className="flex justify-between items-center gap-2 pt-2 border-t border-borde/70">
                <span className="text-label text-texto-2 font-medium">Ganancia neta</span>
                <Money
                  usd_cents={ventaDetalle.ganancia_usd_cents}
                  size="sm"
                  soloUsd
                  colorearSigno
                />
              </div>
            </div>

            {/* Lista de productos */}
            <div className="rounded-xl border border-borde/80 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde text-label font-medium text-texto flex items-center justify-between">
                <span>Prendas / Artículos</span>
                <span className="text-caption text-texto-3">{ventaDetalle.lineas.length} línea(s)</span>
              </div>
              <ul className="divide-y divide-borde/60 max-h-[300px] overflow-y-auto">
                {ventaDetalle.lineas.map((l) => (
                  <li key={l.id} className="px-4 py-3 hover:bg-superficie-2/20 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-body font-medium text-texto truncate">
                          {l.descripcion}
                          {(l.talla || l.color) && (
                            <span className="text-texto-3 font-normal">
                              {' '}
                              ({[l.talla, l.color].filter(Boolean).join(' · ')})
                            </span>
                          )}
                        </div>
                        <div className="text-caption text-texto-3 font-mono">
                          {l.cantidad} × {formatearMoneda(l.precio_unitario_usd_cents, 'USD')}
                          {l.es_paquete && ' · paquete completo'}
                        </div>
                      </div>
                      <span className="text-body font-semibold text-texto tabular shrink-0 font-mono">
                        {formatearMoneda(l.subtotal_usd_cents, 'USD')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {ventaDetalle.notas && (
              <div className="rounded-xl border border-borde/70 bg-superficie-2/20 p-3.5 shadow-xs">
                <div className="text-caption font-medium text-texto-3 mb-1">Notas del cliente</div>
                <p className="text-label text-texto-2 leading-relaxed">{ventaDetalle.notas}</p>
              </div>
            )}

            {/* Acciones principales */}
            <div className="space-y-2.5 pt-1">
              {ventaDetalle.estado !== 'CANCELADA' && ventaDetalle.saldo_usd_cents > 0 && (
                <Button
                  variant="primary"
                  className="w-full shadow-xs"
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
                  <PackageCheck className="w-4 h-4 text-emerald-600" />
                  <span>Marcar como entregada</span>
                </Button>
              )}

              {ventaDetalle.estado === 'COTIZADA' && (
                <p className="text-caption text-texto-3 text-center p-2 rounded-lg bg-superficie-2 border border-borde/60">
                  Este encargo se desbloquea cuando el anticipo de{' '}
                  <strong className="text-texto font-semibold">{formatearMoneda(ventaDetalle.anticipo_esperado_usd_cents, 'USD')}</strong> esté
                  cubierto.
                </p>
              )}
            </div>

            {ventaDetalle.estado !== 'CANCELADA' && (
              <div className="pt-3 border-t border-borde/70 flex justify-center">
                <button
                  type="button"
                  onClick={() => setAnulando(ventaDetalle)}
                  className="inline-flex items-center gap-1.5 text-caption text-texto-3 hover:text-danger-600 transition-colors focus-visible:outline-none"
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
