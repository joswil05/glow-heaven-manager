/**
 * Las verdades que tienen que cumplirse SIEMPRE, pase lo que pase.
 *
 * Una prueba normal comprueba que una operación hace lo suyo. Estas comprueban
 * otra cosa: que después de cualquier secuencia de operaciones, por rara que
 * sea, el negocio siga cuadrando consigo mismo.
 *
 * Es donde aparecen los errores que no se ven de a uno. Registrar un abono
 * funciona; anular una venta funciona; recibir un paquete funciona. Lo que
 * falla es la número catorce después de las otras trece, cuando un número
 * derivado se separó en silencio de los datos que dice resumir.
 *
 * Cada invariante está escrita como una pregunta que alguien haría mirando la
 * pantalla: "¿el saldo de esta venta coincide con los abonos que tiene?",
 * "¿la deuda de esta clienta es la suma de lo que debe?". Si una falla, el
 * mensaje dice el número que se vio y el que tenía que salir.
 */
import { repos } from './arnes';
import type { Venta, Pago } from '../../src/shared/types';

export interface Falla {
  invariante: string;
  detalle: string;
}

/** Todo lo que hay en la base, leído de una vez para no releer por invariante. */
interface Foto {
  ventas: (Venta & { lineas?: unknown[] })[];
  pagos: Pago[];
  productos: Awaited<ReturnType<Awaited<ReturnType<typeof repos>>['Productos']['listar']>>;
  clientes: Awaited<ReturnType<Awaited<ReturnType<typeof repos>>['Clientes']['listar']>>;
}

async function tomarFoto(): Promise<Foto> {
  const { Ventas, Pagos, Productos, Clientes } = await repos();
  const [ventas, productos, clientes] = await Promise.all([
    Ventas.listar({}),
    Productos.listar({ incluirInactivos: true }),
    Clientes.listar(),
  ]);

  // Los pagos se leen por venta: es la única forma de tenerlos todos sin
  // depender de un índice que quizá no exista para esta consulta.
  const pagos: Pago[] = [];
  for (const v of ventas) {
    pagos.push(...(await Pagos.listarPorVenta(v.id)));
  }

  return { ventas, pagos, productos, clientes };
}

const dinero = (c: number) => `$${(c / 100).toFixed(2)}`;

/**
 * Comprueba todas las invariantes y devuelve las que fallaron.
 * Lista vacía = el negocio cuadra consigo mismo.
 */
export async function revisarInvariantes(): Promise<Falla[]> {
  const foto = await tomarFoto();
  const fallas: Falla[] = [];
  const agregar = (invariante: string, detalle: string) => fallas.push({ invariante, detalle });

  // -------------------------------------------------------------------------
  // Inventario
  // -------------------------------------------------------------------------

  for (const p of foto.productos) {
    if (p.existencias < 0) {
      agregar(
        'el stock nunca es negativo',
        `'${p.nombre}' quedó con ${p.existencias} unidades`
      );
    }

    if (!Number.isFinite(p.costo_unitario_usd_cents)) {
      agregar(
        'el costo unitario es un número',
        `'${p.nombre}' tiene costo ${p.costo_unitario_usd_cents}`
      );
    }

    // El valor de bodega es existencias por costo, con el redondeo del
    // promedio ponderado como única tolerancia.
    const esperado = p.existencias * p.costo_unitario_usd_cents;
    const real = p.valor_inventario_usd_cents ?? 0;
    if (Math.abs(real - esperado) > p.existencias + 1) {
      agregar(
        'el valor de bodega es existencias por costo unitario',
        `'${p.nombre}': ${dinero(real)} guardado contra ${p.existencias} x ` +
          `${dinero(p.costo_unitario_usd_cents)} = ${dinero(esperado)}`
      );
    }

    if ((p.valor_inventario_usd_cents ?? 0) < 0) {
      agregar('el valor de bodega nunca es negativo', `'${p.nombre}': ${dinero(real)}`);
    }
  }

  // -------------------------------------------------------------------------
  // Ventas y abonos
  // -------------------------------------------------------------------------

  for (const v of foto.ventas) {
    const suyos = foto.pagos.filter((p) => p.venta_id === v.id);
    const cobrado = suyos.reduce((s, p) => s + (p.monto_usd_cents || 0), 0);

    // El saldo es lo que falta cobrar. Si no coincide con los abonos que la
    // venta tiene, uno de los dos miente y no hay forma de saber cuál.
    const saldoEsperado = (v.total_usd_cents || 0) - cobrado;
    if ((v.saldo_usd_cents || 0) !== saldoEsperado) {
      agregar(
        'el saldo de una venta es su total menos sus abonos',
        `${v.codigo}: dice deber ${dinero(v.saldo_usd_cents || 0)} pero es ` +
          `${dinero(v.total_usd_cents || 0)} - ${dinero(cobrado)} = ${dinero(saldoEsperado)}`
      );
    }

    if ((v.pagado_usd_cents || 0) !== cobrado) {
      agregar(
        'lo pagado de una venta es la suma de sus abonos',
        `${v.codigo}: dice ${dinero(v.pagado_usd_cents || 0)} y sus abonos suman ${dinero(cobrado)}`
      );
    }

    if ((v.total_usd_cents || 0) < 0) {
      agregar('una venta nunca tiene total negativo', `${v.codigo}: ${dinero(v.total_usd_cents)}`);
    }

    // Una venta cancelada no puede seguir teniendo plata cobrada encima: esa
    // plata se le devolvió a la clienta o nunca existió.
    if (v.estado === 'CANCELADA' && suyos.length > 0) {
      agregar(
        'una venta cancelada no conserva abonos activos',
        `${v.codigo} está cancelada y tiene ${suyos.length} abono(s) vivos`
      );
    }

    // Las cuotas reparten el total, no otra cosa.
    const cuotas = (v as { cuotas?: { monto_usd_cents: number }[] }).cuotas;
    if (cuotas && cuotas.length > 0) {
      const suma = cuotas.reduce((s, c) => s + (c.monto_usd_cents || 0), 0);
      if (suma !== (v.total_usd_cents || 0)) {
        agregar(
          'las cuotas suman el total de la venta',
          `${v.codigo}: ${cuotas.length} cuotas suman ${dinero(suma)} y el total es ` +
            `${dinero(v.total_usd_cents || 0)}`
        );
      }
    }

    // Una venta no puede apuntar a una clienta que ya no existe.
    if (v.cliente_id && !foto.clientes.some((c) => c.id === v.cliente_id)) {
      agregar(
        'una venta no apunta a una clienta inexistente',
        `${v.codigo} referencia al cliente #${v.cliente_id}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Clientas
  // -------------------------------------------------------------------------

  for (const c of foto.clientes) {
    const suyas = foto.ventas.filter((v) => v.cliente_id === c.id && v.estado !== 'CANCELADA');
    const debe = suyas.reduce((s, v) => s + Math.max(0, v.saldo_usd_cents || 0), 0);

    // Lo que dice la ficha de la clienta tiene que ser lo que suman sus
    // ventas. Es el número que se mira para ir a cobrar.
    if ((c.saldo_pendiente_usd_cents ?? 0) !== debe) {
      agregar(
        'la deuda de una clienta es la suma de sus ventas impagas',
        `'${c.nombre}': su ficha dice ${dinero(c.saldo_pendiente_usd_cents ?? 0)} y sus ` +
          `ventas suman ${dinero(debe)}`
      );
    }

    if ((c.saldo_pendiente_usd_cents ?? 0) < 0) {
      agregar(
        'la deuda de una clienta nunca es negativa',
        `'${c.nombre}': ${dinero(c.saldo_pendiente_usd_cents ?? 0)}`
      );
    }

    const comprado = suyas.reduce((s, v) => s + (v.total_usd_cents || 0), 0);
    if ((c.total_comprado_usd_cents ?? 0) !== comprado) {
      agregar(
        'lo comprado por una clienta es la suma de sus ventas vivas',
        `'${c.nombre}': ficha ${dinero(c.total_comprado_usd_cents ?? 0)} contra ${dinero(comprado)}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Abonos
  // -------------------------------------------------------------------------

  for (const p of foto.pagos) {
    if ((p.monto_usd_cents || 0) <= 0) {
      agregar('un abono siempre es mayor que cero', `abono #${p.id}: ${dinero(p.monto_usd_cents)}`);
    }
    if (!foto.ventas.some((v) => v.id === p.venta_id)) {
      agregar(
        'un abono no queda huérfano de su venta',
        `abono #${p.id} apunta a la venta #${p.venta_id}, que no existe`
      );
    }
  }

  // -------------------------------------------------------------------------
  // El panel dice lo mismo que los datos
  // -------------------------------------------------------------------------

  const { Panel } = await repos();
  const panel = await Panel.cargar(true);

  const porCobrarReal = foto.ventas
    .filter((v) => v.estado !== 'CANCELADA')
    .reduce((s, v) => s + Math.max(0, v.saldo_usd_cents || 0), 0);

  if (panel.resumen.por_cobrar_usd_cents !== porCobrarReal) {
    agregar(
      'el panel muestra lo que de verdad se debe',
      `el panel dice ${dinero(panel.resumen.por_cobrar_usd_cents)} y las ventas suman ` +
        `${dinero(porCobrarReal)}`
    );
  }

  const unidadesReales = foto.productos
    .filter((p) => p.activo !== false)
    .reduce((s, p) => s + p.existencias, 0);
  if (panel.resumen.unidades_en_inventario !== unidadesReales) {
    agregar(
      'el panel muestra las unidades que hay en bodega',
      `el panel dice ${panel.resumen.unidades_en_inventario} y el inventario tiene ${unidadesReales}`
    );
  }

  // La ganancia del mes del panel sale del resumen mensual; tiene que
  // coincidir con recontar las ventas entregadas de ese mes a mano.
  const mesActual = panel.ganancia_mes_actual?.mes;
  if (mesActual) {
    const aMano = foto.ventas.filter(
      (v) => v.estado === 'ENTREGADA' && (v.fecha || '').startsWith(mesActual)
    );
    const ingresos = aMano.reduce((s, v) => s + (v.total_usd_cents || 0), 0);
    if (panel.ganancia_mes_actual!.ingresos_usd_cents !== ingresos) {
      agregar(
        'el resumen del mes coincide con recontar sus ventas',
        `el resumen dice ${dinero(panel.ganancia_mes_actual!.ingresos_usd_cents)} y ` +
          `recontar da ${dinero(ingresos)}`
      );
    }
    if (panel.ganancia_mes_actual!.ventas_count !== aMano.length) {
      agregar(
        'el resumen del mes cuenta las ventas que hay',
        `el resumen dice ${panel.ganancia_mes_actual!.ventas_count} y hay ${aMano.length}`
      );
    }
  }

  return fallas;
}
