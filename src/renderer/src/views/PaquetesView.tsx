import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Package,
  Plus,
  FileEdit,
  Trash2,
  Boxes,
  Scale,
  Clock,
  X,
  Copy,
  Eye,
  Wrench,
  FileSearch,
} from 'lucide-react';
import { cn } from '../lib/cn';
import type {
  Compra,
  CompraCompleta,
  Venta,
  ParametrosSistema,
  Categoria,
} from '../../../shared/types';
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
import { ReconstruccionModal } from './paquetes/ReconstruccionModal';
import { ResumenIngreso } from './paquetes/ResumenIngreso';
import { useClickOutside } from '../lib/useClickOutside';
import { useToast } from '../context/ToastContext';
import { formatearMoneda, formatearPeso, formatearFecha } from '@core/moneda';

/**
 * Los paquetes: lo que entró al inventario y lo que costó.
 *
 * Vive como pestaña de Inventario, porque es la mitad de la misma pregunta:
 * Productos dice lo que hay, Paquetes dice de dónde vino y cuánto se pagó.
 */

interface PaquetesViewProps {
  parametros: ParametrosSistema | null;
  categorias: Categoria[];
  abrirEditorAlEntrar?: boolean;
  onCambio: () => void;
}

/**
 * Los estados guardados no cambiaron (para no migrar documentos), pero lo que
 * se muestra sí: "recibido" no le hacía sentido a la dueña, porque el paquete
 * se registra cuando ya está en sus manos.
 */
type EstadoVisible = 'CARGANDO' | 'EN_INVENTARIO' | 'SIN_CONTENIDO';

const estadoVisible = (c: Compra): EstadoVisible =>
  c.estado !== 'RECIBIDA'
    ? 'CARGANDO'
    : // `cerrado_en` lo pone el paquete al entrar con sus líneas; los de antes
      // del cambio no lo tienen, y su contenido está en los productos.
      c.cerrado_en || c.reconstruido || c.subtotal_productos_usd_cents > 0
      ? 'EN_INVENTARIO'
      : 'SIN_CONTENIDO';

const ESTADO_TONO: Record<EstadoVisible, Tone> = {
  CARGANDO: 'warning',
  EN_INVENTARIO: 'success',
  SIN_CONTENIDO: 'neutral',
};

const ESTADO_TEXTO: Record<EstadoVisible, string> = {
  CARGANDO: 'Cargando',
  EN_INVENTARIO: 'En inventario',
  SIN_CONTENIDO: 'Sin contenido',
};

const $ = (c: number) => formatearMoneda(c, 'USD');

export const PaquetesView: React.FC<PaquetesViewProps> = ({
  parametros,
  categorias,
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
  const [reconstruyendo, setReconstruyendo] = useState<Compra | null>(null);
  const [borrando, setBorrando] = useState<Compra | null>(null);
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
        // Encargos que ya se pueden comprar: el anticipo está cubierto.
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

  const abrirEditor = async (id: number) => {
    const r = await window.api.compras.get(id);
    if (!r.success || !r.data) {
      showToast({ message: 'No se pudo abrir el paquete.', type: 'error' });
      return;
    }
    setDetalle(null);
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

  const borrar = async (c: Compra) => {
    const r = await window.api.compras.archivar(c.id);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(`Paquete ${c.codigo} eliminado`, cargar, r.data.evento_grupo_id);
    setDetalle(null);
    await cargar();
    onCambio();
  };

  const alGuardar = async () => {
    await cargar();
    setDetalle(null);
    onCambio();
  };

  const enInventario = compras.filter((c) => c.estado === 'RECIBIDA');
  const sinContenido = compras.filter((c) => estadoVisible(c) === 'SIN_CONTENIDO');
  const cargandose = compras.filter((c) => c.estado !== 'RECIBIDA');
  const pagadoTotal = enInventario.reduce((a, c) => a + c.total_usd_cents, 0);
  const librasTotales = enInventario.reduce((a, c) => a + c.peso_total_mlb, 0);

  const costoPorLibra = useMemo(() => {
    const flete = enInventario.reduce((a, c) => a + c.envio_total_usd_cents, 0);
    const lb = librasTotales / 1000;
    return lb > 0 ? Math.round(flete / lb) : 0;
  }, [enInventario, librasTotales]);

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
            <div className="text-body font-semibold text-texto tracking-tight whitespace-nowrap">{c.codigo}</div>
            <div className="text-caption font-mono text-texto-3 whitespace-nowrap">{formatearFecha(c.fecha)}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '140px',
      render: (c) => {
        const e = estadoVisible(c);
        return (
          <Badge tone={ESTADO_TONO[e]} className="gap-1.5 font-medium whitespace-nowrap">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full shrink-0',
                e === 'EN_INVENTARIO' ? 'bg-acento' : e === 'CARGANDO' ? 'bg-alerta' : 'bg-texto-3'
              )}
            />
            {ESTADO_TEXTO[e]}
          </Badge>
        );
      },
    },
    {
      key: 'peso',
      header: 'Peso',
      align: 'right',
      width: '100px',
      render: (c) => (
        <span className="text-label text-texto-2 tabular font-mono">
          {formatearPeso(c.peso_total_mlb)}
        </span>
      ),
    },
    {
      key: 'mercaderia',
      header: 'Tienda + 7%',
      align: 'right',
      width: '140px',
      render: (c) =>
        estadoVisible(c) === 'SIN_CONTENIDO' ? (
          <span className="text-caption text-texto-3">sin registrar</span>
        ) : (
          <Money
            usd_cents={c.subtotal_productos_usd_cents + c.tax_total_usd_cents}
            size="sm"
            soloUsd
          />
        ),
    },
    {
      key: 'envio',
      header: 'Flete',
      align: 'right',
      width: '120px',
      render: (c) => <Money usd_cents={c.envio_total_usd_cents + c.otros_costos_usd_cents} size="sm" soloUsd />,
    },
    {
      key: 'total',
      header: 'Pagado',
      align: 'right',
      width: '150px',
      render: (c) => <Money usd_cents={c.total_usd_cents} size="sm" />,
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      width: '230px',
      render: (c) => {
        const e = estadoVisible(c);
        return (
          <div className="flex items-center justify-end gap-1.5">
            {e === 'CARGANDO' && (
              <Button
                size="sm"
                variant="primary"
                className="shadow-xs"
                onClick={(ev) => {
                  ev.stopPropagation();
                  abrirEditor(c.id);
                }}
              >
                <FileEdit className="w-3.5 h-3.5" />
                <span>Seguir cargando</span>
              </Button>
            )}
            {e === 'EN_INVENTARIO' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(ev) => {
                  ev.stopPropagation();
                  abrirEditor(c.id);
                }}
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Corregir</span>
              </Button>
            )}
            {e === 'SIN_CONTENIDO' && (
              <Button
                size="sm"
                variant="outline"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setReconstruyendo(c);
                }}
              >
                <FileSearch className="w-3.5 h-3.5" />
                <span>Completar contenido</span>
              </Button>
            )}
            {e === 'CARGANDO' && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Eliminar ${c.codigo}`}
                title="Eliminar paquete"
                className="text-texto-3 hover:text-danger-600 rounded-lg"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setBorrando(c);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const estadoDetalle = detalle ? estadoVisible(detalle) : null;

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:px-6 md:py-4 animate-fade-in scroll-smooth">
        <div className="max-w-[1500px] w-full mx-auto space-y-4 stagger-children">
          <div className="flex items-center justify-between gap-3 pb-1 border-b border-borde/40 text-caption text-texto-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="font-bold text-texto text-body">Paquetes</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-acento/10 text-acento border border-acento/20">
                <span className="w-1.5 h-1.5 rounded-full bg-acento" />
                {compras.length} paquete{compras.length === 1 ? '' : 's'}
              </span>
            </div>
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

          {compras.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 stagger-children">
              <StatTile
                label="Pagado en paquetes"
                usd_cents={pagadoTotal}
                tone="purple"
                icon={Boxes}
                hint={
                  sinContenido.length > 0
                    ? `${sinContenido.length} sin contenido: sólo cuenta su flete. Completalo.`
                    : `${enInventario.length} paquete${enInventario.length === 1 ? '' : 's'}: tienda + 7% + flete`
                }
              />
              <StatTile
                label="Libras importadas"
                value={formatearPeso(librasTotales)}
                tone="info"
                icon={Scale}
                hint={
                  costoPorLibra > 0
                    ? `El flete te sale a ${$(costoPorLibra)} por libra`
                    : cargandose.length > 0
                      ? `${cargandose.length} paquete${cargandose.length === 1 ? '' : 's'} cargándose`
                      : 'De los paquetes en inventario'
                }
              />
              <StatTile
                label="Encargos por comprar"
                value={encargos.length}
                tone={encargos.length > 0 ? 'warning' : 'success'}
                icon={Clock}
                hint={
                  encargos.length > 0
                    ? 'Confirmados: el anticipo ya entró'
                    : 'Sin encargos confirmados pendientes'
                }
              />
            </div>
          )}

          {cargando ? (
            <div className="p-12 text-center text-body text-texto-3">Cargando paquetes...</div>
          ) : compras.length === 0 ? (
            <EmptyState
              icon={Package}
              title="Todavía no hay paquetes"
              description="Registrá el paquete cuando llegue: lo que trajo, lo que costó en la tienda, cuánto pesó y el flete. Así entra al inventario con su costo real."
              action={
                <Button
                  variant="primary"
                  onClick={() => {
                    setCompraEditando(null);
                    setEditorAbierto(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  <span>Registrar el primero</span>
                </Button>
              }
            />
          ) : (
            <DataTable
              columns={columnas}
              rows={compras}
              rowKey={(c) => c.id}
              selectedKey={detalle?.id}
              onRowClick={(c) => verDetalle(c.id)}
              onRowContextMenu={(c, e) => setMenuContextual({ x: e.clientX, y: e.clientY, compra: c })}
            />
          )}
        </div>
      </div>

      {detalle && estadoDetalle && (
        <aside
          ref={lateralRef}
          className="w-[420px] border-l border-borde bg-superficie flex flex-col shrink-0 animate-drawer shadow-xl z-10"
        >
          <div className="p-5 border-b border-borde bg-superficie-2/40 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-title font-semibold text-texto">{detalle.codigo}</h3>
                <Badge tone={ESTADO_TONO[estadoDetalle]}>{ESTADO_TEXTO[estadoDetalle]}</Badge>
              </div>
              <p className="text-caption text-texto-3 mt-0.5">
                {formatearFecha(detalle.fecha)} · {formatearPeso(detalle.peso_total_mlb)} ·{' '}
                {detalle.unidades_totales} unid.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetalle(null)}
              aria-label="Cerrar detalle"
              className="text-texto-3 hover:text-texto rounded-lg -mr-1 -mt-1"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {estadoDetalle === 'CARGANDO' && (
              <div className="p-3.5 rounded-xl border border-alerta-suave bg-alerta-suave flex items-center justify-between gap-3">
                <p className="text-caption text-alerta leading-snug">
                  Se está cargando: nada entró todavía al inventario.
                </p>
                <Button size="sm" variant="primary" onClick={() => abrirEditor(detalle.id)}>
                  Seguir cargando
                </Button>
              </div>
            )}

            {estadoDetalle === 'SIN_CONTENIDO' && (
              <div className="p-3.5 rounded-xl border border-borde bg-superficie-2/60 space-y-2">
                <p className="text-caption text-texto-2 leading-relaxed">
                  Este paquete se registró antes de que los paquetes guardaran lo que traían: su
                  total es sólo el flete. Lo que costó la mercadería está en los productos que se
                  cargaron con él.
                </p>
                <Button size="sm" variant="outline" onClick={() => setReconstruyendo(detalle)}>
                  <FileSearch className="w-3.5 h-3.5" />
                  <span>Ver y completar su contenido</span>
                </Button>
              </div>
            )}

            <Card className="rounded-xl border-borde/80 shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde text-label font-medium text-texto">
                Lo que se pagó
              </div>
              <CardContent className="p-4 space-y-2">
                <Fila etiqueta="Precio de tienda" usd={detalle.subtotal_productos_usd_cents} />
                <Fila etiqueta={`Impuesto (${(parametros?.tax_bp ?? 700) / 100}%)`} usd={detalle.tax_total_usd_cents} />
                <Fila etiqueta="Flete del courier" usd={detalle.envio_total_usd_cents} />
                {detalle.otros_costos_usd_cents > 0 && (
                  <Fila etiqueta="Otros gastos" usd={detalle.otros_costos_usd_cents} />
                )}
                <div className="pt-2 border-t border-borde flex items-center justify-between gap-2">
                  <span className="text-body font-bold text-texto">Total pagado</span>
                  <Money usd_cents={detalle.total_usd_cents} size="md" />
                </div>
                {detalle.criterio_flete && detalle.criterio_flete !== 'SIN_FLETE' && (
                  <p className="text-caption text-texto-3">
                    El flete se repartió por {detalle.criterio_flete === 'PESO' ? 'peso' : 'unidades'}.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-borde/80 shadow-xs overflow-hidden">
              <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde text-label font-medium text-texto flex items-center justify-between">
                <span>Qué vino adentro</span>
                {detalle.lineas.length > 0 && (
                  <span className="text-caption text-texto-3">{detalle.lineas.length} línea(s)</span>
                )}
              </div>
              {detalle.lineas.length === 0 ? (
                <p className="p-5 text-center text-caption text-texto-3">
                  {estadoDetalle === 'CARGANDO'
                    ? 'Todavía no tiene productos.'
                    : 'No tiene el contenido registrado.'}
                </p>
              ) : (
                <ul className="divide-y divide-borde/60 max-h-[420px] overflow-y-auto">
                  {detalle.lineas.map((l) => (
                    <li key={l.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-body font-medium text-texto truncate">
                            {l.producto_nombre ?? l.descripcion}
                          </div>
                          {/* La cuenta de la línea, para comprobarla a mano. */}
                          <div className="text-caption text-texto-3 tabular">
                            {l.cantidad} × {$(Math.round(l.precio_linea_usd_cents / Math.max(1, l.cantidad)))}
                            {' '}+ {$(l.tax_linea_usd_cents)} imp.
                            {' '}+ {$(l.envio_asignado_usd_cents + l.otros_asignados_usd_cents)} flete
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-body font-semibold text-texto tabular">
                            {$(l.costo_unitario_usd_cents)} c/u
                          </div>
                          {l.destino === 'ENCARGO' ? (
                            <Badge tone="warning">
                              {l.cliente_nombre ? `Encargo de ${l.cliente_nombre}` : 'Encargo'}
                            </Badge>
                          ) : (
                            <span className="text-caption text-texto-3 tabular">
                              línea {$(l.costo_linea_usd_cents)}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {detalle.resumen_ingreso && detalle.resumen_ingreso.length > 0 && (
              <div>
                <h4 className="text-label font-medium text-texto mb-2">Cómo quedó cada producto al entrar</h4>
                <ResumenIngreso
                  compacto
                  modo="ingreso"
                  resultado={{
                    codigo: detalle.codigo,
                    productos_afectados: detalle.resumen_ingreso.length,
                    productos: detalle.resumen_ingreso,
                    encargos_actualizados: 0,
                  }}
                />
              </div>
            )}
          </div>

          {estadoDetalle === 'EN_INVENTARIO' && (
            <div className="p-4 border-t border-borde bg-superficie-2/40">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center rounded-xl"
                onClick={() => abrirEditor(detalle.id)}
              >
                <Wrench className="w-3.5 h-3.5 mr-1.5" />
                <span>Corregir este paquete</span>
              </Button>
            </div>
          )}
        </aside>
      )}

      <PaqueteEditor
        abierto={editorAbierto}
        compra={compraEditando}
        parametros={parametros}
        categorias={categorias}
        onCerrar={() => {
          setEditorAbierto(false);
          setCompraEditando(null);
        }}
        onGuardado={alGuardar}
      />

      <ReconstruccionModal
        compra={reconstruyendo}
        onCerrar={() => setReconstruyendo(null)}
        onCompletado={alGuardar}
        onCargarContenido={(c) => abrirEditor(c.id)}
      />

      <Confirmar
        abierto={borrando !== null}
        peligroso
        titulo={`¿Eliminar ${borrando?.codigo ?? ''}?`}
        consecuencias={[
          'Se está cargando: todavía no entró nada al inventario, así que no cambia la bodega.',
          'Los productos nuevos que creaste para este paquete siguen en el catálogo, sin existencias.',
        ]}
        textoConfirmar="Sí, eliminarlo"
        onConfirmar={() => borrando && borrar(borrando)}
        onCerrar={() => setBorrando(null)}
      />

      {menuContextual && (
        <ContextMenu
          x={menuContextual.x}
          y={menuContextual.y}
          onClose={() => setMenuContextual(null)}
          items={[
            {
              id: 'ver',
              label: 'Ver detalle',
              icon: <Eye className="w-4 h-4" />,
              onClick: () => verDetalle(menuContextual.compra.id),
            },
            ...(estadoVisible(menuContextual.compra) === 'CARGANDO'
              ? [
                  {
                    id: 'cargar',
                    label: 'Seguir cargando',
                    icon: <FileEdit className="w-4 h-4" />,
                    onClick: () => abrirEditor(menuContextual.compra.id),
                  },
                ]
              : estadoVisible(menuContextual.compra) === 'EN_INVENTARIO'
                ? [
                    {
                      id: 'corregir',
                      label: 'Corregir',
                      icon: <Wrench className="w-4 h-4" />,
                      onClick: () => abrirEditor(menuContextual.compra.id),
                    },
                  ]
                : [
                    {
                      id: 'completar',
                      label: 'Completar contenido',
                      icon: <FileSearch className="w-4 h-4" />,
                      onClick: () => setReconstruyendo(menuContextual.compra),
                    },
                  ]),
            'separator' as const,
            {
              id: 'copiar',
              label: `Copiar código (${menuContextual.compra.codigo})`,
              icon: <Copy className="w-4 h-4" />,
              onClick: () => {
                navigator.clipboard.writeText(menuContextual.compra.codigo);
                showToast({ message: 'Código copiado', type: 'info' });
              },
            },
            ...(estadoVisible(menuContextual.compra) === 'CARGANDO'
              ? [
                  {
                    id: 'borrar',
                    label: 'Eliminar paquete',
                    icon: <Trash2 className="w-4 h-4" />,
                    tone: 'danger' as const,
                    onClick: () => setBorrando(menuContextual.compra),
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
};

const Fila: React.FC<{ etiqueta: string; usd: number }> = ({ etiqueta, usd }) => (
  <div className="flex items-center justify-between gap-2 text-label">
    <span className="text-texto-2">{etiqueta}</span>
    <Money usd_cents={usd} size="sm" soloUsd />
  </div>
);

