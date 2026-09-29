import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, MoreVertical, Plus, Search, X } from 'lucide-react';
import type {
  ClienteDetalle,
  ParametrosSistema,
  Venta,
  VentaCompleta,
  EstadoVenta,
  OpcionesAnulacion,
  Pago,
} from '../../../shared/types';
import {
  Badge,
  Button,
  Confirmar,
  ContextMenu,
  DataTable,
  type Column,
  type ContextMenuItem,
  type Tone,
} from '../components/ui';
import { EmptyState } from '../components/shared/EmptyState';
import { PagoModal } from '../components/PagoModal';
import { CorregirPagoModal } from '../components/CorregirPagoModal';
import { DocumentoModal } from '../components/DocumentoModal';
import { CotizarEncargoModal } from './ventas/CotizarEncargoModal';
import { AnularEncargoModal } from './ventas/AnularEncargoModal';
import { NuevoEncargoModal } from './encargos/NuevoEncargoModal';
import { MandarCotizacionModal } from './encargos/MandarCotizacionModal';
import { AceptarEncargoModal } from './encargos/AceptarEncargoModal';
import {
  etapaEncargo,
  textoEtapa,
  estadoPieza,
  sinPrecio,
  quePidio,
  descartable,
  piezasVivas,
  FASES_EN_CURSO,
  type EtapaEncargo,
} from '@core/encargos';
import { formatearMoneda, formatearFecha } from '@core/moneda';
import { hoyISO } from '@core/fechas';
import { esDeuda } from '@core/cobranza';
import { textoPagado, textoQuien } from '@core/abonos';
import { algunoContiene } from '@core/texto';
import { enlaceWhatsApp } from '../lib/whatsapp';
import { useToast } from '../context/ToastContext';
import { useClickOutside } from '../lib/useClickOutside';
import { cn } from '../lib/cn';

/**
 * Encargos, por fases: lo que las clientas pidieron y qué toca hacer con cada
 * uno. El camino es el de Ross: buscarlo, mandarle la cotización, esperar que
 * diga que sí, comprarlo, que llegue, entregarlo.
 *
 *   · Una sola barra de fases (antes, cinco tarjetas y tres pestañas que
 *     filtraban lo mismo de dos formas). Sin fase elegida, la lista sale
 *     agrupada en el orden del camino.
 *   · Cada fila dice qué pidió y en qué va ("Esperando respuesta · hace 3
 *     días"), con un solo botón visible: el "⋮".
 *   · El detalle muestra en qué fase va, sus piezas, la plata y UN botón: lo
 *     que toca ahora. Lo demás está en "Más".
 *
 * Ver `docs/PLAN_ENCARGOS_Y_SIN_CONEXION.md`, sección 2.6.
 */
interface EncargosViewProps {
  clientes: ClienteDetalle[];
  parametros: ParametrosSistema | null;
  encargoInicialId?: number;
  abrirNuevoAlEntrar?: boolean;
  onCambio: () => void;
}

type Vista = 'EN_CURSO' | 'CERRADOS';
type Cerrados = 'ENTREGADA' | 'CANCELADA';

/** Cada fase: corta en la barra, entera como título de su grupo. */
const FASE: Record<EtapaEncargo, { barra: string; titulo: string }> = {
  POR_BUSCAR: { barra: 'Por buscar', titulo: 'Por buscar' },
  POR_MANDAR: { barra: 'Por mandar', titulo: 'Por mandar la cotización' },
  ESPERANDO: { barra: 'Esperando', titulo: 'Esperando respuesta' },
  POR_COMPRAR: { barra: 'Por comprar', titulo: 'Por comprar' },
  EN_CAMINO: { barra: 'En camino', titulo: 'En camino' },
  POR_ENTREGAR: { barra: 'Por entregar', titulo: 'Por entregar' },
  ENTREGADO: { barra: 'Entregados', titulo: 'Entregados' },
  ANULADO: { barra: 'No se concretaron', titulo: 'No se concretaron' },
};

const TONO: Record<EtapaEncargo, Tone> = {
  POR_BUSCAR: 'purple',
  POR_MANDAR: 'warning',
  ESPERANDO: 'neutral',
  POR_COMPRAR: 'warning',
  EN_CAMINO: 'info',
  POR_ENTREGAR: 'success',
  ENTREGADO: 'success',
  ANULADO: 'danger',
};

/** Hasta cuántos encargos cerrados se traen. Los en curso se traen todos. */
const CERRADOS = 200;

const $ = (c: number) => formatearMoneda(c, 'USD');

/** Qué pidió: lo trae la lista; una venta leída entera lo arma de sus piezas. */
const queDe = (v: Venta | VentaCompleta) => v.que_pidio ?? ('lineas' in v && v.lineas ? quePidio(v.lineas) : '');

/** Sin ningún precio todavía: no hay total, deuda ni ganancia que mostrar. */
const sinTotal = (v: Venta) => etapaEncargo(v) === 'POR_BUSCAR' && (v.total_usd_cents || 0) === 0;

/** Una píldora de la barra de fases, activa o no. */
const pildora = (activa: boolean, apagada = false) =>
  cn(
    'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-label transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
    activa
      ? 'bg-superficie text-texto font-semibold shadow-xs border border-borde/50'
      : apagada
        ? 'text-texto-3/70 hover:text-texto'
        : 'text-texto-2 hover:text-texto'
  );

interface Paso {
  texto: string;
  accion: () => void;
  nota?: string;
  /** Un segundo botón, cuando la fase tiene dos salidas ("No aceptó"). */
  otro?: { texto: string; accion: () => void };
}

export const EncargosView: React.FC<EncargosViewProps> = ({
  clientes,
  parametros,
  encargoInicialId,
  abrirNuevoAlEntrar = false,
  onCambio,
}) => {
  const { showToast, showUndoToast } = useToast();
  const [activos, setActivos] = useState<Venta[]>([]);
  const [cerrados, setCerrados] = useState<Venta[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<Vista>('EN_CURSO');
  const [cerradosDe, setCerradosDe] = useState<Cerrados>('ENTREGADA');
  const [fase, setFase] = useState<EtapaEncargo | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState<VentaCompleta | null>(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(abrirNuevoAlEntrar);
  const [cotizando, setCotizando] = useState<VentaCompleta | null>(null);
  const [mandando, setMandando] = useState<VentaCompleta | null>(null);
  const [aceptando, setAceptando] = useState<VentaCompleta | null>(null);
  const [anulando, setAnulando] = useState<VentaCompleta | null>(null);
  const [comprando, setComprando] = useState<{ venta: VentaCompleta; ids: number[] } | null>(null);
  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [pagoCorrigiendo, setPagoCorrigiendo] = useState<Pago | null>(null);
  const [documentoAbierto, setDocumentoAbierto] = useState(false);
  const [verPagos, setVerPagos] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: (ContextMenuItem | 'separator')[] } | null>(null);

  const hoy = hoyISO();
  const lateralRef = useClickOutside<HTMLElement>(Boolean(detalle), () => setDetalle(null));

  // En curso: todos, sin importar la fecha. Un encargo de hace tres meses que
  // todavía no llegó sigue siendo trabajo pendiente. Son pocos por naturaleza.
  const cargarActivos = useCallback(async () => {
    const [cotizados, pendientes] = await Promise.all([
      window.api.ventas.list({ tipo: 'ENCARGO', estado: 'COTIZADA' }),
      window.api.ventas.list({ tipo: 'ENCARGO', estado: 'PENDIENTE' }),
    ]);
    const error = [cotizados, pendientes].find((r) => !r.success);
    if (error && !error.success) {
      showToast({ message: error.error, type: 'error' });
      return;
    }
    const todos = [cotizados, pendientes].flatMap((r) => (r.success ? r.data : []));
    setActivos(todos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id));
  }, [showToast]);

  // Entregados y anulados crecen con los años: se traen los más recientes.
  const cargarCerrados = useCallback(
    async (estado: EstadoVenta) => {
      const r = await window.api.ventas.list({ tipo: 'ENCARGO', estado, limite: CERRADOS });
      if (r.success) setCerrados(r.data);
      else showToast({ message: r.error, type: 'error' });
    },
    [showToast]
  );

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      await cargarActivos();
      if (vista === 'CERRADOS') await cargarCerrados(cerradosDe);
    } finally {
      setCargando(false);
    }
  }, [vista, cerradosDe, cargarActivos, cargarCerrados]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirDetalle = useCallback(async (id: number) => {
    const r = await window.api.ventas.get(id);
    if (r.success && r.data) {
      setDetalle(r.data);
      setVerPagos(false);
    }
  }, []);

  useEffect(() => {
    if (encargoInicialId) abrirDetalle(encargoInicialId);
  }, [encargoInicialId, abrirDetalle]);

  useEffect(() => {
    if (abrirNuevoAlEntrar) setNuevoAbierto(true);
  }, [abrirNuevoAlEntrar]);

  /** Después de cualquier cambio: la lista, el detalle abierto y el panel. */
  const refrescar = useCallback(
    async (id?: number) => {
      await cargar();
      if (id) await abrirDetalle(id);
      onCambio();
    },
    [cargar, abrirDetalle, onCambio]
  );

  /** Lo que se hace sobre una fila de la lista, que viene sin sus piezas. */
  const conCompleta = useCallback(
    async (id: number, fn: (v: VentaCompleta) => void) => {
      const r = await window.api.ventas.get(id);
      if (r.success && r.data) fn(r.data);
      else if (!r.success) showToast({ message: r.error, type: 'error' });
    },
    [showToast]
  );

  const cuenta = useMemo(() => {
    const c = new Map<EtapaEncargo, number>();
    for (const v of activos) c.set(etapaEncargo(v), (c.get(etapaEncargo(v)) ?? 0) + 1);
    return c;
  }, [activos]);

  const agrupada = vista === 'EN_CURSO' && !fase;

  const filas = useMemo(() => {
    let lista = vista === 'EN_CURSO' ? activos : (cerrados ?? []);
    if (vista === 'EN_CURSO' && fase) lista = lista.filter((v) => etapaEncargo(v) === fase);
    if (busqueda.trim()) {
      lista = lista.filter((v) => algunoContiene([v.cliente_nombre, v.codigo, v.que_pidio], busqueda));
    }
    // Agrupada, en el orden del camino; dentro de cada fase, lo más nuevo arriba.
    if (agrupada) {
      lista = [...lista].sort(
        (a, b) => FASES_EN_CURSO.indexOf(etapaEncargo(a)) - FASES_EN_CURSO.indexOf(etapaEncargo(b))
      );
    }
    return lista;
  }, [vista, activos, cerrados, fase, busqueda, agrupada]);

  // ---------------------------------------------------------------------------
  // Acciones
  // ---------------------------------------------------------------------------

  const cambiarEstado = async (v: VentaCompleta, estado: EstadoVenta, opciones?: OpcionesAnulacion) => {
    const r = await window.api.ventas.cambiarEstado(v.id, estado, opciones);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    const texto = `${v.codigo}: ${estado === 'CANCELADA' ? 'anulado' : 'entregado'}`;
    if (r.data.reversible) showUndoToast(texto, () => refrescar(v.id), r.data.evento_grupo_id);
    else showToast({ message: texto, type: 'success' });
    await refrescar(v.id);
  };

  const marcarCompradas = async (v: VentaCompleta, ids: number[], comprado: boolean) => {
    const r = await window.api.ventas.marcarCompradas(v.id, ids, comprado);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(comprado ? 'Comprado: espera paquete' : 'Otra vez por comprar', () => refrescar(v.id), r.data.evento_grupo_id);
    await refrescar(v.id);
  };

  /**
   * "Ya lo compré". Si aceptó y el anticipo no está cubierto, lo dice antes,
   * sin impedirlo: ella decide si compra con la palabra de la clienta.
   */
  const comprar = (v: VentaCompleta, ids: number[]) => {
    const sinAnticipo = v.estado === 'PENDIENTE' && v.pagado_usd_cents < v.anticipo_esperado_usd_cents;
    if (sinAnticipo) setComprando({ venta: v, ids });
    else void marcarCompradas(v, ids, true);
  };

  const descartar = async (v: VentaCompleta, id: number, descartarla: boolean) => {
    const pieza = v.lineas.find((l) => l.id === id);
    const r = await window.api.ventas.descartarPiezas(v.id, [id], descartarla);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(
      descartarla ? `'${pieza?.descripcion ?? 'La pieza'}' no se consiguió` : `'${pieza?.descripcion ?? 'La pieza'}' se vuelve a buscar`,
      () => refrescar(v.id),
      r.data.evento_grupo_id
    );
    await refrescar(v.id);
  };

  /** El siguiente paso de un encargo: lo que toca ahora, en un solo botón. */
  const siguientePaso = (v: VentaCompleta): Paso | null => {
    const e = etapaEncargo(v);
    const porComprar = v.lineas.filter((l) => estadoPieza(l) === 'POR_COMPRAR');
    switch (e) {
      case 'POR_BUSCAR':
        if (v.piezas && piezasVivas(v.piezas) <= 0) {
          return { texto: 'Cerrar: no se consiguió', accion: () => setAnulando(v) };
        }
        return {
          texto: 'Cotizar',
          accion: () => setCotizando(v),
          nota: 'Ponele precio cuando lo encuentres, o marcá lo que no se consiguió.',
        };
      case 'POR_MANDAR':
        return {
          texto: 'Mandar cotización',
          accion: () => setMandando(v),
          nota: v.cotizacion_enviada_el ? 'Cambió el precio: la que tiene la clienta quedó vieja.' : undefined,
        };
      case 'ESPERANDO':
        return {
          texto: 'Aceptó',
          accion: () => setAceptando(v),
          otro: { texto: 'No aceptó', accion: () => setAnulando(v) },
        };
      case 'POR_COMPRAR':
        return {
          texto: porComprar.length > 1 ? 'Ya compré todo' : 'Ya lo compré',
          accion: () => comprar(v, porComprar.map((l) => l.id)),
          nota:
            v.pagado_usd_cents < v.anticipo_esperado_usd_cents
              ? `Todavía no pagó el anticipo de ${$(v.anticipo_esperado_usd_cents)}.`
              : 'Cuando llegue el paquete, se agrega ahí.',
        };
      case 'EN_CAMINO':
        return null;
      case 'POR_ENTREGAR':
        return {
          texto: 'Entregar',
          accion: () => cambiarEstado(v, 'ENTREGADA'),
          nota: v.saldo_usd_cents > 0 ? `Le falta pagar ${$(v.saldo_usd_cents)}.` : undefined,
        };
      case 'ENTREGADO':
        return v.saldo_usd_cents > 0 ? { texto: 'Registrar abono', accion: () => setPagoAbierto(true) } : null;
      default:
        return null;
    }
  };

  /** Lo demás que se puede hacer con un encargo: el menú "Más" y el "⋮". */
  const otrasAcciones = (v: VentaCompleta, conDetalle: boolean): (ContextMenuItem | 'separator')[] => {
    const e = etapaEncargo(v);
    const vivo = v.estado === 'COTIZADA' || v.estado === 'PENDIENTE';
    const principal = siguientePaso(v);
    const telefono = clientes.find((c) => c.id === v.cliente_id)?.telefono;
    const items: (ContextMenuItem | 'separator')[] = [];
    if (conDetalle) items.push({ id: 'detalle', label: 'Ver detalle', onClick: () => void abrirDetalle(v.id) });
    if (conDetalle && principal) {
      items.push({ id: 'principal', label: principal.texto, tone: 'success', onClick: principal.accion });
    }
    if (e === 'ESPERANDO') items.push({ id: 'mandar', label: 'Mandarla otra vez', onClick: () => setMandando(v) });
    if (vivo && e !== 'POR_BUSCAR' && (v.estado === 'COTIZADA' || (v.piezas?.sin_precio ?? 0) > 0)) {
      items.push({ id: 'precios', label: 'Cambiar precios', onClick: () => setCotizando(v) });
    }
    if (!sinTotal(v)) {
      items.push({
        id: 'proforma',
        label: 'Proforma',
        onClick: () => {
          setDetalle(v);
          setDocumentoAbierto(true);
        },
      });
    }
    if (telefono) {
      items.push({
        id: 'whatsapp',
        label: 'WhatsApp',
        onClick: () =>
          window.open(
            enlaceWhatsApp(telefono, v.cliente_nombre ?? '', v.estado === 'CANCELADA' ? 0 : v.saldo_usd_cents, parametros),
            '_blank'
          ),
      });
    }
    if (v.estado !== 'CANCELADA' && v.saldo_usd_cents > 0 && principal?.texto !== 'Registrar abono') {
      items.push({
        id: 'abono',
        label: 'Registrar abono',
        onClick: () => {
          setDetalle(v);
          setPagoAbierto(true);
        },
      });
    }
    if (vivo) {
      items.push('separator', { id: 'anular', label: 'Anular…', tone: 'danger', onClick: () => setAnulando(v) });
    }
    return items;
  };

  const abrirMenu = (e: React.MouseEvent, id: number, conDetalle: boolean) => {
    e.stopPropagation();
    const { clientX: x, clientY: y } = e;
    void conCompleta(id, (v) => setMenu({ x, y, items: otrasAcciones(v, conDetalle) }));
  };

  /** Lo que se puede hacer con una pieza, además de lo que dice el botón principal. */
  const accionesDePieza = (
    l: VentaCompleta['lineas'][number],
    e: ReturnType<typeof estadoPieza>,
    precioAparte: boolean
  ): { texto: string; accion: () => void; principal?: boolean }[] => {
    if (!detalle) return [];
    const acciones: { texto: string; accion: () => void; principal?: boolean }[] = [];
    if (e === 'POR_COMPRAR' && !sinPrecio(l) && precioAparte) {
      // Antes de que acepte se puede comprar igual, pero no se empuja a hacerlo.
      acciones.push({ texto: 'Ya lo compré', accion: () => comprar(detalle, [l.id]), principal: detalle.estado === 'PENDIENTE' });
    }
    if (e === 'COMPRADA') acciones.push({ texto: 'Desmarcar', accion: () => void marcarCompradas(detalle, [l.id], false) });
    if (descartable(l)) acciones.push({ texto: 'No se consiguió', accion: () => void descartar(detalle, l.id, true) });
    if (e === 'DESCARTADA') acciones.push({ texto: 'Volver a buscar', accion: () => void descartar(detalle, l.id, false) });
    return acciones;
  };

  /** De dónde sale cada pieza, en palabras. */
  const dondeEsta = (l: VentaCompleta['lineas'][number]) => {
    const e = estadoPieza(l);
    if (e === 'DESCARTADA') return 'No se consiguió';
    if (e === 'LLEGO') return `Llegó en ${l.compra_codigo ?? 'su paquete'}${l.llego_el ? ` el ${formatearFecha(l.llego_el)}` : ''}`;
    if (e === 'EN_CAMINO') return `Viene en ${l.compra_codigo ?? 'un paquete'}`;
    if (e === 'COMPRADA') return `Comprado${l.comprado_el ? ` el ${formatearFecha(l.comprado_el)}` : ''}, espera paquete`;
    if (e === 'DE_BODEGA') return 'Sale de la bodega';
    if (sinPrecio(l)) return 'Por buscar';
    // "Por comprar" es lo que toca cuando aceptó; antes, sólo no se compró.
    return detalle?.estado === 'COTIZADA' ? 'Sin comprar' : 'Por comprar';
  };

  // ---------------------------------------------------------------------------

  const columnas: Column<Venta>[] = [
    {
      key: 'quien',
      header: 'Encargo',
      render: (v) => (
        <div className="min-w-0">
          <div className="text-body font-medium text-texto truncate">{v.cliente_nombre ?? 'Sin clienta'}</div>
          {/* El código va primero: es el que dice la proforma, y el que ella
              le nombra a la clienta. */}
          <div className="text-caption text-texto-3 truncate max-w-[42ch]">
            <span className="tabular">{v.codigo}</span>
            {queDe(v) && ` · ${queDe(v)}`}
          </div>
        </div>
      ),
    },
    {
      key: 'fase',
      header: 'En qué va',
      width: '240px',
      render: (v) => (
        <Badge tone={TONO[etapaEncargo(v)]} className="font-medium whitespace-nowrap">
          {textoEtapa(v, hoy)}
        </Badge>
      ),
    },
    {
      key: 'fecha',
      header: 'Pedido',
      width: '110px',
      render: (v) => <span className="text-caption text-texto-3 tabular">{formatearFecha(v.fecha)}</span>,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      width: '110px',
      render: (v) =>
        sinTotal(v) ? (
          <span className="text-caption text-texto-3 whitespace-nowrap">Sin precio</span>
        ) : (
          <span className="text-body text-texto tabular">{$(v.total_usd_cents)}</span>
        ),
    },
    {
      key: 'debe',
      header: 'Debe',
      align: 'right',
      width: '110px',
      // Sólo lo que es deuda (`esDeuda`): un encargo que la clienta todavía no
      // aceptó no le debe nada. Antes esta columna mostraba el total de una
      // cotización recién mandada como si fuera plata en la calle.
      render: (v) =>
        esDeuda(v) ? (
          <span className="text-body font-semibold text-alerta tabular">{$(v.saldo_usd_cents)}</span>
        ) : (
          <span className="text-caption text-texto-3">—</span>
        ),
    },
    {
      key: 'menu',
      header: '',
      align: 'right',
      width: '52px',
      render: (v) => (
        <button
          type="button"
          onClick={(e) => abrirMenu(e, v.id, true)}
          aria-label={`Opciones de ${v.codigo}`}
          className="p-1 rounded-lg text-texto-3 hover:text-texto h-7 w-7 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  const paso = detalle ? siguientePaso(detalle) : null;
  const etapaDetalle = detalle ? etapaEncargo(detalle) : null;
  const vivoDetalle = detalle ? detalle.estado === 'COTIZADA' || detalle.estado === 'PENDIENTE' : false;
  // La pieza que el botón principal ya cubre no repite su acción al lado.
  const porComprarDetalle = (detalle?.lineas ?? []).filter((l) => estadoPieza(l) === 'POR_COMPRAR' && !sinPrecio(l));
  const indiceFase = etapaDetalle ? FASES_EN_CURSO.indexOf(etapaDetalle) : -1;

  const elegirFase = (f: EtapaEncargo) => {
    setVista('EN_CURSO');
    setFase(vista === 'EN_CURSO' && fase === f ? null : f);
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:px-6 md:py-4 animate-fade-in">
        <div className="max-w-[1500px] w-full mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-label text-texto-3 tabular">{activos.length} en curso</span>
            <Button variant="primary" size="sm" className="rounded-xl shadow-xs" onClick={() => setNuevoAbierto(true)}>
              <Plus className="w-4 h-4" />
              <span>Nuevo encargo</span>
            </Button>
          </div>

          {/* Las fases, en el orden en que pasan. Tocar una filtra; tocarla
              otra vez vuelve a mostrar todo, agrupado. */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div
              className="inline-flex items-center gap-0.5 p-1 bg-superficie-2/80 rounded-xl border border-borde/70 flex-wrap"
              role="group"
              aria-label="Fases"
            >
              {FASES_EN_CURSO.map((f) => {
                const n = cuenta.get(f) ?? 0;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => elegirFase(f)}
                    aria-pressed={vista === 'EN_CURSO' && fase === f}
                    className={pildora(vista === 'EN_CURSO' && fase === f, n === 0)}
                  >
                    <span>{FASE[f].barra}</span>
                    <span className="tabular text-caption text-texto-3">{n}</span>
                  </button>
                );
              })}
              <span className="w-px h-5 bg-borde mx-1" aria-hidden="true" />
              <button
                type="button"
                onClick={() => {
                  setVista(vista === 'CERRADOS' ? 'EN_CURSO' : 'CERRADOS');
                  setFase(null);
                  setCerrados(null);
                }}
                aria-pressed={vista === 'CERRADOS'}
                className={pildora(vista === 'CERRADOS')}
              >
                Cerrados
              </button>
            </div>

            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-3" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar clienta, código o qué pidió"
                aria-label="Buscar encargos"
                className="w-full rounded-xl border border-borde bg-superficie-2/80 py-1.5 pl-9 pr-8 text-label text-texto placeholder:text-texto-3 outline-none focus:border-acento-suave focus:ring-2 focus:ring-acento"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-texto-3 hover:text-texto"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {vista === 'CERRADOS' && (
            <div className="inline-flex rounded-lg bg-superficie-2 p-0.5" role="radiogroup" aria-label="Qué cerrados ver">
              {(
                [
                  { id: 'ENTREGADA', texto: 'Entregados' },
                  { id: 'CANCELADA', texto: 'No se concretaron' },
                ] as { id: Cerrados; texto: string }[]
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={cerradosDe === c.id}
                  onClick={() => {
                    setCerradosDe(c.id);
                    setCerrados(null);
                  }}
                  className={cn(
                    'rounded-md px-3 py-1 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
                    cerradosDe === c.id ? 'bg-superficie text-texto font-medium shadow-2xs' : 'text-texto-3 hover:text-texto'
                  )}
                >
                  {c.texto}
                </button>
              ))}
            </div>
          )}

          {cargando && filas.length === 0 ? (
            <div className="p-12 text-center text-body text-texto-3">Cargando encargos…</div>
          ) : filas.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={
                busqueda || fase
                  ? 'Nada con ese filtro'
                  : vista === 'EN_CURSO'
                    ? 'No hay encargos en curso'
                    : cerradosDe === 'ENTREGADA'
                      ? 'Todavía no se entregó ninguno'
                      : 'Ninguno quedó sin concretarse'
              }
              description={
                vista === 'EN_CURSO' && !busqueda && !fase
                  ? 'Anotá lo que te pide una clienta, aunque todavía no sepas cuánto vale.'
                  : 'Probá con otra búsqueda.'
              }
              action={
                vista === 'EN_CURSO' && !busqueda && !fase ? (
                  <Button variant="primary" size="sm" onClick={() => setNuevoAbierto(true)}>
                    <Plus className="w-4 h-4" />
                    <span>Nuevo encargo</span>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            // La tabla maneja su propia selección. Si el "clic afuera" del
            // detalle la tocara, el mousedown en otra fila cerraba el panel,
            // la tabla se ensanchaba, las filas subían, y el click caía en
            // otra parte: hacían falta dos clics para cambiar de encargo.
            <div data-ignorar-afuera>
            <DataTable
              columns={columnas}
              rows={filas}
              rowKey={(v) => v.id}
              selectedKey={detalle?.id}
              grupoDe={
                agrupada
                  ? (v) => {
                      const f = etapaEncargo(v);
                      return `${FASE[f].titulo} · ${cuenta.get(f) ?? 0}`;
                    }
                  : undefined
              }
              onRowClick={(v) => (detalle?.id === v.id ? setDetalle(null) : abrirDetalle(v.id))}
              onRowContextMenu={(v, e) => abrirMenu(e, v.id, true)}
            />
            </div>
          )}
          {vista === 'CERRADOS' && (cerrados?.length ?? 0) >= CERRADOS && (
            <p className="text-caption text-texto-3 text-center">Se muestran los más recientes. Buscá por clienta para ver uno anterior en su ficha.</p>
          )}
        </div>
      </div>

      {detalle && etapaDetalle && (
        <aside
          ref={lateralRef}
          className="w-[400px] border-l border-borde bg-superficie flex flex-col shrink-0 animate-drawer shadow-xl z-10"
          aria-label={`Encargo ${detalle.codigo}`}
        >
          <div className="p-5 border-b border-borde flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <h3 className="text-title font-bold text-texto tracking-tight truncate">{detalle.cliente_nombre ?? 'Sin clienta'}</h3>
              <p className="text-caption text-texto-3 tabular mt-0.5">
                {detalle.codigo} · pedido el {formatearFecha(detalle.fecha)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDetalle(null)} aria-label="Cerrar detalle">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* En qué va: seis puntos, los hechos llenos. */}
            <div className="space-y-2">
              {indiceFase >= 0 || etapaDetalle === 'ENTREGADO' ? (
                <ol className="flex items-center gap-1.5" aria-label="En qué va">
                  {FASES_EN_CURSO.map((f, i) => {
                    const hecha = etapaDetalle === 'ENTREGADO' || i < indiceFase;
                    const actual = i === indiceFase;
                    return (
                      <li
                        key={f}
                        aria-current={actual ? 'step' : undefined}
                        aria-label={`${FASE[f].titulo}${hecha ? ': hecho' : actual ? ': ahora' : ''}`}
                        className={cn(
                          'h-1.5 flex-1 rounded-full',
                          hecha ? 'bg-acento' : actual ? 'bg-acento/50' : 'bg-superficie-2'
                        )}
                      />
                    );
                  })}
                </ol>
              ) : null}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone={TONO[etapaDetalle]} className="text-[11px] whitespace-nowrap">
                  {textoEtapa(detalle, hoy)}
                </Badge>
                {indiceFase >= 0 && (
                  <span className="text-caption text-texto-3 tabular">
                    Fase {indiceFase + 1} de {FASES_EN_CURSO.length}
                  </span>
                )}
              </div>
            </div>

            {/* Qué pidió, y dónde está cada pieza, con su acción. */}
            <ul className="space-y-3">
              {detalle.lineas.map((l) => {
                const e = estadoPieza(l);
                const precioAparte = porComprarDetalle.length > 1 || etapaDetalle !== 'POR_COMPRAR';
                return (
                  <li key={l.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn('text-body', e === 'DESCARTADA' ? 'text-texto-3 line-through' : 'text-texto')}>
                        {l.descripcion}
                      </p>
                      {e !== 'DESCARTADA' && (
                        <p className="text-caption text-texto-3 tabular">
                          {sinPrecio(l) ? `${l.cantidad} · sin precio` : `${l.cantidad} × ${$(l.precio_unitario_usd_cents)}`}
                        </p>
                      )}
                      {vivoDetalle && (
                        <p className="text-caption text-texto-2 flex items-center gap-x-1.5 gap-y-0.5 flex-wrap">
                          <span>{dondeEsta(l)}</span>
                          {accionesDePieza(l, e, precioAparte).map((a) => (
                            <React.Fragment key={a.texto}>
                              <span aria-hidden="true" className="text-texto-3">
                                ·
                              </span>
                              <button
                                type="button"
                                onClick={a.accion}
                                className={cn(
                                  'rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
                                  a.principal
                                    ? 'text-acento font-medium hover:underline'
                                    : 'text-texto-2 underline decoration-dotted underline-offset-2 hover:text-texto'
                                )}
                              >
                                {a.texto}
                              </button>
                            </React.Fragment>
                          ))}
                        </p>
                      )}
                    </div>
                    <span className={cn('text-body tabular shrink-0', e === 'DESCARTADA' ? 'text-texto-3' : 'text-texto')}>
                      {e === 'DESCARTADA' || sinPrecio(l) ? '—' : $(l.subtotal_usd_cents)}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* La plata, en una línea */}
            {!sinTotal(detalle) && detalle.estado !== 'CANCELADA' && (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-superficie-2 px-4 py-3 text-label tabular">
                <span className="text-texto-2">
                  Total <strong className="text-texto">{$(detalle.total_usd_cents)}</strong>
                </span>
                <span className="text-texto-2">
                  Pagó <strong className="text-texto">{$(detalle.pagado_usd_cents)}</strong>
                </span>
                {detalle.estado === 'COTIZADA' ? (
                  <span className="text-texto-2">
                    Anticipo <strong className="text-texto">{$(detalle.anticipo_esperado_usd_cents)}</strong>
                  </span>
                ) : (
                  <span className="text-texto-2">
                    Debe{' '}
                    <strong className={detalle.saldo_usd_cents > 0 ? 'text-alerta' : 'text-texto'}>
                      {$(Math.max(0, detalle.saldo_usd_cents))}
                    </strong>
                  </span>
                )}
              </div>
            )}

            {detalle.notas && <p className="text-label text-texto-2 whitespace-pre-line">{detalle.notas}</p>}

            {/* Lo que toca ahora */}
            <div className="space-y-2">
              {paso ? (
                <div className="flex gap-2">
                  <Button variant="primary" className="flex-1" onClick={paso.accion}>
                    {paso.texto}
                  </Button>
                  {paso.otro && (
                    <Button variant="secondary" onClick={paso.otro.accion}>
                      {paso.otro.texto}
                    </Button>
                  )}
                </div>
              ) : etapaDetalle === 'EN_CAMINO' ? (
                <p className="text-label text-texto-2 text-center rounded-lg bg-superficie-2 p-3">Se entrega cuando llegue todo.</p>
              ) : null}
              {paso?.nota && <p className="text-caption text-texto-3 text-center">{paso.nota}</p>}
            </div>

            {/* Lo demás */}
            <div className="flex items-center justify-between gap-3">
              {(detalle.pagos ?? []).length > 0 ? (
                <button
                  type="button"
                  onClick={() => setVerPagos((x) => !x)}
                  aria-expanded={verPagos}
                  className="text-label text-texto-2 hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento rounded"
                >
                  Pagos ({detalle.pagos.length})
                </button>
              ) : (
                <span />
              )}
              <Button variant="ghost" size="sm" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, items: otrasAcciones(detalle, false) })}>
                <MoreVertical className="w-4 h-4" />
                <span>Más</span>
              </Button>
            </div>

            {verPagos && (
              <ul className="space-y-1 animate-fila-nueva">
                {detalle.pagos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-label tabular">
                    <span className={cn('text-texto-2 min-w-0 truncate', !p.activo && 'line-through')}>
                      {formatearFecha(p.fecha)}
                      {p.es_anticipo ? ' · anticipo' : ''}
                      <span className="text-texto-3">{` · ${textoQuien(p)}`}</span>
                    </span>
                    <span className="flex items-center gap-1 shrink-0">
                      {/* En la moneda en que pagó. */}
                      <span className={cn('text-texto', !p.activo && 'line-through text-texto-3')}>{textoPagado(p)}</span>
                      {p.activo && detalle.estado !== 'CANCELADA' && (
                        <button
                          type="button"
                          onClick={() => setPagoCorrigiendo(p)}
                          className="text-caption text-texto-3 hover:text-texto px-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento"
                        >
                          Corregir
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

      <NuevoEncargoModal
        abierto={nuevoAbierto}
        clientes={clientes}
        onCerrar={() => setNuevoAbierto(false)}
        onGuardado={(id) => refrescar(id)}
      />

      <CotizarEncargoModal
        venta={cotizando}
        parametros={parametros}
        onGuardado={(grupo) => {
          const v = cotizando;
          showUndoToast(`${v?.codigo ?? ''}: precios guardados`, () => refrescar(v?.id), grupo);
          void refrescar(v?.id);
        }}
        onCerrar={() => setCotizando(null)}
      />

      <MandarCotizacionModal
        venta={mandando}
        parametros={parametros}
        telefono={mandando ? clientes.find((c) => c.id === mandando.cliente_id)?.telefono : undefined}
        onMandada={(grupo) => {
          const v = mandando;
          showUndoToast(`${v?.codigo ?? ''}: cotización mandada`, () => refrescar(v?.id), grupo);
          void refrescar(v?.id);
        }}
        onCerrar={() => setMandando(null)}
      />

      <AceptarEncargoModal
        venta={aceptando}
        parametros={parametros}
        onAceptado={(grupo) => {
          const v = aceptando;
          showUndoToast(`${v?.codigo ?? ''}: aceptó`, () => refrescar(v?.id), grupo);
          void refrescar(v?.id);
        }}
        onCerrar={() => setAceptando(null)}
      />

      <AnularEncargoModal
        venta={anulando}
        onConfirmar={(opciones) => anulando && cambiarEstado(anulando, 'CANCELADA', opciones)}
        onCerrar={() => setAnulando(null)}
      />

      <Confirmar
        abierto={comprando !== null}
        titulo="¿Lo compraste igual?"
        consecuencias={
          comprando
            ? [
                comprando.venta.pagado_usd_cents > 0
                  ? `${comprando.venta.cliente_nombre ?? 'La clienta'} pagó ${$(comprando.venta.pagado_usd_cents)} de un anticipo de ${$(comprando.venta.anticipo_esperado_usd_cents)}.`
                  : `${comprando.venta.cliente_nombre ?? 'La clienta'} todavía no pagó el anticipo de ${$(comprando.venta.anticipo_esperado_usd_cents)}.`,
                'Si después no lo quiere, la pieza queda para tu bodega.',
              ]
            : []
        }
        textoCancelar="Todavía no"
        textoConfirmar="Sí, ya lo compré"
        onConfirmar={() => comprando && void marcarCompradas(comprando.venta, comprando.ids, true)}
        onCerrar={() => setComprando(null)}
      />

      <PagoModal
        abierto={pagoAbierto}
        venta={detalle}
        parametros={parametros}
        onCorregir={setPagoCorrigiendo}
        onCerrar={() => setPagoAbierto(false)}
        onRegistrado={async () => {
          setPagoAbierto(false);
          if (detalle) await refrescar(detalle.id);
        }}
      />

      <CorregirPagoModal
        abierto={pagoCorrigiendo !== null}
        pago={pagoCorrigiendo}
        venta={detalle}
        encima={pagoAbierto}
        onCerrar={() => setPagoCorrigiendo(null)}
        onCorregido={async () => {
          if (detalle) await refrescar(detalle.id);
        }}
      />

      {parametros && (
        <DocumentoModal
          abierto={documentoAbierto}
          venta={detalle}
          parametros={parametros}
          onCerrar={() => setDocumentoAbierto(false)}
        />
      )}
    </div>
  );
};
