/**
 * Reduce una imagen elegida por la persona a una miniatura chica.
 *
 * La foto se guarda dentro del documento del producto en Firestore, que
 * admite 1 MB. Una foto de celular pesa entre 3 y 8 MB, así que subirla tal
 * cual haría fallar el guardado. Se reduce a 320px de lado y se pasa a JPEG:
 * queda cerca de 25 KB, suficiente para reconocer el producto de un vistazo.
 * El límite real no es el documento sino la lista: el inventario se lee entero
 * de una vez, y cincuenta fotos grandes harían lenta esa pantalla.
 */

const LADO_MAX = 320;
const CALIDAD = 0.7;

export const TAMANO_MAXIMO_BYTES = 12 * 1024 * 1024;

export async function aMiniatura(archivo: File): Promise<string> {
  if (!archivo.type.startsWith('image/')) {
    throw new Error('Ese archivo no es una imagen.');
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    throw new Error('La imagen es demasiado pesada. Probá con otra.');
  }

  const url = URL.createObjectURL(archivo);
  try {
    const img = await cargarImagen(url);
    const escala = Math.min(1, LADO_MAX / Math.max(img.width, img.height));
    const ancho = Math.max(1, Math.round(img.width * escala));
    const alto = Math.max(1, Math.round(img.height * escala));

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;

    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('No se pudo procesar la imagen.');

    // Fondo blanco: un PNG con transparencia queda negro al pasar a JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(img, 0, 0, ancho, alto);

    return lienzo.toDataURL('image/jpeg', CALIDAD);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cargarImagen(url: string): Promise<HTMLImageElement> {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => resolver(img);
    img.onerror = () => rechazar(new Error('No se pudo abrir la imagen.'));
    img.src = url;
  });
}
