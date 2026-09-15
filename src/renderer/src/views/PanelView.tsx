import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Package,
  TrendingUp,
  Wallet,
  Users,
  PackageX,
  CheckCircle2,
  Boxes,
  Award,
  Plus,
  Eye,
  DollarSign,
  MessageCircle,
  Copy,
  BarChart3,
  Percent,
  Layers,
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
  GraficaVolumen,
  GraficaMargen,
  GraficaCostosIngresos,
  ContextMenu,
  type PuntoVolumen,
  type PuntoMargen,
  type PuntoCostosIngresos,
} from '../components/ui';
import { useToast } from '../context/ToastContext';
import { cn } from '../lib/cn';
import { useScrollReveal } from '../lib/useScrollReveal';

export type DestinoPanel = 'inventario' | 'paquetes' | 'ventas' | 'clientes' | 'cobranza';
export type TipoGraficaPanel = 'rentabilidad' | 'volumen' | 'margen' | 'costos';

const OPCIONES_GRAFICA: {
  id: TipoGraficaPanel;
  titulo: string;
  subtitulo: string;
  icono: React.ElementType;
  etiquetaCorta: string;
}[] = [
  {
    id: 'rentabilidad',
    titulo: 'Evolución de Rentabilidad',
    subtitulo: 'Ganancia neta vs facturación bruta mensual',
    icono: TrendingUp,
    etiquetaCorta: 'Rentabilidad',
  },
  {
    id: 'volumen',
    titulo: 'Volumen de Pedidos y Ventas',
    subtitulo: 'Cantidad de órdenes entregadas y ticket promedio mensual',
    icono: BarChart3,
    etiquetaCorta: 'Pedidos',
  },
  {
    id: 'margen',
    titulo: 'Margen Neto de Ganancia (%)',
    subtitulo: 'Porcentaje de utilidad operativa mes a mes vs meta',
    icono: Percent,
    etiquetaCorta: 'Margen %',
  },
  {
    id: 'costos',
    titulo: 'Facturación vs Costo de Mercancía',
    subtitulo: 'Relación entre inversión en compras/envíos y retorno neto',
    icono: Layers,
    etiquetaCorta: 'Ingresos vs Costos',
  },
];

interface PanelViewProps {
  data: PanelData | null;
  loading: boolean;
  /** Por qué no se pudo cargar, si es que no se pudo. */
  error?: string | null;
  onReintentar?: () => void;
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
  urgente: { punto: 'bg-peligro', badge: 'danger', texto: 'Urgente' },
  atencion: { punto: 'bg-alerta', badge: 'warning', texto: 'Atención' },
  info: { punto: 'bg-acento', badge: 'info', texto: 'Aviso' },
};

export const PanelView: React.FC<PanelViewProps> = ({
  data,
  loading,
  error,
  onReintentar,
  onNavegar,
  onNuevaVenta,
  onNuevoPaquete,
}) => {
  // Un fallo de carga NO puede verse igual que "todavía cargando". Antes los
  // dos casos caían en el mismo spinner y la pantalla giraba para siempre sin
  // decir nada ni ofrecer salida.
  if (error && !data) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-borde bg-superficie p-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-peligro-suave text-peligro">
            <AlertTriangle size={22} />
          </div>
          <h2 className="text-body font-bold text-texto">No se pudo cargar tu resumen</h2>
          <p className="text-caption text-texto-2 break-words">{error}</p>
          {onReintentar && (
            <button
              type="button"
              onClick={onReintentar}
              className="mt-1 rounded-xl bg-acento px-4 py-2 text-label font-bold text-acento-texto transition-transform active:scale-[0.97] cursor-pointer"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    );
  }

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

  const [tipoGrafica, setTipoGrafica] = useState<TipoGraficaPanel>(() => {
    try {
      const guardada = localStorage.getItem('glow_panel_grafica_tipo') as TipoGraficaPanel;
      if (['rentabilidad', 'volumen', 'margen', 'costos'].includes(guardada)) {
        return guardada;
      }
    } catch {
      // Ignorar errores de localStorage
    }
    return 'rentabilidad';
  });

  const cambiarTipoGrafica = (tipo: TipoGraficaPanel) => {
    setTipoGrafica(tipo);
    try {
      localStorage.setItem('glow_panel_grafica_tipo', tipo);
    } catch {
      // Ignorar
    }
  };

  const infoGraficaActual = OPCIONES_GRAFICA.find((o) => o.id === tipoGrafica) || OPCIONES_GRAFICA[0];
  const IconoActual = infoGraficaActual.icono;

  const { showToast } = useToast();
  const scrollRevealRef = useScrollReveal<HTMLDivElement>({ threshold: 0.05, staggerMs: 30 });
  const [menuContextual, setMenuContextual] = useState<{
    x: number;
    y: number;
    tipo: 'deudor' | 'stock' | 'vendido' | 'fondo';
    item?: any;
  } | null>(null);

  const enviarCobroWhatsApp = (deudor: { cliente_nombre: string; saldo_usd_cents: number; codigo: string }) => {
    const texto = `Hola ${deudor.cliente_nombre}, te saludamos de Glow Heaven. Te escribimos para recordarte tu saldo pendiente de $${(deudor.saldo_usd_cents / 100).toFixed(2)} correspondiente a la compra ${deudor.codigo}. ¡Muchas gracias!`;
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    window.open(url, '_blank');
  };

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

  const datosVolumen: PuntoVolumen[] = historico.map((h) => ({
    etiqueta: etiquetaMes(h.mes),
    ordenes: h.ventas_count ?? 0,
    ingresosUsdCents: h.ingresos_usd_cents,
  }));

  const datosMargen: PuntoMargen[] = historico.map((h) => ({
    etiqueta: etiquetaMes(h.mes),
    margenPct:
      h.ingresos_usd_cents > 0
        ? Math.max(0, Math.round((h.ganancia_usd_cents / h.ingresos_usd_cents) * 100))
        : 0,
    gananciaUsdCents: h.ganancia_usd_cents,
    ingresosUsdCents: h.ingresos_usd_cents,
  }));


  const datosCostosIngresos: PuntoCostosIngresos[] = historico.map((h) => ({
    etiqueta: etiquetaMes(h.mes),
    ingresosUsdCents: h.ingresos_usd_cents,
    costosUsdCents: h.costos_usd_cents,
    gananciaUsdCents: h.ganancia_usd_cents,
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
    <div
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest('button, a, input, [role="menu"]')) return;
        e.preventDefault();
        setMenuContextual({ x: e.clientX, y: e.clientY, tipo: 'fondo' });
      }}
      // Sin fondo propio: lo pone el caparazon. `bg-fondo/50` mezclaba el negro
      // al 50% sobre el del caparazon y daba un negro distinto al del resto de
      // las pantallas; se notaba al cambiar de pestania.
      className="flex-1 overflow-y-auto animate-fade-in flex flex-col scroll-smooth"
    >
      <div
        ref={scrollRevealRef}
        className="px-4 md:px-6 py-3 md:py-3.5 max-w-[1500px] w-full mx-auto flex-1 flex flex-col justify-start gap-2.5"
      >
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
          /* Nivel 1: Cuatro tarjetas de métricas de alta jerarquía prominentes */
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 shrink-0 stagger-children">
            {/* 1. GANANCIA DE ESTE MES (Métrica estrella) */}
            <StatTile
              label="Ganancia de este mes"
              usd_cents={gananciaActual}
              soloUsd
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
              hint={
                (ganancia_mes_actual?.ventas_count ?? 0) === 1
                  ? '1 venta entregada'
                  : `${ganancia_mes_actual?.ventas_count ?? 0} ventas este mes`
              }
              onClick={() => onNavegar('ventas')}
            />

            {/* 2. INVERTIDO EN MERCADERÍA */}
            <StatTile
              label="Invertido en bodega"
              usd_cents={inversionTotal}
              soloUsd
              size="lg"
              tone="neutral"
              icon={Boxes}
              hint={
                resumen.unidades_en_inventario === 1
                  ? '1 unidad disponible'
                  : `${resumen.unidades_en_inventario} unidades disponibles`
              }
              onClick={() => onNavegar('inventario')}
            />

            {/* 3. TE DEBEN (CUENTAS POR COBRAR) */}
            <StatTile
              label="Te deben en la calle"
              usd_cents={resumen.por_cobrar_usd_cents}
              soloUsd
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
                  ? 'Cartera al día'
                  : data.por_cobrar.length === 1
                    ? '1 venta con saldo'
                    : `${data.por_cobrar.length} ventas con saldo`
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
                data.bajo_stock.length === 0
                  ? 'Existencias óptimas'
                  : data.bajo_stock.length === 1
                    ? '1 producto agotado o bajo'
                    : `${data.bajo_stock.length} productos agotados o bajos`
              }
              onClick={() => onNavegar('inventario')}
            />
          </div>
        )}

        {/* Nivel 2: Centro de alertas urgentes */}
        {urgentes.length > 0 && (
          <div className="rounded-xl border border-peligro-suave bg-peligro-suave p-3 shadow-2xs shrink-0 animate-slide-up">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-peligro/10 text-peligro flex items-center justify-center shrink-0 border border-peligro-suave">
                <AlertTriangle className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-peligro">
                    Atención requerida ({urgentes.length})
                  </span>
                </div>
                <div className="space-y-1 divide-y divide-peligro-suave">
                  {urgentes.map((a) => (
                    <div key={a.id} className="pt-1 first:pt-0">
                      <FilaAlerta alerta={a} onNavegar={onNavegar} compacta />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Nivel 3: Gráfica interactiva animada + Dónde está la plata */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-2.5 shrink-0">
          {/* Gráfica principal con selector ergonómico y animaciones fluidas */}
          <Card className="xl:col-span-2 shadow-2xs flex flex-col">
            <CardHeader className="px-4 py-2.5 shrink-0 border-b border-borde/40">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div
                    key={`icon-${tipoGrafica}`}
                    className="w-7 h-7 rounded-lg bg-acento/10 text-acento flex items-center justify-center shrink-0 transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-300 animate-in fade-in-0 zoom-in-95"
                  >
                    <IconoActual className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 overflow-hidden">
                    <h3
                      key={`title-${tipoGrafica}`}
                      className="text-body font-bold text-texto tracking-tight truncate transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-300 animate-in fade-in-0 slide-in-from-left-1"
                    >
                      {infoGraficaActual.titulo}
                    </h3>
                  </div>
                </div>

                {/* Selector Segmentado de Gráfica (Pills Switcher estable y suave) */}
                <div
                  className="flex items-center p-0.5 rounded-xl bg-superficie-2/90 border border-borde/70 shadow-2xs gap-0.5 overflow-x-auto max-w-full shrink-0"
                  role="tablist"
                  aria-label="Seleccionar perspectiva de gráfica"
                >
                  {OPCIONES_GRAFICA.map((opc) => {
                    const activa = tipoGrafica === opc.id;
                    const Icono = opc.icono;
                    return (
                      <button
                        key={opc.id}
                        type="button"
                        role="tab"
                        aria-selected={activa}
                        onClick={() => cambiarTipoGrafica(opc.id)}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-caption font-semibold whitespace-nowrap cursor-pointer shrink-0',
                          'transition-[background-color,color,border-color,box-shadow] duration-200 ease-out active:scale-[0.98]',
                          activa
                            ? 'bg-superficie text-texto shadow-xs border border-borde/80 font-bold'
                            : 'text-texto-3 hover:text-texto hover:bg-superficie/60'
                        )}
                        title={opc.subtitulo}
                      >
                        <Icono className={cn('w-3.5 h-3.5 transition-colors duration-200', activa ? 'text-acento' : 'text-texto-3')} />
                        <span>{opc.etiquetaCorta}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-2 flex-1 flex flex-col justify-center min-h-[220px]">
              {serie.some((s) => s.valor > 0 || (s.valorSecundario ?? 0) > 0) ? (
                <div key={`chart-view-${tipoGrafica}`} className="animate-in fade-in-0 duration-300 ease-out flex-1 flex flex-col justify-center">
                  {tipoGrafica === 'rentabilidad' && <LineaCreciente datos={serie} alto={160} />}
                  {tipoGrafica === 'volumen' && <GraficaVolumen datos={datosVolumen} alto={160} />}
                  {tipoGrafica === 'margen' && <GraficaMargen datos={datosMargen} alto={160} />}
                  {tipoGrafica === 'costos' && <GraficaCostosIngresos datos={datosCostosIngresos} alto={160} />}
                </div>
              ) : (
                <div className="relative h-[145px] rounded-xl overflow-hidden flex items-center justify-between p-4 bg-gradient-to-r from-superficie to-superficie-2/40 border border-dashed border-borde/80">
                  <div className="relative z-10 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-acento-suave text-acento flex items-center justify-center border border-acento/20 shrink-0">
                      <TrendingUp className="w-4 h-4 text-acento" />
                    </div>
                    <div>
                      <p className="text-body font-bold text-texto">
                        Tus métricas aparecerán aquí
                      </p>
                      <p className="text-caption text-texto-3 mt-0.5">
                        Se calcularán automáticamente con las ventas entregadas y costos reales.
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

          {/* Dónde está la plata (Distribución ejecutiva de capital sin repetición de porcentajes) */}
          {(() => {
            const capitalTotal = inversionTotal + resumen.por_cobrar_usd_cents;
            const pctBodega = capitalTotal > 0 ? Math.round((inversionTotal / capitalTotal) * 100) : 0;
            const pctCobrar = capitalTotal > 0 ? 100 - pctBodega : 0;

            return (
              <Card className="shadow-2xs flex flex-col justify-between h-full">
                <CardHeader className="px-4 py-2.5 border-b border-borde/40 shrink-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-acento/10 text-acento flex items-center justify-center shrink-0">
                        <Wallet className="w-4 h-4" />
                      </div>
                      <h3 className="text-body font-bold text-texto tracking-tight truncate">
                        Dónde está tu plata
                      </h3>
                    </div>
                    {capitalTotal > 0 && (
                      <div className="text-right shrink-0 pl-3.5 border-l border-borde/60 flex flex-col items-end justify-center">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-texto-3 leading-none mb-0.5">
                          Total Activo
                        </span>
                        <Money usd_cents={capitalTotal} size="sm" soloUsd className="font-bold text-texto font-mono leading-tight" />
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 flex-1 flex flex-col justify-between gap-3">
                  {capitalTotal > 0 ? (
                    <>
                      {/* Estado diagnóstico balanceado */}
                      <div className="rounded-xl px-3 py-2 bg-superficie-2/70 border border-borde/60 flex items-center justify-between gap-2 text-caption">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              'w-2 h-2 rounded-full shrink-0',
                              pctCobrar > 50 ? 'bg-alerta' : 'bg-acento'
                            )}
                          />
                          <span className="text-texto-2 font-medium">
                            {pctCobrar > 60
                              ? 'Mayor parte en la calle'
                              : pctBodega > 60
                                ? 'Mayor parte en bodega'
                                : 'Reparto equilibrado'}
                          </span>
                        </div>
                        <span className="font-mono font-bold text-texto shrink-0">
                          {pctCobrar}% a crédito
                        </span>
                      </div>

                      {/* Barra segmentada proporcional con etiquetas limpias */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] font-medium">
                          <span className="flex items-center gap-1.5 text-acento font-semibold">
                            <span className="w-2 h-2 rounded-full bg-acento" />
                            Bodega ({pctBodega}%)
                          </span>
                          <span className="flex items-center gap-1.5 text-alerta font-semibold">
                            <span className="w-2 h-2 rounded-full bg-alerta" />
                            Por cobrar ({pctCobrar}%)
                          </span>
                        </div>
                        <div className="h-2.5 w-full rounded-full bg-superficie-2 flex overflow-hidden gap-1">
                          <div
                            className="h-full bg-acento dark:bg-acento rounded-full transition-[width] duration-500 ease-out"
                            style={{ width: `${Math.max(pctBodega > 0 ? 4 : 0, pctBodega)}%` }}
                            title={`Bodega: ${pctBodega}%`}
                          />
                          <div
                            className="h-full bg-alerta rounded-full transition-[width] duration-500 ease-out"
                            style={{ width: `${Math.max(pctCobrar > 0 ? 4 : 0, pctCobrar)}%` }}
                            title={`Por cobrar: ${pctCobrar}%`}
                          />
                        </div>
                      </div>

                      {/* Accesos directos a bodega y cobranza sin repetición de porcentajes */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => onNavegar('inventario')}
                          className="flex items-center justify-between gap-1.5 rounded-xl border border-borde bg-superficie hover:bg-superficie-2 hover:border-borde-fuerte px-3 py-2 transition-[background-color,border-color,color,box-shadow,transform,opacity] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento cursor-pointer"
                        >
                          <div className="flex items-center gap-2 text-caption font-medium text-texto min-w-0">
                            <Boxes className="w-3.5 h-3.5 text-texto-3 group-hover:text-texto transition-colors shrink-0" />
                            <span className="truncate">Ver inventario</span>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-texto-3 group-hover:text-texto group-hover:translate-x-0.5 transition-[background-color,border-color,color,box-shadow,transform,opacity] shrink-0" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onNavegar('cobranza')}
                          className="flex items-center justify-between gap-1.5 rounded-xl border border-borde bg-superficie hover:bg-superficie-2 hover:border-borde-fuerte px-3 py-2 transition-[background-color,border-color,color,box-shadow,transform,opacity] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento cursor-pointer"
                        >
                          <div className="flex items-center gap-2 text-caption font-medium text-texto min-w-0">
                            <Wallet className="w-3.5 h-3.5 text-texto-3 group-hover:text-texto transition-colors shrink-0" />
                            <span className="truncate">Ver cobranza</span>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-texto-3 group-hover:text-texto group-hover:translate-x-0.5 transition-[background-color,border-color,color,box-shadow,transform,opacity] shrink-0" />
                        </button>
                      </div>

                      {/* Anticipos por entregar si existen */}
                      {resumen.anticipos_por_entregar_usd_cents > 0 && (
                        <div className="px-3 py-1.5 rounded-lg border border-alerta-suave bg-alerta-suave flex items-center justify-between text-[11px]">
                          <span className="font-medium text-alerta">Anticipos por entregar:</span>
                          <Money usd_cents={resumen.anticipos_por_entregar_usd_cents} size="sm" soloUsd className="font-bold text-alerta font-mono" />
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-5 flex flex-col items-center justify-center text-center gap-1 text-texto-3">
                      <Wallet className="w-6 h-6 text-borde-fuerte" />
                      <p className="text-body font-semibold text-texto-2">Sin capital registrado aún</p>
                      <p className="text-caption text-texto-3 max-w-xs">
                        Cuando registres tu primer paquete verás el desglose de tu inversión.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Nivel 4: Widgets Operativos Bento Pulse (Equilibrados, sin scrollbars y con micro-interacciones) */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 shrink-0 stagger-children">
          {/* 1. QUIÉN TE DEBE */}
          <Card className="shadow-xs card-hover-lift flex flex-col justify-between rounded-2xl border border-borde/70 bg-superficie overflow-hidden">
            <div>
              <CardHeader className="px-4 py-2.5 border-b border-borde/40 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-alerta/10 text-alerta flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <h3 className="text-body font-bold text-texto truncate">Quién te debe</h3>
                    {data.por_cobrar.length > 0 && (
                      <Badge tone={data.por_cobrar.some((p) => p.cuotas_vencidas > 0) ? 'danger' : 'warning'}>
                        {data.por_cobrar.length}
                      </Badge>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavegar('cobranza')}
                    className="inline-flex items-center gap-1 text-caption text-texto-3 hover:text-acento font-medium transition-colors cursor-pointer group shrink-0"
                  >
                    <span>Ver todo</span>
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {data.por_cobrar.length > 0 ? (
                  <ul className="divide-y divide-borde/40">
                    {data.por_cobrar.slice(0, 4).map((p) => (
                      <li key={p.venta_id}>
                        <div
                          onClick={() => onNavegar('ventas', p.venta_id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuContextual({ x: e.clientX, y: e.clientY, tipo: 'deudor', item: p });
                          }}
                          className="w-full px-4 py-2 hover:bg-superficie-2/70 transition-colors flex items-center justify-between gap-3 group cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-7 h-7 rounded-full bg-superficie-2 text-texto-2 font-semibold text-xs flex items-center justify-center border border-borde/70 shrink-0 group-hover:scale-105 transition-transform">
                              {p.cliente_nombre.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-body font-semibold text-texto truncate group-hover:text-acento transition-colors flex items-center gap-1.5">
                                <span className="truncate">{p.cliente_nombre}</span>
                                {p.cuotas_vencidas > 0 && (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-peligro-suave text-peligro dark:bg-peligro-suave dark:text-peligro border border-peligro-suave shrink-0">
                                    {p.cuotas_vencidas} vencida{p.cuotas_vencidas > 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              <span className="text-caption text-texto-3 font-medium">
                                Ref: {p.codigo}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0 flex items-center gap-2">
                            <div>
                              <Money usd_cents={p.saldo_usd_cents} size="sm" soloUsd className="font-extrabold text-alerta tabular" />
                              <div className="text-[10px] text-texto-3 font-medium">saldo</div>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                enviarCobroWhatsApp(p);
                              }}
                              title="Cobrar por WhatsApp"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-texto-3 hover:text-acento hover:bg-acento-suave dark:hover:bg-acento-suave transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-6 px-4 flex flex-col items-center justify-center text-center gap-1.5">
                    <div className="w-7 h-7 rounded-full bg-acento/10 text-acento flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <span className="text-body font-semibold text-texto">Cuentas al día</span>
                    <span className="text-caption text-texto-3">No hay clientes con saldo pendiente</span>
                  </div>
                )}
              </CardContent>
            </div>
          </Card>

          {/* 2. STOCK POR AGOTARSE */}
          <Card className="shadow-xs card-hover-lift flex flex-col justify-between rounded-2xl border border-borde/70 bg-superficie overflow-hidden">
            <div>
              <CardHeader className="px-4 py-2.5 border-b border-borde/40 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-peligro/10 text-peligro flex items-center justify-center shrink-0">
                      <PackageX className="w-4 h-4" />
                    </div>
                    <h3 className="text-body font-bold text-texto truncate">Stock crítico</h3>
                    {data.bajo_stock.length > 0 ? (
                      <Badge tone="danger">{data.bajo_stock.length}</Badge>
                    ) : (
                      <Badge tone="success">Óptimo</Badge>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavegar('inventario')}
                    className="inline-flex items-center gap-1 text-caption text-texto-3 hover:text-acento font-medium transition-colors cursor-pointer group shrink-0"
                  >
                    <span>Ver todo</span>
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {data.bajo_stock.length > 0 ? (
                  <ul className="divide-y divide-borde/40">
                    {data.bajo_stock.slice(0, 4).map((p) => (
                      <li key={p.producto_id}>
                        <button
                          onClick={() => onNavegar('inventario', p.producto_id)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuContextual({ x: e.clientX, y: e.clientY, tipo: 'stock', item: p });
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-superficie-2/70 transition-colors flex items-center justify-between gap-3 group"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="text-body font-semibold text-texto truncate block group-hover:text-acento transition-colors">
                              {p.nombre}
                            </span>
                            <span className="text-caption text-texto-3">
                              Mínimo: {p.stock_minimo} unid.
                            </span>
                          </div>
                          <span
                            className={cn(
                              'text-[11px] font-bold px-2 py-0.5 rounded-md border shrink-0',
                              p.existencias === 0
                                ? 'bg-peligro-suave text-peligro border-peligro-suave dark:bg-peligro-suave dark:text-peligro dark:border-peligro-suave'
                                : 'bg-alerta-suave text-alerta border-alerta-suave dark:bg-alerta-suave dark:text-alerta dark:border-alerta-suave'
                            )}
                          >
                            {p.existencias === 0 ? 'Agotado (0)' : `${p.existencias} en stock`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-6 px-4 flex flex-col items-center justify-center text-center gap-1.5">
                    <div className="w-7 h-7 rounded-full bg-acento/10 text-acento flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <span className="text-body font-semibold text-texto">Stock saludable</span>
                    <span className="text-caption text-texto-3">Todos los productos tienen existencias</span>
                  </div>
                )}
              </CardContent>
            </div>
          </Card>

          {/* 3. LO QUE MÁS SE VENDE (TOP ROTACIÓN) */}
          <Card className="shadow-xs card-hover-lift flex flex-col justify-between rounded-2xl border border-borde/70 bg-superficie overflow-hidden">
            <div>
              <CardHeader className="px-4 py-2.5 border-b border-borde/40 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-superficie-2 text-texto-2 flex items-center justify-center shrink-0 border border-borde/60">
                      <Award className="w-4 h-4" />
                    </div>
                    <h3 className="text-body font-bold text-texto truncate">Más vendidos</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavegar('ventas')}
                    className="inline-flex items-center gap-1 text-caption text-texto-3 hover:text-acento font-medium transition-colors cursor-pointer group shrink-0"
                  >
                    <span>Ver historial</span>
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {data.mas_vendidos.length > 0 ? (
                  <ul className="divide-y divide-borde/40">
                    {data.mas_vendidos.slice(0, 4).map((p, idx) => (
                      <li
                        key={p.producto_id}
                        onClick={() => onNavegar('inventario', p.producto_id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuContextual({ x: e.clientX, y: e.clientY, tipo: 'vendido', item: p });
                        }}
                        className="px-4 py-2 flex items-center justify-between gap-3 hover:bg-superficie-2/70 transition-colors cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <span className="w-5 h-5 rounded-md text-[11px] font-mono font-bold flex items-center justify-center border shrink-0 bg-superficie-2 text-texto-2 border-borde/70">
                            {idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="text-body font-semibold text-texto truncate group-hover:text-acento transition-colors">
                              {p.nombre}
                            </div>
                            <div className="text-caption text-texto-3">
                              {p.unidades_vendidas_90d} unidad{p.unidades_vendidas_90d === 1 ? '' : 'es'} vendida{p.unidades_vendidas_90d === 1 ? '' : 's'}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <Money usd_cents={p.ganancia_90d_usd_cents} size="sm" soloUsd className="font-extrabold text-acento tabular" />
                          <div className="text-[10px] text-texto-3 font-medium">ganancia</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="py-6 px-4 flex flex-col items-center justify-center text-center gap-1.5">
                    <span className="text-body font-semibold text-texto">Sin ventas aún</span>
                    <span className="text-caption text-texto-3">Los productos destacados aparecerán con tus ventas</span>
                  </div>
                )}
              </CardContent>
            </div>
          </Card>
        </div>

        {/* Avisos secundarios que no son urgentes ni duplicados de stock */}
        {avisosOperativos.length > 0 && (
          <Card className="shadow-2xs shrink-0">
            <CardHeader className="px-4 py-1.5">
              <SectionHeader icon={AlertTriangle} title="Avisos Operativos del Sistema" />
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-borde/50">
                {avisosOperativos.map((a) => (
                  <li key={a.id} className="px-4 py-1.5 hover:bg-superficie-2/40 transition-colors">
                    <FilaAlerta alerta={a} onNavegar={onNavegar} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {menuContextual && (
        <ContextMenu
          x={menuContextual.x}
          y={menuContextual.y}
          onClose={() => setMenuContextual(null)}
          items={
            menuContextual.tipo === 'deudor'
              ? [
                  {
                    id: 'ver-venta',
                    label: `Ver venta (${menuContextual.item.codigo})`,
                    icon: <Eye className="w-4 h-4" />,
                    shortcut: 'Espacio',
                    onClick: () => onNavegar('ventas', menuContextual.item.venta_id),
                  },
                  {
                    id: 'abono',
                    label: 'Registrar abono / Cobrar',
                    icon: <DollarSign className="w-4 h-4" />,
                    tone: 'success' as const,
                    onClick: () => onNavegar('ventas', menuContextual.item.venta_id),
                  },
                  {
                    id: 'whatsapp',
                    label: 'Cobrar por WhatsApp',
                    icon: <MessageCircle className="w-4 h-4" />,
                    onClick: () => enviarCobroWhatsApp(menuContextual.item),
                  },
                  'separator' as const,
                  {
                    id: 'copiar-codigo',
                    label: `Copiar código (${menuContextual.item.codigo})`,
                    icon: <Copy className="w-4 h-4" />,
                    onClick: () => {
                      navigator.clipboard.writeText(menuContextual.item.codigo);
                      showToast({ message: 'Código de venta copiado al portapapeles', type: 'info' });
                    },
                  },
                  {
                    id: 'copiar-cliente',
                    label: `Copiar clienta (${menuContextual.item.cliente_nombre})`,
                    icon: <Copy className="w-4 h-4" />,
                    onClick: () => {
                      navigator.clipboard.writeText(menuContextual.item.cliente_nombre);
                      showToast({ message: 'Nombre de la clienta copiado', type: 'info' });
                    },
                  },
                ]
              : menuContextual.tipo === 'stock'
                ? [
                    {
                      id: 'ver-inventario',
                      label: `Ver en inventario (${menuContextual.item.nombre})`,
                      icon: <Eye className="w-4 h-4" />,
                      shortcut: 'Espacio',
                      onClick: () => onNavegar('inventario', menuContextual.item.producto_id),
                    },
                    'separator' as const,
                    {
                      id: 'copiar-nombre',
                      label: 'Copiar nombre del producto',
                      icon: <Copy className="w-4 h-4" />,
                      onClick: () => {
                        navigator.clipboard.writeText(menuContextual.item.nombre);
                        showToast({ message: 'Nombre del producto copiado', type: 'info' });
                      },
                    },
                  ]
                : menuContextual.tipo === 'vendido'
                  ? [
                      {
                        id: 'ver-inventario',
                        label: `Ver en inventario (${menuContextual.item.nombre})`,
                        icon: <Eye className="w-4 h-4" />,
                        shortcut: 'Espacio',
                        onClick: () => onNavegar('inventario', menuContextual.item.producto_id),
                      },
                      'separator' as const,
                      {
                        id: 'copiar-nombre',
                        label: 'Copiar nombre del producto',
                        icon: <Copy className="w-4 h-4" />,
                        onClick: () => {
                          navigator.clipboard.writeText(menuContextual.item.nombre);
                          showToast({ message: 'Nombre del producto copiado', type: 'info' });
                        },
                      },
                    ]
                  : [
                      {
                        id: 'nueva-venta',
                        label: 'Nueva venta rápida',
                        icon: <Plus className="w-4 h-4" />,
                        tone: 'success' as const,
                        onClick: onNuevaVenta,
                      },
                      {
                        id: 'nuevo-paquete',
                        label: 'Registrar paquete / envío',
                        icon: <Package className="w-4 h-4" />,
                        onClick: onNuevoPaquete,
                      },
                      'separator' as const,
                      {
                        id: 'ir-inventario',
                        label: 'Ir a Inventario',
                        icon: <Boxes className="w-4 h-4" />,
                        onClick: () => onNavegar('inventario'),
                      },
                      {
                        id: 'ir-ventas',
                        label: 'Ir a Ventas y Cobros',
                        icon: <Wallet className="w-4 h-4" />,
                        onClick: () => onNavegar('ventas'),
                      },
                      {
                        id: 'ir-clientes',
                        label: 'Ir a Clientes',
                        icon: <Users className="w-4 h-4" />,
                        onClick: () => onNavegar('clientes'),
                      },
                    ]
          }
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------

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
              compacta ? 'text-peligro font-bold' : 'text-texto font-medium'
            )}
          >
            {alerta.titulo}
          </div>
          <div className={cn('text-caption', compacta ? 'text-peligro' : 'text-texto-3')}>
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
