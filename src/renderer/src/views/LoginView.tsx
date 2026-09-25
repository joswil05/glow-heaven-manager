import React, { useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import type { UsuarioGoogle } from '../../../shared/ipc-contracts';
import logoImg from '../assets/logo.jpg';

interface LoginViewProps {
  onLoginSuccess: (usuario: UsuarioGoogle) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iniciarConGoogle = async () => {
    setCargando(true);
    setError(null);

    try {
      const res = await window.api.auth.iniciarGoogle();
      if (res.success) {
        onLoginSuccess(res.data);
      } else {
        setError(res.error || 'No se pudo iniciar sesión con Google.');
        setCargando(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar. Probá de nuevo.');
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-inverso flex items-center justify-center p-4 select-none relative overflow-hidden">
      {/* Luces de fondo ambientales */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-acento/20 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-1/4 w-[350px] h-[350px] bg-acento-suave/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-inverso-2/95 border border-inverso-texto-2/20 rounded-3xl shadow-2xl p-8 z-10 backdrop-blur-xl transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-300">
        {/* Cabecera con logo oficial */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-2xl shadow-acento/25 mb-4 ring-4 ring-white/15 shrink-0 bg-superficie p-1">
            <img src={logoImg} alt="Glow Heaven" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-inverso-texto">
            Glow Heaven Manager
          </h1>
          <p className="text-sm text-inverso-texto-2 mt-1.5 max-w-xs leading-relaxed">
            Gestión comercial, inventario en tiempo real y catálogo sincronizado en la nube.
          </p>
        </div>

        {/* Contenido principal */}
        <div className="space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 p-3.5 rounded-xl border border-danger-500/30 bg-danger-500/10 text-danger-200 text-sm leading-snug animate-shake"
            >
              <AlertCircle className="w-5 h-5 shrink-0 text-danger-400 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-danger-100">No se pudo iniciar sesión</p>
                <p className="text-xs text-danger-300 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {cargando ? (
            <div className="flex flex-col items-center justify-center py-6 px-4 rounded-2xl border border-inverso-texto-2/20 bg-inverso/50 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-acento animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-inverso-texto">
                  Iniciando sesión en tu navegador...
                </p>
                <p className="text-xs text-inverso-texto-2 max-w-xs">
                  Se abrió una pestaña segura para elegir tu cuenta de Google. Al finalizar, la app se abrirá automáticamente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCargando(false)}
                className="mt-2 text-xs text-inverso-texto-2 hover:text-inverso-texto underline decoration-inverso-texto-2/50 hover:decoration-inverso-texto transition-colors"
              >
                Cancelar y reintentar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={iniciarConGoogle}
              className="w-full flex items-center justify-center gap-3 px-5 py-3.5 bg-superficie text-texto hover:bg-superficie-2 active:scale-[0.99] rounded-xl font-medium text-base shadow-md hover:shadow-lg transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-acento cursor-pointer"
            >
              {/* Logo Oficial de Google SVG */}
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continuar con Google</span>
            </button>
          )}

          {error && (
            <button
              type="button"
              onClick={iniciarConGoogle}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium text-texto-3 hover:text-texto transition-[color,transform] duration-150 ease-out active:scale-[0.98]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Volver a intentar</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
