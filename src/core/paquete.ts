/**
 * La cuenta de un paquete, y lo que le hace a cada producto que trae.
 *
 * Es la única puerta por donde entra mercadería. Cada línea dice qué producto,
 * cuántas unidades y lo que costó en la tienda; acá se le suma el impuesto y
 * su parte del flete, y de eso sale el costo con el que entra al inventario.
 *
 * El mismo cálculo corre en dos lados: en la pantalla, para que ella vea la
 * cuenta mientras escribe sin gastar una lectura de Firestore por tecla, y en
 * el repositorio, que es el que guarda. Si vivieran en dos archivos, tarde o
 * temprano mostrarían una cosa y guardarían otra.
 *
 * Por qué el flete ya no se reparte entre los productos
 * -----------------------------------------------------
 * Antes el paquete se anotaba sin contenido y el flete se le repartía después
 * a los productos que tuvieran ese paquete anotado. Eso supone que un producto
 * viene de un solo paquete, y en este negocio lo normal es que un producto que
 * quedaba vuelva a llegar. Con dos paquetes el reparto se inflaba: un flete de
 * $50 llegó a repartir $110. Acá el flete se reparte UNA vez, entre las líneas
 * del paquete, y cada línea entra con su parte.
 */

import { costearPaquete, repartirPeso } from './costeo';
import { calcularPrecio, type ModoPrecio } from './precios';
import {
  crearLote,
  corregirLote,
  costoBase,
  normalizarLotes,
  ordenFIFO,
  unidadesDeLotes,
  valorDeLotes,
  type Lote,
} from './lotes';

export type DestinoLineaPaquete = 'INVENTARIO' | 'ENCARGO';

/** Lo que se escribe de cada línea. Lo demás se calcula. */
export interface LineaPaquete {
  /** Identifica la línea mientras se edita. Estable entre guardados. */
  clave: string;
  producto_id?: number;
  destino: DestinoLineaPaquete;
  /** Unidades que entran. Un pack de 5 boxers comprado dos veces son 10. */
  cantidad: number;
  /** Lo que costó la línea completa en la tienda, sin impuesto. */
  precio_linea_usd_cents: number;
  /** La tienda no cobró impuesto por esto. */
  exento?: boolean;
  /** Peso de la línea escrito a mano. Vacío: se estima. */
  peso_manual_mlb?: number | null;
  /**
   * El impuesto que ya tenía la línea, para respetarlo al corregir.
   *
   * Corregir el flete de un paquete no tiene por qué mover su impuesto. Sin
   * esto se recalculaba: en un paquete de antes del cambio, que sumó el 7%
   * redondeado por unidad, el impuesto se movía unos centavos sin que nadie
   * lo tocara; y si cambia el porcentaje en Configuración, un paquete viejo
   * tomaría el nuevo. Sólo se pasa cuando el precio y la exención no cambiaron.
   */
  tax_declarado_usd_cents?: number;
}

export interface DatosPaquete {
  /** El impuesto de la tienda, en puntos básicos. 700 = 7%. */
  tax_bp: number;
  envio_total_usd_cents: number;
  otros_costos_usd_cents?: number;
  /**
   * El impuesto total que dice el recibo, cuando no da exacto el porcentaje.
   *
   * `null` o ausente quiere decir "no hay dato", no "cero". El editor viejo
   * mandaba 0 y el motor lo leía como "el recibo no cobró impuesto": todas las
   * líneas quedaban sin el 7%.
   */
  tax_total_override_usd_cents?: number | null;
  /** Lo que pesó la caja según el courier. */
  peso_total_mlb: number;
  /** El peso unitario que ya se conoce de cada producto. 0 si no se sabe. */
  pesoUnitario: (producto_id?: number) => number;
}

export type CriterioFlete = 'PESO' | 'UNIDADES' | 'SIN_FLETE';

export interface LineaCalculada {
  clave: string;
  cantidad: number;
  precio_linea_usd_cents: number;
  tax_linea_usd_cents: number;
  peso_linea_mlb: number;
  /** El peso no lo escribió nadie: salió del reparto. */
  peso_estimado: boolean;
  envio_asignado_usd_cents: number;
  otros_asignados_usd_cents: number;
  /** Tienda + impuesto + flete + otros, de la línea completa. Es el exacto. */
  costo_linea_usd_cents: number;
  /** El costo por unidad, redondeado. Para mostrar. */
  costo_unitario_usd_cents: number;
}

export interface PaqueteCalculado {
  lineas: LineaCalculada[];
  subtotal_productos_usd_cents: number;
  tax_total_usd_cents: number;
  envio_total_usd_cents: number;
  otros_costos_usd_cents: number;
  /** Lo que salió el paquete completo. Tiene que cuadrar con los recibos. */
  total_pagado_usd_cents: number;
  peso_total_mlb: number;
  unidades_totales: number;
  /** Cómo se repartió el flete, para decirlo en pantalla. */
  criterio_flete: CriterioFlete;
}

const entero = (n: unknown, defecto = 0): number => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? v : defecto;
};

/**
 * Calcula el paquete completo: impuesto por línea, peso de cada línea y la
 * parte del flete que le toca, con la suma cuadrando al centavo.
 *
 * El flete se reparte por PESO, que es como cobra el courier. El peso de cada
 * producto casi nunca se conoce: cuando no se escribe, se estima con el peso
 * unitario que ya tenga el producto y, si no tiene, por unidades.
 */
export function calcularPaquete(lineas: LineaPaquete[], datos: DatosPaquete): PaqueteCalculado {
  const validas = lineas.filter((l) => entero(l.cantidad) > 0);

  const pesos = repartirPeso(
    validas.map((l) => ({
      clave: l.clave,
      manual_mlb:
        l.peso_manual_mlb === undefined || l.peso_manual_mlb === null
          ? null
          : Math.max(0, entero(l.peso_manual_mlb)),
      unidades: entero(l.cantidad),
      pista_mlb: Math.max(0, entero(datos.pesoUnitario(l.producto_id))),
    })),
    Math.max(0, entero(datos.peso_total_mlb))
  );

  const costeo = costearPaquete(
    validas.map((l, i) => ({
      id: i + 1,
      cantidad: entero(l.cantidad),
      precio_linea_usd_cents: Math.max(0, entero(l.precio_linea_usd_cents)),
      peso_linea_mlb: pesos.get(l.clave) ?? 0,
      exento: Boolean(l.exento),
      tax_linea_usd_cents: l.tax_declarado_usd_cents,
    })),
    {
      tax_bp: datos.tax_bp,
      envio_total_usd_cents: datos.envio_total_usd_cents,
      otros_costos_usd_cents: datos.otros_costos_usd_cents,
      tax_total_override_usd_cents: datos.tax_total_override_usd_cents ?? undefined,
    }
  );

  const aRepartir =
    Math.max(0, entero(datos.envio_total_usd_cents)) +
    Math.max(0, entero(datos.otros_costos_usd_cents));
  const hayDatoDePeso = validas.some(
    (l) =>
      (l.peso_manual_mlb !== undefined && l.peso_manual_mlb !== null) ||
      entero(datos.pesoUnitario(l.producto_id)) > 0
  );
  const criterio: CriterioFlete =
    aRepartir === 0 ? 'SIN_FLETE' : hayDatoDePeso && costeo.peso_total_mlb > 0 ? 'PESO' : 'UNIDADES';

  return {
    lineas: costeo.lineas.map((c, i) => ({
      clave: validas[i].clave,
      cantidad: c.cantidad,
      precio_linea_usd_cents: c.precio_linea_usd_cents,
      tax_linea_usd_cents: c.tax_linea_usd_cents,
      peso_linea_mlb: c.peso_linea_mlb,
      peso_estimado:
        validas[i].peso_manual_mlb === undefined || validas[i].peso_manual_mlb === null,
      envio_asignado_usd_cents: c.envio_asignado_usd_cents,
      otros_asignados_usd_cents: c.otros_asignados_usd_cents,
      costo_linea_usd_cents: c.costo_linea_usd_cents,
      costo_unitario_usd_cents: c.costo_unitario_usd_cents,
    })),
    subtotal_productos_usd_cents: costeo.subtotal_productos_usd_cents,
    tax_total_usd_cents: costeo.tax_total_usd_cents,
    envio_total_usd_cents: costeo.envio_total_usd_cents,
    otros_costos_usd_cents: costeo.otros_costos_usd_cents,
    total_pagado_usd_cents: costeo.total_pagado_usd_cents,
    peso_total_mlb: costeo.peso_total_mlb,
    unidades_totales: costeo.unidades_totales,
    criterio_flete: criterio,
  };
}

// ---------------------------------------------------------------------------
// Lo que el paquete le hace a cada producto
// ---------------------------------------------------------------------------

/** Lo que hace falta saber de un producto para ver cómo lo mueve el paquete. */
export interface ProductoAntesDelPaquete {
  existencias: number;
  valor_inventario_usd_cents: number;
  /** El costo guardado. Sirve cuando no hay existencias de las que derivarlo. */
  costo_unitario_usd_cents: number;
  precio_venta_usd_cents: number;
  modo_precio: ModoPrecio;
  /** El margen que le toca: el suyo, el de su categoría o el global. */
  margen_bp: number;
  multiplicador_bp?: number;
  precio_manual_usd_cents?: number;
  /**
   * Sus lotes, ya cuadrados. Sin ellos se arma un saldo con las existencias y
   * el valor: es lo que pasa con un producto anterior a la 2.14.
   */
  lotes?: Lote[];
}

export interface EfectoEnProducto {
  existencias_antes: number;
  existencias_despues: number;
  valor_antes_usd_cents: number;
  valor_despues_usd_cents: number;
  /** El costo que manda el precio: el del lote más caro que queda. */
  costo_antes_usd_cents: number;
  costo_despues_usd_cents: number;
  precio_antes_usd_cents: number;
  precio_despues_usd_cents: number;
  /** El precio no cubre el costo. Pasa con un precio escrito a mano. */
  bajo_costo: boolean;
}

/** Una línea de bodega que entra: crea su lote. */
export interface EntradaDeLinea {
  cantidad: number;
  costo_linea_usd_cents: number;
  variante_id?: number;
  /** Cómo se llama y dónde va en la fila el lote que crea. */
  lote?: Partial<
    Pick<Lote, 'id' | 'fecha' | 'orden' | 'compra_id' | 'compra_codigo' | 'compra_linea_id' | 'costo_unitario_usd_cents'>
  >;
}

/** Una línea que ya entró y cambió de costo. */
export interface CambioDeLinea {
  unidades_de_la_linea: number;
  diferencia_usd_cents: number;
  /** El lote de esa línea. Sin él, el cambio no mueve la bodega. */
  lote_id?: string;
  nuevo_costo_unitario_usd_cents?: number;
}

/**
 * El precio que corresponde a un costo, según cómo decidió ella el precio.
 *
 * Un precio escrito a mano no se toca: si decidió cobrar $23, no se le cambia
 * porque llegó un paquete. Sí se avisa si quedó debajo del costo.
 */
export function precioParaCosto(
  p: Pick<
    ProductoAntesDelPaquete,
    'modo_precio' | 'margen_bp' | 'multiplicador_bp' | 'precio_manual_usd_cents' | 'precio_venta_usd_cents'
  >,
  costo_usd_cents: number,
  paso_redondeo_usd_cents: number
): number {
  if (p.modo_precio === 'MANUAL') {
    return p.precio_manual_usd_cents ?? p.precio_venta_usd_cents;
  }
  // Sin costo no hay de dónde sacar un precio por margen. Se deja el que
  // estaba en vez de ponerlo en cero.
  if (costo_usd_cents <= 0) return p.precio_venta_usd_cents;
  return calcularPrecio({
    costo_unitario_usd_cents: costo_usd_cents,
    modo: p.modo_precio,
    margen_bp: p.margen_bp,
    multiplicador_bp: p.multiplicador_bp,
    precio_manual_usd_cents: p.precio_manual_usd_cents,
    paso_redondeo_usd_cents,
  }).precio_usd_cents;
}

/** El id del lote que crea una línea de paquete. */
export function idLoteDeLinea(compra_id: number, linea_id: number): string {
  return `pq${compra_id}-l${linea_id}`;
}

/**
 * El lote de una línea de paquete.
 *
 * Una línea que entró con la 2.14 tiene su propio lote. Una anterior quedó
 * dentro del saldo de su talla: si el saldo es de ese paquete, es ese; si no,
 * el saldo más viejo de la talla.
 */
export function loteDeLinea(
  lotes: readonly Lote[],
  compra_id: number,
  linea_id: number,
  variante_id?: number
): Lote | undefined {
  const propio = lotes.find((l) => l.id === idLoteDeLinea(compra_id, linea_id));
  if (propio) return propio;
  const saldos = lotes.filter(
    (l) => l.origen === 'SALDO' && (variante_id === undefined || l.variante_id === variante_id)
  );
  return saldos.find((l) => l.compra_id === compra_id) ?? saldos[0];
}

/** Los lotes con que arranca el cálculo: los suyos o un saldo armado. */
function lotesDe(p: ProductoAntesDelPaquete): Lote[] {
  if (p.lotes) return p.lotes.map((l) => ({ ...l }));
  return normalizarLotes({
    variantes: [{ id: 1, existencias: p.existencias }],
    valor_inventario_usd_cents: p.valor_inventario_usd_cents,
    costo_unitario_usd_cents: p.costo_unitario_usd_cents,
  }).lotes;
}

function agregarEntradas(lotes: Lote[], entradas: readonly EntradaDeLinea[]): Lote[] {
  entradas.forEach((e, i) => {
    lotes.push(
      crearLote({
        id: e.lote?.id ?? `nuevo-${i + 1}`,
        variante_id: e.variante_id ?? 1,
        cantidad: e.cantidad,
        valor_usd_cents: e.costo_linea_usd_cents,
        // Sin fecha, lo que entra va al final de la fila.
        fecha: e.lote?.fecha ?? '9999-12-31',
        orden: e.lote?.orden ?? i + 1,
        origen: 'PAQUETE',
        compra_id: e.lote?.compra_id,
        compra_codigo: e.lote?.compra_codigo,
        compra_linea_id: e.lote?.compra_linea_id,
        costo_unitario_usd_cents: e.lote?.costo_unitario_usd_cents,
      })
    );
  });
  return lotes.sort(ordenFIFO);
}

/**
 * Cómo queda un producto después de que le entran las líneas de un paquete.
 *
 * Cada línea es un lote. El precio por margen se calcula sobre el lote más
 * caro que queda: si lo nuevo es más caro, sube; si es más barato, el precio
 * sigue cubriendo lo que había.
 */
export function efectoDeEntradas(
  p: ProductoAntesDelPaquete,
  entradas: readonly EntradaDeLinea[],
  paso_redondeo_usd_cents: number
): EfectoEnProducto & { lotes_despues: Lote[] } {
  const antes = lotesDe(p);
  const despues = agregarEntradas(
    antes.map((l) => ({ ...l })),
    entradas
  );
  return { ...armarEfecto(p, antes, despues, paso_redondeo_usd_cents), lotes_despues: despues };
}

/**
 * Cómo queda un producto cuando se corrige un paquete que ya entró.
 *
 * Cada línea corregida cambia el valor de su lote, sólo en lo que queda de
 * él; las líneas nuevas entran como una entrada cualquiera.
 */
export function efectoDeCorreccion(
  p: ProductoAntesDelPaquete,
  cambios: readonly CambioDeLinea[],
  entradas: readonly EntradaDeLinea[],
  paso_redondeo_usd_cents: number
): EfectoEnProducto & { aplicado_usd_cents: number; lotes_despues: Lote[] } {
  const antes = lotesDe(p);
  let lotes = antes.map((l) => ({ ...l }));
  let aplicado = 0;

  for (const c of cambios) {
    if (!c.lote_id) continue;
    const r = corregirLote(
      lotes,
      c.lote_id,
      c.diferencia_usd_cents,
      c.unidades_de_la_linea,
      c.nuevo_costo_unitario_usd_cents
    );
    aplicado += r.aplicado_usd_cents;
    lotes = r.lotes;
  }
  const despues = agregarEntradas(lotes, entradas);

  return {
    ...armarEfecto(p, antes, despues, paso_redondeo_usd_cents),
    aplicado_usd_cents: aplicado,
    lotes_despues: despues,
  };
}

function armarEfecto(
  p: ProductoAntesDelPaquete,
  antes: readonly Lote[],
  despues: readonly Lote[],
  paso: number
): EfectoEnProducto {
  const baseAntes = costoBase(antes);
  const costoAntes = baseAntes > 0 ? baseAntes : Math.max(0, entero(p.costo_unitario_usd_cents));
  const baseDespues = costoBase(despues);
  const costoDespues = baseDespues > 0 ? baseDespues : costoAntes;
  const precioDespues = precioParaCosto(p, costoDespues, paso);

  return {
    existencias_antes: unidadesDeLotes(antes),
    existencias_despues: unidadesDeLotes(despues),
    valor_antes_usd_cents: valorDeLotes(antes),
    valor_despues_usd_cents: valorDeLotes(despues),
    costo_antes_usd_cents: costoAntes,
    costo_despues_usd_cents: costoDespues,
    precio_antes_usd_cents: p.precio_venta_usd_cents,
    precio_despues_usd_cents: precioDespues,
    bajo_costo: costoDespues > 0 && precioDespues < costoDespues,
  };
}
