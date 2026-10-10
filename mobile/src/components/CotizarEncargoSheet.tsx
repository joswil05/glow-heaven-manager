import { useEffect, useId, useRef, useState } from 'react';
import type { VentaCompleta } from '@shared/types';
import { costoEstimadoDePieza, recalcularEncargo, sinPrecio } from '@core/encargos';
import { calcularPrecio } from '@core/precios';
import { formatearMoneda } from '@core/moneda';
import { analizar, armarPiezas, monto, pesoMlb, type Campo, type Errores, type Pieza } from '../lib/cotizacion-movil';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { enfocarPrimerError } from '../../../src/renderer/src/lib/enfocarPrimerError';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';
import { nuevoGrupoEvento } from '../lib/util';
import { BottomSheet } from './BottomSheet';
import { useSnackbar } from './Snackbar';

const campoClase = 'mt-1 min-h-12 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto outline-none focus:border-acento disabled:opacity-60';

export function CotizarEncargoSheet({ venta, onCerrar, onGuardado }: {
  venta: VentaCompleta | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const { parametros, marcarCambio } = useDatosNegocio();
  const { mostrar } = useSnackbar();
  const [piezas, setPiezas] = useState<Pieza[]>([]);
  const [inicial, setInicial] = useState('');
  const [errores, setErrores] = useState<Record<number, Errores>>({});
  const [errorGuardar, setErrorGuardar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);
  const formulario = useRef<HTMLDivElement>(null);
  const base = useRef(venta);
  const id = useId();
  const abierta = venta !== null;
  useEffect(() => {
    if (!venta) return;
    base.current = venta;
    const nuevas = armarPiezas(venta);
    setPiezas(nuevas);
    setInicial(JSON.stringify(nuevas));
    setErrores({});
    setErrorGuardar('');
    // Un refresco del mismo encargo no borra lo que está escribiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, venta?.id]);

  function cambiar(piezaId: number, campo: Campo, texto: string) {
    setPiezas((actuales) => actuales.map((pieza) => {
      if (pieza.original.id !== piezaId || pieza.fijo) return pieza;
      const nueva = { ...pieza, [campo]: texto, errorEstimacion: campo === 'costo' ? false : pieza.errorEstimacion };
      if (!pieza.costoReal && (campo === 'tienda' || campo === 'peso')) {
        const tienda = monto(nueva.tienda);
        const peso = pesoMlb(nueva.peso);
        if (tienda !== null && peso !== null) {
          const estimado = costoEstimadoDePieza({ tienda_usd_cents: tienda, peso_mlb: peso,
            tax_bp: parametros?.tax_bp ?? 700, tarifa_cents_lb: parametros?.tarifa_envio_cents_lb ?? 700 });
          nueva.errorEstimacion = !Number.isSafeInteger(estimado);
          if (!nueva.errorEstimacion) nueva.costo = (estimado / 100).toFixed(2);
        }
      }
      return nueva;
    }));
    setErrores((previos) => ({ ...previos, [piezaId]: { ...previos[piezaId], [campo]: undefined } }));
    setErrorGuardar('');
  }

  function alternarDescarte(piezaId: number) {
    haptics.selection();
    setPiezas((actuales) => actuales.map((pieza) => pieza.original.id === piezaId && pieza.puedeDescartar && !pieza.fijo
      ? { ...pieza, descartada: !pieza.descartada } : pieza));
    setErrores((previos) => ({ ...previos, [piezaId]: {} }));
    setErrorGuardar('');
  }

  async function guardar() {
    if (!venta || !base.current || ocupado.current) return;
    const analisis = analizar(piezas);
    setErrores(analisis.errores);
    if (!analisis.valido) {
      haptics.error();
      enfocarPrimerError(formulario.current);
      return;
    }
    haptics.impact('medium');
    ocupado.current = true;
    setGuardando(true);
    setErrorGuardar('');
    try {
      await VentasRepoFirestore.cotizar(venta.id, analisis.cambios, nuevoGrupoEvento());
      marcarCambio();
      mostrar('Cotización guardada', 'success');
      onGuardado();
      onCerrar();
    } catch (error) {
      setErrorGuardar(error instanceof Error ? error.message : 'No se pudo guardar la cotización. Intentá otra vez.');
    } finally {
      ocupado.current = false;
      setGuardando(false);
    }
  }

  const v = base.current ?? venta;
  const analisis = analizar(piezas);
  const resumen = v && analisis.valido ? recalcularEncargo(v, analisis.lineas, parametros?.anticipo_defecto_bp ?? 5000) : null;
  const hayCambios = JSON.stringify(piezas) !== inicial;
  if (!v) return null;
  // "Cotizar" si falta algún precio; si no, se están cambiando precios (como Windows).
  const titulo = `${v.lineas.some((l) => sinPrecio(l)) ? 'Cotizar' : 'Precios de'} ${v.codigo}`;
  return <BottomSheet abierto={abierta} titulo={titulo} subtitulo={v.cliente_nombre || 'Encargo'}
    onCerrar={() => { if (!ocupado.current) onCerrar(); }} hayCambios={hayCambios} ocupado={guardando}
    footer={<div className="flex flex-col gap-2">
      <p className="text-sm font-semibold tabular-nums text-texto-2">
        {resumen ? `Total ${formatearMoneda(resumen.total_usd_cents, 'USD')} · anticipo ${formatearMoneda(resumen.anticipo_esperado_usd_cents, 'USD')}` : 'Revisá los campos para calcular el total.'}
      </p>
      <button type="button" onClick={() => void guardar()} disabled={guardando || !hayCambios || piezas.every((p) => p.fijo)}
        className="min-h-12 rounded-xl bg-acento px-4 py-3 text-base font-bold text-acento-texto disabled:opacity-60">
        {guardando ? 'Guardando…' : 'Guardar cotización'}
      </button>
    </div>}>
    <div ref={formulario} className="flex flex-col gap-4 py-1">
      <p className="text-sm text-texto-2">El precio y el peso son por pieza. El costo incluye impuesto y flete estimados.</p>
      {piezas.map((pieza) => {
        const l = pieza.original;
        const error = errores[l.id] ?? {};
        const costo = monto(pieza.costo);
        const precio = monto(pieza.precio, true);
        const sugerido = costo !== null && costo > 0 ? calcularPrecio({ modo: 'MARGEN', costo_unitario_usd_cents: costo,
          margen_bp: parametros?.margen_defecto_bp ?? 4500, paso_redondeo_usd_cents: parametros?.paso_redondeo_usd_cents ?? 100 }).precio_usd_cents : 0;
        const ganancia = precio !== null && costo !== null && precio > 0 ? calcularPrecio({ modo: 'MANUAL',
          costo_unitario_usd_cents: costo, precio_manual_usd_cents: precio, paso_redondeo_usd_cents: 1 }) : null;
        const entrada = (campo: Campo, etiqueta: string, desactivado = false) => <div>
          <label htmlFor={`${id}-${l.id}-${campo}`} className="block text-sm font-semibold">{etiqueta}</label>
          <input id={`${id}-${l.id}-${campo}`} value={pieza[campo]} inputMode={campo === 'descripcion' ? 'text' : 'decimal'}
            autoComplete="off" disabled={guardando || desactivado} aria-invalid={Boolean(error[campo])}
            aria-describedby={error[campo] ? `${id}-${l.id}-${campo}-error` : undefined}
            onChange={(e) => cambiar(l.id, campo, e.target.value)} className={campoClase} />
          {error[campo] && <p id={`${id}-${l.id}-${campo}-error`} className="mt-1 text-sm text-peligro-fuerte">{error[campo]}</p>}
        </div>;
        return <fieldset key={l.id} className="min-w-0 rounded-xl border border-borde bg-superficie-2 px-3 pb-3">
          <legend className="max-w-full break-words px-1 text-sm font-bold">{l.descripcion || 'Pieza'}</legend>
          <p className="mb-3 mt-1 text-sm text-texto-2">{l.cantidad} {l.cantidad === 1 ? 'unidad' : 'unidades'}</p>
          {pieza.fijo ? <p className="text-sm text-texto-2">{formatearMoneda(l.precio_unitario_usd_cents, 'USD')} por pieza: ya lo aceptó la clienta.</p>
            : <div className="flex flex-col gap-3">
              {pieza.puedeDescartar && <button type="button" disabled={guardando} aria-pressed={pieza.descartada}
                onClick={() => alternarDescarte(l.id)} className={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-semibold ${pieza.descartada
                  ? 'border-borde-fuerte bg-superficie text-texto' : 'border-borde bg-superficie text-texto-2'}`}>
                No se consiguió
              </button>}
              {pieza.descartada ? <p className="text-sm text-texto-2">Sale del total. Su precio era {formatearMoneda(precio || l.precio_unitario_usd_cents, 'USD')} por pieza.</p>
                : <>
                  {entrada('descripcion', 'Qué quiere')}
                  <div className="grid grid-cols-2 gap-3">
                    {entrada('tienda', 'Precio en tienda ($)', pieza.costoReal)}
                    {entrada('peso', 'Peso por pieza (lb)', pieza.costoReal)}
                    {entrada('costo', 'Costo por pieza ($)', pieza.costoReal)}
                    {entrada('precio', 'Precio por pieza ($)')}
                  </div>
                  {pieza.costoReal && <p className="text-sm text-texto-2">Este es el costo real de lo que ya llegó; se conserva.</p>}
                  {Number.isSafeInteger(sugerido) && sugerido > 0 && sugerido !== precio && <button type="button" disabled={guardando}
                    onClick={() => { haptics.selection(); cambiar(l.id, 'precio', (sugerido / 100).toFixed(2)); }}
                    className="min-h-11 rounded-xl border border-borde bg-superficie px-3 py-2 text-left text-sm font-bold text-acento-fuerte">
                    Usar sugerido: {formatearMoneda(sugerido, 'USD')}
                  </button>}
                  {ganancia && <p className={`rounded-xl px-3 py-2 text-sm font-semibold tabular-nums ${ganancia.bajo_costo
                    ? 'bg-peligro-suave text-peligro-fuerte' : 'bg-acento-suave text-acento-fuerte'}`}>
                    {ganancia.bajo_costo ? `Perdés ${formatearMoneda(-ganancia.ganancia_usd_cents, 'USD')} por pieza.`
                      : `Ganancia por pieza: ${formatearMoneda(ganancia.ganancia_usd_cents, 'USD')}`}
                  </p>}
                </>}
            </div>}
        </fieldset>;
      })}
      {errorGuardar && <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">{errorGuardar}</p>}
    </div>
  </BottomSheet>;
}
