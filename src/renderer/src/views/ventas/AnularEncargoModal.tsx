import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { OpcionesAnulacion, Venta, VentaCompleta } from '../../../../shared/types';
import { Button, Portal } from '../../components/ui';
import { estadoPieza, etapaEncargo } from '@core/encargos';
import { formatearMoneda, formatearFecha } from '@core/moneda';
import { cn } from '../../lib/cn';

/**
 * Anular un encargo, decidiendo qué pasa con lo que ya se compró.
 *
 * Una pieza que ya llegó está en manos de Ross: va a la bodega (entra con su
 * costo real) o se perdió. Lo que la clienta ya pagó se le devuelve o queda
 * como pago. Hasta la 2.13, anular dejaba la pieza fuera de todo y devolvía
 * siempre el anticipo. Ver `docs/PLAN_LOTES_Y_ENCARGOS.md`, sección 5.6.
 */
interface AnularEncargoModalProps {
  venta: Venta | VentaCompleta | null;
  onConfirmar: (opciones: OpcionesAnulacion) => void;
  onCerrar: () => void;
}

type Destino = 'BODEGA' | 'PERDIDA';

/** Una opción de un selector de dos, como los del resto de la app. */
const Opcion: React.FC<{ activa: boolean; onClick: () => void; children: React.ReactNode }> = ({
  activa,
  onClick,
  children,
}) => (
  <button
    type="button"
    role="radio"
    aria-checked={activa}
    onClick={onClick}
    className={cn(
      'rounded-md px-3 py-1 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
      activa ? 'bg-superficie text-texto font-medium shadow-2xs' : 'text-texto-3 hover:text-texto'
    )}
  >
    {children}
  </button>
);

export const AnularEncargoModal: React.FC<AnularEncargoModalProps> = ({ venta, onConfirmar, onCerrar }) => {
  const [completa, setCompleta] = useState<VentaCompleta | null>(null);
  const [destinos, setDestinos] = useState<Record<number, Destino>>({});
  const [anticipo, setAnticipo] = useState<'DEVOLVER' | 'RETENER'>('DEVOLVER');
  const [noSeConsiguio, setNoSeConsiguio] = useState(false);
  const salidaRef = useRef<HTMLButtonElement>(null);

  // Las piezas hacen falta enteras: una venta de la lista viene sin líneas.
  useEffect(() => {
    if (!venta) return;
    setDestinos({});
    setAnticipo('DEVOLVER');
    // Un pedido que se anula casi siempre es porque no se encontró.
    setNoSeConsiguio(etapaEncargo(venta) === 'POR_COTIZAR');
    if ('lineas' in venta && venta.lineas) {
      setCompleta(venta);
      return;
    }
    setCompleta(null);
    let vivo = true;
    window.api.ventas.get(venta.id).then((r) => {
      if (vivo && r.success && r.data) setCompleta(r.data);
    });
    return () => {
      vivo = false;
    };
  }, [venta]);

  useEffect(() => {
    if (!venta) return;
    salidaRef.current?.focus();
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [venta, onCerrar]);

  if (!venta) return null;

  const lineas = completa?.lineas ?? [];
  const llegadas = lineas.filter((l) => estadoPieza(l) === 'LLEGO');
  const enCamino = lineas.filter((l) => estadoPieza(l) === 'EN_CAMINO');
  const esperando = lineas.filter((l) => estadoPieza(l) === 'COMPRADA');
  const pagado = venta.pagado_usd_cents || 0;

  const confirmar = () => {
    const piezas: OpcionesAnulacion['piezas'] = {};
    for (const l of llegadas) piezas[l.id] = { destino: destinos[l.id] ?? 'BODEGA' };
    onConfirmar({ anticipo, piezas, motivo: noSeConsiguio ? 'NO_SE_CONSIGUIO' : undefined });
    onCerrar();
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-anular-encargo"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCerrar();
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-superficie rounded-xl shadow-2xl w-full max-w-lg animate-modal-pop border border-borde cursor-default"
        >
          <div className="p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-danger-50 text-danger-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 id="titulo-anular-encargo" className="text-title text-texto pt-1">
                ¿Anular {venta.codigo}?
              </h3>
            </div>

            {!completa ? (
              <p className="text-label text-texto-3">Cargando sus piezas…</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-body text-texto">Por qué</p>
                  <div className="inline-flex rounded-lg bg-superficie-2 p-0.5" role="radiogroup" aria-label="Por qué se anula">
                    <Opcion activa={!noSeConsiguio} onClick={() => setNoSeConsiguio(false)}>
                      Ya no lo quiere
                    </Opcion>
                    <Opcion activa={noSeConsiguio} onClick={() => setNoSeConsiguio(true)}>
                      No se consiguió
                    </Opcion>
                  </div>
                </div>

                {llegadas.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-body text-texto truncate">{l.descripcion}</p>
                      <p className="text-caption text-texto-3">
                        Llegó{l.compra_codigo ? ` en ${l.compra_codigo}` : ''}
                        {l.llego_el ? ` el ${formatearFecha(l.llego_el)}` : ''} · te costó{' '}
                        {formatearMoneda(l.costo_total_usd_cents, 'USD')}
                      </p>
                    </div>
                    <div
                      className="inline-flex rounded-lg bg-superficie-2 p-0.5"
                      role="radiogroup"
                      aria-label={`Qué pasa con ${l.descripcion}`}
                    >
                      <Opcion
                        activa={(destinos[l.id] ?? 'BODEGA') === 'BODEGA'}
                        onClick={() => setDestinos((d) => ({ ...d, [l.id]: 'BODEGA' }))}
                      >
                        A la bodega
                      </Opcion>
                      <Opcion
                        activa={destinos[l.id] === 'PERDIDA'}
                        onClick={() => setDestinos((d) => ({ ...d, [l.id]: 'PERDIDA' }))}
                      >
                        Se perdió
                      </Opcion>
                    </div>
                  </div>
                ))}

                {enCamino.length > 0 && (
                  <p className="text-label text-texto-2">
                    {enCamino.length === 1
                      ? `“${enCamino[0].descripcion}” ya se compró: entra a la bodega con ${enCamino[0].compra_codigo ?? 'su paquete'}.`
                      : `${enCamino.length} piezas ya se compraron: entran a la bodega con su paquete.`}
                  </p>
                )}

                {esperando.length > 0 && (
                  <p className="text-label text-texto-2">
                    {esperando.length === 1
                      ? `“${esperando[0].descripcion}” ya se compró: cuando llegue, cargala en su paquete para la bodega.`
                      : `${esperando.length} piezas ya se compraron: cuando lleguen, cargalas en su paquete para la bodega.`}
                  </p>
                )}

                {pagado > 0 && (
                  <div className="flex items-center justify-between gap-3 flex-wrap border-t border-borde pt-4">
                    <p className="text-body text-texto">
                      Pagó {formatearMoneda(pagado, 'USD')}
                    </p>
                    <div className="inline-flex rounded-lg bg-superficie-2 p-0.5" role="radiogroup" aria-label="Qué pasa con lo que pagó">
                      <Opcion activa={anticipo === 'DEVOLVER'} onClick={() => setAnticipo('DEVOLVER')}>
                        Devolvérselo
                      </Opcion>
                      <Opcion activa={anticipo === 'RETENER'} onClick={() => setAnticipo('RETENER')}>
                        Quedármelo
                      </Opcion>
                    </div>
                  </div>
                )}

                {llegadas.length === 0 && enCamino.length === 0 && esperando.length === 0 && pagado === 0 && venta.total_usd_cents > 0 && (
                  <p className="text-label text-texto-2">Deja de contar en tus ganancias.</p>
                )}
              </>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-borde">
            <Button ref={salidaRef} variant="secondary" onClick={onCerrar}>
              No, dejarlo como está
            </Button>
            <Button variant="danger" onClick={confirmar} disabled={!completa}>
              Anular el encargo
            </Button>
          </footer>
        </div>
      </div>
    </Portal>
  );
};
