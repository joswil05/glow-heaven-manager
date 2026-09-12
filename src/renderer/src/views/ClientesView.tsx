import React, { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Search, Trash2, X, MessageCircle, MapPin, Wallet, ShoppingBag } from 'lucide-react';
import type { ClienteDetalle, Venta } from '../../../shared/types';
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
  type Column,
} from '../components/ui';
import { EmptyState } from '../components/shared/EmptyState';
import { useToast } from '../context/ToastContext';
import { formatearMoneda, formatearFecha } from '@core/moneda';

interface ClientesViewProps {
  onCambio: () => void;
  onVerVenta: (ventaId: number, tipo: 'INVENTARIO' | 'ENCARGO') => void;
}

export const ClientesView: React.FC<ClientesViewProps> = ({ onCambio, onVerVenta }) => {
  const { showToast, showUndoToast } = useToast();

  const [clientes, setClientes] = useState<ClienteDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState<ClienteDetalle | null>(null);
  const [ventasCliente, setVentasCliente] = useState<Venta[]>([]);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState<ClienteDetalle | null>(null);
  const [archivando, setArchivando] = useState<ClienteDetalle | null>(null);

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
      return;
    }
    window.api.ventas.list({ cliente_id: detalle.id }).then((r) => {
      if (r.success) setVentasCliente(r.data);
    });
  }, [detalle, clientes]);

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

  const totalDeuda = clientes.reduce((a, c) => a + c.saldo_pendiente_usd_cents, 0);
  const conDeuda = clientes.filter((c) => c.saldo_pendiente_usd_cents > 0).length;

  const columnas: Column<ClienteDetalle>[] = [
    {
      key: 'nombre',
      header: 'Cliente',
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
          <span className="font-bold text-amber-700">
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
      width: '150px',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
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
            title="Eliminar cliente"
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
      <div className="flex-1 overflow-y-auto p-6 space-y-5 animate-fade-in">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-label text-texto-2">
              Quién te compra, cuánto ha comprado y quién te debe.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setEditando(null);
              setModalAbierto(true);
            }}
          >
            <Plus className="w-4 h-4" />
            <span>Agregar cliente</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <StatTile
            label="Clientes registrados"
            value={clientes.length}
            tone="info"
            icon={Users}
            hint="Total de clientas en la base de datos"
          />
          <StatTile
            label="Te deben en total"
            usd_cents={totalDeuda}
            tone={totalDeuda > 0 ? 'warning' : 'success'}
            icon={Wallet}
            hint={`${conDeuda} cliente(s) con saldo pendiente`}
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
                  <span>Agregar el primer cliente</span>
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
          />
        )}
      </div>

      {detalle && (
        <aside className="w-[410px] border-l border-borde bg-superficie flex flex-col shrink-0 animate-fade-in shadow-xl z-10">
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
                      detalle.saldo_pendiente_usd_cents
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-caption font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100/80 px-2 py-0.5 rounded-full border border-emerald-200/70 transition-colors mt-1"
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
                  <span className="font-bold text-amber-700">
                    <Money usd_cents={detalle.saldo_pendiente_usd_cents} size="md" soloUsd />
                  </span>
                ) : (
                  <Badge tone="success">Al día / Sin saldo</Badge>
                )}
              </div>
            </div>

            {detalle.notas && (
              <div className="rounded-xl border border-borde/70 bg-superficie-2/20 p-3.5 shadow-xs">
                <div className="text-caption font-medium text-texto-3 mb-1">Notas</div>
                <p className="text-label text-texto-2 leading-relaxed">{detalle.notas}</p>
              </div>
            )}

            {/* Historial de compras */}
            <div className="rounded-xl border border-borde/80 overflow-hidden shadow-xs">
              <div className="px-4 py-2.5 bg-superficie-2/50 border-b border-borde text-label font-medium text-texto flex items-center justify-between">
                <span>Historial de pedidos</span>
                <span className="text-caption text-texto-3">{ventasCliente.length} venta(s)</span>
              </div>
              {ventasCliente.length > 0 ? (
                <ul className="divide-y divide-borde/60 max-h-80 overflow-y-auto">
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
                            <span className="text-caption font-semibold text-amber-700">
                              Debe {formatearMoneda(v.saldo_usd_cents, 'USD')}
                            </span>
                          ) : (
                            <span className="text-caption font-medium text-emerald-700">Saldada</span>
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

            <div className="pt-2 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="text-texto-3 hover:text-danger-600 rounded-lg text-caption"
                onClick={() => detalle && setArchivando(detalle)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                <span>Eliminar cliente</span>
              </Button>
            </div>
          </div>
        </aside>
      )}

      <Confirmar
        abierto={archivando !== null}
        peligroso
        titulo={`¿Eliminar a ${archivando?.nombre ?? ''}?`}
        consecuencias={[
          'El cliente se eliminará de la lista activa y no aparecerá al registrar nuevas ventas.',
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
      setError('El cliente necesita un nombre.');
      return;
    }

    setGuardando(true);
    try {
      const r = await window.api.clientes.guardar({
        id: cliente?.id,
        nombre: nombre.trim(),
        alias: alias.trim() || undefined,
        telefono: telefono.trim() || undefined,
        direccion: direccion.trim() || undefined,
        ciudad: ciudad.trim() || undefined,
        notas: notas.trim() || undefined,
      });

      if (!r.success) {
        setError(r.error);
        return;
      }

      showToast({ message: cliente ? 'Cliente actualizado' : 'Cliente agregado', type: 'success' });
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-velo/40 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-cliente"
    >
      <div
        onKeyDown={alPresionarEnter}
        className="bg-superficie rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in border border-borde/80 overflow-hidden"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-borde">
          <h3 id="titulo-cliente" className="text-title text-texto">
            {cliente ? `Editar ${cliente.nombre}` : 'Agregar cliente'}
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
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
            </Field>
            <Field label="Cómo le decís" hint="Opcional">
              <Input value={alias} onChange={(e) => setAlias(e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="8888-8888"
              />
            </Field>
            <Field label="Ciudad">
              <Input value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
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
  );
};

/**
 * Abre WhatsApp con el mensaje ya escrito.
 *
 * El teléfono estaba como texto muerto: para cobrar un saldo había que
 * copiarlo, abrir WhatsApp y redactar el mensaje a mano cada vez.
 */
function enlaceWhatsApp(telefono: string, nombre: string, saldoUsdCents: number): string {
  const soloDigitos = telefono.replace(/\D/g, '');
  // Ocho dígitos es un número nicaragüense sin código de país.
  const numero = soloDigitos.length === 8 ? `505${soloDigitos}` : soloDigitos;

  const saludo = `Hola ${nombre.split(' ')[0]}`;
  const texto =
    saldoUsdCents > 0
      ? `${saludo}, te escribo por el saldo pendiente de ${formatearMoneda(saldoUsdCents, 'USD')}.`
      : `${saludo}!`;

  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}
