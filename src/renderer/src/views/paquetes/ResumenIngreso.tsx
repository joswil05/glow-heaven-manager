import React from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { EfectoIngreso, ResultadoIngreso } from '../../../../shared/types';
import { formatearMoneda } from '@core/moneda';
import { cn } from '../../lib/cn';

/**
 * Lo que hizo el paquete, producto por producto.
 *
 * Es la respuesta a "¿qué cambió?" después de pasar un paquete al inventario
 * o corregirlo: cuántas unidades hay ahora, cuánto cuesta cada una y a cuánto
 * se vende. El precio cambia solo cuando cambia el costo; acá se ve de cuánto
 * a cuánto, para que ninguna clienta se entere antes que ella.
 */

interface Props {
  resultado: ResultadoIngreso;
  modo: 'ingreso' | 'correccion';
  /** Para un panel angosto: una lista en vez de tabla, sin el cartel de arriba. */
  compacto?: boolean;
}

const $ = (c: number) => formatearMoneda(c, 'USD');

function Cambio({
  antes,
  despues,
  dinero = true,
  sinAntes = false,
}: {
  antes: number;
  despues: number;
  dinero?: boolean;
  /** No había un valor antes: es un producto que se estrena. */
  sinAntes?: boolean;
}) {
  const f = (n: number) => (dinero ? $(n) : String(n));
  if (antes === despues) return <span className="tabular text-texto-2">{f(despues)}</span>;
  if (sinAntes) return <span className="tabular font-semibold text-texto">{f(despues)}</span>;
  return (
    <span className="inline-flex items-center gap-1 tabular whitespace-nowrap">
      <span className="text-texto-3">{f(antes)}</span>
      <ArrowRight className="w-3 h-3 text-texto-3" aria-hidden="true" />
      <span className="font-semibold text-texto">{f(despues)}</span>
    </span>
  );
}

export const ResumenIngreso: React.FC<Props> = ({ resultado, modo, compacto = false }) => {
  // Un producto que se estrena no "cambia" de precio: recibe el primero.
  const esNuevo = (p: EfectoIngreso) => p.existencias_antes === 0 && p.costo_antes_usd_cents === 0;
  const cambianPrecio = resultado.productos.filter(
    (p) => !esNuevo(p) && p.precio_antes_usd_cents !== p.precio_despues_usd_cents
  );
  const nuevos = resultado.productos.filter(esNuevo).length;
  const bajoCosto = resultado.productos.filter((p) => p.bajo_costo);
  const ajusteTotal = resultado.productos.reduce((s, p) => s + (p.correccion_usd_cents ?? 0), 0);

  if (compacto) {
    return (
      <ul className="rounded-xl border border-borde divide-y divide-borde/60 text-caption">
        {resultado.productos.map((p) => (
          <li key={p.producto_id} className={cn('px-4 py-2.5', p.bajo_costo && 'bg-danger-50/60')}>
            <div className="text-label font-medium text-texto">
              {p.nombre}
              {esNuevo(p) && <span className="ml-1.5 text-caption text-acento">nuevo</span>}
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-texto-3">
              <span>
                Unid. <Cambio antes={p.existencias_antes} despues={p.existencias_despues} dinero={false} />
              </span>
              <span>
                Costo <Cambio antes={p.costo_antes_usd_cents} despues={p.costo_despues_usd_cents} sinAntes={esNuevo(p)} />
              </span>
              <span>
                Precio <Cambio antes={p.precio_antes_usd_cents} despues={p.precio_despues_usd_cents} sinAntes={esNuevo(p)} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-start gap-3 rounded-xl border border-acento/30 bg-acento-suave/40 p-4">
        <CheckCircle2 className="w-5 h-5 text-acento shrink-0 mt-0.5" />
        <div className="text-body text-texto">
          <p className="font-semibold">
            {modo === 'ingreso'
              ? `${resultado.codigo} está en el inventario.`
              : `${resultado.codigo} quedó corregido.`}
          </p>
          <p className="text-caption text-texto-2 mt-0.5">
            {resultado.productos_afectados === 0
              ? modo === 'correccion'
                ? 'La corrección quedó en el paquete. Lo que cambió ya se había vendido, así que la bodega no se mueve.'
                : 'Ningún producto del inventario cambió.'
              : resultado.productos_afectados === 1
                ? `1 producto ${modo === 'ingreso' ? 'recibió mercadería' : 'se ajustó'}.`
                : `${resultado.productos_afectados} productos ${modo === 'ingreso' ? 'recibieron mercadería' : 'se ajustaron'}.`}
            {nuevos > 0 &&
              ` ${nuevos} se estrena${nuevos === 1 ? '' : 'n'} con su primer precio.`}
            {cambianPrecio.length > 0 &&
              ` ${cambianPrecio.length} cambia${cambianPrecio.length === 1 ? '' : 'n'} de precio porque cambió su costo.`}
            {resultado.encargos_actualizados > 0 &&
              ` ${resultado.encargos_actualizados} encargo${resultado.encargos_actualizados === 1 ? '' : 's'} ya tiene${resultado.encargos_actualizados === 1 ? '' : 'n'} su costo real.`}
          </p>
          {modo === 'correccion' && ajusteTotal !== 0 && (
            <p className="text-caption text-texto-2 mt-1">
              La bodega {ajusteTotal > 0 ? 'sube' : 'baja'} {$(Math.abs(ajusteTotal))}. Lo que ya se
              vendió conserva el costo con que salió.
            </p>
          )}
        </div>
      </div>

      {bajoCosto.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3">
          <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
          <p className="text-label text-danger-800">
            {bajoCosto.map((p) => p.nombre).join(', ')}{' '}
            {bajoCosto.length === 1 ? 'tiene' : 'tienen'} un precio escrito a mano que quedó por
            debajo del costo. Revisalo antes de vender.
          </p>
        </div>
      )}

      {resultado.productos.length > 0 && (
        <div className="rounded-xl border border-borde overflow-hidden">
          <table className="w-full text-label">
            <thead className="bg-superficie-2/60 text-caption text-texto-3">
              <tr>
                <th className="text-left font-medium px-4 py-2">Producto</th>
                <th className="text-right font-medium px-3 py-2">Unidades</th>
                <th className="text-right font-medium px-3 py-2">Costo por unidad</th>
                <th className="text-right font-medium px-4 py-2">Precio de venta</th>
                {modo === 'correccion' && (
                  <th className="text-right font-medium px-4 py-2">Bodega</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde/60">
              {resultado.productos.map((p: EfectoIngreso) => (
                <tr key={p.producto_id} className={cn(p.bajo_costo && 'bg-danger-50/60')}>
                  <td className="px-4 py-2.5 text-texto">
                    {p.nombre}
                    {esNuevo(p) && <span className="ml-1.5 text-caption text-acento">nuevo</span>}
                    {p.modo_precio === 'MANUAL' && (
                      <span className="ml-1.5 text-caption text-texto-3">(precio a mano)</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Cambio antes={p.existencias_antes} despues={p.existencias_despues} dinero={false} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Cambio antes={p.costo_antes_usd_cents} despues={p.costo_despues_usd_cents} sinAntes={esNuevo(p)} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Cambio antes={p.precio_antes_usd_cents} despues={p.precio_despues_usd_cents} sinAntes={esNuevo(p)} />
                  </td>
                  {modo === 'correccion' && (
                    <td className="px-4 py-2.5 text-right tabular text-texto-2">
                      {(p.correccion_usd_cents ?? 0) === 0
                        ? '—'
                        : `${(p.correccion_usd_cents ?? 0) > 0 ? '+' : '−'}${$(Math.abs(p.correccion_usd_cents ?? 0))}`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
