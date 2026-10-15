import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  User,
  MessageCircle,
  CheckCircle2,
  X,
  Loader2,
  ShoppingCart,
  ChevronRight,
  Tag,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { EventosRepoFirestore } from '@repos/eventos.repo';
import { monedaPorDefecto, metodoPorDefecto } from '@core/preferencias';
import type {
  ProductoConStock,
  ProductoVariante,
  ClienteDetalle,
  MetodoPago,
  MonedaPago,
  VentaCompleta,
  TipoDescuento,
} from '@shared/types';
import type { CrearVentaInput } from '@shared/ipc-contracts';
import { formatearMoneda } from '@core/moneda';
import { codigoDeVenta } from '@core/codigos';
import { enlaceWhatsappDocumento } from '@core/documentos/mensajes';
import { parsearACentavos, parsearDecimal } from '@core/numeros';
import { nuevoGrupoEvento, hoyISO } from '../lib/util';
import { useDatosNegocio } from '../context/DataContext';
import { BottomSheet } from '../components/BottomSheet';
import { SeleccionarClientaSheet } from '../components/SeleccionarClientaSheet';
import { useSnackbar } from '../components/Snackbar';
import { haptics } from '../lib/haptics';
import { SIN_RED, useExigirConexion } from '../lib/useExigirConexion';
import { useConexion } from '../context/ConexionContext';
import { useCola, useProductosVisibles } from '../context/ColaContext';
import { conEspera, esErrorPasajero } from '../lib/subir-cola';
import type { ClientaNueva } from '../lib/cola';
import { algunoContiene } from '@core/texto';

export interface LineaCarrito {
  clave: string;
  producto: ProductoConStock;
  variante: ProductoVariante;
  cantidad: number;
}

function etiquetaVariante(v: ProductoVariante): string {
  return [v.talla, v.color].filter(Boolean).join(' · ') || 'Único';
}

export function QuickSaleView({ onAnotarPedido }: { onAnotarPedido?: () => void }) {
  const {
    parametros,
    categorias,
    cargandoProductos,
    actualizarStockLocal,
    marcarCambio,
    recargarProductos,
  } = useDatosNegocio();
  // Con lo que se llevaron las ventas hechas sin señal que todavía no
  // subieron (C4): esas unidades ya no están en la tienda.
  const todosProductos = useProductosVisibles();
  const { cola, encolar, quitar } = useCola();
  const { mostrar } = useSnackbar();
  const tasa = parametros?.tasa_cambio_cents ?? 3662;

  // --- Catálogo y Búsqueda ------------------------------------------------
  const [busqueda, setBusqueda] = useState('');
  // `null` = "Todos". El resto son los `id` reales de las categorías que la
  // dueña administra en Windows, las mismas que usa el Catálogo — antes cada
  // pantalla tenía su propia lista de categorías inventada.
  const [categoriaActiva, setCategoriaActiva] = useState<number | null>(null);
  const [productoConVariantesAbierto, setProductoConVariantesAbierto] = useState<ProductoConStock | null>(null);

  // Filtrar solo los productos con stock disponible en memoria
  const productos = useMemo(
    () => todosProductos.filter((p) => p.existencias > 0),
    [todosProductos]
  );

  // Filtrado reactivo de productos
  const productosFiltrados = useMemo(() => {
    let res = productos;
    if (busqueda.trim()) {
      res = res.filter(
        (p) =>
          algunoContiene([p.nombre, p.codigo], busqueda) ||
          p.variantes.some((v) => algunoContiene([v.color], busqueda))
      );
    }

    if (categoriaActiva !== null) {
      res = res.filter((p) => p.categoria_id === categoriaActiva);
    }

    return res;
  }, [productos, busqueda, categoriaActiva]);


  // --- Carrito -------------------------------------------------------------
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [sheetCarritoAbierto, setSheetCarritoAbierto] = useState(false);

  function agregarAlCarrito(producto: ProductoConStock, variante: ProductoVariante) {
    haptics.suave();
    const clave = `${producto.id}-${variante.id}`;
    setCarrito((prev) => {
      const existente = prev.find((l) => l.clave === clave);
      if (existente) {
        if (existente.cantidad >= variante.existencias) {
          haptics.warning();
          mostrar(`Solo hay ${variante.existencias} unidades disponibles`, 'info');
          return prev;
        }
        return prev.map((l) =>
          l.clave === clave ? { ...l, cantidad: l.cantidad + 1 } : l
        );
      }
      return [...prev, { clave, producto, variante, cantidad: 1 }];
    });
    setProductoConVariantesAbierto(null);
    mostrar(`Agregado: ${producto.nombre}`, 'success', 1800);
  }

  function cambiarCantidad(clave: string, delta: number) {
    haptics.selection();
    setCarrito((prev) =>
      prev
        .map((l) =>
          l.clave === clave
            ? { ...l, cantidad: Math.max(1, Math.min(l.cantidad + delta, l.variante.existencias)) }
            : l
        )
        .filter((l) => l.cantidad > 0)
    );
  }

  function quitarLinea(clave: string) {
    haptics.impact('light');
    setCarrito((prev) => prev.filter((l) => l.clave !== clave));
  }

  const cantidadTotalItems = useMemo(
    () => carrito.reduce((s, l) => s + l.cantidad, 0),
    [carrito]
  );

  const subtotalUsdCents = useMemo(
    () => carrito.reduce((s, l) => s + l.producto.precio_venta_usd_cents * l.cantidad, 0),
    [carrito]
  );

  // --- Descuento ---------------------------------------------------------------
  const [descTipo, setDescTipo] = useState<TipoDescuento>('PORCENTAJE');
  const [descValorTexto, setDescValorTexto] = useState('');

  const descuentoCents = useMemo(() => {
    if (!descValorTexto.trim()) return 0;
    if (descTipo === 'PORCENTAJE') {
      const v = parsearDecimal(descValorTexto, { min: 0, max: 100 }) ?? 0;
      return Math.round((subtotalUsdCents * v) / 100);
    }
    const valCents = parsearACentavos(descValorTexto, { min: 0 }) ?? 0;
    return Math.min(subtotalUsdCents, valCents);
  }, [subtotalUsdCents, descTipo, descValorTexto]);

  const totalUsdCents = Math.max(0, subtotalUsdCents - descuentoCents);

  const costoTotalCarrito = useMemo(
    () => carrito.reduce((s, l) => s + (l.producto.costo_unitario_usd_cents ?? 0) * l.cantidad, 0),
    [carrito]
  );
  const bajoCosto = totalUsdCents > 0 && totalUsdCents < costoTotalCarrito;

  // --- Clienta ---------------------------------------------------------------
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteDetalle | null>(null);
  /** Anotada sin señal: todavía no existe, se crea al subir la venta (C4). */
  const [clientaNueva, setClientaNueva] = useState<ClientaNueva | null>(null);
  const [sheetClienteAbierto, setSheetClienteAbierto] = useState(false);

  // --- Cobro -----------------------------------------------------------------
  const [esCredito, setEsCredito] = useState(false);
  // La moneda y el método que ella eligió en Configuración (CVE-07): arrancaban
  // fijos en córdobas y efectivo.
  const [metodo, setMetodo] = useState<MetodoPago>(() => metodoPorDefecto(parametros));
  const [moneda, setMoneda] = useState<MonedaPago>(() => monedaPorDefecto(parametros));
  const [montoAbonoTexto, setMontoAbonoTexto] = useState('');
  // Los parámetros llegan después del primer dibujo, o cambian en Ajustes.
  useEffect(() => {
    setMoneda(monedaPorDefecto(parametros));
    setMetodo(metodoPorDefecto(parametros));
  }, [parametros?.moneda_defecto_venta, parametros?.metodo_pago_defecto]);

  const totalEnMonedaElegida =
    moneda === 'COR' ? Math.round((totalUsdCents * tasa) / 100) : totalUsdCents;

  // --- Confirmar Venta -------------------------------------------------------
  const [guardandoVenta, setGuardandoVenta] = useState(false);
  /** Dos toques en el mismo instante no arman dos ventas (C4: cada una con su id). */
  const guardandoRef = useRef(false);
  const [ventaHecha, setVentaHecha] = useState<VentaCompleta | null>(null);
  /** Con qué se hizo la venta: deshacerla vuelve a esto (CEL-03). */
  const [vendida, setVendida] = useState<{
    grupo: string;
    carrito: LineaCarrito[];
    cliente: ClienteDetalle | null;
    clientaNueva: ClientaNueva | null;
    /** Quedó en la cola del teléfono, sin subir todavía (C4). */
    operacion_id?: string;
  } | null>(null);
  const [deshaciendo, setDeshaciendo] = useState(false);
  const exigirConexion = useExigirConexion();
  const { enLinea } = useConexion();

  async function confirmarVenta() {
    if (carrito.length === 0 || guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardandoVenta(true);

    try {
      const grupo = nuevoGrupoEvento();
      // El mismo en el intento con señal y en la cola: si la venta llegó y
      // sólo se perdió la respuesta, al subirla se encuentra su marca (C4).
      const operacion_id = nuevoGrupoEvento();
      const montoAbonoCents = esCredito ? parsearACentavos(montoAbonoTexto || '0', { min: 0 }) : null;
      if (esCredito && montoAbonoCents === null) {
        throw new Error('Escribí un monto válido, o dejalo en 0 si es fiado.');
      }

      const input: CrearVentaInput = {
        // Una clienta anotada sin señal todavía no tiene id: lo pone la cola.
        cliente_id: clientaNueva ? undefined : clienteSeleccionado?.id,
        fecha: hoyISO(),
        tipo: 'INVENTARIO',
        entregar_ahora: true,
        lineas: carrito.map((l) => ({
          producto_id: l.producto.id,
          variante_id: l.variante.id,
          cantidad: l.cantidad,
          precio_unitario_usd_cents: l.producto.precio_venta_usd_cents,
        })),
        descuento_tipo: descuentoCents > 0 ? descTipo : undefined,
        descuento_valor:
          descuentoCents > 0
            ? descTipo === 'PORCENTAJE'
              ? (parsearDecimal(descValorTexto, { min: 0, max: 100 }) ?? 0)
              : ((parsearACentavos(descValorTexto, { min: 0 }) ?? 0) / 100)
            : undefined,
        pago_inicial: {
          moneda,
          metodo,
          monto_cents: esCredito ? (montoAbonoCents ?? 0) : undefined,
        },
      };

      // Con señal se guarda ya. Sin señal, o si se cae en el medio, la venta
      // queda en el teléfono y se sube sola cuando vuelva (C4). Con una
      // clienta anotada sin señal va por la cola, que la crea primero.
      let ventaId: number | null = null;
      if (enLinea && !clientaNueva) {
        try {
          ventaId = await conEspera(VentasRepoFirestore.crear(input, grupo, operacion_id));
        } catch (err) {
          if (!esErrorPasajero(err)) throw err;
        }
      }

      if (ventaId === null) {
        encolar({
          operacion_id,
          grupo,
          // Con la tasa de ahora: es la que se le dijo a la clienta.
          operacion: {
            tipo: 'VENTA',
            input: { ...input, tasa_cambio_cents: tasa },
            clienta_nueva: clientaNueva ?? undefined,
          },
          resumen: {
            titulo: clienteSeleccionado?.nombre ?? 'Mostrador',
            detalle: carrito.map((l) => `${l.cantidad} × ${l.producto.nombre}`).join(', '),
            monto_usd_cents: totalUsdCents,
          },
        });
      } else {
        // Una venta cambia el panel, las cuentas por cobrar y el stock. Sin
        // este aviso, el Inicio seguia mostrando el total de ayer hasta
        // recargar la app entera.
        marcarCambio();
        actualizarStockLocal(
          carrito.map((l) => ({
            producto_id: l.producto.id,
            variante_id: l.variante.id,
            cantidad: l.cantidad,
          }))
        );
      }

      // Construir recibo en memoria al instante sin esperar las 4 lecturas de Firestore de getById
      const pagadoUsd = esCredito
        ? (moneda === 'COR' ? Math.round(((montoAbonoCents ?? 0) * 100) / tasa) : (montoAbonoCents ?? 0))
        : totalUsdCents;

      const costoTotal = carrito.reduce(
        (s, l) => s + (l.producto.costo_unitario_usd_cents ?? 0) * l.cantidad,
        0
      );

      const ventaInmediata: VentaCompleta = {
        // Sin subir todavía no tiene número: lo toma al subir (C4).
        id: ventaId ?? 0,
        // El mismo código que guarda el repositorio. Armado a mano daba
        // "V-24" donde el sistema dice "V-0024", y el recibo de WhatsApp
        // salía con un comprobante que no existe.
        codigo: ventaId === null ? '' : codigoDeVenta(ventaId),
        cliente_id: clienteSeleccionado?.id,
        cliente: clienteSeleccionado
          ? {
              id: clienteSeleccionado.id,
              nombre: clienteSeleccionado.nombre,
              telefono: clienteSeleccionado.telefono,
              activo: true,
            }
          : undefined,
        fecha: hoyISO(),
        tipo: 'INVENTARIO',
        estado: 'ENTREGADA',
        tasa_cambio_cents: tasa,
        total_usd_cents: totalUsdCents,
        costo_total_usd_cents: costoTotal,
        ganancia_usd_cents: Math.max(0, totalUsdCents - costoTotal),
        pagado_usd_cents: pagadoUsd,
        saldo_usd_cents: Math.max(0, totalUsdCents - pagadoUsd),
        anticipo_esperado_usd_cents: 0,
        descuento_tipo: descuentoCents > 0 ? descTipo : undefined,
        descuento_valor:
          descuentoCents > 0
            ? descTipo === 'PORCENTAJE'
              ? (parsearDecimal(descValorTexto, { min: 0, max: 100 }) ?? 0)
              : ((parsearACentavos(descValorTexto, { min: 0 }) ?? 0) / 100)
            : undefined,
        activo: true,
        lineas: carrito.map((l, idx) => ({
          id: idx + 1,
          venta_id: ventaId ?? 0,
          producto_id: l.producto.id,
          variante_id: l.variante.id,
          descripcion: `${l.producto.nombre}${l.variante.color ? ` - ${l.variante.color}` : ''}`,
          cantidad: l.cantidad,
          precio_unitario_usd_cents: l.producto.precio_venta_usd_cents,
          costo_unitario_usd_cents: l.producto.costo_unitario_usd_cents ?? 0,
          subtotal_usd_cents: l.producto.precio_venta_usd_cents * l.cantidad,
          costo_total_usd_cents: (l.producto.costo_unitario_usd_cents ?? 0) * l.cantidad,
          es_paquete: false,
          orden: idx,
          producto_nombre: l.producto.nombre,
          talla: l.variante.talla,
          color: l.variante.color,
        })),
        pagos: [],
        cuotas: [],
      };

      setVendida({
        grupo,
        carrito,
        cliente: clienteSeleccionado,
        clientaNueva,
        operacion_id: ventaId === null ? operacion_id : undefined,
      });
      setVentaHecha(ventaInmediata);
      setCarrito([]);
      setSheetCarritoAbierto(false);
      // La confirmación es la pantalla de "Venta registrada": el aviso de
      // arriba decía lo mismo otra vez.
    } catch (err: any) {
      console.error('[QuickSaleView] Error guardando venta:', err);
      mostrar(err?.message || 'No se pudo guardar la venta.', 'error');
    } finally {
      guardandoRef.current = false;
      setGuardandoVenta(false);
    }
  }

  function nuevaVenta() {
    setVentaHecha(null);
    setVendida(null);
    setClienteSeleccionado(null);
    setClientaNueva(null);
    setEsCredito(false);
    setMontoAbonoTexto('');
    setDescValorTexto('');
    setDescTipo('PORCENTAJE');
    setMoneda(monedaPorDefecto(parametros));
    setMetodo(metodoPorDefecto(parametros));
  }

  /**
   * Deshacer la venta recién hecha (CEL-03): vuelven las unidades y el cobro,
   * y el carrito queda como estaba, para corregirlo y volver a cobrar.
   */
  async function deshacerVenta() {
    if (!vendida || deshaciendo) return;

    // Sin subir todavía (C4): deshacerla es sacarla de la cola, sin señal.
    const enCola = vendida.operacion_id ? cola.find((o) => o.operacion_id === vendida.operacion_id) : undefined;
    if (enCola && enCola.estado !== 'SUBIDA') {
      haptics.impact('medium');
      if (!quitar(enCola.operacion_id)) {
        mostrar('Se está subiendo justo ahora. Probá de nuevo en un momento.', 'info');
        return;
      }
      setCarrito(vendida.carrito);
      setClienteSeleccionado(vendida.cliente);
      setClientaNueva(vendida.clientaNueva);
      setVentaHecha(null);
      setVendida(null);
      mostrar('Venta deshecha. El carrito quedó como estaba.', 'info');
      return;
    }

    if (!exigirConexion(SIN_RED.deshacer)) return;
    // La vibración antes de esperar: en iPhone sólo vibra dentro del toque.
    haptics.impact('medium');
    setDeshaciendo(true);
    try {
      const r = await EventosRepoFirestore.deshacerGrupo(vendida.grupo);
      if (!r.revertido) {
        mostrar(r.descripcion, 'error');
        return;
      }
      setCarrito(vendida.carrito);
      setClienteSeleccionado(vendida.cliente);
      setClientaNueva(vendida.clientaNueva);
      setVentaHecha(null);
      setVendida(null);
      marcarCambio();
      void recargarProductos(true);
      mostrar('Venta deshecha. El carrito quedó como estaba.', 'info');
    } catch (err: any) {
      mostrar(err?.message || 'No se pudo deshacer la venta.', 'error');
    } finally {
      setDeshaciendo(false);
    }
  }

  if (ventaHecha) {
    return (
      <PantallaExito
        venta={ventaHecha}
        pendiente={vendida?.operacion_id}
        onNuevaVenta={nuevaVenta}
        onDeshacer={vendida ? () => void deshacerVenta() : undefined}
        deshaciendo={deshaciendo}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-fondo text-texto transition-colors">
      {/* Top App Bar de Venta Rápida: mismo molde que el resto de la app */}
      <header className="shrink-0 z-20 bg-superficie/95 backdrop-blur-md border-b border-borde pt-safe-t px-4 pb-2 shadow-m3-1 transition-colors">
        <div className="flex items-center justify-between gap-2 py-1.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-superficie-2 text-texto-2 border border-borde">
              <ShoppingCart size={18} />
            </span>
            <div className="min-w-0">
              <span className="text-caption font-bold tracking-widest uppercase text-texto-3 block leading-none mb-0.5">
                Glow Heaven
              </span>
              <h1 className="text-title font-extrabold text-texto leading-tight truncate">Venta rápida</h1>
            </div>
          </div>
          {clienteSeleccionado ? (
            <button
              type="button"
              onClick={() => {
                haptics.impact('light');
                setSheetClienteAbierto(true);
              }}
              className="m3-press flex items-center gap-1.5 rounded-xl bg-superficie-2 border border-borde px-3 py-1.5 text-xs font-bold text-texto-2 active:scale-95 transition-transform cursor-pointer"
            >
              <User size={13} className="text-texto-3" />
              <span className="max-w-[110px] truncate">{clienteSeleccionado.nombre}</span>
              <ChevronRight size={12} className="text-texto-3" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                haptics.impact('light');
                setSheetClienteAbierto(true);
              }}
              className="m3-press flex items-center gap-1.5 rounded-xl bg-superficie-2 hover:bg-superficie-3 px-3 py-1.5 text-xs font-bold text-texto-2 border border-borde active:scale-95 transition-transform cursor-pointer"
            >
              <User size={13} className="text-texto-3" />
              <span>Mostrador</span>
              <ChevronRight size={12} className="text-texto-3" />
            </button>
          )}
        </div>

        {onAnotarPedido && (
          <button
            type="button"
            onClick={() => { haptics.selection(); onAnotarPedido(); }}
            className="tocable mt-1 flex min-h-11 w-full items-center justify-between rounded-xl border border-borde bg-superficie-2 px-3 text-sm font-semibold text-texto"
          >
            <span>Anotar un pedido</span>
            <ChevronRight size={16} className="text-texto-2" />
          </button>
        )}

        {/* Barra de búsqueda moderna */}
        <div className="relative flex items-center mt-1">
          <div
            style={{
              position: 'absolute',
              left: '12px',
              display: 'flex',
              alignItems: 'center',
              pointerEvents: 'none',
              color: 'rgb(var(--texto-3))',
            }}
          >
            <Search size={17} />
          </div>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto o código"
            className="w-full rounded-xl bg-superficie-2 text-xs font-medium text-texto placeholder:text-texto-3 outline-none focus:bg-superficie focus:ring-2 focus:ring-acento transition-all border border-borde"
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
                  ? 'bg-acento text-acento-texto shadow-sm ring-1 ring-acento'
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
                      ? 'bg-acento text-acento-texto shadow-sm ring-1 ring-acento'
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

      {/* Catálogo de Productos para Venta Rápida */}
      <main className="flex-1 min-h-0 overflow-y-auto px-3.5 pt-2.5 pb-40 scroll-smooth">
        {cargandoProductos && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-texto-3">
            <div className="h-8 w-8 rounded-full border-2 border-borde-fuerte border-t-transparent animate-spin" />
            <p className="text-xs font-medium">Cargando…</p>
          </div>
        )}

        {!cargandoProductos && (
          <div className="flex flex-col gap-2">
            {productosFiltrados.map((p) => {
              const precioCordobas = Math.round((p.precio_venta_usd_cents * tasa) / 100);
              const tieneVariantes = p.tiene_variantes && p.variantes.length > 1;
              const cantidadEnCarrito = carrito
                .filter((l) => l.producto.id === p.id)
                .reduce((s, l) => s + l.cantidad, 0);

              return (
                <div
                  key={p.id}
                  className="rounded-2xl bg-superficie border border-borde p-3 shadow-xs hover:border-borde transition-all flex items-center gap-3"
                >
                  {/* Miniatura */}
                  <div
                    className="shrink-0 overflow-hidden rounded-xl bg-superficie-2 border border-borde relative flex items-center justify-center"
                    style={{
                      width: '56px',
                      height: '56px',
                      minWidth: '56px',
                      minHeight: '56px',
                    }}
                  >
                    {p.foto ? (
                      <img
                        src={p.foto}
                        alt={p.nombre}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-superficie-2 flex items-center justify-center text-texto-3 font-black text-xs uppercase">
                        {p.nombre.slice(0, 2)}
                      </div>
                    )}
                  </div>

                  {/* Datos del Producto */}
                  <div className="min-w-0 flex-1">
                    <h2 className="text-body font-extrabold text-texto leading-snug line-clamp-1">
                      {p.nombre}
                    </h2>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <span className="text-label font-black text-texto tabular-nums">
                        {formatearMoneda(p.precio_venta_usd_cents, 'USD')}
                      </span>
                      <span className="text-caption font-semibold text-texto-3 tabular-nums">
                        · {formatearMoneda(precioCordobas, 'COR')}
                      </span>
                    </div>
                    <p className="text-caption text-texto-3 mt-0.5 font-medium flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-texto-3" />
                      <span>{p.existencias} en bodega {tieneVariantes ? `(${p.variantes.length} tonos)` : ''}</span>
                    </p>
                  </div>

                  {/* Botón de Agregar / Stepper de Cantidad Táctil */}
                  <div className="shrink-0">
                    {tieneVariantes ? (
                      <button
                        type="button"
                        onClick={() => {
                          haptics.impact('light');
                          setProductoConVariantesAbierto(p);
                        }}
                        className="m3-press flex items-center gap-1.5 rounded-xl bg-acento-suave hover:bg-acento-suave border border-acento-suave px-3 py-2 text-xs font-bold text-acento-fuerte active:scale-95 transition-all cursor-pointer"
                      >
                        <span>Tonos</span>
                        {cantidadEnCarrito > 0 && (
                          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-acento px-1 text-[10px] font-black text-acento-texto">
                            {cantidadEnCarrito}
                          </span>
                        )}
                        <ChevronRight size={13} />
                      </button>
                    ) : cantidadEnCarrito > 0 ? (
                      /* Stepper interactivo directamente en la tarjeta POS */
                      <div className="flex items-center rounded-xl bg-superficie-2 border border-borde p-0.5 shadow-xs">
                        <button
                          type="button"
                          onClick={() => {
                            const linea = carrito.find((l) => l.producto.id === p.id);
                            if (linea) {
                              if (linea.cantidad === 1) {
                                quitarLinea(linea.clave);
                              } else {
                                cambiarCantidad(linea.clave, -1);
                              }
                            }
                          }}
                          aria-label="Disminuir"
                          className="m3-press flex h-7 w-7 items-center justify-center rounded-lg bg-superficie text-texto-2 shadow-xs active:scale-90 cursor-pointer"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-6 text-center text-xs font-black text-texto tabular-nums">
                          {cantidadEnCarrito}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const v = p.variantes[0];
                            const linea = carrito.find((l) => l.producto.id === p.id);
                            if (linea && linea.cantidad < v.existencias) {
                              cambiarCantidad(linea.clave, 1);
                            }
                          }}
                          disabled={cantidadEnCarrito >= p.existencias}
                          aria-label="Aumentar"
                          className="m3-press flex h-7 w-7 items-center justify-center rounded-lg bg-acento text-acento-texto shadow-xs active:scale-90 disabled:opacity-40 cursor-pointer"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    ) : (
                      /* Botón + grande táctil para agregar primer item */
                      <button
                        type="button"
                        onClick={() => {
                          const v = p.variantes[0];
                          if (v) agregarAlCarrito(p, v);
                        }}
                        className="m3-press flex items-center justify-center text-acento-texto bg-acento hover:bg-acento shadow-sm rounded-xl active:scale-90 cursor-pointer"
                        style={{
                          width: '38px',
                          height: '38px',
                        }}
                        aria-label={`Agregar ${p.nombre}`}
                      >
                        <Plus size={18} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!cargandoProductos && productosFiltrados.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-superficie-2 text-texto-3 mb-2">
              <Search size={22} />
            </div>
            <p className="text-xs font-bold text-texto-2">Ningún producto coincide</p>
            <p className="text-[11px] text-texto-3 mt-0.5">Probá con otra palabra o categoría.</p>
          </div>
        )}
      </main>

      {/* Floating Bottom Cart Pill (Android M3 Floating Cart Bar) */}
      {carrito.length > 0 && (
        <div
          className="fixed inset-x-0 z-30 flex justify-center px-4 animate-m3-snackbar pointer-events-none"
          style={{ bottom: 'calc(4.75rem + max(env(safe-area-inset-bottom, 0px), 0.5rem))' }}
        >
          <div
            onClick={() => setSheetCarritoAbierto(true)}
            className="pointer-events-auto m3-press flex items-center justify-between gap-3 w-full max-w-md rounded-2xl bg-superficie-3 text-texto px-4 py-3.5 shadow-2xl shadow-m3-3 border border-borde cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-acento text-acento-texto font-bold">
                <ShoppingCart size={18} />
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-superficie text-texto px-0.5 text-[10px] font-black">
                  {cantidadTotalItems}
                </span>
              </div>
              <div>
                <span className="text-caption font-medium text-texto-3 leading-none">Total</span>
                <p className="text-base font-extrabold text-texto leading-tight">
                  {formatearMoneda(totalUsdCents, 'USD')}
                  <span className="text-xs text-acento ml-1.5 font-bold">
                    ≈ {formatearMoneda(Math.round((totalUsdCents * tasa) / 100), 'COR')}
                  </span>
                </p>
              </div>
            </div>

            {/* `text-acento-texto`, que es el texto que va ENCIMA del relleno.
                Con `text-texto` daba 1,68:1 en oscuro: el botón principal de
                la venta no se leía. */}
            <div className="flex items-center gap-1 rounded-xl bg-acento hover:bg-acento px-3.5 py-2 text-xs font-black text-acento-texto uppercase tracking-wide shadow-sm">
              <span>Cobrar</span>
              <ChevronRight size={16} />
            </div>
          </div>
        </div>
      )}

      {/* Modal Bottom Sheet: Selección de Tonos de Maquillaje */}
      <BottomSheet
        abierto={Boolean(productoConVariantesAbierto)}
        onCerrar={() => setProductoConVariantesAbierto(null)}
        titulo="Elegí el tono"
        subtitulo={productoConVariantesAbierto?.nombre}
      >
        <div className="flex flex-col gap-2.5 pb-4">
          {productoConVariantesAbierto?.variantes.map((v) => {
            const agotado = v.existencias <= 0;
            return (
              <button
                key={v.id}
                type="button"
                disabled={agotado}
                onClick={() => agregarAlCarrito(productoConVariantesAbierto, v)}
                className={`m3-press flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${
                  agotado
                    ? 'bg-superficie-2/50 border-borde opacity-40'
                    : 'bg-superficie border-borde hover:border-acento-suave hover:bg-acento-suave shadow-sm'
                }`}
              >
                <div>
                  <p className="text-sm font-bold text-texto">{etiquetaVariante(v)}</p>
                  <span className="text-xs text-texto-3 font-medium">
                    {agotado ? 'Agotado' : `${v.existencias} disponibles en tienda`}
                  </span>
                </div>
                {!agotado && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-acento-suave text-acento-fuerte">
                    <Plus size={16} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      {/* Modal Bottom Sheet: Carrito y Checkout de Venta */}
      <BottomSheet
        abierto={sheetCarritoAbierto}
        onCerrar={() => setSheetCarritoAbierto(false)}
        titulo="Carrito"
        subtitulo={`${cantidadTotalItems} ${cantidadTotalItems === 1 ? 'producto listo' : 'productos listos'} para cobrar`}
        maxHeight="92vh"
        footer={
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              {descuentoCents > 0 && (
                <div className="flex items-center justify-between text-[11px] text-texto-3">
                  <span>Subtotal</span>
                  <span>{formatearMoneda(subtotalUsdCents, 'USD')}</span>
                </div>
              )}
              {descuentoCents > 0 && (
                <div className="flex items-center justify-between text-[11px] font-semibold text-acento">
                  <span className="flex items-center gap-1"><Tag size={11} />Descuento ({descTipo === 'PORCENTAJE' ? `${descValorTexto}%` : `$${descValorTexto}`})</span>
                  <span>-{formatearMoneda(descuentoCents, 'USD')}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-texto-3">Total</span>
                <div className="text-right">
                  <p className="text-xl font-extrabold text-texto tabular-nums">
                    {formatearMoneda(totalEnMonedaElegida, moneda)}
                  </p>
                  {moneda === 'COR' && (
                    <p className="text-[11px] font-medium text-texto-3">
                      ≈ {formatearMoneda(totalUsdCents, 'USD')}
                    </p>
                  )}
                </div>
              </div>
              {bajoCosto && (
                <p className="text-[11px] font-bold text-peligro text-center">Por debajo del costo</p>
              )}
            </div>

            {!enLinea && (
              <p className="text-center text-[11px] font-medium text-texto-3">
                Sin señal: queda en el teléfono y se sube sola cuando vuelva.
              </p>
            )}
            <button
              type="button"
              onClick={confirmarVenta}
              disabled={guardandoVenta}
              className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento hover:bg-acento px-5 py-3.5 text-sm font-extrabold text-acento-texto shadow-lg shadow-m3-2 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
            >
              {guardandoVenta ? <Loader2 size={19} className="animate-spin" /> : <CheckCircle2 size={19} />}
              <span>{guardandoVenta ? 'Guardando…' : 'Registrar venta'}</span>
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 pb-2">
          {/* Lista de productos en carrito */}
          <div className="flex flex-col gap-2 max-h-56 overflow-y-auto pr-1">
            {carrito.map((l) => (
              <div
                key={l.clave}
                className="flex items-center gap-2.5 rounded-2xl bg-superficie-2/80 border border-borde p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-bold text-texto">{l.producto.nombre}</p>
                  {l.producto.tiene_variantes && (
                    <p className="text-caption text-acento font-semibold">{etiquetaVariante(l.variante)}</p>
                  )}
                  <p className="text-label text-texto-3 tabular-nums">
                    {formatearMoneda(l.producto.precio_venta_usd_cents, 'USD')} c/u
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => cambiarCantidad(l.clave, -1)}
                    className="m3-press flex h-8 w-8 items-center justify-center rounded-xl bg-superficie-3 border border-borde text-texto-2 shadow-sm cursor-pointer"
                    aria-label="Restar una unidad"
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-5 text-center text-xs font-bold text-texto tabular-nums">
                    {l.cantidad}
                  </span>
                  <button
                    type="button"
                    onClick={() => cambiarCantidad(l.clave, 1)}
                    disabled={l.cantidad >= l.variante.existencias}
                    className="m3-press flex h-8 w-8 items-center justify-center rounded-xl bg-superficie-3 border border-borde text-texto-2 shadow-sm disabled:opacity-30 cursor-pointer"
                    aria-label="Sumar una unidad"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => quitarLinea(l.clave)}
                    className="m3-press flex h-8 w-8 items-center justify-center rounded-xl text-peligro hover:bg-peligro-suave cursor-pointer"
                    aria-label="Quitar producto"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Clienta seleccionada */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-texto-2">Clienta</span>
            {clienteSeleccionado ? (
              <div className="flex items-center justify-between rounded-2xl bg-superficie-2 border border-borde p-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-acento">{clienteSeleccionado.nombre}</p>
                  {clienteSeleccionado.telefono && (
                    <p className="text-[11px] text-acento">{clienteSeleccionado.telefono}</p>
                  )}
                  {clientaNueva && (
                    <p className="text-[11px] font-semibold text-alerta-fuerte">Nueva · se guarda al subir la venta</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setClienteSeleccionado(null);
                    setClientaNueva(null);
                  }}
                  className="text-xs font-bold text-peligro hover:underline px-2 py-1 cursor-pointer"
                >
                  Cambiar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSheetClienteAbierto(true)}
                className="m3-press flex items-center justify-center gap-2 rounded-2xl border border-dashed border-borde bg-superficie/80 p-3 text-xs font-bold text-texto-2 hover:bg-superficie-3 cursor-pointer"
              >
                <User size={15} />
                <span>Mostrador · tocá para elegir clienta</span>
              </button>
            )}
          </div>

          {/* Panel de Descuento */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-texto-2 flex items-center gap-1">
                <Tag size={13} className="text-acento" />
                Descuento
              </span>
              {descuentoCents > 0 && (
                <button
                  type="button"
                  onClick={() => setDescValorTexto('')}
                  className="text-[11px] text-peligro font-semibold cursor-pointer"
                >
                  Quitar descuento
                </button>
              )}
            </div>
            {/* Píldoras rápidas */}
            <div className="flex flex-wrap gap-1.5">
              {([
                { l: '5%', t: 'PORCENTAJE', v: 5 },
                { l: '10%', t: 'PORCENTAJE', v: 10 },
                { l: '15%', t: 'PORCENTAJE', v: 15 },
                { l: '$2', t: 'MONTO_FIJO', v: 2 },
                { l: '$5', t: 'MONTO_FIJO', v: 5 },
                { l: '$10', t: 'MONTO_FIJO', v: 10 },
              ] as { l: string; t: TipoDescuento; v: number }[]).map((p) => {
                const activa = descTipo === p.t && (parsearDecimal(descValorTexto) ?? 0) === p.v;
                return (
                  <button
                    key={p.l}
                    type="button"
                    onClick={() => {
                      haptics.selection();
                      if (activa) {
                        setDescValorTexto('');
                      } else {
                        setDescTipo(p.t);
                        setDescValorTexto(String(p.v));
                      }
                    }}
                    className={`min-h-[36px] px-3.5 rounded-full text-xs font-bold border transition-all active:scale-95 cursor-pointer flex items-center justify-center ${
                      activa
                        ? 'bg-acento text-acento-texto border-acento-suave shadow-xs'
                        : 'bg-superficie text-texto-2 border-borde hover:border-acento-suave'
                    }`}
                  >
                    {p.l}
                  </button>
                );
              })}
            </div>
            {/* Controles manuales compactos */}
            <div className="flex gap-2">
              <select
                value={descTipo}
                onChange={(e) => setDescTipo(e.target.value as TipoDescuento)}
                className="h-10 rounded-xl border border-borde bg-superficie px-3 text-xs font-bold text-texto outline-none focus:ring-2 focus:ring-acento focus:border-acento-suave flex-1 transition-all"
              >
                <option value="PORCENTAJE">% Porcentaje</option>
                <option value="MONTO_FIJO">$ Monto fijo</option>
              </select>
              <input
                // Texto, no `type="number"`: el navegador convierte "1,500"
                // en "1.500" antes de que la aplicación lo vea, y eso se lee
                // como uno con medio. El parser de `@core/numeros` sí sabe
                // distinguir miles de decimales, pero necesita el texto crudo.
                // `inputMode` mantiene el teclado numérico en el celular.
                type="text"
                inputMode="decimal"
                value={descValorTexto}
                onChange={(e) => setDescValorTexto(e.target.value)}
                placeholder={descTipo === 'PORCENTAJE' ? 'Ej. 10%' : 'Ej. $5.00'}
                className="h-10 rounded-xl border border-borde bg-superficie px-3.5 text-xs font-extrabold text-texto placeholder:text-texto-3 outline-none focus:ring-2 focus:ring-acento focus:border-acento-suave flex-[2] transition-all"
              />
            </div>
          </div>

          {/* Opciones de Pago (Contado / Crédito) */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold text-texto-2">Pago</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setEsCredito(false)}
                className={`m3-press py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  !esCredito
                    ? 'bg-acento text-acento-texto border-acento-suave shadow-md shadow-m3-2'
                    : 'bg-superficie text-texto-2 border-borde'
                }`}
              >
                Contado (Pagado ya)
              </button>
              <button
                type="button"
                onClick={() => setEsCredito(true)}
                className={`m3-press py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  esCredito
                    ? 'bg-acento text-acento-texto border-acento-suave shadow-md shadow-m3-2'
                    : 'bg-superficie text-texto-2 border-borde'
                }`}
              >
                Crédito / Apartado
              </button>
            </div>

            {/* Selector de Moneda y Método sin emojis */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as MetodoPago)}
                className="h-10 rounded-xl border border-borde bg-superficie px-3 text-xs font-semibold text-texto outline-none"
              >
                <option value="EFECTIVO" className="bg-superficie-3">Efectivo</option>
                <option value="TRANSFERENCIA" className="bg-superficie-3">Transferencia</option>
                <option value="OTRO" className="bg-superficie-3">Otro método</option>
              </select>

              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value as MonedaPago)}
                className="h-10 rounded-xl border border-borde bg-superficie px-3 text-xs font-semibold text-texto outline-none"
              >
                <option value="COR" className="bg-superficie-3">C$ Córdobas</option>
                <option value="USD" className="bg-superficie-3">US$ Dólares</option>
              </select>
            </div>

            {/* Abono inicial en crédito */}
            {esCredito && (
              <div className="flex flex-col gap-1 mt-1 animate-m3-fade">
                <label className="text-xs font-bold text-texto-2">
                  Monto abonado hoy ({moneda === 'COR' ? 'C$' : 'US$'})
                </label>
                <input
                  // Texto, no `type="number"`: el navegador convierte "1,500"
                  // en "1.500" antes de que la aplicación lo vea, y eso se lee
                  // como uno con medio. El parser de `@core/numeros` sí sabe
                  // distinguir miles de decimales, pero necesita el texto crudo.
                  // `inputMode` mantiene el teclado numérico en el celular.
                  type="text"
                  inputMode="decimal"
                  value={montoAbonoTexto}
                  onChange={(e) => setMontoAbonoTexto(e.target.value)}
                  placeholder="0.00 (0 si es fiado)"
                  className="rounded-xl border border-borde bg-superficie px-3 py-2 text-sm font-bold text-texto placeholder:text-texto-3 outline-none focus:border-acento-suave"
                />
              </div>
            )}
          </div>
        </div>
      </BottomSheet>

      <SeleccionarClientaSheet
        abierto={sheetClienteAbierto}
        onCerrar={() => setSheetClienteAbierto(false)}
        onSeleccionar={(clienta, nueva) => {
          setClienteSeleccionado(clienta);
          setClientaNueva(nueva ?? null);
          setSheetClienteAbierto(false);
        }}
      />

    </div>
  );
}

function PantallaExito({
  venta,
  pendiente,
  onNuevaVenta,
  onDeshacer,
  deshaciendo,
}: {
  venta: VentaCompleta;
  /** La venta quedó en la cola del teléfono con este `operacion_id` (C4). */
  pendiente?: string;
  onNuevaVenta: () => void;
  onDeshacer?: () => void;
  deshaciendo?: boolean;
}) {
  const { parametros } = useDatosNegocio();
  const { cola } = useCola();

  // Hecha sin señal: toma su número cuando sube, sin tocar nada.
  const enCola = pendiente ? cola.find((o) => o.operacion_id === pendiente) : undefined;
  const subida = enCola?.estado === 'SUBIDA' ? enCola.resultado : undefined;
  const mostrada = subida?.venta_id
    ? { ...venta, id: subida.venta_id, codigo: subida.codigo ?? codigoDeVenta(subida.venta_id) }
    : venta;
  const paraRevisar = enCola?.estado === 'REVISAR' ? enCola.motivo ?? 'No se pudo guardar.' : undefined;

  const subtotalLineas = mostrada.lineas.reduce((s, l) => s + l.subtotal_usd_cents, 0);
  const tieneDescuento = Boolean(
    mostrada.descuento_valor && subtotalLineas > mostrada.total_usd_cents
  );
  // El mismo mensaje con que Windows manda la factura, con su plantilla de
  // Configuración (CVE-03). Antes era otro, armado acá, que decía "Pagado
  // $16.38" aunque hubiera pagado en córdobas. Sin teléfono (Mostrador), abre
  // WhatsApp para elegir el chat (CVE-04). Sin número todavía, sale sin esa
  // línea (C4).
  const link = enlaceWhatsappDocumento(mostrada, parametros);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-fondo px-6 pb-safe-b pt-safe-t text-center animate-m3-fade">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-acento-suave text-acento-fuerte shadow-xl shadow-m3-2 ring-8 ring-acento">
        <CheckCircle2 size={48} />
      </div>

      <div className="flex flex-col items-center">
        <h1 className="text-2xl font-black text-texto">Venta registrada</h1>
        {paraRevisar ? (
          <p key="revisar" className="mt-2 max-w-xs rounded-2xl bg-peligro-suave px-3 py-1.5 text-xs font-semibold text-peligro-fuerte animate-m3-fade">
            No se pudo subir: {paraRevisar}
          </p>
        ) : mostrada.codigo ? (
          <p key="numero" className={`text-xs font-medium text-texto-3 mt-0.5 ${pendiente ? 'animate-m3-fade' : ''}`}>
            Comprobante #{mostrada.codigo}
          </p>
        ) : (
          <p key="pendiente" className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-alerta-suave px-3 py-1 text-xs font-semibold text-alerta-fuerte">
            <Clock size={13} aria-hidden="true" />
            Pendiente de subir · sin número todavía
          </p>
        )}
      </div>

      {/* Recibo Tonal M3 */}
      <div className="w-full max-w-sm rounded-3xl bg-superficie border border-borde p-5 shadow-sm text-left">
        <div className="flex items-center justify-between pb-3 border-b border-borde">
          <span className="text-xs font-semibold text-texto-3">Clienta</span>
          <span className="text-xs font-bold text-texto">{venta.cliente?.nombre ?? 'Mostrador'}</span>
        </div>

        <div className="py-3 border-b border-borde flex flex-col gap-1 text-xs">
          {venta.lineas.map((l, idx) => (
            <div key={idx} className="flex justify-between text-texto-2">
              <span className="truncate pr-2">
                {l.cantidad} × {l.producto_nombre ?? l.descripcion}
              </span>
              <span className="font-bold tabular-nums">
                {formatearMoneda(l.subtotal_usd_cents, 'USD')}
              </span>
            </div>
          ))}
        </div>

        {tieneDescuento && (
          <div className="py-2.5 border-b border-borde flex flex-col gap-1 text-xs">
            <div className="flex justify-between text-texto-3">
              <span>Subtotal</span>
              <span className="tabular-nums font-semibold">{formatearMoneda(subtotalLineas, 'USD')}</span>
            </div>
            <div className="flex justify-between font-bold text-acento">
              <span className="flex items-center gap-1">
                <Tag size={12} />
                Descuento ({venta.descuento_tipo === 'PORCENTAJE' ? `${venta.descuento_valor}%` : `$${venta.descuento_valor}`})
              </span>
              <span className="tabular-nums">-{formatearMoneda(subtotalLineas - venta.total_usd_cents, 'USD')}</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-3">
          <span className="text-xs font-bold text-texto-2">
            {/* "Cobrado" sólo si se cobró entera: fiada, no (CVE-03). */}
            {tieneDescuento ? 'Total con descuento:' : venta.saldo_usd_cents > 0 ? 'Total de la venta:' : 'Total cobrado:'}
          </span>
          <span className="text-lg font-black text-acento tabular-nums">
            {formatearMoneda(venta.total_usd_cents, 'USD')}
          </span>
        </div>

        {venta.saldo_usd_cents > 0 && (
          <div className="mt-2 rounded-xl bg-alerta-suave border border-alerta-suave p-2.5 text-center text-xs font-bold text-alerta-fuerte">
            Saldo pendiente: {formatearMoneda(venta.saldo_usd_cents, 'USD')}
          </div>
        )}
      </div>

      <div className="flex flex-col w-full max-w-sm gap-2.5">
        <a
          href={link ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento hover:bg-acento px-5 py-3.5 text-sm font-bold text-acento-texto shadow-lg shadow-m3-2 active:scale-[0.98]"
        >
          <MessageCircle size={18} />
          Enviar recibo a WhatsApp
        </a>

        <button
          type="button"
          onClick={onNuevaVenta}
          className="m3-press tocable w-full rounded-2xl bg-superficie border border-borde px-5 py-3.5 text-sm font-bold text-texto-2 shadow-sm hover:bg-superficie-3"
        >
          Nueva venta rápida
        </button>

        {onDeshacer && (
          <button
            type="button"
            onClick={onDeshacer}
            disabled={deshaciendo}
            className="tocable flex w-full items-center justify-center gap-1.5 rounded-2xl px-5 py-2.5 text-sm font-semibold text-texto-3 active:scale-[0.98] transition-transform disabled:opacity-50"
          >
            {deshaciendo ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
            {deshaciendo ? 'Deshaciendo…' : 'Deshacer la venta'}
          </button>
        )}
      </div>
    </div>
  );
}
