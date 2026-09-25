import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Plus, Trash2, AlertTriangle, ImagePlus } from 'lucide-react';
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
 *
 * Es una sola pantalla. Antes eran tres pasos para seis campos, y la mitad
 * del texto explicaba en qué paso se estaba.
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
  { valor: 'MARGEN', etiqueta: 'Ganancia %' },
  { valor: 'MULTIPLICADOR', etiqueta: 'Multiplicar costo' },
  { valor: 'MANUAL', etiqueta: 'Precio fijo' },
];

const CHECK =
  'w-4 h-4 rounded border-borde-fuerte text-acento focus-visible:ring-2 focus-visible:ring-acento';

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

  const [nombre, setNombre] = useState('');
  const [categoriaId, setCategoriaId] = useState<number | undefined>(undefined);
  const [foto, setFoto] = useState('');
  const [tieneVariantes, setTieneVariantes] = useState(false);
  const [variantes, setVariantes] = useState<VarianteBorrador[]>([]);
  const [modoPrecio, setModoPrecio] = useState<ModoPrecio>('MARGEN');
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

    if (producto) {
      setNombre(producto.nombre);
      setCategoriaId(producto.categoria_id);
      setFoto(producto.foto ?? '');
      setTieneVariantes(producto.tiene_variantes);
      setVariantes(
        producto.variantes.map((v) => ({ talla: v.talla ?? '', color: v.color ?? '' }))
      );
      setModoPrecio(producto.modo_precio);
      // `!= null` y no `!== undefined`: al guardar, un margen vacío se
      // escribe como null, y null / 100 daba "0". Se vio en la app instalada:
      // pasar un producto de precio a mano a margen lo dejaba vendiendo a costo.
      setMargenTexto(producto.margen_bp != null ? String(producto.margen_bp / 100) : '');
      setMultiplicadorTexto(
        producto.multiplicador_bp != null ? String(producto.multiplicador_bp / 10000) : '2'
      );
      setPrecioManualTexto(
        producto.precio_manual_usd_cents != null
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

  const margenCategoriaBp = useMemo(() => {
    const cat = categorias.find((c) => c.id === categoriaId);
    return cat?.margen_defecto_bp ?? margenDefectoBp;
  }, [categoriaId, categorias, margenDefectoBp]);

  const margenEfectivoBp = margenTexto.trim()
    ? Math.round((parsearDecimal(margenTexto) ?? 0) * 100)
    : margenCategoriaBp;

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

  const validar = (): boolean => {
    const falla = (texto: string) => {
      setError(texto);
      return false;
    };
    if (!nombre.trim()) return falla('Escribí el nombre del producto.');
    if (modoPrecio === 'MANUAL') {
      if (!precioManualTexto.trim()) return falla('Escribí el precio de venta.');
      if (parsearACentavos(precioManualTexto, { min: 0.01 }) === null) {
        return falla('El precio tiene que ser mayor a $0.00.');
      }
    }
    if (tieneVariantes) {
      if (variantes.length === 0) return falla('Agregá al menos una talla o tono.');
      if (variantes.some((v) => !v.talla.trim() && !v.color.trim())) {
        return falla('Cada fila necesita una talla o un tono.');
      }
    }
    if (sePackea) {
      const u = parsearDecimal(unidadesPorPack);
      if (u === null || u < 2 || !Number.isInteger(u)) {
        return falla('Un pack trae 2 unidades o más.');
      }
    }
    setError(null);
    return true;
  };

  const manejarGuardar = async () => {
    if (!validar()) return;

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

  // Enter pasa al campo siguiente; en el último, guarda.
  const alPresionarEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT') return;
    if ((target as HTMLInputElement).type === 'checkbox') return;

    e.preventDefault();
    const campos = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        'input:not([type="hidden"]):not([type="checkbox"]):not([type="file"]):not([disabled]), select:not([disabled])'
      )
    ).filter((el) => el.offsetParent !== null);
    const idx = campos.indexOf(target);
    if (idx !== -1 && idx + 1 < campos.length) {
      const siguiente = campos[idx + 1];
      siguiente.focus();
      if (siguiente instanceof HTMLInputElement) siguiente.select?.();
    } else {
      manejarGuardar();
    }
  };

  const unidadesPack = Math.max(1, Math.round(parsearDecimal(unidadesPorPack) ?? 5));

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
          className="bg-superficie rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden border border-borde/80 animate-modal-pop cursor-default"
        >
          <header className="flex items-center justify-between px-6 py-4 border-b border-borde shrink-0">
            <h3 id="titulo-producto" className="text-title text-texto truncate">
              {esNuevo ? 'Producto nuevo' : `Editar ${producto!.nombre}`}
            </h3>
            <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar">
              <X className="w-4 h-4" />
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3"
              >
                <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
                <p className="text-label text-danger-800">{error}</p>
              </div>
            )}

            {/* Qué es */}
            <div className="flex items-start gap-4">
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
                  aria-label={foto ? 'Cambiar foto' : 'Agregar foto'}
                  className={cn(
                    'w-[92px] h-[92px] rounded-lg border overflow-hidden flex items-center justify-center',
                    'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
                    foto
                      ? 'border-borde bg-superficie'
                      : 'border-dashed border-borde-fuerte bg-superficie-2 text-texto-3 hover:border-acento hover:text-acento'
                  )}
                >
                  {foto ? (
                    <img src={foto} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus className="w-5 h-5" />
                  )}
                </button>
                {foto && (
                  <button
                    type="button"
                    onClick={() => setFoto('')}
                    className="mt-1 w-[92px] text-caption text-center block text-texto-3 hover:text-danger-700"
                  >
                    Quitar
                  </button>
                )}
              </div>

              <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-3">
                <Field label="Nombre">
                  <Input
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    onBlur={() => setNombre((prev) => formatearNombreEntidad(prev))}
                    placeholder="Ej: Boxers Calvin Klein"
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
                    <option value="">Sin categoría</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>

            {/* Precio */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h4 className="text-label font-semibold text-texto">Precio</h4>
                <div
                  className="inline-flex rounded-lg bg-superficie-2 p-0.5"
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
                        'rounded-md px-3 py-1 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
                        modoPrecio === opcion.valor
                          ? 'bg-superficie text-texto font-medium shadow-2xs'
                          : 'text-texto-3 hover:text-texto'
                      )}
                    >
                      {opcion.etiqueta}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-3 items-start">
                {modoPrecio === 'MARGEN' && (
                  <Field
                    label="Ganancia (%)"
                    hint={margenTexto.trim() ? undefined : 'Vacío: el de la categoría'}
                  >
                    <Input
                      value={margenTexto}
                      onChange={(e) => setMargenTexto(e.target.value)}
                      placeholder={String(margenCategoriaBp / 100)}
                      className="text-right"
                      inputMode="decimal"
                    />
                  </Field>
                )}
                {modoPrecio === 'MULTIPLICADOR' && (
                  <Field label="Costo por" hint="2 = el doble">
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
                  <Field label="Precio de venta ($)">
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
                    'rounded-lg px-4 py-3 sm:mt-[22px] text-label',
                    preview.bajo_costo && costoReal > 0 ? 'bg-danger-50' : 'bg-superficie-2'
                  )}
                >
                  {costoReal > 0 ? (
                    <>
                      <dl className="grid grid-cols-3 gap-2">
                        <div>
                          <dt className="text-caption text-texto-3">Te cuesta</dt>
                          <dd>
                            <Money usd_cents={costoReal} size="sm" soloUsd />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-caption text-texto-3">Se vende en</dt>
                          <dd className="font-semibold text-texto">
                            <Money usd_cents={preview.precio_usd_cents} size="sm" soloUsd />
                          </dd>
                        </div>
                        <div>
                          <dt className="text-caption text-texto-3">Ganás</dt>
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
                      </dl>
                      {preview.bajo_costo && (
                        <p className="mt-2 text-caption text-danger-700">
                          Ese precio está por debajo de lo que te costó.
                        </p>
                      )}
                      {sePackea && preview.precio_usd_cents > 0 && (
                        <p className="mt-2 text-caption text-texto-2">
                          Pack de {unidadesPack}:{' '}
                          <span className="font-medium text-texto">
                            {formatearMoneda(preview.precio_usd_cents * unidadesPack, 'USD')}
                          </span>
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-caption text-texto-3 py-1">
                      {modoPrecio === 'MANUAL'
                        ? 'Vas a ver cuánto ganás cuando entre su primer paquete.'
                        : 'Se calcula cuando entre su primer paquete.'}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Tallas o tonos */}
            <section className="space-y-3 border-t border-borde pt-5">
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={tieneVariantes}
                  onChange={(e) => {
                    setTieneVariantes(e.target.checked);
                    if (e.target.checked && variantes.length === 0) agregarVariante();
                  }}
                  className={CHECK}
                />
                <span className="text-body text-texto">Tiene tallas o tonos</span>
              </label>

              {tieneVariantes && (
                <div className="space-y-2 pl-6">
                  {variantes.map((v, i) => (
                    <div key={i} className="flex items-end gap-2">
                      <Field label={i === 0 ? 'Talla o medida' : ''} className="flex-1">
                        <Input
                          value={v.talla}
                          onChange={(e) => actualizarVariante(i, 'talla', e.target.value)}
                          placeholder="M, 30ml"
                          aria-label={`Talla ${i + 1}`}
                        />
                      </Field>
                      <Field label={i === 0 ? 'Color o tono' : ''} className="flex-1">
                        <Input
                          value={v.color}
                          onChange={(e) => actualizarVariante(i, 'color', e.target.value)}
                          placeholder="Beige, tono 120"
                          aria-label={`Tono ${i + 1}`}
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
                  <Button variant="ghost" size="sm" onClick={agregarVariante} className="-ml-3">
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar otra</span>
                  </Button>
                </div>
              )}
            </section>

            {/* Pack y aviso */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-5 border-t border-borde pt-5">
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={sePackea}
                    onChange={(e) => setSePackea(e.target.checked)}
                    className={CHECK}
                  />
                  <span className="text-body text-texto">También se vende por pack</span>
                </label>
                {sePackea && (
                  <div className="flex items-center gap-2 pl-6">
                    <Input
                      type="number"
                      min="2"
                      value={unidadesPorPack}
                      onChange={(e) => setUnidadesPorPack(e.target.value)}
                      className="text-right w-20"
                      aria-label="Unidades por pack"
                    />
                    <span className="text-label text-texto-3">unidades por pack</span>
                  </div>
                )}
              </div>

              <div>
                <span className="block text-label text-texto-2 mb-1">Avisarme cuando queden</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    value={stockMinimo}
                    onChange={(e) => setStockMinimo(e.target.value)}
                    className="text-right w-20"
                    aria-label="Aviso de stock mínimo"
                  />
                  <span className="text-label text-texto-3">unidades · 0 = no avisar</span>
                </div>
              </div>
            </section>

            <Field label="Notas" className="border-t border-borde pt-5">
              <Textarea
                rows={2}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Tienda, tela, recomendaciones"
              />
            </Field>
          </div>

          <footer className="flex items-center justify-end gap-2 px-6 py-4 border-t border-borde bg-superficie shrink-0">
            <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={manejarGuardar} disabled={guardando}>
              {guardando ? 'Guardando...' : esNuevo ? 'Crear producto' : 'Guardar cambios'}
            </Button>
          </footer>
        </div>
      </div>
    </Portal>
  );
};
