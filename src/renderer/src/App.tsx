import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { CommandPalette } from './components/CommandPalette';
import { OnboardingModal } from './components/OnboardingModal';
import { HoyView } from './views/HoyView';
import { CotizadorView } from './views/CotizadorView';
import { PedidosView } from './views/PedidosView';
import { ClientesView } from './views/ClientesView';
import { ConfigView } from './views/ConfigView';
import type {
  ParametrosSistema,
  Categoria,
  Tienda,
  Cliente,
  Pedido,
} from '../../shared/types';
import type { HoyViewData } from '../../shared/ipc-contracts';
import { useToast } from './context/ToastContext';

export const App: React.FC = () => {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<NavTab>('hoy');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Datos globales
  const [parametros, setParametros] = useState<ParametrosSistema | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [tiendas, setTiendas] = useState<Tienda[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [hoyData, setHoyData] = useState<HoyViewData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filtro / Selección activa
  const [selectedPedidoId, setSelectedPedidoId] = useState<number | undefined>(undefined);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [paramRes, catRes, tiendaRes, cliRes, pedRes, hoyRes] = await Promise.all([
        window.api.parametros.get(),
        window.api.categorias.list(),
        window.api.tiendas.list(),
        window.api.clientes.list(),
        window.api.pedidos.list(),
        window.api.vistas.getHoy(),
      ]);

      if (paramRes.success) {
        setParametros(paramRes.data);
        // Si no tiene cuentas bancarias configuradas, mostrar onboarding
        if (!paramRes.data.cuentas_bancarias || paramRes.data.cuentas_bancarias.length === 0) {
          setOnboardingOpen(true);
        }
      }
      if (catRes.success) setCategorias(catRes.data);
      if (tiendaRes.success) setTiendas(tiendaRes.data);
      if (cliRes.success) setClientes(cliRes.data);
      if (pedRes.success) setPedidos(pedRes.data);
      if (hoyRes.success) setHoyData(hoyRes.data);
    } catch (err) {
      console.error('Error cargando datos principales:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Atajos globales de teclado (U3)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K: Buscar
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      // Ctrl+N: Nueva cotización
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault();
        setActiveTab('cotizador');
      }
      // Ctrl+B: Respaldo manual
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        window.api.sistema.crearBackup().then((res) => {
          if (res.success) {
            showToast({ message: 'Respaldo manual completado (Ctrl+B)', type: 'success' });
          }
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showToast]);

  // Semáforo counts para la cabecera
  const semaforoCounts = React.useMemo(() => {
    let verde = 0;
    let amarillo = 0;
    let rojo = 0;

    for (const p of pedidos) {
      if (p.anticipo_verificado) {
        verde++;
      } else {
        rojo++;
      }
    }

    return { verde, amarillo, rojo };
  }, [pedidos]);

  const pedidosRequierenAtencionCount = React.useMemo(() => {
    return pedidos.filter((p) => p.requiere_atencion).length;
  }, [pedidos]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-100 overflow-hidden select-none">
      {/* Header Superior */}
      <Header
        tasaCambioCents={parametros?.tasa_cambio_oficial_cents ?? 3662}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onNewCotizacion={() => setActiveTab('cotizador')}
        semaforoCounts={semaforoCounts}
      />

      {/* Contenido Principal con Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setSelectedPedidoId(undefined);
            setActiveTab(tab);
          }}
          pedidosRequierenAtencionCount={pedidosRequierenAtencionCount}
        />

        <main className="flex-1 flex overflow-hidden">
          {activeTab === 'hoy' && (
            <HoyView
              data={hoyData}
              loading={loading}
              onNewCotizacion={() => setActiveTab('cotizador')}
              onNavigateToPedidos={(pedidoId) => {
                setSelectedPedidoId(pedidoId);
                setActiveTab('pedidos');
              }}
            />
          )}

          {activeTab === 'cotizador' && (
            <CotizadorView
              clientes={clientes}
              categorias={categorias}
              tiendas={tiendas}
              parametros={parametros}
              onNewCliente={() => setActiveTab('clientes')}
              onCotizacionConvertedToPedido={(pedId) => {
                loadData();
                setSelectedPedidoId(pedId);
                setActiveTab('pedidos');
              }}
            />
          )}

          {activeTab === 'pedidos' && (
            <PedidosView
              pedidos={pedidos}
              loading={loading}
              onRefresh={loadData}
              selectedPedidoId={selectedPedidoId}
            />
          )}

          {activeTab === 'clientes' && (
            <ClientesView
              clientes={clientes}
              loading={loading}
              onRefresh={loadData}
            />
          )}

          {activeTab === 'config' && (
            <ConfigView
              parametros={parametros}
              categorias={categorias}
              onRefresh={loadData}
            />
          )}
        </main>
      </div>

      {/* Omnibox / Paleta de Comandos (Ctrl+K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onAction={(action) => {
          if (action === 'new-cotizacion') setActiveTab('cotizador');
          if (action === 'new-cliente') setActiveTab('clientes');
          if (action === 'backup') {
            window.api.sistema.crearBackup().then((res) => {
              if (res.success) showToast({ message: 'Respaldo manual completado', type: 'success' });
            });
          }
        }}
        onSelectCliente={() => setActiveTab('clientes')}
        onSelectPedido={(p) => {
          setSelectedPedidoId(p.id);
          setActiveTab('pedidos');
        }}
      />

      {/* Asistente Inicial de Bienvenida (U5) */}
      <OnboardingModal
        isOpen={onboardingOpen}
        onFinish={() => {
          setOnboardingOpen(false);
          loadData();
        }}
        categorias={categorias}
      />
    </div>
  );
};
