/**
 * Pruebas contra el emulador OFICIAL de Firestore.
 *
 * El Firestore falso de `firestore-fake.ts` replica la API, pero no el motor:
 * no valida índices, no rechaza tipos, no aplica las reglas de seguridad y no
 * tiene concurrencia real. Esta suite corre los mismos repositorios contra el
 * emulador de Google, que sí hace todo eso.
 *
 * Necesita el emulador levantado:
 *   npm run emulador
 *
 * Si no responde, la suite se salta con un aviso en vez de fallar: no todo el
 * mundo tiene Java instalado.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';

const HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';
const HOST_AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';
const PROYECTO = 'glow-heaven-db-app';
const URL_BASE = `http://${HOST}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`;

// Las reglas exigen sesión iniciada. Estas pruebas corren autenticadas, que
// es exactamente como corre la aplicación en producción.
const CORREO = 'pruebas@glowheaven.local';
const CLAVE = 'prueba1234';

const g = () => randomUUID();
const HOY = new Date().toISOString().slice(0, 10);



async function emuladorVivo(): Promise<boolean> {
  try {
    const r = await fetch(`http://${HOST}/`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

// `skipIf` se evalúa cuando vitest recolecta los tests, antes de cualquier
// hook. Por eso la comprobación va acá arriba y no en `beforeAll`.
const disponible = await emuladorVivo();

if (!disponible) {
  // eslint-disable-next-line no-console
  console.warn(
    [
      '',
      `  Emulador de Firestore no disponible en ${HOST}.`,
      '  Abrí otra terminal, corré `npm run emulador` y volvé a intentar.',
      '',
    ].join('\n')
  );
}

async function limpiar(): Promise<void> {
  await fetch(URL_BASE, { method: 'DELETE' });
}

/** UID de la cuenta de prueba, necesario para autorizarla ante las reglas. */
let uidPrueba = '';

/**
 * Da de alta el UID en `usuarios_autorizados`.
 *
 * Las reglas ya no dejan entrar a cualquier sesión: exigen estar en la lista
 * blanca. El emulador acepta `Authorization: Bearer owner` para escribir
 * saltándose las reglas, que es la única forma de sembrar el permiso (desde el
 * cliente esa colección es de sólo lectura, a propósito).
 */
async function autorizarUid(uid: string): Promise<void> {
  if (!uid) return;
  await fetch(
    `http://${HOST}/v1/projects/${PROYECTO}/databases/(default)/documents/usuarios_autorizados/${uid}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer owner',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields: { activo: { booleanValue: true } } }),
    }
  );
}

/** Crea la cuenta de prueba en el emulador de Auth y abre sesión. */
async function iniciarSesion(): Promise<void> {
  const { initializeApp, getApps, getApp } = await import('firebase/app');
  const {
    getAuth,
    connectAuthEmulator,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
  } = await import('firebase/auth');
  const { FIREBASE_CONFIG } = await import('../src/shared/firebase-config');

  const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApp();
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST_AUTH}`, { disableWarnings: true });

  try {
    await createUserWithEmailAndPassword(auth, CORREO, CLAVE);
  } catch {
    // La cuenta ya existía de una corrida anterior.
  }
  const credencial = await signInWithEmailAndPassword(auth, CORREO, CLAVE);
  uidPrueba = credencial.user.uid;
}

beforeAll(async () => {
  if (!disponible) return;
  // Las reglas exigen sesión iniciada Y que el UID esté autorizado, así que
  // las pruebas corren igual que la aplicación en producción.
  await iniciarSesion();
}, 60_000);

// Los repositorios se cargan dinámicamente para que el mock global de
// `firebase/firestore` no aplique: acá queremos el SDK de verdad.
async function repos() {
  const [productos, ventas, compras, pagos, clientes, parametros, panel, eventos] =
    await Promise.all([
      import('../src/main/firebase/repositories/productos.repo'),
      import('../src/main/firebase/repositories/ventas.repo'),
      import('../src/main/firebase/repositories/compras.repo'),
      import('../src/main/firebase/repositories/pagos.repo'),
      import('../src/main/firebase/repositories/clientes.repo'),
      import('../src/main/firebase/repositories/parametros.repo'),
      import('../src/main/firebase/repositories/panel.repo'),
      import('../src/main/firebase/repositories/eventos.repo'),
    ]);

  return {
    Productos: productos.ProductosRepoFirestore,
    Ventas: ventas.VentasRepoFirestore,
    Compras: compras.ComprasRepoFirestore,
    Pagos: pagos.PagosRepoFirestore,
    Clientes: clientes.ClientesRepoFirestore,
    Parametros: parametros.ParametrosRepoFirestore,
    Panel: panel.PanelRepoFirestore,
    Eventos: eventos.EventosRepoFirestore,
  };
}

describe('contra el emulador oficial de Firestore', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await limpiar();
    // `limpiar()` borra todo, incluida la autorización: hay que resembrarla.
    await autorizarUid(uidPrueba);
    const { Parametros } = await repos();
    Parametros.invalidarCache();
    await Parametros.getParametros();
    await Parametros.getCategorias();
  });

  it.skipIf(!disponible)(
    'el paquete de $77 cuadra igual que en el motor falso',
    async () => {
      const { Compras, Productos, Ventas, Clientes } = await repos();

      const maria = await Clientes.guardar({ nombre: 'María' }, g());
      const encargo = await Ventas.crear(
        {
          cliente_id: maria,
          fecha: HOY,
          tipo: 'ENCARGO',
          lineas: [{ descripcion: 'Bolso Tommy', cantidad: 1, precio_unitario_usd_cents: 9000 }],
        },
        g()
      );

      const compraId = await Compras.guardar(
        {
          fecha: HOY,
          envio_total_usd_cents: 7700,
          lineas: [
            {
              descripcion: 'Bolso Tommy',
              cantidad: 1,
              precio_linea_usd_cents: 4500,
              peso_linea_mlb: 2000,
              destino: 'ENCARGO',
              venta_id: encargo,
            },
            {
              descripcion: 'Boxers Calvin Klein',
              cantidad: 6,
              precio_linea_usd_cents: 3000,
              peso_linea_mlb: 1500,
              destino: 'INVENTARIO',
            },
            {
              descripcion: 'Camisas Polo',
              cantidad: 3,
              precio_linea_usd_cents: 5400,
              peso_linea_mlb: 3000,
              destino: 'INVENTARIO',
            },
            {
              descripcion: 'Sandalias',
              cantidad: 2,
              precio_linea_usd_cents: 2200,
              peso_linea_mlb: 3000,
              destino: 'INVENTARIO',
            },
            {
              descripcion: 'Termo Owala',
              cantidad: 1,
              precio_linea_usd_cents: 2800,
              peso_linea_mlb: 1500,
              destino: 'INVENTARIO',
            },
          ],
        },
        g()
      );

      const compra = (await Compras.getById(compraId))!;
      expect(compra.peso_total_mlb).toBe(11000);
      expect(compra.lineas.reduce((a, l) => a + l.envio_asignado_usd_cents, 0)).toBe(7700);

      await Compras.recibir(compraId, g());

      const boxers = (await Productos.listar()).find(
        (p) => p.nombre === 'Boxers Calvin Klein'
      )!;
      expect(boxers.existencias).toBe(6);
      expect(boxers.costo_unitario_usd_cents).toBe(710);

      // El encargo congela su costo real: $45 + $3.15 tax + $14 envío.
      const v = (await Ventas.getById(encargo))!;
      expect(v.costo_total_usd_cents).toBe(6215);
    },
    30000
  );

  it.skipIf(!disponible)(
    'una venta que no alcanza no deja el inventario tocado',
    async () => {
      const { Productos, Ventas } = await repos();

      const a = await Productos.crear(
        { nombre: 'Gorra', stock_inicial: { cantidad: 4, costo_unitario_usd_cents: 500 } },
        g()
      );
      const b = await Productos.crear(
        { nombre: 'Boxers', stock_inicial: { cantidad: 6, costo_unitario_usd_cents: 710 } },
        g()
      );

      await expect(
        Ventas.crear(
          {
            fecha: HOY,
            tipo: 'INVENTARIO',
            lineas: [
              { producto_id: a, cantidad: 2 },
              { producto_id: b, cantidad: 99 },
            ],
          },
          g()
        )
      ).rejects.toThrow(/No hay suficientes unidades/i);

      expect((await Productos.getById(a))!.existencias).toBe(4);
      expect((await Productos.getById(b))!.existencias).toBe(6);
      expect(await Ventas.listar()).toHaveLength(0);
    },
    30000
  );

  it.skipIf(!disponible)(
    'las consultas ordenadas devuelven lo que deben, en orden',
    async () => {
      const { Productos, Pagos, Ventas } = await repos();

      // Esto comprueba que las consultas ordenadas devuelven lo que deben y
      // en el orden correcto.
      //
      // Lo que NO comprueba es que los índices estén declarados: se verificó
      // plantando consultas sin índice y el emulador las ejecuta igual, sin
      // quejarse. Sólo la base de producción rechaza una consulta sin índice,
      // y lo hace en silencio para el usuario (la pantalla queda vacía).
      // De eso se encarga `scripts/auditar-indices.mjs`, que contrasta las
      // consultas del código contra `firestore.indexes.json` sin red.
      const p = await Productos.crear(
        { nombre: 'Movido', stock_inicial: { cantidad: 1, costo_unitario_usd_cents: 100 } },
        g()
      );
      for (let i = 0; i < 12; i++) {
        await Productos.entrada({ producto_id: p, cantidad: 1, costo_total_usd_cents: 100 });
      }

      const movimientos = await Productos.movimientos(p, 5);
      expect(movimientos).toHaveLength(5);
      // Ordenados del más nuevo al más viejo.
      for (let i = 1; i < movimientos.length; i++) {
        expect(movimientos[i - 1].id >= movimientos[i].id).toBe(true);
      }

      const venta = await Ventas.crear(
        {
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ descripcion: 'Suelto', cantidad: 1, precio_unitario_usd_cents: 5000 }],
        },
        g()
      );
      await Pagos.registrar(
        { venta_id: venta, fecha: HOY, monto_cents: 1000, moneda: 'USD', metodo: 'EFECTIVO' },
        g()
      );

      const recientes = await Pagos.recientes(5);
      expect(recientes.length).toBeGreaterThan(0);
    },
    60000
  );

  it.skipIf(!disponible)(
    'Firestore acepta los documentos que escriben los repositorios',
    async () => {
      const { Productos, Ventas, Clientes, Pagos } = await repos();

      // El SDK real lanza ante `undefined` en cualquier campo. Este camino
      // recorre entradas con muchos opcionales sin llenar.
      const cliente = await Clientes.guardar({ nombre: 'Sin datos extra' }, g());
      const producto = await Productos.crear(
        {
          nombre: 'Con variantes',
          tiene_variantes: true,
          variantes: [{ talla: 'M' }, { color: 'Negro' }, {}],
        },
        g()
      );

      await Productos.entrada({
        producto_id: producto,
        cantidad: 5,
        costo_total_usd_cents: 2500,
      });

      const venta = await Ventas.crear(
        {
          cliente_id: cliente,
          fecha: HOY,
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: producto, cantidad: 1 }],
          plan_cuotas: { cantidad: 3, cada_dias: 15 },
        },
        g()
      );

      await Pagos.registrar(
        { venta_id: venta, fecha: HOY, monto_cents: 500, moneda: 'COR', metodo: 'TRANSFERENCIA' },
        g()
      );

      const v = (await Ventas.getById(venta))!;
      expect(v.cuotas).toHaveLength(3);
      expect(v.pagado_usd_cents).toBeGreaterThan(0);

      // Los totales del cliente se refrescan solos.
      const c = (await Clientes.getById(cliente))!;
      expect(c.compras_count).toBe(1);
    },
    30000
  );

  it.skipIf(!disponible)(
    'la foto del producto entra y sale intacta',
    async () => {
      const { Productos } = await repos();

      // Una miniatura real: data URL de JPEG. Va DENTRO del documento del
      // producto, así que este test es el que avisa si algun día crece de
      // mas o si las reglas empiezan a rechazar el campo.
      const foto = `data:image/jpeg;base64,${'/9j/4AAQSkZJRg'.repeat(600)}`;

      const id = await Productos.crear({ nombre: 'Con foto', foto }, g());
      const guardado = (await Productos.getById(id))!;
      expect(guardado.foto).toBe(foto);

      // Cadena vacía = la persona le quitó la foto.
      await Productos.actualizar({ id, foto: '' }, g());
      const sinFoto = (await Productos.getById(id))!;
      expect(sinFoto.foto ?? null).toBeNull();
    },
    30000
  );

  it.skipIf(!disponible)(
    'deshacer revierte de verdad contra el motor real',
    async () => {
      const { Productos, Eventos } = await repos();

      const grupo = g();
      const id = await Productos.crear({ nombre: 'Temporal' }, grupo);
      expect(await Productos.getById(id)).not.toBeNull();

      const r = await Eventos.deshacerGrupo(grupo);
      expect(r.revertido).toBe(true);
      expect(await Productos.getById(id)).toBeNull();
    },
    30000
  );

  it.skipIf(!disponible)(
    'dos entradas simultáneas no se pisan',
    async () => {
      const { Productos } = await repos();

      const p = await Productos.crear(
        { nombre: 'Concurrente', stock_inicial: { cantidad: 0, costo_unitario_usd_cents: 0 } },
        g()
      );

      // Sin transacción, leer-modificar-escribir en paralelo pierde una de
      // las dos entradas. Con `runTransaction`, Firestore reintenta.
      await Promise.all([
        Productos.entrada({ producto_id: p, cantidad: 5, costo_total_usd_cents: 500 }),
        Productos.entrada({ producto_id: p, cantidad: 3, costo_total_usd_cents: 300 }),
        Productos.entrada({ producto_id: p, cantidad: 2, costo_total_usd_cents: 200 }),
      ]);

      const final = (await Productos.getById(p))!;
      expect(final.existencias).toBe(10);
      expect(final.valor_inventario_usd_cents).toBe(1000);
    },
    60000
  );

  it.skipIf(!disponible)(
    'el panel lee una vez cada colección, también contra el motor real',
    async () => {
      const { Productos, Ventas, Clientes, Panel } = await repos();

      const cli = await Clientes.guardar({ nombre: 'Cliente' }, g());
      for (let i = 0; i < 8; i++) {
        const p = await Productos.crear(
          {
            nombre: `P${i}`,
            modo_precio: 'MANUAL',
            precio_manual_usd_cents: 2000,
            stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 800 },
          },
          g()
        );
        await Ventas.crear(
          {
            cliente_id: cli,
            fecha: HOY,
            tipo: 'INVENTARIO',
            lineas: [{ producto_id: p, cantidad: 1 }],
          },
          g()
        );
      }

      const inicio = Date.now();
      const panel = await Panel.cargar();
      const ms = Date.now() - inicio;

      expect(panel.resumen.productos_activos).toBe(8);
      expect(panel.resumen.unidades_en_inventario).toBe(8 * 4);
      expect(panel.ganancia_mes_actual!.ventas_count).toBe(8);

      // Una pasada por colección son cuatro consultas en paralelo. Si alguien
      // reintroduce lecturas repetidas, esto se dispara.
      // eslint-disable-next-line no-console
      console.log(`   panel contra el emulador: ${ms} ms`);
      expect(ms).toBeLessThan(5000);
    },
    120000
  );
});

describe('ajuste de existencias', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await limpiar();
    await autorizarUid(uidPrueba);
    const { Parametros } = await repos();
    Parametros.invalidarCache();
    await Parametros.getParametros();
    await Parametros.getCategorias();
  });

  it.skipIf(!disponible)(
    'ajusta el producto que se pidió, no otro que comparta el id de variante',
    async () => {
      const { Productos } = await repos();

      // Los ids de variante se asignan como `i + 1` dentro de cada producto,
      // así que NO son únicos entre productos: los dos tienen una variante 1.
      const primero = await Productos.crear(
        { nombre: 'Primero', stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 100 } },
        g()
      );
      const segundo = await Productos.crear(
        { nombre: 'Segundo', stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 100 } },
        g()
      );

      const antes = await Productos.getById(segundo);
      const varianteDelSegundo = antes!.variantes[0].id;

      // Subir de 5 a 9 el SEGUNDO producto.
      await Productos.ajustar(varianteDelSegundo, 9, g(), 'Conteo manual', segundo);

      const p1 = await Productos.getById(primero);
      const p2 = await Productos.getById(segundo);

      expect(p2!.existencias).toBe(9);
      // Si esto falla, el ajuste se aplicó al producto equivocado.
      expect(p1!.existencias).toBe(5);
    },
    120000
  );

  it.skipIf(!disponible)(
    'sin producto_id no adivina: falla en vez de tocar el producto equivocado',
    async () => {
      const { Productos } = await repos();

      await Productos.crear(
        { nombre: 'Primero', stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 100 } },
        g()
      );
      const segundo = await Productos.crear(
        { nombre: 'Segundo', stock_inicial: { cantidad: 5, costo_unitario_usd_cents: 100 } },
        g()
      );

      const antes = await Productos.getById(segundo);
      const varianteAmbigua = antes!.variantes[0].id;

      // Ambos productos tienen una variante con ese id: es ambiguo. Antes esto
      // elegía en silencio el primero que apareciera y ajustaba el stock del
      // producto equivocado.
      await expect(
        Productos.ajustar(varianteAmbigua, 9, g(), 'Conteo manual')
      ).rejects.toThrow(/ambigu|no se puede determinar|producto/i);
    },
    120000
  );
});

/**
 * Guardia de las reglas de seguridad.
 *
 * Estas pruebas existen por un incidente real: al agregar la lista blanca, la
 * función `autenticado()` de `firestore.rules` quedó escrita como
 * `request.auth == null || (...lista blanca...)`. La intención era dejar pasar
 * al proceso Node del escritorio, pero en Firestore `request.auth` es null
 * justamente cuando nadie inició sesión, así que esa línea le abría la base
 * entera —clientas, teléfonos, costos, deudas— a cualquiera que llamara a la
 * API sin autenticarse.
 *
 * Ni el typecheck ni las 140 pruebas del motor falso podían verlo: el motor
 * falso no evalúa reglas. Sólo el emulador las aplica de verdad.
 */
describe('reglas de seguridad de Firestore', () => {
  /**
   * Comprueba que Firestore rechazó por permisos.
   *
   * Se mira `code` y no el texto: el mensaje varía según cómo terminó la
   * evaluación. Cuando el UID no está en `usuarios_autorizados`, el `exists()`
   * de las reglas produce un "evaluation error" en vez de un `false` limpio;
   * Firestore deniega igual (las reglas fallan cerradas), pero el texto
   * cambia. `code` siempre es `permission-denied`.
   */
  async function esperarDenegado(operacion: Promise<unknown>): Promise<void> {
    let codigo: string | undefined;
    try {
      await operacion;
    } catch (err) {
      codigo = (err as { code?: string })?.code;
    }
    expect(codigo).toBe('permission-denied');
  }

  /** Cliente de Firestore SIN sesión, como el de un tercero cualquiera. */
  async function dbSinSesion() {
    const { initializeApp, getApps, deleteApp } = await import('firebase/app');
    const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
    const { FIREBASE_CONFIG } = await import('../src/shared/firebase-config');

    const nombre = `anonimo-${randomUUID()}`;
    const previa = getApps().find((a) => a.name === nombre);
    if (previa) await deleteApp(previa);

    const appAnon = initializeApp(FIREBASE_CONFIG, nombre);
    const db = getFirestore(appAnon);
    const [host, puerto] = HOST.split(':');
    connectFirestoreEmulator(db, host || '127.0.0.1', Number(puerto) || 8080);
    return db;
  }

  it.skipIf(!disponible)(
    'una petición SIN sesión no puede leer nada',
    async () => {
      const { doc, getDoc } = await import('firebase/firestore');
      const db = await dbSinSesion();

      await esperarDenegado(getDoc(doc(db, 'productos', '1')));
      await esperarDenegado(getDoc(doc(db, 'clientes', '1')));
      await esperarDenegado(getDoc(doc(db, 'ventas', '1')));
    },
    60000
  );

  it.skipIf(!disponible)(
    'una petición SIN sesión no puede escribir nada',
    async () => {
      const { doc, setDoc } = await import('firebase/firestore');
      const db = await dbSinSesion();

      await esperarDenegado(setDoc(doc(db, 'productos', '999999'), { nombre: 'intruso' }));
      await esperarDenegado(setDoc(doc(db, 'clientes', '999999'), { nombre: 'intruso' }));
    },
    60000
  );

  it.skipIf(!disponible)(
    'una sesión válida pero fuera de la lista blanca tampoco entra',
    async () => {
      const { initializeApp, getApps, deleteApp } = await import('firebase/app');
      const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } =
        await import('firebase/auth');
      const { getFirestore, connectFirestoreEmulator, doc, getDoc } = await import(
        'firebase/firestore'
      );
      const { FIREBASE_CONFIG } = await import('../src/shared/firebase-config');

      const nombre = `intruso-${randomUUID()}`;
      const previa = getApps().find((a) => a.name === nombre);
      if (previa) await deleteApp(previa);

      const appIntruso = initializeApp(FIREBASE_CONFIG, nombre);
      const auth = getAuth(appIntruso);
      connectAuthEmulator(auth, `http://${HOST_AUTH}`, { disableWarnings: true });

      const correo = `intruso-${Date.now()}@ajeno.com`;
      try {
        await createUserWithEmailAndPassword(auth, correo, 'intruso1234');
      } catch {
        await signInWithEmailAndPassword(auth, correo, 'intruso1234');
      }

      const db = getFirestore(appIntruso);
      const [host, puerto] = HOST.split(':');
      connectFirestoreEmulator(db, host || '127.0.0.1', Number(puerto) || 8080);

      // Tiene sesión de Firebase perfectamente válida, pero su UID no está ni
      // en la lista del archivo de reglas ni en `usuarios_autorizados`.
      // Este es el caso que la versión rota de las reglas dejaba pasar.
      await esperarDenegado(getDoc(doc(db, 'clientes', '1')));
      await esperarDenegado(getDoc(doc(db, 'ventas', '1')));
    },
    60000
  );
});
