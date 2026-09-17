/**
 * Repartir el flete de un paquete entre lo que trajo.
 *
 * El courier cobra por el paquete completo. Esa plata salió del negocio igual
 * que el precio de los productos, así que tiene que estar adentro del costo de
 * cada unidad; si no, el margen que muestra la aplicación es una cuenta
 * correcta sobre una base incompleta.
 *
 * DOS DECISIONES QUE VALE LA PENA ENTENDER
 *
 * 1. El divisor son las unidades que el paquete TRAJO, no las que quedan.
 *
 *    Si se dividiera entre las que quedan, vender la mitad haría que las otras
 *    cargaran el doble de flete de un día para el otro, y el costo de lo que
 *    está en el estante subiría solo. El flete de lo vendido ya salió con la
 *    venta. Por eso el paquete guarda cuántas unidades metió, y ese número no
 *    se mueve cuando se vende.
 *
 * 2. El costo se guarda partido en dos: la base (precio + impuesto) y el flete.
 *
 *    Así el flete se puede volver a repartir cuando se agrega un producto al
 *    paquete sin perder lo que se pagó en la tienda. Guardar sólo el total
 *    obligaría a despejarlo al revés en cada recálculo, y ahí el redondeo se
 *    acumula hasta que los números dejan de cuadrar.
 */
import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreDb, aplicarLote, type OperacionLote } from '../client';
import { repartirFlete, fletePorUnidad } from '../../../core/costo-producto';
import type { ProductoDoc } from './productos.repo';

interface CompraParaFlete {
  envio_total_usd_cents?: number;
  otros_costos_usd_cents?: number;
  unidades_ingresadas?: number;
}

const existenciasDe = (p: ProductoDoc): number =>
  (p.variantes || []).reduce((s, v) => s + (v.existencias || 0), 0);

/**
 * Vuelve a repartir el flete de un paquete entre sus productos.
 *
 * Se llama cuando cambia algo que mueve el reparto: se le agrega un producto,
 * se le quita, o se edita lo que costó el envío. No se llama al vender, porque
 * vender no cambia cuánto flete le tocó a cada unidad.
 *
 * Escribe todo en un solo lote: si son veinte productos, son veinte cambios que
 * entran juntos o no entran. A mitad de camino, la bodega valdría cualquier
 * cosa.
 */
export async function recalcularFleteDePaquete(
  paquete_id: number,
  productosDelPaquete: ProductoDoc[]
): Promise<void> {
  if (!paquete_id) return;

  const db = getFirestoreDb();
  const snap = await getDoc(doc(db, 'compras', String(paquete_id)));
  if (!snap.exists()) return;

  const compra = snap.data() as CompraParaFlete;
  const aRepartir =
    (compra.envio_total_usd_cents || 0) + (compra.otros_costos_usd_cents || 0);

  // Las unidades que el paquete trajo. Si nunca se anotaron —los paquetes
  // viejos no lo hacían— se usan las que hay hoy, que es lo más cerca que se
  // puede estar de la verdad sin inventar datos.
  const unidadesHoy = productosDelPaquete.reduce((s, p) => s + existenciasDe(p), 0);
  const unidadesIngresadas = compra.unidades_ingresadas || unidadesHoy;

  const porProducto = repartirFlete(
    aRepartir,
    productosDelPaquete.map((p) => ({
      producto_id: p.id,
      // Se reparte sobre lo que el paquete trajo, no sobre lo que queda. Con
      // paquetes viejos sin ese dato, las dos cosas coinciden.
      unidades: existenciasDe(p),
      peso_unitario_mlb: p.peso_unitario_mlb,
    }))
  );

  // Cuando ya se vendió parte, el reparto sobre las unidades vivas asigna de
  // más: hay que escalarlo a la proporción que el paquete trajo.
  const escala = unidadesIngresadas > 0 && unidadesHoy > 0 ? unidadesHoy / unidadesIngresadas : 1;

  const operaciones: OperacionLote[] = [];
  const ahora = new Date().toISOString();

  for (const p of productosDelPaquete) {
    const existencias = existenciasDe(p);
    const base = p.costo_base_unitario_usd_cents ?? p.costo_unitario_usd_cents ?? 0;
    const fleteTotal = Math.round((porProducto.get(p.id) ?? 0) * escala);

    // El valor de la bodega sale del TOTAL, no del costo por unidad. Es lo que
    // hace que los $77 del courier caigan enteros en vez de perder centavos en
    // cada redondeo.
    const valor = existencias * base + fleteTotal;
    const fleteUnitario = fletePorUnidad(fleteTotal, existencias);
    const costoUnitario = existencias > 0 ? Math.round(valor / existencias) : base;

    if (
      p.costo_base_unitario_usd_cents === base &&
      p.flete_total_usd_cents === fleteTotal &&
      p.valor_inventario_usd_cents === valor
    ) {
      continue; // nada que cambiar en este
    }

    operaciones.push({
      coleccion: 'productos',
      id: p.id,
      merge: true,
      datos: {
        costo_base_unitario_usd_cents: base,
        flete_total_usd_cents: fleteTotal,
        flete_unitario_usd_cents: fleteUnitario,
        costo_unitario_usd_cents: costoUnitario,
        valor_inventario_usd_cents: valor,
        actualizado_en: ahora,
      },
    });
  }

  if (operaciones.length > 0) await aplicarLote(operaciones);
}

/** Suma unidades al contador del paquete, que es el divisor del reparto. */
export async function sumarUnidadesAlPaquete(
  paquete_id: number,
  unidades: number
): Promise<void> {
  if (!paquete_id || unidades <= 0) return;

  const db = getFirestoreDb();
  const ref = doc(db, 'compras', String(paquete_id));
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const actual = (snap.data() as CompraParaFlete).unidades_ingresadas || 0;
  await aplicarLote([
    {
      coleccion: 'compras',
      id: paquete_id,
      merge: true,
      datos: { unidades_ingresadas: actual + unidades },
    },
  ]);
}
