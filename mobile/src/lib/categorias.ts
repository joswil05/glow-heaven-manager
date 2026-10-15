import { Droplets, Footprints, Home, Package, Shirt, ShoppingBag, Sparkles, SprayCan, type LucideIcon } from 'lucide-react';

/**
 * El ícono de una categoría, para un producto sin foto (VEN-3): reconocerlo
 * por su forma es más rápido que leer "GL" o "LA". Las categorías las crea la
 * dueña en Windows, así que se reconocen por palabras y lo demás va con una
 * caja.
 */
const POR_PALABRA: [RegExp, LucideIcon][] = [
  [/perfum|fragan|colonia/i, SprayCan],
  [/maquill|labial|sombra|cosm/i, Sparkles],
  [/skin|piel|crema|facial/i, Droplets],
  [/calzad|zapat|sandal|tenis/i, Footprints],
  [/bolso|cartera|accesor/i, ShoppingBag],
  [/ropa|vestid|blusa|camis/i, Shirt],
  [/hogar|casa/i, Home],
];

export function iconoDeCategoria(nombre: string | undefined | null): LucideIcon {
  if (!nombre) return Package;
  for (const [patron, icono] of POR_PALABRA) {
    if (patron.test(nombre)) return icono;
  }
  return Package;
}
