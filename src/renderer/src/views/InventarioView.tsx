import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  History,
  Boxes,
  TrendingUp,
  AlertTriangle,
  X,
  RotateCcw,
  Copy,
  FileEdit,
  Archive,
  MoreVertical,
  PackagePlus,
  Tag,
  Receipt,
} from 'lucide-react';
import type {
  ProductoConStock,
  Categoria,
  ParametrosSistema,
  MovimientoInventario,
  EntradaDeProducto,
} from '../../../shared/types';
import {
  Card,
  CardContent,
  Button,
  Badge,
  Money,
  Porcentaje,
  Input,
  Select,
  StatTile,
  DataTable,
  Confirmar,
  ContextMenu,
  type Column,
} from '../components/ui';
import { EmptyState } from '../components/shared/EmptyState';
import { ProductoModal, type DatosProducto } from './inventario/ProductoModal';
import { AjustarStockModal, type AjusteStock } from './inventario/AjustarStockModal';
import { RevisarPreciosModal, preciosParaRevisar } from './inventario/RevisarPreciosModal';
import { PaquetesView } from './PaquetesView';
import { useClickOutside } from '../lib/useClickOutside';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { formatearMoneda, formatearFecha } from '@core/moneda';

/**
 * Inventario y paquetes, en una sola sección.
 *
 * Son la misma pregunta vista de dos lados: Productos dice lo que hay y cuánto
 * vale; Paquetes dice de dónde vino y cuánto se pagó. La mercadería entra sólo
 * por un paquete, así que el botón principal de las dos pestañas es registrar
 * uno.
 */
export type PestanaInventario = 'productos' | 'paquetes';

interface InventarioViewProps {
  categorias: Categoria[];
  parametros: ParametrosSistema | null;
  productoInicialId?: number;
  pestana: PestanaInventario;
  /** Abre el editor de paquete al entrar a la pestaña Paquetes. */
  abrirEditorPaquete?: boolean;
  onCambiarPestana: (pestana: PestanaInventario, abrirEditor?: boolean) => void;
  onCambio: () => void;
}

type Filtro = 'TODOS' | 'CON_STOCK' | 'BAJO_STOCK' | 'AGOTADOS' | 'DESCATALOGADOS';

export const InventarioView: React.FC<InventarioViewProps> = (props) => {
  const { pestana, onCambiarPestana, categorias, parametros, abrirEditorPaquete, onCambio } = props;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 pt-3 shrink-0">
        <div
          role="tablist"
          aria-label="Inventario"
          className="max-w-[1500px] mx-auto flex items-center gap-1 border-b border-borde"
        >
          {(
            [
              { id: 'productos', etiqueta: 'Productos' },
              { id: 'paquetes', etiqueta: 'Paquetes' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={pestana === t.id}
              onClick={() => onCambiarPestana(t.id)}
              className={cn(
                'inline-flex items-center px-3.5 py-2 -mb-px border-b-2 text-label font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento rounded-t-lg',
                pestana === t.id
                  ? 'border-acento text-texto'
                  : 'border-transparent text-texto-3 hover:text-texto'
              )}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {pestana === 'paquetes' ? (
        <PaquetesView
          parametros={parametros}
          categorias={categorias}
          abrirEditorAlEntrar={abrirEditorPaquete}
          onCambio={onCambio}
        />
      ) : (
        <ProductosDelInventario {...props} />
      )}
    </div>
  );
};

const ProductosDelInventario: React.FC<InventarioViewProps> = ({
  categorias,
  parametros,
  productoInicialId,
  onCambiarPestana,
  onCambio,
}) => {
  const { showToast, showUndoToast } = useToast();

  const [productos, setProductos] = useState<ProductoConStock[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [categoriaFiltro, setCategoriaFiltro] = useState<number | undefined>(undefined);
  /**
   * De qué paquete mirar la bodega.
   *
   * El negocio funciona por tandas: se vende casi todo y llega un paquete
   * nuevo que renueva el inventario. "¿Qué hay del último paquete?" es la
   * pregunta de todos los días, y hasta ahora había que acordarse de memoria.
   */
  const [paqueteFiltro, setPaqueteFiltro] = useState<number | 'SIN_PAQUETE' | undefined>(
    undefined
  );
  const [paquetes, setPaquetes] = useState<
    { id: number; codigo: string; fecha: string; estado: string }[]
  >([]);
  const [verTodosLosPaquetes, setVerTodosLosPaquetes] = useState(false);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoEditando, setProductoEditando] = useState<ProductoConStock | null>(null);
  const [archivando, setArchivando] = useState<ProductoConStock | null>(null);
  const [eliminandoDefinitivo, setEliminandoDefinitivo] = useState<ProductoConStock | null>(null);
  const [menuContextual, setMenuContextual] = useState<{
    x: number;
    y: number;
    producto: ProductoConStock;
  } | null>(null);
  const [ajustando, setAjustando] = useState<AjusteStock | null>(null);
  const [detalleId, setDetalleId] = useState<number | undefined>(productoInicialId);
  const lateralRef = useClickOutside<HTMLElement>(Boolean(detalleId), () => setDetalleId(undefined));
  const [movimientos, setMovimientos] = useState<MovimientoInventario[]>([]);
  /** Los paquetes en los que vino el producto que se está mirando. */
  const [entradas, setEntradas] = useState<EntradaDeProducto[]>([]);
  const [revisandoPrecios, setRevisandoPrecios] = useState(false);
  const [todosLosProductos, setTodosLosProductos] = useState<ProductoConStock[]>([]);

  const hayFiltroActivo = Boolean(
    busqueda.trim() || categoriaFiltro !== undefined || filtro !== 'TODOS' || paqueteFiltro !== undefined
  );

  const cargarTotalesGenerales = useCallback(async () => {
    if (todosLosProductos.length > 0) return;
    try {
      const r = await window.api.productos.list({});
      if (r.success) {
        setTodosLosProductos(r.data);
      }
    } catch {
      // Ignorar error de fondo en cálculo general
    }
  }, [todosLosProductos.length]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await window.api.productos.list({
        busqueda: busqueda.trim() || undefined,
        categoria_id: categoriaFiltro,
        soloConStock: filtro === 'CON_STOCK',
        soloBajoStock: filtro === 'BAJO_STOCK',
        soloInactivos: filtro === 'DESCATALOGADOS',
        paquete_id: paqueteFiltro,
      });
      if (r.success) {
        let items = r.data;
        if (
          !busqueda.trim() &&
          categoriaFiltro === undefined &&
          filtro === 'TODOS' &&
          paqueteFiltro === undefined
        ) {
          setTodosLosProductos(items);
        }
        if (filtro === 'AGOTADOS') {
          items = items.filter((p) => p.existencias === 0);
        }
        setProductos(items);
      } else {
        showToast({ message: r.error, type: 'error' });
      }
    } finally {
      setCargando(false);
    }
  }, [busqueda, categoriaFiltro, filtro, paqueteFiltro, showToast]);

  // Los paquetes para el selector. Se leen una vez al entrar: son pocos —uno
  // cada tanto— y sólo interesan los recibidos, porque un borrador todavía no
  // trajo nada a la bodega.
  useEffect(() => {
    let vivo = true;
    window.api.compras
      .list()
      .then((r) => {
        if (!vivo || !r.success) return;
        setPaquetes(
          r.data
            .map((c) => ({ id: c.id, codigo: c.codigo, fecha: c.fecha, estado: c.estado }))
            .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.id - a.id)
        );
      })
      .catch(() => {
        /* el selector simplemente no aparece */
      });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (hayFiltroActivo && todosLosProductos.length === 0) {
      cargarTotalesGenerales();
    }
  }, [hayFiltroActivo, todosLosProductos.length, cargarTotalesGenerales]);

  useEffect(() => {
    const t = setTimeout(cargar, busqueda ? 200 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  useEffect(() => {
    setDetalleId(productoInicialId);
  }, [productoInicialId]);

  useEffect(() => {
    if (!detalleId) {
      setMovimientos([]);
      setEntradas([]);
      return;
    }
    window.api.productos.movimientos(detalleId).then((r) => {
      if (r.success) setMovimientos(r.data);
    });
    window.api.compras.historialProducto(detalleId).then((r) => {
      if (r.success) setEntradas(r.data);
    });
  }, [detalleId, productos]);

  const totalesGenerales = useMemo(() => {
    const fuente = todosLosProductos.length > 0 ? todosLosProductos : productos;
    const activos = fuente.filter((p) => p.activo !== false);
    const unidades = activos.reduce((a, p) => a + (p.existencias || 0), 0);
    const valor = activos.reduce((a, p) => {
      const v =
        p.valor_inventario_usd_cents && p.valor_inventario_usd_cents > 0
          ? p.valor_inventario_usd_cents
          : (p.existencias || 0) * (p.costo_unitario_usd_cents || 0);
      return a + (v || 0);
    }, 0);
    return { unidades, valor };
  }, [todosLosProductos, productos]);

  const totales = useMemo(() => {
    const unidades = productos.reduce((a, p) => a + (p.existencias || 0), 0);
    const valorDe = (p: ProductoConStock) =>
      p.valor_inventario_usd_cents && p.valor_inventario_usd_cents > 0
        ? p.valor_inventario_usd_cents
        : (p.existencias || 0) * (p.costo_unitario_usd_cents || 0);
    const valor = productos.reduce((a, p) => a + (valorDe(p) || 0), 0);
    // Lo que entraría vendiendo todo menos lo que vale al costo. Antes se
    // multiplicaba la ganancia por unidad —que usa el costo redondeado— y la
    // suma se iba unos centavos. Lo descatalogado no se va a vender.
    const gananciaPotencial = productos
      .filter((p) => p.activo !== false)
      .reduce(
        (a, p) => a + (p.precio_venta_usd_cents || 0) * (p.existencias || 0) - (valorDe(p) || 0),
        0
      );
    return { unidades, valor, gananciaPotencial };
  }, [productos]);

  /** Los precios que no corresponden a su costo, calculados sin leer nada más. */
  const precios = useMemo(
    () =>
      preciosParaRevisar(
        todosLosProductos.length > 0 ? todosLosProductos : productos,
        categorias,
        parametros
      ),
    [todosLosProductos, productos, categorias, parametros]
  );

  const guardar = async (datos: DatosProducto) => {
    const r = datos.id
      ? await window.api.productos.actualizar(datos as never)
      : await window.api.productos.crear(datos as never);

    if (!r.success) throw new Error(r.error);
    // Después de crear o editar, la lista completa también cambió: la de los
    // totales se relee, no se reusa.
    setTodosLosProductos([]);

    showUndoToast(
      datos.id ? 'Producto actualizado' : `${datos.nombre} creado`,
      () => {
        cargar();
        cargarTotalesGenerales();
        onCambio();
      },
      r.data.evento_grupo_id
    );
    await Promise.all([cargar(), cargarTotalesGenerales()]);
    onCambio();
  };

  const ajustarStock = async (ajuste: AjusteStock, nuevas: number, motivo: string) => {
    const r = await window.api.productos.ajustarStock(
      ajuste.variante_id,
      nuevas,
      motivo,
      ajuste.producto_id
    );
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(
      `Existencias ajustadas a ${nuevas}`,
      () => {
        cargar();
        cargarTotalesGenerales();
        onCambio();
      },
      r.data.evento_grupo_id
    );
    await Promise.all([cargar(), cargarTotalesGenerales()]);
    onCambio();
  };

  const archivar = async (p: ProductoConStock) => {
    const r = await window.api.productos.archivar(p.id);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(
      `${p.nombre} descatalogado`,
      () => {
        cargar();
        cargarTotalesGenerales();
        onCambio();
      },
      r.data.evento_grupo_id
    );
    await Promise.all([cargar(), cargarTotalesGenerales()]);
    onCambio();
  };

  const reactivar = async (p: ProductoConStock) => {
    const r = await window.api.productos.reactivar(p.id);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(
      `${p.nombre} reactivado`,
      () => {
        cargar();
        cargarTotalesGenerales();
        onCambio();
      },
      r.data.evento_grupo_id
    );
    await Promise.all([cargar(), cargarTotalesGenerales()]);
    onCambio();
  };

  const eliminarDefinitivo = async (p: ProductoConStock) => {
    const r = await window.api.productos.eliminarDefinitivo(p.id);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showToast({
      message: `${p.nombre} eliminado`,
      type: 'success',
    });
    await Promise.all([cargar(), cargarTotalesGenerales()]);
    onCambio();
  };

  /** El código del paquete (PQ-0007) a partir de su número. */
  const codigoDePaquete = (id?: number): string | undefined =>
    id ? paquetes.find((q) => q.id === id)?.codigo : undefined;

  /**
   * Los paquetes que vale la pena ofrecer en el filtro.
   *
   * Los recibidos, más cualquiera al que un producto apunte. Esos segundos son
   * el caso de anotar el paquete sólo con el flete y cargar los productos a
   * mano: el paquete sigue en borrador hasta que se lo cierra, pero su
   * mercadería ya está en la bodega y hay que poder verla.
   *
   * Un borrador vacío que nadie referencia no aparece: filtrar por él no
   * mostraría nada.
   */
  /** Cuántos paquetes se ofrecen antes de pedir "ver más". */
  const PAQUETES_VISIBLES = 8;

  const paquetesDelFiltro = useMemo(() => {
    const referenciados = new Set(
      (todosLosProductos.length > 0 ? todosLosProductos : productos)
        .map((p) => p.paquete_id)
        .filter((id): id is number => Boolean(id))
    );
    return paquetes.filter((q) => q.estado === 'RECIBIDA' || referenciados.has(q.id));
  }, [paquetes, productos, todosLosProductos]);

  const paquetesVisibles = useMemo(
    () => (verTodosLosPaquetes ? paquetesDelFiltro : paquetesDelFiltro.slice(0, PAQUETES_VISIBLES)),
    [paquetesDelFiltro, verTodosLosPaquetes]
  );

  const columnas: Column<ProductoConStock>[] = [
    {
      key: 'nombre',
      header: 'Producto',
      render: (p) => (
        <div className="flex items-center gap-3 min-w-0">
          {p.foto ? (
            <img
              src={p.foto}
              alt=""
              className="w-9 h-9 rounded-lg object-cover border border-borde/80 shrink-0"
            />
          ) : (
            <div
              aria-hidden="true"
              className="w-9 h-9 rounded-lg bg-superficie-2 flex items-center justify-center shrink-0"
            >
              <Package className="w-4 h-4 text-texto-3/70" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-body font-medium text-texto truncate">{p.nombre}</div>
            <div className="text-caption text-texto-3 flex items-center gap-1.5 truncate">
              <span className="tabular">{p.codigo}</span>
              {p.categoria_nombre && <span>· {p.categoria_nombre}</span>}
              {p.tiene_variantes && <span>· {p.variantes.length} variante(s)</span>}
              {/* De qué paquete vino. Es la pregunta que se hace mirando el
                  estante, así que va en la fila y no escondida en el detalle. */}
              {codigoDePaquete(p.paquete_id) && (
                <span className="text-acento-fuerte">· {codigoDePaquete(p.paquete_id)}</span>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'existencias',
      header: 'Existencias',
      align: 'right',
      width: '130px',
      render: (p) => (
        <Badge
          tone={
            !p.activo
              ? 'neutral'
              : p.existencias === 0
                ? 'danger'
                : p.stock_minimo > 0 && p.existencias <= p.stock_minimo
                  ? 'warning'
                  : 'neutral'
          }
        >
          {!p.activo ? 'Descatalogado' : p.existencias === 0 ? 'Agotado' : `${p.existencias} unid.`}
        </Badge>
      ),
    },
    {
      key: 'costo',
      header: 'Te cuesta',
      align: 'right',
      width: '120px',
      // Con 7% y flete adentro. De dónde sale está en el detalle, paquete por
      // paquete; repetirlo en cada fila no agregaba nada.
      render: (p) => <Money usd_cents={p.costo_unitario_usd_cents} size="sm" soloUsd />,
    },
    {
      key: 'precio',
      header: 'Lo vendés en',
      align: 'right',
      width: '130px',
      render: (p) => <Money usd_cents={p.precio_venta_usd_cents} size="sm" soloUsd />,
    },
    {
      key: 'ganancia',
      header: 'Ganás',
      align: 'right',
      width: '150px',
      render: (p) => {
        const margen =
          p.costo_unitario_usd_cents > 0
            ? Math.round((p.ganancia_unitaria_usd_cents * 10000) / p.costo_unitario_usd_cents)
            : 0;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Money
              usd_cents={p.ganancia_unitaria_usd_cents}
              size="sm"
              soloUsd
              colorearSigno
            />
            {p.costo_unitario_usd_cents > 0 && (
              <Badge tone={p.ganancia_unitaria_usd_cents < 0 ? 'danger' : 'success'}>
                <Porcentaje bp={margen} />
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      width: '120px',
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          {!p.activo ? (
            <div className="flex items-center justify-end gap-1">
              <Button
                size="sm"
                variant="outline"
                className="text-acento bg-acento/10 border-acento/30 hover:bg-acento/20 hover:text-acento transition-[background-color,border-color,color,box-shadow,transform,opacity] font-medium rounded-lg shadow-2xs h-7 text-xs px-2.5"
                onClick={(e) => {
                  e.stopPropagation();
                  reactivar(p);
                }}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                <span>Reactivar</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="Eliminar definitivamente de la base de datos"
                aria-label={`Eliminar definitivamente ${p.nombre}`}
                className="text-texto-3 hover:text-danger hover:bg-danger/10 rounded-lg p-1.5 h-7 w-7 flex items-center justify-center cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setEliminandoDefinitivo(p);
                }}
              >
                <Trash2 className="w-3.5 h-3.5 text-danger" />
              </Button>
            </div>
          ) : (
            // Editar, ajustar y descatalogar viven en este menú y en el
            // detalle. Tres botones de texto en cada fila eran la mitad del
            // ruido de la tabla, y descatalogar no merece estar a un clic.
            <Button
              size="sm"
              variant="ghost"
              className="p-1 text-texto-3 hover:text-texto rounded-lg h-7 w-7 flex items-center justify-center cursor-pointer"
              title="Opciones"
              aria-label={`Opciones de ${p.nombre}`}
              onClick={(e) => {
                e.stopPropagation();
                setMenuContextual({ x: e.clientX, y: e.clientY, producto: p });
              }}
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const detalle = productos.find((p) => p.id === detalleId);

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:px-6 md:py-4 animate-fade-in scroll-smooth">
        <div className="max-w-[1500px] w-full mx-auto space-y-4 stagger-children">
        {/* El título ya está en la barra de arriba: acá sólo lo que se hace. */}
        <div className="flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <span className="text-label text-texto-3 tabular">
            {productos.length} producto{productos.length === 1 ? '' : 's'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-xl"
              title="Sólo la ficha: las unidades entran con un paquete"
              onClick={() => {
                setProductoEditando(null);
                setModalAbierto(true);
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Producto nuevo</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              className="rounded-xl shadow-xs"
              onClick={() => onCambiarPestana('paquetes', true)}
            >
              <PackagePlus className="w-4 h-4" />
              <span>Registrar paquete</span>
            </Button>
          </div>
        </div>

        {precios.length > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-alerta-suave px-4 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <Tag className="w-4 h-4 text-alerta shrink-0" />
              <p className="text-label text-alerta">
                {precios.length === 1
                  ? '1 precio no corresponde a su costo.'
                  : `${precios.length} precios no corresponden a su costo.`}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="rounded-lg shrink-0"
              onClick={() => setRevisandoPrecios(true)}
            >
              Revisar precios
            </Button>
          </div>
        )}

        {/* Métricas ejecutivas unificadas con el inicio */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 stagger-children">
          <StatTile
            label={hayFiltroActivo ? 'Invertido (en filtro)' : 'Invertido en bodega'}
            usd_cents={hayFiltroActivo ? totales.valor : totalesGenerales.valor}
            tone="purple"
            icon={Boxes}
            hint={
              hayFiltroActivo
                ? `${totales.unidades} unid. de ${formatearMoneda(totalesGenerales.valor, 'USD')} en total`
                : `${totalesGenerales.unidades} ${totalesGenerales.unidades === 1 ? 'unidad' : 'unidades'}`
            }
            onClick={() => {
              setFiltro('TODOS');
              setCategoriaFiltro(undefined);
              setBusqueda('');
            }}
          />
          <StatTile
            label={hayFiltroActivo ? 'Ganancia potencial (en filtro)' : 'Ganancia potencial'}
            usd_cents={totales.gananciaPotencial}
            tone="success"
            icon={TrendingUp}
            hint="Si vendés todo a los precios de hoy"
            onClick={() => {
              setFiltro('TODOS');
            }}
          />
          <StatTile
            label="Stock por agotarse"
            value={
              productos.filter((p) => p.stock_minimo > 0 && p.existencias <= p.stock_minimo).length
            }
            tone={
              productos.some((p) => p.stock_minimo > 0 && p.existencias <= p.stock_minimo)
                ? 'danger'
                : 'success'
            }
            icon={AlertTriangle}
            hint={filtro === 'BAJO_STOCK' ? 'Filtrando: tocá para ver todo' : undefined}
            onClick={() => setFiltro(filtro === 'BAJO_STOCK' ? 'TODOS' : 'BAJO_STOCK')}
            className={filtro === 'BAJO_STOCK' ? 'ring-2 ring-danger-500/50' : undefined}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-texto-3 pointer-events-none" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o código..."
              className="pl-9 pr-9"
              aria-label="Buscar productos"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-texto-3 hover:text-texto rounded-md transition-colors"
                aria-label="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <Select
            value={categoriaFiltro ?? ''}
            onChange={(e) =>
              setCategoriaFiltro(e.target.value ? Number(e.target.value) : undefined)
            }
            className="w-auto min-w-[160px]"
            aria-label="Filtrar por categoría"
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>

          {/* De qué paquete mirar la bodega.
              Sólo aparece si hay paquetes recibidos: un selector vacío no
              explica nada y ocupa lugar. */}
          {paquetesDelFiltro.length > 0 && (
            <Select
              value={paqueteFiltro === undefined ? '' : String(paqueteFiltro)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'VER_MAS') {
                  setVerTodosLosPaquetes(true);
                  return;
                }
                setPaqueteFiltro(v === '' ? undefined : v === 'SIN_PAQUETE' ? 'SIN_PAQUETE' : Number(v));
              }}
              className="w-auto min-w-[175px]"
              aria-label="Filtrar por paquete"
            >
              <option value="">Todos los paquetes</option>
              {paquetesVisibles.map((p, i) => (
                <option key={p.id} value={p.id}>
                  {p.codigo}
                  {i === 0 ? ' (el último)' : ''}
                </option>
              ))}
              {/* Con un paquete por mes, a los tres años son treinta y seis en
                  una lista. Se muestran los últimos y el resto se pide. */}
              {!verTodosLosPaquetes && paquetesDelFiltro.length > PAQUETES_VISIBLES && (
                <option value="VER_MAS">
                  Ver los {paquetesDelFiltro.length - PAQUETES_VISIBLES} anteriores…
                </option>
              )}
              <option value="SIN_PAQUETE">Cargados a mano</option>
            </Select>
          )}

          {/* Segmented Pill Control */}
          <div className="inline-flex items-center p-1 bg-superficie-2/80 rounded-xl border border-borde/70 text-caption font-medium">
            {(
              [
                { id: 'TODOS', etiqueta: 'Todos' },
                { id: 'CON_STOCK', etiqueta: 'Con existencias' },
                { id: 'BAJO_STOCK', etiqueta: 'Por acabarse' },
                { id: 'AGOTADOS', etiqueta: 'Agotados' },
                { id: 'DESCATALOGADOS', etiqueta: 'Descatalogados' },
              ] as { id: Filtro; etiqueta: string }[]
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                aria-pressed={filtro === f.id}
                className={cn(
                  'px-3 py-1.5 rounded-lg transition-[background-color,border-color,color,box-shadow,transform,opacity] text-label pill-interactive active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
                  filtro === f.id
                    ? 'bg-superficie text-texto font-semibold shadow-xs border border-borde/50'
                    : 'text-texto-3 hover:text-texto hover:bg-superficie/50'
                )}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {cargando ? (
          <div className="p-12 text-center text-body text-texto-3">Cargando inventario...</div>
        ) : productos.length === 0 ? (
          <EmptyState
            icon={Package}
            title={busqueda || filtro !== 'TODOS' ? 'Nada coincide' : 'Tu inventario está vacío'}
            description={
              busqueda || filtro !== 'TODOS'
                ? 'Probá con otra búsqueda o quitá los filtros.'
                : 'La mercadería entra con un paquete: registrá el que llegó, con lo que trajo y lo que costó.'
            }
            action={
              !busqueda && filtro === 'TODOS' ? (
                <Button variant="primary" onClick={() => onCambiarPestana('paquetes', true)}>
                  <PackagePlus className="w-4 h-4" />
                  <span>Registrar un paquete</span>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            columns={columnas}
            rows={productos}
            rowKey={(p) => p.id}
            selectedKey={detalleId}
            onRowClick={(p) => setDetalleId(p.id === detalleId ? undefined : p.id)}
            onRowContextMenu={(p, e) => {
              setMenuContextual({ x: e.clientX, y: e.clientY, producto: p });
            }}
          />
        )}
        </div>
      </div>

      {/* Panel lateral con variantes e historial */}
      {detalle && (
        <aside ref={lateralRef} className="w-[390px] border-l border-borde bg-superficie flex flex-col shrink-0 animate-drawer shadow-xl z-10">
          {/* Cabecera pegajosa con botón de cerrar */}
          <div className="p-5 border-b border-borde bg-superficie-2/40 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              {detalle.foto ? (
                <img
                  src={detalle.foto}
                  alt=""
                  className="w-16 h-16 rounded-xl object-cover border border-borde/80 shadow-xs shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-superficie-2 border border-borde/80 flex items-center justify-center shrink-0 shadow-xs">
                  <Package className="w-6 h-6 text-texto-3" />
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-title font-semibold text-texto leading-snug truncate">
                  {detalle.nombre}
                </h3>
                <p className="text-caption tabular text-texto-3">{detalle.codigo}</p>
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <Badge tone={detalle.existencias === 0 ? 'danger' : 'neutral'}>
                    {detalle.existencias} en existencia
                  </Badge>
                  <span className="text-caption text-texto-2">
                    {formatearMoneda(detalle.precio_venta_usd_cents, 'USD')}
                  </span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetalleId(undefined)}
              aria-label="Cerrar detalle"
              className="text-texto-3 hover:text-texto rounded-lg -mr-1 -mt-1 shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {!detalle.activo && (
            <div className="mx-5 mt-4 p-3.5 bg-alerta/10 border border-alerta/30 rounded-xl flex items-center justify-between gap-3 shrink-0">
              <span className="text-label font-medium text-alerta truncate">Descatalogado</span>
              <Button
                size="sm"
                variant="outline"
                className="text-acento bg-acento/10 border-acento/30 hover:bg-acento/20 hover:text-acento font-medium shrink-0 rounded-lg"
                onClick={() => reactivar(detalle)}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" />
                <span>Reactivar</span>
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {detalle.tiene_variantes && (
              <Card className="rounded-xl border-borde/80 shadow-xs overflow-hidden">
                <CardContent className="p-0">
                  <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde text-label font-medium text-texto">
                    Existencias por variante
                  </div>
                  <ul className="divide-y divide-borde/60">
                    {detalle.variantes.map((v) => (
                      <li
                        key={v.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-superficie-2/30 transition-colors"
                      >
                        <span className="text-body text-texto-2">
                          {[v.talla, v.color].filter(Boolean).join(' · ') || 'Única'}
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge tone={v.existencias === 0 ? 'danger' : 'neutral'}>
                            {v.existencias}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setAjustando({
                                variante_id: v.id,
                                producto_id: detalle.id,
                                nombre: `${detalle.nombre} ${[v.talla, v.color]
                                  .filter(Boolean)
                                  .join(' ')}`.trim(),
                                actual: v.existencias,
                              })
                            }
                          >
                            Ajustar
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card className="rounded-xl border-borde/80 shadow-xs overflow-hidden">
              <CardContent className="p-0">
                <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde flex items-center gap-2 text-label font-medium text-texto">
                  <Receipt className="w-3.5 h-3.5 text-texto-3" />
                  Costo
                </div>
                <div className="px-4 py-3 border-b border-borde/60 text-caption text-texto-2 tabular">
                  {detalle.existencias > 0 ? (
                    <>
                      Valor en bodega {formatearMoneda(detalle.valor_inventario_usd_cents, 'USD')} ÷{' '}
                      {detalle.existencias} unid. ={' '}
                      <strong className="text-texto">
                        {formatearMoneda(detalle.costo_unitario_usd_cents, 'USD')}
                      </strong>{' '}
                      c/u
                    </>
                  ) : (
                    <>
                      Agotado. Último costo:{' '}
                      <strong className="text-texto">
                        {formatearMoneda(detalle.costo_unitario_usd_cents, 'USD')}
                      </strong>
                    </>
                  )}
                </div>
                {entradas.length > 0 ? (
                  <ul className="divide-y divide-borde/60 max-h-[260px] overflow-y-auto">
                    {entradas.map((e) => (
                      <li key={`${e.compra_id}-${e.linea.id}`} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-label font-medium text-texto">
                            {e.codigo}
                            {e.estado !== 'RECIBIDA' && (
                              <span className="text-caption text-texto-3 font-normal"> · cargándose</span>
                            )}
                          </span>
                          <span className="text-caption text-texto-3 tabular">{formatearFecha(e.fecha)}</span>
                        </div>
                        <p className="mt-0.5 text-caption text-texto-2 tabular">
                          {e.linea.cantidad} ×{' '}
                          {formatearMoneda(
                            Math.round(e.linea.precio_linea_usd_cents / Math.max(1, e.linea.cantidad)),
                            'USD'
                          )}{' '}
                          + {formatearMoneda(e.linea.tax_linea_usd_cents, 'USD')} imp. +{' '}
                          {formatearMoneda(
                            e.linea.envio_asignado_usd_cents + e.linea.otros_asignados_usd_cents,
                            'USD'
                          )}{' '}
                          flete ={' '}
                          <strong className="text-texto">
                            {formatearMoneda(e.linea.costo_unitario_usd_cents, 'USD')} c/u
                          </strong>
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-caption text-texto-3">
                    Ningún paquete lo trae todavía.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-xl border-borde/80 shadow-xs overflow-hidden">
              <CardContent className="p-0">
                <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde flex items-center gap-2 text-label font-medium text-texto">
                  <History className="w-3.5 h-3.5 text-texto-3" />
                  Movimientos
                </div>
                {movimientos.length > 0 ? (
                  <ul className="divide-y divide-borde/60 max-h-[420px] overflow-y-auto">
                    {movimientos.map((m) => (
                      <li key={m.id} className="px-4 py-2.5 hover:bg-superficie-2/20 transition-colors">
                        <div className="flex items-center justify-between gap-2">
                          <Badge
                            tone={
                              m.tipo === 'ENTRADA'
                                ? 'success'
                                : m.tipo === 'SALIDA'
                                  ? 'info'
                                  : 'neutral'
                            }
                          >
                            {m.tipo === 'ENTRADA'
                              ? `+${m.cantidad}`
                              : m.tipo === 'SALIDA'
                                ? `-${m.cantidad}`
                                : `= ${m.existencias_despues}`}
                          </Badge>
                          <span className="text-caption text-texto-3 tabular">
                            {formatearFecha(m.fecha)}
                          </span>
                        </div>
                        {m.detalle && (
                          <p className="mt-1 text-caption text-texto-2">{m.detalle}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-caption text-texto-3">Sin movimientos todavía.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Pie fijo de acciones del producto */}
          <div className="p-4 border-t border-borde bg-superficie-2/40 space-y-2 shrink-0">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center text-xs font-semibold rounded-xl"
                onClick={() => {
                  setProductoEditando(detalle);
                  setModalAbierto(true);
                }}
              >
                <FileEdit className="w-3.5 h-3.5 mr-1.5" />
                <span>Editar</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-center text-xs font-semibold rounded-xl"
                onClick={() => {
                  if (detalle.variantes.length === 1) {
                    setAjustando({
                      variante_id: detalle.variantes[0].id,
                      producto_id: detalle.id,
                      nombre: detalle.nombre,
                      actual: detalle.variantes[0].existencias,
                    });
                  } else {
                    showToast({ message: 'Elegí la talla o el tono arriba.', type: 'info' });
                  }
                }}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
                <span>Ajustar stock</span>
              </Button>
            </div>

            {detalle.activo ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center text-xs text-texto-3 hover:text-alerta rounded-xl"
                onClick={() => setArchivando(detalle)}
              >
                <Archive className="w-3.5 h-3.5 mr-1.5" />
                <span>Descatalogar</span>
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-center text-xs font-semibold text-acento bg-acento/10 border-acento/30 hover:bg-acento/20 rounded-xl"
                  onClick={() => reactivar(detalle)}
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                  <span>Reactivar</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-center text-xs font-semibold text-danger hover:bg-danger/10 border border-danger/30 rounded-xl"
                  onClick={() => setEliminandoDefinitivo(detalle)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  <span>Eliminar</span>
                </Button>
              </div>
            )}
          </div>
        </aside>
      )}

      <Confirmar
        abierto={archivando !== null}
        peligroso
        titulo={`¿Descatalogar "${archivando?.nombre ?? ''}"?`}
        consecuencias={[
          'Deja de aparecer en la lista y al vender.',
          'Sus ventas y ganancias pasadas no cambian.',
          'Se reactiva desde "Descatalogados".',
          ...(archivando && archivando.existencias > 0
            ? [
                `${archivando.existencias === 1 ? 'Su unidad deja' : `Sus ${archivando.existencias} unidades dejan`} de contar en la bodega.`,
              ]
            : []),
        ]}
        textoConfirmar="Sí, descatalogar"
        onConfirmar={() => archivando && archivar(archivando)}
        onCerrar={() => setArchivando(null)}
      />

      <Confirmar
        abierto={eliminandoDefinitivo !== null}
        peligroso
        titulo={`¿Eliminar definitivamente "${eliminandoDefinitivo?.nombre ?? ''}"?`}
        consecuencias={[
          'No se puede deshacer.',
          'Si tiene ventas, mejor descatalogalo: así los reportes no cambian.',
        ]}
        textoConfirmar="Eliminar"
        onConfirmar={() => eliminandoDefinitivo && eliminarDefinitivo(eliminandoDefinitivo)}
        onCerrar={() => setEliminandoDefinitivo(null)}
      />

      {menuContextual && (
        <ContextMenu
          x={menuContextual.x}
          y={menuContextual.y}
          onClose={() => setMenuContextual(null)}
          items={[
            {
              id: 'editar',
              label: 'Editar producto',
              icon: <FileEdit className="w-4 h-4" />,
              shortcut: 'Enter',
              onClick: () => {
                setProductoEditando(menuContextual.producto);
                setModalAbierto(true);
              },
            },
            {
              id: 'ajustar',
              label: 'Ajustar existencias',
              icon: <SlidersHorizontal className="w-4 h-4" />,
              shortcut: 'A',
              onClick: () => {
                const p = menuContextual.producto;
                if (p.variantes.length === 1) {
                  setAjustando({
                    variante_id: p.variantes[0].id,
                    producto_id: p.id,
                    nombre: p.nombre,
                    actual: p.variantes[0].existencias,
                  });
                } else {
                  setDetalleId(p.id);
                }
              },
            },
            {
              id: 'detalle',
              label: 'Ver detalle y movimientos',
              icon: <History className="w-4 h-4" />,
              shortcut: 'Espacio',
              onClick: () => setDetalleId(menuContextual.producto.id),
            },
            'separator',
            {
              id: 'copiar-codigo',
              label: `Copiar código (${menuContextual.producto.codigo})`,
              icon: <Copy className="w-4 h-4" />,
              onClick: () => {
                navigator.clipboard.writeText(menuContextual.producto.codigo);
                showToast({ message: 'Código copiado', type: 'info' });
              },
            },
            {
              id: 'copiar-nombre',
              label: 'Copiar nombre',
              icon: <Copy className="w-4 h-4" />,
              onClick: () => {
                navigator.clipboard.writeText(menuContextual.producto.nombre);
                showToast({ message: 'Nombre copiado', type: 'info' });
              },
            },
            'separator',
            menuContextual.producto.activo
              ? {
                  id: 'descatalogar',
                  label: 'Descatalogar producto',
                  icon: <Archive className="w-4 h-4" />,
                  shortcut: 'D',
                  onClick: () => setArchivando(menuContextual.producto),
                }
              : {
                  id: 'reactivar',
                  label: 'Reactivar en inventario',
                  icon: <RotateCcw className="w-4 h-4" />,
                  tone: 'success',
                  onClick: () => reactivar(menuContextual.producto),
                },
            {
              id: 'eliminar-definitivo',
              label: 'Eliminar por completo...',
              icon: <Trash2 className="w-4 h-4" />,
              tone: 'danger',
              shortcut: 'Supr',
              onClick: () => setEliminandoDefinitivo(menuContextual.producto),
            },
          ]}
        />
      )}

      <AjustarStockModal
        ajuste={ajustando}
        onCerrar={() => setAjustando(null)}
        onConfirmar={ajustarStock}
        onRegistrarPaquete={() => onCambiarPestana('paquetes', true)}
      />

      <RevisarPreciosModal
        abierto={revisandoPrecios}
        lista={precios}
        onCerrar={() => setRevisandoPrecios(false)}
        onAplicado={async () => {
          setTodosLosProductos([]);
          await cargar();
          onCambio();
        }}
      />

      <ProductoModal
        abierto={modalAbierto}
        producto={productoEditando}
        categorias={categorias}
        margenDefectoBp={parametros?.margen_defecto_bp ?? 4500}
        stockMinimoDefecto={parametros?.stock_minimo_defecto ?? 2}
        pasoRedondeo={parametros?.paso_redondeo_usd_cents ?? 100}
        onCerrar={() => setModalAbierto(false)}
        onGuardar={guardar}
      />
    </div>
  );
};
