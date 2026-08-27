import type {
  ParametrosSistema,
  Cliente,
  CotizacionCompleta,
  PedidoCompleto,
  Pago,
  Categoria,
  Tienda,
  EstadoItem,
  MetodoPago,
  AlertaRow,
  CapitalLibreData,
} from '../../shared/types';
import type {
  GuardarParametrosInicialesInput,
  CategoriaCambio,
  CrearClienteInput,
  ActualizarClienteInput,
  CrearCotizacionInput,
  CrearPagoInput,
  HoyViewData,
  IpcResult,
} from '../../shared/ipc-contracts';
import { api } from '../../preload/api';

type GlowHeavenApi = typeof api;

function ok<T>(data: T): IpcResult<T> {
  return { success: true, data };
}

function err<T>(code: string, message: string): IpcResult<T> {
  return { success: false, error: { code, message } };
}

const mockParametros: ParametrosSistema = {
  tasa_cambio_oficial_cents: 3662,
  tarifa_flete_cents_lb: 650,
  flete_minimo_usd_cents: 1500,
  otros_costos_fijos_usd_cents: 1000,
  umbral_arancel_excedente_usd_cents: 5000,
  arancel_default_bp: 3000,
  tax_usa_default_bp: 700,
  comision_minima_cotizacion_cor_cents: 30000,
  anticipo_default_bp: 5000,
  saldo_inicial_bancos_cor_cents: 2500000,
  cuentas_bancarias: [
    { banco: 'BAC Credomatic', numero: '360-123456-7', titular: 'Rossana Espinoza', moneda: 'COR' },
    { banco: 'Banpro', numero: '100-987654-3', titular: 'Rossana Espinoza', moneda: 'USD' },
  ],
};

const mockCategorias: Categoria[] = [
  { id: 1, nombre: 'Perfumería', comision_defecto_bp: 3500, arancel_estimado_bp: 3500, redondeo_cor_cents: 5000, activa: true },
  { id: 2, nombre: 'Maquillaje', comision_defecto_bp: 3500, arancel_estimado_bp: 3000, redondeo_cor_cents: 5000, activa: true },
  { id: 3, nombre: 'Skincare', comision_defecto_bp: 3000, arancel_estimado_bp: 3000, redondeo_cor_cents: 5000, activa: true },
  { id: 4, nombre: 'Calzado', comision_defecto_bp: 2500, arancel_estimado_bp: 3000, redondeo_cor_cents: 10000, activa: true },
  { id: 5, nombre: 'Accesorios', comision_defecto_bp: 3000, arancel_estimado_bp: 3000, redondeo_cor_cents: 5000, activa: true },
];

const mockTiendas: Tienda[] = [
  { id: 1, nombre: 'Amazon', tax_rate_bp: 0, activa: true },
  { id: 2, nombre: 'Sephora', tax_rate_bp: 700, activa: true },
  { id: 3, nombre: 'Ulta', tax_rate_bp: 700, activa: true },
  { id: 4, nombre: 'Ross', tax_rate_bp: 700, activa: true },
  { id: 5, nombre: 'Nike', tax_rate_bp: 700, activa: true },
];

const mockClientes: Cliente[] = [
  {
    id: 1,
    nombre: 'Valeria Chamorro',
    telefono: '8888-1234',
    ciudad: 'León',
    direccion: 'De la iglesia La Recolección 1c al norte',
    incumplio_anteriormente: false,
    activo: true,
  },
  {
    id: 2,
    nombre: 'Carlos Mendoza',
    telefono: '8777-5678',
    ciudad: 'Chichigalpa',
    direccion: 'Costado sur del parque central',
    incumplio_anteriormente: true,
    activo: true,
  },
];

const mockCotizaciones: CotizacionCompleta[] = [];
const mockPedidos: PedidoCompleto[] = [];
const mockPagos: Pago[] = [];

export function setupBrowserMockApi(): void {
  if (typeof window !== 'undefined' && !window.api) {
    const mockApi: GlowHeavenApi = {
      parametros: {
        get: async () => ok(mockParametros),
        update: async (clave: string, valor: string) => {
          (mockParametros as any)[clave] = valor;
          return ok(undefined);
        },
        guardarIniciales: async (input: GuardarParametrosInicialesInput) => {
          mockParametros.cuentas_bancarias = input.cuentas_bancarias as any;
          mockParametros.tarifa_flete_cents_lb = Math.round(input.tarifa_flete_usd * 100);
          mockParametros.flete_minimo_usd_cents = Math.round((input.flete_minimo_usd || 15) * 100);
          mockParametros.otros_costos_fijos_usd_cents = Math.round((input.otros_costos_fijos_usd || 10) * 100);
          mockParametros.arancel_default_bp = Math.round(input.arancel_default_porcentaje * 100);
          mockParametros.saldo_inicial_bancos_cor_cents = Math.round(input.saldo_inicial_bancos_cor * 100);
          return ok(undefined);
        },
      },
      categorias: {
        list: async () => ok(mockCategorias),
        update: async (cambios: CategoriaCambio[]) => {
          for (const cambio of cambios) {
            const cat = mockCategorias.find((c) => c.id === cambio.id);
            if (cat) {
              cat.comision_defecto_bp = cambio.comision_defecto_bp;
              cat.arancel_estimado_bp = cambio.arancel_estimado_bp;
              cat.redondeo_cor_cents = cambio.redondeo_cor_cents;
            }
          }
          return ok(undefined);
        },
      },
      tiendas: {
        list: async () => ok(mockTiendas),
      },
      clientes: {
        list: async () => ok(mockClientes),
        getById: async (id: number) => {
          const cli = mockClientes.find((c) => c.id === id);
          if (!cli) return err('NOT_FOUND', 'Cliente no encontrado');
          return ok({
            ...cli,
            pedidos_activos_count: 0,
            saldo_total_pendiente_cor_cents: 0,
            total_compras_cor_cents: 0,
          });
        },
        create: async (data: CrearClienteInput) => {
          const nuevo: Cliente = {
            id: mockClientes.length + 1,
            nombre: data.nombre,
            alias: data.alias,
            telefono: data.telefono,
            ciudad: data.ciudad || 'León',
            direccion: data.direccion,
            cedula: data.cedula,
            notas: data.notas,
            incumplio_anteriormente: Boolean(data.incumplio_anteriormente),
            activo: true,
          };
          mockClientes.push(nuevo);
          return ok(nuevo);
        },
        update: async (id: number, data: ActualizarClienteInput) => {
          const idx = mockClientes.findIndex((c) => c.id === id);
          if (idx !== -1) {
            mockClientes[idx] = { ...mockClientes[idx], ...data };
            return ok(mockClientes[idx]);
          }
          return err('NOT_FOUND', 'Cliente no encontrado');
        },
      },
      cotizaciones: {
        list: async () => ok(mockCotizaciones),
        getById: async (id: number) => {
          const cot = mockCotizaciones.find((c) => c.id === id);
          if (!cot) return err('NOT_FOUND', 'Cotización no encontrada');
          return ok(cot);
        },
        create: async (data: CrearCotizacionInput) => {
          const cotId = mockCotizaciones.length + 1;
          const codigo = `COT-2608-000${cotId}`;
          const itemsCalc = (data.items || []).map((it, i) => {
            const precioUsa = it.precio_usa_usd_cents;
            const taxUsa = Math.round((precioUsa * 700) / 10000);
            const flete = Math.round((it.peso_mlb * 650) / 1000);
            const arancel = Math.round((precioUsa * 3000) / 10000);
            const costoAt = precioUsa + taxUsa + flete + arancel + 250;
            const costoCor = Math.round((costoAt * 3662) / 100);
            const comisionCor = Math.round((costoCor * 3500) / 10000);
            const precioFinalCor = Math.ceil((costoCor + comisionCor) / 5000) * 5000;
            const precioFinalUsd = Math.round((precioFinalCor * 100) / 3662);
            const antBp = data.anticipo_bp || 5000;
            return {
              id: i + 1,
              cotizacion_id: cotId,
              descripcion: it.descripcion,
              precio_usa_usd_cents: precioUsa,
              tax_usa_usd_cents: taxUsa,
              peso_mlb: it.peso_mlb,
              flete_estimado_usd_cents: flete,
              otros_costos_estimados_usd_cents: 250,
              arancel_estimado_usd_cents: arancel,
              costo_aterrizado_estimado_usd_cents: costoAt,
              comision_bp: 3500,
              comision_cor_cents: comisionCor,
              precio_final_usd_cents: precioFinalUsd,
              precio_final_cor_cents: precioFinalCor,
              anticipo_usd_cents: Math.round((precioFinalUsd * antBp) / 10000),
              anticipo_cor_cents: Math.round((precioFinalCor * antBp) / 10000),
              saldo_usd_cents: precioFinalUsd - Math.round((precioFinalUsd * antBp) / 10000),
              saldo_cor_cents: precioFinalCor - Math.round((precioFinalCor * antBp) / 10000),
              orden: i + 1,
            };
          });

          const totalCor = itemsCalc.reduce((acc, i) => acc + i.precio_final_cor_cents, 0);
          const totalUsd = itemsCalc.reduce((acc, i) => acc + i.precio_final_usd_cents, 0);
          const antCor = itemsCalc.reduce((acc, i) => acc + i.anticipo_cor_cents, 0);
          const antUsd = itemsCalc.reduce((acc, i) => acc + i.anticipo_usd_cents, 0);

          const nuevaCot: CotizacionCompleta = {
            id: cotId,
            codigo,
            cliente_id: data.cliente_id,
            cliente: mockClientes.find((c) => c.id === data.cliente_id)!,
            fecha: new Date().toISOString().slice(0, 10),
            valida_hasta: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
            tasa_cambio_cents: 3662,
            tarifa_flete_cents_lb: 650,
            estado: 'BORRADOR',
            subtotal_usa_usd_cents: itemsCalc.reduce((acc, i) => acc + i.precio_usa_usd_cents, 0),
            tax_usa_total_usd_cents: itemsCalc.reduce((acc, i) => acc + i.tax_usa_usd_cents, 0),
            flete_estimado_total_usd_cents: itemsCalc.reduce((acc, i) => acc + i.flete_estimado_usd_cents, 0),
            arancel_estimado_total_usd_cents: itemsCalc.reduce((acc, i) => acc + i.arancel_estimado_usd_cents, 0),
            costo_aterrizado_total_usd_cents: itemsCalc.reduce((acc, i) => acc + i.costo_aterrizado_estimado_usd_cents, 0),
            comision_total_cor_cents: itemsCalc.reduce((acc, i) => acc + i.comision_cor_cents, 0),
            total_usd_cents: totalUsd,
            total_cor_cents: totalCor,
            anticipo_bp: data.anticipo_bp || 5000,
            anticipo_total_usd_cents: antUsd,
            anticipo_total_cor_cents: antCor,
            saldo_total_usd_cents: totalUsd - antUsd,
            saldo_total_cor_cents: totalCor - antCor,
            notas: data.notas,
            activo: true,
            items: itemsCalc as any,
          };
          mockCotizaciones.unshift(nuevaCot);
          return ok(nuevaCot);
        },
        marcarEnviada: async (id: number) => {
          const c = mockCotizaciones.find((x) => x.id === id);
          if (c) c.estado = 'ENVIADA';
          return ok(undefined);
        },
        aceptar: async (id: number) => {
          const c = mockCotizaciones.find((x) => x.id === id);
          if (c) c.estado = 'ACEPTADA';
          return ok(undefined);
        },
        rechazar: async (id: number) => {
          const c = mockCotizaciones.find((x) => x.id === id);
          if (c) c.estado = 'RECHAZADA';
          return ok(undefined);
        },
        convertirAPedido: async (id: number) => {
          const c = mockCotizaciones.find((x) => x.id === id);
          if (!c) return err('NOT_FOUND', 'Cotización no encontrada');
          c.estado = 'ACEPTADA';
          const pedId = mockPedidos.length + 1;
          const ped: PedidoCompleto = {
            id: pedId,
            codigo: `PED-2608-000${pedId}`,
            cotizacion_id: c.id,
            cliente_id: c.cliente_id,
            cliente: c.cliente,
            fecha: new Date().toISOString().slice(0, 10),
            tasa_cambio_cents: c.tasa_cambio_cents,
            estado_derivado: 'PENDIENTE_ANTICIPO',
            color_semaforo: 'ROJO',
            requiere_atencion: false,
            anticipo_verificado: false,
            total_usd_cents: c.total_usd_cents,
            total_cor_cents: c.total_cor_cents,
            anticipo_esperado_cor_cents: c.anticipo_total_cor_cents,
            saldo_pendiente_cor_cents: c.total_cor_cents,
            saldo_pendiente_usd_cents: c.total_usd_cents,
            notas: c.notas,
            activo: true,
            items: c.items.map((it: any, idx: number) => ({
              id: idx + 1,
              pedido_id: pedId,
              cotizacion_item_id: it.id,
              descripcion: it.descripcion,
              precio_usa_usd_cents: it.precio_usa_usd_cents,
              tax_usa_usd_cents: it.tax_usa_usd_cents,
              peso_mlb: it.peso_mlb,
              estado: 'PENDIENTE_ANTICIPO',
              costo_aterrizado_estimado_cents: it.costo_aterrizado_estimado_usd_cents,
              costo_aterrizado_real_cents: 0,
              margen_real_cents: 0,
              prioridad: 1,
              activo: true,
            })),
            pagos: [],
          };
          mockPedidos.unshift(ped);
          return ok(ped);
        },
      },
      pedidos: {
        list: async () => ok(mockPedidos),
        getById: async (id: number) => {
          const ped = mockPedidos.find((p) => p.id === id);
          if (!ped) return err('NOT_FOUND', 'Pedido no encontrado');
          return ok(ped);
        },
        cambiarEstadoItem: async (itemId: number, nuevoEstado: EstadoItem) => {
          for (const ped of mockPedidos) {
            const it = ped.items.find((x: any) => x.id === itemId);
            if (it) {
              if (nuevoEstado === 'EN_LISTA_USA' && !ped.anticipo_verificado) {
                return err(
                  'BLOQUEADO',
                  'No se puede comprar en USA: el pedido no tiene anticipo verificado (Semáforo Rojo).'
                );
              }
              it.estado = nuevoEstado;
              ped.estado_derivado = nuevoEstado;
              return ok(undefined);
            }
          }
          return err('NOT_FOUND', 'Ítem no encontrado');
        },
      },
      pagos: {
        create: async (input: CrearPagoInput) => {
          const ped = mockPedidos.find((p) => p.id === input.pedido_id);
          if (!ped) return err('NOT_FOUND', 'Pedido no encontrado');
          const pagoId = mockPagos.length + 1;
          const montoCor = input.moneda_pago === 'COR' ? input.monto_cents : Math.round((input.monto_cents * 3662) / 100);
          const montoUsd = input.moneda_pago === 'USD' ? input.monto_cents : Math.round((input.monto_cents * 100) / 3662);

          const nuevoPago: Pago = {
            id: pagoId,
            pedido_id: input.pedido_id,
            cliente_id: ped.cliente_id,
            fecha: new Date().toISOString().slice(0, 10),
            monto_usd_cents: montoUsd,
            monto_cor_cents: montoCor,
            moneda_pago: input.moneda_pago,
            tasa_cambio_cents: 3662,
            metodo_pago: input.metodo_pago as MetodoPago,
            referencia: input.referencia,
            verificado: Boolean(input.verificado),
            tipo_pago: input.tipo_pago,
            activo: true,
          };
          mockPagos.push(nuevoPago);
          ped.pagos.push(nuevoPago);

          if (input.verificado && input.tipo_pago === 'ANTICIPO') {
            ped.anticipo_verificado = true;
            ped.estado_derivado = 'ANTICIPO_OK';
            ped.color_semaforo = 'VERDE';
            ped.saldo_pendiente_cor_cents = Math.max(0, ped.total_cor_cents - montoCor);
            for (const it of ped.items) {
              if (it.estado === 'PENDIENTE_ANTICIPO') it.estado = 'ANTICIPO_OK';
            }
          }
          return ok(nuevoPago);
        },
        verificar: async (pagoId: number, verificado: boolean) => {
          const p = mockPagos.find((x) => x.id === pagoId);
          if (p) {
            p.verificado = verificado;
            const ped = mockPedidos.find((x) => x.id === p.pedido_id);
            if (ped) {
              ped.anticipo_verificado = verificado;
              ped.estado_derivado = verificado ? 'ANTICIPO_OK' : 'PENDIENTE_ANTICIPO';
              ped.color_semaforo = verificado ? 'VERDE' : 'AMARILLO';
            }
          }
          return ok(undefined);
        },
        listByPedido: async (pedidoId: number) => ok(mockPagos.filter((p) => p.pedido_id === pedidoId)),
      },
      vistas: {
        getHoy: async () => {
          const alerts: AlertaRow[] = [
            {
              tipo_alerta: 'ANTICIPO_PENDIENTE',
              severidad: 'Advertencia: Anticipo pendiente',
              entidad_id: 1,
              entidad_tipo: 'pedidos',
              pedido_id: 1,
              cliente_nombre: 'Valeria Chamorro',
              cliente_telefono: '8888-1234',
              mensaje: 'Anticipo pendiente de verificar para Valeria Chamorro por C$ 2,500.00',
              detalle_estado: 'PENDIENTE_ANTICIPO',
            },
          ];
          const hoy: HoyViewData = {
            alertas_decision: alerts,
            total_anticipos_recibidos_cor_cents: mockPagos
              .filter((p) => p.verificado && p.tipo_pago === 'ANTICIPO')
              .reduce((a, b) => a + b.monto_cor_cents, 0),
            total_saldos_por_cobrar_cor_cents: mockPedidos.reduce(
              (a, b) => a + b.saldo_pendiente_cor_cents,
              0
            ),
            entregas_hoy_count: 0,
            esperando_otros_count: 0,
          };
          return ok(hoy);
        },
        getAlertas: async () => ok([]),
        getCapitalLibre: async () => {
          const cap: CapitalLibreData = {
            saldo_inicial_bancos_cor_cents: 2500000,
            total_anticipos_recibidos_cor_cents: 0,
            total_saldos_cobrados_cor_cents: 0,
            total_por_cobrar_cor_cents: 0,
          };
          return ok(cap);
        },
        getSemaforo: async () => ok([]),
      },
      sistema: {
        crearBackup: async () =>
          ok({
            ruta_backup:
              'C:\\Users\\espin\\AppData\\Roaming\\glow-heaven-manager\\backups\\backup_2026-08-27.db',
            timestamp: new Date().toISOString(),
          }),
        deshacerUltimoGrupo: async () => ok({ revertido: true, descripcion: 'Acción revertida' }),
        abrirWhatsApp: async (telefono: string, mensaje: string) => {
          window.open(
            `https://wa.me/${telefono.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje || '')}`,
            '_blank'
          );
          return ok(undefined);
        },
      },
      adjuntos: {
        guardarBuffer: async () => ok({ id: 1, ruta_archivo: 'comprobante.png' }),
      },
    };

    (window as any).api = mockApi;
  }
}
