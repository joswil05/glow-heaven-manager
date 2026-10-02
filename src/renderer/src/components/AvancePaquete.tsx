import React from 'react';
import { Package, CheckCircle2 } from 'lucide-react';
import type { AvancePaquete } from '../../../shared/types';
import { Button } from './ui';
import { formatearMoneda } from '@core/moneda';
import { textoAvance, textoRecuperado, textoDias, textoVendidoTodo } from '@core/avance-paquete';
import { cn } from '../lib/cn';

/**
 * Cómo va un paquete, en Windows (Fase C1).
 *
 * Reemplaza a "Stock crítico": un producto que se trajo una vez y se vendió no
 * es una alerta, es una venta. Lo que importa es el paquete: cuánto se vendió,
 * cuánto queda y si ya se recuperó lo que costó. El avance lo calcula
 * `core/avance-paquete.ts`; acá sólo se muestra.
 */

const $ = (c: number) => formatearMoneda(c, 'USD');

/**
 * Una barra quieta. La de `ui` crece animada cada vez que aparece, y esto se
 * ve en Inicio, que se abre muchas veces al día: el movimiento no dice nada.
 */
const BarraQuieta: React.FC<{ actual: number; total: number; etiqueta: string }> = ({ actual, total, etiqueta }) => {
  const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((actual / total) * 100))) : 0;
  return (
    <div
      role="progressbar"
      aria-label={etiqueta}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 w-full rounded-full bg-borde/70 overflow-hidden"
    >
      <div className="h-full rounded-full bg-acento" style={{ width: `${pct}%` }} />
    </div>
  );
};

/**
 * Un paquete en venta: cuánto se vendió y cuánto se recuperó. Con `onAbrir` es
 * un botón (Inicio); sin él, sólo muestra (el detalle del paquete).
 */
export const AvancePaqueteTarjeta: React.FC<{
  avance: AvancePaquete;
  onAbrir?: () => void;
  className?: string;
}> = ({ avance, onAbrir, className }) => {
  const contenido = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-2 text-body font-semibold text-texto">
          <Package className="w-4 h-4 text-texto-3 shrink-0" aria-hidden="true" />
          {avance.codigo}
        </span>
        <span className="text-label text-texto-2 tabular">{textoAvance(avance)}</span>
      </div>
      <BarraQuieta
        actual={avance.unidades_vendidas}
        total={avance.unidades_recibidas}
        etiqueta={`Vendido de ${avance.codigo}`}
      />
      <p className="text-label text-texto-3 tabular">
        {textoRecuperado(avance)}
        {avance.por_cobrar_usd_cents > 0 && ` · te deben ${$(avance.por_cobrar_usd_cents)}`}
      </p>
    </>
  );
  const clases = cn('w-full flex flex-col gap-2 rounded-lg border border-borde bg-superficie px-3.5 py-3 text-left', className);
  return onAbrir ? (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        clases,
        'transition-colors duration-150 hover:bg-superficie-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento'
      )}
    >
      {contenido}
    </button>
  ) : (
    <div className={clases}>{contenido}</div>
  );
};

/** Una cifra del resumen: rótulo arriba, monto abajo. */
const Cifra: React.FC<{ rotulo: string; usd: number }> = ({ rotulo, usd }) => (
  <div className="min-w-0">
    <div className="text-label text-texto-2">{rotulo}</div>
    <div className="text-body font-semibold text-texto tabular">{$(usd)}</div>
  </div>
);

/**
 * El resumen de un paquete que se vendió todo. En Inicio aparece una vez,
 * hasta que Ross toca "Listo" (`onListo`); en el detalle del paquete queda.
 */
export const ResumenPaqueteVendido: React.FC<{ avance: AvancePaquete; onListo?: () => void }> = ({
  avance,
  onListo,
}) => (
  <section
    aria-label={`${avance.codigo}: se vendió todo`}
    className="rounded-xl border border-success-200 bg-success-50 p-4 space-y-3"
  >
    <div className="flex items-start justify-between gap-3">
      <h3 className="flex items-center gap-2 text-body font-semibold text-success-800">
        <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
        <span>{textoVendidoTodo(avance)}</span>
      </h3>
      {onListo && (
        <Button variant="secondary" size="sm" onClick={onListo}>
          Listo
        </Button>
      )}
    </div>

    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Cifra rotulo="Invertiste" usd={avance.invertido_usd_cents} />
      <Cifra rotulo="Vendiste" usd={avance.vendido_usd_cents} />
      <Cifra rotulo="Ganaste" usd={avance.ganancia_usd_cents} />
      {avance.por_cobrar_usd_cents > 0 && <Cifra rotulo="Falta cobrar" usd={avance.por_cobrar_usd_cents} />}
    </div>

    {avance.mas_rapidos.length > 0 && (
      <p className="text-label text-texto-2">
        Lo que más rápido se vendió:{' '}
        {avance.mas_rapidos
          .map((r) => `${r.nombre} (${textoDias(r.dias)})`)
          .join(', ')}
        .
      </p>
    )}
    {avance.deudas.length > 0 && (
      <p className="text-label text-texto-2 tabular">
        Todavía deben: {avance.deudas.map((d) => `${d.cliente_nombre} ${$(d.pendiente_usd_cents)} (${d.codigo})`).join(', ')}.
      </p>
    )}
  </section>
);
