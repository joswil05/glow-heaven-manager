/**
 * Vibración de la app, en los dos sistemas.
 *
 * Por qué esto no es un `navigator.vibrate` y ya
 * ----------------------------------------------
 * Todo este módulo estaba construido sobre `navigator.vibrate()`, y en iPhone
 * eso no existe: Safari no implementa la API de vibración, ni en el navegador
 * ni en la PWA instalada, en ninguna versión. La comprobación
 * `'vibrate' in navigator` daba falso y cada llamada no hacía nada, sin error
 * ni aviso. En Android funcionaba, así que el problema pasaba desapercibido
 * salvo que se probara en un iPhone.
 *
 * El único camino en iOS es un rodeo: desde Safari 17.4 un `<input
 * type="checkbox" switch>` produce un toque háptico real al cambiar de
 * estado. Se tiene uno escondido y se lo alterna por código dentro del gesto
 * de la persona.
 *
 * Lo que ese rodeo NO puede hacer, y conviene tener claro:
 *
 *   · Necesita iOS 17.4 o más nuevo. En un iPhone más viejo no hay forma.
 *   · Es un solo toque, de intensidad fija. `light`, `medium` y `heavy` se
 *     sienten igual; las secuencias se imitan repitiendo el toque.
 *   · Tiene que ocurrir dentro del gesto de la persona. Un toque disparado
 *     mucho después de soltar el dedo puede no sonar.
 *
 * En Android sigue usándose `navigator.vibrate`, que sí distingue duraciones
 * y patrones. O sea: cada sistema recibe lo mejor que sabe dar, y ninguno de
 * los dos se queda mudo.
 */

type Estilo = 'light' | 'medium' | 'heavy';

// ---------------------------------------------------------------------------
// Android: la API de vibración de verdad
// ---------------------------------------------------------------------------

function tieneVibracion(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function vibrar(patron: number | number[]): boolean {
  if (!tieneVibracion()) return false;
  try {
    return navigator.vibrate(patron);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// iOS: el interruptor escondido
// ---------------------------------------------------------------------------

let interruptor: HTMLInputElement | null = null;
let soporteIOS: boolean | null = null;

/**
 * ¿Este navegador conoce el atributo `switch`?
 *
 * Safari 17.4 en adelante expone la propiedad en el elemento; los demás no.
 * Se pregunta por la propiedad y no por la versión del sistema: la cadena del
 * navegador miente y esto no.
 */
function soportaInterruptorHaptico(): boolean {
  if (soporteIOS !== null) return soporteIOS;
  if (typeof document === 'undefined') {
    soporteIOS = false;
    return false;
  }
  try {
    soporteIOS = 'switch' in document.createElement('input');
  } catch {
    soporteIOS = false;
  }
  return soporteIOS;
}

/**
 * El interruptor tiene que estar dibujado para que el sistema lo considere
 * un control real: `display:none` o `visibility:hidden` lo dejarían mudo. Se
 * lo esconde con tamaño cero y sin opacidad, fuera del alcance del dedo y del
 * lector de pantalla.
 *
 * No se le pone `appearance: none`: eso le saca el dibujo nativo, que es
 * justamente la parte que el sistema asocia con el toque háptico.
 */
function obtenerInterruptor(): HTMLInputElement | null {
  if (!soportaInterruptorHaptico()) return null;
  if (interruptor && interruptor.isConnected) return interruptor;

  try {
    const el = document.createElement('input');
    el.type = 'checkbox';
    el.setAttribute('switch', '');
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
    Object.assign(el.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '1px',
      height: '1px',
      opacity: '0',
      pointerEvents: 'none',
    });
    document.body.appendChild(el);
    interruptor = el;
    return el;
  } catch {
    return null;
  }
}

/** Un toque háptico en iOS. Devuelve si se pudo disparar. */
function toqueIOS(): boolean {
  const el = obtenerInterruptor();
  if (!el) return false;
  try {
    el.checked = !el.checked;
    el.click();
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lo que usa la aplicación
// ---------------------------------------------------------------------------

/**
 * Un pulso. En Android dura lo que se le pida; en iOS es siempre el mismo
 * toque, porque el sistema no deja elegir intensidad desde la web.
 */
function pulso(ms: number): void {
  if (vibrar(ms)) return;
  toqueIOS();
}

/**
 * Una secuencia. En Android va como patrón nativo; en iOS se imita repitiendo
 * el toque con las mismas pausas.
 */
function secuencia(patron: number[]): void {
  if (vibrar(patron)) return;
  if (!soportaInterruptorHaptico()) return;

  // El patrón viene como [vibra, pausa, vibra, pausa, ...]: se disparan los
  // toques en los momentos donde habría vibración.
  let transcurrido = 0;
  for (let i = 0; i < patron.length; i += 2) {
    const retraso = transcurrido;
    if (retraso === 0) toqueIOS();
    else setTimeout(toqueIOS, retraso);
    transcurrido += (patron[i] ?? 0) + (patron[i + 1] ?? 0);
  }
}

export const haptics = {
  /**
   * Tick ultra-sutil (UISelectionFeedbackGenerator).
   * Cambiar de pestaña, seleccionar variante, chips de categoría, +/- cantidad.
   */
  selection() {
    pulso(8);
  },

  /**
   * Impacto físico (UIImpactFeedbackGenerator).
   * - light: botones secundarios, cerrar paneles, limpiar campos.
   * - medium: agregar al carrito, seleccionar clienta, 'Pagar todo'.
   * - heavy: botones primarios de acción (Cobrar, Confirmar Venta).
   */
  impact(style: Estilo = 'medium') {
    pulso(style === 'light' ? 12 : style === 'medium' ? 22 : 35);
  },

  /** Confirmación: pulso preparatorio, micro-pausa y pulso firme. */
  success() {
    secuencia([12, 45, 22]);
  },

  /** Advertencia. */
  warning() {
    secuencia([25, 55, 25]);
  },

  /** Rechazo: tres pulsos rápidos. */
  error() {
    secuencia([30, 40, 30, 40, 45]);
  },
};

/**
 * Qué puede hacer este teléfono. Lo usa la pantalla de Ajustes para explicarlo
 * en lugar de dejar a la persona adivinando por qué no siente nada.
 */
export function estadoHaptico(): {
  disponible: boolean;
  via: 'vibracion' | 'interruptor' | 'ninguno';
} {
  if (tieneVibracion()) return { disponible: true, via: 'vibracion' };
  if (soportaInterruptorHaptico()) return { disponible: true, via: 'interruptor' };
  return { disponible: false, via: 'ninguno' };
}
