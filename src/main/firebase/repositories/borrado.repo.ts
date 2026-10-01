/**
 * "Fue un error": borrar una venta o un abono que nunca pasó, sin dejar rastro.
 *
 * La regla de cuándo se puede está en `core/borrado.ts`; acá está cómo.
 *
 * Primero se anula por el camino de siempre (`cambiarEstado` y
 * `PagosRepo.anular`): eso ya devuelve cada unidad a su lote, saca los abonos
 * de lo cobrado, recalcula la clienta y resuelve las piezas de un encargo, y
 * está probado. Después se barre lo que quedó: el documento, sus abonos, sus
 * movimientos de inventario (los de la venta y los de la devolución, que se
 * cancelan entre sí) y sus eventos, incluidos los que acaba de dejar la
 * anulación. Si algo falla a mitad del barrido, lo que queda es una venta
 * anulada: un estado que la app ya sabe mostrar, no uno roto.
 *
 * Las reglas de Firestore no dejan borrar un movimiento de inventario
 * mientras la venta a la que apunta exista, así que la venta se borra en el
 * mismo lote que sus movimientos, y primero.
 */
import { collection, doc, getDocs, query, runTransaction, where, type Query } from 'firebase/firestore';
import { aplicarLote, getFirestoreDb, leerDoc, type OperacionLote } from '../client';
import { porQueNoSeBorraAbono, porQueNoSeBorraVenta } from '../../../core/borrado';
import { codigoDeVenta } from '../../../core/codigos';
import type { Pago, ResultadoBorrado } from '../../../shared/types';
import type { VentaDoc } from './ventas.repo';
import { VentasRepoFirestore } from './ventas.repo';
import { PagosRepoFirestore } from './pagos.repo';
import { ParametrosRepoFirestore } from './parametros.repo';
import { ResumenesRepoFirestore } from './resumenes.repo';

/**
 * Borrar no deja cómo revisarlo después: sin el PIN, cualquiera con acceso
 * podría hacer desaparecer una venta cobrada en efectivo. Si el negocio no
 * tiene PIN, no se pide.
 */
async function verificarPin(pin: string | undefined): Promise<void> {
  const { pin_seguridad } = await ParametrosRepoFirestore.getParametros();
  if (pin_seguridad && (pin ?? '').trim() !== pin_seguridad) {
    throw new Error('El PIN no es correcto.');
  }
}

/**
 * Los documentos de una consulta, con su id. Cada consulta se escribe entera
 * donde se usa (colección y campo literales) para que `auditar-indices.mjs`
 * pueda leerla: todas son de una sola igualdad y no piden índice compuesto.
 */
async function docsDe(q: Query): Promise<{ id: string; datos: Record<string, unknown> }[]> {
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, datos: d.data() as Record<string, unknown> }));
}

function pagosDeVenta(venta_id: number) {
  const db = getFirestoreDb();
  return docsDe(query(collection(db, 'pagos'), where('venta_id', '==', venta_id)));
}

/**
 * Los eventos de las entidades borradas y los del grupo que las anuló. Se
 * busca por un solo campo y se afina en memoria: no hace falta un índice
 * compuesto, y `entidad_id` se repite entre colecciones (la venta 7 y el
 * pago 7).
 */
async function eventosABorrar(
  evento_grupo_id: string,
  entidades: { tipo: string; id: number }[]
): Promise<string[]> {
  const ids = new Set<string>();
  const db = getFirestoreDb();
  for (const e of await docsDe(query(collection(db, 'eventos'), where('evento_grupo_id', '==', evento_grupo_id)))) {
    ids.add(e.id);
  }
  for (const { tipo, id } of entidades) {
    for (const e of await docsDe(query(collection(db, 'eventos'), where('entidad_id', '==', id)))) {
      if (e.datos.entidad_tipo === tipo) ids.add(e.id);
    }
  }
  return [...ids];
}

/**
 * Si lo borrado eran los últimos números, el contador vuelve atrás: la
 * próxima venta reusa el código y no queda un hueco. Si después se cargó
 * otra, el hueco queda: ese número ya puede estar en una factura mandada.
 */
async function devolverNumeros(entidad: string, borrados: readonly number[]): Promise<void> {
  if (borrados.length === 0) return;
  const db = getFirestoreDb();
  const ref = doc(db, '_secuencias', entidad);
  const conjunto = new Set(borrados);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    let valor = Number(snap.data().valor ?? 0);
    const antes = valor;
    while (valor > 0 && conjunto.has(valor)) valor--;
    if (valor !== antes) tx.set(ref, { valor, actualizado_en: new Date().toISOString() }, { merge: true });
  });
}

const borrar = (coleccion: string, id: string | number): OperacionLote => ({ coleccion, id, borrar: true });

export class BorradoRepoFirestore {
  /**
   * Borra una venta (o un encargo) que nunca pasó, con sus abonos, sus
   * movimientos y sus eventos. Tira un error que dice qué hacer en su lugar
   * si la regla no lo permite.
   */
  static async venta(venta_id: number, pin: string | undefined, evento_grupo_id: string): Promise<ResultadoBorrado> {
    await verificarPin(pin);

    const venta = await leerDoc<VentaDoc>('ventas', venta_id);
    if (!venta) throw new Error(`La venta #${venta_id} no existe.`);
    const codigo = venta.codigo || codigoDeVenta(venta_id, venta.tipo);

    const pagosAntes = (await pagosDeVenta(venta_id)).map((p) => p.datos as unknown as Pago);
    const motivo = porQueNoSeBorraVenta({ ...venta, codigo }, pagosAntes);
    if (motivo) throw new Error(motivo);

    // 1. Anular por el camino de siempre: devuelve las unidades a sus lotes y
    //    saca los abonos de lo cobrado.
    if (venta.estado !== 'CANCELADA') {
      await VentasRepoFirestore.cambiarEstado(venta_id, 'CANCELADA', evento_grupo_id);
    }

    // 2. Barrer. Se vuelve a leer: anular pudo agregar movimientos.
    const db = getFirestoreDb();
    const pagos = await pagosDeVenta(venta_id);
    const movimientos = (
      await docsDe(query(collection(db, 'movimientos_inventario'), where('referencia_id', '==', venta_id)))
    ).filter((m) => m.datos.referencia_tipo === 'VENTA');
    const pagoIds = pagos.map((p) => Number(p.id));
    const eventos = await eventosABorrar(evento_grupo_id, [
      { tipo: 'ventas', id: venta_id },
      ...pagoIds.map((id) => ({ tipo: 'pagos', id })),
    ]);

    await aplicarLote([
      // La venta va primero: las reglas sólo dejan borrar un movimiento
      // cuando su venta ya no existe.
      borrar('ventas', venta_id),
      ...movimientos.map((m) => borrar('movimientos_inventario', m.id)),
      ...pagos.map((p) => borrar('pagos', p.id)),
      ...eventos.map((id) => borrar('eventos', id)),
    ]);

    await devolverNumeros('ventas', [venta_id]);
    await devolverNumeros('pagos', pagoIds);
    await ResumenesRepoFirestore.invalidarPorFecha(venta.fecha);

    // Los que contaban como cobrados antes de anular.
    return { que: codigo, abonos: pagosAntes.filter((p) => p.activo !== false).length };
  }

  /** Borra un abono que nunca entró, sin tocar la venta más que su saldo. */
  static async abono(pago_id: number, pin: string | undefined, evento_grupo_id: string): Promise<ResultadoBorrado> {
    await verificarPin(pin);

    const pago = await leerDoc<Pago>('pagos', pago_id);
    if (!pago) throw new Error(`El abono #${pago_id} no existe.`);
    const motivo = porQueNoSeBorraAbono(pago);
    if (motivo) throw new Error(motivo);

    // Anular recalcula lo pagado y el saldo de la venta, sus cuotas y la clienta.
    if (pago.activo !== false) await PagosRepoFirestore.anular(pago_id, evento_grupo_id);

    const eventos = await eventosABorrar(evento_grupo_id, [{ tipo: 'pagos', id: pago_id }]);
    await aplicarLote([borrar('pagos', pago_id), ...eventos.map((id) => borrar('eventos', id))]);
    await devolverNumeros('pagos', [pago_id]);

    return { que: 'el abono', abonos: 1 };
  }
}
