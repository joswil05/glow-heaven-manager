import { useEffect, useState } from 'react';
import { ChevronRight, ClipboardList, History, LayoutGrid, Package, Settings, BarChart3 } from 'lucide-react';
import { obtenerDatosDashboard, cacheDashboardGlobal } from '../lib/panel-movil';
import { textoEncargosDeInicio } from '../lib/inicio';
import { useDatosNegocio } from '../context/DataContext';
import { haptics } from '../lib/haptics';

/** Lo que se abre desde "Más" (NAV-1). */
export type DestinoMas = 'historial' | 'encargos' | 'paquetes' | 'reportes' | 'ajustes';

/**
 * "Más" (NAV-1): lo que no entra en la barra de abajo, con un lugar fijo.
 * Antes Encargos se encontraba por una tarjeta de Inicio y Ajustes por un
 * engranaje. Las mismas tarjetas y filas de siempre.
 */
export function MasView({
  onAbrir,
  disponibles,
  encargosPorHacer = 0,
  sinSubir = 0,
}: {
  onAbrir: (destino: DestinoMas) => void;
  /** Las secciones que ya existen en esta versión. */
  disponibles: readonly DestinoMas[];
  /** Encargos por mandar o por entregar: la misma insignia de la barra (NAV-3). */
  encargosPorHacer?: number;
  /** Lo hecho sin señal que todavía no subió: se ve en Ventas. */
  sinSubir?: number;
}) {
  const { version } = useDatosNegocio();
  const [datos, setDatos] = useState(() => ({ ...cacheDashboardGlobal }));

  useEffect(() => {
    let vivo = true;
    obtenerDatosDashboard(false)
      .then((d) => {
        if (vivo) setDatos({ ...d });
      })
      .catch(() => {
        // Sin datos, las filas se ven sin su línea de detalle.
      });
    return () => {
      vivo = false;
    };
  }, [version]);

  const enVenta = (datos.panel?.paquetes ?? []).filter((p) => p.estado === 'EN_VENTA').length;
  const filas: { destino: DestinoMas; titulo: string; detalle: string; Icono: typeof History; insignia?: number }[] = [
    {
      destino: 'historial',
      titulo: 'Ventas',
      detalle: sinSubir > 0 ? `${sinSubir} sin subir todavía` : 'Lo vendido y los abonos, por día',
      Icono: History,
      insignia: sinSubir,
    },
    {
      destino: 'encargos',
      titulo: 'Encargos',
      detalle: textoEncargosDeInicio(datos.fasesEncargo),
      Icono: ClipboardList,
      insignia: encargosPorHacer,
    },
    {
      destino: 'paquetes',
      titulo: 'Paquetes',
      detalle: enVenta === 0 ? 'Ninguno en venta' : `${enVenta} en venta`,
      Icono: Package,
    },
    { destino: 'reportes', titulo: 'Reportes', detalle: 'Ventas, ganancia y lo más vendido', Icono: BarChart3 },
    { destino: 'ajustes', titulo: 'Ajustes', detalle: 'Tu negocio, cobros, mensajes y este teléfono', Icono: Settings },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-fondo text-texto transition-colors">
      <header className="shrink-0 z-20 bg-superficie/95 backdrop-blur-md border-b border-borde pt-safe-t px-4 pb-2 shadow-m3-1 transition-colors">
        <div className="flex items-center gap-2.5 py-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-superficie-2 text-texto-2 border border-borde">
            <LayoutGrid size={18} />
          </span>
          <div className="min-w-0">
            <span className="text-caption font-bold tracking-widest uppercase text-texto-3 block leading-none mb-0.5">
              Glow Heaven
            </span>
            <h1 className="text-title font-extrabold text-texto leading-tight truncate">Más</h1>
          </div>
        </div>
      </header>

      <main className="flex flex-col flex-1 min-h-0 overflow-y-auto px-3.5 pt-3 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="m3-card px-3.5 py-1">
          <div className="flex flex-col divide-y divide-borde">
            {filas
              .filter((f) => disponibles.includes(f.destino))
              .map(({ destino, titulo, detalle, Icono, insignia }) => (
                <button
                  key={destino}
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    onAbrir(destino);
                  }}
                  className="tocable flex w-full items-center gap-3 py-3 text-left cursor-pointer"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-superficie-2 text-texto-2">
                    <Icono size={17} aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-body font-bold leading-tight text-texto">{titulo}</span>
                    <span className="truncate text-caption font-medium text-texto-3">{detalle}</span>
                  </span>
                  {insignia ? (
                    <span
                      className="flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-acento px-1.5 text-[11px] font-black tabular-nums text-acento-texto"
                      aria-label={`${insignia} por hacer`}
                    >
                      {insignia}
                    </span>
                  ) : null}
                  <ChevronRight size={18} className="shrink-0 text-texto-3" aria-hidden="true" />
                </button>
              ))}
          </div>
        </div>
      </main>
    </div>
  );
}
