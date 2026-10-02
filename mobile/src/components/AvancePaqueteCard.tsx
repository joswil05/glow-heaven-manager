import { Package, CheckCircle2, ChevronRight } from 'lucide-react';
import type { AvancePaquete } from '@shared/types';
import { formatearMoneda } from '@core/moneda';
import { textoAvance, textoRecuperado, textoDias, textoVendidoTodo } from '@core/avance-paquete';
import { haptics } from '../lib/haptics';

/**
 * Cómo va un paquete, en el celular (Fase C1).
 *
 * Reemplaza a "Stock crítico": un producto que se trajo una vez y se vendió no
 * es una alerta. Lo que se mira es el paquete: cuánto se vendió, cuánto queda
 * y si ya se recuperó lo que costó. La cuenta es la de `core/avance-paquete.ts`.
 */

const $ = (c: number) => formatearMoneda(c, 'USD');

/** Una barra quieta: Inicio se abre muchas veces al día y no tiene que moverse. */
function BarraQuieta({ actual, total, etiqueta }: { actual: number; total: number; etiqueta: string }) {
  const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((actual / total) * 100))) : 0;
  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full rounded-full bg-borde overflow-hidden"
    >
      <div className="h-full rounded-full bg-acento" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Un paquete en venta. Tocarlo muestra lo que queda en bodega. */
export function AvancePaqueteCard({ avance, onAbrir }: { avance: AvancePaquete; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptics.impact('light');
        onAbrir();
      }}
      className="tocable m3-card w-full p-3.5 flex flex-col gap-2 text-left cursor-pointer active:scale-[0.99] transition-transform"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-texto">
          <Package size={16} className="text-texto-3 shrink-0" aria-hidden="true" />
          {avance.codigo}
        </span>
        <span className="flex items-center gap-1 text-xs font-semibold text-texto-2 tabular-nums">
          {textoAvance(avance)}
          <ChevronRight size={14} className="text-texto-3" aria-hidden="true" />
        </span>
      </div>
      <BarraQuieta
        actual={avance.unidades_vendidas}
        total={avance.unidades_recibidas}
        etiqueta={`Vendido de ${avance.codigo}`}
      />
      <span className="text-xs text-texto-3 tabular-nums">
        {textoRecuperado(avance)}
        {avance.por_cobrar_usd_cents > 0 && ` · te deben ${$(avance.por_cobrar_usd_cents)}`}
      </span>
    </button>
  );
}

/** El resumen de un paquete que se vendió todo, hasta que Ross toca "Listo". */
export function ResumenPaqueteCard({ avance, onListo }: { avance: AvancePaquete; onListo: () => void }) {
  const cifras: [string, number][] = [
    ['Invertiste', avance.invertido_usd_cents],
    ['Vendiste', avance.vendido_usd_cents],
    ['Ganaste', avance.ganancia_usd_cents],
  ];
  if (avance.por_cobrar_usd_cents > 0) cifras.push(['Falta cobrar', avance.por_cobrar_usd_cents]);

  return (
    <section
      aria-label={`${avance.codigo}: se vendió todo`}
      className="rounded-2xl border border-acento-suave bg-acento-suave p-3.5 flex flex-col gap-3"
    >
      <div className="flex items-start gap-2">
        <CheckCircle2 size={18} className="text-acento-fuerte shrink-0 mt-0.5" aria-hidden="true" />
        <h3 className="text-sm font-bold text-acento-fuerte leading-snug">{textoVendidoTodo(avance)}</h3>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {cifras.map(([rotulo, usd]) => (
          <div key={rotulo} className="min-w-0">
            <div className="text-xs text-texto-2">{rotulo}</div>
            <div className="text-sm font-bold text-texto tabular-nums">{$(usd)}</div>
          </div>
        ))}
      </div>

      {avance.mas_rapidos.length > 0 && (
        <p className="text-xs text-texto-2 leading-snug">
          Lo que más rápido se vendió:{' '}
          {avance.mas_rapidos.map((r) => `${r.nombre} (${textoDias(r.dias)})`).join(', ')}.
        </p>
      )}
      {avance.deudas.length > 0 && (
        <p className="text-xs text-texto-2 leading-snug tabular-nums">
          Todavía deben: {avance.deudas.map((d) => `${d.cliente_nombre} ${$(d.pendiente_usd_cents)}`).join(', ')}.
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          // La vibración antes de cualquier espera: en iPhone sólo vibra dentro del toque.
          haptics.impact('light');
          onListo();
        }}
        className="tocable m3-press self-end rounded-xl bg-superficie px-4 py-2 text-sm font-bold text-texto-2 border border-borde cursor-pointer"
      >
        Listo
      </button>
    </section>
  );
}
