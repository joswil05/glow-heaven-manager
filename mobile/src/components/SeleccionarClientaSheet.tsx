import { useEffect, useId, useRef, useState } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { ClientesRepoFirestore } from '@repos/clientes.repo';
import type { ClienteDetalle } from '@shared/types';
import { formatearTelefono } from '@core/formatos';
import { enfocarPrimerError } from '../../../src/renderer/src/lib/enfocarPrimerError';
import { nuevoGrupoEvento } from '../lib/util';
import { haptics } from '../lib/haptics';
import { BottomSheet } from './BottomSheet';
import { useSnackbar } from './Snackbar';

interface Props {
  abierto: boolean;
  onCerrar: () => void;
  onSeleccionar: (clienta: ClienteDetalle) => void;
}

const campo = 'mt-1 min-h-12 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto outline-none focus:border-acento';

/** Un selector para Vender y Encargos: guardar la ficha es una acción propia. */
export function SeleccionarClientaSheet({ abierto, onCerrar, onSeleccionar }: Props) {
  const { mostrar } = useSnackbar();
  const [query, setQuery] = useState('');
  const [clientas, setClientas] = useState<ClienteDetalle[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const [reintento, setReintento] = useState(0);
  const [crear, setCrear] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [errores, setErrores] = useState<{ nombre?: string; telefono?: string }>({});
  const [errorGuardar, setErrorGuardar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [idCreado, setIdCreado] = useState<number | null>(null);
  const ocupado = useRef(false);
  const idGuardado = useRef<number | null>(null);
  const sigueAbierto = useRef(abierto);
  sigueAbierto.current = abierto;
  const formulario = useRef<HTMLDivElement>(null);
  const id = useId();
  const hayCambios = crear && idCreado === null && (nombre.trim() !== '' || telefono.trim() !== '');

  useEffect(() => {
    if (!abierto) return;
    setQuery('');
    setCrear(false);
    setNombre('');
    setTelefono('');
    setErrores({});
    setErrorGuardar('');
    setIdCreado(null);
    idGuardado.current = null;
  }, [abierto]);

  useEffect(() => {
    if (!abierto || crear) return;
    let vigente = true;
    setCargando(true);
    setClientas([]);
    setErrorBusqueda('');
    ClientesRepoFirestore.listar(query.trim() || undefined).then((lista) => {
      if (vigente) setClientas(lista.slice(0, 25));
    }).catch(() => {
      if (vigente) setErrorBusqueda('No se pudo buscar. Revisá la conexión.');
    }).finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [abierto, crear, query, reintento]);

  function seleccionar(clienta: ClienteDetalle) {
    haptics.selection();
    onSeleccionar(clienta);
    mostrar(`Clienta seleccionada: ${clienta.nombre}`, 'info');
  }

  async function guardar() {
    if (ocupado.current) return;
    const fallas: typeof errores = {};
    if (!nombre.trim()) fallas.nombre = 'Escribí el nombre de la clienta.';
    try { formatearTelefono(telefono); }
    catch (error) { fallas.telefono = error instanceof Error ? error.message : 'Revisá el teléfono.'; }
    setErrores(fallas);
    if (Object.keys(fallas).length > 0) {
      haptics.error();
      enfocarPrimerError(formulario.current);
      return;
    }
    haptics.impact('medium');
    ocupado.current = true;
    setGuardando(true);
    setErrorGuardar('');
    try {
      // Si guardar funcionó y leer la ficha falló, reintentar no crea otra.
      if (idGuardado.current === null) {
        idGuardado.current = await ClientesRepoFirestore.guardar({
          nombre: nombre.trim(), telefono: telefono.trim() || undefined,
        }, nuevoGrupoEvento());
        setIdCreado(idGuardado.current);
      }
      const clienta = await ClientesRepoFirestore.getById(idGuardado.current);
      if (!clienta) throw new Error('La clienta se guardó, pero no se pudo cargar su ficha. Probá de nuevo.');
      if (sigueAbierto.current) {
        onSeleccionar(clienta);
        mostrar(`Clienta "${clienta.nombre}" creada y seleccionada`, 'success');
      }
    } catch (error) {
      if (sigueAbierto.current) setErrorGuardar(idGuardado.current !== null
        ? 'La clienta se guardó. No se pudo cargar su ficha; probá de nuevo.'
        : error instanceof Error ? error.message : 'No se pudo guardar la clienta. Probá de nuevo.');
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  function cerrarAlta() {
    setCrear(false);
    setNombre('');
    setTelefono('');
    setErrores({});
    setErrorGuardar('');
    setIdCreado(null);
    idGuardado.current = null;
  }

  return <>
    <BottomSheet abierto={abierto && !crear} onCerrar={onCerrar} titulo="Elegí la clienta">
      <div className="flex flex-col gap-3 pb-2">
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-4 text-texto-3" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar clienta" placeholder="Buscar por nombre o teléfono"
          className={`${campo} pl-10`} />
      </div>
      <button type="button" onClick={() => { haptics.selection(); setCrear(true); }}
        className="min-h-12 rounded-xl border border-acento-suave bg-acento-suave px-3 text-sm font-bold text-acento-fuerte">
        <UserPlus size={17} className="mr-2 inline" />+ Crear nueva clienta ahora
      </button>
      {cargando ? <p role="status" className="py-3 text-sm text-texto-2">Buscando clientas…</p>
        : errorBusqueda ? <div role="alert" className="text-sm text-peligro-fuerte">
          <p>{errorBusqueda}</p>
          <button type="button" onClick={() => { haptics.selection(); setReintento((n) => n + 1); }}
            className="min-h-11 font-bold">Reintentar</button>
        </div> : clientas.length === 0 ? <p className="py-3 text-sm text-texto-2">No se encontró ninguna clienta.</p>
          : <div className="flex max-h-72 flex-col divide-y divide-borde overflow-y-auto">
            {clientas.map((clienta) => <button key={clienta.id} type="button" onClick={() => seleccionar(clienta)}
              className="flex min-h-12 items-center justify-between gap-3 rounded-xl px-2 py-3 text-left">
              <span><span className="block text-sm font-bold">{clienta.nombre}</span>
                {clienta.telefono && <span className="block text-xs text-texto-2">{clienta.telefono}</span>}
              </span><span className="text-xs font-bold text-acento-fuerte">Elegir</span>
            </button>)}
          </div>}
      </div>
    </BottomSheet>
    <BottomSheet abierto={abierto && crear} onCerrar={cerrarAlta} titulo="Clienta nueva"
      hayCambios={hayCambios} ocupado={guardando}
      footer={(cerrar) => <div className="flex gap-2">
        <button type="button" disabled={guardando} onClick={() => { haptics.selection(); cerrar(); }}
          className="min-h-12 flex-1 rounded-xl border border-borde bg-superficie-2 px-3 text-base font-semibold text-texto-2 disabled:opacity-60">Cancelar</button>
        <button type="button" disabled={guardando} onClick={() => void guardar()}
          className="min-h-12 flex-1 rounded-xl bg-acento px-3 text-base font-bold text-acento-texto disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar y elegir'}
        </button>
      </div>}>
    <div ref={formulario} className="flex flex-col gap-3 pb-2">
      <div><label htmlFor={`${id}-nombre`} className="block text-sm font-bold">Nombre</label>
        <input id={`${id}-nombre`} autoFocus autoComplete="name" placeholder="Carmen Rodríguez" value={nombre}
          disabled={guardando || idCreado !== null} aria-invalid={Boolean(errores.nombre)} aria-describedby={errores.nombre ? `${id}-error-nombre` : undefined}
          onChange={(e) => { setNombre(e.target.value); setErrores((v) => ({ ...v, nombre: undefined })); setErrorGuardar(''); }} className={campo} />
        {errores.nombre && <p id={`${id}-error-nombre`} className="mt-1 text-sm text-peligro-fuerte">{errores.nombre}</p>}
      </div>
      <div><label htmlFor={`${id}-telefono`} className="block text-sm font-bold">Teléfono</label>
        <input id={`${id}-telefono`} inputMode="tel" autoComplete="tel" placeholder="8888 1234" value={telefono}
          disabled={guardando || idCreado !== null} aria-invalid={Boolean(errores.telefono)} aria-describedby={`${id}-ayuda-telefono`}
          onChange={(e) => { setTelefono(e.target.value); setErrores((v) => ({ ...v, telefono: undefined })); setErrorGuardar(''); }} className={campo} />
        <p id={`${id}-ayuda-telefono`} className={`mt-1 text-sm ${errores.telefono ? 'text-peligro-fuerte' : 'text-texto-2'}`}>{errores.telefono || 'Opcional.'}</p>
      </div>
      {errorGuardar && <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">{errorGuardar}</p>}
    </div>
    </BottomSheet>
  </>;
}
