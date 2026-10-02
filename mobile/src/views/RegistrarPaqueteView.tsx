import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { ComprasRepoFirestore, type GuardarCompraInput, type LineaCompraInput } from '@repos/compras.repo';
import { ProductosRepoFirestore } from '@repos/productos.repo';
import type { Compra, ProductoConStock } from '@shared/types';
import { formatearMoneda } from '@core/moneda';
import { parsearACentavos } from '@core/numeros';
import { precioParaCosto } from '@core/paquete';
import { margenEfectivo } from '@core/precios';
import { normalizar } from '@core/texto';
import { hoyISO, nuevoGrupoEvento } from '../lib/util';
import { haptics } from '../lib/haptics';
import { useDatosNegocio } from '../context/DataContext';
import { PiezaPaqueteSheet } from '../components/PiezaPaqueteSheet';
import { BottomSheet } from '../components/BottomSheet';

type Preview = Awaited<ReturnType<typeof ComprasRepoFirestore.previsualizar>>;
const campo = 'mt-1 min-h-12 w-full rounded-xl border border-borde bg-superficie px-3 py-2 text-base text-texto outline-none focus:border-acento';
const principal = 'min-h-12 rounded-xl bg-acento px-5 py-3 text-base font-bold text-acento-texto disabled:opacity-60';
const secundario = 'min-h-12 rounded-xl border border-borde bg-superficie px-4 py-3 text-base font-semibold text-texto disabled:opacity-60';

/** Borrador al avanzar; la mercadería entra únicamente al tocar Recibir. */
export function RegistrarPaqueteView({ onVolver }: { onVolver: () => void }) {
  const { parametros, categorias, recargarProductos, marcarCambio } = useDatosNegocio();
  const [paso, setPaso] = useState(1);
  const [fecha, setFecha] = useState(hoyISO);
  const [flete, setFlete] = useState('');
  const [impuesto, setImpuesto] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaCompraInput[]>([]);
  const [extras, setExtras] = useState<Pick<GuardarCompraInput, 'otros_costos_usd_cents' | 'peso_total_mlb'>>({});
  const [codigo, setCodigo] = useState('');
  const [borradores, setBorradores] = useState<Compra[]>([]);
  const [errorBorradores, setErrorBorradores] = useState('');
  const [reintento, setReintento] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [productos, setProductos] = useState<ProductoConStock[]>([]);
  const [hoja, setHoja] = useState(false);
  const [quitar, setQuitar] = useState<LineaCompraInput | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);
  const [exito, setExito] = useState(false);
  const id = useRef<number | undefined>(undefined);
  const proximaLinea = useRef(1);
  const ocupado = useRef(false);
  const formulario = useRef<HTMLElement>(null);

  useEffect(() => {
    let vivo = true;
    setErrorBorradores('');
    ComprasRepoFirestore.listar().then((lista) => {
      if (vivo) setBorradores(lista.filter((c) => c.activo && c.estado === 'BORRADOR'));
    }).catch(() => { if (vivo) setErrorBorradores('No se pudieron cargar los borradores.'); });
    return () => { vivo = false; };
  }, [reintento]);

  function entrada(nuevas = lineas): GuardarCompraInput | null {
    const envio = parsearACentavos(flete, { min: 0 });
    const tax = impuesto.trim() ? parsearACentavos(impuesto, { min: 0 }) : null;
    const fallas: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fallas.fecha = 'Elegí la fecha en que llegó.';
    if (envio === null || !Number.isSafeInteger(envio)) fallas.flete = 'Escribí cuánto pagaste de flete; si no pagaste, escribí 0.';
    if (impuesto.trim() && (tax === null || !Number.isSafeInteger(tax))) fallas.impuesto = 'Escribí un monto válido o dejalo vacío.';
    setErrores(fallas);
    if (Object.keys(fallas).length) {
      setPaso(1);
      requestAnimationFrame(() => formulario.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus());
      return null;
    }
    return { ...extras, id: id.current, fecha, envio_total_usd_cents: envio!, tax_total_override_usd_cents: tax, notas, lineas: nuevas };
  }

  async function guardar(input: GuardarCompraInput) {
    const numero = await ComprasRepoFirestore.guardar(input, nuevoGrupoEvento());
    id.current = numero;
    setCodigo(`PQ-${String(numero).padStart(4, '0')}`);
    setGuardado(true);
    return numero;
  }

  async function cambiarPaso(siguiente: number) {
    if (ocupado.current) return;
    if (siguiente === 3 && lineas.length === 0) {
      haptics.error(); setError('Agregá al menos una pieza antes de revisar.'); return;
    }
    const input = entrada();
    if (!input) { haptics.error(); return; }
    haptics.selection();
    ocupado.current = true; setGuardando(true); setError('');
    try {
      await guardar(input);
      if (siguiente === 3) {
        const [vista, lista] = await Promise.all([
          ComprasRepoFirestore.previsualizar(input),
          ProductosRepoFirestore.listar({ incluirInactivos: true }),
        ]);
        setPreview(vista); setProductos(lista);
      }
      setPaso(siguiente);
      formulario.current?.scrollTo({ top: 0 });
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el paquete.'); }
    finally { ocupado.current = false; setGuardando(false); }
  }

  async function agregar(linea: LineaCompraInput) {
    if (ocupado.current) throw new Error('Esperá a que termine de guardar.');
    const nuevas = [...lineas, { ...linea, id: proximaLinea.current }];
    const input = entrada(nuevas);
    if (!input) throw new Error('Revisá los datos del paquete.');
    ocupado.current = true; setGuardando(true);
    try {
      await guardar(input);
      proximaLinea.current++; setLineas(nuevas); setError('');
    } finally { ocupado.current = false; setGuardando(false); }
  }

  async function confirmarQuitar() {
    if (!quitar || ocupado.current) return;
    const nuevas = lineas.filter((l) => l.id !== quitar.id);
    const input = entrada(nuevas);
    if (!input) return;
    haptics.impact('medium');
    ocupado.current = true; setGuardando(true); setError('');
    try { await guardar(input); setLineas(nuevas); setQuitar(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo quitar la pieza.'); }
    finally { ocupado.current = false; setGuardando(false); }
  }

  async function continuar(numero: number) {
    if (ocupado.current) return;
    haptics.selection();
    ocupado.current = true; setGuardando(true); setError('');
    try {
      const compra = await ComprasRepoFirestore.getById(numero);
      if (!compra || compra.estado !== 'BORRADOR') throw new Error('Ese borrador ya no está disponible.');
      id.current = compra.id;
      setCodigo(compra.codigo); setFecha(compra.fecha);
      setFlete((compra.envio_total_usd_cents / 100).toFixed(2));
      setImpuesto(compra.tax_total_override_usd_cents == null ? '' : (compra.tax_total_override_usd_cents / 100).toFixed(2));
      setNotas(compra.notas ?? '');
      // Se conservan los datos que la PC ofrece y esta pantalla no edita.
      setExtras({ otros_costos_usd_cents: compra.otros_costos_usd_cents, peso_total_mlb: compra.peso_total_mlb });
      setLineas(compra.lineas.map((l) => ({ ...l, peso_linea_mlb: l.peso_estimado ? null : l.peso_linea_mlb })));
      proximaLinea.current = Math.max(0, ...compra.lineas.map((l) => l.id)) + 1;
      setErrores({}); setGuardado(true); setPaso(2);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir el borrador.'); }
    finally { ocupado.current = false; setGuardando(false); }
  }

  async function recibir() {
    if (ocupado.current || !id.current || !preview) return;
    haptics.impact('heavy');
    ocupado.current = true; setGuardando(true); setError('');
    try {
      await ComprasRepoFirestore.recibir(id.current, nuevoGrupoEvento());
      setExito(true);
      await recargarProductos(true);
      marcarCambio();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo recibir el paquete.'); }
    finally { ocupado.current = false; setGuardando(false); }
  }

  async function salir() {
    if (ocupado.current) return;
    haptics.selection();
    // Lo que ya se guardó sigue en BORRADOR; al salir se guarda la cabecera editada.
    if (!guardado && (flete || impuesto || notas || lineas.length)) {
      const input = entrada();
      if (!input) return;
      ocupado.current = true; setGuardando(true); setError('');
      try { await guardar(input); }
      catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el borrador.'); return; }
      finally { ocupado.current = false; setGuardando(false); }
    }
    onVolver();
  }

  function sugerido(linea: LineaCompraInput, costo: number) {
    const p = productos.find((p) => linea.producto_id ? p.id === linea.producto_id : normalizar(p.nombre) === normalizar(linea.descripcion));
    const costoMayor = Math.max(costo, ...(p?.lotes?.filter((l) => l.cantidad > 0).map((l) => l.costo_unitario_usd_cents) ?? []),
      ...(preview?.lineas.filter((c) => {
        const otra = lineas.find((l) => l.id === c.id);
        return otra && (linea.producto_id ? otra.producto_id === linea.producto_id : normalizar(otra.descripcion) === normalizar(linea.descripcion));
      }).map((c) => c.costo_unitario_usd_cents) ?? []));
    return precioParaCosto({
      modo_precio: p?.modo_precio ?? 'MARGEN', precio_venta_usd_cents: p?.precio_venta_usd_cents ?? 0,
      precio_manual_usd_cents: p?.precio_manual_usd_cents, multiplicador_bp: p?.multiplicador_bp,
      margen_bp: margenEfectivo(p ?? {}, categorias, parametros?.margen_defecto_bp ?? 4500),
    }, costoMayor, parametros?.paso_redondeo_usd_cents ?? 100);
  }

  if (exito) return <main className="flex h-full flex-col items-center justify-center gap-5 bg-fondo px-6 text-center text-texto">
    <span className="rounded-full bg-exito-suave p-5 text-exito-fuerte"><CheckCircle2 size={40} /></span>
    <div><h1 className="text-title font-extrabold">Ya está en el inventario</h1>
      <p className="mt-2 text-base text-texto-2">{codigo} · {preview?.unidades_totales} piezas recibidas.</p></div>
    <button type="button" disabled={guardando} className={`${principal} w-full max-w-sm`} onClick={() => { haptics.selection(); onVolver(); }}>Listo</button>
  </main>;

  return <div className="flex h-full min-h-0 flex-col bg-fondo text-texto">
    <header className="shrink-0 border-b border-borde bg-superficie px-4 pb-4 pt-safe-t">
      <div className="flex items-center gap-2 py-2">
        <button type="button" aria-label="Volver al inventario" disabled={guardando} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-borde" onClick={salir}><ArrowLeft size={20} /></button>
        <div><p className="text-caption font-bold uppercase tracking-widest text-texto-3">{codigo || 'Inventario'}</p>
          <h1 className="text-title font-extrabold">Llegó un paquete</h1></div>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="font-semibold">{paso} de 3 · {['El paquete', 'Las piezas', 'Revisar'][paso - 1]}</p>
        <span role="status" className="flex items-center gap-1 text-texto-2">{guardando ? 'Guardando…' : guardado ? <><Check size={14} /> Borrador guardado</> : 'Sin guardar'}</span>
      </div>
      <div aria-hidden="true" className="mt-3 flex gap-1.5">{[1, 2, 3].map((n) => <span key={n} className={`h-1 flex-1 rounded-full ${n <= paso ? 'bg-acento' : 'bg-borde'}`} />)}</div>
    </header>
    <main ref={formulario} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      {error && <p role="alert" className="rounded-xl border border-peligro-suave bg-peligro-suave p-3 text-sm text-peligro-fuerte">{error}</p>}
      {paso === 1 && <>
        {!id.current && !flete && !notas && !impuesto && borradores.length > 0 && <section className="rounded-2xl border border-borde bg-superficie p-4">
          <h2 className="font-bold">Tenés paquetes empezados</h2><p className="mt-1 text-sm text-texto-2">Podés seguir uno o cargar otro abajo.</p>
          {borradores.map((c) => <button type="button" key={c.id} disabled={guardando} onClick={() => continuar(c.id)} className="mt-2 min-h-12 w-full rounded-xl border border-borde px-3 py-2 text-left text-base font-semibold">Continuar {c.codigo}<span className="block text-sm font-normal text-texto-2">{c.fecha}{c.notas ? ` · ${c.notas}` : ''}</span></button>)}
        </section>}
        {!id.current && errorBorradores && <p role="alert" className="text-sm text-peligro-fuerte">{errorBorradores} <button type="button" className="min-h-11 underline" onClick={() => { haptics.selection(); setReintento((n) => n + 1); }}>Reintentar</button></p>}
        {([
          ['fecha', 'Fecha de llegada', fecha, setFecha, 'date'],
          ['flete', 'Flete pagado ($)', flete, setFlete, 'text'],
          ['impuesto', 'Impuesto del recibo ($)', impuesto, setImpuesto, 'text'],
        ] as const).map(([nombre, titulo, valor, cambiar, tipo]) => <div key={nombre}>
          <label className="block text-sm font-semibold">{titulo}<input className={campo} type={tipo} inputMode={tipo === 'text' ? 'decimal' : undefined}
            value={valor} disabled={guardando} onChange={(e) => {
              cambiar(e.target.value); setGuardado(false);
              setErrores((actual) => { const restantes = { ...actual }; delete restantes[nombre]; return restantes; });
            }}
            aria-invalid={Boolean(errores[nombre])} aria-describedby={`paquete-${nombre}-ayuda`} /></label>
          <p id={`paquete-${nombre}-ayuda`} className={`mt-1 text-sm ${errores[nombre] ? 'text-peligro-fuerte' : 'text-texto-2'}`}>{errores[nombre] ?? (nombre === 'impuesto' ? `Opcional. Vacío: se calcula el ${(parametros?.tax_bp ?? 700) / 100}%. Escribí 0 si no te cobraron impuesto.` : '')}</p>
        </div>)}
        <label className="block text-sm font-semibold">Notas <span className="font-normal text-texto-2">(opcional)</span>
          <textarea className={`${campo} min-h-24`} value={notas} disabled={guardando} onChange={(e) => { setNotas(e.target.value); setGuardado(false); }} /></label>
      </>}
      {paso === 2 && <>
        <div><h2 className="text-lg font-bold">¿Qué vino en el paquete?</h2><p className="mt-1 text-sm text-texto-2">Agregá cada producto con su cantidad. Todavía no entra a la bodega.</p></div>
        {lineas.length > 0 && <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">{lineas.map((l) => <li key={l.id} className="flex items-center gap-3 p-4">
          <div className="min-w-0 flex-1"><p className="font-bold">{l.descripcion}</p><p className="mt-1 text-sm text-texto-2">{l.cantidad} {l.cantidad === 1 ? 'unidad' : 'unidades'} · {formatearMoneda(l.precio_linea_usd_cents, 'USD')} en la tienda{l.destino === 'ENCARGO' ? ' · para encargo' : ''}</p></div>
          <button type="button" disabled={guardando} aria-label={`Quitar ${l.descripcion}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-borde text-texto-2" onClick={() => { haptics.selection(); setError(''); setQuitar(l); }}><Trash2 size={18} /></button>
        </li>)}</ul>}
        <button type="button" disabled={guardando} onClick={() => { haptics.selection(); setHoja(true); }} className={`${secundario} flex w-full items-center justify-center gap-2`}><Plus size={20} />Agregar pieza</button>
      </>}
      {paso === 3 && preview && <>
        <div><h2 className="text-lg font-bold">Así entra a la bodega</h2><p className="mt-1 text-sm text-texto-2">El costo ya incluye impuesto y flete. Revisá las piezas antes de recibir.</p></div>
        <ul className="space-y-3">{lineas.map((l) => {
          const calculada = preview.lineas.find((c) => c.id === l.id);
          if (!calculada) return null;
          return <li key={l.id} className="rounded-2xl border border-borde bg-superficie p-4">
            <div className="flex items-start justify-between gap-3"><h3 className="font-bold">{l.descripcion}</h3><span className="shrink-0 text-sm text-texto-2">{l.cantidad} {l.cantidad === 1 ? 'unidad' : 'unidades'}</span></div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-texto-2">Costo por unidad</dt><dd className="mt-1 text-lg font-bold">{formatearMoneda(calculada.costo_unitario_usd_cents, 'USD')}</dd></div>
              {l.destino === 'INVENTARIO' && <div><dt className="text-texto-2">Precio sugerido</dt><dd className="mt-1 text-lg font-bold">{formatearMoneda(sugerido(l, calculada.costo_unitario_usd_cents), 'USD')}</dd></div>}</dl>
            {l.destino === 'ENCARGO' && <p className="mt-2 text-sm text-texto-2">Para encargo: no suma existencias en bodega.</p>}
          </li>;
        })}</ul>
        <dl className="space-y-2 rounded-2xl border border-borde bg-superficie p-4 text-sm">
          {([['Mercadería', preview.subtotal_productos_usd_cents], ['Impuesto', preview.tax_total_usd_cents], ['Flete', preview.envio_total_usd_cents], ...(preview.otros_costos_usd_cents ? [['Otros costos', preview.otros_costos_usd_cents] as const] : [])] as const).map(([titulo, monto]) => <div key={titulo} className="flex justify-between gap-3"><dt className="text-texto-2">{titulo}</dt><dd className="font-semibold">{formatearMoneda(monto, 'USD')}</dd></div>)}
          <div className="flex justify-between gap-3 border-t border-borde pt-3 text-lg font-bold"><dt>Total del paquete</dt><dd>{formatearMoneda(preview.total_pagado_usd_cents, 'USD')}</dd></div>
        </dl>
        <p className="text-sm text-texto-2">{preview.criterio_flete === 'UNIDADES' ? 'Sin pesos conocidos, el flete se reparte por cantidad de unidades.' : preview.criterio_flete === 'PESO' ? 'El flete se reparte por peso entre las piezas.' : 'Este paquete no tiene flete.'} Los precios escritos a mano se conservan.</p>
      </>}
    </main>
    <footer className="flex shrink-0 gap-3 border-t border-borde bg-superficie p-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)' }}>
      {paso > 1 && <button type="button" disabled={guardando} className={secundario} onClick={() => cambiarPaso(paso - 1)}>Atrás</button>}
      <button type="button" disabled={guardando || !parametros} className={`${principal} flex flex-1 items-center justify-center gap-2`} onClick={paso === 3 ? recibir : () => cambiarPaso(paso + 1)}>
        {paso === 3 && <PackagePlus size={20} />}{guardando ? 'Guardando…' : paso === 3 ? 'Recibir' : 'Seguir'}
      </button>
    </footer>
    <PiezaPaqueteSheet abierto={hoja} onCerrar={() => setHoja(false)} onAgregar={agregar} />
    <BottomSheet abierto={quitar !== null} onCerrar={() => { if (!ocupado.current) setQuitar(null); }} titulo="Quitar del paquete"
      footer={<div className="flex gap-3"><button type="button" className={`${secundario} flex-1`} disabled={guardando} onClick={() => { haptics.selection(); setQuitar(null); }}>Conservar</button><button type="button" className={`${principal} flex-1`} disabled={guardando} onClick={confirmarQuitar}>{guardando ? 'Guardando…' : 'Quitar'}</button></div>}>
      <div className="space-y-3 p-4"><p className="text-base text-texto">Se quitará {quitar?.descripcion} de este borrador. Todavía no entró al inventario.</p>{error && <p role="alert" className="text-sm text-peligro-fuerte">{error}</p>}</div>
    </BottomSheet>
  </div>;
}
