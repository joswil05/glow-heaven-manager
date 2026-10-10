/**
 * La cuenta de la hoja "Cotizar" del celular (Fase C2 · T5), aparte de la
 * vista para poder probarla sola: qué piezas se editan, cómo se validan y qué
 * se manda a `VentasRepoFirestore.cotizar`. Sigue la semántica de Windows
 * (`CotizarEncargoModal`).
 */
import type { VentaCompleta, VentaLinea } from '@shared/types';
import type { LineaCotizacion } from '@shared/ipc-contracts';
import { descartable, estadoPieza, sinPrecio } from '@core/encargos';
import { parsearACentavos, parsearDecimal } from '@core/numeros';

export type Campo = 'descripcion' | 'tienda' | 'peso' | 'costo' | 'precio';
export type Errores = Partial<Record<Campo, string>>;
export interface Pieza {
  original: VentaLinea;
  descripcion: string;
  tienda: string;
  peso: string;
  costo: string;
  precio: string;
  costoReal: boolean;
  fijo: boolean;
  descartada: boolean;
  puedeDescartar: boolean;
  errorEstimacion: boolean;
}

export const dinero = (valor?: number) => valor ? (valor / 100).toFixed(2) : '';
export const pesoTexto = (valor?: number) => valor ? String(valor / 1000) : '';

export function monto(texto: string, precio = false): number | null {
  if (!texto.trim()) return 0;
  const valor = parsearACentavos(texto, { min: precio ? 0.01 : 0 });
  return valor !== null && Number.isSafeInteger(valor) ? valor : null;
}

export function pesoMlb(texto: string): number | null {
  if (!texto.trim()) return 0;
  const libras = parsearDecimal(texto, { min: 0 });
  const mlb = libras === null ? NaN : Math.round(libras * 1000);
  return Number.isSafeInteger(mlb) ? mlb : null;
}

export function armarPiezas(venta: VentaCompleta): Pieza[] {
  return venta.lineas.map((original) => ({
    original, descripcion: original.descripcion,
    tienda: dinero(original.precio_tienda_usd_cents), peso: pesoTexto(original.peso_mlb),
    costo: dinero(original.costo_unitario_usd_cents), precio: dinero(original.precio_unitario_usd_cents),
    costoReal: estadoPieza(original) === 'LLEGO' || (original.lotes_consumidos?.length ?? 0) > 0,
    fijo: venta.estado === 'PENDIENTE' && !sinPrecio(original) && !original.descartada_el,
    descartada: Boolean(original.descartada_el),
    puedeDescartar: Boolean(original.descartada_el) || descartable(original),
    errorEstimacion: false,
  }));
}

export function analizar(piezas: Pieza[]) {
  const errores: Record<number, Errores> = {};
  const cambios: LineaCotizacion[] = [];
  let subtotal = 0;
  let costoTotal = 0;
  const lineas = piezas.map((pieza) => {
    const l = pieza.original;
    const error: Errores = {};
    // "No se consiguió" saca la pieza del total pero conserva lo que Ross
    // escribió, como Windows: sólo subtotal y costo quedan en cero. Lo que no
    // se entiende en una pieza descartada no bloquea guardar: queda lo de antes.
    const descartado = <T,>(valor: T | null, anterior: T): T | null =>
      pieza.descartada ? valor ?? anterior : valor;
    const precio = pieza.fijo ? l.precio_unitario_usd_cents
      : descartado(monto(pieza.precio, true), l.precio_unitario_usd_cents);
    const costo = pieza.fijo || pieza.costoReal ? l.costo_unitario_usd_cents
      : descartado(monto(pieza.costo), l.costo_unitario_usd_cents);
    const tienda = pieza.fijo || pieza.costoReal ? l.precio_tienda_usd_cents ?? 0
      : descartado(monto(pieza.tienda), l.precio_tienda_usd_cents ?? 0);
    const peso = pieza.fijo || pieza.costoReal ? l.peso_mlb ?? 0 : descartado(pesoMlb(pieza.peso), l.peso_mlb ?? 0);
    if (!pieza.fijo && !pieza.descartada) {
      if (!pieza.descripcion.trim()) error.descripcion = 'Escribí qué es esta pieza.';
      if (precio === null) error.precio = 'Escribí un precio mayor que cero, o dejalo vacío.';
      if (costo === null) error.costo = 'Escribí un costo válido, de cero en adelante.';
      if (tienda === null) error.tienda = 'Escribí un precio de tienda válido, de cero en adelante.';
      if (peso === null) error.peso = 'Escribí un peso válido, de cero en adelante.';
      if (pieza.errorEstimacion) error.costo = 'El costo estimado es demasiado grande. Revisá tienda y peso.';
    }
    const subtotalPieza = pieza.descartada ? 0 : (precio ?? 0) * l.cantidad;
    const costoPieza = pieza.descartada ? 0 : pieza.costoReal ? l.costo_total_usd_cents : (costo ?? 0) * l.cantidad;
    if (!Number.isSafeInteger(l.cantidad) || l.cantidad <= 0 || !Number.isSafeInteger(subtotalPieza) || !Number.isSafeInteger(subtotal + subtotalPieza)) {
      error.precio = 'El importe es demasiado grande. Revisá el precio y la cantidad.';
    } else subtotal += subtotalPieza;
    if (!Number.isSafeInteger(costoPieza) || !Number.isSafeInteger(costoTotal + costoPieza)) {
      error.costo = 'El costo es demasiado grande para esta cantidad.';
    } else costoTotal += costoPieza;
    if (Object.keys(error).length > 0) errores[l.id] = error;
    if (!pieza.fijo) {
      const cambio: LineaCotizacion = { id: l.id, precio_unitario_usd_cents: precio ?? 0 };
      if (pieza.descripcion.trim() !== l.descripcion) cambio.descripcion = pieza.descripcion.trim();
      // También en una pieza descartada; nunca el costo estimado de una que ya llegó.
      if (!pieza.costoReal) {
        if (pieza.tienda !== dinero(l.precio_tienda_usd_cents) && tienda !== (l.precio_tienda_usd_cents ?? 0)) {
          cambio.precio_tienda_usd_cents = tienda ?? 0;
        }
        if (pieza.peso !== pesoTexto(l.peso_mlb) && peso !== (l.peso_mlb ?? 0)) cambio.peso_mlb = peso ?? 0;
        if (pieza.costo !== dinero(l.costo_unitario_usd_cents) && costo !== l.costo_unitario_usd_cents) {
          cambio.costo_estimado_unitario_usd_cents = costo ?? 0;
        }
      }
      if (pieza.puedeDescartar && pieza.descartada !== Boolean(l.descartada_el)) cambio.descartada = pieza.descartada;
      cambios.push(cambio);
    }
    const { descartada_el: _descartada, ...original } = l;
    return {
      ...original, descripcion: pieza.descripcion.trim() || l.descripcion,
      ...(pieza.descartada ? { descartada_el: l.descartada_el || 'pendiente' } : {}),
      precio_unitario_usd_cents: precio ?? 0, costo_unitario_usd_cents: costo ?? 0,
      subtotal_usd_cents: subtotalPieza, costo_total_usd_cents: costoPieza,
    };
  });
  return { errores, cambios, lineas, valido: Object.keys(errores).length === 0 };
}
