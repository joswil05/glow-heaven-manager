import React, { useEffect, useRef, useState } from 'react';
import type { MotivoAnulacion, OpcionesAnulacion, Venta, VentaCompleta } from '../../../../shared/types';
import { Button, Dialogo } from '../../components/ui';
import { estadoPieza, etapaEncargo } from '@core/encargos';
import { formatearMoneda, formatearFecha } from '@core/moneda';
import { cn } from '../../lib/cn';

/**
 * Anular un encargo, decidiendo qué pasa con lo que ya se compró.
 *
 * Una pieza que ya llegó está en manos de Ross: va a la bodega (entra con su
 * costo real) o se perdió. Lo que la clienta ya pagó se le devuelve o queda
 * como pago. El motivo dice por qué no se concretó: no lo quiere más, no
 * aceptó la cotización, o no se consiguió. Arranca en el que corresponde a la
 * fase. Ver `docs/PLAN_LOTES_Y_ENCARGOS.md`, sección 5.6.
 */
interface AnularEncargoModalProps {
  venta: Venta | VentaCompleta | null;
  /** Si devuelve una promesa, la ventana dice "Anulando…" hasta que termine. */
  onConfirmar: (opciones: OpcionesAnulacion) => unknown;
  onCerrar: () => void;
}

type Destino = 'BODEGA' | 'PERDIDA';
/** "Ya no lo quiere" se guarda sin motivo, como siempre. */
type Motivo = MotivoAnulacion | 'YA_NO';

const MOTIVOS: { valor: Motivo; texto: string }[] = [
  { valor: 'YA_NO', texto: 'Ya no lo quiere' },
  { valor: 'NO_ACEPTO', texto: 'No aceptó' },
  { valor: 'NO_SE_CONSIGUIO', texto: 'No se consiguió' },
];

/** El motivo más probable según en qué va el encargo. */
function motivoDeLaFase(v: Venta | VentaCompleta): Motivo {
  const e = etapaEncargo(v);
  if (e === 'POR_BUSCAR') return 'NO_SE_CONSIGUIO';
  if (e === 'ESPERANDO') return 'NO_ACEPTO';
  return 'YA_NO';
}

/** Una opción de un selector, como los del resto de la app. */
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
  const [motivo, setMotivo] = useState<Motivo>('YA_NO');
  const [anulando, setAnulando] = useState(false);
  const salidaRef = useRef<HTMLButtonElement>(null);

  // Las piezas hacen falta enteras: una venta de la lista viene sin líneas.
  useEffect(() => {
    if (!venta) return;
    setDestinos({});
    setAnticipo('DEVOLVER');
    setMotivo(motivoDeLaFase(venta));
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

  const lineas = completa?.lineas ?? [];
  const llegadas = lineas.filter((l) => estadoPieza(l) === 'LLEGO');
  const enCamino = lineas.filter((l) => estadoPieza(l) === 'EN_CAMINO');
  const esperando = lineas.filter((l) => estadoPieza(l) === 'COMPRADA');
  const pagado = venta?.pagado_usd_cents || 0;

  // Anular tarda (devuelve piezas, recalcula saldos): sin respuesta en
  // pantalla se apretaba dos veces (ENC-23). Se queda abierta hasta que termina.
  const confirmar = async () => {
    if (anulando) return;
    const piezas: OpcionesAnulacion['piezas'] = {};
    for (const l of llegadas) piezas[l.id] = { destino: destinos[l.id] ?? 'BODEGA' };
    const r = onConfirmar({ anticipo, piezas, motivo: motivo === 'YA_NO' ? undefined : motivo });
    if (r instanceof Promise) {
      setAnulando(true);
      try {
        await r;
      } finally {
        setAnulando(false);
      }
    }
    onCerrar();
  };

  return (
    <Dialogo
      abierto={Boolean(venta)}
      titulo={venta ? `¿Anular ${venta.codigo}?` : ''}
      rol="alertdialog"
      ancho="md"
      encima
      ocupado={anulando}
      onCerrar={onCerrar}
      pie={
        <div className="flex items-center justify-end gap-2 w-full">
          {/* El foco arranca en la salida, no en la acción que destruye. */}
          <Button ref={salidaRef} variant="secondary" onClick={onCerrar} autoFocus disabled={anulando}>
            No, dejarlo como está
          </Button>
          <Button variant="danger" onClick={confirmar} disabled={!completa || anulando}>
            {anulando ? 'Anulando…' : 'Anular el encargo'}
          </Button>
        </div>
      }
    >
      {!completa || !venta ? (
        <p className="text-label text-texto-3">Cargando sus piezas…</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-body text-texto">Por qué</p>
            <div className="inline-flex rounded-lg bg-superficie-2 p-0.5" role="radiogroup" aria-label="Por qué se anula">
              {MOTIVOS.map((m) => (
                <Opcion key={m.valor} activa={motivo === m.valor} onClick={() => setMotivo(m.valor)}>
                  {m.texto}
                </Opcion>
              ))}
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
              <div className="inline-flex rounded-lg bg-superficie-2 p-0.5" role="radiogroup" aria-label={`Qué pasa con ${l.descripcion}`}>
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
              <p className="text-body text-texto">Pagó {formatearMoneda(pagado, 'USD')}</p>
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
    </Dialogo>
  );
};
