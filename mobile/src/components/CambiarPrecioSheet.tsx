import { useEffect, useId, useRef, useState } from 'react';
import type { ProductoConStock } from '@shared/types';
import { ProductosRepoFirestore } from '@repos/productos.repo';
import { parsearACentavos } from '@core/numeros';
import { formatearMoneda } from '@core/moneda';
import { calcularPrecio } from '@core/precios';
import { enfocarPrimerError } from '../../../src/renderer/src/lib/enfocarPrimerError';
import { useDatosNegocio } from '../context/DataContext';
import { nuevoGrupoEvento } from '../lib/util';
import { haptics } from '../lib/haptics';
import { SIN_RED, useExigirConexion } from '../lib/useExigirConexion';
import { BottomSheet } from './BottomSheet';
import { useSnackbar } from './Snackbar';

export function CambiarPrecioSheet({ producto, onCerrar }: {
  producto: ProductoConStock | null;
  onCerrar: () => void;
}) {
  const { recargarProductos, marcarCambio } = useDatosNegocio();
  const { mostrarDeshacer } = useSnackbar();
  const exigirConexion = useExigirConexion();
  const [precio, setPrecio] = useState('');
  const [inicial, setInicial] = useState(0);
  const [errorPrecio, setErrorPrecio] = useState('');
  const [errorGuardar, setErrorGuardar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);
  const formulario = useRef<HTMLDivElement>(null);
  const ultimo = useRef(producto);
  const id = useId();
  const abierta = producto !== null;
  if (producto) ultimo.current = producto;

  useEffect(() => {
    if (!producto) return;
    setInicial(producto.precio_venta_usd_cents);
    setPrecio((producto.precio_venta_usd_cents / 100).toFixed(2));
    setErrorPrecio('');
    setErrorGuardar('');
    // La referencia puede cambiar al refrescar; el texto pertenece a esta
    // edición y se inicia al abrir, no en medio de lo que ella escribió.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producto?.id, abierta]);

  const p = producto ?? ultimo.current;
  const centavos = parsearACentavos(precio, { min: 0.01 });
  const nuevo = centavos !== null && Number.isSafeInteger(centavos) && centavos > 0 ? centavos : null;
  const hayCambios = nuevo === null ? precio !== (inicial / 100).toFixed(2) : nuevo !== inicial;
  const calculo = p && nuevo !== null ? calcularPrecio({
    modo: 'MANUAL', precio_manual_usd_cents: nuevo,
    costo_unitario_usd_cents: p.costo_unitario_usd_cents,
    paso_redondeo_usd_cents: 1,
  }) : null;

  async function guardar() {
    if (!producto || ocupado.current) return;
    if (nuevo === null) {
      haptics.error();
      setErrorPrecio('Escribí un precio válido en dólares, mayor que cero.');
      enfocarPrimerError(formulario.current);
      return;
    }
    if (nuevo === inicial) return;
    if (!exigirConexion(SIN_RED.inventario, setErrorGuardar)) return;
    haptics.impact('medium');
    ocupado.current = true;
    setGuardando(true);
    setErrorGuardar('');
    try {
      const grupo = nuevoGrupoEvento();
      await ProductosRepoFirestore.actualizar({
        id: producto.id, modo_precio: 'MANUAL', precio_manual_usd_cents: nuevo,
      }, grupo);
      await recargarProductos(true);
      marcarCambio();
      mostrarDeshacer('Precio guardado', grupo, () => {
        void recargarProductos(true);
        marcarCambio();
      });
      onCerrar();
    } catch (error) {
      setErrorGuardar(error instanceof Error ? error.message : 'No se pudo guardar el precio. Intentá otra vez.');
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  if (!p) return null;
  return <BottomSheet abierto={abierta} titulo="Cambiar precio" subtitulo={p.nombre}
    onCerrar={onCerrar} hayCambios={hayCambios} ocupado={guardando}
    footer={<button type="button" onClick={() => void guardar()} disabled={guardando || !hayCambios}
      className="min-h-12 w-full rounded-xl bg-acento px-4 py-3 text-base font-bold text-acento-texto disabled:opacity-60">
      {guardando ? 'Guardando…' : 'Guardar precio'}
    </button>}>
    <div ref={formulario} className="flex flex-col gap-4 py-2">
      <dl className="grid grid-cols-2 gap-3 rounded-xl border border-borde bg-superficie-2 p-4">
        <div><dt className="text-sm font-semibold text-texto-2">Costo por unidad</dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-texto">{formatearMoneda(p.costo_unitario_usd_cents, 'USD')}</dd>
        </div>
        <div><dt className="text-sm font-semibold text-texto-2">Precio actual</dt>
          <dd className="mt-1 text-xl font-bold tabular-nums text-texto">{formatearMoneda(p.precio_venta_usd_cents, 'USD')}</dd>
        </div>
      </dl>
      <p className="text-sm text-texto-2">El costo incluye lo que pagaste, el impuesto y el flete.</p>
      <div>
        <label className="block text-base font-semibold text-texto" htmlFor={`${id}-precio`}>Precio nuevo ($)</label>
        <input id={`${id}-precio`} inputMode="decimal" autoComplete="off" value={precio}
          disabled={guardando} aria-invalid={Boolean(errorPrecio)} aria-describedby={`${id}-ayuda`}
          onChange={e => { setPrecio(e.target.value); setErrorPrecio(''); setErrorGuardar(''); }}
          className="mt-1 min-h-12 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto outline-none focus:border-acento" />
        <p id={`${id}-ayuda`} className={`mt-1 text-sm ${errorPrecio ? 'text-peligro-fuerte' : 'text-texto-2'}`}>
          {errorPrecio || 'Este precio queda tal como lo escribís.'}
        </p>
      </div>
      {calculo && <div className={`rounded-xl p-4 ${calculo.bajo_costo ? 'bg-peligro-suave text-peligro-fuerte' : 'bg-acento-suave text-acento-fuerte'}`}>
        <p className="text-base font-bold">
          {calculo.bajo_costo ? `Perdés ${formatearMoneda(-calculo.ganancia_usd_cents, 'USD')} por unidad.`
            : `Ganancia por unidad: ${formatearMoneda(calculo.ganancia_usd_cents, 'USD')}`}
        </p>
        {calculo.bajo_costo && <p className="mt-1 text-sm">El precio no cubre el costo. Podés guardarlo si así lo decidiste.</p>}
      </div>}
      {errorGuardar && <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">{errorGuardar}</p>}
    </div>
  </BottomSheet>;
}
