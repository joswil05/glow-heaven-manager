import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, ClipboardList, RefreshCw } from 'lucide-react';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import type { Venta, VentaCompleta } from '@shared/types';
import { etapaEncargo, FASES_EN_CURSO, sinPrecio, textoEtapa, type EtapaEncargo } from '@core/encargos';
import { hoyISO } from '@core/fechas';
import { formatearMoneda } from '@core/moneda';
import { cargarEncargosEnCurso, NOMBRES_ETAPA_ENCARGO } from '../lib/encargos-movil';
import { useDatosNegocio } from '../context/DataContext';
import { BottomSheet } from '../components/BottomSheet';
import { haptics } from '../lib/haptics';

interface Props {
  onVolver: () => void;
  /** T4 conecta esta intención al alta del pedido. */
  abrirNuevoAlEntrar?: boolean;
}

export function EncargosView({ onVolver }: Props) {
  const { version } = useDatosNegocio();
  const [encargos, setEncargos] = useState<Venta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [reintento, setReintento] = useState(0);
  const [filtro, setFiltro] = useState<EtapaEncargo | 'TODOS'>('TODOS');
  const [seleccionado, setSeleccionado] = useState<Venta | null>(null);
  const [detalle, setDetalle] = useState<VentaCompleta | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');
  const [reintentoDetalle, setReintentoDetalle] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError('');
    cargarEncargosEnCurso().then((lista) => {
      if (vivo) setEncargos(lista);
    }).catch(() => {
      if (vivo) setError('No se pudieron cargar los encargos.');
    }).finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [version, reintento]);

  const idSeleccionado = seleccionado?.id;
  useEffect(() => {
    if (idSeleccionado === undefined) return;
    let vivo = true;
    setDetalle(null);
    setErrorDetalle('');
    setCargandoDetalle(true);
    VentasRepoFirestore.getById(idSeleccionado).then((venta) => {
      if (!vivo) return;
      if (venta) setDetalle(venta);
      else setErrorDetalle('Este encargo ya no está disponible.');
    }).catch(() => {
      if (vivo) setErrorDetalle('No se pudo cargar el encargo.');
    }).finally(() => { if (vivo) setCargandoDetalle(false); });
    return () => { vivo = false; };
  }, [idSeleccionado, version, reintentoDetalle]);

  const hoy = hoyISO();
  const grupos = FASES_EN_CURSO.map((fase) => ({
    fase,
    ventas: encargos.filter((venta) => etapaEncargo(venta) === fase),
  }));
  const visibles = grupos.filter((grupo) => filtro === 'TODOS' || grupo.fase === filtro);
  const vacio = visibles.every((grupo) => grupo.ventas.length === 0);
  const faseDetalle = detalle ? etapaEncargo(detalle) : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-fondo text-texto">
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-safe-b">
        <header className="sticky top-0 z-10 border-b border-borde bg-superficie px-4 pt-safe-t">
          <div className="flex items-center gap-3 py-3">
            <button type="button" aria-label="Volver" onClick={() => { haptics.selection(); onVolver(); }}
              className="tocable flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-borde bg-superficie-2 text-texto">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-xl font-extrabold">Encargos</h1>
              <p className="text-xs text-texto-2">{encargos.length} en curso</p>
            </div>
          </div>
          <div aria-label="Filtrar encargos" className="flex gap-2 overflow-x-auto pb-3">
            {[{ fase: 'TODOS' as const, nombre: 'Todos', cantidad: encargos.length }, ...grupos.map((grupo) => ({
              fase: grupo.fase, nombre: NOMBRES_ETAPA_ENCARGO[grupo.fase], cantidad: grupo.ventas.length,
            }))].map(({ fase, nombre, cantidad }) => (
              <button key={fase} type="button" aria-pressed={filtro === fase}
                onClick={() => { haptics.selection(); setFiltro(fase); }}
                className={`tocable min-h-11 shrink-0 rounded-xl border px-3 text-sm font-semibold ${filtro === fase
                  ? 'border-acento bg-acento-suave text-acento-fuerte' : 'border-borde bg-superficie-2 text-texto-2'}`}>
                {nombre} <span className="ml-1 tabular-nums">{cantidad}</span>
              </button>
            ))}
          </div>
        </header>

        <div className="flex flex-col gap-4 p-3.5">
          {cargando ? <p role="status" className="py-8 text-center text-sm text-texto-2">Cargando encargos…</p>
            : error ? <div role="alert" className="rounded-xl border border-peligro-suave bg-peligro-suave p-4 text-peligro-fuerte">
              <p className="text-sm">{error}</p>
              <button type="button" onClick={() => { haptics.selection(); setReintento((n) => n + 1); }}
                className="tocable mt-2 flex min-h-11 items-center gap-2 text-sm font-bold"><RefreshCw size={16} />Reintentar</button>
            </div> : vacio ? <div className="rounded-2xl border border-borde bg-superficie p-6 text-center">
              <ClipboardList size={28} className="mx-auto mb-3 text-texto-3" />
              <p className="font-semibold">{filtro === 'TODOS' ? 'No hay encargos en curso' : `No hay encargos en «${NOMBRES_ETAPA_ENCARGO[filtro]}»`}</p>
            </div> : visibles.map(({ fase, ventas }) => ventas.length > 0 && (
              <section key={fase} aria-label={NOMBRES_ETAPA_ENCARGO[fase]}>
                <h2 className="mb-2 px-1 text-sm font-bold text-texto-2">{NOMBRES_ETAPA_ENCARGO[fase]}</h2>
                <div className="flex flex-col gap-2">
                  {ventas.map((venta) => (
                    <button key={venta.id} type="button" onClick={() => { haptics.selection(); setSeleccionado(venta); }}
                      className="tocable flex w-full items-center justify-between gap-3 rounded-2xl border border-borde bg-superficie p-3.5 text-left">
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-texto-3">{venta.codigo} · {venta.cliente_nombre || 'Sin clienta'}</span>
                        <span className="mt-1 block text-sm font-bold text-texto">{venta.que_pidio || 'Pedido'}</span>
                        <span className="mt-1 block text-xs text-texto-2">{textoEtapa(venta, hoy)}</span>
                        {fase !== 'POR_BUSCAR' && <span className="mt-1 block text-sm font-semibold tabular-nums text-texto">
                          {formatearMoneda(venta.total_usd_cents, 'USD')}
                        </span>}
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-texto-3" />
                    </button>
                  ))}
                </div>
              </section>
            ))}
        </div>
      </main>

      <BottomSheet abierto={seleccionado !== null} onCerrar={() => setSeleccionado(null)}
        titulo={seleccionado?.cliente_nombre || 'Encargo'} subtitulo={seleccionado?.codigo}>
        {cargandoDetalle ? <p role="status" className="py-4 text-sm text-texto-2">Cargando encargo…</p>
          : errorDetalle ? <div role="alert" className="py-3 text-sm text-peligro-fuerte">
            <p>{errorDetalle}</p>
            <button type="button" onClick={() => { haptics.selection(); setReintentoDetalle((n) => n + 1); }}
              className="tocable min-h-11 font-bold">Reintentar</button>
          </div> : detalle && <div className="flex flex-col gap-3 py-2">
            <p className="text-sm font-semibold text-texto-2">{textoEtapa(detalle, hoy)}</p>
            {detalle.lineas.map((linea) => <div key={linea.id} className="rounded-xl border border-borde bg-superficie-2 p-3">
              <p className="text-sm font-bold">{linea.descripcion || linea.producto_nombre || 'Pieza'} · {linea.cantidad}</p>
              {linea.descartada_el ? <p className="mt-1 text-xs text-texto-2">No se consiguió</p>
                : sinPrecio(linea) ? <p className="mt-1 text-xs text-texto-2">Por cotizar</p>
                  : <p className="mt-1 text-sm tabular-nums">{formatearMoneda(linea.precio_unitario_usd_cents, 'USD')} c/u</p>}
            </div>)}
            {detalle.notas && <p className="whitespace-pre-wrap text-sm text-texto-2">{detalle.notas}</p>}
            {faseDetalle !== 'POR_BUSCAR' && <div className="flex justify-between gap-3 text-sm font-bold">
              <span>Total</span><span>{formatearMoneda(detalle.total_usd_cents, 'USD')}</span>
            </div>}
            {faseDetalle && ['POR_COMPRAR', 'EN_CAMINO', 'POR_ENTREGAR'].includes(faseDetalle) && (
              <p className="rounded-xl border border-borde bg-superficie-2 p-3 text-sm text-texto-2">Seguí este paso en la computadora</p>
            )}
          </div>}
      </BottomSheet>
    </div>
  );
}
