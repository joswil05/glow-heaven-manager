import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  AlertTriangle,
  ImagePlus,
  ChevronLeft,
  ChevronRight,
  Check,
  PackageOpen,
} from 'lucide-react';
import type { Categoria, ProductoConStock, ModoPrecio } from '../../../../shared/types';
import {
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Badge,
  Money,
  Porcentaje,
  Portal,
} from '../../components/ui';
import { calcularPrecio } from '@core/precios';
import { parsearDecimal, parsearACentavos } from '@core/numeros';
import { formatearMoneda } from '@core/moneda';
import { aMiniatura } from '../../lib/foto';
import { cn } from '../../lib/cn';
import { formatearNombreEntidad } from '@shared/formatoTexto';

/**
 * La ficha de un producto: lo que es, cómo se ve y cómo se decide su precio.
 *
 * No tiene costo, existencias ni paquete. Antes los tenía, y de ahí salían
 * varios errores: el campo del costo decía "producto + tax" al crear y "sin
 * impuesto" al editar, el pack le sumaba un 7% escrito a mano que después la
 * aplicación volvía a sumar, y guardar la ficha recalculaba la bodega con el
 * flete redondeado. La mercadería ahora entra por un paquete, que es el que
 * sabe lo que costó en la tienda, su impuesto y su flete.
 */

interface VarianteBorrador {
  talla: string;
  color: string;
}

interface ProductoModalProps {
  abierto: boolean;
  producto: ProductoConStock | null;
  categorias: Categoria[];
  margenDefectoBp: number;
  /** El mínimo de stock configurado, para que un campo vacío no lo apague. */
  stockMinimoDefecto: number;
  pasoRedondeo: number;
  /** Nombre con el que arranca un producto nuevo (lo que se buscó en el paquete). */
  nombreInicial?: string;
  onCerrar: () => void;
  /** Devuelve el id cuando crea un producto nuevo. */
  onGuardar: (datos: DatosProducto) => Promise<number | void>;
}

export interface DatosProducto {
  id?: number;
  nombre: string;
  categoria_id?: number;
  tiene_variantes: boolean;
  variantes?: { talla?: string; color?: string }[];
  modo_precio: ModoPrecio;
  margen_bp?: number;
  multiplicador_bp?: number;
  precio_manual_usd_cents?: number;
  stock_minimo: number;
  unidades_por_paquete?: number;
  foto?: string;
  notas?: string;
}

const MODOS: { valor: ModoPrecio; etiqueta: string }[] = [
  { valor: 'MARGEN', etiqueta: 'Por ganancia %' },
  { valor: 'MULTIPLICADOR', etiqueta: 'Multiplicando' },
  { valor: 'MANUAL', etiqueta: 'Lo escribo yo' },
];

const PASOS = [
  { id: 1, titulo: 'Básico', subtitulo: 'Foto y nombre' },
  { id: 2, titulo: 'Precio', subtitulo: 'Margen y venta' },
  { id: 3, titulo: 'Detalles', subtitulo: 'Tallas y alertas' },
] as const;

type Paso = 1 | 2 | 3;

export const ProductoModal: React.FC<ProductoModalProps> = ({
  abierto,
  producto,
  categorias,
  margenDefectoBp,
  stockMinimoDefecto,
  pasoRedondeo,
  nombreInicial,
  onCerrar,
  onGuardar,
}) => {
  const esNuevo = producto === null;

  const [paso, setPaso] = useState<Paso>(1);
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
  const [stockMinimo, setStockMinimo] = useState(String(stockMinimoDefecto ?? 2));
  const [sePackea, setSePackea] = useState(false);
  const [unidadesPorPack, setUnidadesPorPack] = useState('5');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);

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
        producto.variantes.map((v) => ({ talla: v.talla ?? '', color: v.color ?? '' }))
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
      const pack = producto.unidades_por_paquete ?? 0;
      setSePackea(pack > 1);
      setUnidadesPorPack(String(pack > 1 ? pack : 5));
      setNotas(producto.notas ?? '');
    } else {
      setNombre(nombreInicial ?? '');
      setCategoriaId(categorias[0]?.id);
      setFoto('');
      setTieneVariantes(false);
      setVariantes([]);
      setModoPrecio('MARGEN');
      setOtroModoAbierto(false);
      setMargenTexto('');
      setMultiplicadorTexto('2');
      setPrecioManualTexto('');
      setStockMinimo(String(stockMinimoDefecto));
      setSePackea(false);
      setUnidadesPorPack('5');
      setNotas('');
    }
  }, [abierto, producto, categorias, nombreInicial, stockMinimoDefecto]);

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierto, onCerrar]);

  const margenEfectivoBp = useMemo(() => {
    if (margenTexto.trim()) return Math.round((parsearDecimal(margenTexto) ?? 0) * 100);
    const cat = categorias.find((c) => c.id === categoriaId);
    return cat?.margen_defecto_bp ?? margenDefectoBp;
  }, [margenTexto, categoriaId, categorias, margenDefectoBp]);

  /**
   * El costo real de hoy: valor de la bodega entre las existencias, que ya
   * trae el precio de tienda, el impuesto y el flete de cada paquete. Antes la
   * vista previa usaba el precio de tienda pelado y el margen que se veía acá
   * no era el que se iba a ganar.
   */
  const costoReal = producto?.costo_unitario_usd_cents ?? 0;

  const preview = useMemo(
    () =>
      calcularPrecio({
        costo_unitario_usd_cents: costoReal,
        modo: modoPrecio,
        margen_bp: margenEfectivoBp,
        multiplicador_bp: Math.round((parsearDecimal(multiplicadorTexto) ?? 2) * 10000),
        precio_manual_usd_cents: parsearACentavos(precioManualTexto, { min: 0 }) ?? 0,
        paso_redondeo_usd_cents: pasoRedondeo,
      }),
    [costoReal, modoPrecio, margenEfectivoBp, multiplicadorTexto, precioManualTexto, pasoRedondeo]
  );

  if (!abierto) return null;

  const agregarVariante = () => setVariantes((prev) => [...prev, { talla: '', color: '' }]);

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
    if (p === 1 && !nombre.trim()) {
      setError('Escribí el nombre del producto para continuar.');
      return false;
    }
    if (p === 2 && modoPrecio === 'MANUAL') {
      if (!precioManualTexto.trim()) {
        setError('Escribí el precio de venta.');
        return false;
      }
      if (parsearACentavos(precioManualTexto, { min: 0.01 }) === null) {
        setError('El precio debe ser un monto válido mayor a $0.00.');
        return false;
      }
    }
    if (p === 3) {
      if (tieneVariantes) {
        if (variantes.length === 0) {
          setError('Agregá al menos una talla, color o tono, o desactivá las variantes.');
          return false;
        }
        if (variantes.some((v) => !v.talla.trim() && !v.color.trim())) {
          setError('Cada fila debe tener al menos una talla, medida o tono.');
          return false;
        }
      }
      if (sePackea) {
        const u = parsearDecimal(unidadesPorPack);
        if (u === null || u < 2 || !Number.isInteger(u)) {
          setError('Un pack tiene que traer 2 unidades o más.');
          return false;
        }
      }
    }
    setError(null);
    return true;
  };

  const irAPaso = (nuevo: Paso) => {
    if (nuevo > paso && !validarPaso(paso)) return;
    setError(null);
    setPaso(nuevo);
  };

  const siguientePaso = () => {
    if (!validarPaso(paso)) return;
    if (paso < 3) setPaso((p) => (p + 1) as Paso);
  };

  const anteriorPaso = () => {
    setError(null);
    if (paso > 1) setPaso((p) => (p - 1) as Paso);
  };

  const manejarGuardar = async () => {
    if (!validarPaso(1) || !validarPaso(2) || !validarPaso(3)) return;

    setGuardando(true);
    setError(null);
    try {
      await onGuardar({
        id: producto?.id,
        nombre: formatearNombreEntidad(nombre),
        categoria_id: categoriaId,
        tiene_variantes: tieneVariantes,
        variantes: tieneVariantes
          ? variantes.map((v) => ({
              talla: v.talla.trim() || undefined,
              color: v.color.trim() || undefined,
            }))
          : undefined,
        modo_precio: modoPrecio,
        margen_bp: margenTexto.trim() ? margenEfectivoBp : undefined,
        multiplicador_bp:
          modoPrecio === 'MULTIPLICADOR'
            ? Math.round((parsearDecimal(multiplicadorTexto) ?? 2) * 10000)
            : undefined,
        precio_manual_usd_cents:
          modoPrecio === 'MANUAL'
            ? parsearACentavos(precioManualTexto, { min: 0.01 }) ?? undefined
            : undefined,
        // Un campo vacío no significa "sin mínimo": significa "el de siempre".
        stock_minimo: stockMinimo.trim()
          ? Math.round(parsearDecimal(stockMinimo) ?? stockMinimoDefecto)
          : stockMinimoDefecto,
        unidades_por_paquete: sePackea
          ? Math.round(parsearDecimal(unidadesPorPack) ?? 5)
          : undefined,
        foto,
        notas: notas.trim() || undefined,
      });
      onCerrar();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el producto.');
    } finally {
      setGuardando(false);
    }
  };

  const alPresionarEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;
    if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') return;

    e.preventDefault();
    const campos = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="checkbox"]):not([disabled]), select:not([disabled])'
      )
    ).filter((el) => el.offsetParent !== null);
    const idx = campos.indexOf(target);
    if (idx !== -1 && idx + 1 < campos.length) {
      const siguiente = campos[idx + 1];
      siguiente.focus();
      if (siguiente instanceof HTMLInputElement) siguiente.select?.();
    } else if (paso < 3) {
      siguientePaso();
    } else {
      manejarGuardar();
    }
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 cursor-pointer"
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
          <header className="flex items-center justify-between px-5 py-4 border-b border-borde shrink-0">
            <div>
              <h3 id="titulo-producto" className="text-title text-texto">
                {esNuevo ? 'Producto nuevo' : `Editar ${producto!.nombre}`}
              </h3>
              <p className="text-caption text-texto-3">
                Paso {paso} de 3 · {PASOS[paso - 1].titulo}: {PASOS[paso - 1].subtitulo}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar">
              <X className="w-4 h-4" />
            </Button>
          </header>

          <div className="px-6 py-3 border-b border-borde bg-superficie-2/50 shrink-0">
            <div className="flex items-center justify-between max-w-md mx-auto">
              {PASOS.map((p, idx) => {
                const completado = paso > p.id;
                const activo = paso === p.id;
                return (
                  <React.Fragment key={p.id}>
                    <button
                      type="button"
                      onClick={() => irAPaso(p.id as Paso)}
                      className="flex items-center gap-2 group cursor-pointer text-left focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-caption font-semibold transition-[background-color,border-color,color,box-shadow]',
                          activo
                            ? 'bg-acento text-acento-texto ring-4 ring-acento/20 shadow-sm'
                            : completado
                              ? 'bg-acento/20 text-acento-fuerte'
                              : 'bg-superficie border border-borde text-texto-3 group-hover:border-borde-fuerte'
                        )}
                      >
                        {completado ? <Check className="w-3.5 h-3.5" /> : p.id}
                      </span>
                      <span
                        className={cn(
                          'hidden sm:block text-caption leading-tight',
                          activo
                            ? 'text-texto font-semibold'
                            : completado
                              ? 'text-texto-2 font-medium'
                              : 'text-texto-3'
                        )}
                      >
                        {p.titulo}
                      </span>
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

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3">
                <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
                <p className="text-label text-danger-800">{error}</p>
              </div>
            )}

            {paso === 1 && (
              <div className="space-y-5 animate-fade-in">
                <div className="flex items-start gap-5">
                  <div className="shrink-0">
                    <input
                      ref={archivoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={elegirFoto}
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

                  <div className="flex-1 space-y-4">
                    <Field
                      label="Nombre del producto *"
                      hint="Ej: Camiseta Tommy Hilfiger, Boxers Calvin Klein"
                    >
                      <Input
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        onBlur={() => setNombre((prev) => formatearNombreEntidad(prev))}
                        placeholder="Nombre descriptivo"
                        autoFocus
                      />
                    </Field>
                    <Field label="Categoría" hint="De la categoría sale el margen, si no le ponés uno propio">
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

                <div className="rounded-lg border border-borde bg-superficie-2/40 p-4 flex items-start gap-3">
                  <PackageOpen className="w-4 h-4 text-texto-3 mt-0.5 shrink-0" />
                  <p className="text-caption text-texto-2 leading-relaxed">
                    {esNuevo
                      ? 'Acá va sólo la ficha. Las unidades, lo que costaron en la tienda, el 7% y el flete entran con el paquete que las trae.'
                      : 'El costo de este producto sale de los paquetes que lo trajeron. Si un paquete quedó mal cargado, se corrige desde el paquete.'}
                  </p>
                </div>
              </div>
            )}

            {paso === 2 && (
              <div className="space-y-5 animate-fade-in">
                <div className="rounded-lg border border-borde p-4 bg-superficie">
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <h4 className="text-label font-medium text-texto">Cómo se calcula el precio</h4>
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
                    <div className="flex gap-2 mb-4" role="radiogroup" aria-label="Cómo calcular el precio">
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
                            : `Vacío = el de la categoría (${margenEfectivoBp / 100}%)`
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
                      <Field label="Precio de venta ($)" hint="Se respeta tal cual, sin redondear">
                        <Input
                          value={precioManualTexto}
                          onChange={(e) => setPrecioManualTexto(e.target.value)}
                          placeholder="0.00"
                          className="text-right"
                          inputMode="decimal"
                        />
                      </Field>
                    )}

                    <div
                      className={cn(
                        'rounded-md border p-3.5',
                        preview.bajo_costo && costoReal > 0
                          ? 'border-danger-200 bg-danger-50'
                          : 'border-borde bg-superficie-2'
                      )}
                    >
                      {costoReal > 0 ? (
                        <dl className="space-y-1.5 text-label">
                          <div className="flex justify-between gap-2">
                            <dt className="text-texto-3">Te cuesta</dt>
                            <dd>
                              <Money usd_cents={costoReal} size="sm" soloUsd />
                            </dd>
                          </div>
                          <p className="text-[11px] text-texto-3 leading-snug -mt-0.5">
                            {(producto?.paquetes ?? []).length > 0 || producto?.paquete_id
                              ? 'Tienda + 7% + flete, promedio de lo que tenés'
                              : 'Promedio de lo que tenés'}
                          </p>
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
                          {sePackea && preview.precio_usd_cents > 0 && (
                            <p className="pt-2 mt-1 border-t border-borde text-caption text-texto-2">
                              Pack de {unidadesPorPack}:{' '}
                              <span className="font-medium text-texto">
                                {formatearMoneda(
                                  preview.precio_usd_cents *
                                    Math.max(1, Math.round(parsearDecimal(unidadesPorPack) ?? 5)),
                                  'USD'
                                )}
                              </span>
                            </p>
                          )}
                        </dl>
                      ) : modoPrecio === 'MANUAL' ? (
                        <p className="text-caption text-texto-2 py-2">
                          Lo vendés en{' '}
                          <strong className="text-texto">
                            {formatearMoneda(preview.precio_usd_cents, 'USD')}
                          </strong>
                          . Cuando entre su primer paquete vas a ver cuánto ganás.
                        </p>
                      ) : (
                        <p className="text-caption text-texto-3 py-2 leading-relaxed">
                          Todavía no tiene costo. El precio se calcula solo con este margen
                          cuando entre su primer paquete, y lo vas a ver en el resumen.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {paso === 3 && (
              <div className="space-y-5 animate-fade-in">
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
                      ¿Tiene tallas, colores o tonos?
                    </span>
                  </label>
                  <p className="text-caption text-texto-3 mb-3 pl-6">
                    Para ropa (S, M, L) o maquillaje donde el producto es el mismo y cambia el tono.
                    Las unidades de cada una entran con el paquete.
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
                          <Field label={i === 0 ? 'Color / Tono' : ''} className="flex-1">
                            <Input
                              value={v.color}
                              onChange={(e) => actualizarVariante(i, 'color', e.target.value)}
                              placeholder="Ej: Tono 120, Beige, Rojo..."
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
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-borde p-4 bg-superficie space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sePackea}
                      onChange={(e) => setSePackea(e.target.checked)}
                      className="w-4 h-4 rounded border-borde-fuerte text-acento"
                    />
                    <span className="text-body font-medium text-texto">
                      ¿Se vende también por pack? (boxers, calcetines)
                    </span>
                  </label>
                  {sePackea && (
                    <Field label="Unidades por pack" hint="Se vende suelto o por pack completo">
                      <Input
                        type="number"
                        min="2"
                        value={unidadesPorPack}
                        onChange={(e) => setUnidadesPorPack(e.target.value)}
                        className="text-right max-w-xs"
                      />
                    </Field>
                  )}
                </div>

                <div className="rounded-lg border border-borde p-4 bg-superficie">
                  <Field
                    label="Aviso de stock mínimo"
                    hint="Te avisa en el inicio cuando queden pocas unidades (0 para no avisar)"
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

                <div className="rounded-lg border border-borde p-4 bg-superficie">
                  <Field label="Notas">
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
              {paso < 3 ? (
                <Button variant="primary" onClick={siguientePaso}>
                  <span>Siguiente</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button variant="primary" onClick={manejarGuardar} disabled={guardando}>
                  {guardando ? 'Guardando...' : esNuevo ? 'Crear producto' : 'Guardar cambios'}
                </Button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </Portal>
  );
};
