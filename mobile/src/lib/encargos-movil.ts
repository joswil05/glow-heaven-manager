import { VentasRepoFirestore } from '@repos/ventas.repo';
import type { Venta } from '@shared/types';
import type { EtapaEncargo } from '@core/encargos';

export const NOMBRES_ETAPA_ENCARGO: Record<EtapaEncargo, string> = {
  POR_BUSCAR: 'Por buscar',
  POR_MANDAR: 'Por mandar',
  ESPERANDO: 'Esperando respuesta',
  POR_COMPRAR: 'Por comprar',
  EN_CAMINO: 'En camino',
  POR_ENTREGAR: 'Por entregar',
  ENTREGADO: 'Entregado',
  ANULADO: 'Anulado',
};

/** La lista se consulta al abrirla: un pendiente viejo sigue siendo pendiente. */
export async function cargarEncargosEnCurso(): Promise<Venta[]> {
  const grupos = await Promise.all([
    VentasRepoFirestore.listar({ tipo: 'ENCARGO', estado: 'COTIZADA' }),
    VentasRepoFirestore.listar({ tipo: 'ENCARGO', estado: 'PENDIENTE' }),
  ]);
  return grupos.flat().sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id);
}
