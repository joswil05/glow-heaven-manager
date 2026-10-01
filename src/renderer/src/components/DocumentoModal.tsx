import React, { useId, useMemo, useState } from 'react';
import { enlaceWhatsappDocumento } from '../../../core/documentos/mensajes';
import { X, Printer, MessageCircle, FileText, Download, Loader2 } from 'lucide-react';
import type { VentaCompleta, ParametrosSistema } from '../../../shared/types';
import { Button, Ventana } from './ui';
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
  const idTitulo = useId();

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

  const titulo = esEncargo ? 'Proforma' : 'Factura';

  const handleGuardarPdf = async () => {
    if (!venta) return;
    setGuardandoPdf(true);
    try {
      if (window.api?.documentos?.guardarPdf) {
        const res = await window.api.documentos.guardarPdf({
          html,
          nombreSugerido: `${esEncargo ? 'Cotizacion' : 'Factura'}-${venta.codigo}`,
        });
        if (res.success && res.data.guardado) {
          showToast({ message: 'PDF guardado', type: 'success' });
        } else if (!res.success) {
          showToast({ message: res.error || 'No se pudo generar el PDF', type: 'error' });
        }
      } else {
        imprimirHtml(html);
      }
    } catch {
      showToast({ message: 'No se pudo guardar el PDF', type: 'error' });
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
          showToast({ message: res.error || 'No se pudo imprimir', type: 'error' });
        }
      } else {
        imprimirHtml(html);
      }
    } catch {
      showToast({ message: 'No se pudo abrir la impresión', type: 'error' });
    } finally {
      setImprimiendo(false);
    }
  };

  const handleEnviarWhatsApp = () => {
    if (!venta) return;
    // El armado del mensaje vive en @core/documentos/mensajes: el celular
    // manda el mismo, y respeta las plantillas que se editan en Configuracion.
    window.open(enlaceWhatsappDocumento(venta, parametros ?? null), '_blank');
  };

  return (
    // Marco común: se nombra por su título, sale animada y devuelve el foco (DOC-08).
    <Ventana
      abierto={abierto && venta !== null}
      onCerrar={onCerrar}
      idTitulo={idTitulo}
      clasePanel="rounded-2xl max-w-4xl max-h-[92vh] overflow-hidden"
    >
      {(cerrar) => venta && (
      <>
        {/* Header con acciones principales */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-borde bg-superficie-2/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-acento/10 text-acento flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 id={idTitulo} className="text-body font-bold text-texto">
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
              onClick={cerrar}
              className="p-1.5 rounded-lg text-texto-3 hover:text-texto hover:bg-superficie-2 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.94] ml-2 cursor-pointer"
              aria-label="Cerrar"
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
              // Fuera del recorrido de Tab: adentro de un iframe las teclas son
              // de otro documento y el foco se escapaba a la pantalla de atrás.
              tabIndex={-1}
              className="w-full h-[68vh] min-h-[520px] border-0"
            />
          </div>
        </div>
      </>
      )}
    </Ventana>
  );
};
