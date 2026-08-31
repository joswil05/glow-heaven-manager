import React, { useState, useEffect } from 'react';
import { X, Check, Image as ImageIcon } from 'lucide-react';
import type { Pedido, MetodoPago, TipoPago } from '../../../shared/types';
import { useToast } from '../context/ToastContext';
import { formatearMoneda } from '@core/moneda';

interface PagoModalProps {
  isOpen: boolean;
  onClose: () => void;
  pedido: Pedido;
  initialBuffer?: Uint8Array;
  onPaymentSuccess: () => void;
}

export const PagoModal: React.FC<PagoModalProps> = ({
  isOpen,
  onClose,
  pedido,
  initialBuffer,
  onPaymentSuccess,
}) => {
  const { showToast, showUndoToast } = useToast();

  const [moneda, setMoneda] = useState<'COR' | 'USD'>('COR');
  const [monto, setMonto] = useState<string>(() => {
    // Si no tiene anticipo verificado, sugerir el anticipo esperado
    if (!pedido.anticipo_verificado && pedido.anticipo_esperado_cor_cents > 0) {
      return (pedido.anticipo_esperado_cor_cents / 100).toFixed(2);
    }
    return (pedido.saldo_pendiente_cor_cents / 100).toFixed(2);
  });
  const [metodo, setMetodo] = useState<MetodoPago>('TRANSFERENCIA_BAC');
  const [referencia, setReferencia] = useState('');
  const [tipoPago, setTipoPago] = useState<TipoPago>(() => {
    return !pedido.anticipo_verificado ? 'ANTICIPO' : 'SALDO';
  });
  // Arranca en falso a propósito. Marcar un pago como verificado desbloquea
  // la compra en USA; tiene que ser un acto deliberado, no el valor por defecto.
  const [verificado, setVerificado] = useState(false);
  const [comprobanteBuffer, setComprobanteBuffer] = useState<Uint8Array | undefined>(initialBuffer);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (initialBuffer) {
      setComprobanteBuffer(initialBuffer);
      const blob = new Blob([new Uint8Array(initialBuffer)], { type: 'image/png' });
      setPreviewUrl(URL.createObjectURL(blob));
    }
  }, [initialBuffer]);

  // Listener para Ctrl+V dentro del modal
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const arrayBuffer = await file.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);
            setComprobanteBuffer(uint8);
            setPreviewUrl(URL.createObjectURL(file));
            showToast({ message: 'Comprobante pegado desde el portapapeles', type: 'info' });
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, showToast]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const montoFloat = parseFloat(monto);
    if (isNaN(montoFloat) || montoFloat <= 0) {
      showToast({ message: 'Ingrese un monto válido mayor a 0', type: 'error' });
      return;
    }

    try {
      setGuardando(true);
      const montoCents = Math.round(montoFloat * 100);

      const res = await window.api.pagos.create({
        pedido_id: pedido.id,
        monto_cents: montoCents,
        moneda_pago: moneda,
        metodo_pago: metodo,
        referencia: referencia.trim() || undefined,
        verificado,
        tipo_pago: tipoPago,
        buffer_comprobante: comprobanteBuffer,
        comprobante_nombre: `comprobante_${pedido.codigo}.png`,
      });

      if (res.success) {
        showUndoToast(
          `Pago de ${moneda === 'COR' ? 'C$' : '$'}${montoFloat.toFixed(2)} registrado (${
            verificado ? 'Verificado' : 'Pendiente'
          })`,
          () => onPaymentSuccess()
        );
        onPaymentSuccess();
        onClose();
      } else {
        showToast({ message: res.error.message, type: 'error' });
      }
    } catch {
      showToast({ message: 'Error al registrar el pago', type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold">Registrar Pago / Anticipo</h3>
            <span className="text-xs text-slate-400">
              Pedido: {pedido.codigo} • Saldo: {formatearMoneda(pedido.saldo_pendiente_cor_cents, 'COR')}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Tipo de Pago y Moneda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Concepto</label>
              <select
                value={tipoPago}
                onChange={(e) => setTipoPago(e.target.value as TipoPago)}
                className="w-full bg-slate-50 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
              >
                <option value="ANTICIPO">Anticipo</option>
                <option value="SALDO">Saldo contraentrega</option>
                <option value="COMPLETO">Pago completo (100%)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Moneda</label>
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value as 'COR' | 'USD')}
                className="w-full bg-slate-50 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
              >
                <option value="COR">C$ Córdobas</option>
                <option value="USD">$ Dólares</option>
              </select>
            </div>
          </div>

          {/* Monto */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Monto recibido</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">
                {moneda === 'COR' ? 'C$' : '$'}
              </span>
              <input
                type="number"
                step="0.01"
                required
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 text-base font-bold text-slate-900 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
              />
            </div>
          </div>

          {/* Método de pago */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Método</label>
              <select
                value={metodo}
                onChange={(e) => setMetodo(e.target.value as MetodoPago)}
                className="w-full bg-slate-50 px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
              >
                <option value="TRANSFERENCIA_BAC">Transferencia BAC</option>
                <option value="TRANSFERENCIA_BANPRO">Transferencia Banpro</option>
                <option value="TRANSFERENCIA_LAFISE">Transferencia Lafise</option>
                <option value="EFECTIVO">Efectivo en mano</option>
                <option value="OTRO">Otro método</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                No. Referencia (opcional)
              </label>
              <input
                type="text"
                value={referencia}
                onChange={(e) => setReferencia(e.target.value)}
                placeholder="Ej: 104928"
                className="w-full bg-slate-50 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
              />
            </div>
          </div>

          {/* Comprobante / Ctrl+V */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Comprobante de Pago
            </label>
            {previewUrl ? (
              <div className="relative p-2 bg-slate-100 rounded-2xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={previewUrl}
                    alt="Comprobante"
                    className="w-14 h-14 object-cover rounded-xl border border-slate-300"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-800">Comprobante adjunto</span>
                    <p className="text-[11px] text-slate-500">Pegado desde portapapeles</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewUrl(null);
                    setComprobanteBuffer(undefined);
                  }}
                  className="text-xs text-danger-500 hover:text-danger-700 font-semibold px-2 py-1"
                >
                  Quitar
                </button>
              </div>
            ) : (
              <div className="p-4 border-2 border-dashed border-slate-300 rounded-2xl text-center bg-slate-50">
                <ImageIcon className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                <p className="text-xs font-medium text-slate-600">
                  Presiona <kbd className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-mono">Ctrl+V</kbd> para pegar la captura aquí
                </p>
              </div>
            )}
          </div>

          {/* Checkbox de Verificación */}
          <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center gap-3">
            <input
              type="checkbox"
              id="verificado_cb"
              checked={verificado}
              onChange={(e) => setVerificado(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 border-slate-300"
            />
            <label htmlFor="verificado_cb" className="text-xs text-emerald-900 cursor-pointer">
              <span className="font-bold">Ya confirmé este pago en mi cuenta bancaria</span>
              <p className="text-[11px] text-emerald-700">
                Solo marcá esto si viste el dinero en el banco. Un anticipo verificado desbloquea la compra del producto en USA.
              </p>
            </label>
          </div>

          {/* Botones */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{guardando ? 'Guardando...' : 'Registrar Pago'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
