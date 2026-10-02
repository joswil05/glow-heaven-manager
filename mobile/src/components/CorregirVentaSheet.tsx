import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Minus, Trash2, Loader2, CheckCircle2, User, AlertTriangle } from 'lucide-react';
import type { VentaCompleta, ClienteDetalle, ProductoConStock, ProductoVariante } from '@shared/types';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { ClientesRepoFirestore } from '@repos/clientes.repo';
import { formatearMoneda } from '@core/moneda';
import { algunoContiene } from '@core/texto';
import {
  abonoQueSigueAlTotal,
  abonoUnicoQuePagoTodo,
  monedaDeLosAbonos,
  textoLoPagado,
  textoPagado,
  textoTotalEn,
} from '@core/abonos';
import { useDatosNegocio } from '../context/DataContext';
import { useSnackbar } from './Snackbar';
import { BottomSheet } from './BottomSheet';
import { nuevoGrupoEvento } from '../lib/util';
import { haptics } from '../lib/haptics';

interface Linea {
  clave: string;
  producto_id?: number;
  variante_id?: number;
  descripcion: string;
  detalle?: string;
  cantidad: number;
  precio: number;
}

const etiquetaVariante = (v: Pick<ProductoVariante, 'talla' | 'color'>) =>
  [v.talla, v.color].filter(Boolean).join(' · ') || 'Único';

/**
 * Corregir una venta desde el celular: cantidades, quitar, agregar del
 * catálogo y la clienta. Mantiene el número de la venta. Los precios que ya
 * tenía se conservan; los productos que se agregan van al precio del catálogo.
 * El precio de una línea y el descuento se corrigen en la computadora.
 *
 * Existe porque sin esto la única salida a un producto equivocado era borrar
 * la venta desde la consola de Firebase, y eso dejaba mercadería vendida sin
 * venta que lo explicara.
 */
export function CorregirVentaSheet({
  ventaId,
  onCerrar,
}: {
  ventaId: number | null;
  onCerrar: () => void;
}) {
  const { productos, recargarProductos, marcarCambio } = useDatosNegocio();
  const { mostrar, mostrarDeshacer } = useSnackbar();

  const [venta, setVenta] = useState<VentaCompleta | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [clienta, setClienta] = useState<{ id?: number; nombre?: string }>({});
  const [buscandoClienta, setBuscandoClienta] = useState(false);
  const [consultaClienta, setConsultaClienta] = useState('');
  const [clientas, setClientas] = useState<ClienteDetalle[]>([]);
  const [agregando, setAgregando] = useState(false);
  const [consultaProducto, setConsultaProducto] = useState('');
  const [tonosDe, setTonosDe] = useState<ProductoConStock | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [ajustarAbono, setAjustarAbono] = useState(true);

  useEffect(() => {
    if (ventaId === null) return;
    let vivo = true;
    setVenta(null);
    setAjustarAbono(true);
    setBuscandoClienta(false);
    setAgregando(false);
    setTonosDe(null);
    VentasRepoFirestore.getById(ventaId)
      .then((v) => {
        if (!vivo || !v) return;
        setVenta(v);
        setClienta({ id: v.cliente_id ?? undefined, nombre: v.cliente_nombre });
        setLineas(
          v.lineas.map((l) => ({
            clave: `l${l.id}`,
            producto_id: l.producto_id,
            variante_id: l.variante_id,
            descripcion: l.producto_nombre ?? l.descripcion,
            detalle: l.talla || l.color ? [l.talla, l.color].filter(Boolean).join(' · ') : undefined,
            cantidad: l.cantidad,
            precio: l.precio_unitario_usd_cents,
          }))
        );
      })
      .catch(() => vivo && mostrar('No se pudo abrir la venta. Revisá la conexión.', 'error'));
    return () => {
      vivo = false;
    };
  }, [ventaId, mostrar]);

  // Lo que cambió desde que se abrió: cerrar con algo corregido pregunta.
  const firmaOriginal = useMemo(
    () =>
      venta
        ? JSON.stringify([
            venta.cliente_id ?? undefined,
            venta.lineas.map((l) => [l.producto_id, l.variante_id, l.cantidad, l.precio_unitario_usd_cents]),
            true,
          ])
        : '',
    [venta]
  );
  const hayCambios =
    venta !== null &&
    JSON.stringify([clienta.id, lineas.map((l) => [l.producto_id, l.variante_id, l.cantidad, l.precio]), ajustarAbono]) !==
      firmaOriginal;

  useEffect(() => {
    if (!buscandoClienta) return;
    let vivo = true;
    ClientesRepoFirestore.listar(consultaClienta.trim() || undefined)
      .then((lista) => vivo && setClientas(lista.slice(0, 20)))
      .catch(() => vivo && mostrar('No se pudo buscar. Revisá la conexión.', 'error'));
    return () => {
      vivo = false;
    };
  }, [buscandoClienta, consultaClienta, mostrar]);

  /** Lo de esta venta vuelve a la bodega antes de sacar lo corregido. */
  const disponibles = (p: ProductoConStock, v: ProductoVariante) =>
    v.existencias +
    (venta?.lineas ?? [])
      .filter((l) => l.producto_id === p.id && (l.variante_id ?? p.variantes[0]?.id) === v.id)
      .reduce((s, l) => s + l.cantidad, 0);

  const tope = (l: Linea) => {
    const p = l.producto_id ? productos.find((x) => x.id === l.producto_id) : undefined;
    const v = p ? (p.variantes.find((x) => x.id === l.variante_id) ?? p.variantes[0]) : undefined;
    if (!p || !v) return Infinity;
    const enOtras = lineas
      .filter((o) => o.clave !== l.clave && o.producto_id === l.producto_id && o.variante_id === l.variante_id)
      .reduce((s, o) => s + o.cantidad, 0);
    return disponibles(p, v) - enOtras;
  };

  const totales = useMemo(() => {
    const subtotal = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
    let descuento = 0;
    if (venta?.descuento_tipo === 'PORCENTAJE') descuento = Math.round((subtotal * (venta.descuento_valor ?? 0)) / 100);
    else if (venta?.descuento_tipo === 'MONTO_FIJO') descuento = Math.round((venta.descuento_valor ?? 0) * 100);
    descuento = Math.min(subtotal, Math.max(0, descuento));
    return { subtotal, descuento, total: subtotal - descuento };
  }, [lineas, venta]);

  const resultados = useMemo(() => {
    const conStock = productos.filter((p) => p.activo !== false && p.variantes.some((v) => disponibles(p, v) > 0));
    const q = consultaProducto.trim();
    return (q ? conStock.filter((p) => algunoContiene([p.nombre, p.codigo], q)) : conStock).slice(0, 12);
    // `disponibles` depende de `venta`, que ya está en la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productos, consultaProducto, venta]);

  function cambiarCantidad(clave: string, delta: number) {
    haptics.selection();
    setLineas((prev) =>
      prev.map((l) => (l.clave === clave ? { ...l, cantidad: Math.max(1, Math.min(l.cantidad + delta, tope(l))) } : l))
    );
  }

  function agregar(p: ProductoConStock, v: ProductoVariante) {
    haptics.impact('medium');
    const existente = lineas.find((l) => l.producto_id === p.id && l.variante_id === v.id);
    if (existente) {
      if (existente.cantidad >= tope(existente)) {
        mostrar(`Sólo hay ${disponibles(p, v)} de ${p.nombre}.`, 'info');
      } else {
        cambiarCantidad(existente.clave, 1);
      }
    } else {
      setLineas((prev) => [
        ...prev,
        {
          clave: `n${p.id}-${v.id}-${Date.now()}`,
          producto_id: p.id,
          variante_id: v.id,
          descripcion: p.nombre,
          detalle: p.variantes.length > 1 ? etiquetaVariante(v) : undefined,
          cantidad: 1,
          precio: p.precio_venta_usd_cents,
        },
      ]);
    }
    setTonosDe(null);
    setAgregando(false);
    setConsultaProducto('');
  }

  /** Al contado, pagada con un solo abono: el abono sigue al total, en su moneda. */
  const abonoContado = venta ? abonoUnicoQuePagoTodo(venta, venta.pagos) : null;
  const ajuste = venta && ajustarAbono ? abonoQueSigueAlTotal(venta, venta.pagos, totales.total) : null;
  const pagado = ajuste ? totales.total : (venta?.pagado_usd_cents ?? 0);
  const pasaDelTotal = pagado > totales.total;
  const moneda = venta ? monedaDeLosAbonos(venta.pagos) : 'USD';

  async function guardar() {
    if (!venta || lineas.length === 0 || guardando) return;
    setGuardando(true);
    try {
      const grupo = nuevoGrupoEvento();
      await VentasRepoFirestore.corregir(
        venta.id,
        {
          cliente_id: clienta.id,
          fecha: venta.fecha,
          notas: venta.notas,
          descuento_tipo: venta.descuento_tipo,
          descuento_valor: venta.descuento_valor,
          descuento_motivo: venta.descuento_motivo,
          ajustar_abono: abonoContado ? ajustarAbono : undefined,
          lineas: lineas.map((l) => ({
            producto_id: l.producto_id,
            variante_id: l.variante_id,
            descripcion: l.producto_id ? undefined : l.descripcion,
            cantidad: l.cantidad,
            precio_unitario_usd_cents: l.precio,
          })),
        },
        grupo
      );
      haptics.impact('medium');
      // Con Deshacer, como en Windows (CEL-03).
      mostrarDeshacer(`${venta.codigo} corregida`, grupo, () => {
        marcarCambio();
        void recargarProductos(true);
      });
      marcarCambio();
      void recargarProductos(true);
      onCerrar();
    } catch (err) {
      mostrar(err instanceof Error && err.message ? err.message : 'No se pudo corregir. Probá de nuevo.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <BottomSheet
      abierto={ventaId !== null}
      onCerrar={onCerrar}
      hayCambios={hayCambios}
      titulo={venta ? `Corregir ${venta.codigo}` : 'Corregir venta'}
      subtitulo="Queda con el mismo número"
      maxHeight="92vh"
      footer={
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-texto-3">Total</span>
            <div className="text-right tabular-nums">
              {venta && venta.total_usd_cents !== totales.total && (
                <span className="mr-2 text-xs font-semibold text-texto-3 line-through">
                  {formatearMoneda(venta.total_usd_cents, 'USD')}
                </span>
              )}
              <span className="text-xl font-extrabold text-texto">{formatearMoneda(totales.total, 'USD')}</span>
            </div>
          </div>
          {ajuste && (
            <p className="text-[11px] font-semibold leading-snug tabular-nums text-texto-2">
              El abono de {textoPagado(ajuste.pago)} queda en {textoPagado({ ...ajuste.pago, ...ajuste })}.
            </p>
          )}
          {pasaDelTotal && venta && (
            <p className="flex items-start gap-1.5 text-[11px] font-semibold leading-snug text-peligro">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              Pagó {textoLoPagado(venta.pagos)} y el nuevo total es{' '}
              {textoTotalEn(moneda, totales.total, venta.tasa_cambio_cents)}. Corregí el abono primero.
            </p>
          )}
          <button
            type="button"
            onClick={guardar}
            disabled={!venta || lineas.length === 0 || guardando || pasaDelTotal}
            className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento px-5 py-3.5 text-sm font-extrabold text-acento-texto shadow-lg shadow-m3-2 active:scale-[0.98] disabled:opacity-50 cursor-pointer"
          >
            {guardando ? <Loader2 size={19} className="animate-spin" /> : <CheckCircle2 size={19} />}
            <span>{guardando ? 'Guardando…' : 'Guardar corrección'}</span>
          </button>
        </div>
      }
    >
      {!venta ? (
        <div className="flex items-center justify-center py-12 text-texto-3">
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-2">
          {/* Productos */}
          <div className="flex flex-col gap-2">
            {lineas.map((l) => (
              <div key={l.clave} className="flex items-center gap-2.5 rounded-2xl border border-borde bg-superficie-2/80 p-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-bold text-texto">{l.descripcion}</p>
                  {l.detalle && <p className="text-caption font-semibold text-acento">{l.detalle}</p>}
                  <p className="text-label tabular-nums text-texto-3">{formatearMoneda(l.precio, 'USD')} c/u</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => cambiarCantidad(l.clave, -1)}
                    disabled={l.cantidad <= 1}
                    className="m3-press flex h-8 w-8 items-center justify-center rounded-xl border border-borde bg-superficie-3 text-texto-2 shadow-sm disabled:opacity-30 cursor-pointer"
                    aria-label={`Una menos de ${l.descripcion}`}
                  >
                    <Minus size={14} />
                  </button>
                  <span className="w-5 text-center text-xs font-bold tabular-nums text-texto">{l.cantidad}</span>
                  <button
                    type="button"
                    onClick={() => cambiarCantidad(l.clave, 1)}
                    disabled={l.cantidad >= tope(l)}
                    className="m3-press flex h-8 w-8 items-center justify-center rounded-xl border border-borde bg-superficie-3 text-texto-2 shadow-sm disabled:opacity-30 cursor-pointer"
                    aria-label={`Una más de ${l.descripcion}`}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      haptics.impact('light');
                      setLineas((prev) => prev.filter((x) => x.clave !== l.clave));
                    }}
                    disabled={lineas.length === 1}
                    className="m3-press flex h-8 w-8 items-center justify-center rounded-xl text-peligro hover:bg-peligro-suave disabled:opacity-30 cursor-pointer"
                    aria-label={`Quitar ${l.descripcion}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            {lineas.length === 1 && (
              <p className="text-[11px] text-texto-3">Para dejarla sin productos, cancelala desde Actividad.</p>
            )}
          </div>

          {/* Agregar del catálogo */}
          {agregando ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-borde p-2.5">
              <div className="relative flex items-center">
                <Search size={16} className="pointer-events-none absolute left-3 text-texto-3" />
                <input
                  autoFocus
                  value={consultaProducto}
                  onChange={(e) => setConsultaProducto(e.target.value)}
                  placeholder="Buscar producto o código"
                  className="h-10 w-full rounded-xl border border-borde bg-superficie-2 pl-9 pr-3 text-xs font-medium text-texto placeholder:text-texto-3 outline-none focus:ring-2 focus:ring-acento"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </div>
              {tonosDe ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-bold text-texto-2">{tonosDe.nombre}: elegí el tono</p>
                  {tonosDe.variantes.map((v) => {
                    const hay = disponibles(tonosDe, v);
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={hay <= 0}
                        onClick={() => agregar(tonosDe, v)}
                        className="m3-press flex items-center justify-between rounded-xl border border-borde bg-superficie px-3 py-2.5 text-left disabled:opacity-40 cursor-pointer"
                      >
                        <span className="text-xs font-bold text-texto">{etiquetaVariante(v)}</span>
                        <span className="text-[11px] text-texto-3">{hay > 0 ? `${hay} disponibles` : 'Agotado'}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="flex max-h-60 flex-col divide-y divide-borde overflow-y-auto">
                  {resultados.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => (p.variantes.length > 1 ? setTonosDe(p) : p.variantes[0] && agregar(p, p.variantes[0]))}
                      className="m3-press flex items-center justify-between gap-2 px-1 py-2.5 text-left cursor-pointer"
                    >
                      <span className="min-w-0 truncate text-xs font-bold text-texto">{p.nombre}</span>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-texto-2">
                        {formatearMoneda(p.precio_venta_usd_cents, 'USD')}
                      </span>
                    </button>
                  ))}
                  {resultados.length === 0 && (
                    <p className="py-4 text-center text-xs text-texto-3">Ningún producto con stock coincide.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAgregando(true)}
              className="m3-press flex items-center justify-center gap-2 rounded-2xl border border-dashed border-borde bg-superficie/80 p-3 text-xs font-bold text-texto-2 cursor-pointer"
            >
              <Plus size={15} />
              Agregar un producto
            </button>
          )}

          {/* Clienta */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-texto-2">Clienta</span>
            {buscandoClienta ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-borde p-2.5">
                <input
                  autoFocus
                  value={consultaClienta}
                  onChange={(e) => setConsultaClienta(e.target.value)}
                  placeholder="Buscar por nombre o teléfono"
                  className="h-10 w-full rounded-xl border border-borde bg-superficie-2 px-3 text-xs font-medium text-texto placeholder:text-texto-3 outline-none focus:ring-2 focus:ring-acento"
                />
                <div className="flex max-h-56 flex-col divide-y divide-borde overflow-y-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setClienta({});
                      setBuscandoClienta(false);
                    }}
                    className="m3-press px-1 py-2.5 text-left text-xs font-bold text-texto cursor-pointer"
                  >
                    Mostrador <span className="font-medium text-texto-3">· sin clienta</span>
                  </button>
                  {clientas.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setClienta({ id: c.id, nombre: c.nombre });
                        setBuscandoClienta(false);
                      }}
                      className="m3-press px-1 py-2.5 text-left cursor-pointer"
                    >
                      <p className="text-xs font-bold text-texto">{c.nombre}</p>
                      {c.telefono && <p className="text-[11px] text-texto-3">{c.telefono}</p>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setConsultaClienta('');
                  setBuscandoClienta(true);
                }}
                className="m3-press flex items-center justify-between rounded-2xl border border-borde bg-superficie-2 p-3 text-left cursor-pointer"
              >
                <span className="flex items-center gap-2 text-xs font-bold text-texto">
                  <User size={15} className="text-texto-3" />
                  {clienta.nombre ?? 'Mostrador'}
                </span>
                <span className="text-xs font-bold text-acento">Cambiar</span>
              </button>
            )}
          </div>

          {abonoContado ? (
            <label className="flex items-start gap-2.5 rounded-2xl border border-borde bg-superficie-2 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ajustarAbono}
                onChange={(e) => setAjustarAbono(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--acento))]"
              />
              <span className="text-[11px] leading-relaxed text-texto-2">
                <span className="block text-xs font-bold text-texto">
                  La pagó al contado: {textoPagado(abonoContado)}
                </span>
                Si el total cambia, el abono cambia con él, en la misma moneda y a la tasa de ese día.
              </span>
            </label>
          ) : (
            (venta?.pagado_usd_cents ?? 0) > 0 &&
            venta && (
              <p className="text-[11px] leading-relaxed text-texto-3">
                Pagó {textoLoPagado(venta.pagos)}. Los abonos no cambian acá: si un monto está mal, corregí el abono.
              </p>
            )
          )}
        </div>
      )}
    </BottomSheet>
  );
}
