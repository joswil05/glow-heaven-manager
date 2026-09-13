import { useState } from 'react';
import { DollarSign, MessageCircle, CheckCircle2, Loader2, CreditCard } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import { PagosRepoFirestore } from '@repos/pagos.repo';
import { formatearMoneda } from '@core/moneda';
import { parsearACentavos } from '@core/numeros';
import { nuevoGrupoEvento, hoyISO, linkWhatsapp } from '../lib/util';
import { useDatosNegocio } from '../context/DataContext';
import { useSnackbar } from './Snackbar';
import { haptics } from '../lib/haptics';
import type { MetodoPago, MonedaPago } from '@shared/types';

export interface VentaCobroItem {
  venta_id: number;
  codigo: string;
  cliente_nombre: string;
  cliente_telefono?: string;
  saldo_usd_cents: number;
}

interface AbonoModalSheetProps {
  venta: VentaCobroItem | null;
  onCerrar: () => void;
  onAbonoRegistrado: () => void;
}

export function AbonoModalSheet({ venta, onCerrar, onAbonoRegistrado }: AbonoModalSheetProps) {
  const { parametros } = useDatosNegocio();
  const { mostrar } = useSnackbar();

  const [moneda, setMoneda] = useState<MonedaPago>('COR');
  const [metodo, setMetodo] = useState<MetodoPago>('EFECTIVO');
  const [montoTexto, setMontoTexto] = useState('');
  const [referencia, setReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState<{
    montoFormateado: string;
    nuevoSaldoUsdCents: number;
  } | null>(null);

  const tasa = parametros?.tasa_cambio_cents ?? 3662;

  if (!venta) return null;

  const saldoCordobas = Math.round((venta.saldo_usd_cents * tasa) / 100);

  function llenarSaldoTotal() {
    haptics.impact('medium');
    if (moneda === 'COR') {
      setMontoTexto((saldoCordobas / 100).toFixed(2));
    } else {
      setMontoTexto((venta!.saldo_usd_cents / 100).toFixed(2));
    }
  }

  async function handleConfirmar() {
    if (!montoTexto.trim()) {
      haptics.error();
      mostrar('Escribe un monto para el abono.', 'error');
      return;
    }

    const centavos = parsearACentavos(montoTexto, { min: 1 });
    if (!centavos || centavos <= 0) {
      haptics.error();
      mostrar('Ingresa un monto válido mayor a 0.', 'error');
      return;
    }

    haptics.impact('heavy');
    setGuardando(true);
    try {
      const res = await PagosRepoFirestore.registrar(
        {
          venta_id: venta!.venta_id,
          fecha: hoyISO(),
          monto_cents: centavos,
          moneda,
          metodo,
          referencia: referencia.trim() || undefined,
        },
        nuevoGrupoEvento()
      );

      const montoFormateado = formatearMoneda(centavos, moneda);
      setExito({
        montoFormateado,
        nuevoSaldoUsdCents: res.saldo_usd_cents,
      });

      haptics.success();
      mostrar(`¡Abono de ${montoFormateado} registrado con éxito!`, 'success');
      onAbonoRegistrado();
    } catch (err: any) {
      haptics.error();
      console.error('[AbonoModalSheet] Error registrando abono:', err);
      mostrar(err?.message || 'No se pudo registrar el abono.', 'error');
    } finally {
      setGuardando(false);
    }
  }

  function handleCerrarTodo() {
    setExito(null);
    setMontoTexto('');
    setReferencia('');
    onCerrar();
  }

  return (
    <BottomSheet
      abierto={Boolean(venta)}
      onCerrar={handleCerrarTodo}
      titulo="Registrar Abono / Pago"
      subtitulo={`${venta.cliente_nombre} · Venta #${venta.codigo}`}
    >
      {exito ? (
        <div className="flex flex-col items-center text-center py-4 gap-4 animate-m3-fade">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-acento shadow-sm">
            <CheckCircle2 size={36} />
          </div>

          <div>
            <h3 className="text-xl font-bold text-texto">¡Abono registrado!</h3>
            <p className="text-sm text-texto-2 mt-1">
              Se recibieron <strong className="text-acento">{exito.montoFormateado}</strong> de {venta.cliente_nombre}.
            </p>
            <p className="text-xs text-texto-3 mt-1">
              Nuevo saldo pendiente:{' '}
              <strong className="text-texto-2 font-semibold">
                {formatearMoneda(exito.nuevoSaldoUsdCents, 'USD')}
              </strong>
            </p>
          </div>

          <div className="flex flex-col w-full gap-2 mt-2">
            {venta.cliente_telefono && (
              <a
                href={
                  linkWhatsapp(
                    venta.cliente_telefono,
                    `Hola ${venta.cliente_nombre}, confirmamos que recibimos tu abono de ${exito.montoFormateado} para la venta ${venta.codigo}. Tu nuevo saldo pendiente es ${formatearMoneda(
                      exito.nuevoSaldoUsdCents,
                      'USD'
                    )}. Muchas gracias por tu pago en Glow Heaven.`
                  ) ?? undefined
                }
                target="_blank"
                rel="noreferrer"
                className="tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 px-4 py-3.5 text-sm font-semibold text-white shadow-sm active:scale-[0.98] transition-transform"
              >
                <MessageCircle size={18} />
                Enviar recibo por WhatsApp
              </a>
            )}

            <button
              type="button"
              onClick={handleCerrarTodo}
              className="tocable flex w-full items-center justify-center rounded-2xl bg-superficie-2 px-4 py-3 text-sm font-semibold text-texto-2 active:scale-[0.98] transition-transform"
            >
              Listo
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 pb-6">
          {/* Tarjeta de saldo pendiente */}
          <div className="flex items-center justify-between rounded-2xl bg-superficie-2/80 border border-borde p-4">
            <div>
              <span className="text-xs font-medium text-texto-3">Saldo pendiente</span>
              <p className="text-xl font-bold text-texto tracking-tight">
                {formatearMoneda(venta.saldo_usd_cents, 'USD')}
              </p>
              <p className="text-xs text-texto-3">
                ≈ {formatearMoneda(saldoCordobas, 'COR')}
              </p>
            </div>
            <button
              type="button"
              onClick={llenarSaldoTotal}
              className="m3-press rounded-xl bg-acento-suave border border-acento-suave px-3 py-1.5 text-xs font-bold text-acento hover:bg-emerald-100 dark:hover:bg-emerald-900/60"
            >
              Pagar todo
            </button>
          </div>

          {/* Selector de Moneda y Método */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-texto-2">Moneda del abono</label>
              <div className="flex rounded-xl bg-superficie-2/90 p-1">
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setMoneda('COR');
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    moneda === 'COR' ? 'bg-white dark:bg-slate-700 text-acento shadow-sm' : 'text-texto-3'
                  }`}
                >
                  Córdobas (C$)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    setMoneda('USD');
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    moneda === 'USD' ? 'bg-white dark:bg-slate-700 text-acento shadow-sm' : 'text-texto-3'
                  }`}
                >
                  Dólares (US$)
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-texto-2">Método de pago</label>
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as MetodoPago)}
                className="w-full h-10 rounded-xl border border-borde bg-superficie px-3 text-xs font-medium text-texto outline-none focus:border-emerald-500"
              >
                <option value="EFECTIVO" className="dark:bg-slate-800 dark:text-white">Efectivo</option>
                <option value="TRANSFERENCIA" className="dark:bg-slate-800 dark:text-white">Transferencia</option>
                <option value="OTRO" className="dark:bg-slate-800 dark:text-white">Otro método</option>
              </select>
            </div>
          </div>

          {/* Campo de Monto */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-texto-2">
              Monto a abonar ({moneda === 'COR' ? 'C$' : 'US$'})
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-texto-3 font-bold text-sm">
                {moneda === 'COR' ? 'C$' : '$'}
              </span>
              <input
                type="number"
                step="any"
                inputMode="decimal"
                value={montoTexto}
                onChange={(e) => setMontoTexto(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-2xl border border-borde bg-superficie pl-10 pr-4 py-2.5 text-base font-bold text-texto placeholder:text-texto-3 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {/* Referencia opcional */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-texto-2">
              Referencia / Comprobante (opcional)
            </label>
            <input
              type="text"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="Ej. BAC #4829 o billete de 500"
              className="w-full rounded-xl border border-borde bg-superficie px-3.5 py-2.5 text-xs text-texto placeholder:text-texto-3 outline-none focus:border-emerald-500"
            />
          </div>

          {/* Botón de Confirmación */}
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={guardando}
            className="m3-press mt-2 tocable flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 active:scale-[0.98] disabled:opacity-50"
          >
            {guardando ? <Loader2 size={18} className="animate-spin" /> : <DollarSign size={18} />}
            {guardando ? 'Registrando en Firestore…' : 'Registrar Abono Ahora'}
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
