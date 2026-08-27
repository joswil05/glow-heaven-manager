import React, { useState, useEffect, useMemo } from 'react';
import {
  Calculator,
  Plus,
  Trash2,
  Share2,
  ShoppingBag,
  FileText,
} from 'lucide-react';
import type {
  Cliente,
  Categoria,
  Tienda,
  Cotizacion,
  ParametrosSistema,
} from '../../../shared/types';
import type { ItemCapturaRapida } from '@core/parser-rapido';
import {
  calcularCotizacion,
  CotizarItemInput,
  ParametrosEntidadesCotizacion,
} from '@core/precios';
import { generarMensajeCotizacionWhatsApp } from '@core/plantillas';
import { formatearMoneda } from '@core/moneda';
import { QuickCapture } from '../components/QuickCapture';
import { DualMoneyDisplay } from '../components/shared/DualMoneyDisplay';
import { EmptyState } from '../components/shared/EmptyState';
import { useToast } from '../context/ToastContext';

interface CotizadorViewProps {
  clientes: Cliente[];
  categorias: Categoria[];
  tiendas: Tienda[];
  parametros: ParametrosSistema | null;
  onNewCliente: () => void;
  onCotizacionConvertedToPedido?: (pedidoId: number) => void;
}

interface DraftItem {
  id: string;
  descripcion: string;
  tienda_id?: number;
  categoria_id?: number;
  precio_usa_usd: string; // string para edición suave
  peso_lb: string; // string para edición suave
  url?: string;
}

export const CotizadorView: React.FC<CotizadorViewProps> = ({
  clientes,
  categorias,
  tiendas,
  parametros,
  onNewCliente,
  onCotizacionConvertedToPedido,
}) => {
  const { showToast, showUndoToast } = useToast();

  const [activeSubTab, setActiveSubTab] = useState<'nueva' | 'historial'>('nueva');
  const [selectedClienteId, setSelectedClienteId] = useState<number | ''>('');
  const [anticipoPorcentaje, setAnticipoPorcentaje] = useState<number>(50);
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Lista de ítems en borrador
  const [draftItems, setDraftItems] = useState<DraftItem[]>([
    {
      id: 'item_1',
      descripcion: 'Perfume Dior Sauvage 100ml',
      tienda_id: tiendas.find((t) => t.nombre.toLowerCase().includes('sephora'))?.id,
      categoria_id: categorias.find((c) => c.nombre.toLowerCase().includes('perfum'))?.id,
      precio_usa_usd: '128.00',
      peso_lb: '1.50',
    },
  ]);

  // Lista de cotizaciones guardadas para la pestaña de historial
  const [cotizacionesList, setCotizacionesList] = useState<Cotizacion[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  const selectedCliente = useMemo(() => {
    return clientes.find((c) => c.id === Number(selectedClienteId));
  }, [clientes, selectedClienteId]);

  // Auto-ajustar anticipo a 70% si el cliente tiene historial de incumplimiento
  useEffect(() => {
    if (selectedCliente?.incumplio_anteriormente) {
      setAnticipoPorcentaje(70);
      showToast({
        message: 'Aviso: Cliente con historial de incumplimiento. Anticipo sugerido al 70%.',
        type: 'info',
      });
    }
  }, [selectedCliente, showToast]);

  const loadCotizacionesList = async () => {
    setLoadingList(true);
    const res = await window.api.cotizaciones.list();
    if (res.success) setCotizacionesList(res.data);
    setLoadingList(false);
  };

  useEffect(() => {
    if (activeSubTab === 'historial') {
      loadCotizacionesList();
    }
  }, [activeSubTab]);

  // Manejar captura rápida desde el componente
  const handleParsedItem = (parsed: ItemCapturaRapida) => {
    const tiendaEncontrada = parsed.tienda
      ? tiendas.find((t) => t.nombre.toLowerCase().includes(parsed.tienda!.toLowerCase()))
      : undefined;

    const catEncontrada = parsed.categoria_sugerida
      ? categorias.find((c) => c.nombre.toLowerCase().includes(parsed.categoria_sugerida!.toLowerCase()))
      : undefined;

    const newItem: DraftItem = {
      id: `item_${Date.now()}`,
      descripcion: parsed.descripcion,
      tienda_id: tiendaEncontrada?.id,
      categoria_id: catEncontrada?.id,
      precio_usa_usd: parsed.precio_usa_usd_cents
        ? (parsed.precio_usa_usd_cents / 100).toFixed(2)
        : '0.00',
      peso_lb: parsed.peso_mlb ? (parsed.peso_mlb / 1000).toFixed(2) : '1.00',
      url: parsed.url,
    };

    setDraftItems((prev) => [...prev, newItem]);
    showToast({ message: `Agregado: ${parsed.descripcion}`, type: 'success' });
  };

  const handleAddItem = () => {
    setDraftItems((prev) => [
      ...prev,
      {
        id: `item_${Date.now()}`,
        descripcion: '',
        precio_usa_usd: '0.00',
        peso_lb: '1.00',
      },
    ]);
  };

  const handleUpdateItem = (id: string, field: keyof DraftItem, value: any) => {
    setDraftItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveItem = (id: string) => {
    if (draftItems.length <= 1) {
      showToast({ message: 'La cotización debe tener al menos un ítem.', type: 'info' });
      return;
    }
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
  };

  // CÁLCULO EN TIEMPO REAL CON EL CORE PURO
  const calculoCotizacion = useMemo(() => {
    if (!parametros) return null;

    const catMap = new Map(categorias.map((c) => [c.id, c]));
    const tiendaMap = new Map(tiendas.map((t) => [t.id, t]));

    const itemsInput: CotizarItemInput[] = draftItems.map((item, idx) => {
      const cat = item.categoria_id ? catMap.get(item.categoria_id) : undefined;
      const tienda = item.tienda_id ? tiendaMap.get(item.tienda_id) : undefined;

      const precioUsa = Math.round((parseFloat(item.precio_usa_usd) || 0) * 100);
      const pesoMlb = Math.round((parseFloat(item.peso_lb) || 0) * 1000);

      return {
        id: idx + 1,
        descripcion: item.descripcion || 'Producto sin descripción',
        tienda_id: item.tienda_id,
        categoria_id: item.categoria_id,
        precio_usa_usd_cents: precioUsa,
        peso_mlb: pesoMlb,
        tax_rate_tienda_bp: tienda?.tax_rate_bp ?? parametros.tax_usa_default_bp,
        arancel_categoria_bp: cat?.arancel_estimado_bp ?? parametros.arancel_default_bp,
        comision_categoria_bp: cat?.comision_defecto_bp ?? 3500,
        redondeo_categoria_cor_cents: cat?.redondeo_cor_cents ?? 5000,
      };
    });

    const paramsCalculo: ParametrosEntidadesCotizacion = {
      tasa_cambio_cents: parametros.tasa_cambio_oficial_cents,
      tarifa_flete_cents_lb: parametros.tarifa_flete_cents_lb,
      flete_minimo_usd_cents: parametros.flete_minimo_usd_cents,
      otros_costos_fijos_usd_cents: parametros.otros_costos_fijos_usd_cents ?? 1000,
      umbral_arancel_excedente_usd_cents: parametros.umbral_arancel_excedente_usd_cents,
      arancel_default_bp: parametros.arancel_default_bp,
      tax_usa_default_bp: parametros.tax_usa_default_bp,
      comision_minima_cotizacion_cor_cents: parametros.comision_minima_cotizacion_cor_cents,
      anticipo_default_bp: anticipoPorcentaje * 100,
    };

    return calcularCotizacion(itemsInput, paramsCalculo, anticipoPorcentaje * 100);
  }, [draftItems, categorias, tiendas, parametros, anticipoPorcentaje]);

  // Copiar para WhatsApp Ctrl+Shift+C (U3)
  const handleCopiarWhatsApp = () => {
    if (!calculoCotizacion || !parametros) return;

    const clienteNombre = selectedCliente ? selectedCliente.nombre : 'Cliente Estimado';
    const codigoCot = 'COT-PREVIA';

    const texto = generarMensajeCotizacionWhatsApp({
      cliente_nombre: clienteNombre,
      codigo_cotizacion: codigoCot,
      items: calculoCotizacion.items.map((i) => ({
        descripcion: i.descripcion,
        precio_cor_cents: i.precio_final_cor_cents,
        precio_usd_cents: i.precio_final_usd_cents,
      })),
      total_cor_cents: calculoCotizacion.totales.total_final_cor_cents,
      total_usd_cents: calculoCotizacion.totales.total_final_usd_cents,
      anticipo_cor_cents: calculoCotizacion.totales.anticipo_total_cor_cents,
      anticipo_usd_cents: calculoCotizacion.totales.anticipo_total_usd_cents,
      anticipo_porcentaje: anticipoPorcentaje,
      cuentas_bancarias: parametros.cuentas_bancarias,
    });

    navigator.clipboard.writeText(texto);
    showToast({
      message: '¡Mensaje formateado copiado al portapapeles para WhatsApp!',
      type: 'success',
    });
  };

  // Guardar y Convertir a Pedido
  const handleConvertirAPedido = async () => {
    if (!selectedClienteId) {
      showToast({ message: 'Por favor selecciona un cliente primero.', type: 'error' });
      return;
    }

    try {
      setGuardando(true);

      const itemsParaGuardar = draftItems.map((item) => ({
        descripcion: item.descripcion.trim() || 'Producto',
        tienda_id: item.tienda_id,
        categoria_id: item.categoria_id,
        url: item.url,
        precio_usa_usd_cents: Math.round((parseFloat(item.precio_usa_usd) || 0) * 100),
        peso_mlb: Math.round((parseFloat(item.peso_lb) || 0) * 1000),
      }));

      // 1. Crear cotización
      const resCot = await window.api.cotizaciones.create({
        cliente_id: Number(selectedClienteId),
        items: itemsParaGuardar,
        anticipo_bp: anticipoPorcentaje * 100,
        notas: notas.trim() || undefined,
      });

      if (!resCot.success) {
        showToast({ message: resCot.error.message, type: 'error' });
        return;
      }

      // 2. Convertir a pedido
      const resPed = await window.api.cotizaciones.convertirAPedido(resCot.data.id, notas);

      if (resPed.success) {
        showUndoToast(
          `Pedido ${resPed.data.codigo} creado a partir de la cotización`,
          () => {
            if (activeSubTab === 'historial') loadCotizacionesList();
          }
        );

        if (onCotizacionConvertedToPedido) {
          onCotizacionConvertedToPedido(resPed.data.id);
        }
      } else {
        showToast({ message: resPed.error.message, type: 'error' });
      }
    } catch {
      showToast({ message: 'Error al procesar el pedido', type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Sub-header de pestañas */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('nueva')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeSubTab === 'nueva'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Nueva Cotización
          </button>
          <button
            onClick={() => setActiveSubTab('historial')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
              activeSubTab === 'historial'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Cotizaciones Guardadas
          </button>
        </div>

        {activeSubTab === 'nueva' && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopiarWhatsApp}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
              title="Copiar desglose formateado para WhatsApp (Ctrl+Shift+C)"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Copiar para WhatsApp</span>
              <kbd className="px-1.5 py-0.5 bg-emerald-800/60 rounded text-[10px] font-mono text-white/90">
                Ctrl+Shift+C
              </kbd>
            </button>
          </div>
        )}
      </div>

      {activeSubTab === 'nueva' ? (
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna Izquierda (2 spans): Cliente y Lista de Ítems */}
          <div className="lg:col-span-2 space-y-5">
            {/* Selector de Cliente */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Cliente a cotizar
                </label>
                <select
                  value={selectedClienteId}
                  onChange={(e) =>
                    setSelectedClienteId(e.target.value ? Number(e.target.value) : '')
                  }
                  className="w-full bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:border-glow-500"
                >
                  <option value="">-- Seleccionar cliente existente --</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} (📞 {c.telefono}) {c.incumplio_anteriormente ? '⚠️' : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Notas adicionales (opcional)..."
                  className="w-full mt-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700 focus:outline-none focus:border-glow-500"
                />
              </div>

              <button
                type="button"
                onClick={onNewCliente}
                className="mt-5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors shrink-0"
              >
                + Nuevo Cliente
              </button>
            </div>

            {/* Captura Rápida Inteligente */}
            <QuickCapture onParsedItem={handleParsedItem} />

            {/* Grid Interactivo de Ítems */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-slate-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Productos a Cotizar ({draftItems.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-1 text-xs font-bold text-glow-600 hover:text-glow-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar otro producto</span>
                </button>
              </div>

              <div className="space-y-3">
                {draftItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-2.5 transition-all hover:border-slate-300"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black text-slate-400">#{idx + 1}</span>
                      <input
                        type="text"
                        value={item.descripcion}
                        onChange={(e) =>
                          handleUpdateItem(item.id, 'descripcion', e.target.value)
                        }
                        placeholder="Descripción del producto (ej: Tenis Nike Air Max)"
                        className="flex-1 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 rounded-xl border border-slate-200 focus:outline-none focus:border-glow-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-slate-400 hover:text-rose-500 p-1 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
                      {/* Tienda */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                          Tienda USA
                        </label>
                        <select
                          value={item.tienda_id ?? ''}
                          onChange={(e) =>
                            handleUpdateItem(
                              item.id,
                              'tienda_id',
                              e.target.value ? Number(e.target.value) : undefined
                            )
                          }
                          className="w-full bg-white px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-medium"
                        >
                          <option value="">(Sin tienda)</option>
                          {tiendas.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.nombre} {t.tax_rate_bp === 0 ? '(0% Tax)' : '(7% Tax)'}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Categoría */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                          Categoría
                        </label>
                        <select
                          value={item.categoria_id ?? ''}
                          onChange={(e) =>
                            handleUpdateItem(
                              item.id,
                              'categoria_id',
                              e.target.value ? Number(e.target.value) : undefined
                            )
                          }
                          className="w-full bg-white px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-medium"
                        >
                          <option value="">(Sin categoría)</option>
                          {categorias.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre} ({c.comision_defecto_bp / 100}%)
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Precio USA */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                          Precio USA ($)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={item.precio_usa_usd}
                          onChange={(e) =>
                            handleUpdateItem(item.id, 'precio_usa_usd', e.target.value)
                          }
                          className="w-full bg-white px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 text-right"
                        />
                      </div>

                      {/* Peso en Libras */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                          Peso (lb)
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={item.peso_lb}
                          onChange={(e) =>
                            handleUpdateItem(item.id, 'peso_lb', e.target.value)
                          }
                          className="w-full bg-white px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 text-right"
                        />
                      </div>
                    </div>

                    {/* Resultado calculado por ítem */}
                    {calculoCotizacion && calculoCotizacion.items[idx] && (
                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                        <div className="text-slate-500 text-[11px]">
                          Costo aterrizado est: ${' '}
                          {(
                            calculoCotizacion.items[idx]
                              .costo_aterrizado_estimado_usd_cents / 100
                          ).toFixed(2)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-500">
                            Precio final sugerido:
                          </span>
                          <DualMoneyDisplay
                            cor_cents={calculoCotizacion.items[idx].precio_final_cor_cents}
                            usd_cents={calculoCotizacion.items[idx].precio_final_usd_cents}
                            size="base"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Columna Derecha (1 span): Desglose y Resumen de Totales */}
          <div className="space-y-5">
            {calculoCotizacion && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5 sticky top-6">
                <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
                  Resumen de Cotización
                </h3>

                {/* Desglose de costos estimados */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal compras USA:</span>
                    <span>
                      {formatearMoneda(
                        calculoCotizacion.totales.subtotal_usa_usd_cents,
                        'USD'
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Tax USA estimado:</span>
                    <span>
                      {formatearMoneda(
                        calculoCotizacion.totales.tax_usa_total_usd_cents,
                        'USD'
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Flete estimado (por peso):</span>
                    <span>
                      {formatearMoneda(
                        calculoCotizacion.totales.flete_estimado_total_usd_cents,
                        'USD'
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Arancel estimado (excedente $50):</span>
                    <span>
                      {formatearMoneda(
                        calculoCotizacion.totales.arancel_estimado_total_usd_cents,
                        'USD'
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-800 font-semibold pt-1 border-t border-slate-100">
                    <span>Costo aterrizado total:</span>
                    <span>
                      {formatearMoneda(
                        calculoCotizacion.totales.costo_aterrizado_total_usd_cents,
                        'USD'
                      )}
                    </span>
                  </div>

                  <div className="flex justify-between text-glow-700 font-bold">
                    <span>Ganancia / Comisión total:</span>
                    <span>
                      {formatearMoneda(
                        calculoCotizacion.totales.comision_total_cor_cents,
                        'COR'
                      )}
                    </span>
                  </div>
                </div>

                {/* Total Final Dual */}
                <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-1">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Total a Cobrar al Cliente
                  </div>
                  <div className="text-2xl font-black tracking-tight text-glow-300">
                    {formatearMoneda(
                      calculoCotizacion.totales.total_final_cor_cents,
                      'COR'
                    )}
                  </div>
                  <div className="text-xs font-semibold text-slate-400">
                    Equivalente:{' '}
                    {formatearMoneda(
                      calculoCotizacion.totales.total_final_usd_cents,
                      'USD'
                    )}
                  </div>
                </div>

                {/* Configuración de Anticipo (50/50 o 70/30) */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700">Porcentaje de Anticipo:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setAnticipoPorcentaje(50)}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                          anticipoPorcentaje === 50
                            ? 'bg-glow-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnticipoPorcentaje(70)}
                        className={`px-2.5 py-1 rounded-lg font-bold text-xs ${
                          anticipoPorcentaje === 70
                            ? 'bg-glow-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        70%
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1.5">
                    <div className="flex justify-between font-semibold text-slate-800">
                      <span>Anticipo ({anticipoPorcentaje}%):</span>
                      <span className="font-bold text-glow-700">
                        {formatearMoneda(
                          calculoCotizacion.totales.anticipo_total_cor_cents,
                          'COR'
                        )}{' '}
                        (
                        {formatearMoneda(
                          calculoCotizacion.totales.anticipo_total_usd_cents,
                          'USD'
                        )}
                        )
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Saldo contraentrega:</span>
                      <span>
                        {formatearMoneda(
                          calculoCotizacion.totales.saldo_total_cor_cents,
                          'COR'
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botón Principal: Convertir a Pedido */}
                <button
                  type="button"
                  onClick={handleConvertirAPedido}
                  disabled={guardando || !selectedClienteId}
                  className="w-full py-3 bg-glow-600 hover:bg-glow-700 disabled:opacity-50 text-white font-bold rounded-2xl text-xs transition-all shadow-md flex items-center justify-center gap-2 active:scale-95"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>
                    {guardando ? 'Convirtiendo...' : 'Aceptar y Convertir a Pedido'}
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Pestaña: Historial de Cotizaciones Guardadas */
        <div className="flex-1 p-6 overflow-y-auto">
          {loadingList ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              Cargando cotizaciones...
            </div>
          ) : cotizacionesList.length > 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
              {cotizacionesList.map((cot) => (
                <div
                  key={cot.id}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-sm text-slate-900">{cot.codigo}</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">
                        {cot.estado}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Fecha: {cot.fecha} • Válida hasta: {cot.valida_hasta}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm font-bold text-slate-900">
                        {formatearMoneda(cot.total_cor_cents, 'COR')}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatearMoneda(cot.total_usd_cents, 'USD')}
                      </div>
                    </div>

                    {cot.estado === 'BORRADOR' || cot.estado === 'ENVIADA' ? (
                      <button
                        onClick={async () => {
                          const res = await window.api.cotizaciones.convertirAPedido(cot.id);
                          if (res.success) {
                            showToast({
                              message: `Cotización convertida a Pedido ${res.data.codigo}`,
                              type: 'success',
                            });
                            loadCotizacionesList();
                            if (onCotizacionConvertedToPedido) {
                              onCotizacionConvertedToPedido(res.data.id);
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors"
                      >
                        Convertir a Pedido
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="No hay cotizaciones guardadas"
              description="Las cotizaciones que crees aparecerán acá para darles seguimiento o convertirlas a pedidos."
              actionText="Crear Cotización"
              onAction={() => setActiveSubTab('nueva')}
            />
          )}
        </div>
      )}
    </div>
  );
};
