import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, Plus, CheckCircle2, FileEdit, Trash2, Boxes, Truck, Scale, Clock, X, Copy, Eye } from 'lucide-react';
import { cn } from '../lib/cn';
import type { Compra, CompraCompleta, Venta, ParametrosSistema } from '../../../shared/types';
import {
  Card,
  CardContent,
  Button,
  Badge,
  Money,
  StatTile,
  DataTable,
  Confirmar,
  ContextMenu,
  type Column,
  type Tone,
} from '../components/ui';
import { EmptyState } from '../components/shared/EmptyState';
import { PaqueteEditor } from './paquetes/PaqueteEditor';
import { useClickOutside } from '../lib/useClickOutside';
import { useToast } from '../context/ToastContext';
import { formatearMoneda, formatearPeso, formatearFecha } from '@core/moneda';

interface PaquetesViewProps {
  parametros: ParametrosSistema | null;
  abrirEditorAlEntrar?: boolean;
  onCambio: () => void;
}

const ESTADO_TONO: Record<string, Tone> = {
  BORRADOR: 'neutral',
  EN_CAMINO: 'warning',
  RECIBIDA: 'success',
};

const ESTADO_TEXTO: Record<string, string> = {
  BORRADOR: 'Borrador',
  EN_CAMINO: 'En camino',
  RECIBIDA: 'Recibido',
};

export const PaquetesView: React.FC<PaquetesViewProps> = ({
  parametros,
  abrirEditorAlEntrar = false,
  onCambio,
}) => {
  const { showToast, showUndoToast } = useToast();

  const [compras, setCompras] = useState<Compra[]>([]);
  const [encargos, setEncargos] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [editorAbierto, setEditorAbierto] = useState(abrirEditorAlEntrar);
  const [compraEditando, setCompraEditando] = useState<CompraCompleta | null>(null);
  const [detalle, setDetalle] = useState<CompraCompleta | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<
    { tipo: 'recibir' | 'archivar'; compra: Compra } | null
  >(null);
  const [menuContextual, setMenuContextual] = useState<{
    x: number;
    y: number;
    compra: Compra;
  } | null>(null);

  const lateralRef = useClickOutside<HTMLElement>(Boolean(detalle), () => setDetalle(null));

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [rc, re] = await Promise.all([
        window.api.compras.list(),
        // Encargos que ya se pueden comprar: el anticipo entró.
        window.api.ventas.list({ tipo: 'ENCARGO', estado: 'PENDIENTE' }),
      ]);
      if (rc.success) setCompras(rc.data);
      if (re.success) setEncargos(re.data);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (abrirEditorAlEntrar) {
      setCompraEditando(null);
      setEditorAbierto(true);
    }
  }, [abrirEditorAlEntrar]);

  const abrirParaEditar = async (id: number) => {
    const r = await window.api.compras.get(id);
    if (!r.success || !r.data) {
      showToast({ message: 'No se pudo abrir el paquete.', type: 'error' });
      return;
    }
    setCompraEditando(r.data);
    setEditorAbierto(true);
  };

  const verDetalle = async (id: number) => {
    if (detalle?.id === id) {
      setDetalle(null);
      return;
    }
    const r = await window.api.compras.get(id);
    if (r.success && r.data) setDetalle(r.data);
  };

  const recibir = async (c: Compra) => {
    const r = await window.api.compras.recibir(c.id);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showToast({
      message: `${c.codigo} recibido. ${r.data.productos_afectados} producto(s) al inventario.`,
      type: 'success',
    });
    await cargar();
    setDetalle(null);
    onCambio();
  };

  const archivar = async (c: Compra) => {
    const r = await window.api.compras.archivar(c.id);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(`Paquete ${c.codigo} eliminado`, cargar, r.data.evento_grupo_id);
    await cargar();
    onCambio();
  };

  const enCamino = compras.filter((c) => c.estado === 'EN_CAMINO');
  const invertidoEnCamino = enCamino.reduce((a, c) => a + c.total_usd_cents, 0);
  const recibidos = compras.filter((c) => c.estado === 'RECIBIDA');
  const gastadoTotal = recibidos.reduce((a, c) => a + c.total_usd_cents, 0);

  const historicoCourier = useMemo(() => {
    const totalLibrasMlb = compras.reduce((a, c) => a + c.peso_total_mlb, 0);
    const totalEnvioUsdCents = compras.reduce((a, c) => a + c.envio_total_usd_cents, 0);
    const totalLbs = totalLibrasMlb / 1000;
    const costoPromedioPorLb = totalLbs > 0 ? Math.round(totalEnvioUsdCents / totalLbs) : 0;
    return {
      totalLibrasMlb,
      totalEnvioUsdCents,
      costoPromedioPorLb,
    };
  }, [compras]);

  const columnas: Column<Compra>[] = [
    {
      key: 'codigo',
      header: 'Paquete',
      render: (c) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-superficie-2 border border-borde/80 flex items-center justify-center shrink-0 shadow-xs text-texto-2">
            <Package className="w-4 h-4 text-texto-3" />
          </div>
          <div className="min-w-0">
            <div className="text-body font-semibold text-texto tracking-tight">{c.codigo}</div>
            <div className="text-caption font-mono text-texto-3">{formatearFecha(c.fecha)}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '130px',
      render: (c) => (
        <Badge tone={ESTADO_TONO[c.estado]} className="gap-1.5 font-medium">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              c.estado === 'RECIBIDA'
                ? 'bg-emerald-500'
                : c.estado === 'EN_CAMINO'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-slate-400'
            )}
          />
          {ESTADO_TEXTO[c.estado]}
        </Badge>
      ),
    },
    {
      key: 'peso',
      header: 'Peso',
      align: 'right',
      width: '110px',
      render: (c) => (
        <span className="text-label text-texto-2 tabular font-mono">
          {formatearPeso(c.peso_total_mlb)}
        </span>
      ),
    },
    {
      key: 'envio',
      header: 'Envío',
      align: 'right',
      width: '130px',
      render: (c) => <Money usd_cents={c.envio_total_usd_cents} size="sm" soloUsd />,
    },
    {
      key: 'total',
      header: 'Total pagado',
      align: 'right',
      width: '170px',
      render: (c) => <Money usd_cents={c.total_usd_cents} size="sm" />,
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      width: '250px',
      render: (c) => (
        <div className="flex items-center justify-end gap-1.5">
          {c.estado !== 'RECIBIDA' ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  abrirParaEditar(c.id);
                }}
              >
                <FileEdit className="w-3.5 h-3.5" />
                <span>Editar</span>
              </Button>
              <Button
                size="sm"
                variant="primary"
                className="shadow-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  setPorConfirmar({ tipo: 'recibir', compra: c });
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Recibí</span>
              </Button>
            </>
          ) : (
            <span className="text-caption text-texto-3 mr-1 inline-flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Recibido
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Eliminar ${c.codigo}`}
            title="Eliminar paquete"
            className="text-texto-3 hover:text-danger-600 rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              setPorConfirmar({ tipo: 'archivar', compra: c });
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:px-6 md:py-4 scroll-smooth">
        <div className="max-w-[1500px] w-full mx-auto space-y-4">
          {/* Barra superior estilizada idéntica a la del inicio */}
        <div className="flex items-center justify-between gap-3 pb-1 border-b border-borde/40 text-caption text-texto-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-bold text-texto text-body">Envíos y Paquetes USA</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/10 text-indigo-700 border border-indigo-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              {compras.length} paquete{compras.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-block text-[11px] text-texto-3">
              Prorrateo de flete, peso y taxes
            </span>
            <Button
              variant="primary"
              size="sm"
              className="rounded-xl shadow-xs"
              onClick={() => {
                setCompraEditando(null);
                setEditorAbierto(true);
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Registrar paquete</span>
            </Button>
          </div>
        </div>

        {compras.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <StatTile
              label="Gastado en paquetes"
              usd_cents={gastadoTotal}
              tone="purple"
              icon={Boxes}
              hint={`${recibidos.length} paquete${recibidos.length === 1 ? '' : 's'} en tu inventario`}
            />
            {enCamino.length > 0 ? (
              <StatTile
                label="Registrado sin recibir"
                usd_cents={invertidoEnCamino}
                tone="warning"
                icon={Truck}
                hint={`${enCamino.length} paquete${enCamino.length === 1 ? '' : 's'} en camino`}
              />
            ) : (
              <StatTile
                label="Libras importadas"
                value={formatearPeso(recibidos.reduce((a, c) => a + c.peso_total_mlb, 0))}
                tone="info"
                icon={Scale}
                hint="Total consolidado de paquetes"
              />
            )}
            <StatTile
              label="Encargos por comprar"
              value={encargos.length}
              tone={encargos.length > 0 ? 'warning' : 'success'}
              icon={Clock}
              hint={
                encargos.length > 0
                  ? 'Clientes con anticipo registrado'
                  : 'Sin compras de encargos pendientes'
              }
            />
          </div>
        )}

        {cargando ? (
          <div className="p-12 text-center text-body text-texto-3">Cargando paquetes...</div>
        ) : compras.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Todavía no registraste ningún paquete"
            description="Cuando te llegue un envío, registralo acá con lo que venía adentro, el tax y el envío total. El sistema reparte el costo y arma tu inventario."
            action={
              <Button
                variant="primary"
                onClick={() => {
                  setCompraEditando(null);
                  setEditorAbierto(true);
                }}
              >
                <Plus className="w-4 h-4" />
                <span>Registrar el primer paquete</span>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3.5">
            <div className="p-3.5 rounded-xl border border-borde/80 bg-gradient-to-r from-superficie via-superficie to-indigo-500/5 shadow-2xs flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-700 flex items-center justify-center shrink-0">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-semibold text-texto text-label block">Historial y Costos de Courier</span>
                  <span className="text-caption text-texto-3">Acumulado consolidado de fletes importados</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-caption">
                <div>
                  <span className="text-texto-3 block text-[11px]">Total importado</span>
                  <span className="font-bold text-texto font-mono">{formatearPeso(historicoCourier.totalLibrasMlb)}</span>
                </div>
                <div className="h-6 w-px bg-borde/70" />
                <div>
                  <span className="text-texto-3 block text-[11px]">Flete total pagado</span>
                  <span className="font-bold text-texto font-mono">{formatearMoneda(historicoCourier.totalEnvioUsdCents, 'USD')}</span>
                </div>
                <div className="h-6 w-px bg-borde/70" />
                <div>
                  <span className="text-texto-3 block text-[11px]">Promedio por libra</span>
                  <span className="font-bold text-indigo-700 font-mono">{formatearMoneda(historicoCourier.costoPromedioPorLb, 'USD')}/lb</span>
                </div>
              </div>
            </div>

            <DataTable
              columns={columnas}
              rows={compras}
              rowKey={(c) => c.id}
              selectedKey={detalle?.id}
              onRowClick={(c) => verDetalle(c.id)}
              onRowContextMenu={(c, e) => {
                setMenuContextual({ x: e.clientX, y: e.clientY, compra: c });
              }}
            />
          </div>
        )}
        </div>
      </div>

      {detalle && (
        <aside ref={lateralRef} className="w-[420px] border-l border-borde bg-superficie flex flex-col shrink-0 animate-drawer shadow-xl z-10">
          {/* Cabecera pegajosa con botón de cerrar */}
          <div className="p-5 border-b border-borde bg-superficie-2/40 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-acento/10 text-acento-fuerte border border-acento/20 flex items-center justify-center shrink-0 shadow-xs">
                <Package className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-title font-bold text-texto tracking-tight">{detalle.codigo}</h3>
                  <Badge tone={ESTADO_TONO[detalle.estado]} className="gap-1.5 text-[11px]">
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        detalle.estado === 'RECIBIDA'
                          ? 'bg-emerald-500'
                          : detalle.estado === 'EN_CAMINO'
                            ? 'bg-amber-500 animate-pulse'
                            : 'bg-slate-400'
                      )}
                    />
                    {ESTADO_TEXTO[detalle.estado]}
                  </Badge>
                </div>
                <p className="text-caption text-texto-3 font-mono mt-0.5">
                  {formatearFecha(detalle.fecha)} · {formatearPeso(detalle.peso_total_mlb)} ·{' '}
                  {detalle.unidades_totales} unid.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetalle(null)}
              aria-label="Cerrar detalle"
              className="text-texto-3 hover:text-texto rounded-lg -mr-1 -mt-1 shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Banner de acción rápida para paquetes en camino */}
            {detalle.estado !== 'RECIBIDA' && (
              <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/80 flex items-center justify-between gap-3 shadow-xs">
                <div className="min-w-0">
                  <p className="text-label font-semibold text-amber-900">¿Ya llegó a tus manos?</p>
                  <p className="text-caption text-amber-700 leading-tight">
                    Mete las unidades directo a tu inventario activo.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setPorConfirmar({ tipo: 'recibir', compra: detalle })}
                  className="shrink-0 shadow-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Recibir</span>
                </Button>
              </div>
            )}

            {/* Desglose financiero */}
            <Card className="rounded-xl border-borde/80 shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde text-label font-medium text-texto">
                Desglose financiero
              </div>
              <CardContent className="p-4 space-y-2.5">
                <FilaResumen etiqueta="Productos / Mercancía" usd={detalle.subtotal_productos_usd_cents} />
                <FilaResumen etiqueta="Tax USA" usd={detalle.tax_total_usd_cents} />
                <FilaResumen etiqueta="Flete courier" usd={detalle.envio_total_usd_cents} />
                {detalle.otros_costos_usd_cents > 0 && (
                  <FilaResumen etiqueta="Otros gastos de gestión" usd={detalle.otros_costos_usd_cents} />
                )}
                <div className="pt-2.5 border-t border-borde flex items-center justify-between gap-2">
                  <span className="text-body font-bold text-texto">Total pagado</span>
                  <Money usd_cents={detalle.total_usd_cents} size="md" />
                </div>
              </CardContent>
            </Card>

            {/* Qué venía adentro */}
            <Card className="rounded-xl border-borde/80 shadow-xs overflow-hidden">
              <CardContent className="p-0">
                <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde text-label font-medium text-texto flex items-center justify-between">
                  <span>Qué venía adentro</span>
                  {detalle.lineas.length > 0 && (
                    <span className="text-caption text-texto-3">{detalle.lineas.length} artículo(s)</span>
                  )}
                </div>
                {detalle.lineas.length === 0 ? (
                  <div className="p-5 text-center space-y-2 bg-superficie">
                    <p className="text-body font-medium text-texto">
                      Factura de courier registrada
                    </p>
                    <p className="text-caption text-texto-3 leading-relaxed">
                      Este paquete se registró con flete consolidado. Podés cargar los productos desde el módulo de <strong>Inventario</strong> vinculándolos a este paquete para heredar su tarifa de courier.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-borde/60 max-h-[380px] overflow-y-auto">
                    {detalle.lineas.map((l) => (
                      <li key={l.id} className="px-4 py-3 hover:bg-superficie-2/20 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-body font-medium text-texto truncate">
                              {l.descripcion}
                            </div>
                            <div className="text-caption text-texto-3">
                              {l.cantidad} unidad(es) · {formatearPeso(l.peso_linea_mlb)}
                            </div>
                          </div>
                          <Badge tone={l.destino === 'ENCARGO' ? 'warning' : 'info'}>
                            {l.destino === 'ENCARGO'
                              ? l.cliente_nombre
                                ? `Encargo: ${l.cliente_nombre}`
                                : 'Encargo'
                              : 'Inventario'}
                          </Badge>
                        </div>

                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-caption">
                          <Detalle etiqueta="Producto" usd={l.precio_linea_usd_cents} />
                          <Detalle etiqueta="Tax" usd={l.tax_linea_usd_cents} />
                          <Detalle etiqueta="Envío" usd={l.envio_asignado_usd_cents} />
                          <Detalle etiqueta="Costo total" usd={l.costo_linea_usd_cents} fuerte />
                        </dl>

                        {l.cantidad > 1 && (
                          <p className="mt-1.5 text-caption font-medium text-acento-fuerte">
                            Cada unidad te salió en{' '}
                            {formatearMoneda(l.costo_unitario_usd_cents, 'USD')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </aside>
      )}

      <Confirmar
        abierto={porConfirmar?.tipo === 'recibir'}
        titulo={`¿Meter ${porConfirmar?.compra.codigo ?? ''} al inventario?`}
        consecuencias={[
          'Cada producto entra con su costo ya repartido.',
          'El paquete queda cerrado: después no se puede editar.',
        ]}
        textoConfirmar="Sí, al inventario"
        onConfirmar={() => porConfirmar && recibir(porConfirmar.compra)}
        onCerrar={() => setPorConfirmar(null)}
      />

      <Confirmar
        abierto={porConfirmar?.tipo === 'archivar'}
        peligroso
        titulo={`¿Eliminar paquete ${porConfirmar?.compra.codigo ?? ''}?`}
        descripcion={
          porConfirmar?.compra.estado === 'RECIBIDA'
            ? 'El paquete se eliminará de la lista activa. Los productos que ya ingresaron a tu inventario no se borrarán.'
            : 'El paquete se eliminará de la lista activa.'
        }
        textoConfirmar="Sí, eliminar"
        onConfirmar={() => porConfirmar && archivar(porConfirmar.compra)}
        onCerrar={() => setPorConfirmar(null)}
      />

      <PaqueteEditor
        abierto={editorAbierto}
        compra={compraEditando}
        encargosPendientes={encargos}
        parametros={parametros}
        onCerrar={() => setEditorAbierto(false)}
        onGuardado={async () => {
          await cargar();
          onCambio();
        }}
      />

      {menuContextual && (
        <ContextMenu
          x={menuContextual.x}
          y={menuContextual.y}
          onClose={() => setMenuContextual(null)}
          items={[
            ...(menuContextual.compra.estado !== 'RECIBIDA'
              ? [
                  {
                    id: 'recibir',
                    label: 'Marcar como recibido',
                    icon: <CheckCircle2 className="w-4 h-4" />,
                    tone: 'success' as const,
                    onClick: () => setPorConfirmar({ tipo: 'recibir', compra: menuContextual.compra }),
                  },
                  {
                    id: 'editar',
                    label: 'Editar paquete',
                    icon: <FileEdit className="w-4 h-4" />,
                    shortcut: 'Enter',
                    onClick: () => abrirParaEditar(menuContextual.compra.id),
                  },
                ]
              : []),
            {
              id: 'ver-detalle',
              label: 'Ver detalle y artículos',
              icon: <Eye className="w-4 h-4" />,
              shortcut: 'Espacio',
              onClick: () => verDetalle(menuContextual.compra.id),
            },
            'separator' as const,
            {
              id: 'copiar-codigo',
              label: `Copiar código (${menuContextual.compra.codigo})`,
              icon: <Copy className="w-4 h-4" />,
              onClick: () => {
                navigator.clipboard.writeText(menuContextual.compra.codigo);
                showToast({ message: 'Código de paquete copiado al portapapeles', type: 'info' });
              },
            },
            ...(menuContextual.compra.notas
              ? [
                  {
                    id: 'copiar-notas',
                    label: 'Copiar notas del paquete',
                    icon: <Copy className="w-4 h-4" />,
                    onClick: () => {
                      navigator.clipboard.writeText(menuContextual.compra.notas ?? '');
                      showToast({ message: 'Notas copiadas al portapapeles', type: 'info' });
                    },
                  },
                ]
              : []),
            'separator' as const,
            {
              id: 'archivar',
              label: 'Eliminar paquete...',
              icon: <Trash2 className="w-4 h-4" />,
              tone: 'danger' as const,
              shortcut: 'Supr',
              onClick: () => setPorConfirmar({ tipo: 'archivar', compra: menuContextual.compra }),
            },
          ]}
        />
      )}
    </div>
  );
};

const FilaResumen: React.FC<{ etiqueta: string; usd: number }> = ({ etiqueta, usd }) => (
  <div className="flex items-center justify-between gap-2">
    <span className="text-label text-texto-2">{etiqueta}</span>
    <Money usd_cents={usd} size="sm" soloUsd />
  </div>
);

const Detalle: React.FC<{ etiqueta: string; usd: number; fuerte?: boolean }> = ({
  etiqueta,
  usd,
  fuerte = false,
}) => (
  <>
    <dt className="text-texto-3">{etiqueta}</dt>
    <dd
      className={
        fuerte ? 'text-right text-texto font-semibold tabular' : 'text-right text-texto-2 tabular'
      }
    >
      {formatearMoneda(usd, 'USD')}
    </dd>
  </>
);
