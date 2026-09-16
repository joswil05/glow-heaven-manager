import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  getFirestoreDb,
  siguienteId,
  leerDoc,
  aplicarLote,
  type OperacionLote,
} from '../client';
import type { MetodoPago } from '../../../shared/types';
import { esPasoRedondeoValido, calcularPrecio } from '../../../core/precios';
import { EventosRepoFirestore } from './eventos.repo';
import type { ParametrosSistema, Categoria, ModoPrecio, CuentaBancaria } from '../../../shared/types';

export interface CategoriaInput {
  id?: number;
  nombre: string;
  /** Si no viene, la categoría hereda el margen global. */
  margen_defecto_bp?: number;
}

const DEFECTOS: Record<string, string> = {
  tasa_cambio_cents: '3662',
  tax_bp: '700',
  tarifa_envio_cents_lb: '700',
  margen_defecto_bp: '4500',
  paso_redondeo_usd_cents: '100',
  anticipo_defecto_bp: '5000',
  mostrar_cordobas: '1',
  stock_minimo_defecto: '2',
  nombre_negocio: 'Glow Heaven',
  telefono_negocio: '',
  onboarding_completado: '0',
  plantilla_cobro_whatsapp:
    'Hola {cliente}, te saludamos de Glow Heaven ✨ Te recordamos que tienes un saldo pendiente de {saldo_usd} ({saldo_cs}). Si ya realizaste tu abono, por favor compártenos el comprobante. ¡Muchas gracias!',
  plantilla_factura_whatsapp:
    '¡Hola {cliente}! ✨ Muchas gracias por tu compra en Glow Heaven 🛍️\n\n📄 Factura: {codigo}\n💵 Total: {total_usd} (≈ {total_cs})\n{estado_pago}\n\n{cuentas_bancarias}\n¡Esperamos que disfrutes tus prendas! 💖',
  plantilla_proforma_whatsapp:
    '¡Hola {cliente}! ✨ Te compartimos la cotización de tu encargo en Glow Heaven 📦✈️\n\n📋 Cotización: {codigo}\n💰 Total estimado: {total_usd} (≈ {total_cs})\n🔒 Anticipo requerido (50%): {anticipo}\n🤝 Saldo contra entrega: {saldo}\n\n{cuentas_bancarias}\n¡Quedamos atentas a tu comprobante! 💕',
  dias_alerta_mora: '15',
  dias_alerta_encargos: '10',
  moneda_defecto_venta: 'USD',
  metodo_pago_defecto: 'EFECTIVO',
  cuotas_defecto_cantidad: '4',
  cuotas_defecto_dias: '15',
  pantalla_inicio: 'panel',
  pantalla_inicio_movil: 'panel',
  codigo_pais_whatsapp: '505',
};

/**
 * Parámetros y categorías se leen en casi toda operación: calcular un precio
 * necesita el margen por defecto y el escalón de redondeo. Sin caché, guardar
 * un producto costaba tres lecturas extra y abrir el panel unas quince.
 *
 * La caché vive en el proceso main, que es de un solo usuario, y se invalida
 * en cuanto algo escribe. Su ventana es de segundos.
 */
const TTL_CACHE_MS = 30_000;

let cacheParametros: { valor: ParametrosSistema; expira: number } | null = null;
let cacheCategorias: { valor: Categoria[]; expira: number } | null = null;

function invalidarCache(): void {
  cacheParametros = null;
  cacheCategorias = null;
}

export class ParametrosRepoFirestore {
  /** Fuerza la próxima lectura a ir a Firestore. */
  static invalidarCache = invalidarCache;

  static async getParametros(): Promise<ParametrosSistema> {
    if (cacheParametros && cacheParametros.expira > Date.now()) {
      return cacheParametros.valor;
    }

    let data = await leerDoc<Record<string, unknown>>('parametros', 'sistema');

    if (!data) {
      data = { ...DEFECTOS };
      await aplicarLote([
        { coleccion: 'parametros', id: 'sistema', datos: data, merge: false },
      ]);
    }

    const entero = (k: string): number => {
      const v = data![k] ?? DEFECTOS[k] ?? 0;
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      return Number.isFinite(n) ? n : 0;
    };
    const texto = (k: string): string => String(data![k] ?? DEFECTOS[k] ?? '');
    const booleano = (k: string): boolean => {
      const v = data![k] ?? DEFECTOS[k];
      return v === true || v === '1' || v === 1;
    };

    const valor: ParametrosSistema = {
      tasa_cambio_cents: entero('tasa_cambio_cents'),
      tax_bp: entero('tax_bp'),
      tarifa_envio_cents_lb: entero('tarifa_envio_cents_lb'),
      margen_defecto_bp: entero('margen_defecto_bp'),
      paso_redondeo_usd_cents: entero('paso_redondeo_usd_cents'),
      anticipo_defecto_bp: entero('anticipo_defecto_bp'),
      mostrar_cordobas: booleano('mostrar_cordobas'),
      stock_minimo_defecto: entero('stock_minimo_defecto'),
      nombre_negocio: texto('nombre_negocio'),
      telefono_negocio: texto('telefono_negocio'),
      onboarding_completado: booleano('onboarding_completado'),
      pin_seguridad: data?.pin_seguridad ? String(data.pin_seguridad) : undefined,
      plantilla_cobro_whatsapp: data?.plantilla_cobro_whatsapp
        ? String(data.plantilla_cobro_whatsapp)
        : DEFECTOS.plantilla_cobro_whatsapp,
      plantilla_factura_whatsapp: data?.plantilla_factura_whatsapp
        ? String(data.plantilla_factura_whatsapp)
        : DEFECTOS.plantilla_factura_whatsapp,
      plantilla_proforma_whatsapp: data?.plantilla_proforma_whatsapp
        ? String(data.plantilla_proforma_whatsapp)
        : DEFECTOS.plantilla_proforma_whatsapp,
      cuentas_bancarias: Array.isArray(data?.cuentas_bancarias)
        ? (data!.cuentas_bancarias as CuentaBancaria[])
        : [],
      dias_alerta_mora: entero('dias_alerta_mora') || 15,
      dias_alerta_encargos: entero('dias_alerta_encargos') || 10,
      moneda_defecto_venta: data?.moneda_defecto_venta === 'NIO' ? 'NIO' : 'USD',
      metodo_pago_defecto:
        data?.metodo_pago_defecto === 'TRANSFERENCIA' || data?.metodo_pago_defecto === 'OTRO'
          ? (data.metodo_pago_defecto as MetodoPago)
          : 'EFECTIVO',
      // Los topes no son caprichos: una venta de cero cuotas no existe, y una
      // de cien es un error de tipeo que rompería la pantalla de cobranza.
      cuotas_defecto_cantidad: Math.min(24, Math.max(2, entero('cuotas_defecto_cantidad') || 4)),
      cuotas_defecto_dias: Math.min(90, Math.max(1, entero('cuotas_defecto_dias') || 15)),
      pantalla_inicio: String(data?.pantalla_inicio || 'panel'),
      pantalla_inicio_movil: String(data?.pantalla_inicio_movil || 'panel'),
      // Sólo dígitos: un espacio o un `+` de más rompe el enlace de WhatsApp
      // en silencio, que es la forma en que este campo falla.
      codigo_pais_whatsapp: String(data?.codigo_pais_whatsapp || '505').replace(/\D/g, '') || '505',
    };

    cacheParametros = { valor, expira: Date.now() + TTL_CACHE_MS };
    return valor;
  }

  static async actualizar(
    valores: Record<string, unknown>,
    evento_grupo_id: string
  ): Promise<void> {
    if (valores.paso_redondeo_usd_cents !== undefined) {
      const paso = Number(valores.paso_redondeo_usd_cents);
      if (!esPasoRedondeoValido(paso)) {
        throw new Error(
          'El escalón de redondeo tiene que ser 1, 25, 50, 100, 500 o 1000 centavos.'
        );
      }
    }

    if (valores.tasa_cambio_cents !== undefined) {
      const tasa = Number(valores.tasa_cambio_cents);
      if (!Number.isFinite(tasa) || tasa <= 0) {
        throw new Error('La tasa de cambio tiene que ser mayor que cero.');
      }
    }

    // Solo se guarda el valor anterior de lo que de verdad cambia, para que
    // deshacer no arrastre campos que nadie tocó.
    const actual = (await leerDoc<Record<string, unknown>>('parametros', 'sistema')) ?? {};
    const anteriores: Record<string, unknown> = {};
    for (const clave of Object.keys(valores)) {
      anteriores[clave] = actual[clave] ?? DEFECTOS[clave] ?? null;
    }

    await aplicarLote([
      {
        coleccion: 'parametros',
        id: 'sistema',
        datos: { ...valores, actualizado_en: new Date().toISOString() },
        merge: true,
      },
    ]);
    invalidarCache();

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'parametros',
      entidad_id: 0,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anteriores,
      valor_nuevo: valores as Record<string, unknown>,
      detalle: `Configuración actualizada (${Object.keys(valores).length} campo(s))`,
    });

    if (
      valores.margen_defecto_bp !== undefined ||
      valores.paso_redondeo_usd_cents !== undefined
    ) {
      await this.recalcularPrecios();
    }
  }

  static async getCategorias(): Promise<Categoria[]> {
    if (cacheCategorias && cacheCategorias.expira > Date.now()) {
      return cacheCategorias.valor;
    }

    const db = getFirestoreDb();
    const colRef = collection(db, 'categorias');
    let snap = await getDocs(query(colRef, where('activa', '==', true)));

    if (snap.empty) {
      await this.sembrarCategorias();
      snap = await getDocs(query(colRef, where('activa', '==', true)));
    }

    const valor = snap.docs
      .map((d) => d.data() as Categoria)
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    cacheCategorias = { valor, expira: Date.now() + TTL_CACHE_MS };
    return valor;
  }

  static async guardarCategoria(
    input: CategoriaInput,
    evento_grupo_id: string
  ): Promise<number> {
    const nombreLimpio = input.nombre.trim();
    if (!nombreLimpio) {
      throw new Error('El nombre de la categoría es obligatorio.');
    }

    // Una categoría sin margen propio hereda el global. Antes esto escribía
    // `undefined` en el documento: la comparación `undefined < 0` es false,
    // así que pasaba la validación y reventaba recién contra Firestore, con
    // un error que no decía nada de categorías ni de márgenes.
    const margen =
      input.margen_defecto_bp === undefined || input.margen_defecto_bp === null
        ? (await this.getParametros()).margen_defecto_bp
        : Math.round(Number(input.margen_defecto_bp));

    if (!Number.isFinite(margen) || margen < 0 || margen > 50000) {
      throw new Error('El margen debe estar entre 0% y 500%.');
    }

    if (input.id) {
      const anterior = await EventosRepoFirestore.snapshot('categorias', input.id);
      if (!anterior) throw new Error(`La categoría #${input.id} no existe.`);

      await aplicarLote([
        {
          coleccion: 'categorias',
          id: input.id,
          datos: {
            nombre: nombreLimpio,
            margen_defecto_bp: margen,
            actualizado_en: new Date().toISOString(),
          },
          merge: true,
        },
      ]);
      invalidarCache();

      await EventosRepoFirestore.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'categorias',
        entidad_id: input.id,
        tipo_evento: 'ACTUALIZACION',
        valor_anterior: anterior,
        detalle: `Categoría '${nombreLimpio}' actualizada`,
      });

      // Los productos que heredan el margen de esta categoría cambian con ella.
      await this.recalcularPrecios();
      return input.id;
    }

    const nuevoId = await siguienteId('categorias');
    await aplicarLote([
      {
        coleccion: 'categorias',
        id: nuevoId,
        merge: false,
        datos: {
          id: nuevoId,
          nombre: nombreLimpio,
          margen_defecto_bp: margen,
          activa: true,
        },
      },
    ]);
    invalidarCache();

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'categorias',
      entidad_id: nuevoId,
      tipo_evento: 'CREACION',
      detalle: `Categoría '${nombreLimpio}' creada`,
    });

    return nuevoId;
  }

  static async archivarCategoria(id: number, evento_grupo_id: string): Promise<void> {
    const anterior = await EventosRepoFirestore.snapshot('categorias', id);
    if (!anterior) throw new Error(`La categoría #${id} no existe.`);

    // Archivar una categoría con productos adentro los deja sin margen y sin
    // nombre de categoría en la lista. Se bloquea, como en el modelo anterior.
    const db = getFirestoreDb();
    const enUso = await getDocs(
      query(
        collection(db, 'productos'),
        where('activo', '==', true),
        where('categoria_id', '==', id)
      )
    );

    if (!enUso.empty) {
      throw new Error(
        `'${anterior.nombre}' tiene ${enUso.size} producto(s). Movelos a otra categoría antes de archivarla.`
      );
    }

    await aplicarLote([
      {
        coleccion: 'categorias',
        id,
        datos: { activa: false, actualizado_en: new Date().toISOString() },
        merge: true,
      },
    ]);
    invalidarCache();

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'categorias',
      entidad_id: id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior,
      detalle: `Categoría '${anterior.nombre}' archivada`,
    });
  }

  /**
   * Recalcula el precio de venta de todo el inventario en un solo lote.
   * Un precio MANUAL nunca se toca: lo escribió una persona a propósito.
   */
  static async recalcularPrecios(): Promise<number> {
    const db = getFirestoreDb();
    const parametros = await this.getParametros();
    const categorias = await this.getCategorias();
    const catMap = new Map(categorias.map((c) => [c.id, c.margen_defecto_bp]));

    const prodSnap = await getDocs(
      query(collection(db, 'productos'), where('activo', '==', true))
    );

    const now = new Date().toISOString();
    const operaciones: OperacionLote[] = [];

    for (const d of prodSnap.docs) {
      const p = d.data();
      const modo = (p.modo_precio as ModoPrecio) ?? 'MARGEN';
      if (modo !== 'MARGEN' && modo !== 'MULTIPLICADOR') continue;

      const margenCategoria = p.categoria_id ? catMap.get(p.categoria_id) : undefined;
      const nuevoCalculo = calcularPrecio({
        costo_unitario_usd_cents: p.costo_unitario_usd_cents ?? 0,
        modo,
        margen_bp: p.margen_bp ?? margenCategoria ?? parametros.margen_defecto_bp,
        multiplicador_bp: p.multiplicador_bp ?? undefined,
        precio_manual_usd_cents: p.precio_manual_usd_cents ?? undefined,
        paso_redondeo_usd_cents: parametros.paso_redondeo_usd_cents,
      });

      if (nuevoCalculo.precio_usd_cents !== p.precio_venta_usd_cents) {
        operaciones.push({
          coleccion: 'productos',
          id: d.id,
          datos: {
            precio_venta_usd_cents: nuevoCalculo.precio_usd_cents,
            actualizado_en: now,
          },
          merge: true,
        });
      }
    }

    await aplicarLote(operaciones);
    return operaciones.length;
  }

  private static async sembrarCategorias(): Promise<void> {
    const iniciales = [
      { nombre: 'Ropa', margen_defecto_bp: 5000 },
      { nombre: 'Ropa interior', margen_defecto_bp: 6000 },
      { nombre: 'Calzado', margen_defecto_bp: 4000 },
      { nombre: 'Bolsos y accesorios', margen_defecto_bp: 5000 },
      { nombre: 'Perfumería', margen_defecto_bp: 5000 },
      { nombre: 'Maquillaje', margen_defecto_bp: 5000 },
      { nombre: 'Skincare', margen_defecto_bp: 4500 },
      { nombre: 'Hogar', margen_defecto_bp: 4500 },
      { nombre: 'Otros', margen_defecto_bp: 4500 },
    ];

    const { reservarIds } = await import('../client');
    const ids = await reservarIds('categorias', iniciales.length);

    await aplicarLote(
      iniciales.map((cat, i) => ({
        coleccion: 'categorias',
        id: ids[i],
        merge: false,
        datos: {
          id: ids[i],
          nombre: cat.nombre,
          margen_defecto_bp: cat.margen_defecto_bp,
          activa: true,
        },
      }))
    );
  }
}
