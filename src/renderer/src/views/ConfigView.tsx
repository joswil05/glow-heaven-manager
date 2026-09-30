import React, { useState, useEffect } from 'react';
import {
  Save,
  Database,
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
import { plantillaProforma as plantillaProformaVigente } from '@core/documentos/mensajes';
import { preciosParaRevisar, type PrecioParaRevisar } from '@core/revisar-precios';
import { RevisarPreciosModal } from './inventario/RevisarPreciosModal';

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

const PLANTILLA_COBRO_DEFECTO =
  'Hola {cliente}, te saludamos de Glow Heaven ✨ Te recordamos que tienes un saldo pendiente de {saldo_usd} ({saldo_cs}). Si ya realizaste tu abono, por favor compártenos el comprobante. ¡Muchas gracias!';
const PLANTILLA_FACTURA_DEFECTO =
  '¡Hola {cliente}! ✨ Muchas gracias por tu compra en Glow Heaven 🛍️\n\n📄 Factura: {codigo}\n💵 Total: {total_usd} (≈ {total_cs})\n{estado_pago}\n\n{cuentas_bancarias}\n¡Esperamos que disfrutes tus prendas! 💖';

/** Lo que el formulario muestra para unos parámetros guardados. */
function formularioDe(p: ParametrosSistema) {
  return {
    tasa: (p.tasa_cambio_cents / 100).toFixed(2),
    tax: String(p.tax_bp / 100),
    tarifaEnvio: (p.tarifa_envio_cents_lb / 100).toFixed(2),
    margen: String(p.margen_defecto_bp / 100),
    paso: p.paso_redondeo_usd_cents,
    anticipo: String(p.anticipo_defecto_bp / 100),
    stockMinimo: String(p.stock_minimo_defecto),
    mostrarCordobas: p.mostrar_cordobas,
    nombreNegocio: p.nombre_negocio,
    telefono: p.telefono_negocio,
    pinSeguridad: p.pin_seguridad ?? '',
    confirmarPin: p.pin_seguridad ?? '',
    plantillaCobro: p.plantilla_cobro_whatsapp ?? PLANTILLA_COBRO_DEFECTO,
    plantillaFactura: p.plantilla_factura_whatsapp ?? PLANTILLA_FACTURA_DEFECTO,
    // La vigente, no la guardada a ciegas: la de antes de la 2.16 decía "50%"
    // escrito a mano y está guardada en la base como si fuera propia.
    plantillaProforma: plantillaProformaVigente(p),
    cuentasBancarias: p.cuentas_bancarias ?? [],
    diasMora: p.dias_alerta_mora ?? 15,
    diasEncargos: p.dias_alerta_encargos ?? 10,
    monedaDefectoVenta: p.moneda_defecto_venta ?? ('USD' as 'USD' | 'NIO'),
    metodoDefecto: p.metodo_pago_defecto ?? ('EFECTIVO' as MetodoPago),
    cuotasCantidad: String(p.cuotas_defecto_cantidad ?? 4),
    cuotasDias: String(p.cuotas_defecto_dias ?? 15),
    pantallaInicio: p.pantalla_inicio ?? 'panel',
    pantallaInicioMovil: p.pantalla_inicio_movil ?? 'panel',
    codigoPais: p.codigo_pais_whatsapp ?? '505',
  };
}
type Formulario = ReturnType<typeof formularioDe>;

/** Lo que se guarda a partir de lo que dice el formulario, o qué campo está mal. */
function valoresDe(f: Formulario): { valores: Record<string, unknown> } | { error: string } {
  if (f.pinSeguridad.trim()) {
    if (!/^\d{4,6}$/.test(f.pinSeguridad.trim())) {
      return { error: 'El PIN debe contener entre 4 y 6 dígitos numéricos (ej. 1234).' };
    }
    if (f.pinSeguridad.trim() !== f.confirmarPin.trim()) {
      return { error: 'El PIN y la confirmación no coinciden.' };
    }
  }
  const tasaCents = parsearACentavos(f.tasa, { min: 0.01 });
  if (tasaCents === null) {
    return { error: 'La tasa de cambio (C$ por USD) debe ser un número válido mayor a cero.' };
  }
  const taxBp = parsearDecimal(f.tax, { min: 0, max: 100 });
  if (taxBp === null) {
    return { error: 'El impuesto tax de USA (%) debe ser un número válido entre 0 y 100.' };
  }
  const tarifaEnvioCents = parsearACentavos(f.tarifaEnvio, { min: 0 });
  if (tarifaEnvioCents === null) {
    return { error: 'La tarifa de envío por libra ($) debe ser un monto válido mayor o igual a cero.' };
  }
  const margenBp = parsearDecimal(f.margen, { min: 0 });
  if (margenBp === null) {
    return { error: 'El margen de ganancia (%) debe ser un número válido mayor o igual a cero.' };
  }
  const anticipoBp = parsearDecimal(f.anticipo, { min: 0, max: 100 });
  if (anticipoBp === null) {
    return { error: 'El anticipo por defecto para encargos (%) debe ser un número entre 0 y 100.' };
  }
  const stockMin = parsearDecimal(f.stockMinimo, { min: 0 });
  if (stockMin === null) {
    return { error: 'El stock mínimo por defecto debe ser un número mayor o igual a cero.' };
  }
  return {
    valores: {
      tasa_cambio_cents: tasaCents,
      tax_bp: Math.round(taxBp * 100),
      tarifa_envio_cents_lb: tarifaEnvioCents,
      margen_defecto_bp: Math.round(margenBp * 100),
      paso_redondeo_usd_cents: f.paso,
      anticipo_defecto_bp: Math.round(anticipoBp * 100),
      stock_minimo_defecto: Math.round(stockMin),
      mostrar_cordobas: f.mostrarCordobas,
      nombre_negocio: f.nombreNegocio.trim(),
      telefono_negocio: f.telefono.trim(),
      pin_seguridad: f.pinSeguridad.trim(),
      plantilla_cobro_whatsapp: f.plantillaCobro.trim(),
      plantilla_factura_whatsapp: f.plantillaFactura.trim(),
      plantilla_proforma_whatsapp: f.plantillaProforma.trim(),
      cuentas_bancarias: f.cuentasBancarias,
      dias_alerta_mora: f.diasMora,
      dias_alerta_encargos: f.diasEncargos,
      moneda_defecto_venta: f.monedaDefectoVenta,
      metodo_pago_defecto: f.metodoDefecto,
      cuotas_defecto_cantidad: Number(f.cuotasCantidad) || 4,
      cuotas_defecto_dias: Number(f.cuotasDias) || 15,
      pantalla_inicio: f.pantallaInicio,
      pantalla_inicio_movil: f.pantallaInicioMovil,
      codigo_pais_whatsapp: f.codigoPais.replace(/\D/g, '') || '505',
    },
  };
}

/**
 * Sólo lo que cambió.
 *
 * Hasta la 2.16.2 se mandaban todos los campos en cada guardado: el margen y
 * el redondeo iban siempre, y el repositorio recalculaba en silencio los
 * precios del catálogo aunque sólo se hubiera cambiado un mensaje. Y como el
 * celular escribe el mismo documento, guardar acá pisaba lo que se hubiera
 * cambiado allá mientras esta pantalla estaba abierta.
 */
function soloLoQueCambio(
  nuevos: Record<string, unknown>,
  antes: Record<string, unknown>
): Record<string, unknown> {
  const cambios: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(nuevos)) {
    if (JSON.stringify(valor) !== JSON.stringify(antes[clave])) cambios[clave] = valor;
  }
  return cambios;
}

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
  /** El formulario tal como se cargó: lo que no cambió no se manda. */
  const [inicial, setInicial] = useState<Formulario | null>(null);
  /** La lista de "Revisar precios" abierta (null: cerrada). */
  const [revision, setRevision] = useState<PrecioParaRevisar[] | null>(null);

  useEffect(() => {
    if (!parametros) return;
    const f = formularioDe(parametros);
    setTasa(f.tasa);
    setTax(f.tax);
    setTarifaEnvio(f.tarifaEnvio);
    setMargen(f.margen);
    setPaso(f.paso);
    setAnticipo(f.anticipo);
    setStockMinimo(f.stockMinimo);
    setMostrarCordobas(f.mostrarCordobas);
    setNombreNegocio(f.nombreNegocio);
    setTelefono(f.telefono);
    setPinSeguridad(f.pinSeguridad);
    setConfirmarPin(f.confirmarPin);
    setPlantillaCobro(f.plantillaCobro);
    setPlantillaFactura(f.plantillaFactura);
    setPlantillaProforma(f.plantillaProforma);
    setCuentasBancarias(f.cuentasBancarias);
    setDiasMora(f.diasMora);
    setDiasEncargos(f.diasEncargos);
    setMonedaDefectoVenta(f.monedaDefectoVenta);
    setMetodoDefecto(f.metodoDefecto);
    setCuotasCantidad(f.cuotasCantidad);
    setCuotasDias(f.cuotasDias);
    setPantallaInicio(f.pantallaInicio);
    setPantallaInicioMovil(f.pantallaInicioMovil);
    setCodigoPais(f.codigoPais);
    // Contra esto se compara al guardar: se manda sólo lo que ella cambió.
    setInicial(f);
  }, [parametros]);

  const formularioActual = (): Formulario => ({
    tasa,
    tax,
    tarifaEnvio,
    margen,
    paso,
    anticipo,
    stockMinimo,
    mostrarCordobas,
    nombreNegocio,
    telefono,
    pinSeguridad,
    confirmarPin,
    plantillaCobro,
    plantillaFactura,
    plantillaProforma,
    cuentasBancarias,
    diasMora,
    diasEncargos,
    monedaDefectoVenta,
    metodoDefecto,
    cuotasCantidad,
    cuotasDias,
    pantallaInicio,
    pantallaInicioMovil,
    codigoPais,
  });

  /**
   * "Revisar precios" con los parámetros y las categorías que valen ahora.
   *
   * Un cambio de margen o de redondeo ya no reescribe precios: abre esta
   * lista (antes → después), y ella aplica los que elige, con Deshacer.
   */
  const abrirRevisionDePrecios = async (
    params: ParametrosSistema,
    cats: Categoria[],
    avisarSiNoHay: boolean
  ) => {
    const r = await window.api.productos.list({});
    if (!r.success) {
      showToast({ message: r.error, type: 'error' });
      return;
    }
    const lista = preciosParaRevisar(r.data, cats, params);
    if (lista.length > 0) setRevision(lista);
    else if (avisarSiNoHay) {
      showToast({ message: 'Todos los precios corresponden a su costo.', type: 'success' });
    }
  };

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
    const actual = valoresDe(formularioActual());
    if ('error' in actual) {
      showToast({ message: actual.error, type: 'error' });
      return;
    }
    const base = inicial ? valoresDe(inicial) : null;
    const cambios = soloLoQueCambio(actual.valores, base && 'valores' in base ? base.valores : {});
    if (Object.keys(cambios).length === 0) {
      showToast({ message: 'No hay cambios para guardar.', type: 'info' });
      return;
    }

    setGuardando(true);
    try {
      const r = await window.api.parametros.update(cambios);

      if (!r.success) {
        showToast({ message: r.error, type: 'error' });
        return;
      }

      showToast({ message: 'Configuración guardada con éxito', type: 'success' });
      setGuardadoExitoso(true);
      setTimeout(() => setGuardadoExitoso(false), 2200);
      onCambio();

      // Un margen o un redondeo nuevo no cambia ningún precio solo: se
      // muestran los que ya no corresponden a su costo y ella elige.
      if (parametros && ('margen_defecto_bp' in cambios || 'paso_redondeo_usd_cents' in cambios)) {
        await abrirRevisionDePrecios({ ...parametros, ...cambios } as ParametrosSistema, categorias, true);
      }
    } finally {
      setGuardando(false);
    }
  };

  // Antes recalculaba todo el catálogo al instante, sin confirmar ni Deshacer,
  // y con el margen guardado (no el que se veía en pantalla). Ahora abre la
  // misma revisión que Inventario: la lista, elegir, Deshacer.
  const revisarPrecios = () => {
    if (parametros) void abrirRevisionDePrecios(parametros, categorias, true);
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
        {/* Conexión con la base. Va primero porque sin esto nada funciona. */}
        <NubeSection />

        {/* Apariencia del Sistema (Modo Oscuro / Claro / Automático) */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={Palette}
              title="Apariencia"
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
                <div className="w-10 h-10 rounded-xl bg-alerta-suave text-alerta-fuerte flex items-center justify-center mb-2 shadow-xs">
                  <Sun size={20} />
                </div>
                <span className="text-sm font-bold text-texto">Claro</span>
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
                <span className="text-sm font-bold text-texto">Oscuro</span>
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
            />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Impuesto de las tiendas (%)">
                <Input value={tax} onChange={(e) => setTax(e.target.value)} className="text-right" />
              </Field>
              <Field label="Flete por libra ($)" hint="Sugerido al registrar un paquete">
                <Input
                  value={tarifaEnvio}
                  onChange={(e) => setTarifaEnvio(e.target.value)}
                  className="text-right"
                />
              </Field>
              <Field label="Córdobas por dólar">
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
              title="Precios"
              description="La ganancia se mide contra el costo con impuesto y flete"
            />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-4">
                <Field
                  label="Ganancia por defecto (%)"
                  hint="Cada categoría o producto puede tener el suyo"
                >
                  <Input
                    value={margen}
                    onChange={(e) => setMargen(e.target.value)}
                    className="text-right"
                  />
                </Field>
                <Field label="Redondear hacia arriba a">
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
                <p className="text-caption text-texto-3 mb-3">
                  Ejemplo: algo que te costó {formatearMoneda(4260, 'USD')}
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
                  onClick={revisarPrecios}
                  className="mt-3 w-full"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Revisar precios del inventario</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Categorías */}
        <CategoriasSection
          categorias={categorias}
          onCambio={onCambio}
          margenGlobal={num(margen)}
          onMargenGuardado={(cats) => {
            if (parametros) void abrirRevisionDePrecios(parametros, cats, false);
          }}
        />

        {/* Ventas */}
        <Card>
          <CardHeader>
            <SectionHeader icon={Tag} title="Ventas y encargos" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Anticipo de los encargos (%)">
                <Input
                  value={anticipo}
                  onChange={(e) => setAnticipo(e.target.value)}
                  className="text-right"
                />
              </Field>
              <Field label="Avisar cuando queden" hint="Unidades, para cada producto nuevo">
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
              title="Mensajes de WhatsApp"
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
              hint="Tocá una etiqueta para agregarla"
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
                placeholder="Escribí el mensaje"
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
                  <button
                    type="button"
                    onClick={() => insertarEtiquetaWhatsApp('{anticipo_pct}')}
                    className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
                  >
                    + &#123;anticipo_pct&#125;
                  </button>
                  <button
                    type="button"
                    onClick={() => insertarEtiquetaWhatsApp('{no_conseguido}')}
                    className="px-2.5 py-1 rounded-lg text-caption font-mono font-medium bg-superficie-2 hover:bg-superficie hover:border-acento/40 hover:text-acento border border-borde text-texto-2 pill-interactive active:scale-95 cursor-pointer transition-[background-color,border-color,color,box-shadow,transform,opacity]"
                  >
                    + &#123;no_conseguido&#125;
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
                  .replace(/\{anticipo_pct\}/g, '50%')
                  .replace(/\{anticipo\}/g, '$45.00')
                  .replace(/\{saldo\}/g, '$45.00')
                  .replace(/\{no_conseguido\}/g, '\n🔎 No logramos conseguir: Perfume Chanel')
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
              title="Cuentas bancarias"
              description="Las que ven tus clientas para transferirte"
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
                    placeholder="BAC, LAFISE, Banpro"
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
                <Field label="Titular">
                  <Input
                    placeholder="Glow Heaven"
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
            />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field
                label="Saldo urgente después de"
                hint="Días sin abono"
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
                label="Encargo estancado después de"
                hint="Días sin entrar en un paquete"
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
                label="Moneda de cobro"
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
                label="Método de cobro"
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

              <Field label="Cuotas de una venta a crédito">
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
                label="Al abrir en Windows"
              >
                <Select value={pantallaInicio} onChange={(e) => setPantallaInicio(e.target.value)}>
                  <option value="panel">Inicio</option>
                  <option value="ventas">Ventas</option>
                  <option value="encargos">Encargos</option>
                  <option value="cobranza">Cobros</option>
                  <option value="inventario">Inventario</option>
                  <option value="clientes">Clientes</option>
                </Select>
              </Field>

              <Field
                label="Al abrir en el celular"
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
                hint="Sin el +"
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

        <RevisarPreciosModal
          abierto={revision !== null}
          lista={revision ?? []}
          onCerrar={() => setRevision(null)}
          onAplicado={() => onCambio()}
        />

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
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end gap-2 flex-wrap">
              <Field
                label="Invitar a alguien"
                hint="El correo de Google con el que va a entrar"
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

            <p className="text-caption text-texto-3">
              La invitación queda pendiente hasta que esa persona entra por primera vez.
            </p>
          </CardContent>
        </Card>

        {/* Exportación y Herramientas */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={Download}
              title="Exportar a Excel"
            />
          </CardHeader>
          <CardContent className="space-y-4">

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
                ? `Versión ${info.version}`
                : 'Cargando...'}
            </p>
          </CardContent>
        </Card>

        {/* Seguridad y Bloqueo por PIN */}
        <Card>
          <CardHeader>
            <SectionHeader
              icon={ShieldCheck}
              title="PIN"
              description="Se pide cada vez que abrís la app. Vacío: no se pide."
            />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
              <Field label="PIN" hint="De 4 a 6 números">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••"
                  value={pinSeguridad}
                  onChange={(e) => setPinSeguridad(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
              <Field label="Repetilo">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••"
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
  /** Con las categorías ya con el margen nuevo: abre "Revisar precios". */
  onMargenGuardado?: (categorias: Categoria[]) => void;
}> = ({ categorias, margenGlobal, onCambio, onMargenGuardado }) => {
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
    // Los productos de la categoría no cambian de precio solos (desde la
    // 2.16.3): se ofrecen en "Revisar precios".
    const margenNuevo = Math.round(margenParsed * 100);
    onMargenGuardado?.(
      categorias.map((x) => (x.id === c.id ? { ...x, margen_defecto_bp: margenNuevo } : x))
    );
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
