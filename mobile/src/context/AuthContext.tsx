import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import {
  alCambiarSesion,
  cerrarSesion,
  hayRedireccionEnCurso,
  iniciarSesionGoogle,
  limpiarSesionLocalYRecargar,
  resolverRedireccionPendiente,
  traducirErrorAuth,
} from '../lib/firebase-mobile';

interface AuthState {
  usuario: User | null;
  cargando: boolean;
  error: string | null;
  ingresar: () => Promise<void>;
  salir: () => Promise<void>;
  repararSesion: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;

    // Solo pedimos el resultado del redirect si de verdad venimos de Google.
    // Esa llamada es la que levanta el iframe del authDomain, así que en un
    // arranque normal ni siquiera se carga.
    const veniamosDeGoogle = hayRedireccionEnCurso();
    let redireccionResuelta = !veniamosDeGoogle;
    let estadoConocido = false;

    // Red de seguridad: pase lo que pase, nadie se queda mirando el spinner.
    const limite = setTimeout(() => {
      if (!activo) return;
      setCargando((seguiaCargando) => {
        if (seguiaCargando) setError(traducirErrorAuth({ code: 'app/redirect-timeout' }));
        return false;
      });
    }, 9000);

    function terminarSiTodoListo() {
      if (!activo || !redireccionResuelta || !estadoConocido) return;
      clearTimeout(limite);
      setCargando(false);
    }

    if (veniamosDeGoogle) {
      resolverRedireccionPendiente().then(({ error: errRedirect }) => {
        if (!activo) return;
        if (errRedirect) setError(traducirErrorAuth(errRedirect));
        redireccionResuelta = true;
        terminarSiTodoListo();
      });
    }

    const desuscribir = alCambiarSesion((u) => {
      if (!activo) return;
      setUsuario(u);
      estadoConocido = true;
      if (u) {
        // Ya entró: no hay nada más que esperar.
        setError(null);
        redireccionResuelta = true;
      }
      terminarSiTodoListo();
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
    <AuthContext.Provider
      value={{ usuario, cargando, error, ingresar, salir, repararSesion: limpiarSesionLocalYRecargar }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
