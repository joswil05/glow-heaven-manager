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
    let activo = true;

    // Si Google mandó de vuelta por redirect (celulares/PWA instalada), esto
    // resuelve esa sesión. Si algo falla en el camino (dominio no
    // autorizado, red, etc.) lo mostramos en vez de tragárnoslo.
    resolverRedireccionPendiente().then(({ error: errRedirect }) => {
      if (activo && errRedirect) setError(traducirErrorAuth(errRedirect));
    });

    // Si `onAuthStateChanged` nunca dispara (se ha visto colgado al volver
    // de Google en algunas PWA instaladas en Android), no dejamos a la
    // usuaria mirando el spinner para siempre.
    const limite = setTimeout(() => {
      if (activo) {
        setCargando((estabaCargando) => {
          if (estabaCargando) setError(traducirErrorAuth({ code: 'app/redirect-timeout' }));
          return false;
        });
      }
    }, 9000);

    const desuscribir = alCambiarSesion((u) => {
      if (!activo) return;
      clearTimeout(limite);
      setUsuario(u);
      setCargando(false);
      if (u) setError(null);
    });

    return () => {
      activo = false;
      clearTimeout(limite);
      desuscribir();
    };
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
