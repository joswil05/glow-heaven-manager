/**
 * La vibración, en los dos sistemas.
 *
 * El primer error: el módulo entero estaba construido sobre
 * `navigator.vibrate()`, que en iPhone no existe. En un Android se veía
 * perfecto y en un iPhone no pasaba nada.
 *
 * El segundo: el rodeo de iPhone alternaba un interruptor `switch` escondido
 * por código, y desde iOS 26.5 (WebKit bug 309082) un click por código ya no
 * vibra. Sólo vibra un toque de verdad sobre el interruptor o su `<label>`.
 * Las pruebas de entonces pasaban igual, porque contaban clicks, y un click
 * por código también es un click: no distinguían un dedo de un script.
 *
 * Por eso el iPhone de estas pruebas sigue la regla de iOS 26.5: un label
 * sólo hace vibrar a su interruptor si el click que recibió viene de un dedo
 * (`isTrusted`). Lo que no pueden comprobar es que el teléfono vibre de
 * verdad; eso sólo se siente con el aparato en la mano.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Un DOM mínimo, con la regla de iOS 26.5
// ---------------------------------------------------------------------------

type Escucha = (e: EventoFalso) => void;

class EventoFalso {
  type: string;
  bubbles: boolean;
  cancelable: boolean;
  isTrusted: boolean;
  target: ElementoFalso | null = null;
  currentTarget: ElementoFalso | null = null;
  defaultPrevented = false;
  detenido = false;

  constructor(type: string, init: { bubbles?: boolean; cancelable?: boolean } = {}, isTrusted = false) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
    this.isTrusted = isTrusted;
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation() {
    this.detenido = true;
  }
}

class ElementoFalso {
  readonly nodeType = 1;
  readonly tagName: string;
  parentNode: ElementoFalso | null = null;
  children: ElementoFalso[] = [];
  style: Record<string, string> = {};
  atributos = new Map<string, string>();
  escuchas = new Map<string, Escucha[]>();
  type = '';
  id = '';
  htmlFor = '';
  tabIndex = 0;
  checked = false;
  disabled = false;
  textContent = '';

  constructor(
    tag: string,
    private mundo: Mundo
  ) {
    this.tagName = tag.toUpperCase();
    // Así se detecta Safari 17.4 en adelante: la propiedad existe.
    if (tag === 'input' && mundo.conSwitch) (this as Record<string, unknown>).switch = false;
  }

  setAttribute(nombre: string, valor: string) {
    this.atributos.set(nombre, valor);
  }

  getAttribute(nombre: string) {
    return this.atributos.get(nombre) ?? null;
  }

  hasAttribute(nombre: string) {
    return this.atributos.has(nombre);
  }

  appendChild(hijo: ElementoFalso) {
    hijo.remove();
    hijo.parentNode = this;
    this.children.push(hijo);
    return hijo;
  }

  append(...hijos: ElementoFalso[]) {
    for (const hijo of hijos) this.appendChild(hijo);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode = null;
  }

  get isConnected(): boolean {
    for (let n: ElementoFalso | null = this; n; n = n.parentNode) {
      if (n === this.mundo.body || n === this.mundo.head) return true;
    }
    return false;
  }

  addEventListener(tipo: string, escucha: Escucha) {
    this.escuchas.set(tipo, [...(this.escuchas.get(tipo) ?? []), escucha]);
  }

  matches(selector: string): boolean {
    if (selector === 'button') return this.tagName === 'BUTTON';
    if (selector === ':disabled') return this.disabled;
    throw new Error(`selector no simulado: ${selector}`);
  }

  /** Todos los descendientes, en orden. */
  descendientes(): ElementoFalso[] {
    return this.children.flatMap((hijo) => [hijo, ...hijo.descendientes()]);
  }

  querySelectorAll(selector: string): ElementoFalso[] {
    return this.descendientes().filter((n) => n.matches(selector));
  }

  dispatchEvent(e: EventoFalso): boolean {
    e.target ??= this;
    for (let n: ElementoFalso | null = this; n; n = n.parentNode) {
      e.currentTarget = n;
      for (const escucha of n.escuchas.get(e.type) ?? []) escucha(e);
      if (e.detenido || !e.bubbles) break;
    }
    // Lo que hace un label por su cuenta: pasarle el click a su interruptor.
    if (e.type === 'click' && !e.defaultPrevented && this.tagName === 'LABEL') {
      this.mundo.activarLabel(this, e);
    }
    return !e.defaultPrevented;
  }

  /** Un click por código: nunca es de confianza. */
  click() {
    this.dispatchEvent(new EventoFalso('click', { bubbles: true, cancelable: true }, false));
  }
}

class Mundo {
  body: ElementoFalso;
  head: ElementoFalso;
  observadores: { aviso: (cambios: unknown[]) => void }[] = [];
  /** Toques que el teléfono siente en iOS 26.5: interruptor alternado por un dedo. */
  vibraciones = 0;
  /** Interruptor alternado por código: vibraba hasta iOS 26.4, ya no. */
  porCodigo = 0;

  constructor(public conSwitch: boolean) {
    this.body = new ElementoFalso('body', this);
    this.head = new ElementoFalso('head', this);
  }

  activarLabel(label: ElementoFalso, origen: EventoFalso) {
    const control = label.htmlFor
      ? this.body.descendientes().find((n) => n.id === label.htmlFor)
      : label.children.find((n) => n.tagName === 'INPUT');
    if (!control) return;
    control.checked = !control.checked;
    // El label le pasa el click al interruptor con la misma confianza que
    // tenía el suyo. Si no se lo detiene, sube hasta el botón.
    control.dispatchEvent(new EventoFalso('click', { bubbles: true }, origen.isTrusted));
    if (!control.hasAttribute('switch')) return;
    if (origen.isTrusted) this.vibraciones += 1;
    else this.porCodigo += 1;
  }

  /** El dedo cae sobre lo que esté más arriba en ese botón. */
  tocar(boton: ElementoFalso) {
    const capa = boton.children.find((n) => n.hasAttribute('data-capa-haptica'));
    (capa ?? boton).dispatchEvent(new EventoFalso('click', { bubbles: true, cancelable: true }, true));
  }

  avisar(cambios: { target: ElementoFalso; addedNodes: ElementoFalso[] }[]) {
    for (const o of this.observadores) o.aviso(cambios);
  }
}

// ---------------------------------------------------------------------------
// Los teléfonos
// ---------------------------------------------------------------------------

/** Deja el entorno como un Android: existe `navigator.vibrate`. */
function simularAndroid(): { llamadas: (number | number[])[]; creados: number } {
  const estado = { llamadas: [] as (number | number[])[], creados: 0 };
  vi.stubGlobal('navigator', {
    maxTouchPoints: 5,
    vibrate: (patron: number | number[]) => {
      estado.llamadas.push(patron);
      return true;
    },
  });
  vi.stubGlobal('document', {
    createElement: () => {
      estado.creados += 1;
      return {}; // sin soporte de `switch`
    },
    body: { appendChild: () => {}, querySelectorAll: () => [] },
    head: { appendChild: () => {} },
  });
  return estado;
}

/** Un iPhone: sin `vibrate`, y con `switch` desde iOS 17.4. */
function simularIphone({ conSwitch = true, dedos = 5 } = {}): Mundo {
  const mundo = new Mundo(conSwitch);
  vi.stubGlobal('navigator', { maxTouchPoints: dedos });
  vi.stubGlobal('document', {
    createElement: (tag: string) => new ElementoFalso(tag, mundo),
    body: mundo.body,
    head: mundo.head,
  });
  vi.stubGlobal(
    'MouseEvent',
    class extends EventoFalso {
      constructor(type: string, init: { bubbles?: boolean; cancelable?: boolean }) {
        super(type, init, false);
      }
    }
  );
  vi.stubGlobal(
    'MutationObserver',
    class {
      constructor(private callback: (cambios: unknown[]) => void) {}
      observe() {
        mundo.observadores.push({ aviso: (c) => this.callback(c) });
      }
      disconnect() {}
    }
  );
  return mundo;
}

/** Un botón en pantalla que, al tocarlo, hace lo que se le diga. */
function boton(mundo: Mundo, alTocar: () => void = () => {}): ElementoFalso & { clicks: number } {
  const b = new ElementoFalso('button', mundo) as ElementoFalso & { clicks: number };
  b.clicks = 0;
  b.addEventListener('click', () => {
    b.clicks += 1;
    alTocar();
  });
  mundo.body.appendChild(b);
  return b;
}

/** El módulo cachea la detección, así que hay que recargarlo en cada caso. */
async function cargarHaptics() {
  vi.resetModules();
  return import('../mobile/src/lib/haptics');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------

describe('en un Android', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('usa la vibración nativa, con la duración de cada estilo', async () => {
    const { llamadas } = simularAndroid();
    const { haptics } = await cargarHaptics();

    haptics.selection();
    haptics.impact('light');
    haptics.impact('medium');
    haptics.impact('heavy');

    expect(llamadas).toEqual([8, 12, 22, 35]);
  });

  it('manda las secuencias como patrón, no como pulsos sueltos', async () => {
    const { llamadas } = simularAndroid();
    const { haptics } = await cargarHaptics();

    haptics.success();
    haptics.error();

    expect(llamadas[0]).toEqual([12, 45, 22]);
    expect(llamadas[1]).toEqual([30, 40, 30, 40, 45]);
  });

  it('no le agrega nada a la pantalla', async () => {
    const estado = simularAndroid();
    const { instalarHapticos } = await cargarHaptics();

    instalarHapticos();

    expect(estado.creados, 'en Android la capa de iPhone no tiene que existir').toBe(0);
  });

  it('se declara disponible por vibración', async () => {
    simularAndroid();
    const { estadoHaptico } = await cargarHaptics();
    expect(estadoHaptico()).toEqual({ disponible: true, via: 'vibracion' });
  });
});

describe('en un iPhone con iOS 26.5 o más nuevo', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('tocar un botón que pide vibrar, vibra', async () => {
    const mundo = simularIphone();
    const { haptics, instalarHapticos } = await cargarHaptics();
    const b = boton(mundo, () => haptics.impact('heavy'));

    instalarHapticos();
    mundo.tocar(b);

    expect(mundo.vibraciones, 'el dedo tocó el botón y el teléfono no sintió nada').toBe(1);
  });

  it('el botón recibe un solo click por toque', async () => {
    const mundo = simularIphone();
    const { haptics, instalarHapticos } = await cargarHaptics();
    const b = boton(mundo, () => haptics.selection());

    instalarHapticos();
    mundo.tocar(b);

    expect(b.clicks).toBe(1);
  });

  it('un botón que no pide vibrar no vibra', async () => {
    const mundo = simularIphone();
    const { instalarHapticos } = await cargarHaptics();
    const b = boton(mundo);

    instalarHapticos();
    mundo.tocar(b);

    expect(b.clicks, 'el botón tiene que funcionar igual').toBe(1);
    expect(mundo.vibraciones + mundo.porCodigo).toBe(0);
  });

  it('un botón desactivado no recibe el toque ni vibra', async () => {
    const mundo = simularIphone();
    const { haptics, instalarHapticos } = await cargarHaptics();
    const b = boton(mundo, () => haptics.impact('heavy'));
    b.disabled = true;

    instalarHapticos();
    mundo.tocar(b);

    expect(b.clicks).toBe(0);
    expect(mundo.vibraciones).toBe(0);
  });

  it('los botones que aparecen después también vibran', async () => {
    const mundo = simularIphone();
    const { haptics, instalarHapticos } = await cargarHaptics();

    instalarHapticos();
    const b = boton(mundo, () => haptics.selection());
    mundo.avisar([{ target: mundo.body, addedNodes: [b] }]);
    mundo.tocar(b);

    expect(mundo.vibraciones).toBe(1);
  });

  it('si la pantalla le reescribe el texto al botón, la capa vuelve', async () => {
    const mundo = simularIphone();
    const { haptics, instalarHapticos } = await cargarHaptics();
    const b = boton(mundo, () => haptics.selection());

    instalarHapticos();
    // React cambia el texto de un botón con `textContent`, que borra todos
    // sus hijos, la capa incluida.
    for (const hijo of [...b.children]) hijo.remove();
    mundo.avisar([{ target: b, addedNodes: [] }]);
    mundo.tocar(b);

    expect(mundo.vibraciones).toBe(1);
  });

  it('la capa no se anuncia, no se enfoca y no tiene texto', async () => {
    const mundo = simularIphone();
    const { instalarHapticos } = await cargarHaptics();
    const b = boton(mundo);

    instalarHapticos();
    const capa = b.children.find((n) => n.hasAttribute('data-capa-haptica'))!;
    const interruptor = capa.children[0];

    expect(capa.getAttribute('aria-hidden')).toBe('true');
    expect(capa.textContent).toBe('');
    expect(interruptor.hasAttribute('switch')).toBe(true);
    expect(interruptor.tabIndex).toBe(-1);
  });

  it('lo que se pide fuera del toque no puede vibrar', async () => {
    const mundo = simularIphone();
    const { haptics, instalarHapticos } = await cargarHaptics();
    instalarHapticos();

    // Lo que llega después de un `await`: la confirmación de Firebase.
    haptics.success();

    expect(mundo.vibraciones).toBe(0);
    expect(mundo.porCodigo, 'el camino por código queda para iOS 17.4 a 26.4').toBe(1);
  });

  it('una secuencia dentro del toque: el primero con el dedo, el resto por código', async () => {
    vi.useFakeTimers();
    const mundo = simularIphone();
    const { haptics, instalarHapticos } = await cargarHaptics();
    const b = boton(mundo, () => haptics.error()); // [30, 40, 30, 40, 45]: tres momentos

    instalarHapticos();
    mundo.tocar(b);
    expect(mundo.vibraciones).toBe(1);

    vi.advanceTimersByTime(500);
    expect(mundo.vibraciones, 'el dedo ya se fue: los que siguen no vibran').toBe(1);
    expect(mundo.porCodigo).toBe(2);
  });

  it('se declara disponible por interruptor', async () => {
    simularIphone();
    const { estadoHaptico } = await cargarHaptics();
    expect(estadoHaptico()).toEqual({ disponible: true, via: 'interruptor' });
  });

  it('en Safari de computadora, sin pantalla táctil, no pone capas', async () => {
    const mundo = simularIphone({ dedos: 0 });
    const { instalarHapticos } = await cargarHaptics();
    const b = boton(mundo);

    instalarHapticos();

    expect(b.children).toHaveLength(0);
  });
});

describe('en un iPhone viejo', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('no revienta: simplemente no hay vibración', async () => {
    const mundo = simularIphone({ conSwitch: false });
    const { haptics, estadoHaptico, instalarHapticos } = await cargarHaptics();
    const b = boton(mundo, () => haptics.impact('heavy'));

    expect(() => {
      instalarHapticos();
      mundo.tocar(b);
      haptics.selection();
      haptics.success();
      haptics.error();
    }).not.toThrow();

    expect(b.children, 'sin `switch` la capa no sirve de nada').toHaveLength(0);
    expect(estadoHaptico()).toEqual({ disponible: false, via: 'ninguno' });
  });
});
