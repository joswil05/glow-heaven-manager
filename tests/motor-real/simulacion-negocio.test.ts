/**
 * Un negocio funcionando, con todo lo que pasa de verdad.
 *
 * Las otras pruebas comprueban que cada operación hace lo suyo. Esta comprueba
 * algo distinto: que después de una secuencia larga de operaciones —las
 * normales y las raras, en el orden en que salgan— el negocio siga cuadrando
 * consigo mismo.
 *
 * Es donde aparecen los errores que no se ven de a uno. Registrar un abono
 * funciona. Anular una venta funciona. Lo que falla es la operación número
 * catorce después de las otras trece, cuando un número derivado se separó en
 * silencio de los datos que dice resumir, y nadie lo nota porque ningún error
 * salta: simplemente la pantalla muestra una cifra que ya no es cierta.
 *
 * Cómo funciona
 * -------------
 * Un generador con semilla elige la próxima operación entre las que una
 * persona podría hacer: vender, cobrar, cobrar de más, anular un abono,
 * anular una venta, recibir un paquete, corregir un conteo, entregar un
 * encargo, deshacer lo último. Después de CADA una se revisan todas las
 * invariantes de `invariantes.ts`.
 *
 * La semilla es fija a propósito: si un día falla, se vuelve a ver corriendo
 * la misma semilla, y el informe dice exactamente qué operaciones llevaron
 * hasta ahí.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOY } from './arnes';
import { revisarInvariantes } from './invariantes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

/** Generador reproducible: la misma semilla da la misma historia. */
function aleatorio(semilla: number) {
  let estado = semilla >>> 0;
  return {
    siguiente(): number {
      estado = (estado * 1664525 + 1013904223) >>> 0;
      return estado / 4294967296;
    },
    entre(min: number, max: number): number {
      return min + Math.floor(this.siguiente() * (max - min + 1));
    },
    de<T>(lista: T[]): T | undefined {
      if (lista.length === 0) return undefined;
      return lista[Math.floor(this.siguiente() * lista.length)];
    },
  };
}

/** Un día cualquiera de los últimos dos meses. */
function fechaCercana(rnd: ReturnType<typeof aleatorio>): string {
  const dias = rnd.entre(0, 50);
  const base = new Date(`${HOY}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() - dias);
  return base.toISOString().slice(0, 10);
}

interface Mundo {
  productos: number[];
  clientes: number[];
  ventas: number[];
  pagos: number[];
  compras: number[];
  ultimoGrupo: string | null;
}

/**
 * Las operaciones que puede hacer una persona con la app abierta.
 * Cada una devuelve una línea para el informe, o null si no se pudo hacer
 * (no había qué vender, no había a quién cobrar) — eso no es un error.
 */
type Operacion = {
  nombre: string;
  ejecutar: (m: Mundo, rnd: ReturnType<typeof aleatorio>) => Promise<string | null>;
};

const OPERACIONES: Operacion[] = [
  {
    nombre: 'vender del inventario',
    async ejecutar(m, rnd) {
      const { Ventas, Productos } = await repos();
      const productoId = rnd.de(m.productos);
      if (!productoId) return null;

      const p = (await Productos.listar()).find((x) => x.id === productoId);
      if (!p || p.existencias < 1) return null;

      const cantidad = rnd.entre(1, Math.min(3, p.existencias));
      const grupo = g();
      const id = await Ventas.crear(
        {
          cliente_id: rnd.de(m.clientes),
          fecha: fechaCercana(rnd),
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: productoId, cantidad }],
          entregar_ahora: rnd.siguiente() > 0.3,
        },
        grupo
      );
      m.ventas.push(id);
      m.ultimoGrupo = grupo;
      return `vendió ${cantidad} de '${p.nombre}' (venta #${id})`;
    },
  },
  {
    nombre: 'vender algo suelto, sin producto del catálogo',
    async ejecutar(m, rnd) {
      const { Ventas } = await repos();
      const grupo = g();
      const id = await Ventas.crear(
        {
          cliente_id: rnd.de(m.clientes),
          fecha: fechaCercana(rnd),
          tipo: 'INVENTARIO',
          entregar_ahora: false,
          lineas: [
            {
              descripcion: 'Artículo suelto',
              cantidad: rnd.entre(1, 2),
              precio_unitario_usd_cents: rnd.entre(500, 9000),
            },
          ],
        },
        grupo
      );
      m.ventas.push(id);
      m.ultimoGrupo = grupo;
      return `vendió algo suelto (venta #${id})`;
    },
  },
  {
    nombre: 'tomar un encargo con anticipo',
    async ejecutar(m, rnd) {
      const { Ventas } = await repos();
      const grupo = g();
      const id = await Ventas.crear(
        {
          cliente_id: rnd.de(m.clientes),
          fecha: fechaCercana(rnd),
          tipo: 'ENCARGO',
          anticipo_bp: 5000,
          lineas: [
            {
              descripcion: 'Encargo de importación',
              cantidad: 1,
              precio_unitario_usd_cents: rnd.entre(3000, 20000),
            },
          ],
        },
        grupo
      );
      m.ventas.push(id);
      m.ultimoGrupo = grupo;
      return `tomó un encargo (venta #${id})`;
    },
  },
  {
    nombre: 'cobrar un abono',
    async ejecutar(m, rnd) {
      const { Ventas, Pagos } = await repos();
      const conSaldo = (await Ventas.listar({})).filter(
        (v) => v.estado !== 'CANCELADA' && (v.saldo_usd_cents || 0) > 0
      );
      const venta = rnd.de(conSaldo);
      if (!venta) return null;

      // A veces cobra parcial, a veces todo, y de vez en cuando de más.
      const dado = rnd.siguiente();
      const monto =
        dado < 0.5
          ? Math.max(1, Math.floor(venta.saldo_usd_cents / 2))
          : dado < 0.9
            ? venta.saldo_usd_cents
            : venta.saldo_usd_cents + rnd.entre(100, 2000);

      const grupo = g();
      const r = await Pagos.registrar(
        {
          venta_id: venta.id,
          fecha: fechaCercana(rnd),
          monto_cents: monto,
          moneda: rnd.siguiente() > 0.5 ? 'USD' : 'COR',
          metodo: 'EFECTIVO',
        },
        grupo
      );
      m.pagos.push(r.pago_id);
      m.ultimoGrupo = grupo;
      return `cobró ${(monto / 100).toFixed(2)} de ${venta.codigo} (abono #${r.pago_id})`;
    },
  },
  {
    nombre: 'anular un abono mal registrado',
    async ejecutar(m, rnd) {
      const { Pagos } = await repos();
      const pagoId = rnd.de(m.pagos);
      if (!pagoId) return null;

      const grupo = g();
      try {
        await Pagos.anular(pagoId, grupo);
      } catch {
        return null; // ya estaba anulado
      }
      m.pagos = m.pagos.filter((p) => p !== pagoId);
      m.ultimoGrupo = grupo;
      return `anuló el abono #${pagoId}`;
    },
  },
  {
    nombre: 'anular una venta',
    async ejecutar(m, rnd) {
      const { Ventas } = await repos();
      const vivas = (await Ventas.listar({})).filter((v) => v.estado !== 'CANCELADA');
      const venta = rnd.de(vivas);
      if (!venta) return null;

      const grupo = g();
      await Ventas.cambiarEstado(venta.id, 'CANCELADA', grupo);
      m.ultimoGrupo = grupo;
      return `anuló ${venta.codigo} (estaba ${venta.estado})`;
    },
  },
  {
    nombre: 'entregar un encargo',
    async ejecutar(m, rnd) {
      const { Ventas } = await repos();
      const pendientes = (await Ventas.listar({})).filter(
        (v) => v.tipo === 'ENCARGO' && v.estado === 'PENDIENTE'
      );
      const venta = rnd.de(pendientes);
      if (!venta) return null;

      const grupo = g();
      await Ventas.cambiarEstado(venta.id, 'ENTREGADA', grupo);
      m.ultimoGrupo = grupo;
      return `entregó el encargo ${venta.codigo}`;
    },
  },
  {
    nombre: 'entregar una venta pendiente',
    async ejecutar(m, rnd) {
      const { Ventas } = await repos();
      const pendientes = (await Ventas.listar({})).filter(
        (v) => v.tipo === 'INVENTARIO' && v.estado === 'PENDIENTE'
      );
      const venta = rnd.de(pendientes);
      if (!venta) return null;

      const grupo = g();
      await Ventas.cambiarEstado(venta.id, 'ENTREGADA', grupo);
      m.ultimoGrupo = grupo;
      return `entregó ${venta.codigo}`;
    },
  },
  {
    nombre: 'recibir un paquete del courier',
    async ejecutar(m, rnd) {
      const { Compras } = await repos();
      const grupo = g();
      const compraId = await Compras.guardar(
        {
          fecha: fechaCercana(rnd),
          envio_total_usd_cents: rnd.entre(1000, 9000),
          lineas: [
            {
              descripcion: `Lote ${rnd.entre(1, 4)}`,
              cantidad: rnd.entre(2, 8),
              precio_linea_usd_cents: rnd.entre(2000, 15000),
              peso_linea_mlb: rnd.entre(500, 4000),
              destino: 'INVENTARIO',
            },
          ],
        },
        grupo
      );
      await Compras.recibir(compraId, g());
      m.compras.push(compraId);

      const { Productos } = await repos();
      m.productos = (await Productos.listar()).map((p) => p.id);
      return `recibió el paquete #${compraId}`;
    },
  },
  {
    nombre: 'corregir un conteo físico',
    async ejecutar(m, rnd) {
      const { Productos } = await repos();
      const productoId = rnd.de(m.productos);
      if (!productoId) return null;

      const variante = await Productos.varianteUnica(productoId);
      if (!variante) return null;

      const nuevas = rnd.entre(0, 15);
      await Productos.ajustar(variante, nuevas, g(), 'Conteo físico', productoId);
      return `ajustó el producto #${productoId} a ${nuevas} unidades`;
    },
  },
  {
    nombre: 'deshacer lo último',
    async ejecutar(m) {
      const { Eventos } = await repos();
      if (!m.ultimoGrupo) return null;

      const r = await Eventos.deshacerGrupo(m.ultimoGrupo);
      const grupo = m.ultimoGrupo;
      m.ultimoGrupo = null;
      return r.revertido ? `deshizo ${grupo.slice(0, 8)}` : `intentó deshacer y se rechazó`;
    },
  },
];

async function montarNegocio(): Promise<Mundo> {
  const { Productos, Clientes } = await repos();

  const productos: number[] = [];
  for (const nombre of ['Labial', 'Perfume', 'Bolso', 'Crema']) {
    productos.push(
      await Productos.crear(
        {
          nombre,
          modo_precio: 'MANUAL',
          precio_manual_usd_cents: 2500,
          stock_inicial: { cantidad: 10, costo_unitario_usd_cents: 900 },
        },
        g()
      )
    );
  }

  const clientes: number[] = [];
  for (const nombre of ['Ana', 'Beatriz', 'Carmen']) {
    clientes.push(await Clientes.guardar({ nombre, telefono: '88887777' }, g()));
  }

  return { productos, clientes, ventas: [], pagos: [], compras: [], ultimoGrupo: null };
}

/** Corre una historia completa y devuelve el informe de lo que falló. */
async function simular(semilla: number, pasos: number): Promise<string[]> {
  await baseLimpia();
  const mundo = await montarNegocio();
  const rnd = aleatorio(semilla);
  const historia: string[] = [];

  for (let paso = 1; paso <= pasos; paso++) {
    const op = OPERACIONES[Math.floor(rnd.siguiente() * OPERACIONES.length)];

    let hecho: string | null;
    try {
      hecho = await op.ejecutar(mundo, rnd);
    } catch (err) {
      // Una operación puede negarse con motivo (no hay stock, venta
      // cancelada): eso es la app defendiéndose y está bien. Lo que no puede
      // es dejar el negocio descuadrado, y eso se revisa igual abajo.
      hecho = `[rechazada] ${op.nombre}: ${String((err as Error).message).slice(0, 70)}`;
    }

    if (hecho === null) continue;
    historia.push(`${String(paso).padStart(3)}. ${hecho}`);

    const fallas = await revisarInvariantes();
    if (fallas.length > 0) {
      return [
        `La simulación (semilla ${semilla}) rompió el negocio en el paso ${paso}.`,
        '',
        'Lo que se hizo hasta acá:',
        ...historia.slice(-12),
        '',
        'Lo que dejó de cuadrar:',
        ...fallas.map((f) => `  · ${f.invariante}\n      ${f.detalle}`),
      ];
    }
  }

  return [];
}

/**
 * Por defecto corre tres historias cortas, que es lo que conviene dejar en
 * cada compilación. Para una cacería larga:
 *
 *   SIMULACION_SEMILLAS=20 SIMULACION_PASOS=80 npm run test:emulador
 *
 * Más semillas son más historias distintas; más pasos son historias más
 * largas. Los errores de deriva aparecen con la longitud, no con la cantidad.
 */
const SEMILLAS = Number(process.env.SIMULACION_SEMILLAS ?? 3);
const PASOS = Number(process.env.SIMULACION_PASOS ?? 40);

describe('un negocio funcionando, paso a paso', () => {
  beforeEach(async () => {
    if (!disponible) return;
  });

  // Cada semilla es una historia distinta del mismo negocio.
  for (let i = 0; i < SEMILLAS; i++) {
    const semilla = [1, 7, 42][i] ?? 1000 + i * 37;
    it.skipIf(!disponible)(
      `aguanta ${PASOS} operaciones seguidas sin descuadrarse (semilla ${semilla})`,
      async () => {
        const informe = await simular(semilla, PASOS);
        const texto = informe.join(String.fromCharCode(10));
        expect(texto, texto).toBe('');
      },
      900_000
    );
  }
});
