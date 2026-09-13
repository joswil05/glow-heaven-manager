import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirestoreDb } from '@firebase-client';
import type { Venta, PanelData } from '@shared/types';
import { PanelRepoFirestore } from '@repos/panel.repo';
import { hoyISO } from './util';

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
 * Trae las ventas activas de los últimos `dias` días en una sola lectura y
 * las agrupa por fecha. `PanelRepoFirestore` ya agrega por mes para el
 * historial largo; el panel móvil necesita el detalle diario de la semana,
 * que no vale la pena sumar al panel de escritorio.
 */
export async function cargarTendenciaDiaria(dias = 7): Promise<{
  serie: DiaVentas[];
  hoy: ResumenHoy;
}> {
  const db = getFirestoreDb();
  const corte = new Date();
  corte.setDate(corte.getDate() - (dias - 1));
  const desde = corte.toISOString().slice(0, 10);

  const snap = await getDocs(
    query(collection(db, 'ventas'), where('activo', '==', true))
  );

  const porDia = new Map<string, DiaVentas>();
  const hoy = hoyISO();
  const resumenHoy: ResumenHoy = { total_usd_cents: 0, ganancia_usd_cents: 0, ventas_count: 0 };

  for (const d of snap.docs) {
    const v = d.data() as Venta;
    if (v.estado === 'CANCELADA') continue;
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
  const cursor = new Date();
  for (let i = dias - 1; i >= 0; i--) {
    const f = new Date(cursor);
    f.setDate(cursor.getDate() - i);
    const clave = f.toISOString().slice(0, 10);
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
  const snap = await getDocs(
    query(collection(db, 'ventas'), where('activo', '==', true), where('tipo', '==', 'ENCARGO'))
  );

  const clientesSnap = await getDocs(query(collection(db, 'clientes'), where('activo', '==', true)));
  const clientes = new Map(
    clientesSnap.docs.map((d) => {
      const c = d.data() as { id: number; nombre: string; telefono?: string };
      return [c.id, c];
    })
  );

  return snap.docs
    .map((d) => d.data() as Venta)
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
  const [panelData, tendencia] = await Promise.all([
    PanelRepoFirestore.cargar(),
    cargarTendenciaDiaria(7),
  ]);
  cacheDashboardGlobal.panel = panelData;
  cacheDashboardGlobal.serie = tendencia.serie;
  cacheDashboardGlobal.hoy = tendencia.hoy;
  cacheDashboardGlobal.tiempo = Date.now();
  return cacheDashboardGlobal;
}

export function invalidarCacheDashboard() {
  cacheDashboardGlobal.tiempo = 0;
}

