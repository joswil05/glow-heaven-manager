/**
 * Vibración de la app, en los dos sistemas.
 *
 * Android
 * -------
 * `navigator.vibrate()`, que distingue duraciones y patrones.
 *
 * iPhone
 * ------
 * Safari no implementa `navigator.vibrate` en ninguna versión, ni en el
 * navegador ni en la app instalada. El único camino es un rodeo: desde iOS
 * 17.4 un `<input type="checkbox" switch>` produce un toque háptico real
 * cuando cambia de estado.
 *
 * Hasta iOS 26.4 alcanzaba con alternar ese interruptor por código. Desde iOS
 * 26.5 (mayo de 2026, WebKit bug 309082) ya no: un click por código le llega
 * al interruptor como no confiable, y un click no confiable no vibra. Sólo
 * vibra si el dedo cae de verdad sobre el interruptor o sobre su `<label>`.
 * La versión anterior de este módulo quedó muda en iPhone por eso, sin error
 * ni aviso.
 *
 * Por eso, en iPhone, cada `<button>` lleva adentro un `<label>` transparente
 * que lo cubre entero, conectado a un interruptor escondido. El dedo toca el
 * label, y el label le pasa al interruptor un click que sí es confiable.
 *
 * El botón no se entera de nada. El click del label se detiene y al botón le
 * llega una copia. Si mientras el botón atiende esa copia el código pide una
 * vibración (`haptics.*`), se deja que el label alterne el interruptor y el
 * teléfono vibra. Si no la pide, se cancela y no vibra. Así cada botón vibra
 * en iPhone exactamente cuando vibra en Android.
 *
 * Lo que en iPhone no se puede, y no es un error de la app:
 *
 *   · Un solo toque, siempre igual. `light`, `medium`, `heavy`, `success` y
 *     `error` se sienten lo mismo.
 *   · Sólo en el instante del toque. Lo que se pida después de un `await`
 *     (la confirmación cuando Firebase responde), desde un temporizador o al
 *     soltar un arrastre, no vibra.
 *   · Sólo en `<button>`. Algo que se toque y no sea un botón no vibra.
 *   · El teléfono tiene que tener activada la vibración del sistema.
 *
 * El camino por código se mantiene para iOS 17.4 a 26.4: ahí todavía vibra,
 * incluidos los toques que siguen al primero en una secuencia.
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
// iPhone: ¿hay interruptor?
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// iPhone: el toque del dedo
// ---------------------------------------------------------------------------

/**
 * El toque que un botón está atendiendo en este momento. La primera
 * vibración que se pida mientras tanto lo reclama: el dedo ya está sobre el
 * label, y alcanza con no cancelar su click para que el teléfono vibre.
 */
let toqueEnCurso: { reclamado: boolean } | null = null;

function reclamarToque(): boolean {
  if (!toqueEnCurso || toqueEnCurso.reclamado) return false;
  toqueEnCurso.reclamado = true;
  return true;
}

const SELECTOR_BOTON = 'button';
const ATRIBUTO_CAPA = 'data-capa-haptica';
/** Lo lleva cada botón con capa, para que la contenga (ver `instalarHapticos`). */
const ATRIBUTO_BOTON = 'data-haptico';

const capas = new WeakMap<HTMLElement, HTMLLabelElement>();

const detener = (e: Event) => e.stopPropagation();

function esElemento(nodo: unknown): nodo is HTMLElement {
  return (
    typeof nodo === 'object' &&
    nodo !== null &&
    (nodo as Node).nodeType === 1 &&
    typeof (nodo as Element).matches === 'function'
  );
}

function copiarClick(evento: MouseEvent): MouseEvent {
  if (typeof PointerEvent !== 'undefined' && evento instanceof PointerEvent) {
    return new PointerEvent('click', evento);
  }
  return new MouseEvent('click', evento);
}

/**
 * El dedo tocó la capa de un botón. Al botón le llega una copia del click, y
 * según lo que haga con ella se deja vibrar al interruptor o no.
 */
function atenderToque(boton: HTMLElement, evento: MouseEvent): void {
  // El botón recibe la copia de abajo, nunca el click del label.
  evento.stopPropagation();
  if (boton.matches(':disabled')) {
    evento.preventDefault();
    return;
  }

  const toque = { reclamado: false };
  const anterior = toqueEnCurso;
  toqueEnCurso = toque;
  try {
    boton.dispatchEvent(copiarClick(evento));
  } finally {
    toqueEnCurso = anterior;
  }

  // Nadie pidió vibrar: que el label no alterne el interruptor.
  if (!toque.reclamado) evento.preventDefault();
}

function crearCapa(boton: HTMLElement): HTMLLabelElement {
  const capa = document.createElement('label');
  capa.setAttribute(ATRIBUTO_CAPA, '');
  capa.setAttribute('aria-hidden', 'true');
  // `all: unset` la protege de cualquier regla de la app. Lo demás la estira
  // sobre el botón entero sin ocupar lugar en su contenido.
  capa.style.cssText =
    'all:unset;position:absolute;inset:0;border-radius:inherit;touch-action:manipulation;' +
    '-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;';

  const interruptor = document.createElement('input');
  interruptor.type = 'checkbox';
  interruptor.setAttribute('switch', '');
  // Atributo `form` vacío: si algún día el botón está en un formulario, el
  // interruptor no forma parte de él.
  interruptor.setAttribute('form', '');
  interruptor.tabIndex = -1;
  // Nunca bajo el dedo: WebKit da por atendido un toque que empieza sobre un
  // interruptor, y eso cortaría un desplazamiento que empiece sobre el botón.
  interruptor.style.cssText = 'position:absolute;width:1px;height:1px;margin:0;visibility:hidden;';
  // El label le reenvía su click al interruptor. Ese click no tiene que
  // llegar al botón, que ya recibió su copia.
  for (const tipo of ['click', 'input', 'change']) interruptor.addEventListener(tipo, detener);

  capa.addEventListener('click', (e) => {
    if (e.target === capa) atenderToque(boton, e as MouseEvent);
  });
  // Después del click de un label, WebKit manda un DOMActivate que sube hasta
  // el botón y lo activaría por segunda vez.
  capa.addEventListener('DOMActivate', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  capa.appendChild(interruptor);
  return capa;
}

function ponerCapa(boton: HTMLElement): void {
  if (!boton.isConnected) return;
  let capa = capas.get(boton);
  if (capa && capa.parentNode === boton) return;
  if (!capa) {
    capa = crearCapa(boton);
    capas.set(boton, capa);
  }
  boton.setAttribute(ATRIBUTO_BOTON, '');
  boton.appendChild(capa);
}

function cubrirBotones(raiz: HTMLElement): void {
  if (raiz.matches(SELECTOR_BOTON)) ponerCapa(raiz);
  raiz.querySelectorAll<HTMLElement>(SELECTOR_BOTON).forEach(ponerCapa);
}

let observador: MutationObserver | null = null;

/**
 * Pone la capa en cada botón, y en los que vayan apareciendo. Se llama una
 * vez, al arrancar la app.
 *
 * En Android, en la computadora y en un iPhone sin `switch` no hace nada: la
 * capa sólo existe donde es el único camino.
 */
export function instalarHapticos(): void {
  if (observador) return;
  if (tieneVibracion() || !soportaInterruptorHaptico()) return;
  // Safari de computadora también conoce `switch`, pero ahí no hay dedo.
  if (!(navigator.maxTouchPoints > 0)) return;

  try {
    // Un botón sin posición propia no contendría a su capa, que se estiraría
    // sobre el primer contenedor que sí la tenga. `:where` no pesa nada: un
    // botón que ya es `absolute`, `fixed` o `sticky` se queda como está.
    const estilo = document.createElement('style');
    estilo.textContent = `:where([${ATRIBUTO_BOTON}]){position:relative}`;
    document.head.appendChild(estilo);

    observador = new MutationObserver((cambios) => {
      for (const cambio of cambios) {
        // React cambia el texto de un botón con `textContent`, que se lleva
        // todos sus hijos, la capa incluida: se la devuelve.
        if (esElemento(cambio.target) && cambio.target.matches(SELECTOR_BOTON)) {
          ponerCapa(cambio.target);
        }
        cambio.addedNodes.forEach((nodo) => {
          if (esElemento(nodo)) cubrirBotones(nodo);
        });
      }
    });
    observador.observe(document.body, { childList: true, subtree: true });
    cubrirBotones(document.body);
  } catch {
    // Sin capa la app funciona igual; sólo no vibra.
  }
}

// ---------------------------------------------------------------------------
// iPhone: el camino por código (iOS 17.4 a 26.4)
// ---------------------------------------------------------------------------

let aparato: { interruptor: HTMLInputElement; etiqueta: HTMLLabelElement } | null = null;

function obtenerAparato(): typeof aparato {
  if (!soportaInterruptorHaptico()) return null;
  if (aparato && aparato.interruptor.isConnected) return aparato;

  try {
    const oculto = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    const interruptor = document.createElement('input');
    interruptor.type = 'checkbox';
    interruptor.setAttribute('switch', '');
    interruptor.id = 'haptico-por-codigo';
    interruptor.tabIndex = -1;
    interruptor.setAttribute('aria-hidden', 'true');
    interruptor.style.cssText = oculto;

    const etiqueta = document.createElement('label');
    etiqueta.htmlFor = interruptor.id;
    etiqueta.setAttribute('aria-hidden', 'true');
    etiqueta.style.cssText = oculto;

    document.body.append(interruptor, etiqueta);
    aparato = { interruptor, etiqueta };
    return aparato;
  } catch {
    return null;
  }
}

/** Se le hace click al label, no al interruptor: así vibraba hasta iOS 26.4. */
function toquePorCodigo(): void {
  try {
    obtenerAparato()?.etiqueta.click();
  } catch {
    // Nada que hacer: este teléfono no vibra por código.
  }
}

/** Un toque en iPhone: el del dedo si hay uno en curso, si no por código. */
function toqueIOS(): void {
  if (reclamarToque()) return;
  toquePorCodigo();
}

// ---------------------------------------------------------------------------
// Lo que usa la aplicación
// ---------------------------------------------------------------------------

/**
 * Un pulso. En Android dura lo que se le pida; en iPhone es siempre el mismo
 * toque, porque el sistema no deja elegir intensidad desde la web.
 */
function pulso(ms: number): void {
  if (vibrar(ms)) return;
  if (soportaInterruptorHaptico()) toqueIOS();
}

/**
 * Una secuencia. En Android va como patrón nativo. En iPhone el primer toque
 * va con el dedo y los demás por código, con las mismas pausas: desde iOS
 * 26.5 sólo se siente el primero.
 */
function secuencia(patron: number[]): void {
  if (vibrar(patron)) return;
  if (!soportaInterruptorHaptico()) return;

  // El patrón viene como [vibra, pausa, vibra, pausa, ...]: se disparan los
  // toques en los momentos donde habría vibración.
  let transcurrido = 0;
  for (let i = 0; i < patron.length; i += 2) {
    if (transcurrido === 0) toqueIOS();
    else setTimeout(toquePorCodigo, transcurrido);
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
