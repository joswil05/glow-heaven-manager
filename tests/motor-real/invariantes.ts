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
import { normalizarLotes, costoBase, type ProductoParaLotes } from '../../src/core/lotes';

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
  /** Los documentos de productos tal como están guardados. */
  guardados: (ProductoParaLotes & { nombre: string })[];
  /** Las ventas tal como están guardadas: con sus líneas y sus cuotas. */
  ventasCrudas: VentaCruda[];
  /** Todas las clientas, también las eliminadas (archivadas). */
  todasLasClientas: { id: number; nombre: string; activo: boolean }[];
}

interface VentaCruda {
  id: number;
  codigo: string;
  tipo: string;
  estado: string;
  cliente_id?: number;
  subtotal_usd_cents?: number;
  descuento_usd_cents?: number;
  total_usd_cents: number;
  costo_total_usd_cents: number;
  ganancia_usd_cents: number;
  pagado_usd_cents: number;
  registrado_por?: { uid: string; nombre: string };
  lineas?: {
    producto_id?: number;
    subtotal_usd_cents: number;
    costo_total_usd_cents: number;
    descartada_el?: string;
    lotes_consumidos?: { lote_id: string; cantidad: number; costo_usd_cents: number; ingreso_usd_cents?: number }[];
  }[];
  cuotas?: { monto_usd_cents: number; pagado_usd_cents: number }[];
}

async function tomarFoto(): Promise<Foto> {
  const { Ventas, Pagos, Productos, Clientes } = await repos();
  const { getFirestoreDb } = await import('../../src/main/firebase/client');
  const { collection, getDocs } = await import('firebase/firestore');
  const db = getFirestoreDb();
  const [ventas, productos, clientes, crudos, ventasCrudas, clientasCrudas] = await Promise.all([
    Ventas.listar({}),
    Productos.listar({ incluirInactivos: true }),
    Clientes.listar(),
    getDocs(collection(db, 'productos')),
    getDocs(collection(db, 'ventas')),
    getDocs(collection(db, 'clientes')),
  ]);
  const guardados = crudos.docs.map((d) => d.data() as ProductoParaLotes & { nombre: string });

  // Los pagos se leen por venta: es la única forma de tenerlos todos sin
  // depender de un índice que quizá no exista para esta consulta.
  const pagos: Pago[] = [];
  for (const v of ventas) {
    pagos.push(...(await Pagos.listarPorVenta(v.id)));
  }

  return {
    ventas,
    pagos,
    productos,
    clientes,
    guardados,
    ventasCrudas: ventasCrudas.docs.map((d) => d.data() as VentaCruda).filter((v) => (v as { activo?: boolean }).activo !== false),
    todasLasClientas: clientasCrudas.docs.map((d) => d.data() as { id: number; nombre: string; activo: boolean }),
  };
}

const dinero = (c: number) => `$${(c / 100).toFixed(2)}`;

/**
 * Comprueba todas las invariantes y devuelve las que fallaron.
 * Lista vacía = el negocio cuadra consigo mismo.
 */
export async function revisarInvariantes(opciones: { exigirAutor?: boolean } = {}): Promise<Falla[]> {
  const foto = await tomarFoto();
  const fallas: Falla[] = [];
  const agregar = (invariante: string, detalle: string) => fallas.push({ invariante, detalle });
  /** Con una cuenta registrada (2.16.1), todo lo que se carga dice quién. */
  const exigirAutor = opciones.exigirAutor ?? false;

  // Qué es deuda, escrito acá a propósito y no importado del código: si la
  // regla del código se torciera, la invariante tiene que notarlo. Un encargo
  // cotizado no es deuda hasta que la clienta confirma cubriendo el anticipo.
  const esDeuda = (v: Venta) =>
    v.estado !== 'CANCELADA' && !(v.tipo === 'ENCARGO' && v.estado === 'COTIZADA');

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

    // Con lotes (2.14), el valor de bodega es la suma exacta de sus lotes y
    // cada talla tiene las unidades de los suyos. Hasta la 2.13 esto era
    // "existencias por costo promedio", con un centavo de tolerancia.
    const lotes = p.lotes ?? [];
    const real = p.valor_inventario_usd_cents ?? 0;
    const sumaLotes = lotes.reduce((s, l) => s + l.valor_usd_cents, 0);
    if (real !== sumaLotes) {
      agregar(
        'el valor de bodega es la suma de sus lotes',
        `'${p.nombre}': ${dinero(real)} contra ${dinero(sumaLotes)} en lotes`
      );
    }
    for (const v of p.variantes) {
      const enLotes = lotes.filter((l) => l.variante_id === v.id).reduce((s, l) => s + l.cantidad, 0);
      if (enLotes !== v.existencias) {
        agregar(
          'el stock de cada talla es la suma de sus lotes',
          `'${p.nombre}' talla ${v.id}: ${v.existencias} contra ${enLotes} en lotes`
        );
      }
    }
    // El costo que manda el precio es el del lote más caro que queda.
    if (p.existencias > 0 && p.costo_unitario_usd_cents !== costoBase(lotes)) {
      agregar(
        'el costo es el del lote más caro que queda',
        `'${p.nombre}': ${dinero(p.costo_unitario_usd_cents)} contra ${dinero(costoBase(lotes))}`
      );
    }

    if ((p.valor_inventario_usd_cents ?? 0) < 0) {
      agregar('el valor de bodega nunca es negativo', `'${p.nombre}': ${dinero(real)}`);
    }
  }

  // Lo GUARDADO, no lo que se muestra: la lista cuadra los lotes al leer, y
  // eso taparía un repositorio que escribe lotes descuadrados. Un documento
  // que ya tiene lotes tiene que quedar igual al volver a cuadrarlo.
  for (const d of foto.guardados) {
    if (!d.lotes) continue;
    if (normalizarLotes(d).cambiado) {
      agregar(
        'los lotes guardados ya cuadran con las existencias y el valor',
        `'${d.nombre}': el documento quedó descuadrado`
      );
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
    // plata se le devolvió a la clienta o nunca existió. Un encargo anulado
    // sí puede: Ross puede quedarse con el anticipo (`anticipo: 'RETENER'`).
    if (v.estado === 'CANCELADA' && v.tipo !== 'ENCARGO' && suyos.length > 0) {
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

    // Una venta no puede apuntar a una clienta que no existe. Eliminada
    // (archivada) sí: sus ventas viejas siguen siendo suyas.
    if (v.cliente_id && !foto.todasLasClientas.some((c) => c.id === v.cliente_id)) {
      agregar(
        'una venta no apunta a una clienta inexistente',
        `${v.codigo} referencia al cliente #${v.cliente_id}`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Lo que se corrige, se edita o se elimina (2.16 y 2.16.1)
  // -------------------------------------------------------------------------

  for (const v of foto.ventasCrudas) {
    const lineas = v.lineas ?? [];

    // Una venta corregida cuadra con sus líneas: lo que se ve en la factura es
    // lo que suma la venta, y la ganancia sale de ahí.
    const subtotal = lineas.reduce((s, l) => s + (l.subtotal_usd_cents || 0), 0);
    const total = subtotal - (v.descuento_usd_cents || 0);
    if (v.total_usd_cents !== total) {
      agregar(
        'el total de una venta es la suma de sus líneas menos el descuento',
        `${v.codigo}: dice ${dinero(v.total_usd_cents)} y sus líneas dan ${dinero(total)}`
      );
    }
    const costo = lineas.reduce((s, l) => s + (l.costo_total_usd_cents || 0), 0);
    if (v.costo_total_usd_cents !== costo) {
      agregar(
        'el costo de una venta es la suma del de sus líneas',
        `${v.codigo}: dice ${dinero(v.costo_total_usd_cents)} y sus líneas dan ${dinero(costo)}`
      );
    }
    if (v.ganancia_usd_cents !== v.total_usd_cents - v.costo_total_usd_cents) {
      agregar(
        'la ganancia de una venta es su total menos su costo',
        `${v.codigo}: ${dinero(v.ganancia_usd_cents)} contra ${dinero(v.total_usd_cents - v.costo_total_usd_cents)}`
      );
    }

    // Lo pagado se reparte en las cuotas, en orden, sin pasarse de ninguna.
    const cuotas = v.cuotas ?? [];
    if (cuotas.length > 0) {
      const aplicado = cuotas.reduce((s, c) => s + (c.pagado_usd_cents || 0), 0);
      const debeAplicarse = Math.min(v.pagado_usd_cents || 0, v.total_usd_cents || 0);
      if (aplicado !== debeAplicarse || cuotas.some((c) => (c.pagado_usd_cents || 0) > c.monto_usd_cents)) {
        agregar(
          'lo pagado se reparte en las cuotas, sin pasarse de ninguna',
          `${v.codigo}: las cuotas tienen ${dinero(aplicado)} aplicados y lo pagado es ${dinero(debeAplicarse)}`
        );
      }
    }

    // Lo que se registró desde la 2.16.1 dice quién.
    if (exigirAutor && !v.registrado_por) {
      agregar('una venta dice quién la registró', `${v.codigo} no tiene registrado_por`);
    }
  }

  // Cada unidad vendida de un lote la explica una venta viva. Es lo que se
  // rompió con V-0007: borrada la venta, sus unidades seguían "vendidas" y el
  // producto quedaba agotado sin que nada lo explicara. Anular, corregir y
  // deshacer tienen que devolver exactamente lo que sacaron.
  const porLote = new Map<string, { cantidad: number; costo: number; ingreso: number }>();
  for (const v of foto.ventasCrudas) {
    if (v.estado === 'CANCELADA') continue;
    for (const l of v.lineas ?? []) {
      if (!l.producto_id) continue;
      for (const c of l.lotes_consumidos ?? []) {
        const clave = `${l.producto_id}:${c.lote_id}`;
        const a = porLote.get(clave) ?? { cantidad: 0, costo: 0, ingreso: 0 };
        a.cantidad += c.cantidad;
        a.costo += c.costo_usd_cents;
        a.ingreso += c.ingreso_usd_cents ?? 0;
        porLote.set(clave, a);
      }
    }
  }
  for (const p of foto.guardados as (ProductoParaLotes & { nombre: string; id: number })[]) {
    for (const l of p.lotes ?? []) {
      const esperado = porLote.get(`${p.id}:${l.id}`) ?? { cantidad: 0, costo: 0, ingreso: 0 };
      if ((l.vendidas ?? 0) !== esperado.cantidad) {
        agregar(
          'cada unidad vendida de un lote la explica una venta viva',
          `'${p.nombre}' lote ${l.id}: dice ${l.vendidas ?? 0} vendidas y las ventas vivas sacaron ${esperado.cantidad}`
        );
      }
      if ((l.costo_vendido_usd_cents ?? 0) !== esperado.costo) {
        agregar(
          'el costo vendido de un lote es el de sus ventas vivas',
          `'${p.nombre}' lote ${l.id}: ${dinero(l.costo_vendido_usd_cents ?? 0)} contra ${dinero(esperado.costo)}`
        );
      }
      if ((l.ingreso_usd_cents ?? 0) !== esperado.ingreso) {
        agregar(
          'lo que dejó un lote es lo que cobraron sus ventas vivas',
          `'${p.nombre}' lote ${l.id}: ${dinero(l.ingreso_usd_cents ?? 0)} contra ${dinero(esperado.ingreso)}`
        );
      }
    }
  }

  for (const p of foto.pagos) {
    const v = foto.ventasCrudas.find((x) => x.id === p.venta_id);

    // El abono es de la misma clienta que su venta: si la venta cambió de
    // clienta al corregirla, sus abonos la siguen.
    if (v && (p.cliente_id ?? null) !== (v.cliente_id ?? null)) {
      agregar(
        'un abono es de la misma clienta que su venta',
        `abono #${p.id} dice clienta #${p.cliente_id ?? '—'} y ${v.codigo} es de #${v.cliente_id ?? '—'}`
      );
    }

    // Sus dos montos dicen lo mismo con su tasa. El que manda es el de la
    // moneda en que se pagó; el otro puede diferir en un centavo de redondeo.
    const tasa = p.tasa_cambio_cents;
    const diferencia =
      p.moneda === 'COR'
        ? Math.abs(p.monto_usd_cents - Math.round((p.monto_cor_cents * 100) / tasa))
        : Math.abs(p.monto_cor_cents - Math.round((p.monto_usd_cents * tasa) / 100));
    if (diferencia > 1) {
      agregar(
        'un abono dice lo mismo en sus dos monedas, con su tasa',
        `abono #${p.id} (${p.moneda}): ${dinero(p.monto_usd_cents)} y C$${(p.monto_cor_cents / 100).toFixed(2)} a ${tasa}`
      );
    }

    if (exigirAutor && !p.registrado_por) {
      agregar('un abono dice quién lo registró', `abono #${p.id} no tiene registrado_por`);
    }
  }

  // Eliminar a una clienta no esconde plata: no puede quedar debiendo.
  for (const c of foto.todasLasClientas.filter((x) => x.activo === false)) {
    const debe = foto.ventas
      .filter((v) => v.cliente_id === c.id && esDeuda(v))
      .reduce((s, v) => s + Math.max(0, v.saldo_usd_cents || 0), 0);
    if (debe > 0) {
      agregar('una clienta eliminada no debe nada', `'${c.nombre}' está eliminada y debe ${dinero(debe)}`);
    }
    const abiertos = foto.ventas.filter(
      (v) => v.cliente_id === c.id && v.tipo === 'ENCARGO' && (v.estado === 'COTIZADA' || v.estado === 'PENDIENTE')
    );
    if (abiertos.length > 0) {
      agregar(
        'una clienta eliminada no tiene encargos en curso',
        `'${c.nombre}' está eliminada y tiene ${abiertos.map((v) => v.codigo).join(', ')} en curso`
      );
    }
  }

  // -------------------------------------------------------------------------
  // Clientas
  // -------------------------------------------------------------------------

  for (const c of foto.clientes) {
    const suyas = foto.ventas.filter((v) => v.cliente_id === c.id && v.estado !== 'CANCELADA');
    const debe = suyas
      .filter((v) => esDeuda(v))
      .reduce((s, v) => s + Math.max(0, v.saldo_usd_cents || 0), 0);

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
    .filter((v) => esDeuda(v))
    .reduce((s, v) => s + Math.max(0, v.saldo_usd_cents || 0), 0);

  // Lo cotizado se muestra aparte, y tiene que ser exactamente lo que falta
  // de los encargos sin confirmar: ni se pierde ni se cuenta dos veces.
  const cotizadoReal = foto.ventas
    .filter((v) => v.tipo === 'ENCARGO' && v.estado === 'COTIZADA')
    .reduce((s, v) => s + Math.max(0, v.saldo_usd_cents || 0), 0);
  if (panel.resumen.cotizado_sin_confirmar_usd_cents !== cotizadoReal) {
    agregar(
      'el panel separa lo cotizado de lo que se debe',
      `el panel dice ${dinero(panel.resumen.cotizado_sin_confirmar_usd_cents)} cotizado y los ` +
        `encargos sin confirmar suman ${dinero(cotizadoReal)}`
    );
  }

  if (panel.resumen.por_cobrar_usd_cents !== porCobrarReal) {
    agregar(
      'el panel muestra lo que de verdad se debe',
      `el panel dice ${dinero(panel.resumen.por_cobrar_usd_cents)} y las ventas suman ` +
        `${dinero(porCobrarReal)}`
    );
  }

  // La lista de Cobros (las dos apps la arman con `por_cobrar`) trae todas
  // las ventas que se deben, y suma lo mismo que la tarjeta de Inicio.
  const enLista = panel.por_cobrar.reduce((s, f) => s + Math.max(0, f.saldo_usd_cents || 0), 0);
  if (panel.por_cobrar.length !== panel.total_por_cobrar || enLista !== porCobrarReal) {
    agregar(
      'la lista de Cobros trae todas las ventas que se deben',
      `la lista tiene ${panel.por_cobrar.length} de ${panel.total_por_cobrar} ventas con saldo y suma ` +
        `${dinero(enLista)} de ${dinero(porCobrarReal)}`
    );
  }
  for (const f of panel.por_cobrar) {
    const v = foto.ventas.find((x) => x.id === f.venta_id);
    if (!v || v.saldo_usd_cents !== f.saldo_usd_cents || (v.cliente_id ?? null) !== (f.cliente_id ?? null)) {
      agregar(
        'cada fila de Cobros dice lo mismo que su venta',
        `${f.codigo}: la fila dice ${dinero(f.saldo_usd_cents)} de la clienta #${f.cliente_id ?? '—'}`
      );
    }
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
