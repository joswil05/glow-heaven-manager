import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ParametrosSistema, VentaCompleta } from '../../../../shared/types';
import { Button, Dialogo, Field, Textarea } from '../../components/ui';
import { mensajeWhatsappDocumento } from '@core/documentos/mensajes';
import { generarHtmlProforma } from '@core/documentos/plantillas';
import { enlaceWhatsapp } from '@core/telefono';
import { formatearMoneda } from '@core/moneda';
import { cn } from '../../lib/cn';

/**
 * Mandarle la cotización a la clienta.
 *
 * "Abrir WhatsApp" guarda la proforma en PDF en Documentos/Glow Heaven/
 * Cotizaciones, abre esa carpeta con el archivo seleccionado (para
 * arrastrarlo al chat) y abre el chat con el mensaje. Después la marca como
 * mandada: el encargo pasa a "esperando respuesta". Si ella la mandó por otro
 * lado, "Ya la mandé" sólo la marca.
 *
 * El mensaje sale de la plantilla de Configuración y se puede cambiar para
 * este envío; la plantilla no cambia.
 */
interface MandarCotizacionModalProps {
  venta: VentaCompleta | null;
  parametros: ParametrosSistema | null;
  /** El teléfono de la clienta, de su ficha. */
  telefono?: string;
  onMandada: (evento_grupo_id: string) => void;
  onCerrar: () => void;
}

export const MandarCotizacionModal: React.FC<MandarCotizacionModalProps> = ({
  venta,
  parametros,
  telefono,
  onMandada,
  onCerrar,
}) => {
  const inicial = useMemo(() => (venta ? mensajeWhatsappDocumento(venta, parametros) : ''), [venta, parametros]);
  const [mensaje, setMensaje] = useState(inicial);
  const [verProforma, setVerProforma] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const abrirRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!venta) return;
    setMensaje(inicial);
    setVerProforma(false);
    setError(null);
  }, [venta, inicial]);

  const html = useMemo(() => (venta && parametros ? generarHtmlProforma(venta, parametros) : ''), [venta, parametros]);

  const marcar = async (): Promise<boolean> => {
    if (!venta) return false;
    const r = await window.api.ventas.marcarEnviada(venta.id);
    if (!r.success) {
      setError(r.error);
      return false;
    }
    onMandada(r.data.evento_grupo_id);
    return true;
  };

  const abrirWhatsApp = async () => {
    if (!venta || guardando || !telefono) return;
    setGuardando(true);
    setError(null);
    try {
      const pdf = await window.api.documentos?.prepararCotizacion({ codigo: venta.codigo, html });
      if (pdf && !pdf.success) {
        setError(pdf.error);
        return;
      }
      window.open(enlaceWhatsapp(telefono, mensaje, parametros?.codigo_pais_whatsapp), '_blank');
      if (await marcar()) onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  const yaLaMande = async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      if (await marcar()) onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      abierto={Boolean(venta)}
      titulo={venta ? `Mandar la cotización ${venta.codigo}` : ''}
      ancho="lg"
      hayCambios={mensaje !== inicial}
      onCerrar={onCerrar}
      onEnviar={abrirWhatsApp}
      pie={
        venta && (
          <>
            <button
              type="button"
              onClick={yaLaMande}
              disabled={guardando}
              className="text-label text-texto-2 hover:text-texto hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento rounded"
            >
              Ya la mandé por otro lado
            </button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onCerrar} disabled={guardando}>
                Cancelar
              </Button>
              <Button
                ref={abrirRef}
                variant="primary"
                onClick={abrirWhatsApp}
                disabled={guardando || !telefono}
                className="min-w-[9rem]"
                autoFocus
              >
                {guardando ? 'Preparando…' : 'Abrir WhatsApp'}
              </Button>
            </div>
          </>
        )
      }
    >
      {venta && (
        <>
          <p className="text-body text-texto-2">
            Para <strong className="text-texto">{venta.cliente_nombre ?? 'la clienta'}</strong>
            {telefono ? (
              <span className="tabular"> · {telefono}</span>
            ) : (
              <span>: no tiene teléfono en su ficha. Agregalo para abrir el chat, o mandala por otro lado.</span>
            )}
          </p>

          <Field label="Mensaje">
            <Textarea
              rows={9}
              value={mensaje}
              onChange={(e) => setMensaje(e.target.value)}
              aria-label="Mensaje para la clienta"
            />
          </Field>

          <p className="text-caption text-texto-3">
            La proforma se guarda en PDF y se abre su carpeta, para que la arrastres al chat.
          </p>

          <div>
            <button
              type="button"
              onClick={() => setVerProforma((v) => !v)}
              aria-expanded={verProforma}
              className="inline-flex items-center gap-1.5 text-label text-texto-2 hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento rounded"
            >
              <ChevronDown className={cn('w-4 h-4 transition-transform duration-150', verProforma && 'rotate-180')} />
              Ver la proforma · {formatearMoneda(venta.total_usd_cents, 'USD')}
            </button>
            {verProforma && (
              <iframe
                title="Vista previa de la proforma"
                srcDoc={html}
                className="mt-3 w-full h-[360px] rounded-lg border border-borde bg-white animate-fila-nueva"
              />
            )}
          </div>

          {error && <p className="text-label text-danger-600">{error}</p>}
        </>
      )}
    </Dialogo>
  );
};
