import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirestoreDb, leerVarios, aplicarLote } from '../client';
import { mesISO } from '../../../core/fechas';
import type { GananciaMes } from '../../../shared/types';
import type { VentaDoc } from './ventas.repo';

/**
 * El histórico mensual, sin leer la historia entera cada vez.
 *
 * El problema
 * -----------
 * El panel armaba la serie de ganancias recorriendo TODAS las ventas del
 * negocio. Medido: 200 ventas costaban 401 lecturas por apertura, y la cuenta
 * es lineal, así que a los tres años son miles de documentos leídos para
 * dibujar doce puntos en una gráfica. La mayor parte de eso son ventas
 * cerradas hace meses que nadie va a mirar.
 *
 * Por qué caché y no contadores
 * -----------------------------
 * Lo obvio sería llevar contadores que suban con cada venta. Es más barato
 * todavía, y es justo lo que NO conviene acá: un contador que se desvía no
 * avisa, y la campaña de pruebas de este proyecto ya encontró varias cuentas
 * llevadas así que se habían ido de los datos reales. Un número de ganancia
 * equivocado no se nota mirándolo.
 *
 * Acá un resumen es siempre el recálculo de las ventas de ese mes, guardado
 * para no repetirlo. Si algo se rompe, lo peor que pasa es que se recalcule
 * de más. Nunca queda un número inventado.
 *
 * La regla
 * --------
 *   · El mes en curso NO se cachea: cambia todo el tiempo y se calcula con
 *     las ventas recientes que el panel ya tiene a mano. Cuesta cero extra.
 *   · Los meses cerrados se calculan una vez y se guardan. Un mes cerrado
 *     sólo cambia si alguien anula una venta vieja, y ahí se borra su resumen
 *     para que se vuelva a calcular.
 */

const COLECCION = 'resumenes_mensuales';

interface ResumenMesDoc extends GananciaMes {
  calculado_en: string;
}

function mesVacio(mes: string): GananciaMes {
  return {
    mes,
    ventas_count: 0,
    ingresos_usd_cents: 0,
    costos_usd_cents: 0,
    ganancia_usd_cents: 0,
  };
}

/** El mes anterior a uno dado, sin pasar por `Date`. */
export function mesAnteriorA(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number);
  return numero === 1
    ? `${anio - 1}-12`
    : `${anio}-${String(numero - 1).padStart(2, '0')}`;
}

/** Suma las ventas entregadas de un conjunto, agrupadas por mes. */
export function agruparPorMes(ventas: VentaDoc[]): Map<string, GananciaMes> {
  const porMes = new Map<string, GananciaMes>();

  for (const v of ventas) {
    // Sólo lo entregado cuenta como ganancia realizada: una venta pendiente
    // todavía puede caerse.
    if (v.estado !== 'ENTREGADA') continue;
    const mes = (v.fecha || '').slice(0, 7);
    if (!mes) continue;

    const acumulado = porMes.get(mes) ?? mesVacio(mes);
    acumulado.ventas_count += 1;
    acumulado.ingresos_usd_cents += v.total_usd_cents || 0;
    acumulado.costos_usd_cents += v.costo_total_usd_cents || 0;
    acumulado.ganancia_usd_cents += v.ganancia_usd_cents || 0;
    porMes.set(mes, acumulado);
  }

  return porMes;
}

export class ResumenesRepoFirestore {
  /**
   * La serie de los últimos `meses`, del más viejo al más nuevo.
   *
   * `ventasRecientes` son las que el panel ya trajo (los últimos noventa
   * días): de ahí salen el mes en curso y los últimos cerrados sin costar una
   * lectura extra. Los meses anteriores salen del caché, y el que falte se
   * calcula leyendo sólo ese mes.
   */
  static async historico(meses: number, ventasRecientes: VentaDoc[]): Promise<GananciaMes[]> {
    const desdeRecientes = agruparPorMes(ventasRecientes);

    // Los meses que hay que devolver, del más nuevo al más viejo.
    const claves: string[] = [];
    let clave = mesISO();
    for (let i = 0; i < meses; i++) {
      claves.push(clave);
      clave = mesAnteriorA(clave);
    }

    const mesEnCurso = claves[0];
    const cerradosFaltantes = claves.filter(
      (m) => m !== mesEnCurso && !desdeRecientes.has(m)
    );

    const cacheados = await leerVarios<ResumenMesDoc>(COLECCION, cerradosFaltantes);

    const porCalcular = cerradosFaltantes.filter((m) => !cacheados.has(m));
    const calculados = new Map<string, GananciaMes>();
    for (const mes of porCalcular) {
      calculados.set(mes, await this.calcularMes(mes));
    }

    if (calculados.size > 0) {
      await this.guardar([...calculados.values()]);
    }

    return claves
      .map((mes) => {
        if (mes === mesEnCurso || desdeRecientes.has(mes)) {
          return desdeRecientes.get(mes) ?? mesVacio(mes);
        }
        const doc = cacheados.get(mes);
        if (doc) {
          const { calculado_en: _c, ...resumen } = doc;
          return resumen;
        }
        return calculados.get(mes) ?? mesVacio(mes);
      })
      .reverse();
  }

  /** Recalcula un mes leyendo SÓLO las ventas de ese mes. */
  static async calcularMes(mes: string): Promise<GananciaMes> {
    const db = getFirestoreDb();
    const desde = `${mes}-01`;
    const hasta = `${mes}-31`;

    const snap = await getDocs(
      query(
        collection(db, 'ventas'),
        where('activo', '==', true),
        where('fecha', '>=', desde),
        where('fecha', '<=', hasta)
      )
    );

    const ventas = snap.docs.map((d) => d.data() as VentaDoc);
    return agruparPorMes(ventas).get(mes) ?? mesVacio(mes);
  }

  static async guardar(resumenes: GananciaMes[]): Promise<void> {
    if (resumenes.length === 0) return;
    const ahora = new Date().toISOString();

    await aplicarLote(
      resumenes.map((r) => ({
        coleccion: COLECCION,
        id: r.mes,
        merge: false,
        datos: { ...r, calculado_en: ahora },
      }))
    );
  }

  /**
   * Borra el resumen del mes de una fecha dada.
   *
   * Se llama cuando algo toca una venta: si era de un mes cerrado, su resumen
   * dejó de ser cierto. Borrarlo es más seguro que recalcularlo en el momento
   * —la próxima lectura lo rehace— y cuesta una sola escritura.
   *
   * Del mes en curso no hay nada que borrar: no se cachea.
   */
  static async invalidarPorFecha(fecha: string | undefined | null): Promise<void> {
    const mes = (fecha || '').slice(0, 7);
    if (!mes || mes === mesISO()) return;

    try {
      await aplicarLote([{ coleccion: COLECCION, id: mes, borrar: true }]);
    } catch (err) {
      // Un resumen que no se pudo borrar queda viejo, no roto: se prefiere
      // eso a tumbar la operación de negocio que lo disparó.
      console.warn(`[resumenes.repo] No se pudo invalidar el resumen de ${mes}:`, err);
    }
  }
}
