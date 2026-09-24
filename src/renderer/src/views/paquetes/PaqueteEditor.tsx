import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  Package,
  AlertTriangle,
  Plus,
  Trash2,
  Search,
  ClipboardList,
  ArrowRight,
  Info,
} from 'lucide-react';
import type {
  CompraCompleta,
  CompraLinea,
  ParametrosSistema,
  Categoria,
  ProductoConStock,
  Venta,
  ResultadoIngreso,
} from '../../../../shared/types';
import type { GuardarCompraInput, LineaCompraInput } from '../../../../shared/ipc-contracts';
import { Button, Field, Input, Textarea, Portal, Badge, Confirmar } from '../../components/ui';
import { parsearDecimal, parsearACentavos } from '@core/numeros';
import { formatearMoneda, formatearPeso } from '@core/moneda';
import {
  calcularPaquete,
  efectoDeEntradas,
  efectoDeCorreccion,
  type EfectoEnProducto,
  type LineaPaquete,
  type ProductoAntesDelPaquete,
} from '@core/paquete';
import { margenEfectivo } from '@core/precios';
import { algunoContiene } from '@core/texto';
import { hoyISO } from '@core/fechas';
import { useToast } from '../../context/ToastContext';
import { useCerrarConEscape } from '../../lib/useCerrarConEscape';
import { cn } from '../../lib/cn';
import { formatearTextoGeneral } from '../../../../shared/formatoTexto';
import { ProductoModal, type DatosProducto } from '../inventario/ProductoModal';
import { ResumenIngreso } from './ResumenIngreso';

/**
 * El paquete, con lo que trajo adentro.
 *
 * Es la única puerta por donde entra mercadería. Cada línea es un producto
 * (uno que ya existe o uno nuevo, con su ficha completa), cuántas unidades
 * vinieron y lo que costaron en la tienda. El 7% y la parte del flete de cada
 * línea se calculan acá, a la vista, con la misma cuenta que después guarda el
 * repositorio (`core/paquete.ts`).
 *
 * Antes este editor mandaba `lineas: []` y `tax_total_override_usd_cents: 0`
 * fijos: el paquete no sabía qué traía, su "total pagado" era sólo el flete, y
 * el motor de costeo no corría nunca.
 *
 * Tres modos, según el paquete:
 *   · nuevo o cargando: se edita libremente; nada entra al inventario hasta
 *     "Pasar al inventario".
 *   · en el inventario: se corrige. Las líneas que ya entraron sólo cambian
 *     montos; se pueden agregar líneas olvidadas.
 */

interface PaqueteEditorProps {
  abierto: boolean;
  compra: CompraCompleta | null;
  parametros: ParametrosSistema | null;
  categorias: Categoria[];
  onCerrar: () => void;
  onGuardado: () => Promise<void> | void;
}

interface LineaEnPantalla {
  clave: string;
  id?: number;
  producto_id?: number;
  variante_id?: number;
  descripcion: string;
  varianteNombre?: string;
  destino: 'INVENTARIO' | 'ENCARGO';
  venta_id?: number;
  venta_linea_id?: number;
  clienteNombre?: string;
  esPack: boolean;
  cantidadTexto: string;
  precioUnitarioTexto: string;
  packsTexto: string;
  unidadesPorPackTexto: string;
  precioPackTexto: string;
  exento: boolean;
  pesoTexto: string;
  /** En una corrección, la línea ya entró: sólo se corrigen montos. */
  bloqueada: boolean;
  /** Lo que costaba la línea antes de corregir. */
  costoLineaAnterior?: number;
  /** El precio guardado, para reenviarlo exacto si no se tocó. */
  precioLineaGuardado?: number;
  precioTocado: boolean;
  /** El impuesto y la exención guardados: al corregir se respetan si no se tocan. */
  taxGuardado?: number;
  exentoGuardado?: boolean;
}

let contadorClaves = 0;
const nuevaClave = () => `l${Date.now().toString(36)}${(contadorClaves++).toString(36)}`;

const $ = (c: number) => formatearMoneda(c, 'USD');
const entero = (t: string): number | null => {
  const v = parsearDecimal(t, { min: 0 });
  return v === null || !Number.isInteger(v) ? null : v;
};

function cantidadDe(l: LineaEnPantalla): number | null {
  if (l.esPack) {
    const packs = entero(l.packsTexto);
    const porPack = entero(l.unidadesPorPackTexto);
    return packs && porPack ? packs * porPack : null;
  }
  const c = entero(l.cantidadTexto);
  return c && c > 0 ? c : null;
}

function precioLineaDe(l: LineaEnPantalla): number | null {
  if (!l.precioTocado && l.precioLineaGuardado !== undefined) return l.precioLineaGuardado;
  if (l.esPack) {
    const packs = entero(l.packsTexto);
    const precioPack = parsearACentavos(l.precioPackTexto, { min: 0 });
    return packs !== null && precioPack !== null ? packs * precioPack : null;
  }
  const cantidad = cantidadDe(l);
  const unitario = parsearACentavos(l.precioUnitarioTexto, { min: 0 });
  return cantidad !== null && unitario !== null ? cantidad * unitario : null;
}

function pesoManualDe(l: LineaEnPantalla): number | null {
  if (!l.pesoTexto.trim()) return null;
  const lb = parsearDecimal(l.pesoTexto, { min: 0 });
  return lb === null ? null : Math.round(lb * 1000);
}

function nombreVariante(p: ProductoConStock | undefined, variante_id?: number): string | undefined {
  const v = p?.variantes.find((x) => x.id === variante_id);
  const n = [v?.talla, v?.color].filter(Boolean).join(' · ');
  return n || undefined;
}

function desdeGuardada(
  l: CompraLinea,
  bloqueada: boolean,
  productos: Map<number, ProductoConStock>
): LineaEnPantalla {
  const esPack = Boolean(l.es_multipack && l.packs_comprados && l.unidades_por_pack);
  const pesoEscrito =
    l.peso_estimado === false || (l.peso_estimado === undefined && l.peso_linea_mlb > 0);
  return {
    clave: nuevaClave(),
    id: l.id,
    producto_id: l.producto_id,
    variante_id: l.variante_id,
    descripcion: l.producto_nombre ?? l.descripcion,
    varianteNombre: l.producto_id
      ? nombreVariante(productos.get(l.producto_id), l.variante_id)
      : undefined,
    destino: l.destino,
    venta_id: l.venta_id,
    venta_linea_id: l.venta_linea_id,
    clienteNombre: l.cliente_nombre,
    esPack,
    cantidadTexto: String(l.cantidad),
    precioUnitarioTexto: (l.precio_linea_usd_cents / Math.max(1, l.cantidad) / 100).toFixed(2),
    packsTexto: String(l.packs_comprados ?? 1),
    unidadesPorPackTexto: String(l.unidades_por_pack ?? 5),
    precioPackTexto: ((l.precio_por_pack_usd_cents ?? 0) / 100).toFixed(2),
    exento: Boolean(l.exento),
    pesoTexto: pesoEscrito ? String(l.peso_linea_mlb / 1000) : '',
    bloqueada,
    costoLineaAnterior: l.costo_linea_usd_cents,
    precioLineaGuardado: l.precio_linea_usd_cents,
    precioTocado: false,
    taxGuardado: l.tax_linea_usd_cents,
    exentoGuardado: Boolean(l.exento),
  };
}

export const PaqueteEditor: React.FC<PaqueteEditorProps> = ({
  abierto,
  compra,
  parametros,
  categorias,
  onCerrar,
  onGuardado,
}) => {
  const { showToast } = useToast();
  const esCorreccion = compra?.estado === 'RECIBIDA';
  const tarifaLb = parametros?.tarifa_envio_cents_lb ?? 700;
  const taxBp = parametros?.tax_bp ?? 700;

  const [fecha, setFecha] = useState(() => hoyISO());
  const [pesoTotalTexto, setPesoTotalTexto] = useState('');
  const [envioTexto, setEnvioTexto] = useState('');
  const [envioManual, setEnvioManual] = useState(false);
  const [otrosTexto, setOtrosTexto] = useState('');
  const [taxReciboTexto, setTaxReciboTexto] = useState('');
  const [notas, setNotas] = useState('');
  const [lineas, setLineas] = useState<LineaEnPantalla[]>([]);
  const [productos, setProductos] = useState<ProductoConStock[]>([]);
  const [encargos, setEncargos] = useState<Venta[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [verEncargos, setVerEncargos] = useState(false);
  const [productoNuevo, setProductoNuevo] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumen, setResumen] = useState<ResultadoIngreso | null>(null);
  /** El id que le dio el primer guardado, para no crear otro si se reintenta. */
  const [idGuardado, setIdGuardado] = useState<number | undefined>(undefined);
  const busquedaRef = useRef<HTMLInputElement>(null);

  const productosPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const cargarProductos = async (): Promise<ProductoConStock[]> => {
    const r = await window.api.productos.list({ incluirInactivos: true });
    if (r.success) {
      setProductos(r.data);
      return r.data;
    }
    return productos;
  };

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setResumen(null);
    setBusqueda('');
    setVerEncargos(false);
    setIdGuardado(compra?.id);

    let vivo = true;
    (async () => {
      const [lista, rEnc] = await Promise.all([
        cargarProductos(),
        window.api.ventas.list({ tipo: 'ENCARGO' }),
      ]);
      if (!vivo) return;
      if (rEnc.success) {
        setEncargos(rEnc.data.filter((v) => v.estado === 'COTIZADA' || v.estado === 'PENDIENTE'));
      }
      const mapa = new Map(lista.map((p) => [p.id, p]));
      if (compra) {
        setFecha(compra.fecha);
        setPesoTotalTexto(compra.peso_total_mlb ? String(compra.peso_total_mlb / 1000) : '');
        setEnvioTexto((compra.envio_total_usd_cents / 100).toFixed(2));
        setEnvioManual(true);
        setOtrosTexto(
          compra.otros_costos_usd_cents > 0 ? (compra.otros_costos_usd_cents / 100).toFixed(2) : ''
        );
        setTaxReciboTexto(
          compra.tax_total_override_usd_cents !== undefined &&
            compra.tax_total_override_usd_cents !== null
            ? (compra.tax_total_override_usd_cents / 100).toFixed(2)
            : ''
        );
        setNotas(compra.notas ?? '');
        setLineas(compra.lineas.map((l) => desdeGuardada(l, compra.estado === 'RECIBIDA', mapa)));
      } else {
        setFecha(hoyISO());
        setPesoTotalTexto('');
        setEnvioTexto('');
        setEnvioManual(false);
        setOtrosTexto('');
        setTaxReciboTexto('');
        setNotas('');
        setLineas([]);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, compra]);

  // Si cambia el peso y el flete no se escribió a mano, se calcula solo.
  useEffect(() => {
    if (!abierto || envioManual) return;
    const libras = parsearDecimal(pesoTotalTexto, { min: 0 }) ?? 0;
    setEnvioTexto(libras > 0 ? (Math.round(libras * tarifaLb) / 100).toFixed(2) : '');
  }, [abierto, pesoTotalTexto, tarifaLb, envioManual]);

  useCerrarConEscape(abierto && productoNuevo === null && !confirmando, onCerrar);

  // ---------------------------------------------------------------------------
  // La cuenta, en vivo
  // ---------------------------------------------------------------------------

  const pesoTotalMlb = Math.round((parsearDecimal(pesoTotalTexto, { min: 0 }) ?? 0) * 1000);
  const envioCents = parsearACentavos(envioTexto, { min: 0 }) ?? 0;
  const otrosCents = parsearACentavos(otrosTexto, { min: 0 }) ?? 0;
  const taxRecibo = taxReciboTexto.trim() ? parsearACentavos(taxReciboTexto, { min: 0 }) : null;

  const calc = useMemo(() => {
    const paraCalcular: LineaPaquete[] = lineas.map((l) => ({
      clave: l.clave,
      producto_id: l.producto_id,
      destino: l.destino,
      cantidad: cantidadDe(l) ?? 0,
      precio_linea_usd_cents: precioLineaDe(l) ?? 0,
      exento: l.exento,
      peso_manual_mlb: pesoManualDe(l),
      // Igual que el repositorio al corregir: si no se tocó el precio ni el
      // impuesto de una línea que ya entró, conserva el que tenía.
      tax_declarado_usd_cents:
        l.bloqueada && !l.precioTocado && l.exento === l.exentoGuardado
          ? l.taxGuardado
          : undefined,
    }));
    return calcularPaquete(paraCalcular, {
      tax_bp: taxBp,
      envio_total_usd_cents: envioCents,
      otros_costos_usd_cents: otrosCents,
      tax_total_override_usd_cents: taxRecibo,
      peso_total_mlb: pesoTotalMlb,
      pesoUnitario: (id) => (id ? productosPorId.get(id)?.peso_unitario_mlb ?? 0 : 0),
    });
  }, [lineas, taxBp, envioCents, otrosCents, taxRecibo, pesoTotalMlb, productosPorId]);

  const calcPorClave = useMemo(() => new Map(calc.lineas.map((c) => [c.clave, c])), [calc]);

  /** Cómo queda cada producto, para mostrar el precio antes y después. */
  const efectos = useMemo(() => {
    const salida = new Map<number, EfectoEnProducto>();
    const ids = [
      ...new Set(
        lineas.filter((l) => l.destino === 'INVENTARIO' && l.producto_id).map((l) => l.producto_id!)
      ),
    ];
    for (const pid of ids) {
      const p = productosPorId.get(pid);
      if (!p) continue;
      const antes: ProductoAntesDelPaquete = {
        existencias: p.existencias,
        valor_inventario_usd_cents: p.valor_inventario_usd_cents,
        costo_unitario_usd_cents: p.costo_unitario_usd_cents,
        precio_venta_usd_cents: p.precio_venta_usd_cents,
        modo_precio: p.modo_precio,
        margen_bp: margenEfectivo(p, categorias, parametros?.margen_defecto_bp ?? 4500),
        multiplicador_bp: p.multiplicador_bp,
        precio_manual_usd_cents: p.precio_manual_usd_cents,
      };
      const suyas = lineas.filter((l) => l.destino === 'INVENTARIO' && l.producto_id === pid);
      const paso = parametros?.paso_redondeo_usd_cents ?? 100;
      const entradas = suyas
        .filter((l) => !l.bloqueada)
        .map((l) => calcPorClave.get(l.clave))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({ cantidad: c.cantidad, costo_linea_usd_cents: c.costo_linea_usd_cents }));

      if (esCorreccion) {
        const cambios = suyas
          .filter((l) => l.bloqueada)
          .map((l) => {
            const c = calcPorClave.get(l.clave);
            return {
              unidades_de_la_linea: c?.cantidad ?? 0,
              diferencia_usd_cents: (c?.costo_linea_usd_cents ?? 0) - (l.costoLineaAnterior ?? 0),
            };
          })
          .filter((c) => c.diferencia_usd_cents !== 0);
        salida.set(pid, efectoDeCorreccion(antes, cambios, entradas, paso));
      } else {
        salida.set(pid, efectoDeEntradas(antes, entradas, paso));
      }
    }
    return salida;
  }, [lineas, productosPorId, categorias, parametros, calcPorClave, esCorreccion]);

  const sugerencias = useMemo(() => {
    const t = busqueda.trim();
    if (!t) return [];
    return productos.filter((p) => algunoContiene([p.nombre, p.codigo], t)).slice(0, 8);
  }, [busqueda, productos]);

  if (!abierto) return null;

  // ---------------------------------------------------------------------------
  // Agregar y editar líneas
  // ---------------------------------------------------------------------------

  const lineaVacia = (parcial: Partial<LineaEnPantalla>): LineaEnPantalla => ({
    clave: nuevaClave(),
    descripcion: '',
    destino: 'INVENTARIO',
    esPack: false,
    cantidadTexto: '',
    precioUnitarioTexto: '',
    packsTexto: '1',
    unidadesPorPackTexto: '5',
    precioPackTexto: '',
    exento: false,
    pesoTexto: '',
    bloqueada: false,
    precioTocado: true,
    ...parcial,
  });

  const agregarProducto = (p: ProductoConStock) => {
    const activas = p.variantes.filter((v) => v.activo !== false);
    // Con tallas, una línea por talla: cada una trae sus unidades.
    const nuevas =
      p.tiene_variantes && activas.length > 1
        ? activas.map((v) =>
            lineaVacia({
              producto_id: p.id,
              variante_id: v.id,
              descripcion: p.nombre,
              varianteNombre: nombreVariante(p, v.id),
            })
          )
        : [
            lineaVacia({
              producto_id: p.id,
              variante_id: activas[0]?.id,
              descripcion: p.nombre,
              esPack: (p.unidades_por_paquete ?? 0) > 1,
              unidadesPorPackTexto: String(p.unidades_por_paquete ?? 5),
            }),
          ];
    setLineas((prev) => [...prev, ...nuevas]);
    setBusqueda('');
    setBuscando(false);
    setError(null);
  };

  const crearProducto = async (datos: DatosProducto): Promise<number> => {
    const r = await window.api.productos.crear(datos as never);
    if (!r.success) throw new Error(r.error);
    const lista = await cargarProductos();
    const nuevo = lista.find((p) => p.id === r.data.id);
    if (nuevo) agregarProducto(nuevo);
    return r.data.id;
  };

  const agregarEncargo = async (v: Venta) => {
    const r = await window.api.ventas.get(v.id);
    if (!r.success || !r.data) {
      showToast({ message: r.success ? 'No se encontró el encargo.' : r.error, type: 'error' });
      return;
    }
    const ya = new Set(lineas.filter((l) => l.venta_id === v.id).map((l) => l.venta_linea_id));
    const nuevas = r.data.lineas
      .filter((vl) => !ya.has(vl.id))
      .map((vl) =>
        lineaVacia({
          descripcion: vl.descripcion,
          destino: 'ENCARGO',
          venta_id: v.id,
          venta_linea_id: vl.id,
          clienteNombre: v.cliente_nombre,
          cantidadTexto: String(vl.cantidad),
        })
      );
    setLineas((prev) => [...prev, ...nuevas]);
    setVerEncargos(false);
  };

  const cambiar = (clave: string, cambios: Partial<LineaEnPantalla>) =>
    setLineas((prev) => prev.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));

  const cambiarPrecio = (clave: string, cambios: Partial<LineaEnPantalla>) =>
    cambiar(clave, { ...cambios, precioTocado: true });

  const quitar = (clave: string) => setLineas((prev) => prev.filter((l) => l.clave !== clave));

  // ---------------------------------------------------------------------------
  // Guardar
  // ---------------------------------------------------------------------------

  const armarInput = (exigirLineas: boolean): GuardarCompraInput | null => {
    if (pesoTotalTexto.trim() && parsearDecimal(pesoTotalTexto, { min: 0 }) === null) {
      setError('El peso de la caja no es un número válido.');
      return null;
    }
    if (envioTexto.trim() && parsearACentavos(envioTexto, { min: 0 }) === null) {
      setError('El flete no es un monto válido.');
      return null;
    }
    if (otrosTexto.trim() && parsearACentavos(otrosTexto, { min: 0 }) === null) {
      setError('Otros gastos no es un monto válido.');
      return null;
    }
    if (taxReciboTexto.trim() && taxRecibo === null) {
      setError('El impuesto del recibo no es un monto válido.');
      return null;
    }
    if (exigirLineas && lineas.length === 0) {
      setError('Agregá lo que trajo el paquete antes de pasarlo al inventario.');
      return null;
    }

    const salida: LineaCompraInput[] = [];
    for (const l of lineas) {
      const nombre = l.descripcion || 'una línea';
      const cantidad = cantidadDe(l);
      if (cantidad === null) {
        setError(`Escribí cuántas unidades de '${nombre}' vinieron (un número entero).`);
        return null;
      }
      const precio = precioLineaDe(l);
      if (precio === null) {
        setError(`Escribí lo que costó '${nombre}' en la tienda.`);
        return null;
      }
      if (l.pesoTexto.trim() && pesoManualDe(l) === null) {
        setError(`El peso de '${nombre}' no es un número válido.`);
        return null;
      }
      salida.push({
        id: l.id,
        producto_id: l.producto_id,
        variante_id: l.variante_id,
        descripcion: l.descripcion,
        cantidad,
        precio_linea_usd_cents: precio,
        exento: l.exento || undefined,
        peso_linea_mlb: pesoManualDe(l),
        destino: l.destino,
        venta_id: l.venta_id,
        venta_linea_id: l.venta_linea_id,
        es_multipack: l.esPack || undefined,
        packs_comprados: l.esPack ? (entero(l.packsTexto) ?? undefined) : undefined,
        unidades_por_pack: l.esPack ? (entero(l.unidadesPorPackTexto) ?? undefined) : undefined,
        precio_por_pack_usd_cents: l.esPack
          ? (parsearACentavos(l.precioPackTexto, { min: 0 }) ?? undefined)
          : undefined,
      });
    }

    setError(null);
    return {
      id: idGuardado,
      fecha,
      envio_total_usd_cents: envioCents,
      otros_costos_usd_cents: otrosCents,
      tax_total_override_usd_cents: taxRecibo,
      peso_total_mlb: pesoTotalMlb,
      notas: formatearTextoGeneral(notas) || undefined,
      lineas: salida,
    };
  };

  const guardarBorrador = async (input: GuardarCompraInput): Promise<number | null> => {
    const r = await window.api.compras.guardar(input);
    if (!r.success) {
      setError(r.error);
      return null;
    }
    setIdGuardado(r.data.id);
    return r.data.id;
  };

  const accionGuardar = async () => {
    const input = armarInput(false);
    if (!input) return;
    setGuardando(true);
    try {
      const id = await guardarBorrador(input);
      if (id === null) return;
      showToast({
        message: 'Paquete guardado. Nada entró al inventario todavía: seguí cargándolo cuando quieras.',
        type: 'success',
      });
      await onGuardado();
      onCerrar();
    } finally {
      setGuardando(false);
    }
  };

  const accionPasar = () => {
    if (!armarInput(true)) return;
    setConfirmando(true);
  };

  const pasarAlInventario = async () => {
    const input = armarInput(true);
    if (!input) return;
    setGuardando(true);
    try {
      const id = await guardarBorrador(input);
      if (id === null) return;
      const r = await window.api.compras.recibir(id);
      if (!r.success) {
        setError(r.error);
        return;
      }
      setResumen(r.data);
    } finally {
      setGuardando(false);
    }
  };

  const accionCorregir = async () => {
    if (!compra) return;
    const input = armarInput(true);
    if (!input) return;
    setGuardando(true);
    try {
      const r = await window.api.compras.corregir({ ...input, id: compra.id });
      if (!r.success) {
        setError(r.error);
        return;
      }
      setResumen(r.data);
    } finally {
      setGuardando(false);
    }
  };

  const terminar = async () => {
    await onGuardado();
    onCerrar();
  };

  // ---------------------------------------------------------------------------

  const unidades = lineas
    .filter((l) => l.destino === 'INVENTARIO')
    .reduce((s, l) => s + (cantidadDe(l) ?? 0), 0);
  const productosDistintos = new Set(
    lineas.filter((l) => l.destino === 'INVENTARIO').map((l) => l.producto_id ?? l.descripcion)
  ).size;
  const cambianDePrecio = [...efectos.values()].filter(
    (e) => e.precio_antes_usd_cents !== e.precio_despues_usd_cents && e.precio_antes_usd_cents > 0
  ).length;
  const estimados = calc.lineas.filter((c) => c.peso_estimado).length;

  const textoCriterio =
    calc.criterio_flete === 'SIN_FLETE'
      ? 'No hay flete que repartir.'
      : calc.criterio_flete === 'PESO'
        ? `El flete se reparte por peso, que es como cobra el courier.${estimados > 0 ? ` ${estimados} línea${estimados === 1 ? '' : 's'} sin peso escrito se estima${estimados === 1 ? '' : 'n'} con el peso conocido de cada producto.` : ''}`
        : 'El flete se reparte por unidades: ningún producto tiene peso anotado. Si escribís el peso de alguno, se reparte por peso.';

  const titulo = resumen
    ? 'Listo'
    : compra
      ? esCorreccion
        ? `Corregir ${compra.codigo}`
        : `${compra.codigo} · Cargando`
      : 'Registrar paquete';

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-velo/60 backdrop-blur-xs p-4 animate-fade-in cursor-pointer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-paquete"
        onClick={(e) => {
          if (e.target === e.currentTarget && !guardando) onCerrar();
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-superficie rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] flex flex-col overflow-hidden border border-borde/80 animate-modal-pop cursor-default"
        >
          <header className="flex items-center justify-between px-6 py-4 border-b border-borde shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-acento-suave text-acento flex items-center justify-center">
                <Package className="w-4 h-4" />
              </div>
              <div>
                <h3 id="titulo-paquete" className="text-title text-texto">
                  {titulo}
                </h3>
                <p className="text-caption text-texto-3">
                  {resumen
                    ? 'Así quedó cada producto'
                    : esCorreccion
                      ? 'Ya está en el inventario: se corrigen montos y se agrega lo olvidado'
                      : 'Nada entra al inventario hasta que lo pasés'}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={resumen ? terminar : onCerrar}
              aria-label="Cerrar"
              className="rounded-lg text-texto-3 hover:text-texto"
            >
              <X className="w-4 h-4" />
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {resumen ? (
              <ResumenIngreso resultado={resumen} modo={esCorreccion ? 'correccion' : 'ingreso'} />
            ) : (
              <>
                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-danger-200 bg-danger-50 p-3">
                    <AlertTriangle className="w-4 h-4 text-danger-600 shrink-0 mt-0.5" />
                    <p className="text-label text-danger-800">{error}</p>
                  </div>
                )}

                {esCorreccion && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-alerta-suave bg-alerta-suave p-3 text-caption text-alerta">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      Podés corregir el precio de tienda, el 7%, el peso y el flete, y agregar lo que
                      se olvidó. La diferencia se aplica a las unidades que siguen en la bodega; lo
                      que ya se vendió conserva el costo con que salió. Las cantidades se corrigen
                      ajustando existencias.
                    </p>
                  </div>
                )}

                {/* Cabecera: lo que dice el recibo del courier */}
                <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <Field label="Fecha de llegada">
                    <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
                  </Field>
                  <Field label="Peso de la caja (lb)" hint="El de la factura del courier">
                    <Input
                      value={pesoTotalTexto}
                      onChange={(e) => setPesoTotalTexto(e.target.value)}
                      placeholder="0.00"
                      inputMode="decimal"
                      className="text-right"
                    />
                  </Field>
                  <Field
                    label="Flete pagado"
                    hint={envioManual ? 'Escrito a mano' : `A ${$(tarifaLb)} por libra`}
                  >
                    <Input
                      value={envioTexto}
                      onChange={(e) => {
                        setEnvioTexto(e.target.value);
                        setEnvioManual(true);
                      }}
                      placeholder="0.00"
                      inputMode="decimal"
                      className="text-right"
                    />
                  </Field>
                  <Field label="Otros gastos" hint="Aduana, reempaque">
                    <Input
                      value={otrosTexto}
                      onChange={(e) => setOtrosTexto(e.target.value)}
                      placeholder="0.00"
                      inputMode="decimal"
                      className="text-right"
                    />
                  </Field>
                  <Field
                    label="Impuesto del recibo"
                    hint={`Opcional: si no da exacto el ${taxBp / 100}%`}
                  >
                    <Input
                      value={taxReciboTexto}
                      onChange={(e) => setTaxReciboTexto(e.target.value)}
                      placeholder={`${taxBp / 100}% por línea`}
                      inputMode="decimal"
                      className="text-right"
                    />
                  </Field>
                </section>

                {/* Lo que vino adentro */}
                <section className="rounded-xl border border-borde overflow-hidden">
                  <div className="px-4 py-2.5 bg-superficie-2/60 border-b border-borde flex items-center justify-between gap-3 flex-wrap">
                    <h4 className="text-label font-semibold text-texto">Qué vino adentro</h4>
                    <span className="text-caption text-texto-3">
                      {unidades} unidad{unidades === 1 ? '' : 'es'} de {productosDistintos} producto
                      {productosDistintos === 1 ? '' : 's'}
                    </span>
                  </div>

                  {lineas.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-label min-w-[980px]">
                        <thead className="text-caption text-texto-3 bg-superficie">
                          <tr className="border-b border-borde/70">
                            <th className="text-left font-medium px-4 py-2">Producto</th>
                            <th className="text-right font-medium px-2 py-2 w-40">Unidades</th>
                            <th className="text-right font-medium px-2 py-2 w-36">Tienda</th>
                            <th className="text-right font-medium px-2 py-2 w-28">{taxBp / 100}%</th>
                            <th className="text-right font-medium px-2 py-2 w-24">Peso (lb)</th>
                            <th className="text-right font-medium px-2 py-2 w-24">Flete</th>
                            <th className="text-right font-medium px-2 py-2 w-28">Costo c/u</th>
                            <th className="text-right font-medium px-2 py-2 w-40">Precio de venta</th>
                            <th className="w-10" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-borde/50">
                          {lineas.map((l, idx) => {
                            const c = calcPorClave.get(l.clave);
                            const efecto =
                              l.destino === 'INVENTARIO' && l.producto_id
                                ? efectos.get(l.producto_id)
                                : undefined;
                            const primeraDelProducto =
                              lineas.findIndex(
                                (x) => x.destino === 'INVENTARIO' && x.producto_id === l.producto_id
                              ) === idx;
                            const p = l.producto_id ? productosPorId.get(l.producto_id) : undefined;
                            return (
                              <tr key={l.clave} className="align-top">
                                <td className="px-4 py-2.5">
                                  <div className="font-medium text-texto">
                                    {l.descripcion}
                                    {l.varianteNombre && (
                                      <span className="text-texto-2 font-normal"> · {l.varianteNombre}</span>
                                    )}
                                  </div>
                                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                                    {l.destino === 'ENCARGO' ? (
                                      <Badge tone="warning">
                                        Encargo{l.clienteNombre ? ` de ${l.clienteNombre}` : ''}
                                      </Badge>
                                    ) : p && p.existencias > 0 ? (
                                      <span className="text-caption text-texto-3">
                                        Repone: tenés {p.existencias}
                                      </span>
                                    ) : (
                                      <span className="text-caption text-texto-3">
                                        {p && (p.paquetes ?? []).length > 0 ? 'Estaba agotado' : 'Primera vez'}
                                      </span>
                                    )}
                                    {l.destino === 'INVENTARIO' && !l.bloqueada && (
                                      <button
                                        type="button"
                                        onClick={() => cambiarPrecio(l.clave, { esPack: !l.esPack })}
                                        className="text-caption text-acento hover:underline"
                                      >
                                        {l.esPack ? 'Por unidad' : 'Vino en pack'}
                                      </button>
                                    )}
                                  </div>
                                </td>

                                <td className="px-2 py-2.5 text-right">
                                  {l.esPack ? (
                                    <div className="flex items-center justify-end gap-1">
                                      <Input
                                        aria-label="Packs"
                                        value={l.packsTexto}
                                        disabled={l.bloqueada}
                                        onChange={(e) => cambiarPrecio(l.clave, { packsTexto: e.target.value })}
                                        className="w-12 text-right px-2"
                                        inputMode="numeric"
                                      />
                                      <span className="text-caption text-texto-3">×</span>
                                      <Input
                                        aria-label="Unidades por pack"
                                        value={l.unidadesPorPackTexto}
                                        disabled={l.bloqueada}
                                        onChange={(e) =>
                                          cambiarPrecio(l.clave, { unidadesPorPackTexto: e.target.value })
                                        }
                                        className="w-12 text-right px-2"
                                        inputMode="numeric"
                                      />
                                    </div>
                                  ) : (
                                    <Input
                                      aria-label={`Unidades de ${l.descripcion}`}
                                      value={l.cantidadTexto}
                                      disabled={l.bloqueada}
                                      onChange={(e) => cambiarPrecio(l.clave, { cantidadTexto: e.target.value })}
                                      placeholder="0"
                                      className="w-20 text-right ml-auto"
                                      inputMode="numeric"
                                    />
                                  )}
                                  {l.esPack && (
                                    <div className="text-caption text-texto-3 mt-1 tabular">
                                      = {cantidadDe(l) ?? 0} unidades
                                    </div>
                                  )}
                                </td>

                                <td className="px-2 py-2.5 text-right">
                                  <Input
                                    aria-label={l.esPack ? 'Precio por pack' : 'Precio por unidad en la tienda'}
                                    value={l.esPack ? l.precioPackTexto : l.precioUnitarioTexto}
                                    onChange={(e) =>
                                      cambiarPrecio(
                                        l.clave,
                                        l.esPack
                                          ? { precioPackTexto: e.target.value }
                                          : { precioUnitarioTexto: e.target.value }
                                      )
                                    }
                                    placeholder="0.00"
                                    className="w-24 text-right ml-auto"
                                    inputMode="decimal"
                                  />
                                  <div className="text-caption text-texto-3 mt-1 tabular">
                                    {l.esPack ? 'por pack' : 'c/u'} · línea {$(c?.precio_linea_usd_cents ?? 0)}
                                  </div>
                                </td>

                                <td className="px-2 py-2.5 text-right">
                                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-caption text-texto-2">
                                    <input
                                      type="checkbox"
                                      checked={!l.exento}
                                      onChange={(e) => cambiar(l.clave, { exento: !e.target.checked })}
                                      className="w-3.5 h-3.5 rounded border-borde-fuerte text-acento"
                                      aria-label={`Pagó impuesto: ${l.descripcion}`}
                                    />
                                    cobró
                                  </label>
                                  <div className="tabular text-texto mt-1">
                                    {$(c?.tax_linea_usd_cents ?? 0)}
                                  </div>
                                </td>

                                <td className="px-2 py-2.5 text-right">
                                  <Input
                                    aria-label={`Peso de ${l.descripcion}`}
                                    value={l.pesoTexto}
                                    onChange={(e) => cambiar(l.clave, { pesoTexto: e.target.value })}
                                    placeholder={
                                      c && c.peso_estimado && c.peso_linea_mlb > 0
                                        ? (c.peso_linea_mlb / 1000).toFixed(2)
                                        : '—'
                                    }
                                    className="w-20 text-right ml-auto"
                                    inputMode="decimal"
                                  />
                                  {c?.peso_estimado && c.peso_linea_mlb > 0 && (
                                    <div className="text-caption text-texto-3 mt-1">estimado</div>
                                  )}
                                </td>

                                <td className="px-2 py-2.5 text-right tabular text-texto">
                                  {$((c?.envio_asignado_usd_cents ?? 0) + (c?.otros_asignados_usd_cents ?? 0))}
                                </td>

                                <td className="px-2 py-2.5 text-right tabular">
                                  <div className="font-semibold text-texto">
                                    {$(c?.costo_unitario_usd_cents ?? 0)}
                                  </div>
                                  <div className="text-caption text-texto-3">
                                    línea {$(c?.costo_linea_usd_cents ?? 0)}
                                  </div>
                                </td>

                                <td className="px-2 py-2.5 text-right">
                                  {l.destino === 'ENCARGO' ? (
                                    <span className="text-caption text-texto-3">
                                      Congela el costo del encargo
                                    </span>
                                  ) : efecto && primeraDelProducto ? (
                                    <div className="tabular">
                                      {efecto.precio_antes_usd_cents > 0 &&
                                      efecto.precio_antes_usd_cents !== efecto.precio_despues_usd_cents ? (
                                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                          <span className="text-texto-3">{$(efecto.precio_antes_usd_cents)}</span>
                                          <ArrowRight className="w-3 h-3 text-texto-3" aria-hidden="true" />
                                          <span className="font-semibold text-texto">
                                            {$(efecto.precio_despues_usd_cents)}
                                          </span>
                                        </span>
                                      ) : (
                                        <span className="font-semibold text-texto">
                                          {$(efecto.precio_despues_usd_cents)}
                                        </span>
                                      )}
                                      <div
                                        className={cn(
                                          'text-caption mt-0.5',
                                          efecto.bajo_costo ? 'text-danger-700' : 'text-texto-3'
                                        )}
                                      >
                                        {efecto.bajo_costo
                                          ? 'debajo del costo'
                                          : `costo prom. ${$(efecto.costo_despues_usd_cents)}`}
                                      </div>
                                    </div>
                                  ) : null}
                                </td>

                                <td className="px-2 py-2.5 text-right">
                                  {!l.bloqueada && (
                                    <button
                                      type="button"
                                      onClick={() => quitar(l.clave)}
                                      aria-label={`Quitar ${l.descripcion}`}
                                      className="p-1.5 rounded-lg text-texto-3 hover:text-danger-700 hover:bg-danger-50"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Agregar */}
                  <div className="px-4 py-3 border-t border-borde/70 bg-superficie-2/30 flex items-start gap-2 flex-wrap">
                    <div className="relative flex-1 min-w-[260px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-texto-3 pointer-events-none" />
                      <Input
                        ref={busquedaRef}
                        value={busqueda}
                        onChange={(e) => {
                          setBusqueda(e.target.value);
                          setBuscando(true);
                        }}
                        onFocus={() => setBuscando(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && sugerencias[0]) {
                            e.preventDefault();
                            agregarProducto(sugerencias[0]);
                          }
                        }}
                        placeholder="Agregar un producto que ya tenés: buscá por nombre o código"
                        className="pl-9"
                        aria-label="Buscar producto para agregar"
                      />
                      {buscando && busqueda.trim() && (
                        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded-xl border border-borde bg-superficie shadow-xl">
                          {sugerencias.map((p) => (
                            <li key={p.id}>
                              <button
                                type="button"
                                onClick={() => agregarProducto(p)}
                                className="w-full text-left px-3 py-2 hover:bg-superficie-2 flex items-center justify-between gap-3"
                              >
                                <span className="text-body text-texto truncate">
                                  {p.nombre}
                                  {!p.activo && (
                                    <span className="text-caption text-texto-3"> · descatalogado</span>
                                  )}
                                </span>
                                <span className="text-caption text-texto-3 shrink-0 tabular">
                                  {p.existencias} en bodega · {p.codigo}
                                </span>
                              </button>
                            </li>
                          ))}
                          <li className="border-t border-borde">
                            <button
                              type="button"
                              onClick={() => {
                                setProductoNuevo(busqueda.trim());
                                setBuscando(false);
                              }}
                              className="w-full text-left px-3 py-2 hover:bg-superficie-2 text-body text-acento font-medium flex items-center gap-2"
                            >
                              <Plus className="w-4 h-4" />
                              Crear "{busqueda.trim()}" como producto nuevo
                            </button>
                          </li>
                        </ul>
                      )}
                    </div>
                    <Button variant="secondary" onClick={() => setProductoNuevo('')} className="rounded-xl">
                      <Plus className="w-4 h-4" />
                      <span>Producto nuevo</span>
                    </Button>
                    {encargos.length > 0 && (
                      <div className="relative">
                        <Button
                          variant="secondary"
                          onClick={() => setVerEncargos((v) => !v)}
                          className="rounded-xl"
                        >
                          <ClipboardList className="w-4 h-4" />
                          <span>Encargo de una clienta</span>
                        </Button>
                        {verEncargos && (
                          <ul className="absolute z-20 right-0 mt-1 w-80 max-h-72 overflow-y-auto rounded-xl border border-borde bg-superficie shadow-xl">
                            {encargos.map((v) => (
                              <li key={v.id}>
                                <button
                                  type="button"
                                  onClick={() => agregarEncargo(v)}
                                  className="w-full text-left px-3 py-2 hover:bg-superficie-2"
                                >
                                  <span className="text-body text-texto block">
                                    {v.cliente_nombre ?? 'Sin clienta'} · {v.codigo}
                                  </span>
                                  <span className="text-caption text-texto-3">
                                    {v.estado === 'PENDIENTE' ? 'Confirmado' : 'Cotizado'} ·{' '}
                                    {$(v.total_usd_cents)}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </section>

                <Field label="Notas">
                  <Textarea
                    rows={2}
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Tienda, número de tracking, lo que haga falta recordar"
                  />
                </Field>
              </>
            )}
          </div>

          {/* La cuenta completa y las acciones */}
          <footer className="border-t border-borde bg-superficie-2/40 px-6 py-3.5 shrink-0">
            {resumen ? (
              <div className="flex justify-end">
                <Button variant="primary" onClick={terminar} className="rounded-xl">
                  Listo
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-body text-texto tabular flex items-center gap-x-2 gap-y-1 flex-wrap">
                    <span>Mercadería {$(calc.subtotal_productos_usd_cents)}</span>
                    <span className="text-texto-3">+</span>
                    <span>Impuesto {$(calc.tax_total_usd_cents)}</span>
                    <span className="text-texto-3">+</span>
                    <span>Flete {$(calc.envio_total_usd_cents)}</span>
                    {calc.otros_costos_usd_cents > 0 && (
                      <>
                        <span className="text-texto-3">+</span>
                        <span>Otros {$(calc.otros_costos_usd_cents)}</span>
                      </>
                    )}
                    <span className="text-texto-3">=</span>
                    <strong className="font-bold">Pagado {$(calc.total_pagado_usd_cents)}</strong>
                    {pesoTotalMlb > 0 && (
                      <span className="text-caption text-texto-3">· {formatearPeso(pesoTotalMlb)}</span>
                    )}
                  </p>
                  <p className="text-caption text-texto-3 mt-0.5">{textoCriterio}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="secondary" onClick={onCerrar} disabled={guardando} className="rounded-xl">
                    Cancelar
                  </Button>
                  {esCorreccion ? (
                    <Button variant="primary" onClick={accionCorregir} disabled={guardando} className="rounded-xl">
                      {guardando ? 'Corrigiendo...' : 'Guardar corrección'}
                    </Button>
                  ) : (
                    <>
                      <Button variant="outline" onClick={accionGuardar} disabled={guardando} className="rounded-xl">
                        Guardar y seguir después
                      </Button>
                      <Button
                        variant="primary"
                        onClick={accionPasar}
                        disabled={guardando || lineas.length === 0}
                        className="rounded-xl"
                      >
                        {guardando ? 'Guardando...' : 'Pasar al inventario'}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </footer>
        </div>
      </div>

      <ProductoModal
        abierto={productoNuevo !== null}
        producto={null}
        nombreInicial={productoNuevo ?? ''}
        categorias={categorias}
        margenDefectoBp={parametros?.margen_defecto_bp ?? 4500}
        stockMinimoDefecto={parametros?.stock_minimo_defecto ?? 2}
        pasoRedondeo={parametros?.paso_redondeo_usd_cents ?? 100}
        onCerrar={() => setProductoNuevo(null)}
        onGuardar={crearProducto}
      />

      <Confirmar
        abierto={confirmando}
        titulo="¿Pasar el paquete al inventario?"
        consecuencias={[
          `Entran ${unidades} unidad${unidades === 1 ? '' : 'es'} de ${productosDistintos} producto${productosDistintos === 1 ? '' : 's'}, con un costo total de ${$(calc.total_pagado_usd_cents)}.`,
          ...(cambianDePrecio > 0
            ? [
                `${cambianDePrecio} producto${cambianDePrecio === 1 ? '' : 's'} cambia${cambianDePrecio === 1 ? '' : 'n'} de precio porque cambia su costo (lo ves en la columna "Precio de venta").`,
              ]
            : []),
          'Después se pueden corregir los montos y agregar lo olvidado. Las cantidades se corrigen ajustando existencias.',
        ]}
        textoConfirmar="Sí, pasarlo al inventario"
        textoCancelar="Seguir revisando"
        onConfirmar={() => {
          setConfirmando(false);
          pasarAlInventario();
        }}
        onCerrar={() => setConfirmando(false)}
      />
    </Portal>
  );
};
