import { parsearACentavos, parsearDecimal } from '@core/numeros';
import { formatearMoneda } from '@core/moneda';
import { cambiarModo, type ErroresPieza, type TextosPieza } from '../../lib/paquete-movil';
import { haptics } from '../../lib/haptics';
import { campo, casilla } from './clases';

interface Props {
  /** Prefijo de los ids de las ayudas: cada hoja tiene el suyo. */
  id: string;
  textos: TextosPieza;
  onCambiar: (t: TextosPieza) => void;
  errores: ErroresPieza;
  onCorregido: (campo: keyof ErroresPieza) => void;
  deshabilitado: boolean;
  /** "Vino en pack" sólo para la bodega, como en la PC. */
  permitirPack: boolean;
  /** Corrigiendo un paquete que ya entró: la cantidad no se toca. */
  cantidadFija?: boolean;
  /** Las cantidades van en las tallas de un producto nuevo, no acá. */
  sinCantidades?: boolean;
  taxBp: number;
}

/**
 * Cómo vino una pieza y cuánto costó: lo que la PC pide en cada fila del
 * paquete (unidades o packs, precio, si pagó impuesto y el peso), apilado
 * para el teléfono. Lo frecuente arriba y a la vista; el peso, opcional.
 */
export function CamposPieza({
  id, textos: t, onCambiar, errores, onCorregido, deshabilitado, permitirPack, cantidadFija = false, sinCantidades = false, taxBp,
}: Props) {
  const varias = t.filas.length > 1;
  const cambiar = (parcial: Partial<TextosPieza>, corregido?: keyof ErroresPieza) => {
    onCambiar({ ...t, ...parcial });
    if (corregido) onCorregido(corregido);
  };
  const cambiarFila = (i: number, texto: string) =>
    cambiar({ filas: t.filas.map((f, j) => (j === i ? { ...f, texto } : f)) }, 'cantidad');

  // Sólo para mostrar el total de lo escrito; la cuenta de verdad es la del núcleo.
  const porPack = t.enPack ? parsearDecimal(t.unidadesPorPack, { min: 1 }) : 1;
  const cantidad = t.filas.reduce((s, f) => s + (parsearDecimal(f.texto, { min: 0 }) ?? 0), 0);
  const precio = parsearACentavos(t.precio, { min: 0 });
  const unidades = porPack !== null && Number.isInteger(porPack) ? cantidad * porPack : null;
  const total = precio !== null && Number.isInteger(cantidad) ? precio * cantidad : null;
  const nombreCantidad = t.enPack ? 'Packs' : 'Cantidad';
  const ayuda = (nombre: keyof ErroresPieza, texto: string) => (
    <p id={`${id}-${nombre}-ayuda`} className={`mt-1 text-sm ${errores[nombre] ? 'text-peligro-fuerte' : 'text-texto-2'}`}>
      {errores[nombre] ?? texto}
    </p>
  );

  return <div className="space-y-4">
    {permitirPack && !cantidadFija && <div>
      <p id={`${id}-como`} className="text-sm font-semibold text-texto">Cómo vino</p>
      <div role="radiogroup" aria-labelledby={`${id}-como`} className="mt-1 grid grid-cols-2 gap-1 rounded-xl bg-superficie-2 p-1">
        {([[false, 'Por unidad'], [true, 'En pack']] as const).map(([enPack, etiqueta]) =>
          <button key={etiqueta} type="button" role="radio" aria-checked={t.enPack === enPack} disabled={deshabilitado}
            onClick={() => { haptics.selection(); onCambiar(cambiarModo(t, enPack)); onCorregido('cantidad'); onCorregido('precio'); }}
            className={`min-h-11 rounded-lg text-base font-semibold ${t.enPack === enPack ? 'bg-superficie text-texto shadow-sm' : 'text-texto-2'}`}>
            {etiqueta}
          </button>)}
      </div>
    </div>}

    {!sinCantidades && (varias
      ? <fieldset>
          <legend className="text-sm font-semibold text-texto">{t.enPack ? 'Packs por talla o tono' : 'Cantidad por talla o tono'}</legend>
          <p className="text-sm text-texto-2">Dejá vacía la talla que no vino.</p>
          <div className="mt-2 space-y-2">{t.filas.map((f, i) =>
            <label key={`${f.variante_id ?? i}`} className="flex items-center gap-3 text-base text-texto">
              <span className="min-w-0 flex-1 truncate">{f.nombre}</span>
              <input aria-label={`${nombreCantidad} de ${f.nombre}`} inputMode="numeric" className={`${campo} mt-0 w-24 text-right`}
                value={f.texto} disabled={deshabilitado || cantidadFija} placeholder="0"
                aria-invalid={errores.fila === i && Boolean(errores.cantidad)}
                aria-describedby={`${id}-cantidad-ayuda`} onChange={(e) => cambiarFila(i, e.target.value)} />
            </label>)}
          </div>
          {ayuda('cantidad', '')}
        </fieldset>
      : <div>
          <label className="block text-sm font-semibold text-texto">{nombreCantidad}
            <input aria-label={nombreCantidad} inputMode="numeric" className={campo} value={t.filas[0]?.texto ?? ''}
              disabled={deshabilitado || cantidadFija} aria-invalid={Boolean(errores.cantidad)}
              aria-describedby={`${id}-cantidad-ayuda`} onChange={(e) => cambiarFila(0, e.target.value)} />
          </label>
          {ayuda('cantidad', cantidadFija ? 'Ya entró al inventario: la cantidad no se corrige.' : '')}
        </div>)}

    {t.enPack && <div>
      <label className="block text-sm font-semibold text-texto">Unidades por pack
        <input aria-label="Unidades por pack" inputMode="numeric" className={campo} value={t.unidadesPorPack}
          disabled={deshabilitado || cantidadFija} aria-invalid={Boolean(errores.unidadesPorPack)}
          aria-describedby={`${id}-unidadesPorPack-ayuda`} onChange={(e) => cambiar({ unidadesPorPack: e.target.value }, 'unidadesPorPack')} />
      </label>
      {ayuda('unidadesPorPack', !sinCantidades && unidades !== null && unidades > 0 ? `Entran ${unidades} ${unidades === 1 ? 'unidad' : 'unidades'}.` : '')}
    </div>}

    <div>
      <label className="block text-sm font-semibold text-texto">{t.enPack ? 'Pagó por pack ($)' : 'Pagó por unidad ($)'}
        <input aria-label={t.enPack ? 'Pagó por pack ($)' : 'Pagó por unidad ($)'} inputMode="decimal" className={campo}
          value={t.precio} disabled={deshabilitado} placeholder="0.00" aria-invalid={Boolean(errores.precio)}
          aria-describedby={`${id}-precio-ayuda`} onChange={(e) => cambiar({ precio: e.target.value }, 'precio')} />
      </label>
      {ayuda('precio', !sinCantidades && total !== null && cantidad > 1 ? `En la tienda: ${formatearMoneda(total, 'USD')} en total, sin impuesto.` : 'Lo que costó en la tienda, sin impuesto.')}
    </div>

    <label className="flex min-h-11 items-start gap-3 rounded-xl border border-borde bg-superficie-2 p-3">
      <input type="checkbox" className={`${casilla} mt-0.5`} checked={t.pagoImpuesto} disabled={deshabilitado}
        onChange={(e) => cambiar({ pagoImpuesto: e.target.checked })} />
      <span className="text-base text-texto">La tienda cobró el impuesto ({taxBp / 100}%)
        <span className="block text-sm text-texto-2">Desmarcalo si no lo cobró.</span>
      </span>
    </label>

    <div>
      <label className="block text-sm font-semibold text-texto">Peso (lb) <span className="font-normal text-texto-2">(opcional)</span>
        <input aria-label="Peso (lb)" inputMode="decimal" className={campo} value={t.peso} disabled={deshabilitado}
          aria-invalid={Boolean(errores.peso)} aria-describedby={`${id}-peso-ayuda`}
          onChange={(e) => cambiar({ peso: e.target.value }, 'peso')} />
      </label>
      {ayuda('peso', varias || sinCantidades
        ? 'El de todas juntas. Vacío, sale del peso de la caja.'
        : 'El de todas estas unidades juntas. Vacío, sale del peso de la caja.')}
    </div>
  </div>;
}
