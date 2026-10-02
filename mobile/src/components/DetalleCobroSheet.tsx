import { useRef } from 'react';
import { MessageCircle, Clock3, DollarSign, AlertTriangle } from 'lucide-react';
import type { FilaPorCobrar } from '@shared/types';
import { formatearMoneda } from '@core/moneda';
import { BottomSheet } from './BottomSheet';
import { mensajeCobro, enlaceMensaje } from '@core/mensajes';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';

interface DetalleCobroSheetProps {
  fila: FilaPorCobrar | null;
  tasaCambioCents: number;
  onCerrar: () => void;
  onAbonar: (f: FilaPorCobrar) => void;
  onVerKardex: (f: FilaPorCobrar) => void;
}

/**
 * Ficha de una cuenta por cobrar.
 *
 * Existe porque la lista de cobranza se usa para BUSCAR: la pregunta es
 * "quién me debe, cuánto, y a quién le cobro primero". Cada fila traía el
 * código de venta, la fecha, el porcentaje pagado, una barra de progreso y
 * tres botones: unos 208px por clienta, o sea tres visibles por pantalla.
 * Todo ese detalle importa cuando ya elegiste a alguien — que es acá.
 *
 * Además, abonar mueve plata: que el detalle confirme a quién y cuánto
 * antes de ejecutar es más seguro que un botón suelto en una lista.
 */
export function DetalleCobroSheet({
  fila,
  tasaCambioCents,
  onCerrar,
  onAbonar,
  onVerKardex,
}: DetalleCobroSheetProps) {
  // Cerrada, se sigue mostrando lo último mientras la hoja baja: sin esto el
  // componente desaparecía antes de que la hoja pudiera animar su salida.
  const { parametros } = useDatosNegocio();
  const ultima = useRef(fila);
  if (fila) ultima.current = fila;
  const visto = fila ?? ultima.current;
  if (!visto) return null;
  const f = visto;
  const saldoCor = Math.round((f.saldo_usd_cents * tasaCambioCents) / 100);
  const total = f.total_usd_cents || 1;
  const pagado = f.pagado_usd_cents || 0;
  const porcentaje = Math.min(100, Math.max(0, Math.round((pagado / total) * 100)));
  const vencida = f.cuotas_vencidas > 0;

  // El recordatorio de todos los botones, con la plantilla de Configuración y
  // la tasa de esta venta. Antes era otro texto, y le hablaba de vos a la clienta.
  const urlWhatsapp = enlaceMensaje(
    f.cliente_telefono,
    mensajeCobro(
      { cliente: f.cliente_nombre, saldo_usd_cents: f.saldo_usd_cents, saldo_cor_cents: saldoCor, codigo: f.codigo },
      parametros
    ),
    parametros
  );

  return (
    <BottomSheet
      abierto={fila !== null}
      onCerrar={onCerrar}
      titulo={f.cliente_nombre}
      subtitulo={`${f.codigo} · ${f.fecha}`}
      footer={
        <button
          type="button"
          onClick={() => {
            haptics.impact('medium');
            onAbonar(f);
          }}
          className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento px-5 py-3.5 text-sm font-bold text-acento-texto active:scale-[0.98] transition-transform"
        >
          <DollarSign size={18} />
          Registrar abono
        </button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {vencida && (
          <div className="flex items-center gap-2.5 rounded-2xl bg-peligro-suave px-4 py-3 text-peligro-fuerte">
            <AlertTriangle size={18} className="shrink-0" />
            <span className="text-xs font-bold">
              {f.cuotas_vencidas} {f.cuotas_vencidas === 1 ? 'cuota vencida' : 'cuotas vencidas'}
            </span>
          </div>
        )}

        {/* El saldo es el dato por el que se abre la ficha. */}
        <div className="rounded-2xl border border-borde bg-superficie-2 px-4 py-3">
          <span className="text-caption font-bold uppercase tracking-widest text-texto-3">
            Saldo pendiente
          </span>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-2xl font-black tabular-nums text-texto">
              {formatearMoneda(f.saldo_usd_cents, 'USD')}
            </span>
            <span className="text-sm font-bold tabular-nums text-texto-2">
              {formatearMoneda(saldoCor, 'COR')}
            </span>
          </div>
        </div>

        {/* Acá la barra sí aporta: es lo único que muestra el avance. En la
            lista repetía el porcentaje que ya estaba escrito al lado. */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-caption font-bold uppercase tracking-widest text-texto-3">
              Avance del pago
            </span>
            <span className="text-xs font-bold tabular-nums text-texto-2">
              {porcentaje}% de {formatearMoneda(f.total_usd_cents, 'USD')}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-superficie-2">
            <div
              className={`h-full rounded-full ${vencida ? 'bg-peligro' : 'bg-acento'}`}
              style={{ width: `${porcentaje}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a
            href={urlWhatsapp ?? undefined}
            onClick={() => haptics.impact('light')}
            target="_blank"
            rel="noreferrer"
            aria-label={f.cliente_telefono ? `Escribir a ${f.cliente_nombre} por WhatsApp` : 'Sin teléfono en su ficha'}
            className={`m3-press tocable flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-label font-bold transition-transform ${
              f.cliente_telefono
                ? 'border-borde bg-superficie-2 text-texto-2 active:scale-[0.98]'
                : 'pointer-events-none border-borde bg-superficie-2 text-texto-3'
            }`}
          >
            <MessageCircle size={15} />
            {/* Sin teléfono no se apaga en silencio: dice por qué (CCO-17). */}
            {f.cliente_telefono ? 'WhatsApp' : 'Sin teléfono'}
          </a>

          <button
            type="button"
            onClick={() => {
              haptics.impact('light');
              onVerKardex(f);
            }}
            className="m3-press tocable flex items-center justify-center gap-1.5 rounded-xl border border-borde bg-superficie-2 px-3 py-2.5 text-label font-bold text-texto-2 active:scale-[0.98] transition-transform cursor-pointer"
          >
            <Clock3 size={15} />
            Historial
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
