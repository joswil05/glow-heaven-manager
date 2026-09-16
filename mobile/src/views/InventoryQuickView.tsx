import { useState, useMemo, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import type { ProductoConStock } from '@shared/types';
import { PullToRefresh } from '../components/PullToRefresh';
import { FichaProductoSheet } from '../components/FichaProductoSheet';
import { formatearMoneda } from '@core/moneda';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';
import { useScrollReveal } from '../lib/useScrollReveal';
import { useSnackbar } from '../components/Snackbar';
import { algunoContiene } from '@core/texto';
import { ComprasRepoFirestore } from '../../../src/main/firebase/repositories/compras.repo';

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
  const [fichaAbierta, setFichaAbierta] = useState<ProductoConStock | null>(null);
  /**
   * Mirar la bodega por paquete.
   *
   * El negocio funciona por tandas: se vende casi todo y llega un paquete
   * nuevo que renueva el inventario. Estando en el mostrador, "¿esto vino en
   * el último paquete?" es una pregunta de todos los días.
   */
  const [paqueteActivo, setPaqueteActivo] = useState<number | null>(null);
  const [paquetes, setPaquetes] = useState<{ id: number; codigo: string }[]>([]);

  // Los paquetes se leen una sola vez, y sólo si hay algún producto que venga
  // de uno: en una bodega cargada a mano esto no gasta ni una lectura.
  const hayProductosConPaquete = productos.some((p) => p.paquete_id);
  useEffect(() => {
    if (!hayProductosConPaquete || paquetes.length > 0) return;
    let vivo = true;
    ComprasRepoFirestore.listar()
      .then((lista) => {
        if (!vivo) return;
        // Los recibidos, más cualquiera al que un producto apunte: un
        // paquete anotado sólo con el flete sigue en borrador, pero su
        // mercadería ya está en la bodega.
        const referenciados = new Set(
          productos.map((p) => p.paquete_id).filter((id): id is number => Boolean(id))
        );
        setPaquetes(
          lista
            .filter((c) => c.estado === 'RECIBIDA' || referenciados.has(c.id))
            .map((c) => ({ id: c.id, codigo: c.codigo }))
        );
      })
      .catch(() => {
        /* sin paquetes, los chips no aparecen */
      });
    return () => {
      vivo = false;
    };
  }, [hayProductosConPaquete, paquetes.length, productos]);

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
      // Sin esto, tirar para refrescar no hace nada visible cuando falla: la
      // lista queda con los datos viejos y parece que ya está al día.
      mostrar('No se pudo actualizar el inventario.', 'error');
    }
  };

  // Filtrado reactivo por texto y categoría real (por id, no por nombre adivinado)
  const filtrados = useMemo(() => {
    let res = productos;
    if (busqueda.trim()) {
      res = res.filter(
        (p) =>
          algunoContiene([p.nombre, p.codigo], busqueda) ||
          p.variantes.some((v) => algunoContiene([v.color], busqueda))
      );
    }

    if (paqueteActivo !== null) {
      res = res.filter((p) => p.paquete_id === paqueteActivo);
    }

    if (categoriaActiva !== null) {
      res = res.filter((p) => p.categoria_id === categoriaActiva);
    }

    return res;
  }, [productos, busqueda, categoriaActiva, paqueteActivo]);

  const scrollRevealRef = useScrollReveal<HTMLElement>({ deps: [filtrados] });

  function abrirFicha(p: ProductoConStock) {
    haptics.selection();
    setFichaAbierta(p);
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-fondo text-texto transition-colors">
      {/* Top App Bar: mismo molde que el resto de la app (icono + kicker + título) */}
      <header className="shrink-0 z-20 bg-superficie/95 backdrop-blur-md border-b border-borde pt-safe-t px-4 pb-2 shadow-m3-1 transition-colors">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-superficie-2 text-texto-2 border border-borde">
              <Search size={18} />
            </span>
            <div className="min-w-0">
              <span className="text-caption font-bold tracking-widest uppercase text-texto-3 block leading-none mb-0.5">
                Glow Heaven
              </span>
              {/* "Catálogo" y no "Catálogo de Productos": el nav inferior ya
                  dice "Catálogo", y el título largo era justo lo que forzaba
                  el encabezado a partirse en 2 líneas y quedar más alto que
                  el resto de pantallas móviles. */}
              <h1 className="text-title font-extrabold text-texto leading-tight truncate">Catálogo</h1>
            </div>
          </div>
          {/* shrink-0 + whitespace-nowrap: esta píldora competía por espacio
              con el título largo de arriba y terminaba partiéndose en 2
              líneas también, doblando la altura del encabezado. */}
          <span className="shrink-0 whitespace-nowrap rounded-xl bg-superficie-2 text-texto-2 text-label font-bold px-3 py-1.5 border border-borde">
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
            }}
          >
            <Search size={17} className="text-texto-3" />
          </div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, código o tono…"
            className="w-full rounded-xl bg-superficie-2 text-xs font-medium text-texto placeholder:text-texto-3 outline-none focus:bg-superficie focus:ring-2 focus:ring-acento/30 transition-all border border-borde"
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
              className="absolute right-2.5 p-1 text-texto-3 hover:text-texto-2 rounded-full cursor-pointer"
              aria-label="Limpiar búsqueda"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Chips de categorías: las mismas categorías reales de Windows.
            El degradado a la derecha avisa que hay más chips fuera de
            vista en vez de cortarlos en seco contra el borde. */}
        {/* De qué paquete. Sólo aparece si hay más de uno: con un solo
            paquete el filtro no distingue nada y ocupa lugar en una pantalla
            que ya es chica. */}
        {paquetes.length > 1 && (
          <div className="relative mt-2">
            <div className="flex items-center gap-1.5 overflow-x-auto sin-scrollbar py-0.5 pr-6">
              <button
                type="button"
                onClick={() => {
                  haptics.selection();
                  setPaqueteActivo(null);
                }}
                className={`m3-press shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  paqueteActivo === null
                    ? 'bg-acento text-acento-texto shadow-sm'
                    : 'bg-superficie-2 text-texto-2 hover:bg-superficie-3 border border-borde'
                }`}
              >
                Todo
              </button>
              {paquetes.map((paq, i) => {
                const activo = paqueteActivo === paq.id;
                return (
                  <button
                    key={paq.id}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      setPaqueteActivo(paq.id);
                    }}
                    className={`m3-press shrink-0 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                      activo
                        ? 'bg-acento text-acento-texto shadow-sm'
                        : 'bg-superficie-2 text-texto-2 hover:bg-superficie-3 border border-borde'
                    }`}
                  >
                    {i === 0 ? 'Último paquete' : paq.codigo}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
                  ? 'bg-acento text-acento-texto shadow-sm'
                  : 'bg-superficie-2 text-texto-2 hover:bg-superficie-3 border border-borde'
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
                      ? 'bg-acento text-acento-texto shadow-sm'
                      : 'bg-superficie-2 text-texto-2 hover:bg-superficie-3 border border-borde'
                  }`}
                >
                  {cat.nombre}
                </button>
              );
            })}
          </div>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-superficie to-transparent" />
        </div>
      </header>

      {/* Lista de productos con Pull-to-Refresh */}
      <PullToRefresh onRefresh={refrescar}>
        <main ref={scrollRevealRef} className="flex flex-col gap-3 px-3.5 pt-3 pb-24 scroll-smooth">

          {cargando && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-texto-3">
              <div className="h-8 w-8 rounded-full border-2 border-acento border-t-transparent animate-spin" />
              <p className="text-xs font-medium">Sincronizando catálogo…</p>
            </div>
          )}

          {!cargando &&
            filtrados.map((p) => {
              const hayStock = p.existencias > 0;
              const stockBajo = p.existencias <= p.stock_minimo && hayStock;
              const precioCordobas = Math.round((p.precio_venta_usd_cents * tasa) / 100);

              return (
                /* La fila entera es el botón. Antes el único elemento tocable
                   era el ícono de WhatsApp: tocar el producto — el gesto más
                   obvio — no hacía nada, y ese ícono le cobraba 48px de ancho
                   a TODAS las filas para una acción que se usa de vez en
                   cuando. El catálogo se recorre entero decenas de veces al
                   día; manda el trabajo frecuente. */
                <button
                  key={p.id}
                  type="button"
                  onClick={() => abrirFicha(p)}
                  className="scroll-reveal flex w-full items-center gap-3 rounded-2xl border border-borde bg-superficie p-3.5 text-left shadow-xs active:scale-[0.99] transition-transform cursor-pointer"
                >
                  <div className="relative flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-borde bg-superficie-2">
                    {p.foto ? (
                      <img src={p.foto} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-sm font-extrabold uppercase text-texto-3">
                        {p.nombre.slice(0, 2)}
                      </span>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <h2 className="text-body font-extrabold leading-snug text-texto line-clamp-2">
                      {p.nombre}
                    </h2>

                    <div className="flex items-center gap-1.5 text-caption font-semibold text-texto-3">
                      <span className="shrink-0">#{p.codigo}</span>
                      {p.categoria_nombre && (
                        <>
                          <span className="shrink-0">·</span>
                          <span className="truncate">{p.categoria_nombre}</span>
                        </>
                      )}
                    </div>

                    {/* Los dos precios ya no compiten con una píldora con borde
                        por el mismo renglón: por eso el de córdobas salía
                        cortado ("C$366…"). El stock ahora pesa según urgencia
                        — texto plano cuando todo está bien, píldora solo
                        cuando hay que reaccionar. `tabular-nums` alinea las
                        cifras entre filas para poder escanearlas de un golpe. */}
                    <div className="mt-0.5 flex items-baseline justify-between gap-2">
                      <div className="flex min-w-0 items-baseline gap-1.5">
                        <span className="text-sm font-black tabular-nums text-texto">
                          {formatearMoneda(p.precio_venta_usd_cents, 'USD')}
                        </span>
                        <span className="whitespace-nowrap text-[11px] font-semibold tabular-nums text-texto-3">
                          {formatearMoneda(precioCordobas, 'COR')}
                        </span>
                      </div>

                      {!hayStock ? (
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-peligro-suave px-2 py-0.5 text-caption font-bold text-peligro-fuerte">
                          Agotado
                        </span>
                      ) : (
                        <span
                          className={`shrink-0 whitespace-nowrap text-caption font-bold tabular-nums ${
                            stockBajo ? 'text-alerta' : 'text-texto-3'
                          }`}
                        >
                          {p.existencias} disp.
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

          {!cargando && filtrados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-superficie-2 text-texto-3 mb-3">
                <Search size={24} />
              </div>
              <p className="text-sm font-bold text-texto-2">Sin productos encontrados</p>
              <p className="text-xs text-texto-3 mt-1 max-w-xs">
                No hay coincidencias para "{busqueda}" en la categoría "{nombreCategoriaActiva}".
              </p>
              <button
                type="button"
                onClick={() => {
                  setBusqueda('');
                  setCategoriaActiva(null);
                }}
                className="mt-3 rounded-full bg-superficie-2 hover:bg-superficie-3 px-4 py-1.5 text-xs font-bold text-texto-2 cursor-pointer"
              >
                Restablecer filtros
              </button>
            </div>
          )}
        </main>
      </PullToRefresh>

      <FichaProductoSheet
        producto={fichaAbierta}
        tasaCambioCents={tasa}
        onCerrar={() => setFichaAbierta(null)}
      />
    </div>
  );
}
