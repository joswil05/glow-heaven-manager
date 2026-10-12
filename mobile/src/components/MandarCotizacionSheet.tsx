import { useEffect, useRef, useState } from 'react';
import { Copy, Download, MessageCircle, RefreshCw } from 'lucide-react';
import type { VentaCompleta } from '@shared/types';
import { generarHtmlProforma } from '@core/documentos/plantillas';
import { enlaceWhatsappDocumento, mensajeWhatsappDocumento } from '@core/documentos/mensajes';
import { VentasRepoFirestore } from '@repos/ventas.repo';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';
import { SIN_RED, useExigirConexion } from '../lib/useExigirConexion';
import { imprimirDocumento } from '../lib/imprimir-documento';
import { nuevoGrupoEvento } from '../lib/util';
import { BottomSheet } from './BottomSheet';

interface Props {
  venta: VentaCompleta | null;
  onCerrar: () => void;
  onMandada: () => void;
}

/** Abrir una salida no confirma envío: sólo «Ya la mandé» escribe. */
export function MandarCotizacionSheet({ venta, onCerrar, onMandada }: Props) {
  const { parametros, marcarCambio } = useDatosNegocio();
  const [mostrada, setMostrada] = useState<VentaCompleta | null>(null);
  const [error, setError] = useState('');
  const exigirConexion = useExigirConexion();
  const [copiado, setCopiado] = useState(false);
  const [obsoleta, setObsoleta] = useState(false);
  const [accion, setAccion] = useState<'copiar' | 'guardar' | 'recargar' | 'imprimir' | null>(null);
  const accionEnCurso = useRef(false);
  const idAbierto = useRef<number | null>(null);
  const ventaViva = useRef(venta);
  ventaViva.current = venta;

  useEffect(() => {
    if (!venta) {
      idAbierto.current = null;
      setMostrada(null);
      return;
    }
    if (idAbierto.current === venta.id) return;
    idAbierto.current = venta.id;
    setMostrada(venta);
    setError('');
    setCopiado(false);
    setObsoleta(false);
  }, [venta]);

  const ocupado = accion !== null;
  const mensaje = mostrada ? mensajeWhatsappDocumento(mostrada, parametros) : '';
  const html = mostrada && parametros ? generarHtmlProforma(mostrada, parametros) : '';
  const sigueVisible = (id: number) => ventaViva.current?.id === id;

  async function copiar() {
    if (accionEnCurso.current || !mostrada) return;
    haptics.impact('light');
    accionEnCurso.current = true;
    setAccion('copiar');
    setError('');
    setCopiado(false);
    const id = mostrada.id;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Portapapeles no disponible');
      await navigator.clipboard.writeText(mensaje);
      if (sigueVisible(id)) setCopiado(true);
    } catch {
      if (sigueVisible(id)) setError('No se pudo copiar. Seleccioná el mensaje y copialo desde tu teléfono.');
    } finally {
      accionEnCurso.current = false;
      setAccion(null);
    }
  }

  async function confirmar() {
    if (accionEnCurso.current || !mostrada || obsoleta || mostrada.estado !== 'COTIZADA') return;
    // Copiar, WhatsApp e imprimir andan sin red; marcarla como mandada no (C3).
    if (!exigirConexion(SIN_RED.encargo, setError)) return;
    haptics.impact('medium');
    accionEnCurso.current = true;
    setAccion('guardar');
    setError('');
    const id = mostrada.id;
    try {
      await VentasRepoFirestore.marcarEnviada(id, nuevoGrupoEvento(), mostrada.cotizacion_version ?? 0);
      marcarCambio();
      if (sigueVisible(id)) {
        onMandada();
        onCerrar();
      }
    } catch (fallo) {
      if (sigueVisible(id)) {
        const texto = fallo instanceof Error ? fallo.message : 'No se pudo guardar el envío. Probá de nuevo.';
        setError(texto);
        if (texto.includes('La cotización cambió')) setObsoleta(true);
      }
    } finally {
      accionEnCurso.current = false;
      setAccion(null);
    }
  }

  async function recargar() {
    if (accionEnCurso.current || !mostrada) return;
    haptics.selection();
    accionEnCurso.current = true;
    setAccion('recargar');
    const id = mostrada.id;
    try {
      const actual = await VentasRepoFirestore.getById(id);
      if (!sigueVisible(id)) return;
      if (!actual || actual.tipo !== 'ENCARGO' || actual.estado !== 'COTIZADA') {
        setError('Este encargo cambió de estado. Cerrá esta hoja y volvé a verlo.');
        return;
      }
      setMostrada(actual);
      setCopiado(false);
      setObsoleta(false);
      setError('');
    } catch {
      if (sigueVisible(id)) setError('No se pudo cargar la cotización actualizada. Intentá otra vez.');
    } finally {
      accionEnCurso.current = false;
      setAccion(null);
    }
  }

  // Una acción en curso como las demás: un doble toque abría dos impresiones,
  // y un error tardío aparecía en otra cotización (revisión del 10/10).
  function imprimir() {
    if (accionEnCurso.current || !html || !mostrada) return;
    haptics.impact('medium');
    accionEnCurso.current = true;
    setAccion('imprimir');
    setError('');
    const id = mostrada.id;
    imprimirDocumento(
      html,
      (mensajeError) => {
        if (sigueVisible(id)) setError(mensajeError);
      },
      () => {
        accionEnCurso.current = false;
        setAccion(null);
      }
    );
  }

  return <BottomSheet abierto={venta !== null} onCerrar={onCerrar} titulo="Mandar cotización"
    subtitulo={mostrada ? `${mostrada.codigo} · ${mostrada.cliente_nombre || 'La clienta'}` : undefined}
    ocupado={ocupado}
    footer={<button type="button" disabled={ocupado || !mostrada || obsoleta || mostrada.estado !== 'COTIZADA'}
      onClick={() => void confirmar()}
      className="min-h-12 w-full rounded-xl bg-acento px-4 py-3 text-base font-bold text-acento-texto disabled:opacity-60">
      {accion === 'guardar' ? 'Guardando…' : 'Ya la mandé'}
    </button>}>
    {mostrada && <div className="flex flex-col gap-3 pb-1">
      <p className="text-sm text-texto-2">Copiá el mensaje y abrí WhatsApp. Si adjuntás la proforma, guardala primero como PDF.</p>
      <div className="rounded-xl border border-borde bg-superficie-2 p-3">
        <p className="mb-2 text-sm font-bold">Mensaje para la clienta</p>
        <p aria-label="Mensaje para la clienta" tabIndex={0}
          className="select-text whitespace-pre-wrap break-words text-sm leading-relaxed text-texto">{mensaje}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={ocupado} onClick={() => void copiar()}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-borde bg-superficie-2 px-3 py-2 text-sm font-semibold disabled:opacity-60">
          <Copy size={17} />{accion === 'copiar' ? 'Copiando…' : 'Copiar mensaje'}
        </button>
        <a href={enlaceWhatsappDocumento(mostrada, parametros)} target="_blank" rel="noreferrer"
          aria-disabled={ocupado} tabIndex={ocupado ? -1 : undefined}
          onClick={(evento) => {
            if (accionEnCurso.current) { evento.preventDefault(); return; }
            haptics.impact('light');
          }}
          className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border border-borde bg-superficie-2 px-3 py-2 text-sm font-semibold ${ocupado ? 'opacity-60' : ''}`}>
          <MessageCircle size={17} />WhatsApp
        </a>
      </div>
      {copiado && <p role="status" className="text-sm font-semibold text-success-800">Mensaje copiado</p>}
      <details className="rounded-xl border border-borde bg-superficie-2">
        <summary className="min-h-12 cursor-pointer px-3 py-3 text-sm font-semibold">Ver proforma</summary>
        {html && <iframe title="Vista previa de la proforma" srcDoc={html} sandbox="" tabIndex={-1}
          className="h-[420px] w-full border-t border-borde" />}
      </details>
      <button type="button" disabled={ocupado || !html} onClick={imprimir}
        className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-borde bg-superficie-2 px-3 py-2 text-sm font-semibold disabled:opacity-60">
        <Download size={17} />{accion === 'imprimir' ? 'Preparando…' : 'Guardar PDF'}
      </button>
      <p className="text-sm text-texto-2">Guardar PDF abre la impresión del teléfono: elegí Guardar como PDF y adjuntá el archivo en WhatsApp. Después tocá «Ya la mandé».</p>
      {error && <p role="alert" className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">{error}</p>}
      {obsoleta && <button type="button" disabled={ocupado} onClick={() => void recargar()}
        className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-borde bg-superficie-2 px-3 py-2 text-sm font-semibold disabled:opacity-60">
        <RefreshCw size={17} />{accion === 'recargar' ? 'Cargando…' : 'Ver cotización actualizada'}
      </button>}
    </div>}
  </BottomSheet>;
}
