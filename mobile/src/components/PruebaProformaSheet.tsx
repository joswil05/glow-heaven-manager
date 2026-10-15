import { useEffect, useRef, useState } from 'react';
import type { ParametrosSistema, VentaCompleta } from '@shared/types';
import { generarHtmlProforma } from '@core/documentos/plantillas';
import { generarArchivoProforma } from '../lib/proforma-pdf';
import { haptics } from '../lib/haptics';
import { BottomSheet } from './BottomSheet';
import fixturesJson from '../../../tests/interfaz/fixtures-pdf.json';

interface Fixture { nombre: string; venta: VentaCompleta; parametros: ParametrosSistema; mensaje: string }
const fixtures = fixturesJson as unknown as Fixture[];
const boton = 'min-h-12 rounded-xl border border-borde bg-superficie px-4 py-3 text-base font-bold text-texto disabled:opacity-60';

/** Sólo se importa desde la entrada DEV de main.tsx. No escribe en la base. */
export function PruebaProformaSheet() {
  const [abierta, setAbierta] = useState(true);
  const [indice, setIndice] = useState(0);
  const [reintento, setReintento] = useState(0);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [preparando, setPreparando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [mensaje, setMensaje] = useState(fixtures[0].mensaje);
  const [compartiendo, setCompartiendo] = useState(false);
  const ocupado = useRef(false);
  const fixture = fixtures[indice];

  useEffect(() => {
    if (!abierta) return;
    let vivo = true;
    setArchivo(null); setPreparando(true); setError(''); setAviso('');
    generarArchivoProforma(fixture.venta, fixture.parametros)
      .then(file => { if (vivo) setArchivo(file); })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo generar el PDF.'); })
      .finally(() => { if (vivo) setPreparando(false); });
    return () => { vivo = false; };
  }, [fixture, abierta, reintento]);

  function descargar() {
    if (!archivo) return;
    haptics.impact('light');
    const url = URL.createObjectURL(archivo);
    const enlace = document.createElement('a');
    enlace.href = url; enlace.download = archivo.name;
    document.body.appendChild(enlace); enlace.click(); enlace.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function compartir() {
    if (!archivo || ocupado.current) return;
    haptics.impact('light');
    setAviso(''); setError('');
    if (!navigator.canShare?.({ files: [archivo] })) {
      setAviso('Este navegador no comparte archivos. Descargá el PDF y adjuntalo desde el teléfono.');
      return;
    }
    ocupado.current = true; setCompartiendo(true);
    try {
      // Sin await antes de share: ambos permisos nacen del mismo toque.
      const copia = navigator.clipboard?.writeText(mensaje).then(() => true, () => false)
        ?? Promise.resolve(false);
      const envio = navigator.share({ files: [archivo], text: mensaje });
      const [resultado, copiado] = await Promise.all([envio.then(() => true, e => e), copia]);
      const nota = copiado ? 'Mensaje copiado para pegarlo en WhatsApp.' : 'No se pudo copiar el mensaje; podés copiarlo con el botón de abajo.';
      if (resultado === true) setAviso(`Compartido. ${nota}`);
      else if (resultado?.name === 'AbortError') setAviso(`Compartir cancelado. ${nota}`);
      else throw resultado;
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo compartir el archivo.'); }
    finally { ocupado.current = false; setCompartiendo(false); }
  }

  async function copiar() {
    haptics.impact('light');
    try {
      if (!navigator.clipboard) throw new Error('El navegador no permite copiar. Seleccioná el mensaje y copialo.');
      await navigator.clipboard.writeText(mensaje);
      setAviso('Mensaje copiado para pegarlo en WhatsApp.');
    } catch { setAviso('No se pudo copiar. Seleccioná el mensaje y copialo.'); }
  }

  return <main className="min-h-screen bg-fondo px-5 py-8 text-texto">
    <h1 className="text-xl font-bold">Prueba del PDF · C2</h1>
    <p className="mt-3 text-base text-texto-2">Datos ficticios. Esta prueba no registra ni manda encargos.</p>
    <button className={`${boton} mt-5`} onClick={() => { haptics.selection(); setAbierta(true); }}>Abrir prueba de proforma</button>
    <BottomSheet abierto={abierta} titulo="Proforma de prueba" onCerrar={() => setAbierta(false)}
      ocupado={preparando || compartiendo} hayCambios={mensaje !== fixture.mensaje}
      footer={<div className="grid grid-cols-2 gap-2">
        <button className={boton} disabled={!archivo || compartiendo} onClick={descargar}>Descargar PDF de prueba</button>
        <button className={`${boton} bg-acento text-acento-texto`} disabled={!archivo || compartiendo} onClick={() => void compartir()}>{compartiendo ? 'Compartiendo…' : 'Compartir PDF de prueba'}</button>
      </div>}>
      <div className="flex flex-col gap-4">
        <label className="text-base font-semibold">Proforma de prueba
          <select aria-label="Proforma de prueba" value={indice} disabled={compartiendo || preparando}
            onChange={e => { haptics.selection(); const i = Number(e.target.value); setIndice(i); setMensaje(fixtures[i].mensaje); }}
            className="mt-1 min-h-12 w-full rounded-xl border border-borde bg-superficie px-3 text-base text-texto">
            {fixtures.map((f, i) => <option key={f.nombre} value={i}>{f.nombre === 'corta' ? 'Corta · abono y pieza descartada' : 'Larga · 35 piezas'}</option>)}
          </select>
        </label>
        {preparando && <p role="status" className="text-base text-texto-2">Preparando PDF…</p>}
        {archivo && <p role="status" className="text-base text-texto-2">PDF listo · {archivo.name} · {Math.ceil(archivo.size / 1024)} KB</p>}
        {error && <div className="rounded-xl bg-peligro-suave p-3 text-peligro-fuerte">
          <p role="alert">{error}</p>
          {!archivo && <button className={`${boton} mt-2`} onClick={() => { haptics.selection(); setReintento(n => n + 1); }}>Reintentar PDF</button>}
        </div>}
        {aviso && <p role="status" className="rounded-xl bg-superficie-2 p-3 text-base text-texto">{aviso}</p>}
        <label className="text-base font-semibold">Mensaje
          <textarea aria-label="Mensaje de prueba" value={mensaje} onChange={e => setMensaje(e.target.value)}
            className="mt-1 min-h-40 w-full rounded-xl border border-borde bg-superficie p-3 text-base text-texto" />
        </label>
        <p className="text-sm text-texto-2">WhatsApp puede descartar el texto cuando se adjunta un PDF. El resultado de compartir te dice si quedó copiado.</p>
        <button className={boton} onClick={() => void copiar()}>Copiar mensaje</button>
        <details><summary className="min-h-11 cursor-pointer py-2 text-base font-semibold">Ver la plantilla original</summary>
          <iframe title="Vista previa de proforma" srcDoc={generarHtmlProforma(fixture.venta, fixture.parametros)} className="h-96 w-full border border-borde" />
        </details>
      </div>
    </BottomSheet>
  </main>;
}
