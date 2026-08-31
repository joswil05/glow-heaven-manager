import React, { useState, useEffect, useMemo } from 'react';
import { Share2, Plus } from 'lucide-react';
import type {
  Cliente,
  Categoria,
  Tienda,
  Cotizacion,
  ParametrosSistema,
} from '../../../shared/types';
import { generarMensajeCotizacionWhatsApp } from '@core/plantillas';
import { QuickCapture } from '../components/QuickCapture';
import { useToast } from '../context/ToastContext';
import { Card, CardContent, Field, Select, Input, Button } from '../components/ui';
import { cn } from '../lib/cn';
import { useCotizacionDraft } from './cotizador/useCotizacionDraft';
import { ItemsEditor } from './cotizador/ItemsEditor';
import { ResumenPanel } from './cotizador/ResumenPanel';
import { HistorialCotizaciones } from './cotizador/HistorialCotizaciones';

interface CotizadorViewProps {
  clientes: Cliente[];
  categorias: Categoria[];
  tiendas: Tienda[];
  parametros: ParametrosSistema | null;
  onNewCliente: () => void;
  onCotizacionConvertedToPedido?: (pedidoId: number) => void;
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
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  const {
    draftItems,
    calculo,
    anticipoPorcentaje,
    setAnticipoPorcentaje,
    addItem,
    updateItem,
    removeItem,
    handleParsedItem,
  } = useCotizacionDraft({
    categorias,
    tiendas,
    parametros,
  });

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
  }, [selectedCliente, setAnticipoPorcentaje, showToast]);

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

  // Atajo de teclado Ctrl+Shift+C
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopiarWhatsApp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleCopiarWhatsApp = () => {
    if (!calculo || !parametros) return;

    const clienteNombre = selectedCliente ? selectedCliente.nombre : 'Cliente Estimado';
    const codigoCot = 'COT-PREVIA';

    const texto = generarMensajeCotizacionWhatsApp({
      cliente_nombre: clienteNombre,
      codigo_cotizacion: codigoCot,
      items: calculo.items.map((i) => ({
        descripcion: i.descripcion,
        precio_cor_cents: i.precio_final_cor_cents,
        precio_usd_cents: i.precio_final_usd_cents,
      })),
      total_cor_cents: calculo.totales.total_final_cor_cents,
      total_usd_cents: calculo.totales.total_final_usd_cents,
      anticipo_cor_cents: calculo.totales.anticipo_total_cor_cents,
      anticipo_usd_cents: calculo.totales.anticipo_total_usd_cents,
      anticipo_porcentaje: anticipoPorcentaje,
      cuentas_bancarias: parametros.cuentas_bancarias,
    });

    navigator.clipboard.writeText(texto);
    showToast({
      message: '¡Mensaje formateado copiado al portapapeles para WhatsApp!',
      type: 'success',
    });
  };

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

      const resPed = await window.api.cotizaciones.convertirAPedido(resCot.data.id, notas);

      if (resPed.success) {
        showUndoToast(
          `Pedido ${resPed.data.codigo} creado a partir de la cotización`,
          () => {
            if (activeSubTab === 'historial') loadCotizacionesList();
          },
          resPed.data.evento_grupo_id
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

  const handleConvertirDesdeHistorial = async (cotId: number) => {
    const res = await window.api.cotizaciones.convertirAPedido(cotId);
    if (res.success) {
      showUndoToast(
        `Cotización convertida a Pedido ${res.data.codigo}`,
        () => loadCotizacionesList(),
        res.data.evento_grupo_id
      );
      loadCotizacionesList();
      if (onCotizacionConvertedToPedido) {
        onCotizacionConvertedToPedido(res.data.id);
      }
    } else {
      showToast({ message: res.error.message, type: 'error' });
    }
  };

  const handleMarcarEnviada = async (cotId: number) => {
    const res = await window.api.cotizaciones.marcarEnviada(cotId);
    if (res.success) {
      showUndoToast('Cotización marcada como enviada', () => loadCotizacionesList(), res.data.evento_grupo_id);
      loadCotizacionesList();
    } else {
      showToast({ message: res.error.message, type: 'error' });
    }
  };

  const handleMarcarRechazada = async (cotId: number) => {
    const res = await window.api.cotizaciones.rechazar(cotId);
    if (res.success) {
      showUndoToast('Cotización marcada como rechazada', () => loadCotizacionesList(), res.data.evento_grupo_id);
      loadCotizacionesList();
    } else {
      showToast({ message: res.error.message, type: 'error' });
    }
  };

  const handleRemoveDraftItem = (id: string) => {
    if (draftItems.length <= 1) {
      showToast({ message: 'La cotización debe tener al menos un ítem.', type: 'info' });
      return;
    }
    removeItem(id);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Sub-header de pestañas */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveSubTab('nueva')}
            className={cn(
              'px-3 py-1.5 rounded-md text-label transition-colors',
              activeSubTab === 'nueva'
                ? 'bg-navy-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            Nueva Cotización
          </button>
          <button
            onClick={() => setActiveSubTab('historial')}
            className={cn(
              'px-3 py-1.5 rounded-md text-label transition-colors',
              activeSubTab === 'historial'
                ? 'bg-navy-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            )}
          >
            Cotizaciones Guardadas
          </button>
        </div>

        {activeSubTab === 'nueva' && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCopiarWhatsApp}
              title="Copiar desglose formateado para WhatsApp (Ctrl+Shift+C)"
              aria-label="Copiar desglose formateado para WhatsApp (Ctrl+Shift+C)"
            >
              <Share2 className="w-3.5 h-3.5 mr-1" />
              <span>Copiar para WhatsApp</span>
              <kbd className="ml-1.5 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-caption font-mono">
                Ctrl+Shift+C
              </kbd>
            </Button>
          </div>
        )}
      </div>

      {activeSubTab === 'nueva' ? (
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna Izquierda (2 spans): Cliente y Lista de Ítems */}
          <div className="lg:col-span-2 space-y-4">
            {/* Selector de Cliente */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1">
                    <Field label="Cliente a cotizar">
                      <Select
                        value={selectedClienteId}
                        onChange={(e) =>
                          setSelectedClienteId(e.target.value ? Number(e.target.value) : '')
                        }
                      >
                        <option value="">-- Seleccionar cliente existente --</option>
                        {clientes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre} ({c.telefono}){c.incumplio_anteriormente ? ' [70% Anticipo]' : ''}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onNewCliente}
                    className="shrink-0 mb-0.5"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    <span>Nuevo Cliente</span>
                  </Button>
                </div>
                <Input
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Notas adicionales (opcional)..."
                />
              </CardContent>
            </Card>

            {/* Captura Rápida Inteligente */}
            <QuickCapture onParsedItem={handleParsedItem} />

            {/* Editor de Ítems */}
            <ItemsEditor
              draftItems={draftItems}
              calculo={calculo}
              categorias={categorias}
              tiendas={tiendas}
              onAddItem={addItem}
              onUpdateItem={updateItem}
              onRemoveItem={handleRemoveDraftItem}
            />
          </div>

          {/* Columna Derecha (1 span): Desglose y Resumen de Totales */}
          <div>
            <ResumenPanel
              calculo={calculo}
              anticipoPorcentaje={anticipoPorcentaje}
              onSelectAnticipo={setAnticipoPorcentaje}
              onConvertirAPedido={handleConvertirAPedido}
              guardando={guardando}
              canConvert={Boolean(selectedClienteId)}
            />
          </div>
        </div>
      ) : (
        /* Pestaña: Historial de Cotizaciones Guardadas */
        <div className="flex-1 p-6 overflow-y-auto">
          <HistorialCotizaciones
            cotizaciones={cotizacionesList}
            loading={loadingList}
            onConvertirAPedido={handleConvertirDesdeHistorial}
            onMarcarEnviada={handleMarcarEnviada}
            onMarcarRechazada={handleMarcarRechazada}
            onCrearNueva={() => setActiveSubTab('nueva')}
          />
        </div>
      )}
    </div>
  );
};
