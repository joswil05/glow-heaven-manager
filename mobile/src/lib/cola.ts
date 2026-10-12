/**
 * La cola de lo que se hizo sin señal (C4 · T2).
 *
 * Sin red, el celular no frena la venta, el abono ni el pedido: los guarda acá
 * y los sube solo cuando vuelve la señal (`subir-cola.ts`). Cada uno lleva su
 * `operacion_id`: si una subida llega a guardarse pero la respuesta se pierde,
 * el reintento encuentra la marca en Firestore y no escribe nada dos veces.
 *
 * Esta parte es pura: recibe la cola y devuelve otra, sin tocar la de antes.
 * Guardarla en el teléfono es de `cola-local.ts`.
 */
import type { CrearVentaInput, GuardarClienteInput, RegistrarPagoInput } from '@shared/ipc-contracts';
import type { ClienteDetalle } from '@shared/types';

/**
 * PENDIENTE espera señal; SUBIENDO está en camino; SUBIDA ya tiene número;
 * REVISAR no se pudo guardar por algo del negocio (por ejemplo, ya no hay
 * unidades) y espera que Ross decida: intentar de nuevo o descartar.
 */
export type EstadoOperacion = 'PENDIENTE' | 'SUBIENDO' | 'SUBIDA' | 'REVISAR';

/**
 * Una clienta anotada sin señal viaja con la operación que la usa. Tiene su
 * propio `operacion_id`: si dos ventas de la cola son para la misma clienta
 * nueva, la segunda encuentra la marca de la primera y no la crea otra vez.
 */
export interface ClientaNueva {
  operacion_id: string;
  datos: GuardarClienteInput;
}

export type Operacion =
  | { tipo: 'VENTA'; input: CrearVentaInput; clienta_nueva?: ClientaNueva }
  | { tipo: 'ENCARGO'; input: CrearVentaInput; clienta_nueva?: ClientaNueva }
  | { tipo: 'ABONO'; input: RegistrarPagoInput };

export interface EnCola {
  operacion_id: string;
  /** El grupo de Deshacer: el mismo antes y después de subir. */
  grupo: string;
  creada_en: string;
  operacion: Operacion;
  estado: EstadoOperacion;
  intentos: number;
  /** Por qué no se pudo guardar, para "Para revisar". */
  motivo?: string;
  /** Lo que quedó guardado, cuando ya subió. */
  resultado?: { venta_id?: number; codigo?: string; pago_id?: number; cliente_id?: number };
  /** Ya subida y los productos que se ven ya la traen: deja de apartar stock. */
  reflejada?: boolean;
  /** Lo que se muestra en las listas mientras no tiene número. */
  resumen: { titulo: string; detalle: string; monto_usd_cents: number };
}

/** Al final de la fila. La misma operación dos veces queda una. */
export function encolar(cola: EnCola[], nueva: EnCola): EnCola[] {
  if (cola.some((o) => o.operacion_id === nueva.operacion_id)) return cola;
  return [...cola, nueva];
}

/** La pendiente más vieja: la cola sube en el orden en que se hizo. */
export function siguiente(cola: EnCola[]): EnCola | null {
  return cola.find((o) => o.estado === 'PENDIENTE') ?? null;
}

export function marcar(cola: EnCola[], operacion_id: string, cambio: Partial<EnCola>): EnCola[] {
  return cola.map((o) => (o.operacion_id === operacion_id ? { ...o, ...cambio } : o));
}

/** Deshacer antes de subir, o descartar una que había que revisar. */
export function quitar(cola: EnCola[], operacion_id: string): EnCola[] {
  return cola.filter((o) => o.operacion_id !== operacion_id);
}

/**
 * Al abrir la app. La que quedó SUBIENDO (se cerró a mitad) vuelve a la fila:
 * no se sabe si llegó, y si llegó, la marca devuelve lo mismo. Las SUBIDAS ya
 * están en Firestore y se ven como cualquier otra venta.
 */
export function retomar(cola: EnCola[]): EnCola[] {
  return cola
    .filter((o) => o.estado !== 'SUBIDA')
    .map((o) => (o.estado === 'SUBIENDO' ? { ...o, estado: 'PENDIENTE' as const } : o));
}

/** Lo que espera señal (o está subiendo) y lo que hay que revisar. */
export function contarCola(cola: EnCola[]): { pendientes: number; revisar: number } {
  let pendientes = 0;
  let revisar = 0;
  for (const o of cola) {
    if (o.estado === 'PENDIENTE' || o.estado === 'SUBIENDO') pendientes += 1;
    else if (o.estado === 'REVISAR') revisar += 1;
  }
  return { pendientes, revisar };
}

/** "Para revisar (1) · Pendientes (2)": lo que necesita a Ross va primero. */
export function textoAviso(cuenta: { pendientes: number; revisar: number }): string | null {
  const partes: string[] = [];
  if (cuenta.revisar > 0) partes.push(`Para revisar (${cuenta.revisar})`);
  if (cuenta.pendientes > 0) partes.push(`Pendientes (${cuenta.pendientes})`);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/**
 * Lo de la cola que el Historial todavía no trae. Una subida sigue en la
 * lista, ya con su número, hasta que el Historial recargado la tiene: así la
 * fila no desaparece y vuelve a aparecer.
 */
export function sinMostrarEnHistorial(
  cola: EnCola[],
  ventas: { id: number }[],
  pagos: { id: number }[]
): EnCola[] {
  const ventasVistas = new Set(ventas.map((v) => v.id));
  const pagosVistos = new Set(pagos.map((p) => p.id));
  return cola.filter((o) => {
    if (o.estado !== 'SUBIDA') return true;
    if (o.operacion.tipo === 'ABONO') return !pagosVistos.has(o.resultado?.pago_id ?? -1);
    return !ventasVistas.has(o.resultado?.venta_id ?? -1);
  });
}

/** Cómo se ve una clienta anotada sin señal mientras viaja con su operación. */
export function clientaProvisoria(nueva: ClientaNueva): ClienteDetalle {
  return {
    id: 0,
    nombre: nueva.datos.nombre,
    telefono: nueva.datos.telefono,
    activo: true,
    compras_count: 0,
    total_comprado_usd_cents: 0,
    saldo_pendiente_usd_cents: 0,
  };
}

/**
 * Las clientas anotadas sin señal que todavía no subieron, una vez cada una:
 * elegirlas otra vez comparte su `operacion_id`, y se crean una sola vez.
 */
export function clientasNuevasEnCola(cola: EnCola[]): ClientaNueva[] {
  const vistas = new Map<string, ClientaNueva>();
  for (const op of cola) {
    if (op.estado === 'SUBIDA' || op.operacion.tipo === 'ABONO') continue;
    const nueva = op.operacion.clienta_nueva;
    if (nueva && !vistas.has(nueva.operacion_id)) vistas.set(nueva.operacion_id, nueva);
  }
  return [...vistas.values()];
}

/** Después de recargar los productos: lo subido ya está en lo que se ve. */
export function reflejar(cola: EnCola[]): EnCola[] {
  const falta = (o: EnCola) => o.estado === 'SUBIDA' && !o.reflejada;
  return cola.some(falta) ? cola.map((o) => (falta(o) ? { ...o, reflejada: true } : o)) : cola;
}

interface ConExistencias {
  id: number;
  existencias: number;
  variantes: { id: number; existencias: number }[];
}

/**
 * El stock que se ve, menos lo que se llevaron las ventas de la cola.
 *
 * Una venta hecha sin señal todavía no está en Firestore, pero la mercadería
 * ya salió de la tienda: se aparta hasta que sube y los productos que se ven
 * la traen. Los encargos no sacan de la bodega. Nada baja de cero.
 */
export function descontarCola<P extends ConExistencias>(productos: P[], cola: EnCola[]): P[] {
  const apartado = new Map<number, { total: number; porTono: Map<number, number> }>();
  for (const op of cola) {
    if (op.operacion.tipo !== 'VENTA' || (op.estado === 'SUBIDA' && op.reflejada)) continue;
    for (const linea of op.operacion.input.lineas) {
      if (!linea.producto_id) continue;
      const cantidad = Math.max(1, Math.round(linea.cantidad));
      const deEse = apartado.get(linea.producto_id) ?? { total: 0, porTono: new Map<number, number>() };
      deEse.total += cantidad;
      if (linea.variante_id) deEse.porTono.set(linea.variante_id, (deEse.porTono.get(linea.variante_id) ?? 0) + cantidad);
      apartado.set(linea.producto_id, deEse);
    }
  }
  if (apartado.size === 0) return productos;

  return productos.map((p) => {
    const deEse = apartado.get(p.id);
    if (!deEse) return p;
    return {
      ...p,
      existencias: Math.max(0, p.existencias - deEse.total),
      variantes: p.variantes.map((v) => {
        const n = deEse.porTono.get(v.id);
        return n ? { ...v, existencias: Math.max(0, v.existencias - n) } : v;
      }),
    };
  });
}
