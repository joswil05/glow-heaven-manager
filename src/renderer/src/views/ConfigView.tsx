import React, { useState, useEffect } from 'react';
import {
  Save,
  Database,
  RefreshCw,
  Plus,
  Archive,
  Tag,
  ShieldCheck,
  Lock,
  MessageSquare,
  Building2,
  Download,
  Trash2,
  Clock,
  Check,
  Palette,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useTheme } from '../context/ThemeContext';
import type { ParametrosSistema, Categoria, CuentaBancaria } from '../../../shared/types';
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
  const { theme, effectiveTheme, setTheme } = useTheme();

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
  const [plantillaCobro, setPlantillaCobro] = useState('');
  const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([]);
  const [diasMora, setDiasMora] = useState(15);
  const [diasEncargos, setDiasEncargos] = useState(10);
  const [monedaDefectoVenta, setMonedaDefectoVenta] = useState<'USD' | 'NIO'>('USD');
  const [nuevaCuenta, setNuevaCuenta] = useState<CuentaBancaria>({
    banco: 'BAC Credomatic',
    moneda: 'USD',
    numero: '',
    titular: '',
    tipo: 'Ahorros',
  });
  const [exportando, setExportando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [guardadoExitoso, setGuardadoExitoso] = useState(false);
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
    setPlantillaCobro(
      parametros.plantilla_cobro_whatsapp ??
        'Hola {cliente}, te saludamos de Glow Heaven ✨ Te recordamos que tienes un saldo pendiente de {saldo_usd} ({saldo_cs}). Si ya realizaste tu abono, por favor compártenos el comprobante. ¡Muchas gracias!'
    );
    setCuentasBancarias(parametros.cuentas_bancarias ?? []);
    setDiasMora(parametros.dias_alerta_mora ?? 15);
    setDiasEncargos(parametros.dias_alerta_encargos ?? 10);
    setMonedaDefectoVenta(parametros.moneda_defecto_venta ?? 'USD');
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

  const exportarCatalogo = async () => {
    setExportando(true);
    try {
      const r = await window.api.productos.list({ incluirInactivos: true });
      if (!r.success) {
        showToast({ message: r.error, type: 'error' });
        return;
      }
      const prods = r.data;
      const encabezados = [
        'Código',
        'Nombre del Producto',
        'Categoría',
        'Estado',
        'Existencias',
        'Costo Unitario (USD)',
        'Precio Venta (USD)',
        'Ganancia Unitaria (USD)',
        'Valor Total en Inventario (USD)',
      ];
      const filas = prods.map((p) => [
        `"${p.codigo}"`,
        `"${p.nombre.replace(/"/g, '""')}"`,
        `"${(p.categoria_nombre ?? 'Sin categoría').replace(/"/g, '""')}"`,
        `"${p.activo ? (p.existencias > 0 ? 'Con stock' : 'Agotado') : 'Descatalogado'}"`,
        p.existencias,
        (p.costo_unitario_usd_cents / 100).toFixed(2),
        (p.precio_venta_usd_cents / 100).toFixed(2),
        (p.ganancia_unitaria_usd_cents / 100).toFixed(2),
        (p.valor_inventario_usd_cents / 100).toFixed(2),
      ]);
      const csv = '\uFEFF' + [encabezados.join(';'), ...filas.map((f) => f.join(';'))].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Glow_Heaven_Inventario_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast({ message: 'Catálogo exportado exitosamente para Excel (.csv)', type: 'success' });
    } catch (err) {
      showToast({ message: 'Error al exportar inventario: ' + String(err), type: 'error' });
    } finally {
      setExportando(false);
    }
  };

  const agregarCuenta = () => {
    if (!nuevaCuenta.numero.trim()) {
      showToast({ message: 'Escribí el número de cuenta bancaria', type: 'error' });
      return;
    }
    setCuentasBancarias((prev) => [...prev, { ...nuevaCuenta }]);
    setNuevaCuenta({
      banco: 'BAC Credomatic',
      moneda: 'USD',
      numero: '',
      titular: '',
      tipo: 'Ahorros',
    });
    showToast({ message: 'Cuenta agregada a la lista (guardá para confirmar)', type: 'info' });
  };

  const eliminarCuenta = (idx: number) => {
    setCuentasBancarias((prev) => prev.filter((_, i) => i !== idx));
  };

  const insertarEtiquetaWhatsApp = (etiqueta: string) => {
    setPlantillaCobro((prev) => (prev ? `${prev} ${etiqueta}` : etiqueta));
  };

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
        plantilla_cobro_whatsapp: plantillaCobro.trim(),
        cuentas_bancarias: cuentasBancarias,
        dias_alerta_mora: diasMora,
        dias_alerta_encargos: diasEncargos,
        moneda_defecto_venta: monedaDefectoVenta,
      });

      if (!r.success) {
        showToast({ message: r.error, type: 'error' });
        return;
      }

      showToast({ message: 'Configuración guardada con éxito', type: 'success' });
      setGuardadoExitoso(true);
      setTimeout(() => setGuardadoExitoso(false), 2200);
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

        {/* Apariencia del Sistema (Modo Oscuro / Claro / Automático) */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={Palette}
              title="Apariencia del Sistema"
              description="Personalizá el tema visual de la aplicación para mayor confort ocular"
            />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Opción Claro */}
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={cn(
                  'flex flex-col items-center p-3.5 rounded-2xl border text-center transition-all cursor-pointer',
                  theme === 'light'
                    ? 'border-acento bg-acento/10 ring-2 ring-acento/30 shadow-xs'
                    : 'border-borde bg-superficie hover:border-borde-fuerte hover:bg-superficie-2/50'
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mb-2 shadow-xs">
                  <Sun size={20} />
                </div>
                <span className="text-sm font-bold text-texto">Modo Claro</span>
                <span className="text-[11px] text-texto-3 mt-0.5">Luminoso y clásico</span>
                {theme === 'light' && (
                  <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-acento bg-acento/15 px-2 py-0.5 rounded-full">
                    <Check size={10} /> Activo
                  </span>
                )}
              </button>

              {/* Opción Oscuro */}
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={cn(
                  'flex flex-col items-center p-3.5 rounded-2xl border text-center transition-all cursor-pointer',
                  theme === 'dark'
                    ? 'border-acento bg-acento/10 ring-2 ring-acento/30 shadow-xs'
                    : 'border-borde bg-superficie hover:border-borde-fuerte hover:bg-superficie-2/50'
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-800 text-emerald-400 flex items-center justify-center mb-2 shadow-xs border border-slate-700">
                  <Moon size={20} />
                </div>
                <span className="text-sm font-bold text-texto">Modo Oscuro</span>
                <span className="text-[11px] text-texto-3 mt-0.5">Elegante Deep Slate</span>
                {theme === 'dark' && (
                  <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-acento bg-acento/15 px-2 py-0.5 rounded-full">
                    <Check size={10} /> Activo
                  </span>
                )}
              </button>

              {/* Opción Sistema */}
              <button
                type="button"
                onClick={() => setTheme('system')}
                className={cn(
                  'flex flex-col items-center p-3.5 rounded-2xl border text-center transition-all cursor-pointer',
                  theme === 'system'
                    ? 'border-acento bg-acento/10 ring-2 ring-acento/30 shadow-xs'
                    : 'border-borde bg-superficie hover:border-borde-fuerte hover:bg-superficie-2/50'
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mb-2 shadow-xs border border-borde">
                  <Monitor size={20} />
                </div>
                <span className="text-sm font-bold text-texto">Automático</span>
                <span className="text-[11px] text-texto-3 mt-0.5">
                  Sigue a Windows ({effectiveTheme === 'dark' ? 'Noche' : 'Día'})
                </span>
                {theme === 'system' && (
                  <span className="inline-flex items-center gap-1 mt-2 text-[10px] font-bold text-acento bg-acento/15 px-2 py-0.5 rounded-full">
                    <Check size={10} /> Activo
                  </span>
                )}
              </button>
            </div>
          </CardContent>
        </Card>


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

              <div className="rounded-xl border border-borde/80 bg-gradient-to-br from-superficie via-superficie to-superficie-2/40 p-4 shadow-xs">
                <div className="text-label font-semibold text-texto mb-2">Simulación de precio en vivo</div>
                <p className="text-caption text-texto-3 mb-3">
                  Un producto que te costó {formatearMoneda(4260, 'USD')} con flete y tax incluidos:
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

        {/* Cobranza Rápida por WhatsApp */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={MessageSquare}
              title="Cobranza Rápida por WhatsApp"
              description="Personalizá el mensaje automático para recordar saldos pendientes con 1 clic"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <Field
              label="Plantilla de Mensaje"
              hint="Podés hacer clic en las etiquetas para agregarlas al texto"
            >
              <textarea
                value={plantillaCobro}
                onChange={(e) => setPlantillaCobro(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-borde bg-superficie px-3.5 py-2.5 text-body text-texto placeholder:text-texto-3 focus:outline-none focus:ring-2 focus:ring-acento transition-all font-sans leading-relaxed"
                placeholder="Hola {cliente}, te recordamos que tenés un saldo de..."
              />
            </Field>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-caption text-texto-3 font-medium">Insertar variable:</span>
              <button
                type="button"
                onClick={() => insertarEtiquetaWhatsApp('{cliente}')}
                className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie-3 border border-borde text-texto-2 hover:text-texto pill-interactive active:scale-95 cursor-pointer"
              >
                + &#123;cliente&#125;
              </button>
              <button
                type="button"
                onClick={() => insertarEtiquetaWhatsApp('{saldo_usd}')}
                className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie-3 border border-borde text-texto-2 hover:text-texto pill-interactive active:scale-95 cursor-pointer"
              >
                + &#123;saldo_usd&#125;
              </button>
              <button
                type="button"
                onClick={() => insertarEtiquetaWhatsApp('{saldo_cs}')}
                className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie-3 border border-borde text-texto-2 hover:text-texto pill-interactive active:scale-95 cursor-pointer"
              >
                + &#123;saldo_cs&#125;
              </button>
              <button
                type="button"
                onClick={() => insertarEtiquetaWhatsApp('{cuentas_bancarias}')}
                className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie-3 border border-borde text-texto-2 hover:text-texto pill-interactive active:scale-95 cursor-pointer"
              >
                + &#123;cuentas_bancarias&#125;
              </button>
            </div>

            {/* Vista previa en vivo del mensaje */}
            <div className="p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-body text-texto-2">
              <div className="flex items-center gap-2 text-caption font-semibold text-emerald-700 mb-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Vista previa del mensaje generado:
              </div>
              <p className="text-caption text-texto-2 italic whitespace-pre-wrap">
                {plantillaCobro
                  .replace(/\{cliente\}/g, 'María López')
                  .replace(/\{saldo_usd\}/g, '$45.00')
                  .replace(/\{saldo_cs\}/g, 'C$1,647.90')
                  .replace(
                    /\{cuentas_bancarias\}/g,
                    cuentasBancarias.length > 0
                      ? cuentasBancarias.map((c) => `${c.banco} (${c.moneda}): ${c.numero}`).join(' | ')
                      : 'BAC (USD): 360-123456-7'
                  )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Cuentas Bancarias */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={Building2}
              title="Cuentas Bancarias para Comprobantes"
              description="Información que compartís a tus clientas para recibir transferencias"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {cuentasBancarias.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {cuentasBancarias.map((c, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-borde bg-superficie-2/50 flex items-start justify-between gap-3 shadow-2xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-texto text-body truncate">{c.banco}</span>
                        <Badge tone={c.moneda === 'USD' ? 'info' : 'success'}>
                          {c.moneda}
                        </Badge>
                      </div>
                      <div className="font-mono text-label text-texto font-medium mt-0.5 select-all">
                        {c.numero}
                      </div>
                      {(c.titular || c.tipo) && (
                        <div className="text-caption text-texto-3 mt-0.5 truncate">
                          {[c.tipo, c.titular].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => eliminarCuenta(idx)}
                      className="text-texto-3 hover:text-danger-600 shrink-0 -mr-1 -mt-1"
                      title="Eliminar cuenta"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-caption text-texto-3 bg-superficie-2/30 rounded-xl border border-dashed border-borde">
                No has agregado cuentas bancarias todavía.
              </div>
            )}

            {/* Formulario para agregar cuenta */}
            <div className="p-4 rounded-xl border border-borde/80 bg-superficie space-y-3">
              <div className="text-label font-semibold text-texto">Agregar nueva cuenta bancaria</div>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Field label="Banco">
                  <Input
                    placeholder="Ej. BAC, LAFISE, Banpro"
                    value={nuevaCuenta.banco}
                    onChange={(e) => setNuevaCuenta((p) => ({ ...p, banco: e.target.value }))}
                  />
                </Field>
                <Field label="Moneda">
                  <Select
                    value={nuevaCuenta.moneda}
                    onChange={(e) =>
                      setNuevaCuenta((p) => ({ ...p, moneda: e.target.value as 'USD' | 'NIO' }))
                    }
                  >
                    <option value="USD">Dólares ($)</option>
                    <option value="NIO">Córdobas (C$)</option>
                  </Select>
                </Field>
                <Field label="Número de cuenta">
                  <Input
                    placeholder="000-000000-0"
                    value={nuevaCuenta.numero}
                    onChange={(e) => setNuevaCuenta((p) => ({ ...p, numero: e.target.value }))}
                  />
                </Field>
                <Field label="Titular / Nombre">
                  <Input
                    placeholder="Ej. Glow Heaven"
                    value={nuevaCuenta.titular ?? ''}
                    onChange={(e) => setNuevaCuenta((p) => ({ ...p, titular: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="flex justify-end pt-1">
                <Button variant="outline" size="sm" onClick={agregarCuenta}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  <span>Agregar cuenta</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alertas Operativas y Preferencias */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={Clock}
              title="Alertas Operativas y Preferencias"
              description="Umbrales para detectar clientes con retraso y paquetes retenidos"
            />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field
                label="Alerta de mora en cobros"
                hint="Días sin abono para marcar saldo urgente"
              >
                <Select
                  value={diasMora}
                  onChange={(e) => setDiasMora(Number(e.target.value))}
                >
                  <option value={7}>7 días sin abonos</option>
                  <option value={15}>15 días sin abonos</option>
                  <option value={30}>30 días sin abonos</option>
                </Select>
              </Field>

              <Field
                label="Encargos estancados en USA"
                hint="Días en bodega Miami sin meter a un paquete"
              >
                <Select
                  value={diasEncargos}
                  onChange={(e) => setDiasEncargos(Number(e.target.value))}
                >
                  <option value={5}>5 días en espera</option>
                  <option value={10}>10 días en espera</option>
                  <option value={15}>15 días en espera</option>
                </Select>
              </Field>

              <Field
                label="Moneda preferida en ventas"
                hint="Moneda por defecto al facturar"
              >
                <Select
                  value={monedaDefectoVenta}
                  onChange={(e) => setMonedaDefectoVenta(e.target.value as 'USD' | 'NIO')}
                >
                  <option value="USD">Dólares ($ USD)</option>
                  <option value="NIO">Córdobas (C$ NIO)</option>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Exportación y Herramientas */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={Download}
              title="Herramientas y Exportación"
              description="Descargá tu inventario y catálogo para Excel o copias de seguridad"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-borde bg-superficie-2/40 flex-wrap">
              <div>
                <div className="font-semibold text-body text-texto">Descargar catálogo completo en Excel</div>
                <div className="text-caption text-texto-3">
                  Incluye productos activos, existencias, costos en USD, precios de venta y márgenes.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={exportarCatalogo}
                disabled={exportando}
                className="shadow-2xs font-medium"
              >
                <Download className="w-4 h-4 mr-1.5" />
                <span>{exportando ? 'Generando archivo...' : 'Exportar a Excel (.csv)'}</span>
              </Button>
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
          <Button
            variant="primary"
            onClick={guardar}
            disabled={guardando}
            className={cn(
              'transition-all duration-200 min-w-[190px]',
              guardadoExitoso && 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
            )}
          >
            {guardadoExitoso ? (
              <>
                <Check className="w-4 h-4 animate-check-pop text-white" />
                <span>¡Guardado con éxito!</span>
              </>
            ) : (
              <>
                <Save className={cn('w-4 h-4', guardando && 'animate-spin')} />
                <span>{guardando ? 'Guardando...' : 'Guardar configuración'}</span>
              </>
            )}
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
