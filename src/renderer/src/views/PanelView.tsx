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
  Plus,
  PackagePlus,
  Sparkles,
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

  const sinDatos =
    inversionTotal === 0 &&
    resumen.por_cobrar_usd_cents === 0 &&
    resumen.unidades_en_inventario === 0 &&
    historico.every((h) => h.ingresos_usd_cents === 0);

  return (
    <div className="flex-1 overflow-y-auto animate-fade-in bg-fondo/50">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Barra superior de bienvenida y accesos directos */}
        <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-borde/50">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-texto">
                Resumen de tu Negocio
              </h2>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                En tiempo real
              </span>
            </div>
            <p className="text-caption text-texto-3 mt-0.5">
              Métricas financieras, inventario físico y cuentas por cobrar consolidadas
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={onNuevoPaquete}
              className="shadow-sm rounded-xl"
            >
              <PackagePlus className="w-3.5 h-3.5 text-acento" />
              <span>Registrar Paquete</span>
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onNuevaVenta}
              className="shadow-sm rounded-xl font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Venta</span>
            </Button>
          </div>
        </div>

        {sinDatos ? (
          <div className="rounded-2xl border border-dashed border-borde-fuerte bg-superficie p-10 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-acento-suave/80 text-acento flex items-center justify-center mx-auto mb-4 border border-acento/20">
              <Package className="w-7 h-7 text-acento" />
            </div>
            <h3 className="text-title font-bold text-texto">Empezá por tu primer paquete</h3>
            <p className="mt-1 text-body text-texto-2 max-w-md mx-auto">
              Registrá lo que venía adentro, cuánto pesó y qué pagaste de envío. El sistema
              reparte el costo, arma tu inventario y te propone los precios de venta.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3">
              <Button variant="primary" onClick={onNuevoPaquete} className="rounded-xl">
                <Package className="w-4 h-4" />
                <span>Registrar un paquete</span>
              </Button>
              <Button variant="secondary" onClick={() => onNavegar('inventario')} className="rounded-xl">
                Cargar productos a mano
              </Button>
            </div>
          </div>
        ) : (
          /* Nivel 1: Cuatro tarjetas de métricas de alta jerarquía */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4.5 stagger-children">
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
              className="shadow-sm hover:border-emerald-500/40 hover:shadow-emerald-500/5"
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
              className="shadow-sm hover:border-indigo-500/40 hover:shadow-indigo-500/5"
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
              hint={`${data.por_cobrar.length} venta(s) con saldo`}
              onClick={() => onNavegar('ventas')}
              className="shadow-sm hover:border-amber-500/40 hover:shadow-amber-500/5"
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
              className="shadow-sm hover:border-rose-500/40 hover:shadow-rose-500/5"
            />
          </div>
        )}

        {/* Nivel 2: Centro de alertas urgentes */}
        {urgentes.length > 0 && (
          <div className="rounded-2xl border border-rose-300/80 bg-gradient-to-r from-rose-50 to-amber-50/60 p-4.5 shadow-sm animate-slide-up">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-700 flex items-center justify-center shrink-0 border border-rose-300">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                    Atención inmediata requerida ({urgentes.length})
                  </span>
                </div>
                <div className="space-y-2 divide-y divide-rose-200/50">
                  {urgentes.map((a) => (
                    <div key={a.id} className="pt-2 first:pt-0">
                      <FilaAlerta alerta={a} onNavegar={onNavegar} compacta />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nivel 3: Gráfica interactiva animada + Dónde está la plata */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Gráfica principal con selector y animaciones */}
          <Card className="xl:col-span-2 shadow-sm">
            <CardHeader>
              <SectionHeader
                icon={TrendingUp}
                title="Evolución de Ganancias e Ingresos"
                description="Línea esmeralda continua: ganancia neta. Línea violeta discontinua: ingresos brutos."
              />
            </CardHeader>
            <CardContent>
              {serie.some((s) => s.valor > 0 || (s.valorSecundario ?? 0) > 0) ? (
                <LineaCreciente datos={serie} alto={230} />
              ) : (
                <div className="h-[220px] flex flex-col items-center justify-center text-center gap-2.5">
                  <div className="w-12 h-12 rounded-2xl bg-superficie-2 flex items-center justify-center text-texto-3">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <p className="text-body font-medium text-texto-2">Todavía no hay ventas entregadas registradas.</p>
                  <p className="text-caption text-texto-3 max-w-xs">
                    Las ganancias se calculan en base al costo asignado a cada producto al entregarse.
                  </p>
                  <Button size="sm" variant="secondary" onClick={onNuevaVenta} className="mt-1 rounded-xl">
                    Registrar la primera venta
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dónde está la plata (Distribución de capital) */}
          <Card className="shadow-sm">
            <CardHeader>
              <SectionHeader
                icon={Wallet}
                title="Dónde está tu plata"
                description="Capital activo y comprometido"
              />
            </CardHeader>
            <CardContent>
              {inversionTotal > 0 || resumen.por_cobrar_usd_cents > 0 ? (
                <div className="space-y-4">
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
                        color: '#ea580c',
                      },
                    ]}
                    centro={
                      <Money
                        usd_cents={inversionTotal + resumen.por_cobrar_usd_cents}
                        size="lg"
                        soloUsd
                      />
                    }
                    subtitulo="Total Comprometido"
                    tamano={150}
                  />

                  {resumen.anticipos_por_entregar_usd_cents > 0 && (
                    <div className="pt-3 border-t border-borde/60 bg-amber-50/50 -mx-5 -mb-5 px-5 py-3 rounded-b-2xl border-t border-amber-200/50">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-label font-medium text-amber-900">
                          Anticipos recibidos:
                        </span>
                        <Money
                          usd_cents={resumen.anticipos_por_entregar_usd_cents}
                          size="sm"
                          className="font-bold text-amber-950"
                        />
                      </div>
                      <p className="text-[11px] text-amber-700/80 mt-0.5">
                        Compromiso pendiente: se saldará al entregar la mercadería.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center gap-2 text-texto-3">
                  <Wallet className="w-8 h-8 text-borde-fuerte" />
                  <p className="text-body">Sin capital registrado aún.</p>
                  <p className="text-caption text-texto-3 max-w-xs">
                    Cuando registres tu primer paquete vas a ver acá el desglose de tu inversión.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Nivel 4: Listas de trabajo */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 stagger-children">
          {/* 1. QUIÉN TE DEBE */}
          <Card className="shadow-sm flex flex-col">
            <CardHeader>
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
            <CardContent className="p-0 flex-1">
              {data.por_cobrar.length > 0 ? (
                <ul className="divide-y divide-borde/60">
                  {data.por_cobrar.slice(0, 6).map((p) => (
                    <li key={p.venta_id}>
                      <button
                        onClick={() => onNavegar('ventas', p.venta_id)}
                        className="w-full text-left px-5 py-3 hover:bg-superficie-2 transition-all focus-visible:outline-none focus-visible:bg-superficie-2 group"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-lg bg-superficie-2 text-texto font-bold text-xs flex items-center justify-center border border-borde shrink-0 group-hover:border-acento">
                              {p.cliente_nombre.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-body font-semibold text-texto truncate group-hover:text-acento transition-colors">
                              {p.cliente_nombre}
                            </span>
                          </div>
                          <Money usd_cents={p.saldo_usd_cents} size="sm" soloUsd className="font-bold text-amber-700" />
                        </div>

                        <div className="flex items-center justify-between gap-2 mt-1 pl-9">
                          <span className="text-caption text-texto-3 font-medium">
                            {p.codigo}
                            {p.cuotas_vencidas > 0 && (
                              <span className="text-rose-600 font-bold ml-1.5 inline-flex items-center gap-1">
                                · {p.cuotas_vencidas} cuota{p.cuotas_vencidas > 1 ? 's' : ''} vencida{p.cuotas_vencidas > 1 ? 's' : ''}
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="pl-9 mt-1.5">
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
                <VacioOk mensaje="¡Excelente! Nadie te debe nada." />
              )}
            </CardContent>
          </Card>

          {/* 2. SE ESTÁ ACABANDO */}
          <Card className="shadow-sm flex flex-col">
            <CardHeader>
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
            <CardContent className="p-0 flex-1">
              {data.bajo_stock.length > 0 ? (
                <ul className="divide-y divide-borde/60">
                  {data.bajo_stock.slice(0, 6).map((p) => (
                    <li key={p.producto_id}>
                      <button
                        onClick={() => onNavegar('inventario', p.producto_id)}
                        className="w-full text-left px-5 py-3 hover:bg-superficie-2 transition-all focus-visible:outline-none focus-visible:bg-superficie-2 flex items-center justify-between gap-3 group"
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
              ) : (
                <VacioOk mensaje="Todo el catálogo con existencias suficientes." />
              )}
            </CardContent>
          </Card>

          {/* 3. LO QUE MÁS SE VENDE CON PODIO */}
          <Card className="shadow-sm flex flex-col">
            <CardHeader>
              <SectionHeader
                icon={Flame}
                title="Más vendidos"
                description="Top productos (Últimos 90 días)"
              />
            </CardHeader>
            <CardContent className="p-0 flex-1">
              {data.mas_vendidos.length > 0 ? (
                <ul className="divide-y divide-borde/60">
                  {data.mas_vendidos.map((p, idx) => {
                    const medallas = ['🥇', '🥈', '🥉'];
                    const medalla = medallas[idx];

                    return (
                      <li
                        key={p.producto_id}
                        className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-superficie-2/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
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
                              {p.unidades_vendidas_90d} unidad(es) vendida(s)
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <Money usd_cents={p.ganancia_90d_usd_cents} size="sm" soloUsd className="font-bold text-emerald-700" />
                          <div className="text-[10px] text-texto-3">de ganancia</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <VacioOk mensaje="Todavía no hay historial de ventas suficiente." />
              )}

              {data.sin_rotacion.length > 0 && (
                <div className="px-5 py-3 border-t border-borde/70 bg-amber-50/40 rounded-b-2xl">
                  <div className="text-caption font-semibold text-amber-900 mb-1 flex items-center gap-1.5">
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

        {/* Avisos secundarios que no son urgentes */}
        {alertas.length > urgentes.length && (
          <Card className="shadow-sm">
            <CardHeader>
              <SectionHeader icon={AlertTriangle} title="Avisos del Sistema" />
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-borde/60">
                {alertas
                  .filter((a) => a.severidad !== 'urgente')
                  .map((a) => (
                    <li key={a.id} className="px-5 py-3 hover:bg-superficie-2/40 transition-colors">
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

const VacioOk: React.FC<{ mensaje: string }> = ({ mensaje }) => (
  <div className="px-4 py-10 flex flex-col items-center gap-2 text-center">
    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60">
      <CheckCircle2 className="w-5 h-5" />
    </div>
    <p className="text-body font-medium text-texto-2">{mensaje}</p>
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
