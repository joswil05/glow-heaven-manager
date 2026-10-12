import { useRef, useState } from 'react';
import { Check, ImagePlus, Plus, Search, Trash2 } from 'lucide-react';
import type { Categoria, ModoPrecio, ProductoConStock } from '@shared/types';
import type { LineaCompraInput } from '@repos/compras.repo';
import { ProductosRepoFirestore } from '@repos/productos.repo';
import { algunoContiene, normalizar } from '@core/texto';
import { aMiniatura } from '../../../src/renderer/src/lib/foto';
import { BottomSheet } from './BottomSheet';
import { CamposPieza } from './paquete/CamposPieza';
import { campo, casilla, enfocarError } from './paquete/clases';
import { haptics } from '../lib/haptics';
import { nuevoGrupoEvento } from '../lib/util';
import {
  fichaTieneDatos,
  fichaVacia,
  leerFicha,
  leerPieza,
  nombreDeVariante,
  textosParaProducto,
  type ErroresFicha,
  type ErroresPieza,
  type TextosFicha,
  type TextosPieza,
} from '../lib/paquete-movil';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  /** Los productos, también los vendidos y los descatalogados. Los carga la pantalla una vez. */
  productos: ProductoConStock[];
  cargando: boolean;
  errorCarga: string;
  onReintentar: () => void;
  categorias: Categoria[];
  margenDefectoBp: number;
  taxBp: number;
  stockMinimoDefecto: number;
  /** Guarda las líneas en el paquete. Si falla, lanza y la hoja lo dice. */
  onAgregar: (lineas: LineaCompraInput[]) => Promise<void>;
  /** Un producto nuevo con ficha se crea al agregarlo: la pantalla lo suma a su lista. */
  onProductoCreado: (p: ProductoConStock) => void;
}

const MODOS: { valor: ModoPrecio; etiqueta: string }[] = [
  { valor: 'MARGEN', etiqueta: 'Ganancia %' },
  { valor: 'MULTIPLICADOR', etiqueta: 'Multiplicar' },
  { valor: 'MANUAL', etiqueta: 'Precio fijo' },
];

/**
 * Agregar es lo frecuente: al guardar queda lista para la próxima pieza.
 *
 * Pide lo mismo que la PC: un producto que ya existe (también vendido o
 * descatalogado) o uno nuevo con su ficha, cuántas vinieron (por talla, si
 * tiene), si vino en pack, lo que costó, si la tienda cobró impuesto y el
 * peso. Un producto nuevo con sólo el nombre se crea al recibir el paquete;
 * con categoría, tallas, precio o pack se crea al agregarlo, como en la PC.
 */
export function PiezaPaqueteSheet({
  abierto, onCerrar, productos, cargando, errorCarga, onReintentar, categorias, margenDefectoBp, taxBp, stockMinimoDefecto, onAgregar, onProductoCreado,
}: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [producto, setProducto] = useState<ProductoConStock | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [ficha, setFicha] = useState<TextosFicha>(fichaVacia);
  const [textos, setTextos] = useState<TextosPieza>(() => textosParaProducto(null));
  const [errores, setErrores] = useState<ErroresPieza>({});
  const [erroresFicha, setErroresFicha] = useState<ErroresFicha & { producto?: string; foto?: string }>({});
  const [errorGuardar, setErrorGuardar] = useState('');
  const [agregada, setAgregada] = useState('');
  const [guardando, setGuardando] = useState(false);
  /** "Precio de venta, pack, foto y notas": plegado, se abre solo con un error adentro. */
  const [verMas, setVerMas] = useState(false);
  const ocupado = useRef(false);
  const formulario = useRef<HTMLDivElement>(null);
  const archivo = useRef<HTMLInputElement>(null);

  function limpiar() {
    setBusqueda(''); setProducto(null); setNuevo(false); setFicha(fichaVacia());
    setTextos(textosParaProducto(null)); setErrores({}); setErroresFicha({}); setErrorGuardar(''); setVerMas(false);
  }

  const coincidencias = productos.filter((p) => algunoContiene([p.nombre, p.codigo], busqueda));
  const nombreExacto = productos.some((p) => normalizar(p.nombre) === normalizar(busqueda));
  const tallasNuevas = nuevo && ficha.tieneTallas;
  const hayCambios = Boolean(busqueda) || JSON.stringify(textos) !== JSON.stringify(textosParaProducto(producto))
    || JSON.stringify(ficha) !== JSON.stringify(fichaVacia());

  function elegir(p: ProductoConStock) {
    haptics.selection();
    setProducto(p); setNuevo(false); setBusqueda(p.nombre); setErrores({}); setErroresFicha({});
    setTextos(textosParaProducto(p));
  }

  const cambiarFicha = (parcial: Partial<TextosFicha>, corregido?: keyof ErroresFicha) => {
    setFicha((f) => ({ ...f, ...parcial }));
    if (corregido) setErroresFicha((e) => ({ ...e, [corregido]: undefined, ...(corregido === 'tallas' ? { tallaVacia: undefined } : {}) }));
  };
  const cambiarTalla = (i: number, parcial: Partial<TextosFicha['tallas'][number]>) => {
    cambiarFicha({ tallas: ficha.tallas.map((t, j) => (j === i ? { ...t, ...parcial } : t)) }, 'tallas');
    if ('cantidad' in parcial) setErrores((e) => ({ ...e, cantidad: undefined, fila: undefined }));
  };

  /** Las cantidades: las de la hoja o, con tallas nuevas, las de cada talla. */
  function textosConTallas(t: TextosPieza, variantes?: { id: number }[]): TextosPieza {
    if (!tallasNuevas) return t;
    return {
      ...t,
      filas: ficha.tallas.map((talla, i) => ({ variante_id: variantes?.[i]?.id, nombre: nombreDeVariante(talla) || 'Única', texto: talla.cantidad })),
    };
  }

  async function agregar() {
    if (ocupado.current) return;
    const nombre = busqueda.trim();
    const conFicha = nuevo && fichaTieneDatos(ficha);
    const fallasFicha: ErroresFicha & { producto?: string } = {};
    if ((!producto && !nuevo) || !nombre) fallasFicha.producto = 'Elegí un producto o creá uno con ese nombre.';
    const ficheada = conFicha ? leerFicha(nombre, ficha, stockMinimoDefecto) : null;
    Object.assign(fallasFicha, ficheada?.errores ?? {});
    // Con tallas nuevas, una fila por talla aunque sea una sola: así se valida cada una.
    const paraLeer = textosConTallas(textos);
    const validacion = leerPieza(
      tallasNuevas && paraLeer.filas.length === 1 ? { ...paraLeer, filas: [...paraLeer.filas, { texto: '' }] } : paraLeer,
      { descripcion: nombre, destino: 'INVENTARIO' }
    );
    setErroresFicha(fallasFicha); setErrores(validacion.errores);
    if (Object.keys(fallasFicha).length > 0 || Object.keys(validacion.errores).length > 0) {
      if (fallasFicha.precio || fallasFicha.margen || fallasFicha.multiplicador || fallasFicha.pack) setVerMas(true);
      haptics.error();
      enfocarError(formulario.current);
      return;
    }

    haptics.impact('medium');
    ocupado.current = true;
    setGuardando(true); setErrorGuardar('');
    try {
      let elegido = producto;
      let finales = textos;
      if (conFicha) {
        // Como la PC: la ficha se crea ya, con sus tallas, y cada línea dice
        // cuál vino. Desde acá la hoja queda con ese producto elegido: si lo
        // que sigue falla, reintentar no crea otro igual.
        const nuevoId = await ProductosRepoFirestore.crear(ficheada!.input!, nuevoGrupoEvento());
        const leido = await ProductosRepoFirestore.getById(nuevoId);
        if (!leido) throw new Error('El producto se creó, pero no se pudo leer. Buscalo por su nombre y agregalo.');
        const variantes = [...leido.variantes].sort((a, b) => a.id - b.id);
        finales = tallasNuevas
          ? textosConTallas(textos, variantes)
          : { ...textos, filas: [{ ...textos.filas[0], variante_id: variantes[0]?.id }] };
        elegido = leido;
        onProductoCreado(leido);
        setProducto(leido); setNuevo(false); setBusqueda(leido.nombre); setTextos(finales); setFicha(fichaVacia());
      } else if (elegido) {
        const activa = elegido.variantes.find((v) => v.activo !== false)?.id;
        finales = { ...textos, filas: textos.filas.map((f) => ({ ...f, variante_id: f.variante_id ?? activa })) };
      }
      const { lineas } = leerPieza(finales, elegido
        ? { producto_id: elegido.id, descripcion: elegido.nombre, destino: 'INVENTARIO' }
        // Sólo el nombre: lo crea `recibir`, como siempre.
        : { descripcion: nombre, destino: 'INVENTARIO' });
      await onAgregar(lineas);
      setAgregada(`${elegido?.nombre ?? nombre}: agregada al paquete.`);
      limpiar();
    } catch (error) {
      setErrorGuardar(error instanceof Error ? error.message : 'No se pudo guardar la pieza. Intentá otra vez.');
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  async function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const elegida = e.target.files?.[0];
    e.target.value = '';
    if (!elegida) return;
    try {
      cambiarFicha({ foto: await aMiniatura(elegida) });
      setErroresFicha((x) => ({ ...x, foto: undefined }));
    } catch (error) {
      setErroresFicha((x) => ({ ...x, foto: error instanceof Error ? error.message : 'No se pudo usar esa imagen.' }));
    }
  }

  function cerrar() {
    if (ocupado.current) return;
    limpiar(); setAgregada(''); onCerrar();
  }

  const margenCategoria = categorias.find((c) => c.id === ficha.categoria_id)?.margen_defecto_bp ?? margenDefectoBp;

  return (
    <BottomSheet abierto={abierto} onCerrar={cerrar} hayCambios={hayCambios} ocupado={guardando} titulo="Agregar pieza"
      subtitulo="Elegí qué vino y cuánto pagaste."
      footer={<button type="button" onClick={agregar} disabled={guardando || cargando || Boolean(errorCarga)}
        className="min-h-12 w-full rounded-xl bg-acento px-4 py-3 text-base font-bold text-acento-texto disabled:opacity-60">
        {guardando ? 'Guardando…' : 'Agregar'}
      </button>}>
      <div ref={formulario} className="space-y-4 py-1">
        {agregada && <p role="status" className="flex gap-2 text-sm text-exito-fuerte"><Check size={18} />{agregada} Podés agregar otra.</p>}
        {errorGuardar && <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">{errorGuardar}</p>}
        <div>
          <label className="block text-sm font-semibold text-texto">Producto
            <input aria-label="Producto" className={campo} value={busqueda} disabled={guardando}
              aria-invalid={Boolean(erroresFicha.producto || erroresFicha.nombre)}
              aria-describedby={erroresFicha.producto || erroresFicha.nombre ? 'pieza-producto-error' : undefined}
              autoComplete="off" placeholder="Buscá por nombre o código" onChange={(e) => {
                setBusqueda(e.target.value); setProducto(null); setNuevo(false); setAgregada('');
                setTextos(textosParaProducto(null));
                setErroresFicha((actual) => ({ ...actual, producto: undefined, nombre: undefined }));
              }} />
          </label>
          {(erroresFicha.producto || erroresFicha.nombre) && <p id="pieza-producto-error" className="mt-1 text-sm text-peligro-fuerte">{erroresFicha.producto ?? erroresFicha.nombre}</p>}
          {cargando && <p className="mt-2 text-sm text-texto-2">Buscando productos…</p>}
          {errorCarga && <div role="alert" className="mt-2 text-sm text-peligro-fuerte">{errorCarga}
            <button type="button" className="ml-2 min-h-11 underline" onClick={() => { haptics.selection(); onReintentar(); }}>Reintentar</button>
          </div>}
          {!producto && !nuevo && !cargando && !errorCarga && busqueda.trim() && <div className="mt-2 overflow-hidden rounded-xl border border-borde">
            {coincidencias.slice(0, 8).map((p) => <button key={p.id} type="button" onClick={() => elegir(p)} disabled={guardando}
              className="flex min-h-12 w-full items-center gap-2 border-b border-borde bg-superficie px-3 py-2 text-left text-base text-texto last:border-0">
              <Search size={16} className="shrink-0 text-texto-3" aria-hidden="true" />
              <span className="min-w-0 flex-1">{p.nombre}</span>
              <span className="shrink-0 text-sm text-texto-2">{!p.activo ? 'descatalogado' : p.existencias > 0 ? `${p.existencias} en bodega` : 'vendido'}</span>
            </button>)}
            {!nombreExacto && <button type="button" disabled={guardando} onClick={() => {
              haptics.selection(); setNuevo(true); setErroresFicha({}); setTextos(textosParaProducto(null));
            }}
              className="flex min-h-12 w-full items-center gap-2 bg-acento-suave px-3 py-2 text-left text-base font-bold text-acento-fuerte">
              <Plus size={16} aria-hidden="true" />Nuevo: {busqueda.trim()}</button>}
          </div>}
        </div>

        {nuevo && <section aria-label="Ficha del producto nuevo" className="space-y-4 rounded-2xl border border-borde p-3">
          <p className="text-sm text-texto-2">
            {fichaTieneDatos(ficha)
              ? 'Producto nuevo: se crea al agregarlo, sin unidades. Entran cuando recibás el paquete.'
              : 'Producto nuevo: se crea cuando recibás el paquete.'}
          </p>
          <label className="block text-sm font-semibold text-texto">Categoría
            <select className={campo} value={ficha.categoria_id ?? ''} disabled={guardando}
              onChange={(e) => cambiarFicha({ categoria_id: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Sin categoría</option>
              {categorias.filter((c) => c.activa !== false).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>

          <div>
            <label className="flex min-h-11 items-center gap-3 text-base text-texto">
              <input type="checkbox" className={casilla} checked={ficha.tieneTallas} disabled={guardando} onChange={(e) => {
                cambiarFicha({ tieneTallas: e.target.checked, tallas: e.target.checked && ficha.tallas.length === 0 ? [{ talla: '', color: '', cantidad: '' }] : ficha.tallas }, 'tallas');
                setErrores({});
              }} />
              Tiene tallas o tonos
            </label>
            {ficha.tieneTallas && <div className="mt-2 space-y-3">
              {ficha.tallas.map((t, i) => <div key={i} className="grid grid-cols-[1fr_1fr_5rem_2.75rem] items-end gap-2">
                <label className="text-sm font-semibold text-texto">{i === 0 ? 'Talla o medida' : <span className="sr-only">Talla o medida</span>}
                  <input aria-label={`Talla ${i + 1}`} className={campo} value={t.talla} placeholder="M, 30ml" disabled={guardando}
                    aria-invalid={erroresFicha.tallaVacia === i} onChange={(e) => cambiarTalla(i, { talla: e.target.value })} />
                </label>
                <label className="text-sm font-semibold text-texto">{i === 0 ? 'Color o tono' : <span className="sr-only">Color o tono</span>}
                  <input aria-label={`Tono ${i + 1}`} className={campo} value={t.color} placeholder="Beige" disabled={guardando}
                    onChange={(e) => cambiarTalla(i, { color: e.target.value })} />
                </label>
                <label className="text-sm font-semibold text-texto">{i === 0 ? (textos.enPack ? 'Packs' : 'Vinieron') : <span className="sr-only">Vinieron</span>}
                  <input aria-label={`Cantidad de la talla ${i + 1}`} inputMode="numeric" className={`${campo} text-right`} value={t.cantidad} placeholder="0"
                    disabled={guardando} aria-invalid={errores.fila === i && Boolean(errores.cantidad)}
                    onChange={(e) => cambiarTalla(i, { cantidad: e.target.value })} />
                </label>
                <button type="button" aria-label={`Quitar la talla ${i + 1}`} disabled={guardando}
                  onClick={() => { haptics.selection(); cambiarFicha({ tallas: ficha.tallas.filter((_, j) => j !== i) }, 'tallas'); }}
                  className="flex h-12 w-11 items-center justify-center rounded-xl border border-borde text-texto-2"><Trash2 size={18} /></button>
              </div>)}
              <button type="button" disabled={guardando} onClick={() => { haptics.selection(); cambiarFicha({ tallas: [...ficha.tallas, { talla: '', color: '', cantidad: '' }] }, 'tallas'); }}
                className="flex min-h-11 items-center gap-2 text-base font-semibold text-acento-fuerte"><Plus size={18} />Agregar otra</button>
              {(erroresFicha.tallas || errores.cantidad) && <p role="alert" className="text-sm text-peligro-fuerte">{erroresFicha.tallas ?? errores.cantidad}</p>}
            </div>}
          </div>

          <details open={verMas} onToggle={(e) => setVerMas(e.currentTarget.open)} className="rounded-xl border border-borde bg-superficie-2">
            <summary className="min-h-12 cursor-pointer px-3 py-3 text-base font-semibold text-texto">Precio de venta, pack, foto y notas</summary>
            <div className="space-y-4 border-t border-borde p-3">
              <div>
                <p id="ficha-modo" className="text-sm font-semibold text-texto">Cómo se calcula el precio</p>
                <div role="radiogroup" aria-labelledby="ficha-modo" className="mt-1 grid grid-cols-3 gap-1 rounded-xl bg-superficie p-1">
                  {MODOS.map((m) => <button key={m.valor} type="button" role="radio" aria-checked={ficha.modo === m.valor} disabled={guardando}
                    onClick={() => { haptics.selection(); cambiarFicha({ modo: m.valor }, 'precio'); }}
                    className={`min-h-11 rounded-lg text-sm font-semibold ${ficha.modo === m.valor ? 'bg-acento-suave text-acento-fuerte' : 'text-texto-2'}`}>{m.etiqueta}</button>)}
                </div>
              </div>
              {ficha.modo === 'MARGEN' && <label className="block text-sm font-semibold text-texto">Ganancia (%)
                <input inputMode="decimal" className={campo} value={ficha.margen} disabled={guardando} aria-invalid={Boolean(erroresFicha.margen)}
                  placeholder={String(margenCategoria / 100)}
                  onChange={(e) => cambiarFicha({ margen: e.target.value }, 'margen')} />
                <span className={`mt-1 block text-sm font-normal ${erroresFicha.margen ? 'text-peligro-fuerte' : 'text-texto-2'}`}>{erroresFicha.margen ?? 'Vacía: la de la categoría o la de Configuración.'}</span>
              </label>}
              {ficha.modo === 'MULTIPLICADOR' && <label className="block text-sm font-semibold text-texto">El costo por
                <input inputMode="decimal" className={campo} value={ficha.multiplicador} disabled={guardando} aria-invalid={Boolean(erroresFicha.multiplicador)}
                  onChange={(e) => cambiarFicha({ multiplicador: e.target.value }, 'multiplicador')} />
                <span className={`mt-1 block text-sm font-normal ${erroresFicha.multiplicador ? 'text-peligro-fuerte' : 'text-texto-2'}`}>{erroresFicha.multiplicador ?? '2 es el doble de lo que costó.'}</span>
              </label>}
              {ficha.modo === 'MANUAL' && <label className="block text-sm font-semibold text-texto">Precio de venta ($)
                <input inputMode="decimal" className={campo} value={ficha.precioFijo} placeholder="0.00" disabled={guardando} aria-invalid={Boolean(erroresFicha.precio)}
                  onChange={(e) => cambiarFicha({ precioFijo: e.target.value }, 'precio')} />
                <span className={`mt-1 block text-sm font-normal ${erroresFicha.precio ? 'text-peligro-fuerte' : 'text-texto-2'}`}>{erroresFicha.precio ?? 'No cambia cuando llegue otro paquete.'}</span>
              </label>}

              <div>
                <label className="flex min-h-11 items-center gap-3 text-base text-texto">
                  <input type="checkbox" className={casilla} checked={ficha.sePackea} disabled={guardando}
                    onChange={(e) => cambiarFicha({ sePackea: e.target.checked }, 'pack')} />
                  También se vende por pack
                </label>
                {ficha.sePackea && <label className="mt-1 block text-sm font-semibold text-texto">Unidades por pack que vendés
                  <input inputMode="numeric" className={campo} value={ficha.unidadesPorPack} disabled={guardando} aria-invalid={Boolean(erroresFicha.pack)}
                    onChange={(e) => cambiarFicha({ unidadesPorPack: e.target.value }, 'pack')} />
                  {erroresFicha.pack && <span className="mt-1 block text-sm font-normal text-peligro-fuerte">{erroresFicha.pack}</span>}
                </label>}
              </div>

              <div>
                <input ref={archivo} type="file" accept="image/*" className="hidden" onChange={elegirFoto} />
                <div className="flex items-center gap-3">
                  {ficha.foto
                    ? <img src={ficha.foto} alt="" className="h-16 w-16 rounded-xl border border-borde object-cover" />
                    : <span className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-borde-fuerte text-texto-3"><ImagePlus size={22} /></span>}
                  <button type="button" disabled={guardando} className="min-h-11 text-base font-semibold text-acento-fuerte"
                    onClick={() => { haptics.selection(); archivo.current?.click(); }}>{ficha.foto ? 'Cambiar foto' : 'Agregar foto'}</button>
                  {ficha.foto && <button type="button" disabled={guardando} className="min-h-11 text-base text-texto-2"
                    onClick={() => { haptics.selection(); cambiarFicha({ foto: '' }); }}>Quitar</button>}
                </div>
                {erroresFicha.foto && <p role="alert" className="mt-1 text-sm text-peligro-fuerte">{erroresFicha.foto}</p>}
              </div>

              <label className="block text-sm font-semibold text-texto">Notas del producto
                <textarea className={`${campo} min-h-20`} value={ficha.notas} placeholder="Tienda, tela, recomendaciones" disabled={guardando}
                  onChange={(e) => cambiarFicha({ notas: e.target.value })} />
              </label>
            </div>
          </details>
        </section>}

        {(producto || nuevo) && <CamposPieza id="pieza" textos={textos} onCambiar={setTextos} errores={errores}
          onCorregido={(c) => setErrores((e) => ({ ...e, [c]: undefined, ...(c === 'cantidad' ? { fila: undefined } : {}) }))}
          deshabilitado={guardando} permitirPack taxBp={taxBp} sinCantidades={tallasNuevas} />}
      </div>
    </BottomSheet>
  );
}
