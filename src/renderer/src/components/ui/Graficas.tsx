import React, { useId, useState, useMemo } from 'react';
import { TrendingUp, Award, DollarSign } from 'lucide-react';
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
  alto = 125,
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
  tamano = 115,
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

