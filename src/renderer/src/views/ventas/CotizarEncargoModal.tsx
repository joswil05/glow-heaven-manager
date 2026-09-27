import React, { useEffect, useRef, useState } from 'react';
import type { ParametrosSistema, Venta, VentaCompleta } from '../../../../shared/types';
import type { LineaCotizacion } from '../../../../shared/ipc-contracts';
import { Button, Field, Input, Portal } from '../../components/ui';
import { costoEstimadoDePieza, estadoPieza, sinPrecio } from '@core/encargos';
import { calcularPrecio } from '@core/precios';
import { formatearMoneda } from '@core/moneda';
import { parsearACentavos, parsearDecimal } from '@core/numeros';

/**
 * Ponerle precio a un encargo: cotizar un pedido que se anotó sin precio, o
 * corregir el de uno cotizado.
 *
 * Con el precio en la tienda y el peso se estima el costo (tienda + impuesto
 * + flete por libra) y se sugiere un precio con el margen de siempre, la
 * misma cuenta que al crear el encargo. Una pieza que ya llegó tiene su costo
 * real y no se toca. En uno confirmado, el precio que la clienta aceptó
 * tampoco.
 */
interface CotizarEncargoModalProps {
  venta: Venta | VentaCompleta | null;
  parametros: ParametrosSistema | null;
  onGuardado: (evento_grupo_id: string) => void;
  onCerrar: () => void;
}

interface Borrador {
  id: number;
  descripcion: string;
  cantidad: number;
  tienda: string;
  peso: string;
  costo: string;
  precio: string;
  /** Llegó o salió de la bodega: el costo es el real. */
  costoReal: boolean;
  /** Precio que la clienta ya aceptó: no se cambia. */
  fijo: boolean;
}

const aTexto = (cents?: number) => (cents && cents > 0 ? (cents / 100).toFixed(2) : '');
const centavos = (texto: string) => (texto.trim() ? (parsearACentavos(texto, { min: 0 }) ?? 0) : 0);

export const CotizarEncargoModal: React.FC<CotizarEncargoModalProps> = ({ venta, parametros, onGuardado, onCerrar }) => {
  const [piezas, setPiezas] = useState<Borrador[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const primeraRef = useRef<HTMLInputElement>(null);

  // Las piezas hacen falta enteras: una venta de la lista viene sin líneas.
  useEffect(() => {
    if (!venta) return;
    setError(null);
    setPiezas(null);
    let vivo = true;
    const armar = (v: VentaCompleta) =>
      v.lineas.map<Borrador>((l) => ({
        id: l.id,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        tienda: aTexto(l.precio_tienda_usd_cents),
        peso: l.peso_mlb ? String(l.peso_mlb / 1000) : '',
        costo: aTexto(l.costo_unitario_usd_cents),
        precio: aTexto(l.precio_unitario_usd_cents),
        costoReal: estadoPieza(l) === 'LLEGO' || (l.lotes_consumidos?.length ?? 0) > 0,
        fijo: v.estado === 'PENDIENTE' && !sinPrecio(l),
      }));
    if ('lineas' in venta && venta.lineas) {
      setPiezas(armar(venta));
    } else {
      window.api.ventas.get(venta.id).then((r) => {
        if (vivo && r.success && r.data) setPiezas(armar(r.data));
      });
    }
    return () => {
      vivo = false;
    };
  }, [venta]);

  useEffect(() => {
    if (!venta) return;
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [venta, onCerrar]);

  // El foco va a la primera pieza cuando terminan de cargar, no a cada tecla.
  const cargadas = piezas !== null;
  useEffect(() => {
    if (cargadas) primeraRef.current?.focus();
  }, [cargadas]);

  if (!venta) return null;

  const cambiar = (id: number, cambios: Partial<Borrador>) =>
    setPiezas((prev) =>
      (prev ?? []).map((p) => {
        if (p.id !== id) return p;
        const nueva = { ...p, ...cambios };
        // Tienda o peso nuevos: se vuelve a estimar el costo.
        if (!nueva.costoReal && ('tienda' in cambios || 'peso' in cambios)) {
          const tienda = centavos(nueva.tienda);
          if (tienda > 0) {
            nueva.costo = aTexto(
              costoEstimadoDePieza({
                tienda_usd_cents: tienda,
                peso_mlb: Math.round((parsearDecimal(nueva.peso, { min: 0 }) ?? 0) * 1000),
                tax_bp: parametros?.tax_bp ?? 700,
                tarifa_cents_lb: parametros?.tarifa_envio_cents_lb ?? 700,
              })
            );
          }
        }
        return nueva;
      })
    );

  const sugerido = (p: Borrador) => {
    const costo = centavos(p.costo);
    if (costo <= 0) return 0;
    return calcularPrecio({
      costo_unitario_usd_cents: costo,
      modo: 'MARGEN',
      margen_bp: parametros?.margen_defecto_bp ?? 4500,
      paso_redondeo_usd_cents: parametros?.paso_redondeo_usd_cents ?? 100,
    }).precio_usd_cents;
  };

  const lista = piezas ?? [];
  const total = lista.reduce((s, p) => s + centavos(p.precio) * p.cantidad, 0);
  const anticipoBp = venta.anticipo_bp ?? parametros?.anticipo_defecto_bp ?? 5000;
  const faltan = lista.filter((p) => !p.precio.trim()).length;
  const porCotizar = lista.some((p) => !p.fijo && !aTexto(centavos(p.precio)));

  const guardar = async () => {
    for (const p of lista) {
      if (p.fijo) continue;
      if (!p.descripcion.trim()) return setError('Cada pieza necesita una descripción.');
      if (p.precio.trim() && parsearACentavos(p.precio, { min: 0.01 }) === null) {
        return setError(`El precio de '${p.descripcion}' tiene que ser mayor a $0, o quedar vacío.`);
      }
    }
    const lineas: LineaCotizacion[] = lista
      .filter((p) => !p.fijo)
      .map((p) => ({
        id: p.id,
        descripcion: p.descripcion.trim(),
        precio_unitario_usd_cents: centavos(p.precio),
        costo_estimado_unitario_usd_cents: p.costoReal || !p.costo.trim() ? undefined : centavos(p.costo),
        precio_tienda_usd_cents: p.tienda.trim() ? centavos(p.tienda) : undefined,
        peso_mlb: p.peso.trim() ? Math.round((parsearDecimal(p.peso, { min: 0 }) ?? 0) * 1000) || undefined : undefined,
      }));
    setGuardando(true);
    setError(null);
    const r = await window.api.ventas.cotizar(venta.id, lineas);
    setGuardando(false);
    if (!r.success) return setError(r.error);
    onGuardado(r.data.evento_grupo_id);
    onCerrar();
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[110] flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-cotizar"
        onClick={(e) => {
          if (e.target === e.currentTarget) onCerrar();
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-superficie rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-modal-pop border border-borde cursor-default"
        >
          <header className="px-5 py-4 border-b border-borde">
            <h3 id="titulo-cotizar" className="text-title text-texto">
              {porCotizar ? `Cotizar ${venta.codigo}` : `Precios de ${venta.codigo}`}
            </h3>
          </header>

          <div className="p-5 space-y-5 overflow-y-auto">
            {!piezas ? (
              <p className="text-label text-texto-3">Cargando sus piezas…</p>
            ) : (
              lista.map((p, i) => {
                const sug = sugerido(p);
                return (
                  <div key={p.id} className="space-y-3">
                    <Field label={lista.length > 1 ? `Pieza ${i + 1}` : 'Qué pidió'}>
                      <Input
                        ref={i === 0 ? primeraRef : undefined}
                        value={p.descripcion}
                        onChange={(e) => cambiar(p.id, { descripcion: e.target.value })}
                        disabled={p.fijo}
                        aria-label={`Descripción de la pieza ${i + 1}`}
                      />
                    </Field>
                    {p.fijo ? (
                      <p className="text-caption text-texto-3">
                        {p.cantidad} × {formatearMoneda(centavos(p.precio), 'USD')}: ya lo aceptó la clienta.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Field label="En la tienda ($)">
                          <Input
                            value={p.tienda}
                            onChange={(e) => cambiar(p.id, { tienda: e.target.value })}
                            placeholder="0.00"
                            className="text-right"
                            disabled={p.costoReal}
                          />
                        </Field>
                        <Field label="Peso aprox. (lb)">
                          <Input
                            value={p.peso}
                            onChange={(e) => cambiar(p.id, { peso: e.target.value })}
                            placeholder="0.0"
                            className="text-right"
                            disabled={p.costoReal}
                          />
                        </Field>
                        <Field label={p.costoReal ? 'Te costó ($)' : 'Costo ($)'}>
                          <Input
                            value={p.costo}
                            onChange={(e) => cambiar(p.id, { costo: e.target.value })}
                            placeholder="0.00"
                            className="text-right"
                            disabled={p.costoReal}
                          />
                        </Field>
                        <Field label="Precio ($)">
                          <Input
                            value={p.precio}
                            onChange={(e) => cambiar(p.id, { precio: e.target.value })}
                            placeholder="Sin precio"
                            className="text-right font-medium"
                            aria-label={`Precio de la pieza ${i + 1}`}
                          />
                        </Field>
                        {sug > 0 && centavos(p.precio) !== sug && (
                          <p className="col-span-2 sm:col-span-4 text-caption text-texto-3 text-right">
                            <span className="tabular">Sugerido {formatearMoneda(sug, 'USD')}</span>{' '}
                            <button
                              type="button"
                              onClick={() => cambiar(p.id, { precio: aTexto(sug) })}
                              className="text-acento font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento rounded"
                            >
                              Usar
                            </button>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            {error && <p className="text-label text-danger-600">{error}</p>}
          </div>

          <footer className="flex items-center justify-between gap-3 px-5 py-4 border-t border-borde flex-wrap">
            <span className="text-label text-texto-2 tabular">
              {faltan > 0 && total === 0
                ? 'Sin precio todavía'
                : `Total ${formatearMoneda(total, 'USD')} · anticipo ${formatearMoneda(Math.round((total * anticipoBp) / 10000), 'USD')}`}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={guardar} disabled={!piezas || guardando}>
                {guardando ? 'Guardando…' : 'Guardar precios'}
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </Portal>
  );
};
