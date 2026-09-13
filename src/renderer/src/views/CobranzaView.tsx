import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  HandCoins,
  Search,
  Clock,
  DollarSign,
  MessageCircle,
  CheckCircle2,
  Trash2,
  X,
  CreditCard,
  Users,
  Wallet,
  ArrowUpRight,
  Receipt,
} from 'lucide-react';
import type {
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
import { formatearMoneda, formatearFecha } from '@core/moneda';
import { enlaceWhatsApp } from '../lib/whatsapp';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';

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
  const [tabActiva, setTabActiva] = useState<TabCobranza>('historial');

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
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState<number | undefined>();
  const [abonoMontoTexto, setAbonoMontoTexto] = useState('');
  const [abonoMoneda, setAbonoMoneda] = useState<MonedaPago>('COR');
  const [abonoMetodo, setAbonoMetodo] = useState<MetodoPago>('EFECTIVO');
  const [abonoFecha, setAbonoFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [abonoReferencia, setAbonoReferencia] = useState('');
  const [abonoNotas, setAbonoNotas] = useState('');
  const [abonoGuardando, setAbonoGuardando] = useState(false);

  // Anular abono
  const [pagoAnulando, setPagoAnulando] = useState<PagoCompleto | null>(null);

  const tasa = parametros?.tasa_cambio_cents ?? 3662;

  // Cargar datos
  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [resPagos, resPanel] = await Promise.all([
        window.api.pagos.recientes(150),
        window.api.panel.cargar(),
      ]);

      if (resPagos.success) {
        setPagos(resPagos.data);
      }
      if (resPanel.success) {
        setCuentasPorCobrar(resPanel.data.por_cobrar || []);
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

  // Totales calculados
  const totalAbonosUsd = useMemo(() => {
    return pagos.reduce((sum, p) => sum + (p.monto_usd_cents || 0), 0);
  }, [pagos]);

  const totalPorCobrarUsd = useMemo(() => {
    return cuentasPorCobrar.reduce((sum, c) => sum + (c.saldo_usd_cents || 0), 0);
  }, [cuentasPorCobrar]);

  // Pagos filtrados
  const pagosFiltrados = useMemo(() => {
    let list = pagos;
    if (filtroMetodo !== 'TODOS') {
      list = list.filter((p) => p.metodo === filtroMetodo);
    }
    const q = busqueda.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          (p.cliente_nombre || '').toLowerCase().includes(q) ||
          (p.venta_codigo || '').toLowerCase().includes(q) ||
          (p.referencia || '').toLowerCase().includes(q) ||
          (p.notas || '').toLowerCase().includes(q)
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
    const q = busqueda.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.cliente_nombre.toLowerCase().includes(q) ||
          c.codigo.toLowerCase().includes(q) ||
          (c.cliente_telefono || '').includes(q)
      );
    }
    return list;
  }, [cuentasPorCobrar, filtroCuentas, busqueda]);

  // Registrar abono
  const guardarAbono = async () => {
    if (!clienteSeleccionadoId) {
      showToast({ message: 'Selecciona a qué clienta abonar', type: 'error' });
      return;
    }
    const montoNum = parseFloat(abonoMontoTexto.replace(',', '.'));
    if (isNaN(montoNum) || montoNum <= 0) {
      showToast({ message: 'Ingresa un monto válido para el abono', type: 'error' });
      return;
    }

    setAbonoGuardando(true);
    try {
      const input: AbonoClienteInput = {
        cliente_id: clienteSeleccionadoId,
        fecha: abonoFecha,
        monto_cents: Math.round(montoNum * 100),
        moneda: abonoMoneda,
        metodo: abonoMetodo,
        referencia: abonoReferencia.trim() || undefined,
        notas: abonoNotas.trim() || undefined,
      };

      const r = await window.api.pagos.registrarAbonoCliente(input);
      if (r.success) {
        showToast({
          message: `Abono de ${abonoMoneda === 'USD' ? '$' : 'C$'}${montoNum.toFixed(2)} registrado con éxito`,
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
      key: 'fecha',
      header: 'Fecha',
      width: '130px',
      render: (p) => (
        <span className="font-mono text-label text-texto font-medium">
          {formatearFecha(p.fecha)}
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
            <span className="font-mono text-label font-bold text-texto">
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
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                  : 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/25'
              )}
            >
              {p.metodo === 'EFECTIVO' ? 'Efectivo' : p.metodo === 'TRANSFERENCIA' ? 'Transferencia' : 'Otro'}
            </span>
          </div>
          {p.referencia && (
            <span className="text-caption text-texto-3 truncate mt-0.5 font-mono">
              {p.referencia}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'monto',
      header: 'Monto Abonado',
      align: 'right',
      render: (p) => (
        <div className="flex flex-col items-end">
          <span className="font-extrabold text-body text-emerald-600 dark:text-emerald-400 font-mono">
            {formatearMoneda(p.monto_usd_cents, 'USD')}
          </span>
          <span className="text-caption text-texto-3 font-mono">
            ≈ {formatearMoneda(p.monto_cor_cents, 'COR')}
          </span>
        </div>
      ),
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      width: '60px',
      render: (p) => (
        <Button
          size="sm"
          variant="ghost"
          title="Anular este abono (restaura el saldo)"
          className="text-texto-3 hover:text-danger-600 rounded-lg p-1.5"
          onClick={(e) => {
            e.stopPropagation();
            setPagoAnulando(p);
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-superficie-2/40">
      <div className="flex-1 overflow-y-auto p-4 md:px-6 md:py-4 animate-fade-in scroll-smooth">
        <div className="max-w-[1500px] w-full mx-auto space-y-4 stagger-children">
          {/* Header estilizado idéntico al panel */}
          <div className="flex items-center justify-between gap-3 pb-2 border-b border-borde/40 text-caption text-texto-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-acento/10 text-acento flex items-center justify-center font-bold">
                <HandCoins className="w-4 h-4" />
              </div>
              <div>
                <h1 className="font-extrabold text-texto text-body leading-tight">
                  Cobros y Abonos
                </h1>
                <p className="text-[11px] text-texto-3">
                  Historial de pagos recibidos y gestión de cuentas por cobrar
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Botón selector de pestañas principales */}
              <div className="flex rounded-xl bg-superficie border border-borde/80 p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setTabActiva('historial')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-label font-bold transition-all',
                    tabActiva === 'historial'
                      ? 'bg-acento text-white shadow-xs'
                      : 'text-texto-3 hover:text-texto'
                  )}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Historial de Abonos ({pagos.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTabActiva('por_cobrar')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-label font-bold transition-all',
                    tabActiva === 'por_cobrar'
                      ? 'bg-acento text-white shadow-xs'
                      : 'text-texto-3 hover:text-texto'
                  )}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>Por Cobrar ({cuentasPorCobrar.length})</span>
                </button>
              </div>

              <Button
                variant="primary"
                size="sm"
                className="rounded-xl shadow-xs flex items-center gap-1.5"
                onClick={() => {
                  setClienteSeleccionadoId(clientes[0]?.id);
                  setModalAbonoAbierto(true);
                }}
              >
                <DollarSign className="w-4 h-4" />
                <span>Registrar Abono</span>
              </Button>
            </div>
          </div>

          {/* StatTiles métricos de cobranza */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 stagger-children">
            <StatTile
              label="Total Recaudado en Abonos"
              usd_cents={totalAbonosUsd}
              tone="success"
              icon={Receipt}
              hint={`${pagos.length} abonos registrados`}
            />
            <StatTile
              label="Cartera por Cobrar"
              usd_cents={totalPorCobrarUsd}
              tone={totalPorCobrarUsd > 0 ? 'warning' : 'success'}
              icon={Wallet}
              hint={`${cuentasPorCobrar.length} ventas con saldo activo`}
            />
            <StatTile
              label="Clientas con Deuda"
              value={new Set(cuentasPorCobrar.map((c) => c.cliente_nombre)).size}
              tone="info"
              icon={Users}
              hint="Clientas con cuotas o saldos pendientes"
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
                    ? 'Buscar por clienta, venta o referencia...'
                    : 'Buscar por clienta o código de venta...'
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
                        'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
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
                        'px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
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
                    emptyMessage={
                      busqueda
                        ? 'No se encontraron abonos con ese criterio'
                        : 'Aún no se han registrado abonos en el sistema'
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
                          <div className="w-10 h-10 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-bold flex items-center justify-center shrink-0 border border-amber-500/20">
                            {c.cliente_nombre.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-body text-texto truncate">
                                {c.cliente_nombre}
                              </span>
                              <span className="font-mono text-caption text-texto-3 font-semibold">
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
                              <span>Total venta: {formatearMoneda(c.total_usd_cents, 'USD')}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <span className="block font-extrabold text-body text-amber-600 dark:text-amber-400 font-mono">
                              Debe {formatearMoneda(c.saldo_usd_cents, 'USD')}
                            </span>
                            <span className="block text-[11px] text-texto-3 font-mono">
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
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold text-caption text-emerald-800 dark:text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all active:scale-95"
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
                              onClick={() => {
                                setClienteSeleccionadoId(c.cliente_id);
                                setModalAbonoAbierto(true);
                              }}
                            >
                              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
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
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-80" />
                  <p className="text-body font-bold text-texto">Cartera 100% al día</p>
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 animate-fade-in backdrop-blur-xs">
            <div className="bg-superficie rounded-2xl border border-borde shadow-xl max-w-md w-full p-5 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between pb-2 border-b border-borde">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-acento" />
                <h3 className="font-extrabold text-body text-texto">Registrar Nuevo Abono</h3>
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
                  value={clienteSeleccionadoId}
                  onChange={(e) => setClienteSeleccionadoId(Number(e.target.value))}
                  className="w-full rounded-lg border border-borde bg-superficie-2 px-3 py-2 text-label text-texto focus:outline-none focus:ring-2 focus:ring-acento/50"
                >
                  {clientes.map((cli) => (
                    <option key={cli.id} value={cli.id}>
                      {cli.nombre} {cli.saldo_pendiente_usd_cents > 0 ? `(Debe ${formatearMoneda(cli.saldo_pendiente_usd_cents, 'USD')})` : '(Sin saldo)'}
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
                    <option value="COR">C$ Córdobas</option>
                    <option value="USD">$ Dólares</option>
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
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={abonoMontoTexto}
                    onChange={(e) => setAbonoMontoTexto(e.target.value)}
                    placeholder="0.00"
                    className="text-right font-mono"
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

              <Field label="Referencia bancaria" hint="Opcional" className="mb-0">
                <Input
                  value={abonoReferencia}
                  onChange={(e) => setAbonoReferencia(e.target.value)}
                  placeholder="Ej. Transferencia BAC #54321"
                />
              </Field>

              <Field label="Notas" hint="Opcional" className="mb-0">
                <Input
                  value={abonoNotas}
                  onChange={(e) => setAbonoNotas(e.target.value)}
                  placeholder="Observaciones del abono..."
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
                {abonoGuardando ? 'Guardando...' : 'Confirmar Abono'}
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
          `Monto: ${formatearMoneda(pagoAnulando?.monto_usd_cents || 0, 'USD')} de ${pagoAnulando?.cliente_nombre || 'la clienta'}.`,
          'El saldo adeudado de la venta o clienta se restaurará automáticamente.',
          'Esta acción se registrará en el historial de auditoría.',
        ]}
        textoConfirmar="Sí, anular abono"
        textoCancelar="No, mantener"
        onConfirmar={confirmarAnularPago}
        onCerrar={() => setPagoAnulando(null)}
      />
    </div>
  );
};
