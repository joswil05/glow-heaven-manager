import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  Search,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Package,
  User,
  UserPlus,
  CreditCard,
  FileCheck,
} from 'lucide-react';
import type {
  ProductoConStock,
  ClienteDetalle,
  ParametrosSistema,
  TipoVenta,
  MetodoPago,
  MonedaPago,
} from '../../../../shared/types';
import { Button, Field, Input, Select, Textarea, Badge, Money } from '../../components/ui';
import { parsearDecimal } from '@core/numeros';
import { formatearMoneda } from '@core/moneda';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/cn';

interface LineaBorrador {
  clave: string;
  producto_id?: number;
  variante_id?: number;
  descripcion: string;
  cantidad: string;
  precio: string;
  es_paquete: boolean;
  costo_estimado: string;
}

interface VentaEditorProps {
  abierto: boolean;
  tipo: TipoVenta;
  productos: ProductoConStock[];
  clientes: ClienteDetalle[];
  parametros: ParametrosSistema | null;
  onCerrar: () => void;
  onGuardado: () => Promise<void>;
}

const PASOS = [
  { id: 1, titulo: 'Productos', subtitulo: 'Selección y cantidades', icono: Package },
  { id: 2, titulo: 'Cliente y Cobro', subtitulo: 'Forma de pago y plazos', icono: CreditCard },
  { id: 3, titulo: 'Confirmación', subtitulo: 'Resumen y entrega', icono: FileCheck },
] as const;

const nuevaLinea = (): LineaBorrador => ({
  clave: `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  descripcion: '',
  cantidad: '1',
  precio: '',
  es_paquete: false,
  costo_estimado: '',
});

const num = (t: string): number => parsearDecimal(t) ?? 0;
const aCentavos = (t: string): number => Math.round(num(t) * 100);

export const VentaEditor: React.FC<VentaEditorProps> = ({
  abierto,
  tipo,
  productos,
  clientes,
  parametros,
  onCerrar,
  onGuardado,
}) => {
  const { showToast } = useToast();
  const esEncargo = tipo === 'ENCARGO';

  const [paso, setPaso] = useState<1 | 2 | 3>(1);
  const [listaClientes, setListaClientes] = useState<ClienteDetalle[]>(clientes);
  const [clienteId, setClienteId] = useState<number | undefined>(undefined);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [mostrarCrearCliente, setMostrarCrearCliente] = useState(false);
  const [nuevoNombreCliente, setNuevoNombreCliente] = useState('');
  const [nuevoTelefonoCliente, setNuevoTelefonoCliente] = useState('');
  const [nuevaDireccionCliente, setNuevaDireccionCliente] = useState('');
  const [guardandoCliente, setGuardandoCliente] = useState(false);

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [lineas, setLineas] = useState<LineaBorrador[]>([nuevaLinea()]);
  const [notas, setNotas] = useState('');
  const [entregarAhora, setEntregarAhora] = useState(true);
  const [anticipoTexto, setAnticipoTexto] = useState('50');
  const [formaCobro, setFormaCobro] = useState<'CONTADO' | 'CREDITO'>('CONTADO');
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('EFECTIVO');
  const [monedaPago, setMonedaPago] = useState<MonedaPago>('COR');
  const [referenciaPago, setReferenciaPago] = useState('');
  const [conCuotas, setConCuotas] = useState(false);
  const [cuotasCantidad, setCuotasCantidad] = useState('4');
  const [cuotasCada, setCuotasCada] = useState('15');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [lineaBuscando, setLineaBuscando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setListaClientes(clientes);
  }, [clientes]);

  useEffect(() => {
    if (!abierto) return;
    setPaso(1);
    setError(null);
    setClienteId(undefined);
    setBusquedaCliente('');
    setMostrarCrearCliente(false);
    setNuevoNombreCliente('');
    setNuevoTelefonoCliente('');
    setNuevaDireccionCliente('');
    setFecha(new Date().toISOString().slice(0, 10));
    const primera = nuevaLinea();
    setLineas([primera]);
    setLineaBuscando(esEncargo ? null : primera.clave);
    setNotas('');
    setEntregarAhora(true);
    setAnticipoTexto(String((parametros?.anticipo_defecto_bp ?? 5000) / 100));
    setFormaCobro('CONTADO');
    setMetodoPago('EFECTIVO');
    setMonedaPago('COR');
    setReferenciaPago('');
    setConCuotas(false);
    setCuotasCantidad('4');
    setCuotasCada('15');
    setBusquedaProducto('');
  }, [abierto, parametros, esEncargo]);

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lineaBuscando) setLineaBuscando(null);
        else onCerrar();
      }
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierto, onCerrar, lineaBuscando]);

  const totales = useMemo(() => {
    const total = lineas.reduce(
      (a, l) => a + aCentavos(l.precio) * Math.max(1, Math.round(num(l.cantidad))),
      0
    );
    const costo = lineas.reduce((a, l) => {
      const cantidad = Math.max(1, Math.round(num(l.cantidad)));
      if (l.producto_id && !esEncargo) {
        const p = productos.find((x) => x.id === l.producto_id);
        return a + (p?.costo_unitario_usd_cents ?? 0) * cantidad;
      }
      return a + aCentavos(l.costo_estimado) * cantidad;
    }, 0);
    return { total, costo, ganancia: total - costo };
  }, [lineas, productos, esEncargo]);

  const totalPrendas = useMemo(() => {
    return lineas.reduce((acc, l) => acc + Math.max(1, Math.round(num(l.cantidad))), 0);
  }, [lineas]);

  const clienteSeleccionado = useMemo(() => {
    if (!clienteId) return null;
    return listaClientes.find((c) => c.id === clienteId) ?? null;
  }, [clienteId, listaClientes]);

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    if (!q) return listaClientes.slice(0, 8);
    return listaClientes
      .filter(
        (c) =>
          c.nombre.toLowerCase().includes(q) ||
          (c.alias && c.alias.toLowerCase().includes(q)) ||
          (c.telefono && c.telefono.includes(q))
      )
      .slice(0, 8);
  }, [busquedaCliente, listaClientes]);

  const crearClienteRapido = async () => {
    if (!nuevoNombreCliente.trim()) {
      showToast({ message: 'El cliente necesita un nombre.', type: 'error' });
      return;
    }
    setGuardandoCliente(true);
    try {
      const r = await window.api.clientes.guardar({
        nombre: nuevoNombreCliente.trim(),
        telefono: nuevoTelefonoCliente.trim() || undefined,
        direccion: nuevaDireccionCliente.trim() || undefined,
      });
      if (!r.success) {
        showToast({ message: r.error, type: 'error' });
        return;
      }
      const nuevo: ClienteDetalle = {
        id: r.data.id,
        nombre: nuevoNombreCliente.trim(),
        telefono: nuevoTelefonoCliente.trim() || undefined,
        direccion: nuevaDireccionCliente.trim() || undefined,
        activo: true,
        compras_count: 0,
        total_comprado_usd_cents: 0,
        saldo_pendiente_usd_cents: 0,
        creado_en: new Date().toISOString(),
      };
      setListaClientes((prev) => [nuevo, ...prev]);
      setClienteId(r.data.id);
      setNuevoNombreCliente('');
      setNuevoTelefonoCliente('');
      setNuevaDireccionCliente('');
      setMostrarCrearCliente(false);
      setBusquedaCliente('');
      showToast({
        message: `Cliente "${nuevo.nombre}" guardado y asociado`,
        type: 'success',
      });
    } finally {
      setGuardandoCliente(false);
    }
  };

  const resultadosBusqueda = useMemo(() => {
    const q = busquedaProducto.trim().toLowerCase();
    const activos = productos.filter((p) => p.activo !== false);
    const base = esEncargo ? activos : activos.filter((p) => p.existencias > 0);
    if (!q) return base.slice(0, 8);
    return base
      .filter((p) => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
      .slice(0, 8);
  }, [busquedaProducto, productos, esEncargo]);

  if (!abierto) return null;

  const actualizarLinea = (clave: string, campo: keyof LineaBorrador, valor: unknown) =>
    setLineas((prev) => prev.map((l) => (l.clave === clave ? { ...l, [campo]: valor } : l)));

  const elegirProducto = (clave: string, p: ProductoConStock) => {
    setLineas((prev) =>
      prev.map((l) =>
        l.clave === clave
          ? {
              ...l,
              producto_id: p.id,
              variante_id: p.variantes.length === 1 ? p.variantes[0].id : undefined,
              descripcion: p.nombre,
              precio: (p.precio_venta_usd_cents / 100).toFixed(2),
            }
          : l
      )
    );
    setLineaBuscando(null);
    setBusquedaProducto('');
  };

  const agregarLinea = () => {
    const linea = nuevaLinea();
    setLineas((p) => [...p, linea]);
    if (!esEncargo) {
      setLineaBuscando(linea.clave);
      setBusquedaProducto('');
    }
  };

  const venderPaqueteCompleto = (clave: string) => {
    const linea = lineas.find((l) => l.clave === clave);
    if (!linea?.producto_id) return;
    const p = productos.find((x) => x.id === linea.producto_id);
    if (!p) return;

    const udsPaquete =
      p.unidades_por_paquete && p.unidades_por_paquete > 1
        ? p.unidades_por_paquete
        : p.existencias;

    setLineas((prev) =>
      prev.map((l) => {
        if (l.clave !== clave) return l;
        const nuevoEsPaquete = !l.es_paquete;
        return {
          ...l,
          cantidad: nuevoEsPaquete ? String(udsPaquete) : '1',
          es_paquete: nuevoEsPaquete,
        };
      })
    );
  };

  const validarPaso = (p: 1 | 2 | 3): boolean => {
    if (p === 1) {
      if (lineas.length === 0) {
        setError('Agregá al menos un producto a la venta.');
        return false;
      }
      const sinNombre = lineas.find((l) => !l.producto_id && !l.descripcion.trim());
      if (sinNombre) {
        setError('Cada línea necesita un producto del inventario o una descripción.');
        return false;
      }
      if (lineas.some((l) => aCentavos(l.precio) <= 0)) {
        setError('Poné el precio de venta de cada producto.');
        return false;
      }

      for (const l of lineas) {
        if (!l.producto_id || esEncargo) continue;
        const pProd = productos.find((x) => x.id === l.producto_id);
        if (pProd && pProd.variantes.length > 1 && !l.variante_id) {
          setError(`Elegí la talla o color de "${pProd.nombre}".`);
          return false;
        }
      }
    }

    if (p === 2) {
      if (esEncargo && !clienteId) {
        setError('Un encargo necesita un cliente asignado.');
        return false;
      }
    }

    setError(null);
    return true;
  };

  const irAPaso = (nuevoPaso: 1 | 2 | 3) => {
    if (nuevoPaso > paso) {
      if (!validarPaso(paso)) return;
    }
    setError(null);
    setPaso(nuevoPaso);
  };

  const siguientePaso = () => {
    if (!validarPaso(paso)) return;
    if (paso < 3) {
      setPaso((p) => (p + 1) as 1 | 2 | 3);
    }
  };

  const anteriorPaso = () => {
    setError(null);
    if (paso > 1) {
      setPaso((p) => (p - 1) as 1 | 2 | 3);
    }
  };

  const alPresionarEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;

    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
      e.preventDefault();
      const contenedor = e.currentTarget;
      const campos = Array.from(
        contenedor.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([type="checkbox"]):not([disabled]), select:not([disabled])'
        )
      ).filter((el) => el.offsetParent !== null);

      const idx = campos.indexOf(target);
      if (idx !== -1 && idx + 1 < campos.length) {
        const siguiente = campos[idx + 1];
        siguiente.focus();
        if (siguiente instanceof HTMLInputElement) {
          siguiente.select?.();
        }
      } else {
        if (paso < 3) {
          siguientePaso();
        } else {
          guardar();
        }
      }
    }
  };

  const guardar = async () => {
    if (!validarPaso(1) || !validarPaso(2)) {
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const r = await window.api.ventas.crear({
        cliente_id: clienteId,
        fecha,
        tipo,
        notas: notas.trim() || undefined,
        entregar_ahora: esEncargo ? false : entregarAhora,
        anticipo_bp: esEncargo ? Math.round(num(anticipoTexto) * 100) : undefined,
        plan_cuotas:
          !esEncargo && formaCobro === 'CREDITO' && conCuotas
            ? {
                cantidad: Math.max(2, Math.round(num(cuotasCantidad))),
                cada_dias: Math.max(1, Math.round(num(cuotasCada))),
              }
            : undefined,
        pago_inicial:
          !esEncargo && formaCobro === 'CONTADO'
            ? {
                moneda: monedaPago,
                metodo: metodoPago,
                referencia: referenciaPago.trim() || undefined,
              }
            : undefined,
        lineas: lineas.map((l) => ({
          producto_id: l.producto_id,
          variante_id: l.variante_id,
          descripcion: l.descripcion.trim() || undefined,
          cantidad: Math.max(1, Math.round(num(l.cantidad))),
          precio_unitario_usd_cents: aCentavos(l.precio),
          es_paquete: l.es_paquete,
          costo_estimado_unitario_usd_cents: esEncargo ? aCentavos(l.costo_estimado) : undefined,
        })),
      });

      if (!r.success) {
        setError(r.error);
        return;
      }

      showToast({
        message: esEncargo ? 'Encargo registrado con éxito' : 'Venta registrada con éxito',
        type: 'success',
      });
      await onGuardado();
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  const anticipoUsd = esEncargo
    ? Math.round((totales.total * num(anticipoTexto) * 100) / 10000)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-velo/40 backdrop-blur-xs p-4 cursor-pointer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-venta"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        onKeyDown={alPresionarEnter}
        onClick={(e) => e.stopPropagation()}
        className="bg-superficie rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-borde/80 animate-modal-pop cursor-default"
      >
        {/* Cabecera */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-borde shrink-0 bg-superficie">
          <div>
            <h3 id="titulo-venta" className="text-title text-texto font-semibold">
              {esEncargo ? 'Nuevo encargo' : 'Nueva venta'}
            </h3>
            <p className="text-caption text-texto-3">
              {esEncargo
                ? 'Cotizá lo que el cliente encargó y cobrá el anticipo.'
                : 'Vendé de tu inventario. Las existencias se descuentan automáticamente.'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar">
            <X className="w-4 h-4" />
          </Button>
        </header>

        {/* Stepper / Indicador de pasos */}
        <div className="px-6 py-3 border-b border-borde bg-superficie-2 shrink-0">
          <div className="flex items-center justify-between max-w-xl mx-auto">
            {PASOS.map((p, idx) => {
              const activo = paso === p.id;
              const completado = paso > p.id;
              return (
                <React.Fragment key={p.id}>
                  <button
                    type="button"
                    onClick={() => irAPaso(p.id)}
                    className={cn(
                      'flex items-center gap-2.5 text-left transition-colors group focus-visible:outline-none',
                      activo && 'text-acento-fuerte',
                      completado && 'text-texto hover:text-acento',
                      !activo && !completado && 'text-texto-3 cursor-not-allowed'
                    )}
                  >
                    <span
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-caption font-semibold shrink-0 transition-colors',
                        activo && 'bg-acento text-superficie shadow-sm',
                        completado && 'bg-acento-suave text-acento-fuerte',
                        !activo && !completado && 'bg-borde text-texto-3'
                      )}
                    >
                      {completado ? '✓' : p.id}
                    </span>
                    <div className="hidden sm:block">
                      <div className="text-caption font-semibold leading-tight flex items-center gap-1">
                        <span>{p.titulo}</span>
                      </div>
                      <div className="text-caption text-texto-3 text-[11px] leading-tight">
                        {p.subtitulo}
                      </div>
                    </div>
                  </button>
                  {idx < PASOS.length - 1 && (
                    <div
                      className={cn(
                        'flex-1 h-0.5 mx-3 transition-colors',
                        paso > p.id ? 'bg-acento' : 'bg-borde'
                      )}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Cuerpo del formulario con Scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3">
              <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-label text-danger-800">{error}</p>
            </div>
          )}

          {/* ========================================================= */}
          {/* PASO 1: PRODUCTOS */}
          {/* ========================================================= */}
          {paso === 1 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-label font-semibold text-texto">
                    {esEncargo ? 'Prendas a cotizar' : '¿Qué prendas lleva el cliente?'}
                  </h4>
                  <p className="text-caption text-texto-3">
                    Buscá en tu inventario o ingresá la descripción.
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={agregarLinea}>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar otro</span>
                </Button>
              </div>

              <div className="space-y-3">
                {lineas.map((l, i) => {
                  const producto = l.producto_id
                    ? productos.find((p) => p.id === l.producto_id)
                    : undefined;
                  const cantidad = Math.max(1, Math.round(num(l.cantidad)));
                  const excedeStock =
                    producto && !esEncargo && cantidad > producto.existencias;

                  return (
                    <div
                      key={l.clave}
                      className="rounded-xl border border-borde bg-superficie-2/70 p-3.5 space-y-3 shadow-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-superficie border border-borde flex items-center justify-center text-caption font-semibold text-texto-3 shrink-0">
                          {i + 1}
                        </span>

                        {producto ? (
                          <div className="flex-1 flex items-center justify-between gap-3 min-w-0 bg-superficie px-3 py-2 rounded-lg border border-borde">
                            <div className="min-w-0 flex-1">
                              <div className="text-body font-medium text-texto truncate">
                                {producto.nombre}
                              </div>
                              <div className="text-caption text-texto-3">
                                Stock: {producto.existencias} disponibles · Costo unitario:{' '}
                                {formatearMoneda(producto.costo_unitario_usd_cents, 'USD')}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                actualizarLinea(l.clave, 'producto_id', undefined);
                                actualizarLinea(l.clave, 'variante_id', undefined);
                                actualizarLinea(l.clave, 'descripcion', '');
                              }}
                            >
                              Cambiar
                            </Button>
                          </div>
                        ) : lineaBuscando === l.clave ? (
                          <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-texto-3 pointer-events-none" />
                            <Input
                              autoFocus
                              value={busquedaProducto}
                              onChange={(e) => setBusquedaProducto(e.target.value)}
                              placeholder="Escribe el nombre o código del producto..."
                              className="pl-9"
                            />
                            <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-borde bg-superficie shadow-xl">
                              {resultadosBusqueda.length > 0 ? (
                                resultadosBusqueda.map((p) => (
                                  <li key={p.id}>
                                    <button
                                      type="button"
                                      onClick={() => elegirProducto(l.clave, p)}
                                      className="w-full text-left px-3 py-2.5 hover:bg-superficie-2 focus-visible:outline-none focus-visible:bg-superficie-2 flex items-center justify-between gap-2 border-b border-borde/40 last:border-b-0"
                                    >
                                      <div>
                                        <span className="text-body text-texto font-medium block">
                                          {p.nombre}
                                        </span>
                                        <span className="text-caption text-texto-3">
                                          {p.codigo}
                                        </span>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <div className="text-caption font-semibold text-texto tabular">
                                          {formatearMoneda(p.precio_venta_usd_cents, 'USD')}
                                        </div>
                                        <div className="text-caption text-texto-3">
                                          {p.existencias} en stock
                                        </div>
                                      </div>
                                    </button>
                                  </li>
                                ))
                              ) : (
                                <li className="px-3 py-3 text-label text-texto-3">
                                  No hay productos que coincidan con la búsqueda.
                                </li>
                              )}
                              <li className="border-t border-borde bg-superficie-2">
                                <button
                                  type="button"
                                  onClick={() => setLineaBuscando(null)}
                                  className="w-full text-left px-3 py-2 text-label text-texto-2 hover:text-acento focus-visible:outline-none"
                                >
                                  ✎ Escribir nombre a mano (sin vincular inventario)
                                </button>
                              </li>
                            </ul>
                          </div>
                        ) : (
                          <div className="flex-1 flex gap-2">
                            <Input
                              value={l.descripcion}
                              onChange={(e) =>
                                actualizarLinea(l.clave, 'descripcion', e.target.value)
                              }
                              placeholder={
                                esEncargo ? 'Ej. Vestido floral pedido por cliente' : 'Producto sin registrar en inventario'
                              }
                              className="flex-1"
                            />
                            <Button
                              size="sm"
                              variant={esEncargo ? 'ghost' : 'secondary'}
                              onClick={() => {
                                setLineaBuscando(l.clave);
                                setBusquedaProducto('');
                              }}
                              className="shrink-0"
                            >
                              <Search className="w-3.5 h-3.5" />
                              <span>Buscar en inventario</span>
                            </Button>
                          </div>
                        )}

                        {lineas.length > 1 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setLineas((p) => p.filter((x) => x.clave !== l.clave))}
                            aria-label={`Quitar prenda ${i + 1}`}
                            className="text-texto-3 hover:text-danger-700 shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>

                      {/* Variantes, Cantidad, Precio y Subtotal */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                        {producto && producto.variantes.length > 1 && !esEncargo ? (
                          <Field label="Talla / Color">
                            <Select
                              value={l.variante_id ?? ''}
                              onChange={(e) =>
                                actualizarLinea(
                                  l.clave,
                                  'variante_id',
                                  e.target.value ? Number(e.target.value) : undefined
                                )
                              }
                            >
                              <option value="">Seleccionar talla</option>
                              {producto.variantes.map((v) => (
                                <option key={v.id} value={v.id} disabled={v.existencias === 0}>
                                  {[v.talla, v.color].filter(Boolean).join(' · ') || 'Única'} (
                                  {v.existencias} disp.)
                                </option>
                              ))}
                            </Select>
                          </Field>
                        ) : (
                          <div className="hidden sm:block" />
                        )}

                        <Field label="Cantidad" error={excedeStock ? 'Excede existencias' : undefined}>
                          <Input
                            type="number"
                            min="1"
                            value={l.cantidad}
                            onChange={(e) => actualizarLinea(l.clave, 'cantidad', e.target.value)}
                            className="text-right font-medium"
                          />
                        </Field>

                        <Field label="Precio unitario ($)">
                          <Input
                            value={l.precio}
                            onChange={(e) => actualizarLinea(l.clave, 'precio', e.target.value)}
                            placeholder="0.00"
                            className="text-right font-medium"
                          />
                        </Field>

                        {esEncargo ? (
                          <Field label="Costo est. ($)" hint="Lo que te costará">
                            <Input
                              value={l.costo_estimado}
                              onChange={(e) =>
                                actualizarLinea(l.clave, 'costo_estimado', e.target.value)
                              }
                              placeholder="0.00"
                              className="text-right"
                            />
                          </Field>
                        ) : (
                          <div className="flex items-end justify-end pb-2">
                            <div className="text-right">
                              <span className="text-caption text-texto-3 block">Subtotal</span>
                              <span className="text-body font-bold text-texto tabular">
                                {formatearMoneda(aCentavos(l.precio) * cantidad, 'USD')}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Botón rápido para vender paquete completo */}
                      {producto &&
                        (producto.unidades_por_paquete
                          ? producto.existencias >= producto.unidades_por_paquete
                          : producto.existencias > 1) &&
                        !esEncargo && (
                          <label className="flex items-center gap-2 cursor-pointer pt-1 px-1 text-caption text-texto-2 hover:text-texto">
                            <input
                              type="checkbox"
                              checked={l.es_paquete}
                              onChange={() => venderPaqueteCompleto(l.clave)}
                              className="w-4 h-4 rounded border-borde-fuerte text-acento focus-visible:ring-2 focus-visible:ring-acento"
                            />
                            <span>
                              {producto.unidades_por_paquete && producto.unidades_por_paquete > 1
                                ? `📦 Vender paquete completo (${producto.unidades_por_paquete} unidades por ${formatearMoneda(aCentavos(l.precio) * producto.unidades_por_paquete, 'USD')})`
                                : `📦 Vender todo el stock disponible (${producto.existencias} unidades)`}
                            </span>
                          </label>
                        )}
                    </div>
                  );
                })}
              </div>

              {/* Tarjeta de resumen de paso 1 */}
              <div className="rounded-xl border border-borde bg-superficie p-4 flex items-center justify-between">
                <div>
                  <span className="text-caption text-texto-3 block">Total de prendas</span>
                  <span className="text-body font-semibold text-texto">
                    {totalPrendas} {totalPrendas === 1 ? 'artículo' : 'artículos'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-caption text-texto-3 block">Subtotal de la venta</span>
                  <Money usd_cents={totales.total} size="md" />
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* PASO 2: CLIENTE Y FORMA DE PAGO */}
          {/* ========================================================= */}
          {paso === 2 && (
            <div className="space-y-5">
              {/* Sección Cliente y Fecha */}
              <div className="rounded-xl border border-borde p-5 bg-superficie space-y-4">
                <div className="flex items-center gap-2 border-b border-borde/60 pb-2">
                  <User className="w-4 h-4 text-acento" />
                  <h4 className="text-label font-semibold text-texto">Cliente y Fecha</h4>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-medium text-texto-2">
                      {esEncargo ? 'Cliente (Requerido para encargos)' : 'Cliente asignado'}
                    </span>
                    <div className="flex items-center gap-2">
                      <Field label="Fecha de la venta" className="w-40 mb-0">
                        <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                      </Field>
                    </div>
                  </div>

                  {/* 1. Cliente ya seleccionado */}
                  {clienteSeleccionado ? (
                    <div className="flex items-center justify-between p-3.5 rounded-xl border border-acento/40 bg-acento-suave/25 shadow-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-acento/20 text-acento flex items-center justify-center font-bold text-sm shrink-0 border border-acento/30">
                          {clienteSeleccionado.nombre.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-texto text-body flex items-center gap-2 flex-wrap">
                            <span className="truncate">{clienteSeleccionado.nombre}</span>
                            {clienteSeleccionado.saldo_pendiente_usd_cents > 0 && (
                              <Badge tone="danger">
                                Debe ${((clienteSeleccionado.saldo_pendiente_usd_cents) / 100).toFixed(2)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-caption text-texto-3 truncate">
                            {[
                              clienteSeleccionado.telefono ? `📞 ${clienteSeleccionado.telefono}` : '',
                              clienteSeleccionado.ciudad,
                              clienteSeleccionado.direccion,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Sin teléfono registrado'}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setClienteId(undefined);
                          setBusquedaCliente('');
                        }}
                      >
                        Cambiar cliente
                      </Button>
                    </div>
                  ) : mostrarCrearCliente ? (
                    /* 2. Mini-formulario inline para registrar nuevo cliente */
                    <div className="rounded-xl border border-acento/40 bg-superficie-2 p-4 space-y-3.5 animate-fade-in shadow-sm">
                      <div className="flex items-center justify-between border-b border-borde/60 pb-2">
                        <span className="text-body font-semibold text-texto flex items-center gap-2">
                          <UserPlus className="w-4 h-4 text-acento" />
                          Registrar nuevo cliente
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setMostrarCrearCliente(false)}
                          className="text-texto-3"
                        >
                          Cancelar
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Field label="Nombre completo *" className="sm:col-span-1">
                          <Input
                            value={nuevoNombreCliente}
                            onChange={(e) => setNuevoNombreCliente(e.target.value)}
                            placeholder="Nombre del cliente"
                            autoFocus
                          />
                        </Field>
                        <Field label="Teléfono / WhatsApp" className="sm:col-span-1">
                          <Input
                            value={nuevoTelefonoCliente}
                            onChange={(e) => setNuevoTelefonoCliente(e.target.value)}
                            placeholder="Ej: 8888-8888"
                          />
                        </Field>
                        <Field label="Dirección / Notas" className="sm:col-span-1">
                          <Input
                            value={nuevaDireccionCliente}
                            onChange={(e) => setNuevaDireccionCliente(e.target.value)}
                            placeholder="Ej: Managua, reparto..."
                          />
                        </Field>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setMostrarCrearCliente(false)}
                        >
                          Cancelar
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={crearClienteRapido}
                          disabled={guardandoCliente || !nuevoNombreCliente.trim()}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{guardandoCliente ? 'Guardando...' : 'Crear y asociar a la venta'}</span>
                        </Button>
                      </div>
                    </div>
                  ) : (
                    /* 3. Buscador interactivo y lista de clientes */
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 text-texto-3 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <Input
                            value={busquedaCliente}
                            onChange={(e) => setBusquedaCliente(e.target.value)}
                            placeholder="Buscar cliente por nombre o teléfono..."
                            className="pl-9"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setMostrarCrearCliente(true);
                            setNuevoNombreCliente(busquedaCliente);
                          }}
                          className="shrink-0"
                        >
                          <UserPlus className="w-4 h-4 text-acento" />
                          <span>+ Nuevo cliente</span>
                        </Button>
                      </div>

                      {/* Lista desplegable interactiva */}
                      <div className="rounded-lg border border-borde bg-superficie max-h-52 overflow-y-auto divide-y divide-borde">
                        {!esEncargo && (
                          <button
                            type="button"
                            onClick={() => {
                              setClienteId(undefined);
                              setBusquedaCliente('');
                            }}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-superficie-2 flex items-center justify-between text-body transition-colors"
                          >
                            <span className="font-medium text-texto">
                              🏪 Mostrador (Venta rápida sin registrar cliente)
                            </span>
                            <Badge tone="neutral">Genérico</Badge>
                          </button>
                        )}

                        {clientesFiltrados.length > 0 ? (
                          clientesFiltrados.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setClienteId(c.id);
                                setBusquedaCliente('');
                              }}
                              className="w-full text-left px-3.5 py-2.5 hover:bg-superficie-2 flex items-center justify-between text-body transition-colors"
                            >
                              <div>
                                <div className="font-medium text-texto flex items-center gap-2">
                                  <span>{c.nombre}</span>
                                  {c.alias && (
                                    <span className="text-caption text-texto-3">({c.alias})</span>
                                  )}
                                  {c.saldo_pendiente_usd_cents > 0 && (
                                    <Badge tone="danger">
                                      Debe ${((c.saldo_pendiente_usd_cents) / 100).toFixed(2)}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-caption text-texto-3">
                                  {[c.telefono ? `📞 ${c.telefono}` : '', c.ciudad].filter(Boolean).join(' · ') || 'Sin teléfono'}
                                </div>
                              </div>
                              <span className="text-caption font-semibold text-acento">Seleccionar →</span>
                            </button>
                          ))
                        ) : (
                          <div className="p-4 text-center">
                            <p className="text-body text-texto-2 mb-2">
                              No se encontró ningún cliente con "{busquedaCliente}".
                            </p>
                            <Button
                              type="button"
                              variant="primary"
                              size="sm"
                              onClick={() => {
                                setMostrarCrearCliente(true);
                                setNuevoNombreCliente(busquedaCliente);
                              }}
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                              <span>Crear "{busquedaCliente}" ahora</span>
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sección Cobro */}
              <div className="rounded-xl border border-borde p-5 bg-superficie space-y-4">
                <div className="flex items-center gap-2 border-b border-borde/60 pb-2">
                  <CreditCard className="w-4 h-4 text-acento" />
                  <h4 className="text-label font-semibold text-texto">¿Cómo se cobra?</h4>
                </div>

                {esEncargo ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Anticipo (%)" hint="Porcentaje adelantado para confirmar el encargo">
                      <Input
                        value={anticipoTexto}
                        onChange={(e) => setAnticipoTexto(e.target.value)}
                        className="text-right font-medium"
                      />
                    </Field>
                    <div className="rounded-lg border border-acento/30 bg-acento-suave/20 p-3.5 flex flex-col justify-center">
                      <span className="block text-caption text-texto-3">Anticipo inicial requerido</span>
                      <Money usd_cents={anticipoUsd} size="md" />
                      <span className="text-caption text-texto-3 mt-1">
                        Saldo al entregar pedido: {formatearMoneda(totales.total - anticipoUsd, 'USD')}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Botones de opción de forma de cobro */}
                    <div className="flex gap-3" role="radiogroup" aria-label="Forma de cobro">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={formaCobro === 'CONTADO'}
                        onClick={() => {
                          setFormaCobro('CONTADO');
                          setConCuotas(false);
                        }}
                        className={cn(
                          'flex-1 rounded-xl border-2 p-3.5 text-label font-medium transition-all flex flex-col gap-1 text-left cursor-pointer',
                          formaCobro === 'CONTADO'
                            ? 'border-acento bg-acento-suave/30 text-texto shadow-xs'
                            : 'border-borde text-texto-2 hover:bg-superficie-2'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-body">✓ Pagado al contado</span>
                          <Badge tone="success">Sin deuda</Badge>
                        </div>
                        <span className="text-caption text-texto-3">
                          El cliente paga el total de inmediato en efectivo o transferencia.
                        </span>
                      </button>

                      <button
                        type="button"
                        role="radio"
                        aria-checked={formaCobro === 'CREDITO'}
                        onClick={() => setFormaCobro('CREDITO')}
                        className={cn(
                          'flex-1 rounded-xl border-2 p-3.5 text-label font-medium transition-all flex flex-col gap-1 text-left cursor-pointer',
                          formaCobro === 'CREDITO'
                            ? 'border-acento bg-acento-suave/30 text-texto shadow-xs'
                            : 'border-borde text-texto-2 hover:bg-superficie-2'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-body">Al crédito / Pendiente</span>
                          <Badge tone="warning">Queda saldo</Badge>
                        </div>
                        <span className="text-caption text-texto-3">
                          Se registra un saldo a favor que el cliente pagará después o en cuotas.
                        </span>
                      </button>
                    </div>

                    {/* Detalle si es Contado */}
                    {formaCobro === 'CONTADO' && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl border border-acento/30 bg-acento-suave/15">
                        <Field label="Método de pago">
                          <Select
                            value={metodoPago}
                            onChange={(e) => setMetodoPago(e.target.value as MetodoPago)}
                          >
                            <option value="EFECTIVO">Efectivo</option>
                            <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                            <option value="OTRO">Otro medio</option>
                          </Select>
                        </Field>
                        <Field label="Moneda con la que paga">
                          <Select
                            value={monedaPago}
                            onChange={(e) => setMonedaPago(e.target.value as MonedaPago)}
                          >
                            <option value="COR">Córdobas (C$)</option>
                            <option value="USD">Dólares ($)</option>
                          </Select>
                        </Field>
                        <Field label="Referencia / Recibo" hint="Opcional">
                          <Input
                            value={referenciaPago}
                            onChange={(e) => setReferenciaPago(e.target.value)}
                            placeholder="Ej. Transferencia BAC #5432"
                          />
                        </Field>
                      </div>
                    )}

                    {/* Detalle si es Crédito */}
                    {formaCobro === 'CREDITO' && (
                      <div className="p-4 rounded-xl border border-warning-200 bg-warning-50/30 space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={conCuotas}
                            onChange={(e) => setConCuotas(e.target.checked)}
                            className="w-4 h-4 rounded border-borde-fuerte text-acento focus-visible:ring-2 focus-visible:ring-acento"
                          />
                          <span className="text-body font-medium text-texto">
                            Definir plan de cuotas quincenales o mensuales
                          </span>
                        </label>

                        {conCuotas && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pl-6 pt-1">
                            <Field label="Número de cuotas">
                              <Input
                                type="number"
                                min="2"
                                value={cuotasCantidad}
                                onChange={(e) => setCuotasCantidad(e.target.value)}
                                className="text-right"
                              />
                            </Field>
                            <Field label="Frecuencia (días)">
                              <Input
                                type="number"
                                min="1"
                                value={cuotasCada}
                                onChange={(e) => setCuotasCada(e.target.value)}
                                className="text-right"
                              />
                            </Field>
                            <div className="flex items-end">
                              <div className="text-right w-full pb-1">
                                <div className="text-caption text-texto-3">Valor por cuota</div>
                                <div className="text-body font-bold text-texto tabular">
                                  {formatearMoneda(
                                    Math.round(
                                      totales.total / Math.max(2, Math.round(num(cuotasCantidad)))
                                    ),
                                    'USD'
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* PASO 3: CONFIRMACIÓN Y ENTREGA */}
          {/* ========================================================= */}
          {paso === 3 && (
            <div className="space-y-4">
              {/* Tarjeta de balance financiero */}
              <div className="rounded-xl border border-borde bg-superficie p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-borde/60 pb-3">
                  <div>
                    <h4 className="text-label font-semibold text-texto">Balance de la Operación</h4>
                    <p className="text-caption text-texto-3">
                      Cliente: {clienteSeleccionado?.nombre ?? 'Mostrador'} · Fecha: {fecha}
                    </p>
                  </div>
                  <Badge tone={formaCobro === 'CONTADO' && !esEncargo ? 'success' : 'warning'}>
                    {esEncargo
                      ? 'Encargo'
                      : formaCobro === 'CONTADO'
                      ? '✓ Pagado de inmediato'
                      : 'Al crédito'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="rounded-lg bg-superficie-2 p-3">
                    <span className="text-caption text-texto-3 block">Total de la Venta</span>
                    <Money usd_cents={totales.total} size="md" />
                  </div>
                  <div className="rounded-lg bg-superficie-2 p-3">
                    <span className="text-caption text-texto-3 block">Costo de mercadería</span>
                    <span className="text-body font-semibold text-texto-2 block">
                      {formatearMoneda(totales.costo, 'USD')}
                    </span>
                  </div>
                  <div className="rounded-lg bg-superficie-2 p-3 col-span-2 sm:col-span-1">
                    <span className="text-caption text-texto-3 block">
                      {esEncargo ? 'Ganancia estimada' : 'Ganancia neta'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Money usd_cents={totales.ganancia} size="md" soloUsd colorearSigno />
                      {totales.costo > 0 && (
                        <Badge tone={totales.ganancia < 0 ? 'danger' : 'success'}>
                          {Math.round((totales.ganancia * 100) / totales.costo)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                {/* Banner de estado de cobro */}
                {!esEncargo && formaCobro === 'CONTADO' && (
                  <div className="flex items-center gap-2.5 p-3 rounded-lg bg-success-50/70 border border-success-200 text-success-800 text-caption">
                    <CheckCircle2 className="w-4 h-4 text-success-600 shrink-0" />
                    <span>
                      La venta se marcará como <strong>pagada de inmediato</strong> por {metodoPago.toLowerCase()} ({monedaPago}). El cliente no registrará deuda pendiente.
                    </span>
                  </div>
                )}

                {!esEncargo && formaCobro === 'CREDITO' && (
                  <div className="flex items-center gap-2.5 p-3 rounded-lg bg-warning-50/70 border border-warning-200 text-warning-800 text-caption">
                    <AlertTriangle className="w-4 h-4 text-warning-600 shrink-0" />
                    <span>
                      Se registrará un saldo pendiente de <strong>{formatearMoneda(totales.total, 'USD')}</strong> en la cuenta de {clienteSeleccionado?.nombre ?? 'el cliente'}.
                    </span>
                  </div>
                )}
              </div>

              {/* Entrega inmediata */}
              {!esEncargo && (
                <div className="rounded-xl border border-borde bg-superficie p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={entregarAhora}
                      onChange={(e) => setEntregarAhora(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-borde-fuerte text-acento focus-visible:ring-2 focus-visible:ring-acento"
                    />
                    <div>
                      <span className="text-body font-medium text-texto block">
                        Entregar mercadería ahora mismo
                      </span>
                      <span className="text-caption text-texto-3">
                        Descuenta de inmediato las unidades físicas del inventario. Desmárcalo solo si el cliente aparta la ropa para recogerla después.
                      </span>
                    </div>
                  </label>
                </div>
              )}

              {/* Resumen de artículos seleccionados */}
              <div className="rounded-xl border border-borde bg-superficie p-4 space-y-2">
                <span className="text-caption font-semibold text-texto-3 block uppercase tracking-wider">
                  Detalle de prendas ({totalPrendas})
                </span>
                <div className="divide-y divide-borde/40 max-h-40 overflow-y-auto">
                  {lineas.map((l) => (
                    <div key={l.clave} className="py-2 flex items-center justify-between text-body">
                      <div>
                        <span className="font-medium text-texto">
                          {l.descripcion || 'Prenda'}
                        </span>
                        <span className="text-caption text-texto-3 block">
                          Cantidad: {l.cantidad} × {formatearMoneda(aCentavos(l.precio), 'USD')}
                          {l.es_paquete && ' (Paquete completo)'}
                        </span>
                      </div>
                      <span className="font-semibold text-texto tabular">
                        {formatearMoneda(aCentavos(l.precio) * Math.max(1, Math.round(num(l.cantidad))), 'USD')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notas y observaciones */}
              <Field label="Notas y observaciones (opcional)">
                <Textarea
                  rows={2}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Detalles de entrega, acuerdos o recordatorios..."
                />
              </Field>
            </div>
          )}
        </div>

        {/* Pie de navegación por etapas */}
        <footer className="flex items-center justify-between gap-3 px-6 py-4 border-t border-borde bg-superficie shrink-0">
          <div>
            {paso > 1 ? (
              <Button variant="secondary" onClick={anteriorPaso} disabled={guardando}>
                <ChevronLeft className="w-4 h-4" />
                <span>Atrás</span>
              </Button>
            ) : (
              <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
                Cancelar
              </Button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right pr-2">
              <span className="text-caption text-texto-3 block leading-tight">Total</span>
              <span className="text-body font-bold text-texto tabular leading-tight">
                {formatearMoneda(totales.total, 'USD')}
              </span>
            </div>

            {paso < 3 ? (
              <Button variant="primary" onClick={siguientePaso}>
                <span>Siguiente</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={guardar}
                disabled={guardando}
                className={cn(guardando && 'pointer-events-none')}
              >
                {guardando
                  ? 'Guardando...'
                  : esEncargo
                  ? 'Registrar encargo'
                  : 'Registrar venta'}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
