import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ClipboardList } from 'lucide-react';
import type { Venta, VentaCompleta } from '@shared/types';
import type { LineaCompraInput } from '@repos/compras.repo';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { formatearMoneda } from '@core/moneda';
import { BottomSheet } from '../BottomSheet';
import { campo, casilla, enfocarError, principal } from './clases';
import { haptics } from '../../lib/haptics';
import {
  TITULO_GRUPO,
  claveDePieza,
  grupoDeEncargo,
  leerPiezasDeEncargo,
  piezasQuePuedenVenir,
  textoSinPaquete,
} from '../../lib/paquete-movil';

/** Qué se abrió: la lista de encargos, o directo las piezas compradas que esperan. */
export type ModoEncargos = 'lista' | 'esperando';

interface Props {
  modo: ModoEncargos | null;
  /** Los encargos con piezas que todavía no vienen en ningún paquete. */
  encargos: Venta[];
  /** Lo que ya tiene el paquete: una pieza no se agrega dos veces. */
  lineas: LineaCompraInput[];
  compraId?: number;
  taxBp: number;
  onCerrar: () => void;
  onAgregar: (lineas: LineaCompraInput[]) => Promise<void>;
}

interface Fila {
  venta: VentaCompleta;
  pieza: VentaCompleta['lineas'][number];
  elegida: boolean;
  precio: string;
  pagoImpuesto: boolean;
}

/**
 * Las piezas de encargo que trae el paquete, como "Agregar encargo" y
 * "N piezas compradas esperan paquete · Agregarlas" en la PC. Cada pieza pide
 * lo que costó en la tienda: con eso el encargo queda con su costo real al
 * recibir el paquete.
 */
export function EncargosPaqueteSheet({ modo, encargos, lineas, compraId, taxBp, onCerrar, onAgregar }: Props) {
  const [elegido, setElegido] = useState<number | null>(null);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorGuardar, setErrorGuardar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);
  const formulario = useRef<HTMLDivElement>(null);
  const lineasRef = useRef(lineas);
  lineasRef.current = lineas;

  // Las piezas se leen al elegir el encargo (o, para las que esperan, de
  // todos los que tienen alguna comprada): la lista sólo trae el resumen. Se
  // leen al abrir y no cada vez que cambia el paquete: agregarlas no vacía la
  // hoja mientras baja.
  useEffect(() => {
    const ids = modo === 'esperando'
      ? encargos.filter((v) => (v.piezas?.esperan_paquete ?? 0) > 0 && !lineasRef.current.some((l) => l.venta_id === v.id)).map((v) => v.id)
      : elegido !== null ? [elegido] : [];
    if (!modo || ids.length === 0) { setFilas([]); return; }
    let vivo = true;
    setCargando(true); setErrorCarga(''); setErrores({});
    Promise.all(ids.map((id) => VentasRepoFirestore.getById(id)))
      .then((ventas) => {
        if (!vivo) return;
        setFilas(ventas.filter((v): v is VentaCompleta => Boolean(v)).flatMap((venta) =>
          piezasQuePuedenVenir(venta, lineasRef.current, compraId, modo === 'esperando')
            .map((pieza) => ({ venta, pieza, elegida: true, precio: '', pagoImpuesto: true }))));
      })
      .catch(() => { if (vivo) setErrorCarga('No se pudieron leer las piezas del encargo.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, elegido, compraId]);

  const elegidas = filas.filter((f) => f.elegida);
  const hayCambios = filas.some((f) => f.precio.trim() !== '' || !f.elegida || !f.pagoImpuesto);
  const cambiar = (i: number, parcial: Partial<Fila>) => {
    setFilas((actual) => actual.map((f, j) => (j === i ? { ...f, ...parcial } : f)));
    const f = filas[i];
    if (f) setErrores((e) => { const r = { ...e }; delete r[claveDePieza(f.venta.id, f.pieza.id)]; return r; });
  };

  function cerrar() {
    if (ocupado.current) return;
    setElegido(null); setFilas([]); setErrores({}); setErrorGuardar('');
    onCerrar();
  }

  async function agregar() {
    if (ocupado.current || elegidas.length === 0) return;
    const r = leerPiezasDeEncargo(elegidas.map((f) => ({ venta_id: f.venta.id, pieza: f.pieza, precio: f.precio, pagoImpuesto: f.pagoImpuesto })));
    setErrores(r.errores);
    if (Object.keys(r.errores).length > 0) { haptics.error(); enfocarError(formulario.current); return; }
    haptics.impact('medium');
    ocupado.current = true; setGuardando(true); setErrorGuardar('');
    try {
      await onAgregar(r.lineas);
      ocupado.current = false;
      cerrar();
    } catch (e) {
      setErrorGuardar(e instanceof Error ? e.message : 'No se pudieron agregar las piezas. Intentá otra vez.');
    } finally {
      ocupado.current = false; setGuardando(false);
    }
  }

  const enLista = modo === 'lista' && elegido === null;
  const titulo = modo === 'esperando' ? 'Piezas que esperan paquete' : enLista ? 'Agregar encargo' : 'Piezas del encargo';

  return <BottomSheet abierto={modo !== null} onCerrar={cerrar} hayCambios={hayCambios} ocupado={guardando} titulo={titulo}
    subtitulo={enLista ? 'Elegí el encargo que vino en este paquete.' : 'Escribí lo que costó cada una en la tienda.'}
    footer={enLista ? undefined : <button type="button" className={`${principal} w-full`} disabled={guardando || cargando || elegidas.length === 0} onClick={agregar}>
      {guardando ? 'Guardando…' : elegidas.length === 1 ? 'Agregar 1 pieza' : `Agregar ${elegidas.length} piezas`}
    </button>}>
    <div ref={formulario} className="space-y-3 py-1">
      {enLista && <ul className="space-y-2">{encargos.map((v, i) => <li key={v.id}>
        {(i === 0 || grupoDeEncargo(encargos[i - 1]) !== grupoDeEncargo(v)) &&
          <h3 className="px-1 pb-1 pt-2 text-sm font-bold text-texto-2">{TITULO_GRUPO[grupoDeEncargo(v)]}</h3>}
        <button type="button" onClick={() => { haptics.selection(); setElegido(v.id); }}
          className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-borde bg-superficie px-3 py-2 text-left">
          <ClipboardList size={18} className="shrink-0 text-texto-3" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-texto">{v.cliente_nombre ?? 'Sin clienta'} · {v.codigo}</span>
            <span className="block text-sm text-texto-2">{[v.que_pidio, textoSinPaquete(v)].filter(Boolean).join(' · ')}</span>
          </span>
        </button>
      </li>)}</ul>}

      {!enLista && <>
        {modo === 'lista' && <button type="button" disabled={guardando} onClick={() => { haptics.selection(); setElegido(null); setFilas([]); setErrores({}); }}
          className="flex min-h-11 items-center gap-1 text-base font-semibold text-acento-fuerte"><ChevronLeft size={18} />Otros encargos</button>}
        {cargando && <p className="text-sm text-texto-2">Leyendo las piezas…</p>}
        {errorCarga && <p role="alert" className="text-sm text-peligro-fuerte">{errorCarga}</p>}
        {errorGuardar && <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">{errorGuardar}</p>}
        {!cargando && !errorCarga && filas.length === 0 && <p className="text-base text-texto-2">Todas sus piezas ya vienen en un paquete.</p>}
        {filas.map((f, i) => {
          const k = claveDePieza(f.venta.id, f.pieza.id);
          return <fieldset key={k} className="space-y-2 rounded-2xl border border-borde bg-superficie p-3">
            <label className="flex min-h-11 items-start gap-3">
              <input type="checkbox" className={`${casilla} mt-1`} checked={f.elegida} disabled={guardando}
                onChange={(e) => cambiar(i, { elegida: e.target.checked })} />
              <span className="min-w-0">
                <span className="block text-base font-bold text-texto">{f.pieza.cantidad > 1 ? `${f.pieza.cantidad} × ` : ''}{f.pieza.descripcion}</span>
                <span className="block text-sm text-texto-2">{f.venta.cliente?.nombre ?? f.venta.cliente_nombre ?? 'Sin clienta'} · {f.venta.codigo}{f.pieza.comprado_el ? ' · ya comprada' : ''}</span>
              </span>
            </label>
            {f.elegida && <>
              <label className="block text-sm font-semibold text-texto">Pagó por cada una ($)
                <input aria-label={`Pagó por cada una ($): ${f.pieza.descripcion}`} inputMode="decimal" className={campo} value={f.precio}
                  placeholder="0.00" disabled={guardando} aria-invalid={Boolean(errores[k])} onChange={(e) => cambiar(i, { precio: e.target.value })} />
              </label>
              <p className={`text-sm ${errores[k] ? 'text-peligro-fuerte' : 'text-texto-2'}`}>
                {errores[k] ?? (f.pieza.precio_tienda_usd_cents ? `En la cotización: ${formatearMoneda(f.pieza.precio_tienda_usd_cents, 'USD')} en la tienda.` : 'Lo que costó en la tienda, sin impuesto.')}
              </p>
              <label className="flex min-h-11 items-center gap-3 text-base text-texto">
                <input type="checkbox" className={casilla} checked={f.pagoImpuesto} disabled={guardando}
                  onChange={(e) => cambiar(i, { pagoImpuesto: e.target.checked })} />
                La tienda cobró el impuesto ({taxBp / 100}%)
              </label>
            </>}
          </fieldset>;
        })}
      </>}
    </div>
  </BottomSheet>;
}
