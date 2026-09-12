import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Package, Plus, Search, SlidersHorizontal, Trash2, History, Boxes, TrendingUp, AlertTriangle } from 'lucide-react';
import type {
  ProductoConStock,
  Categoria,
  ParametrosSistema,
  MovimientoInventario,
} from '../../../shared/types';
import {
  Card,
  CardContent,
  Button,
  Badge,
  Money,
  Porcentaje,
  Input,
  Select,
  StatTile,
  DataTable,
  Confirmar,
  type Column,
} from '../components/ui';
import { EmptyState } from '../components/shared/EmptyState';
import { ProductoModal, type DatosProducto } from './inventario/ProductoModal';
import { AjustarStockModal, type AjusteStock } from './inventario/AjustarStockModal';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { formatearMoneda, formatearFecha } from '@core/moneda';

interface InventarioViewProps {
  categorias: Categoria[];
  parametros: ParametrosSistema | null;
  productoInicialId?: number;
  onCambio: () => void;
}

type Filtro = 'TODOS' | 'CON_STOCK' | 'BAJO_STOCK';

export const InventarioView: React.FC<InventarioViewProps> = ({
  categorias,
  parametros,
  productoInicialId,
  onCambio,
}) => {
  const { showToast, showUndoToast } = useToast();

  const [productos, setProductos] = useState<ProductoConStock[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [categoriaFiltro, setCategoriaFiltro] = useState<number | undefined>(undefined);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoEditando, setProductoEditando] = useState<ProductoConStock | null>(null);
  const [archivando, setArchivando] = useState<ProductoConStock | null>(null);
  const [ajustando, setAjustando] = useState<AjusteStock | null>(null);
  const [detalleId, setDetalleId] = useState<number | undefined>(productoInicialId);
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await window.api.productos.list({
        busqueda: busqueda.trim() || undefined,
        categoria_id: categoriaFiltro,
        soloConStock: filtro === 'CON_STOCK',
        soloBajoStock: filtro === 'BAJO_STOCK',
      });
      if (r.success) setProductos(r.data);
      else showToast({ message: r.error, type: 'error' });
    } finally {
      setCargando(false);
    }
  }, [busqueda, categoriaFiltro, filtro, showToast]);

  useEffect(() => {
    const t = setTimeout(cargar, busqueda ? 200 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  useEffect(() => {
    setDetalleId(productoInicialId);
  }, [productoInicialId]);

  useEffect(() => {
    if (!detalleId) {
      setMovimientos([]);
      return;
    }
    window.api.productos.movimientos(detalleId).then((r) => {
      if (r.success) setMovimientos(r.data);
    });
  }, [detalleId, productos]);

  const totales = useMemo(() => {
    const unidades = productos.reduce((a, p) => a + p.existencias, 0);
    const valor = productos.reduce((a, p) => a + p.valor_inventario_usd_cents, 0);
    const gananciaPotencial = productos.reduce(
      (a, p) => a + p.ganancia_unitaria_usd_cents * p.existencias,
      0
    );
    return { unidades, valor, gananciaPotencial };
  }, [productos]);

  const guardar = async (datos: DatosProducto) => {
    const r = datos.id
      ? await window.api.productos.actualizar(datos as never)
      : await window.api.productos.crear(datos as never);

    if (!r.success) throw new Error(r.error);

    showUndoToast(
      datos.id ? 'Producto actualizado' : `'${datos.nombre}' agregado al inventario`,
      () => {
        cargar();
        onCambio();
      },
      r.data.evento_grupo_id
    );
    await cargar();
    onCambio();
  };

  const ajustarStock = async (ajuste: AjusteStock, nuevas: number) => {
    const r = await window.api.productos.ajustarStock(
      ajuste.variante_id,
      nuevas,
      'Conteo manual',
      ajuste.producto_id
    );
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(
      `Existencias ajustadas a ${nuevas}`,
      () => {
        cargar();
        onCambio();
      },
      r.data.evento_grupo_id
    );
    await cargar();
    onCambio();
  };

  const archivar = async (p: ProductoConStock) => {
    const r = await window.api.productos.archivar(p.id);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(
      `'${p.nombre}' eliminado del inventario`,
      () => {
        cargar();
        onCambio();
      },
      r.data.evento_grupo_id
    );
    await cargar();
    onCambio();
  };

  const columnas: Column<ProductoConStock>[] = [
    {
      key: 'nombre',
      header: 'Producto',
      render: (p) => (
        <div className="flex items-center gap-3 min-w-0">
          {p.foto ? (
            <img
              src={p.foto}
              alt=""
              className="w-10 h-10 rounded-md object-cover border border-borde shrink-0"
            />
          ) : (
            <div
              aria-hidden="true"
              className="w-10 h-10 rounded-md bg-superficie-2 border border-borde flex items-center justify-center shrink-0"
            >
              <Package className="w-4 h-4 text-texto-3" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-body text-texto truncate">{p.nombre}</div>
            <div className="text-caption text-texto-3">
              {p.codigo}
              {p.categoria_nombre ? ` · ${p.categoria_nombre}` : ''}
              {p.tiene_variantes ? ` · ${p.variantes.length} variante(s)` : ''}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'existencias',
      header: 'Existencias',
      align: 'right',
      width: '130px',
      render: (p) => (
        <Badge
          tone={
            p.existencias === 0
              ? 'danger'
              : p.stock_minimo > 0 && p.existencias <= p.stock_minimo
                ? 'warning'
                : 'neutral'
          }
        >
          {p.existencias === 0 ? 'Agotado' : p.existencias}
        </Badge>
      ),
    },
    {
      key: 'costo',
      header: 'Te cuesta',
      align: 'right',
      width: '150px',
      render: (p) => <Money usd_cents={p.costo_unitario_usd_cents} size="sm" soloUsd />,
    },
    {
      key: 'precio',
      header: 'Lo vendés en',
      align: 'right',
      width: '170px',
      render: (p) => <Money usd_cents={p.precio_venta_usd_cents} size="sm" />,
    },
    {
      key: 'ganancia',
      header: 'Ganás',
      align: 'right',
      width: '150px',
      render: (p) => {
        const margen =
          p.costo_unitario_usd_cents > 0
            ? Math.round((p.ganancia_unitaria_usd_cents * 10000) / p.costo_unitario_usd_cents)
            : 0;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Money
              usd_cents={p.ganancia_unitaria_usd_cents}
              size="sm"
              soloUsd
              colorearSigno
            />
            {p.costo_unitario_usd_cents > 0 && (
              <Badge tone={p.ganancia_unitaria_usd_cents < 0 ? 'danger' : 'success'}>
                <Porcentaje bp={margen} />
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      width: '210px',
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              if (p.variantes.length === 1) {
                setAjustando({
                  variante_id: p.variantes[0].id,
                  producto_id: p.id,
                  nombre: p.nombre,
                  actual: p.variantes[0].existencias,
                });
              } else {
                setDetalleId(p.id);
              }
            }}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Ajustar</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setProductoEditando(p);
              setModalAbierto(true);
            }}
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Eliminar ${p.nombre}`}
            title="Eliminar del inventario"
            className="text-texto-3 hover:text-danger-600"
            onClick={(e) => {
              e.stopPropagation();
              setArchivando(p);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const detalle = productos.find((p) => p.id === detalleId);

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-5 animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-label text-texto-2">
              Lo que tenés para vender, cuánto te costó y a cuánto lo vendés.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setProductoEditando(null);
              setModalAbierto(true);
            }}
          >
            <Plus className="w-4 h-4" />
            <span>Agregar producto</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4.5">
          <StatTile
            label="Invertido en bodega"
            usd_cents={totales.valor}
            tone="purple"
            icon={Boxes}
            hint={`${totales.unidades} unidad(es) en ${productos.length} producto(s)`}
          />
          <StatTile
            label="Ganancia potencial esperada"
            usd_cents={totales.gananciaPotencial}
            tone="success"
            icon={TrendingUp}
            hint="Calculado a los precios de venta actuales"
          />
          <StatTile
            label="Stock por agotarse"
            value={
              productos.filter((p) => p.stock_minimo > 0 && p.existencias <= p.stock_minimo).length
            }
            tone={
              productos.some((p) => p.stock_minimo > 0 && p.existencias <= p.stock_minimo)
                ? 'danger'
                : 'success'
            }
            icon={AlertTriangle}
            hint="En o por debajo del mínimo configurado"
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-texto-3 pointer-events-none" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código..."
              className="pl-9"
              aria-label="Buscar productos"
            />
          </div>

          <Select
            value={categoriaFiltro ?? ''}
            onChange={(e) =>
              setCategoriaFiltro(e.target.value ? Number(e.target.value) : undefined)
            }
            className="w-auto min-w-[160px]"
            aria-label="Filtrar por categoría"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>

          <div className="flex rounded-md border border-borde-fuerte overflow-hidden">
            {(
              [
                { id: 'TODOS', etiqueta: 'Todos' },
                { id: 'CON_STOCK', etiqueta: 'Con existencias' },
                { id: 'BAJO_STOCK', etiqueta: 'Por acabarse' },
              ] as { id: Filtro; etiqueta: string }[]
            ).map((f, i) => (
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
        </div>

        {cargando ? (
          <div className="p-12 text-center text-body text-texto-3">Cargando inventario...</div>
        ) : productos.length === 0 ? (
          <EmptyState
            icon={Package}
            title={busqueda || filtro !== 'TODOS' ? 'Nada coincide' : 'Tu inventario está vacío'}
            description={
              busqueda || filtro !== 'TODOS'
                ? 'Probá con otra búsqueda o quitá los filtros.'
                : 'Agregá productos a mano, o registrá un paquete y marcalo como recibido para que entren solos.'
            }
            action={
              !busqueda && filtro === 'TODOS' ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setProductoEditando(null);
                    setModalAbierto(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar el primer producto</span>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            columns={columnas}
            rows={productos}
            rowKey={(p) => p.id}
            selectedKey={detalleId}
            onRowClick={(p) => setDetalleId(p.id === detalleId ? undefined : p.id)}
          />
        )}
      </div>

      {/* Panel lateral con variantes e historial */}
      {detalle && (
        <aside className="w-[380px] border-l border-borde bg-superficie overflow-y-auto shrink-0">
          <div className="p-5 space-y-5">
            <div className="flex items-start gap-3">
              {detalle.foto && (
                <img
                  src={detalle.foto}
                  alt=""
                  className="w-20 h-20 rounded-lg object-cover border border-borde shrink-0"
                />
              )}
              <div className="min-w-0">
                <h3 className="text-title text-texto">{detalle.nombre}</h3>
                <p className="text-caption text-texto-3">{detalle.codigo}</p>
                <p className="mt-1 text-label text-texto-2">
                  {formatearMoneda(detalle.precio_venta_usd_cents, 'USD')} ·{' '}
                  {detalle.existencias} en existencia
                </p>
              </div>
            </div>

            {detalle.tiene_variantes && (
              <Card>
                <CardContent className="p-0">
                  <div className="px-4 py-2.5 border-b border-borde text-label font-medium text-texto-2">
                    Existencias por variante
                  </div>
                  <ul className="divide-y divide-borde">
                    {detalle.variantes.map((v) => (
                      <li
                        key={v.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-2"
                      >
                        <span className="text-body text-texto-2">
                          {[v.talla, v.color].filter(Boolean).join(' · ') || 'Única'}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge tone={v.existencias === 0 ? 'danger' : 'neutral'}>
                            {v.existencias}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setAjustando({
                                variante_id: v.id,
                                producto_id: detalle.id,
                                nombre: `${detalle.nombre} ${[v.talla, v.color]
                                  .filter(Boolean)
                                  .join(' ')}`.trim(),
                                actual: v.existencias,
                              })
                            }
                          >
                            Ajustar
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-2.5 border-b border-borde flex items-center gap-2 text-label font-medium text-texto-2">
                  <History className="w-3.5 h-3.5 text-texto-3" />
                  Movimientos
                </div>
                {movimientos.length > 0 ? (
                  <ul className="divide-y divide-borde max-h-[420px] overflow-y-auto">
                    {movimientos.map((m) => (
                      <li key={m.id} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <Badge
                            tone={
                              m.tipo === 'ENTRADA'
                                ? 'success'
                                : m.tipo === 'SALIDA'
                                  ? 'info'
                                  : 'neutral'
                            }
                          >
                            {m.tipo === 'ENTRADA'
                              ? `+${m.cantidad}`
                              : m.tipo === 'SALIDA'
                                ? `-${m.cantidad}`
                                : `= ${m.existencias_despues}`}
                          </Badge>
                          <span className="text-caption text-texto-3 tabular">
                            {formatearFecha(m.fecha)}
                          </span>
                        </div>
                        {m.detalle && (
                          <p className="mt-1 text-caption text-texto-2">{m.detalle}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-6 text-center text-body text-texto-3">
                    Sin movimientos todavía.
                  </p>
                )}
              </CardContent>
            </Card>

            <Button variant="secondary" onClick={() => setDetalleId(undefined)} className="w-full">
              Cerrar detalle
            </Button>
          </div>
        </aside>
      )}

      <Confirmar
        abierto={archivando !== null}
        peligroso
        titulo={`¿Eliminar "${archivando?.nombre ?? ''}" del inventario?`}
        consecuencias={[
          'El producto se eliminará de la lista activa y no estará disponible para ventas.',
          ...(archivando && archivando.existencias > 0
            ? [
                `Tenés ${archivando.existencias} unidad${archivando.existencias === 1 ? '' : 'es'} en existencia; dejarán de contar como inversión en el inventario.`,
              ]
            : []),
        ]}
        textoConfirmar="Sí, eliminar"
        onConfirmar={() => archivando && archivar(archivando)}
        onCerrar={() => setArchivando(null)}
      />

      <AjustarStockModal
        ajuste={ajustando}
        onCerrar={() => setAjustando(null)}
        onConfirmar={ajustarStock}
      />

      <ProductoModal
        abierto={modalAbierto}
        producto={productoEditando}
        categorias={categorias}
        margenDefectoBp={parametros?.margen_defecto_bp ?? 4500}
        pasoRedondeo={parametros?.paso_redondeo_usd_cents ?? 100}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={guardar}
      />
    </div>
  );
};
