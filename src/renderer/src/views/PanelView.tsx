import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Package,
  TrendingUp,
  Wallet,
  Users,
  PackageX,
  ShoppingBag,
  CheckCircle2,
  Boxes,
  Flame,
  Sparkles,
  Plus,
} from 'lucide-react';
import type { PanelData, Alerta, SeveridadAlerta } from '../../../shared/types';
import {
  Card,
  CardHeader,
  CardContent,
  StatTile,
  Badge,
  Button,
  SectionHeader,
  Money,
  LineaCreciente,
  Anillo,
  BarraProgreso,
} from '../components/ui';
import { cn } from '../lib/cn';

export type DestinoPanel = 'inventario' | 'paquetes' | 'ventas' | 'clientes';

interface PanelViewProps {
  data: PanelData | null;
  loading: boolean;
  onNavegar: (destino: DestinoPanel, id?: number) => void;
  onNuevaVenta: () => void;
  onNuevoPaquete: () => void;
}

const MESES = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function etiquetaMes(clave: string): string {
  const [, mes] = clave.split('-');
  return MESES[parseInt(mes, 10) - 1] ?? clave;
}

const ESTILO_ALERTA: Record<SeveridadAlerta, { punto: string; badge: 'danger' | 'warning' | 'info'; texto: string }> = {
  urgente: { punto: 'bg-rose-500', badge: 'danger', texto: 'Urgente' },
  atencion: { punto: 'bg-amber-500', badge: 'warning', texto: 'Atención' },
  info: { punto: 'bg-acento', badge: 'info', texto: 'Aviso' },
};

export const PanelView: React.FC<PanelViewProps> = ({
  data,
  loading,
  onNavegar,
  onNuevaVenta,
  onNuevoPaquete,
}) => {
  if (loading || !data) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center text-texto-3 text-body">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-acento border-t-transparent animate-spin" />
          <span>Cargando tu resumen...</span>
        </div>
      </div>
    );
  }

  const { resumen, ganancia_mes_actual, ganancia_mes_anterior, historico, alertas } = data;

  const gananciaActual = ganancia_mes_actual?.ganancia_usd_cents ?? 0;
  const gananciaAnterior = ganancia_mes_anterior?.ganancia_usd_cents ?? 0;

  const delta =
    gananciaAnterior > 0
      ? Math.round(((gananciaActual - gananciaAnterior) * 100) / gananciaAnterior)
      : null;

  const inversionTotal = resumen.inversion_inventario_usd_cents;

  const serie = historico.map((h) => ({
    etiqueta: etiquetaMes(h.mes),
    valor: h.ganancia_usd_cents,
    valorSecundario: h.ingresos_usd_cents,
  }));

  const urgentes = alertas.filter((a) => a.severidad === 'urgente');
  // Alertas operativas no urgentes que no dupliquen lo que ya muestra la tarjeta de stock
  const avisosOperativos = alertas.filter(
    (a) => a.severidad !== 'urgente' && a.id !== 'agotados' && a.id !== 'bajo-stock'
  );

  const sinDatos =
    inversionTotal === 0 &&
    resumen.por_cobrar_usd_cents === 0 &&
    resumen.unidades_en_inventario === 0 &&
    historico.every((h) => h.ingresos_usd_cents === 0);

  return (
    <div className="flex-1 overflow-y-auto animate-fade-in bg-fondo/50 flex flex-col">
      <div className="p-4 md:p-5 max-w-[1600px] w-full mx-auto flex-1 flex flex-col justify-between gap-4 min-h-full">
        {/* Barra superior de bienvenida y accesos directos compacta */}
        <div className="flex items-center justify-between gap-3 pb-1 border-b border-borde/40 text-caption text-texto-3 shrink-0 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="font-bold text-texto text-body">Resumen Financiero y Operativo</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              En tiempo real
            </span>
          </div>
          <span className="hidden md:inline-block text-[11px] text-texto-3">
            Métricas sincronizadas con Firestore
          </span>
        </div>

        {sinDatos ? (
          <div className="rounded-2xl border border-dashed border-borde-fuerte bg-superficie p-8 text-center shadow-sm">
            <div className="w-12 h-12 rounded-xl bg-acento-suave/80 text-acento flex items-center justify-center mx-auto mb-3 border border-acento/20">
              <Package className="w-6 h-6 text-acento" />
            </div>
            <h3 className="text-title font-bold text-texto">Empezá por tu primer paquete</h3>
            <p className="mt-1 text-caption text-texto-2 max-w-md mx-auto">
              Registrá lo que venía adentro, cuánto pesó y qué pagaste de envío. El sistema
              reparte el costo, arma tu inventario y te propone los precios de venta.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button variant="primary" size="sm" onClick={onNuevoPaquete} className="rounded-xl">
                <Package className="w-4 h-4" />
                <span>Registrar un paquete</span>
              </Button>
              <Button variant="secondary" size="sm" onClick={() => onNavegar('inventario')} className="rounded-xl">
                Cargar productos a mano
              </Button>
            </div>
          </div>
        ) : (
          /* Nivel 1: Cuatro tarjetas de métricas de alta jerarquía */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 shrink-0 stagger-children">
            {/* 1. GANANCIA DE ESTE MES (Métrica estrella) */}
            <StatTile
              label="Ganancia de este mes"
              usd_cents={gananciaActual}
              size="lg"
              tone={gananciaActual > 0 ? 'success' : 'neutral'}
              icon={TrendingUp}
              delta={
                delta !== null
                  ? {
                      texto: `${delta >= 0 ? '+' : ''}${delta}% vs mes pasado`,
                      positivo: delta >= 0,
                    }
                  : undefined
              }
              hint={`${ganancia_mes_actual?.ventas_count ?? 0} venta(s) entregada(s)`}
              onClick={() => onNavegar('ventas')}
            />

            {/* 2. INVERTIDO EN MERCADERÍA */}
            <StatTile
              label="Invertido en bodega"
              usd_cents={inversionTotal}
              size="lg"
              tone="purple"
              icon={Boxes}
              hint={`${resumen.unidades_en_inventario} unidad(es) disponibles`}
              onClick={() => onNavegar('inventario')}
            />

            {/* 3. TE DEBEN (CUENTAS POR COBRAR) */}
            <StatTile
              label="Te deben en la calle"
              usd_cents={resumen.por_cobrar_usd_cents}
              size="lg"
              tone={
                resumen.por_cobrar_usd_cents === 0
                  ? 'neutral'
                  : data.por_cobrar.some((p) => p.cuotas_vencidas > 0)
                    ? 'danger'
                    : 'warning'
              }
              icon={Wallet}
              hint={
                resumen.por_cobrar_usd_cents === 0
                  ? '¡Cuentas al día! Nadie debe saldo'
                  : `${data.por_cobrar.length} venta(s) con saldo`
              }
              onClick={() => onNavegar('ventas')}
            />

            {/* 4. POR ACABARSE (STOCK CRÍTICO) */}
            <StatTile
              label="Stock crítico"
              value={data.bajo_stock.length}
              size="lg"
              tone={data.bajo_stock.length > 0 ? 'danger' : 'success'}
              icon={PackageX}
              hint={
                data.bajo_stock.length > 0
                  ? `${data.bajo_stock.length} producto(s) en mínimo o agotados`
                  : 'Existencias óptimas en catálogo'
              }
              onClick={() => onNavegar('inventario')}
            />
          </div>
        )}

        {/* Nivel 2: Centro de alertas urgentes */}
        {urgentes.length > 0 && (
          <div className="rounded-xl border border-rose-300/80 bg-gradient-to-r from-rose-50 to-amber-50/60 p-3.5 shadow-2xs shrink-0 animate-slide-up">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-500/15 text-rose-700 flex items-center justify-center shrink-0 border border-rose-300">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
                    Atención inmediata requerida ({urgentes.length})
                  </span>
                </div>
                <div className="space-y-1.5 divide-y divide-rose-200/50">
                  {urgentes.map((a) => (
                    <div key={a.id} className="pt-1.5 first:pt-0">
                      <FilaAlerta alerta={a} onNavegar={onNavegar} compacta />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nivel 3: Gráfica interactiva animada + Dónde está la plata */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5 shrink-0">
          {/* Gráfica principal con selector y animaciones */}
          <Card className="xl:col-span-2 shadow-2xs flex flex-col">
            <CardHeader className="px-4 py-2.5">
              <SectionHeader
                icon={TrendingUp}
                title="Evolución de Rentabilidad"
                description="Ganancia neta vs facturación bruta mensual"
              />
            </CardHeader>
            <CardContent className="p-3.5 flex-1 flex flex-col justify-center">
              {serie.some((s) => s.valor > 0 || (s.valorSecundario ?? 0) > 0) ? (
                <LineaCreciente datos={serie} alto={180} />
              ) : (
                <div className="relative h-[180px] rounded-xl overflow-hidden flex items-center justify-between p-6 bg-gradient-to-r from-superficie to-superficie-2/40 border border-dashed border-borde/80">
                  <div className="relative z-10 flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-acento-suave text-acento flex items-center justify-center border border-acento/20 shrink-0">
                      <TrendingUp className="w-5 h-5 text-acento" />
                    </div>
                    <div>
                      <p className="text-body font-bold text-texto">
                        Tu curva de rentabilidad aparecerá aquí
                      </p>
                      <p className="text-caption text-texto-3 mt-0.5">
                        Se calculará automáticamente con las ventas entregadas y costos reales.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={onNuevaVenta}
                    className="rounded-xl shadow-xs gap-1.5 font-semibold text-xs shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nueva venta</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dónde está la plata (Distribución de capital) */}
          <Card className="shadow-2xs flex flex-col">
            <CardHeader className="px-4 py-2.5">
              <SectionHeader
                icon={Wallet}
                title="Dónde está tu plata"
                description="Capital en inventario y por cobrar"
              />
            </CardHeader>
            <CardContent className="p-3.5 flex-1 flex flex-col justify-center">
              {inversionTotal > 0 || resumen.por_cobrar_usd_cents > 0 ? (
                <div className="space-y-3">
                  <Anillo
                    segmentos={[
                      {
                        etiqueta: 'En bodega',
                        valor: resumen.inversion_inventario_usd_cents,
                        color: '#059669',
                      },
                      {
                        etiqueta: 'Por cobrar',
                        valor: resumen.por_cobrar_usd_cents,
                        color: resumen.por_cobrar_usd_cents > 0 ? '#f59e0b' : '#94a3b8',
                      },
                    ]}
                    centro={
                      <Money
                        usd_cents={inversionTotal + resumen.por_cobrar_usd_cents}
                        size="md"
                        soloUsd
                      />
                    }
                    subtitulo="Capital Activo"
                    tamano={130}
                  />

                  {resumen.anticipos_por_entregar_usd_cents > 0 && (
                    <div className="px-3 py-1.5 rounded-lg border border-amber-200/50 bg-amber-50/60 flex items-center justify-between text-xs">
                      <span className="text-[11px] font-medium text-amber-900">
                        Anticipos por entregar:
                      </span>
                      <Money
                        usd_cents={resumen.anticipos_por_entregar_usd_cents}
                        size="sm"
                        className="font-bold text-amber-950"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-8 flex flex-col items-center justify-center text-center gap-2 text-texto-3">
                  <Wallet className="w-8 h-8 text-borde-fuerte" />
                  <p className="text-body font-semibold text-texto-2">Sin capital registrado aún</p>
                  <p className="text-caption text-texto-3 max-w-xs">
                    Cuando registres tu primer paquete verás el desglose de tu inversión.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Nivel 4: Listas de trabajo operativas que llenan el alto restante armónicamente */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3.5 flex-1 min-h-[220px] stagger-children items-stretch">
          {/* 1. QUIÉN TE DEBE */}
          <Card className="shadow-2xs flex flex-col h-full">
            <CardHeader className="px-4 py-2.5 shrink-0">
              <SectionHeader
                icon={Users}
                title="Quién te debe"
                action={
                  data.por_cobrar.length > 0 ? (
                    <Badge tone={data.por_cobrar.some((p) => p.cuotas_vencidas > 0) ? 'danger' : 'warning'}>
                      {data.por_cobrar.length} pendientes
                    </Badge>
                  ) : undefined
                }
              />
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col">
              {data.por_cobrar.length > 0 ? (
                <ul className="divide-y divide-borde/50 flex-1">
                  {data.por_cobrar.slice(0, 5).map((p) => (
                    <li key={p.venta_id}>
                      <button
                        onClick={() => onNavegar('ventas', p.venta_id)}
                        className="w-full text-left px-4 py-2.5 hover:bg-superficie-2 transition-all focus-visible:outline-none focus-visible:bg-superficie-2 group"
                      >
                        <div className="flex items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-superficie-2 text-texto font-bold text-xs flex items-center justify-center border border-borde shrink-0 group-hover:border-acento">
                              {p.cliente_nombre.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-body font-semibold text-texto truncate group-hover:text-acento transition-colors">
                              {p.cliente_nombre}
                            </span>
                          </div>
                          <Money usd_cents={p.saldo_usd_cents} size="sm" soloUsd className="font-bold text-amber-700" />
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-0.5 pl-9">
                          <span className="text-caption text-texto-3 font-medium">
                            {p.codigo}
                            {p.cuotas_vencidas > 0 && (
                              <span className="text-rose-600 font-bold ml-1.5 inline-flex items-center gap-1">
                                · {p.cuotas_vencidas} cuota{p.cuotas_vencidas > 1 ? 's' : ''} vencida{p.cuotas_vencidas > 1 ? 's' : ''}
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="pl-9 mt-1">
                          <BarraProgreso
                            actual={p.pagado_usd_cents}
                            total={p.total_usd_cents}
                            tono={p.cuotas_vencidas > 0 ? 'danger' : 'brand'}
                            etiqueta={`Pagado de ${p.codigo}`}
                            mostrarPorcentaje
                          />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <VacioOk
                  mensaje="¡Excelente! Nadie te debe nada."
                  subtitulo="Todas las cuentas y cuotas pactadas están al día."
                />
              )}
            </CardContent>
          </Card>

          {/* 2. SE ESTÁ ACABANDO */}
          <Card className="shadow-2xs flex flex-col h-full">
            <CardHeader className="px-4 py-2.5 shrink-0">
              <SectionHeader
                icon={PackageX}
                title="Stock por agotarse"
                action={
                  data.bajo_stock.length > 0 ? (
                    <Badge tone="danger">{data.bajo_stock.length} críticos</Badge>
                  ) : undefined
                }
              />
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col justify-between">
              {data.bajo_stock.length > 0 ? (
                <>
                  <ul className="divide-y divide-borde/50 flex-1">
                    {data.bajo_stock.slice(0, 6).map((p) => (
                      <li key={p.producto_id}>
                        <button
                          onClick={() => onNavegar('inventario', p.producto_id)}
                          className="w-full text-left px-4 py-3 hover:bg-superficie-2 transition-all focus-visible:outline-none focus-visible:bg-superficie-2 flex items-center justify-between gap-3 group"
                        >
                          <span className="text-body font-medium text-texto truncate group-hover:text-acento transition-colors">
                            {p.nombre}
                          </span>
                          <Badge tone={p.existencias === 0 ? 'danger' : 'warning'}>
                            {p.existencias === 0 ? 'Agotado' : `${p.existencias} en stock`}
                          </Badge>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto px-4 py-2.5 border-t border-borde/40 bg-superficie-2/20 text-caption text-texto-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Resto del catálogo con existencias saludables</span>
                  </div>
                </>
              ) : (
                <VacioOk
                  mensaje="Existencias óptimas en catálogo."
                  subtitulo="No hay productos en nivel crítico ni agotados."
                />
              )}
            </CardContent>
          </Card>

          {/* 3. LO QUE MÁS SE VENDE CON PODIO */}
          <Card className="shadow-2xs flex flex-col h-full">
            <CardHeader className="px-4 py-2.5 shrink-0">
              <SectionHeader
                icon={Flame}
                title="Más vendidos"
                description="Top rotación (90 días)"
              />
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col justify-between">
              {data.mas_vendidos.length > 0 ? (
                <ul className="divide-y divide-borde/50 flex-1">
                  {data.mas_vendidos.slice(0, 4).map((p, idx) => {
                    const medallas = ['🥇', '🥈', '🥉'];
                    const medalla = medallas[idx];

                    return (
                      <li
                        key={p.producto_id}
                        className="px-4 py-2 flex items-center justify-between gap-2.5 hover:bg-superficie-2/40 transition-colors"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-base shrink-0 w-6 text-center">
                            {medalla ?? (
                              <span className="text-xs font-bold text-texto-3">
                                #{idx + 1}
                              </span>
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="text-body font-semibold text-texto truncate">
                              {p.nombre}
                            </div>
                            <div className="text-caption text-texto-3">
                              {p.unidades_vendidas_90d} unidad(es)
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <Money usd_cents={p.ganancia_90d_usd_cents} size="sm" soloUsd className="font-bold text-emerald-700" />
                          <div className="text-[10px] text-texto-3">ganancia</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <VacioInfo
                  mensaje="Todavía no hay historial suficiente."
                  subtitulo="Los productos con mayor rotación se destacarán aquí."
                />
              )}

              {data.sin_rotacion.length > 0 && (
                <div className="mt-auto px-4 py-2.5 border-t border-borde/60 bg-amber-50/40 rounded-b-xl">
                  <div className="text-caption font-semibold text-amber-900 mb-0.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Sin rotación en 90 días:</span>
                  </div>
                  <div className="text-caption text-amber-800/90 truncate">
                    {data.sin_rotacion
                      .slice(0, 3)
                      .map((p) => `${p.nombre} (${p.existencias})`)
                      .join(', ')}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Avisos secundarios que no son urgentes ni duplicados de stock */}
        {avisosOperativos.length > 0 && (
          <Card className="shadow-2xs shrink-0">
            <CardHeader className="px-4 py-2">
              <SectionHeader icon={AlertTriangle} title="Avisos Operativos del Sistema" />
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-borde/50">
                {avisosOperativos.map((a) => (
                  <li key={a.id} className="px-4 py-2 hover:bg-superficie-2/40 transition-colors">
                    <FilaAlerta alerta={a} onNavegar={onNavegar} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const VacioOk: React.FC<{ mensaje: string; subtitulo?: string }> = ({ mensaje, subtitulo }) => (
  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60 shadow-xs">
      <CheckCircle2 className="w-5 h-5" />
    </div>
    <div>
      <p className="text-body font-semibold text-texto-2">{mensaje}</p>
      {subtitulo && <p className="text-caption text-texto-3 max-w-xs mt-0.5">{subtitulo}</p>}
    </div>
  </div>
);

const VacioInfo: React.FC<{ mensaje: string; subtitulo?: string }> = ({ mensaje, subtitulo }) => (
  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2">
    <div className="w-10 h-10 rounded-2xl bg-superficie-2 text-texto-3 flex items-center justify-center border border-borde/70 shadow-xs">
      <ShoppingBag className="w-5 h-5 text-texto-3" />
    </div>
    <div>
      <p className="text-body font-semibold text-texto-2">{mensaje}</p>
      {subtitulo && <p className="text-caption text-texto-3 max-w-xs mt-0.5">{subtitulo}</p>}
    </div>
  </div>
);

const FilaAlerta: React.FC<{
  alerta: Alerta;
  onNavegar: (destino: DestinoPanel, id?: number) => void;
  compacta?: boolean;
}> = ({ alerta, onNavegar, compacta = false }) => {
  const estilo = ESTILO_ALERTA[alerta.severidad];

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-start gap-2.5 min-w-0">
        {!compacta && (
          <span className={cn('w-2 h-2 rounded-full shrink-0 mt-1.5', estilo.punto)} />
        )}
        <div className="min-w-0">
          <div
            className={cn(
              'text-body truncate',
              compacta ? 'text-rose-900 font-bold' : 'text-texto font-medium'
            )}
          >
            {alerta.titulo}
          </div>
          <div className={cn('text-caption', compacta ? 'text-rose-700' : 'text-texto-3')}>
            {alerta.detalle}
          </div>
        </div>
      </div>

      {alerta.destino && (
        <Button
          size="sm"
          variant="secondary"
          className="shrink-0 rounded-xl font-medium"
          onClick={() => onNavegar(alerta.destino!.vista as DestinoPanel, alerta.destino!.id)}
        >
          <span>Ver</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
};
