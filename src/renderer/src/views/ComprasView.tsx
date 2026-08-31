import React, { useEffect, useState, useMemo } from 'react';
import { ShoppingCart, ExternalLink, CheckCircle, PlusCircle, Store } from 'lucide-react';
import { Card, CardHeader, CardContent, Button, Badge, Money, SectionHeader, StatTile } from '../components/ui';
import { EmptyState } from '../components/shared/EmptyState';
import { useToast } from '../context/ToastContext';
import type { ItemListaCompraRow } from '../../../shared/types';

export const ComprasView: React.FC = () => {
  const [compras, setCompras] = useState<ItemListaCompraRow[]>([]);
  const [pendientes, setPendientes] = useState<ItemListaCompraRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPendientes, setSelectedPendientes] = useState<number[]>([]);
  const [procesando, setProcesando] = useState(false);
  const { showToast, showUndoToast } = useToast();

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const [resCompras, resPendientes] = await Promise.all([
        window.api.vistas.getListaComprasUsa(),
        window.api.vistas.getPendientesDeLista(),
      ]);

      if (resCompras.success) {
        setCompras(resCompras.data);
      }
      if (resPendientes.success) {
        setPendientes(resPendientes.data);
      }
    } catch {
      showToast({ message: 'Error al cargar la lista de compras', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Totales generales
  const totales = useMemo(() => {
    const cantidad = compras.length;
    const totalUsdCents = compras.reduce(
      (acc, it) => acc + it.precio_usa_usd_cents + it.tax_usa_usd_cents,
      0
    );
    const totalPesoMlb = compras.reduce((acc, it) => acc + it.peso_mlb, 0);
    const totalLbs = (totalPesoMlb / 1000).toFixed(1);

    return { cantidad, totalUsdCents, totalLbs };
  }, [compras]);

  // Agrupado por tienda
  const comprasPorTienda = useMemo(() => {
    const map = new Map<string, ItemListaCompraRow[]>();
    for (const item of compras) {
      const tienda = item.tienda_nombre || 'Tienda sin especificar';
      if (!map.has(tienda)) {
        map.set(tienda, []);
      }
      map.get(tienda)!.push(item);
    }
    return Array.from(map.entries()).map(([tienda, items]) => {
      const subtotalUsdCents = items.reduce(
        (acc, it) => acc + it.precio_usa_usd_cents + it.tax_usa_usd_cents,
        0
      );
      const subtotalPesoLbs = (items.reduce((acc, it) => acc + it.peso_mlb, 0) / 1000).toFixed(1);
      return {
        tienda,
        items,
        subtotalUsdCents,
        subtotalPesoLbs,
        cantidad: items.length,
      };
    });
  }, [compras]);

  // Mover seleccionados de ANTICIPO_OK a EN_LISTA_USA
  const handleAgregarSeleccionadosALista = async () => {
    if (selectedPendientes.length === 0) return;
    try {
      setProcesando(true);
      let ultimoGrupoId: string | undefined;

      for (const itemId of selectedPendientes) {
        const res = await window.api.pedidos.cambiarEstadoItem(itemId, 'EN_LISTA_USA');
        if (res.success) {
          ultimoGrupoId = res.data.evento_grupo_id;
        }
      }

      showUndoToast(
        `${selectedPendientes.length} producto(s) agregados a la lista de compras`,
        () => cargarDatos(),
        ultimoGrupoId
      );
      setSelectedPendientes([]);
      await cargarDatos();
    } catch {
      showToast({ message: 'Error al agregar productos a la lista', type: 'error' });
    } finally {
      setProcesando(false);
    }
  };

  const handleTogglePendiente = (id: number) => {
    setSelectedPendientes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleTodosPendientes = () => {
    if (selectedPendientes.length === pendientes.length) {
      setSelectedPendientes([]);
    } else {
      setSelectedPendientes(pendientes.map((p) => p.item_id));
    }
  };

  // Marcar ítem como COMPRADO
  const handleMarcarComprado = async (item: ItemListaCompraRow) => {
    try {
      const res = await window.api.pedidos.cambiarEstadoItem(item.item_id, 'COMPRADO');
      if (res.success) {
        showUndoToast(
          `"${item.descripcion}" marcado como comprado`,
          () => cargarDatos(),
          res.data.evento_grupo_id
        );
        await cargarDatos();
      } else {
        showToast({ message: res.error.message, type: 'error' });
      }
    } catch {
      showToast({ message: 'Error al marcar el producto como comprado', type: 'error' });
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto bg-slate-50 space-y-6 animate-fade-in">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-display text-slate-900 tracking-tight flex items-center gap-2.5">
            <ShoppingCart className="w-6 h-6 text-brand-600" />
            <span>Lista de Compras en Estados Unidos</span>
          </h2>
          <p className="text-label text-slate-500 mt-0.5">
            Productos con anticipo verificado listos para comprar y agrupar por tienda.
          </p>
        </div>

        <Button variant="secondary" onClick={cargarDatos} disabled={loading}>
          <span>Actualizar</span>
        </Button>
      </div>

      {/* Tarjetas de Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          label="Productos para comprar"
          value={totales.cantidad.toString()}
          tone={totales.cantidad > 0 ? 'info' : 'neutral'}
          hint={totales.cantidad === 1 ? '1 ítem en lista' : `${totales.cantidad} ítems en lista`}
        />
        <StatTile
          label="Total estimado en USA"
          value={`$${(totales.totalUsdCents / 100).toFixed(2)}`}
          tone={totales.totalUsdCents > 0 ? 'info' : 'neutral'}
          hint="Incluye tax estimado"
        />
        <StatTile
          label="Peso acumulado"
          value={`${totales.totalLbs} lb`}
          tone="neutral"
          hint="Para estimación de flete"
        />
      </div>

      {/* Sección 1: Listos para agregar a tu lista (ANTICIPO_OK) */}
      {pendientes.length > 0 && (
        <Card className="border-brand-200 bg-brand-50/40 shadow-sm">
          <CardHeader className="border-b border-brand-100 bg-white/70">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">Listos para agregar a tu lista</span>
                  <Badge tone="info">{pendientes.length} por agregar</Badge>
                </div>
                <p className="text-caption text-slate-600 mt-0.5">
                  Estos clientes ya pagaron su anticipo. Seleccioná los que querés enviar a comprar ahora.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleTodosPendientes}
                  className="text-brand-700"
                >
                  <span>
                    {selectedPendientes.length === pendientes.length
                      ? 'Deseleccionar todos'
                      : 'Seleccionar todos'}
                  </span>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleAgregarSeleccionadosALista}
                  disabled={selectedPendientes.length === 0 || procesando}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>
                    Agregar seleccionados ({selectedPendientes.length})
                  </span>
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="divide-y divide-brand-100 bg-white">
              {pendientes.map((item) => {
                const isSelected = selectedPendientes.includes(item.item_id);
                const precioUsd = (item.precio_usa_usd_cents + item.tax_usa_usd_cents) / 100;
                const pesoLb = (item.peso_mlb / 1000).toFixed(1);

                return (
                  <div
                    key={item.item_id}
                    className={`p-3.5 flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                      isSelected ? 'bg-brand-50/60' : 'hover:bg-slate-50'
                    }`}
                    onClick={() => handleTogglePendiente(item.item_id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleTogglePendiente(item.item_id)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 rounded text-brand-600 border-slate-300 focus:ring-brand-500"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-slate-900 truncate">
                            {item.descripcion}
                          </span>
                          {item.tienda_nombre && (
                            <Badge tone="neutral">{item.tienda_nombre}</Badge>
                          )}
                          {item.categoria_nombre && (
                            <span className="text-caption text-slate-500">
                              · {item.categoria_nombre}
                            </span>
                          )}
                        </div>
                        <div className="text-caption text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>{item.cliente_nombre}</span>
                          <span>·</span>
                          <span className="font-mono">{item.pedido_codigo}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0 text-right">
                      <div>
                        <div className="font-semibold text-slate-900 tabular-nums">
                          ${precioUsd.toFixed(2)}
                        </div>
                        <div className="text-caption text-slate-500 tabular-nums">
                          {pesoLb} lb
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sección 2: Lista de Compras en USA (EN_LISTA_USA) */}
      <div className="space-y-4">
        <SectionHeader
          title="Productos para Comprar"
          description="Agrupados por tienda para facilitar tu jornada de compras."
          action={compras.length > 0 ? <Badge tone="neutral">{compras.length} ítems</Badge> : undefined}
        />

        {compras.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="Todavía no hay productos listos para comprar"
            description="Aparecen acá cuando un pedido tiene su anticipo verificado en el banco y los agregás a la lista."
          />
        ) : (
          comprasPorTienda.map((grupo) => (
            <Card key={grupo.tienda} className="shadow-sm overflow-hidden">
              <CardHeader className="bg-slate-100/80 border-b border-slate-200 py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Store className="w-4 h-4 text-slate-600" />
                    <h3 className="text-title text-slate-900 font-bold tracking-tight">
                      {grupo.tienda}
                    </h3>
                    <Badge tone="neutral">{grupo.cantidad} producto(s)</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-caption text-slate-700">
                    <span>
                      Subtotal:{' '}
                      <strong className="text-slate-900 tabular-nums">
                        ${(grupo.subtotalUsdCents / 100).toFixed(2)}
                      </strong>
                    </span>
                    <span>·</span>
                    <span>
                      Peso:{' '}
                      <strong className="text-slate-900 tabular-nums">
                        {grupo.subtotalPesoLbs} lb
                      </strong>
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {grupo.items.map((item) => {
                    const precioItem = item.precio_usa_usd_cents + item.tax_usa_usd_cents;
                    const pesoLb = (item.peso_mlb / 1000).toFixed(1);

                    return (
                      <div
                        key={item.item_id}
                        className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                      >
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 text-body">
                              {item.descripcion}
                            </span>
                            {item.categoria_nombre && (
                              <Badge tone="neutral">{item.categoria_nombre}</Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-caption text-slate-500 flex-wrap">
                            <span className="font-medium text-slate-700">{item.cliente_nombre}</span>
                            <span>·</span>
                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                              {item.pedido_codigo}
                            </span>
                            {item.notas_tolerancia && (
                              <>
                                <span>·</span>
                                <span className="text-amber-700 italic bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/50">
                                  Nota: {item.notas_tolerancia}
                                </span>
                              </>
                            )}
                          </div>

                          {item.url && (
                            <div className="pt-0.5">
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-caption text-brand-600 hover:text-brand-800 hover:underline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  window.open(item.url!, '_blank');
                                }}
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span className="truncate max-w-xs">{item.url}</span>
                              </a>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-6 shrink-0 justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                          <div className="text-right">
                            <div className="font-semibold text-slate-900 tabular-nums">
                              <Money cor_cents={0} usd_cents={precioItem} primary="USD" />
                            </div>
                            <div className="text-caption text-slate-500 tabular-nums">
                              {pesoLb} lb
                            </div>
                          </div>

                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => handleMarcarComprado(item)}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Marcar comprado</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
