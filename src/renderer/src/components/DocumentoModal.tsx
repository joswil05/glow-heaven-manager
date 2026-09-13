import React, { useMemo, useState } from 'react';
import { X, Printer, MessageCircle, FileText, Download, Loader2 } from 'lucide-react';
import type { VentaCompleta, ParametrosSistema, CuentaBancaria } from '../../../shared/types';
import { Button, Portal } from './ui';
import { useToast } from '../context/ToastContext';
import {
  generarHtmlFactura,
  generarHtmlProforma,
  imprimirHtml,
} from '@core/documentos/plantillas';
import { formatearMoneda } from '@core/moneda';

interface DocumentoModalProps {
  abierto: boolean;
  venta: VentaCompleta | null;
  parametros: ParametrosSistema;
  onCerrar: () => void;
}

export const DocumentoModal: React.FC<DocumentoModalProps> = ({
  abierto,
  venta,
  parametros,
  onCerrar,
}) => {
  const { showToast } = useToast();
  const [guardandoPdf, setGuardandoPdf] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);

  React.useEffect(() => {
    if (!abierto) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [abierto, onCerrar]);

  // OJO: todos los hooks van ANTES de cualquier `return` condicional.
  //
  // Este `useMemo` vivía debajo del `if (!abierto || !venta) return null`.
  // Con el modal cerrado React contaba cuatro hooks y al abrirlo cinco, así
  // que lanzaba "Rendered more hooks than during the previous render" y la
  // pantalla se caía justo al pedir una factura o una proforma. Era la causa
  // de que la generación de documentos no funcionara.
  const esEncargo = venta?.tipo === 'ENCARGO';

  const html = useMemo(() => {
    if (!venta) return '';
    return esEncargo
      ? generarHtmlProforma(venta, parametros)
      : generarHtmlFactura(venta, parametros);
  }, [venta, parametros, esEncargo]);

  if (!abierto || !venta) return null;

  const titulo = esEncargo ? 'Cotización / Proforma' : 'Factura Comercial';

  const handleGuardarPdf = async () => {
    setGuardandoPdf(true);
    try {
      if (window.api?.documentos?.guardarPdf) {
        const res = await window.api.documentos.guardarPdf({
          html,
          nombreSugerido: `${esEncargo ? 'Cotizacion' : 'Factura'}-${venta.codigo}`,
        });
        if (res.success && res.data.guardado) {
          showToast({ message: 'Documento guardado como PDF en tu equipo', type: 'success' });
        } else if (!res.success) {
          showToast({ message: res.error || 'No se pudo generar el PDF', type: 'error' });
        }
      } else {
        imprimirHtml(html);
      }
    } catch {
      showToast({ message: 'Error al exportar PDF', type: 'error' });
    } finally {
      setGuardandoPdf(false);
    }
  };

  const handleImprimir = async () => {
    setImprimiendo(true);
    try {
      if (window.api?.documentos?.imprimir) {
        const res = await window.api.documentos.imprimir(html);
        if (!res.success) {
          showToast({ message: res.error || 'Error al enviar a la impresora', type: 'error' });
        }
      } else {
        imprimirHtml(html);
      }
    } catch {
      showToast({ message: 'Error al abrir diálogo de impresión', type: 'error' });
    } finally {
      setImprimiendo(false);
    }
  };

  const handleEnviarWhatsApp = () => {
    const telefonoRaw = venta.cliente?.telefono ?? '';
    const telefono = telefonoRaw.replace(/\D/g, '');
    const totalCs = Math.round((venta.total_usd_cents * (parametros?.tasa_cambio_cents ?? 3662)) / 100);

    const cuentasTxt = (parametros?.cuentas_bancarias ?? [])
      .map((c: CuentaBancaria) => `${c.banco} (${c.moneda}): ${c.numero}${c.titular ? ' - ' + c.titular : ''}`)
      .join('\n');

    let mensaje = '';
    if (esEncargo) {
      const plantilla =
        parametros?.plantilla_proforma_whatsapp ||
        '¡Hola {cliente}! ✨ Te compartimos la cotización de tu encargo en Glow Heaven 📦✈️\n\n' +
        '📋 Cotización: {codigo}\n' +
        '💰 Total estimado: {total_usd} (≈ {total_cs})\n' +
        '🔒 Anticipo requerido (50%): {anticipo}\n' +
        '🤝 Saldo contra entrega: {saldo}\n\n' +
        '{cuentas_bancarias}\n\n' +
        '¡Quedamos atentas a tu comprobante de transferencia para procesar tu orden! 💕';

      mensaje = plantilla
        .replace(/\{cliente\}/g, venta.cliente_nombre ?? 'Clienta')
        .replace(/\{codigo\}/g, venta.codigo)
        .replace(/\{total_usd\}/g, formatearMoneda(venta.total_usd_cents, 'USD'))
        .replace(/\{total_cs\}/g, formatearMoneda(totalCs, 'COR'))
        .replace(/\{anticipo\}/g, formatearMoneda(venta.anticipo_esperado_usd_cents, 'USD'))
        .replace(/\{saldo\}/g, formatearMoneda(venta.saldo_usd_cents, 'USD'))
        .replace(/\{cuentas_bancarias\}/g, cuentasTxt ? `Cuentas para depósito:\n${cuentasTxt}` : '');
    } else {
      const plantilla =
        parametros?.plantilla_factura_whatsapp ||
        '¡Hola {cliente}! ✨ Muchas gracias por tu compra en Glow Heaven 🛍️\n\n' +
        '📄 Factura: {codigo}\n' +
        '💵 Total: {total_usd} (≈ {total_cs})\n' +
        '{estado_pago}\n\n' +
        '{cuentas_bancarias}\n\n' +
        '¡Esperamos que disfrutes muchísimo tus prendas! 💖';

      const estadoPago =
        venta.saldo_usd_cents <= 0
          ? '✓ Pagado en su totalidad'
          : `⚠ Saldo pendiente: ${formatearMoneda(venta.saldo_usd_cents, 'USD')}`;

      mensaje = plantilla
        .replace(/\{cliente\}/g, venta.cliente_nombre ?? 'Clienta')
        .replace(/\{codigo\}/g, venta.codigo)
        .replace(/\{total_usd\}/g, formatearMoneda(venta.total_usd_cents, 'USD'))
        .replace(/\{total_cs\}/g, formatearMoneda(totalCs, 'COR'))
        .replace(/\{estado_pago\}/g, estadoPago)
        .replace(/\{cuentas_bancarias\}/g, cuentasTxt && venta.saldo_usd_cents > 0 ? `Cuentas bancarias:\n${cuentasTxt}` : '');
    }

    const url = telefono
      ? `https://wa.me/505${telefono.startsWith('505') ? telefono.slice(3) : telefono}?text=${encodeURIComponent(mensaje)}`
      : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

    window.open(url, '_blank');
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 cursor-pointer"
        role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-borde bg-superficie shadow-xl cursor-default overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header con acciones principales */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borde bg-superficie-2/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-acento/10 text-acento flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-body font-bold text-texto">
                {titulo} <span className="font-mono text-acento font-semibold">{venta.codigo}</span>
              </h2>
              <p className="text-caption text-texto-3">
                {venta.cliente_nombre || 'Mostrador'} · {formatearMoneda(venta.total_usd_cents, 'USD')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleEnviarWhatsApp}
              className="text-acento bg-acento/10 border-acento/30 hover:bg-acento/20"
            >
              <MessageCircle className="w-4 h-4 mr-1.5" />
              <span>WhatsApp</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleImprimir}
              disabled={imprimiendo}
              className="shadow-2xs"
            >
              {imprimiendo ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Printer className="w-4 h-4 mr-1.5" />
              )}
              <span>Imprimir</span>
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handleGuardarPdf}
              disabled={guardandoPdf}
              className="shadow-xs font-semibold"
            >
              {guardandoPdf ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1.5" />
              )}
              <span>Guardar PDF</span>
            </Button>

            <button
              type="button"
              onClick={onCerrar}
              className="p-1.5 rounded-lg text-texto-3 hover:text-texto hover:bg-superficie-2 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.94] ml-2 cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Visor de Documento */}
        <div className="flex-1 overflow-y-auto p-6 bg-superficie-2 dark:bg-superficie-3 flex justify-center">
          <div className="w-full max-w-[800px] bg-superficie rounded-xl shadow-md border border-borde overflow-hidden">
            <iframe
              srcDoc={html}
              title={`Vista previa ${venta.codigo}`}
              className="w-full h-[68vh] min-h-[520px] border-0"
            />
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
};
