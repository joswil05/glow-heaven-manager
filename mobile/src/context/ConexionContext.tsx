import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { crearConexion, entornoNavegador, type Conexion, type EstadoConexion } from '../lib/conexion-movil';

/**
 * El estado de la conexión para toda la app (C3).
 *
 * Va por encima del acceso y del login, que también lo usan. Una sola
 * instancia mientras la página está abierta: no se detiene al desmontar,
 * porque en desarrollo React desmonta y vuelve a montar, y se quedaría sin
 * escuchar los eventos del navegador.
 */
const Contexto = createContext<{ estado: EstadoConexion; conexion: Conexion } | null>(null);

export function ConexionProvider({ children }: { children: ReactNode }) {
  const [conexion] = useState(() => crearConexion(entornoNavegador()));
  const [estado, setEstado] = useState(() => conexion.estado());
  useEffect(() => conexion.suscribir(setEstado), [conexion]);
  return <Contexto.Provider value={{ estado, conexion }}>{children}</Contexto.Provider>;
}

function usarContexto() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error('useConexion debe usarse dentro de <ConexionProvider>');
  return ctx;
}

/** Si hay red y de cuándo son los datos que se ven sin ella. */
export function useConexion(): EstadoConexion {
  return usarContexto().estado;
}

/** Para quien escucha a Firestore y avisa si los datos vienen del servidor. */
export function useControlConexion(): Conexion {
  return usarContexto().conexion;
}
