import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, Trash2, X, MessageCircle, MapPin, Wallet, ShoppingBag, Copy, FileEdit, Eye, CreditCard, Clock, ChevronDown } from 'lucide-react';
import type { ClienteDetalle, Venta, ParametrosSistema, PagoCompleto, MetodoPago, MonedaPago } from '../../../shared/types';
import type { AbonoClienteInput } from '../../../shared/ipc-contracts';
import {
  Button,
  Badge,
  Money,
  Input,
  Field,
  Textarea,
  StatTile,
  DataTable,
  Confirmar,
  ContextMenu,
  Portal,
  type Column,
} from '../components/ui';
import { EmptyState } from '../components/shared/EmptyState';
import { useClickOutside } from '../lib/useClickOutside';
import { useToast } from '../context/ToastContext';
import { formatearMoneda, formatearFecha } from '@core/moneda';
import { parsearACentavos } from '@core/numeros';
import { cn } from '../lib/cn';
import { formatearNombreEntidad } from '@shared/formatoTexto';

interface ClientesViewProps {
  parametros?: ParametrosSistema | null;
  clienteInicialId?: number;
  onCambio: () => void;
  onVerVenta: (ventaId: number, tipo: 'INVENTARIO' | 'ENCARGO') => void;
}

export const ClientesView: React.FC<ClientesViewProps> = ({
  parametros,
  clienteInicialId,
  onCambio,
  onVerVenta,
}) => {
  const { showToast, showUndoToast } = useToast();

  const [clientes, setClientes] = useState<ClienteDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState<ClienteDetalle | null>(null);
  const lateralRef = useClickOutside<HTMLElement>(Boolean(detalle), () => setDetalle(null));
  const [ventasCliente, setVentasCliente] = useState<Venta[]>([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<ClienteDetalle | null>(null);
  const [archivando, setArchivando] = useState<ClienteDetalle | null>(null);
  const [pagoAnulando, setPagoAnulando] = useState<PagoCompleto | null>(null);
  const [menuContextual, setMenuContextual] = useState<{
    x: number;
    y: number;
    cliente: ClienteDetalle;
  } | null>(null);

  // --- Kardex / Abono ---
  const [pagosCliente, setPagosCliente] = useState<PagoCompleto[]>([]);
  const [abonoAbierto, setAbonoAbierto] = useState(false);
  const [abonoGuardando, setAbonoGuardando] = useState(false);
  const [abonoMontoTexto, setAbonoMontoTexto] = useState('');
  const [abonoMetodo, setAbonoMetodo] = useState<MetodoPago>('EFECTIVO');
  const [abonoMoneda, setAbonoMoneda] = useState<MonedaPago>('COR');
  const [abonoFecha, setAbonoFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [abonoReferencia, setAbonoReferencia] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await window.api.clientes.list(busqueda.trim() || undefined);
      if (r.success) setClientes(r.data);
    } finally {
      setCargando(false);
    }
  }, [busqueda]);

  useEffect(() => {
    const t = setTimeout(cargar, busqueda ? 200 : 0);
    return () => clearTimeout(t);
  }, [cargar, busqueda]);

  useEffect(() => {
    if (!detalle) {
      setVentasCliente([]);
      setPagosCliente([]);
      setAbonoAbierto(false);
      setAbonoMontoTexto('');
      return;
    }
    window.api.ventas.list({ cliente_id: detalle.id }).then((r) => {
      if (r.success) setVentasCliente(r.data);
    });
    window.api.pagos.listarPorCliente(detalle.id).then((r) => {
      if (r.success) setPagosCliente(r.data);
    });
  }, [detalle, clientes]);

  useEffect(() => {
    if (clienteInicialId && clientes.length > 0) {
      const c = clientes.find((item) => item.id === clienteInicialId);
      if (c) setDetalle(c);
    }
  }, [clienteInicialId, clientes]);

  const confirmarAnularPago = async () => {
    if (!pagoAnulando) return;
    const r = await window.api.pagos.anular(pagoAnulando.id);
    if (r.success) {
      showToast({ message: 'Abono anulado con éxito', type: 'success' });
      setPagoAnulando(null);
      await cargar();
      if (detalle) {
        const [vr, pr, cr] = await Promise.all([
          window.api.ventas.list({ cliente_id: detalle.id }),
          window.api.pagos.listarPorCliente(detalle.id),
          window.api.clientes.get(detalle.id),
        ]);
        if (vr.success) setVentasCliente(vr.data);
        if (pr.success) setPagosCliente(pr.data);
        if (cr.success && cr.data) setDetalle(cr.data);
      }
      onCambio();
    } else {
      showToast({ message: r.error, type: 'error' });
    }
  };

  const archivar = async (c: ClienteDetalle) => {
    const r = await window.api.clientes.archivar(c.id);
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    showUndoToast(
      `${c.nombre} eliminado`,
      async () => {
        await cargar();
        onCambio();
      },
      r.data.evento_grupo_id
    );
    setDetalle(null);
    await cargar();
    onCambio();
  };

  const registrarAbono = async () => {
    if (!detalle) return;
    const montoCents = parsearACentavos(abonoMontoTexto, { min: 0.01 });
    if (montoCents === null) {
      showToast({ message: 'Ingresá un monto válido mayor a cero.', type: 'error' });
      return;
    }
    setAbonoGuardando(true);
    try {
      const input: AbonoClienteInput = {
        cliente_id: detalle.id,
        fecha: abonoFecha,
        monto_cents: montoCents,
        moneda: abonoMoneda,
        metodo: abonoMetodo,
        referencia: abonoReferencia.trim() || undefined,
      };
      const r = await window.api.pagos.registrarAbonoCliente(input);
      if (!r.success) {
        showToast({ message: r.error, type: 'error' });
        return;
      }
      showToast({ message: `Abono de ${abonoMoneda === 'USD' ? '$' : 'C$'}${(montoCents / 100).toFixed(2)} registrado`, type: 'success' });
      setAbonoMontoTexto('');
      setAbonoReferencia('');
      setAbonoAbierto(false);
      // Recargar kardex y clientes
      const [vr, pr, cr] = await Promise.all([
        window.api.ventas.list({ cliente_id: detalle.id }),
        window.api.pagos.listarPorCliente(detalle.id),
        window.api.clientes.get(detalle.id),
      ]);
      if (vr.success) setVentasCliente(vr.data);
      if (pr.success) setPagosCliente(pr.data);
      if (cr.success && cr.data) setDetalle(cr.data);
      onCambio();
    } finally {
      setAbonoGuardando(false);
    }
  };

  const totalDeuda = clientes.reduce((a, c) => a + c.saldo_pendiente_usd_cents, 0);
  const conDeuda = clientes.filter((c) => c.saldo_pendiente_usd_cents > 0).length;

  const columnas: Column<ClienteDetalle>[] = [
    {
      key: 'nombre',
      header: 'Clienta',
      render: (c) => {
        const iniciales =
          c.nombre
            .split(' ')
            .filter(Boolean)
            .map((n) => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'CL';
        return (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-acento/10 text-acento-fuerte border border-acento/20 flex items-center justify-center font-bold text-caption shrink-0 shadow-xs">
              {iniciales}
            </div>
            <div className="min-w-0">
              <div className="text-body font-semibold text-texto tracking-tight truncate">{c.nombre}</div>
              <div className="text-caption text-texto-3 truncate flex items-center gap-1.5 font-mono">
                {c.telefono && <span>{c.telefono}</span>}
                {c.telefono && c.ciudad && <span>·</span>}
                {c.ciudad && <span className="font-sans">{c.ciudad}</span>}
                {!c.telefono && !c.ciudad && <span className="font-sans italic text-texto-3">Sin contacto</span>}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'compras',
      header: 'Compras',
      align: 'right',
      width: '110px',
      render: (c) => (
        <span className="text-label text-texto-2 tabular font-mono">
          {c.compras_count} {c.compras_count === 1 ? 'pedido' : 'pedidos'}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total comprado',
      align: 'right',
      width: '170px',
      render: (c) => <Money usd_cents={c.total_comprado_usd_cents} size="sm" soloUsd />,
    },
    {
      key: 'deuda',
      header: 'Debe',
      align: 'right',
      width: '150px',
      render: (c) =>
        c.saldo_pendiente_usd_cents > 0 ? (
          <span className="font-bold text-alerta">
            <Money usd_cents={c.saldo_pendiente_usd_cents} size="sm" soloUsd />
          </span>
        ) : (
          <Badge tone="success">Al día</Badge>
        ),
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      width: '180px',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            title="Ver historial de abonos y pedidos"
            className="text-acento hover:bg-acento/10 rounded-lg text-caption font-semibold flex items-center gap-1"
            onClick={(e) => {
              e.stopPropagation();
              setDetalle(c);
            }}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Abonos</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setEditando(c);
              setModalAbierto(true);
            }}
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Eliminar a ${c.nombre}`}
            title="Eliminar clienta"
            className="text-texto-3 hover:text-danger-600 rounded-lg"
            onClick={(e) => {
              e.stopPropagation();
              setArchivando(c);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 flex overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 md:px-6 md:py-4 animate-fade-in scroll-smooth">
        <div className="max-w-[1500px] w-full mx-auto space-y-4 stagger-children">
          {/* Barra superior estilizada idéntica a la del inicio */}
        <div className="flex items-center justify-between gap-3 pb-1 border-b border-borde/40 text-caption text-texto-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-bold text-texto text-body">Directorio de Clientas</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-acento/10 text-acento border border-acento/20">
              <span className="w-1.5 h-1.5 rounded-full bg-acento" />
              {clientes.length} clienta{clientes.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline-block text-[11px] text-texto-3">
              Historial de compras y créditos
            </span>
            <Button
              variant="primary"
              size="sm"
              className="rounded-xl shadow-xs"
              onClick={() => {
                setEditando(null);
                setModalAbierto(true);
              }}
            >
              <Plus className="w-4 h-4" />
              <span>Agregar clienta</span>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 stagger-children">
          <StatTile
            label="Clientes registrados"
            value={clientes.length}
            tone="info"
            icon={Users}
            hint="Total de clientas en la base de datos"
            onClick={() => setBusqueda('')}
          />
          <StatTile
            label="Te deben en total"
            usd_cents={totalDeuda}
            tone={totalDeuda > 0 ? 'warning' : 'success'}
            icon={Wallet}
            hint={`${conDeuda} clienta(s) con saldo pendiente`}
          />
          <StatTile
            label="Total histórico comprado"
            usd_cents={clientes.reduce((a, c) => a + c.total_comprado_usd_cents, 0)}
            tone="purple"
            icon={ShoppingBag}
            hint="Volumen acumulado por todas las clientas"
          />
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-texto-3 pointer-events-none" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="pl-9 pr-9"
            aria-label="Buscar clientes"
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

        {cargando ? (
          <div className="p-12 text-center text-body text-texto-3">Cargando clientes...</div>
        ) : clientes.length === 0 ? (
          <EmptyState
            icon={Users}
            title={busqueda ? 'Nadie coincide' : 'Todavía no tenés clientes'}
            description={
              busqueda
                ? 'Probá con otro nombre o teléfono.'
                : 'Agregá clientes para llevar el control de encargos, cuotas y saldos.'
            }
            action={
              !busqueda ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setEditando(null);
                    setModalAbierto(true);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar la primera clienta</span>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            columns={columnas}
            rows={clientes}
            rowKey={(c) => c.id}
            selectedKey={detalle?.id}
            onRowClick={(c) => setDetalle(detalle?.id === c.id ? null : c)}
            onRowContextMenu={(c, e) => {
              setMenuContextual({ x: e.clientX, y: e.clientY, cliente: c });
            }}
          />
        )}
        </div>
      </div>

      {detalle && (
        <aside ref={lateralRef} className="w-[410px] border-l border-borde bg-superficie flex flex-col shrink-0 animate-drawer shadow-xl z-10">
          {/* Cabecera pegajosa con avatar y botón de cerrar */}
          <div className="p-5 border-b border-borde bg-superficie-2/40 flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-acento/10 text-acento-fuerte border border-acento/20 flex items-center justify-center font-bold text-body shrink-0 shadow-xs">
                {detalle.nombre
                  .split(' ')
                  .filter(Boolean)
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase() || 'CL'}
              </div>
              <div className="min-w-0">
                <h3 className="text-title font-bold text-texto tracking-tight truncate">
                  {detalle.nombre}
                </h3>
                {detalle.alias && (
                  <p className="text-caption text-texto-3 font-medium">"{detalle.alias}"</p>
                )}
                {detalle.telefono && (
                  <a
                    href={enlaceWhatsApp(
                      detalle.telefono,
                      detalle.nombre,
                      detalle.saldo_pendiente_usd_cents,
                      parametros
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-caption font-semibold text-acento bg-acento-suave hover:bg-acento-suave dark:hover:bg-acento-suave px-2 py-0.5 rounded-full border border-acento-suave transition-colors mt-1"
                  >
                    <MessageCircle className="w-3 h-3 shrink-0" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDetalle(null)}
              aria-label="Cerrar detalle"
              className="text-texto-3 hover:text-texto rounded-lg -mr-1 -mt-1 shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Contacto y ubicación */}
            {(detalle.telefono || detalle.direccion || detalle.ciudad) && (
              <div className="rounded-xl border border-borde/70 bg-superficie-2/30 p-3.5 space-y-2 text-label">
                {detalle.telefono && (
                  <div className="flex items-center gap-2 text-texto font-mono">
                    <span className="text-caption text-texto-3">Teléfono:</span>
                    <span>{detalle.telefono}</span>
                  </div>
                )}
                {(detalle.direccion || detalle.ciudad) && (
                  <div className="flex items-start gap-2 text-texto-2">
                    <MapPin className="w-3.5 h-3.5 text-texto-3 shrink-0 mt-0.5" />
                    <span>{[detalle.direccion, detalle.ciudad].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Resumen financiero */}
            <div className="rounded-xl border border-borde/80 bg-gradient-to-b from-superficie via-superficie to-superficie-2/30 p-4 space-y-2.5 shadow-xs">
              <div className="flex justify-between items-center gap-2">
                <span className="text-label text-texto-2 font-medium">Ha comprado en total</span>
                <Money usd_cents={detalle.total_comprado_usd_cents} size="sm" soloUsd />
              </div>
              <div className="flex justify-between items-center gap-2 pt-2 border-t border-borde/70">
                <span className="text-body font-bold text-texto">Debe actualmente</span>
                {detalle.saldo_pendiente_usd_cents > 0 ? (
                  <span className="font-bold text-alerta">
                    <Money usd_cents={detalle.saldo_pendiente_usd_cents} size="md" soloUsd />
                  </span>
                ) : (
                  <Badge tone="success">Al día / Sin saldo</Badge>
                )}
              </div>
            </div>

            {detalle.saldo_pendiente_usd_cents > 0 && detalle.telefono && (
              <div className="pt-1">
                <a
                  href={enlaceWhatsApp(
                    detalle.telefono,
                    detalle.nombre,
                    detalle.saldo_pendiente_usd_cents,
                    parametros
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-medium text-caption text-acento bg-acento/15 border border-acento/30 hover:bg-acento/25 transition-[background-color,border-color,color,box-shadow,transform,opacity] shadow-2xs active:scale-[0.98]"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Cobrar saldo pendiente por WhatsApp</span>
                </a>
              </div>
            )}

            {detalle.notas && (
              <div className="rounded-xl border border-borde/70 bg-superficie-2/20 p-3.5 shadow-xs">
                <div className="text-caption font-medium text-texto-3 mb-1">Notas</div>
                <p className="text-label text-texto-2 leading-relaxed">{detalle.notas}</p>
              </div>
            )}

            {/* Botón Registrar Abono (colapsable) */}
            {detalle.saldo_pendiente_usd_cents > 0 && (
              <div className="rounded-xl border border-borde bg-superficie overflow-hidden shadow-xs">
                <button
                  type="button"
                  onClick={() => setAbonoAbierto((v) => !v)}
                  className={cn(
                    'w-full flex items-center justify-between px-4 py-3 text-left transition-colors',
                    abonoAbierto ? 'bg-acento/10' : 'hover:bg-superficie-2'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-acento" />
                    <span className="text-label font-semibold text-texto">Registrar Abono</span>
                    <Badge tone="warning">
                      Debe {formatearMoneda(detalle.saldo_pendiente_usd_cents, 'USD')}
                    </Badge>
                  </div>
                  <ChevronDown className={cn('w-4 h-4 text-texto-3 transition-transform', abonoAbierto && 'rotate-180')} />
                </button>

                {abonoAbierto && (
                  <div
                    className="px-4 pb-4 pt-3 space-y-3 border-t border-borde/60 animate-fade-in"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !abonoGuardando && abonoMontoTexto) {
                        e.preventDefault();
                        registrarAbono();
                      }
                    }}
                  >
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
                          className="text-right"
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
                    <Field label="Referencia" hint="Opcional" className="mb-0">
                      <Input
                        value={abonoReferencia}
                        onChange={(e) => setAbonoReferencia(e.target.value)}
                        placeholder="Ej. Transferencia BAC #1234"
                      />
                    </Field>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={registrarAbono}
                      disabled={abonoGuardando || !abonoMontoTexto}
                      className="w-full"
                    >
                      {abonoGuardando ? 'Guardando...' : 'Confirmar Abono'}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Historial de compras */}
            <div className="rounded-xl border border-borde/80 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde text-label font-medium text-texto flex items-center justify-between">
                <span>Historial de pedidos</span>
                <span className="text-caption text-texto-3">{ventasCliente.length} venta(s)</span>
              </div>
              {ventasCliente.length > 0 ? (
                <ul className="divide-y divide-borde/60 max-h-52 overflow-y-auto">
                  {ventasCliente.map((v) => (
                    <li key={v.id}>
                      <button
                        onClick={() => onVerVenta(v.id, v.tipo)}
                        className="w-full text-left px-4 py-3 hover:bg-superficie-2/30 transition-colors focus-visible:outline-none focus-visible:bg-superficie-2/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-label font-medium text-texto font-mono">{v.codigo}</span>
                          <Money usd_cents={v.total_usd_cents} size="sm" soloUsd />
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <span className="text-caption text-texto-3 font-mono">{formatearFecha(v.fecha)}</span>
                          {v.saldo_usd_cents > 0 ? (
                            <span className="text-caption font-semibold text-alerta">
                              Debe {formatearMoneda(v.saldo_usd_cents, 'USD')}
                            </span>
                          ) : (
                            <span className="text-caption font-medium text-acento">Saldada</span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-center text-body text-texto-3">
                  Todavía no te ha comprado nada.
                </p>
              )}
            </div>

            {/* Historial de Abonos (Kardex) */}
            <div className="rounded-xl border border-borde/80 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde text-label font-medium text-texto flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-texto-3" />
                  <span className="font-semibold">Historial de Abonos</span>
                </div>
                <span className="text-caption text-texto-3 font-semibold">{pagosCliente.length} pago(s)</span>
              </div>
              {pagosCliente.length > 0 ? (
                <ul className="divide-y divide-borde/60 max-h-52 overflow-y-auto">
                  {pagosCliente.map((p) => (
                    <li key={p.id} className="px-4 py-2.5 flex items-center justify-between gap-2 hover:bg-superficie-2/25 transition-colors">
                      <div className="min-w-0">
                        <div className="text-label text-texto font-mono flex items-center gap-1.5">
                          <span>{formatearFecha(p.fecha)}</span>
                          {p.es_anticipo && (
                            <Badge tone="info">Anticipo</Badge>
                          )}
                        </div>
                        <div className="text-caption text-texto-3 truncate">
                          {p.metodo === 'EFECTIVO' ? 'Efectivo' : p.metodo === 'TRANSFERENCIA' ? 'Transferencia' : 'Otro'}
                          {p.venta_codigo && ` · ${p.venta_codigo}`}
                          {p.referencia && ` · ${p.referencia}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <Money usd_cents={p.monto_usd_cents} size="sm" soloUsd />
                          {p.moneda === 'COR' && (
                            <div className="text-caption text-texto-3 font-mono">
                              {formatearMoneda(p.monto_cor_cents, 'COR')}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setPagoAnulando(p)}
                          title="Anular este abono"
                          className="text-texto-3 hover:text-danger-600 p-1 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="py-6 px-4 text-center">
                  <div className="w-8 h-8 rounded-full bg-superficie-2 text-texto-3 flex items-center justify-center mx-auto mb-1.5">
                    <Clock className="w-4 h-4" />
                  </div>
                  <p className="text-label font-bold text-texto">Sin abonos registrados</p>
                  <p className="text-caption text-texto-3 mt-0.5">
                    Esta clienta todavía no tiene abonos o amortizaciones en su cuenta.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-texto-3 hover:text-danger-600 rounded-lg text-caption"
                onClick={() => detalle && setArchivando(detalle)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                <span>Eliminar clienta</span>
              </Button>
            </div>
          </div>
        </aside>
      )}

      <Confirmar
        abierto={pagoAnulando !== null}
        peligroso
        titulo="¿Anular este abono?"
        consecuencias={[
          `Monto: ${formatearMoneda(pagoAnulando?.monto_usd_cents || 0, 'USD')}.`,
          'El saldo adeudado por la clienta se restaurará automáticamente.',
        ]}
        textoConfirmar="Sí, anular abono"
        textoCancelar="No, mantener"
        onConfirmar={confirmarAnularPago}
        onCerrar={() => setPagoAnulando(null)}
      />

      <Confirmar
        abierto={archivando !== null}
        peligroso
        titulo={`¿Eliminar a ${archivando?.nombre ?? ''}?`}
        consecuencias={[
          'La clienta se eliminará de la lista activa y no aparecerá al registrar nuevas ventas.',
          ...(archivando && archivando.saldo_pendiente_usd_cents > 0
            ? [
                `Actualmente tiene un saldo pendiente de ${formatearMoneda(archivando.saldo_pendiente_usd_cents, 'USD')}.`,
              ]
            : []),
          'Sus ventas y pagos anteriores quedarán conservados en el historial financiero.',
        ]}
        textoConfirmar="Sí, eliminar"
        onConfirmar={() => archivando && archivar(archivando)}
        onCerrar={() => setArchivando(null)}
      />

      <ClienteModal
        abierto={modalAbierto}
        cliente={editando}
        onCerrar={() => setModalAbierto(false)}
        onGuardado={async () => {
          await cargar();
          onCambio();
        }}
      />

      {menuContextual && (
        <ContextMenu
          x={menuContextual.x}
          y={menuContextual.y}
          onClose={() => setMenuContextual(null)}
          items={[
            {
              id: 'ver-ficha',
              label: 'Ver ficha 360° y compras',
              icon: <Eye className="w-4 h-4" />,
              shortcut: 'Espacio',
              onClick: () => setDetalle(menuContextual.cliente),
            },
            ...(menuContextual.cliente.telefono
              ? [
                  {
                    id: 'whatsapp',
                    label: 'Enviar WhatsApp',
                    icon: <MessageCircle className="w-4 h-4" />,
                    tone: 'success' as const,
                    onClick: () => {
                      const tel = (menuContextual.cliente.telefono || '').replace(/\D/g, '');
                      if (tel) {
                        const url = tel.startsWith('505')
                          ? `https://wa.me/${tel}`
                          : `https://wa.me/505${tel}`;
                        window.open(url, '_blank');
                      }
                    },
                  },
                ]
              : []),
            {
              id: 'editar',
              label: 'Editar información',
              icon: <FileEdit className="w-4 h-4" />,
              shortcut: 'Enter',
              onClick: () => {
                setEditando(menuContextual.cliente);
                setModalAbierto(true);
              },
            },
            'separator' as const,
            {
              id: 'copiar-nombre',
              label: `Copiar nombre (${menuContextual.cliente.nombre})`,
              icon: <Copy className="w-4 h-4" />,
              onClick: () => {
                navigator.clipboard.writeText(menuContextual.cliente.nombre);
                showToast({ message: 'Nombre copiado al portapapeles', type: 'info' });
              },
            },
            ...(menuContextual.cliente.telefono
              ? [
                  {
                    id: 'copiar-tel',
                    label: `Copiar teléfono (${menuContextual.cliente.telefono})`,
                    icon: <Copy className="w-4 h-4" />,
                    onClick: () => {
                      navigator.clipboard.writeText(menuContextual.cliente.telefono ?? '');
                      showToast({ message: 'Teléfono copiado al portapapeles', type: 'info' });
                    },
                  },
                ]
              : []),
            'separator' as const,
            {
              id: 'archivar',
              label: 'Archivar cliente...',
              icon: <Trash2 className="w-4 h-4" />,
              tone: 'danger' as const,
              shortcut: 'Supr',
              onClick: () => setArchivando(menuContextual.cliente),
            },
          ]}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

const ClienteModal: React.FC<{
  abierto: boolean;
  cliente: ClienteDetalle | null;
  onCerrar: () => void;
  onGuardado: () => Promise<void>;
}> = ({ abierto, cliente, onCerrar, onGuardado }) => {
  const { showToast } = useToast();

  const [nombre, setNombre] = useState('');
  const [alias, setAlias] = useState('');
  const [telefono, setTelefono] = useState('');
  const [direccion, setDireccion] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setNombre(cliente?.nombre ?? '');
    setAlias(cliente?.alias ?? '');
    setTelefono(cliente?.telefono ?? '');
    setDireccion(cliente?.direccion ?? '');
    setCiudad(cliente?.ciudad ?? '');
    setNotas(cliente?.notas ?? '');
  }, [abierto, cliente]);

  useEffect(() => {
    if (!abierto) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const guardar = async () => {
    if (!nombre.trim()) {
      setError('La clienta necesita un nombre.');
      return;
    }

    setGuardando(true);
    try {
      const r = await window.api.clientes.guardar({
        id: cliente?.id,
        nombre: formatearNombreEntidad(nombre),
        alias: alias.trim() ? formatearNombreEntidad(alias) : undefined,
        telefono: telefono.trim() || undefined,
        direccion: direccion.trim() || undefined,
        ciudad: ciudad.trim() ? formatearNombreEntidad(ciudad) : undefined,
        notas: notas.trim() || undefined,
      });

      if (!r.success) {
        setError(r.error);
        return;
      }

      showToast({ message: cliente ? 'Clienta actualizada' : 'Clienta agregada', type: 'success' });
      await onGuardado();
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  const alPresionarEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;

    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
      e.preventDefault();
      const contenedor = e.currentTarget;
      const campos = Array.from(
        contenedor.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([type="checkbox"]):not([disabled]), select:not([disabled])'
        )
      ).filter((el) => el.offsetParent !== null);

      const idx = campos.indexOf(target);
      if (idx !== -1 && idx + 1 < campos.length) {
        const siguiente = campos[idx + 1];
        siguiente.focus();
        if (siguiente instanceof HTMLInputElement) {
          siguiente.select?.();
        }
      } else {
        guardar();
      }
    }
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 cursor-pointer"
        role="dialog"
        aria-modal="true"
      aria-labelledby="titulo-cliente"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        onKeyDown={alPresionarEnter}
        onClick={(e) => e.stopPropagation()}
        className="bg-superficie rounded-2xl shadow-2xl w-full max-w-lg animate-modal-pop border border-borde/80 overflow-hidden cursor-default"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-borde">
          <h3 id="titulo-cliente" className="text-title text-texto">
            {cliente ? `Editar ${cliente.nombre}` : 'Agregar clienta'}
          </h3>
          <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar">
            <X className="w-4 h-4" />
          </Button>
        </header>

        <div className="p-5 space-y-4">
          {error && (
            <p className="rounded-md border border-danger-200 bg-danger-50 p-3 text-label text-danger-800">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre">
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onBlur={() => setNombre((prev) => formatearNombreEntidad(prev))}
                autoFocus
              />
            </Field>
            <Field label="Cómo le decís" hint="Opcional">
              <Input
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                onBlur={() => setAlias((prev) => formatearNombreEntidad(prev))}
              />
            </Field>
            <Field label="Teléfono">
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="8888-8888"
              />
            </Field>
            <Field label="Ciudad">
              <Input
                value={ciudad}
                onChange={(e) => setCiudad(e.target.value)}
                onBlur={() => setCiudad((prev) => formatearNombreEntidad(prev))}
              />
            </Field>
          </div>

          <Field label="Dirección">
            <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </Field>

          <Field label="Notas">
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} />
          </Field>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-borde">
          <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </footer>
      </div>
    </div>
    </Portal>
  );
};

/**
 * Abre WhatsApp con el mensaje ya escrito.
 *
 * El teléfono estaba como texto muerto: para cobrar un saldo había que
 * copiarlo, abrir WhatsApp y redactar el mensaje a mano cada vez.
 */
function enlaceWhatsApp(
  telefono: string,
  nombre: string,
  saldoUsdCents: number,
  parametros?: ParametrosSistema | null
): string {
  const soloDigitos = telefono.replace(/\D/g, '');
  const numero = soloDigitos.length === 8 ? `505${soloDigitos}` : soloDigitos;

  if (saldoUsdCents <= 0) {
    return `https://wa.me/${numero}?text=${encodeURIComponent(`Hola ${nombre.split(' ')[0]}!`)}`;
  }

  const saldoUsd = formatearMoneda(saldoUsdCents, 'USD');
  const tasa = (parametros?.tasa_cambio_cents ?? 3662) / 100;
  const saldoCs = formatearMoneda(Math.round(saldoUsdCents * tasa), 'COR');

  const cuentasTxt =
    (parametros?.cuentas_bancarias ?? []).length > 0
      ? (parametros?.cuentas_bancarias ?? [])
          .map((cta) => `${cta.banco} (${cta.moneda}): ${cta.numero}${cta.titular ? ' - ' + cta.titular : ''}`)
          .join('\n')
      : '';

  let plantilla =
    parametros?.plantilla_cobro_whatsapp ||
    'Hola {cliente}, te saludamos de Glow Heaven ✨ Te recordamos que tienes un saldo pendiente de {saldo_usd} ({saldo_cs}). Si ya realizaste tu abono, por favor compártenos el comprobante. ¡Muchas gracias!';

  let mensaje = plantilla
    .replace(/\{cliente\}/g, nombre)
    .replace(/\{saldo_usd\}/g, saldoUsd)
    .replace(/\{saldo_cs\}/g, saldoCs)
    .replace(/\{cuentas_bancarias\}/g, cuentasTxt ? `\nCuentas bancarias:\n${cuentasTxt}` : '');

  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}
