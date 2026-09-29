import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ClienteDetalle } from '../../../../shared/types';
import { Button, Field, Input, Textarea, Portal } from '../../components/ui';
import { formatearMoneda } from '@core/moneda';
import { parsearACentavos, parsearDecimal } from '@core/numeros';
import { algunoContiene } from '@core/texto';
import { hoyISO } from '@core/fechas';
import { formatearNombreEntidad, formatearTextoGeneral } from '../../../../shared/formatoTexto';
import { useCerrarConEscape } from '../../lib/useCerrarConEscape';
import { useToast } from '../../context/ToastContext';

/**
 * Anotar un encargo, en una sola pantalla: quién lo pide y qué quiere.
 *
 * El precio es opcional: si ella todavía no sabe cuánto vale, queda como
 * pedido "por cotizar". Todo lo demás (precio en la tienda, peso, costo,
 * anticipo) se decide al cotizarlo, desde el detalle. Antes esto era el
 * asistente de ventas de tres pasos, con seis campos por pieza.
 */
interface NuevoEncargoModalProps {
  abierto: boolean;
  clientes: ClienteDetalle[];
  onCerrar: () => void;
  onGuardado: (id: number) => void;
}

interface Pieza {
  clave: number;
  descripcion: string;
  cantidad: string;
  precio: string;
}

const piezaVacia = (clave: number): Pieza => ({ clave, descripcion: '', cantidad: '1', precio: '' });

export const NuevoEncargoModal: React.FC<NuevoEncargoModalProps> = ({ abierto, clientes, onCerrar, onGuardado }) => {
  const { showToast } = useToast();
  const [lista, setLista] = useState<ClienteDetalle[]>(clientes);
  const [cliente, setCliente] = useState<ClienteDetalle | null>(null);
  const [buscar, setBuscar] = useState('');
  const [piezas, setPiezas] = useState<Pieza[]>([piezaVacia(1)]);
  const [notas, setNotas] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const buscarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!abierto) return;
    setLista(clientes);
    setCliente(null);
    setBuscar('');
    setPiezas([piezaVacia(1)]);
    setNotas('');
    setError(null);
    setTimeout(() => buscarRef.current?.focus(), 50);
  }, [abierto, clientes]);

  useCerrarConEscape(abierto, onCerrar);

  const sugeridas = useMemo(
    () =>
      buscar.trim()
        ? lista.filter((c) => algunoContiene([c.nombre, c.alias, c.telefono], buscar)).slice(0, 6)
        : [],
    [buscar, lista]
  );

  if (!abierto) return null;

  const cambiar = (clave: number, cambios: Partial<Pieza>) =>
    setPiezas((prev) => prev.map((p) => (p.clave === clave ? { ...p, ...cambios } : p)));

  const agregarClienta = async () => {
    const nombre = formatearNombreEntidad(buscar);
    if (!nombre) return;
    const r = await window.api.clientes.guardar({ nombre });
    if (!r.success) return setError(r.error);
    const nueva: ClienteDetalle = {
      id: r.data.id,
      nombre,
      activo: true,
      compras_count: 0,
      total_comprado_usd_cents: 0,
      saldo_pendiente_usd_cents: 0,
      creado_en: new Date().toISOString(),
    };
    setLista((prev) => [nueva, ...prev]);
    setCliente(nueva);
    setBuscar('');
  };

  const sinPrecio = piezas.filter((p) => !p.precio.trim()).length;
  const total = piezas.reduce(
    (s, p) => s + (parsearACentavos(p.precio, { min: 0 }) ?? 0) * Math.max(1, Math.round(parsearDecimal(p.cantidad) ?? 1)),
    0
  );

  const guardar = async () => {
    if (!cliente) return setError('Elegí quién lo pide.');
    for (const p of piezas) {
      if (!p.descripcion.trim()) return setError('Escribí qué quiere en cada pieza.');
      if (parsearDecimal(p.cantidad, { min: 1 }) === null) return setError('La cantidad tiene que ser 1 o más.');
      if (p.precio.trim() && parsearACentavos(p.precio, { min: 0.01 }) === null) {
        return setError('El precio tiene que ser mayor a $0, o quedar vacío.');
      }
    }
    setGuardando(true);
    setError(null);
    const r = await window.api.ventas.crear({
      cliente_id: cliente.id,
      fecha: hoyISO(),
      tipo: 'ENCARGO',
      notas: notas.trim() || undefined,
      lineas: piezas.map((p) => ({
        descripcion: formatearTextoGeneral(p.descripcion),
        cantidad: Math.max(1, Math.round(parsearDecimal(p.cantidad) ?? 1)),
        precio_unitario_usd_cents: p.precio.trim() ? (parsearACentavos(p.precio, { min: 0 }) ?? 0) : 0,
      })),
    });
    setGuardando(false);
    if (!r.success) return setError(r.error);
    showToast({ message: sinPrecio > 0 ? 'Pedido guardado' : 'Encargo guardado', type: 'success' });
    onGuardado(r.data.id);
    onCerrar();
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-nuevo-encargo"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCerrar();
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-superficie rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col animate-modal-pop border border-borde cursor-default"
        >
          <header className="flex items-center justify-between px-5 py-4 border-b border-borde">
            <h3 id="titulo-nuevo-encargo" className="text-title text-texto">
              Nuevo encargo
            </h3>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="p-1 rounded-md text-texto-3 hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="p-5 space-y-5 overflow-y-auto">
            {/* Quién lo pide */}
            <Field label="Clienta">
              {cliente ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-borde bg-superficie-2 px-3 py-2">
                  <span className="text-body text-texto">{cliente.nombre}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCliente(null);
                      setTimeout(() => buscarRef.current?.focus(), 0);
                    }}
                    className="text-label text-acento font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento rounded"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    ref={buscarRef}
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    placeholder="Nombre o teléfono"
                    aria-label="Clienta"
                  />
                  {buscar.trim() && (
                    <ul className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-borde bg-superficie shadow-xl">
                      {sugeridas.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setCliente(c);
                              setBuscar('');
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-superficie-2 text-body text-texto"
                          >
                            {c.nombre}
                            {c.telefono && <span className="text-caption text-texto-3"> · {c.telefono}</span>}
                          </button>
                        </li>
                      ))}
                      <li>
                        <button
                          type="button"
                          onClick={agregarClienta}
                          className="w-full text-left px-3 py-2 hover:bg-superficie-2 text-body text-acento font-medium"
                        >
                          Agregar “{formatearNombreEntidad(buscar)}” como clienta nueva
                        </button>
                      </li>
                    </ul>
                  )}
                </div>
              )}
            </Field>

            {/* Qué quiere: los títulos una sola vez, arriba de las piezas. */}
            <div className="space-y-2">
              <div className="flex gap-2 text-label text-texto-2" aria-hidden="true">
                <span className="flex-1">Qué quiere</span>
                <span className="w-16">Cant.</span>
                <span className="w-28">Precio ($)</span>
                {piezas.length > 1 && <span className="w-6" />}
              </div>
              {piezas.map((p, i) => (
                <div key={p.clave} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <Input
                      value={p.descripcion}
                      onChange={(e) => cambiar(p.clave, { descripcion: e.target.value })}
                      placeholder="Bolso Coach negro, talla M…"
                      aria-label={`Qué quiere ${i + 1}`}
                    />
                  </div>
                  <div className="w-16">
                    <Input
                      value={p.cantidad}
                      onChange={(e) => cambiar(p.clave, { cantidad: e.target.value })}
                      className="text-right"
                      aria-label={`Cantidad ${i + 1}`}
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      value={p.precio}
                      onChange={(e) => cambiar(p.clave, { precio: e.target.value })}
                      placeholder="Sin precio"
                      className="text-right"
                      aria-label={`Precio ${i + 1}`}
                    />
                  </div>
                  {piezas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPiezas((prev) => prev.filter((x) => x.clave !== p.clave))}
                      aria-label={`Quitar la pieza ${i + 1}`}
                      className="w-6 p-1 rounded text-texto-3 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPiezas((prev) => [...prev, piezaVacia(Math.max(...prev.map((x) => x.clave)) + 1)])}
                className="inline-flex items-center gap-1.5 text-label text-texto-2 hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento rounded"
              >
                <Plus className="w-4 h-4" />
                Otra pieza
              </button>
            </div>

            <Field label="Notas">
              <Textarea
                rows={2}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Link, color, para cuándo lo quiere"
              />
            </Field>

            {error && <p className="text-label text-danger-600">{error}</p>}
          </div>

          <footer className="flex items-center justify-between gap-3 px-5 py-4 border-t border-borde">
            <span className="text-label text-texto-2 tabular">
              {sinPrecio === piezas.length
                ? 'Sin precio: se cotiza después'
                : `Total ${formatearMoneda(total, 'USD')}${sinPrecio > 0 ? ' · falta cotizar' : ''}`}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </Portal>
  );
};
