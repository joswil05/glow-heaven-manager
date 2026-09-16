import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  runTransaction,
} from 'firebase/firestore';
import { getFirestoreDb, siguienteId, leerVarios, aplicarLote, sinUndefined, type OperacionLote } from '../client';
import { costearPaquete } from '../../../core/costeo';
import type { CompraLineaInput } from '../../../core/costeo';
import { ParametrosRepoFirestore } from './parametros.repo';
import { ProductosRepoFirestore } from './productos.repo';
import { ResumenesRepoFirestore } from './resumenes.repo';
import { EventosRepoFirestore } from './eventos.repo';
import type {
  Compra,
  CompraCompleta,
  CompraLinea,
  EstadoCompra,
  DestinoLinea,
} from '../../../shared/types';

export interface LineaCompraInput {
  id?: number;
  producto_id?: number;
  variante_id?: number;
  descripcion: string;
  cantidad: number;
  precio_linea_usd_cents: number;
  tax_linea_usd_cents?: number;
  peso_linea_mlb: number;
  destino: DestinoLinea;
  venta_id?: number;
  precio_venta_usd_cents?: number;
  es_multipack?: boolean;
  packs_comprados?: number;
  unidades_por_pack?: number;
  precio_por_pack_usd_cents?: number;
  crear_producto?: {
    categoria_id?: number;
    margen_bp?: number;
    stock_minimo?: number;
    tiene_variantes?: boolean;
  };
}

export interface GuardarCompraInput {
  id?: number;
  fecha: string;
  estado?: EstadoCompra;
  envio_total_usd_cents: number;
  otros_costos_usd_cents?: number;
  tax_total_override_usd_cents?: number;
  notas?: string;
  peso_total_mlb?: number;
  lineas: LineaCompraInput[];
}

interface CompraDoc extends Compra {
  lineas: CompraLinea[];
}

export class ComprasRepoFirestore {
  static async listar(): Promise<Compra[]> {
    const db = getFirestoreDb();
    const snap = await getDocs(query(collection(db, 'compras'), where('activo', '==', true)));
    const compras: Compra[] = snap.docs.map((d) => {
      const data = d.data() as CompraDoc;
      const { lineas, ...compra } = data;
      return compra;
    });

    return compras.sort((a, b) => {
      const cmp = (b.fecha || '').localeCompare(a.fecha || '');
      return cmp !== 0 ? cmp : b.id - a.id;
    });
  }

  static async getById(id: number): Promise<CompraCompleta | null> {
    const db = getFirestoreDb();
    const snap = await getDoc(doc(db, 'compras', String(id)));
    if (!snap.exists()) return null;

    const data = snap.data() as CompraDoc;
    if (!data.activo) return null;

    // Poblar nombres de productos y clientes en líneas
    const lineas = data.lineas || [];
    const lineasCompletas: CompraLinea[] = [];

    for (const l of lineas) {
      let prodNombre: string | undefined = undefined;
      let clienteNombre: string | undefined = undefined;

      if (l.producto_id) {
        const prod = await ProductosRepoFirestore.getById(l.producto_id);
        prodNombre = prod?.nombre;
      }

      if (l.venta_id) {
        const ventaSnap = await getDoc(doc(db, 'ventas', String(l.venta_id)));
        if (ventaSnap.exists()) {
          const vData = ventaSnap.data() as any;
          if (vData.cliente_id) {
            const cliSnap = await getDoc(doc(db, 'clientes', String(vData.cliente_id)));
            if (cliSnap.exists()) {
              clienteNombre = (cliSnap.data() as any)?.nombre;
            }
          }
        }
      }

      lineasCompletas.push({
        ...l,
        producto_nombre: prodNombre,
        cliente_nombre: clienteNombre,
      });
    }

    const { lineas: _, ...compra } = data;
    return {
      ...compra,
      lineas: lineasCompletas,
      unidades_totales: lineasCompletas.reduce((a, l) => a + (l.cantidad || 0), 0),
    };
  }

  static async previsualizar(input: GuardarCompraInput) {
    const params = await ParametrosRepoFirestore.getParametros();
    const taxBp = params.tax_bp ?? 700;
    const lineasCore: CompraLineaInput[] = input.lineas.map((l, i) => ({
      id: i + 1,
      cantidad: l.cantidad,
      precio_linea_usd_cents: l.precio_linea_usd_cents,
      peso_linea_mlb: l.peso_linea_mlb,
      tax_linea_usd_cents: l.tax_linea_usd_cents,
    }));

    return costearPaquete(lineasCore, {
      tax_bp: taxBp,
      envio_total_usd_cents: input.envio_total_usd_cents,
      otros_costos_usd_cents: input.otros_costos_usd_cents,
      tax_total_override_usd_cents: input.tax_total_override_usd_cents,
    });
  }

  static async guardar(input: GuardarCompraInput, evento_grupo_id: string): Promise<number> {
    const db = getFirestoreDb();
    let compraId = input.id ?? 0;

    if (compraId) {
      const actualSnap = await getDoc(doc(db, 'compras', String(compraId)));
      if (!actualSnap.exists()) throw new Error(`El paquete #${compraId} no existe.`);
      const actual = actualSnap.data() as CompraDoc;
      if (actual.estado === 'RECIBIDA') {
        throw new Error(
          'Este paquete ya se recibió y su mercadería entró al inventario. No se puede editar.'
        );
      }
    }

    const params = await ParametrosRepoFirestore.getParametros();
    const tasa = params.tasa_cambio_cents ?? 3662;

    const tieneLineas = input.lineas && input.lineas.length > 0;
    const costeo = tieneLineas ? await this.previsualizar(input) : null;

    const envioFinal = costeo ? costeo.envio_total_usd_cents : (input.envio_total_usd_cents || 0);
    const otrosFinal = costeo ? costeo.otros_costos_usd_cents : (input.otros_costos_usd_cents || 0);
    const taxOverrideFinal = input.tax_total_override_usd_cents;
    const subtotalFinal = costeo ? costeo.subtotal_productos_usd_cents : 0;
    const taxFinal = costeo ? costeo.tax_total_usd_cents : (taxOverrideFinal ?? 0);
    const totalFinal = costeo
      ? costeo.total_pagado_usd_cents
      : envioFinal + otrosFinal + (taxOverrideFinal ?? 0);
    const pesoFinal = costeo && costeo.peso_total_mlb > 0 ? costeo.peso_total_mlb : (input.peso_total_mlb ?? 0);

    const lineasMapeadas: CompraLinea[] = tieneLineas
      ? input.lineas.map((l, i) => {
          const c = costeo!.lineas[i];
          return {
            id: l.id ?? i + 1,
            compra_id: compraId,
            producto_id: l.producto_id,
            variante_id: l.variante_id,
            descripcion: l.descripcion.trim(),
            cantidad: c.cantidad,
            precio_linea_usd_cents: c.precio_linea_usd_cents,
            tax_linea_usd_cents: c.tax_linea_usd_cents,
            peso_linea_mlb: c.peso_linea_mlb,
            envio_asignado_usd_cents: c.envio_asignado_usd_cents,
            otros_asignados_usd_cents: c.otros_asignados_usd_cents,
            costo_linea_usd_cents: c.costo_linea_usd_cents,
            costo_unitario_usd_cents: c.costo_unitario_usd_cents,
            destino: l.destino,
            venta_id: l.venta_id,
            orden: i,
            precio_venta_usd_cents: l.precio_venta_usd_cents,
            es_multipack: l.es_multipack,
            packs_comprados: l.packs_comprados,
            unidades_por_pack: l.unidades_por_pack,
            precio_por_pack_usd_cents: l.precio_por_pack_usd_cents,
          };
        })
      : [];

    const now = new Date().toISOString();

    if (compraId) {
      // `sinUndefined` tambien de este lado, no solo al crear.
      //
      // Las lineas de un paquete nuevo traen `producto_id` sin definir: el
      // producto todavia no existe en bodega, se crea al recibir. Firestore
      // rechaza cualquier escritura que contenga `undefined`, asi que editar
      // un borrador con productos nuevos reventaba con un error que no decia
      // nada ("Unsupported field value: undefined") y el paquete se quedaba
      // sin guardar.
      await setDoc(
        doc(db, 'compras', String(compraId)),
        sinUndefined({
          fecha: input.fecha,
          // Un paquete sin lineas es un BORRADOR, no un paquete recibido.
          //
          // Antes nacia 'RECIBIDA', y eso lo dejaba inservible: guardar el
          // paquete con el costo del envio antes de cargar los productos lo
          // marcaba como recibido, y desde ese momento `guardar` se negaba a
          // editarlo —"ya se recibio y su mercaderia entro al inventario"—
          // aunque no hubiera entrado nada. El paquete quedaba trabado con su
          // costo adentro y sin forma de agregarle los productos.
          estado: input.estado ?? 'BORRADOR',
          envio_total_usd_cents: envioFinal,
          otros_costos_usd_cents: otrosFinal,
          tax_total_override_usd_cents: taxOverrideFinal ?? null,
          subtotal_productos_usd_cents: subtotalFinal,
          tax_total_usd_cents: taxFinal,
          total_usd_cents: totalFinal,
          peso_total_mlb: pesoFinal,
          notas: input.notas ?? null,
          lineas: lineasMapeadas,
          actualizado_en: now,
        } as unknown as Record<string, unknown>),
        { merge: true }
      );
    } else {
      compraId = await siguienteId('compras');
      const codigo = `PQ-${String(compraId).padStart(4, '0')}`;

      // Asignar el nuevo compraId a las líneas
      const lineasFinales = lineasMapeadas.map((l) => ({ ...l, compra_id: compraId }));

      const nuevaCompra: CompraDoc = {
        id: compraId,
        codigo,
        fecha: input.fecha,
        // Un paquete sin lineas es un BORRADOR, no un paquete recibido.
        //
        // Antes nacia 'RECIBIDA', y eso lo dejaba inservible: guardar el
        // paquete con el costo del envio antes de cargar los productos lo
        // marcaba como recibido, y desde ese momento `guardar` se negaba a
        // editarlo —"ya se recibio y su mercaderia entro al inventario"—
        // aunque no hubiera entrado nada. El paquete quedaba trabado con su
        // costo adentro y sin forma de agregarle los productos.
        estado: input.estado ?? 'BORRADOR',
        envio_total_usd_cents: envioFinal,
        otros_costos_usd_cents: otrosFinal,
        tax_total_override_usd_cents: taxOverrideFinal ?? undefined,
        subtotal_productos_usd_cents: subtotalFinal,
        tax_total_usd_cents: taxFinal,
        total_usd_cents: totalFinal,
        peso_total_mlb: pesoFinal,
        tasa_cambio_cents: tasa,
        notas: input.notas?.trim() || undefined,
        lineas: lineasFinales,
        activo: true,
        creado_en: now,
      };

      await setDoc(doc(db, 'compras', String(compraId)), sinUndefined(nuevaCompra as unknown as Record<string, unknown>));

      await EventosRepoFirestore.registrarEvento({
        evento_grupo_id,
        entidad_tipo: 'compras',
        entidad_id: compraId,
        tipo_evento: 'CREACION',
        detalle: `Paquete ${nuevaCompra.codigo} registrado`,
      });
    }

    return compraId;
  }

  static async recibir(
    compra_id: number,
    evento_grupo_id: string
  ): Promise<{ productos_afectados: number }> {
    const db = getFirestoreDb();
    const docRef = doc(db, 'compras', String(compra_id));

    // El paquete se RESERVA de forma atómica antes de tocar el inventario.
    //
    // Antes esto era leer, comprobar el estado, meter toda la mercadería y
    // recién al final marcarlo como recibido. Entre la comprobación y la marca
    // había una ventana de varios segundos: dos clics en "Recibir", o los dos
    // dispositivos a la vez, pasaban los dos el control. Y como cada llamada
    // busca el producto por nombre y todavía no existe, cada una creaba el
    // suyo: la bodega terminaba con dos fichas gemelas del mismo producto, con
    // la mercadería repartida entre las dos. Eso no se ve en ninguna pantalla;
    // sólo se nota cuando los números no cuadran.
    //
    // Con la transacción, la segunda llamada encuentra el paquete ya marcado y
    // se va por la misma puerta que un intento repetido cualquiera.
    const compra = await runTransaction(db, async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists()) throw new Error(`El paquete #${compra_id} no existe.`);

      const data = snap.data() as CompraDoc;
      if (data.estado === 'RECIBIDA') {
        throw new Error('Este paquete ya estaba recibido.');
      }

      // Un paquete sin lineas no se puede recibir.
      //
      // Recibir es irreversible: marca el paquete y el segundo intento se
      // rechaza. Si se recibia vacio, quedaba marcado como RECIBIDA, no
      // entraba ni una unidad al inventario, y el costo del paquete —envio,
      // impuesto, todo— se quedaba sin producto al cual repartirse. La plata
      // desaparecia del costeo y ya no habia forma de volver atras, porque
      // recibirlo de nuevo estaba prohibido.
      //
      // No se exige que haya lineas de INVENTARIO: un paquete que trae solo
      // encargos es legitimo, la mercaderia va a las clientas y no a bodega.
      if (!data.lineas || data.lineas.length === 0) {
        throw new Error(
          'Este paquete no tiene ningun producto cargado. ' +
            'Agregale las lineas antes de recibirlo: una vez recibido no se puede volver atras.'
        );
      }

      tx.set(docRef, { estado: 'RECIBIDA', actualizado_en: new Date().toISOString() }, { merge: true });
      return data;
    });

    let afectados = 0;
    const lineas = compra.lineas || [];

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      if (linea.destino !== 'INVENTARIO') continue;

      let productoId = linea.producto_id;

      if (!productoId) {
        const existente = await ProductosRepoFirestore.buscarPorNombre(linea.descripcion);
        if (existente) {
          productoId = existente.id;
          if (linea.precio_venta_usd_cents || linea.unidades_por_pack) {
            await ProductosRepoFirestore.actualizar(
              {
                id: productoId,
                modo_precio: linea.precio_venta_usd_cents ? 'MANUAL' : existente.modo_precio,
                precio_manual_usd_cents: linea.precio_venta_usd_cents ?? existente.precio_manual_usd_cents,
                unidades_por_paquete: linea.unidades_por_pack ?? existente.unidades_por_paquete,
              },
              evento_grupo_id
            );
          }
        } else {
          productoId = await ProductosRepoFirestore.crear(
            {
              nombre: linea.descripcion,
              peso_unitario_mlb: Math.round(linea.peso_linea_mlb / Math.max(1, linea.cantidad)),
              modo_precio: linea.precio_venta_usd_cents ? 'MANUAL' : 'MARGEN',
              precio_manual_usd_cents: linea.precio_venta_usd_cents,
              precio_venta_usd_cents: linea.precio_venta_usd_cents,
              unidades_por_paquete: linea.unidades_por_pack,
            },
            evento_grupo_id
          );
        }
        lineas[i].producto_id = productoId;
      } else {
        if (linea.precio_venta_usd_cents || linea.unidades_por_pack) {
          await ProductosRepoFirestore.actualizar(
            {
              id: productoId,
              modo_precio: linea.precio_venta_usd_cents ? 'MANUAL' : undefined,
              precio_manual_usd_cents: linea.precio_venta_usd_cents,
              unidades_por_paquete: linea.unidades_por_pack,
            },
            evento_grupo_id
          );
        }
      }

      await ProductosRepoFirestore.entrada({
        producto_id: productoId,
        variante_id: linea.variante_id ?? undefined,
        cantidad: linea.cantidad,
        costo_total_usd_cents: linea.costo_linea_usd_cents,
        referencia_tipo: 'COMPRA',
        referencia_id: compra_id,
        detalle: `Paquete ${compra.codigo}`,
      });
      afectados++;
    }

    // Congelar el costo real en los encargos. Las ventas afectadas se leen
    // de una sola vez y se escriben en un lote junto con el paquete: antes
    // era una lectura y una escritura sueltas por cada línea de encargo.
    const idsVentas = [
      ...new Set(
        lineas
          .filter((l) => l.destino === 'ENCARGO' && l.venta_id)
          .map((l) => l.venta_id as number)
      ),
    ];
    const ventas = await leerVarios<Record<string, any>>('ventas', idsVentas);
    const now = new Date().toISOString();
    const operaciones: OperacionLote[] = [];

    for (const [idVenta, vData] of ventas) {
      const vLineas = (vData.lineas || []) as any[];
      let modificado = false;

      for (const linea of lineas) {
        if (linea.destino !== 'ENCARGO' || String(linea.venta_id) !== idVenta) continue;
        for (const vl of vLineas) {
          if (
            (vl.descripcion || '').trim().toLowerCase() ===
            linea.descripcion.trim().toLowerCase()
          ) {
            vl.costo_unitario_usd_cents = linea.costo_unitario_usd_cents;
            vl.costo_total_usd_cents = linea.costo_linea_usd_cents;
            modificado = true;
          }
        }
      }

      if (!modificado) continue;

      const costoTotalVenta = vLineas.reduce(
        (sum: number, l: any) => sum + (l.costo_total_usd_cents || 0),
        0
      );

      operaciones.push({
        coleccion: 'ventas',
        id: idVenta,
        merge: true,
        datos: {
          lineas: vLineas,
          costo_total_usd_cents: costoTotalVenta,
          ganancia_usd_cents: (vData.total_usd_cents || 0) - costoTotalVenta,
          actualizado_en: now,
        },
      });
    }

    operaciones.push({
      coleccion: 'compras',
      id: compra_id,
      merge: true,
      datos: { estado: 'RECIBIDA', lineas, actualizado_en: now },
    });

    await aplicarLote(operaciones);

    // Recibir el paquete congela el costo real de los encargos que traía, y
    // eso cambia su ganancia. Los resúmenes de los meses de esas ventas
    // dejaron de ser ciertos.
    for (const vData of ventas.values()) {
      await ResumenesRepoFirestore.invalidarPorFecha((vData as { fecha?: string }).fecha);
    }

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'compras',
      entidad_id: compra_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: compra as unknown as Record<string, unknown>,
      // Recibir metió mercadería a la bodega. Restaurar la instantánea del
      // paquete lo devolvería a "sin recibir" dejando las unidades adentro,
      // listas para entrar una segunda vez.
      reversible: false,
      detalle: `Paquete ${compra.codigo} recibido, ${afectados} producto(s) al inventario`,
    });

    return { productos_afectados: afectados };
  }

  static async archivar(compra_id: number, evento_grupo_id: string): Promise<void> {
    const db = getFirestoreDb();
    const docRef = doc(db, 'compras', String(compra_id));
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error(`El paquete #${compra_id} no existe.`);

    const actual = snap.data() as CompraDoc;

    await setDoc(
      docRef,
      {
        activo: false,
        actualizado_en: new Date().toISOString(),
      },
      { merge: true }
    );

    await EventosRepoFirestore.registrarEvento({
      evento_grupo_id,
      entidad_tipo: 'compras',
      entidad_id: compra_id,
      tipo_evento: 'ACTUALIZACION',
      valor_anterior: actual as unknown as Record<string, unknown>,
      detalle: `Paquete ${actual.codigo} archivado`,
    });
  }
}
