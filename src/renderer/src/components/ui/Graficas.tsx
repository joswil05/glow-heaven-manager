import React, { useId, useState, useMemo } from 'react';
import {
  TrendingUp,
  Award,
  DollarSign,
  Percent,
  ShoppingBag,
  Package,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from 'recharts';
import { cn } from '../../lib/cn';
import { formatearMoneda } from '@core/moneda';

export interface PuntoSerie {
  etiqueta: string;
  valor: number;
  /** Segunda serie apilada detrás, para comparar ingreso contra ganancia. */
  valorSecundario?: number;
}

// ---------------------------------------------------------------------------
// 1. Gráfica de Barras Tradicional
// ---------------------------------------------------------------------------

export interface BarrasProps {
  datos: PuntoSerie[];
  formato?: (v: number) => string;
  alto?: number;
  etiquetaSerie?: string;
  etiquetaSerieSecundaria?: string;
  className?: string;
}

export const Barras: React.FC<BarrasProps> = ({
  datos,
  formato = (v) => formatearMoneda(v, 'USD'),
  alto = 160,
  etiquetaSerie = 'Ganancia',
  etiquetaSerieSecundaria = 'Ingresos',
  className,
}) => {
  const [activo, setActivo] = useState<number | null>(null);
  const tieneSecundaria = datos.some((d) => d.valorSecundario !== undefined);

  const maximo = Math.max(
    1,
    ...datos.map((d) => Math.max(d.valor, d.valorSecundario ?? 0))
  );

  return (
    <div className={cn('w-full', className)}>
      <div
        className="flex items-end gap-2"
        style={{ height: alto }}
        role="img"
        aria-label={`${etiquetaSerie} por mes: ${datos
          .map((d) => `${d.etiqueta} ${formato(d.valor)}`)
          .join(', ')}`}
      >
        {datos.map((d, i) => {
          const alturaPrincipal = Math.max(2, (d.valor / maximo) * (alto - 24));
          const alturaSecundaria = tieneSecundaria
            ? Math.max(2, ((d.valorSecundario ?? 0) / maximo) * (alto - 24))
            : 0;
          const esActivo = activo === i;

          return (
            <div
              key={d.etiqueta}
              className="flex-1 flex flex-col items-center justify-end h-full min-w-0"
              onMouseEnter={() => setActivo(i)}
              onMouseLeave={() => setActivo(null)}
            >
              <div className="relative w-full flex items-end justify-center h-full">
                {esActivo && (
                  <div className="absolute bottom-full mb-1 z-10 whitespace-nowrap rounded-lg bg-inverso px-2.5 py-1.5 text-caption text-white shadow-xl border border-white/10">
                    <div className="font-semibold text-emerald-300">{formato(d.valor)}</div>
                    {tieneSecundaria && (
                      <div className="text-inverso-texto-2 text-[11px]">
                        {etiquetaSerieSecundaria}: {formato(d.valorSecundario ?? 0)}
                      </div>
                    )}
                  </div>
                )}

                {tieneSecundaria && (
                  <div
                    className="absolute bottom-0 w-full rounded-t-md bg-borde/70"
                    style={{ height: alturaSecundaria }}
                  />
                )}
                <div
                  className={cn(
                    'relative w-full rounded-t-md transition-colors',
                    tieneSecundaria ? 'max-w-[60%]' : '',
                    esActivo ? 'bg-acento-fuerte' : 'bg-acento'
                  )}
                  style={{ height: alturaPrincipal }}
                />
              </div>
              <span className="mt-2 text-caption text-texto-3 truncate w-full text-center font-medium">
                {d.etiqueta}
              </span>
            </div>
          );
        })}
      </div>

      {tieneSecundaria && (
        <div className="mt-3 flex items-center gap-4 text-caption text-texto-3">
          <span className="inline-flex items-center gap-1.5 font-medium text-texto">
            <span className="w-2.5 h-2.5 rounded-sm bg-acento" />
            {etiquetaSerie}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-borde" />
            {etiquetaSerieSecundaria}
          </span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. Gráfica de Rentabilidad Neta (Recharts AreaChart Monotone)
// ---------------------------------------------------------------------------

export interface LineaCrecienteProps {
  datos: PuntoSerie[];
  formato?: (v: number) => string;
  alto?: number;
  etiquetaSerie?: string;
  etiquetaSerieSecundaria?: string;
  className?: string;
}

export type ModoGrafica = 'ambas' | 'ganancias' | 'ingresos';

export const LineaCreciente: React.FC<LineaCrecienteProps> = ({
  datos,
  formato = (v) => formatearMoneda(v, 'USD'),
  alto = 160,
  etiquetaSerie = 'Ganancia Neta',
  etiquetaSerieSecundaria = 'Ingresos Totales',
  className,
}) => {
  const [modo, setModo] = useState<ModoGrafica>('ambas');
  const gradId = useId();

  const tieneSecundaria = datos.some((d) => d.valorSecundario !== undefined);

  // Resumen estadístico
  const resumen = useMemo(() => {
    let mejorMes = datos[0] ?? { etiqueta: '-', valor: 0 };
    let sumaGanancia = 0;
    let mesesConVenta = 0;

    for (const d of datos) {
      sumaGanancia += Math.max(0, d.valor);
      if (d.valor > mejorMes.valor) mejorMes = d;
      if (d.valor > 0 || (d.valorSecundario ?? 0) > 0) mesesConVenta++;
    }

    const promedio = mesesConVenta > 0 ? Math.round(sumaGanancia / mesesConVenta) : 0;
    return { mejorMes, promedio, totalGanancia: sumaGanancia };
  }, [datos]);

  const mostrarPrincipal = modo === 'ambas' || modo === 'ganancias';
  const mostrarSecundaria = tieneSecundaria && (modo === 'ambas' || modo === 'ingresos');

  return (
    <div className={cn('w-full select-none flex flex-col', className)}>
      {/* Barra superior de métricas y selector */}
      <div className="flex items-center justify-between gap-3 pb-2 border-b border-borde/40 flex-wrap">
        <div className="flex items-center gap-3 text-caption text-texto-3">
          {resumen.mejorMes.valor > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>
                Récord: <strong className="text-texto font-medium">{resumen.mejorMes.etiqueta.toUpperCase()}</strong> ({formato(resumen.mejorMes.valor)})
              </span>
            </span>
          )}
          {resumen.promedio > 0 && (
            <span className="inline-flex items-center gap-1.5 hidden md:inline-flex">
              <TrendingUp className="w-3.5 h-3.5 text-texto-3" />
              <span>
                Promedio: <strong className="text-texto font-medium">{formato(resumen.promedio)}</strong>/mes
              </span>
            </span>
          )}
        </div>

        {tieneSecundaria && (
          <div className="inline-flex items-center p-0.5 bg-superficie-2 rounded-xl border border-borde/70 text-caption font-medium gap-0.5">
            <button
              type="button"
              onClick={() => setModo('ambas')}
              className={cn(
                'px-2.5 py-1 rounded-lg transition-all duration-150',
                modo === 'ambas'
                  ? 'bg-superficie text-texto font-semibold shadow-xs'
                  : 'text-texto-3 hover:text-texto'
              )}
            >
              Ambas
            </button>
            <button
              type="button"
              onClick={() => setModo('ganancias')}
              className={cn(
                'px-2.5 py-1 rounded-lg transition-all duration-150 flex items-center gap-1.5',
                modo === 'ganancias'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold shadow-xs border border-emerald-200/50 dark:border-emerald-800'
                  : 'text-texto-3 hover:text-texto'
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Ganancias
            </button>
            <button
              type="button"
              onClick={() => setModo('ingresos')}
              className={cn(
                'px-2.5 py-1 rounded-lg transition-all duration-150 flex items-center gap-1.5',
                modo === 'ingresos'
                  ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold shadow-xs border border-indigo-200/50 dark:border-indigo-800'
                  : 'text-texto-3 hover:text-texto'
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Ingresos
            </button>
          </div>
        )}
      </div>

      {/* Contenedor Recharts con altura fija */}
      <div className="w-full mt-2" style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={datos} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
            <defs>
              <linearGradient id={`area-grad-ganancia-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.22} />
                <stop offset="70%" stopColor="#10b981" stopOpacity={0.04} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id={`area-grad-ingreso-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.15} />
                <stop offset="85%" stopColor="#6366f1" stopOpacity={0.02} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-borde/40" />

            <XAxis
              dataKey="etiqueta"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--color-texto-3, #94a3b8)', fontWeight: 500 }}
              dy={6}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: 'var(--color-texto-3, #94a3b8)', fontWeight: 500 }}
              tickFormatter={(v) => formato(v)}
              width={54}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0]?.payload as PuntoSerie;
                const valorGanancia = d.valor ?? 0;
                const valorIngreso = d.valorSecundario ?? 0;
                const margen = valorIngreso > 0 ? Math.round((valorGanancia / valorIngreso) * 100) : null;

                return (
                  <div className="rounded-xl border border-borde/80 bg-superficie/95 dark:bg-[#121826]/95 backdrop-blur-md px-3.5 py-2.5 text-caption shadow-xl min-w-[175px]">
                    <div className="font-bold text-texto uppercase tracking-wider text-xs border-b border-borde/50 pb-1 mb-1.5 flex items-center justify-between">
                      <span>{d.etiqueta}</span>
                      {margen !== null && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold">
                          {margen}% margen
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-texto-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          {etiquetaSerie}:
                        </span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular">
                          {formato(valorGanancia)}
                        </span>
                      </div>
                      {tieneSecundaria && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 text-texto-3">
                            <span className="w-2 h-2 rounded-full bg-indigo-500" />
                            {etiquetaSerieSecundaria}:
                          </span>
                          <span className="font-medium text-texto tabular">
                            {formato(valorIngreso)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            />

            {mostrarSecundaria && (
              <Area
                type="monotone"
                dataKey="valorSecundario"
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="4 4"
                fill={`url(#area-grad-ingreso-${gradId})`}
                activeDot={{ r: 4, fill: '#6366f1', stroke: '#ffffff', strokeWidth: 2 }}
                name={etiquetaSerieSecundaria}
              />
            )}

            {mostrarPrincipal && (
              <Area
                type="monotone"
                dataKey="valor"
                stroke="#059669"
                strokeWidth={2.5}
                fill={`url(#area-grad-ganancia-${gradId})`}
                activeDot={{ r: 5, fill: '#059669', stroke: '#ffffff', strokeWidth: 2 }}
                name={etiquetaSerie}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pie de leyenda */}
      <div className="mt-1.5 flex items-center justify-between text-caption text-texto-3 border-t border-borde/40 pt-2 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold text-texto text-[11px]">
            <span className="w-3 h-1.5 rounded-full bg-emerald-600 shadow-sm" />
            {etiquetaSerie}
          </span>
          {tieneSecundaria && (
            <span className="inline-flex items-center gap-1.5 font-medium text-texto-2 text-[11px]">
              <span className="w-3 h-1.5 rounded-full bg-indigo-500" />
              {etiquetaSerieSecundaria}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. Gráfica de Margen Porcentual (%) (Recharts BarChart con Meta 35%)
// ---------------------------------------------------------------------------

export interface PuntoMargen {
  etiqueta: string;
  margenPct: number;
  gananciaUsdCents: number;
  ingresosUsdCents: number;
}

export interface GraficaMargenProps {
  datos: PuntoMargen[];
  alto?: number;
  className?: string;
}

export const GraficaMargen: React.FC<GraficaMargenProps> = ({
  datos,
  alto = 160,
  className,
}) => {
  const mesesConVenta = datos.filter((d) => d.ingresosUsdCents > 0);
  const margenPromedio =
    mesesConVenta.length > 0
      ? Math.round(mesesConVenta.reduce((acc, d) => acc + d.margenPct, 0) / mesesConVenta.length)
      : 0;

  const mejorMes = [...datos].sort((a, b) => b.margenPct - a.margenPct)[0];

  return (
    <div className={cn('w-full select-none flex flex-col', className)}>
      {/* Píldoras de resumen superior */}
      <div className="flex items-center justify-between gap-2 mb-2 text-caption text-texto-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-500/10 text-purple-700 dark:text-purple-300 font-semibold border border-purple-500/20 text-[11px]">
            <Percent className="w-3 h-3 text-purple-600" />
            <span>Margen Promedio: {margenPromedio}%</span>
          </span>
          {mejorMes && mejorMes.margenPct > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-superficie-2 text-texto-2 font-medium border border-borde/70 text-[11px]">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>Más Rentable: {mejorMes.etiqueta.toUpperCase()} ({mejorMes.margenPct}%)</span>
            </span>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium text-[11px] border',
              margenPromedio >= 35
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25'
            )}
          >
            <span>{margenPromedio >= 35 ? 'Salud Financiera Óptima' : 'Margen Estable'}</span>
          </span>
        </div>
      </div>

      {/* Contenedor Recharts */}
      <div className="w-full mt-1" style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-borde/40" />

            <XAxis
              dataKey="etiqueta"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--color-texto-3, #94a3b8)', fontWeight: 500 }}
              dy={6}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: 'var(--color-texto-3, #94a3b8)', fontWeight: 500 }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, (dataMax: number) => Math.max(50, Math.ceil(dataMax / 10) * 10)]}
              width={38}
            />

            <ReferenceLine
              y={35}
              stroke="#10b981"
              strokeDasharray="3 3"
              strokeWidth={1.5}
              label={{
                value: 'Meta 35%',
                position: 'insideTopLeft',
                fill: '#10b981',
                fontSize: 10,
                fontWeight: 700,
              }}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0]?.payload as PuntoMargen;
                return (
                  <div className="rounded-xl border border-borde/80 bg-superficie/95 dark:bg-[#121826]/95 backdrop-blur-md px-3 py-2 text-caption shadow-xl min-w-[170px]">
                    <div className="flex items-center justify-between font-bold border-b border-borde/50 pb-1 mb-1">
                      <span className="uppercase text-[11px] tracking-wider text-purple-400">
                        {d.etiqueta}
                      </span>
                      <span className="text-emerald-500 font-mono font-bold text-sm">
                        {d.margenPct}% margen
                      </span>
                    </div>
                    <div className="text-[11px] space-y-1">
                      <div className="flex items-center justify-between text-texto-2">
                        <span>Ganancia neta:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatearMoneda(d.gananciaUsdCents, 'USD')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-texto-3">
                        <span>Facturación:</span>
                        <span className="font-mono text-texto">
                          {formatearMoneda(d.ingresosUsdCents, 'USD')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            <Bar dataKey="margenPct" radius={[4, 4, 0, 0]} maxBarSize={32}>
              {datos.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.margenPct >= 35 ? '#10b981' : '#8b5cf6'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie informativo */}
      <div className="mt-1 flex items-center justify-between text-[11px] text-texto-3 border-t border-borde/40 pt-1.5">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Verde: &ge; 35% margen saludable
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          Morado: &lt; 35% margen
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 4. Gráfica de Ingresos vs Costos de Mercancía (Recharts BarChart Doble)
// ---------------------------------------------------------------------------

export interface PuntoCostosIngresos {
  etiqueta: string;
  ingresosUsdCents: number;
  costosUsdCents: number;
  gananciaUsdCents: number;
}

export interface GraficaCostosIngresosProps {
  datos: PuntoCostosIngresos[];
  alto?: number;
  className?: string;
}

export const GraficaCostosIngresos: React.FC<GraficaCostosIngresosProps> = ({
  datos,
  alto = 160,
  className,
}) => {
  const totalIngresos = datos.reduce((acc, d) => acc + d.ingresosUsdCents, 0);
  const totalCostos = datos.reduce((acc, d) => acc + d.costosUsdCents, 0);
  const totalGanancia = datos.reduce((acc, d) => acc + d.gananciaUsdCents, 0);
  const roiPct = totalCostos > 0 ? Math.round((totalGanancia / totalCostos) * 100) : 0;

  return (
    <div className={cn('w-full select-none flex flex-col', className)}>
      {/* Píldoras de resumen superior */}
      <div className="flex items-center justify-between gap-2 mb-2 text-caption text-texto-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-500/20 text-[11px]">
            <DollarSign className="w-3 h-3 text-emerald-600" />
            <span>Facturación: {formatearMoneda(totalIngresos, 'USD')}</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-500/20 text-[11px]">
            <Layers className="w-3 h-3 text-indigo-600" />
            <span>Costo Mercancía: {formatearMoneda(totalCostos, 'USD')}</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-superficie-2 text-texto-2 font-medium border border-borde/70 text-[11px]">
            <span>Retorno ROI: +{roiPct}%</span>
          </span>
        </div>
      </div>

      {/* Contenedor Recharts */}
      <div className="w-full mt-1" style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 8, right: 12, left: 8, bottom: 4 }} barGap={3}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-borde/40" />

            <XAxis
              dataKey="etiqueta"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--color-texto-3, #94a3b8)', fontWeight: 500 }}
              dy={6}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: 'var(--color-texto-3, #94a3b8)', fontWeight: 500 }}
              tickFormatter={(v) => formatearMoneda(v, 'USD')}
              width={54}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0]?.payload as PuntoCostosIngresos;
                return (
                  <div className="rounded-xl border border-borde/80 bg-superficie/95 dark:bg-[#121826]/95 backdrop-blur-md px-3.5 py-2 text-caption shadow-xl min-w-[185px]">
                    <div className="flex items-center justify-between font-bold border-b border-borde/50 pb-1 mb-1.5">
                      <span className="uppercase text-[11px] tracking-wider text-emerald-500">
                        {d.etiqueta}
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                        +{formatearMoneda(d.gananciaUsdCents, 'USD')} ganancia
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center justify-between text-texto-2">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-xs bg-emerald-500" />
                          Facturación:
                        </span>
                        <span className="font-bold text-texto font-mono">
                          {formatearMoneda(d.ingresosUsdCents, 'USD')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-texto-3">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-xs bg-indigo-500" />
                          Costo mercancía:
                        </span>
                        <span className="font-medium text-texto-2 font-mono">
                          {formatearMoneda(d.costosUsdCents, 'USD')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            <Bar dataKey="costosUsdCents" name="Costo Mercancía" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="ingresosUsdCents" name="Facturación" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie de leyenda */}
      <div className="mt-1.5 flex items-center justify-between text-caption text-texto-3 border-t border-borde/40 pt-1.5 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold text-texto text-[11px]">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 shadow-xs" />
            Facturación Bruta (Ventas)
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-texto-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500 shadow-xs" />
            Costo Mercancía + Envíos
          </span>
        </div>
        <span className="text-[11px] text-texto-3">
          La diferencia entre ambas barras representa tu Ganancia Neta
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 5. Gráfica de Volumen de Pedidos (Recharts BarChart)
// ---------------------------------------------------------------------------

export interface PuntoVolumen {
  etiqueta: string;
  ordenes: number;
  ingresosUsdCents: number;
}

export interface GraficaVolumenProps {
  datos: PuntoVolumen[];
  alto?: number;
  className?: string;
}

export const GraficaVolumen: React.FC<GraficaVolumenProps> = ({
  datos,
  alto = 160,
  className,
}) => {
  const totalOrdenes = datos.reduce((acc, d) => acc + d.ordenes, 0);
  const totalIngresos = datos.reduce((acc, d) => acc + d.ingresosUsdCents, 0);
  const ticketPromedioGlobal = totalOrdenes > 0 ? Math.round(totalIngresos / totalOrdenes) : 0;
  const mesRecord = [...datos].sort((a, b) => b.ordenes - a.ordenes)[0];

  return (
    <div className={cn('w-full select-none flex flex-col', className)}>
      {/* Píldoras de resumen superior */}
      <div className="flex items-center justify-between gap-2 mb-2 text-caption text-texto-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {mesRecord && mesRecord.ordenes > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold border border-blue-500/20 text-[11px]">
              <Sparkles className="w-3 h-3 text-blue-600" />
              <span>Récord: {mesRecord.etiqueta.toUpperCase()} ({mesRecord.ordenes} pedidos)</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-superficie-2 text-texto-2 font-medium border border-borde/70 text-[11px]">
            <Package className="w-3 h-3 text-texto-3" />
            <span>Total: {totalOrdenes} pedidos</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-superficie-2 text-texto-2 font-medium border border-borde/70 text-[11px]">
            <span>Ticket Promedio: {formatearMoneda(ticketPromedioGlobal, 'USD')}</span>
          </span>
        </div>
      </div>

      {/* Contenedor Recharts */}
      <div className="w-full mt-1" style={{ height: alto }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datos} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-borde/40" />

            <XAxis
              dataKey="etiqueta"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: 'var(--color-texto-3, #94a3b8)', fontWeight: 500 }}
              dy={6}
            />

            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: 'var(--color-texto-3, #94a3b8)', fontWeight: 500 }}
              domain={[0, 'auto']}
              width={34}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const d = payload[0]?.payload as PuntoVolumen;
                const ticket = d.ordenes > 0 ? Math.round(d.ingresosUsdCents / d.ordenes) : 0;
                return (
                  <div className="rounded-xl border border-borde/80 bg-superficie/95 dark:bg-[#121826]/95 backdrop-blur-md px-3.5 py-2 text-caption shadow-xl min-w-[170px]">
                    <div className="flex items-center justify-between font-bold border-b border-borde/50 pb-1 mb-1.5">
                      <span className="uppercase text-[11px] tracking-wider text-blue-500">
                        {d.etiqueta}
                      </span>
                      <span className="text-texto font-mono">{d.ordenes} pedidos</span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center justify-between text-texto-2">
                        <span>Facturado:</span>
                        <span className="font-bold text-texto font-mono">
                          {formatearMoneda(d.ingresosUsdCents, 'USD')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-texto-3">
                        <span>Ticket promedio:</span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatearMoneda(ticket, 'USD')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />

            <Bar dataKey="ordenes" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie de leyenda */}
      <div className="mt-1.5 flex items-center justify-between text-caption text-texto-3 border-t border-borde/40 pt-1.5 flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold text-texto text-[11px]">
          <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 shadow-xs" />
          Órdenes completadas por mes
        </span>
        <span className="text-[11px] text-texto-3">
          Calculado con ventas y encargos entregados
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 6. Anillo de Distribución (Conservado intacto para Dónde está tu plata)
// ---------------------------------------------------------------------------

export interface AnilloProps {
  segmentos: { etiqueta: string; valor: number; color: string }[];
  centro?: React.ReactNode;
  subtitulo?: string;
  tamano?: number;
  className?: string;
}

export const Anillo: React.FC<AnilloProps> = ({
  segmentos,
  centro,
  subtitulo,
  tamano = 130,
  className,
}) => {
  const id = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const total = segmentos.reduce((a, s) => a + Math.max(0, s.valor), 0);
  const grosorBase = tamano < 130 ? 10 : 13;
  const radio = tamano / 2 - grosorBase;
  const circunferencia = 2 * Math.PI * radio;

  let acumulado = 0;

  return (
    <div className={cn('flex items-center gap-5', className)}>
      <div className="relative shrink-0 flex items-center justify-center">
        <svg
          width={tamano}
          height={tamano}
          viewBox={`0 0 ${tamano} ${tamano}`}
          role="img"
          aria-labelledby={`${id}-titulo`}
          className="shrink-0 -rotate-90 transition-all duration-300"
        >
          <title id={`${id}-titulo`}>
            {segmentos.map((s) => `${s.etiqueta}: ${formatearMoneda(s.valor, 'USD')}`).join('. ')}
          </title>

          <circle
            cx={tamano / 2}
            cy={tamano / 2}
            r={radio}
            fill="none"
            stroke="currentColor"
            strokeWidth={grosorBase}
            className="text-borde/50"
          />

          {total > 0 &&
            segmentos.map((s, idx) => {
              const valor = Math.max(0, s.valor);
              const largo = (valor / total) * circunferencia;
              const offset = -acumulado;
              acumulado += largo;
              if (valor === 0) return null;

              const esHover = hoverIndex === idx;

              return (
                <circle
                  key={s.etiqueta}
                  cx={tamano / 2}
                  cy={tamano / 2}
                  r={radio}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={esHover ? grosorBase + 3 : grosorBase}
                  strokeDasharray={`${largo} ${circunferencia - largo}`}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  className="animate-ring-segment transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                  style={{
                    '--ring-circumference': `${circunferencia}`,
                    '--ring-offset': `${offset}`,
                  } as React.CSSProperties}
                />
              );
            })}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2">
          {centro !== undefined && (
            <div className="text-metric-sm font-bold text-texto tabular tracking-tight leading-none">
              {centro}
            </div>
          )}
          {subtitulo && (
            <div className="text-[9px] uppercase font-bold text-texto-3 tracking-wider mt-1.5 px-2 py-0.5 rounded-full bg-superficie-2/80 border border-borde/50">
              {subtitulo}
            </div>
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-2.5">
        <ul className="space-y-2">
          {segmentos.map((s, idx) => {
            const pct = total > 0 ? Math.round((Math.max(0, s.valor) / total) * 100) : 0;
            const esHover = hoverIndex === idx;

            return (
              <li
                key={s.etiqueta}
                className={cn(
                  'p-2 rounded-xl border transition-all duration-150 cursor-pointer',
                  esHover
                    ? 'bg-superficie-2 border-borde-fuerte shadow-sm'
                    : 'bg-transparent border-transparent hover:bg-superficie-2/50'
                )}
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              >
                <div className="flex items-center justify-between gap-2 text-label">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-md shrink-0 shadow-sm"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="text-texto font-medium truncate">{s.etiqueta}</span>
                  </div>
                  <div className="flex items-baseline gap-1.5 shrink-0">
                    <span className="text-texto font-bold tabular">
                      {formatearMoneda(s.valor, 'USD')}
                    </span>
                    <span className="text-caption font-semibold text-texto-3 tabular">
                      ({pct}%)
                    </span>
                  </div>
                </div>

                <div className="mt-1.5 h-1.5 w-full rounded-full bg-borde/50 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%`, backgroundColor: s.color }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 7. Barra de Progreso Simple (Conservada intacta)
// ---------------------------------------------------------------------------

export interface BarraProgresoProps {
  actual: number;
  total: number;
  tono?: 'brand' | 'success' | 'warning' | 'danger';
  etiqueta?: string;
  mostrarPorcentaje?: boolean;
  className?: string;
}

export const BarraProgreso: React.FC<BarraProgresoProps> = ({
  actual,
  total,
  tono = 'brand',
  etiqueta,
  mostrarPorcentaje = false,
  className,
}) => {
  const pct = total > 0 ? Math.min(100, Math.max(0, (actual / total) * 100)) : 0;
  const colores = {
    brand: 'bg-acento shadow-sm shadow-acento/30',
    success: 'bg-emerald-500 shadow-sm shadow-emerald-500/30',
    warning: 'bg-amber-500 shadow-sm shadow-amber-500/30',
    danger: 'bg-rose-500 shadow-sm shadow-rose-500/30',
  };

  return (
    <div className={cn('w-full', className)}>
      <div
        className="h-2 w-full rounded-full bg-borde/70 overflow-hidden p-0.5"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={etiqueta}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out animate-bar-grow', colores[tono])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {mostrarPorcentaje && (
        <div className="mt-1 flex items-center justify-between text-[11px] text-texto-3 font-medium tabular">
          <span>{formatearMoneda(actual, 'USD')}</span>
          <span className="font-semibold text-texto-2">{Math.round(pct)}%</span>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 8. Top Productos Más Vendidos (Mantenido como export para compatibilidad)
// ---------------------------------------------------------------------------

export interface PuntoTopProducto {
  nombre: string;
  unidadesVendidas: number;
  gananciaUsdCents: number;
  existencias: number;
}

export interface GraficaTopProductosProps {
  productos: PuntoTopProducto[];
  className?: string;
}

export const GraficaTopProductos: React.FC<GraficaTopProductosProps> = ({
  productos,
  className,
}) => {
  const top5 = useMemo(() => productos.slice(0, 5), [productos]);
  const maxUds = Math.max(1, ...top5.map((p) => p.unidadesVendidas));
  const totalUdsTop = top5.reduce((acc, p) => acc + p.unidadesVendidas, 0);
  const totalGananciaTop = top5.reduce((acc, p) => acc + p.gananciaUsdCents, 0);

  if (top5.length === 0) {
    return (
      <div className="py-8 px-4 text-center text-caption text-texto-3 flex flex-col items-center justify-center gap-2">
        <ShoppingBag className="w-8 h-8 text-texto-3/40" />
        <p className="font-semibold text-texto">Aún no hay rotación de productos registrada</p>
        <p className="text-xs">Los artículos más vendidos de los últimos 90 días aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className={cn('w-full select-none flex flex-col', className)}>
      <div className="flex items-center justify-between gap-2 mb-3 text-caption text-texto-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 font-semibold border border-amber-500/20 text-[11px]">
            <Award className="w-3 h-3 text-amber-600" />
            <span>Top #1: {top5[0]?.nombre}</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-superficie-2 text-texto-2 font-medium border border-borde/70 text-[11px]">
            <Package className="w-3 h-3 text-texto-3" />
            <span>{totalUdsTop} unidades vendidas</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-superficie-2 text-texto-2 font-medium border border-borde/70 text-[11px]">
            <span>Utilidad Top 5: {formatearMoneda(totalGananciaTop, 'USD')}</span>
          </span>
        </div>
      </div>

      <div className="space-y-2 py-1">
        {top5.map((p, idx) => {
          const ratio = Math.max(0.08, p.unidadesVendidas / maxUds);
          const esPrimero = idx === 0;

          return (
            <div
              key={p.nombre + idx}
              className="group flex items-center gap-3 text-xs p-1.5 rounded-xl hover:bg-superficie-2/50 transition-colors"
            >
              <div
                className={cn(
                  'w-6 h-6 rounded-lg flex items-center justify-center font-bold text-[11px] shrink-0 border shadow-2xs',
                  esPrimero
                    ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30'
                    : idx === 1
                    ? 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-400/30'
                    : idx === 2
                    ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-400/30'
                    : 'bg-superficie-2 text-texto-3 border-borde/60'
                )}
              >
                #{idx + 1}
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-texto truncate text-body" title={p.nombre}>
                    {p.nombre}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-texto font-mono">
                      {p.unidadesVendidas} uds
                    </span>
                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      +{formatearMoneda(p.gananciaUsdCents, 'USD')}
                    </span>
                  </div>
                </div>

                <div className="h-2 w-full rounded-full bg-borde/50 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-500 ease-out',
                      esPrimero
                        ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                        : 'bg-gradient-to-r from-acento to-indigo-400'
                    )}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              </div>

              <div className="shrink-0 text-right min-w-[70px]">
                <span
                  className={cn(
                    'text-[10px] px-2 py-0.5 rounded-md font-semibold border',
                    p.existencias > 0
                      ? 'bg-superficie-2 text-texto-2 border-borde/60'
                      : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
                  )}
                >
                  {p.existencias > 0 ? `${p.existencias} en stock` : 'Agotado'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
