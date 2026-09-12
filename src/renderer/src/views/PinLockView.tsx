import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Lock, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import logoImg from '../assets/logo.jpg';
import { Button } from '../components/ui';

interface PinLockViewProps {
  pinCorrecto: string;
  onDesbloqueado: () => void;
  onCerrarSesion: () => void;
}

export const PinLockView: React.FC<PinLockViewProps> = ({
  pinCorrecto,
  onDesbloqueado,
  onCerrarSesion,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [animandoError, setAnimandoError] = useState(false);
  const [desbloqueando, setDesbloqueando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const longitud = pinCorrecto.length || 4;

  // Mantener el input oculto siempre enfocado
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const verificarPin = useCallback(
    (pinIngresado: string) => {
      if (pinIngresado === pinCorrecto) {
        setDesbloqueando(true);
        // Pequeño delay para mostrar la animación de éxito
        setTimeout(() => onDesbloqueado(), 400);
      } else {
        setError(true);
        setAnimandoError(true);
        setTimeout(() => {
          setPin('');
          setAnimandoError(false);
        }, 600);
      }
    },
    [pinCorrecto, onDesbloqueado]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const valor = e.target.value.replace(/\D/g, '').slice(0, longitud);
      setError(false);
      setPin(valor);
      if (valor.length === longitud) {
        verificarPin(valor);
      }
    },
    [longitud, verificarPin]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        setPin('');
        setError(false);
      }
    },
    []
  );

  // Re-enfocar si el usuario clickea en cualquier parte de la pantalla
  const enfocarInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      className="min-h-screen w-screen bg-fondo flex flex-col items-center justify-center p-6 select-none"
      onClick={enfocarInput}
    >
      <div className="w-full max-w-sm flex flex-col items-center text-center space-y-8 animate-fade-in">
        {/* Logo con glow animado */}
        <div className="relative">
          <div className="w-28 h-28 rounded-3xl overflow-hidden border-2 border-borde bg-superficie p-1.5 animate-logo-glow">
            <img
              src={logoImg}
              alt="Glow Heaven"
              className="w-full h-full object-contain rounded-2xl"
            />
          </div>
          <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-acento text-white flex items-center justify-center shadow-md">
            {desbloqueando ? (
              <ShieldCheck className="w-4.5 h-4.5" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
          </div>
        </div>

        {/* Título y subtítulo */}
        <div>
          <h2 className="text-display font-bold text-texto tracking-tight">
            Glow Heaven
          </h2>
          <p className="text-caption text-texto-3 uppercase tracking-[0.2em] mt-1 font-medium">
            Pure · Magic · Divine
          </p>
        </div>

        {/* Instrucción */}
        <p className="text-body text-texto-2">
          Ingresá tu PIN de {longitud} dígitos para acceder
        </p>

        {/* Input oculto para capturar teclado */}
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={pin}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="sr-only"
          aria-label="PIN de seguridad"
          autoFocus
        />

        {/* Indicadores de PIN (puntos) */}
        <div
          className={`flex items-center justify-center gap-5 ${
            animandoError ? 'animate-shake' : ''
          }`}
        >
          {Array.from({ length: longitud }).map((_, i) => {
            const lleno = i < pin.length;
            return (
              <div
                key={i}
                className={`w-5 h-5 rounded-full transition-all duration-200 ${
                  error
                    ? 'bg-danger-500 border-2 border-danger-600 scale-110'
                    : desbloqueando
                    ? 'bg-success-500 border-2 border-success-600 scale-110'
                    : lleno
                    ? 'bg-acento scale-125 shadow-sm animate-pin-dot'
                    : 'bg-transparent border-2 border-borde-fuerte'
                }`}
              />
            );
          })}
        </div>

        {/* Mensaje de error o éxito */}
        <div className="h-6 flex items-center justify-center">
          {error && (
            <p className="text-caption text-danger-700 flex items-center gap-1.5 font-medium animate-fade-in">
              <ShieldAlert className="w-4 h-4" />
              <span>PIN incorrecto. Intentá de nuevo.</span>
            </p>
          )}
          {desbloqueando && (
            <p className="text-caption text-success-700 flex items-center gap-1.5 font-medium animate-fade-in">
              <ShieldCheck className="w-4 h-4" />
              <span>¡Bienvenido!</span>
            </p>
          )}
          {!error && !desbloqueando && (
            <p className="text-caption text-texto-3">
              Usá el teclado para escribir tu PIN
            </p>
          )}
        </div>

        {/* Cerrar sesión */}
        <div className="pt-6 border-t border-borde/50 w-full flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onCerrarSesion();
            }}
            className="text-texto-3 hover:text-danger-700 text-caption"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar sesión de Google</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
