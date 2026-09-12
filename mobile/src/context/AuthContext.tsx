import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import {
  alCambiarSesion,
  cerrarSesion,
  iniciarSesionGoogle,
  resolverRedireccionPendiente,
  traducirErrorAuth,
} from '../lib/firebase-mobile';

interface AuthState {
  usuario: User | null;
  cargando: boolean;
  error: string | null;
  ingresar: () => Promise<void>;
  salir: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Si Google mandó de vuelta por redirect (celulares angostos), esto
    // resuelve esa sesión antes de que `onAuthStateChanged` se dispare solo.
    resolverRedireccionPendiente().catch(() => {});

    const desuscribir = alCambiarSesion((u) => {
      setUsuario(u);
      setCargando(false);
    });
    return desuscribir;
  }, []);

  async function ingresar() {
    setError(null);
    try {
      const u = await iniciarSesionGoogle();
      if (u) {
        setUsuario(u);
        setCargando(false);
      }
    } catch (err) {
      setError(traducirErrorAuth(err));
    }
  }

  async function salir() {
    await cerrarSesion();
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, error, ingresar, salir }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
