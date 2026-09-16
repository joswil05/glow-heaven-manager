/**
 * Quién puede entrar al negocio.
 *
 * Antes esto era una lista de UID escrita a mano en `firestore.rules` y
 * repetida en el código del celular. Agregar a una ayudante, cambiar de correo
 * o quitarle el acceso a alguien exigía editar dos archivos, desplegar las dos
 * apps y publicar una versión nueva de Windows — para una decisión que es
 * enteramente de la dueña.
 *
 * Firebase identifica a la gente por UID, no por correo, y el UID recién existe
 * cuando esa persona entra por primera vez. De ahí las dos colecciones:
 *
 *   · `invitaciones/<correo>` — a quién se invitó. Es lo único que se puede
 *     escribir de antemano, porque el correo sí se conoce.
 *   · `usuarios_autorizados/<uid>` — quién entró de verdad. Lo crea la propia
 *     persona la primera vez, reclamando su invitación.
 *
 * El UID de la dueña sigue escrito en las reglas. No es un privilegio: es lo
 * que hace imposible que se quede afuera de su propio negocio.
 */
import { collection, getDocs, doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { getFirestoreDb } from '../client';
import { EventosRepoFirestore } from './eventos.repo';
import type { Acceso } from '../../../shared/types';

/** El UID de la dueña, el mismo que está anclado en `firestore.rules`. */
export const UID_DUENIA = 'ZdM86RTlEEQLYWHSBZPvsKq2YgJ3';



interface AutorizadoDoc {
  correo?: string;
  nombre?: string;
  agregado_en?: string;
}

interface InvitacionDoc {
  correo?: string;
  invitado_en?: string;
}

const normalizarCorreo = (correo: string): string => correo.trim().toLowerCase();

export class AccesosRepoFirestore {
  /**
   * Quién tiene acceso y quién está invitado, en una sola lista.
   *
   * Las dos cosas van juntas a propósito: para quien mira la pantalla son lo
   * mismo —gente con acceso al negocio— y separarlas en dos listas obligaría a
   * entender la diferencia entre un correo y un UID para usar la función.
   */
  static async listar(uidActual?: string): Promise<Acceso[]> {
    const db = getFirestoreDb();
    const [autorizados, invitaciones] = await Promise.all([
      getDocs(collection(db, 'usuarios_autorizados')),
      getDocs(collection(db, 'invitaciones')),
    ]);

    const activos: Acceso[] = autorizados.docs.map((d) => {
      const data = d.data() as AutorizadoDoc;
      return {
        id: d.id,
        correo: data.correo ?? '(sin correo)',
        nombre: data.nombre,
        pendiente: false,
        fijo: d.id === UID_DUENIA || d.id === uidActual,
        desde: data.agregado_en,
      };
    });

    // La dueña siempre figura, haya o no documento suyo: su acceso vive en las
    // reglas. Si no apareciera, la pantalla diría que la persona que la está
    // mirando no tiene acceso.
    if (!activos.some((a) => a.id === UID_DUENIA)) {
      activos.push({
        id: UID_DUENIA,
        correo: 'angierlinartej2020@gmail.com',
        nombre: 'Dueña',
        pendiente: false,
        fijo: true,
      });
    }

    const correosActivos = new Set(activos.map((a) => normalizarCorreo(a.correo)));
    const pendientes: Acceso[] = invitaciones.docs
      .filter((d) => !correosActivos.has(normalizarCorreo(d.id)))
      .map((d) => {
        const data = d.data() as InvitacionDoc;
        return {
          id: d.id,
          correo: data.correo ?? d.id,
          pendiente: true,
          fijo: false,
          desde: data.invitado_en,
        };
      });

    return [...activos, ...pendientes].sort((a, b) => {
      if (a.pendiente !== b.pendiente) return a.pendiente ? 1 : -1;
      return a.correo.localeCompare(b.correo);
    });
  }

  /** Invita a alguien por su correo de Google. */
  static async invitar(correo: string, evento_grupo_id: string): Promise<void> {
    const limpio = normalizarCorreo(correo);
    if (!limpio || !limpio.includes('@') || limpio.includes(' ')) {
      throw new Error('Escribí un correo válido.');
    }

    const db = getFirestoreDb();
    await setDoc(doc(db, 'invitaciones', limpio), {
      correo: limpio,
      invitado_en: new Date().toISOString(),
    });

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'accesos',
      entidad_id: 0,
      tipo_evento: 'CREACION',
      detalle: `Se invitó a ${limpio}`,
      // No es reversible por el motor de deshacer: quitar un acceso es una
      // decisión de seguridad y se hace a propósito desde su pantalla.
      reversible: false,
    });
  }

  /**
   * Le quita el acceso a alguien.
   *
   * Borra las dos puntas: el permiso y la invitación. Si sólo se borrara el
   * permiso, la invitación seguiría ahí y la persona volvería a entrar la
   * próxima vez, que es exactamente lo contrario de lo que se pidió.
   */
  static async quitar(id: string, correo: string, evento_grupo_id: string): Promise<void> {
    if (id === UID_DUENIA) {
      throw new Error('No se puede quitar el acceso de la dueña del negocio.');
    }

    const db = getFirestoreDb();
    const limpio = normalizarCorreo(correo);

    await deleteDoc(doc(db, 'usuarios_autorizados', id)).catch(() => {
      // Puede ser una invitación que nunca se usó: no hay permiso que borrar.
    });
    if (limpio && limpio.includes('@')) {
      await deleteDoc(doc(db, 'invitaciones', limpio)).catch(() => {
        /* puede no existir */
      });
    }

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'accesos',
      entidad_id: 0,
      tipo_evento: 'ELIMINACION',
      detalle: `Se le quitó el acceso a ${limpio || id}`,
      reversible: false,
    });
  }

  /**
   * ¿Esta persona puede entrar? Y si fue invitada, la deja pasar.
   *
   * Corre en cada arranque, antes de mostrar nada. Es lo que convierte una
   * invitación en acceso: la propia persona crea su documento la primera vez,
   * que es la única escritura que las reglas le permiten a alguien todavía no
   * autorizado.
   */
  static async verificarOReclamar(uid: string, correo: string | null): Promise<boolean> {
    if (uid === UID_DUENIA) return true;

    const db = getFirestoreDb();
    const limpio = correo ? normalizarCorreo(correo) : '';

    const ya = await getDoc(doc(db, 'usuarios_autorizados', uid)).catch(() => null);
    if (ya?.exists()) return true;

    if (!limpio) return false;

    try {
      await setDoc(doc(db, 'usuarios_autorizados', uid), {
        correo: limpio,
        agregado_en: new Date().toISOString(),
      });
      return true;
    } catch {
      // Sin invitación a su nombre, las reglas rechazan la escritura. Eso ES
      // la respuesta: no tiene acceso.
      return false;
    }
  }
}
