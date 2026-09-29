import React, { useEffect, useRef, useState } from 'react';
import type { ParametrosSistema, Venta, VentaCompleta } from '../../../../shared/types';
import type { LineaCotizacion } from '../../../../shared/ipc-contracts';
import { Button, Dialogo, Field, Input } from '../../components/ui';
import { costoEstimadoDePieza, descartable, estadoPieza, sinPrecio } from '@core/encargos';
import { calcularPrecio } from '@core/precios';
import { formatearMoneda } from '@core/moneda';
import { parsearACentavos, parsearDecimal } from '@core/numeros';
import { resaltar } from '../../lib/resaltar';
import { cn } from '../../lib/cn';

/**
 * Ponerle precio a un encargo: cotizar un pedido que se anotó sin precio, o
 * corregir el de uno cotizado. Una pieza que no se encontró se marca "No se
 * consiguió": sale del total y la cotización sale con lo demás.
 *
 * Con el precio en la tienda y el peso se estima el costo (tienda + impuesto
 * + flete por libra) y se sugiere un precio con el margen de siempre. Una
 * pieza que ya llegó tiene su costo real y no se toca. En uno aceptado, el
 * precio que la clienta aceptó tampoco.
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
  /** "No se consiguió". */
  descartada: boolean;
  /** Se puede marcar "No se consiguió": no se compró. */
  puedeDescartar: boolean;
}

const aTexto = (cents?: number) => (cents && cents > 0 ? (cents / 100).toFixed(2) : '');
const centavos = (texto: string) => (texto.trim() ? (parsearACentavos(texto, { min: 0 }) ?? 0) : 0);

export const CotizarEncargoModal: React.FC<CotizarEncargoModalProps> = ({ venta, parametros, onGuardado, onCerrar }) => {
  const [piezas, setPiezas] = useState<Borrador[] | null>(null);
  const [inicial, setInicial] = useState('');
  /** El error de cada pieza, en su campo. */
  const [errores, setErrores] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const precioRefs = useRef(new Map<number, HTMLInputElement>());
  const descripcionRefs = useRef(new Map<number, HTMLInputElement>());

  // Las piezas hacen falta enteras: una venta de la lista viene sin líneas.
  useEffect(() => {
    if (!venta) return;
    setError(null);
    setErrores({});
    setPiezas(null);
    let vivo = true;
    const armar = (v: VentaCompleta) => {
      const lista = v.lineas.map<Borrador>((l) => ({
        id: l.id,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        tienda: aTexto(l.precio_tienda_usd_cents),
        peso: l.peso_mlb ? String(l.peso_mlb / 1000) : '',
        costo: aTexto(l.costo_unitario_usd_cents),
        precio: aTexto(l.precio_unitario_usd_cents),
        costoReal: estadoPieza(l) === 'LLEGO' || (l.lotes_consumidos?.length ?? 0) > 0,
        fijo: v.estado === 'PENDIENTE' && !sinPrecio(l) && !l.descartada_el,
        descartada: Boolean(l.descartada_el),
        puedeDescartar: Boolean(l.descartada_el) || descartable(l),
      }));
      setPiezas(lista);
      setInicial(JSON.stringify(lista));
    };
    if ('lineas' in venta && venta.lineas) {
      armar(venta);
    } else {
      window.api.ventas.get(venta.id).then((r) => {
        if (vivo && r.success && r.data) armar(r.data);
      });
    }
    return () => {
      vivo = false;
    };
  }, [venta]);

  // El foco va a la primera pieza que falta cotizar, cuando aparecen.
  // `autoFocus` sólo actúa al aparecer el campo, no a cada tecla.
  const primeraId = (piezas?.find((p) => !p.fijo && !p.descartada && !p.precio) ?? piezas?.find((p) => !p.fijo))?.id;

  const cambiar = (id: number, cambios: Partial<Borrador>) => {
    setErrores((e) => {
      if (!e[id]) return e;
      const { [id]: _quitado, ...resto } = e;
      return resto;
    });
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
  };

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

  const usarSugerido = (p: Borrador, precio: number) => {
    cambiar(p.id, { precio: aTexto(precio) });
    resaltar(precioRefs.current.get(p.id));
  };

  const lista = piezas ?? [];
  const vivas = lista.filter((p) => !p.descartada);
  const total = vivas.reduce((s, p) => s + centavos(p.precio) * p.cantidad, 0);
  const anticipoBp = venta?.anticipo_bp ?? parametros?.anticipo_defecto_bp ?? 5000;
  const faltan = vivas.filter((p) => !p.precio.trim()).length;
  const porCotizar = lista.some((p) => !p.fijo && !p.descartada && !aTexto(centavos(p.precio)));
  const hayCambios = piezas !== null && JSON.stringify(piezas) !== inicial;

  const guardar = async () => {
    if (!venta || !piezas || guardando) return;
    const nuevos: Record<number, string> = {};
    for (const p of lista) {
      if (p.fijo || p.descartada) continue;
      if (!p.descripcion.trim()) nuevos[p.id] = 'Escribí qué es.';
      else if (p.precio.trim() && parsearACentavos(p.precio, { min: 0.01 }) === null) {
        nuevos[p.id] = 'El precio tiene que ser mayor a $0, o quedar vacío.';
      }
    }
    if (Object.keys(nuevos).length > 0) {
      setErrores(nuevos);
      const primera = lista.find((p) => nuevos[p.id])!;
      (nuevos[primera.id] === 'Escribí qué es.' ? descripcionRefs : precioRefs).current.get(primera.id)?.focus();
      return;
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
        descartada: p.puedeDescartar ? p.descartada : undefined,
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
    <Dialogo
      abierto={Boolean(venta)}
      titulo={venta ? (porCotizar ? `Cotizar ${venta.codigo}` : `Precios de ${venta.codigo}`) : ''}
      ancho="xl"
      encima
      hayCambios={hayCambios}
      onCerrar={onCerrar}
      onEnviar={guardar}
      pie={
        <>
          <span className="text-label text-texto-2 tabular">
            {vivas.length === 0 && lista.length > 0
              ? 'No se consiguió nada'
              : faltan > 0 && total === 0
                ? 'Sin precio todavía'
                : `Total ${formatearMoneda(total, 'USD')} · anticipo ${formatearMoneda(Math.round((total * anticipoBp) / 10000), 'USD')}`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={guardar} disabled={!piezas || guardando} className="min-w-[9rem]">
              {guardando ? 'Guardando…' : 'Guardar precios'}
            </Button>
          </div>
        </>
      }
    >
      {!piezas ? (
        <p className="text-label text-texto-3">Cargando sus piezas…</p>
      ) : (
        lista.map((p, i) => {
          const sug = sugerido(p);
          const apagada = p.fijo || p.descartada;
          return (
            <div key={p.id} className="space-y-3">
              <div className="flex items-end gap-3">
                <Field label={lista.length > 1 ? `Pieza ${i + 1}` : 'Qué pidió'} className="flex-1 min-w-0" error={errores[p.id] === 'Escribí qué es.' ? errores[p.id] : undefined}>
                  <Input
                    ref={(el) => {
                      if (el) descripcionRefs.current.set(p.id, el);
                    }}
                    value={p.descripcion}
                    onChange={(e) => cambiar(p.id, { descripcion: e.target.value })}
                    disabled={apagada}
                    className={cn(p.descartada && 'line-through')}
                    aria-label={`Descripción de la pieza ${i + 1}`}
                    autoFocus={p.id === primeraId}
                  />
                </Field>
                {p.puedeDescartar && !p.fijo && (
                  <button
                    type="button"
                    aria-pressed={p.descartada}
                    onClick={() => cambiar(p.id, { descartada: !p.descartada })}
                    className={cn(
                      'h-9 px-3 rounded-md border text-label whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento',
                      p.descartada
                        ? 'border-borde-fuerte bg-superficie-2 text-texto font-medium'
                        : 'border-borde text-texto-3 hover:text-texto'
                    )}
                  >
                    No se consiguió
                  </button>
                )}
              </div>
              {p.fijo ? (
                <p className="text-caption text-texto-3 tabular">
                  {p.cantidad} × {formatearMoneda(centavos(p.precio), 'USD')}: ya lo aceptó la clienta.
                </p>
              ) : p.descartada ? (
                <p className="text-caption text-texto-3">Sale de la cotización. Se le avisa a la clienta que no se consiguió.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Field label="En la tienda ($)">
                    <Input
                      value={p.tienda}
                      onChange={(e) => cambiar(p.id, { tienda: e.target.value })}
                      placeholder="0.00"
                      className="text-right tabular"
                      disabled={p.costoReal}
                    />
                  </Field>
                  <Field label="Peso aprox. (lb)">
                    <Input
                      value={p.peso}
                      onChange={(e) => cambiar(p.id, { peso: e.target.value })}
                      placeholder="0.0"
                      className="text-right tabular"
                      disabled={p.costoReal}
                    />
                  </Field>
                  <Field label={p.costoReal ? 'Te costó ($)' : 'Costo ($)'}>
                    <Input
                      value={p.costo}
                      onChange={(e) => cambiar(p.id, { costo: e.target.value })}
                      placeholder="0.00"
                      className="text-right tabular"
                      disabled={p.costoReal}
                    />
                  </Field>
                  <Field label="Precio ($)" error={errores[p.id] && errores[p.id] !== 'Escribí qué es.' ? errores[p.id] : undefined}>
                    <Input
                      ref={(el) => {
                        if (el) precioRefs.current.set(p.id, el);
                      }}
                      value={p.precio}
                      onChange={(e) => cambiar(p.id, { precio: e.target.value })}
                      placeholder="Sin precio"
                      className="text-right font-medium tabular"
                      aria-label={`Precio de la pieza ${i + 1}`}
                    />
                  </Field>
                  {sug > 0 && centavos(p.precio) !== sug && (
                    <p className="col-span-2 sm:col-span-4 text-caption text-texto-3 text-right">
                      <span className="tabular">Sugerido {formatearMoneda(sug, 'USD')}</span>{' '}
                      <button
                        type="button"
                        onClick={() => usarSugerido(p, sug)}
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
    </Dialogo>
  );
};
