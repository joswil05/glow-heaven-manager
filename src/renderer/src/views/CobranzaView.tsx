import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useCerrarConEscape } from '../lib/useCerrarConEscape';
import {
  Search,
  DollarSign,
  MessageCircle,
  CheckCircle2,
  X,
  CreditCard,
  Users,
  Wallet,
  ArrowUpRight,
  Receipt,
  Pencil,
} from 'lucide-react';
import { CorregirPagoModal } from '../components/CorregirPagoModal';
import { PagoModal } from '../components/PagoModal';
import type {
  VentaCompleta,
  PagoCompleto,
  ClienteDetalle,
  ParametrosSistema,
  MetodoPago,
  MonedaPago,
  FilaPorCobrar,
} from '../../../shared/types';
import type { AbonoClienteInput } from '../../../shared/ipc-contracts';
import {
  Button,
  Field,
  Input,
  Badge,
  DataTable,
  Column,
  StatTile,
  Confirmar,
  Portal,
} from '../components/ui';
import { formatearMoneda } from '@core/moneda';
import { parsearACentavos } from '@core/numeros';
import { enlaceWhatsApp } from '../lib/whatsapp';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { hoyISO } from '@core/fechas';
import { algunoContiene } from '@core/texto';
import { diaDeHistorial, ordenHistorial, textoQuien } from '@core/abonos';
import { MontoAbono } from '../components/MontoAbono';

interface CobranzaViewProps {
  clientes: ClienteDetalle[];
  parametros: ParametrosSistema | null;
  onCambio: () => void;
  onVerCliente?: (id: number) => void;
  onVerVenta?: (id: number, tipo: 'INVENTARIO' | 'ENCARGO') => void;
}

type TabCobranza = 'historial' | 'por_cobrar';
type FiltroMetodo = 'TODOS' | 'EFECTIVO' | 'TRANSFERENCIA';

export const CobranzaView: React.FC<CobranzaViewProps> = ({
  clientes,
  parametros,
  onCambio,
  onVerCliente,
  onVerVenta,
}) => {
  const { showToast, showUndoToast } = useToast();
  // Arranca en "Por cobrar": es lo accionable. El historial es consulta, y
  // abrir la pantalla mostrando lo ya cobrado enterraba lo que falta cobrar.
  const [tabActiva, setTabActiva] = useState<TabCobranza>('por_cobrar');

  // Estados de datos
  const [pagos, setPagos] = useState<PagoCompleto[]>([]);
  const [cuentasPorCobrar, setCuentasPorCobrar] = useState<FilaPorCobrar[]>([]);
  const [cargando, setCargando] = useState(true);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState<FiltroMetodo>('TODOS');
  const [filtroCuentas, setFiltroCuentas] = useState<'TODAS' | 'VENCIDAS' | 'AL_DIA'>('TODAS');

  // Modal registrar abono
  const [modalAbonoAbierto, setModalAbonoAbierto] = useState(false);
  useCerrarConEscape(modalAbonoAbierto, () => setModalAbonoAbierto(false));
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState<number | undefined>();
  const [abonoMontoTexto, setAbonoMontoTexto] = useState('');
  const [abonoMoneda, setAbonoMoneda] = useState<MonedaPago>('COR');
  const [abonoMetodo, setAbonoMetodo] = useState<MetodoPago>('EFECTIVO');
  const [abonoFecha, setAbonoFecha] = useState(() => hoyISO());
  const [abonoReferencia, setAbonoReferencia] = useState('');
  const [abonoNotas, setAbonoNotas] = useState('');
  const [abonoGuardando, setAbonoGuardando] = useState(false);

  // El abono a una venta puntual (el botón "Abonar" de cada fila)
  const [ventaAbonando, setVentaAbonando] = useState<VentaCompleta | null>(null);

  // Anular o corregir un abono
  const [pagoAnulando, setPagoAnulando] = useState<PagoCompleto | null>(null);
  const [pagoCorrigiendo, setPagoCorrigiendo] = useState<PagoCompleto | null>(null);

  const tasa = parametros?.tasa_cambio_cents ?? 3662;

  // Cargar datos
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [resPagos, resPanel] = await Promise.all([
        window.api.pagos.recientes(150),
        window.api.panel.cargar(),
      ]);

      // Si una consulta falla hay que decirlo. Antes estos `if` no tenían
      // `else`: cuando la consulta del historial fallaba (le faltaba el índice
      // compuesto de Firestore), la lista quedaba vacía para siempre sin un
      // solo mensaje, y parecía que no había abonos registrados.
      if (resPagos.success) {
        setPagos(resPagos.data);
      } else {
        showToast({
          message: `No se pudo cargar el historial de abonos: ${resPagos.error}`,
          type: 'error',
        });
      }
      if (resPanel.success) {
        setCuentasPorCobrar(resPanel.data.por_cobrar || []);
      } else {
        showToast({
          message: `No se pudieron cargar las cuentas por cobrar: ${resPanel.error}`,
          type: 'error',
        });
      }
    } catch {
      showToast({ message: 'Error al sincronizar historial de abonos', type: 'error' });
    } finally {
      setCargando(false);
    }
  }, [showToast]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Primero las que deben (la que más debe arriba); después las demás. */
  const clientasParaAbonar = useMemo(
    () =>
      [...clientes].sort(
        (a, b) =>
          (b.saldo_pendiente_usd_cents > 0 ? 1 : 0) - (a.saldo_pendiente_usd_cents > 0 ? 1 : 0) ||
          b.saldo_pendiente_usd_cents - a.saldo_pendiente_usd_cents ||
          a.nombre.localeCompare(b.nombre)
      ),
    [clientes]
  );

  // Totales calculados
  const totalAbonosUsd = useMemo(() => {
    return pagos.reduce((sum, p) => sum + (p.monto_usd_cents || 0), 0);
  }, [pagos]);

  const totalPorCobrarUsd = useMemo(() => {
    return cuentasPorCobrar.reduce((sum, c) => sum + (c.saldo_usd_cents || 0), 0);
  }, [cuentasPorCobrar]);

  const abonosDeHoy = useMemo(() => {
    const hoy = hoyISO();
    return pagos.filter((p) => p.fecha === hoy).length;
  }, [pagos]);

  // Pagos filtrados, por día y, dentro del día, lo último registrado primero.
  const pagosFiltrados = useMemo(() => {
    let list = [...pagos].sort(ordenHistorial);
    if (filtroMetodo !== 'TODOS') {
      list = list.filter((p) => p.metodo === filtroMetodo);
    }
    if (busqueda.trim()) {
      list = list.filter((p) =>
        algunoContiene([p.cliente_nombre, p.venta_codigo, p.referencia, p.notas], busqueda)
      );
    }
    return list;
  }, [pagos, filtroMetodo, busqueda]);

  // Cuentas por cobrar filtradas
  const cuentasFiltradas = useMemo(() => {
    let list = cuentasPorCobrar;
    if (filtroCuentas === 'VENCIDAS') {
      list = list.filter((c) => c.cuotas_vencidas > 0);
    } else if (filtroCuentas === 'AL_DIA') {
      list = list.filter((c) => c.cuotas_vencidas === 0);
    }
    if (busqueda.trim()) {
      list = list.filter((c) =>
        algunoContiene([c.cliente_nombre, c.codigo, c.cliente_telefono], busqueda)
      );
    }
    return list;
  }, [cuentasPorCobrar, filtroCuentas, busqueda]);

  /**
   * "Abonar" en la fila de una venta abre el abono DE ESA VENTA: el mismo de
   * Ventas, con su tasa, su equivalencia, "cómo queda" y Deshacer.
   *
   * Hasta la 2.16.2 abría el abono por clienta, que reparte por antigüedad:
   * tocar "Abonar" en V-0015 mandaba la plata a V-0009, la más vieja, y un
   * encargo esperando su anticipo no pasaba a "por comprar".
   */
  const abrirAbonoDeVenta = async (ventaId: number) => {
    const r = await window.api.ventas.get(ventaId);
    if (r.success && r.data) setVentaAbonando(r.data);
    else showToast({ message: r.success ? 'No se encontró la venta.' : r.error, type: 'error' });
  };

  // Registrar abono
  const guardarAbono = async () => {
    if (!clienteSeleccionadoId) {
      showToast({ message: 'Elegí a qué clienta es el abono.', type: 'error' });
      return;
    }
    const montoCents = parsearACentavos(abonoMontoTexto, { min: 0.01 });
    if (montoCents === null) {
      showToast({ message: 'Ingresa un monto válido para el abono (mayor a cero)', type: 'error' });
      return;
    }

    setAbonoGuardando(true);
    try {
      const input: AbonoClienteInput = {
        cliente_id: clienteSeleccionadoId,
        fecha: abonoFecha,
        monto_cents: montoCents,
        moneda: abonoMoneda,
        metodo: abonoMetodo,
        referencia: abonoReferencia.trim() || undefined,
        notas: abonoNotas.trim() || undefined,
      };

      const r = await window.api.pagos.registrarAbonoCliente(input);
      if (r.success) {
        showToast({
          message: `Abono de ${abonoMoneda === 'USD' ? '$' : 'C$'}${(montoCents / 100).toFixed(2)} registrado con éxito`,
          type: 'success',
        });
        setModalAbonoAbierto(false);
        setAbonoMontoTexto('');
        setAbonoReferencia('');
        setAbonoNotas('');
        await cargar();
        onCambio();
      } else {
        showToast({ message: r.error, type: 'error' });
      }
    } finally {
      setAbonoGuardando(false);
    }
  };

  // Anular abono
  const confirmarAnularPago = async () => {
    if (!pagoAnulando) return;
    const r = await window.api.pagos.anular(pagoAnulando.id);
    if (r.success) {
      showUndoToast(
        'Abono anulado. El saldo fue restaurado.',
        async () => {
          await cargar();
          onCambio();
        },
        r.data.evento_grupo_id
      );
      setPagoAnulando(null);
      await cargar();
      onCambio();
    } else {
      showToast({ message: r.error, type: 'error' });
    }
  };

  // Columnas para tabla de historial de abonos
  const columnasHistorial: Column<PagoCompleto>[] = [
    {
      key: 'quien',
      header: 'Registró',
      width: '170px',
      // El día va en el encabezado del grupo; acá, quién y a qué hora.
      render: (p) => (
        <span className={cn('text-caption tabular', p.registrado_por ? 'text-texto-2' : 'text-texto-3')}>
          {textoQuien(p)}
        </span>
      ),
    },
    {
      key: 'cliente',
      header: 'Clienta',
      render: (p) => (
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-body text-texto truncate">
            {p.cliente_nombre || 'Clienta'}
          </span>
          {p.cliente_id && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onVerCliente && p.cliente_id) onVerCliente(p.cliente_id);
              }}
              className="text-[11px] text-acento hover:underline text-left cursor-pointer inline-flex items-center gap-0.5"
            >
              <span>Ver ficha de clienta</span>
              <ArrowUpRight className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'venta',
      header: 'Venta / Encargo',
      width: '150px',
      render: (p) => (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="tabular text-label font-bold text-texto">
              {p.venta_codigo || `V-#${p.venta_id}`}
            </span>
            {p.es_anticipo && (
              <Badge tone="info">
                Anticipo
              </Badge>
            )}
          </div>
          {onVerVenta && (
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                // El tipo real (venta de inventario o encargo) decide a qué
                // pestaña navegar; antes quedaba fijo en 'INVENTARIO' y un
                // abono de un encargo abría la pestaña equivocada.
                const r = await window.api.ventas.get(p.venta_id);
                onVerVenta(p.venta_id, r.success && r.data ? r.data.tipo : 'INVENTARIO');
              }}
              className="text-[11px] text-texto-3 hover:text-acento text-left cursor-pointer"
            >
              Ver comprobante
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'metodo',
      header: 'Método y Ref.',
      render: (p) => (
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border',
                p.metodo === 'EFECTIVO'
                  ? 'bg-acento/10 text-acento border-acento/25'
                  : 'bg-superficie-3 text-texto-2 border-borde'
              )}
            >
              {p.metodo === 'EFECTIVO' ? 'Efectivo' : p.metodo === 'TRANSFERENCIA' ? 'Transferencia' : 'Otro'}
            </span>
          </div>
          {p.referencia && (
            <span className="text-caption text-texto-3 truncate mt-0.5 tabular">
              {p.referencia}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'monto',
      header: 'Abonó',
      align: 'right',
      // En la moneda en que pagó: "C$600.00", y abajo su equivalente.
      render: (p) => <MontoAbono pago={p} />,
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      width: '176px',
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="secondary"
            aria-label={`Corregir el abono de ${p.cliente_nombre || 'la clienta'}`}
            onClick={(e) => {
              e.stopPropagation();
              setPagoCorrigiendo(p);
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span>Corregir</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Anular el abono de ${p.cliente_nombre || 'la clienta'}`}
            className="text-texto-3 hover:text-danger-600"
            onClick={(e) => {
              e.stopPropagation();
              setPagoAnulando(p);
            }}
          >
            Anular
          </Button>
        </div>
      ),
    },
  ];

  // Sin fondo propio, igual que el resto de las pantallas: lo pone el
  // caparazon. `bg-superficie-2/40` era un segundo negro conviviendo con el
  // de Inicio y el del resto.
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:px-6 md:py-4 animate-fade-in scroll-smooth">
        <div className="max-w-[1500px] w-full mx-auto space-y-4 stagger-children">
          {/* El título ya está en la barra de arriba: acá las dos vistas y la acción. */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="flex rounded-xl bg-superficie-2/80 border border-borde/70 p-1">
                {/* "Por cobrar" va primero: es la deuda viva, lo accionable.
                    El historial es consulta y queda a la derecha. */}
                <button
                  type="button"
                  onClick={() => setTabActiva('por_cobrar')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-label font-bold cursor-pointer',
                    'transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]',
                    tabActiva === 'por_cobrar'
                      ? 'bg-superficie text-texto shadow-xs'
                      : 'text-texto-3 hover:text-texto'
                  )}
                >
                  <span>Por cobrar</span>
                  <span className="text-texto-3 font-medium tabular">{cuentasPorCobrar.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTabActiva('historial')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-label font-bold cursor-pointer',
                    'transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]',
                    tabActiva === 'historial'
                      ? 'bg-superficie text-texto shadow-xs'
                      : 'text-texto-3 hover:text-texto'
                  )}
                >
                  <span>Abonos recibidos</span>
                  <span className="text-texto-3 font-medium tabular">
                    {abonosDeHoy > 0 ? `${abonosDeHoy} hoy` : pagos.length}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                className="rounded-xl shadow-xs flex items-center gap-1.5"
                onClick={() => {
                  // Sin clienta elegida: arrancar con la primera de la lista
                  // registraba el abono a otra persona si se tipeaba rápido.
                  setClienteSeleccionadoId(undefined);
                  setModalAbonoAbierto(true);
                }}
              >
                <DollarSign className="w-4 h-4" />
                <span>Registrar abono</span>
              </Button>
            </div>
          </div>

          {/* StatTiles métricos de cobranza */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 stagger-children">
            <StatTile
              label="Recibido en abonos"
              usd_cents={totalAbonosUsd}
              tone="success"
              icon={Receipt}
              hint={`${pagos.length} ${pagos.length === 1 ? 'abono' : 'abonos'}`}
            />
            <StatTile
              label="Por cobrar"
              usd_cents={totalPorCobrarUsd}
              tone={totalPorCobrarUsd > 0 ? 'warning' : 'success'}
              icon={Wallet}
              hint={`${cuentasPorCobrar.length} ${cuentasPorCobrar.length === 1 ? 'venta' : 'ventas'} con saldo`}
            />
            <StatTile
              label="Clientas que deben"
              value={new Set(cuentasPorCobrar.map((c) => c.cliente_nombre)).size}
              tone="info"
              icon={Users}
            />
          </div>

          {/* Filtros y Buscador */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-texto-3 pointer-events-none" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={
                  tabActiva === 'historial'
                    ? 'Buscar clienta, venta o referencia'
                    : 'Buscar clienta o código'
                }
                className="pl-9 pr-9"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-texto-3 hover:text-texto rounded-md transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {tabActiva === 'historial' && (
              <div className="flex items-center gap-2">
                <span className="text-caption text-texto-3">Método:</span>
                <div className="flex rounded-lg border border-borde bg-superficie p-0.5">
                  {(['TODOS', 'EFECTIVO', 'TRANSFERENCIA'] as FiltroMetodo[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFiltroMetodo(m)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-[background-color,border-color,color,box-shadow,transform,opacity]',
                        filtroMetodo === m
                          ? 'bg-acento/10 text-acento font-bold'
                          : 'text-texto-3 hover:text-texto'
                      )}
                    >
                      {m === 'TODOS' ? 'Todos' : m === 'EFECTIVO' ? 'Efectivo' : 'Transferencia'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tabActiva === 'por_cobrar' && (
              <div className="flex items-center gap-2">
                <span className="text-caption text-texto-3">Estado:</span>
                <div className="flex rounded-lg border border-borde bg-superficie p-0.5">
                  {(['TODAS', 'VENCIDAS', 'AL_DIA'] as const).map((est) => (
                    <button
                      key={est}
                      type="button"
                      onClick={() => setFiltroCuentas(est)}
                      className={cn(
                        'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-[background-color,border-color,color,box-shadow,transform,opacity]',
                        filtroCuentas === est
                          ? 'bg-acento/10 text-acento font-bold'
                          : 'text-texto-3 hover:text-texto'
                      )}
                    >
                      {est === 'TODAS' ? 'Todas' : est === 'VENCIDAS' ? 'Vencidas' : 'Al día'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {cargando ? (
            <div className="bg-superficie rounded-2xl border border-borde/70 p-12 text-center text-body text-texto-3 shadow-xs">
              Cargando abonos y cuentas por cobrar...
            </div>
          ) : (
            <>
              {/* TAB 1: HISTORIAL DE ABONOS */}
              {tabActiva === 'historial' && (
                <div className="bg-superficie rounded-2xl border border-borde/70 shadow-xs overflow-hidden">
                  <DataTable
                    rows={pagosFiltrados}
                    columns={columnasHistorial}
                    rowKey={(p) => p.id}
                    grupoDe={(p) => diaDeHistorial(p.fecha, hoyISO())}
                    onRowClick={(p) => setPagoCorrigiendo(p)}
                    emptyMessage={
                      busqueda
                        ? 'Ningún abono coincide'
                        : 'Todavía no hay abonos'
                    }
                  />
                </div>
              )}

              {/* TAB 2: CUENTAS POR COBRAR */}
              {tabActiva === 'por_cobrar' && (
                <div className="bg-superficie rounded-2xl border border-borde/70 shadow-xs overflow-hidden">
                  {cuentasFiltradas.length > 0 ? (
                    <div className="divide-y divide-borde/50">
                  {cuentasFiltradas.map((c) => {
                    const saldoCor = Math.round((c.saldo_usd_cents * tasa) / 100);
                    return (
                      <div
                        key={c.venta_id}
                        className="p-4 flex items-center justify-between gap-4 hover:bg-superficie-2/25 transition-colors"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-10 h-10 rounded-full bg-alerta/10 text-alerta font-bold flex items-center justify-center shrink-0 border border-alerta/20">
                            {c.cliente_nombre.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-body text-texto truncate">
                                {c.cliente_nombre}
                              </span>
                              <span className="tabular text-caption text-texto-3 font-semibold">
                                {c.codigo}
                              </span>
                              {c.cuotas_vencidas > 0 ? (
                                <Badge tone="danger">
                                  {c.cuotas_vencidas} cuota(s) vencida(s)
                                </Badge>
                              ) : (
                                <Badge tone="neutral">
                                  Al día
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-caption text-texto-3 mt-0.5">
                              {c.cliente_telefono && (
                                <span>Tel: {c.cliente_telefono}</span>
                              )}
                              <span>de {formatearMoneda(c.total_usd_cents, 'USD')}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <span className="block font-extrabold text-body text-alerta tabular">
                              Debe {formatearMoneda(c.saldo_usd_cents, 'USD')}
                            </span>
                            <span className="block text-[11px] text-texto-3 tabular">
                              ≈ {formatearMoneda(saldoCor, 'COR')}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {c.cliente_telefono && (
                              <a
                                href={enlaceWhatsApp(
                                  c.cliente_telefono,
                                  c.cliente_nombre,
                                  c.saldo_usd_cents,
                                  parametros
                                )}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-caption text-acento bg-acento/15 border border-acento/30 hover:bg-acento/25 transition-[background-color,border-color,color,box-shadow,transform,opacity] active:scale-95"
                                title="Enviar recordatorio de cobro por WhatsApp"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                <span>WhatsApp</span>
                              </a>
                            )}

                            <Button
                              variant="secondary"
                              size="sm"
                              className="rounded-xl shadow-xs flex items-center gap-1"
                              aria-label={`Abonar a ${c.codigo}`}
                              onClick={() => abrirAbonoDeVenta(c.venta_id)}
                            >
                              <DollarSign className="w-3.5 h-3.5 text-acento" />
                              <span>Abonar</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 px-4 text-center">
                  <CheckCircle2 className="w-10 h-10 text-acento mx-auto mb-2 opacity-80" />
                  <p className="text-body font-bold text-texto">Nadie te debe</p>
                  <p className="text-caption text-texto-3 mt-0.5">
                    No hay cuentas con saldo pendiente bajo el filtro seleccionado.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
      </div>

      {/* Modal para Registrar Abono */}
      {modalAbonoAbierto && (
        <Portal>
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-velo/60 p-4 animate-fade-in backdrop-blur-xs">
            <div className="bg-superficie rounded-2xl border border-borde shadow-xl max-w-md w-full p-5 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-borde">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-acento" />
                <h3 className="font-bold text-body text-texto">Registrar abono</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAbonoAbierto(false)}
                className="text-texto-3 hover:text-texto p-1 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <Field label="Clienta" className="mb-0">
                <select
                  value={clienteSeleccionadoId ?? ''}
                  onChange={(e) => setClienteSeleccionadoId(e.target.value ? Number(e.target.value) : undefined)}
                  className="w-full rounded-lg border border-borde bg-superficie-2 px-3 py-2 text-label text-texto focus:outline-none focus:ring-2 focus:ring-acento/50"
                >
                  <option value="">Elegí la clienta</option>
                  {clientasParaAbonar.map((cli) => (
                    <option key={cli.id} value={cli.id}>
                      {cli.nombre}{cli.saldo_pendiente_usd_cents > 0 ? ` · debe ${formatearMoneda(cli.saldo_pendiente_usd_cents, 'USD')}` : ''}
                    </option>
                  ))}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Moneda" className="mb-0">
                  <select
                    value={abonoMoneda}
                    onChange={(e) => setAbonoMoneda(e.target.value as MonedaPago)}
                    className="w-full rounded-lg border border-borde bg-superficie-2 px-3 py-2 text-label text-texto focus:outline-none focus:ring-2 focus:ring-acento/50"
                  >
                    <option value="COR">Córdobas</option>
                    <option value="USD">Dólares</option>
                  </select>
                </Field>
                <Field label="Método" className="mb-0">
                  <select
                    value={abonoMetodo}
                    onChange={(e) => setAbonoMetodo(e.target.value as MetodoPago)}
                    className="w-full rounded-lg border border-borde bg-superficie-2 px-3 py-2 text-label text-texto focus:outline-none focus:ring-2 focus:ring-acento/50"
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label={`Monto (${abonoMoneda === 'USD' ? 'USD' : 'C$'})`} className="mb-0">
                  <Input
                    // Texto, no `type="number"`: el navegador convierte "1,500"
                    // en "1.500" antes de que la aplicación lo vea, y eso se lee
                    // como uno con medio. El parser de `@core/numeros` sí sabe
                    // distinguir miles de decimales, pero necesita el texto crudo.
                    // `inputMode` mantiene el teclado numérico en el celular.
                    type="text"
                    value={abonoMontoTexto}
                    onChange={(e) => setAbonoMontoTexto(e.target.value)}
                    placeholder="0.00"
                    className="text-right tabular"
                    autoFocus
                  />
                </Field>
                <Field label="Fecha" className="mb-0">
                  <Input
                    type="date"
                    value={abonoFecha}
                    onChange={(e) => setAbonoFecha(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Referencia" className="mb-0">
                <Input
                  value={abonoReferencia}
                  onChange={(e) => setAbonoReferencia(e.target.value)}
                  placeholder="Opcional"
                />
              </Field>

              <Field label="Notas" className="mb-0">
                <Input
                  value={abonoNotas}
                  onChange={(e) => setAbonoNotas(e.target.value)}
                  placeholder="Opcional"
                />
              </Field>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-borde">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setModalAbonoAbierto(false)}
                disabled={abonoGuardando}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={guardarAbono}
                disabled={abonoGuardando || !abonoMontoTexto}
              >
                {abonoGuardando ? 'Guardando...' : 'Registrar abono'}
              </Button>
            </div>
          </div>
        </div>
        </Portal>
      )}

      {/* Confirmar anulación de abono */}
      <Confirmar
        abierto={pagoAnulando !== null}
        peligroso
        titulo="¿Anular este abono?"
        consecuencias={[
          `${formatearMoneda(pagoAnulando?.monto_usd_cents || 0, 'USD')} de ${pagoAnulando?.cliente_nombre || 'la clienta'}.`,
          'Lo que debía vuelve a quedar pendiente.',
        ]}
        textoConfirmar="Anular abono"
        textoCancelar="Cancelar"
        onConfirmar={confirmarAnularPago}
        onCerrar={() => setPagoAnulando(null)}
      />

      <PagoModal
        abierto={ventaAbonando !== null}
        venta={ventaAbonando}
        parametros={parametros}
        onCerrar={() => setVentaAbonando(null)}
        onRegistrado={async () => {
          await cargar();
          onCambio();
        }}
      />

      <CorregirPagoModal
        abierto={pagoCorrigiendo !== null}
        pago={pagoCorrigiendo}
        codigo={pagoCorrigiendo?.venta_codigo}
        onCerrar={() => setPagoCorrigiendo(null)}
        onCorregido={async () => {
          await cargar();
          onCambio();
        }}
      />
    </div>
  );
};
