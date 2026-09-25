import { useEffect, useState } from 'react';
import { MessageCircle, Download, Loader2, FileText } from 'lucide-react';
import type { VentaCompleta } from '@shared/types';
import { generarHtmlFactura, generarHtmlProforma } from '@core/documentos/plantillas';
import { enlaceWhatsappDocumento } from '@core/documentos/mensajes';
import { formatearMoneda } from '@core/moneda';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { BottomSheet } from './BottomSheet';
import { useDatosNegocio } from '../context/DataContext';
import { useSnackbar } from '../components/Snackbar';
import { haptics } from '../lib/haptics';

/**
 * Factura o proforma de una venta, desde el celular.
 *
 * Antes esto solo existía en Windows. Acá se ofrecen las mismas tres
 * acciones, para que la misma venta se maneje igual desde los dos lados:
 * verla, guardarla como PDF y mandarle el mensaje a la clienta.
 *
 * El PDF sale del diálogo de impresión del sistema, eligiendo "Guardar como
 * PDF": el archivo que se genera es el mismo documento en A4 que imprime
 * Windows, porque las dos apps usan la misma plantilla.
 */
export function DocumentoSheet({
  ventaId,
  onCerrar,
}: {
  ventaId: number | null;
  onCerrar: () => void;
}) {
  const { parametros } = useDatosNegocio();
  const { mostrar } = useSnackbar();
  const [venta, setVenta] = useState<VentaCompleta | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (ventaId === null) {
      setVenta(null);
      return;
    }
    let activo = true;
    setCargando(true);
    VentasRepoFirestore.getById(ventaId)
      .then((v) => {
        if (activo) setVenta(v);
      })
      .catch((err) => {
        console.error('[DocumentoSheet] Error cargando la venta:', err);
        if (activo) mostrar('No se pudo cargar el documento.', 'error');
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [ventaId, mostrar]);

  const esEncargo = venta?.tipo === 'ENCARGO';

  function html(): string {
    if (!venta || !parametros) return '';
    return esEncargo
      ? generarHtmlProforma(venta, parametros)
      : generarHtmlFactura(venta, parametros);
  }

  /**
   * Imprime desde un iframe oculto, no con `window.open`: en la PWA instalada
   * no hay una ventana real donde abrir un popup — es el mismo motivo por el
   * que fallaba el inicio de sesión.
   */
  function abrirImpresion() {
    const contenido = html();
    if (!contenido) return;
    haptics.impact('medium');

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    Object.assign(iframe.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: '0',
      height: '0',
      border: '0',
      visibility: 'hidden',
    });
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    if (!doc) {
      document.body.removeChild(iframe);
      mostrar('No se pudo preparar el documento.', 'error');
      return;
    }
    doc.open();
    doc.write(contenido);
    doc.close();

    // Se espera a que termine de maquetar y de cargar las fuentes: imprimir
    // antes saca la hoja a medio armar.
    const lanzar = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 60_000);
    };
    if (doc.readyState === 'complete') setTimeout(lanzar, 400);
    else iframe.onload = () => setTimeout(lanzar, 400);
  }

  return (
    <BottomSheet
      abierto={ventaId !== null}
      onCerrar={onCerrar}
      titulo={esEncargo ? 'Proforma' : 'Factura'}
      subtitulo={venta ? `${venta.codigo} · ${venta.cliente_nombre ?? 'Mostrador'}` : undefined}
      footer={
        venta ? (
          <div className="grid grid-cols-2 gap-2">
            <a
              href={enlaceWhatsappDocumento(venta, parametros)}
              target="_blank"
              rel="noreferrer"
              onClick={() => haptics.impact('light')}
              className="m3-press tocable flex items-center justify-center gap-2 rounded-2xl border border-borde bg-superficie-2 px-4 py-3 text-sm font-bold text-texto active:scale-[0.98] transition-transform"
            >
              <MessageCircle size={17} />
              WhatsApp
            </a>
            <button
              type="button"
              onClick={abrirImpresion}
              className="m3-press tocable flex items-center justify-center gap-2 rounded-2xl bg-acento px-4 py-3 text-sm font-bold text-acento-texto active:scale-[0.98] transition-transform cursor-pointer"
            >
              <Download size={17} />
              Guardar PDF
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {cargando && (
          <div className="flex items-center justify-center gap-2 py-8 text-texto-3">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-body">Preparando el documento…</span>
          </div>
        )}

        {venta && (
          <>
            <div className="rounded-2xl border border-borde bg-superficie-2 px-4 py-3">
              <span className="text-caption font-bold uppercase tracking-widest text-texto-3">
                {esEncargo ? 'Total cotizado' : 'Total de la factura'}
              </span>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="text-2xl font-black tabular-nums text-texto">
                  {formatearMoneda(venta.total_usd_cents, 'USD')}
                </span>
                <span className="text-sm font-bold tabular-nums text-texto-2">
                  {formatearMoneda(
                    Math.round(
                      (venta.total_usd_cents * (parametros?.tasa_cambio_cents ?? 3662)) / 100
                    ),
                    'COR'
                  )}
                </span>
              </div>
              <p className="mt-1.5 text-caption font-semibold text-texto-2">
                {venta.saldo_usd_cents <= 0
                  ? 'Pagado en su totalidad'
                  : `Saldo pendiente: ${formatearMoneda(venta.saldo_usd_cents, 'USD')}`}
              </p>
            </div>

            <ul className="flex flex-col divide-y divide-borde overflow-hidden rounded-2xl border border-borde">
              {venta.lineas.map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-3 bg-superficie px-4 py-2.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-texto-2">
                    {l.cantidad} × {l.descripcion}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-texto">
                    {formatearMoneda(l.subtotal_usd_cents, 'USD')}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex items-start gap-2.5 rounded-2xl border border-borde bg-superficie-2 px-4 py-3">
              <FileText size={17} className="mt-0.5 shrink-0 text-texto-3" />
              <p className="text-[11px] leading-relaxed text-texto-2">
                "Guardar PDF" abre el diálogo de impresión: elegí <strong>Guardar como PDF</strong>{' '}
                como destino y el archivo queda en tu teléfono, listo para adjuntar.
              </p>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
