/**
 * Si hay conexión, y de cuándo son los datos que se ven sin ella (C3).
 *
 * "En línea" lo decide primero `navigator.onLine` con sus eventos: es
 * inmediato y es lo que cambia en modo avión. Pero puede mentir: un Wi-Fi sin
 * internet o la señal débil dicen que sí hay red. Por eso también cuenta
 * Firestore: si sigue sirviendo desde la caché más de `ESPERA_SERVIDOR_MS`
 * sin confirmar el servidor, es sin conexión. Menos que eso es el arranque
 * normal, mientras conecta, y la franja no parpadea.
 *
 * "Datos de las 10:42" es el último momento en que Firestore confirmó datos
 * del servidor. Quien escucha a Firestore avisa con `sincronizado()` y
 * `desdeCache()`; al perder el servidor estando sincronizada se guarda ese
 * instante, y queda guardado para la próxima vez que se abra sin señal.
 *
 * No depende de React ni del navegador: el entorno se inyecta, y así se
 * prueba sola (`tests/c3-conexion.test.ts`).
 */

export const CLAVE_DATOS_DE = 'gh:datos-de';

/** Cuánto puede tardar Firestore en confirmar el servidor antes de darlo por perdido. */
export const ESPERA_SERVIDOR_MS = 3000;

export interface EntornoConexion {
  enLinea(): boolean;
  escuchar(evento: 'online' | 'offline', fn: () => void): () => void;
  leer(clave: string): string | null;
  guardar(clave: string, valor: string): void;
  ahora(): number;
  programar(fn: () => void, ms: number): () => void;
}

export interface EstadoConexion {
  enLinea: boolean;
  /** Último momento con datos del servidor. `null`: nunca hubo. */
  datosDe: number | null;
}

export interface Conexion {
  estado(): EstadoConexion;
  suscribir(fn: (e: EstadoConexion) => void): () => void;
  /** Firestore entregó datos del servidor (`metadata.fromCache === false`). */
  sincronizado(): void;
  /** Firestore sirve desde la caché (`metadata.fromCache === true`). */
  desdeCache(): void;
  detener(): void;
}

export function crearConexion(entorno: EntornoConexion): Conexion {
  let navegadorEnLinea = entorno.enLinea();
  /** Firestore lleva más de la espera sirviendo desde la caché. */
  let sinServidor = false;
  let cancelarEspera: (() => void) | null = null;
  /** Firestore confirmó el servidor y todavía no se perdió. */
  let vivo = false;
  const guardada = Number(entorno.leer(CLAVE_DATOS_DE));
  let datosDe: number | null = Number.isFinite(guardada) && guardada > 0 ? guardada : null;
  const suscriptores = new Set<(e: EstadoConexion) => void>();

  const estado = (): EstadoConexion => ({ enLinea: navegadorEnLinea && !sinServidor, datosDe });
  const avisar = () => {
    const e = estado();
    suscriptores.forEach((fn) => fn(e));
  };
  const marcar = () => {
    datosDe = entorno.ahora();
    entorno.guardar(CLAVE_DATOS_DE, String(datosDe));
  };
  /** Se perdió el servidor: si estaba vivo, ése es el último momento con datos. */
  const perder = () => {
    if (vivo) marcar();
    vivo = false;
  };

  const quitarOnline = entorno.escuchar('online', () => {
    navegadorEnLinea = true;
    avisar();
  });
  const quitarOffline = entorno.escuchar('offline', () => {
    perder();
    navegadorEnLinea = false;
    avisar();
  });

  return {
    estado,
    suscribir(fn) {
      suscriptores.add(fn);
      return () => {
        suscriptores.delete(fn);
      };
    },
    sincronizado() {
      cancelarEspera?.();
      cancelarEspera = null;
      sinServidor = false;
      vivo = true;
      marcar();
      avisar();
    },
    desdeCache() {
      perder();
      if (!sinServidor && !cancelarEspera) {
        cancelarEspera = entorno.programar(() => {
          cancelarEspera = null;
          sinServidor = true;
          avisar();
        }, ESPERA_SERVIDOR_MS);
      }
      avisar();
    },
    detener() {
      cancelarEspera?.();
      quitarOnline();
      quitarOffline();
      suscriptores.clear();
    },
  };
}

/** El entorno de verdad: `navigator.onLine`, los eventos de `window` y `localStorage`. */
export function entornoNavegador(): EntornoConexion {
  return {
    enLinea: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    escuchar(evento, fn) {
      window.addEventListener(evento, fn);
      return () => window.removeEventListener(evento, fn);
    },
    leer(clave) {
      try {
        return localStorage.getItem(clave);
      } catch {
        return null;
      }
    },
    guardar(clave, valor) {
      try {
        localStorage.setItem(clave, valor);
      } catch {
        /* sin almacenamiento: la hora vale hasta cerrar la app */
      }
    },
    ahora: () => Date.now(),
    programar(fn, ms) {
      const id = window.setTimeout(fn, ms);
      return () => window.clearTimeout(id);
    },
  };
}

/**
 * Un error de Firestore por no llegar al servidor, no una respuesta suya:
 * "the client is offline", `unavailable`, o el `sin-conexion` de los
 * repositorios.
 */
export function esErrorSinRed(err: unknown): boolean {
  const codigo = (err as { code?: string } | null)?.code ?? '';
  const mensaje = err instanceof Error ? err.message : String(err);
  return codigo === 'unavailable' || /offline|sin-conexion/i.test(mensaje);
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Lo que sigue a "datos" en la franja: "de las 10:42" si es de hoy, "de ayer
 * a las 18:05", "del 3 oct a las 18:05" si es más viejo (con el año si no es
 * el de hoy). Hora local, sin cero adelante en la hora.
 */
export function textoDatosDe(ms: number, ahora: Date): string {
  const f = new Date(ms);
  const hora = `${f.getHours()}:${String(f.getMinutes()).padStart(2, '0')}`;
  const articulo = f.getHours() === 1 ? 'la' : 'las';
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ayer = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - 1).getTime();
  if (dia(f) === dia(ahora)) return `de ${articulo} ${hora}`;
  if (dia(f) === ayer) return `de ayer a ${articulo} ${hora}`;
  const anio = f.getFullYear() === ahora.getFullYear() ? '' : ` ${f.getFullYear()}`;
  return `del ${f.getDate()} ${MESES[f.getMonth()]}${anio} a ${articulo} ${hora}`;
}
