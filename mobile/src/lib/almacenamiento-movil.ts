/**
 * Le pide al teléfono que no borre lo que la app guardó (C3 · T1).
 *
 * Sin red, el celular muestra lo último que cargó, y eso vive en el
 * almacenamiento del sitio (la caché de Firestore y la sesión). Safari puede
 * borrarlo si el sitio no se abre en días; con almacenamiento persistente no.
 * No se muestra nada: si no se concede, la app sigue igual.
 */
export async function pedirAlmacenamientoPersistente(
  nav: { storage?: { persist?: () => Promise<boolean> } } | undefined
): Promise<boolean> {
  try {
    return (await nav?.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
