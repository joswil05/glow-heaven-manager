import React, { useEffect, useId, useMemo, useState } from 'react';
import { X, ArrowRight, Info } from 'lucide-react';
import type { PrecioParaRevisar } from '@core/revisar-precios';
import { Button, Ventana } from '../../components/ui';
import { formatearMoneda } from '@core/moneda';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/cn';

/**
 * Los precios que no corresponden a su costo, para que ella decida: la lista
 * (antes → después), elegir cuáles, Deshacer.
 *
 * La lista se arma en `@core/revisar-precios`, porque también la abre
 * Configuración después de un cambio de margen o de redondeo.
 */
export { preciosParaRevisar, type PrecioParaRevisar } from '@core/revisar-precios';

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
  const idTitulo = useId();

  useEffect(() => {
    if (abierto) setElegidos(new Set(lista.map((x) => x.producto.id)));
  }, [abierto, lista]);

  const suben = useMemo(
    () => lista.filter((x) => x.calculado > x.producto.precio_venta_usd_cents).length,
    [lista]
  );

  const alternar = (id: number) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const aplicar = async () => {
    if (aplicando || elegidos.size === 0) return;
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
    // Mientras aplica, nada la cierra: la acción seguía sin nadie mirando (INV-31).
    <Ventana
      abierto={abierto}
      onCerrar={onCerrar}
      ocupado={aplicando}
      onEnviar={aplicar}
      idTitulo={idTitulo}
      clasePanel="rounded-2xl max-w-3xl max-h-[88vh] overflow-hidden"
    >
      {(cerrar) => (
        <>
          <header className="flex items-center justify-between px-6 py-4 border-b border-borde shrink-0">
            <h3 id={idTitulo} className="text-title text-texto">
              Precios para revisar
            </h3>
            <Button variant="ghost" size="sm" onClick={cerrar} aria-label="Cerrar" disabled={aplicando}>
              <X className="w-4 h-4" />
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <p className="flex items-start gap-2 text-caption text-texto-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-texto-3" />
              <span>
                El precio nuevo sale del costo con impuesto y flete, más su margen.
                {suben > 0 &&
                  (suben === 1
                    ? ' Uno sube: hoy se gana menos de lo que pediste.'
                    : ` ${suben} suben: hoy se gana menos de lo que pediste.`)}
              </span>
            </p>

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
            <p className="text-caption text-texto-3">Se puede deshacer.</p>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={cerrar} disabled={aplicando} className="rounded-xl">
                Ahora no
              </Button>
              <Button
                variant="primary"
                onClick={aplicar}
                disabled={aplicando || elegidos.size === 0}
                className="rounded-xl"
              >
                {aplicando
                  ? 'Aplicando…'
                  : `Aplicar ${elegidos.size} precio${elegidos.size === 1 ? '' : 's'}`}
              </Button>
            </div>
          </footer>
        </>
      )}
    </Ventana>
  );
};
