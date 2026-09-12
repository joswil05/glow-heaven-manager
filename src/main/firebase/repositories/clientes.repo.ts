import { collection, getDocs, query, where } from 'firebase/firestore';
import { getFirestoreDb, siguienteId, leerDoc, aplicarLote } from '../client';
import { EventosRepoFirestore } from './eventos.repo';
import type { ClienteDetalle } from '../../../shared/types';
import { formatearMoneda } from '../../../core/moneda';

export interface GuardarClienteInput {
  id?: number;
  nombre: string;
  alias?: string;
  telefono?: string;
  direccion?: string;
  ciudad?: string;
  notas?: string;
}

interface ClienteDoc {
  id: number;
  nombre: string;
  alias?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  notas?: string | null;
  activo: boolean;
  creado_en?: string;
  compras_count?: number;
  total_comprado_usd_cents?: number;
  saldo_pendiente_usd_cents?: number;
  ultima_compra?: string | null;
}

/** Resumen de la actividad de un cliente, derivado de sus ventas. */
export interface TotalesCliente {
  compras_count: number;
  total_comprado_usd_cents: number;
  saldo_pendiente_usd_cents: number;
  ultima_compra: string | null;
}

function mapear(d: ClienteDoc): ClienteDetalle {
  return {
    id: Number(d.id),
    nombre: String(d.nombre),
    alias: d.alias ?? undefined,
    telefono: d.telefono ?? undefined,
    direccion: d.direccion ?? undefined,
    ciudad: d.ciudad ?? undefined,
    notas: d.notas ?? undefined,
    activo: Boolean(d.activo),
    creado_en: d.creado_en ?? undefined,
    compras_count: Number(d.compras_count ?? 0),
    total_comprado_usd_cents: Number(d.total_comprado_usd_cents ?? 0),
    saldo_pendiente_usd_cents: Number(d.saldo_pendiente_usd_cents ?? 0),
    ultima_compra: d.ultima_compra ?? undefined,
  };
}

export class ClientesRepoFirestore {
  static async listar(busqueda?: string): Promise<ClienteDetalle[]> {
    const db = getFirestoreDb();
    const snap = await getDocs(query(collection(db, 'clientes'), where('activo', '==', true)));

    const clientes = snap.docs
      .map((d) => mapear(d.data() as ClienteDoc))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));

    if (!busqueda) return clientes;

    // El filtro por texto se hace en memoria a propósito: Firestore no tiene
    // búsqueda por subcadena, y la alternativa es un servicio de búsqueda
    // aparte para un directorio que cabe en una pantalla.
    const q = busqueda.toLowerCase().trim();
    return clientes.filter(
      (c) =>
        c.nombre.toLowerCase().includes(q) ||
        (c.alias && c.alias.toLowerCase().includes(q)) ||
        (c.telefono && c.telefono.includes(q))
    );
  }

  static async getById(id: number): Promise<ClienteDetalle | null> {
    const d = await leerDoc<ClienteDoc>('clientes', id);
    if (!d || !d.activo) return null;
    return mapear(d);
  }

  static async guardar(input: GuardarClienteInput, evento_grupo_id: string): Promise<number> {
    const nombre = input.nombre.trim();
    if (!nombre) throw new Error('El nombre del cliente es obligatorio.');

    const campos = {
      nombre,
      alias: input.alias?.trim() || null,
      telefono: input.telefono?.trim() || null,
      direccion: input.direccion?.trim() || null,
      ciudad: input.ciudad?.trim() || null,
      notas: input.notas?.trim() || null,
    };

    if (input.id) {
      const anterior = await EventosRepoFirestore.snapshot('clientes', input.id);
      if (!anterior) throw new Error(`El cliente #${input.id} no existe.`);

      await aplicarLote([
        {
          coleccion: 'clientes',
          id: input.id,
          datos: { ...campos, actualizado_en: new Date().toISOString() },
          merge: true,
        },
      ]);

      await EventosRepoFirestore.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'clientes',
        entidad_id: input.id,
        tipo_evento: 'ACTUALIZACION',
        valor_anterior: anterior,
        detalle: `Cliente '${nombre}' actualizado`,
      });

      return input.id;
    }

    const nuevoId = await siguienteId('clientes');
    await aplicarLote([
      {
        coleccion: 'clientes',
        id: nuevoId,
        merge: false,
        datos: {
          id: nuevoId,
          ...campos,
          activo: true,
          creado_en: new Date().toISOString(),
          compras_count: 0,
          total_comprado_usd_cents: 0,
          saldo_pendiente_usd_cents: 0,
          ultima_compra: null,
        },
      },
    ]);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'clientes',
      entidad_id: nuevoId,
      tipo_evento: 'CREACION',
      detalle: `Cliente '${nombre}' agregado`,
    });

    return nuevoId;
  }

  static async archivar(id: number, evento_grupo_id: string): Promise<void> {
    const anterior = await EventosRepoFirestore.snapshot('clientes', id);
    if (!anterior) throw new Error(`El cliente #${id} no existe.`);

    // Archivar a alguien que debe hace desaparecer la deuda de la vista sin
    // haberla cobrado ni cancelado. Se bloquea, como en el modelo anterior.
    const totales = await this.calcularTotales(id);
    if (totales.saldo_pendiente_usd_cents > 0) {
      throw new Error(
        `${anterior.nombre} todavía debe ${formatearMoneda(totales.saldo_pendiente_usd_cents, 'USD')}. ` +
          'Cobrá o cancelá esas ventas antes de archivarlo.'
      );
    }

    await aplicarLote([
      {
        coleccion: 'clientes',
        id,
        datos: { activo: false, actualizado_en: new Date().toISOString() },
        merge: true,
      },
    ]);

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'clientes',
      entidad_id: id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: anterior,
      detalle: `Cliente '${anterior.nombre}' archivado`,
    });
  }

  /**
   * Calcula los totales de un cliente a partir de sus ventas.
   *
   * Firestore no tiene agregados en consultas, así que los totales se
   * guardan en el documento del cliente y se refrescan cuando cambia una de
   * sus ventas. Sin eso, la pantalla de clientes muestra ceros para siempre.
   */
  static async calcularTotales(cliente_id: number): Promise<TotalesCliente> {
    const db = getFirestoreDb();
    const snap = await getDocs(
      query(
        collection(db, 'ventas'),
        where('activo', '==', true),
        where('cliente_id', '==', cliente_id)
      )
    );

    let compras_count = 0;
    let total_comprado_usd_cents = 0;
    let saldo_pendiente_usd_cents = 0;
    let ultima_compra: string | null = null;

    for (const d of snap.docs) {
      const v = d.data() as {
        estado: string;
        fecha?: string;
        total_usd_cents?: number;
        saldo_usd_cents?: number;
      };
      if (v.estado === 'CANCELADA') continue;

      compras_count += 1;
      total_comprado_usd_cents += v.total_usd_cents ?? 0;
      if ((v.saldo_usd_cents ?? 0) > 0) {
        saldo_pendiente_usd_cents += v.saldo_usd_cents ?? 0;
      }
      if (v.fecha && (!ultima_compra || v.fecha > ultima_compra)) {
        ultima_compra = v.fecha;
      }
    }

    return {
      compras_count,
      total_comprado_usd_cents,
      saldo_pendiente_usd_cents,
      ultima_compra,
    };
  }

  /** Recalcula y persiste los totales. Se llama tras vender, cobrar o cancelar. */
  static async refrescarTotales(cliente_id?: number): Promise<void> {
    if (!cliente_id) return;
    const totales = await this.calcularTotales(cliente_id);

    await aplicarLote([
      {
        coleccion: 'clientes',
        id: cliente_id,
        datos: { ...totales, actualizado_en: new Date().toISOString() },
        merge: true,
      },
    ]);
  }
}
