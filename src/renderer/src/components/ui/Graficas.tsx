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
import { cn } from '../../lib/cn';
import { formatearMoneda } from '@core/moneda';

export interface PuntoSerie {
  etiqueta: string;
  valor: number;
  /** Segunda serie apilada detrás, para comparar ingreso contra ganancia. */
  valorSecundario?: number;
}

// ---------------------------------------------------------------------------

export interface BarrasProps {
  datos: PuntoSerie[];
  /** Formatea el valor en el tooltip y el eje. */
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

export interface LineaCrecienteProps {
  datos: PuntoSerie[];
  formato?: (v: number) => string;
  alto?: number;
  etiquetaSerie?: string;
  etiquetaSerieSecundaria?: string;
  className?: string;
}

export type ModoGrafica = 'ambas' | 'ganancias' | 'ingresos';

/**
 * Gráfica interactiva de línea y área continua de alta fidelidad.
 * Cuenta con animación fluida de trazo continuo (draw SVG), escala de eje Y,
 * selector de visualización (Ambas / Ganancias / Ingresos) y tarjeta de análisis flotante.
 */
export const LineaCreciente: React.FC<LineaCrecienteProps> = ({
  datos,
  formato = (v) => formatearMoneda(v, 'USD'),
  alto = 145,
  etiquetaSerie = 'Ganancia Neta',
  etiquetaSerieSecundaria = 'Ingresos Totales',
  className,
}) => {
  const [activo, setActivo] = useState<number | null>(null);
  const [modo, setModo] = useState<ModoGrafica>('ambas');
  const gradId = useId();

  const tieneSecundaria = datos.some((d) => d.valorSecundario !== undefined);

  // Estadísticas clave de la serie
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

  const maximoBruto = Math.max(
    1,
    ...datos.map((d) => {
      if (modo === 'ganancias') return d.valor;
      if (modo === 'ingresos') return d.valorSecundario ?? 0;
      return Math.max(d.valor, d.valorSecundario ?? 0);
    })
  );

  // Margen superior para holgura estética
  const maximo = Math.ceil((maximoBruto * 1.18) / 1000) * 1000 || maximoBruto * 1.2;

  const W = 680;
  const H = alto;
  const padLeft = 54; // Espacio para etiquetas del eje Y
  const padRight = 16;
  const padTop = 14;
  const padBottom = 22;
  const usableW = W - padLeft - padRight;
  const usableH = H - padTop - padBottom;

  const puntosPrincipal = datos.map((d, i) => {
    const x = padLeft + (i / Math.max(1, datos.length - 1)) * usableW;
    const y = H - padBottom - (Math.max(0, d.valor) / maximo) * usableH;
    return { x, y, data: d, index: i };
  });

  const puntosSecundaria = datos.map((d, i) => {
    const x = padLeft + (i / Math.max(1, datos.length - 1)) * usableW;
    const y =
      H - padBottom - (Math.max(0, d.valorSecundario ?? 0) / maximo) * usableH;
    return { x, y, data: d, index: i };
  });

  // Generador de curva Bézier cúbica suave
  const generarCurva = (pts: { x: number; y: number }[]): string => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;

    let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];

      const cp1x = p1.x + (p2.x - p0.x) / 5;
      const cp1y = p1.y + (p2.y - p0.y) / 5;
      const cp2x = p2.x - (p3.x - p1.x) / 5;
      const cp2y = p2.y - (p3.y - p1.y) / 5;

      d += ` C ${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
  };

  const mostrarPrincipal = modo === 'ambas' || modo === 'ganancias';
  const mostrarSecundaria = tieneSecundaria && (modo === 'ambas' || modo === 'ingresos');

  const pathPrincipal = generarCurva(puntosPrincipal);
  const pathSecundaria = generarCurva(puntosSecundaria);

  const pathAreaPrincipal =
    mostrarPrincipal && puntosPrincipal.length > 0
      ? `${pathPrincipal} L ${puntosPrincipal[puntosPrincipal.length - 1].x.toFixed(1)},${(H - padBottom).toFixed(1)} L ${puntosPrincipal[0].x.toFixed(1)},${(H - padBottom).toFixed(1)} Z`
      : '';

  const pathAreaSecundaria =
    modo === 'ingresos' && puntosSecundaria.length > 0
      ? `${pathSecundaria} L ${puntosSecundaria[puntosSecundaria.length - 1].x.toFixed(1)},${(H - padBottom).toFixed(1)} L ${puntosSecundaria[0].x.toFixed(1)},${(H - padBottom).toFixed(1)} Z`
      : '';

  const puntoActivo = activo !== null ? puntosPrincipal[activo] : null;
  const puntoSecActivo = activo !== null ? puntosSecundaria[activo] : null;

  // Variación respecto al mes anterior del punto activo
  const variacionMes = useMemo(() => {
    if (activo === null || activo === 0) return null;
    const anterior = datos[activo - 1];
    const actual = datos[activo];
    if (!anterior || anterior.valor === 0) return null;
    const pct = Math.round(((actual.valor - anterior.valor) / anterior.valor) * 100);
    return pct;
  }, [activo, datos]);

  // Margen de ganancia sobre ingreso
  const margenPct = useMemo(() => {
    if (!puntoActivo) return null;
    const ing = puntoActivo.data.valorSecundario ?? 0;
    if (ing <= 0) return null;
    return Math.round((puntoActivo.data.valor / ing) * 100);
  }, [puntoActivo]);

  // Pasos de referencia para el eje Y (0%, 33%, 66%, 100%)
  const nivelesY = [
    { p: 1, val: maximo },
    { p: 0.66, val: maximo * 0.66 },
    { p: 0.33, val: maximo * 0.33 },
    { p: 0, val: 0 },
  ];

  return (
    <div className={cn('w-full select-none flex flex-col', className)}>
      {/* Barra superior de control y métricas rápidas */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-borde/50 flex-wrap">
        <div className="flex items-center gap-2">
          {resumen.mejorMes.valor > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption bg-emerald-500/10 text-emerald-700 font-semibold border border-emerald-500/20">
              <Award className="w-3.5 h-3.5 text-emerald-600" />
              <span>Récord: {resumen.mejorMes.etiqueta.toUpperCase()} ({formato(resumen.mejorMes.valor)})</span>
            </span>
          )}
          {resumen.promedio > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption bg-sky-500/10 text-sky-700 font-medium border border-sky-500/20 hidden md:inline-flex">
              <TrendingUp className="w-3.5 h-3.5 text-sky-600" />
              <span>Promedio: {formato(resumen.promedio)}/mes</span>
            </span>
          )}
        </div>

        {/* Selector de modo en pastillas modernas */}
        {tieneSecundaria && (
          <div className="inline-flex items-center p-1 bg-superficie-2 rounded-xl border border-borde/70 text-caption font-medium">
            <button
              type="button"
              onClick={() => setModo('ambas')}
              className={cn(
                'px-2.5 py-1 rounded-lg transition-all duration-150',
                modo === 'ambas'
                  ? 'bg-superficie text-texto font-semibold shadow-sm'
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
                  ? 'bg-emerald-50 text-emerald-700 font-semibold shadow-sm border border-emerald-200/50'
                  : 'text-texto-3 hover:text-texto'
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Solo Ganancias
            </button>
            <button
              type="button"
              onClick={() => setModo('ingresos')}
              className={cn(
                'px-2.5 py-1 rounded-lg transition-all duration-150 flex items-center gap-1.5',
                modo === 'ingresos'
                  ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-sm border border-indigo-200/50'
                  : 'text-texto-3 hover:text-texto'
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
              Solo Ingresos
            </button>
          </div>
        )}
      </div>

      {/* Contenedor de la gráfica SVG */}
      <div className="relative w-full mt-3" style={{ height: alto }}>
        {/* Tooltip flotante interactivo de alta fidelidad */}
        {puntoActivo && (
          <div
            className="absolute z-30 pointer-events-none -translate-x-1/2 -translate-y-full mb-3 rounded-xl border border-borde/80 bg-superficie/95 backdrop-blur-md px-3.5 py-2.5 text-caption shadow-2xl transition-all duration-100 min-w-[170px]"
            style={{
              left: `${(puntoActivo.x / W) * 100}%`,
              top: `${Math.min(
                (puntoActivo.y / H) * 100,
                mostrarSecundaria && puntoSecActivo
                  ? Math.min((puntoActivo.y / H) * 100, (puntoSecActivo.y / H) * 100)
                  : (puntoActivo.y / H) * 100
              )}%`,
            }}
          >
            <div className="flex items-center justify-between border-b border-borde/60 pb-1.5 mb-2">
              <span className="font-bold text-texto uppercase tracking-wider text-xs">
                {puntoActivo.data.etiqueta}
              </span>
              {variacionMes !== null && (
                <span
                  className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                    variacionMes >= 0
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-rose-50 text-rose-700'
                  )}
                >
                  {variacionMes >= 0 ? '+' : ''}
                  {variacionMes}%
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-texto-2 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                  {etiquetaSerie}:
                </span>
                <span className="font-bold text-emerald-600 tabular">
                  {formato(puntoActivo.data.valor)}
                </span>
              </div>

              {tieneSecundaria && (
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-texto-3 text-[11px]">
                    <span className="w-2 h-2 rounded-full bg-indigo-400" />
                    {etiquetaSerieSecundaria}:
                  </span>
                  <span className="font-medium text-texto tabular">
                    {formato(puntoActivo.data.valorSecundario ?? 0)}
                  </span>
                </div>
              )}

              {margenPct !== null && (
                <div className="pt-1.5 mt-1 border-t border-borde/40 flex items-center justify-between text-[10px] text-texto-3">
                  <span>Margen neto:</span>
                  <span className="font-semibold text-texto-2">{margenPct}%</span>
                </div>
              )}
            </div>
          </div>
        )}

        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            {/* Gradiente Esmeralda para Ganancias */}
            <linearGradient id={`area-grad-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#059669" stopOpacity="0.35" />
              <stop offset="70%" stopColor="#10b981" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.00" />
            </linearGradient>

            {/* Gradiente Índigo para Ingresos */}
            <linearGradient id={`area-sec-grad-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="85%" stopColor="#818cf8" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0.00" />
            </linearGradient>

            {/* Filtro de resplandor suave */}
            <filter id={`glow-${gradId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#059669" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Líneas guía horizontales y etiquetas del eje Y */}
          {nivelesY.map((nv, idx) => {
            const y = padTop + (1 - nv.p) * usableH;
            return (
              <g key={idx}>
                <text
                  x={padLeft - 10}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-texto-3 text-[10px] font-medium tabular"
                >
                  {formato(Math.round(nv.val))}
                </text>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={W - padRight}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  className="text-borde/70"
                  strokeWidth={1}
                />
              </g>
            );
          })}

          {/* Línea vertical interactiva guía (Crosshair) */}
          {puntoActivo && (
            <line
              x1={puntoActivo.x}
              y1={padTop}
              x2={puntoActivo.x}
              y2={H - padBottom}
              stroke="currentColor"
              strokeDasharray="3 3"
              className="text-emerald-500/60 transition-all"
              strokeWidth={1.5}
            />
          )}

          {/* Relleno degradado de la curva de ingresos (si está en modo solo ingresos) */}
          {pathAreaSecundaria && (
            <path
              d={pathAreaSecundaria}
              fill={`url(#area-sec-grad-${gradId})`}
              className="animate-area-reveal"
            />
          )}

          {/* Relleno degradado de la curva de ganancia principal */}
          {pathAreaPrincipal && (
            <path
              d={pathAreaPrincipal}
              fill={`url(#area-grad-${gradId})`}
              className="animate-area-reveal"
            />
          )}

          {/* Curva de Ingresos (Secundaria) con dibujo animado */}
          {mostrarSecundaria && pathSecundaria && (
            <path
              d={pathSecundaria}
              fill="none"
              stroke="#6366f1"
              strokeWidth={2.5}
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={100}
              className="animate-draw-svg opacity-80"
            />
          )}

          {/* Curva Principal de Ganancias con trazo animado fluido */}
          {mostrarPrincipal && pathPrincipal && (
            <path
              d={pathPrincipal}
              fill="none"
              stroke="#059669"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={100}
              filter={`url(#glow-${gradId})`}
              className="animate-draw-svg"
            />
          )}

          {/* Puntos de datos y zonas de detección táctil/mouse */}
          {puntosPrincipal.map((p, i) => {
            const esActivo = activo === i;
            const pSec = puntosSecundaria[i];

            return (
              <g key={i}>
                {/* Zona transparente para hover con mayor área de interacción */}
                <rect
                  x={p.x - usableW / Math.max(1, datos.length) / 2}
                  y={0}
                  width={usableW / Math.max(1, datos.length)}
                  height={H}
                  fill="transparent"
                  className="cursor-pointer"
                  onMouseEnter={() => setActivo(i)}
                  onMouseLeave={() => setActivo(null)}
                />

                {/* Punto en curva de ingresos */}
                {mostrarSecundaria && pSec && (
                  <circle
                    cx={pSec.x}
                    cy={pSec.y}
                    r={esActivo ? 5 : 3}
                    className="fill-superficie stroke-indigo-500 transition-all animate-pop-in"
                    strokeWidth={2}
                    style={{ animationDelay: `${i * 80 + 150}ms` }}
                  />
                )}

                {/* Punto en curva de ganancia */}
                {mostrarPrincipal && (
                  <>
                    {/* Halo expandido cuando está activo */}
                    {esActivo && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={10}
                        className="fill-emerald-500/20 stroke-emerald-500 animate-ping opacity-75"
                        strokeWidth={1}
                      />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={esActivo ? 6 : 4}
                      className="fill-superficie stroke-emerald-600 transition-all animate-pop-in"
                      strokeWidth={3}
                      style={{ animationDelay: `${i * 80 + 200}ms` }}
                    />
                  </>
                )}

                {/* Etiqueta del mes en eje X */}
                <text
                  x={p.x}
                  y={H - 10}
                  textAnchor="middle"
                  className={cn(
                    'text-[11px] uppercase transition-colors tracking-wide',
                    esActivo ? 'fill-emerald-600 font-bold' : 'fill-texto-3 font-medium'
                  )}
                >
                  {p.data.etiqueta}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Pie de leyenda interactiva */}
      <div className="mt-2 flex items-center justify-between text-caption text-texto-3 border-t border-borde/50 pt-2.5 flex-wrap gap-2">
        <div className="flex items-center gap-5">
          <span className="inline-flex items-center gap-2 font-semibold text-texto">
            <span className="w-3 h-1.5 rounded-full bg-emerald-600 shadow-sm shadow-emerald-500/50" />
            {etiquetaSerie}
          </span>
          {tieneSecundaria && (
            <span className="inline-flex items-center gap-2 font-medium text-texto-2">
              <span className="w-3 h-1.5 rounded-full bg-indigo-500" />
              {etiquetaSerieSecundaria}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-texto-3">
          <DollarSign className="w-3 h-3 text-emerald-600" />
          <span>Calculado en base a órdenes entregadas y costos reales</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

export interface AnilloProps {
  segmentos: { etiqueta: string; valor: number; color: string }[];
  /** Texto grande en el centro. */
  centro?: React.ReactNode;
  subtitulo?: string;
  tamano?: number;
  className?: string;
}

/** Anillo interactivo para distribución de capital con porcentajes claros */
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

          {/* Pista de fondo */}
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

        {/* Círculo central con datos si se requiere en el centro */}
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

      {/* Lista detallada con porcentajes e interacción */}
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

                {/* Barra miniatura de distribución */}
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-borde/50 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
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
          className={cn('h-full rounded-full transition-all duration-500 animate-bar-grow', colores[tono])}
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
// 1. Gráfica de Volumen de Pedidos y Ventas Mensuales
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
  alto = 145,
  className,
}) => {
  const [activo, setActivo] = useState<number | null>(null);

  const maxOrdenes = Math.max(1, ...datos.map((d) => d.ordenes));
  const totalOrdenes = datos.reduce((acc, d) => acc + d.ordenes, 0);
  const totalIngresos = datos.reduce((acc, d) => acc + d.ingresosUsdCents, 0);
  const ticketPromedioGlobal = totalOrdenes > 0 ? Math.round(totalIngresos / totalOrdenes) : 0;
  const mesRecord = [...datos].sort((a, b) => b.ordenes - a.ordenes)[0];

  const W = 600;
  const H = alto;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 26;
  const usableW = W - padLeft - padRight;
  const usableH = H - padTop - padBottom;

  const barCount = datos.length || 1;
  const slotW = usableW / barCount;
  const barW = Math.min(36, slotW * 0.55);

  const nivelesY = [
    { val: maxOrdenes, p: 1 },
    { val: Math.round(maxOrdenes * 0.5), p: 0.5 },
    { val: 0, p: 0 },
  ];

  const itemActivo = activo !== null ? datos[activo] : null;

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

      {/* Contenedor SVG y Tooltip Flotante */}
      <div className="relative w-full" style={{ height: alto }}>
        {itemActivo && activo !== null && (
          <div
            className="absolute z-30 pointer-events-none transition-all duration-150 ease-out"
            style={{
              left: `${padLeft + activo * slotW + slotW / 2}px`,
              top: '4px',
              transform: 'translateX(-50%)',
            }}
          >
            <div className="rounded-xl bg-inverso/95 text-white p-2.5 shadow-2xl border border-white/10 backdrop-blur-md text-caption min-w-[170px] space-y-1">
              <div className="flex items-center justify-between font-bold border-b border-white/10 pb-1">
                <span className="uppercase text-[11px] tracking-wider text-blue-300">
                  {itemActivo.etiqueta}
                </span>
                <span className="text-white font-mono">{itemActivo.ordenes} pedidos</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300 pt-0.5">
                <span>Facturado:</span>
                <span className="font-semibold text-white font-mono">
                  {formatearMoneda(itemActivo.ingresosUsdCents, 'USD')}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span>Ticket promedio:</span>
                <span className="font-semibold text-emerald-300 font-mono">
                  {formatearMoneda(
                    itemActivo.ordenes > 0
                      ? Math.round(itemActivo.ingresosUsdCents / itemActivo.ordenes)
                      : 0,
                    'USD'
                  )}
                </span>
              </div>
            </div>
          </div>
        )}

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bar-gradient-blue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
            <linearGradient id="bar-gradient-hover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
          </defs>

          {/* Líneas guía horizontales y etiquetas Y */}
          {nivelesY.map((nv, idx) => {
            const y = padTop + (1 - nv.p) * usableH;
            return (
              <g key={idx}>
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-texto-3 text-[10px] font-medium tabular"
                >
                  {nv.val}
                </text>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={W - padRight}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  className="text-borde/70"
                  strokeWidth={1}
                />
              </g>
            );
          })}

          {/* Barras de datos */}
          {datos.map((d, i) => {
            const esActivo = activo === i;
            const x = padLeft + i * slotW + (slotW - barW) / 2;
            const barH = Math.max(3, (d.ordenes / maxOrdenes) * usableH);
            const y = padTop + usableH - barH;

            return (
              <g
                key={d.etiqueta}
                className="cursor-pointer transition-transform"
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
              >
                {/* Zona de interacción invisible más ancha */}
                <rect
                  x={padLeft + i * slotW}
                  y={padTop}
                  width={slotW}
                  height={usableH + padBottom}
                  fill="transparent"
                />

                {/* Barra visual */}
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={5}
                  fill={esActivo ? 'url(#bar-gradient-hover)' : 'url(#bar-gradient-blue)'}
                  className="transition-all duration-200"
                  filter={esActivo ? 'drop-shadow(0 4px 6px rgba(59, 130, 246, 0.4))' : undefined}
                />

                {/* Valor numérico encima de la barra si hay espacio */}
                {d.ordenes > 0 && (
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    className={cn(
                      'text-[10px] font-mono font-bold transition-all',
                      esActivo ? 'fill-blue-500 scale-110' : 'fill-texto-3'
                    )}
                  >
                    {d.ordenes}
                  </text>
                )}

                {/* Etiqueta del mes */}
                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className={cn(
                    'text-[11px] uppercase transition-colors tracking-wide',
                    esActivo ? 'fill-blue-600 font-bold' : 'fill-texto-3 font-medium'
                  )}
                >
                  {d.etiqueta}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Pie de leyenda */}
      <div className="mt-2 flex items-center justify-between text-caption text-texto-3 border-t border-borde/50 pt-2 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-semibold text-texto text-[11px]">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 shadow-sm" />
            Órdenes completadas por mes
          </span>
        </div>
        <span className="text-[11px] text-texto-3">
          Calculado con ventas y encargos entregados
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2. Gráfica de Margen de Ganancia Porcentual (%)
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
  alto = 145,
  className,
}) => {
  const [activo, setActivo] = useState<number | null>(null);

  // Escala máxima basada en datos o 50% mínimo
  const maxMargenCalculado = Math.max(50, ...datos.map((d) => d.margenPct));
  const maxMargen = Math.min(100, Math.ceil(maxMargenCalculado / 10) * 10);

  const mesesConVenta = datos.filter((d) => d.ingresosUsdCents > 0);
  const margenPromedio =
    mesesConVenta.length > 0
      ? Math.round(mesesConVenta.reduce((acc, d) => acc + d.margenPct, 0) / mesesConVenta.length)
      : 0;

  const mejorMes = [...datos].sort((a, b) => b.margenPct - a.margenPct)[0];

  const W = 600;
  const H = alto;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 26;
  const usableW = W - padLeft - padRight;
  const usableH = H - padTop - padBottom;

  const barCount = datos.length || 1;
  const slotW = usableW / barCount;
  const barW = Math.min(36, slotW * 0.55);

  // Umbral saludable: 35%
  const umbralSaludable = 35;
  const yUmbral = padTop + (1 - Math.min(1, umbralSaludable / maxMargen)) * usableH;

  const nivelesY = [
    { val: `${maxMargen}%`, p: 1 },
    { val: `${Math.round(maxMargen * 0.5)}%`, p: 0.5 },
    { val: '0%', p: 0 },
  ];

  const itemActivo = activo !== null ? datos[activo] : null;

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

      {/* Contenedor SVG y Tooltip */}
      <div className="relative w-full" style={{ height: alto }}>
        {itemActivo && activo !== null && (
          <div
            className="absolute z-30 pointer-events-none transition-all duration-150 ease-out"
            style={{
              left: `${padLeft + activo * slotW + slotW / 2}px`,
              top: '4px',
              transform: 'translateX(-50%)',
            }}
          >
            <div className="rounded-xl bg-inverso/95 text-white p-2.5 shadow-2xl border border-white/10 backdrop-blur-md text-caption min-w-[170px] space-y-1">
              <div className="flex items-center justify-between font-bold border-b border-white/10 pb-1">
                <span className="uppercase text-[11px] tracking-wider text-purple-300">
                  {itemActivo.etiqueta}
                </span>
                <span className="text-emerald-300 font-mono font-bold text-sm">
                  {itemActivo.margenPct}% margen
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300 pt-0.5">
                <span>Ganancia neta:</span>
                <span className="font-semibold text-white font-mono">
                  {formatearMoneda(itemActivo.gananciaUsdCents, 'USD')}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span>Facturación:</span>
                <span className="font-semibold text-zinc-200 font-mono">
                  {formatearMoneda(itemActivo.ingresosUsdCents, 'USD')}
                </span>
              </div>
            </div>
          </div>
        )}

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bar-grad-purple" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6d28d9" />
            </linearGradient>
            <linearGradient id="bar-grad-emerald" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
          </defs>

          {/* Líneas guía horizontales y etiquetas Y */}
          {nivelesY.map((nv, idx) => {
            const y = padTop + (1 - nv.p) * usableH;
            return (
              <g key={idx}>
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-texto-3 text-[10px] font-medium tabular"
                >
                  {nv.val}
                </text>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={W - padRight}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  className="text-borde/70"
                  strokeWidth={1}
                />
              </g>
            );
          })}

          {/* Línea de referencia de margen saludable (35%) */}
          {yUmbral >= padTop && yUmbral <= padTop + usableH && (
            <g>
              <line
                x1={padLeft}
                y1={yUmbral}
                x2={W - padRight}
                y2={yUmbral}
                stroke="#10b981"
                strokeWidth={1.5}
                strokeDasharray="3 3"
                opacity={0.65}
              />
              <text
                x={W - padRight}
                y={yUmbral - 4}
                textAnchor="end"
                className="fill-emerald-600 dark:fill-emerald-400 text-[9px] font-bold"
              >
                Meta 35%
              </text>
            </g>
          )}

          {/* Barras de datos */}
          {datos.map((d, i) => {
            const esActivo = activo === i;
            const x = padLeft + i * slotW + (slotW - barW) / 2;
            const ratio = Math.max(0, Math.min(1, d.margenPct / maxMargen));
            const barH = Math.max(d.margenPct > 0 ? 3 : 0, ratio * usableH);
            const y = padTop + usableH - barH;

            const esOptimo = d.margenPct >= 35;

            return (
              <g
                key={d.etiqueta}
                className="cursor-pointer transition-transform"
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
              >
                <rect
                  x={padLeft + i * slotW}
                  y={padTop}
                  width={slotW}
                  height={usableH + padBottom}
                  fill="transparent"
                />

                {barH > 0 && (
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={barH}
                    rx={5}
                    fill={esOptimo ? 'url(#bar-grad-emerald)' : 'url(#bar-grad-purple)'}
                    className="transition-all duration-200"
                    filter={esActivo ? 'drop-shadow(0 4px 6px rgba(139, 92, 246, 0.4))' : undefined}
                  />
                )}

                {d.margenPct > 0 && (
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    className={cn(
                      'text-[10px] font-mono font-bold transition-all',
                      esActivo
                        ? 'fill-purple-600 scale-110'
                        : esOptimo
                        ? 'fill-emerald-600'
                        : 'fill-texto-3'
                    )}
                  >
                    {d.margenPct}%
                  </text>
                )}

                <text
                  x={x + barW / 2}
                  y={H - 8}
                  textAnchor="middle"
                  className={cn(
                    'text-[11px] uppercase transition-colors tracking-wide',
                    esActivo ? 'fill-purple-600 font-bold' : 'fill-texto-3 font-medium'
                  )}
                >
                  {d.etiqueta}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Pie de leyenda */}
      <div className="mt-2 flex items-center justify-between text-caption text-texto-3 border-t border-borde/50 pt-2 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold text-texto text-[11px]">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            ≥35% Excelente
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-texto-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-sm bg-purple-500" />
            &lt;35% Estable
          </span>
        </div>
        <span className="text-[11px] text-texto-3">
          Ganancia Neta ÷ Facturación Bruta
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 3. Gráfica de Top Productos Más Vendidos (Rotación 90 días)
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
      {/* Píldoras de resumen superior */}
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

      {/* Lista de barras horizontales estilizadas */}
      <div className="space-y-2 py-1">
        {top5.map((p, idx) => {
          const ratio = Math.max(0.08, p.unidadesVendidas / maxUds);
          const esPrimero = idx === 0;

          return (
            <div
              key={p.nombre + idx}
              className="group flex items-center gap-3 text-xs p-1.5 rounded-xl hover:bg-superficie-2/50 transition-colors"
            >
              {/* Badge de posición */}
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

              {/* Nombre y barra de progreso */}
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

                {/* Barra horizontal animada */}
                <div className="h-2 w-full rounded-full bg-borde/50 overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      esPrimero
                        ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                        : 'bg-gradient-to-r from-acento to-indigo-400'
                    )}
                    style={{ width: `${ratio * 100}%` }}
                  />
                </div>
              </div>

              {/* Stock disponible badge */}
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

      {/* Pie de leyenda */}
      <div className="mt-2 flex items-center justify-between text-caption text-texto-3 border-t border-borde/50 pt-2 flex-wrap gap-2">
        <span className="text-[11px] text-texto-3">
          Rotación acumulada de los últimos 90 días
        </span>
        <span className="text-[11px] text-texto-3 font-medium">
          Muestra unidades entregadas y margen aportado
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 4. Gráfica Comparativa de Ingresos vs Costos de Mercancía
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
  alto = 145,
  className,
}) => {
  const [activo, setActivo] = useState<number | null>(null);

  const maxVal = Math.max(
    1,
    ...datos.map((d) => Math.max(d.ingresosUsdCents, d.costosUsdCents))
  );

  const totalIngresos = datos.reduce((acc, d) => acc + d.ingresosUsdCents, 0);
  const totalCostos = datos.reduce((acc, d) => acc + d.costosUsdCents, 0);
  const totalGanancia = datos.reduce((acc, d) => acc + d.gananciaUsdCents, 0);
  const roiPct = totalCostos > 0 ? Math.round((totalGanancia / totalCostos) * 100) : 0;

  const W = 600;
  const H = alto;
  const padLeft = 52;
  const padRight = 20;
  const padTop = 15;
  const padBottom = 26;
  const usableW = W - padLeft - padRight;
  const usableH = H - padTop - padBottom;

  const barCount = datos.length || 1;
  const slotW = usableW / barCount;
  const pairW = Math.min(42, slotW * 0.7);
  const singleBarW = pairW / 2 - 2;

  const nivelesY = [
    { val: maxVal, p: 1 },
    { val: Math.round(maxVal * 0.5), p: 0.5 },
    { val: 0, p: 0 },
  ];

  const itemActivo = activo !== null ? datos[activo] : null;

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

      {/* Contenedor SVG y Tooltip */}
      <div className="relative w-full" style={{ height: alto }}>
        {itemActivo && activo !== null && (
          <div
            className="absolute z-30 pointer-events-none transition-all duration-150 ease-out"
            style={{
              left: `${padLeft + activo * slotW + slotW / 2}px`,
              top: '4px',
              transform: 'translateX(-50%)',
            }}
          >
            <div className="rounded-xl bg-inverso/95 text-white p-2.5 shadow-2xl border border-white/10 backdrop-blur-md text-caption min-w-[185px] space-y-1">
              <div className="flex items-center justify-between font-bold border-b border-white/10 pb-1">
                <span className="uppercase text-[11px] tracking-wider text-emerald-300">
                  {itemActivo.etiqueta}
                </span>
                <span className="text-emerald-300 font-mono font-bold">
                  +{formatearMoneda(itemActivo.gananciaUsdCents, 'USD')} limpios
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300 pt-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-emerald-400" />
                  Facturado:
                </span>
                <span className="font-semibold text-white font-mono">
                  {formatearMoneda(itemActivo.ingresosUsdCents, 'USD')}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-300">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-xs bg-indigo-400" />
                  Costo mercancía:
                </span>
                <span className="font-semibold text-zinc-300 font-mono">
                  {formatearMoneda(itemActivo.costosUsdCents, 'USD')}
                </span>
              </div>
            </div>
          </div>
        )}

        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
          <defs>
            <linearGradient id="bar-grad-ingreso" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
            <linearGradient id="bar-grad-costo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#4338ca" />
            </linearGradient>
          </defs>

          {/* Líneas guía horizontales y etiquetas Y */}
          {nivelesY.map((nv, idx) => {
            const y = padTop + (1 - nv.p) * usableH;
            return (
              <g key={idx}>
                <text
                  x={padLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-texto-3 text-[10px] font-medium tabular"
                >
                  {formatearMoneda(Math.round(nv.val), 'USD')}
                </text>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={W - padRight}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  className="text-borde/70"
                  strokeWidth={1}
                />
              </g>
            );
          })}

          {/* Pares de barras: Costo vs Ingreso */}
          {datos.map((d, i) => {
            const esActivo = activo === i;
            const centerSlot = padLeft + i * slotW + slotW / 2;

            const hCosto = Math.max(d.costosUsdCents > 0 ? 3 : 0, (d.costosUsdCents / maxVal) * usableH);
            const hIngreso = Math.max(d.ingresosUsdCents > 0 ? 3 : 0, (d.ingresosUsdCents / maxVal) * usableH);

            const xCosto = centerSlot - singleBarW - 1;
            const xIngreso = centerSlot + 1;

            const yCosto = padTop + usableH - hCosto;
            const yIngreso = padTop + usableH - hIngreso;

            return (
              <g
                key={d.etiqueta}
                className="cursor-pointer"
                onMouseEnter={() => setActivo(i)}
                onMouseLeave={() => setActivo(null)}
              >
                <rect
                  x={padLeft + i * slotW}
                  y={padTop}
                  width={slotW}
                  height={usableH + padBottom}
                  fill="transparent"
                />

                {/* Barra Costo (Índigo) */}
                {hCosto > 0 && (
                  <rect
                    x={xCosto}
                    y={yCosto}
                    width={singleBarW}
                    height={hCosto}
                    rx={4}
                    fill="url(#bar-grad-costo)"
                    opacity={esActivo ? 1 : 0.85}
                    className="transition-all duration-200"
                  />
                )}

                {/* Barra Ingreso (Esmeralda) */}
                {hIngreso > 0 && (
                  <rect
                    x={xIngreso}
                    y={yIngreso}
                    width={singleBarW}
                    height={hIngreso}
                    rx={4}
                    fill="url(#bar-grad-ingreso)"
                    className="transition-all duration-200"
                    filter={esActivo ? 'drop-shadow(0 4px 6px rgba(16, 185, 129, 0.4))' : undefined}
                  />
                )}

                {/* Etiqueta del mes */}
                <text
                  x={centerSlot}
                  y={H - 8}
                  textAnchor="middle"
                  className={cn(
                    'text-[11px] uppercase transition-colors tracking-wide',
                    esActivo ? 'fill-emerald-600 font-bold' : 'fill-texto-3 font-medium'
                  )}
                >
                  {d.etiqueta}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Pie de leyenda */}
      <div className="mt-2 flex items-center justify-between text-caption text-texto-3 border-t border-borde/50 pt-2 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 font-semibold text-texto text-[11px]">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shadow-sm" />
            Facturación Bruta (Ventas)
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium text-texto-2 text-[11px]">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
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


