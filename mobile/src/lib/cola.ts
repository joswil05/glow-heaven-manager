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
