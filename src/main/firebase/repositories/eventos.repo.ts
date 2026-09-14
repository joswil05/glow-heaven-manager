import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import {
  getFirestoreDb,
  idOrdenable,
  leerDoc,
  leerVarios,
  aplicarLote,
  type OperacionLote,
} from '../client';
import { ParametrosRepoFirestore } from './parametros.repo';
import type { EventoAuditoria } from '../../../shared/types';

/**
 * Auditoría y deshacer.
 *
 * El evento guarda la fila completa antes del cambio y deshacer la restaura.
 * No hay una rama de código por entidad: cada colección nueva funciona sola.
 */

export type TipoEvento = 'CREACION' | 'ACTUALIZACION' | 'ELIMINACION';

/**
 * Colecciones que el motor de deshacer puede tocar. `entidad_tipo` termina
 * siendo el nombre de una colección, así que no puede ser texto libre: un
 * evento con un valor inesperado escribiría fuera del modelo.
 */
const COLECCIONES_REVERSIBLES = new Set([
  'productos',
  'compras',
  'ventas',
  'pagos',
  'clientes',
  'categorias',
  'movimientos_inventario',
]);

/** `parametros` vive en un único documento y se revierte campo por campo. */
const COLECCION_PARAMETROS = 'parametros';

export interface RegistrarEventoInput {
  evento_grupo_id: string;
  entidad_tipo: string;
  entidad_id: number;
  tipo_evento: TipoEvento;
  valor_anterior?: Record<string, unknown> | null;
  valor_nuevo?: Record<string, unknown> | null;
  detalle?: string;
  /** Ver `EventoAuditoria.reversible`. Por omisión, true. */
  reversible?: boolean;
}

export interface ResultadoDeshacer {
  revertido: boolean;
  descripcion: string;
}

export class EventosRepoFirestore {
  /** Snapshot de un documento, para guardarlo como valor anterior. */
  static async snapshot(
    coleccion: string,
    id: number | string
  ): Promise<Record<string, unknown> | null> {
    if (!COLECCIONES_REVERSIBLES.has(coleccion)) return null;
    return leerDoc<Record<string, unknown>>(coleccion, id);
  }

  static async registrarEvento(evento: RegistrarEventoInput): Promise<void> {
    await this.registrarVarios([evento]);
  }

  /**
   * Registra varios eventos de un solo viaje. Una acción que toca diez
   * documentos genera diez eventos; escribirlos uno por uno duplica el costo
   * de la operación que los produjo.
   */
  static async registrarVarios(eventos: RegistrarEventoInput[]): Promise<void> {
    if (eventos.length === 0) return;

    const now = new Date().toISOString();

    const operaciones: OperacionLote[] = eventos.map((evento) => {
      const id = idOrdenable();
      return {
      coleccion: 'eventos',
      id,
      merge: false,
      datos: {
        id,
        evento_grupo_id: evento.evento_grupo_id,
        entidad_tipo: evento.entidad_tipo,
        entidad_id: evento.entidad_id,
        tipo_evento: evento.tipo_evento,
        valor_anterior: evento.valor_anterior ? JSON.stringify(evento.valor_anterior) : null,
        valor_nuevo: evento.valor_nuevo ? JSON.stringify(evento.valor_nuevo) : null,
        detalle: evento.detalle ?? null,
        reversible: evento.reversible ?? true,
        timestamp: now,
      },
      };
    });

    await aplicarLote(operaciones);
  }

  static async ultimoGrupoId(): Promise<string | null> {
    const db = getFirestoreDb();
    // Ordenado y limitado en el servidor: traer la colección entera para
    // quedarse con el último es lo que hacía la versión anterior.
    const snap = await getDocs(
      query(collection(db, 'eventos'), orderBy('id', 'desc'), limit(1))
    );
    if (snap.empty) return null;
    return (snap.docs[0].data() as EventoAuditoria).evento_grupo_id;
  }

  /**
   * Revierte todos los eventos de un grupo, del más nuevo al más viejo.
   * Un grupo es una acción del usuario, aunque haya tocado diez documentos.
   */
  static async deshacerGrupo(grupoIdSolicitado?: string): Promise<ResultadoDeshacer> {
    const db = getFirestoreDb();
    const grupoId = grupoIdSolicitado ?? (await this.ultimoGrupoId());

    if (!grupoId) {
      return { revertido: false, descripcion: 'No hay acciones recientes para deshacer.' };
    }

    const snap = await getDocs(
      query(collection(db, 'eventos'), where('evento_grupo_id', '==', grupoId))
    );

    if (snap.empty) {
      return { revertido: false, descripcion: 'Esa acción ya no se puede deshacer.' };
    }

    const eventos = snap.docs
      .map((d) => d.data() as EventoAuditoria)
      .sort((a, b) => b.id.localeCompare(a.id));

    const descripcion = eventos.find((e) => e.detalle)?.detalle ?? 'Acción deshecha';

    // 1. Lo que no se puede revertir entero no se revierte a medias.
    //
    // Este motor sabe reponer documentos, no mover mercadería. Si la acción
    // además movió existencias, restaurar el documento dejaría la venta viva
    // y las unidades contadas dos veces. Antes se hacía igual y el inventario
    // quedaba inflado sin que nadie se enterara.
    if (eventos.some((ev) => ev.reversible === false)) {
      return {
        revertido: false,
        descripcion:
          'Esta acción movió mercadería y no se puede deshacer automáticamente. ' +
          'Para revertirla, anulá la venta desde su detalle.',
      };
    }

    // 2. Si alguien tocó el documento después, la instantánea ya no sirve.
    //
    // La reversión escribe el documento ENTERO como estaba (merge:false), así
    // que aplicarla sobre algo que cambió en el medio pisa ese cambio. Caso
    // real: se edita un producto, desde el celular se vende, y deshacer la
    // edición resucita las unidades vendidas.
    const aRestaurar = eventos.filter(
      (ev) =>
        ev.tipo_evento !== 'CREACION' &&
        ev.valor_anterior &&
        COLECCIONES_REVERSIBLES.has(ev.entidad_tipo)
    );

    for (const ev of aRestaurar) {
      const actual = await leerDoc<{ actualizado_en?: string }>(ev.entidad_tipo, ev.entidad_id);
      const tocadoDespues =
        actual?.actualizado_en && ev.timestamp && actual.actualizado_en > ev.timestamp;
      if (tocadoDespues) {
        return {
          revertido: false,
          descripcion:
            'No se puede deshacer: hubo cambios posteriores sobre lo mismo. ' +
            'Deshacer ahora borraría esos cambios.',
        };
      }
    }

    const operaciones: OperacionLote[] = [];
    let algoRevertido = false;

    // Los abonos que se van a revertir: después hay que recalcular el saldo
    // de su venta con los pagos que queden, porque el documento de la venta
    // no se restaura por instantánea (lo tocan varias acciones a la vez).
    const pagosAfectados = await leerVarios<{ venta_id?: number; cliente_id?: number }>(
      'pagos',
      eventos.filter((ev) => ev.entidad_tipo === 'pagos').map((ev) => ev.entidad_id)
    );
    const ventasARecalcular = new Set<number>();
    const clientesARefrescar = new Set<number>();

    for (const pago of pagosAfectados.values()) {
      if (pago.venta_id) ventasARecalcular.add(Number(pago.venta_id));
      if (pago.cliente_id) clientesARefrescar.add(Number(pago.cliente_id));
    }

    for (const ev of eventos) {
      const anterior = ev.valor_anterior
        ? (JSON.parse(ev.valor_anterior) as Record<string, unknown>)
        : null;

      if (ev.entidad_tipo === COLECCION_PARAMETROS) {
        if (!anterior) continue;
        operaciones.push({
          coleccion: 'parametros',
          id: 'sistema',
          datos: anterior,
          merge: true,
        });
        algoRevertido = true;
        continue;
      }

      if (!COLECCIONES_REVERSIBLES.has(ev.entidad_tipo)) continue;

      if (ev.entidad_tipo === 'ventas') {
        const cliente = Number(
          (anterior?.cliente_id as number | undefined) ??
            (await leerDoc<{ cliente_id?: number }>('ventas', ev.entidad_id))?.cliente_id ??
            0
        );
        if (cliente) clientesARefrescar.add(cliente);
      }

      if (ev.tipo_evento === 'CREACION') {
        operaciones.push({ coleccion: ev.entidad_tipo, id: ev.entidad_id, borrar: true });
        algoRevertido = true;
        continue;
      }

      if (!anterior) continue;

      // merge:false devuelve el documento exactamente como estaba, incluidos
      // los campos que la edición había agregado.
      operaciones.push({
        coleccion: ev.entidad_tipo,
        id: ev.entidad_id,
        datos: anterior,
        merge: false,
      });
      algoRevertido = true;
    }

    if (!algoRevertido) {
      return {
        revertido: false,
        descripcion: 'Esta acción no se puede deshacer automáticamente.',
      };
    }

    // El rastro solo se borra de lo que de verdad se revirtió, y va en el
    // mismo lote que la reversión.
    for (const d of snap.docs) {
      operaciones.push({ coleccion: 'eventos', id: d.id, borrar: true });
    }

    await aplicarLote(operaciones);

    // 3. Lo derivado se RECALCULA, no se restaura.
    //
    // Al revertir un abono sólo desaparecía su documento: el `pagado` y el
    // `saldo` de la venta seguían contándolo, y la venta quedaba mostrando un
    // saldo que ningún pago respaldaba. Se recalcula desde los pagos que
    // quedan activos, que es la única fuente de verdad.
    for (const ventaId of ventasARecalcular) {
      try {
        const { VentasRepoFirestore } = await import('./ventas.repo');
        await VentasRepoFirestore.recalcularSaldo(ventaId);
      } catch (err) {
        console.warn(`[eventos.repo] No se pudo recalcular el saldo de la venta #${ventaId}:`, err);
      }
    }

    for (const clienteId of clientesARefrescar) {
      try {
        const { ClientesRepoFirestore } = await import('./clientes.repo');
        await ClientesRepoFirestore.refrescarTotales(clienteId);
      } catch (err) {
        console.warn(`[eventos.repo] No se pudieron refrescar los totales del cliente #${clienteId}:`, err);
      }
    }

    // La configuración se cachea en memoria; sin esto, deshacer un cambio de
    // ajustes dejaba la pantalla mostrando el valor que se acababa de revertir.
    ParametrosRepoFirestore.invalidarCache();

    return { revertido: true, descripcion };
  }

  static async historial(limite = 50): Promise<EventoAuditoria[]> {
    const db = getFirestoreDb();
    const snap = await getDocs(
      query(collection(db, 'eventos'), orderBy('id', 'desc'), limit(limite))
    );
    return snap.docs.map((d) => d.data() as EventoAuditoria);
  }
}
