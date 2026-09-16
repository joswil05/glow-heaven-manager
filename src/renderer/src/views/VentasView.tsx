import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShoppingBag,
  Plus,
  DollarSign,
  PackageCheck,
  XCircle,
  ClipboardList,
  TrendingUp,
  Wallet,
  X,
  MessageCircle,
  Calendar,
  Copy,
  Eye,
  FileText,
  MoreVertical,
  Clock,
  Search,
} from 'lucide-react';
import type {
  Venta,
  VentaCompleta,
  ProductoConStock,
  ClienteDetalle,
  ParametrosSistema,
  TipoVenta,
  EstadoVenta,
} from '../../../shared/types';
import {
  Button,
  Badge,
  Money,
  StatTile,
  DataTable,
  BarraProgreso,
  Confirmar,
  ContextMenu,
  type Column,
  type Tone,
} from '../components/ui';
import { EmptyState } from '../components/shared/EmptyState';
import { VentaEditor } from './ventas/VentaEditor';
import { PagoModal } from '../components/PagoModal';
import { DocumentoModal } from '../components/DocumentoModal';
import { useClickOutside } from '../lib/useClickOutside';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { formatearMoneda, formatearFecha } from '@core/moneda';
import { mesISO } from '@core/fechas';
import { algunoContiene } from '@core/texto';

interface VentasViewProps {
  tipo: TipoVenta;
  productos: ProductoConStock[];
  clientes: ClienteDetalle[];
  parametros: ParametrosSistema | null;
  ventaInicialId?: number;
  abrirEditorAlEntrar?: boolean;
  onCambio: () => void;
}

const ESTADO_TONO: Record<EstadoVenta, Tone> = {
  COTIZADA: 'neutral',
  PENDIENTE: 'warning',
  ENTREGADA: 'success',
  CANCELADA: 'danger',
};

const ESTADO_TEXTO: Record<EstadoVenta, string> = {
  COTIZADA: 'Cotizado',
  PENDIENTE: 'Pendiente',
  ENTREGADA: 'Entregada',
  CANCELADA: 'Cancelada',
};

type Filtro = 'TODAS' | 'CON_SALDO' | 'PENDIENTES' | 'ENTREGADAS';

/**
 * Cuántas ventas se traen de una.
 *
 * Bastante más de lo que entra en pantalla, para que el primer scroll no
 * pida nada, y bastante menos que un año de historia.
 */
const POR_PAGINA = 50;
type Periodo = 'TODOS' | 'ESTE_MES' | 'MES_ANTERIOR' | 'ESTE_ANO';

export const VentasView: React.FC<VentasViewProps> = ({
  tipo,
  productos,
  clientes,
  parametros,
  ventaInicialId,
  abrirEditorAlEntrar = false,
  onCambio,
}) => {
  const { showToast, showUndoToast } = useToast();
  const esEncargo = tipo === 'ENCARGO';

  const [ventas, setVentas] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  // Abre acotada al mes en curso, no a la historia entera.
  //
  // El período ya no es un filtro de pantalla: viaja al servidor y decide
  // cuántos documentos se traen. Abrir en 'TODOS' significaba pagar todas las
  // ventas del negocio cada vez, y esa cuenta crece todos los meses.
  const [periodo, setPeriodo] = useState<Periodo>('ESTE_MES');
  const [busqueda, setBusqueda] = useState('');
  /** Resultados que vinieron de fuera del período, al buscar. */
  const [fueraDelPeriodo, setFueraDelPeriodo] = useState<Venta[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  /** ¿Quedó historia más atrás de lo que se trajo? */
  const [hayMas, setHayMas] = useState(false);
  const [trayendoMas, setTrayendoMas] = useState(false);
  const [editorAbierto, setEditorAbierto] = useState(abrirEditorAlEntrar);
  const [ventaDetalle, setVentaDetalle] = useState<VentaCompleta | null>(null);
  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [documentoAbierto, setDocumentoAbierto] = useState(false);
  const [anulando, setAnulando] = useState<Venta | VentaCompleta | null>(null);
  const [menuContextual, setMenuContextual] = useState<{
    x: number;
    y: number;
    venta: Venta;
  } | null>(null);

  const lateralRef = useClickOutside<HTMLElement>(Boolean(ventaDetalle), () => setVentaDetalle(null));

  /**
   * La fecha desde la que se piden ventas. `null` es "sin corte", y sólo lo
   * devuelve 'TODOS', que es una decisión explícita de quien mira.
   */
  const desdeDelPeriodo = useMemo((): string | undefined => {
    const [anio, mes] = mesISO().split('-').map(Number);
    if (periodo === 'ESTE_MES') return `${anio}-${String(mes).padStart(2, '0')}-01`;
    if (periodo === 'MES_ANTERIOR') {
      return mes === 1
        ? `${anio - 1}-12-01`
        : `${anio}-${String(mes - 1).padStart(2, '0')}-01`;
    }
    if (periodo === 'ESTE_ANO') return `${anio}-01-01`;
    return undefined;
  }, [periodo]);

  const estadoDelFiltro: EstadoVenta | undefined =
    filtro === 'PENDIENTES' ? 'PENDIENTE' : filtro === 'ENTREGADAS' ? 'ENTREGADA' : undefined;

  /**
   * Cuáles listas se traen de a pedazos y cuáles enteras.
   *
   * 'Todas' y 'Entregadas' crecen para siempre: son toda la historia del
   * negocio y no hay forma de que quepan en una pantalla, así que se traen de
   * a una página y se sigue si alguien quiere ver más atrás.
   *
   * 'Con saldo' y 'Pendientes' NO se cortan. Son las listas que hay que ver
   * completas —quién debe, qué falta entregar— y traerlas a medias escondería
   * justo la deuda vieja, que está al fondo. Además no crecen con los años
   * sino con los pendientes: si alguna vez son miles, el problema no es la
   * factura de lecturas.
   */
  const paginada = filtro === 'TODAS' || filtro === 'ENTREGADAS';

  const filtrosBase = useCallback(
    () => ({
      tipo,
      desde: desdeDelPeriodo,
      soloConSaldo: filtro === 'CON_SALDO',
      estado: estadoDelFiltro,
    }),
    [tipo, desdeDelPeriodo, filtro, estadoDelFiltro]
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await window.api.ventas.list({
        ...filtrosBase(),
        limite: paginada ? POR_PAGINA : undefined,
      });
      if (r.success) {
        setVentas(r.data);
        // Si vino la página entera, es probable que haya más atrás. Si vino
        // corta, se acabó: no hace falta otra consulta para averiguarlo.
        setHayMas(paginada && r.data.length === POR_PAGINA);
      } else {
        showToast({ message: r.error, type: 'error' });
      }
    } finally {
      setCargando(false);
    }
  }, [filtrosBase, paginada, showToast]);

  /** Trae la página siguiente y la agrega abajo, sin volver a leer la de arriba. */
  const cargarMas = useCallback(async () => {
    const ultima = ventas[ventas.length - 1];
    if (!ultima || trayendoMas) return;

    setTrayendoMas(true);
    try {
      const r = await window.api.ventas.list({
        ...filtrosBase(),
        limite: POR_PAGINA,
        despuesDe: { fecha: ultima.fecha, id: ultima.id },
      });
      if (r.success) {
        setVentas((previas) => {
          const porId = new Map(previas.map((v) => [v.id, v]));
          for (const v of r.data) porId.set(v.id, v);
          return [...porId.values()];
        });
        setHayMas(r.data.length === POR_PAGINA);
      } else {
        showToast({ message: r.error, type: 'error' });
      }
    } finally {
      setTrayendoMas(false);
    }
  }, [ventas, trayendoMas, filtrosBase, showToast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (abrirEditorAlEntrar) setEditorAbierto(true);
  }, [abrirEditorAlEntrar]);

  const abrirDetalle = useCallback(async (id: number) => {
    const r = await window.api.ventas.get(id);
    if (r.success && r.data) setVentaDetalle(r.data);
  }, []);

  useEffect(() => {
    if (ventaInicialId) abrirDetalle(ventaInicialId);
  }, [ventaInicialId, abrirDetalle]);

  // El recorte por período ya lo hizo el servidor: acá sólo queda darle
  // nombre a lo que llegó. Antes esto filtraba en memoria una lista que ya
  // se había pagado entera.
  /**
   * Buscar no escanea: resuelve.
   *
   * La lista abre acotada al mes, asi que lo que se busca puede no estar
   * cargado. En vez de traer la historia entera para filtrarla —que es
   * justamente lo que se acaba de sacar— se traduce lo que se escribio a algo
   * que la base sabe responder de una:
   *
   *   · Un codigo de venta (V-0007, E-12) es el numero de la venta: se pide
   *     ese documento y ya. Una lectura.
   *   · Un nombre de clienta se resuelve contra el directorio y despues se
   *     piden SUS ventas, que estan indexadas por clienta y no se acotan por
   *     fecha. Asi aparece su compra de hace ocho meses.
   *
   * Lo que ya esta en pantalla se filtra al instante mientras se escribe; lo
   * de mas atras llega cuando la consulta responde.
   */
  useEffect(() => {
    const texto = busqueda.trim();
    if (texto.length < 2) {
      setFueraDelPeriodo(null);
      return;
    }

    let vivo = true;
    const temporizador = setTimeout(async () => {
      setBuscando(true);
      try {
        const encontradas: Venta[] = [];

        // ¿Es un código de venta? V-0007, e12, 7...
        const codigo = texto.toUpperCase().match(/^[VE]?-?0*(\d+)$/);
        if (codigo) {
          const r = await window.api.ventas.get(Number(codigo[1]));
          if (r.success && r.data) encontradas.push(r.data);
        }

        // ¿Es el nombre de una clienta?
        const rc = await window.api.clientes.list(texto);
        if (rc.success) {
          for (const cliente of rc.data.slice(0, 3)) {
            const rv = await window.api.ventas.list({ cliente_id: cliente.id });
            if (rv.success) encontradas.push(...rv.data);
          }
        }

        if (!vivo) return;
        const porId = new Map(encontradas.map((v) => [v.id, v]));
        setFueraDelPeriodo([...porId.values()]);
      } finally {
        if (vivo) setBuscando(false);
      }
    }, 350);

    return () => {
      vivo = false;
      clearTimeout(temporizador);
    };
  }, [busqueda]);

  const ventasPeriodo = useMemo(() => {
    if (!busqueda.trim()) return ventas;

    const coincide = (v: Venta) => algunoContiene([v.codigo, v.cliente_nombre], busqueda);

    // Lo del período que coincide, más lo que la búsqueda trajo de más atrás.
    const porId = new Map<number, Venta>();
    for (const v of ventas.filter(coincide)) porId.set(v.id, v);
    for (const v of fueraDelPeriodo ?? []) porId.set(v.id, v);

    return [...porId.values()].sort((a, b) => {
      const cmp = (b.fecha || '').localeCompare(a.fecha || '');
      return cmp !== 0 ? cmp : b.id - a.id;
    });
  }, [ventas, busqueda, fueraDelPeriodo]);

  const totales = useMemo(() => {
    const activas = ventasPeriodo.filter((v) => v.estado !== 'CANCELADA');
    return {
      vendido: activas.reduce((a, v) => a + v.total_usd_cents, 0),
      ganancia: activas
        .filter((v) => v.estado === 'ENTREGADA')
        .reduce((a, v) => a + v.ganancia_usd_cents, 0),
      porCobrar: activas.reduce((a, v) => a + Math.max(0, v.saldo_usd_cents), 0),
    };
  }, [ventasPeriodo]);

  const enviarCobroWhatsApp = (v: Venta | VentaCompleta) => {
    const cliente = clientes.find((c) => c.id === v.cliente_id);
    const telefonoRaw = cliente?.telefono ?? '';
    const telefono = telefonoRaw.replace(/\D/g, '');
    const saldoUsd = formatearMoneda(v.saldo_usd_cents, 'USD');
    const tasa = (parametros?.tasa_cambio_cents ?? 3662) / 100;
    const saldoCs = formatearMoneda(Math.round(v.saldo_usd_cents * tasa), 'COR');

    const cuentasTxt =
      (parametros?.cuentas_bancarias ?? []).length > 0
        ? (parametros?.cuentas_bancarias ?? [])
            .map((c) => `${c.banco} (${c.moneda}): ${c.numero}${c.titular ? ' - ' + c.titular : ''}`)
            .join('\n')
        : '';

    let plantilla =
      parametros?.plantilla_cobro_whatsapp ||
      'Hola {cliente}, te saludamos de Glow Heaven ✨ Te recordamos que tienes un saldo pendiente de {saldo_usd} ({saldo_cs}). Si ya realizaste tu abono, por favor compártenos el comprobante. ¡Muchas gracias!';

    let mensaje = plantilla
      .replace(/\{cliente\}/g, v.cliente_nombre ?? 'Estimada clienta')
      .replace(/\{saldo_usd\}/g, saldoUsd)
      .replace(/\{saldo_cs\}/g, saldoCs)
      .replace(/\{cuentas_bancarias\}/g, cuentasTxt ? `\nCuentas bancarias:\n${cuentasTxt}` : '');

    const url = telefono
      ? `https://wa.me/505${telefono.startsWith('505') ? telefono.slice(3) : telefono}?text=${encodeURIComponent(mensaje)}`
      : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

    window.open(url, '_blank');
  };

  const cambiarEstado = async (v: Venta, estado: EstadoVenta) => {
    const r = await window.api.ventas.cambiarEstado(v.id, estado);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    const mensaje = `${v.codigo}: ${ESTADO_TEXTO[estado].toLowerCase()}`;

    // Anular una venta devuelve su mercadería al inventario, y entregar un
    // encargo la saca. Eso no se revierte restaurando el documento, así que
    // no se ofrece "Deshacer": la vuelta correcta es cambiar el estado otra
    // vez desde el detalle.
    if (r.data.reversible) {
      showUndoToast(
        mensaje,
        async () => {
          await cargar();
          onCambio();
        },
        r.data.evento_grupo_id
      );
    } else {
      showToast({ message: mensaje, type: 'success' });
    }
    await cargar();
    if (ventaDetalle?.id === v.id) await abrirDetalle(v.id);
    onCambio();
  };

  const columnas: Column<Venta>[] = [
    {
      key: 'codigo',
      header: esEncargo ? 'Encargo' : 'Venta',
      render: (v) => (
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-superficie-2 border border-borde/80 flex items-center justify-center shrink-0 shadow-xs text-texto-2">
            {esEncargo ? (
              <ClipboardList className="w-4 h-4 text-texto-3" />
            ) : (
              <ShoppingBag className="w-4 h-4 text-texto-3" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-body font-semibold text-texto tracking-tight truncate">
              {v.cliente_nombre ?? 'Mostrador'}
            </div>
            <div className="text-caption text-texto-3 flex items-center gap-1.5 font-mono">
              <span className="bg-superficie-2 px-1.5 py-0.5 rounded border border-borde/60 text-[11px] text-texto-2">
                {v.codigo}
              </span>
              <span>· {formatearFecha(v.fecha)}</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'estado',
      header: 'Estado',
      width: '130px',
      render: (v) => (
        <Badge tone={ESTADO_TONO[v.estado]} className="gap-1.5 font-medium">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full shrink-0',
              v.estado === 'ENTREGADA'
                ? 'bg-acento'
                : v.estado === 'PENDIENTE'
                  ? 'bg-alerta animate-pulse'
                  : v.estado === 'CANCELADA'
                    ? 'bg-peligro'
                    : 'bg-superficie-2'
            )}
          />
          {ESTADO_TEXTO[v.estado]}
        </Badge>
      ),
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      width: '160px',
      render: (v) => <Money usd_cents={v.total_usd_cents} size="sm" />,
    },
    {
      key: 'pagado',
      header: 'Pagado',
      align: 'right',
      width: '160px',
      render: (v) => (
        <div>
          <Money usd_cents={v.pagado_usd_cents} size="sm" soloUsd />
          <BarraProgreso
            className="mt-1"
            actual={v.pagado_usd_cents}
            total={v.total_usd_cents}
            tono={v.saldo_usd_cents <= 0 ? 'success' : 'brand'}
            etiqueta={`Pagado de ${v.codigo}`}
          />
        </div>
      ),
    },
    {
      key: 'saldo',
      header: 'Debe',
      align: 'right',
      width: '130px',
      render: (v) =>
        v.saldo_usd_cents > 0 ? (
          <span className="font-semibold text-alerta">
            <Money usd_cents={v.saldo_usd_cents} size="sm" soloUsd />
          </span>
        ) : (
          <Badge tone="success">Saldada</Badge>
        ),
    },
    {
      key: 'ganancia',
      header: 'Ganancia',
      align: 'right',
      width: '130px',
      render: (v) => <Money usd_cents={v.ganancia_usd_cents} size="sm" soloUsd colorearSigno />,
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      width: '150px',
      render: (v) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="outline"
            className="text-acento border-acento/30 hover:bg-acento/10 font-medium text-xs px-2.5 py-1 h-7 rounded-lg"
            title={v.tipo === 'ENCARGO' ? 'Ver / Imprimir Cotización' : 'Ver / Imprimir Factura'}
            onClick={async (e) => {
              e.stopPropagation();
              await abrirDetalle(v.id);
              setDocumentoAbierto(true);
            }}
          >
            <FileText className="w-3.5 h-3.5 mr-1" />
            <span>{v.tipo === 'ENCARGO' ? 'Proforma' : 'Factura'}</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            className="p-1 text-texto-3 hover:text-texto rounded-lg h-7 w-7 flex items-center justify-center cursor-pointer"
            title="Más opciones de venta"
            onClick={(e) => {
              e.stopPropagation();
              setMenuContextual({ x: e.clientX, y: e.clientY, venta: v });
            }}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const filtros: { id: Filtro; etiqueta: string }[] = [
    { id: 'TODAS', etiqueta: 'Todas' },
    { id: 'CON_SALDO', etiqueta: 'Con saldo' },
    { id: 'PENDIENTES', etiqueta: esEncargo ? 'Por comprar' : 'Por entregar' },
    { id: 'ENTREGADAS', etiqueta: 'Entregadas' },
  ];

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:px-6 md:py-4 animate-fade-in scroll-smooth">
        <div className="max-w-[1500px] w-full mx-auto space-y-4 stagger-children">
          {/* Barra superior estilizada idéntica a la del inicio */}
        <div className="flex items-center justify-between gap-3 pb-1 border-b border-borde/40 text-caption text-texto-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-bold text-texto text-body">
              {esEncargo ? 'Gestión de Encargos Especiales' : 'Registro de Ventas'}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-acento/10 text-acento border border-acento/20">
              <span className="w-1.5 h-1.5 rounded-full bg-acento" />
              {ventas.filter((v) => v.estado !== 'CANCELADA').length} activas
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-block text-[11px] text-texto-3">
              {esEncargo ? 'Anticipos y seguimiento' : 'Contado y cuotas'}
            </span>
            <Button
              variant="primary"
              size="sm"
              className="rounded-xl shadow-xs"
              onClick={() => setEditorAbierto(true)}
            >
              <Plus className="w-4 h-4" />
              <span>{esEncargo ? 'Nuevo encargo' : 'Nueva venta'}</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 stagger-children">
          <StatTile
            label={esEncargo ? 'Total cotizado' : 'Total facturado'}
            usd_cents={totales.vendido}
            tone="info"
            icon={ShoppingBag}
            hint={`${ventas.filter((v) => v.estado !== 'CANCELADA').length} registro(s) activos`}
            onClick={() => setFiltro('TODAS')}
          />
          <StatTile
            label="Ganancia de entregados"
            usd_cents={totales.ganancia}
            tone={totales.ganancia > 0 ? 'success' : 'neutral'}
            icon={TrendingUp}
            hint="Margen neto sobre ventas completadas"
            onClick={() => setFiltro('ENTREGADAS')}
          />
          <StatTile
            label="Saldo por cobrar"
            usd_cents={totales.porCobrar}
            tone={totales.porCobrar > 0 ? 'warning' : 'success'}
            icon={Wallet}
            hint={
              filtro === 'CON_SALDO'
                ? 'Mostrando solo ventas con saldo pendiente'
                : totales.porCobrar > 0
                  ? 'Clic para filtrar ventas con deuda'
                  : 'Sin saldos pendientes'
            }
            onClick={() => setFiltro(filtro === 'CON_SALDO' ? 'TODAS' : 'CON_SALDO')}
            className={filtro === 'CON_SALDO' ? 'ring-2 ring-alerta/50' : undefined}
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Filtro por estado operativo */}
          <div className="inline-flex items-center p-1 bg-superficie-2/80 rounded-xl border border-borde/70 text-caption font-medium w-fit">
            {filtros.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                aria-pressed={filtro === f.id}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg transition-[background-color,border-color,color,box-shadow,transform,opacity] text-label pill-interactive active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
                  filtro === f.id
                    ? 'bg-superficie text-texto font-semibold shadow-xs border border-borde/50'
                    : 'text-texto-3 hover:text-texto hover:bg-superficie/50'
                )}
              >
                {f.etiqueta}
              </button>
            ))}
          </div>

          {/* Buscador: alcanza más allá del período cargado */}
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-3"
            />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por clienta o código de venta..."
              className="w-full rounded-xl border border-borde bg-superficie-2/80 py-1.5 pl-9 pr-8 text-label text-texto placeholder:text-texto-3 outline-none focus:border-acento-suave focus:ring-2 focus:ring-acento"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-texto-3 hover:text-texto cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Selector Histórico de Período */}
          <div className="inline-flex items-center gap-1.5 p-1 bg-superficie-2/80 rounded-xl border border-borde/70 text-caption font-medium">
            <span className="text-[11px] text-texto-3 pl-2 pr-1 font-semibold flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Período:
            </span>
            {(
              [
                { id: 'TODOS', etiqueta: 'Todo' },
                { id: 'ESTE_MES', etiqueta: 'Este mes' },
                { id: 'MES_ANTERIOR', etiqueta: 'Mes anterior' },
                { id: 'ESTE_ANO', etiqueta: 'Año actual' },
              ] as { id: Periodo; etiqueta: string }[]
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriodo(p.id)}
                aria-pressed={periodo === p.id}
                className={cn(
                  'px-2.5 py-1 rounded-lg transition-[background-color,border-color,color,box-shadow,transform,opacity] text-label pill-interactive active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento text-xs',
                  periodo === p.id
                    ? 'bg-superficie text-texto font-semibold shadow-xs border border-borde/50'
                    : 'text-texto-3 hover:text-texto hover:bg-superficie/50'
                )}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {/* Si la búsqueda trajo algo de fuera del período, hay que decirlo:
            una venta de hace ocho meses apareciendo en una lista rotulada
            "Este mes" es la interfaz mintiendo. */}
        {busqueda.trim() && !cargando && (
          <div className="px-1 pb-2 text-caption text-texto-3">
            {buscando ? (
              <span>Buscando en todo el historial…</span>
            ) : (
              <span>
                {ventasPeriodo.length} resultado{ventasPeriodo.length === 1 ? '' : 's'} para{' '}
                <strong className="text-texto-2">“{busqueda.trim()}”</strong>
                {(fueraDelPeriodo?.length ?? 0) > 0 && ', incluyendo ventas fuera del período'}
              </span>
            )}
          </div>
        )}

        {cargando ? (
          <div className="p-12 text-center text-body text-texto-3">Cargando...</div>
        ) : ventasPeriodo.length === 0 ? (
          <EmptyState
            icon={esEncargo ? ClipboardList : ShoppingBag}
            title={
              filtro !== 'TODAS' || periodo !== 'TODOS'
                ? 'Nada con esos filtros'
                : esEncargo
                  ? 'Todavía no hay encargos'
                  : 'Todavía no hay ventas'
            }
            description={
              filtro !== 'TODAS' || periodo !== 'TODOS'
                ? 'Probá cambiando el período o quitando los filtros.'
                : esEncargo
                  ? 'Un encargo es un pedido especial: cotizás, cobrás anticipo, comprás y entregás.'
                  : 'Registrá tu primera venta del inventario. Las existencias se descuentan solas.'
            }
            action={
              filtro === 'TODAS' && periodo === 'TODOS' ? (
                <Button variant="primary" onClick={() => setEditorAbierto(true)}>
                  <Plus className="w-4 h-4" />
                  <span>{esEncargo ? 'Registrar encargo' : 'Registrar venta'}</span>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            columns={columnas}
            rows={ventasPeriodo}
            rowKey={(v) => v.id}
            selectedKey={ventaDetalle?.id}
            onRowClick={(v) =>
              ventaDetalle?.id === v.id ? setVentaDetalle(null) : abrirDetalle(v.id)
            }
            onRowContextMenu={(v, e) => {
              setMenuContextual({ x: e.clientX, y: e.clientY, venta: v });
            }}
          />
        )}

        {/* Traer más historia.
            Sólo aparece si de verdad quedó algo atrás, y desaparece solo
            cuando se acabó: un botón que no hace nada enseña a desconfiar de
            todos los botones. Con la búsqueda abierta no aparece, porque ahí
            la lista ya no es una ventana de tiempo. */}
        {hayMas && !busqueda.trim() && !cargando && (
          <div className="flex flex-col items-center gap-2 py-6">
            <Button
              variant="secondary"
              onClick={cargarMas}
              disabled={trayendoMas}
              className="min-w-[200px]"
            >
              {trayendoMas ? 'Trayendo…' : 'Ver ventas más antiguas'}
            </Button>
            <span className="text-caption text-texto-3">
              Mostrando {ventasPeriodo.length}
              {periodo === 'TODOS' ? ' de todo el historial' : ' de este período'}
            </span>
          </div>
        )}
        </div>
      </div>

      {ventaDetalle && (
        <aside ref={lateralRef} className="w-[410px] border-l border-borde bg-superficie flex flex-col shrink-0 animate-drawer shadow-xl z-10">
          {/* Cabecera pegajosa con botón de cerrar */}
          <div className="p-5 border-b border-borde bg-superficie-2/40 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-acento/10 text-acento-fuerte border border-acento/20 flex items-center justify-center shrink-0 shadow-xs">
                {esEncargo ? <ClipboardList className="w-6 h-6" /> : <ShoppingBag className="w-6 h-6" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-title font-bold text-texto tracking-tight truncate">
                    {ventaDetalle.cliente_nombre ?? 'Mostrador'}
                  </h3>
                  <Badge tone={ESTADO_TONO[ventaDetalle.estado]} className="gap-1.5 text-[11px] shrink-0">
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        ventaDetalle.estado === 'ENTREGADA'
                          ? 'bg-acento'
                          : ventaDetalle.estado === 'PENDIENTE'
                            ? 'bg-alerta animate-pulse'
                            : ventaDetalle.estado === 'CANCELADA'
                              ? 'bg-peligro'
                              : 'bg-superficie-2'
                      )}
                    />
                    {ESTADO_TEXTO[ventaDetalle.estado]}
                  </Badge>
                </div>
                <p className="text-caption text-texto-3 font-mono mt-0.5">
                  {ventaDetalle.codigo} · {formatearFecha(ventaDetalle.fecha)}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVentaDetalle(null)}
              aria-label="Cerrar detalle"
              className="text-texto-3 hover:text-texto rounded-lg -mr-1 -mt-1 shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Tarjeta de estado de la cuenta */}
            <div className="rounded-xl border border-borde/80 bg-gradient-to-b from-superficie via-superficie to-superficie-2/30 p-4 space-y-2.5 shadow-xs">
              {(ventaDetalle.descuento_usd_cents ?? 0) > 0 && (
                <>
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-label text-texto-2 font-medium">Subtotal</span>
                    <Money
                      usd_cents={
                        ventaDetalle.subtotal_usd_cents ??
                        ventaDetalle.total_usd_cents + ventaDetalle.descuento_usd_cents!
                      }
                      size="sm"
                      soloUsd
                    />
                  </div>
                  <div className="flex justify-between items-center gap-2 text-acento">
                    <span className="text-label font-medium">
                      Descuento{ventaDetalle.descuento_motivo ? ` (${ventaDetalle.descuento_motivo})` : ''}
                    </span>
                    <span className="text-label font-bold font-mono">
                      -{formatearMoneda(ventaDetalle.descuento_usd_cents!, 'USD')}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center gap-2">
                <span className="text-label text-texto-2 font-medium">
                  {(ventaDetalle.descuento_usd_cents ?? 0) > 0 ? 'Total con descuento' : 'Total facturado'}
                </span>
                <Money usd_cents={ventaDetalle.total_usd_cents} size="sm" />
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-label text-texto-2 font-medium">Pagado</span>
                <Money usd_cents={ventaDetalle.pagado_usd_cents} size="sm" soloUsd />
              </div>
              <div className="flex justify-between items-center gap-2 pt-2 border-t border-borde/70">
                <span className="text-body font-bold text-texto">Debe</span>
                {ventaDetalle.saldo_usd_cents > 0 ? (
                  <span className="font-bold text-alerta">
                    <Money usd_cents={ventaDetalle.saldo_usd_cents} size="md" soloUsd />
                  </span>
                ) : (
                  <Badge tone="success">Saldada completamente</Badge>
                )}
              </div>
              <div className="flex justify-between items-center gap-2 pt-2 border-t border-borde/70">
                <span className="text-label text-texto-2 font-medium">Ganancia neta</span>
                <Money
                  usd_cents={ventaDetalle.ganancia_usd_cents}
                  size="sm"
                  soloUsd
                  colorearSigno
                />
              </div>
            </div>

            {/* Lista de productos */}
            <div className="rounded-xl border border-borde/80 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde text-label font-medium text-texto flex items-center justify-between">
                <span>Prendas / Artículos</span>
                <span className="text-caption text-texto-3">{ventaDetalle.lineas.length} línea(s)</span>
              </div>
              <ul className="divide-y divide-borde/60 max-h-[300px] overflow-y-auto">
                {ventaDetalle.lineas.map((l) => (
                  <li key={l.id} className="px-4 py-3 hover:bg-superficie-2/20 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-body font-medium text-texto truncate">
                          {l.descripcion}
                          {(l.talla || l.color) && (
                            <span className="text-texto-3 font-normal">
                              {' '}
                              ({[l.talla, l.color].filter(Boolean).join(' · ')})
                            </span>
                          )}
                        </div>
                        <div className="text-caption text-texto-3 font-mono">
                          {l.cantidad} × {formatearMoneda(l.precio_unitario_usd_cents, 'USD')}
                          {l.es_paquete && ' · paquete completo'}
                        </div>
                      </div>
                      <span className="text-body font-semibold text-texto tabular shrink-0 font-mono">
                        {formatearMoneda(l.subtotal_usd_cents, 'USD')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {ventaDetalle.notas && (
              <div className="rounded-xl border border-borde/70 bg-superficie-2/20 p-3.5 shadow-xs">
                <div className="text-caption font-medium text-texto-3 mb-1">Notas de la clienta</div>
                <p className="text-label text-texto-2 leading-relaxed">{ventaDetalle.notas}</p>
              </div>
            )}

            {/* Historial de abonos de esta venta */}
            <div className="rounded-xl border border-borde/80 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde text-label font-medium text-texto flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-texto-3" />
                  <span className="font-semibold">Historial de abonos</span>
                </div>
                <span className="text-caption text-texto-3 font-semibold">
                  {ventaDetalle.pagos?.length || 0} pago(s)
                </span>
              </div>
              {ventaDetalle.pagos && ventaDetalle.pagos.length > 0 ? (
                <ul className="divide-y divide-borde/60 max-h-44 overflow-y-auto">
                  {ventaDetalle.pagos.map((p) => (
                    <li key={p.id} className="px-4 py-2 flex items-center justify-between gap-2 hover:bg-superficie-2/20 transition-colors">
                      <div className="min-w-0">
                        <div className="text-label text-texto font-mono flex items-center gap-1.5">
                          <span>{formatearFecha(p.fecha)}</span>
                          {p.es_anticipo && (
                            <Badge tone="info">Anticipo</Badge>
                          )}
                        </div>
                        <div className="text-caption text-texto-3 truncate">
                          {p.metodo === 'EFECTIVO' ? 'Efectivo' : p.metodo === 'TRANSFERENCIA' ? 'Transferencia' : 'Otro'}
                          {p.referencia && ` · ${p.referencia}`}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <Money usd_cents={p.monto_usd_cents} size="sm" soloUsd />
                        {p.moneda === 'COR' && (
                          <div className="text-caption text-texto-3 font-mono">
                            {formatearMoneda(p.monto_cor_cents, 'COR')}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-4 px-4 text-center text-caption text-texto-3">
                  Sin abonos registrados en esta venta
                </div>
              )}
            </div>

            {/* Acciones principales */}
            <div className="space-y-2.5 pt-1">
              <Button
                variant="outline"
                className="w-full flex items-center justify-center gap-1.5 border-acento/40 text-acento hover:bg-acento/10 font-semibold"
                onClick={() => setDocumentoAbierto(true)}
              >
                <FileText className="w-4 h-4" />
                <span>{esEncargo ? 'Ver Proforma / Cotización' : 'Ver Factura Comercial'}</span>
              </Button>

              {ventaDetalle.estado !== 'CANCELADA' && ventaDetalle.saldo_usd_cents > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Button
                    variant="primary"
                    className="w-full shadow-xs"
                    onClick={() => setPagoAbierto(true)}
                  >
                    <DollarSign className="w-4 h-4" />
                    <span>Registrar abono</span>
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full text-acento bg-acento/10 border-acento/30 hover:bg-acento/20 hover:text-acento font-medium"
                    onClick={() => enviarCobroWhatsApp(ventaDetalle)}
                    title="Enviar recordatorio con cuentas bancarias por WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4 mr-1.5" />
                    <span>WhatsApp</span>
                  </Button>
                </div>
              )}

              {ventaDetalle.estado === 'PENDIENTE' && (
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => cambiarEstado(ventaDetalle, 'ENTREGADA')}
                >
                  <PackageCheck className="w-4 h-4 text-acento" />
                  <span>Marcar como entregada</span>
                </Button>
              )}

              {ventaDetalle.estado === 'COTIZADA' && (
                <p className="text-caption text-texto-3 text-center p-2 rounded-lg bg-superficie-2 border border-borde/60">
                  Este encargo se desbloquea cuando el anticipo de{' '}
                  <strong className="text-texto font-semibold">{formatearMoneda(ventaDetalle.anticipo_esperado_usd_cents, 'USD')}</strong> esté
                  cubierto.
                </p>
              )}
            </div>

            {ventaDetalle.estado !== 'CANCELADA' && (
              <div className="pt-3 border-t border-borde/70 flex justify-center">
                <button
                  type="button"
                  onClick={() => setAnulando(ventaDetalle)}
                  className="inline-flex items-center gap-1.5 text-caption text-texto-3 hover:text-danger-600 transition-colors focus-visible:outline-none"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Anular {esEncargo ? 'este encargo' : 'esta venta'}</span>
                </button>
              </div>
            )}
          </div>
        </aside>
      )}

      <VentaEditor
        abierto={editorAbierto}
        tipo={tipo}
        productos={productos}
        clientes={clientes}
        parametros={parametros}
        onCerrar={() => setEditorAbierto(false)}
        onGuardado={async () => {
          await cargar();
          onCambio();
        }}
      />

      <Confirmar
        abierto={anulando !== null}
        peligroso
        titulo={`¿Anular ${anulando?.codigo ?? ''}?`}
        consecuencias={[
          ...(anulando && anulando.tipo === 'INVENTARIO'
            ? ['Las unidades vuelven a tu inventario.']
            : []),
          ...(anulando && anulando.pagado_usd_cents > 0
            ? [
                `Los ${formatearMoneda(anulando.pagado_usd_cents, 'USD')} ya abonados quedan sin efecto.`,
              ]
            : []),
          'Deja de contar en tus ganancias.',
        ]}
        textoConfirmar={esEncargo ? 'Sí, anular el encargo' : 'Sí, anular la venta'}
        textoCancelar="No, dejarla como está"
        onConfirmar={() => anulando && cambiarEstado(anulando, 'CANCELADA')}
        onCerrar={() => setAnulando(null)}
      />

      <PagoModal
        abierto={pagoAbierto}
        venta={ventaDetalle}
        parametros={parametros}
        onCerrar={() => setPagoAbierto(false)}
        onRegistrado={async () => {
          await cargar();
          if (ventaDetalle) await abrirDetalle(ventaDetalle.id);
          onCambio();
        }}
      />

      {parametros && (
        <DocumentoModal
          abierto={documentoAbierto}
          venta={ventaDetalle}
          parametros={parametros}
          onCerrar={() => setDocumentoAbierto(false)}
        />
      )}

      {menuContextual && (
        <ContextMenu
          x={menuContextual.x}
          y={menuContextual.y}
          onClose={() => setMenuContextual(null)}
          items={[
            {
              id: 'ver-detalle',
              label: 'Ver detalle y artículos',
              icon: <Eye className="w-4 h-4" />,
              shortcut: 'Espacio',
              onClick: () => abrirDetalle(menuContextual.venta.id),
            },
            {
              id: 'ver-factura',
              label:
                menuContextual.venta.tipo === 'ENCARGO'
                  ? 'Ver Proforma / Cotización'
                  : 'Ver Factura Comercial',
              icon: <FileText className="w-4 h-4" />,
              onClick: async () => {
                await abrirDetalle(menuContextual.venta.id);
                setDocumentoAbierto(true);
              },
            },
            ...(menuContextual.venta.saldo_usd_cents > 0 &&
            menuContextual.venta.estado !== 'CANCELADA'
              ? [
                  {
                    id: 'abono',
                    label: 'Registrar abono / pago',
                    icon: <DollarSign className="w-4 h-4" />,
                    tone: 'success' as const,
                    onClick: async () => {
                      await abrirDetalle(menuContextual.venta.id);
                      setPagoAbierto(true);
                    },
                  },
                  {
                    id: 'cobro-whatsapp',
                    label: 'Cobrar por WhatsApp',
                    icon: <MessageCircle className="w-4 h-4" />,
                    onClick: () => enviarCobroWhatsApp(menuContextual.venta),
                  },
                ]
              : []),
            'separator' as const,
            {
              id: 'copiar-codigo',
              label: `Copiar código (${menuContextual.venta.codigo})`,
              icon: <Copy className="w-4 h-4" />,
              onClick: () => {
                navigator.clipboard.writeText(menuContextual.venta.codigo);
                showToast({ message: 'Código de venta copiado al portapapeles', type: 'info' });
              },
            },
            {
              id: 'copiar-cliente',
              label: `Copiar clienta (${menuContextual.venta.cliente_nombre ?? 'Mostrador'})`,
              icon: <Copy className="w-4 h-4" />,
              onClick: () => {
                navigator.clipboard.writeText(menuContextual.venta.cliente_nombre ?? 'Mostrador');
                showToast({ message: 'Clienta copiada al portapapeles', type: 'info' });
              },
            },
            'separator' as const,
            ...(menuContextual.venta.estado === 'PENDIENTE'
              ? [
                  {
                    id: 'entregar',
                    label: 'Marcar como entregada',
                    icon: <PackageCheck className="w-4 h-4" />,
                    tone: 'success' as const,
                    onClick: () => cambiarEstado(menuContextual.venta, 'ENTREGADA'),
                  },
                ]
              : []),
            ...(menuContextual.venta.estado !== 'CANCELADA'
              ? [
                  {
                    id: 'cancelar',
                    label: esEncargo ? 'Anular encargo...' : 'Anular venta...',
                    icon: <XCircle className="w-4 h-4" />,
                    tone: 'danger' as const,
                    onClick: () => setAnulando(menuContextual.venta),
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
};
