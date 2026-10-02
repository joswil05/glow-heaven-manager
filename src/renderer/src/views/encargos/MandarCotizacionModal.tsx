import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ClienteDetalle, ParametrosSistema, VentaCompleta } from '../../../../shared/types';
import { Button, Dialogo, Field, Input, Textarea } from '../../components/ui';
import { mensajeWhatsappDocumento } from '@core/documentos/mensajes';
import { generarHtmlProforma } from '@core/documentos/plantillas';
import { formatearMoneda } from '@core/moneda';
import { mandarDocumento } from '../../lib/mandarDocumento';
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
 *
 * Si la clienta no tiene teléfono, se puede escribir acá y queda en su ficha
 * (ENC-22): antes el botón quedaba gris y el texto decía "Agregalo" sin decir
 * dónde. Sin teléfono, WhatsApp se abre para elegir el chat.
 */
interface MandarCotizacionModalProps {
  venta: VentaCompleta | null;
  parametros: ParametrosSistema | null;
  /** La clienta: su teléfono, y su ficha para guardarle uno si no tiene. */
  cliente?: ClienteDetalle | null;
  onMandada: (evento_grupo_id: string) => void;
  /** Después de guardarle un teléfono a la clienta. */
  onClienteCambiado?: () => void;
  onCerrar: () => void;
}

export const MandarCotizacionModal: React.FC<MandarCotizacionModalProps> = ({
  venta,
  parametros,
  cliente,
  onMandada,
  onClienteCambiado,
  onCerrar,
}) => {
  const telefono = cliente?.telefono;
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [errorTelefono, setErrorTelefono] = useState<string | null>(null);
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
    setTelefonoNuevo('');
    setErrorTelefono(null);
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
    if (!venta || guardando) return;
    setGuardando(true);
    setError(null);
    setErrorTelefono(null);
    try {
      // El teléfono escrito acá queda en su ficha, con el formato de siempre.
      let numero = telefono;
      if (!numero && cliente && telefonoNuevo.trim()) {
        const r = await window.api.clientes.guardar({
          id: cliente.id,
          nombre: cliente.nombre,
          alias: cliente.alias,
          telefono: telefonoNuevo,
          direccion: cliente.direccion,
          ciudad: cliente.ciudad,
          notas: cliente.notas,
        });
        if (!r.success) {
          setErrorTelefono(r.error);
          return;
        }
        numero = telefonoNuevo;
        onClienteCambiado?.();
      }
      // El mismo camino que la ventana de la proforma (DOC-07).
      const fallo = await mandarDocumento({
        codigo: venta.codigo,
        html,
        carpeta: 'Cotizaciones',
        telefono: numero,
        mensaje,
        parametros,
      });
      if (fallo) {
        setError(fallo);
        return;
      }
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
      hayCambios={mensaje !== inicial || telefonoNuevo.trim() !== ''}
      onCerrar={onCerrar}
      onEnviar={abrirWhatsApp}
      // "Cancelar" pregunta, como Escape, si hay algo escrito.
      pie={(cerrar) => (
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
              <Button variant="secondary" onClick={cerrar} disabled={guardando}>
                Cancelar
              </Button>
              <Button
                ref={abrirRef}
                variant="primary"
                onClick={abrirWhatsApp}
                disabled={guardando}
                className="min-w-[9rem]"
                autoFocus
              >
                {guardando ? 'Preparando…' : 'Abrir WhatsApp'}
              </Button>
            </div>
          </>
        )
      )}
    >
      {venta && (
        <>
          <p className="text-body text-texto-2">
            Para <strong className="text-texto">{venta.cliente_nombre ?? 'la clienta'}</strong>
            {telefono && <span className="tabular"> · {telefono}</span>}
          </p>

          {!telefono && cliente && (
            <Field
              label={`Teléfono de ${cliente.nombre}`}
              hint="Queda en su ficha. Sin teléfono, WhatsApp se abre para elegir el chat."
              error={errorTelefono ?? undefined}
            >
              <Input
                type="tel"
                value={telefonoNuevo}
                onChange={(e) => {
                  setTelefonoNuevo(e.target.value);
                  if (errorTelefono) setErrorTelefono(null);
                }}
                placeholder="8888 7777"
                className="tabular"
              />
            </Field>
          )}

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
