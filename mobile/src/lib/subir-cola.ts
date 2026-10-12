/**
 * Subir la cola cuando vuelve la señal (C4 · T3).
 *
 * De a una y en el orden en que se hicieron: si dos ventas sin señal se
 * llevaron lo último de un producto, la primera es la que lo consigue. Cada
 * operación viaja con su `operacion_id`, así que reintentar lo que ya había
 * llegado devuelve lo mismo (la marca de Firestore) en vez de duplicarlo.
 *
 * Sin red, la subida se frena y lo que falta espera la próxima señal. Un error
 * del negocio (ya no hay unidades, la venta se anuló en la PC) deja esa
 * operación para revisar y sigue con la siguiente: decide Ross, no la app.
 */
import { codigoDeVenta } from '@core/codigos';
import type { CrearVentaInput, GuardarClienteInput, RegistrarPagoInput } from '@shared/ipc-contracts';
import { marcar, siguiente, type EnCola } from './cola';
import { esErrorSinRed } from './conexion-movil';

export interface ReposCola {
  crearVenta(input: CrearVentaInput, grupo: string, operacion_id: string): Promise<number>;
  registrarPago(input: RegistrarPagoInput, grupo: string, operacion_id: string): Promise<{ pago_id: number }>;
  guardarClienta(datos: GuardarClienteInput, grupo: string, operacion_id: string): Promise<number>;
}

/** La cola viva: se vuelve a leer en cada paso, porque cambia mientras sube. */
export interface ColaViva {
  leer(): EnCola[];
  cambiar(cambio: (cola: EnCola[]) => EnCola[]): Promise<void>;
}

export interface ResumenSubida {
  subidas: number;
  revisar: number;
  /** Se frenó por falta de red: lo que falta sube con la próxima señal. */
  sinRed: boolean;
}

// `unknown` es el de un servidor que respondió otra cosa (un Wi-Fi con portal
// de acceso): tampoco es del negocio.
const PASAJEROS = new Set(['unavailable', 'deadline-exceeded', 'aborted', 'resource-exhausted', 'cancelled', 'unknown']);

/** Errores que se arreglan esperando: la operación va (o vuelve) a la fila. */
export function esErrorPasajero(err: unknown): boolean {
  const codigo = (err as { code?: string } | null)?.code ?? '';
  return esErrorSinRed(err) || PASAJEROS.has(codigo);
}

/**
 * El tope del primer intento con señal. Con una señal que va y viene, la
 * venta no se queda en "Guardando…": pasado el tope va a la cola con el mismo
 * `operacion_id`, y si el intento llegaba igual, la subida encuentra su marca.
 */
export const ESPERA_PRIMER_INTENTO_MS = 8000;

export function conEspera<T>(intento: Promise<T>, ms = ESPERA_PRIMER_INTENTO_MS): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const tope = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(
      () => rechazar(Object.assign(new Error('La señal no alcanzó para guardar.'), { code: 'deadline-exceeded' })),
      ms
    );
  });
  return Promise.race([intento, tope]).finally(() => clearTimeout(reloj));
}

function motivoDe(err: unknown): string {
  const codigo = (err as { code?: string } | null)?.code ?? '';
  if (codigo === 'permission-denied' || codigo === 'unauthenticated') {
    return 'No hubo permiso para guardarla. Revisá que la sesión siga abierta y probá de nuevo.';
  }
  const mensaje = err instanceof Error ? err.message.trim() : '';
  return mensaje || 'No se pudo guardar.';
}

async function subirUna(op: EnCola, repos: ReposCola): Promise<NonNullable<EnCola['resultado']>> {
  const { operacion } = op;
  if (operacion.tipo === 'ABONO') {
    const { pago_id } = await repos.registrarPago(operacion.input, op.grupo, op.operacion_id);
    return { pago_id };
  }

  let input = operacion.input;
  let cliente_id: number | undefined;
  if (operacion.clienta_nueva) {
    // Con su propio grupo de Deshacer: deshacer esta venta no puede borrar
    // una clienta que otra venta de la cola también usa.
    const { operacion_id, datos } = operacion.clienta_nueva;
    cliente_id = await repos.guardarClienta(datos, operacion_id, operacion_id);
    input = { ...input, cliente_id };
  }
  const venta_id = await repos.crearVenta(input, op.grupo, op.operacion_id);
  return { venta_id, codigo: codigoDeVenta(venta_id, input.tipo), ...(cliente_id === undefined ? {} : { cliente_id }) };
}

export async function subirCola(cola: ColaViva, repos: ReposCola): Promise<ResumenSubida> {
  const resumen: ResumenSubida = { subidas: 0, revisar: 0, sinRed: false };

  for (let op = siguiente(cola.leer()); op; op = siguiente(cola.leer())) {
    const { operacion_id, intentos } = op;
    await cola.cambiar((c) => marcar(c, operacion_id, { estado: 'SUBIENDO', intentos: intentos + 1, motivo: undefined }));
    // Si en el medio la quitaron (Deshacer), no se sube.
    const enCamino = cola.leer().find((o) => o.operacion_id === operacion_id);
    if (enCamino?.estado !== 'SUBIENDO') continue;

    try {
      const resultado = await subirUna(enCamino, repos);
      await cola.cambiar((c) => marcar(c, operacion_id, { estado: 'SUBIDA', resultado }));
      resumen.subidas += 1;
    } catch (err) {
      if (esErrorPasajero(err)) {
        await cola.cambiar((c) => marcar(c, operacion_id, { estado: 'PENDIENTE' }));
        resumen.sinRed = true;
        break;
      }
      await cola.cambiar((c) => marcar(c, operacion_id, { estado: 'REVISAR', motivo: motivoDe(err) }));
      resumen.revisar += 1;
    }
  }

  return resumen;
}

/**
 * Una sola subida a la vez. Si se pide otra mientras sube (volvió la señal y
 * a la vez se cobró una venta), al terminar se mira la cola otra vez: lo que
 * entró en el medio no queda esperando a la próxima señal.
 */
export function crearSubidor(cola: ColaViva, repos: ReposCola): () => Promise<ResumenSubida> {
  let enCurso: Promise<ResumenSubida> | null = null;
  let otraVez = false;

  return () => {
    if (enCurso) {
      otraVez = true;
      return enCurso;
    }
    enCurso = (async () => {
      const total: ResumenSubida = { subidas: 0, revisar: 0, sinRed: false };
      do {
        otraVez = false;
        const vuelta = await subirCola(cola, repos);
        total.subidas += vuelta.subidas;
        total.revisar += vuelta.revisar;
        total.sinRed = vuelta.sinRed;
      } while (otraVez && !total.sinRed);
      return total;
    })().finally(() => {
      enCurso = null;
    });
    return enCurso;
  };
}
