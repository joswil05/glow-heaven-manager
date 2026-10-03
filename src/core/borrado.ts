/**
 * "Fue un error": cuándo una venta o un abono se puede borrar sin dejar rastro.
 *
 * Anular y borrar no son lo mismo. Anular es para lo que pasó y se deshizo en
 * la vida real (una devolución, un reembolso, una pieza que no se consiguió):
 * queda en el historial, marcado. Borrar es para lo que nunca pasó (un
 * dedazo, una venta cargada a la clienta equivocada, un duplicado): no deja
 * nada, ni la venta, ni sus abonos, ni sus movimientos de inventario, ni sus
 * eventos. Lo pidió Joswill el 30/9/2026: "si fue un dato mal ingresado o
 * erróneo por confusión me parece desordenado que se quede ahí guardada".
 *
 * Como borrar no deja cómo revisarlo después, tiene límites. El PIN lo exige
 * el repositorio; las reglas de tiempo y de dinero están acá:
 *
 *   - Sólo lo cargado hace una semana o menos: un error se nota pronto, y lo
 *     viejo ya puede estar en una factura o en lo que ella le dijo a alguien.
 *   - La fecha del documento tampoco puede tener más de una semana. El
 *     cambio de mes no acorta el plazo: se recalcula el período afectado.
 *   - Una venta con un abono de otro día no: esa plata entró de verdad.
 *   - Un encargo con una pieza comprada no: eso costó plata, y anular es lo
 *     que pregunta qué pasa con ella.
 *
 * Diseño completo: docs/PLAN_EQUIVOCACIONES_Y_FORMATOS.md, sección 3.
 */
import { estadoPieza, type EstadoPieza } from './encargos';
import { diasEntre, hoyISO } from './fechas';

/** Cuántos días después de cargarla una venta o un abono se puede borrar. */
export const DIAS_PARA_BORRAR = 7;

/** Lo que mira la regla de una venta: lo mínimo, para probarla sin Firestore. */
export interface VentaParaBorrar {
  codigo: string;
  tipo: string;
  fecha: string;
  creado_en?: string;
  lineas?: readonly {
    descripcion?: string;
    producto_id?: number;
    compra_id?: number;
    comprado_el?: string;
    llego_el?: string;
    descartada_el?: string;
  }[];
}

/** Lo que mira la regla de un abono. */
export interface AbonoParaBorrar {
  fecha: string;
  activo?: boolean;
  creado_en?: string;
}

const COMPRADAS: readonly EstadoPieza[] = ['COMPRADA', 'EN_CAMINO', 'LLEGO'];

function fechaCorta(iso: string): string {
  const [anio, mes, dia] = iso.slice(0, 10).split('-');
  return `${Number(dia)}/${Number(mes)}/${anio}`;
}

/** El día (en Managua) en que se cargó algo; lo viejo sin hora usa su fecha. */
function diaDeCarga(creado_en: string | undefined, fecha: string): string {
  return creado_en ? hoyISO(new Date(creado_en)) : fecha;
}

/** Ventana de siete días de carga y documento, aunque cambie el mes. */
function porTiempo(que: string, cargado: string, fecha: string, hoy: string, anular: string): string | null {
  if (diasEntre(cargado, hoy) > DIAS_PARA_BORRAR) {
    return `${que} se cargó hace más de ${DIAS_PARA_BORRAR} días. Si no pasó, ${anular}.`;
  }
  if (diasEntre(fecha, hoy) > DIAS_PARA_BORRAR) {
    return `${que} tiene fecha de hace más de ${DIAS_PARA_BORRAR} días. Si no pasó, ${anular}.`;
  }
  return null;
}

/**
 * Por qué esta venta no se puede borrar, en una frase que dice qué hacer en
 * su lugar; o null si se puede. `pagos` son todos los de la venta.
 */
export function porQueNoSeBorraVenta(
  venta: VentaParaBorrar,
  pagos: readonly AbonoParaBorrar[],
  ahora: Date = new Date()
): string | null {
  const hoy = hoyISO(ahora);
  const anular = venta.tipo === 'ENCARGO' ? 'anulalo' : 'anulala';
  const tiempo = porTiempo(venta.codigo, diaDeCarga(venta.creado_en, venta.fecha), venta.fecha, hoy, anular);
  if (tiempo) return tiempo;

  const deOtroDia = pagos.find((p) => p.activo !== false && p.fecha !== venta.fecha);
  if (deOtroDia) {
    return (
      `${venta.codigo} tiene un abono del ${fechaCorta(deOtroDia.fecha)}: esa plata entró de verdad. ` +
      `Si ese abono también fue un error, borralo primero; si no, ${anular}.`
    );
  }

  if (venta.tipo === 'ENCARGO') {
    const comprada = (venta.lineas ?? []).find((l) => COMPRADAS.includes(estadoPieza(l)));
    if (comprada) {
      return `'${comprada.descripcion ?? 'Una pieza'}' ya se compró y eso costó plata. Anulá el encargo, que pregunta qué pasa con la pieza.`;
    }
  }

  return null;
}

/** Por qué este abono no se puede borrar; o null si se puede. */
export function porQueNoSeBorraAbono(abono: AbonoParaBorrar, ahora: Date = new Date()): string | null {
  return porTiempo('Este abono', diaDeCarga(abono.creado_en, abono.fecha), abono.fecha, hoyISO(ahora), 'anulalo');
}
