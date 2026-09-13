import React, { useState, useEffect } from 'react';
import { X, Package, AlertTriangle } from 'lucide-react';
import type { CompraCompleta, ParametrosSistema, Venta } from '../../../../shared/types';
import { Button, Field, Input, Textarea, Money, Portal } from '../../components/ui';
import { parsearDecimal, parsearACentavos } from '@core/numeros';
import { formatearMoneda, formatearPeso } from '@core/moneda';
import { useToast } from '../../context/ToastContext';
import { cn } from '../../lib/cn';
import { formatearTextoGeneral } from '../../../../shared/formatoTexto';

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
                {esNuevo ? 'Registrar paquete / envío' : `Editar ${compra!.codigo}`}
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
            <Field label="Peso de la caja (lb) *" hint="El de la factura del courier">
              <Input
                value={pesoTotalTexto}
                onChange={(e) => {
                  setPesoTotalTexto(e.target.value);
                  setEnvioManual(false);
                }}
                placeholder="Ej. 11.5"
                className="text-right font-medium font-mono"
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
                className={cn('text-right font-medium font-mono', !envioManual && 'text-acento-fuerte')}
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
                className="text-right font-mono"
                inputMode="decimal"
              />
            </Field>
          </div>

          <Field label="Notas y detalles del paquete">
            <Textarea
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              onBlur={() => setNotas((prev) => formatearTextoGeneral(prev))}
              placeholder="Número de tracking, agencia courier, descripción de la caja..."
            />
          </Field>

          {/* Tarjeta informativa y resumen de flete */}
          <div className="rounded-xl border border-acento/20 bg-gradient-to-br from-acento-suave/40 via-acento-suave/15 to-transparent p-4.5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between text-label">
              <span className="text-texto-2 font-medium">Total a pagar al courier:</span>
              <span className="text-lg font-bold text-acento-fuerte">
                <Money usd_cents={totalCents} size="md" soloUsd />
              </span>
            </div>

            {pesoTotalMlbPreview > 0 && (
              <div className="flex justify-between text-caption text-texto-3 pt-2 border-t border-borde/60 font-mono">
                <span>Peso registrado: {formatearPeso(pesoTotalMlbPreview)}</span>
                <span>
                  Tarifa efectiva:{' '}
                  {pesoTotalMlbPreview > 0
                    ? formatearMoneda(Math.round((envioCentsPreview * 1000) / pesoTotalMlbPreview), 'USD')
                    : '$0.00'}
                  /lb
                </span>
              </div>
            )}

            <p className="text-caption text-texto-2 leading-relaxed pt-1">
              <strong>¿Dónde se ingresan los productos?</strong> En la pestaña{' '}
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
    </Portal>
  );
};
