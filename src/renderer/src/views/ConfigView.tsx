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
  Users,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useTheme } from '../context/ThemeContext';
import type { ParametrosSistema, Categoria, CuentaBancaria, MetodoPago, Acceso } from '../../../shared/types';
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
import { parsearDecimal, parsearACentavos } from '@core/numeros';
import { calcularPrecio } from '@core/precios';
import { useToast } from '../context/ToastContext';
import { NubeSection } from './config/NubeSection';
import { Confirmar } from '../components/ui/Confirmar';
import { formatearMoneda } from '@core/moneda';
import { hoyISO, mesISO } from '@core/fechas';
import { generarCSV, dinero, nombreArchivo, type Columna } from '@core/exportar';

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

/** Quien desarrolló la herramienta. Se avisa distinto al quitarle el acceso. */
const CORREO_DESARROLLADOR = 'espinozajoswill@gmail.com';

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
  const [plantillaFactura, setPlantillaFactura] = useState('');
  const [plantillaProforma, setPlantillaProforma] = useState('');
  const [tabPlantillaWA, setTabPlantillaWA] = useState<'COBRO' | 'FACTURA' | 'PROFORMA'>('COBRO');
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
  const [exportando, setExportando] = useState<
    'ventas' | 'abonos' | 'clientas' | 'paquetes' | 'inventario' | null
  >(null);
  // El período que se va a bajar. Arranca en el año corriente, que es lo que
  // pide una contadora; el resto se elige.
  const [metodoDefecto, setMetodoDefecto] = useState<MetodoPago>('EFECTIVO');
  const [cuotasCantidad, setCuotasCantidad] = useState('4');
  const [cuotasDias, setCuotasDias] = useState('15');
  const [pantallaInicio, setPantallaInicio] = useState('panel');
  const [pantallaInicioMovil, setPantallaInicioMovil] = useState('panel');
  const [codigoPais, setCodigoPais] = useState('505');
  const [accesos, setAccesos] = useState<Acceso[]>([]);
  const [correoInvitado, setCorreoInvitado] = useState('');
  const [invitando, setInvitando] = useState(false);
  const [quitando, setQuitando] = useState<Acceso | null>(null);
  const [desdeExp, setDesdeExp] = useState(`${mesISO().slice(0, 4)}-01-01`);
  const [hastaExp, setHastaExp] = useState(hoyISO());
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
    setPlantillaFactura(
      parametros.plantilla_factura_whatsapp ??
        '¡Hola {cliente}! ✨ Muchas gracias por tu compra en Glow Heaven 🛍️\n\n📄 Factura: {codigo}\n💵 Total: {total_usd} (≈ {total_cs})\n{estado_pago}\n\n{cuentas_bancarias}\n¡Esperamos que disfrutes tus prendas! 💖'
    );
    setPlantillaProforma(
      parametros.plantilla_proforma_whatsapp ??
        '¡Hola {cliente}! ✨ Te compartimos la cotización de tu encargo en Glow Heaven 📦✈️\n\n📋 Cotización: {codigo}\n💰 Total estimado: {total_usd} (≈ {total_cs})\n🔒 Anticipo requerido (50%): {anticipo}\n🤝 Saldo contra entrega: {saldo}\n\n{cuentas_bancarias}\n¡Quedamos atentas a tu comprobante! 💕'
    );
    setCuentasBancarias(parametros.cuentas_bancarias ?? []);
    setDiasMora(parametros.dias_alerta_mora ?? 15);
    setDiasEncargos(parametros.dias_alerta_encargos ?? 10);
    setMonedaDefectoVenta(parametros.moneda_defecto_venta ?? 'USD');
    setMetodoDefecto(parametros.metodo_pago_defecto ?? 'EFECTIVO');
    setCuotasCantidad(String(parametros.cuotas_defecto_cantidad ?? 4));
    setCuotasDias(String(parametros.cuotas_defecto_dias ?? 15));
    setPantallaInicio(parametros.pantalla_inicio ?? 'panel');
    setPantallaInicioMovil(parametros.pantalla_inicio_movil ?? 'panel');
    setCodigoPais(parametros.codigo_pais_whatsapp ?? '505');
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

  /**
   * Bajar los datos del negocio.
   *
   * Son datos de ella. Hasta ahora solo podia bajar el catalogo: ni sus
   * ventas, ni sus abonos, ni sus clientas. Si la contadora le pedia el anio,
   * o queria un respaldo propio, no tenia como.
   */
  const bajarArchivo = (contenido: string, nombre: string) => {
    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const cargarAccesos = async () => {
    const r = await window.api.accesos.list();
    if (r.success) setAccesos(r.data);
  };

  useEffect(() => {
    cargarAccesos();
    // Se lee una vez al entrar a Configuración: cambia sólo cuando ella lo cambia.
  }, []);

  const invitar = async () => {
    setInvitando(true);
    try {
      const r = await window.api.accesos.invitar(correoInvitado);
      if (!r.success) throw new Error(r.error);
      setCorreoInvitado('');
      await cargarAccesos();
      showToast({
        message: 'Invitación creada. El acceso se activa cuando entre con ese correo.',
        type: 'success',
      });
    } catch (err) {
      showToast({ message: String(err instanceof Error ? err.message : err), type: 'error' });
    } finally {
      setInvitando(false);
    }
  };

  /**
   * Qué pasa al quitar este acceso.
   *
   * No es lo mismo sacar a una ayudante que sacar a quien te hizo la
   * herramienta: en el segundo caso, si después necesitás que te ayude con
   * algo, vas a tener que volver a invitarlo. Eso se dice antes, no después.
   */
  const consecuenciasDeQuitar = (a: Acceso): string[] => {
    const base = a.pendiente
      ? ['La invitación se cancela: ese correo ya no va a poder entrar.']
      : [
          'Deja de poder abrir la app, en la computadora y en el celular.',
          'Los datos que cargó se quedan: no se borra nada del negocio.',
        ];
    if (a.correo === CORREO_DESARROLLADOR) {
      base.push(
        'Es quien desarrolló la herramienta. Si más adelante necesitás que te ayude con algo, vas a tener que invitarlo de nuevo.'
      );
    }
    return base;
  };

  const confirmarQuitar = async () => {
    if (!quitando) return;
    try {
      const r = await window.api.accesos.quitar(quitando.id, quitando.correo);
      if (!r.success) throw new Error(r.error);
      await cargarAccesos();
      showToast({ message: `${quitando.correo} ya no tiene acceso`, type: 'success' });
    } catch (err) {
      showToast({ message: String(err instanceof Error ? err.message : err), type: 'error' });
    } finally {
      setQuitando(null);
    }
  };

  const exportar = async (que: 'ventas' | 'abonos' | 'clientas' | 'paquetes' | 'inventario') => {
    setExportando(que);
    try {
      if (que === 'inventario') {
        const r = await window.api.productos.list({ incluirInactivos: true });
        if (!r.success) throw new Error(r.error);
        const cols: Columna<(typeof r.data)[number]>[] = [
          { titulo: 'Codigo', valor: (p) => p.codigo },
          { titulo: 'Producto', valor: (p) => p.nombre },
          { titulo: 'Categoria', valor: (p) => p.categoria_nombre ?? 'Sin categoria' },
          {
            titulo: 'Estado',
            valor: (p) =>
              !p.activo ? 'Descatalogado' : p.existencias > 0 ? 'Con stock' : 'Agotado',
          },
          { titulo: 'Existencias', valor: (p) => p.existencias },
          { titulo: 'Costo unitario (USD)', valor: (p) => dinero(p.costo_unitario_usd_cents) },
          { titulo: 'Precio de venta (USD)', valor: (p) => dinero(p.precio_venta_usd_cents) },
          { titulo: 'Ganancia unitaria (USD)', valor: (p) => dinero(p.ganancia_unitaria_usd_cents) },
          { titulo: 'Valor en bodega (USD)', valor: (p) => dinero(p.valor_inventario_usd_cents) },
        ];
        bajarArchivo(generarCSV(cols, r.data), nombreArchivo('Inventario', hoyISO()));
        showToast({ message: r.data.length + ' productos exportados', type: 'success' });
        return;
      }

      if (que === 'clientas') {
        const r = await window.api.clientes.list();
        if (!r.success) throw new Error(r.error);
        const cols: Columna<(typeof r.data)[number]>[] = [
          { titulo: 'Nombre', valor: (c) => c.nombre },
          { titulo: 'Alias', valor: (c) => c.alias ?? '' },
          { titulo: 'Telefono', valor: (c) => c.telefono ?? '' },
          { titulo: 'Compras', valor: (c) => c.compras_count ?? 0 },
          { titulo: 'Total comprado (USD)', valor: (c) => dinero(c.total_comprado_usd_cents) },
          { titulo: 'Debe (USD)', valor: (c) => dinero(c.saldo_pendiente_usd_cents) },
          { titulo: 'Ultima compra', valor: (c) => c.ultima_compra ?? '' },
        ];
        bajarArchivo(generarCSV(cols, r.data), nombreArchivo('Clientas', hoyISO()));
        showToast({ message: r.data.length + ' clientas exportadas', type: 'success' });
        return;
      }

      if (que === 'paquetes') {
        const r = await window.api.compras.list();
        if (!r.success) throw new Error(r.error);
        const enRango = r.data.filter((c) => c.fecha >= desdeExp && c.fecha <= hastaExp);
        const cols: Columna<(typeof enRango)[number]>[] = [
          { titulo: 'Paquete', valor: (c) => c.codigo },
          { titulo: 'Fecha', valor: (c) => c.fecha },
          { titulo: 'Estado', valor: (c) => (c.estado === 'RECIBIDA' ? 'En inventario' : 'Cargando') },
          { titulo: 'Productos (USD)', valor: (c) => dinero(c.subtotal_productos_usd_cents) },
          { titulo: 'Impuesto (USD)', valor: (c) => dinero(c.tax_total_usd_cents) },
          { titulo: 'Envio (USD)', valor: (c) => dinero(c.envio_total_usd_cents) },
          { titulo: 'Otros costos (USD)', valor: (c) => dinero(c.otros_costos_usd_cents) },
          { titulo: 'Total invertido (USD)', valor: (c) => dinero(c.total_usd_cents) },
          { titulo: 'Peso (lb)', valor: (c) => ((c.peso_total_mlb ?? 0) / 1000).toFixed(2) },
        ];
        bajarArchivo(generarCSV(cols, enRango), nombreArchivo('Paquetes', desdeExp, hastaExp));
        showToast({ message: enRango.length + ' paquetes exportados', type: 'success' });
        return;
      }

      if (que === 'ventas') {
        const r = await window.api.ventas.list({ desde: desdeExp, hasta: hastaExp });
        if (!r.success) throw new Error(r.error);
        const cols: Columna<(typeof r.data)[number]>[] = [
          { titulo: 'Venta', valor: (v) => v.codigo },
          { titulo: 'Fecha', valor: (v) => v.fecha },
          { titulo: 'Tipo', valor: (v) => (v.tipo === 'ENCARGO' ? 'Encargo' : 'De inventario') },
          { titulo: 'Clienta', valor: (v) => v.cliente_nombre ?? 'Mostrador' },
          { titulo: 'Estado', valor: (v) => v.estado },
          { titulo: 'Total (USD)', valor: (v) => dinero(v.total_usd_cents) },
          { titulo: 'Pagado (USD)', valor: (v) => dinero(v.pagado_usd_cents) },
          { titulo: 'Debe (USD)', valor: (v) => dinero(v.saldo_usd_cents) },
          { titulo: 'Costo (USD)', valor: (v) => dinero(v.costo_total_usd_cents) },
          { titulo: 'Ganancia (USD)', valor: (v) => dinero(v.ganancia_usd_cents) },
        ];
        bajarArchivo(generarCSV(cols, r.data), nombreArchivo('Ventas', desdeExp, hastaExp));
        showToast({ message: r.data.length + ' ventas exportadas', type: 'success' });
        return;
      }

      const r = await window.api.pagos.enRango(desdeExp, hastaExp);
      if (!r.success) throw new Error(r.error);
      const cols: Columna<(typeof r.data)[number]>[] = [
        { titulo: 'Fecha', valor: (p) => p.fecha },
        { titulo: 'Venta', valor: (p) => p.venta_codigo ?? '' },
        { titulo: 'Clienta', valor: (p) => p.cliente_nombre ?? '' },
        { titulo: 'Metodo', valor: (p) => p.metodo },
        { titulo: 'Monto (USD)', valor: (p) => dinero(p.monto_usd_cents) },
        { titulo: 'Referencia', valor: (p) => p.referencia ?? '' },
        { titulo: 'Notas', valor: (p) => p.notas ?? '' },
      ];
      bajarArchivo(generarCSV(cols, r.data), nombreArchivo('Abonos', desdeExp, hastaExp));
      showToast({ message: r.data.length + ' abonos exportados', type: 'success' });
    } catch (err) {
      showToast({ message: 'No se pudo exportar: ' + String(err), type: 'error' });
    } finally {
      setExportando(null);
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
    if (tabPlantillaWA === 'COBRO') {
      setPlantillaCobro((prev) => (prev ? `${prev} ${etiqueta}` : etiqueta));
    } else if (tabPlantillaWA === 'FACTURA') {
      setPlantillaFactura((prev) => (prev ? `${prev} ${etiqueta}` : etiqueta));
    } else {
      setPlantillaProforma((prev) => (prev ? `${prev} ${etiqueta}` : etiqueta));
    }
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

    const tasaCents = parsearACentavos(tasa, { min: 0.01 });
    if (tasaCents === null) {
      showToast({ message: 'La tasa de cambio (C$ por USD) debe ser un número válido mayor a cero.', type: 'error' });
      return;
    }
    const taxBp = parsearDecimal(tax, { min: 0, max: 100 });
    if (taxBp === null) {
      showToast({ message: 'El impuesto tax de USA (%) debe ser un número válido entre 0 y 100.', type: 'error' });
      return;
    }
    const tarifaEnvioCents = parsearACentavos(tarifaEnvio, { min: 0 });
    if (tarifaEnvioCents === null) {
      showToast({ message: 'La tarifa de envío por libra ($) debe ser un monto válido mayor o igual a cero.', type: 'error' });
      return;
    }
    const margenBp = parsearDecimal(margen, { min: 0 });
    if (margenBp === null) {
      showToast({ message: 'El margen de ganancia (%) debe ser un número válido mayor o igual a cero.', type: 'error' });
      return;
    }
    const anticipoBp = parsearDecimal(anticipo, { min: 0, max: 100 });
    if (anticipoBp === null) {
      showToast({ message: 'El anticipo por defecto para encargos (%) debe ser un número entre 0 y 100.', type: 'error' });
      return;
    }
    const stockMin = parsearDecimal(stockMinimo, { min: 0 });
    if (stockMin === null) {
      showToast({ message: 'El stock mínimo por defecto debe ser un número mayor o igual a cero.', type: 'error' });
      return;
    }

    setGuardando(true);
    try {
      const r = await window.api.parametros.update({
        tasa_cambio_cents: tasaCents,
        tax_bp: Math.round(taxBp * 100),
        tarifa_envio_cents_lb: tarifaEnvioCents,
        margen_defecto_bp: Math.round(margenBp * 100),
        paso_redondeo_usd_cents: paso,
        anticipo_defecto_bp: Math.round(anticipoBp * 100),
        stock_minimo_defecto: Math.round(stockMin),
        mostrar_cordobas: mostrarCordobas,
        nombre_negocio: nombreNegocio.trim(),
        telefono_negocio: telefono.trim(),
        pin_seguridad: pinSeguridad.trim(),
        plantilla_cobro_whatsapp: plantillaCobro.trim(),
        plantilla_factura_whatsapp: plantillaFactura.trim(),
        plantilla_proforma_whatsapp: plantillaProforma.trim(),
        cuentas_bancarias: cuentasBancarias,
        dias_alerta_mora: diasMora,
        dias_alerta_encargos: diasEncargos,
        moneda_defecto_venta: monedaDefectoVenta,
        metodo_pago_defecto: metodoDefecto,
        cuotas_defecto_cantidad: Number(cuotasCantidad) || 4,
        cuotas_defecto_dias: Number(cuotasDias) || 15,
        pantalla_inicio: pantallaInicio,
        pantalla_inicio_movil: pantallaInicioMovil,
        codigo_pais_whatsapp: codigoPais.replace(/\D/g, '') || '505',
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
    <div className="flex-1 overflow-y-auto p-4 md:px-6 md:py-5 animate-fade-in scroll-smooth" onKeyDown={alPresionarEnter}>
      <div className="max-w-[1500px] w-full mx-auto space-y-5 stagger-children">
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
                  'flex flex-col items-center p-3.5 rounded-2xl border text-center transition-[background-color,border-color,color,box-shadow,transform,opacity] cursor-pointer',
                  theme === 'light'
                    ? 'border-acento bg-acento/10 ring-2 ring-acento/30 shadow-xs'
                    : 'border-borde bg-superficie hover:border-borde-fuerte hover:bg-superficie-2/50'
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-alerta-suave text-alerta flex items-center justify-center mb-2 shadow-xs">
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
                  'flex flex-col items-center p-3.5 rounded-2xl border text-center transition-[background-color,border-color,color,box-shadow,transform,opacity] cursor-pointer',
                  theme === 'dark'
                    ? 'border-acento bg-acento/10 ring-2 ring-acento/30 shadow-xs'
                    : 'border-borde bg-superficie hover:border-borde-fuerte hover:bg-superficie-2/50'
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-superficie-3 text-acento flex items-center justify-center mb-2 shadow-xs border border-borde">
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
                  'flex flex-col items-center p-3.5 rounded-2xl border text-center transition-[background-color,border-color,color,box-shadow,transform,opacity] cursor-pointer',
                  theme === 'system'
                    ? 'border-acento bg-acento/10 ring-2 ring-acento/30 shadow-xs'
                    : 'border-borde bg-superficie hover:border-borde-fuerte hover:bg-superficie-2/50'
                )}
              >
                <div className="w-10 h-10 rounded-xl bg-superficie-2 text-texto-2 flex items-center justify-center mb-2 shadow-xs border border-borde">
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

        {/* Mensajes Predeterminados por WhatsApp */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={MessageSquare}
              title="Mensajes Predeterminados por WhatsApp"
              description="Personalizá los mensajes automáticos de cobro, facturas y cotizaciones con 1 clic"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pestañas de plantillas */}
            <div className="flex rounded-xl bg-superficie-2 p-1 border border-borde gap-1">
              <button
                type="button"
                onClick={() => setTabPlantillaWA('COBRO')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-label font-bold transition-[background-color,border-color,color,box-shadow,transform,opacity] cursor-pointer',
                  tabPlantillaWA === 'COBRO'
                    ? 'bg-superficie text-texto shadow-xs border border-borde/70'
                    : 'text-texto-3 hover:text-texto'
                )}
              >
                Recordatorio de Saldo
              </button>
              <button
                type="button"
                onClick={() => setTabPlantillaWA('FACTURA')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-label font-bold transition-[background-color,border-color,color,box-shadow,transform,opacity] cursor-pointer',
                  tabPlantillaWA === 'FACTURA'
                    ? 'bg-superficie text-texto shadow-xs border border-borde/70'
                    : 'text-texto-3 hover:text-texto'
                )}
              >
                Factura Comercial
              </button>
              <button
                type="button"
                onClick={() => setTabPlantillaWA('PROFORMA')}
                className={cn(
                  'flex-1 py-2 px-3 rounded-lg text-label font-bold transition-[background-color,border-color,color,box-shadow,transform,opacity] cursor-pointer',
                  tabPlantillaWA === 'PROFORMA'
                    ? 'bg-superficie text-texto shadow-xs border border-borde/70'
                    : 'text-texto-3 hover:text-texto'
                )}
              >
                Cotización de Encargo
              </button>
            </div>

            {/* Editor de la plantilla activa */}
            <Field
              label={
                tabPlantillaWA === 'COBRO'
                  ? 'Plantilla de Cobro / Saldo Pendiente'
                  : tabPlantillaWA === 'FACTURA'
                    ? 'Plantilla de Envío de Factura Comercial'
                    : 'Plantilla de Proforma / Cotización de Encargo'
              }
              hint="Podés hacer clic en las etiquetas para insertarlas directamente al texto"
            >
              <textarea
                value={
                  tabPlantillaWA === 'COBRO'
                    ? plantillaCobro
                    : tabPlantillaWA === 'FACTURA'
                      ? plantillaFactura
                      : plantillaProforma
                }
                onChange={(e) => {
                  if (tabPlantillaWA === 'COBRO') setPlantillaCobro(e.target.value);
                  else if (tabPlantillaWA === 'FACTURA') setPlantillaFactura(e.target.value);
                  else setPlantillaProforma(e.target.value);
                }}
                rows={4}
                className="w-full rounded-xl border border-borde bg-superficie px-3.5 py-2.5 text-body text-texto placeholder:text-texto-3 focus:outline-none focus:ring-2 focus:ring-acento transition-[background-color,border-color,color,box-shadow,transform,opacity] font-sans leading-relaxed"
                placeholder="Escribe aquí el texto de tu mensaje..."
              />
            </Field>

            {/* Píldoras de variables según plantilla activa */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-caption text-texto-3 font-medium">Insertar variable:</span>
              <button
                type="button"
                onClick={() => insertarEtiquetaWhatsApp('{cliente}')}
                className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
              >
                + &#123;cliente&#125;
              </button>

              {tabPlantillaWA !== 'COBRO' && (
                <button
                  type="button"
                  onClick={() => insertarEtiquetaWhatsApp('{codigo}')}
                  className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
                >
                  + &#123;codigo&#125;
                </button>
              )}

              {tabPlantillaWA === 'COBRO' ? (
                <>
                  <button
                    type="button"
                    onClick={() => insertarEtiquetaWhatsApp('{saldo_usd}')}
                    className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
                  >
                    + &#123;saldo_usd&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => insertarEtiquetaWhatsApp('{saldo_cs}')}
                    className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
                  >
                    + &#123;saldo_cs&#125;
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => insertarEtiquetaWhatsApp('{total_usd}')}
                    className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
                  >
                    + &#123;total_usd&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => insertarEtiquetaWhatsApp('{total_cs}')}
                    className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
                  >
                    + &#123;total_cs&#125;
                  </button>
                </>
              )}

              {tabPlantillaWA === 'FACTURA' && (
                <button
                  type="button"
                  onClick={() => insertarEtiquetaWhatsApp('{estado_pago}')}
                  className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
                >
                  + &#123;estado_pago&#125;
                </button>
              )}

              {tabPlantillaWA === 'PROFORMA' && (
                <>
                  <button
                    type="button"
                    onClick={() => insertarEtiquetaWhatsApp('{anticipo}')}
                    className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
                  >
                    + &#123;anticipo&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => insertarEtiquetaWhatsApp('{saldo}')}
                    className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
                  >
                    + &#123;saldo&#125;
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => insertarEtiquetaWhatsApp('{cuentas_bancarias}')}
                className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
              >
                + &#123;cuentas_bancarias&#125;
              </button>
            </div>

            {/* Vista previa en vivo del mensaje */}
            <div className="p-4 rounded-xl bg-acento/5 dark:bg-acento-suave border border-acento-suave text-body text-texto">
              <div className="flex items-center gap-2 text-caption font-bold text-acento mb-2">
                <span className="w-2 h-2 rounded-full bg-acento" />
                Vista previa del mensaje ({tabPlantillaWA === 'COBRO' ? 'Cobro' : tabPlantillaWA === 'FACTURA' ? 'Factura' : 'Proforma'}):
              </div>
              <div className="p-3 rounded-lg bg-superficie border border-borde/60 shadow-2xs font-sans text-caption text-texto whitespace-pre-wrap leading-relaxed">
                {(tabPlantillaWA === 'COBRO'
                  ? plantillaCobro
                  : tabPlantillaWA === 'FACTURA'
                    ? plantillaFactura
                    : plantillaProforma
                )
                  .replace(/\{cliente\}/g, 'María López')
                  .replace(/\{codigo\}/g, tabPlantillaWA === 'PROFORMA' ? 'COT-E-0012' : 'FAC-V-0024')
                  .replace(/\{saldo_usd\}/g, '$45.00')
                  .replace(/\{saldo_cs\}/g, 'C$1,647.90')
                  .replace(/\{total_usd\}/g, '$90.00')
                  .replace(/\{total_cs\}/g, 'C$3,295.80')
                  .replace(/\{estado_pago\}/g, '✓ Pagado en su totalidad')
                  .replace(/\{anticipo\}/g, '$45.00')
                  .replace(/\{saldo\}/g, '$45.00')
                  .replace(
                    /\{cuentas_bancarias\}/g,
                    cuentasBancarias.length > 0
                      ? cuentasBancarias.map((c) => `${c.banco} (${c.moneda}): ${c.numero}`).join(' | ')
                      : 'BAC (USD): 360-123456-7'
                  )}
              </div>
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
              title="Avisos y preferencias"
              description="Cuándo avisarte, y con qué arranca cada pantalla para que no lo elijas cada vez"
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
                hint="Días comprados sin meter a un paquete"
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
                label="Moneda con la que arrancan los cobros"
                hint="Se puede cambiar en cada venta"
              >
                <Select
                  value={monedaDefectoVenta}
                  onChange={(e) => setMonedaDefectoVenta(e.target.value as 'USD' | 'NIO')}
                >
                  <option value="USD">Dólares ($ USD)</option>
                  <option value="NIO">Córdobas (C$ NIO)</option>
                </Select>
              </Field>

              <Field
                label="Método con el que arrancan los cobros"
                hint="El que más usás, para no elegirlo cada vez"
              >
                <Select
                  value={metodoDefecto}
                  onChange={(e) => setMetodoDefecto(e.target.value as MetodoPago)}
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="OTRO">Otro</option>
                </Select>
              </Field>

              <Field label="Cuotas que propone una venta a crédito" hint="Se puede cambiar en cada venta">
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={cuotasCantidad}
                    onChange={(e) => setCuotasCantidad(e.target.value.replace(/\D/g, ''))}
                    className="w-16 text-center"
                    aria-label="Cantidad de cuotas"
                  />
                  <span className="text-caption text-texto-3 whitespace-nowrap">cuotas cada</span>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={cuotasDias}
                    onChange={(e) => setCuotasDias(e.target.value.replace(/\D/g, ''))}
                    className="w-16 text-center"
                    aria-label="Días entre cuotas"
                  />
                  <span className="text-caption text-texto-3">días</span>
                </div>
              </Field>

              <Field
                label="Pantalla con la que abre Windows"
                hint="Donde empieza tu día en la computadora"
              >
                <Select value={pantallaInicio} onChange={(e) => setPantallaInicio(e.target.value)}>
                  <option value="panel">Inicio</option>
                  <option value="ventas">Ventas</option>
                  <option value="encargos">Encargos</option>
                  <option value="cobranza">Cobros y Abonos</option>
                  <option value="inventario">Inventario</option>
                  <option value="clientes">Clientes</option>
                </Select>
              </Field>

              <Field
                label="Pantalla con la que abre el celular"
                hint="Se nota: el celular se abre muchas veces al día"
              >
                <Select
                  value={pantallaInicioMovil}
                  onChange={(e) => setPantallaInicioMovil(e.target.value)}
                >
                  <option value="panel">Inicio</option>
                  <option value="vender">Vender</option>
                  <option value="cobranza">Cobranza</option>
                  <option value="inventario">Inventario</option>
                </Select>
              </Field>

              <Field
                label="Código de país para WhatsApp"
                hint="505 es Nicaragua. Sin el +"
              >
                <Input
                  type="text"
                  inputMode="numeric"
                  value={codigoPais}
                  onChange={(e) => setCodigoPais(e.target.value.replace(/\D/g, ''))}
                  className="w-24"
                  aria-label="Código de país para WhatsApp"
                />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Confirmar
          abierto={quitando !== null}
          peligroso
          titulo={quitando ? `¿Quitarle el acceso a ${quitando.correo}?` : ''}
          consecuencias={quitando ? consecuenciasDeQuitar(quitando) : []}
          textoConfirmar="Sí, quitar el acceso"
          onConfirmar={confirmarQuitar}
          onCerrar={() => setQuitando(null)}
        />

        {/* Accesos */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={Users}
              title="Quién puede entrar"
              description="Tu negocio, tus datos: acá decidís vos quién los ve"
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-2 flex-wrap">
              <Field
                label="Invitar a alguien"
                hint="Su correo de Google, el mismo con el que va a entrar"
                className="flex-1 min-w-[260px]"
              >
                <Input
                  type="email"
                  value={correoInvitado}
                  onChange={(e) => setCorreoInvitado(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && correoInvitado.trim()) invitar();
                  }}
                  placeholder="nombre@gmail.com"
                />
              </Field>
              <Button
                variant="primary"
                onClick={invitar}
                disabled={invitando || !correoInvitado.trim()}
                className="mb-6"
              >
                {invitando ? 'Invitando...' : 'Invitar'}
              </Button>
            </div>

            <div className="space-y-2">
              {accesos.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-borde bg-superficie-2/40 p-3.5"
                >
                  <div className="min-w-0">
                    <div className="text-body text-texto truncate">{a.correo}</div>
                    <div className="text-caption text-texto-3">
                      {a.pendiente
                        ? 'Invitada — el acceso se activa cuando entre con ese correo'
                        : a.fijo
                          ? 'Acceso permanente'
                          : 'Tiene acceso'}
                    </div>
                  </div>
                  {a.fijo ? (
                    <span className="text-caption text-texto-3 shrink-0">—</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuitando(a)}
                      className="shrink-0 text-danger hover:text-danger"
                    >
                      Quitar
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <p className="text-caption leading-relaxed text-texto-3">
              Firebase reconoce a cada persona por su cuenta de Google, y esa cuenta recién existe
              cuando entra por primera vez. Por eso una invitación queda pendiente hasta que la usan.
              Tiene que ser el correo exacto con el que inicia sesión.
            </p>
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
            <p className="text-caption text-texto-3">
              Los datos del negocio son tuyos. Todo sale en archivos que Excel abre directo, para
              tu contadora, para un respaldo propio o para lo que necesites.
            </p>

            {/* El período. Los archivos de fechas lo respetan; el inventario y
                las clientas son una foto de hoy y no tienen período. */}
            <div className="flex items-end gap-3 flex-wrap p-4 rounded-xl border border-borde bg-superficie-2/40">
              <div>
                <label className="text-caption font-semibold text-texto-2 block mb-1">Desde</label>
                <Input
                  type="date"
                  value={desdeExp}
                  onChange={(e) => setDesdeExp(e.target.value)}
                  className="w-auto"
                />
              </div>
              <div>
                <label className="text-caption font-semibold text-texto-2 block mb-1">Hasta</label>
                <Input
                  type="date"
                  value={hastaExp}
                  onChange={(e) => setHastaExp(e.target.value)}
                  className="w-auto"
                />
              </div>
              <div className="flex gap-1.5 pb-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDesdeExp(`${mesISO()}-01`);
                    setHastaExp(hoyISO());
                  }}
                >
                  Este mes
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDesdeExp(`${mesISO().slice(0, 4)}-01-01`);
                    setHastaExp(hoyISO());
                  }}
                >
                  Este año
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDesdeExp('2000-01-01');
                    setHastaExp(hoyISO());
                  }}
                >
                  Todo
                </Button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    id: 'ventas',
                    titulo: 'Ventas',
                    detalle: 'Cada venta con su clienta, total, lo pagado, lo que debe y la ganancia.',
                    conPeriodo: true,
                  },
                  {
                    id: 'abonos',
                    titulo: 'Abonos',
                    detalle: 'Cada pago recibido, con su venta, su método y su referencia.',
                    conPeriodo: true,
                  },
                  {
                    id: 'paquetes',
                    titulo: 'Paquetes',
                    detalle: 'Lo invertido en cada uno: productos, impuesto, envío y peso.',
                    conPeriodo: true,
                  },
                  {
                    id: 'clientas',
                    titulo: 'Clientas',
                    detalle: 'El directorio con lo que compró cada una y lo que debe hoy.',
                    conPeriodo: false,
                  },
                  {
                    id: 'inventario',
                    titulo: 'Inventario',
                    detalle: 'El catálogo con existencias, costos, precios y margen.',
                    conPeriodo: false,
                  },
                ] as const
              ).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-4 rounded-xl border border-borde bg-superficie-2/40"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-body text-texto">{item.titulo}</div>
                    <div className="text-caption text-texto-3">{item.detalle}</div>
                    {!item.conPeriodo && (
                      <div className="text-[11px] text-texto-3 mt-0.5 italic">
                        Es una foto de hoy, no usa el período.
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportar(item.id)}
                    disabled={exportando !== null}
                    className="shadow-2xs font-medium shrink-0"
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    <span>{exportando === item.id ? 'Generando...' : 'Bajar'}</span>
                  </Button>
                </div>
              ))}
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
              'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-200 min-w-[190px]',
              guardadoExitoso && 'bg-acento hover:bg-acento text-acento-texto shadow-lg'
            )}
          >
            {guardadoExitoso ? (
              <>
                <Check className="w-4 h-4 animate-check-pop text-acento-texto" />
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

    const margenParsed = parsearDecimal(texto, { min: 0 });
    if (margenParsed === null) {
      showToast({ message: 'El margen de ganancia (%) debe ser un porcentaje válido mayor o igual a cero.', type: 'error' });
      return;
    }

    const r = await window.api.categorias.guardar({
      id: c.id,
      nombre: c.nombre,
      margen_defecto_bp: Math.round(margenParsed * 100),
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
