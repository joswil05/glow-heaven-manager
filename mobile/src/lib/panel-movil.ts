import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirestoreDb } from '@firebase-client';
import type { PanelData } from '@shared/types';
import { PanelRepoFirestore } from '@repos/panel.repo';
import { hoyISO } from './util';
import { haceDias } from '@core/fechas';

export interface DiaVentas {
  fecha: string;
  total_usd_cents: number;
  ganancia_usd_cents: number;
  cantidad: number;
}

export interface ResumenHoy {
  total_usd_cents: number;
  ganancia_usd_cents: number;
  ventas_count: number;
}

/**
 * Agrupa por fecha las ventas de los últimos `dias` días.
 *
 * Las ventas NO se vuelven a consultar: se piden a la instantánea que el
 * panel ya cargó. Antes esta función hacía su propia lectura de la colección
 * entera y filtraba por fecha en memoria, así que abrir el panel del celular
 * costaba dos veces todas las ventas del negocio, y esa cuenta crece para
 * siempre.
 */
export async function cargarTendenciaDiaria(dias = 7): Promise<{
  serie: DiaVentas[];
  hoy: ResumenHoy;
}> {
  const ventas = await PanelRepoFirestore.ventasActivas();
  const desde = haceDias(dias - 1);

  const porDia = new Map<string, DiaVentas>();
  const hoy = hoyISO();
  const resumenHoy: ResumenHoy = { total_usd_cents: 0, ganancia_usd_cents: 0, ventas_count: 0 };

  for (const v of ventas) {
    // Sólo lo entregado, con el mismo criterio que "Ganancia de este mes" en
    // la computadora. Antes contaba también cotizaciones y ventas sin
    // entregar, y la suma de los días del celular no daba lo del mes.
    if (v.estado !== 'ENTREGADA') continue;
    const fecha = (v.fecha || '').slice(0, 10);
    if (!fecha || fecha < desde) continue;

    const acc = porDia.get(fecha) ?? { fecha, total_usd_cents: 0, ganancia_usd_cents: 0, cantidad: 0 };
    acc.total_usd_cents += v.total_usd_cents || 0;
    acc.ganancia_usd_cents += v.ganancia_usd_cents || 0;
    acc.cantidad += 1;
    porDia.set(fecha, acc);

    if (fecha === hoy) {
      resumenHoy.total_usd_cents += v.total_usd_cents || 0;
      resumenHoy.ganancia_usd_cents += v.ganancia_usd_cents || 0;
      resumenHoy.ventas_count += 1;
    }
  }

  const serie: DiaVentas[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const clave = haceDias(i);
    serie.push(porDia.get(clave) ?? { fecha: clave, total_usd_cents: 0, ganancia_usd_cents: 0, cantidad: 0 });
  }

  return { serie, hoy: resumenHoy };
}

export interface EncargoPendiente {
  id: number;
  codigo: string;
  cliente_nombre: string;
  cliente_telefono?: string;
  saldo_usd_cents: number;
  fecha: string;
}

/**
 * Encargos que todavía no se entregan (cotizados o ya con anticipo).
 *
 * NO se llama desde el panel. Se llamaba en cada carga del inicio —dos
 * consultas de colección completa, `ventas` filtradas por ENCARGO y TODAS las
 * clientas activas— y el resultado no se mostraba en ninguna pantalla: se
 * guardaba en un estado que nadie renderizaba. Queda disponible para cuando se
 * construya el widget que lo muestre; mientras tanto no se paga esa lectura.
 */
export async function cargarEncargosPendientes(): Promise<EncargoPendiente[]> {
  const db = getFirestoreDb();
  // Las ventas salen de la instantánea del panel; sólo los clientes se leen
  // acá, y esa colección es chica.
  const ventas = await PanelRepoFirestore.ventasActivas();

  const clientesSnap = await getDocs(query(collection(db, 'clientes'), where('activo', '==', true)));
  const clientes = new Map(
    clientesSnap.docs.map((d) => {
      const c = d.data() as { id: number; nombre: string; telefono?: string };
      return [c.id, c];
    })
  );

  return ventas
    .filter((v) => v.tipo === 'ENCARGO')
    .filter((v) => v.estado === 'COTIZADA' || v.estado === 'PENDIENTE')
    .map((v) => {
      const cliente = v.cliente_id ? clientes.get(v.cliente_id) : undefined;
      return {
        id: v.id,
        codigo: v.codigo,
        cliente_nombre: cliente?.nombre ?? 'Mostrador',
        cliente_telefono: cliente?.telefono,
        saldo_usd_cents: v.saldo_usd_cents || 0,
        fecha: v.fecha,
      };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export interface CacheDashboardData {
  panel: PanelData | null;
  serie: DiaVentas[];
  hoy: ResumenHoy;
  encargos: EncargoPendiente[];
  tiempo: number;
}

export const cacheDashboardGlobal: CacheDashboardData = {
  panel: null,
  serie: [],
  hoy: { total_usd_cents: 0, ganancia_usd_cents: 0, ventas_count: 0 },
  encargos: [],
  tiempo: 0,
};

export async function obtenerDatosDashboard(forzar = false): Promise<CacheDashboardData> {
  const ahora = Date.now();
  if (!forzar && cacheDashboardGlobal.panel && ahora - cacheDashboardGlobal.tiempo < 45000) {
    return cacheDashboardGlobal;
  }
  // En serie a propósito: `cargarTendenciaDiaria` reutiliza la instantánea
  // que deja `cargar()`. En paralelo las dos fallarían el caché y volveríamos
  // a pagar la colección de ventas dos veces.
  const panelData = await PanelRepoFirestore.cargar();
  const tendencia = await cargarTendenciaDiaria(7);
  cacheDashboardGlobal.panel = panelData;
  cacheDashboardGlobal.serie = tendencia.serie;
  cacheDashboardGlobal.hoy = tendencia.hoy;
  cacheDashboardGlobal.tiempo = Date.now();
  return cacheDashboardGlobal;
}

export function invalidarCacheDashboard() {
  cacheDashboardGlobal.tiempo = 0;
  // El repositorio del panel tiene su propia instantánea de 20 segundos. Sin
  // limpiarla también, después de una venta el panel se volvía a armar con
  // los datos de antes y la venta recién hecha no aparecía.
  PanelRepoFirestore.invalidarCache();
}

