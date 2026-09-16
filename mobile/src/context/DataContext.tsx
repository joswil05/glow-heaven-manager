import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import type { ParametrosSistema, ProductoConStock, Categoria } from '@shared/types';
import { ParametrosRepoFirestore } from '@repos/parametros.repo';
import { ProductosRepoFirestore } from '@repos/productos.repo';
import { useAuth } from './AuthContext';
import { invalidarCacheDashboard } from '../lib/panel-movil';

interface DataState {
  parametros: ParametrosSistema | null;
  productos: ProductoConStock[];
  /**
   * Las categorías reales que la dueña creó en Configuración > Ganancia por
   * categoría (Windows). Antes cada pantalla del celular tenía su propia
   * lista inventada ("Labiales", "Bases y Polvos"...) que adivinaba la
   * categoría por palabras dentro del nombre del producto — por eso los
   * filtros del celular nunca coincidían con las categorías reales que se ven
   * en Windows. Ahora las dos apps leen la misma fuente.
   */
  categorias: Categoria[];
  cargandoProductos: boolean;
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  recargarProductos: (forzar?: boolean) => Promise<void>;
  actualizarStockLocal: (lineas: { producto_id: number; variante_id?: number; cantidad: number }[]) => void;
  /**
   * Contador que sube con cada escritura (venta, abono, ajuste). Las vistas
   * lo ponen en las dependencias de su efecto de carga y asi vuelven a pedir
   * datos solas.
   *
   * Hace falta porque las cuatro vistas del celular estan montadas TODAS a la
   * vez (App.tsx las oculta con `hidden`, no las desmonta), asi que su efecto
   * de carga corria una unica vez en toda la sesion: registrabas un abono y
   * el Inicio seguia mostrando el saldo viejo hasta recargar la app.
   */
  version: number;
  /** Avisar que algo se escribio: todas las vistas se actualizan. */
  marcarCambio: () => void;
}

const DEFAULT_PARAMS: ParametrosSistema = {
  tasa_cambio_cents: 3662,
  tax_bp: 700,
  tarifa_envio_cents_lb: 700,
  margen_defecto_bp: 4500,
  paso_redondeo_usd_cents: 100,
  anticipo_defecto_bp: 5000,
  metodo_pago_defecto: 'EFECTIVO',
  cuotas_defecto_cantidad: 4,
  cuotas_defecto_dias: 15,
  pantalla_inicio: 'panel',
  pantalla_inicio_movil: 'panel',
  codigo_pais_whatsapp: '505',
  mostrar_cordobas: true,
  stock_minimo_defecto: 2,
  nombre_negocio: 'Glow Heaven',
  telefono_negocio: '',
  onboarding_completado: true,
};

const DataContext = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const [parametros, setParametros] = useState<ParametrosSistema | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<ProductoConStock[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ultimaCargaRef = useRef<number>(0);

  const recargarParametros = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [p, cats] = await Promise.all([
        ParametrosRepoFirestore.getParametros(),
        ParametrosRepoFirestore.getCategorias(),
      ]);
      setParametros(p);
      setCategorias(cats);
    } catch (err) {
      console.error('[DataContext] Error cargando parámetros:', err);
      setError('No se pudieron cargar los parámetros del negocio. Usando valores por defecto.');
      setParametros(DEFAULT_PARAMS);
    } finally {
      setCargando(false);
    }
  }, []);

  const recargarProductos = useCallback(async (forzar = false) => {
    const ahora = Date.now();
    // Cache de 60 segundos si no se fuerza la recarga
    if (!forzar && productos.length > 0 && ahora - ultimaCargaRef.current < 60000) {
      return;
    }

    setCargandoProductos(productos.length === 0); // Solo muestra spinner si la lista está vacía
    try {
      const lista = await ProductosRepoFirestore.listar();
      setProductos(lista);
      ultimaCargaRef.current = Date.now();
    } catch (err) {
      console.error('[DataContext] Error cargando catálogo de productos:', err);
    } finally {
      setCargandoProductos(false);
    }
  }, [productos.length]);

  // Actualización optimista de existencias en memoria tras confirmar una venta
  const actualizarStockLocal = useCallback((lineasVendidas: { producto_id: number; variante_id?: number; cantidad: number }[]) => {
    setProductos((prev) =>
      prev.map((p) => {
        const lineasDelProd = lineasVendidas.filter((l) => l.producto_id === p.id);
        if (lineasDelProd.length === 0) return p;

        const totalRestar = lineasDelProd.reduce((sum, l) => sum + l.cantidad, 0);
        const nuevasExistencias = Math.max(0, p.existencias - totalRestar);

        const nuevasVariantes = p.variantes.map((v) => {
          const lv = lineasDelProd.find((l) => l.variante_id === v.id);
          if (!lv) return v;
          return {
            ...v,
            existencias: Math.max(0, v.existencias - lv.cantidad),
          };
        });

        return {
          ...p,
          existencias: nuevasExistencias,
          variantes: nuevasVariantes,
        };
      })
    );
  }, []);

  const [version, setVersion] = useState(0);
  const marcarCambio = useCallback(() => {
    invalidarCacheDashboard();
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (usuario) {
      recargarParametros();
      recargarProductos(false);
    } else {
      setParametros(null);
      setProductos([]);
      setCargando(true);
    }
  }, [usuario, recargarParametros, recargarProductos]);

  return (
    <DataContext.Provider
      value={{
        parametros,
        categorias,
        productos,
        cargandoProductos,
        cargando,
        error,
        recargar: recargarParametros,
        recargarProductos,
        actualizarStockLocal,
        version,
        marcarCambio,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useDatosNegocio(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useDatosNegocio debe usarse dentro de <DataProvider>');
  return ctx;
}
