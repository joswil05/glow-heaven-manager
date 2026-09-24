import React, { useEffect, useMemo, useState } from 'react';
import { X, ArrowRight, Info } from 'lucide-react';
import type { Categoria, ParametrosSistema, ProductoConStock } from '../../../../shared/types';
import { Button, Portal } from '../../components/ui';
import { precioParaCosto } from '@core/paquete';
import { margenEfectivo } from '@core/precios';
import { formatearMoneda } from '@core/moneda';
import { useToast } from '../../context/ToastContext';
import { useCerrarConEscape } from '../../lib/useCerrarConEscape';
import { cn } from '../../lib/cn';

/**
 * Los precios que no corresponden a su costo, para que ella decida.
 *
 * Antes de este cambio el precio se calculaba cuando se creaba el producto,
 * sin el flete, y después cambiaba solo al vender. Hay productos con un precio
 * que no es el que da su margen. No se corrigen por detrás: son los precios que
 * ella les da a sus clientas.
 *
 * Un precio escrito a mano no aparece: ese lo decidió ella.
 */

export interface PrecioParaRevisar {
  producto: ProductoConStock;
  calculado: number;
}

/** Los productos cuyo precio guardado no es el que da su costo y su margen. */
export function preciosParaRevisar(
  productos: ProductoConStock[],
  categorias: Categoria[],
  parametros: ParametrosSistema | null
): PrecioParaRevisar[] {
  if (!parametros) return [];
  const salida: PrecioParaRevisar[] = [];
  for (const p of productos) {
    if (!p.activo || p.modo_precio === 'MANUAL' || p.costo_unitario_usd_cents <= 0) continue;
    const calculado = precioParaCosto(
      {
        modo_precio: p.modo_precio,
        margen_bp: margenEfectivo(p, categorias, parametros.margen_defecto_bp),
        multiplicador_bp: p.multiplicador_bp,
        precio_manual_usd_cents: p.precio_manual_usd_cents,
        precio_venta_usd_cents: p.precio_venta_usd_cents,
      },
      p.costo_unitario_usd_cents,
      parametros.paso_redondeo_usd_cents
    );
    if (calculado !== p.precio_venta_usd_cents) salida.push({ producto: p, calculado });
  }
  return salida.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));
}

interface Props {
  abierto: boolean;
  lista: PrecioParaRevisar[];
  onCerrar: () => void;
  onAplicado: () => Promise<void> | void;
}

const $ = (c: number) => formatearMoneda(c, 'USD');

export const RevisarPreciosModal: React.FC<Props> = ({ abierto, lista, onCerrar, onAplicado }) => {
  const { showToast, showUndoToast } = useToast();
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (abierto) setElegidos(new Set(lista.map((x) => x.producto.id)));
  }, [abierto, lista]);

  useCerrarConEscape(abierto, onCerrar);

  const suben = useMemo(
    () => lista.filter((x) => x.calculado > x.producto.precio_venta_usd_cents).length,
    [lista]
  );

  if (!abierto) return null;

  const alternar = (id: number) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const aplicar = async () => {
    setAplicando(true);
    try {
      const r = await window.api.productos.aplicarPrecios([...elegidos]);
      if (!r.success) {
        showToast({ message: r.error, type: 'error' });
        return;
      }
      showUndoToast(
        `${r.data.actualizados} precio${r.data.actualizados === 1 ? '' : 's'} actualizado${r.data.actualizados === 1 ? '' : 's'}`,
        () => {
          onAplicado();
        },
        r.data.evento_grupo_id
      );
      await onAplicado();
      onCerrar();
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-precios"
        onClick={(e) => {
          if (e.target === e.currentTarget && !aplicando) onCerrar();
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-superficie rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden border border-borde/80 animate-modal-pop cursor-default"
        >
          <header className="flex items-center justify-between px-6 py-4 border-b border-borde shrink-0">
            <div>
              <h3 id="titulo-precios" className="text-title text-texto">
                Precios para revisar
              </h3>
              <p className="text-caption text-texto-3">
                {lista.length} producto{lista.length === 1 ? '' : 's'} con un precio que no da el margen
                que tienen
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar">
              <X className="w-4 h-4" />
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <div className="flex items-start gap-2.5 rounded-xl border border-borde bg-superficie-2/60 p-3 text-caption text-texto-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-texto-3" />
              <p className="leading-relaxed">
                Antes el precio se calculaba sin el flete, y cambiaba solo cuando se vendía una
                unidad. El precio que corresponde sale del costo real (tienda + 7% + flete) con el
                margen del producto, redondeado hacia arriba.
                {suben > 0 &&
                  (suben === 1
                    ? ' Uno sube: con el precio de ahora se gana menos de lo que pediste.'
                    : ` ${suben} suben: con el precio de ahora se gana menos de lo que pediste.`)}
              </p>
            </div>

            <div className="rounded-xl border border-borde overflow-hidden">
              <table className="w-full text-label">
                <thead className="bg-superficie-2/60 text-caption text-texto-3">
                  <tr>
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label="Elegir todos"
                        checked={elegidos.size === lista.length && lista.length > 0}
                        onChange={(e) =>
                          setElegidos(e.target.checked ? new Set(lista.map((x) => x.producto.id)) : new Set())
                        }
                        className="w-4 h-4 rounded border-borde-fuerte text-acento"
                      />
                    </th>
                    <th className="text-left font-medium px-2 py-2">Producto</th>
                    <th className="text-right font-medium px-3 py-2">Te cuesta</th>
                    <th className="text-right font-medium px-4 py-2">Precio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde/60">
                  {lista.map(({ producto: p, calculado }) => (
                    <tr
                      key={p.id}
                      className={cn('cursor-pointer hover:bg-superficie-2/40', !elegidos.has(p.id) && 'opacity-60')}
                      onClick={() => alternar(p.id)}
                    >
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Aplicar precio a ${p.nombre}`}
                          checked={elegidos.has(p.id)}
                          onChange={() => alternar(p.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-borde-fuerte text-acento"
                        />
                      </td>
                      <td className="px-2 py-2.5 text-texto">
                        {p.nombre}
                        <span className="text-caption text-texto-3"> · {p.existencias} en bodega</span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular text-texto-2">
                        {$(p.costo_unitario_usd_cents)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 tabular whitespace-nowrap">
                          <span className="text-texto-3">{$(p.precio_venta_usd_cents)}</span>
                          <ArrowRight className="w-3 h-3 text-texto-3" aria-hidden="true" />
                          <span className="font-semibold text-texto">{$(calculado)}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <footer className="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-borde bg-superficie-2/40 shrink-0">
            <p className="text-caption text-texto-3">Se puede deshacer desde el aviso que aparece abajo.</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onCerrar} disabled={aplicando} className="rounded-xl">
                Ahora no
              </Button>
              <Button
                variant="primary"
                onClick={aplicar}
                disabled={aplicando || elegidos.size === 0}
                className="rounded-xl"
              >
                {aplicando
                  ? 'Aplicando...'
                  : `Aplicar ${elegidos.size} precio${elegidos.size === 1 ? '' : 's'}`}
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </Portal>
  );
};
