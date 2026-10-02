import { useEffect, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import type { ProductoConStock } from '@shared/types';
import type { LineaCompraInput } from '@repos/compras.repo';
import { ProductosRepoFirestore } from '@repos/productos.repo';
import { algunoContiene, normalizar } from '@core/texto';
import { parsearACentavos, parsearDecimal } from '@core/numeros';
import { BottomSheet } from './BottomSheet';
import { haptics } from '../lib/haptics';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  onAgregar: (linea: LineaCompraInput) => Promise<void>;
}

const campo = 'mt-1 min-h-12 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto outline-none focus:border-acento';
type Errores = Partial<Record<'producto' | 'variante' | 'cantidad' | 'precio' | 'peso', string>>;

/** Agregar es lo frecuente: al guardar queda lista para la próxima pieza. */
export function PiezaPaqueteSheet({ abierto, onCerrar, onAgregar }: Props) {
  const [productos, setProductos] = useState<ProductoConStock[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [reintento, setReintento] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [producto, setProducto] = useState<ProductoConStock | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [variante, setVariante] = useState<number | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [precio, setPrecio] = useState('');
  const [peso, setPeso] = useState('');
  const [errores, setErrores] = useState<Errores>({});
  const [errorGuardar, setErrorGuardar] = useState('');
  const [agregada, setAgregada] = useState('');
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);
  const formulario = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setCargando(true);
    setErrorCarga('');
    ProductosRepoFirestore.listar({ incluirInactivos: true })
      .then((lista) => { if (vivo) setProductos(lista); })
      .catch(() => { if (vivo) setErrorCarga('No se pudieron cargar los productos.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [abierto, reintento]);

  function limpiar() {
    setBusqueda(''); setProducto(null); setNuevo(false); setVariante(null);
    setCantidad('1'); setPrecio(''); setPeso(''); setErrores({}); setErrorGuardar('');
  }

  const variantes = producto?.variantes.filter((v) => v.activo !== false) ?? [];
  const coincidencias = productos.filter((p) => algunoContiene([p.nombre, p.codigo], busqueda));
  const nombreExacto = productos.some((p) => normalizar(p.nombre) === normalizar(busqueda));
  const hayCambios = Boolean(busqueda || precio || peso || cantidad !== '1');

  function elegir(p: ProductoConStock) {
    haptics.selection();
    setProducto(p); setNuevo(false); setBusqueda(p.nombre); setErrores({});
    const activas = p.variantes.filter((v) => v.activo !== false);
    setVariante(activas.length === 1 ? activas[0].id : null);
  }

  async function agregar() {
    if (ocupado.current) return;
    const unidades = parsearDecimal(cantidad, { min: 1 });
    const centavos = parsearACentavos(precio, { min: 0 });
    const libras = peso.trim() ? parsearDecimal(peso, { min: 0.001 }) : null;
    const fallas: Errores = {};
    if ((!producto && !nuevo) || !busqueda.trim()) fallas.producto = 'Elegí un producto o creá uno con ese nombre.';
    if (producto && variante === null) fallas.variante = 'Elegí la talla o el tono que vino.';
    if (unidades === null || !Number.isSafeInteger(unidades)) fallas.cantidad = 'Escribí una cantidad entera, mayor que cero.';
    if (centavos === null || !Number.isSafeInteger(centavos * (unidades ?? 1))) fallas.precio = 'Escribí lo que pagaste por unidad, en dólares.';
    if (peso.trim() && (libras === null || !Number.isSafeInteger(Math.round(libras * 1000)))) fallas.peso = 'Escribí un peso mayor que cero o dejalo vacío.';
    setErrores(fallas);
    if (Object.keys(fallas).length) {
      haptics.error();
      requestAnimationFrame(() => formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    haptics.impact('medium');
    ocupado.current = true;
    setGuardando(true); setErrorGuardar('');
    try {
      await onAgregar({
        producto_id: producto?.id,
        variante_id: variante ?? undefined,
        descripcion: producto?.nombre ?? busqueda.trim(),
        cantidad: unidades!,
        precio_linea_usd_cents: centavos! * unidades!,
        peso_linea_mlb: libras === null ? null : Math.round(libras * 1000),
        destino: 'INVENTARIO',
      });
      setAgregada(`${producto?.nombre ?? busqueda.trim()}: agregada al paquete.`);
      limpiar();
    } catch (error) {
      setErrorGuardar(error instanceof Error ? error.message : 'No se pudo guardar la pieza. Intentá otra vez.');
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  function cerrar() {
    if (ocupado.current) return;
    limpiar(); setAgregada(''); onCerrar();
  }

  return (
    <BottomSheet abierto={abierto} onCerrar={cerrar} hayCambios={hayCambios} titulo="Agregar pieza"
      subtitulo="Elegí qué vino y cuánto pagaste."
      footer={<button type="button" onClick={agregar} disabled={guardando || cargando || Boolean(errorCarga)}
        className="min-h-12 w-full rounded-xl bg-acento px-4 py-3 text-base font-bold text-acento-texto disabled:opacity-60">
        {guardando ? 'Guardando…' : 'Agregar'}
      </button>}>
      <div ref={formulario} className="space-y-4 p-4">
        {agregada && <p role="status" className="flex gap-2 text-sm text-exito-fuerte"><Check size={18} />{agregada} Podés agregar otra.</p>}
        {errorGuardar && <p role="alert" className="text-sm text-peligro-fuerte">{errorGuardar}</p>}
        <div>
          <label className="block text-sm font-semibold text-texto">Producto
            <input aria-label="Producto" className={campo} value={busqueda} disabled={guardando}
              aria-invalid={Boolean(errores.producto)} aria-describedby={errores.producto ? 'pieza-producto-error' : undefined}
              autoComplete="off" placeholder="Buscá por nombre o código" onChange={(e) => {
                setBusqueda(e.target.value); setProducto(null); setNuevo(false); setVariante(null); setAgregada('');
              }} />
          </label>
          {errores.producto && <p id="pieza-producto-error" className="mt-1 text-sm text-peligro-fuerte">{errores.producto}</p>}
          {cargando && <p className="mt-2 text-sm text-texto-2">Buscando productos…</p>}
          {errorCarga && <div role="alert" className="mt-2 text-sm text-peligro-fuerte">{errorCarga}
            <button type="button" className="ml-2 min-h-11 underline" onClick={() => { haptics.selection(); setReintento((n) => n + 1); }}>Reintentar</button>
          </div>}
          {!producto && !nuevo && !cargando && !errorCarga && busqueda.trim() && <div className="mt-2 overflow-hidden rounded-xl border border-borde">
            {coincidencias.slice(0, 8).map((p) => <button key={p.id} type="button" onClick={() => elegir(p)} disabled={guardando}
              className="flex min-h-12 w-full items-center gap-2 border-b border-borde bg-superficie px-3 py-2 text-left text-sm text-texto last:border-0">
              <Search size={16} className="shrink-0 text-texto-3" />
              <span>{p.nombre}{!p.activo ? ' · descatalogado' : p.existencias <= 0 ? ' · vendido' : ''}</span>
            </button>)}
            {!nombreExacto && <button type="button" disabled={guardando} onClick={() => { haptics.selection(); setNuevo(true); setErrores({}); }}
              className="min-h-12 w-full bg-acento-suave px-3 py-2 text-left text-sm font-bold text-acento-fuerte">Nuevo: {busqueda.trim()}</button>}
          </div>}
          {nuevo && <p className="mt-2 text-sm text-texto-2">Producto nuevo, sin tallas ni tonos. Se crea cuando recibás el paquete.</p>}
        </div>
        {producto && (variantes.length !== 1 || variantes.some((v) => v.talla || v.color)) && <div role="radiogroup" aria-label="Talla o tono" tabIndex={-1} aria-invalid={Boolean(errores.variante)}>
          <p className="mb-2 text-sm font-semibold text-texto">Talla o tono</p>
          <div className="flex flex-wrap gap-2">{variantes.map((v) => <button key={v.id} type="button" role="radio" aria-checked={variante === v.id}
            disabled={guardando} onClick={() => { haptics.selection(); setVariante(v.id); }}
            className={`min-h-11 rounded-xl border px-4 text-base ${variante === v.id ? 'border-acento bg-acento-suave text-acento-fuerte' : 'border-borde bg-superficie text-texto'}`}>
            {[v.talla, v.color].filter(Boolean).join(' · ') || 'Única'}
          </button>)}</div>
          {errores.variante && <p className="mt-1 text-sm text-peligro-fuerte">{errores.variante}</p>}
        </div>}
        {([
          ['cantidad', 'Cantidad', cantidad, setCantidad, 'numeric'],
          ['precio', 'Pagó por unidad ($)', precio, setPrecio, 'decimal'],
          ['peso', 'Peso (lb)', peso, setPeso, 'decimal'],
        ] as const).map(([id, nombre, valor, cambiar, inputMode]) => <div key={id}>
          <label className="block text-sm font-semibold text-texto">{nombre}
            <input aria-label={nombre} inputMode={inputMode} className={campo} value={valor} onChange={(e) => cambiar(e.target.value)}
              disabled={guardando} aria-invalid={Boolean(errores[id])} aria-describedby={`pieza-${id}-ayuda`} />
          </label>
          <p id={`pieza-${id}-ayuda`} className={`mt-1 text-sm ${errores[id] ? 'text-peligro-fuerte' : 'text-texto-2'}`}>
            {errores[id] ?? (id === 'peso' ? 'Opcional: el peso de todas estas unidades juntas. Vacío, se estima como en la PC.' : '')}
          </p>
        </div>)}
      </div>
    </BottomSheet>
  );
}
