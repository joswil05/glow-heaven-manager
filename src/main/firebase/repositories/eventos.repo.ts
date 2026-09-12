import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { getFirestoreDb, idOrdenable, leerDoc, aplicarLote, type OperacionLote } from '../client';
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
    const operaciones: OperacionLote[] = [];
    let algoRevertido = false;

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
