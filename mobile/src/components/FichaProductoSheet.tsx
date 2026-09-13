import { MessageCircle, PackageX } from 'lucide-react';
import type { ProductoConStock } from '@shared/types';
import { formatearMoneda } from '@core/moneda';
import { BottomSheet } from './BottomSheet';
import { haptics } from '../lib/haptics';

interface FichaProductoSheetProps {
  producto: ProductoConStock | null;
  tasaCambioCents: number;
  onCerrar: () => void;
}

/**
 * Ficha de un producto del catálogo.
 *
 * Existe porque la lista del catálogo se usa para BUSCAR: se abre decenas de
 * veces al día y cada vez se recorre entera. Meter acciones en cada fila le
 * cobraba ancho a la información en todas ellas — el precio en córdobas salía
 * cortado por eso. Acá, en cambio, ya se eligió un producto: es el lugar donde
 * una acción no le estorba a nadie.
 */
export function FichaProductoSheet({ producto, tasaCambioCents, onCerrar }: FichaProductoSheetProps) {
  if (!producto) return null;

  const p = producto;
  const precioCordobas = Math.round((p.precio_venta_usd_cents * tasaCambioCents) / 100);
  const hayStock = p.existencias > 0;
  const stockBajo = hayStock && p.existencias <= p.stock_minimo;
  const variantesConStock = p.variantes.filter((v) => v.existencias > 0);

  function compartirPorWhatsApp() {
    const tonosTexto = variantesConStock
      .map((v) => `${[v.talla, v.color].filter(Boolean).join(' ') || 'Único'} (${v.existencias} disp.)`)
      .join(', ');

    const texto =
      `*${p.nombre}* — Glow Heaven\n` +
      `Precio: ${formatearMoneda(precioCordobas, 'COR')} / ${formatearMoneda(p.precio_venta_usd_cents, 'USD')}\n` +
      (tonosTexto ? `Tonos disponibles: ${tonosTexto}\n` : `Existencias: ${p.existencias} unidades\n`) +
      `\nDisponible para entrega inmediata. Contáctanos para apartarlo.`;

    haptics.impact('medium');
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
  }

  return (
    <BottomSheet
      abierto={p !== null}
      onCerrar={onCerrar}
      titulo={p.nombre}
      subtitulo={[`#${p.codigo}`, p.categoria_nombre].filter(Boolean).join(' · ')}
      footer={
        <button
          type="button"
          onClick={compartirPorWhatsApp}
          className="m3-press tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-acento px-5 py-3.5 text-sm font-bold text-acento-texto active:scale-[0.98] transition-transform"
        >
          <MessageCircle size={18} />
          Compartir por WhatsApp
        </button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {/* Foto grande: acá sí cabe. En la lista compite con el texto. */}
        <div className="overflow-hidden rounded-2xl border border-borde bg-superficie-2 aspect-[4/3] flex items-center justify-center">
          {p.foto ? (
            <img src={p.foto} alt={p.nombre} className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl font-extrabold uppercase text-texto-3">{p.nombre.slice(0, 2)}</span>
          )}
        </div>

        {/* Precio: el dato por el que se abre la ficha, así que manda. */}
        <div className="rounded-2xl border border-borde bg-superficie-2 px-4 py-3">
          <span className="text-caption font-bold uppercase tracking-widest text-texto-3">Precio de venta</span>
          <div className="mt-1 flex items-baseline gap-2.5">
            <span className="text-2xl font-black tabular-nums text-texto">
              {formatearMoneda(p.precio_venta_usd_cents, 'USD')}
            </span>
            <span className="text-sm font-bold tabular-nums text-texto-2">
              {formatearMoneda(precioCordobas, 'COR')}
            </span>
          </div>
        </div>

        {/* Existencias. El detalle por tono solo aparece si el producto los
            tiene: inventar una fila "Único" para todo lo demás es ruido. */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-caption font-bold uppercase tracking-widest text-texto-3">Existencias</span>
            <span
              className={`rounded-full px-2.5 py-1 text-label font-bold tabular-nums ${
                !hayStock
                  ? 'bg-peligro-suave text-peligro-fuerte'
                  : stockBajo
                  ? 'bg-alerta-suave text-alerta-fuerte'
                  : 'bg-acento-suave text-acento-fuerte'
              }`}
            >
              {hayStock ? `${p.existencias} disponibles` : 'Agotado'}
            </span>
          </div>

          {variantesConStock.length > 0 && (
            <ul className="flex flex-col divide-y divide-borde overflow-hidden rounded-2xl border border-borde">
              {variantesConStock.map((v, i) => (
                <li key={i} className="flex items-center justify-between gap-3 bg-superficie px-4 py-2.5">
                  <span className="min-w-0 truncate text-sm font-semibold text-texto-2">
                    {[v.talla, v.color].filter(Boolean).join(' ') || 'Único'}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-texto">{v.existencias}</span>
                </li>
              ))}
            </ul>
          )}

          {!hayStock && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-borde bg-superficie-2 px-4 py-3 text-texto-2">
              <PackageX size={18} className="shrink-0 text-peligro" />
              <span className="text-xs font-medium">
                No queda existencia. Se puede vender como encargo.
              </span>
            </div>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
