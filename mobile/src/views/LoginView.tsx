import { useState, useEffect } from 'react';
import { Loader2, Copy, Check, Smartphone, ExternalLink, AlertCircle, Share } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { esNavegadorInterno, esDispositivoIOS } from '../lib/firebase-mobile';

function IconoGoogle() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" />
    </svg>
  );
}

export function LoginView() {
  const { ingresar, error } = useAuth();
  const [entrando, setEntrando] = useState(false);
  const [esInterno, setEsInterno] = useState(false);
  const [esIOS, setEsIOS] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    setEsInterno(esNavegadorInterno());
    setEsIOS(esDispositivoIOS());
  }, []);

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      const input = document.createElement('input');
      input.value = window.location.origin;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    }
  }

  async function manejarClick() {
    setEntrando(true);
    try {
      await ingresar();
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f8fafc] px-6 pb-safe-b pt-safe-t text-slate-800">
      <div className="flex flex-col items-center gap-3 text-center">
        {/* Logo oficial */}
        <div className="relative flex h-28 w-28 items-center justify-center rounded-[28px] bg-white shadow-xl shadow-emerald-600/10 ring-4 ring-emerald-500/10 overflow-hidden">
          <img src="/icons/logo-hero.png" alt="Glow Heaven" className="h-full w-full object-cover" />
        </div>

        <div className="mt-2">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200/60 mb-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Punto de Venta Móvil
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Glow Heaven</h1>
          <p className="max-w-xs text-xs font-medium text-slate-500 mt-1">
            Gestión en vivo, ventas rápidas y catálogo de maquillaje sincronizado en tiempo real.
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center w-full max-w-sm gap-3">
        {/* Aviso amigable SOLO para iPhone si se abrió dentro de WhatsApp */}
        {esIOS && esInterno && (
          <div className="w-full rounded-2xl border border-amber-300/80 bg-gradient-to-br from-amber-50 to-orange-50/50 p-4 text-left shadow-sm">
            <div className="flex items-start gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700">
                <Smartphone size={18} />
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-bold text-amber-900">
                  Aviso para iPhone en WhatsApp
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-amber-800/90">
                  Si ves un error al iniciar sesión, ábrelo en Safari:
                </p>

                <div className="mt-2 space-y-1 rounded-xl bg-white/70 p-2 border border-amber-200/60 text-[11px] text-amber-950">
                  <p>1. Toca los <strong>tres puntos (…)</strong> abajo a la derecha.</p>
                  <p>2. Selecciona <strong>"Abrir en Safari"</strong>.</p>
                </div>

                <button
                  type="button"
                  onClick={copiarEnlace}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-900 shadow-sm active:scale-95 transition-all"
                >
                  {copiado ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  {copiado ? '¡Enlace copiado! Pégalo en Safari' : 'Copiar enlace para Safari'}
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={manejarClick}
          disabled={entrando}
          className="m3-press tocable flex w-full items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-bold text-slate-800 shadow-md hover:bg-slate-50 active:scale-[0.98] disabled:opacity-60 transition-all"
        >
          {entrando ? <Loader2 size={20} className="animate-spin text-emerald-600" /> : <IconoGoogle />}
          {entrando ? 'Iniciando sesión…' : 'Continuar con Google'}
        </button>

        {error && (
          <p className="w-full rounded-xl bg-rose-50 border border-rose-200 p-3 text-center text-xs font-semibold text-rose-700" role="alert">
            {error}
          </p>
        )}

        <div className="mt-2 flex flex-col items-center gap-2 text-center w-full">
          <p className="text-[11px] text-slate-400 font-medium">
            Ingresa con tu cuenta autorizada de Glow Heaven.
          </p>

          {/* Consejo para usuarios de iPhone en Safari */}
          {esIOS && !esInterno && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50/80 border border-emerald-200/60 px-3 py-2 text-left text-[11px] text-emerald-900 shadow-xs">
              <Share size={14} className="shrink-0 text-emerald-600" />
              <span>
                <strong>Tip iPhone:</strong> En Safari, toca <em>Compartir</em> y luego <strong>"Añadir a pantalla de inicio"</strong> para usarla como app.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

