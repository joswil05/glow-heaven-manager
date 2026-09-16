/**
 * Quién entra al negocio, comprobado contra las reglas de verdad.
 *
 * Esto no se puede probar "en memoria": lo que decide quién pasa son las
 * reglas de Firestore, del lado del servidor. Una regla mal escrita falla en
 * una de dos direcciones y las dos son graves — o deja afuera a la dueña de su
 * propio negocio, o deja entrar a cualquiera que tenga una cuenta de Google.
 *
 * Por eso cada prueba de acá abre una sesión de verdad contra el emulador de
 * Auth y le pide a Firestore lo que pediría la app.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { emuladorVivo, iniciarSesion, baseLimpia, repos, g, HOST, HOST_AUTH, PROYECTO } from './arnes';

const disponible = await emuladorVivo();

beforeAll(async () => {
  if (!disponible) return;
  await iniciarSesion();
}, 60_000);

/** Abre una sesión nueva, con su propio correo, como haría otra persona. */
async function sesionDe(correo: string) {
  const { initializeApp, deleteApp } = await import('firebase/app');
  const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } =
    await import('firebase/auth');
  const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
  const { FIREBASE_CONFIG } = await import('../../src/shared/firebase-config');

  const app = initializeApp(FIREBASE_CONFIG, `prueba-${randomUUID()}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${HOST_AUTH}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, puerto] = HOST.split(':');
  connectFirestoreEmulator(db, host, Number(puerto));

  let cred;
  try {
    cred = await createUserWithEmailAndPassword(auth, correo, 'clave-de-prueba');
  } catch {
    cred = await signInWithEmailAndPassword(auth, correo, 'clave-de-prueba');
  }

  return { app, db, uid: cred.user.uid, correo, cerrar: () => deleteApp(app) };
}

/** Escribe con el token de administrador del emulador, saltándose las reglas. */
async function comoAdmin(ruta: string, campos: Record<string, unknown>) {
  await fetch(`http://${HOST}/v1/projects/${PROYECTO}/databases/(default)/documents/${ruta}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: campos }),
  });
}

/** ¿Esta sesión puede leer los datos del negocio? */
async function puedeLeerElNegocio(db: unknown): Promise<boolean> {
  const { collection, getDocs } = await import('firebase/firestore');
  try {
    await getDocs(collection(db as never, 'ventas'));
    return true;
  } catch {
    return false;
  }
}

describe('quién puede entrar', () => {
  beforeEach(async () => {
    if (!disponible) return;
    await baseLimpia();
  });

  it.skipIf(!disponible)(
    'alguien con cuenta de Google pero sin invitación NO entra',
    async () => {
      // Es la prueba que justifica todo lo demás: estar autenticado no alcanza,
      // porque cualquier persona del mundo puede crearse una cuenta de Google.
      const ajena = await sesionDe(`ajena-${Date.now()}@ejemplo.com`);
      try {
        const { setDoc, doc } = await import('firebase/firestore');

        // Intenta exactamente lo que hace la app al arrancar: crear SU
        // documento con SU correo, todo honesto. Lo único que le falta es la
        // invitación, y eso solo tiene que alcanzar para dejarla afuera.
        await expect(
          setDoc(doc(ajena.db as never, 'usuarios_autorizados', ajena.uid), {
            correo: ajena.correo,
            agregado_en: new Date().toISOString(),
          })
        ).rejects.toThrow();

        expect(await puedeLeerElNegocio(ajena.db)).toBe(false);
      } finally {
        await ajena.cerrar();
      }
    },
    90_000
  );

  it.skipIf(!disponible)(
    'una invitada entra en cuanto abre la app con ese correo',
    async () => {
      const correo = `invitada-${Date.now()}@ejemplo.com`;
      // Lo que hace la dueña desde Configuración.
      await comoAdmin(`invitaciones/${correo}`, {
        correo: { stringValue: correo },
        invitado_en: { stringValue: new Date().toISOString() },
      });

      const invitada = await sesionDe(correo);
      try {
        const { setDoc, doc } = await import('firebase/firestore');
        // La propia persona reclama su lugar: es la única escritura que las
        // reglas le permiten a alguien todavía no autorizado.
        await setDoc(doc(invitada.db as never, 'usuarios_autorizados', invitada.uid), {
          correo,
          agregado_en: new Date().toISOString(),
        });
        expect(
          await puedeLeerElNegocio(invitada.db),
          'tenía invitación y aun así no pudo entrar'
        ).toBe(true);
      } finally {
        await invitada.cerrar();
      }
    },
    90_000
  );

  it.skipIf(!disponible)(
    'no se puede colar usando el correo de otra persona',
    async () => {
      // Hay una invitación a nombre de alguien más. Sin la condición que ata
      // el documento al correo que Google confirmó, cualquiera podría anotarse
      // con ese correo ajeno y pasar.
      const correoInvitado = `titular-${Date.now()}@ejemplo.com`;
      await comoAdmin(`invitaciones/${correoInvitado}`, {
        correo: { stringValue: correoInvitado },
      });

      const colada = await sesionDe(`colada-${Date.now()}@ejemplo.com`);
      try {
        const { setDoc, doc } = await import('firebase/firestore');
        await expect(
          setDoc(doc(colada.db as never, 'usuarios_autorizados', colada.uid), {
            correo: correoInvitado,
            agregado_en: new Date().toISOString(),
          })
        ).rejects.toThrow();
        expect(await puedeLeerElNegocio(colada.db)).toBe(false);
      } finally {
        await colada.cerrar();
      }
    },
    90_000
  );

  it.skipIf(!disponible)(
    'nadie puede quitarse el acceso a sí mismo',
    async () => {
      // Es lo que vuelve imposible quedarse afuera del propio negocio por un
      // clic desafortunado.
      const correo = `propia-${Date.now()}@ejemplo.com`;
      await comoAdmin(`invitaciones/${correo}`, { correo: { stringValue: correo } });
      const propia = await sesionDe(correo);
      try {
        const { setDoc, deleteDoc, doc } = await import('firebase/firestore');
        await setDoc(doc(propia.db as never, 'usuarios_autorizados', propia.uid), {
          correo,
          agregado_en: new Date().toISOString(),
        });

        await expect(
          deleteDoc(doc(propia.db as never, 'usuarios_autorizados', propia.uid))
        ).rejects.toThrow();
        expect(await puedeLeerElNegocio(propia.db)).toBe(true);
      } finally {
        await propia.cerrar();
      }
    },
    90_000
  );

  it.skipIf(!disponible)(
    'quitar un acceso borra también la invitación, para que no vuelva a entrar',
    async () => {
      // Si sólo se borrara el permiso, la invitación seguiría ahí y la persona
      // volvería a reclamarla la próxima vez que abra la app: lo contrario de
      // lo que se pidió.
      const { Accesos } = await repos();
      const correo = `saliente-${Date.now()}@ejemplo.com`;
      await Accesos.invitar(correo, g());

      let lista = await Accesos.listar();
      expect(lista.some((a) => a.correo === correo && a.pendiente)).toBe(true);

      await Accesos.quitar(correo, correo, g());

      lista = await Accesos.listar();
      expect(
        lista.some((a) => a.correo === correo),
        'quedó la invitación después de quitarle el acceso'
      ).toBe(false);
    },
    90_000
  );

  it.skipIf(!disponible)(
    'el acceso de la dueña no se puede quitar',
    async () => {
      const { Accesos } = await repos();
      const { UID_DUENIA } = await import('../../src/main/firebase/repositories/accesos.repo');
      await expect(Accesos.quitar(UID_DUENIA, 'x@y.com', g())).rejects.toThrow(/dueña/i);
    },
    60_000
  );

  it.skipIf(!disponible)(
    'la dueña aparece en la lista aunque no tenga documento propio',
    async () => {
      // Su acceso vive en las reglas, no en la base. Si no figurara, la
      // pantalla le diría que la persona que la está mirando no tiene acceso.
      //
      // (Acá no se vacía la base: borrar todo se lleva puesta la autorización
      // de la propia sesión de prueba, y entonces no podría ni leer la lista.)
      const { Accesos } = await repos();
      const { UID_DUENIA } = await import('../../src/main/firebase/repositories/accesos.repo');
      const lista = await Accesos.listar();
      expect(lista.some((a) => a.id === UID_DUENIA && a.fijo)).toBe(true);
    },
    60_000
  );
});
