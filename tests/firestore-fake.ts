/**
 * Firestore en memoria para las pruebas.
 *
 * El emulador oficial de Firebase necesita Java y una descarga de ~100 MB, y
 * las pruebas contra el proyecto real cuestan dinero y dependen de la red.
 * Esto implementa el subconjunto de la API que usan los repositorios, corre
 * en milisegundos y no sale de la máquina.
 *
 * Además cuenta lecturas y escrituras. Firestore cobra por documento leído,
 * así que "cuántas lecturas cuesta abrir el panel" es una regresión que hay
 * que poder medir, no estimar.
 */

export interface Contadores {
  lecturas: number;
  escrituras: number;
  borrados: number;
  consultas: number;
}

type Documento = Record<string, unknown>;

interface Filtro {
  campo: string;
  op: string;
  valor: unknown;
}

interface Orden {
  campo: string;
  direccion: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

class BaseFalsa {
  /** colección -> id -> documento */
  datos = new Map<string, Map<string, Documento>>();
  contadores: Contadores = { lecturas: 0, escrituras: 0, borrados: 0, consultas: 0 };

  coleccion(nombre: string): Map<string, Documento> {
    let c = this.datos.get(nombre);
    if (!c) {
      c = new Map();
      this.datos.set(nombre, c);
    }
    return c;
  }

  reiniciar(): void {
    this.datos.clear();
    this.reiniciarContadores();
  }

  reiniciarContadores(): void {
    this.contadores = { lecturas: 0, escrituras: 0, borrados: 0, consultas: 0 };
  }
}

let base = new BaseFalsa();

export function reiniciarFirestoreFalso(): void {
  base.reiniciar();
}

export function contadores(): Contadores {
  return { ...base.contadores };
}

export function reiniciarContadores(): void {
  base.reiniciarContadores();
}

/** Vuelca el contenido crudo de una colección. Útil para afirmar sobre datos. */
export function volcar(coleccion: string): Documento[] {
  return [...base.coleccion(coleccion).values()].map((d) => clonar(d));
}

function clonar<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

// ---------------------------------------------------------------------------
// Referencias
// ---------------------------------------------------------------------------

export interface RefDoc {
  __tipo: 'doc';
  coleccion: string;
  id: string;
}

export interface RefColeccion {
  __tipo: 'coleccion';
  nombre: string;
}

export interface Consulta {
  __tipo: 'consulta';
  coleccion: string;
  filtros: Filtro[];
  orden: Orden[];
  limite?: number;
}

export function getFirestore(): unknown {
  return base;
}

export function initializeApp(): unknown {
  return base;
}
export function getApps(): unknown[] {
  return [base];
}
export function getApp(): unknown {
  return base;
}

export function doc(_db: unknown, coleccion: string, id: string): RefDoc {
  return { __tipo: 'doc', coleccion, id: String(id) };
}

export function collection(_db: unknown, nombre: string): RefColeccion {
  return { __tipo: 'coleccion', nombre };
}

export function where(campo: string, op: string, valor: unknown): Filtro {
  return { campo, op, valor };
}

export function orderBy(campo: string, direccion: 'asc' | 'desc' = 'asc'): Orden {
  return { campo, direccion };
}

export function limit(n: number): { __limite: number } {
  return { __limite: n };
}

export function query(
  origen: RefColeccion | Consulta,
  ...clausulas: (Filtro | Orden | { __limite: number })[]
): Consulta {
  const consulta: Consulta =
    '__tipo' in origen && origen.__tipo === 'consulta'
      ? { ...origen, filtros: [...origen.filtros], orden: [...origen.orden] }
      : { __tipo: 'consulta', coleccion: (origen as RefColeccion).nombre, filtros: [], orden: [] };

  for (const c of clausulas) {
    if ('__limite' in c) consulta.limite = c.__limite;
    else if ('op' in c) consulta.filtros.push(c);
    else consulta.orden.push(c);
  }
  return consulta;
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

interface Snapshot {
  id: string;
  ref: RefDoc;
  exists(): boolean;
  data(): Documento | undefined;
}

function armarSnapshot(coleccion: string, id: string, datos: Documento | undefined): Snapshot {
  return {
    id,
    ref: { __tipo: 'doc', coleccion, id },
    exists: () => datos !== undefined,
    data: () => (datos === undefined ? undefined : clonar(datos)),
  };
}

export async function getDoc(ref: RefDoc): Promise<Snapshot> {
  base.contadores.lecturas += 1;
  const datos = base.coleccion(ref.coleccion).get(ref.id);
  return armarSnapshot(ref.coleccion, ref.id, datos);
}

function cumple(doc: Documento, f: Filtro): boolean {
  const v = doc[f.campo];
  switch (f.op) {
    case '==':
      return v === f.valor;
    case '!=':
      return v !== f.valor;
    case '>':
      return (v as number) > (f.valor as number);
    case '>=':
      return (v as number) >= (f.valor as number);
    case '<':
      return (v as number) < (f.valor as number);
    case '<=':
      return (v as number) <= (f.valor as number);
    case 'in':
      return Array.isArray(f.valor) && f.valor.includes(v);
    case 'array-contains':
      return Array.isArray(v) && v.includes(f.valor);
    default:
      throw new Error(`Operador no soportado en el Firestore falso: ${f.op}`);
  }
}

export async function getDocs(
  origen: RefColeccion | Consulta
): Promise<{ docs: Snapshot[]; empty: boolean; size: number }> {
  const consulta: Consulta =
    origen.__tipo === 'consulta'
      ? origen
      : { __tipo: 'consulta', coleccion: origen.nombre, filtros: [], orden: [] };

  base.contadores.consultas += 1;

  const col = base.coleccion(consulta.coleccion);
  let filas = [...col.entries()].map(([id, datos]) => ({ id, datos }));

  for (const f of consulta.filtros) {
    filas = filas.filter((x) => cumple(x.datos, f));
  }

  for (const o of [...consulta.orden].reverse()) {
    filas.sort((a, b) => {
      const va = a.datos[o.campo];
      const vb = b.datos[o.campo];
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va ?? '').localeCompare(String(vb ?? ''));
      return o.direccion === 'desc' ? -cmp : cmp;
    });
  }

  if (consulta.limite !== undefined) {
    filas = filas.slice(0, consulta.limite);
  }

  // Firestore cobra una lectura por documento devuelto, no por consulta.
  base.contadores.lecturas += filas.length;

  const docs = filas.map((x) => armarSnapshot(consulta.coleccion, x.id, x.datos));
  return { docs, empty: docs.length === 0, size: docs.length };
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/**
 * Firestore rechaza `undefined` en cualquier nivel, incluidos los objetos
 * dentro de un array. El emulador oficial encontró un caso que esta función
 * dejaba pasar por no recorrer arrays, así que acá LANZA igual que el SDK
 * real en vez de limpiar en silencio.
 */
function verificarSinUndefined(valor: unknown, ruta: string): void {
  if (valor === undefined) {
    throw new Error(
      `Valor no soportado: undefined (en el campo '${ruta}'). ` +
        'Firestore lo rechaza; usá `sinUndefined()` antes de escribir.'
    );
  }
  if (valor === null || typeof valor !== 'object') return;

  if (Array.isArray(valor)) {
    valor.forEach((v, i) => verificarSinUndefined(v, `${ruta}[${i}]`));
    return;
  }

  for (const [k, v] of Object.entries(valor as Documento)) {
    verificarSinUndefined(v, ruta ? `${ruta}.${k}` : k);
  }
}

function escribir(ref: RefDoc, datos: Documento, merge: boolean): void {
  // La verificación va ANTES de clonar: `JSON.stringify` borra los campos
  // `undefined` de los objetos y los convierte en `null` dentro de los
  // arrays, así que clonar primero destruye justo la evidencia que hay que
  // revisar. Esta función existía y no detectaba nada por ese motivo.
  verificarSinUndefined(datos, '');

  const col = base.coleccion(ref.coleccion);
  const limpio = clonar(datos);
  if (merge) {
    const actual = col.get(ref.id) ?? {};
    col.set(ref.id, { ...actual, ...limpio });
  } else {
    col.set(ref.id, limpio);
  }
}

export async function setDoc(
  ref: RefDoc,
  datos: Documento,
  opciones?: { merge?: boolean }
): Promise<void> {
  base.contadores.escrituras += 1;
  escribir(ref, datos, Boolean(opciones?.merge));
}

export async function deleteDoc(ref: RefDoc): Promise<void> {
  base.contadores.borrados += 1;
  base.coleccion(ref.coleccion).delete(ref.id);
}

export function writeBatch(_db: unknown) {
  const operaciones: (() => void)[] = [];
  let n = 0;

  const lote = {
    set(ref: RefDoc, datos: Documento, opciones?: { merge?: boolean }) {
      n++;
      operaciones.push(() => escribir(ref, datos, Boolean(opciones?.merge)));
      return lote;
    },
    update(ref: RefDoc, datos: Documento) {
      n++;
      operaciones.push(() => escribir(ref, datos, true));
      return lote;
    },
    delete(ref: RefDoc) {
      n++;
      operaciones.push(() => base.coleccion(ref.coleccion).delete(ref.id));
      return lote;
    },
    async commit() {
      if (n > 500) {
        throw new Error('Un lote de Firestore admite como máximo 500 operaciones.');
      }
      base.contadores.escrituras += n;
      for (const op of operaciones) op();
      operaciones.length = 0;
      n = 0;
    },
  };

  return lote;
}

/**
 * Transacción. La versión falsa es secuencial (no hay concurrencia real en
 * las pruebas), pero sí replica lo que importa: si el cuerpo lanza, nada de
 * lo que escribió queda aplicado.
 */
export async function runTransaction<T>(
  _db: unknown,
  cuerpo: (tx: {
    get(ref: RefDoc): Promise<Snapshot>;
    set(ref: RefDoc, datos: Documento, opciones?: { merge?: boolean }): void;
    update(ref: RefDoc, datos: Documento): void;
    delete(ref: RefDoc): void;
  }) => Promise<T>
): Promise<T> {
  const pendientes: (() => void)[] = [];
  let escrituras = 0;

  const tx = {
    async get(ref: RefDoc) {
      base.contadores.lecturas += 1;
      return armarSnapshot(ref.coleccion, ref.id, base.coleccion(ref.coleccion).get(ref.id));
    },
    set(ref: RefDoc, datos: Documento, opciones?: { merge?: boolean }) {
      escrituras++;
      pendientes.push(() => escribir(ref, datos, Boolean(opciones?.merge)));
    },
    update(ref: RefDoc, datos: Documento) {
      escrituras++;
      pendientes.push(() => escribir(ref, datos, true));
    },
    delete(ref: RefDoc) {
      escrituras++;
      pendientes.push(() => base.coleccion(ref.coleccion).delete(ref.id));
    },
  };

  const resultado = await cuerpo(tx);

  // Solo se aplica si el cuerpo terminó sin lanzar.
  base.contadores.escrituras += escrituras;
  for (const op of pendientes) op();

  return resultado;
}

export type Firestore = BaseFalsa;
