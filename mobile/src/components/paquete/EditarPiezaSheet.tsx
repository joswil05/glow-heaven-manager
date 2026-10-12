import { useEffect, useRef, useState } from 'react';
import type { LineaCompraInput } from '@repos/compras.repo';
import { BottomSheet } from '../BottomSheet';
import { CamposPieza } from './CamposPieza';
import { enfocarError, principal } from './clases';
import { haptics } from '../../lib/haptics';
import { leerPieza, textosDeLinea, type ErroresPieza, type TextosPieza } from '../../lib/paquete-movil';

interface Props {
  linea: LineaCompraInput | null;
  /** "Blusa · M": el nombre con su talla. */
  nombre: string;
  /** "Encargo de Ana", "Tenés 3"… */
  detalle?: string;
  /** Corrigiendo un paquete que ya entró: la cantidad y el producto no cambian. */
  bloqueada: boolean;
  taxBp: number;
  onCerrar: () => void;
  /** Guarda la línea cambiada. Si falla, lanza y la hoja lo dice. */
  onGuardar: (linea: LineaCompraInput) => Promise<void>;
  /** Abre la confirmación de quitarla. Sin esto, no se puede quitar. */
  onQuitar?: () => void;
}

/**
 * Cambiar una pieza que ya está en el paquete: cuántas vinieron, cómo, lo que
 * costó, el impuesto y el peso. Es lo que en la PC se edita en la misma fila.
 * Sin tocar el precio, la línea conserva el que tenía (`leerPieza`).
 */
export function EditarPiezaSheet({ linea, nombre, detalle, bloqueada, taxBp, onCerrar, onGuardar, onQuitar }: Props) {
  const [textos, setTextos] = useState<TextosPieza | null>(null);
  const [inicial, setInicial] = useState('');
  const [errores, setErrores] = useState<ErroresPieza>({});
  const [errorGuardar, setErrorGuardar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);
  const formulario = useRef<HTMLDivElement>(null);
  const ultima = useRef(linea);
  if (linea) ultima.current = linea;

  useEffect(() => {
    if (!linea) return;
    const t = textosDeLinea(linea, nombre);
    setTextos(t); setInicial(JSON.stringify(t)); setErrores({}); setErrorGuardar('');
    // Se arma al abrir: un refresco de la lista no pisa lo que ella escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linea?.id, linea?.venta_linea_id]);

  const hayCambios = textos !== null && JSON.stringify(textos) !== inicial;

  async function guardar() {
    const l = ultima.current;
    if (ocupado.current || !l || !textos) return;
    if (!hayCambios) { haptics.selection(); onCerrar(); return; }
    const r = leerPieza(textos, l, { original: l, cantidadFija: bloqueada });
    setErrores(r.errores);
    if (r.lineas.length !== 1) { haptics.error(); enfocarError(formulario.current); return; }
    haptics.impact('medium');
    ocupado.current = true; setGuardando(true); setErrorGuardar('');
    try {
      await onGuardar(r.lineas[0]);
      onCerrar();
    } catch (e) {
      setErrorGuardar(e instanceof Error ? e.message : 'No se pudo guardar el cambio. Intentá otra vez.');
    } finally {
      ocupado.current = false; setGuardando(false);
    }
  }

  const l = ultima.current;
  return <BottomSheet abierto={linea !== null} onCerrar={() => { if (!ocupado.current) onCerrar(); }} hayCambios={hayCambios} ocupado={guardando}
    titulo={nombre} subtitulo={detalle}
    footer={<div className="space-y-2">
      <button type="button" className={`${principal} w-full`} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
      {onQuitar && !bloqueada && <button type="button" disabled={guardando} onClick={() => { haptics.selection(); onQuitar(); }}
        className="min-h-11 w-full rounded-xl text-base font-semibold text-peligro-fuerte">Quitar del paquete</button>}
    </div>}>
    <div ref={formulario} className="space-y-4 py-1">
      {bloqueada && <p className="rounded-xl bg-alerta-suave p-3 text-sm text-alerta-fuerte">Esta pieza ya entró al inventario: sólo se corrige lo que costó, el impuesto o el peso. La diferencia cambia el costo de lo que sigue en bodega.</p>}
      {errorGuardar && <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">{errorGuardar}</p>}
      {textos && l && <CamposPieza id="editar-pieza" textos={textos} onCambiar={setTextos} errores={errores}
        onCorregido={(c) => setErrores((e) => ({ ...e, [c]: undefined }))} deshabilitado={guardando}
        permitirPack={l.destino === 'INVENTARIO' && !bloqueada} cantidadFija={bloqueada} taxBp={taxBp} />}
    </div>
  </BottomSheet>;
}
