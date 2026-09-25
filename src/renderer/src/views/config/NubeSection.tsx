import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  CloudOff,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import type { EstadoNube } from '../../../../shared/ipc-contracts';
import { Card, CardHeader, CardContent, SectionHeader, Button, Badge } from '../../components/ui';
import { useToast } from '../../context/ToastContext';

/**
 * Conexión con Firebase Firestore en la nube.
 *
 * Muestra el estado activo de sincronización con la cuenta de Google
 * y provee verificación en vivo de la conexión.
 *
 * Hasta hace poco esta tarjeta también ofrecía un login manual por correo y
 * contraseña ("Credenciales alternativas de Firebase"), sobrante de antes de
 * que el acceso pasara a ser solo con Google. Convivían dos formas de
 * entrar a la nube en la misma pantalla, y la manual ya no tenía a dónde
 * llevar a alguien que no hubiera iniciado sesión primero con Google — se
 * quitó del todo.
 */
export const NubeSection: React.FC = () => {
  const { showToast } = useToast();

  const [estado, setEstado] = useState<EstadoNube | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    const r = await window.api.nube.estado();
    if (r.success) {
      setEstado(r.data);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

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
          title="Nube"
          action={
            <Badge tone={conectado ? 'success' : configurado ? 'danger' : 'warning'}>
              {conectado ? 'Sincronizado' : configurado ? 'Sin conexión' : 'Sin configurar'}
            </Badge>
          }
        />
      </CardHeader>

      <CardContent className="space-y-4">
        {conectado && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-label text-texto-2 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success-600 shrink-0" />
              <span>
                Todo se guarda solo, con <strong className="text-texto font-medium">{estado?.correo}</strong>.
              </span>
            </p>

            <Button
              variant="secondary"
              size="sm"
              onClick={verificarSincronizacion}
              disabled={ocupado}
              className="shrink-0 bg-superficie hover:bg-superficie-2 border-borde"
            >
              <RefreshCw className={ocupado ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
              <span>{ocupado ? 'Comprobando...' : 'Comprobar'}</span>
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
            <p className="text-label text-warning-900">
              No hay sesión. Entrá con tu cuenta de Google para guardar en la nube.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
