import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar, TITULOS, type NavTab } from './components/layout/Sidebar';
import { LoginView } from './views/LoginView';
import { PinLockView } from './views/PinLockView';
import { PanelView, type DestinoPanel } from './views/PanelView';
import { InventarioView } from './views/InventarioView';
import { PaquetesView } from './views/PaquetesView';
import { VentasView } from './views/VentasView';
import { ClientesView } from './views/ClientesView';
import { ConfigView } from './views/ConfigView';
import { MonedaProvider } from './context/MonedaContext';
import { useToast } from './context/ToastContext';
import type { UsuarioGoogle } from '../../shared/ipc-contracts';
import type {
  ParametrosSistema,
  Categoria,
  ClienteDetalle,
  ProductoConStock,
  PanelData,
} from '../../shared/types';

export const App: React.FC = () => {
  const { showToast } = useToast();

  const [usuario, setUsuario] = useState<UsuarioGoogle | null>(null);
  const [verificandoAuth, setVerificandoAuth] = useState(true);
  const [pinDesbloqueado, setPinDesbloqueado] = useState(false);
  const [tab, setTab] = useState<NavTab>('panel');

  const [parametros, setParametros] = useState<ParametrosSistema | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [clientes, setClientes] = useState<ClienteDetalle[]>([]);
  const [productos, setProductos] = useState<ProductoConStock[]>([]);
  const [panel, setPanel] = useState<PanelData | null>(null);
  const [cargando, setCargando] = useState(true);

  // Selección que viaja entre vistas al hacer clic en una alerta.
  const [productoSeleccionado, setProductoSeleccionado] = useState<number | undefined>();
  const [ventaSeleccionada, setVentaSeleccionada] = useState<number | undefined>();
  const [abrirEditor, setAbrirEditor] = useState<NavTab | null>(null);
  const [actualizacionLista, setActualizacionLista] = useState<{ version: string } | null>(null);
  const [descargandoUpdate, setDescargandoUpdate] = useState<number | null>(null);

  useEffect(() => {
    if (!window.api?.actualizador) return;

    const unregAvailable = window.api.actualizador.onUpdateAvailable((info) => {
      showToast({
        message: `Nueva versión v${info.version} encontrada. Descargando en segundo plano…`,
        type: 'info',
      });
    });

    const unregProgress = window.api.actualizador.onUpdateProgress((p) => {
      setDescargandoUpdate(p.percent);
    });

    const unregDownloaded = window.api.actualizador.onUpdateDownloaded((info) => {
      setDescargandoUpdate(null);
      setActualizacionLista(info);
      showToast({
        message: `¡Versión v${info.version} lista para instalar!`,
        type: 'success',
      });
    });

    return () => {
      unregAvailable();
      unregProgress();
      unregDownloaded();
    };
  }, [showToast]);

  useEffect(() => {
    window.api.auth
      .obtenerUsuario()
      .then((res) => {
        if (res.success && res.data) {
          setUsuario(res.data);
        }
      })
      .finally(() => {
        setVerificandoAuth(false);
      });
  }, []);

  const cerrarSesion = useCallback(async () => {
    await window.api.auth.cerrarSesion();
    setUsuario(null);
    setPinDesbloqueado(false);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [rp, rc, rcl, rpr, rpanel] = await Promise.all([
        window.api.parametros.get(),
        window.api.categorias.list(),
        window.api.clientes.list(),
        window.api.productos.list(),
        window.api.panel.cargar(),
      ]);

      if (rp.success) setParametros(rp.data);
      if (rc.success) setCategorias(rc.data);
      if (rcl.success) setClientes(rcl.data);
      if (rpr.success) setProductos(rpr.data);
      if (rpanel.success) setPanel(rpanel.data);

      const fallo = [rp, rc, rcl, rpr, rpanel].find((r) => !r.success);
      if (fallo && !fallo.success) {
        showToast({ message: fallo.error, type: 'error' });
      }
    } finally {
      setCargando(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (usuario) cargar();
  }, [usuario, cargar]);

  // Al entrar al panel o cambiar de pestaña, asegurar que los datos estén frescos
  useEffect(() => {
    if (usuario && tab === 'panel') {
      window.api.panel.cargar().then((r) => {
        if (r.success) setPanel(r.data);
      });
    }
  }, [tab, usuario]);

  // Atajos de teclado
  useEffect(() => {
    if (!usuario) return;

    const alPresionar = (e: KeyboardEvent) => {
      const conModificador = e.ctrlKey || e.metaKey;
      if (!conModificador) return;

      switch (e.key.toLowerCase()) {
        case 'n':
          e.preventDefault();
          irA('ventas', undefined, true);
          break;
        case 'l':
          e.preventDefault();
          cerrarSesion();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [usuario, cerrarSesion]);

  const irA = (destino: NavTab, id?: number, abrirNuevo = false) => {
    setProductoSeleccionado(destino === 'inventario' ? id : undefined);
    setVentaSeleccionada(destino === 'ventas' || destino === 'encargos' ? id : undefined);
    setAbrirEditor(abrirNuevo ? destino : null);
    setTab(destino);
  };

  const navegarDesdePanel = (destino: DestinoPanel, id?: number) => {
    if (destino === 'ventas' && id) {
      const esEncargo = panel?.por_cobrar.find((p) => p.venta_id === id)?.tipo === 'ENCARGO';
      irA(esEncargo ? 'encargos' : 'ventas', id);
      return;
    }
    irA(destino as NavTab, id);
  };

  const avisos = useMemo(
    () => ({
      bajoStock: panel?.bajo_stock.length ?? 0,
      porCobrar: panel?.por_cobrar.filter((p) => p.cuotas_vencidas > 0).length ?? 0,
      encargosPendientes:
        panel?.alertas.filter((a) => a.id.startsWith('encargo-')).length ?? 0,
    }),
    [panel]
  );

  if (verificandoAuth) {
    return (
      <div className="min-h-screen w-screen bg-inverso flex items-center justify-center text-inverso-texto text-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-acento border-t-transparent animate-spin" />
          <span className="text-inverso-texto-2">Iniciando Glow Heaven Manager...</span>
        </div>
      </div>
    );
  }

  if (!usuario) {
    return <LoginView onLoginSuccess={(u) => setUsuario(u)} />;
  }

  if (parametros?.pin_seguridad && !pinDesbloqueado) {
    return (
      <PinLockView
        pinCorrecto={parametros.pin_seguridad}
        onDesbloqueado={() => setPinDesbloqueado(true)}
        onCerrarSesion={cerrarSesion}
      />
    );
  }

  const monedaConfig = {
    tasa_cambio_cents: parametros?.tasa_cambio_cents ?? 3662,
    mostrar_cordobas: parametros?.mostrar_cordobas ?? true,
  };

  return (
    <MonedaProvider valor={monedaConfig}>
      <div className="flex flex-col h-screen w-screen bg-superficie-2 overflow-hidden select-none">
        {actualizacionLista && (
          <div className="bg-emerald-600 text-white px-5 py-2 flex items-center justify-between text-xs font-bold shadow-md shrink-0 z-50">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-200 animate-pulse" />
              <span>Nueva actualización v{actualizacionLista.version} lista para instalar.</span>
            </div>
            <button
              type="button"
              onClick={() => window.api?.actualizador?.reiniciarYAplicar()}
              className="bg-white text-emerald-800 px-3.5 py-1 rounded-lg text-xs font-extrabold shadow-sm hover:bg-emerald-50 active:scale-95 transition-all cursor-pointer"
            >
              Reiniciar y actualizar ahora
            </button>
          </div>
        )}
        {descargandoUpdate !== null && (
          <div className="bg-slate-800 text-white px-5 py-1.5 flex items-center justify-between text-xs shrink-0 z-50">
            <span>Descargando actualización en segundo plano: {descargandoUpdate.toFixed(0)}%</span>
            <div className="w-32 bg-slate-700 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-400 h-full transition-all duration-300" style={{ width: `${descargandoUpdate}%` }} />
            </div>
          </div>
        )}
        <Header
          titulo={tab === 'panel' ? 'Tu negocio hoy' : TITULOS[tab]}
          tasaCambioCents={monedaConfig.tasa_cambio_cents}
          usuario={usuario}
          cargando={cargando}
          onRefrescar={cargar}
          onNuevaVenta={() => irA('ventas', undefined, true)}
          onNuevoPaquete={() => irA('paquetes', undefined, true)}
          onCerrarSesion={cerrarSesion}
        />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            activeTab={tab}
            onSelectTab={(t) => irA(t)}
            avisos={avisos}
            nombreNegocio={parametros?.nombre_negocio || 'Glow Heaven'}
          />

          <main className="flex-1 flex overflow-hidden">
            {tab === 'panel' && (
              <PanelView
                data={panel}
                loading={cargando}
                onNavegar={navegarDesdePanel}
                onNuevaVenta={() => irA('ventas', undefined, true)}
                onNuevoPaquete={() => irA('paquetes', undefined, true)}
              />
            )}

            {tab === 'inventario' && (
              <InventarioView
                categorias={categorias}
                parametros={parametros}
                productoInicialId={productoSeleccionado}
                onCambio={cargar}
              />
            )}

            {tab === 'paquetes' && (
              <PaquetesView
                parametros={parametros}
                abrirEditorAlEntrar={abrirEditor === 'paquetes'}
                onCambio={cargar}
              />
            )}

            {(tab === 'ventas' || tab === 'encargos') && (
              <VentasView
                key={tab}
                tipo={tab === 'encargos' ? 'ENCARGO' : 'INVENTARIO'}
                productos={productos}
                clientes={clientes}
                parametros={parametros}
                ventaInicialId={ventaSeleccionada}
                abrirEditorAlEntrar={abrirEditor === tab}
                onCambio={cargar}
              />
            )}

            {tab === 'clientes' && (
              <ClientesView
                onCambio={cargar}
                onVerVenta={(id, tipoVenta) =>
                  irA(tipoVenta === 'ENCARGO' ? 'encargos' : 'ventas', id)
                }
              />
            )}

            {tab === 'config' && (
              <ConfigView parametros={parametros} categorias={categorias} onCambio={cargar} />
            )}
          </main>
        </div>
      </div>
    </MonedaProvider>
  );
};
