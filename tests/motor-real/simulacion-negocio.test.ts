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
 * encargo, deshacer lo último. Desde la 2.16.1 también lo que se edita o se
 * elimina: corregir una venta o un abono, abonar a una clienta sin elegir la
 * venta, vender en cuotas, editar o eliminar una clienta, y cada fase de un
 * encargo. Después de CADA una se revisan todas las invariantes de
 * `invariantes.ts`.
 *
 * La semilla es fija a propósito: si un día falla, se vuelve a ver corriendo
 * la misma semilla, y el informe dice exactamente qué operaciones llevaron
 * hasta ahí.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g } from './arnes';
import { revisarInvariantes } from './invariantes';
import { haceDias } from '../../src/core/fechas';

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
  return haceDias(rnd.entre(0, 50));
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
  // ---------------------------------------------------------------------
  // Editar y eliminar (2.16 y 2.16.1): lo que se carga mal se corrige.
  // ---------------------------------------------------------------------
  {
    nombre: 'corregir una venta mal cargada',
    async ejecutar(m, rnd) {
      const { Ventas, Productos } = await repos();
      const vivas = (await Ventas.listar({})).filter((v) => v.tipo === 'INVENTARIO' && v.estado !== 'CANCELADA');
      const elegida = rnd.de(vivas);
      if (!elegida) return null;
      const v = (await Ventas.getById(elegida.id))!;
      const productos = (await Productos.listar()).filter((p) => p.existencias > 0);
      let lineas = v.lineas.map((l) => ({
        producto_id: l.producto_id,
        variante_id: l.variante_id,
        descripcion: l.producto_id ? undefined : l.descripcion,
        cantidad: l.cantidad,
        precio_unitario_usd_cents: l.precio_unitario_usd_cents,
      }));
      const que = rnd.entre(0, 4);
      let dicho = '';
      if (que === 0) {
        // Un producto por otro: el caso de V-0007.
        const otro = rnd.de(productos);
        if (!otro) return null;
        lineas[0] = { producto_id: otro.id, variante_id: undefined, descripcion: undefined, cantidad: 1, precio_unitario_usd_cents: otro.precio_venta_usd_cents };
        dicho = `cambió el producto por '${otro.nombre}'`;
      } else if (que === 1) {
        lineas[0] = { ...lineas[0], cantidad: Math.max(1, lineas[0].cantidad + (rnd.siguiente() > 0.5 ? 1 : -1)) };
        dicho = `dejó ${lineas[0].cantidad} en la primera línea`;
      } else if (que === 2) {
        lineas[0] = { ...lineas[0], precio_unitario_usd_cents: rnd.entre(500, 6000) };
        dicho = 'corrigió un precio';
      } else if (que === 3) {
        const otro = rnd.de(productos);
        if (!otro) return null;
        lineas = [...lineas, { producto_id: otro.id, variante_id: undefined, descripcion: undefined, cantidad: 1, precio_unitario_usd_cents: otro.precio_venta_usd_cents }];
        dicho = `agregó '${otro.nombre}'`;
      } else {
        dicho = 'cambió la clienta';
      }
      const clienta = que === 4 || rnd.siguiente() > 0.8 ? rnd.de(m.clientes) : v.cliente_id ?? undefined;
      const ajustar = rnd.siguiente() > 0.3;
      const grupo = g();
      await Ventas.corregir(
        v.id,
        {
          cliente_id: clienta,
          fecha: v.fecha,
          notas: v.notas,
          descuento_tipo: v.descuento_tipo,
          descuento_valor: v.descuento_valor,
          lineas,
          ajustar_abono: ajustar,
        },
        grupo
      );
      m.ultimoGrupo = grupo;
      return `corrigió ${v.codigo}: ${dicho}${ajustar ? ' (el abono al contado la sigue)' : ''}`;
    },
  },
  {
    nombre: 'corregir un abono mal cargado',
    async ejecutar(m, rnd) {
      const { Pagos, Ventas } = await repos();
      const pagoId = rnd.de(m.pagos);
      if (!pagoId) return null;
      const vivas = await Ventas.listar({});
      let pago: Awaited<ReturnType<typeof Pagos.listarPorVenta>>[number] | undefined;
      for (const v of vivas) {
        pago = (await Pagos.listarPorVenta(v.id)).find((p) => p.id === pagoId);
        if (pago) break;
      }
      if (!pago) return null;
      // A veces el monto, a veces la moneda (el error de Ross: C$ por $).
      const cambiaMoneda = rnd.siguiente() > 0.6;
      const moneda = cambiaMoneda ? (pago.moneda === 'COR' ? 'USD' : 'COR') : pago.moneda;
      const base = pago.moneda === 'COR' ? pago.monto_cor_cents : pago.monto_usd_cents;
      const monto = Math.max(1, Math.round(base * (0.5 + rnd.siguiente())));
      const grupo = g();
      await Pagos.corregir(pagoId, { fecha: pago.fecha, monto_cents: monto, moneda, metodo: pago.metodo }, grupo);
      m.ultimoGrupo = grupo;
      return `corrigió el abono #${pagoId} a ${(monto / 100).toFixed(2)} ${moneda}`;
    },
  },
  {
    nombre: 'abonar a una clienta sin elegir la venta',
    async ejecutar(m, rnd) {
      const { Pagos } = await repos();
      const clienta = rnd.de(m.clientes);
      if (!clienta) return null;
      const grupo = g();
      const r = await Pagos.registrarAbonoCliente(
        { cliente_id: clienta, fecha: fechaCercana(rnd), monto_cents: rnd.entre(500, 8000), moneda: 'USD', metodo: 'EFECTIVO' },
        grupo
      );
      m.pagos.push(r.pago_id);
      m.ultimoGrupo = grupo;
      return `abonó a la clienta #${clienta} (FIFO)`;
    },
  },
  {
    nombre: 'vender en cuotas',
    async ejecutar(m, rnd) {
      const { Ventas, Productos } = await repos();
      const p = rnd.de((await Productos.listar()).filter((x) => x.existencias > 0));
      const clienta = rnd.de(m.clientes);
      if (!p || !clienta) return null;
      const grupo = g();
      const id = await Ventas.crear(
        {
          cliente_id: clienta,
          fecha: fechaCercana(rnd),
          tipo: 'INVENTARIO',
          lineas: [{ producto_id: p.id, cantidad: 1 }],
          plan_cuotas: { cantidad: rnd.entre(2, 4), cada_dias: 15 },
        },
        grupo
      );
      m.ventas.push(id);
      m.ultimoGrupo = grupo;
      return `vendió en cuotas '${p.nombre}' (venta #${id})`;
    },
  },
  {
    nombre: 'editar los datos de una clienta',
    async ejecutar(m, rnd) {
      const { Clientes } = await repos();
      const id = rnd.de(m.clientes);
      if (!id) return null;
      const c = await Clientes.getById(id);
      if (!c) return null;
      const grupo = g();
      await Clientes.guardar({ id, nombre: c.nombre, telefono: `8${rnd.entre(1000000, 9999999)}` }, grupo);
      m.ultimoGrupo = grupo;
      return `editó el teléfono de '${c.nombre}'`;
    },
  },
  {
    nombre: 'eliminar una clienta',
    async ejecutar(m, rnd) {
      const { Clientes } = await repos();
      const id = rnd.de(m.clientes);
      if (!id) return null;
      const grupo = g();
      await Clientes.archivar(id, grupo);
      m.clientes = m.clientes.filter((c) => c !== id);
      m.ultimoGrupo = grupo;
      return `eliminó a la clienta #${id}`;
    },
  },
  {
    nombre: 'anotar un pedido sin precio',
    async ejecutar(m, rnd) {
      const { Ventas } = await repos();
      const clienta = rnd.de(m.clientes);
      if (!clienta) return null;
      const grupo = g();
      const id = await Ventas.crear(
        {
          cliente_id: clienta,
          fecha: fechaCercana(rnd),
          tipo: 'ENCARGO',
          lineas: [
            { descripcion: 'Bolso pedido', cantidad: 1, precio_unitario_usd_cents: 0 },
            { descripcion: 'Perfume pedido', cantidad: 1, precio_unitario_usd_cents: 0 },
          ],
        },
        grupo
      );
      m.ventas.push(id);
      m.ultimoGrupo = grupo;
      return `anotó un pedido sin precio (venta #${id})`;
    },
  },
  {
    nombre: 'cotizar un encargo, a veces sin una pieza',
    async ejecutar(m, rnd) {
      const { Ventas } = await repos();
      const e = rnd.de((await Ventas.listar({})).filter((v) => v.tipo === 'ENCARGO' && v.estado === 'COTIZADA'));
      if (!e) return null;
      const v = (await Ventas.getById(e.id))!;
      const grupo = g();
      await Ventas.cotizar(
        v.id,
        v.lineas.map((l, i) => ({
          id: l.id,
          precio_unitario_usd_cents: rnd.entre(2000, 12000),
          costo_estimado_unitario_usd_cents: rnd.entre(1000, 6000),
          descartada: i > 0 && rnd.siguiente() > 0.7 ? true : undefined,
        })),
        grupo
      );
      m.ultimoGrupo = grupo;
      return `cotizó ${v.codigo}`;
    },
  },
  {
    nombre: 'mandar la cotización',
    async ejecutar(m, rnd) {
      const { Ventas } = await repos();
      const e = rnd.de((await Ventas.listar({})).filter((v) => v.tipo === 'ENCARGO' && v.estado === 'COTIZADA'));
      if (!e) return null;
      const grupo = g();
      await Ventas.marcarEnviada(e.id, grupo);
      m.ultimoGrupo = grupo;
      return `mandó la cotización de ${e.codigo}`;
    },
  },
  {
    nombre: 'la clienta acepta, a veces con un pago',
    async ejecutar(m, rnd) {
      const { Ventas } = await repos();
      const { aceptarEncargo } = await import('../../src/main/firebase/services/encargos.service');
      const e = rnd.de((await Ventas.listar({})).filter((v) => v.tipo === 'ENCARGO' && v.estado === 'COTIZADA'));
      if (!e) return null;
      const grupo = g();
      const conPago = rnd.siguiente() > 0.4 && e.total_usd_cents > 0;
      await aceptarEncargo(
        e.id,
        conPago
          ? { fecha: fechaCercana(rnd), monto_cents: Math.max(100, Math.round(e.total_usd_cents / 2)), moneda: 'USD', metodo: 'EFECTIVO' }
          : undefined,
        grupo
      );
      if (conPago) {
        const { Pagos } = await repos();
        const pagos = await Pagos.listarPorVenta(e.id);
        m.pagos.push(...pagos.map((p) => p.id).filter((id) => !m.pagos.includes(id)));
      }
      m.ultimoGrupo = grupo;
      return `${e.codigo}: aceptó${conPago ? ' con un pago' : ''}`;
    },
  },
  {
    nombre: 'marcar comprada una pieza',
    async ejecutar(m, rnd) {
      const { Ventas } = await repos();
      const e = rnd.de((await Ventas.listar({})).filter((v) => v.tipo === 'ENCARGO' && v.estado === 'PENDIENTE'));
      if (!e) return null;
      const v = (await Ventas.getById(e.id))!;
      const pieza = rnd.de(v.lineas.filter((l) => !l.descartada_el));
      if (!pieza) return null;
      const grupo = g();
      await Ventas.marcarCompradas(v.id, [pieza.id], true, grupo);
      m.ultimoGrupo = grupo;
      return `marcó comprada '${pieza.descripcion}' de ${v.codigo}`;
    },
  },
  {
    nombre: 'anular un encargo, a veces quedándose el anticipo',
    async ejecutar(m, rnd) {
      const { Ventas } = await repos();
      const e = rnd.de(
        (await Ventas.listar({})).filter((v) => v.tipo === 'ENCARGO' && (v.estado === 'COTIZADA' || v.estado === 'PENDIENTE'))
      );
      if (!e) return null;
      const retener = rnd.siguiente() > 0.5;
      const grupo = g();
      await Ventas.cambiarEstado(e.id, 'CANCELADA', grupo, {
        anticipo: retener ? 'RETENER' : 'DEVOLVER',
        motivo: rnd.siguiente() > 0.5 ? 'NO_ACEPTO' : 'NO_SE_CONSIGUIO',
      });
      m.ultimoGrupo = grupo;
      return `anuló el encargo ${e.codigo}${retener ? ', quedándose el anticipo' : ''}`;
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
  // Como en la app: todo lo que se registra queda a nombre de una cuenta, y
  // las invariantes exigen que lo diga.
  const { registrarAutor } = await import('../../src/main/firebase/client');
  registrarAutor(() => ({ uid: 'simulacion', nombre: 'Ross Simulación' }));
  const mundo = await montarNegocio();
  const rnd = aleatorio(semilla);
  const historia: string[] = [];
  /**
   * Lo que la app se negó a hacer, con su motivo. No es un error, pero hay
   * que poder leerlo: una negativa sin motivo razonable también lo es.
   */
  const rechazos = new Map<string, number>();

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
    if (hecho.startsWith('[rechazada]')) rechazos.set(hecho, (rechazos.get(hecho) ?? 0) + 1);

    const fallas = await revisarInvariantes({ exigirAutor: true });
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

  if (process.env.SIMULACION_RECHAZOS) {
    const lineas = [...rechazos.entries()].map(([r, n]) => `    ${n}× ${r.replace(/#\d+|[EV]-\d{4}/g, '…')}`);
    // eslint-disable-next-line no-console
    console.log(`  semilla ${semilla}: ${historia.length} operaciones, ${lineas.length} rechazos distintos\n${lineas.join('\n')}`);
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
