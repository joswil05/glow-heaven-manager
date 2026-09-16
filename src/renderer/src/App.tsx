import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar, TITULOS, type NavTab } from './components/layout/Sidebar';
import { LoginView } from './views/LoginView';
import { PinLockView } from './views/PinLockView';
import { PanelView, type DestinoPanel } from './views/PanelView';
import { InventarioView } from './views/InventarioView';
import { PaquetesView } from './views/PaquetesView';
import { VentasView } from './views/VentasView';
import { ClientesView } from './views/ClientesView';
import { CobranzaView } from './views/CobranzaView';
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
  /**
   * La pantalla de inicio se aplica UNA sola vez, en el primer arranque.
   *
   * Sin este candado, cada recarga de datos —que ocurre después de cada venta,
   * cada abono, cada ajuste— la devolvería a su pantalla preferida en medio de
   * lo que estuviera haciendo.
   */
  const inicioAplicado = useRef(false);

  const [parametros, setParametros] = useState<ParametrosSistema | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [clientes, setClientes] = useState<ClienteDetalle[]>([]);
  const [productos, setProductos] = useState<ProductoConStock[]>([]);
  const [panel, setPanel] = useState<PanelData | null>(null);
  /** Por qué no se pudo cargar el panel, si es que no se pudo. */
  const [errorPanel, setErrorPanel] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  // Selección que viaja entre vistas al hacer clic en una alerta.
  const [productoSeleccionado, setProductoSeleccionado] = useState<number | undefined>();
  const [ventaSeleccionada, setVentaSeleccionada] = useState<number | undefined>();
  const [clienteSeleccionado, setClienteSeleccionado] = useState<number | undefined>();
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

      if (rp.success) {
        setParametros(rp.data);
        const preferida = rp.data.pantalla_inicio as NavTab | undefined;
        if (!inicioAplicado.current) {
          inicioAplicado.current = true;
          if (preferida && preferida !== 'panel' && TITULOS[preferida]) setTab(preferida);
        }
      }
      if (rc.success) setCategorias(rc.data);
      if (rcl.success) setClientes(rcl.data);
      if (rpr.success) setProductos(rpr.data);
      if (rpanel.success) {
        setPanel(rpanel.data);
        setErrorPanel(null);
      } else {
        // Sin esto el panel se quedaba girando para siempre: un fallo de carga
        // se veia exactamente igual que "todavia cargando", y no habia forma
        // de saber que algo habia salido mal ni de reintentar.
        setErrorPanel(rpanel.error);
      }

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
        if (r.success) {
          setPanel(r.data);
          setErrorPanel(null);
        } else {
          setErrorPanel(r.error);
        }
      });
    }
  }, [tab, usuario]);

  // Atajos de teclado globales para navegación ultra fluida
  useEffect(() => {
    if (!usuario) return;

    const alPresionar = (e: KeyboardEvent) => {
      // F5 para sincronizar con la nube
      if (e.key === 'F5') {
        e.preventDefault();
        cargar();
        return;
      }

      const conModificador = e.ctrlKey || e.metaKey;
      if (!conModificador) return;

      switch (e.key.toLowerCase()) {
        case '1':
          e.preventDefault();
          irA('panel');
          break;
        case '2':
          e.preventDefault();
          irA('inventario');
          break;
        case '3':
          e.preventDefault();
          irA('ventas');
          break;
        case '4':
          e.preventDefault();
          irA('paquetes');
          break;
        case '5':
          e.preventDefault();
          irA('clientes');
          break;
        case '6':
          e.preventDefault();
          irA('config');
          break;
        case 'n':
          e.preventDefault();
          irA('ventas', undefined, true);
          break;
        case 'r':
          e.preventDefault();
          cargar();
          break;
        case 'f': {
          const input = document.querySelector(
            'input[type="text"]:not([disabled]), input[type="search"]:not([disabled])'
          ) as HTMLInputElement | null;
          if (input) {
            e.preventDefault();
            input.focus();
            input.select();
          }
          break;
        }
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
  }, [usuario, cerrarSesion, cargar]);

  const irA = (destino: NavTab, id?: number, abrirNuevo = false) => {
    setProductoSeleccionado(destino === 'inventario' ? id : undefined);
    setVentaSeleccionada(destino === 'ventas' || destino === 'encargos' ? id : undefined);
    setClienteSeleccionado(destino === 'clientes' ? id : undefined);
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
      {/* `bg-fondo`, el escalon mas bajo de la escalera: en oscuro la pagina es
          lo que menos luz recibe y lo que se apoya encima recibe mas. Esto pintaba
          `bg-superficie-2`, el tercer escalon, asi que una tarjeta `bg-superficie`
          quedaba MAS OSCURA que la pagina que la sostiene. Es tambien lo que ya
          pintan `body` y el caparazon del movil. */}
      <div className="flex flex-col h-screen w-screen bg-fondo overflow-hidden select-none">
        {actualizacionLista && (
          <div className="bg-acento text-acento-texto px-5 py-2 flex items-center justify-between text-xs font-bold shadow-md shrink-0 z-50">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-acento" />
              <span>Nueva actualización v{actualizacionLista.version} lista para instalar.</span>
            </div>
            <button
              type="button"
              onClick={() => window.api?.actualizador?.reiniciarYAplicar()}
              className="bg-superficie text-acento px-3.5 py-1 rounded-lg text-xs font-extrabold shadow-sm hover:bg-acento-suave active:scale-95 transition-[background-color,border-color,color,box-shadow,transform,opacity] cursor-pointer"
            >
              Reiniciar y actualizar ahora
            </button>
          </div>
        )}
        {descargandoUpdate !== null && (
          <div className="bg-superficie-3 text-texto px-5 py-1.5 flex items-center justify-between text-xs shrink-0 z-50">
            <span>Descargando actualización en segundo plano: {descargandoUpdate.toFixed(0)}%</span>
            <div className="w-32 bg-superficie-3 h-1.5 rounded-full overflow-hidden">
              <div className="bg-acento h-full transition-[width] duration-300 ease-out" style={{ width: `${descargandoUpdate}%` }} />
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
            <div key={tab} className="flex-1 flex overflow-hidden view-fade-slide">
              {tab === 'panel' && (
                <PanelView
                  error={errorPanel}
                  onReintentar={cargar}
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

              {tab === 'cobranza' && (
                <CobranzaView
                  clientes={clientes}
                  parametros={parametros}
                  onCambio={cargar}
                  onVerCliente={(id) => irA('clientes', id)}
                  onVerVenta={(id, tipoVenta) =>
                    irA(tipoVenta === 'ENCARGO' ? 'encargos' : 'ventas', id)
                  }
                />
              )}

              {tab === 'clientes' && (
                <ClientesView
                  parametros={parametros}
                  clienteInicialId={clienteSeleccionado}
                  onCambio={cargar}
                  onVerVenta={(id, tipoVenta) =>
                    irA(tipoVenta === 'ENCARGO' ? 'encargos' : 'ventas', id)
                  }
                />
              )}

              {tab === 'config' && (
                <ConfigView parametros={parametros} categorias={categorias} onCambio={cargar} />
              )}
            </div>
          </main>
        </div>
      </div>
    </MonedaProvider>
  );
};
