import React, { useState, useEffect } from 'react';
import { X, Package, AlertTriangle } from 'lucide-react';
import type { CompraCompleta, ParametrosSistema, Venta } from '../../../../shared/types';
import { Button, Field, Input, Textarea, Money } from '../../components/ui';
import { parsearDecimal } from '@core/numeros';
import { formatearMoneda, formatearPeso } from '@core/moneda';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/cn';

interface PaqueteEditorProps {
  abierto: boolean;
  compra: CompraCompleta | null;
  encargosPendientes?: Venta[];
  parametros: ParametrosSistema | null;
  onCerrar: () => void;
  onGuardado: () => Promise<void>;
}

const num = (t: string): number => parsearDecimal(t) ?? 0;
const aCentavos = (t: string): number => Math.round(num(t) * 100);
const aMlb = (t: string): number => Math.round(num(t) * 1000);

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

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
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
      setFecha(new Date().toISOString().slice(0, 10));
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

  if (!abierto) return null;

  const pesoTotalMlb = aMlb(pesoTotalTexto);
  const envioCents = aCentavos(envioTexto);
  const otrosCents = aCentavos(otrosTexto);
  const totalCents = envioCents + otrosCents;

  const guardar = async () => {
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
        notas: notas.trim() || undefined,
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-velo/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-paquete"
    >
      <div
        onKeyDown={alPresionarEnter}
        className="bg-superficie rounded-xl shadow-2xl w-full max-w-lg flex flex-col border border-borde overflow-hidden animate-scale-in"
      >
        {/* Encabezado */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-borde shrink-0 bg-superficie">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-acento/10 text-acento-fuerte flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 id="titulo-paquete" className="text-title text-texto">
                {esNuevo ? 'Registrar paquete / envío' : `Editar ${compra!.codigo}`}
              </h3>
              <p className="text-caption text-texto-3">
                Factura y flete de la caja cobrado por el courier.
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar">
            <X className="w-4 h-4" />
          </Button>
        </header>

        {/* Contenido del formulario */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 p-3"
            >
              <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
              <p className="text-label text-danger-800">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Peso de la caja (lb) *" hint="El de la factura del courier">
              <Input
                value={pesoTotalTexto}
                onChange={(e) => {
                  setPesoTotalTexto(e.target.value);
                  setEnvioManual(false);
                }}
                placeholder="Ej. 11.5"
                className="text-right font-medium"
                inputMode="decimal"
                autoFocus
              />
            </Field>

            <Field
              label="Flete / Envío pagado ($) *"
              hint={envioManual ? 'Escrito a mano' : `${formatearMoneda(tarifaLb, 'USD')} por libra`}
            >
              <Input
                value={envioTexto}
                onChange={(e) => {
                  setEnvioManual(true);
                  setEnvioTexto(e.target.value);
                }}
                placeholder="Ej. 77.00"
                className={cn('text-right font-medium', !envioManual && 'text-acento-fuerte')}
                inputMode="decimal"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Fecha de llegada / factura">
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>

            <Field label="Otros gastos ($)" hint="Aduana, reempaque, etc.">
              <Input
                value={otrosTexto}
                onChange={(e) => setOtrosTexto(e.target.value)}
                placeholder="0.00"
                className="text-right"
                inputMode="decimal"
              />
            </Field>
          </div>

          <Field label="Notas y detalles del paquete">
            <Textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Número de tracking, agencia courier, descripción de la caja..."
            />
          </Field>

          {/* Tarjeta informativa y resumen de flete */}
          <div className="rounded-lg border border-acento/25 bg-acento-suave/20 p-4 space-y-3">
            <div className="flex items-center justify-between text-label">
              <span className="text-texto-2 font-medium">Total a pagar al courier:</span>
              <span className="text-lg font-bold text-acento-fuerte">
                <Money usd_cents={totalCents} size="md" soloUsd />
              </span>
            </div>

            {pesoTotalMlb > 0 && (
              <div className="flex justify-between text-caption text-texto-3 pt-2 border-t border-borde/60">
                <span>Peso registrado: {formatearPeso(pesoTotalMlb)}</span>
                <span>
                  Tarifa efectiva:{' '}
                  {pesoTotalMlb > 0
                    ? formatearMoneda(Math.round((envioCents * 1000) / pesoTotalMlb), 'USD')
                    : '$0.00'}
                  /lb
                </span>
              </div>
            )}

            <p className="text-caption text-texto-2 leading-relaxed pt-1">
              💡 <strong>¿Dónde se ingresan los productos?</strong> En la pestaña{' '}
              <strong>Inventario</strong> (botón <em>Agregar producto</em>). Allí podrás cargar cada
              prenda con sus fotos, tallas y vincularla a este paquete si deseas asociar su flete.
            </p>
          </div>
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
  );
};
