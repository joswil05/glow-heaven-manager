import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  ImagePlus,
  Package,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import type { Categoria, ProductoConStock, ModoPrecio, Compra } from '../../../../shared/types';
import {
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Badge,
  Money,
  Porcentaje,
} from '../../components/ui';
import { calcularPrecio } from '@core/precios';
import { parsearDecimal } from '@core/numeros';
import { formatearMoneda, formatearPeso, formatearFecha } from '@core/moneda';
import { aMiniatura } from '../../lib/foto';
import { cn } from '../../lib/cn';
import { formatearNombreEntidad } from '@shared/formatoTexto';

interface VarianteBorrador {
  talla: string;
  color: string;
  existencias: string;
}

interface ProductoModalProps {
  abierto: boolean;
  producto: ProductoConStock | null;
  categorias: Categoria[];
  margenDefectoBp: number;
  pasoRedondeo: number;
  onCerrar: () => void;
  onGuardar: (datos: DatosProducto) => Promise<void>;
}

export interface DatosProducto {
  id?: number;
  nombre: string;
  categoria_id?: number;
  tiene_variantes: boolean;
  variantes?: { talla?: string; color?: string; existencias?: number }[];
  modo_precio: ModoPrecio;
  margen_bp?: number;
  multiplicador_bp?: number;
  precio_manual_usd_cents?: number;
  costo_unitario_usd_cents?: number;
  stock_minimo: number;
  peso_unitario_mlb: number;
  unidades_por_paquete?: number;
  packs_comprados?: number;
  costo_pack_usa_usd_cents?: number;
  aplicar_tax_usa?: boolean;
  paquete_id?: number;
  foto?: string;
  notas?: string;
  stock_inicial?: { cantidad: number; costo_unitario_usd_cents: number };
}

const aCentavos = (texto: string): number => {
  const v = parsearDecimal(texto);
  return v === null ? 0 : Math.round(v * 100);
};

const MODOS: { valor: ModoPrecio; etiqueta: string }[] = [
  { valor: 'MARGEN', etiqueta: 'Por ganancia %' },
  { valor: 'MULTIPLICADOR', etiqueta: 'Multiplicando' },
  { valor: 'MANUAL', etiqueta: 'Lo escribo yo' },
];

const PASOS = [
  { id: 1, titulo: 'Básico', subtitulo: 'Foto y nombre' },
  { id: 2, titulo: 'Existencias', subtitulo: 'Stock y costo' },
  { id: 3, titulo: 'Precio', subtitulo: 'Margen y venta' },
  { id: 4, titulo: 'Detalles', subtitulo: 'Tallas y alertas' },
] as const;

export const ProductoModal: React.FC<ProductoModalProps> = ({
  abierto,
  producto,
  categorias,
  margenDefectoBp,
  pasoRedondeo,
  onCerrar,
  onGuardar,
}) => {
  const esNuevo = producto === null;

  const [paso, setPaso] = useState<1 | 2 | 3 | 4>(1);
  const [nombre, setNombre] = useState('');
  const [categoriaId, setCategoriaId] = useState<number | undefined>(undefined);
  const [foto, setFoto] = useState('');
  const [tieneVariantes, setTieneVariantes] = useState(false);
  const [variantes, setVariantes] = useState<VarianteBorrador[]>([]);
  const [modoPrecio, setModoPrecio] = useState<ModoPrecio>('MARGEN');
  const [otroModoAbierto, setOtroModoAbierto] = useState(false);
  const [margenTexto, setMargenTexto] = useState('');
  const [multiplicadorTexto, setMultiplicadorTexto] = useState('2');
  const [precioManualTexto, setPrecioManualTexto] = useState('');
  const [stockMinimo, setStockMinimo] = useState('2');
  const [notas, setNotas] = useState('');
  const [cantidadInicial, setCantidadInicial] = useState('');
  const [costoInicialTexto, setCostoInicialTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

  const [paquetes, setPaquetes] = useState<Compra[]>([]);
  const [paqueteId, setPaqueteId] = useState<number | undefined>(undefined);
  const [esPack, setEsPack] = useState(false);
  const [packsComprados, setPacksComprados] = useState('1');
  const [unidadesPorPack, setUnidadesPorPack] = useState('5');
  const [costoPackUsaTexto, setCostoPackUsaTexto] = useState('');
  const [aplicarTaxUsa, setAplicarTaxUsa] = useState(true);

  useEffect(() => {
    if (!abierto) return;
    window.api.compras.list().then((r) => {
      if (r.success) setPaquetes(r.data);
    });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setPaso(1);

    if (producto) {
      setNombre(producto.nombre);
      setCategoriaId(producto.categoria_id);
      setFoto(producto.foto ?? '');
      setTieneVariantes(producto.tiene_variantes);
      setVariantes(
        producto.variantes.map((v) => ({
          talla: v.talla ?? '',
          color: v.color ?? '',
          existencias: String(v.existencias),
        }))
      );
      setModoPrecio(producto.modo_precio);
      setOtroModoAbierto(producto.modo_precio !== 'MARGEN');
      setMargenTexto(producto.margen_bp !== undefined ? String(producto.margen_bp / 100) : '');
      setMultiplicadorTexto(
        producto.multiplicador_bp !== undefined ? String(producto.multiplicador_bp / 10000) : '2'
      );
      setPrecioManualTexto(
        producto.precio_manual_usd_cents !== undefined
          ? (producto.precio_manual_usd_cents / 100).toFixed(2)
          : ''
      );
      setStockMinimo(String(producto.stock_minimo));
      setNotas(producto.notas ?? '');
      setCantidadInicial(String(producto.existencias ?? 0));
      setCostoInicialTexto(
        producto.costo_unitario_usd_cents !== undefined
          ? (producto.costo_unitario_usd_cents / 100).toFixed(2)
          : ''
      );
      setPaqueteId(producto.paquete_id);
      const tienePack = Boolean(producto.unidades_por_paquete && producto.unidades_por_paquete > 1);
      setEsPack(tienePack);
      const porPack = producto.unidades_por_paquete ? producto.unidades_por_paquete : 5;
      setUnidadesPorPack(String(porPack));

      // Recuperar packs comprados: si está guardado se usa; si no, se deduce de existencias / unidades_por_paquete
      const packsGuardadosODeducidos =
        producto.packs_comprados !== undefined
          ? producto.packs_comprados
          : (producto.existencias > 0 && porPack > 0)
          ? Math.max(1, Math.round(producto.existencias / porPack))
          : 1;
      setPacksComprados(String(packsGuardadosODeducidos));

      // Recuperar tax USA aplicado
      const usaTax = producto.aplicar_tax_usa !== false;
      setAplicarTaxUsa(usaTax);

      // Recuperar precio del paquete en USA: si está guardado se usa; si no, se deduce de costo unitario
      if (producto.costo_pack_usa_usd_cents !== undefined && producto.costo_pack_usa_usd_cents > 0) {
        setCostoPackUsaTexto((producto.costo_pack_usa_usd_cents / 100).toFixed(2));
      } else if (tienePack && producto.costo_unitario_usd_cents) {
        const basePackCents = Math.round(
          (producto.costo_unitario_usd_cents * porPack) / (usaTax ? 1.07 : 1)
        );
        setCostoPackUsaTexto((basePackCents / 100).toFixed(2));
      } else {
        setCostoPackUsaTexto('');
      }
    } else {
      setNombre('');
      setCategoriaId(categorias[0]?.id);
      setFoto('');
      setTieneVariantes(false);
      setVariantes([]);
      setModoPrecio('MARGEN');
      setOtroModoAbierto(false);
      setMargenTexto('');
      setMultiplicadorTexto('2');
      setPrecioManualTexto('');
      setStockMinimo('2');
      setNotas('');
      setCantidadInicial('');
      setCostoInicialTexto('');
      setPaqueteId(undefined);
      setEsPack(false);
      setPacksComprados('1');
      setUnidadesPorPack('5');
      setCostoPackUsaTexto('');
      setAplicarTaxUsa(true);
    }
  }, [abierto, producto, categorias]);

  // Cierre con Escape
  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierto, onCerrar]);

  const paqueteSeleccionado = useMemo(
    () => paquetes.find((p) => p.id === paqueteId),
    [paquetes, paqueteId]
  );

  const calculoPack = useMemo(() => {
    if (!esPack) return null;
    const packs = Math.max(1, Math.round(parsearDecimal(packsComprados) ?? 1));
    const porPack = Math.max(1, Math.round(parsearDecimal(unidadesPorPack) ?? 5));
    const totalUnidades = packs * porPack;
    const precioPackCents = aCentavos(costoPackUsaTexto);

    const costoBaseUnitCents = precioPackCents > 0 ? Math.round(precioPackCents / porPack) : 0;
    const taxUnitCents =
      aplicarTaxUsa && costoBaseUnitCents > 0 ? Math.round(costoBaseUnitCents * 0.07) : 0;

    const costoLandedUnitCents = costoBaseUnitCents + taxUnitCents;

    return {
      packs,
      porPack,
      totalUnidades,
      precioPackCents,
      costoBaseUnitCents,
      taxUnitCents,
      costoLandedUnitCents,
    };
  }, [esPack, packsComprados, unidadesPorPack, costoPackUsaTexto, aplicarTaxUsa]);

  useEffect(() => {
    if (!esPack || !calculoPack) return;
    if (esNuevo) {
      setCantidadInicial(String(calculoPack.totalUnidades));
      if (calculoPack.costoLandedUnitCents > 0) {
        setCostoInicialTexto((calculoPack.costoLandedUnitCents / 100).toFixed(2));
      }
    }
  }, [esPack, calculoPack, esNuevo]);

  const margenEfectivoBp = useMemo(() => {
    if (margenTexto.trim()) return Math.round((parsearDecimal(margenTexto) ?? 0) * 100);
    const cat = categorias.find((c) => c.id === categoriaId);
    return cat?.margen_defecto_bp ?? margenDefectoBp;
  }, [margenTexto, categoriaId, categorias, margenDefectoBp]);

  const costoPreview =
    costoInicialTexto.trim() && aCentavos(costoInicialTexto) >= 0
      ? aCentavos(costoInicialTexto)
      : producto
      ? producto.costo_unitario_usd_cents
      : 0;

  const preview = useMemo(
    () =>
      calcularPrecio({
        costo_unitario_usd_cents: costoPreview,
        modo: modoPrecio,
        margen_bp: margenEfectivoBp,
        multiplicador_bp: Math.round((parsearDecimal(multiplicadorTexto) ?? 2) * 10000),
        precio_manual_usd_cents: aCentavos(precioManualTexto),
        paso_redondeo_usd_cents: pasoRedondeo,
      }),
    [
      costoPreview,
      modoPrecio,
      margenEfectivoBp,
      multiplicadorTexto,
      precioManualTexto,
      pasoRedondeo,
    ]
  );

  if (!abierto) return null;

  const agregarVariante = () =>
    setVariantes((prev) => [...prev, { talla: '', color: '', existencias: '0' }]);

  const actualizarVariante = (i: number, campo: keyof VarianteBorrador, valor: string) =>
    setVariantes((prev) => prev.map((v, idx) => (idx === i ? { ...v, [campo]: valor } : v)));

  const quitarVariante = (i: number) => setVariantes((prev) => prev.filter((_, idx) => idx !== i));

  const elegirFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;

    try {
      setFoto(await aMiniatura(archivo));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo usar esa imagen.');
    }
  };

  const validarPaso = (p: number): boolean => {
    if (p === 1) {
      if (!nombre.trim()) {
        setError('Escribí el nombre del producto para continuar.');
        return false;
      }
    }
    if (p === 2) {
      if (esNuevo && cantidadInicial.trim() && !costoInicialTexto.trim()) {
        setError('Si ponés existencias iniciales, indicá el costo por unidad.');
        return false;
      }
      if (costoInicialTexto.trim() && aCentavos(costoInicialTexto) < 0) {
        setError('El costo por unidad debe ser un monto válido mayor o igual a 0.');
        return false;
      }
    }
    if (p === 4) {
      if (tieneVariantes) {
        if (variantes.length === 0) {
          setError('Agregá al menos una talla, color o tono de maquillaje, o desactivá las variantes.');
          return false;
        }
        const algunaVacia = variantes.some((v) => !v.talla.trim() && !v.color.trim());
        if (algunaVacia) {
          setError('Cada fila debe tener al menos una talla, medida o tono de maquillaje especificado.');
          return false;
        }
      }
    }
    setError(null);
    return true;
  };

  const irAPaso = (nuevoPaso: 1 | 2 | 3 | 4) => {
    if (nuevoPaso > paso) {
      if (!validarPaso(paso)) return;
    }
    setError(null);
    setPaso(nuevoPaso);
  };

  const siguientePaso = () => {
    if (!validarPaso(paso)) return;
    if (paso < 4) {
      setPaso((p) => (p + 1) as 1 | 2 | 3 | 4);
    }
  };

  const anteriorPaso = () => {
    setError(null);
    if (paso > 1) {
      setPaso((p) => (p - 1) as 1 | 2 | 3 | 4);
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
        if (paso < 4) {
          siguientePaso();
        } else {
          manejarGuardar();
        }
      }
    }
  };

  const manejarGuardar = async () => {
    if (!validarPaso(1) || !validarPaso(2) || !validarPaso(4)) {
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const cantidad = Math.round(parsearDecimal(cantidadInicial) ?? 0);
      const totalVariantes = tieneVariantes
        ? variantes.reduce((s, v) => s + Math.max(0, Math.round(parsearDecimal(v.existencias) ?? 0)), 0)
        : 0;
      const totalUnidades = tieneVariantes ? totalVariantes : cantidad;
      const costoUnitarioCents = costoInicialTexto.trim() ? Math.max(0, aCentavos(costoInicialTexto)) : undefined;

      await onGuardar({
        id: producto?.id,
        nombre: formatearNombreEntidad(nombre),
        categoria_id: categoriaId,
        tiene_variantes: tieneVariantes,
        variantes: tieneVariantes
          ? variantes.map((v) => ({
              talla: v.talla.trim() || undefined,
              color: v.color.trim() || undefined,
              existencias: Math.round(parsearDecimal(v.existencias) ?? 0),
            }))
          : undefined,
        modo_precio: modoPrecio,
        margen_bp: margenTexto.trim() ? margenEfectivoBp : undefined,
        multiplicador_bp:
          modoPrecio === 'MULTIPLICADOR'
            ? Math.round((parsearDecimal(multiplicadorTexto) ?? 2) * 10000)
            : undefined,
        precio_manual_usd_cents: modoPrecio === 'MANUAL' ? aCentavos(precioManualTexto) : undefined,
        costo_unitario_usd_cents: costoUnitarioCents,
        stock_minimo: Math.round(parsearDecimal(stockMinimo) ?? 0),
        peso_unitario_mlb: 0,
        unidades_por_paquete: esPack
          ? Math.max(1, Math.round(parsearDecimal(unidadesPorPack) ?? 5))
          : undefined,
        packs_comprados: esPack
          ? Math.max(1, Math.round(parsearDecimal(packsComprados) ?? 1))
          : undefined,
        costo_pack_usa_usd_cents: esPack && costoPackUsaTexto.trim()
          ? aCentavos(costoPackUsaTexto)
          : undefined,
        aplicar_tax_usa: esPack ? aplicarTaxUsa : undefined,
        paquete_id: paqueteId,
        foto,
        notas: notas.trim() || undefined,
        stock_inicial:
          esNuevo && totalUnidades > 0 && costoUnitarioCents !== undefined
            ? { cantidad: totalUnidades, costo_unitario_usd_cents: costoUnitarioCents }
            : undefined,
      });

      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el producto.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-velo/40 backdrop-blur-xs p-4 cursor-pointer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-producto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        onKeyDown={alPresionarEnter}
        onClick={(e) => e.stopPropagation()}
        className="bg-superficie rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-borde/80 animate-modal-pop cursor-default"
      >
        {/* Cabecera principal */}
        <header className="flex items-center justify-between px-5 py-4 border-b border-borde shrink-0">
          <div>
            <h3 id="titulo-producto" className="text-title text-texto">
              {esNuevo ? 'Agregar producto al inventario' : `Editar ${producto!.nombre}`}
            </h3>
            <p className="text-caption text-texto-3">
              Paso {paso} de 4 · {PASOS[paso - 1].titulo}: {PASOS[paso - 1].subtitulo}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar">
            <X className="w-4 h-4" />
          </Button>
        </header>

        {/* Barra de progreso de Pasos (Wizard) */}
        <div className="px-6 py-3 border-b border-borde bg-superficie-2/50 shrink-0">
          <div className="flex items-center justify-between max-w-xl mx-auto">
            {PASOS.map((p, idx) => {
              const completado = paso > p.id;
              const activo = paso === p.id;
              return (
                <React.Fragment key={p.id}>
                  <button
                    type="button"
                    onClick={() => irAPaso(p.id as 1 | 2 | 3 | 4)}
                    className="flex items-center gap-2 group cursor-pointer text-left focus-visible:outline-none"
                  >
                    <span
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-caption font-semibold transition-all',
                        activo
                          ? 'bg-acento text-white ring-4 ring-acento/20 shadow-sm'
                          : completado
                          ? 'bg-acento/20 text-acento-fuerte'
                          : 'bg-superficie border border-borde text-texto-3 group-hover:border-borde-fuerte'
                      )}
                    >
                      {completado ? <Check className="w-3.5 h-3.5" /> : p.id}
                    </span>
                    <div className="hidden sm:block">
                      <p
                        className={cn(
                          'text-caption leading-tight',
                          activo
                            ? 'text-texto font-semibold'
                            : completado
                            ? 'text-texto-2 font-medium'
                            : 'text-texto-3'
                        )}
                      >
                        {p.titulo}
                      </p>
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

        {/* Cuerpo del formulario (con scroll) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3">
              <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-label text-danger-800">{error}</p>
            </div>
          )}

          {/* PASO 1: Información básica */}
          {paso === 1 && (
            <div className="space-y-5 animate-fade-in">
              <div className="flex items-start gap-5">
                {/* Selector de foto */}
                <div className="shrink-0">
                  <input
                    ref={archivoRef}
                    type="file"
                    accept="image/*"
                    onChange={elegirFoto}
                    className="sr-only"
                    aria-label="Elegir foto del producto"
                  />
                  <button
                    type="button"
                    onClick={() => archivoRef.current?.click()}
                    className={cn(
                      'w-28 h-28 rounded-lg border overflow-hidden flex flex-col items-center justify-center gap-1.5 shadow-sm',
                      'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
                      foto
                        ? 'border-borde bg-superficie'
                        : 'border-dashed border-borde-fuerte bg-superficie-2 text-texto-3 hover:border-acento hover:text-acento'
                    )}
                  >
                    {foto ? (
                      <img src={foto} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <>
                        <ImagePlus className="w-6 h-6 text-texto-3" />
                        <span className="text-caption font-medium">Agregar foto</span>
                      </>
                    )}
                  </button>
                  {foto && (
                    <button
                      type="button"
                      onClick={() => setFoto('')}
                      className="mt-1.5 w-28 text-caption text-center block text-texto-3 hover:text-danger-700"
                    >
                      Quitar foto
                    </button>
                  )}
                </div>

                {/* Nombre y Categoría */}
                <div className="flex-1 space-y-4">
                  <Field label="Nombre del producto *" hint="Ej: Camiseta Tommy Hilfiger, Boxers Calvin Klein">
                    <Input
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      onBlur={() => setNombre((prev) => formatearNombreEntidad(prev))}
                      placeholder="Nombre descriptivo"
                      autoFocus
                    />
                  </Field>
                  <Field label="Categoría">
                    <Select
                      value={categoriaId ?? ''}
                      onChange={(e) =>
                        setCategoriaId(e.target.value ? Number(e.target.value) : undefined)
                      }
                    >
                      <option value="">(Sin categoría)</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>

              {/* Courier o Paquete de Origen */}
              <div className="rounded-lg border border-borde p-4 bg-superficie-2/40">
                <Field
                  label="Caja o Factura courier de origen"
                  hint="Opcional: asocia este producto al paquete donde vino para trazabilidad"
                >
                  <Select
                    value={paqueteId ?? ''}
                    onChange={(e) =>
                      setPaqueteId(e.target.value ? Number(e.target.value) : undefined)
                    }
                  >
                    <option value="">(Ninguno / Compra directa en tienda física)</option>
                    {paquetes.map((pq) => (
                      <option key={pq.id} value={pq.id}>
                        {pq.codigo} ({formatearFecha(pq.fecha)}) · {formatearPeso(pq.peso_total_mlb)} · Flete {formatearMoneda(pq.envio_total_usd_cents, 'USD')}
                        {pq.notas ? ` — ${pq.notas}` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                {paqueteSeleccionado && (
                  <p className="mt-2 text-caption text-acento-fuerte flex items-center gap-1.5 font-medium">
                    <Package className="w-3.5 h-3.5 shrink-0" />
                    Asociado al envío {paqueteSeleccionado.codigo} de fecha {formatearFecha(paqueteSeleccionado.fecha)}.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PASO 2: Existencias y Multipack */}
          {paso === 2 && (
            <div className="space-y-5 animate-fade-in">
              {/* Opción de Multipack */}
              <div className="rounded-lg border border-borde p-4 space-y-3 bg-superficie shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={esPack}
                      onChange={(e) => setEsPack(e.target.checked)}
                      className="w-4 h-4 rounded border-borde-fuerte text-acento focus-visible:ring-2 focus-visible:ring-acento"
                    />
                    <span className="text-body font-medium text-texto">
                      ¿Viene en paquete de varias prendas? (ej. pack de boxers, calcetines)
                    </span>
                  </label>
                  {esPack && <Badge tone="info">Multipack</Badge>}
                </div>

                {esPack && (
                  <div className="space-y-4 pt-3 border-t border-borde">
                    <p className="text-caption text-texto-2">
                      Indicá lo que pagaste por el paquete completo en USA. El sistema calculará el costo unitario de cada prenda y las agregará individuales al inventario para que puedas venderlas sueltas o por pack.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field label="Packs comprados" hint="Ej: 1 pack">
                        <Input
                          type="number"
                          min="1"
                          value={packsComprados}
                          onChange={(e) => {
                            setPacksComprados(e.target.value);
                            if (esNuevo) {
                              const p = Math.max(1, Math.round(parsearDecimal(e.target.value) ?? 1));
                              const u = Math.max(1, Math.round(parsearDecimal(unidadesPorPack) ?? 5));
                              setCantidadInicial(String(p * u));
                            }
                          }}
                          placeholder="1"
                          className="text-right"
                        />
                      </Field>
                      <Field label="Unidades por pack" hint="Ej: 5 boxers por paquete">
                        <Input
                          type="number"
                          min="1"
                          value={unidadesPorPack}
                          onChange={(e) => {
                            setUnidadesPorPack(e.target.value);
                            const porPack = Math.max(1, Math.round(parsearDecimal(e.target.value) ?? 5));
                            const precioPack = aCentavos(costoPackUsaTexto);
                            if (precioPack > 0) {
                              const base = Math.round(precioPack / porPack);
                              const tax = aplicarTaxUsa ? Math.round(base * 0.07) : 0;
                              setCostoInicialTexto(((base + tax) / 100).toFixed(2));
                            }
                            if (esNuevo) {
                              const p = Math.max(1, Math.round(parsearDecimal(packsComprados) ?? 1));
                              setCantidadInicial(String(p * porPack));
                            }
                          }}
                          placeholder="5"
                          className="text-right"
                        />
                      </Field>
                      <Field label="Precio del pack en USA ($)" hint="Lo que costó el paquete">
                        <Input
                          value={costoPackUsaTexto}
                          onChange={(e) => {
                            setCostoPackUsaTexto(e.target.value);
                            const precioPack = aCentavos(e.target.value);
                            const porPack = Math.max(1, Math.round(parsearDecimal(unidadesPorPack) ?? 5));
                            if (precioPack > 0) {
                              const base = Math.round(precioPack / porPack);
                              const tax = aplicarTaxUsa ? Math.round(base * 0.07) : 0;
                              setCostoInicialTexto(((base + tax) / 100).toFixed(2));
                            }
                          }}
                          placeholder="12.00"
                          className="text-right"
                          inputMode="decimal"
                        />
                      </Field>
                    </div>

                    <label className="flex items-center gap-2 text-label text-texto-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={aplicarTaxUsa}
                        onChange={(e) => {
                          setAplicarTaxUsa(e.target.checked);
                          const precioPack = aCentavos(costoPackUsaTexto);
                          const porPack = Math.max(1, Math.round(parsearDecimal(unidadesPorPack) ?? 5));
                          if (precioPack > 0) {
                            const base = Math.round(precioPack / porPack);
                            const tax = e.target.checked ? Math.round(base * 0.07) : 0;
                            setCostoInicialTexto(((base + tax) / 100).toFixed(2));
                          }
                        }}
                        className="w-4 h-4 rounded border-borde-fuerte text-acento"
                      />
                      <span>Sumar 7% de taxes de USA (+${((calculoPack?.taxUnitCents ?? 0) / 100).toFixed(2)} por unidad)</span>
                    </label>

                    {calculoPack && calculoPack.precioPackCents > 0 && (
                      <div className="rounded-lg border border-acento/30 bg-acento-suave/25 p-3.5 text-label space-y-1.5">
                        <div className="flex justify-between items-center">
                          <span className="text-texto-3">Stock físico que ingresará:</span>
                          <span className="font-semibold text-texto">{calculoPack.totalUnidades} unidades individuales</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-texto-3">Costo base USA por unidad:</span>
                          <span className="tabular font-medium text-texto">
                            ${(calculoPack.costoBaseUnitCents / 100).toFixed(2)} c/u (${(calculoPack.precioPackCents / 100).toFixed(2)} ÷ {calculoPack.porPack})
                          </span>
                        </div>
                        {aplicarTaxUsa && (
                          <div className="flex justify-between items-center">
                            <span className="text-texto-3">+ Tax USA (7%):</span>
                            <span className="tabular text-texto">+${(calculoPack.taxUnitCents / 100).toFixed(2)} c/u</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-2 border-t border-borde font-semibold text-acento-fuerte">
                          <span>Costo unitario calculado:</span>
                          <span className="tabular text-base">${(calculoPack.costoLandedUnitCents / 100).toFixed(2)} por unidad</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Existencias iniciales directas */}
              {esNuevo ? (
                <div className="rounded-lg border border-borde bg-superficie-2/60 p-4">
                  <h4 className="text-label font-medium text-texto">
                    Existencias y costo inicial
                  </h4>
                  <p className="text-caption text-texto-3 mb-3">
                    {esPack
                      ? 'Calculado automáticamente desde el multipack. Podés ajustarlo si lo deseás.'
                      : 'Indicá cuántas unidades tenés en mano y cuánto te costó cada una.'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Cantidad de unidades en mano">
                      <Input
                        type="number"
                        min="0"
                        value={cantidadInicial}
                        onChange={(e) => setCantidadInicial(e.target.value)}
                        placeholder="0"
                        className="text-right"
                      />
                    </Field>
                    <Field
                      label="Costo por unidad ($)"
                      hint="Costo final por prenda (producto + tax)"
                    >
                      <Input
                        value={costoInicialTexto}
                        onChange={(e) => setCostoInicialTexto(e.target.value)}
                        placeholder="0.00"
                        className="text-right"
                        inputMode="decimal"
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-borde bg-superficie-2/60 p-4 space-y-3">
                  <div>
                    <h4 className="text-label font-medium text-texto">
                      Costo unitario de compra
                    </h4>
                    <p className="text-caption text-texto-3">
                      Modificá aquí el precio de compra unitario si te equivocaste o cambió el costo.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <Field
                      label="Costo por unidad ($)"
                      hint="Lo que costó adquirir cada unidad en USA / tienda"
                    >
                      <Input
                        value={costoInicialTexto}
                        onChange={(e) => setCostoInicialTexto(e.target.value)}
                        placeholder="0.00"
                        className="text-right font-semibold"
                        inputMode="decimal"
                      />
                    </Field>

                    <div className="rounded-lg border border-borde bg-superficie p-3 flex flex-col justify-center text-caption text-texto-2">
                      <div className="flex justify-between items-center">
                        <span className="text-texto-3">Existencias físicas:</span>
                        <span className="font-semibold text-texto">
                          {producto.existencias ?? 0} unidades
                        </span>
                      </div>
                      <p className="text-[11px] text-texto-3 mt-1.5 leading-snug">
                        Para modificar las existencias físicas en bodega, utilizá el botón <em>"Ajustar existencias"</em> en la lista de inventario.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PASO 3: Precio de venta */}
          {paso === 3 && (
            <div className="space-y-5 animate-fade-in">
              <div className="rounded-lg border border-borde p-4 bg-superficie">
                <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                  <h4 className="text-label font-medium text-texto">Modo de cálculo del precio</h4>
                  {!otroModoAbierto && (
                    <button
                      type="button"
                      onClick={() => setOtroModoAbierto(true)}
                      className="text-label text-texto-3 hover:text-acento focus-visible:outline-none"
                    >
                      Calcularlo de otra forma
                    </button>
                  )}
                </div>

                {otroModoAbierto && (
                  <div
                    className="flex gap-2 mb-4"
                    role="radiogroup"
                    aria-label="Cómo calcular el precio"
                  >
                    {MODOS.map((opcion) => (
                      <button
                        key={opcion.valor}
                        type="button"
                        role="radio"
                        aria-checked={modoPrecio === opcion.valor}
                        onClick={() => setModoPrecio(opcion.valor)}
                        className={cn(
                          'flex-1 rounded-md border px-3 py-2 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
                          modoPrecio === opcion.valor
                            ? 'border-acento bg-acento-suave text-acento-fuerte font-medium'
                            : 'border-borde text-texto-2 hover:bg-superficie-2'
                        )}
                      >
                        {opcion.etiqueta}
                      </button>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {modoPrecio === 'MARGEN' && (
                    <Field
                      label="Ganancia que querés (%)"
                      hint={
                        margenTexto.trim()
                          ? 'Sobre tu costo final'
                          : `Vacío = margen por categoría (${margenEfectivoBp / 100}%)`
                      }
                    >
                      <Input
                        value={margenTexto}
                        onChange={(e) => setMargenTexto(e.target.value)}
                        placeholder={String(margenEfectivoBp / 100)}
                        className="text-right"
                        inputMode="decimal"
                      />
                    </Field>
                  )}

                  {modoPrecio === 'MULTIPLICADOR' && (
                    <Field label="Multiplicar el costo por" hint="Ejemplo: 2 = doble del costo">
                      <Input
                        value={multiplicadorTexto}
                        onChange={(e) => setMultiplicadorTexto(e.target.value)}
                        placeholder="2"
                        className="text-right"
                        inputMode="decimal"
                      />
                    </Field>
                  )}

                  {modoPrecio === 'MANUAL' && (
                    <Field label="Precio de venta directo ($)" hint="Precio fijo sin redondeo">
                      <Input
                        value={precioManualTexto}
                        onChange={(e) => setPrecioManualTexto(e.target.value)}
                        placeholder="0.00"
                        className="text-right"
                        inputMode="decimal"
                      />
                    </Field>
                  )}

                  {/* Tarjeta de vista previa */}
                  <div
                    className={cn(
                      'rounded-md border p-3.5',
                      preview.bajo_costo && costoPreview > 0
                        ? 'border-danger-200 bg-danger-50'
                        : 'border-borde bg-superficie-2'
                    )}
                  >
                    {costoPreview > 0 ? (
                      <dl className="space-y-1.5 text-label">
                        <div className="flex justify-between gap-2">
                          <dt className="text-texto-3">Te cuesta</dt>
                          <dd>
                            <Money usd_cents={costoPreview} size="sm" soloUsd />
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2">
                          <dt className="text-texto-3">Lo vendés en</dt>
                          <dd className="font-semibold text-texto">
                            <Money usd_cents={preview.precio_usd_cents} size="sm" soloUsd />
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2 pt-1 border-t border-borde">
                          <dt className="text-texto-3">Ganás</dt>
                          <dd className="flex items-center gap-1.5">
                            <Money
                              usd_cents={preview.ganancia_usd_cents}
                              size="sm"
                              soloUsd
                              colorearSigno
                            />
                            <Badge tone={preview.bajo_costo ? 'danger' : 'success'}>
                              <Porcentaje bp={preview.margen_sobre_costo_bp} />
                            </Badge>
                          </dd>
                        </div>
                        {preview.bajo_costo && (
                          <p className="pt-1 text-caption text-danger-700">
                            Ese precio está por debajo de lo que te costó.
                          </p>
                        )}
                        {esPack && preview.precio_usd_cents > 0 && (
                          <div className="pt-2 mt-1 border-t border-borde text-caption text-texto-2">
                            <span className="font-semibold text-acento-fuerte">Si vendés el paquete completo ({unidadesPorPack} uds):</span>{' '}
                            <span className="font-medium text-texto">
                              {formatearMoneda(
                                preview.precio_usd_cents *
                                  Math.max(1, Math.round(parsearDecimal(unidadesPorPack) ?? 5)),
                                'USD'
                              )}
                            </span>
                          </div>
                        )}
                      </dl>
                    ) : (
                      <p className="text-caption text-texto-3 py-2 text-center">
                        Ingresá el costo en el Paso 2 para ver el precio sugerido y ganancia proyectada.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PASO 4: Variantes y Detalles */}
          {paso === 4 && (
            <div className="space-y-5 animate-fade-in">
              {/* Variantes */}
              <div className="rounded-lg border border-borde p-4 bg-superficie">
                <label className="flex items-center gap-2 mb-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tieneVariantes}
                    onChange={(e) => {
                      setTieneVariantes(e.target.checked);
                      if (e.target.checked && variantes.length === 0) agregarVariante();
                    }}
                    className="w-4 h-4 rounded border-borde-fuerte text-acento focus-visible:ring-2 focus-visible:ring-acento"
                  />
                  <span className="text-body font-medium text-texto">
                    ¿Este producto tiene tallas, colores o tonos de maquillaje?
                  </span>
                </label>
                <p className="text-caption text-texto-3 mb-3 pl-6">
                  Ideal para ropa (S, M, L) o cosméticos donde el producto es el mismo pero varía el tono (ej. Tono 120 Classic Ivory, 220 Natural Beige, etc.).
                </p>

                {tieneVariantes && (
                  <div className="space-y-2.5 pt-2">
                    {variantes.map((v, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <Field label={i === 0 ? 'Talla / Medida' : ''} className="flex-1">
                          <Input
                            value={v.talla}
                            onChange={(e) => actualizarVariante(i, 'talla', e.target.value)}
                            placeholder="Opcional: M, 30ml..."
                          />
                        </Field>
                        <Field label={i === 0 ? 'Color / Tono de Maquillaje' : ''} className="flex-1">
                          <Input
                            value={v.color}
                            onChange={(e) => actualizarVariante(i, 'color', e.target.value)}
                            placeholder="Ej: Tono 120, Beige, Rojo..."
                          />
                        </Field>
                        <Field label={i === 0 ? 'Existencias' : ''} className="w-28">
                          <Input
                            type="number"
                            min="0"
                            value={v.existencias}
                            onChange={(e) => actualizarVariante(i, 'existencias', e.target.value)}
                            className="text-right"
                            disabled={!esNuevo}
                          />
                        </Field>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => quitarVariante(i)}
                          aria-label={`Quitar variante ${i + 1}`}
                          className="text-texto-3 hover:text-danger-700 mb-0.5"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" onClick={agregarVariante}>
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar otra talla / tono</span>
                    </Button>
                    {!esNuevo && (
                      <p className="text-caption text-texto-3">
                        Para cambiar existencias de variantes de un producto existente, usá "Ajustar existencias" en la lista.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Alerta de Stock Mínimo */}
              <div className="rounded-lg border border-borde p-4 bg-superficie">
                <Field
                  label="Aviso de stock mínimo"
                  hint="Te avisará en el panel de inicio cuando queden pocas unidades (0 para no avisar)"
                >
                  <Input
                    type="number"
                    min="0"
                    value={stockMinimo}
                    onChange={(e) => setStockMinimo(e.target.value)}
                    className="text-right max-w-xs"
                  />
                </Field>
              </div>

              {/* Notas */}
              <div className="rounded-lg border border-borde p-4 bg-superficie">
                <Field label="Notas y observaciones">
                  <Textarea
                    rows={3}
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Tienda de compra, detalles de tela o recomendaciones..."
                  />
                </Field>
              </div>
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

          <div className="flex items-center gap-2">
            {paso < 4 ? (
              <Button variant="primary" onClick={siguientePaso}>
                <span>Siguiente</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button variant="primary" onClick={manejarGuardar} disabled={guardando}>
                {guardando ? 'Guardando...' : esNuevo ? 'Agregar al inventario' : 'Guardar cambios'}
              </Button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
