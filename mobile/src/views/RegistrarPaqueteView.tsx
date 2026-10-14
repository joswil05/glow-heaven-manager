import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardList, Info, PackagePlus, Plus, Trash2 } from 'lucide-react';
import { ComprasRepoFirestore, type GuardarCompraInput, type LineaCompraInput } from '@repos/compras.repo';
import { ProductosRepoFirestore } from '@repos/productos.repo';
import type { Compra, CompraCompleta, CompraLinea, EfectoIngreso, ProductoConStock, ResultadoIngreso, Venta } from '@shared/types';
import { formatearMoneda, formatearPeso } from '@core/moneda';
import { parsearACentavos, parsearDecimal } from '@core/numeros';
import { fleteDelPaquete, fleteDePeso, type EfectoEnProducto } from '@core/paquete';
import { formatearTextoGeneral } from '@shared/formatoTexto';
import { hoyISO, nuevoGrupoEvento } from '../lib/util';
import { haptics } from '../lib/haptics';
import { cargarEncargosEnCurso } from '../lib/encargos-movil';
import {
  calcularVista,
  claveDeLinea,
  claveDeProducto,
  consecuenciasDeRecibir,
  efectosDelPaquete,
  encargosQuePuedenVenir,
  lineaDeGuardada,
  nombreDeVariante,
  resumenParaRecibir,
  textoCantidad,
} from '../lib/paquete-movil';
import { useDatosNegocio } from '../context/DataContext';
import { useSnackbar } from '../components/Snackbar';
import { useConexion } from '../context/ConexionContext';
import { SIN_RED, useExigirConexion } from '../lib/useExigirConexion';
import { PiezaPaqueteSheet } from '../components/PiezaPaqueteSheet';
import { EditarPiezaSheet } from '../components/paquete/EditarPiezaSheet';
import { EncargosPaqueteSheet, type ModoEncargos } from '../components/paquete/EncargosPaqueteSheet';
import { BottomSheet } from '../components/BottomSheet';
import { campo, enfocarError, principal, secundario } from '../components/paquete/clases';

const $ = (c: number) => formatearMoneda(c, 'USD');
const PASOS = ['El paquete', 'Las piezas', 'Revisar'];

/**
 * "Llegó un paquete", o corregir uno que ya entró: lo mismo que el editor de
 * paquetes de la PC (`PaqueteEditor`), en tres pasos para el teléfono.
 *
 * Al cargarlo se guarda como borrador al avanzar y al agregar, cambiar o
 * quitar una pieza; la mercadería entra únicamente al confirmar "Recibir".
 * Corregir no guarda nada hasta confirmar: la diferencia sólo cambia el costo
 * de lo que sigue en bodega, como en la PC.
 */
export function RegistrarPaqueteView({
  onVolver,
  corregirId = null,
  volverA = 'al inventario',
}: {
  onVolver: () => void;
  corregirId?: number | null;
  /** Adónde lleva "Volver": se abre desde Inventario o desde Inicio. */
  volverA?: string;
}) {
  const { parametros, categorias, recargarProductos, marcarCambio } = useDatosNegocio();
  const { mostrarDeshacer } = useSnackbar();
  // Sin red no se guarda nada (C3): cada guardado lo dice junto a su botón.
  const { enLinea } = useConexion();
  const exigirConexion = useExigirConexion();
  /** Sin red, el primer "Volver" con algo sin guardar avisa; el segundo sale. */
  const avisoSalidaSinRed = useRef(false);
  const esCorreccion = corregirId !== null;
  const [paso, setPaso] = useState(esCorreccion ? 2 : 1);
  const [fecha, setFecha] = useState(hoyISO);
  /** Las libras de la caja: el flete sale de acá y de la tarifa de Configuración. */
  const [peso, setPeso] = useState('');
  /** Aduana, reempaque: de vez en cuando, por eso plegado. */
  const [otros, setOtros] = useState('');
  const [verOtros, setVerOtros] = useState(false);
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaCompraInput[]>([]);
  /** Sólo un paquete de antes del 11/10 trae el impuesto copiado del recibo. */
  const [taxRecibo, setTaxRecibo] = useState<number | null>(null);
  const [codigo, setCodigo] = useState('');
  const [borradores, setBorradores] = useState<Compra[]>([]);
  const [errorBorradores, setErrorBorradores] = useState('');
  const [reintento, setReintento] = useState(0);
  const [productos, setProductos] = useState<ProductoConStock[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(true);
  const [errorProductos, setErrorProductos] = useState('');
  const [reintentoProductos, setReintentoProductos] = useState(0);
  const [encargos, setEncargos] = useState<Venta[]>([]);
  /** De quién es cada encargo que viene en el paquete. */
  const [clientas, setClientas] = useState<Map<number, string>>(new Map());
  const [hojaPieza, setHojaPieza] = useState(false);
  const [editando, setEditando] = useState<LineaCompraInput | null>(null);
  const [hojaEncargos, setHojaEncargos] = useState<ModoEncargos | null>(null);
  const [quitar, setQuitar] = useState<LineaCompraInput | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [eliminar, setEliminar] = useState(false);
  const [salirSinGuardar, setSalirSinGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [guardado, setGuardado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoIngreso | null>(null);
  const [cargandoCorreccion, setCargandoCorreccion] = useState(esCorreccion);
  const [errorCorreccion, setErrorCorreccion] = useState('');
  const id = useRef<number | undefined>(undefined);
  const proximaLinea = useRef(1);
  const ocupado = useRef(false);
  const formulario = useRef<HTMLElement>(null);
  /** El flete y el peso con que se guardó el paquete que se retomó o se corrige. */
  const fleteGuardado = useRef<{ peso_total_mlb?: number | null; envio_total_usd_cents: number } | undefined>(undefined);
  /** Al corregir: las líneas como entraron. Ésas no se quitan ni cambian de cantidad. */
  const originales = useRef<Map<number, CompraLinea>>(new Map());
  const firmaInicial = useRef('');

  const tarifa = parametros?.tarifa_envio_cents_lb ?? 700;
  const taxBp = parametros?.tax_bp ?? 700;
  // Un paquete de antes, sin peso, conserva su flete aunque el campo quede vacío.
  const sinPesoGuardado = fleteGuardado.current !== undefined && !fleteGuardado.current.peso_total_mlb;
  const libras = !peso.trim() && sinPesoGuardado ? 0 : parsearDecimal(peso, { min: 0 });
  const pesoMlb = libras === null ? null : Math.round(libras * 1000);
  const flete = pesoMlb === null || !Number.isSafeInteger(pesoMlb) ? null : fleteDelPaquete(pesoMlb, tarifa, fleteGuardado.current);
  const otrosCents = otros.trim() ? parsearACentavos(otros, { min: 0 }) : 0;

  const firma = JSON.stringify([fecha, peso, otros, notas, lineas]);
  const hayCambiosCorreccion = esCorreccion && firmaInicial.current !== '' && firma !== firmaInicial.current;

  const productosPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const calc = useMemo(() => calcularVista(lineas, {
    tax_bp: taxBp,
    envio_total_usd_cents: flete ?? 0,
    otros_costos_usd_cents: otrosCents ?? 0,
    tax_total_override_usd_cents: taxRecibo,
    peso_total_mlb: pesoMlb ?? 0,
    pesoUnitario: (pid) => (pid ? productosPorId.get(pid)?.peso_unitario_mlb ?? 0 : 0),
    originales: esCorreccion ? originales.current : undefined,
  }), [lineas, taxBp, flete, otrosCents, taxRecibo, pesoMlb, productosPorId, esCorreccion]);
  const calcPorClave = useMemo(() => new Map(calc.lineas.map((c) => [c.clave, c])), [calc]);
  const efectos = useMemo(() => efectosDelPaquete(lineas, calc, productos, {
    categorias,
    margen_defecto_bp: parametros?.margen_defecto_bp ?? 4500,
    paso_redondeo_usd_cents: parametros?.paso_redondeo_usd_cents ?? 100,
  }, esCorreccion ? { compra_id: corregirId!, originales: originales.current } : undefined),
  [lineas, calc, productos, categorias, parametros, esCorreccion, corregirId]);
  const resumen = resumenParaRecibir(lineas, calc, efectos);

  function ayudaPeso(): string {
    const porLibra = `${$(tarifa)} la libra`;
    if (flete === null || pesoMlb === null) return `El flete se calcula a ${porLibra}.`;
    if (flete !== fleteDePeso(pesoMlb, tarifa)) {
      return `Flete: ${$(flete)}, como se guardó.${pesoMlb ? '' : ' Escribí las libras para calcularlo.'}`;
    }
    return `Flete: ${$(flete)}, a ${porLibra}.`;
  }

  useEffect(() => {
    let vivo = true;
    setCargandoProductos(true); setErrorProductos('');
    ProductosRepoFirestore.listar({ incluirInactivos: true })
      .then((lista) => { if (vivo) setProductos(lista); })
      .catch(() => { if (vivo) setErrorProductos('No se pudieron cargar los productos.'); })
      .finally(() => { if (vivo) setCargandoProductos(false); });
    return () => { vivo = false; };
  }, [reintentoProductos]);

  // Los encargos que pueden venir: si no se pueden leer, el paquete se carga igual.
  useEffect(() => {
    let vivo = true;
    cargarEncargosEnCurso()
      .then((lista) => { if (vivo) setEncargos(encargosQuePuedenVenir(lista)); })
      .catch(() => { /* sin encargos a mano: no se ofrecen */ });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (esCorreccion) return;
    let vivo = true;
    setErrorBorradores('');
    ComprasRepoFirestore.listar().then((lista) => {
      if (vivo) setBorradores(lista.filter((c) => c.activo && c.estado === 'BORRADOR'));
    }).catch(() => { if (vivo) setErrorBorradores('No se pudieron cargar los borradores.'); });
    return () => { vivo = false; };
  }, [reintento, esCorreccion]);

  /** Lo que la pantalla necesita de un paquete guardado, para seguirlo o corregirlo. */
  function cargarCompra(compra: CompraCompleta) {
    id.current = compra.id;
    setCodigo(compra.codigo); setFecha(compra.fecha);
    fleteGuardado.current = { peso_total_mlb: compra.peso_total_mlb, envio_total_usd_cents: compra.envio_total_usd_cents };
    const pesoTexto = compra.peso_total_mlb ? String(compra.peso_total_mlb / 1000) : '';
    const otrosTexto = compra.otros_costos_usd_cents > 0 ? (compra.otros_costos_usd_cents / 100).toFixed(2) : '';
    const notasTexto = compra.notas ?? '';
    const guardadas = compra.lineas.map(lineaDeGuardada);
    setPeso(pesoTexto); setOtros(otrosTexto); setVerOtros(Boolean(otrosTexto)); setNotas(notasTexto);
    setTaxRecibo(compra.tax_total_override_usd_cents ?? null);
    setLineas(guardadas);
    setClientas(new Map(compra.lineas.filter((l) => l.venta_id && l.cliente_nombre).map((l) => [l.venta_id!, l.cliente_nombre!])));
    originales.current = compra.estado === 'RECIBIDA' ? new Map(compra.lineas.map((l) => [l.id, l])) : new Map();
    proximaLinea.current = Math.max(0, ...compra.lineas.map((l) => l.id)) + 1;
    firmaInicial.current = JSON.stringify([compra.fecha, pesoTexto, otrosTexto, notasTexto, guardadas]);
  }

  useEffect(() => {
    if (corregirId === null) return;
    let vivo = true;
    ComprasRepoFirestore.getById(corregirId).then((compra) => {
      if (!vivo) return;
      if (!compra || compra.estado !== 'RECIBIDA') { setErrorCorreccion('Este paquete no está en el inventario: no hay nada que corregir.'); return; }
      if (compra.lineas.length === 0) {
        setErrorCorreccion('Este paquete es de antes de que los paquetes guardaran lo que traían. Completá su contenido en la computadora antes de corregirlo.');
        return;
      }
      cargarCompra(compra);
    }).catch(() => { if (vivo) setErrorCorreccion('No se pudo abrir el paquete. Revisá la conexión y volvé a intentarlo.'); })
      .finally(() => { if (vivo) setCargandoCorreccion(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corregirId]);

  function entrada(nuevas = lineas): GuardarCompraInput | null {
    const fallas: Record<string, string> = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) fallas.fecha = 'Elegí la fecha en que llegó.';
    if (flete === null) fallas.peso = 'Escribí cuántas libras pesó la caja; si no pagaste flete, escribí 0.';
    if (otrosCents === null || !Number.isSafeInteger(otrosCents)) fallas.otros = 'Escribí un monto en dólares, o dejalo vacío.';
    setErrores(fallas);
    if (Object.keys(fallas).length) {
      setPaso(1);
      if (fallas.otros) setVerOtros(true);
      enfocarError(formulario.current);
      return null;
    }
    // El impuesto es el porcentaje de Configuración (null): sólo un paquete de
    // antes conserva el del recibo que ya tenía. Los mismos campos que la PC.
    return {
      id: id.current, fecha, peso_total_mlb: pesoMlb!, envio_total_usd_cents: flete!, otros_costos_usd_cents: otrosCents!,
      tax_total_override_usd_cents: taxRecibo, notas: formatearTextoGeneral(notas) || undefined, lineas: nuevas,
    };
  }

  async function guardar(input: GuardarCompraInput) {
    // Pasar de paso, agregar, editar o quitar una pieza: todo guarda acá.
    if (!enLinea) throw new Error(SIN_RED.inventario);
    const numero = await ComprasRepoFirestore.guardar(input, nuevoGrupoEvento());
    id.current = numero;
    setCodigo(`PQ-${String(numero).padStart(4, '0')}`);
    setGuardado(true);
    return numero;
  }

  /** Cambia las líneas: el borrador se guarda en el momento; una corrección, al confirmar. */
  async function persistir(nuevas: LineaCompraInput[]) {
    if (ocupado.current) throw new Error('Esperá a que termine de guardar.');
    const input = entrada(nuevas);
    if (!input) throw new Error('Revisá los datos del paquete.');
    if (esCorreccion) { setLineas(nuevas); return; }
    ocupado.current = true; setGuardando(true);
    try {
      await guardar(input);
      setLineas(nuevas); setError('');
    } finally { ocupado.current = false; setGuardando(false); }
  }

  async function agregarLineas(entrantes: LineaCompraInput[]) {
    const desde = proximaLinea.current;
    await persistir([...lineas, ...entrantes.map((l, i) => ({ ...l, id: desde + i }))]);
    proximaLinea.current = desde + entrantes.length;
    const nombres = new Map(clientas);
    for (const l of entrantes) {
      const v = l.venta_id ? encargos.find((e) => e.id === l.venta_id) : undefined;
      if (v?.cliente_nombre) nombres.set(v.id, v.cliente_nombre);
    }
    setClientas(nombres);
  }

  const editarLinea = (cambiada: LineaCompraInput) => persistir(lineas.map((l) => (l.id === cambiada.id ? cambiada : l)));

  async function cambiarPaso(siguiente: number) {
    if (ocupado.current) return;
    if (siguiente === 3 && lineas.length === 0) {
      haptics.error(); setError('Agregá al menos una pieza antes de revisar.'); return;
    }
    const input = entrada();
    if (!input) { haptics.error(); return; }
    haptics.selection();
    if (esCorreccion) { setError(''); setPaso(siguiente); formulario.current?.scrollTo({ top: 0 }); return; }
    ocupado.current = true; setGuardando(true); setError('');
    try {
      await guardar(input);
      setPaso(siguiente);
      formulario.current?.scrollTo({ top: 0 });
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el paquete.'); }
    finally { ocupado.current = false; setGuardando(false); }
  }

  async function confirmarQuitar() {
    if (!quitar || ocupado.current) return;
    haptics.impact('medium');
    setError('');
    try { await persistir(lineas.filter((l) => l.id !== quitar.id)); setQuitar(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo quitar la pieza.'); }
  }

  async function continuar(numero: number) {
    if (ocupado.current) return;
    haptics.selection();
    ocupado.current = true; setGuardando(true); setError('');
    try {
      const compra = await ComprasRepoFirestore.getById(numero);
      if (!compra || compra.estado !== 'BORRADOR') throw new Error('Ese borrador ya no está disponible.');
      cargarCompra(compra);
      setErrores({}); setGuardado(true); setPaso(2);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir el borrador.'); }
    finally { ocupado.current = false; setGuardando(false); }
  }

  async function recibir() {
    if (ocupado.current || !id.current) return;
    if (!exigirConexion(SIN_RED.inventario, (m) => { setConfirmar(false); setError(m); })) return;
    haptics.impact('heavy');
    ocupado.current = true; setGuardando(true); setError('');
    try {
      const r = await ComprasRepoFirestore.recibir(id.current, nuevoGrupoEvento());
      setConfirmar(false); setResultado(r);
      await recargarProductos(true);
      marcarCambio();
    } catch (e) { setConfirmar(false); setError(e instanceof Error ? e.message : 'No se pudo recibir el paquete.'); }
    finally { ocupado.current = false; setGuardando(false); }
  }

  async function corregir() {
    if (ocupado.current || corregirId === null) return;
    const input = entrada();
    if (!input) { setConfirmar(false); haptics.error(); return; }
    if (!exigirConexion(SIN_RED.inventario, (m) => { setConfirmar(false); setError(m); })) return;
    haptics.impact('heavy');
    ocupado.current = true; setGuardando(true); setError('');
    try {
      const r = await ComprasRepoFirestore.corregir({ ...input, id: corregirId }, nuevoGrupoEvento());
      setConfirmar(false); setResultado(r);
      await recargarProductos(true);
      marcarCambio();
    } catch (e) { setConfirmar(false); setError(e instanceof Error ? e.message : 'No se pudo corregir el paquete.'); }
    finally { ocupado.current = false; setGuardando(false); }
  }

  async function eliminarBorrador() {
    if (ocupado.current || !id.current) return;
    if (!exigirConexion(SIN_RED.inventario, (m) => { setEliminar(false); setError(m); })) return;
    haptics.impact('medium');
    const grupo = nuevoGrupoEvento();
    ocupado.current = true; setGuardando(true); setError('');
    try {
      await ComprasRepoFirestore.archivar(id.current, grupo);
      mostrarDeshacer(`Paquete ${codigo} eliminado`, grupo, marcarCambio);
      marcarCambio();
      onVolver();
    } catch (e) { setEliminar(false); setError(e instanceof Error ? e.message : 'No se pudo eliminar el borrador.'); }
    finally { ocupado.current = false; setGuardando(false); }
  }

  async function salir() {
    if (ocupado.current) return;
    haptics.selection();
    if (esCorreccion) {
      if (hayCambiosCorreccion) setSalirSinGuardar(true); else onVolver();
      return;
    }
    // Lo que ya se guardó sigue en BORRADOR; al salir se guarda la cabecera editada.
    if (!guardado && (peso || otros || notas || lineas.length)) {
      if (!enLinea) {
        // Sin red el borrador no se puede guardar: nadie queda atrapado acá,
        // pero tampoco se pierde lo escrito sin saberlo.
        if (avisoSalidaSinRed.current) { onVolver(); return; }
        avisoSalidaSinRed.current = true;
        haptics.warning();
        setError('Sin conexión: lo último que escribiste no se pudo guardar. Tocá Volver otra vez para salir igual.');
        return;
      }
      const input = entrada();
      if (!input) return;
      ocupado.current = true; setGuardando(true); setError('');
      try { await guardar(input); }
      catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar el borrador.'); return; }
      finally { ocupado.current = false; setGuardando(false); }
    }
    onVolver();
  }

  const quitarError = (nombre: string) => setErrores((actual) => { const r = { ...actual }; delete r[nombre]; return r; });

  // --- Cómo se lee cada línea -------------------------------------------------

  const productoDe = (l: LineaCompraInput) => (l.producto_id ? productosPorId.get(l.producto_id) : undefined);
  function nombreDe(l: LineaCompraInput): string {
    const p = productoDe(l);
    const v = p?.tiene_variantes ? p.variantes.find((x) => x.id === l.variante_id) : undefined;
    const talla = v ? nombreDeVariante(v) : '';
    return talla ? `${l.descripcion} · ${talla}` : l.descripcion;
  }
  const bloqueada = (l: LineaCompraInput) => esCorreccion && l.id !== undefined && originales.current.has(l.id);
  function etiquetaDe(l: LineaCompraInput): string {
    if (l.destino === 'ENCARGO') {
      const clienta = l.venta_id ? clientas.get(l.venta_id) ?? encargos.find((v) => v.id === l.venta_id)?.cliente_nombre : undefined;
      return clienta ? `Encargo de ${clienta}` : 'Para un encargo';
    }
    if (bloqueada(l)) return 'Ya entró al inventario';
    const p = productoDe(l);
    if (!l.producto_id) return 'Nuevo: se crea al recibir';
    if (!p) return '';
    if (p.existencias > 0) return `Tenés ${p.existencias} en bodega`;
    return (p.paquetes ?? []).length > 0 ? 'Vendido' : 'Nuevo';
  }
  function detalleDe(l: LineaCompraInput): string {
    return [
      textoCantidad(l),
      `${$(l.precio_linea_usd_cents)} en la tienda`,
      l.exento ? 'sin impuesto' : '',
      l.peso_linea_mlb ? formatearPeso(l.peso_linea_mlb) : '',
    ].filter(Boolean).join(' · ');
  }
  /** El efecto de un producto se muestra en su primera línea, como en la PC. */
  function efectoDe(l: LineaCompraInput, i: number): EfectoEnProducto | undefined {
    const k = claveDeProducto(l, productos);
    if (!k || lineas.findIndex((x) => claveDeProducto(x, productos) === k) !== i) return undefined;
    return efectos.get(k);
  }

  // Las piezas compradas que esperan paquete y todavía no están en éste: lo
  // más probable es que hayan venido, y se ofrecen de una vez (como la PC).
  const esperando = esCorreccion ? [] : encargos.filter(
    (v) => (v.piezas?.esperan_paquete ?? 0) > 0 && !lineas.some((l) => l.venta_id === v.id)
  );
  const piezasEsperando = esperando.reduce((s, v) => s + (v.piezas?.esperan_paquete ?? 0), 0);

  /** Mercadería + impuesto + flete + otros = lo que salió el paquete, como el pie de la PC. */
  function totales() {
    const filas: [string, number][] = [
      ['Mercadería', calc.subtotal_productos_usd_cents],
      [taxRecibo === null ? `Impuesto (${taxBp / 100}%)` : 'Impuesto del recibo', calc.tax_total_usd_cents],
      ['Flete', calc.envio_total_usd_cents],
      ...(calc.otros_costos_usd_cents ? [['Otros gastos', calc.otros_costos_usd_cents] as [string, number]] : []),
    ];
    return <div className="rounded-2xl border border-borde bg-superficie p-4 text-sm">
      <dl className="space-y-2">
        {filas.map(([titulo, monto]) => <div key={titulo} className="flex justify-between gap-3"><dt className="text-texto-2">{titulo}</dt><dd className="font-semibold tabular-nums">{$(monto)}</dd></div>)}
        <div className="flex justify-between gap-3 border-t border-borde pt-3 text-lg font-bold"><dt>Total del paquete</dt><dd className="tabular-nums">{$(calc.total_pagado_usd_cents)}</dd></div>
      </dl>
      <p className="mt-2 text-texto-2">
        {resumen.unidades > 0 ? `${textoCantidad({ cantidad: resumen.unidades })} de ${resumen.productos} ${resumen.productos === 1 ? 'producto' : 'productos'} para la bodega` : 'Nada para la bodega'}
        {resumen.piezasEncargo > 0 ? ` · ${resumen.piezasEncargo === 1 ? '1 pieza' : `${resumen.piezasEncargo} piezas`} de encargo` : ''}
        {pesoMlb ? ` · ${formatearPeso(pesoMlb)}` : ''}
      </p>
    </div>;
  }

  const consecuencias = esCorreccion
    ? [
        'La diferencia sólo cambia el costo de lo que sigue en bodega; lo que ya se vendió conserva el costo con que salió.',
        ...(() => {
          const nuevas = lineas.filter((l) => l.destino === 'INVENTARIO' && !bloqueada(l)).reduce((s, l) => s + l.cantidad, 0);
          return nuevas > 0 ? [`Entran ${textoCantidad({ cantidad: nuevas })} que no se habían anotado.`] : [];
        })(),
        ...(resumen.cambianDePrecio > 0 ? [`${resumen.cambianDePrecio === 1 ? '1 producto cambia' : `${resumen.cambianDePrecio} productos cambian`} de precio.`] : []),
      ]
    : [...consecuenciasDeRecibir(resumen), 'Después ya no se edita: si algo quedó mal, se corrige.'];

  // --- Pantallas -----------------------------------------------------------------

  if (resultado) return <ResumenRecibido resultado={resultado} correccion={esCorreccion} onListo={() => { haptics.selection(); onVolver(); }} />;

  if (esCorreccion && (cargandoCorreccion || errorCorreccion)) {
    return <main className="flex h-full flex-col items-center justify-center gap-4 bg-fondo px-6 text-center text-texto">
      {cargandoCorreccion
        ? <p className="text-base text-texto-2">Abriendo el paquete…</p>
        : <><p role="alert" className="text-base text-texto">{errorCorreccion}</p>
          <button type="button" className={`${secundario} w-full max-w-sm`} onClick={() => { haptics.selection(); onVolver(); }}>Volver {volverA}</button></>}
    </main>;
  }

  const tituloPaso = esCorreccion ? `Corregir ${codigo}` : 'Llegó un paquete';
  const estado = esCorreccion
    ? (hayCambiosCorreccion ? 'Sin guardar' : 'Sin cambios')
    : guardando ? 'Guardando…' : guardado ? <><Check size={14} /> Borrador guardado</> : 'Sin guardar';

  return <div className="flex h-full min-h-0 flex-col bg-fondo text-texto">
    <header className="shrink-0 border-b border-borde bg-superficie px-4 pb-4 pt-safe-t">
      <div className="flex items-center gap-2 py-2">
        <button type="button" aria-label={`Volver ${volverA}`} disabled={guardando} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-borde" onClick={salir}><ArrowLeft size={20} /></button>
        <div><p className="text-caption font-bold uppercase tracking-widest text-texto-3">{codigo || 'Inventario'}</p>
          <h1 className="text-title font-extrabold">{tituloPaso}</h1></div>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm">
        <p className="font-semibold">{paso} de 3 · {PASOS[paso - 1]}</p>
        <span role="status" className="flex items-center gap-1 text-texto-2">{estado}</span>
      </div>
      <div aria-hidden="true" className="mt-3 flex gap-1.5">{[1, 2, 3].map((n) => <span key={n} className={`h-1 flex-1 rounded-full ${n <= paso ? 'bg-acento' : 'bg-borde'}`} />)}</div>
    </header>
    <main ref={formulario} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      {esCorreccion && <p className="flex gap-2 rounded-xl bg-alerta-suave p-3 text-sm text-alerta-fuerte"><Info size={18} className="shrink-0" aria-hidden="true" />La diferencia sólo cambia el costo de lo que sigue en bodega.</p>}
      {error && <p role="alert" className="rounded-xl border border-peligro-suave bg-peligro-suave p-3 text-sm text-peligro-fuerte">{error}</p>}

      {paso === 1 && <>
        {!esCorreccion && !id.current && !peso && !notas && borradores.length > 0 && <section className="rounded-2xl border border-borde bg-superficie p-4">
          <h2 className="font-bold">Tenés paquetes empezados</h2><p className="mt-1 text-sm text-texto-2">Podés seguir uno o cargar otro abajo.</p>
          {borradores.map((c) => <button type="button" key={c.id} disabled={guardando} onClick={() => continuar(c.id)} className="mt-2 min-h-12 w-full rounded-xl border border-borde px-3 py-2 text-left text-base font-semibold">Continuar {c.codigo}<span className="block text-sm font-normal text-texto-2">{c.fecha}{c.notas ? ` · ${c.notas}` : ''}</span></button>)}
        </section>}
        {!esCorreccion && !id.current && errorBorradores && <p role="alert" className="text-sm text-peligro-fuerte">{errorBorradores} <button type="button" className="min-h-11 underline" onClick={() => { haptics.selection(); setReintento((n) => n + 1); }}>Reintentar</button></p>}
        {([
          ['fecha', 'Fecha de llegada', fecha, setFecha, 'date'],
          ['peso', 'Peso de la caja (lb)', peso, setPeso, 'text'],
        ] as const).map(([nombre, titulo, valor, cambiar, tipo]) => <div key={nombre}>
          <label className="block text-sm font-semibold">{titulo}<input className={campo} type={tipo} inputMode={tipo === 'text' ? 'decimal' : undefined}
            value={valor} disabled={guardando} onChange={(e) => { cambiar(e.target.value); setGuardado(false); quitarError(nombre); }}
            aria-invalid={Boolean(errores[nombre])} aria-describedby={`paquete-${nombre}-ayuda`} /></label>
          <p id={`paquete-${nombre}-ayuda`} className={`mt-1 text-sm ${errores[nombre] ? 'text-peligro-fuerte' : 'text-texto-2'}`}>{errores[nombre] ?? (nombre === 'peso' ? ayudaPeso() : '')}</p>
        </div>)}
        {verOtros || otros.trim()
          ? <div>
              <label className="block text-sm font-semibold">Otros gastos ($)<input className={campo} inputMode="decimal" value={otros} placeholder="Aduana, reempaque"
                disabled={guardando} onChange={(e) => { setOtros(e.target.value); setGuardado(false); quitarError('otros'); }}
                aria-invalid={Boolean(errores.otros)} aria-describedby="paquete-otros-ayuda" /></label>
              <p id="paquete-otros-ayuda" className={`mt-1 text-sm ${errores.otros ? 'text-peligro-fuerte' : 'text-texto-2'}`}>{errores.otros ?? 'Se reparten entre las piezas por peso, como el flete.'}</p>
            </div>
          : <button type="button" disabled={guardando} onClick={() => { haptics.selection(); setVerOtros(true); }}
              className="flex min-h-11 items-center gap-2 text-base font-semibold text-acento-fuerte"><Plus size={18} />Otros gastos (aduana, reempaque)</button>}
        <label className="block text-sm font-semibold">Notas <span className="font-normal text-texto-2">(opcional)</span>
          <textarea className={`${campo} min-h-24`} value={notas} placeholder="Tienda, tracking" disabled={guardando} onChange={(e) => { setNotas(e.target.value); setGuardado(false); }} /></label>
        {!esCorreccion && id.current && <button type="button" disabled={guardando} onClick={() => { haptics.selection(); setError(''); setEliminar(true); }}
          className="flex min-h-11 items-center gap-2 text-base font-semibold text-peligro-fuerte"><Trash2 size={18} />Eliminar este borrador</button>}
      </>}

      {paso === 2 && <>
        <div><h2 className="text-lg font-bold">¿Qué vino en el paquete?</h2><p className="mt-1 text-sm text-texto-2">{esCorreccion
          ? 'Tocá una pieza para corregir lo que costó, el impuesto o el peso. Lo que se olvidó, agregalo.'
          : 'Agregá cada producto con su cantidad. Tocá una pieza para cambiarla. Todavía no entra a la bodega.'}</p></div>
        {piezasEsperando > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-acento-suave p-4">
          <p className="text-base text-acento-fuerte">{piezasEsperando === 1 ? 'Una pieza de encargo ya comprada espera paquete.' : `${piezasEsperando} piezas de encargos ya compradas esperan paquete.`}</p>
          <button type="button" disabled={guardando} onClick={() => { haptics.selection(); setHojaEncargos('esperando'); }}
            className="min-h-11 rounded-xl border border-borde bg-superficie px-4 text-base font-semibold text-texto">{piezasEsperando === 1 ? 'Agregarla' : 'Agregarlas'}</button>
        </div>}
        {lineas.length > 0 && <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">{lineas.map((l, i) => {
          const c = calcPorClave.get(claveDeLinea(l, i));
          return <li key={l.id ?? i} className="flex items-stretch">
            <button type="button" disabled={guardando} onClick={() => { haptics.selection(); setError(''); setEditando(l); }}
              className="flex min-w-0 flex-1 items-start gap-3 p-4 text-left">
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{nombreDe(l)}</span>
                <span className="mt-1 block text-sm text-texto-2">{detalleDe(l)}</span>
                {etiquetaDe(l) && <span className="mt-1 block text-sm text-texto-3">{etiquetaDe(l)}</span>}
              </span>
              {c && <span className="shrink-0 text-right text-sm"><span className="block font-bold tabular-nums">{$(c.costo_unitario_usd_cents)}</span><span className="text-texto-2">c/u</span></span>}
            </button>
            {!bloqueada(l) && <button type="button" disabled={guardando} aria-label={`Quitar ${l.descripcion}`} className="flex w-12 shrink-0 items-center justify-center border-l border-borde text-texto-2" onClick={() => { haptics.selection(); setError(''); setQuitar(l); }}><Trash2 size={18} /></button>}
          </li>;
        })}</ul>}
        <div className="grid gap-3">
          <button type="button" disabled={guardando} onClick={() => { haptics.selection(); setHojaPieza(true); }} className={`${secundario} flex w-full items-center justify-center gap-2`}><Plus size={20} />Agregar pieza</button>
          {encargos.length > 0 && <button type="button" disabled={guardando} onClick={() => { haptics.selection(); setHojaEncargos('lista'); }} className={`${secundario} flex w-full items-center justify-center gap-2`}><ClipboardList size={20} />Agregar encargo</button>}
        </div>
        {lineas.length > 0 && totales()}
      </>}

      {paso === 3 && <>
        <div><h2 className="text-lg font-bold">Así entra a la bodega</h2><p className="mt-1 text-sm text-texto-2">El costo ya incluye impuesto y flete. Revisá las piezas antes de {esCorreccion ? 'guardar la corrección' : 'recibir'}.</p></div>
        {cargandoProductos && <p className="text-sm text-texto-2">Cargando los precios…</p>}
        {errorProductos && <p role="alert" className="text-sm text-peligro-fuerte">{errorProductos} <button type="button" className="min-h-11 underline" onClick={() => { haptics.selection(); setReintentoProductos((n) => n + 1); }}>Reintentar</button></p>}
        <ul className="space-y-3">{lineas.map((l, i) => {
          const c = calcPorClave.get(claveDeLinea(l, i));
          if (!c) return null;
          const efecto = l.destino === 'INVENTARIO' ? efectoDe(l, i) : undefined;
          const estrena = efecto && efecto.existencias_antes === 0 && efecto.costo_antes_usd_cents === 0;
          return <li key={l.id ?? i} className="rounded-2xl border border-borde bg-superficie p-4">
            <div className="flex items-start justify-between gap-3"><h3 className="font-bold">{nombreDe(l)}</h3><span className="shrink-0 text-sm text-texto-2">{textoCantidad(l)}</span></div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-texto-2">Costo por unidad</dt><dd className="mt-1 text-lg font-bold tabular-nums">{$(c.costo_unitario_usd_cents)}</dd></div>
              {efecto && <div><dt className="text-texto-2">Precio de venta</dt><dd className="mt-1 flex flex-wrap items-center gap-1 text-lg font-bold tabular-nums">
                {!estrena && efecto.precio_antes_usd_cents > 0 && efecto.precio_antes_usd_cents !== efecto.precio_despues_usd_cents && <>
                  <span className="text-base font-normal text-texto-3">{$(efecto.precio_antes_usd_cents)}</span><ArrowRight size={14} className="text-texto-3" aria-label="pasa a" />
                </>}
                {$(efecto.precio_despues_usd_cents)}
              </dd>
                {efecto.bajo_costo
                  ? <dd className="mt-1 text-sm font-semibold text-peligro-fuerte">Debajo del costo</dd>
                  : efecto.costo_despues_usd_cents !== c.costo_unitario_usd_cents && <dd className="mt-1 text-sm text-texto-2">Sobre {$(efecto.costo_despues_usd_cents)}, lo más caro que queda</dd>}
              </div>}
            </dl>
            <p className="mt-2 text-sm text-texto-2">
              En la tienda {$(c.precio_linea_usd_cents)} · impuesto {$(c.tax_linea_usd_cents)} · flete {$(c.envio_asignado_usd_cents + c.otros_asignados_usd_cents)}
              {c.peso_linea_mlb > 0 ? ` · ${formatearPeso(c.peso_linea_mlb)}${c.peso_estimado ? ' estimadas' : ''}` : ''}
            </p>
            {l.destino === 'ENCARGO' && <p className="mt-2 text-sm text-texto-2">{etiquetaDe(l)}: no suma existencias en bodega.</p>}
          </li>;
        })}</ul>
        {totales()}
        <p className="text-sm text-texto-2">{calc.criterio_flete === 'UNIDADES' ? 'Sin pesos conocidos, el flete se reparte por cantidad de unidades.' : calc.criterio_flete === 'PESO' ? 'El flete se reparte por peso entre las piezas.' : 'Este paquete no tiene flete.'} Los precios escritos a mano se conservan.</p>
      </>}
    </main>
    <footer className="flex shrink-0 gap-3 border-t border-borde bg-superficie p-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)' }}>
      {paso > 1 && <button type="button" disabled={guardando} className={secundario} onClick={() => cambiarPaso(paso - 1)}>Atrás</button>}
      <button type="button" disabled={guardando || !parametros || (paso === 3 && cargandoProductos)} className={`${principal} flex flex-1 items-center justify-center gap-2`}
        onClick={paso === 3 ? () => { haptics.selection(); setError(''); setConfirmar(true); } : () => cambiarPaso(paso + 1)}>
        {paso === 3 && <PackagePlus size={20} />}{guardando ? 'Guardando…' : paso === 3 ? (esCorreccion ? 'Guardar corrección' : 'Recibir') : 'Seguir'}
      </button>
    </footer>

    <PiezaPaqueteSheet abierto={hojaPieza} onCerrar={() => setHojaPieza(false)} productos={productos} cargando={cargandoProductos}
      errorCarga={errorProductos} onReintentar={() => setReintentoProductos((n) => n + 1)} categorias={categorias}
      margenDefectoBp={parametros?.margen_defecto_bp ?? 4500} taxBp={taxBp} stockMinimoDefecto={parametros?.stock_minimo_defecto ?? 2}
      onAgregar={agregarLineas} onProductoCreado={(p) => setProductos((actual) => [...actual.filter((x) => x.id !== p.id), p])} />
    <EditarPiezaSheet linea={editando} nombre={editando ? nombreDe(editando) : ''} detalle={editando ? etiquetaDe(editando) : undefined}
      bloqueada={editando ? bloqueada(editando) : false} taxBp={taxBp} onCerrar={() => setEditando(null)} onGuardar={editarLinea}
      onQuitar={editando && !bloqueada(editando) ? () => { const l = editando; setEditando(null); setQuitar(l); } : undefined} />
    <EncargosPaqueteSheet modo={hojaEncargos} encargos={encargos} lineas={lineas} compraId={id.current} taxBp={taxBp}
      onCerrar={() => setHojaEncargos(null)} onAgregar={agregarLineas} />

    <BottomSheet abierto={quitar !== null} onCerrar={() => { if (!ocupado.current) setQuitar(null); }} titulo="Quitar del paquete" ocupado={guardando}
      footer={<div className="flex gap-3"><button type="button" className={`${secundario} flex-1`} disabled={guardando} onClick={() => { haptics.selection(); setQuitar(null); }}>Conservar</button><button type="button" className={`${principal} flex-1`} disabled={guardando} onClick={confirmarQuitar}>{guardando ? 'Guardando…' : 'Quitar'}</button></div>}>
      <div className="space-y-3 py-2"><p className="text-base text-texto">Se quitará {quitar?.descripcion} de {esCorreccion ? 'esta corrección' : 'este borrador'}. Todavía no entró al inventario.{quitar?.destino === 'ENCARGO' ? ' La pieza vuelve a esperar paquete.' : ''}</p>{error && <p role="alert" className="text-sm text-peligro-fuerte">{error}</p>}</div>
    </BottomSheet>

    <BottomSheet abierto={confirmar} onCerrar={() => { if (!ocupado.current) setConfirmar(false); }} ocupado={guardando}
      titulo={esCorreccion ? `¿Guardar la corrección de ${codigo}?` : '¿Pasar el paquete al inventario?'}
      footer={<div className="flex gap-3"><button type="button" className={`${secundario} flex-1`} disabled={guardando} onClick={() => { haptics.selection(); setConfirmar(false); }}>Seguir revisando</button>
        <button type="button" className={`${principal} flex-1`} disabled={guardando} onClick={esCorreccion ? corregir : recibir}>{guardando ? 'Guardando…' : esCorreccion ? 'Sí, corregirlo' : 'Sí, pasarlo al inventario'}</button></div>}>
      <ul className="list-disc space-y-2 py-2 pl-5 text-base text-texto">{consecuencias.map((c) => <li key={c}>{c}</li>)}</ul>
    </BottomSheet>

    <BottomSheet abierto={eliminar} onCerrar={() => { if (!ocupado.current) setEliminar(false); }} ocupado={guardando} titulo={`¿Eliminar ${codigo}?`}
      footer={<div className="flex gap-3"><button type="button" className={`${secundario} flex-1`} disabled={guardando} onClick={() => { haptics.selection(); setEliminar(false); }}>Conservar</button>
        <button type="button" className="min-h-12 flex-1 rounded-xl bg-peligro px-5 py-3 text-base font-bold text-peligro-texto disabled:opacity-60" disabled={guardando} onClick={eliminarBorrador}>{guardando ? 'Eliminando…' : 'Eliminar'}</button></div>}>
      <ul className="list-disc space-y-2 py-2 pl-5 text-base text-texto">
        <li>Nada de este paquete entró al inventario.</li>
        {lineas.some((l) => l.destino === 'ENCARGO') && <li>Las piezas de encargo vuelven a esperar paquete.</li>}
        <li>Podés deshacerlo desde el aviso.</li>
      </ul>
    </BottomSheet>

    <BottomSheet abierto={salirSinGuardar} onCerrar={() => setSalirSinGuardar(false)} titulo="¿Salir sin guardar la corrección?"
      footer={<div className="flex gap-3"><button type="button" autoFocus className={`${secundario} flex-1`} onClick={() => { haptics.selection(); setSalirSinGuardar(false); }}>Seguir corrigiendo</button>
        <button type="button" className="min-h-12 flex-1 rounded-xl bg-peligro px-5 py-3 text-base font-bold text-peligro-texto" onClick={() => { haptics.selection(); setSalirSinGuardar(false); onVolver(); }}>Salir sin guardar</button></div>}>
      <p className="py-2 text-base text-texto">Lo que cambiaste en {codigo} no se guardó. El paquete queda como estaba.</p>
    </BottomSheet>
  </div>;
}

/**
 * Lo que hizo el paquete, producto por producto: la respuesta a "¿qué
 * cambió?" de la PC (`ResumenIngreso`), en lista para el teléfono.
 */
function ResumenRecibido({ resultado, correccion, onListo }: { resultado: ResultadoIngreso; correccion: boolean; onListo: () => void }) {
  const esNuevo = (p: EfectoIngreso) => p.existencias_antes === 0 && p.costo_antes_usd_cents === 0;
  const cambianPrecio = resultado.productos.filter((p) => !esNuevo(p) && p.precio_antes_usd_cents !== p.precio_despues_usd_cents).length;
  const nuevos = resultado.productos.filter(esNuevo).length;
  const bajoCosto = resultado.productos.filter((p) => p.bajo_costo);
  const ajuste = resultado.productos.reduce((s, p) => s + (p.correccion_usd_cents ?? 0), 0);
  const unidades = resultado.productos.reduce((s, p) => s + Math.max(0, p.existencias_despues - p.existencias_antes), 0);
  const n = resultado.productos_afectados;
  const frase = [
    n === 0
      ? correccion ? 'Lo que cambió ya se había vendido: la bodega no se mueve.' : 'Ningún producto del inventario cambió.'
      : `${n === 1 ? '1 producto' : `${n} productos`} ${correccion ? (n === 1 ? 'se ajustó' : 'se ajustaron') : (n === 1 ? 'recibió mercadería' : 'recibieron mercadería')}.`,
    nuevos > 0 ? `${nuevos === 1 ? '1 se estrena' : `${nuevos} se estrenan`} con su primer precio.` : '',
    cambianPrecio > 0 ? `${cambianPrecio === 1 ? '1 cambia' : `${cambianPrecio} cambian`} de precio porque cambió su costo.` : '',
    resultado.encargos_actualizados > 0 ? `${resultado.encargos_actualizados === 1 ? '1 encargo ya tiene' : `${resultado.encargos_actualizados} encargos ya tienen`} su costo real.` : '',
  ].filter(Boolean).join(' ');
  const cambio = (antes: number, despues: number, dinero: boolean, sinAntes = false) => {
    const f = (x: number) => (dinero ? $(x) : String(x));
    return antes === despues || sinAntes ? f(despues) : `${f(antes)} → ${f(despues)}`;
  };

  return <main className="flex h-full flex-col bg-fondo text-texto">
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 pt-safe-t">
      <div className="flex flex-col items-center gap-3 pt-8 text-center">
        <span className="rounded-full bg-exito-suave p-5 text-exito-fuerte"><CheckCircle2 size={40} /></span>
        <h1 className="text-title font-extrabold">{correccion ? `${resultado.codigo} quedó corregido` : 'Ya está en el inventario'}</h1>
        <p className="text-base text-texto-2">{correccion ? '' : `${resultado.codigo} · ${unidades} ${unidades === 1 ? 'pieza recibida' : 'piezas recibidas'}. `}{frase}</p>
        {correccion && ajuste !== 0 && <p className="text-base text-texto-2">La bodega {ajuste > 0 ? 'sube' : 'baja'} {$(Math.abs(ajuste))}. Lo que ya se vendió conserva el costo con que salió.</p>}
      </div>
      {bajoCosto.length > 0 && <p role="alert" className="flex gap-2 rounded-xl bg-peligro-suave p-3 text-sm text-peligro-fuerte">
        <AlertTriangle size={18} className="shrink-0" aria-hidden="true" />
        {bajoCosto.map((p) => p.nombre).join(', ')} {bajoCosto.length === 1 ? 'tiene' : 'tienen'} un precio escrito a mano que quedó por debajo del costo. Revisalo antes de vender.
      </p>}
      {resultado.productos.length > 0 && <ul className="divide-y divide-borde overflow-hidden rounded-2xl border border-borde bg-superficie">{resultado.productos.map((p) =>
        <li key={p.producto_id} className="p-4">
          <p className="font-bold">{p.nombre}{esNuevo(p) && <span className="ml-2 text-sm font-semibold text-acento-fuerte">nuevo</span>}{p.modo_precio === 'MANUAL' && <span className="ml-2 text-sm font-normal text-texto-2">(precio a mano)</span>}</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-texto-2">En bodega</dt><dd className="font-semibold tabular-nums">{cambio(p.existencias_antes, p.existencias_despues, false)}</dd></div>
            <div><dt className="text-texto-2">Costo</dt><dd className="font-semibold tabular-nums">{cambio(p.costo_antes_usd_cents, p.costo_despues_usd_cents, true, esNuevo(p))}</dd></div>
            <div><dt className="text-texto-2">Precio</dt><dd className={`font-semibold tabular-nums ${p.bajo_costo ? 'text-peligro-fuerte' : ''}`}>{cambio(p.precio_antes_usd_cents, p.precio_despues_usd_cents, true, esNuevo(p))}</dd></div>
          </dl>
          {correccion && (p.correccion_usd_cents ?? 0) !== 0 && <p className="mt-1 text-sm text-texto-2">Bodega {(p.correccion_usd_cents ?? 0) > 0 ? '+' : '−'}{$(Math.abs(p.correccion_usd_cents ?? 0))}</p>}
        </li>)}</ul>}
    </div>
    <footer className="shrink-0 border-t border-borde bg-superficie p-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 1rem)' }}>
      <button type="button" className={`${principal} w-full`} onClick={onListo}>Listo</button>
    </footer>
  </main>;
}
