import { useState, useMemo } from 'react';
import { Search, ImageOff, MessageCircle, Share2, X, Check, AlertCircle } from 'lucide-react';
import type { ProductoConStock } from '@shared/types';
import { MoneyDual } from '../components/MoneyDual';
import { PullToRefresh } from '../components/PullToRefresh';
import { useSnackbar } from '../components/Snackbar';
import { formatearMoneda } from '@core/moneda';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';

const CATEGORIAS_RAPIDAS = [
  'Todos',
  'Labiales',
  'Bases y Polvos',
  'Ojos y Cejas',
  'Skincare',
  'Rostro',
  'Accesorios',
];

export function InventoryQuickView() {
  const { parametros, productos, cargandoProductos, recargarProductos } = useDatosNegocio();
  const { mostrar } = useSnackbar();

  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('Todos');

  const tasa = parametros?.tasa_cambio_cents ?? 3662;
  const cargando = cargandoProductos && productos.length === 0;

  const refrescar = async () => {
    try {
      await recargarProductos(true);
    } catch (err) {
      console.error('[InventoryQuickView] Error refrescando inventario:', err);
    }
  };

  // Filtrado reactivo por texto y categoría
  const filtrados = useMemo(() => {
    let res = productos;
    const q = busqueda.trim().toLowerCase();

    if (q) {
      res = res.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q) ||
          p.variantes.some((v) => (v.color || '').toLowerCase().includes(q))
      );
    }

    if (categoriaActiva !== 'Todos') {
      const catNorm = categoriaActiva.toLowerCase();
      res = res.filter((p) => {
        const nombre = p.nombre.toLowerCase();
        const categoria = (p.categoria_nombre || '').toLowerCase();
        if (catNorm === 'labiales') return nombre.includes('labial') || nombre.includes('tint') || categoria.includes('labial');
        if (catNorm === 'bases y polvos') return nombre.includes('base') || nombre.includes('polvo') || nombre.includes('corrector');
        if (catNorm === 'ojos y cejas') return nombre.includes('mascara') || nombre.includes('sombra') || nombre.includes('ceja') || nombre.includes('delineador');
        if (catNorm === 'skincare') return nombre.includes('serum') || nombre.includes('crema') || nombre.includes('limpiador') || categoria.includes('skin');
        if (catNorm === 'rostro') return nombre.includes('rubor') || nombre.includes('blush') || nombre.includes('iluminador') || nombre.includes('primer');
        if (catNorm === 'accesorios') return nombre.includes('brocha') || nombre.includes('esponja') || nombre.includes('rizador');
        return categoria.includes(catNorm);
      });
    }

    return res;
  }, [productos, busqueda, categoriaActiva]);

  // Generar ficha para WhatsApp
  function compartirPorWhatsApp(p: ProductoConStock) {
    const precioCordobas = Math.round((p.precio_venta_usd_cents * tasa) / 100);
    const tonosTexto = p.variantes
      .filter((v) => v.existencias > 0)
      .map((v) => `${[v.talla, v.color].filter(Boolean).join(' ') || 'Único'} (${v.existencias} disp.)`)
      .join(', ');

    const texto = `*${p.nombre}* - Glow Heaven\n` +
      `Precio: ${formatearMoneda(precioCordobas, 'COR')} / ${formatearMoneda(p.precio_venta_usd_cents, 'USD')}\n` +
      (tonosTexto ? `Tonos disponibles: ${tonosTexto}\n` : `Existencias: ${p.existencias} unidades\n`) +
      `\nDisponible para entrega inmediata. Contáctanos para apartarlo.`;

    haptics.impact('medium');
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
    mostrar('Ficha generada para WhatsApp', 'success');
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#f8fafc] text-slate-800">
      {/* Top App Bar fija */}
      <header className="shrink-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/60 pt-safe-t px-3.5 pb-2 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between py-1">
          <div>
            <span className="text-[9px] font-bold tracking-widest uppercase text-emerald-700 block leading-none mb-0.5">
              Glow Heaven
            </span>
            <h1 className="text-sm font-extrabold text-slate-900 leading-tight">Catálogo de Productos</h1>
          </div>
          <span className="rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold px-2 py-0.5 border border-slate-200/60">
            {productos.length} {productos.length === 1 ? 'producto' : 'productos'}
          </span>
        </div>

        {/* Barra de búsqueda compacta */}
        <div className="relative flex items-center mt-0.5">
          <div
            style={{
              position: 'absolute',
              left: '10px',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              color: '#64748b',
            }}
          >
            <Search size={15} />
          </div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, código o tono…"
            className="w-full rounded-lg bg-slate-100 text-xs font-medium text-slate-900 placeholder:text-slate-400 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-500/25 transition-all border border-slate-200/40"
            style={{
              paddingLeft: '32px',
              paddingRight: '32px',
              height: '34px',
            }}
            autoComplete="off"
            enterKeyHint="search"
          />
          {busqueda && (
            <button
              type="button"
              onClick={() => {
                haptics.impact('light');
                setBusqueda('');
              }}
              className="absolute right-2 p-1 text-slate-400 hover:text-slate-600 rounded-full cursor-pointer"
              aria-label="Limpiar búsqueda"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Chips de Categorías Horizontales con estética refinada */}
        <div className="flex items-center gap-1 mt-1.5 overflow-x-auto sin-scrollbar py-0.5">
          {CATEGORIAS_RAPIDAS.map((cat) => {
            const activa = categoriaActiva === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  haptics.selection();
                  setCategoriaActiva(cat);
                }}
                className={`m3-press shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                  activa
                    ? 'bg-emerald-700 text-white shadow-xs ring-1 ring-emerald-800'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 border border-slate-200/60'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </header>

      {/* Lista de productos con Pull-to-Refresh */}
      <PullToRefresh onRefresh={refrescar}>
        <main className="flex flex-col gap-2 px-3 pt-2 pb-36">

          {cargando && (
            <div className="flex flex-col items-center justify-center py-12 gap-2.5 text-slate-400">
              <div className="h-7 w-7 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
              <p className="text-xs font-medium">Sincronizando catálogo…</p>
            </div>
          )}

          {!cargando &&
            filtrados.map((p) => {
              const hayStock = p.existencias > 0;
              const stockBajo = p.existencias <= p.stock_minimo && hayStock;
              const precioCordobas = Math.round((p.precio_venta_usd_cents * tasa) / 100);

              return (
                <div
                  key={p.id}
                  className="rounded-xl bg-white border border-slate-200/80 p-2.5 shadow-xs hover:border-slate-300 transition-all flex flex-col gap-2"
                >
                  <div className="flex gap-2.5 items-start">
                    {/* Foto o Placeholder Estético */}
                    <div
                      className="shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200/70 relative flex items-center justify-center"
                      style={{
                        width: '48px',
                        height: '48px',
                        minWidth: '48px',
                        minHeight: '48px',
                      }}
                    >
                      {p.foto ? (
                        <img
                          src={p.foto}
                          alt={p.nombre}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-emerald-50 via-slate-50 to-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs uppercase">
                          {p.nombre.slice(0, 2)}
                        </div>
                      )}
                    </div>

                    {/* Información del Producto */}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-1.5">
                        <h2 className="text-xs font-bold text-slate-900 leading-tight line-clamp-1">
                          {p.nombre}
                        </h2>
                        {/* Badge de Stock */}
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                            !hayStock
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : stockBajo
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {!hayStock ? 'Agotado' : `${p.existencias} disp.`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium mt-0.5">
                        <span>#{p.codigo}</span>
                        {p.categoria_nombre && (
                          <>
                            <span>·</span>
                            <span>{p.categoria_nombre}</span>
                          </>
                        )}
                      </div>

                      {/* Precios duales */}
                      <div className="mt-0.5 flex items-baseline gap-1">
                        <span className="text-xs font-black text-emerald-800 tabular-nums">
                          {formatearMoneda(p.precio_venta_usd_cents, 'USD')}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                          · {formatearMoneda(precioCordobas, 'COR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tonos / Variantes disponibles */}
                  {p.tiene_variantes && p.variantes.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-100">
                      {p.variantes.map((v) => (
                        <span
                          key={v.id}
                          className={`rounded px-1.5 py-0.2 text-[9px] font-medium border ${
                            v.existencias > 0
                              ? 'bg-slate-50 text-slate-700 border-slate-200'
                              : 'bg-slate-100/50 text-slate-400 border-dashed border-slate-200 line-through'
                          }`}
                        >
                          {[v.talla, v.color].filter(Boolean).join(' ') || 'Único'} ({v.existencias})
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Botón de Compartir por WhatsApp compacto y estilizado */}
                  <div className="flex justify-end pt-1 border-t border-slate-100/80">
                    <button
                      type="button"
                      onClick={() => compartirPorWhatsApp(p)}
                      className="m3-press flex items-center gap-1 h-7.5 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      <MessageCircle size={13} className="text-emerald-600" />
                      <span>Compartir por WhatsApp</span>
                    </button>
                  </div>
                </div>
              );
            })}

          {!cargando && filtrados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 mb-3">
                <Search size={24} />
              </div>
              <p className="text-sm font-bold text-slate-700">Sin productos encontrados</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs">
                No hay coincidencias para “{busqueda}” en la categoría “{categoriaActiva}”.
              </p>
              <button
                type="button"
                onClick={() => {
                  setBusqueda('');
                  setCategoriaActiva('Todos');
                }}
                className="mt-3 rounded-full bg-slate-200 px-4 py-1.5 text-xs font-bold text-slate-700"
              >
                Restablecer filtros
              </button>
            </div>
          )}
        </main>
      </PullToRefresh>
    </div>
  );
}
