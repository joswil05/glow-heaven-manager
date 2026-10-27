import { useEffect, useId, useRef, useState } from 'react';
import type { Cliente } from '@shared/types';
import { ClientesRepoFirestore } from '@repos/clientes.repo';
import { formatearTelefono } from '@core/formatos';
import { formatearNombreEntidad } from '../../../src/shared/formatoTexto';
import { BottomSheet } from './BottomSheet';
import { useSnackbar } from './Snackbar';
import { haptics } from '../lib/haptics';
import { nuevoGrupoEvento } from '../lib/util';
import { SIN_RED, useExigirConexion } from '../lib/useExigirConexion';

const campo =
  'mt-1 min-h-12 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto outline-none focus:border-acento aria-[invalid=true]:border-peligro';

/**
 * La ficha de una clienta para crearla o editarla (CLI-1 y CLI-2), con los
 * mismos campos y el mismo formato que Windows (`ClientesView`): nombre,
 * alias, teléfono, ciudad, dirección y notas.
 */
export function ClientaFormSheet({
  abierto,
  clienta,
  onCerrar,
  onGuardada,
}: {
  abierto: boolean;
  /** Con una clienta se edita; sin, se crea. */
  clienta?: Cliente | null;
  onCerrar: () => void;
  onGuardada: (id: number) => void;
}) {
  const { mostrar } = useSnackbar();
  const exigirConexion = useExigirConexion();
  const id = useId();
  const [nombre, setNombre] = useState('');
  const [alias, setAlias] = useState('');
  const [telefono, setTelefono] = useState('');
  const [ciudad, setCiudad] = useState('');
  const [direccion, setDireccion] = useState('');
  const [notas, setNotas] = useState('');
  const [errores, setErrores] = useState<{ nombre?: string; telefono?: string }>({});
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);

  useEffect(() => {
    if (!abierto) return;
    setNombre(clienta?.nombre ?? '');
    setAlias(clienta?.alias ?? '');
    setTelefono(clienta?.telefono ?? '');
    setCiudad(clienta?.ciudad ?? '');
    setDireccion(clienta?.direccion ?? '');
    setNotas(clienta?.notas ?? '');
    setErrores({});
    setError('');
  }, [abierto, clienta]);

  const original = [clienta?.nombre, clienta?.alias, clienta?.telefono, clienta?.ciudad, clienta?.direccion, clienta?.notas]
    .map((v) => v ?? '')
    .join('|');
  const hayCambios = [nombre, alias, telefono, ciudad, direccion, notas].join('|') !== original;

  async function guardar() {
    if (ocupado.current) return;
    const fallas: typeof errores = {};
    if (!nombre.trim()) fallas.nombre = 'Escribí el nombre de la clienta.';
    try {
      formatearTelefono(telefono);
    } catch (e) {
      fallas.telefono = e instanceof Error ? e.message : 'Revisá el teléfono.';
    }
    setErrores(fallas);
    if (Object.keys(fallas).length > 0) {
      haptics.error();
      return;
    }
    if (!exigirConexion(SIN_RED.clienta, setError)) return;
    haptics.impact('medium');
    ocupado.current = true;
    setGuardando(true);
    setError('');
    try {
      const guardada = await ClientesRepoFirestore.guardar(
        {
          id: clienta?.id,
          nombre: formatearNombreEntidad(nombre),
          alias: alias.trim() ? formatearNombreEntidad(alias) : undefined,
          telefono: telefono.trim() || undefined,
          direccion: direccion.trim() || undefined,
          ciudad: ciudad.trim() ? formatearNombreEntidad(ciudad) : undefined,
          notas: notas.trim() || undefined,
        },
        nuevoGrupoEvento()
      );
      mostrar(clienta ? 'Ficha guardada' : 'Clienta agregada', 'success');
      onGuardada(guardada);
      onCerrar();
    } catch (e) {
      haptics.error();
      setError(e instanceof Error ? e.message : 'No se pudo guardar la clienta.');
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  return (
    <BottomSheet
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={clienta ? 'Editar clienta' : 'Clienta nueva'}
      hayCambios={hayCambios}
      ocupado={guardando}
      footer={(cerrar) => (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={guardando}
            onClick={() => {
              haptics.selection();
              cerrar();
            }}
            className="min-h-12 flex-1 rounded-xl border border-borde bg-superficie-2 px-3 text-base font-semibold text-texto-2 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => void guardar()}
            className="min-h-12 flex-1 rounded-xl bg-acento px-3 text-base font-bold text-acento-texto disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
    >
      <div className="flex flex-col gap-3 pb-2">
        <label htmlFor={`${id}-nombre`} className="block text-sm font-bold">
          Nombre
          <input
            id={`${id}-nombre`}
            autoComplete="name"
            value={nombre}
            aria-invalid={Boolean(errores.nombre)}
            onChange={(e) => {
              setNombre(e.target.value);
              setErrores((v) => ({ ...v, nombre: undefined }));
            }}
            className={campo}
          />
        </label>
        {errores.nombre && <p className="-mt-2 text-sm text-peligro-fuerte">{errores.nombre}</p>}
        <label htmlFor={`${id}-telefono`} className="block text-sm font-bold">
          Teléfono
          <input
            id={`${id}-telefono`}
            inputMode="tel"
            autoComplete="tel"
            placeholder="8888 1234"
            value={telefono}
            aria-invalid={Boolean(errores.telefono)}
            onChange={(e) => {
              setTelefono(e.target.value);
              setErrores((v) => ({ ...v, telefono: undefined }));
            }}
            className={campo}
          />
        </label>
        {errores.telefono && <p className="-mt-2 text-sm text-peligro-fuerte">{errores.telefono}</p>}
        <label htmlFor={`${id}-alias`} className="block text-sm font-bold">
          Alias <span className="font-normal text-texto-3">(opcional)</span>
          <input id={`${id}-alias`} value={alias} onChange={(e) => setAlias(e.target.value)} className={campo} />
        </label>
        <label htmlFor={`${id}-ciudad`} className="block text-sm font-bold">
          Ciudad <span className="font-normal text-texto-3">(opcional)</span>
          <input id={`${id}-ciudad`} value={ciudad} onChange={(e) => setCiudad(e.target.value)} className={campo} />
        </label>
        <label htmlFor={`${id}-direccion`} className="block text-sm font-bold">
          Dirección <span className="font-normal text-texto-3">(opcional)</span>
          <input id={`${id}-direccion`} value={direccion} onChange={(e) => setDireccion(e.target.value)} className={campo} />
        </label>
        <label htmlFor={`${id}-notas`} className="block text-sm font-bold">
          Notas <span className="font-normal text-texto-3">(opcional)</span>
          <textarea id={`${id}-notas`} rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className={campo} />
        </label>
        {error && (
          <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">
            {error}
          </p>
        )}
      </div>
    </BottomSheet>
  );
}
