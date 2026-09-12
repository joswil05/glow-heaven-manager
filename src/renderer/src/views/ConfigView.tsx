import React, { useState, useEffect } from 'react';
import { Save, Database, RefreshCw, Plus, Archive, Tag, ShieldCheck, Lock } from 'lucide-react';
import type { ParametrosSistema, Categoria } from '../../../shared/types';
import type { InfoSistema } from '../../../shared/ipc-contracts';
import {
  Card,
  CardHeader,
  CardContent,
  SectionHeader,
  Button,
  Field,
  Input,
  Select,
  Badge,
} from '../components/ui';
import { parsearDecimal } from '@core/numeros';
import { calcularPrecio } from '@core/precios';
import { useToast } from '../context/ToastContext';
import { NubeSection } from './config/NubeSection';
import { formatearMoneda } from '@core/moneda';

interface ConfigViewProps {
  parametros: ParametrosSistema | null;
  categorias: Categoria[];
  onCambio: () => void;
}

const PASOS = [
  { valor: 100, etiqueta: 'Al dólar entero ($43, $44)' },
  { valor: 500, etiqueta: 'A múltiplos de $5 ($45, $50)' },
  { valor: 1000, etiqueta: 'A múltiplos de $10 ($50, $60)' },
  { valor: 50, etiqueta: 'A los 50 centavos ($43.50)' },
  { valor: 25, etiqueta: 'A los 25 centavos ($43.25)' },
  { valor: 1, etiqueta: 'Sin redondear ($43.27)' },
];

const num = (t: string): number => parsearDecimal(t) ?? 0;

export const ConfigView: React.FC<ConfigViewProps> = ({ parametros, categorias, onCambio }) => {
  const { showToast } = useToast();

  const [tasa, setTasa] = useState('');
  const [tax, setTax] = useState('');
  const [tarifaEnvio, setTarifaEnvio] = useState('');
  const [margen, setMargen] = useState('');
  const [paso, setPaso] = useState(100);
  const [anticipo, setAnticipo] = useState('');
  const [stockMinimo, setStockMinimo] = useState('');
  const [mostrarCordobas, setMostrarCordobas] = useState(true);
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [telefono, setTelefono] = useState('');
  const [pinSeguridad, setPinSeguridad] = useState('');
  const [confirmarPin, setConfirmarPin] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [info, setInfo] = useState<InfoSistema | null>(null);

  useEffect(() => {
    if (!parametros) return;
    setTasa((parametros.tasa_cambio_cents / 100).toFixed(2));
    setTax(String(parametros.tax_bp / 100));
    setTarifaEnvio((parametros.tarifa_envio_cents_lb / 100).toFixed(2));
    setMargen(String(parametros.margen_defecto_bp / 100));
    setPaso(parametros.paso_redondeo_usd_cents);
    setAnticipo(String(parametros.anticipo_defecto_bp / 100));
    setStockMinimo(String(parametros.stock_minimo_defecto));
    setMostrarCordobas(parametros.mostrar_cordobas);
    setNombreNegocio(parametros.nombre_negocio);
    setTelefono(parametros.telefono_negocio);
    setPinSeguridad(parametros.pin_seguridad ?? '');
    setConfirmarPin(parametros.pin_seguridad ?? '');
  }, [parametros]);

  useEffect(() => {
    window.api.sistema.info().then((r) => {
      if (r.success) setInfo(r.data);
    });
  }, []);

  // Ejemplo en vivo con un costo típico, para que el efecto de cambiar
  // margen o redondeo se vea antes de guardar.
  const ejemplo = calcularPrecio({
    costo_unitario_usd_cents: 4260,
    modo: 'MARGEN',
    margen_bp: Math.round(num(margen) * 100),
    paso_redondeo_usd_cents: paso,
  });

  const guardar = async () => {
    if (pinSeguridad.trim()) {
      if (!/^\d{4,6}$/.test(pinSeguridad.trim())) {
        showToast({
          message: 'El PIN debe contener entre 4 y 6 dígitos numéricos (ej. 1234).',
          type: 'error',
        });
        return;
      }
      if (pinSeguridad.trim() !== confirmarPin.trim()) {
        showToast({
          message: 'El PIN y la confirmación no coinciden.',
          type: 'error',
        });
        return;
      }
    }

    setGuardando(true);
    try {
      const r = await window.api.parametros.update({
        tasa_cambio_cents: Math.round(num(tasa) * 100),
        tax_bp: Math.round(num(tax) * 100),
        tarifa_envio_cents_lb: Math.round(num(tarifaEnvio) * 100),
        margen_defecto_bp: Math.round(num(margen) * 100),
        paso_redondeo_usd_cents: paso,
        anticipo_defecto_bp: Math.round(num(anticipo) * 100),
        stock_minimo_defecto: Math.round(num(stockMinimo)),
        mostrar_cordobas: mostrarCordobas,
        nombre_negocio: nombreNegocio.trim(),
        telefono_negocio: telefono.trim(),
        pin_seguridad: pinSeguridad.trim(),
      });

      if (!r.success) {
        showToast({ message: r.error, type: 'error' });
        return;
      }

      showToast({ message: 'Configuración guardada con éxito', type: 'success' });
      onCambio();
    } finally {
      setGuardando(false);
    }
  };

  const recalcular = async () => {
    const r = await window.api.parametros.recalcularPrecios();
    if (r.success) {
      showToast({
        message: `Precios recalculados en ${r.data.productos} producto(s).`,
        type: 'success',
      });
      onCambio();
    }
  };

  const alPresionarEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;

    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
      e.preventDefault();
      const contenedor = e.currentTarget;
      const campos = Array.from(
        contenedor.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([type="checkbox"]):not([disabled]), select:not([disabled])'
        )
      ).filter((el) => el.offsetParent !== null);

      const idx = campos.indexOf(target);
      if (idx !== -1 && idx + 1 < campos.length) {
        const siguiente = campos[idx + 1];
        siguiente.focus();
        if (siguiente instanceof HTMLInputElement) {
          siguiente.select?.();
        }
      } else {
        guardar();
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 animate-fade-in" onKeyDown={alPresionarEnter}>
      <div className="max-w-4xl mx-auto space-y-5">
        <div>
          <p className="text-label text-texto-2">
            Los costos que pagás y cómo se calculan tus precios.
          </p>
        </div>

        {/* Conexión con la base. Va primero porque sin esto nada funciona. */}
        <NubeSection />

        {/* Costos de importación */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={Database}
              title="Lo que te cobran"
              description="Se usa para calcular el costo de cada paquete que traés"
            />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Tax de compra (%)" hint="Lo que te cobran las tiendas en USA">
                <Input value={tax} onChange={(e) => setTax(e.target.value)} className="text-right" />
              </Field>
              <Field label="Envío por libra ($)" hint="Solo es una sugerencia: podés escribir el real">
                <Input
                  value={tarifaEnvio}
                  onChange={(e) => setTarifaEnvio(e.target.value)}
                  className="text-right"
                />
              </Field>
              <Field label="Córdobas por dólar" hint="Solo para mostrar el equivalente en C$">
                <Input value={tasa} onChange={(e) => setTasa(e.target.value)} className="text-right" />
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Precios */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={Tag}
              title="Cómo se calculan tus precios"
              description="La ganancia siempre se mide contra el costo real, ya con tax y envío adentro"
            />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-4">
                <Field
                  label="Ganancia por defecto (%)"
                  hint="Sobre el costo. Cada categoría o producto puede tener el suyo."
                >
                  <Input
                    value={margen}
                    onChange={(e) => setMargen(e.target.value)}
                    className="text-right"
                  />
                </Field>
                <Field label="Redondear el precio" hint="Siempre hacia arriba, nunca hacia abajo">
                  <Select value={paso} onChange={(e) => setPaso(Number(e.target.value))}>
                    {PASOS.map((p) => (
                      <option key={p.valor} value={p.valor}>
                        {p.etiqueta}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="rounded-lg border border-borde bg-superficie-2 p-4">
                <div className="text-label font-medium text-texto-2 mb-2">Ejemplo</div>
                <p className="text-caption text-texto-3 mb-3">
                  Un producto que te costó {formatearMoneda(4260, 'USD')} con todo incluido:
                </p>
                <dl className="space-y-1.5 text-label">
                  <div className="flex justify-between gap-2">
                    <dt className="text-texto-2">Fórmula da</dt>
                    <dd className="tabular text-texto-2">
                      {formatearMoneda(ejemplo.precio_crudo_usd_cents, 'USD')}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-texto-2">Precio final</dt>
                    <dd className="tabular font-semibold text-texto">
                      {formatearMoneda(ejemplo.precio_usd_cents, 'USD')}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 pt-1.5 border-t border-borde">
                    <dt className="text-texto-2">Ganás</dt>
                    <dd className="flex items-center gap-1.5">
                      <span className="tabular text-texto">
                        {formatearMoneda(ejemplo.ganancia_usd_cents, 'USD')}
                      </span>
                      <Badge tone="success">
                        {(ejemplo.margen_sobre_costo_bp / 100).toFixed(0)}%
                      </Badge>
                    </dd>
                  </div>
                </dl>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={recalcular}
                  className="mt-3 w-full"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Recalcular precios del inventario</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Categorías */}
        <CategoriasSection categorias={categorias} onCambio={onCambio} margenGlobal={num(margen)} />

        {/* Ventas */}
        <Card>
          <CardHeader>
            <SectionHeader icon={Tag} title="Ventas y encargos" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Anticipo por defecto (%)" hint="Lo que pedís en los encargos">
                <Input
                  value={anticipo}
                  onChange={(e) => setAnticipo(e.target.value)}
                  className="text-right"
                />
              </Field>
              <Field label="Avisar cuando queden" hint="Unidades mínimas de un producto nuevo">
                <Input
                  value={stockMinimo}
                  onChange={(e) => setStockMinimo(e.target.value)}
                  className="text-right"
                />
              </Field>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mostrarCordobas}
                    onChange={(e) => setMostrarCordobas(e.target.checked)}
                    className="w-4 h-4 rounded border-borde-fuerte text-acento focus-visible:ring-2 focus-visible:ring-acento"
                  />
                  <span className="text-body text-texto-2">Mostrar también en córdobas</span>
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Negocio */}
        <Card>
          <CardHeader>
            <SectionHeader icon={Database} title="Tu negocio" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Nombre del negocio">
                <Input value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)} />
              </Field>
              <Field label="Teléfono">
                <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </Field>
            </div>

            <p className="text-caption text-texto-3">
              {info
                ? `Versión ${info.version}. Todo se guarda solo en la nube.`
                : 'Cargando información del sistema...'}
            </p>
          </CardContent>
        </Card>

        {/* Seguridad y Bloqueo por PIN */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={ShieldCheck}
              title="Seguridad y Bloqueo con PIN"
              description="Exigí un código numérico cada vez que abras la app para proteger tus datos"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-body text-texto-2 leading-relaxed">
              Configurá un PIN de 4 a 6 dígitos numéricos. Al abrir la app, nadie podrá ver tus productos ni finanzas sin ingresar este código. Si lo dejás en blanco, la app entra de inmediato sin solicitarlo.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
              <Field label="PIN de acceso (4 a 6 dígitos)" hint="Solo números">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Ej: 1234"
                  value={pinSeguridad}
                  onChange={(e) => setPinSeguridad(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field label="Confirmar PIN" hint="Escribí el mismo PIN para verificar">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Repetir PIN"
                  value={confirmarPin}
                  onChange={(e) => setConfirmarPin(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
            </div>

            {pinSeguridad && (
              <div className="flex items-center gap-3 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPinSeguridad('');
                    setConfirmarPin('');
                  }}
                  className="text-danger-600 hover:text-danger-700"
                >
                  <Lock className="w-3.5 h-3.5 mr-1" />
                  <span>Quitar / Desactivar PIN</span>
                </Button>
                <span className="text-caption text-texto-3">
                  (Guardá la configuración para aplicar el cambio)
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end sticky bottom-0 py-4 bg-gradient-to-t from-fondo via-fondo">
          <Button variant="primary" onClick={guardar} disabled={guardando}>
            <Save className="w-4 h-4" />
            <span>{guardando ? 'Guardando...' : 'Guardar configuración'}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const CategoriasSection: React.FC<{
  categorias: Categoria[];
  margenGlobal: number;
  onCambio: () => void;
}> = ({ categorias, margenGlobal, onCambio }) => {
  const { showToast } = useToast();
  const [editando, setEditando] = useState<Record<number, string>>({});
  const [nueva, setNueva] = useState('');

  const guardarMargen = async (c: Categoria) => {
    const texto = editando[c.id];
    if (texto === undefined) return;

    const r = await window.api.categorias.guardar({
      id: c.id,
      nombre: c.nombre,
      margen_defecto_bp: Math.round(num(texto) * 100),
    });

    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    setEditando((p) => {
      const copia = { ...p };
      delete copia[c.id];
      return copia;
    });
    showToast({ message: `Margen de ${c.nombre} actualizado`, type: 'success' });
    onCambio();
  };

  const agregar = async () => {
    if (!nueva.trim()) return;

    const r = await window.api.categorias.guardar({
      nombre: nueva.trim(),
      margen_defecto_bp: Math.round(margenGlobal * 100),
    });

    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    setNueva('');
    showToast({ message: 'Categoría creada', type: 'success' });
    onCambio();
  };

  const archivar = async (c: Categoria) => {
    const r = await window.api.categorias.archivar(c.id);
    showToast({
      message: r.success ? `'${c.nombre}' archivada` : r.error,
      type: r.success ? 'success' : 'error',
    });
    if (r.success) onCambio();
  };

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          icon={Tag}
          title="Ganancia por categoría"
          description="Un producto sin margen propio usa el de su categoría"
        />
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-borde">
          {categorias.map((c) => {
            const texto = editando[c.id] ?? String(c.margen_defecto_bp / 100);
            const cambiado = editando[c.id] !== undefined;

            return (
              <li key={c.id} className="px-4 py-2.5 flex items-center gap-3">
                <span className="flex-1 text-body text-texto">{c.nombre}</span>
                <div className="flex items-center gap-1">
                  <Input
                    value={texto}
                    onChange={(e) => setEditando((p) => ({ ...p, [c.id]: e.target.value }))}
                    className="w-20 text-right"
                    aria-label={`Ganancia de ${c.nombre}`}
                  />
                  <span className="text-label text-texto-3">%</span>
                </div>
                {cambiado ? (
                  <Button size="sm" variant="primary" onClick={() => guardarMargen(c)}>
                    Guardar
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Archivar ${c.nombre}`}
                    className="text-texto-3 hover:text-danger-600"
                    onClick={() => archivar(c)}
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="px-4 py-3 border-t border-borde flex gap-2">
          <Input
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') agregar();
            }}
            placeholder="Nombre de una categoría nueva"
            className="flex-1"
            aria-label="Nombre de la categoría nueva"
          />
          <Button variant="secondary" onClick={agregar} disabled={!nueva.trim()}>
            <Plus className="w-4 h-4" />
            <span>Agregar</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
