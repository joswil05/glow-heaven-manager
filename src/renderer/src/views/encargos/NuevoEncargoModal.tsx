import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { ClienteDetalle } from '../../../../shared/types';
import { Button, Dialogo, Field, Input, Textarea } from '../../components/ui';
import { formatearMoneda } from '@core/moneda';
import { parsearACentavos, parsearDecimal } from '@core/numeros';
import { algunoContiene } from '@core/texto';
import { hoyISO } from '@core/fechas';
import { formatearNombreEntidad, formatearTextoGeneral } from '../../../../shared/formatoTexto';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/cn';

/**
 * Anotar un encargo, en una sola pantalla: quién lo pide y qué quiere.
 *
 * El precio es opcional: si ella todavía no sabe cuánto vale, queda "por
 * buscar". Todo lo demás (precio en la tienda, peso, costo, anticipo) se
 * decide al cotizarlo, desde el detalle.
 *
 * Con la guía de Emil Kowalski (2.16): no pierde lo escrito si se cierra por
 * error, cada error aparece en su campo con el foco ahí, "Otra pieza" deja el
 * foco en la pieza nueva, y Ctrl+Enter guarda. Los datos que pide son los
 * mismos de antes.
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

/** El error de cada campo, por clave de pieza, y el de la clienta. */
interface Errores {
  clienta?: string;
  piezas: Record<number, { descripcion?: string; cantidad?: string; precio?: string }>;
}

const piezaVacia = (clave: number): Pieza => ({ clave, descripcion: '', cantidad: '1', precio: '' });
const SIN_ERRORES: Errores = { piezas: {} };

export const NuevoEncargoModal: React.FC<NuevoEncargoModalProps> = ({ abierto, clientes, onCerrar, onGuardado }) => {
  const { showToast } = useToast();
  const [lista, setLista] = useState<ClienteDetalle[]>(clientes);
  const [cliente, setCliente] = useState<ClienteDetalle | null>(null);
  const [buscar, setBuscar] = useState('');
  const [piezas, setPiezas] = useState<Pieza[]>([piezaVacia(1)]);
  const [notas, setNotas] = useState('');
  const [errores, setErrores] = useState<Errores>(SIN_ERRORES);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** Las piezas que se agregaron con "Otra pieza": entran con su animación. */
  const [nuevas, setNuevas] = useState<Set<number>>(new Set());
  const buscarRef = useRef<HTMLInputElement>(null);
  const campos = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    if (!abierto) return;
    setLista(clientes);
    setCliente(null);
    setBuscar('');
    setPiezas([piezaVacia(1)]);
    setNotas('');
    setErrores(SIN_ERRORES);
    setError(null);
    setNuevas(new Set());
  }, [abierto, clientes]);

  const sugeridas = useMemo(
    () =>
      buscar.trim()
        ? lista.filter((c) => algunoContiene([c.nombre, c.alias, c.telefono], buscar)).slice(0, 6)
        : [],
    [buscar, lista]
  );

  const campo = (clave: number, cual: keyof Omit<Pieza, 'clave'>) => (el: HTMLInputElement | null) => {
    if (el) campos.current.set(`${clave}:${cual}`, el);
  };

  const cambiar = (clave: number, cambios: Partial<Pieza>) => {
    setPiezas((prev) => prev.map((p) => (p.clave === clave ? { ...p, ...cambios } : p)));
    // Lo que se corrige deja de marcarse en rojo.
    setErrores((e) => {
      const de = e.piezas[clave];
      if (!de) return e;
      const limpio = { ...de };
      for (const k of Object.keys(cambios)) delete limpio[k as keyof typeof limpio];
      return { ...e, piezas: { ...e.piezas, [clave]: limpio } };
    });
  };

  const otraPieza = () => {
    const clave = Math.max(...piezas.map((x) => x.clave)) + 1;
    setPiezas((prev) => [...prev, piezaVacia(clave)]);
    // Agregar y escribir es un solo gesto: la pieza nueva nace con el foco.
    setNuevas((s) => new Set(s).add(clave));
  };

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
    elegirClienta(nueva);
  };

  const elegirClienta = (c: ClienteDetalle) => {
    setCliente(c);
    setBuscar('');
    setErrores((e) => ({ ...e, clienta: undefined }));
    setTimeout(() => campos.current.get(`${piezas[0].clave}:descripcion`)?.focus(), 0);
  };

  const sinPrecio = piezas.filter((p) => !p.precio.trim()).length;
  const total = piezas.reduce(
    (s, p) => s + (parsearACentavos(p.precio, { min: 0 }) ?? 0) * Math.max(1, Math.round(parsearDecimal(p.cantidad) ?? 1)),
    0
  );
  const hayCambios =
    cliente !== null || buscar.trim() !== '' || notas.trim() !== '' || piezas.some((p) => p.descripcion.trim() || p.precio.trim());

  const guardar = async () => {
    if (guardando) return;
    // Las mismas reglas de siempre; lo que cambia es dónde se dicen.
    const nuevos: Errores = { piezas: {} };
    if (!cliente) nuevos.clienta = 'Elegí quién lo pide.';
    for (const p of piezas) {
      const de: Errores['piezas'][number] = {};
      if (!p.descripcion.trim()) de.descripcion = 'Escribí qué quiere.';
      if (parsearDecimal(p.cantidad, { min: 1 }) === null) de.cantidad = 'La cantidad tiene que ser 1 o más.';
      if (p.precio.trim() && parsearACentavos(p.precio, { min: 0.01 }) === null) de.precio = 'El precio tiene que ser mayor a $0, o quedar vacío.';
      if (Object.keys(de).length > 0) nuevos.piezas[p.clave] = de;
    }
    const conError = piezas.find((p) => nuevos.piezas[p.clave]);
    if (nuevos.clienta || conError) {
      setErrores(nuevos);
      // El foco va al primer campo con problema, en el orden en que se ven.
      if (nuevos.clienta) buscarRef.current?.focus();
      else if (conError) {
        const cual = (['descripcion', 'cantidad', 'precio'] as const).find((k) => nuevos.piezas[conError.clave][k])!;
        campos.current.get(`${conError.clave}:${cual}`)?.focus();
      }
      return;
    }
    setGuardando(true);
    setError(null);
    const r = await window.api.ventas.crear({
      cliente_id: cliente!.id,
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

  const errorDe = (clave: number) => errores.piezas[clave] ?? {};
  const mensajeDe = (clave: number) => {
    const e = errorDe(clave);
    return e.descripcion ?? e.cantidad ?? e.precio;
  };

  return (
    <Dialogo
      abierto={abierto}
      titulo="Nuevo encargo"
      ancho="lg"
      hayCambios={hayCambios}
      onCerrar={onCerrar}
      onEnviar={guardar}
      pie={
        <>
          <span className="text-label text-texto-2 tabular">
            {sinPrecio === piezas.length
              ? 'Sin precio: se cotiza después'
              : `Total ${formatearMoneda(total, 'USD')}${sinPrecio > 0 ? ' · falta cotizar' : ''}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={guardar} disabled={guardando} className="min-w-[7rem]">
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </>
      }
    >
      {/* Quién lo pide */}
      <Field label="Clienta" error={errores.clienta}>
        {cliente ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-borde bg-superficie-2 px-3 py-2">
            <span className="text-body text-texto">{cliente.nombre}</span>
            <button
              type="button"
              onClick={() => setCliente(null)}
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
              onChange={(e) => {
                setBuscar(e.target.value);
                setErrores((x) => ({ ...x, clienta: undefined }));
              }}
              placeholder="Nombre o teléfono"
              aria-label="Clienta"
              autoFocus
              aria-invalid={Boolean(errores.clienta)}
            />
            {buscar.trim() && (
              <ul className="absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-borde bg-superficie shadow-xl animate-desplegable">
                {sugeridas.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => elegirClienta(c)}
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
        {piezas.map((p, i) => {
          const e = errorDe(p.clave);
          const rojo = 'border-danger-600 focus-visible:ring-danger-600';
          return (
            <div key={p.clave} className={cn(nuevas.has(p.clave) && 'animate-fila-nueva')}>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Input
                    ref={campo(p.clave, 'descripcion')}
                    value={p.descripcion}
                    onChange={(ev) => cambiar(p.clave, { descripcion: ev.target.value })}
                    placeholder="Bolso Coach negro, talla M…"
                    aria-label={`Qué quiere ${i + 1}`}
                    autoFocus={nuevas.has(p.clave)}
                    aria-invalid={Boolean(e.descripcion)}
                    className={cn(e.descripcion && rojo)}
                  />
                </div>
                <div className="w-16">
                  <Input
                    ref={campo(p.clave, 'cantidad')}
                    value={p.cantidad}
                    onChange={(ev) => cambiar(p.clave, { cantidad: ev.target.value })}
                    className={cn('text-right tabular', e.cantidad && rojo)}
                    aria-label={`Cantidad ${i + 1}`}
                    aria-invalid={Boolean(e.cantidad)}
                  />
                </div>
                <div className="w-28">
                  <Input
                    ref={campo(p.clave, 'precio')}
                    value={p.precio}
                    onChange={(ev) => cambiar(p.clave, { precio: ev.target.value })}
                    placeholder="Sin precio"
                    className={cn('text-right tabular', e.precio && rojo)}
                    aria-label={`Precio ${i + 1}`}
                    aria-invalid={Boolean(e.precio)}
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
              {mensajeDe(p.clave) && (
                <p className="mt-1 text-caption text-danger-700" role="alert">
                  {mensajeDe(p.clave)}
                </p>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={otraPieza}
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
    </Dialogo>
  );
};
