import { useEffect, useId, useRef, useState } from 'react';
import { Plus, Trash2, UserRound } from 'lucide-react';
import type { ClienteDetalle } from '@shared/types';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { parsearACentavos } from '@core/numeros';
import { enfocarPrimerError } from '../../../src/renderer/src/lib/enfocarPrimerError';
import { useDatosNegocio } from '../context/DataContext';
import { hoyISO, nuevoGrupoEvento } from '../lib/util';
import { haptics } from '../lib/haptics';
import { SIN_RED, useExigirConexion } from '../lib/useExigirConexion';
import { BottomSheet } from './BottomSheet';
import { SeleccionarClientaSheet } from './SeleccionarClientaSheet';
import { useSnackbar } from './Snackbar';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  onGuardado: (id: number) => void;
}

interface Pieza {
  clave: number;
  descripcion: string;
  cantidad: string;
  precio: string;
}

type ErroresPieza = Partial<Record<'descripcion' | 'cantidad' | 'precio', string>>;
const campo = 'mt-1 min-h-12 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto outline-none focus:border-acento disabled:opacity-60';

function piezaEscrita(pieza: Pieza): boolean {
  return pieza.descripcion.trim() !== '' || pieza.cantidad !== '1' || pieza.precio.trim() !== '';
}

export function NuevoEncargoSheet({ abierto, onCerrar, onGuardado }: Props) {
  const { marcarCambio } = useDatosNegocio();
  const { mostrar } = useSnackbar();
  const exigirConexion = useExigirConexion();
  const secuencia = useRef(1);
  const [clienta, setClienta] = useState<ClienteDetalle | null>(null);
  const [eligiendoClienta, setEligiendoClienta] = useState(false);
  const [piezas, setPiezas] = useState<Pieza[]>([{ clave: 0, descripcion: '', cantidad: '1', precio: '' }]);
  const [notas, setNotas] = useState('');
  const [errorClienta, setErrorClienta] = useState('');
  const [errores, setErrores] = useState<Record<number, ErroresPieza>>({});
  const [errorGuardar, setErrorGuardar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [quitar, setQuitar] = useState<number | null>(null);
  const ocupado = useRef(false);
  const formulario = useRef<HTMLDivElement>(null);
  const focoPendiente = useRef<number | null>(null);
  const id = useId();

  useEffect(() => {
    if (!abierto) return;
    setClienta(null);
    setEligiendoClienta(false);
    setPiezas([{ clave: secuencia.current++, descripcion: '', cantidad: '1', precio: '' }]);
    setNotas('');
    setErrorClienta('');
    setErrores({});
    setErrorGuardar('');
    setQuitar(null);
  }, [abierto]);

  useEffect(() => {
    const clave = focoPendiente.current;
    if (clave === null) return;
    focoPendiente.current = null;
    document.getElementById(`${id}-descripcion-${clave}`)?.focus();
  }, [piezas, id]);

  function cambiar(clave: number, propiedad: 'descripcion' | 'cantidad' | 'precio', valor: string) {
    setPiezas((actuales) => actuales.map((pieza) => pieza.clave === clave ? { ...pieza, [propiedad]: valor } : pieza));
    setErrores((actuales) => ({ ...actuales, [clave]: { ...actuales[clave], [propiedad]: undefined } }));
    setErrorGuardar('');
  }

  function agregar() {
    haptics.selection();
    const clave = secuencia.current++;
    focoPendiente.current = clave;
    setPiezas((actuales) => [...actuales, { clave, descripcion: '', cantidad: '1', precio: '' }]);
  }

  function quitarPieza(clave: number) {
    setPiezas((actuales) => actuales.filter((pieza) => pieza.clave !== clave));
    setErrores((actuales) => {
      const siguientes = { ...actuales };
      delete siguientes[clave];
      return siguientes;
    });
    setErrorGuardar('');
  }

  async function guardar() {
    if (ocupado.current) return;
    const fallas: Record<number, ErroresPieza> = {};
    let total = 0;
    const lineas = piezas.map((pieza) => {
      const error: ErroresPieza = {};
      const descripcion = pieza.descripcion.trim();
      if (!descripcion) error.descripcion = 'Escribí qué quiere la clienta.';
      const cantidad = /^\d+$/.test(pieza.cantidad.trim()) ? Number(pieza.cantidad.trim()) : NaN;
      if (!Number.isSafeInteger(cantidad) || cantidad <= 0) error.cantidad = 'Escribí una cantidad entera, mayor que cero.';
      const precio = pieza.precio.trim() === '' ? 0 : parsearACentavos(pieza.precio, { min: 0 });
      if (precio === null || !Number.isSafeInteger(precio) || precio < 0) {
        error.precio = 'Escribí un precio válido en dólares, o dejalo vacío.';
      } else if (!error.cantidad) {
        const subtotal = cantidad * precio;
        if (!Number.isSafeInteger(subtotal) || !Number.isSafeInteger(total + subtotal)) {
          error.precio = 'El importe es demasiado grande. Revisá el precio y la cantidad.';
        } else total += subtotal;
      }
      if (Object.keys(error).length > 0) fallas[pieza.clave] = error;
      return { descripcion, cantidad, precio_unitario_usd_cents: precio ?? 0 };
    });
    setErrorClienta(clienta ? '' : 'Elegí la clienta de este pedido.');
    setErrores(fallas);
    if (!clienta || Object.keys(fallas).length > 0) {
      haptics.error();
      enfocarPrimerError(formulario.current);
      return;
    }
    if (!exigirConexion(SIN_RED.encargo, setErrorGuardar)) return;
    haptics.impact('medium');
    ocupado.current = true;
    setGuardando(true);
    setErrorGuardar('');
    try {
      const ventaId = await VentasRepoFirestore.crear({
        tipo: 'ENCARGO', cliente_id: clienta.id, fecha: hoyISO(),
        lineas, notas: notas.trim() || undefined,
      }, nuevoGrupoEvento());
      marcarCambio();
      mostrar('Pedido anotado', 'success');
      onGuardado(ventaId);
    } catch (error) {
      setErrorGuardar(error instanceof Error ? error.message : 'No se pudo guardar el pedido. Intentá otra vez.');
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  const hayCambios = clienta !== null || notas.trim() !== '' || piezas.some(piezaEscrita) || piezas.length > 1;
  const bloqueado = guardando || quitar !== null || eligiendoClienta;

  return <>
    <BottomSheet abierto={abierto} onCerrar={onCerrar} titulo="Anotar un pedido"
      subtitulo="Guardá lo que te pidió; podés cotizarlo después."
      hayCambios={hayCambios} ocupado={bloqueado}
      footer={<button type="button" disabled={bloqueado} onClick={() => void guardar()}
        className="min-h-12 w-full rounded-xl bg-acento px-4 py-3 text-base font-bold text-acento-texto disabled:opacity-60">
        {guardando ? 'Guardando…' : 'Guardar pedido'}
      </button>}>
      <div ref={formulario} className="flex flex-col gap-4 py-1">
        <div>
          <span className="block text-sm font-bold">Clienta</span>
          <button type="button" disabled={bloqueado} aria-label="Elegir clienta"
            aria-invalid={Boolean(errorClienta)} aria-describedby={errorClienta ? `${id}-error-clienta` : undefined}
            onClick={() => { haptics.selection(); setEligiendoClienta(true); }}
            className="mt-1 flex min-h-12 w-full items-center gap-3 rounded-xl border border-borde bg-superficie-2 px-3 py-2 text-left text-base font-semibold disabled:opacity-60">
            <UserRound size={18} className="shrink-0 text-texto-2" />{clienta?.nombre || 'Elegir clienta'}
          </button>
          {errorClienta && <p id={`${id}-error-clienta`} className="mt-1 text-sm text-peligro-fuerte">{errorClienta}</p>}
        </div>

        <div className="flex flex-col gap-3">
          {piezas.map((pieza, indice) => {
            const error = errores[pieza.clave] ?? {};
            return <fieldset key={pieza.clave} disabled={bloqueado} className="min-w-0 rounded-xl border border-borde bg-superficie-2 px-3 pb-3">
              <legend className="px-1 text-sm font-bold">Pieza {indice + 1}</legend>
              <div className="mt-1">
                <label htmlFor={`${id}-descripcion-${pieza.clave}`} className="block text-sm font-semibold">Qué quiere</label>
                <input id={`${id}-descripcion-${pieza.clave}`} value={pieza.descripcion} autoComplete="off"
                  placeholder="Perfume, bolso, talla o tono…" aria-invalid={Boolean(error.descripcion)}
                  aria-describedby={error.descripcion ? `${id}-error-descripcion-${pieza.clave}` : undefined}
                  onChange={(e) => cambiar(pieza.clave, 'descripcion', e.target.value)} className={campo} />
                {error.descripcion && <p id={`${id}-error-descripcion-${pieza.clave}`} className="mt-1 text-sm text-peligro-fuerte">{error.descripcion}</p>}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><label htmlFor={`${id}-cantidad-${pieza.clave}`} className="block text-sm font-semibold">Cantidad</label>
                  <input id={`${id}-cantidad-${pieza.clave}`} inputMode="numeric" value={pieza.cantidad} autoComplete="off"
                    aria-invalid={Boolean(error.cantidad)} aria-describedby={error.cantidad ? `${id}-error-cantidad-${pieza.clave}` : undefined}
                    onChange={(e) => cambiar(pieza.clave, 'cantidad', e.target.value)} className={campo} />
                  {error.cantidad && <p id={`${id}-error-cantidad-${pieza.clave}`} className="mt-1 text-sm text-peligro-fuerte">{error.cantidad}</p>}
                </div>
                <div><label htmlFor={`${id}-precio-${pieza.clave}`} className="block text-sm font-semibold">Precio ($)</label>
                  <input id={`${id}-precio-${pieza.clave}`} inputMode="decimal" value={pieza.precio} autoComplete="off" placeholder="Opcional"
                    aria-invalid={Boolean(error.precio)} aria-describedby={`${id}-ayuda-precio-${pieza.clave}`}
                    onChange={(e) => cambiar(pieza.clave, 'precio', e.target.value)} className={campo} />
                  <p id={`${id}-ayuda-precio-${pieza.clave}`} className={`mt-1 text-sm ${error.precio ? 'text-peligro-fuerte' : 'text-texto-2'}`}>
                    {error.precio || 'Por unidad. Podés dejarlo vacío.'}
                  </p>
                </div>
              </div>
              {piezas.length > 1 && <button type="button" onClick={() => {
                haptics.selection();
                if (piezaEscrita(pieza)) setQuitar(pieza.clave);
                else quitarPieza(pieza.clave);
              }} className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold text-peligro-fuerte">
                <Trash2 size={16} />Quitar pieza
              </button>}
            </fieldset>;
          })}
          <button type="button" disabled={bloqueado} onClick={agregar}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-borde bg-superficie text-sm font-bold disabled:opacity-60">
            <Plus size={18} />Agregar otra pieza
          </button>
        </div>

        <div><label htmlFor={`${id}-notas`} className="block text-sm font-bold">Notas</label>
          <textarea id={`${id}-notas`} disabled={bloqueado} rows={2} value={notas} placeholder="Opcionales"
            onChange={(e) => { setNotas(e.target.value); setErrorGuardar(''); }} className={campo} />
        </div>
        <p className="text-sm text-texto-2">Anotar el pedido no cobra nada ni cambia lo que tenés en bodega.</p>
        {errorGuardar && <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">{errorGuardar}</p>}
      </div>
    </BottomSheet>
    <SeleccionarClientaSheet abierto={abierto && eligiendoClienta} onCerrar={() => setEligiendoClienta(false)}
      onSeleccionar={(elegida) => { setClienta(elegida); setErrorClienta(''); setEligiendoClienta(false); }} />
    <BottomSheet abierto={abierto && quitar !== null} rol="alertdialog" titulo="¿Quitar esta pieza?"
      onCerrar={() => setQuitar(null)} footer={<div className="grid grid-cols-2 gap-2">
        <button type="button" autoFocus onClick={() => { haptics.selection(); setQuitar(null); }}
          className="min-h-12 rounded-xl border border-borde bg-superficie-2 px-3 py-2 text-sm font-bold text-texto">
          No, conservar
        </button>
        <button type="button" onClick={() => {
          haptics.selection();
          if (quitar !== null) quitarPieza(quitar);
          setQuitar(null);
        }} className="min-h-12 rounded-xl bg-peligro px-3 py-2 text-sm font-bold text-peligro-texto">
          Sí, quitar pieza
        </button>
      </div>}>
      <p className="py-2 text-sm text-texto-2">Lo que escribiste para esta pieza no se guardó. Las demás quedan como están.</p>
    </BottomSheet>
  </>;
}
