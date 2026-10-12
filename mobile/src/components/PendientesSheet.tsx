import { useState, type ReactNode } from 'react';
import { HandCoins, Package, ShoppingBag } from 'lucide-react';
import { formatearMoneda } from '@core/moneda';
import { useCola } from '../context/ColaContext';
import { useConexion } from '../context/ConexionContext';
import { haptics } from '../lib/haptics';
import type { EnCola } from '../lib/cola';
import { BottomSheet } from './BottomSheet';

const QUE: Record<EnCola['operacion']['tipo'], { nombre: string; esta: string; Icono: typeof ShoppingBag }> = {
  VENTA: { nombre: 'Venta', esta: 'esta venta', Icono: ShoppingBag },
  ENCARGO: { nombre: 'Pedido', esta: 'este pedido', Icono: Package },
  ABONO: { nombre: 'Abono', esta: 'este abono', Icono: HandCoins },
};

function hora(iso: string): string {
  const f = new Date(iso);
  return `${f.getHours()}:${String(f.getMinutes()).padStart(2, '0')}`;
}

function Fila({ op, estado, children }: { op: EnCola; estado?: string; children?: ReactNode }) {
  const { nombre, Icono } = QUE[op.operacion.tipo];
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-borde bg-superficie p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-superficie-2 text-texto-2">
          <Icono size={16} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-body font-bold leading-tight text-texto">{op.resumen.titulo}</span>
          <span className="truncate text-caption font-medium text-texto-3">
            {nombre} · {hora(op.creada_en)} · {op.resumen.detalle}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span className="text-sm font-black tabular-nums text-texto">
            {formatearMoneda(op.resumen.monto_usd_cents, 'USD')}
          </span>
          {estado && <span className="text-[11px] font-semibold text-alerta-fuerte">{estado}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

/**
 * Lo que se hizo sin señal y todavía no subió, y lo que no se pudo subir
 * (C4 · T7). Lo pendiente sube solo; lo que hay que revisar espera que Ross
 * decida: intentar de nuevo o descartar. Nada se descarta solo, y descartar
 * pregunta antes.
 */
export function PendientesSheet() {
  const { cola, persistente, hojaAbierta, cerrarPendientes, reintentar, quitar } = useCola();
  const { enLinea } = useConexion();
  const [descartando, setDescartando] = useState<EnCola | null>(null);

  const revisar = cola.filter((o) => o.estado === 'REVISAR');
  const esperando = cola.filter((o) => o.estado === 'PENDIENTE' || o.estado === 'SUBIENDO');

  function descartar() {
    if (!descartando) return;
    haptics.impact('medium');
    quitar(descartando.operacion_id);
    setDescartando(null);
  }

  return (
    <>
      <BottomSheet
        abierto={hojaAbierta && descartando === null}
        onCerrar={cerrarPendientes}
        titulo="Pendientes"
        subtitulo={enLinea ? 'Lo pendiente se sube solo.' : 'Se sube solo cuando vuelva la señal.'}
      >
        <div className="flex flex-col gap-4 pb-2">
          {!persistente && (
            <p role="alert" className="rounded-2xl bg-alerta-suave px-4 py-3 text-xs font-semibold text-alerta-fuerte">
              Este teléfono no deja guardar lo pendiente: si cerrás la app antes de que suba, se pierde.
            </p>
          )}

          {revisar.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="px-1 text-caption font-bold uppercase tracking-wider text-peligro-fuerte">Para revisar</h3>
              {revisar.map((o) => (
                <Fila key={o.operacion_id} op={o}>
                  <p className="rounded-xl bg-peligro-suave px-3 py-2 text-xs font-semibold text-peligro-fuerte">
                    {o.motivo ?? 'No se pudo guardar.'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        reintentar(o.operacion_id);
                      }}
                      className="m3-press tocable min-h-11 rounded-xl bg-superficie-2 px-3 text-sm font-bold text-texto active:scale-[0.98] transition-transform"
                    >
                      Intentar de nuevo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        haptics.selection();
                        setDescartando(o);
                      }}
                      className="m3-press tocable min-h-11 rounded-xl border border-borde px-3 text-sm font-bold text-peligro-fuerte active:scale-[0.98] transition-transform"
                    >
                      Descartar
                    </button>
                  </div>
                </Fila>
              ))}
            </section>
          )}

          {esperando.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="px-1 text-caption font-bold uppercase tracking-wider text-texto-3">Esperando para subir</h3>
              {esperando.map((o) => (
                <Fila key={o.operacion_id} op={o} estado={o.estado === 'SUBIENDO' ? 'Subiendo…' : 'Pendiente de subir'} />
              ))}
            </section>
          )}

          {revisar.length === 0 && esperando.length === 0 && (
            <p className="py-8 text-center text-sm text-texto-3">No queda nada pendiente.</p>
          )}
        </div>
      </BottomSheet>

      <BottomSheet
        abierto={descartando !== null}
        rol="alertdialog"
        titulo={`¿Descartar ${descartando ? QUE[descartando.operacion.tipo].esta : 'esto'}?`}
        onCerrar={() => setDescartando(null)}
        footer={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => {
                haptics.selection();
                setDescartando(null);
              }}
              className="min-h-12 rounded-xl border border-borde bg-superficie-2 px-3 py-2 text-sm font-bold text-texto"
            >
              No, conservar
            </button>
            <button
              type="button"
              onClick={descartar}
              className="min-h-12 rounded-xl bg-peligro px-3 py-2 text-sm font-bold text-peligro-texto"
            >
              Sí, descartar
            </button>
          </div>
        }
      >
        <p className="py-2 text-sm text-texto-2">
          No se va a guardar en ningún lado. Si igual pasó, anotalo de nuevo cuando lo hayas revisado.
        </p>
      </BottomSheet>
    </>
  );
}
