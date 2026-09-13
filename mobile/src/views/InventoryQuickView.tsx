import { useState, useMemo } from 'react';
import { Search, MessageCircle, X } from 'lucide-react';
import type { ProductoConStock } from '@shared/types';
import { PullToRefresh } from '../components/PullToRefresh';
import { useSnackbar } from '../components/Snackbar';
import { formatearMoneda } from '@core/moneda';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';
import { useScrollReveal } from '../lib/useScrollReveal';

/** `null` representa "Todos". El resto son los `id` reales de `categorias`,
 * las mismas que la dueña administra en Windows > Configuración > Ganancia
 * por categoría — antes esta pantalla inventaba su propia lista de
 * categorías ("Labiales", "Bases y Polvos"...) adivinando por palabras
 * dentro del nombre del producto, así que nunca coincidía con lo real. */
export function InventoryQuickView() {
  const { parametros, categorias, productos, cargandoProductos, recargarProductos } = useDatosNegocio();
  const { mostrar } = useSnackbar();

  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null);

  const tasa = parametros?.tasa_cambio_cents ?? 3662;
  const cargando = cargandoProductos && productos.length === 0;
  const nombreCategoriaActiva = categoriaActiva === null
    ? 'Todos'
    : categorias.find((c) => c.id === categoriaActiva)?.nombre ?? 'esa categoría';

  const refrescar = async () => {
    try {
      await recargarProductos(true);
    } catch (err) {
      console.error('[InventoryQuickView] Error refrescando inventario:', err);
    }
  };

  // Filtrado reactivo por texto y categoría real (por id, no por nombre adivinado)
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

    if (categoriaActiva !== null) {
      res = res.filter((p) => p.categoria_id === categoriaActiva);
    }

    return res;
  }, [productos, busqueda, categoriaActiva]);

  const scrollRevealRef = useScrollReveal<HTMLElement>({ deps: [filtrados] });

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
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-[#f8fafc] dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 transition-colors">
      {/* Top App Bar: mismo molde que el resto de la app (icono + kicker + título) */}
      <header className="shrink-0 z-20 bg-white/95 dark:bg-[#121826]/95 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/80 pt-safe-t px-4 pb-2 shadow-[0_1px_3px_rgba(0,0,0,0.03)] dark:shadow-[0_1px_4px_rgba(0,0,0,0.3)] transition-colors">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/50">
              <Search size={18} />
            </span>
            <div className="min-w-0">
              <span className="text-caption font-bold tracking-widest uppercase text-emerald-700 dark:text-emerald-400 block leading-none mb-0.5">
                Glow Heaven
              </span>
              {/* "Catálogo" y no "Catálogo de Productos": el nav inferior ya
                  dice "Catálogo", y el título largo era justo lo que forzaba
                  el encabezado a partirse en 2 líneas y quedar más alto que
                  el resto de pantallas móviles. */}
              <h1 className="text-title font-extrabold text-slate-900 dark:text-white leading-tight truncate">Catálogo</h1>
            </div>
          </div>
          {/* shrink-0 + whitespace-nowrap: esta píldora competía por espacio
              con el título largo de arriba y terminaba partiéndose en 2
              líneas también, doblando la altura del encabezado. */}
          <span className="shrink-0 whitespace-nowrap rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-label font-bold px-3 py-1.5 border border-slate-200/60 dark:border-slate-700">
            {productos.length} {productos.length === 1 ? 'producto' : 'productos'}
          </span>
        </div>

        {/* Barra de búsqueda moderna */}
        <div className="relative flex items-center mt-1">
          <div
            style={{
              position: 'absolute',
              left: '12px',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              color: '#64748b',
            }}
          >
            <Search size={17} />
          </div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, código o tono…"
            className="w-full rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500/25 transition-all border border-slate-200/40 dark:border-slate-700"
            style={{
              paddingLeft: '38px',
              paddingRight: '36px',
              height: '40px',
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
              className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-full cursor-pointer"
              aria-label="Limpiar búsqueda"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Chips de categorías: las mismas categorías reales de Windows.
            El degradado a la derecha avisa que hay más chips fuera de
            vista en vez de cortarlos en seco contra el borde. */}
        <div className="relative mt-2">
          <div className="flex items-center gap-1.5 overflow-x-auto sin-scrollbar py-0.5 pr-6">
            <button
              type="button"
              onClick={() => {
                haptics.selection();
                setCategoriaActiva(null);
              }}
              className={`m3-press shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                categoriaActiva === null
                  ? 'bg-emerald-700 dark:bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-800 dark:ring-emerald-500'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700'
              }`}
            >
              Todos
            </button>
            {categorias.map((cat) => {
              const activa = categoriaActiva === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setCategoriaActiva(cat.id);
                  }}
                  className={`m3-press shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    activa
                      ? 'bg-emerald-700 dark:bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-800 dark:ring-emerald-500'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 border border-slate-200/60 dark:border-slate-700'
                  }`}
                >
                  {cat.nombre}
                </button>
              );
            })}
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white dark:from-[#121826] to-transparent" />
        </div>
      </header>

      {/* Lista de productos con Pull-to-Refresh */}
      <PullToRefresh onRefresh={refrescar}>
        <main ref={scrollRevealRef} className="flex flex-col gap-3 px-3.5 pt-3 pb-24 scroll-smooth">

          {cargando && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400 dark:text-slate-500">
              <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
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
                  className="scroll-reveal rounded-2xl bg-white dark:bg-[#161f30] border border-slate-200/80 dark:border-slate-800 p-3.5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col gap-2.5"
                >
                  <div className="flex gap-3 items-center">
                    {/* Foto o Placeholder */}
                    <div
                      className="shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 relative flex items-center justify-center"
                      style={{
                        width: '60px',
                        height: '60px',
                        minWidth: '60px',
                        minHeight: '60px',
                      }}
                    >
                      {p.foto ? (
                        <img
                          src={p.foto}
                          alt={p.nombre}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 font-extrabold text-sm uppercase">
                          {p.nombre.slice(0, 2)}
                        </div>
                      )}
                    </div>

                    {/* Información del Producto: el nombre ahora tiene toda
                        la fila para sí solo (antes competía por ancho con el
                        badge de stock y se cortaba a media palabra, ej.
                        "Calzones Calvin..."). Stock se movió junto al
                        precio, donde tiene más sentido leerlos juntos. */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <h2 className="text-body font-extrabold text-slate-900 dark:text-white leading-snug line-clamp-2">
                        {p.nombre}
                      </h2>

                      <div className="flex items-center gap-1.5 text-caption text-slate-400 dark:text-slate-500 font-semibold">
                        <span>#{p.codigo}</span>
                        {p.categoria_nombre && (
                          <>
                            <span>·</span>
                            <span className="truncate">{p.categoria_nombre}</span>
                          </>
                        )}
                      </div>

                      {/* Precios duales + stock, agrupados: son la misma
                          decisión de compra ("cuánto cuesta, cuánto hay") */}
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <span className="text-sm font-black text-emerald-800 dark:text-emerald-400 tabular-nums">
                            {formatearMoneda(p.precio_venta_usd_cents, 'USD')}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 tabular-nums truncate">
                            ≈ {formatearMoneda(precioCordobas, 'COR')}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-bold ${
                            !hayStock
                              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                              : stockBajo
                              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                              : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                          }`}
                        >
                          {!hayStock ? 'Agotado' : `${p.existencias} disp.`}
                        </span>
                      </div>
                    </div>

                    {/* Compartir por WhatsApp: ícono compacto en la misma
                        fila, no una fila propia */}
                    <button
                      type="button"
                      onClick={() => compartirPorWhatsApp(p)}
                      aria-label={`Compartir ${p.nombre} por WhatsApp`}
                      title="Compartir por WhatsApp"
                      className="m3-press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60 transition-colors cursor-pointer"
                    >
                      <MessageCircle size={16} />
                    </button>
                  </div>

                  {/* Tonos / Variantes disponibles */}
                  {p.tiene_variantes && p.variantes.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                      {p.variantes.map((v) => (
                        <span
                          key={v.id}
                          className={`rounded-md px-1.5 py-0.5 text-caption font-medium border ${
                            v.existencias > 0
                              ? 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              : 'bg-slate-100/50 dark:bg-slate-900/40 text-slate-400 dark:text-slate-500 border-dashed border-slate-200 dark:border-slate-800 line-through'
                          }`}
                        >
                          {[v.talla, v.color].filter(Boolean).join(' ') || 'Único'} ({v.existencias})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

          {!cargando && filtrados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 mb-3">
                <Search size={24} />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Sin productos encontrados</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                No hay coincidencias para "{busqueda}" en la categoría "{nombreCategoriaActiva}".
              </p>
              <button
                type="button"
                onClick={() => {
                  setBusqueda('');
                  setCategoriaActiva(null);
                }}
                className="mt-3 rounded-full bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 px-4 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer"
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
