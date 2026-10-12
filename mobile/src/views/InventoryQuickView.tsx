import { useState, useMemo, useEffect } from 'react';
import { Search, X, Package, PackagePlus, Pencil } from 'lucide-react';
import type { ProductoConStock } from '@shared/types';
import { PullToRefresh } from '../components/PullToRefresh';
import { FichaProductoSheet } from '../components/FichaProductoSheet';
import { formatearMoneda } from '@core/moneda';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';
import { useSnackbar } from '../components/Snackbar';
import { algunoContiene } from '@core/texto';
import { ComprasRepoFirestore } from '../../../src/main/firebase/repositories/compras.repo';

type Filtro = { tipo: 'todos' } | { tipo: 'categoria'; id: number } | { tipo: 'paquete'; id: number };

export function InventoryQuickView({ onRegistrarPaquete, onCorregirPaquete }: {
  onRegistrarPaquete: () => void;
  /** Corregir un paquete que ya entró, como "Corregir" en la PC. */
  onCorregirPaquete?: (id: number) => void;
}) {
  const { parametros, categorias, productos, cargandoProductos, recargarProductos, version } = useDatosNegocio();

  const { mostrar } = useSnackbar();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>({ tipo: 'todos' });
  const [fichaId, setFichaId] = useState<number | null>(null);
  const fichaAbierta = productos.find(p => p.id === fichaId) ?? null;
  /**
   * Mirar la bodega por paquete.
   *
   * El negocio funciona por tandas: se vende casi todo y llega un paquete
   * nuevo que renueva el inventario. Estando en el mostrador, "¿esto vino en
   * el último paquete?" es una pregunta de todos los días.
   */
  const [paquetes, setPaquetes] = useState<{ id: number; codigo: string; recibido: boolean }[]>([]);

  // Volver a recibir un paquete invalida la lista. Un cambio de precio o de
  // stock no cambia por sí solo los paquetes a los que apunta el inventario.
  const idsPaquetes = [...new Set(productos.map(p => p.paquete_id).filter((id): id is number => Boolean(id)))].sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!idsPaquetes) { setPaquetes([]); return; }
    let vivo = true;
    const referenciados = new Set(idsPaquetes.split(',').map(Number));
    ComprasRepoFirestore.listar()
      .then((lista) => {
        if (!vivo) return;
        // Los recibidos, más cualquiera al que un producto apunte: un
        // paquete anotado sólo con el flete sigue en borrador, pero su
        // mercadería ya está en la bodega.
        setPaquetes(
          lista
            .filter((c) => c.estado === 'RECIBIDA' || referenciados.has(c.id))
            .map((c) => ({ id: c.id, codigo: c.codigo, recibido: c.estado === 'RECIBIDA' }))
        );
      })
      .catch(() => {
        if (vivo) mostrar('No se pudieron actualizar los paquetes.', 'error');
      });
    return () => {
      vivo = false;
    };
  }, [idsPaquetes, version, mostrar]);

  const tasa = parametros?.tasa_cambio_cents ?? 3662;
  const cargando = cargandoProductos && productos.length === 0;
  const nombreFiltro = filtro.tipo === 'categoria'
    ? `la categoría ${categorias.find(c => c.id === filtro.id)?.nombre ?? 'seleccionada'}`
    : filtro.tipo === 'paquete'
      ? `el paquete ${paquetes.find(p => p.id === filtro.id)?.codigo ?? 'seleccionado'}`
      : '';

  function restablecer() {
    haptics.selection();
    setFiltro({ tipo: 'todos' });
    setBusqueda('');
  }

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

    if (filtro.tipo === 'paquete') res = res.filter(p => p.paquete_id === filtro.id);
    if (filtro.tipo === 'categoria') res = res.filter(p => p.categoria_id === filtro.id);

    return res;
  }, [productos, busqueda, filtro]);

  // Fase C1: la lista abre con lo que hay a la venta. Lo que se vendió todo
  // no es una alerta: se ve aparte, al elegir un paquete o al buscar, para
  // saber que se vendió.
  const aLaVenta = filtrados.filter((p) => p.existencias > 0);
  const vendidos = filtrados.filter((p) => p.existencias <= 0);
  const verVendidos = filtro.tipo === 'paquete' || busqueda.trim() !== '';
  const quedaAlgoALaVenta = productos.some((p) => p.existencias > 0);
  const sinFiltros = !busqueda.trim() && filtro.tipo === 'todos';
  /** No hay ninguna fila que mostrar. */
  const listaVacia = aLaVenta.length === 0 && !(verVendidos && vendidos.length > 0);
  /** Vacía porque se vendió todo, no porque un filtro no encuentre nada. */
  const todoVendido = listaVacia && sinFiltros && productos.length > 0 && !quedaAlgoALaVenta;

  function abrirFicha(p: ProductoConStock) {
    haptics.selection();
    setFichaId(p.id);
  }

  /** Una fila del inventario: la fila entera abre la ficha. */
  function filaProducto(p: ProductoConStock) {
              const hayStock = p.existencias > 0;
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
                  className="flex w-full items-center gap-3 rounded-2xl border border-borde bg-superficie p-3.5 text-left shadow-xs cursor-pointer"
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
                      <span className="shrink-0">{p.codigo}</span>
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
                        <span className="shrink-0 whitespace-nowrap text-caption font-semibold text-texto-3">
                          Vendido
                        </span>
                      ) : (
                        <span className="shrink-0 whitespace-nowrap text-caption font-bold tabular-nums text-texto-3">
                          {p.existencias} en bodega
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-fondo text-texto transition-colors">
      {/* Top App Bar: mismo molde que el resto de la app (icono + kicker + título) */}
      <header className="shrink-0 z-20 bg-superficie/95 backdrop-blur-md border-b border-borde pt-safe-t px-4 pb-2 shadow-m3-1 transition-colors">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-superficie-2 text-texto-2 border border-borde">
              <Package size={18} />
            </span>
            <div className="min-w-0">
              <span className="text-caption font-bold tracking-widest uppercase text-texto-3 block leading-none mb-0.5">
                Glow Heaven
              </span>
              <h1 className="text-title font-extrabold text-texto leading-tight truncate">Inventario</h1>
            </div>
          </div>
          {/* shrink-0 + whitespace-nowrap: esta píldora competía por espacio
              con el título largo de arriba y terminaba partiéndose en 2
              líneas también, doblando la altura del encabezado. */}
          <span className="shrink-0 whitespace-nowrap rounded-xl bg-superficie-2 text-texto-2 text-label font-bold px-3 py-1.5 border border-borde">
            {/* Lo que hay a la venta, como la lista al abrir (Fase C1). */}
            {productos.filter((p) => p.existencias > 0).length} a la venta
          </span>
        </div>

        <button type="button" onClick={() => { haptics.selection(); onRegistrarPaquete(); }}
          className="mb-3 mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-acento px-4 py-3 text-base font-bold text-acento-texto">
          <PackagePlus size={20} />Llegó un paquete
        </button>

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
            placeholder="Buscar por nombre, código o tono"
            className="w-full rounded-xl bg-superficie-2 text-base font-medium text-texto placeholder:text-texto-3 outline-none focus:bg-superficie focus:ring-2 focus:ring-acento/30 border border-borde"
            style={{
              paddingLeft: '38px',
              paddingRight: '36px',
              height: '48px',
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

        <label className="mt-3 block text-base font-semibold text-texto-2">
          Filtrar inventario
          <select
            aria-label="Filtrar inventario"
            value={filtro.tipo === 'todos' ? 'todos' : `${filtro.tipo}:${filtro.id}`}
            onChange={e => {
              haptics.selection();
              const [tipo, id] = e.target.value.split(':');
              setFiltro(tipo === 'categoria' || tipo === 'paquete'
                ? { tipo, id: Number(id) } : { tipo: 'todos' });
            }}
            className="mt-1 min-h-12 w-full rounded-xl border border-borde bg-superficie-2 px-3 text-base text-texto"
          >
            <option value="todos">Todo el inventario</option>
            <optgroup label="Categorías">
              {categorias.map(cat => <option key={cat.id} value={`categoria:${cat.id}`}>{cat.nombre}</option>)}
            </optgroup>
            {paquetes.length > 0 && <optgroup label="Paquetes">
              {paquetes.map(paq => <option key={paq.id} value={`paquete:${paq.id}`}>{paq.codigo}</option>)}
            </optgroup>}
          </select>
        </label>
        {/* Un costo mal cargado se arregla corrigiendo el paquete, no la ficha. */}
        {filtro.tipo === 'paquete' && onCorregirPaquete && paquetes.some(paq => paq.id === filtro.id && paq.recibido) && (
          <button type="button" onClick={() => { haptics.selection(); onCorregirPaquete(filtro.id); }}
            className="mt-2 flex min-h-11 items-center gap-2 text-base font-semibold text-acento-fuerte">
            <Pencil size={18} />Corregir {paquetes.find(paq => paq.id === filtro.id)?.codigo}
          </button>
        )}
      </header>

      {/* Lista de productos con Pull-to-Refresh */}
      <PullToRefresh onRefresh={refrescar}>
        <main className="flex flex-col gap-3 px-3.5 pt-3 pb-24 scroll-smooth">

          {cargando && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-texto-3">
              <div className="h-8 w-8 rounded-full border-2 border-acento border-t-transparent animate-spin" />
              <p className="text-xs font-medium">Cargando…</p>
            </div>
          )}

          {!cargando && aLaVenta.map((p) => filaProducto(p))}

          {!cargando && verVendidos && vendidos.length > 0 && (
            <section aria-label="Vendidos" className="flex flex-col gap-2 pt-1">
              <h2 className="px-1 text-xs font-bold text-texto-3">Vendidos</h2>
              {vendidos.map((p) => filaProducto(p))}
            </section>
          )}

          {!cargando && todoVendido && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <p className="text-sm font-bold text-texto-2">No queda nada a la venta</p>
              <p className="text-xs text-texto-3 mt-1 max-w-xs">
                Se vendió todo lo que trajiste. Elegí un paquete arriba para ver lo que se vendió.
              </p>
            </div>
          )}

          {!cargando && listaVacia && !todoVendido && productos.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-superficie-2 text-texto-3 mb-3">
                <Search size={24} />
              </div>
              <p className="text-sm font-bold text-texto-2">Ningún producto coincide</p>
              <p className="text-xs text-texto-3 mt-1 max-w-xs">
                {busqueda.trim()
                  ? `No hay coincidencias para “${busqueda.trim()}”${nombreFiltro ? ` en ${nombreFiltro}` : ''}.`
                  : `No hay nada a la venta${nombreFiltro ? ` en ${nombreFiltro}` : ''}.`}
              </p>
              <button
                type="button"
                onClick={restablecer}
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
        onCerrar={() => setFichaId(null)}
      />
    </div>
  );
}
