import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, Info } from 'lucide-react';
import type { Compra, ReconstruccionPaquete } from '../../../../shared/types';
import { Button, Portal } from '../../components/ui';
import { formatearMoneda } from '@core/moneda';
import { useToast } from '../../context/ToastContext';
import { useCerrarConEscape } from '../../lib/useCerrarConEscape';

/**
 * Completar el contenido de un paquete de antes del cambio.
 *
 * Esos paquetes se anotaban sólo con el flete, y los productos se cargaban a
 * mano asociados a ellos. Su "total pagado" era el flete solo, así que
 * "Pagado en paquetes" decía $77 donde la bodega registraba $370. Lo que costó
 * cada producto sigue en los productos: acá se arma el contenido con eso, se
 * muestra entero, y recién con su OK se escribe en el paquete.
 *
 * No cambia la bodega. Sólo escribe la historia del paquete.
 */

interface Props {
  compra: Compra | null;
  onCerrar: () => void;
  onCompletado: () => Promise<void> | void;
  /** Abre el paquete para cargarle el contenido a mano. */
  onCargarContenido: (compra: Compra) => void;
}

const $ = (c: number) => formatearMoneda(c, 'USD');

export const ReconstruccionModal: React.FC<Props> = ({
  compra,
  onCerrar,
  onCompletado,
  onCargarContenido,
}) => {
  const { showToast } = useToast();
  const [datos, setDatos] = useState<ReconstruccionPaquete | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setDatos(null);
    setError(null);
    if (!compra) return;
    let vivo = true;
    window.api.compras.reconstruir(compra.id).then((r) => {
      if (!vivo) return;
      if (r.success) setDatos(r.data);
      else setError(r.error);
    });
    return () => {
      vivo = false;
    };
  }, [compra]);

  useCerrarConEscape(Boolean(compra), onCerrar);

  if (!compra) return null;

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await window.api.compras.completarReconstruccion(compra.id);
      if (!r.success) {
        setError(r.error);
        return;
      }
      showToast({
        message: `${compra.codigo} ya tiene su contenido: ${r.data.lineas} producto(s).`,
        type: 'success',
      });
      await onCompletado();
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-reconstruccion"
        onClick={(e) => {
          if (e.target === e.currentTarget && !guardando) onCerrar();
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-superficie rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-borde/80 animate-modal-pop cursor-default"
        >
          <header className="flex items-center justify-between px-6 py-4 border-b border-borde shrink-0">
            <h3 id="titulo-reconstruccion" className="text-title text-texto">
              Contenido de {compra.codigo}
            </h3>
            <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar">
              <X className="w-4 h-4" />
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <p className="flex items-start gap-2 text-caption text-texto-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5 text-texto-3" />
              <span>Sale de lo que se cargó con este paquete. La bodega no cambia.</span>
            </p>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3">
                <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
                <p className="text-label text-danger-800">{error}</p>
              </div>
            )}

            {!datos && !error && (
              <p className="py-10 text-center text-body text-texto-3">Armando el contenido...</p>
            )}

            {datos && datos.avisos.length > 0 && (
              <ul className="rounded-xl border border-alerta-suave bg-alerta-suave p-3 text-caption text-alerta space-y-1">
                {datos.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}

            {datos && datos.lineas.length > 0 && (
              <div className="rounded-xl border border-borde overflow-hidden">
                <table className="w-full text-label">
                  <thead className="bg-superficie-2/60 text-caption text-texto-3">
                    <tr>
                      <th className="text-left font-medium px-4 py-2">Producto</th>
                      <th className="text-right font-medium px-3 py-2">Unidades</th>
                      <th className="text-right font-medium px-3 py-2">Tienda c/u</th>
                      <th className="text-right font-medium px-3 py-2">Impuesto</th>
                      <th className="text-right font-medium px-3 py-2">Flete</th>
                      <th className="text-right font-medium px-4 py-2">Costo de la línea</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde/60 tabular">
                    {datos.lineas.map((l) => (
                      <tr key={l.id}>
                        <td className="px-4 py-2 text-texto">{l.producto_nombre ?? l.descripcion}</td>
                        <td className="px-3 py-2 text-right">{l.cantidad}</td>
                        <td className="px-3 py-2 text-right">
                          {$(Math.round(l.precio_linea_usd_cents / Math.max(1, l.cantidad)))}
                        </td>
                        <td className="px-3 py-2 text-right">{$(l.tax_linea_usd_cents)}</td>
                        <td className="px-3 py-2 text-right">
                          {$(l.envio_asignado_usd_cents + l.otros_asignados_usd_cents)}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-texto">
                          {$(l.costo_linea_usd_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-superficie-2/40 text-texto">
                    <tr className="border-t border-borde">
                      <td className="px-4 py-2.5 font-semibold">Total</td>
                      <td className="px-3 py-2.5 text-right tabular">{datos.unidades_totales}</td>
                      <td className="px-3 py-2.5 text-right tabular">{$(datos.subtotal_productos_usd_cents)}</td>
                      <td className="px-3 py-2.5 text-right tabular">{$(datos.tax_total_usd_cents)}</td>
                      <td className="px-3 py-2.5 text-right tabular">
                        {$(datos.envio_total_usd_cents + datos.otros_costos_usd_cents)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular font-bold">{$(datos.total_usd_cents)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {datos && datos.lineas.length === 0 && (
              <p className="py-6 text-center text-body text-texto-3">
                Ningún producto registra una entrada con este paquete. Podés cargar su contenido a mano.
              </p>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-borde bg-superficie-2/40 shrink-0">
            <Button variant="secondary" onClick={onCerrar} disabled={guardando} className="rounded-xl">
              Cancelar
            </Button>
            {datos && datos.lineas.length === 0 && datos.avisos.length === 0 ? (
              <Button
                variant="primary"
                onClick={() => {
                  onCerrar();
                  onCargarContenido(compra);
                }}
                className="rounded-xl"
              >
                Cargar su contenido
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={guardar}
                disabled={guardando || !datos || datos.lineas.length === 0}
                className="rounded-xl"
              >
                {guardando ? 'Guardando...' : 'Guardar este contenido'}
              </Button>
            )}
          </footer>
        </div>
      </div>
    </Portal>
  );
};
