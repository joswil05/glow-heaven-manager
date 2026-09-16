import React, { useState, useEffect } from 'react';
import { useCerrarConEscape } from '../../lib/useCerrarConEscape';
import { X, Package, AlertTriangle } from 'lucide-react';
import type { CompraCompleta, ParametrosSistema, Venta } from '../../../../shared/types';
import { Button, Field, Input, Textarea, Money, Portal } from '../../components/ui';
import { parsearDecimal, parsearACentavos } from '@core/numeros';
import { formatearMoneda, formatearPeso } from '@core/moneda';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/cn';
import { formatearTextoGeneral } from '../../../../shared/formatoTexto';
import { hoyISO } from '@core/fechas';

interface PaqueteEditorProps {
  abierto: boolean;
  compra: CompraCompleta | null;
  encargosPendientes?: Venta[];
  parametros: ParametrosSistema | null;
  onCerrar: () => void;
  onGuardado: () => Promise<void>;
}

const num = (t: string): number => parsearDecimal(t) ?? 0;

export const PaqueteEditor: React.FC<PaqueteEditorProps> = ({
  abierto,
  compra,
  parametros,
  onCerrar,
  onGuardado,
}) => {
  const { showToast } = useToast();
  const esNuevo = compra === null;
  const tarifaLb = parametros?.tarifa_envio_cents_lb ?? 700;

  const [fecha, setFecha] = useState(() => hoyISO());
  const [pesoTotalTexto, setPesoTotalTexto] = useState('');
  const [envioTexto, setEnvioTexto] = useState('');
  const [envioManual, setEnvioManual] = useState(false);
  const [otrosTexto, setOtrosTexto] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setError(null);

    if (compra) {
      setFecha(compra.fecha);
      setPesoTotalTexto(compra.peso_total_mlb ? (compra.peso_total_mlb / 1000).toFixed(2) : '');
      setEnvioTexto((compra.envio_total_usd_cents / 100).toFixed(2));
      setEnvioManual(true);
      setOtrosTexto(
        compra.otros_costos_usd_cents > 0 ? (compra.otros_costos_usd_cents / 100).toFixed(2) : ''
      );
      setNotas(compra.notas ?? '');
    } else {
      setFecha(hoyISO());
      setPesoTotalTexto('');
      setEnvioTexto('');
      setEnvioManual(false);
      setOtrosTexto('');
      setNotas('');
    }
  }, [abierto, compra]);

  // Si cambia el peso y la persona no escribió el envío a mano, se calcula solo.
  useEffect(() => {
    if (!abierto || envioManual) return;
    const libras = num(pesoTotalTexto);
    if (libras > 0) {
      const envioCents = Math.round(libras * tarifaLb);
      setEnvioTexto((envioCents / 100).toFixed(2));
    } else {
      setEnvioTexto('');
    }
  }, [abierto, pesoTotalTexto, tarifaLb, envioManual]);

  // Este hook va ANTES del `return null`, no despues.
  //
  // React exige que cada render llame a los mismos hooks en el mismo orden.
  // Estaba mas abajo, del otro lado del return: mientras el modal estaba
  // abierto se llamaban todos, y al cerrarse el componente salia antes de
  // llegar a este. React detectaba menos hooks que en el render anterior,
  // lanzaba el error 300 y desmontaba el arbol entero: la ventana quedaba
  // en blanco y no habia forma de volver sin reiniciar la app.
  //
  // Y recibe `abierto` en vez de `true`: cerrado no tiene nada que escuchar.
  useCerrarConEscape(abierto, onCerrar);

  if (!abierto) return null;

  const pesoTotalMlbPreview = Math.round((parsearDecimal(pesoTotalTexto, { min: 0 }) ?? 0) * 1000);
  const envioCentsPreview = parsearACentavos(envioTexto, { min: 0 }) ?? 0;
  const otrosCentsPreview = parsearACentavos(otrosTexto, { min: 0 }) ?? 0;
  const totalCents = envioCentsPreview + otrosCentsPreview;

  const guardar = async () => {
    // 1. Validar peso si fue escrito
    let pesoTotalMlb = 0;
    if (pesoTotalTexto.trim()) {
      const pesoDec = parsearDecimal(pesoTotalTexto);
      if (pesoDec === null || pesoDec < 0) {
        setError('El peso del paquete no es un número válido mayor o igual a 0.');
        return;
      }
      pesoTotalMlb = Math.round(pesoDec * 1000);
    }

    // 2. Validar costo de envío si fue escrito
    let envioCents = 0;
    if (envioTexto.trim()) {
      const parsedEnvio = parsearACentavos(envioTexto, { min: 0 });
      if (parsedEnvio === null) {
        setError('El costo de envío no es un monto válido mayor o igual a $0.00.');
        return;
      }
      envioCents = parsedEnvio;
    }

    // 3. Validar otros gastos si fueron escritos
    let otrosCents = 0;
    if (otrosTexto.trim()) {
      const parsedOtros = parsearACentavos(otrosTexto, { min: 0 });
      if (parsedOtros === null) {
        setError('El costo de otros gastos no es un monto válido mayor o igual a $0.00.');
        return;
      }
      otrosCents = parsedOtros;
    }

    if (pesoTotalMlb === 0 && envioCents === 0) {
      setError('Escribí cuánto pesó el paquete o cuánto pagaste de envío.');
      return;
    }

    setGuardando(true);
    setError(null);

    try {
      const r = await window.api.compras.guardar({
        id: compra?.id,
        fecha,
        peso_total_mlb: pesoTotalMlb,
        envio_total_usd_cents: envioCents,
        otros_costos_usd_cents: otrosCents,
        tax_total_override_usd_cents: 0,
        notas: formatearTextoGeneral(notas) || undefined,
        lineas: [],
        estado: 'RECIBIDA',
      });

      if (!r.success) {
        setError(r.error);
        return;
      }

      showToast({
        message: esNuevo
          ? 'Paquete registrado. Ahora podés vincular sus productos desde Inventario.'
          : 'Paquete actualizado con éxito.',
        type: 'success',
      });

      await onGuardado();
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el paquete.');
    } finally {
      setGuardando(false);
    }
  };

  const alPresionarEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;

    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
      e.preventDefault();
      const contenedor = e.currentTarget;
      const campos = Array.from(
        contenedor.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([type="checkbox"]):not([disabled]), select:not([disabled])'
        )
      ).filter((el) => el.offsetParent !== null);

      const idx = campos.indexOf(target);
      if (idx !== -1 && idx + 1 < campos.length) {
        const siguiente = campos[idx + 1];
        siguiente.focus();
        if (siguiente instanceof HTMLInputElement) {
          siguiente.select?.();
        }
      } else {
        guardar();
      }
    }
  };


  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 cursor-pointer"
        role="dialog"
        aria-modal="true"
      aria-labelledby="titulo-paquete"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        onKeyDown={alPresionarEnter}
        onClick={(e) => e.stopPropagation()}
        className="bg-superficie rounded-2xl shadow-2xl w-full max-w-lg flex flex-col border border-borde/80 overflow-hidden animate-modal-pop cursor-default"
      >
        {/* Encabezado */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-borde shrink-0 bg-superficie">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-acento/10 text-acento-fuerte border border-acento/20 flex items-center justify-center shrink-0 shadow-xs">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 id="titulo-paquete" className="text-title text-texto">
                {esNuevo ? 'Registrar paquete' : `Editar ${compra!.codigo}`}
              </h3>
              <p className="text-caption text-texto-3">
                Factura y flete de la caja cobrado por el courier.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg text-texto-3 hover:text-texto">
            <X className="w-4 h-4" />
          </Button>
        </header>

        {/* Contenido del formulario */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3.5 shadow-xs"
            >
              <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-label text-danger-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Los números van alineados a la izquierda como todo lo demás.
                Alineados a la derecha, el texto de ejemplo flotaba contra el
                borde y parecía un valor ya escrito —sobre todo el "0.00" de
                otros gastos, que no se distinguía de una cifra de verdad. */}
            <Field label="Peso de la caja *" hint="En libras, el de la factura del courier">
              <Input
                value={pesoTotalTexto}
                onChange={(e) => {
                  setPesoTotalTexto(e.target.value);
                  setEnvioManual(false);
                }}
                placeholder="Ej. 11.5"
                className="font-medium font-mono"
                inputMode="decimal"
                autoFocus
              />
            </Field>

            <Field
              label="Flete pagado al courier *"
              hint={envioManual ? 'Escrito a mano' : `Calculado a ${formatearMoneda(tarifaLb, 'USD')} por libra`}
            >
              <Input
                value={envioTexto}
                onChange={(e) => {
                  setEnvioManual(true);
                  setEnvioTexto(e.target.value);
                }}
                placeholder="Ej. 77.00"
                className={cn('font-medium font-mono', !envioManual && 'text-acento-fuerte')}
                inputMode="decimal"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Las dos filas llevan pista para que queden de la misma altura:
                sin la de la fecha, la columna izquierda quedaba más corta. */}
            <Field label="Fecha de llegada" hint="La que dice la factura del courier">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>

            <Field label="Otros gastos" hint="Aduana, reempaque, etc.">
              <Input
                value={otrosTexto}
                onChange={(e) => setOtrosTexto(e.target.value)}
                placeholder="Ej. 5.00"
                className="font-mono"
                inputMode="decimal"
              />
            </Field>
          </div>

          <Field label="Notas">
            <Textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              onBlur={() => setNotas((prev) => formatearTextoGeneral(prev))}
              placeholder="Número de tracking, agencia courier, descripción de la caja..."
            />
          </Field>

          {/* El total, con la misma cara que el resumen del editor de ventas.
              Antes esto era una caja con degradado verde que no existe en
              ninguna otra pantalla, y que además compartía lugar con un
              párrafo de ayuda tres veces más largo que el número: lo que más
              pesaba en la ventana era lo que menos importaba.

              (El `p-4.5` que tenía no existe en Tailwind, así que el texto
              venía tocando el borde.) */}
          <div className="rounded-xl border border-borde bg-superficie-2/40 p-4 space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-label text-texto-2">Total a pagar al courier</span>
              {/* Apagado mientras está en cero: un monto en verde antes de
                  escribir nada es un número que todavía no quiere decir nada. */}
              <Money
                usd_cents={totalCents}
                size="md"
                soloUsd
                className={cn(
                  'text-lg font-bold',
                  totalCents > 0 ? 'text-acento-fuerte' : 'text-texto-3'
                )}
              />
            </div>

            {pesoTotalMlbPreview > 0 && (
              <div className="flex justify-between gap-3 border-t border-borde/60 pt-2.5 text-caption text-texto-3 font-mono">
                <span>Peso registrado: {formatearPeso(pesoTotalMlbPreview)}</span>
                <span>
                  {formatearMoneda(
                    Math.round((envioCentsPreview * 1000) / pesoTotalMlbPreview),
                    'USD'
                  )}
                  /lb efectivo
                </span>
              </div>
            )}
          </div>

          {/* La ayuda, afuera y en voz baja. Explica algo que pasa en OTRA
              pantalla, así que no puede tener el mismo peso que la plata de
              esta. */}
          <p className="text-caption leading-relaxed text-texto-3">
            Los productos se cargan desde <span className="font-medium text-texto-2">Inventario</span>,
            con el botón <span className="font-medium text-texto-2">Agregar producto</span>. Ahí le
            ponés fotos y tallas a cada prenda, y podés vincularla a este paquete para que cargue su
            parte del flete.
          </p>
        </div>

        {/* Pie de acción */}
        <footer className="flex items-center justify-end gap-2 px-6 py-4 border-t border-borde bg-superficie shrink-0">
          <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : esNuevo ? 'Guardar paquete' : 'Guardar cambios'}
          </Button>
        </footer>
      </div>
    </div>
    </Portal>
  );
};
