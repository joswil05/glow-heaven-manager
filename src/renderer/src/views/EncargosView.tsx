import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Plus, Search, X } from 'lucide-react';
import type { ClienteDetalle, ParametrosSistema, Venta, VentaCompleta, EstadoVenta, OpcionesAnulacion } from '../../../shared/types';
import { Badge, Button, DataTable, StatTile, type Column, type Tone } from '../components/ui';
import { EmptyState } from '../components/shared/EmptyState';
import { PagoModal } from '../components/PagoModal';
import { DocumentoModal } from '../components/DocumentoModal';
import { CotizarEncargoModal } from './ventas/CotizarEncargoModal';
import { AnularEncargoModal } from './ventas/AnularEncargoModal';
import { NuevoEncargoModal } from './encargos/NuevoEncargoModal';
import { etapaEncargo, textoEtapa, estadoPieza, sinPrecio, quePidio, type EtapaEncargo } from '@core/encargos';
import { formatearMoneda, formatearFecha } from '@core/moneda';
import { hoyISO } from '@core/fechas';
import { algunoContiene } from '@core/texto';
import { enlaceWhatsApp } from '../lib/whatsapp';
import { useToast } from '../context/ToastContext';
import { useClickOutside } from '../lib/useClickOutside';
import { cn } from '../lib/cn';

/**
 * Encargos: lo que las clientas pidieron, en qué va cada uno y qué hay que
 * hacer después.
 *
 * Antes era la pantalla de ventas con un interruptor: siete filtros, un
 * período que escondía encargos viejos todavía en curso, y un detalle con
 * cinco botones sin decir cuál tocaba. Acá:
 *   · "En curso" muestra todo lo que falta terminar, sin importar la fecha;
 *     las tarjetas de arriba lo separan por lo que hay que hacer.
 *   · cada fila dice qué pidió;
 *   · el detalle tiene UN botón principal, el siguiente paso, y lo demás
 *     queda como enlaces chicos.
 */
interface EncargosViewProps {
  clientes: ClienteDetalle[];
  parametros: ParametrosSistema | null;
  encargoInicialId?: number;
  abrirNuevoAlEntrar?: boolean;
  onCambio: () => void;
}

type Vista = 'EN_CURSO' | 'ENTREGADOS' | 'ANULADOS';

/** Las etapas en las que hay algo que hacer, en el orden en que pasan. */
const ETAPAS: { etapa: EtapaEncargo; titulo: string; hint: string }[] = [
  { etapa: 'POR_BUSCAR', titulo: 'Por buscar', hint: 'Esperan precio' },
  { etapa: 'POR_MANDAR', titulo: 'Por mandar', hint: 'Falta mandarla' },
  { etapa: 'ESPERANDO', titulo: 'Esperando', hint: 'Que responda' },
  { etapa: 'POR_COMPRAR', titulo: 'Por comprar', hint: 'Ya confirmados' },
  { etapa: 'EN_CAMINO', titulo: 'En camino', hint: 'Comprados' },
  { etapa: 'POR_ENTREGAR', titulo: 'Por entregar', hint: 'Ya llegaron' },
];

const TONO: Record<EtapaEncargo, Tone> = {
  POR_BUSCAR: 'purple',
  POR_MANDAR: 'neutral',
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
  const [etapa, setEtapa] = useState<EtapaEncargo | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState<VentaCompleta | null>(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(abrirNuevoAlEntrar);
  const [cotizando, setCotizando] = useState<VentaCompleta | null>(null);
  const [anulando, setAnulando] = useState<VentaCompleta | null>(null);
  const [pagoAbierto, setPagoAbierto] = useState(false);
  const [documentoAbierto, setDocumentoAbierto] = useState(false);

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
      if (vista === 'ENTREGADOS') await cargarCerrados('ENTREGADA');
      if (vista === 'ANULADOS') await cargarCerrados('CANCELADA');
    } finally {
      setCargando(false);
    }
  }, [vista, cargarActivos, cargarCerrados]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const abrirDetalle = useCallback(async (id: number) => {
    const r = await window.api.ventas.get(id);
    if (r.success && r.data) setDetalle(r.data);
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

  const cuenta = useMemo(() => {
    const c = new Map<EtapaEncargo, number>();
    for (const v of activos) c.set(etapaEncargo(v), (c.get(etapaEncargo(v)) ?? 0) + 1);
    return c;
  }, [activos]);

  const filas = useMemo(() => {
    let lista = vista === 'EN_CURSO' ? activos : (cerrados ?? []);
    if (vista === 'EN_CURSO' && etapa) lista = lista.filter((v) => etapaEncargo(v) === etapa);
    if (busqueda.trim()) {
      lista = lista.filter((v) => algunoContiene([v.cliente_nombre, v.codigo, v.que_pidio], busqueda));
    }
    return lista;
  }, [vista, activos, cerrados, etapa, busqueda]);

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

  /** El siguiente paso de un encargo: un solo botón, lo que toca ahora. */
  const siguientePaso = (v: VentaCompleta): { texto: string; accion: () => void; nota?: string } | null => {
    const e = etapaEncargo(v);
    const porComprar = v.lineas.filter((l) => estadoPieza(l) === 'POR_COMPRAR');
    switch (e) {
      case 'POR_BUSCAR':
        return { texto: 'Cotizar', accion: () => setCotizando(v), nota: 'Ponele precio cuando lo encuentres.' };
      case 'POR_MANDAR':
      case 'ESPERANDO':
        return {
          texto: 'Registrar anticipo',
          accion: () => setPagoAbierto(true),
          nota: `Se confirma con ${$(v.anticipo_esperado_usd_cents)}.`,
        };
      case 'POR_COMPRAR':
        return {
          texto: porComprar.length > 1 ? 'Ya compré todo' : 'Ya lo compré',
          accion: () => marcarCompradas(v, porComprar.map((l) => l.id), true),
          nota: 'Cuando llegue el paquete, se agrega ahí.',
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

  /** De dónde sale cada pieza, en palabras. */
  const dondeEsta = (l: VentaCompleta['lineas'][number]) => {
    const e = estadoPieza(l);
    if (e === 'LLEGO') return `Llegó en ${l.compra_codigo ?? 'su paquete'}${l.llego_el ? ` el ${formatearFecha(l.llego_el)}` : ''}`;
    if (e === 'EN_CAMINO') return `Viene en ${l.compra_codigo ?? 'un paquete'}`;
    if (e === 'COMPRADA') return `Comprado${l.comprado_el ? ` el ${formatearFecha(l.comprado_el)}` : ''}, espera paquete`;
    if (e === 'DE_BODEGA') return 'Sale de la bodega';
    return 'Por comprar';
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
      key: 'etapa',
      header: 'Estado',
      width: '200px',
      render: (v) => (
        <Badge tone={TONO[etapaEncargo(v)]} className="font-medium whitespace-nowrap">
          {textoEtapa(v, hoyISO())}
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
      width: '120px',
      render: (v) =>
        sinTotal(v) ? (
          <span className="text-caption text-texto-3">Por cotizar</span>
        ) : (
          <span className="text-body text-texto tabular">{$(v.total_usd_cents)}</span>
        ),
    },
    {
      key: 'debe',
      header: 'Debe',
      align: 'right',
      width: '120px',
      render: (v) =>
        v.estado === 'CANCELADA' || sinTotal(v) || v.saldo_usd_cents <= 0 ? (
          <span className="text-caption text-texto-3">—</span>
        ) : (
          <span className="text-body font-semibold text-alerta tabular">{$(v.saldo_usd_cents)}</span>
        ),
    },
  ];

  const paso = detalle ? siguientePaso(detalle) : null;
  const telefono = detalle ? clientes.find((c) => c.id === detalle.cliente_id)?.telefono : undefined;
  const hayPiezasPorComprar = (detalle?.lineas ?? []).filter((l) => estadoPieza(l) === 'POR_COMPRAR').length;

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:px-6 md:py-4 animate-fade-in">
        <div className="max-w-[1500px] w-full mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-label text-texto-3 tabular">
              {activos.length} en curso
            </span>
            <Button variant="primary" size="sm" className="rounded-xl shadow-xs" onClick={() => setNuevoAbierto(true)}>
              <Plus className="w-4 h-4" />
              <span>Nuevo encargo</span>
            </Button>
          </div>

          {/* Lo que hay que hacer, por etapa. Tocar una tarjeta filtra. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {ETAPAS.map((x) => (
              <StatTile
                key={x.etapa}
                label={x.titulo}
                value={cuenta.get(x.etapa) ?? 0}
                hint={x.hint}
                onClick={() => {
                  setVista('EN_CURSO');
                  setEtapa(etapa === x.etapa ? null : x.etapa);
                }}
                className={cn(etapa === x.etapa && vista === 'EN_CURSO' && 'ring-2 ring-acento/60')}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div
              className="inline-flex items-center p-1 bg-superficie-2/80 rounded-xl border border-borde/70 w-fit"
              role="group"
              aria-label="Qué encargos ver"
            >
              {(
                [
                  { id: 'EN_CURSO', texto: 'En curso' },
                  { id: 'ENTREGADOS', texto: 'Entregados' },
                  { id: 'ANULADOS', texto: 'Anulados' },
                ] as { id: Vista; texto: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => {
                    setVista(f.id);
                    setEtapa(null);
                    setCerrados(null);
                  }}
                  aria-pressed={vista === f.id}
                  className={cn(
                    'px-3.5 py-1.5 rounded-lg text-label transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
                    vista === f.id
                      ? 'bg-superficie text-texto font-semibold shadow-xs border border-borde/50'
                      : 'text-texto-3 hover:text-texto'
                  )}
                >
                  {f.texto}
                </button>
              ))}
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

          {cargando && filas.length === 0 ? (
            <div className="p-12 text-center text-body text-texto-3">Cargando encargos…</div>
          ) : filas.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={
                busqueda || etapa
                  ? 'Nada con ese filtro'
                  : vista === 'EN_CURSO'
                    ? 'No hay encargos en curso'
                    : vista === 'ENTREGADOS'
                      ? 'Todavía no se entregó ninguno'
                      : 'No hay encargos anulados'
              }
              description={
                vista === 'EN_CURSO' && !busqueda && !etapa
                  ? 'Anotá lo que te pide una clienta, aunque todavía no sepas cuánto vale.'
                  : 'Probá con otra búsqueda.'
              }
              action={
                vista === 'EN_CURSO' && !busqueda && !etapa ? (
                  <Button variant="primary" size="sm" onClick={() => setNuevoAbierto(true)}>
                    <Plus className="w-4 h-4" />
                    <span>Nuevo encargo</span>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <DataTable
              columns={columnas}
              rows={filas}
              rowKey={(v) => v.id}
              selectedKey={detalle?.id}
              onRowClick={(v) => (detalle?.id === v.id ? setDetalle(null) : abrirDetalle(v.id))}
            />
          )}
          {vista !== 'EN_CURSO' && (cerrados?.length ?? 0) >= CERRADOS && (
            <p className="text-caption text-texto-3 text-center">Se muestran los más recientes. Buscá por clienta para ver uno anterior en su ficha.</p>
          )}
        </div>
      </div>

      {detalle && (
        <aside
          ref={lateralRef}
          className="w-[400px] border-l border-borde bg-superficie flex flex-col shrink-0 animate-drawer shadow-xl z-10"
          aria-label={`Encargo ${detalle.codigo}`}
        >
          <div className="p-5 border-b border-borde flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-title font-bold text-texto tracking-tight truncate">
                  {detalle.cliente_nombre ?? 'Sin clienta'}
                </h3>
                <Badge tone={TONO[etapaEncargo(detalle)]} className="text-[11px] whitespace-nowrap">
                  {textoEtapa(detalle, hoyISO())}
                </Badge>
              </div>
              <p className="text-caption text-texto-3 tabular mt-0.5">
                {detalle.codigo} · pedido el {formatearFecha(detalle.fecha)}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setDetalle(null)} aria-label="Cerrar detalle">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Qué pidió, y dónde está cada pieza */}
            <ul className="space-y-3">
              {detalle.lineas.map((l) => {
                const e = estadoPieza(l);
                const vivo = detalle.estado === 'COTIZADA' || detalle.estado === 'PENDIENTE';
                return (
                  <li key={l.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body text-texto">{l.descripcion}</p>
                      <p className="text-caption text-texto-3 tabular">
                        {sinPrecio(l) ? `${l.cantidad} · sin precio` : `${l.cantidad} × ${$(l.precio_unitario_usd_cents)}`}
                      </p>
                      {vivo && (
                        <p className="text-caption text-texto-2 flex items-center gap-2 flex-wrap">
                          <span>{dondeEsta(l)}</span>
                          {/* Con varias piezas se compran por separado; con una,
                              lo hace el botón principal. */}
                          {e === 'POR_COMPRAR' && hayPiezasPorComprar > 1 && (
                            <button
                              type="button"
                              onClick={() => marcarCompradas(detalle, [l.id], true)}
                              className="text-acento font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento rounded"
                            >
                              Ya lo compré
                            </button>
                          )}
                          {e === 'COMPRADA' && (
                            <button
                              type="button"
                              onClick={() => marcarCompradas(detalle, [l.id], false)}
                              className="text-texto-3 hover:text-texto hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento rounded"
                            >
                              Desmarcar
                            </button>
                          )}
                        </p>
                      )}
                    </div>
                    <span className="text-body text-texto tabular shrink-0">
                      {sinPrecio(l) ? '—' : $(l.subtotal_usd_cents)}
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
                <span className="text-texto-2">
                  Debe{' '}
                  <strong className={detalle.saldo_usd_cents > 0 ? 'text-alerta' : 'text-texto'}>
                    {$(Math.max(0, detalle.saldo_usd_cents))}
                  </strong>
                </span>
              </div>
            )}

            {detalle.notas && <p className="text-label text-texto-2 whitespace-pre-line">{detalle.notas}</p>}

            {/* El siguiente paso */}
            <div className="space-y-2">
              {paso ? (
                <Button variant="primary" className="w-full" onClick={paso.accion}>
                  {paso.texto}
                </Button>
              ) : etapaEncargo(detalle) === 'EN_CAMINO' ? (
                <p className="text-label text-texto-2 text-center rounded-lg bg-superficie-2 p-3">
                  Se entrega cuando llegue todo.
                </p>
              ) : null}
              {paso?.nota && <p className="text-caption text-texto-3 text-center">{paso.nota}</p>}
            </div>

            {/* Lo demás, chico */}
            <div className="flex items-center justify-center gap-x-4 gap-y-2 flex-wrap text-label">
              {!sinTotal(detalle) && (
                <button type="button" onClick={() => setDocumentoAbierto(true)} className="text-texto-2 hover:text-texto hover:underline">
                  Proforma
                </button>
              )}
              {telefono && (
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      enlaceWhatsApp(telefono, detalle.cliente_nombre ?? '', detalle.estado === 'CANCELADA' ? 0 : detalle.saldo_usd_cents, parametros),
                      '_blank'
                    )
                  }
                  className="text-texto-2 hover:text-texto hover:underline"
                >
                  WhatsApp
                </button>
              )}
              {detalle.estado === 'COTIZADA' && etapaEncargo(detalle) !== 'POR_BUSCAR' && (
                <button type="button" onClick={() => setCotizando(detalle)} className="text-texto-2 hover:text-texto hover:underline">
                  Cambiar precios
                </button>
              )}
              {detalle.estado !== 'CANCELADA' && detalle.saldo_usd_cents > 0 && paso?.texto !== 'Registrar anticipo' && paso?.texto !== 'Registrar abono' && (
                <button type="button" onClick={() => setPagoAbierto(true)} className="text-texto-2 hover:text-texto hover:underline">
                  Registrar abono
                </button>
              )}
              {detalle.estado !== 'CANCELADA' && (
                <button type="button" onClick={() => setAnulando(detalle)} className="text-texto-3 hover:text-danger-600 hover:underline">
                  Anular
                </button>
              )}
            </div>

            {/* Lo que pagó */}
            {(detalle.pagos ?? []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-label font-medium text-texto">Pagos</p>
                <ul className="space-y-1">
                  {(detalle.pagos ?? []).map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-label tabular">
                      <span className={cn('text-texto-2', !p.activo && 'line-through')}>
                        {formatearFecha(p.fecha)}
                        {p.es_anticipo ? ' · anticipo' : ''}
                      </span>
                      <span className={cn('text-texto', !p.activo && 'line-through text-texto-3')}>{$(p.monto_usd_cents)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      )}

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

      <AnularEncargoModal
        venta={anulando}
        onConfirmar={(opciones) => anulando && cambiarEstado(anulando, 'CANCELADA', opciones)}
        onCerrar={() => setAnulando(null)}
      />

      <PagoModal
        abierto={pagoAbierto}
        venta={detalle}
        parametros={parametros}
        onCerrar={() => setPagoAbierto(false)}
        onRegistrado={async () => {
          setPagoAbierto(false);
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
