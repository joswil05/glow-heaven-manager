import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  CloudOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { EstadoNube } from '../../../../shared/ipc-contracts';
import {
  Card,
  CardHeader,
  CardContent,
  SectionHeader,
  Button,
  Field,
  Input,
  Badge,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';

/**
 * Conexión con Firebase Firestore en la nube.
 *
 * Muestra el estado activo de sincronización con la cuenta de Google
 * y provee verificación en vivo de la conexión.
 */
export const NubeSection: React.FC = () => {
  const { showToast } = useToast();

  const [estado, setEstado] = useState<EstadoNube | null>(null);
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mostrarCredencialesManuales, setMostrarCredencialesManuales] = useState(false);

  const cargar = useCallback(async () => {
    const r = await window.api.nube.estado();
    if (r.success) {
      setEstado(r.data);
      if (r.data.correo) setCorreo(r.data.correo);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarManual = async () => {
    if (!correo.trim() || !clave) {
      setError('Escribí el correo y la contraseña de la cuenta de Firebase.');
      return;
    }

    setOcupado(true);
    setError(null);
    try {
      const r = await window.api.nube.configurar(correo.trim(), clave);
      if (!r.success) {
        setError(r.error);
        return;
      }
      setClave('');
      setEstado(r.data);
      showToast({ message: 'Conectado a Firebase con éxito', type: 'success' });
      setMostrarCredencialesManuales(false);
    } finally {
      setOcupado(false);
    }
  };

  const verificarSincronizacion = async () => {
    setOcupado(true);
    try {
      const r = await window.api.nube.reconectar();
      if (r.success) {
        setEstado(r.data);
        showToast({
          message: r.data.conectado
            ? '✓ Sincronización en la nube verificada y activa'
            : (r.data.error ?? 'Sin conexión con la nube'),
          type: r.data.conectado ? 'success' : 'error',
        });
      }
    } finally {
      setOcupado(false);
    }
  };

  const conectado = estado?.conectado ?? false;
  const configurado = estado?.configurado ?? false;

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          icon={conectado ? Cloud : CloudOff}
          title="Base de datos en la nube (Firebase)"
          description="Tus datos (inventario, ventas, clientes y paquetes) se respaldan automáticamente en Firestore"
          action={
            <Badge tone={conectado ? 'success' : configurado ? 'danger' : 'warning'}>
              {conectado ? 'Sincronizado' : configurado ? 'Sin conexión' : 'Sin configurar'}
            </Badge>
          }
        />
      </CardHeader>

      <CardContent className="space-y-4">
        {conectado && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-success-500/30 bg-success-50/40 p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-success-500/15 flex items-center justify-center text-success-700 shrink-0 mt-0.5">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <p className="text-label font-semibold text-texto flex items-center gap-1.5">
                  <span>Conexión activa con Google Cloud</span>
                  <CheckCircle2 className="w-4 h-4 text-success-600" />
                </p>
                <p className="text-caption text-texto-2 mt-0.5">
                  Autenticado como <strong className="text-texto font-medium">{estado?.correo}</strong>. Los cambios se guardan en tiempo real en la nube.
                </p>
              </div>
            </div>

            <Button
              variant="secondary"
              size="sm"
              onClick={verificarSincronizacion}
              disabled={ocupado}
              className="shrink-0 bg-superficie hover:bg-superficie-2 border-borde"
            >
              <RefreshCw className={ocupado ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
              <span>{ocupado ? 'Verificando...' : 'Comprobar sincronización'}</span>
            </Button>
          </div>
        )}

        {!conectado && estado?.error && (
          <div className="flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 p-3.5">
            <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
            <p className="text-label text-danger-800">{estado.error}</p>
          </div>
        )}

        {!configurado && (
          <div className="rounded-lg border border-warning-200 bg-warning-50 p-3.5 space-y-2">
            <p className="text-label font-medium text-warning-900">
              No hay sesión iniciada en la aplicación.
            </p>
            <p className="text-caption text-warning-800">
              Inicia sesión con tu cuenta de Google en la pantalla de acceso para sincronizar automáticamente tus datos.
            </p>
          </div>
        )}

        {/* Acceso manual alternativo (oculto por defecto si ya está conectado con Google) */}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setMostrarCredencialesManuales((prev) => !prev)}
            className="text-caption text-texto-3 hover:text-texto flex items-center gap-1.5 transition-colors"
          >
            <span>Credenciales alternativas de Firebase (Opcional)</span>
            {mostrarCredencialesManuales ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {mostrarCredencialesManuales && (
            <div className="mt-3 p-4 rounded-xl border border-borde bg-superficie-2 space-y-3 animate-fade-in">
              {error && (
                <p className="rounded-md border border-danger-200 bg-danger-50 p-2.5 text-caption text-danger-800">
                  {error}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Correo de Firebase">
                  <Input
                    type="email"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    placeholder="cuenta@firebase.com"
                  />
                </Field>
                <Field label="Contraseña">
                  <Input
                    type="password"
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    placeholder="••••••••"
                  />
                </Field>
              </div>

              <div className="flex justify-end pt-1">
                <Button variant="primary" size="sm" onClick={guardarManual} disabled={ocupado}>
                  {ocupado ? 'Guardando...' : 'Conectar cuenta manual'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
